alter table public.partner_commercial_opportunities
  drop constraint partner_commercial_opportunities_type_check;
alter table public.partner_commercial_opportunities
  add constraint partner_commercial_opportunities_type_check check (opportunity_type in (
    'repeat_purchase_available', 'watched_product_back_in_stock',
    'relevant_product_arrival_confirmed', 'relevant_product_price_decreased',
    'purchase_template_ready', 'previous_order_repeatable',
    'relevant_merchandising_offer', 'relevant_product_low_stock',
    'source_product_low_stock_with_available_analog'
  ));

create or replace function public.refresh_partner_relation_opportunities(target_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare inserted_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with members as (
    select membership.user_id
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    join public.role_permissions grant_row on grant_row.role_id = role.id
    join public.permissions permission on permission.id = grant_row.permission_id
    where membership.company_id = target_company_id
      and membership.status = 'active'
      and permission.code = 'opportunities.view'
    group by membership.user_id
  ),
  relevant as (
    select member.user_id, source.product_id
    from members member
    cross join lateral (
      select item.product_id
      from public.partner_order_history history
      join public.partner_order_history_items item on item.order_history_id = history.id
      where history.company_id = target_company_id
        and history.partner_visible and history.one_c_posted and not history.one_c_deletion_mark
        and item.product_id is not null
      union
      select item.product_id
      from public.purchasing_lists list
      join public.purchasing_list_items item on item.list_id = list.id
      where list.company_id = target_company_id and list.archived_at is null
        and (list.visibility = 'company' or list.created_by = member.user_id)
      union
      select item.product_id
      from public.purchase_templates template
      join public.purchase_template_items item on item.template_id = template.id
      where template.company_id = target_company_id and template.status = 'active'
        and (template.visibility = 'company' or template.owner_user_id = member.user_id)
      union
      select item.product_id
      from public.carts cart
      join public.cart_items item on item.cart_id = cart.id
      where cart.company_id = target_company_id and cart.created_by = member.user_id
        and cart.status = 'active'
    ) source
  ),
  candidates as (
    select relevant.user_id, source.id product_id,
      coalesce(source_stock.available_quantity, 0)::numeric available_quantity,
      count(relation.id)::integer analog_count,
      min(relation.synchronized_at) synchronized_at
    from relevant
    join public.catalog_products source on source.id = relevant.product_id
      and source.is_active and source.is_visible
    left join public.product_stock_totals source_stock on source_stock.product_id = source.id
      and source_stock.is_published
    join public.product_relations relation on relation.source_product_id = source.id
      and relation.relation_type = 'analog' and relation.is_active
    join public.catalog_products target on target.id = relation.target_product_id
      and target.is_active and target.is_visible
    left join public.product_stock_totals target_stock on target_stock.product_id = target.id
      and target_stock.is_published
    left join lateral (
      select min(arrival.expected_arrival_date) expected_arrival_date
      from public.product_supplier_arrivals arrival
      where arrival.product_id = target.id and arrival.is_published
        and arrival.expected_arrival_date >= current_date
    ) target_arrival on true
    where coalesce(source_stock.available_quantity, 0) <= 5
      and (coalesce(target_stock.available_quantity, 0) > 0
        or target_arrival.expected_arrival_date is not null)
      and not exists (
        select 1 from public.partner_commercial_opportunities stronger
        where stronger.company_id = target_company_id
          and stronger.recipient_user_id = relevant.user_id
          and stronger.product_id = source.id
          and stronger.status = 'active' and stronger.priority < 55
      )
    group by relevant.user_id, source.id, source_stock.available_quantity
  ),
  prepared as (
    select candidate.*,
      encode(digest(concat_ws('|', candidate.user_id::text,
        'source_product_low_stock_with_available_analog', candidate.product_id::text,
        candidate.available_quantity::text, candidate.analog_count::text), 'sha256'), 'hex') fingerprint
    from candidates candidate
    order by candidate.available_quantity, candidate.product_id
    limit 25
  )
  insert into public.partner_commercial_opportunities(
    company_id, recipient_user_id, product_id, source_entity_type, source_entity_id,
    opportunity_type, status, priority, relevance_score, reason_code,
    safe_reason_metadata, secondary_reason_codes, commercial_state_fingerprint, expires_at
  )
  select target_company_id, prepared.user_id, prepared.product_id, 'product', prepared.product_id,
    'source_product_low_stock_with_available_analog', 'active', 55, 70,
    'available_analog', jsonb_build_object('analogCount', prepared.analog_count),
    array[]::text[], prepared.fingerprint, now() + interval '7 days'
  from prepared
  on conflict (recipient_user_id, commercial_state_fingerprint) do update set
    status = 'active', last_confirmed_at = now(), expires_at = excluded.expires_at,
    resolved_at = null, updated_at = now();

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.refresh_partner_relation_opportunities(uuid)
from public, anon, authenticated;
grant execute on function public.refresh_partner_relation_opportunities(uuid) to service_role;

create or replace function public.process_partner_commercial_opportunity_dirty_companies(target_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid; target record; processed_count integer := 0; failure_count integer := 0;
  active_total integer := 0; started timestamptz := clock_timestamp(); resulting_status text;
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
      update public.partner_commercial_opportunity_dirty_companies
      set locked_at = now(), attempts = attempts + 1 where company_id = target.company_id;
      active_total := active_total + public.refresh_partner_commercial_opportunities(target.company_id);
      active_total := active_total + public.refresh_partner_relation_opportunities(target.company_id);
      delete from public.partner_commercial_opportunity_dirty_companies where company_id = target.company_id;
      processed_count := processed_count + 1;
    exception when others then
      failure_count := failure_count + 1;
      update public.partner_commercial_opportunity_dirty_companies
      set locked_at = null, last_error_code = sqlstate where company_id = target.company_id;
    end;
  end loop;
  resulting_status := case when failure_count = 0 then 'succeeded' when processed_count > 0 then 'partial' else 'failed' end;
  update public.partner_commercial_opportunity_projection_runs set
    status = resulting_status, companies_processed = processed_count,
    opportunities_active = active_total, failures = failure_count,
    duration_ms = extract(milliseconds from clock_timestamp() - started)::integer,
    finished_at = now() where id = run_id;
  return jsonb_build_object('runId', run_id, 'status', resulting_status,
    'companiesProcessed', processed_count, 'opportunitiesActive', active_total,
    'failures', failure_count,
    'durationMs', extract(milliseconds from clock_timestamp() - started)::integer);
end;
$$;

revoke all on function public.process_partner_commercial_opportunity_dirty_companies(integer)
from public, anon, authenticated;
grant execute on function public.process_partner_commercial_opportunity_dirty_companies(integer) to service_role;
