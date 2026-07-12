create table if not exists public.price_sync_state (
  id text primary key,
  status text not null default 'never_run'
    check (status in ('never_run', 'queued', 'running', 'succeeded', 'failed')),
  active_sync_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  last_successful_sync_at timestamptz,
  current_stage text,
  next_skip integer not null default 0,
  page_size integer not null default 500,
  pages_processed integer not null default 0,
  rows_scanned integer not null default 0,
  rows_staged integer not null default 0,
  latest_prices_resolved integer not null default 0,
  prices_published integer not null default 0,
  prices_deactivated integer not null default 0,
  unmatched_products integer not null default 0,
  unknown_price_types integer not null default 0,
  scan_complete boolean not null default false,
  error_category text,
  failed_stage text,
  database_error_code text,
  safe_error text,
  failed_page integer,
  active_chunk_token uuid,
  chunk_started_at timestamptz,
  lock_acquired_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.price_sync_state (id)
values ('product_prices')
on conflict (id) do nothing;


create table if not exists public.product_price_type_sync_stage (
  sync_id uuid not null,
  external_ref text not null,
  external_code text not null,
  name text not null,
  currency_ref text,
  source_version text,
  is_active boolean not null,
  primary key (sync_id, external_ref)
);


create table if not exists public.product_currency_sync_stage (
  sync_id uuid not null,
  external_ref text not null,
  code text not null,
  name text not null,
  is_active boolean not null,
  primary key (sync_id, external_ref)
);


create table if not exists public.product_price_sync_stage (
  sync_id uuid not null,
  external_product_ref text not null,
  external_price_type_ref text not null,
  external_characteristic_ref text not null,
  amount numeric not null,
  is_current boolean not null,
  effective_at timestamptz not null,
  currency_code text,
  currency_status text not null
    check (currency_status in ('resolved', 'unresolved')),
  created_at timestamptz not null default now(),
  primary key (
    sync_id,
    external_product_ref,
    external_price_type_ref,
    external_characteristic_ref
  )
);


create index if not exists product_price_sync_stage_sync_idx
  on public.product_price_sync_stage(sync_id);

create index if not exists product_price_sync_stage_product_idx
  on public.product_price_sync_stage(external_product_ref);

create index if not exists product_price_sync_stage_type_idx
  on public.product_price_sync_stage(external_price_type_ref);

create index if not exists product_price_sync_stage_effective_idx
  on public.product_price_sync_stage(effective_at);


alter table public.price_sync_state
  enable row level security;

alter table public.product_price_type_sync_stage
  enable row level security;

alter table public.product_currency_sync_stage
  enable row level security;

alter table public.product_price_sync_stage
  enable row level security;


revoke all
on table
  public.price_sync_state,
  public.product_price_type_sync_stage,
  public.product_currency_sync_stage,
  public.product_price_sync_stage
from anon, authenticated;


grant select, insert, update, delete
on table
  public.price_sync_state,
  public.product_price_type_sync_stage,
  public.product_currency_sync_stage,
  public.product_price_sync_stage
to service_role;


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
  insert into public.product_price_sync_stage as current (
    sync_id,
    external_product_ref,
    external_price_type_ref,
    external_characteristic_ref,
    amount,
    is_current,
    effective_at,
    currency_code,
    currency_status
  )
  select
    p_sync_id,
    row.external_product_ref,
    row.external_price_type_ref,
    row.external_characteristic_ref,
    row.amount,
    row.is_current,
    row.effective_at,
    row.currency_code,
    row.currency_status
  from jsonb_to_recordset(p_rows) as row(
    external_product_ref text,
    external_price_type_ref text,
    external_characteristic_ref text,
    amount numeric,
    is_current boolean,
    effective_at timestamptz,
    currency_code text,
    currency_status text
  )
  on conflict (
    sync_id,
    external_product_ref,
    external_price_type_ref,
    external_characteristic_ref
  )
  do update
  set
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


create or replace function public.publish_product_price_snapshot(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_published integer := 0;
  v_deactivated integer := 0;
  v_unmatched integer := 0;
  v_unknown integer := 0;
begin
  if not exists (
    select 1
    from public.price_sync_state
    where id = 'product_prices'
      and active_sync_id = p_sync_id
      and scan_complete
  ) then
    raise exception 'price sync is not ready for publication';
  end if;

  insert into public.price_types (
    external_ref,
    external_code,
    name,
    currency_ref,
    currency_code,
    currency_status,
    is_active,
    source_updated_at,
    updated_at
  )
  select
    t.external_ref,
    t.external_code,
    t.name,
    t.currency_ref,
    c.code,
    case
      when c.code is null then 'unresolved'
      else 'resolved'
    end,
    t.is_active,
    now(),
    now()
  from public.product_price_type_sync_stage t
  left join public.product_currency_sync_stage c
    on c.sync_id = p_sync_id
   and c.external_ref = t.currency_ref
  where t.sync_id = p_sync_id
  on conflict (external_ref)
  do update
  set
    external_code = excluded.external_code,
    name = excluded.name,
    currency_ref = excluded.currency_ref,
    currency_code = excluded.currency_code,
    currency_status = excluded.currency_status,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at;

  update public.price_types t
  set
    is_active = false,
    updated_at = now()
  where not exists (
    select 1
    from public.product_price_type_sync_stage s
    where s.sync_id = p_sync_id
      and s.external_ref = t.external_ref
  );

  select count(*)
  into v_unmatched
  from public.product_price_sync_stage s
  left join public.catalog_products p
    on p.external_1c_id = s.external_product_ref
  where s.sync_id = p_sync_id
    and p.id is null;

  select count(*)
  into v_unknown
  from public.product_price_sync_stage s
  left join public.price_types t
    on t.external_ref = s.external_price_type_ref
  where s.sync_id = p_sync_id
    and t.id is null;

  insert into public.product_prices (
    product_id,
    company_id,
    external_1c_price_type_id,
    currency,
    price_amount,
    valid_from,
    valid_to,
    is_active,
    price_type_id,
    external_product_ref,
    effective_at,
    synced_at,
    currency_status,
    last_seen_sync_id,
    is_published
  )
  select
    p.id,
    null,
    s.external_price_type_ref,
    coalesce(t.currency_code, 'XXX'),
    s.amount,
    s.effective_at,
    null,
    s.is_current and s.amount > 0,
    t.id,
    s.external_product_ref,
    s.effective_at,
    now(),
    t.currency_status,
    p_sync_id,
    true
  from public.product_price_sync_stage s
  join public.catalog_products p
    on p.external_1c_id = s.external_product_ref
  join public.price_types t
    on t.external_ref = s.external_price_type_ref
  where s.sync_id = p_sync_id
    and s.external_characteristic_ref =
      '00000000-0000-0000-0000-000000000000'
  on conflict (product_id, external_1c_price_type_id)
  do update
  set
    currency = excluded.currency,
    price_amount = excluded.price_amount,
    valid_from = excluded.valid_from,
    valid_to = null,
    is_active = excluded.is_active,
    price_type_id = excluded.price_type_id,
    external_product_ref = excluded.external_product_ref,
    effective_at = excluded.effective_at,
    synced_at = excluded.synced_at,
    currency_status = excluded.currency_status,
    last_seen_sync_id = p_sync_id,
    is_published = true;

  get diagnostics v_published = row_count;

  update public.product_prices
  set is_active = false
  where is_published
    and company_id is null
    and last_seen_sync_id is distinct from p_sync_id;

  get diagnostics v_deactivated = row_count;

  delete from public.product_price_sync_stage
  where sync_id = p_sync_id;

  delete from public.product_price_type_sync_stage
  where sync_id = p_sync_id;

  delete from public.product_currency_sync_stage
  where sync_id = p_sync_id;

  update public.price_sync_state
  set
    status = 'succeeded',
    current_stage = 'completed',
    finished_at = now(),
    last_successful_sync_at = now(),
    latest_prices_resolved =
      v_published + v_unmatched + v_unknown,
    prices_published = v_published,
    prices_deactivated = v_deactivated,
    unmatched_products = v_unmatched,
    unknown_price_types = v_unknown,
    active_sync_id = null,
    lock_acquired_at = null,
    active_chunk_token = null,
    chunk_started_at = null,
    safe_error = null,
    updated_at = now()
  where id = 'product_prices'
    and active_sync_id = p_sync_id;

  return jsonb_build_object(
    'published', v_published,
    'deactivated', v_deactivated,
    'unmatchedProducts', v_unmatched,
    'unknownPriceTypes', v_unknown
  );
end;
$$;


revoke all
on function public.stage_product_price_rows(uuid, jsonb)
from public, anon, authenticated;

revoke all
on function public.publish_product_price_snapshot(uuid)
from public, anon, authenticated;


grant execute
on function public.stage_product_price_rows(uuid, jsonb)
to service_role;

grant execute
on function public.publish_product_price_snapshot(uuid)
to service_role;


comment on table public.product_price_sync_stage is
  'Private resumable staging for the 1C-owned product price read model.';

comment on function public.publish_product_price_snapshot(uuid) is
  'Atomically publishes price types, currencies, and base product prices from one complete scan.';


create or replace function public.claim_price_sync_chunk(
  p_sync_id uuid,
  p_chunk_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  update public.price_sync_state
  set
    active_chunk_token = p_chunk_token,
    chunk_started_at = now(),
    updated_at = now()
  where id = 'product_prices'
    and active_sync_id = p_sync_id
    and status in ('queued', 'running')
    and (
      active_chunk_token is null
      or chunk_started_at < now() - interval '2 minutes'
    );

  get diagnostics v_claimed = row_count;

  return v_claimed;
end;
$$;


revoke all
on function public.claim_price_sync_chunk(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.claim_price_sync_chunk(uuid, uuid)
to service_role;
