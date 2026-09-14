begin;

create table private.one_c_price_type_domain_registry (
  external_ref text primary key,
  price_domain text not null check (price_domain in (
    'PARTNER_CONTRACT_PRICE',
    'FINAL_CUSTOMER_RETAIL_PRICE',
    'INTERNAL/OTHER'
  )),
  governance_note text not null,
  updated_at timestamptz not null default now(),
  constraint one_c_price_type_domain_registry_ref_check
    check (external_ref = lower(external_ref) and external_ref ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

alter table private.one_c_price_type_domain_registry enable row level security;
revoke all on table private.one_c_price_type_domain_registry
  from public, anon, authenticated, service_role;

comment on table private.one_c_price_type_domain_registry is
  'Governed stable 1C Ref_Key classification. Display names never determine commercial price-domain behavior.';

insert into private.one_c_price_type_domain_registry(
  external_ref, price_domain, governance_note
) values
  ('1668b73c-aea5-11f1-1b94-bc2411369b92', 'FINAL_CUSTOMER_RETAIL_PRICE', 'A, BCR; final-customer retail only'),
  ('eb632a56-aeb6-11f1-1b94-bc2411369b92', 'FINAL_CUSTOMER_RETAIL_PRICE', 'B, BCR; final-customer retail only'),
  ('fc52173c-aeb6-11f1-1b94-bc2411369b92', 'FINAL_CUSTOMER_RETAIL_PRICE', 'C, BCR; final-customer retail only'),
  ('64592673-624e-4a13-849a-95a7336cfdc5', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type'),
  ('d9c92519-658b-11e8-80d3-000c29a58b59', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type'),
  ('5c72ff41-88d6-11e8-80dd-000c29a58b59', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type'),
  ('ec9609bd-919b-11e8-80e2-000c29a58b59', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type'),
  ('e181c772-93fc-11e9-94cb-000c2988d323', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type'),
  ('60c4cbb2-f16d-11e9-86ae-000c29cf9dd4', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type'),
  ('e71d8dd2-3eb0-11f0-8d8a-7239d3b7bd5c', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type'),
  ('23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type'),
  ('9adc073c-3eb5-11f0-8d8a-7239d3b7bd5c', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type'),
  ('3dcb5436-a5c0-11f0-0481-7239d3b7bd5c', 'PARTNER_CONTRACT_PRICE', 'Governed 1C customer-contract price type');

create index one_c_counterparty_contracts_price_domain_idx
  on public.one_c_counterparty_contracts ((lower(price_type_external_1c_id)))
  where is_default and is_active and not is_deleted
    and price_type_external_1c_id is not null;

create index partner_companies_price_domain_idx
  on public.partner_companies ((lower(external_1c_price_type_id)))
  where status = 'active' and external_1c_price_type_id is not null;

create or replace function private.classify_one_c_price_type(
  p_external_ref text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_ref text := lower(btrim(coalesce(p_external_ref, '')));
  configured_domain text;
begin
  select registry.price_domain
  into configured_domain
  from private.one_c_price_type_domain_registry registry
  where registry.external_ref = normalized_ref;

  if configured_domain is not null then
    return configured_domain;
  end if;

  if exists (
    select 1
    from public.partner_companies company
    where company.status = 'active'
      and lower(company.external_1c_price_type_id) = normalized_ref
  ) or exists (
    select 1
    from public.one_c_counterparty_contracts contract
    where contract.is_default
      and contract.is_active
      and not contract.is_deleted
      and lower(contract.price_type_external_1c_id) = normalized_ref
  ) then
    return 'PARTNER_CONTRACT_PRICE';
  end if;

  return 'INTERNAL/OTHER';
end;
$$;

revoke all on function private.classify_one_c_price_type(text)
  from public, anon, authenticated, service_role;

alter table public.price_types
  add column price_domain text not null default 'INTERNAL/OTHER',
  add constraint price_types_price_domain_check check (price_domain in (
    'PARTNER_CONTRACT_PRICE',
    'FINAL_CUSTOMER_RETAIL_PRICE',
    'INTERNAL/OTHER'
  ));

create or replace function private.assign_one_c_price_type_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.price_domain := private.classify_one_c_price_type(new.external_ref);
  return new;
end;
$$;

revoke all on function private.assign_one_c_price_type_domain()
  from public, anon, authenticated, service_role;

create trigger assign_one_c_price_type_domain
before insert or update on public.price_types
for each row execute function private.assign_one_c_price_type_domain();

update public.price_types price_type
set price_domain = private.classify_one_c_price_type(price_type.external_ref);

create table private.price_sync_type_page_metrics (
  sync_id uuid not null,
  page_number integer not null check (page_number >= 0),
  external_price_type_ref text not null,
  price_domain text not null check (price_domain in (
    'PARTNER_CONTRACT_PRICE',
    'FINAL_CUSTOMER_RETAIL_PRICE',
    'INTERNAL/OTHER'
  )),
  received_rows integer check (received_rows is null or received_rows >= 0),
  prepared_rows integer not null check (prepared_rows >= 0),
  staged_rows integer not null check (staged_rows >= 0),
  excluded_rows integer not null check (excluded_rows >= 0),
  source_kind text not null default 'EXACT_PAGE' check (source_kind in (
    'EXACT_PAGE',
    'LEGACY_PREPARED_SNAPSHOT'
  )),
  created_at timestamptz not null default now(),
  primary key (sync_id, page_number, external_price_type_ref),
  constraint price_sync_type_page_metrics_counts_check check (
    prepared_rows >= staged_rows
    and excluded_rows = prepared_rows - staged_rows
    and (received_rows is null or received_rows >= prepared_rows)
  )
);

create index price_sync_type_page_metrics_sync_idx
  on private.price_sync_type_page_metrics(sync_id, price_domain, external_price_type_ref);

alter table private.price_sync_type_page_metrics enable row level security;
revoke all on table private.price_sync_type_page_metrics
  from public, anon, authenticated, service_role;

comment on table private.price_sync_type_page_metrics is
  'Idempotent page-level price sync diagnostics. Exact pages retain received/prepared/staged/excluded counts by governed 1C price type and domain.';

insert into private.price_sync_type_page_metrics(
  sync_id,
  page_number,
  external_price_type_ref,
  price_domain,
  received_rows,
  prepared_rows,
  staged_rows,
  excluded_rows,
  source_kind
)
select
  state.last_failed_sync_id,
  0,
  staged.external_price_type_ref,
  private.classify_one_c_price_type(staged.external_price_type_ref),
  null,
  count(*)::integer,
  count(*)::integer,
  0,
  'LEGACY_PREPARED_SNAPSHOT'
from public.price_sync_state state
join public.product_price_sync_stage staged
  on staged.sync_id = state.last_failed_sync_id
where state.id = 'product_prices'
  and state.status = 'failed'
  and state.last_failed_sync_id is not null
group by state.last_failed_sync_id, staged.external_price_type_ref
on conflict do nothing;

create or replace function public.stage_product_price_rows(
  p_sync_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  with source_rows as (
    select
      row.external_product_ref,
      row.external_price_type_ref,
      row.external_characteristic_ref,
      row.amount,
      row.is_current,
      row.effective_at,
      row.currency_code,
      row.currency_status,
      item.ordinality
    from jsonb_array_elements(p_rows) with ordinality as item(value, ordinality)
    cross join lateral jsonb_to_record(item.value) as row(
      external_product_ref text,
      external_price_type_ref text,
      external_characteristic_ref text,
      amount numeric,
      is_current boolean,
      effective_at timestamptz,
      currency_code text,
      currency_status text
    )
  ), ranked_rows as (
    select source_rows.*,
      row_number() over (
        partition by external_product_ref, external_price_type_ref, external_characteristic_ref
        order by effective_at desc, ordinality desc, is_current asc,
          amount::text asc, coalesce(currency_code, '') asc, currency_status asc
      ) as row_rank
    from source_rows
  )
  insert into public.product_price_sync_stage as current (
    sync_id, external_product_ref, external_price_type_ref,
    external_characteristic_ref, amount, is_current, effective_at,
    currency_code, currency_status
  )
  select p_sync_id, external_product_ref, external_price_type_ref,
    external_characteristic_ref, amount, is_current, effective_at,
    currency_code, currency_status
  from ranked_rows
  where row_rank = 1
    and lower(external_price_type_ref) not in (
      '1668b73c-aea5-11f1-1b94-bc2411369b92',
      'eb632a56-aeb6-11f1-1b94-bc2411369b92',
      'fc52173c-aeb6-11f1-1b94-bc2411369b92'
    )
  on conflict (sync_id, external_product_ref, external_price_type_ref, external_characteristic_ref)
  do update set
    amount = excluded.amount,
    is_current = excluded.is_current,
    effective_at = excluded.effective_at,
    currency_code = excluded.currency_code,
    currency_status = excluded.currency_status
  where excluded.effective_at >= current.effective_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.stage_product_price_rows(
  p_sync_id uuid,
  p_rows jsonb,
  p_page_number integer,
  p_type_metrics jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  metric_received integer;
  metric_prepared integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PRICE_SYNC_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_page_number < 1 or jsonb_typeof(p_rows) <> 'array'
    or jsonb_typeof(p_type_metrics) <> 'array' then
    raise exception 'PRICE_SYNC_TYPE_METRICS_INVALID' using errcode = '22023';
  end if;

  select coalesce(sum(metric.received_rows), 0),
    coalesce(sum(metric.prepared_rows), 0)
  into metric_received, metric_prepared
  from jsonb_to_recordset(p_type_metrics) as metric(
    external_price_type_ref text,
    received_rows integer,
    prepared_rows integer
  );

  if metric_received < metric_prepared
    or metric_prepared <> jsonb_array_length(p_rows) then
    raise exception 'PRICE_SYNC_TYPE_METRICS_MISMATCH' using errcode = '22023';
  end if;

  v_count := public.stage_product_price_rows(p_sync_id, p_rows);

  insert into private.price_sync_type_page_metrics(
    sync_id,
    page_number,
    external_price_type_ref,
    price_domain,
    received_rows,
    prepared_rows,
    staged_rows,
    excluded_rows,
    source_kind
  )
  select
    p_sync_id,
    p_page_number,
    lower(metric.external_price_type_ref),
    domain.price_domain,
    metric.received_rows,
    metric.prepared_rows,
    case when domain.price_domain = 'FINAL_CUSTOMER_RETAIL_PRICE'
      then 0 else metric.prepared_rows end,
    case when domain.price_domain = 'FINAL_CUSTOMER_RETAIL_PRICE'
      then metric.prepared_rows else 0 end,
    'EXACT_PAGE'
  from jsonb_to_recordset(p_type_metrics) as metric(
    external_price_type_ref text,
    received_rows integer,
    prepared_rows integer
  )
  cross join lateral (
    select private.classify_one_c_price_type(metric.external_price_type_ref) price_domain
  ) domain
  on conflict (sync_id, page_number, external_price_type_ref) do update set
    price_domain = excluded.price_domain,
    received_rows = excluded.received_rows,
    prepared_rows = excluded.prepared_rows,
    staged_rows = excluded.staged_rows,
    excluded_rows = excluded.excluded_rows,
    source_kind = excluded.source_kind,
    created_at = now();

  return v_count;
end;
$$;

revoke all on function public.stage_product_price_rows(uuid, jsonb, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.stage_product_price_rows(uuid, jsonb, integer, jsonb)
  to service_role;

create or replace function private.reject_final_customer_retail_price_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(coalesce(new.external_1c_price_type_id, ''))) in (
    '1668b73c-aea5-11f1-1b94-bc2411369b92',
    'eb632a56-aeb6-11f1-1b94-bc2411369b92',
    'fc52173c-aeb6-11f1-1b94-bc2411369b92'
  ) then
    raise exception 'FINAL_CUSTOMER_RETAIL_PRICE_NOT_ALLOWED_IN_PARTNER_PROJECTION'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_final_customer_retail_price_projection()
  from public, anon, authenticated, service_role;

delete from public.product_price_sync_stage
where lower(external_price_type_ref) in (
  '1668b73c-aea5-11f1-1b94-bc2411369b92',
  'eb632a56-aeb6-11f1-1b94-bc2411369b92',
  'fc52173c-aeb6-11f1-1b94-bc2411369b92'
);

delete from public.product_prices
where lower(external_1c_price_type_id) in (
  '1668b73c-aea5-11f1-1b94-bc2411369b92',
  'eb632a56-aeb6-11f1-1b94-bc2411369b92',
  'fc52173c-aeb6-11f1-1b94-bc2411369b92'
);

create trigger reject_final_customer_retail_price_projection
before insert or update of external_1c_price_type_id on public.product_prices
for each row execute function private.reject_final_customer_retail_price_projection();

create trigger reject_final_customer_retail_partner_profile
before insert or update of external_1c_price_type_id on public.partner_companies
for each row execute function private.reject_final_customer_retail_price_projection();

comment on trigger reject_final_customer_retail_price_projection on public.product_prices is
  'Fail-closed defense: final-customer A/B/C BCR values cannot enter the partner/current product-price projection.';
comment on trigger reject_final_customer_retail_partner_profile on public.partner_companies is
  'Fail-closed defense: final-customer A/B/C BCR types cannot become a partner commercial profile.';

commit;
