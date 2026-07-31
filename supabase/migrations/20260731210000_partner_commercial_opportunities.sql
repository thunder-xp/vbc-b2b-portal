begin;

insert into public.permissions(code, description) values
  ('opportunities.view', 'View deterministic commercial opportunities for an active partner company.'),
  ('admin.opportunities.view', 'View aggregate commercial-opportunity projection diagnostics.')
on conflict (code) do update set description = excluded.description;

with grants(role_code, permission_code) as (values
  ('partner_owner', 'opportunities.view'),
  ('partner_manager', 'opportunities.view'),
  ('partner_buyer', 'opportunities.view'),
  ('partner_accounting', 'opportunities.view'),
  ('novotech_admin', 'admin.opportunities.view')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict do nothing;

create table public.partner_commercial_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  recipient_user_id uuid not null references public.user_profiles(id) on delete cascade,
  product_id uuid null references public.catalog_products(id) on delete cascade,
  template_id uuid null references public.purchase_templates(id) on delete cascade,
  source_entity_type text not null,
  source_entity_id uuid null,
  opportunity_type text not null,
  status text not null default 'active',
  priority integer not null,
  relevance_score integer not null,
  reason_code text not null,
  safe_reason_metadata jsonb not null default '{}'::jsonb,
  secondary_reason_codes text[] not null default '{}',
  commercial_state_fingerprint text not null,
  first_detected_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_commercial_opportunities_subject_check check (
    num_nonnulls(product_id, template_id, source_entity_id) >= 1
  ),
  constraint partner_commercial_opportunities_type_check check (opportunity_type in (
    'repeat_purchase_available', 'watched_product_back_in_stock',
    'relevant_product_arrival_confirmed', 'relevant_product_price_decreased',
    'purchase_template_ready', 'previous_order_repeatable',
    'relevant_merchandising_offer', 'relevant_product_low_stock'
  )),
  constraint partner_commercial_opportunities_status_check check (status in ('active', 'resolved', 'expired')),
  constraint partner_commercial_opportunities_priority_check check (priority between 1 and 100),
  constraint partner_commercial_opportunities_relevance_check check (relevance_score between 0 and 100),
  constraint partner_commercial_opportunities_metadata_check check (jsonb_typeof(safe_reason_metadata) = 'object'),
  constraint partner_commercial_opportunities_fingerprint_check check (commercial_state_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint partner_commercial_opportunities_recipient_fingerprint_unique unique (recipient_user_id, commercial_state_fingerprint)
);

create index partner_commercial_opportunities_recipient_active_idx
  on public.partner_commercial_opportunities(recipient_user_id, priority, relevance_score desc, last_confirmed_at desc)
  where status = 'active';
create index partner_commercial_opportunities_company_type_idx
  on public.partner_commercial_opportunities(company_id, opportunity_type, status);
create index partner_commercial_opportunities_product_idx
  on public.partner_commercial_opportunities(product_id) where product_id is not null;

create table public.partner_commercial_opportunity_dismissals (
  recipient_user_id uuid not null references public.user_profiles(id) on delete cascade,
  commercial_state_fingerprint text not null,
  dismissed_at timestamptz not null default now(),
  primary key (recipient_user_id, commercial_state_fingerprint),
  constraint partner_commercial_opportunity_dismissals_fingerprint_check
    check (commercial_state_fingerprint ~ '^[0-9a-f]{64}$')
);

create table public.partner_commercial_opportunity_dirty_companies (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  reason text not null,
  first_dirtied_at timestamptz not null default now(),
  last_dirtied_at timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz null,
  last_error_code text null
);

create table public.partner_commercial_opportunity_projection_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  companies_processed integer not null default 0,
  opportunities_active integer not null default 0,
  failures integer not null default 0,
  duration_ms integer null,
  safe_error_code text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  constraint partner_commercial_opportunity_runs_status_check check (status in ('running', 'succeeded', 'partial', 'failed', 'locked'))
);

alter table public.partner_commercial_opportunities enable row level security;
alter table public.partner_commercial_opportunity_dismissals enable row level security;
alter table public.partner_commercial_opportunity_dirty_companies enable row level security;
alter table public.partner_commercial_opportunity_projection_runs enable row level security;

revoke all on public.partner_commercial_opportunities,
  public.partner_commercial_opportunity_dismissals,
  public.partner_commercial_opportunity_dirty_companies,
  public.partner_commercial_opportunity_projection_runs
from public, anon, authenticated;
grant select on public.partner_commercial_opportunities,
  public.partner_commercial_opportunity_dismissals to authenticated;
grant select, insert, update, delete on public.partner_commercial_opportunities,
  public.partner_commercial_opportunity_dismissals,
  public.partner_commercial_opportunity_dirty_companies,
  public.partner_commercial_opportunity_projection_runs to service_role;

create policy partner_commercial_opportunities_select_own
on public.partner_commercial_opportunities for select to authenticated
using (
  recipient_user_id = auth.uid()
  and public.has_permission(company_id, 'opportunities.view')
);

create policy partner_commercial_opportunity_dismissals_select_own
on public.partner_commercial_opportunity_dismissals for select to authenticated
using (recipient_user_id = auth.uid());

create or replace function public.enqueue_partner_commercial_opportunity_company(
  target_company_id uuid,
  target_reason text default 'domain_mutation'
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.partner_commercial_opportunity_dirty_companies(company_id, reason)
  values (target_company_id, left(coalesce(nullif(btrim(target_reason), ''), 'domain_mutation'), 80))
  on conflict (company_id) do update set
    reason = excluded.reason,
    last_dirtied_at = now(),
    locked_at = null;
$$;

revoke all on function public.enqueue_partner_commercial_opportunity_company(uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_partner_commercial_opportunity_company(uuid, text) to service_role;

create or replace function public.enqueue_all_partner_commercial_opportunity_companies()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode = '42501'; end if;
  insert into public.partner_commercial_opportunity_dirty_companies(company_id, reason)
  select distinct membership.company_id, 'scheduled_refresh'
  from public.company_memberships membership
  where membership.status = 'active'
  on conflict (company_id) do update set last_dirtied_at = now(), locked_at = null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.enqueue_all_partner_commercial_opportunity_companies() from public, anon, authenticated;
grant execute on function public.enqueue_all_partner_commercial_opportunity_companies() to service_role;

create or replace function public.refresh_partner_commercial_opportunities(target_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare active_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode = '42501'; end if;

  update public.partner_commercial_opportunities
  set status = case when expires_at <= now() then 'expired' else 'resolved' end,
      resolved_at = now(), updated_at = now()
  where company_id = target_company_id and status = 'active';

  with
  members as (
    select membership.user_id,
      bool_or(permission.code = 'pricing.partner_price.view') as can_partner_price,
      bool_or(permission.code = 'pricing.retail_price.view') as can_retail_price
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    left join public.role_permissions grant_row on grant_row.role_id = role.id
    left join public.permissions permission on permission.id = grant_row.permission_id
    where membership.company_id = target_company_id and membership.status = 'active'
    group by membership.user_id
    having bool_or(permission.code = 'opportunities.view')
  ),
  purchases as (
    select item.product_id, count(distinct history.id)::integer purchase_count,
      max(history.one_c_document_date) last_purchased_at,
      percentile_disc(0.5) within group (order by item.quantity) typical_quantity
    from public.partner_order_history history
    join public.partner_order_history_items item on item.order_history_id = history.id
    where history.company_id = target_company_id
      and history.partner_visible and not history.one_c_deletion_mark
      and history.one_c_posted and item.product_id is not null
    group by item.product_id
  ),
  list_intent as (
    select member.user_id, item.product_id, max(item.quantity)::numeric desired_quantity,
      bool_or(list.is_system_favorites) has_favorite,
      min(list.id) filter (where not list.is_system_favorites) list_id
    from members member
    join public.purchasing_lists list on list.company_id = target_company_id
      and list.archived_at is null
      and (list.visibility = 'company' or list.created_by = member.user_id)
    join public.purchasing_list_items item on item.list_id = list.id
    group by member.user_id, item.product_id
  ),
  template_intent as (
    select member.user_id, item.product_id, max(item.preferred_quantity) desired_quantity,
      min(template.id) template_id
    from members member
    join public.purchase_templates template on template.company_id = target_company_id
      and template.status = 'active'
      and (template.visibility = 'company' or template.owner_user_id = member.user_id)
    join public.purchase_template_items item on item.template_id = template.id
    group by member.user_id, item.product_id
  ),
  cart_intent as (
    select cart.created_by user_id, item.product_id, sum(item.quantity)::numeric cart_quantity
    from public.carts cart join public.cart_items item on item.cart_id = cart.id
    where cart.company_id = target_company_id and cart.status = 'active'
    group by cart.created_by, item.product_id
  ),
  relevant as (
    select member.user_id, product.id product_id, member.can_partner_price, member.can_retail_price,
      purchase.purchase_count, purchase.last_purchased_at, purchase.typical_quantity,
      coalesce(list.desired_quantity, 0) list_quantity, coalesce(template.desired_quantity, 0) template_quantity,
      coalesce(cart.cart_quantity, 0) cart_quantity, coalesce(list.has_favorite, false) has_favorite,
      list.list_id, template.template_id
    from members member
    cross join lateral (
      select product_id from purchases
      union select product_id from list_intent where user_id = member.user_id
      union select product_id from template_intent where user_id = member.user_id
    ) product_ids
    join public.catalog_products product on product.id = product_ids.product_id and product.is_active and product.is_visible
    left join purchases purchase on purchase.product_id = product.id
    left join list_intent list on list.user_id = member.user_id and list.product_id = product.id
    left join template_intent template on template.user_id = member.user_id and template.product_id = product.id
    left join cart_intent cart on cart.user_id = member.user_id and cart.product_id = product.id
  ),
  product_state as (
    select relevant.*,
      coalesce(stock.available_quantity, 0)::numeric available_quantity,
      arrival.expected_arrival_date, arrival.expected_quantity,
      merchandising.labels,
      transition.previous_state_safe, transition.new_state_safe, transition.occurred_at transition_at,
      retail_change.decrease_percent, retail_change.current_effective_at
    from relevant
    left join public.product_stock_totals stock on stock.product_id = relevant.product_id and stock.is_published
    left join lateral (
      select value.expected_arrival_date, sum(value.expected_quantity)::numeric expected_quantity
      from public.product_supplier_arrivals value
      where value.product_id = relevant.product_id and value.is_published
        and value.expected_arrival_date >= current_date
      group by value.expected_arrival_date order by value.expected_arrival_date limit 1
    ) arrival on true
    left join lateral (
      select array_agg(value.label_code order by value.priority, value.label_code) labels
      from public.product_merchandising_assignments value
      where value.product_id = relevant.product_id and value.is_active
        and value.is_curated_visible and value.revoked_at is null
        and value.starts_at <= now() and (value.ends_at is null or value.ends_at > now())
    ) merchandising on true
    left join lateral (
      select value.previous_state_safe, value.new_state_safe, value.created_at occurred_at
      from public.partner_product_transition_events value
      where value.product_id = relevant.product_id and value.transition_type = 'availability_changed'
        and value.created_at >= now() - interval '14 days'
      order by value.created_at desc limit 1
    ) transition on true
    left join lateral (
      with history as (
        select value.price_amount, value.effective_at,
          row_number() over (order by value.effective_at desc, value.observed_at desc, value.id desc) rank
        from public.product_price_history value
        where value.product_id = relevant.product_id and value.external_price_type_code = 'UU-000020'
      )
      select round(((previous.price_amount - current.price_amount) / previous.price_amount * 100)::numeric, 2) decrease_percent,
        current.effective_at current_effective_at
      from history current join history previous on previous.rank = 2
      where current.rank = 1 and previous.price_amount > 0 and current.price_amount < previous.price_amount
    ) retail_change on relevant.can_retail_price and not relevant.can_partner_price
  ),
  signals as (
    select state.user_id, state.product_id, state.template_id, state.list_id, null::uuid source_id,
      'watched_product_back_in_stock'::text opportunity_type, 30 priority,
      least(100, 65 + coalesce(state.purchase_count, 0) * 3) relevance_score,
      'back_in_stock'::text reason_code,
      jsonb_build_object('purchaseCount', coalesce(state.purchase_count, 0), 'transitionAt', state.transition_at) metadata,
      now() + interval '14 days' expires_at
    from product_state state
    where state.new_state_safe = 'in_stock' and state.previous_state_safe <> 'in_stock'
      and (state.has_favorite or state.list_id is not null or state.template_id is not null)
    union all
    select state.user_id, state.product_id, state.template_id, state.list_id, null,
      'relevant_product_arrival_confirmed', 50, least(100, 55 + coalesce(state.purchase_count, 0) * 3),
      'confirmed_arrival', jsonb_build_object('expectedDate', state.expected_arrival_date, 'expectedQuantity', state.expected_quantity),
      (state.expected_arrival_date + 1)::timestamptz
    from product_state state where state.available_quantity <= 0 and state.expected_arrival_date is not null
    union all
    select state.user_id, state.product_id, state.template_id, state.list_id, null,
      'relevant_product_price_decreased', 40, least(100, 60 + coalesce(state.purchase_count, 0) * 3),
      'price_decreased', jsonb_build_object('decreasePercent', state.decrease_percent, 'effectiveAt', state.current_effective_at),
      now() + interval '14 days'
    from product_state state
    where not state.can_partner_price and state.can_retail_price and state.decrease_percent >= 3
    union all
    select state.user_id, state.product_id, state.template_id, state.list_id, null,
      'repeat_purchase_available', 60, least(100, 45 + coalesce(state.purchase_count, 0) * 5),
      'repeat_purchase', jsonb_build_object('purchaseCount', state.purchase_count, 'lastPurchasedAt', state.last_purchased_at, 'typicalQuantity', state.typical_quantity),
      now() + interval '30 days'
    from product_state state
    where coalesce(state.purchase_count, 0) > 0
      and (state.available_quantity > greatest(state.cart_quantity, 0) or state.expected_arrival_date is not null)
    union all
    select state.user_id, state.product_id, state.template_id, state.list_id, null,
      'relevant_product_low_stock', 70, least(100, 40 + coalesce(state.purchase_count, 0) * 5),
      'low_stock', jsonb_build_object('availableQuantity', state.available_quantity, 'purchaseCount', state.purchase_count),
      now() + interval '7 days'
    from product_state state
    where coalesce(state.purchase_count, 0) >= 2 and state.available_quantity > 0 and state.available_quantity <= 5
      and state.cart_quantity < greatest(coalesce(state.typical_quantity, 1), state.template_quantity, state.list_quantity)
      and (state.expected_quantity is null or state.expected_quantity < 20)
    union all
    select state.user_id, state.product_id, state.template_id, state.list_id, null,
      'relevant_merchandising_offer', 80, least(100, 35 + coalesce(state.purchase_count, 0) * 4),
      'relevant_merchandising', jsonb_build_object('labels', state.labels),
      now() + interval '14 days'
    from product_state state where cardinality(coalesce(state.labels, '{}')) > 0
  ),
  product_ranked as (
    select signal.*,
      row_number() over (partition by signal.user_id, signal.product_id order by signal.priority, signal.relevance_score desc, signal.opportunity_type) signal_rank,
      array_agg(signal.reason_code order by signal.priority, signal.reason_code)
        over (partition by signal.user_id, signal.product_id) all_reasons
    from signals signal
  ),
  template_readiness as (
    select member.user_id, template.id template_id, template.revision,
      count(item.id)::integer item_count,
      count(item.id) filter (where coalesce(stock.available_quantity, 0) > 0)::integer available_count,
      count(item.id) filter (where coalesce(stock.available_quantity, 0) <= 0 and arrival.expected_arrival_date is not null)::integer expected_count
    from members member
    join public.purchase_templates template on template.company_id = target_company_id and template.status = 'active'
      and (template.visibility = 'company' or template.owner_user_id = member.user_id)
    join public.purchase_template_items item on item.template_id = template.id
    join public.catalog_products product on product.id = item.product_id and product.is_active and product.is_visible
    left join public.product_stock_totals stock on stock.product_id = item.product_id and stock.is_published
    left join lateral (
      select min(value.expected_arrival_date) expected_arrival_date
      from public.product_supplier_arrivals value
      where value.product_id = item.product_id and value.is_published and value.expected_arrival_date >= current_date
    ) arrival on true
    group by member.user_id, template.id, template.revision
  ),
  template_signals as (
    select readiness.user_id, null::uuid product_id, readiness.template_id, null::uuid list_id, readiness.template_id source_id,
      'purchase_template_ready'::text opportunity_type, 20 priority,
      (60 + least(40, readiness.available_count * 5))::integer relevance_score,
      case when readiness.available_count = readiness.item_count then 'template_fully_ready' else 'template_mostly_ready' end reason_code,
      jsonb_build_object('itemCount', readiness.item_count, 'availableCount', readiness.available_count, 'expectedCount', readiness.expected_count, 'revision', readiness.revision) metadata,
      now() + interval '7 days' expires_at,
      array[]::text[] all_reasons
    from template_readiness readiness
    where readiness.item_count > 0
      and readiness.available_count + readiness.expected_count >= greatest(1, ceil(readiness.item_count * 0.75))
  ),
  order_repeat as (
    select member.user_id, history.id source_id,
      count(item.id)::integer item_count,
      count(item.id) filter (where product.is_active and product.is_visible and (coalesce(stock.available_quantity, 0) > 0 or arrival.expected_arrival_date is not null))::integer eligible_count,
      history.one_c_document_date
    from members member
    join lateral (
      select value.* from public.partner_order_history value
      where value.company_id = target_company_id and value.partner_visible and value.one_c_posted and not value.one_c_deletion_mark
      order by value.one_c_document_date desc limit 5
    ) history on true
    join public.partner_order_history_items item on item.order_history_id = history.id and item.product_id is not null
    join public.catalog_products product on product.id = item.product_id
    left join public.product_stock_totals stock on stock.product_id = item.product_id and stock.is_published
    left join lateral (
      select min(value.expected_arrival_date) expected_arrival_date from public.product_supplier_arrivals value
      where value.product_id = item.product_id and value.is_published and value.expected_arrival_date >= current_date
    ) arrival on true
    where not exists (
      select 1 from public.purchase_templates template
      where template.company_id = target_company_id and template.status = 'active'
        and template.source_type = 'order' and template.source_id = history.id
    )
    group by member.user_id, history.id, history.one_c_document_date
  ),
  order_signals as (
    select repeat.user_id, null::uuid product_id, null::uuid template_id, null::uuid list_id, repeat.source_id,
      'previous_order_repeatable'::text opportunity_type, 65 priority, 50 relevance_score,
      'previous_order_repeatable' reason_code,
      jsonb_build_object('itemCount', repeat.item_count, 'eligibleCount', repeat.eligible_count, 'orderDate', repeat.one_c_document_date) metadata,
      now() + interval '30 days' expires_at, array[]::text[] all_reasons
    from order_repeat repeat
    where repeat.item_count > 0 and repeat.eligible_count::numeric / repeat.item_count >= 0.6
  ),
  selected as (
    select ranked.user_id, ranked.product_id, ranked.template_id, ranked.list_id, ranked.source_id,
      ranked.opportunity_type, ranked.priority, ranked.relevance_score, ranked.reason_code,
      ranked.metadata, ranked.expires_at,
      array_remove(ranked.all_reasons, ranked.reason_code) secondary_reasons
    from product_ranked ranked where ranked.signal_rank = 1
    union all select user_id, product_id, template_id, list_id, source_id, opportunity_type, priority, relevance_score, reason_code, metadata, expires_at, all_reasons from template_signals
    union all select user_id, product_id, template_id, list_id, source_id, opportunity_type, priority, relevance_score, reason_code, metadata, expires_at, all_reasons from order_signals
  ),
  prepared as (
    select selected.*,
      encode(digest(concat_ws('|', selected.user_id::text, selected.opportunity_type,
        coalesce(selected.product_id::text, ''), coalesce(selected.template_id::text, ''),
        coalesce(selected.source_id::text, ''), selected.metadata::text), 'sha256'), 'hex') fingerprint
    from selected
  )
  insert into public.partner_commercial_opportunities(
    company_id, recipient_user_id, product_id, template_id, source_entity_type, source_entity_id,
    opportunity_type, status, priority, relevance_score, reason_code, safe_reason_metadata,
    secondary_reason_codes, commercial_state_fingerprint, expires_at
  )
  select target_company_id, prepared.user_id, prepared.product_id, prepared.template_id,
    case when prepared.template_id is not null then 'purchase_template'
      when prepared.list_id is not null then 'purchasing_list'
      when prepared.source_id is not null then 'order_history' else 'product' end,
    coalesce(prepared.template_id, prepared.list_id, prepared.source_id, prepared.product_id),
    prepared.opportunity_type, 'active', prepared.priority, prepared.relevance_score,
    prepared.reason_code, prepared.metadata, coalesce(prepared.secondary_reasons, '{}'),
    prepared.fingerprint, prepared.expires_at
  from prepared
  order by prepared.priority, prepared.relevance_score desc
  limit 1000
  on conflict (recipient_user_id, commercial_state_fingerprint) do update set
    status = 'active', priority = excluded.priority, relevance_score = excluded.relevance_score,
    reason_code = excluded.reason_code, safe_reason_metadata = excluded.safe_reason_metadata,
    secondary_reason_codes = excluded.secondary_reason_codes,
    last_confirmed_at = now(), expires_at = excluded.expires_at,
    resolved_at = null, updated_at = now();

  select count(*) into active_count from public.partner_commercial_opportunities
  where company_id = target_company_id and status = 'active' and expires_at > now();
  return active_count;
end;
$$;

revoke all on function public.refresh_partner_commercial_opportunities(uuid) from public, anon, authenticated;
grant execute on function public.refresh_partner_commercial_opportunities(uuid) to service_role;

create or replace function public.process_partner_commercial_opportunity_dirty_companies(target_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare run_id uuid; target record; processed integer := 0; failures integer := 0; active_total integer := 0; started timestamptz := clock_timestamp();
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target_limit not between 1 and 100 then raise exception 'Invalid limit' using errcode = '22023'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('partner_commercial_opportunity_projection', 0)) then
    return jsonb_build_object('status', 'locked', 'companiesProcessed', 0);
  end if;
  insert into public.partner_commercial_opportunity_projection_runs(status) values ('running') returning id into run_id;
  for target in
    select dirty.company_id from public.partner_commercial_opportunity_dirty_companies dirty
    where dirty.locked_at is null or dirty.locked_at < now() - interval '10 minutes'
    order by dirty.first_dirtied_at limit target_limit for update skip locked
  loop
    begin
      update public.partner_commercial_opportunity_dirty_companies set locked_at = now(), attempts = attempts + 1 where company_id = target.company_id;
      active_total := active_total + public.refresh_partner_commercial_opportunities(target.company_id);
      delete from public.partner_commercial_opportunity_dirty_companies where company_id = target.company_id;
      processed := processed + 1;
    exception when others then
      failures := failures + 1;
      update public.partner_commercial_opportunity_dirty_companies
      set locked_at = null, last_error_code = sqlstate where company_id = target.company_id;
    end;
  end loop;
  update public.partner_commercial_opportunity_projection_runs set
    status = case when failures = 0 then 'succeeded' when processed > 0 then 'partial' else 'failed' end,
    companies_processed = processed, opportunities_active = active_total, failures = failures,
    duration_ms = extract(milliseconds from clock_timestamp() - started)::integer, finished_at = now()
  where id = run_id;
  return jsonb_build_object('runId', run_id, 'status', case when failures = 0 then 'succeeded' when processed > 0 then 'partial' else 'failed' end,
    'companiesProcessed', processed, 'opportunitiesActive', active_total, 'failures', failures,
    'durationMs', extract(milliseconds from clock_timestamp() - started)::integer);
end;
$$;

revoke all on function public.process_partner_commercial_opportunity_dirty_companies(integer) from public, anon, authenticated;
grant execute on function public.process_partner_commercial_opportunity_dirty_companies(integer) to service_role;

create or replace function public.enqueue_partner_opportunity_from_company_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare company uuid;
begin
  company := case
    when tg_table_name in ('carts', 'purchasing_lists', 'purchase_templates', 'partner_order_history')
      then coalesce(new.company_id, old.company_id)
    else null
  end;
  if company is null and tg_table_name = 'cart_items' then
    select value.company_id into company from public.carts value where value.id = coalesce(new.cart_id, old.cart_id);
  elsif company is null and tg_table_name = 'purchasing_list_items' then
    select value.company_id into company from public.purchasing_lists value where value.id = coalesce(new.list_id, old.list_id);
  elsif company is null and tg_table_name = 'purchase_template_items' then
    select value.company_id into company from public.purchase_templates value where value.id = coalesce(new.template_id, old.template_id);
  elsif company is null and tg_table_name = 'partner_order_history_items' then
    select value.company_id into company from public.partner_order_history value where value.id = coalesce(new.order_history_id, old.order_history_id);
  end if;
  if company is not null then perform public.enqueue_partner_commercial_opportunity_company(company, tg_table_name); end if;
  return null;
end;
$$;

create or replace function public.enqueue_partner_opportunity_for_relevant_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare product uuid := coalesce(new.product_id, old.product_id);
begin
  insert into public.partner_commercial_opportunity_dirty_companies(company_id, reason)
  select distinct relevance.company_id, tg_table_name
  from (
    select history.company_id from public.partner_order_history_items item
      join public.partner_order_history history on history.id = item.order_history_id
      where item.product_id = product and history.partner_visible
    union select list.company_id from public.purchasing_list_items item
      join public.purchasing_lists list on list.id = item.list_id
      where item.product_id = product and list.archived_at is null
    union select template.company_id from public.purchase_template_items item
      join public.purchase_templates template on template.id = item.template_id
      where item.product_id = product and template.status = 'active'
    union select cart.company_id from public.cart_items item join public.carts cart on cart.id = item.cart_id
      where item.product_id = product and cart.status = 'active'
  ) relevance
  on conflict (company_id) do update set reason = excluded.reason, last_dirtied_at = now(), locked_at = null;
  return null;
end;
$$;

revoke all on function public.enqueue_partner_opportunity_from_company_source(),
  public.enqueue_partner_opportunity_for_relevant_product() from public, anon, authenticated;

create trigger enqueue_opportunity_carts after insert or update or delete on public.carts
for each row execute function public.enqueue_partner_opportunity_from_company_source();
create trigger enqueue_opportunity_cart_items after insert or update or delete on public.cart_items
for each row execute function public.enqueue_partner_opportunity_from_company_source();
create trigger enqueue_opportunity_lists after insert or update or delete on public.purchasing_lists
for each row execute function public.enqueue_partner_opportunity_from_company_source();
create trigger enqueue_opportunity_list_items after insert or update or delete on public.purchasing_list_items
for each row execute function public.enqueue_partner_opportunity_from_company_source();
create trigger enqueue_opportunity_templates after insert or update or delete on public.purchase_templates
for each row execute function public.enqueue_partner_opportunity_from_company_source();
create trigger enqueue_opportunity_template_items after insert or update or delete on public.purchase_template_items
for each row execute function public.enqueue_partner_opportunity_from_company_source();
create trigger enqueue_opportunity_order_history after insert or update or delete on public.partner_order_history
for each row execute function public.enqueue_partner_opportunity_from_company_source();
create trigger enqueue_opportunity_order_items after insert or update or delete on public.partner_order_history_items
for each row execute function public.enqueue_partner_opportunity_from_company_source();
create trigger enqueue_opportunity_stock after insert or update or delete on public.product_stock_totals
for each row execute function public.enqueue_partner_opportunity_for_relevant_product();
create trigger enqueue_opportunity_arrivals after insert or update or delete on public.product_supplier_arrivals
for each row execute function public.enqueue_partner_opportunity_for_relevant_product();
create trigger enqueue_opportunity_prices after insert or update or delete on public.product_prices
for each row execute function public.enqueue_partner_opportunity_for_relevant_product();
create trigger enqueue_opportunity_merchandising after insert or update or delete on public.product_merchandising_assignments
for each row execute function public.enqueue_partner_opportunity_for_relevant_product();
create trigger enqueue_opportunity_product_transitions after insert on public.partner_product_transition_events
for each row execute function public.enqueue_partner_opportunity_for_relevant_product();

create or replace function public.list_partner_commercial_opportunities(
  target_company_id uuid,
  target_filter text default 'all',
  target_limit integer default 24,
  target_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb; actor uuid := auth.uid(); can_partner boolean; can_retail boolean;
begin
  if actor is null or not public.has_permission(target_company_id, 'opportunities.view') then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target_filter not in ('all', 'available', 'arrivals', 'price', 'templates', 'offers') or target_limit not between 1 and 50 or target_offset < 0 then raise exception 'Invalid query' using errcode = '22023'; end if;
  can_partner := public.has_permission(target_company_id, 'pricing.partner_price.view');
  can_retail := public.has_permission(target_company_id, 'pricing.retail_price.view');
  with filtered as (
    select opportunity.* from public.partner_commercial_opportunities opportunity
    where opportunity.company_id = target_company_id and opportunity.recipient_user_id = actor
      and opportunity.status = 'active' and opportunity.expires_at > now()
      and not exists (select 1 from public.partner_commercial_opportunity_dismissals dismissal
        where dismissal.recipient_user_id = actor and dismissal.commercial_state_fingerprint = opportunity.commercial_state_fingerprint)
      and (target_filter = 'all'
        or target_filter = 'available' and opportunity.opportunity_type in ('repeat_purchase_available', 'watched_product_back_in_stock', 'relevant_product_low_stock')
        or target_filter = 'arrivals' and opportunity.opportunity_type = 'relevant_product_arrival_confirmed'
        or target_filter = 'price' and opportunity.opportunity_type = 'relevant_product_price_decreased'
        or target_filter = 'templates' and opportunity.opportunity_type in ('purchase_template_ready', 'previous_order_repeatable')
        or target_filter = 'offers' and opportunity.opportunity_type = 'relevant_merchandising_offer')
  ), page as (
    select filtered.*, count(*) over() total_count
    from filtered order by priority, relevance_score desc, last_confirmed_at desc, id
    limit target_limit offset target_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id, 'type', page.opportunity_type, 'priority', page.priority,
      'reasonCode', page.reason_code, 'reasonMetadata', page.safe_reason_metadata,
      'secondaryReasons', page.secondary_reason_codes, 'fingerprint', page.commercial_state_fingerprint,
      'firstDetectedAt', page.first_detected_at, 'lastConfirmedAt', page.last_confirmed_at,
      'sourceType', page.source_entity_type, 'sourceId', page.source_entity_id,
      'product', case when product.id is null then null else jsonb_build_object(
        'id', product.id, 'sku', product.sku, 'name', product.name, 'slug', product.slug,
        'imageUrl', product.image_url, 'categoryName', category.name,
        'partnerPrice', case when can_partner then partner_price.value else null end,
        'retailPrice', case when can_retail then retail_price.value else null end,
        'availableQuantity', case when public.has_permission(target_company_id, 'stock.view') then stock.available_quantity else null end,
        'expectedArrivalDate', case when public.has_permission(target_company_id, 'stock.view') then arrival.expected_arrival_date else null end,
        'expectedArrivalQuantity', case when public.has_permission(target_company_id, 'stock.view') then arrival.expected_quantity else null end
      ) end,
      'template', case when template.id is null then null else jsonb_build_object('id', template.id, 'name', template.name) end
    ) order by page.priority, page.relevance_score desc, page.last_confirmed_at desc), '[]'::jsonb),
    'totalCount', coalesce(max(page.total_count), 0)
  ) into result
  from page
  left join public.catalog_products product on product.id = page.product_id
  left join public.catalog_categories category on category.id = product.category_id
  left join public.purchase_templates template on template.id = page.template_id and public.can_view_purchase_template(template)
  left join public.product_stock_totals stock on stock.product_id = product.id and stock.is_published
  left join lateral (
    select value.expected_arrival_date, sum(value.expected_quantity)::numeric expected_quantity
    from public.product_supplier_arrivals value where value.product_id = product.id and value.is_published and value.expected_arrival_date >= current_date
    group by value.expected_arrival_date order by value.expected_arrival_date limit 1
  ) arrival on true
  left join lateral (
    select jsonb_build_object('amount', price.price_amount, 'currency', price.currency) value
    from public.product_prices price join public.partner_companies company on company.id = target_company_id
    where price.product_id = product.id and price.external_1c_price_type_id = company.external_1c_price_type_id
      and price.is_active and price.is_published and price.currency_status = 'resolved'
    order by price.effective_at desc limit 1
  ) partner_price on true
  left join lateral (
    select jsonb_build_object('amount', price.price_amount, 'currency', price.currency) value
    from public.product_prices price join public.price_types type on type.id = price.price_type_id
    where price.product_id = product.id and type.external_code = 'UU-000020'
      and price.is_active and price.is_published and price.currency_status = 'resolved'
    order by price.effective_at desc limit 1
  ) retail_price on true;
  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'totalCount', 0));
end;
$$;

revoke all on function public.list_partner_commercial_opportunities(uuid, text, integer, integer) from public, anon;
grant execute on function public.list_partner_commercial_opportunities(uuid, text, integer, integer) to authenticated;

create or replace function public.dismiss_partner_commercial_opportunity(target_opportunity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target public.partner_commercial_opportunities;
begin
  select * into target from public.partner_commercial_opportunities where id = target_opportunity_id;
  if target.id is null or target.recipient_user_id <> auth.uid()
    or not public.has_permission(target.company_id, 'opportunities.view') then
    raise exception 'Opportunity not found' using errcode = 'P0002';
  end if;
  insert into public.partner_commercial_opportunity_dismissals(recipient_user_id, commercial_state_fingerprint)
  values (auth.uid(), target.commercial_state_fingerprint) on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.dismiss_partner_commercial_opportunity(uuid) from public, anon;
grant execute on function public.dismiss_partner_commercial_opportunity(uuid) to authenticated;

create or replace function public.get_partner_commercial_opportunity_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.opportunities.view') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'active', count(*) filter (where status = 'active' and expires_at > now()),
    'resolved', count(*) filter (where status = 'resolved'),
    'expired', count(*) filter (where status = 'expired' or expires_at <= now()),
    'dismissed', (select count(*) from public.partner_commercial_opportunity_dismissals),
    'affectedCompanies', count(distinct company_id) filter (where status = 'active' and expires_at > now()),
    'byType', coalesce(jsonb_object_agg(opportunity_type, type_count), '{}'::jsonb),
    'dirtyCompanies', (select count(*) from public.partner_commercial_opportunity_dirty_companies),
    'oldestDirtyAt', (select min(first_dirtied_at) from public.partner_commercial_opportunity_dirty_companies),
    'lastRun', (select to_jsonb(run) from public.partner_commercial_opportunity_projection_runs run order by started_at desc limit 1)
  ) into result
  from (select opportunity_type, company_id, status, expires_at, count(*) over (partition by opportunity_type) type_count from public.partner_commercial_opportunities) value;
  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_partner_commercial_opportunity_diagnostics() from public, anon, authenticated;
grant execute on function public.get_partner_commercial_opportunity_diagnostics() to authenticated;

insert into public.partner_commercial_opportunity_dirty_companies(company_id, reason)
select distinct company_id, 'initial_projection' from public.company_memberships where status = 'active'
on conflict do nothing;

alter table public.partner_behavior_events drop constraint if exists partner_behavior_event_name_check;
alter table public.partner_behavior_events add constraint partner_behavior_event_name_check check (event_name = any(array[
  'catalog_viewed','category_viewed','search_performed','search_no_results','filters_applied',
  'merchandising_section_viewed','merchandising_product_clicked','product_viewed','product_pricing_tab_viewed',
  'retail_price_history_range_changed','retail_price_history_data_opened','product_document_downloaded',
  'stock_state_viewed','arrival_date_viewed','product_added_to_favorites','product_removed_from_favorites',
  'product_added_to_compare','product_removed_from_compare','product_added_to_cart','product_removed_from_cart',
  'cart_quantity_changed','product_added_to_estimate','estimate_created','proposal_generated','order_submitted',
  'reorder_started','reorder_submitted','out_of_stock_product_viewed','unavailable_product_added',
  'arrival_interest_viewed','dashboard_viewed','dashboard_action_clicked','partner_dashboard_viewed',
  'dashboard_attention_opened','dashboard_quick_action_clicked','dashboard_order_opened','dashboard_shipment_opened',
  'dashboard_continue_work_clicked','dashboard_reorder_product_added','dashboard_finance_opened','dashboard_offer_opened',
  'dashboard_company_opened','product_overview_viewed','product_description_viewed','product_characteristics_viewed',
  'product_datasheet_viewed','order_list_viewed','order_opened','shipment_viewed','date_change_started','finance_viewed',
  'company_users_viewed','estimates_viewed','estimate_product_added','estimate_service_added','estimate_price_check_started',
  'estimate_price_check_applied','proposal_created','proposal_version_created','proposal_previewed','proposal_pdf_generated',
  'proposal_sent','proposal_send_failed','proposal_converted_to_order','notifications_opened','notification_opened',
  'notification_marked_read','notifications_marked_all_read','notification_dismissed','notification_preferences_updated',
  'product_notification_opened','product_notification_product_opened','product_notification_cart_opened',
  'purchase_templates_opened','purchase_template_created','purchase_template_opened','purchase_template_edited',
  'purchase_template_copied','purchase_template_archived','purchase_template_previewed','purchase_template_added_to_cart',
  'purchase_template_created_from_cart','purchase_template_created_from_order','purchase_template_created_from_list',
  'opportunities_opened','opportunity_viewed','opportunity_product_opened','opportunity_template_opened',
  'opportunity_added_to_cart','opportunity_dismissed','opportunity_repeat_started'
]));

do $$
declare definition text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'record_partner_behavior_event' limit 1;
  if definition is not null and position('opportunities_opened' in definition) = 0 then
    definition := replace(definition, '''product_notification_cart_opened''',
      '''product_notification_cart_opened'', ''purchase_templates_opened'', ''purchase_template_created'', ''purchase_template_opened'', ''purchase_template_edited'', ''purchase_template_copied'', ''purchase_template_archived'', ''purchase_template_previewed'', ''purchase_template_added_to_cart'', ''purchase_template_created_from_cart'', ''purchase_template_created_from_order'', ''purchase_template_created_from_list'', ''opportunities_opened'', ''opportunity_viewed'', ''opportunity_product_opened'', ''opportunity_template_opened'', ''opportunity_added_to_cart'', ''opportunity_dismissed'', ''opportunity_repeat_started''');
    execute definition;
  end if;
end;
$$;

commit;
