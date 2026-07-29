begin;

create table public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id),
  price_type_id uuid not null references public.price_types(id),
  external_price_type_code text not null,
  external_product_ref text not null,
  external_characteristic_ref text not null,
  price_amount numeric(14, 2) not null check (price_amount >= 0),
  currency text not null check (
    currency = upper(btrim(currency))
    and char_length(currency) between 3 and 8
  ),
  effective_at timestamptz not null,
  observed_at timestamptz not null default now(),
  source text not null check (source in (
    'initial_baseline', 'price_sync_snapshot', 'one_c_history', 'manual_repair'
  )),
  source_fingerprint text not null unique,
  source_version text,
  sync_run_id uuid,
  created_at timestamptz not null default now(),
  constraint product_price_history_retail_only_check
    check (external_price_type_code = 'UU-000020'),
  constraint product_price_history_zero_characteristic_check
    check (external_characteristic_ref = '00000000-0000-0000-0000-000000000000')
);

create index product_price_history_product_effective_idx
  on public.product_price_history(product_id, price_type_id, effective_at desc);
create index product_price_history_type_effective_idx
  on public.product_price_history(price_type_id, effective_at desc);

comment on table public.product_price_history is
  'Append-only partner-visible RETAIL UU-000020 change points. Historical 1C rows remain blocked until their currency is verified.';

create or replace function public.reject_product_price_history_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'product price history is append-only' using errcode = '55000';
end;
$$;

create trigger product_price_history_append_only
before update or delete on public.product_price_history
for each row execute function public.reject_product_price_history_mutation();

alter table public.product_price_history enable row level security;
revoke all on public.product_price_history from public, anon, authenticated;
grant select on public.product_price_history to authenticated;

create policy "Partners read canonical retail price history"
on public.product_price_history for select to authenticated
using (
  external_price_type_code = 'UU-000020'
  and public.can_select_product_commercial_data(
    product_id,
    null,
    'pricing.retail_price.view'
  )
);

create table public.retail_price_history_source_stage (
  sync_id uuid not null,
  external_product_ref text not null,
  external_price_type_ref text not null,
  external_characteristic_ref text not null,
  price_amount numeric(14, 2) not null check (price_amount >= 0),
  effective_at timestamptz not null,
  is_current boolean not null,
  source_fingerprint text not null,
  staged_at timestamptz not null default now(),
  primary key (sync_id, source_fingerprint),
  constraint retail_history_stage_type_check
    check (external_price_type_ref = 'e181c772-93fc-11e9-94cb-000c2988d323'),
  constraint retail_history_stage_characteristic_check
    check (external_characteristic_ref = '00000000-0000-0000-0000-000000000000')
);

create index retail_history_stage_sync_effective_idx
  on public.retail_price_history_source_stage(sync_id, effective_at);
alter table public.retail_price_history_source_stage enable row level security;
revoke all on public.retail_price_history_source_stage from public, anon, authenticated;
grant select, insert, delete on public.retail_price_history_source_stage to service_role;

create table public.retail_price_history_verification (
  id text primary key check (id = 'UU-000020'),
  status text not null check (status in (
    'currency_verification_required', 'verified', 'rejected'
  )),
  current_currency text not null,
  source_entity text not null,
  historical_rows_discovered integer not null default 0 check (historical_rows_discovered >= 0),
  distinct_products integer not null default 0 check (distinct_products >= 0),
  earliest_effective_at timestamptz,
  latest_effective_at timestamptz,
  last_discovery_sync_id uuid,
  verified_by uuid references public.user_profiles(id),
  evidence_type text,
  evidence_reason text,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.retail_price_history_verification(
  id, status, current_currency, source_entity
) values (
  'UU-000020',
  'currency_verification_required',
  'MDL',
  'InformationRegister_ЦеныНоменклатуры'
) on conflict (id) do nothing;

alter table public.retail_price_history_verification enable row level security;
revoke all on public.retail_price_history_verification from public, anon, authenticated;
grant select on public.retail_price_history_verification to authenticated;
create policy "Internal price administrators read retail history verification"
on public.retail_price_history_verification for select to authenticated
using (public.has_internal_permission('admin.prices.view'));

create table public.retail_price_history_verification_audit (
  id uuid primary key default gen_random_uuid(),
  verifier_id uuid not null references public.user_profiles(id),
  previous_status text not null,
  resulting_status text not null,
  evidence_type text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.retail_price_history_verification_audit enable row level security;
revoke all on public.retail_price_history_verification_audit from public, anon, authenticated;
grant select on public.retail_price_history_verification_audit to authenticated;
create policy "Internal price administrators read retail history audit"
on public.retail_price_history_verification_audit for select to authenticated
using (public.has_internal_permission('admin.prices.view'));

create or replace function public.capture_retail_price_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  retail_type public.price_types%rowtype;
  latest_history public.product_price_history%rowtype;
  fingerprint text;
begin
  if new.company_id is not null
    or new.external_1c_price_type_id <> 'e181c772-93fc-11e9-94cb-000c2988d323'
    or not new.is_published
    or not new.is_active then
    return new;
  end if;

  select * into retail_type
  from public.price_types
  where external_ref = new.external_1c_price_type_id
    and external_code = 'UU-000020'
    and is_active;

  if retail_type.id is null
    or retail_type.currency_status <> 'resolved'
    or retail_type.currency_code <> 'MDL'
    or new.currency <> 'MDL'
    or new.currency_status <> 'resolved' then
    raise exception 'canonical RETAIL currency is not safely resolved'
      using errcode = '22023';
  end if;

  select * into latest_history
  from public.product_price_history
  where product_id = new.product_id
    and price_type_id = retail_type.id
  order by effective_at desc, observed_at desc
  limit 1;

  if latest_history.id is not null
    and latest_history.price_amount = new.price_amount
    and latest_history.currency = new.currency then
    return new;
  end if;

  fingerprint := md5(concat_ws('|',
    'price_sync_snapshot',
    new.product_id::text,
    retail_type.id::text,
    coalesce(new.effective_at, new.valid_from)::text,
    new.price_amount::text,
    new.currency,
    new.last_seen_sync_id::text
  ));

  insert into public.product_price_history(
    product_id, price_type_id, external_price_type_code,
    external_product_ref, external_characteristic_ref,
    price_amount, currency, effective_at, observed_at,
    source, source_fingerprint, source_version, sync_run_id
  ) values (
    new.product_id, retail_type.id, 'UU-000020',
    new.external_product_ref,
    '00000000-0000-0000-0000-000000000000',
    new.price_amount, new.currency, coalesce(new.effective_at, new.valid_from),
    now(), 'price_sync_snapshot', fingerprint, new.source_version,
    new.last_seen_sync_id
  ) on conflict (source_fingerprint) do nothing;

  return new;
end;
$$;

create trigger capture_retail_price_history_after_publication
after insert or update of price_amount, currency, effective_at, is_active, is_published
on public.product_prices
for each row execute function public.capture_retail_price_history();

insert into public.product_price_history(
  product_id, price_type_id, external_price_type_code,
  external_product_ref, external_characteristic_ref,
  price_amount, currency, effective_at, observed_at,
  source, source_fingerprint, source_version, sync_run_id
)
select
  price.product_id,
  type.id,
  'UU-000020',
  price.external_product_ref,
  '00000000-0000-0000-0000-000000000000',
  price.price_amount,
  price.currency,
  coalesce(price.effective_at, price.valid_from),
  now(),
  'initial_baseline',
  md5(concat_ws('|',
    'initial_baseline',
    price.product_id::text,
    type.id::text,
    coalesce(price.effective_at, price.valid_from)::text,
    price.price_amount::text,
    price.currency
  )),
  price.source_version,
  price.last_seen_sync_id
from public.product_prices price
join public.price_types type on type.id = price.price_type_id
where price.company_id is null
  and price.external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c2988d323'
  and type.external_code = 'UU-000020'
  and type.currency_code = 'MDL'
  and type.currency_status = 'resolved'
  and price.currency = 'MDL'
  and price.currency_status = 'resolved'
  and price.is_active
  and price.is_published
on conflict (source_fingerprint) do nothing;

create or replace function public.record_retail_price_history_discovery(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.retail_price_history_verification verification
  set
    historical_rows_discovered = source.rows_discovered,
    distinct_products = source.products_discovered,
    earliest_effective_at = source.earliest,
    latest_effective_at = source.latest,
    last_discovery_sync_id = p_sync_id,
    updated_at = now()
  from (
    select
      count(*)::integer as rows_discovered,
      count(distinct external_product_ref)::integer as products_discovered,
      min(effective_at) as earliest,
      max(effective_at) as latest
    from public.retail_price_history_source_stage
    where sync_id = p_sync_id
  ) source
  where verification.id = 'UU-000020';

  select jsonb_build_object(
    'rowsDiscovered', historical_rows_discovered,
    'distinctProducts', distinct_products,
    'earliestEffectiveAt', earliest_effective_at,
    'latestEffectiveAt', latest_effective_at,
    'status', status
  ) into result
  from public.retail_price_history_verification
  where id = 'UU-000020';
  return result;
end;
$$;

revoke all on function public.record_retail_price_history_discovery(uuid)
  from public, anon, authenticated;
grant execute on function public.record_retail_price_history_discovery(uuid)
  to service_role;

create or replace function public.verify_retail_price_history_currency(
  p_evidence_type text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  current_state public.retail_price_history_verification%rowtype;
  evidence text := nullif(btrim(p_evidence_type), '');
  reason text := nullif(btrim(p_reason), '');
begin
  if not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if evidence not in ('one_c_metadata', 'documented_business_confirmation', 'period_currency_relation')
    or reason is null or char_length(reason) < 20 or char_length(reason) > 1000 then
    raise exception 'verified evidence and a detailed reason are required'
      using errcode = '22023';
  end if;

  select * into current_state
  from public.retail_price_history_verification
  where id = 'UU-000020'
  for update;

  update public.retail_price_history_verification
  set status = 'verified', verified_by = actor, evidence_type = evidence,
      evidence_reason = reason, verified_at = now(), updated_at = now()
  where id = 'UU-000020';

  insert into public.retail_price_history_verification_audit(
    verifier_id, previous_status, resulting_status, evidence_type, reason
  ) values (actor, current_state.status, 'verified', evidence, reason);

  return jsonb_build_object('status', 'verified', 'verifiedAt', now());
end;
$$;

revoke all on function public.verify_retail_price_history_currency(text, text)
  from public, anon;
grant execute on function public.verify_retail_price_history_currency(text, text)
  to authenticated;

create or replace function public.get_retail_price_history(
  p_product_id uuid,
  p_range text default '12m'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  start_at timestamptz;
  current_price public.product_prices%rowtype;
  verification_status text;
  points jsonb;
  point_count integer;
  first_at timestamptz;
  last_at timestamptz;
  minimum numeric;
  maximum numeric;
  previous numeric;
begin
  if p_range not in ('3m', '6m', '12m', 'all') then
    raise exception 'invalid retail history range' using errcode = '22023';
  end if;
  if not public.can_select_product_commercial_data(
    p_product_id, null, 'pricing.retail_price.view'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  start_at := case p_range
    when '3m' then now() - interval '3 months'
    when '6m' then now() - interval '6 months'
    when '12m' then now() - interval '12 months'
    else null
  end;

  select * into current_price
  from public.product_prices
  where product_id = p_product_id
    and company_id is null
    and external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c2988d323'
    and is_active and is_published
    and currency_status = 'resolved'
    and currency = 'MDL'
  order by effective_at desc, updated_at desc
  limit 1;

  select status into verification_status
  from public.retail_price_history_verification where id = 'UU-000020';

  with candidates as (
    select price_amount, currency, effective_at, source
    from public.product_price_history
    where product_id = p_product_id
      and external_price_type_code = 'UU-000020'
      and currency = current_price.currency
      and (start_at is null or effective_at >= start_at)
      and (
        source <> 'one_c_history'
        or verification_status = 'verified'
      )
    order by effective_at desc, observed_at desc
    limit 501
  ),
  bounded as (
    select price_amount, currency, effective_at, source
    from candidates
    order by effective_at desc
    limit 500
  ),
  stats as (
    select count(*)::integer count, min(effective_at) first_at,
      max(effective_at) last_at, min(price_amount) minimum,
      max(price_amount) maximum
    from bounded
  ),
  prior as (
    select price_amount from bounded order by effective_at desc offset 1 limit 1
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'amount', bounded.price_amount,
      'currency', bounded.currency,
      'effectiveAt', bounded.effective_at,
      'source', bounded.source
    ) order by bounded.effective_at), '[]'::jsonb),
    stats.count, stats.first_at, stats.last_at, stats.minimum, stats.maximum,
    (select price_amount from prior)
  into points, point_count, first_at, last_at, minimum, maximum, previous
  from stats left join bounded on true
  group by stats.count, stats.first_at, stats.last_at, stats.minimum, stats.maximum;

  return jsonb_build_object(
    'current', case when current_price.id is null then null else jsonb_build_object(
      'amount', current_price.price_amount,
      'currency', current_price.currency,
      'effectiveAt', coalesce(current_price.effective_at, current_price.valid_from)
    ) end,
    'points', coalesce(points, '[]'::jsonb),
    'firstAt', first_at,
    'lastAt', last_at,
    'previousAmount', previous,
    'minimumAmount', minimum,
    'maximumAmount', maximum,
    'mode', case
      when current_price.id is null then 'unavailable'
      when point_count <= 1 then 'baseline_only'
      when verification_status = 'verified'
        and exists (
          select 1 from public.product_price_history
          where product_id = p_product_id and source = 'one_c_history'
        ) then 'historical_verified'
      else 'accumulated'
    end,
    'range', p_range,
    'truncated', (select count(*) > 500 from candidates)
  );
end;
$$;

revoke all on function public.get_retail_price_history(uuid, text)
  from public, anon;
grant execute on function public.get_retail_price_history(uuid, text)
  to authenticated;

create or replace function public.get_retail_price_history_health()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when not public.has_internal_permission('admin.prices.view') then
      null
    else jsonb_build_object(
      'productsWithCurrentRetail', (
        select count(*) from public.product_prices
        where external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c2988d323'
          and is_active and is_published
      ),
      'productsWithHistory', (
        select count(distinct product_id) from public.product_price_history
      ),
      'productsWithBaselineOnly', (
        select count(*) from (
          select product_id from public.product_price_history
          group by product_id having count(*) = 1
        ) baseline
      ),
      'lastHistoryUpdate', (
        select max(observed_at) from public.product_price_history
      ),
      'failedHistoryAppendCount', (
        select count(*) from public.price_sync_state
        where id = 'product_prices' and status = 'failed'
          and failed_stage = 'price_publication'
      ),
      'currencyDistribution', (
        select coalesce(jsonb_object_agg(currency, count), '{}'::jsonb)
        from (
          select currency, count(*) from public.product_price_history
          group by currency
        ) currencies
      ),
      'verification', (
        select to_jsonb(verification) - 'evidence_reason'
        from public.retail_price_history_verification verification
        where id = 'UU-000020'
      )
    )
  end;
$$;

revoke all on function public.get_retail_price_history_health()
  from public, anon;
grant execute on function public.get_retail_price_history_health()
  to authenticated;

alter table public.partner_behavior_events
  drop constraint if exists partner_behavior_event_name_check;
alter table public.partner_behavior_events
  add constraint partner_behavior_event_name_check check (event_name in (
    'catalog_viewed', 'category_viewed', 'search_performed',
    'search_no_results', 'filters_applied',
    'merchandising_section_viewed', 'merchandising_product_clicked',
    'product_viewed', 'product_pricing_tab_viewed',
    'retail_price_history_range_changed', 'retail_price_history_data_opened',
    'product_document_downloaded', 'stock_state_viewed', 'arrival_date_viewed',
    'product_added_to_favorites', 'product_removed_from_favorites',
    'product_added_to_compare', 'product_removed_from_compare',
    'product_added_to_cart', 'product_removed_from_cart',
    'cart_quantity_changed', 'product_added_to_estimate',
    'estimate_created', 'proposal_generated', 'order_submitted',
    'reorder_started', 'reorder_submitted',
    'out_of_stock_product_viewed', 'unavailable_product_added',
    'arrival_interest_viewed', 'dashboard_viewed', 'dashboard_action_clicked',
    'order_list_viewed', 'order_opened', 'shipment_viewed',
    'date_change_started', 'finance_viewed', 'company_users_viewed',
    'estimates_viewed', 'estimate_product_added', 'estimate_service_added',
    'estimate_price_check_started', 'estimate_price_check_applied',
    'proposal_created', 'proposal_version_created', 'proposal_previewed',
    'proposal_pdf_generated', 'proposal_sent', 'proposal_send_failed',
    'proposal_converted_to_order'
  ));

do $$
declare
  function_definition text;
  amended_definition text;
begin
  select pg_get_functiondef(
    'public.record_partner_behavior_event(uuid,text,uuid,uuid,uuid,uuid,text,text,integer,numeric,text,jsonb)'::regprocedure
  ) into function_definition;
  amended_definition := replace(
    function_definition,
    quote_literal('product_viewed') || ', ' || quote_literal('product_document_downloaded'),
    quote_literal('product_viewed') || ', '
      || quote_literal('product_pricing_tab_viewed') || ', '
      || quote_literal('retail_price_history_range_changed') || ', '
      || quote_literal('retail_price_history_data_opened') || ', '
      || quote_literal('product_document_downloaded')
  );
  if amended_definition = function_definition then
    raise exception 'behavior event allowlist anchor was not found';
  end if;
  execute amended_definition;
end;
$$;

commit;
