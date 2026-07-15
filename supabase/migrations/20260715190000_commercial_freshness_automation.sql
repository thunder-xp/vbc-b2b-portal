-- Focused automation controls for commercial freshness jobs.

create table if not exists public.integration_sync_locks (
  scope text primary key,
  run_id uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.integration_sync_locks enable row level security;
revoke all on public.integration_sync_locks from public, anon, authenticated;
grant select, insert, update, delete on public.integration_sync_locks to service_role;

create or replace function public.acquire_integration_sync_lock(
  p_scope text,
  p_run_id uuid,
  p_ttl_seconds integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  previous public.integration_sync_locks%rowtype;
  acquired public.integration_sync_locks%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Integration locks are server-only.' using errcode = '42501';
  end if;
  if nullif(trim(p_scope), '') is null or p_ttl_seconds < 30 or p_ttl_seconds > 21600 then
    raise exception 'Invalid integration lock input.' using errcode = '22023';
  end if;

  select * into previous from public.integration_sync_locks where scope = p_scope;
  insert into public.integration_sync_locks(scope, run_id, acquired_at, expires_at, updated_at)
  values (p_scope, p_run_id, now(), now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (scope) do update set
    run_id = excluded.run_id,
    acquired_at = excluded.acquired_at,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
  where public.integration_sync_locks.expires_at <= now()
  returning * into acquired;

  if acquired.run_id is null then return 'locked'; end if;
  if previous.run_id is not null and previous.expires_at <= now() then return 'stale_lock_recovered'; end if;
  return 'acquired';
end;
$$;

create or replace function public.release_integration_sync_lock(p_scope text, p_run_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.integration_sync_locks
    where scope = p_scope and run_id = p_run_id and auth.role() = 'service_role'
    returning 1
  )
  select exists(select 1 from removed);
$$;

revoke all on function public.acquire_integration_sync_lock(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_integration_sync_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_integration_sync_lock(text, uuid, integer) to service_role;
grant execute on function public.release_integration_sync_lock(text, uuid) to service_role;

create or replace function public.acquire_partner_order_history_sync(
  p_company_id uuid,
  p_counterparty_ref text,
  p_sync_id uuid,
  p_mode text,
  p_stale_after_seconds integer default 1800
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  previous public.partner_order_history_sync_state%rowtype;
  acquired public.partner_order_history_sync_state%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history synchronization is server-only.' using errcode = '42501';
  end if;
  if p_mode not in ('full', 'incremental') or p_stale_after_seconds < 300 then
    raise exception 'Invalid order history lock input.' using errcode = '22023';
  end if;

  select * into previous from public.partner_order_history_sync_state where company_id = p_company_id;
  insert into public.partner_order_history_sync_state(
    company_id, counterparty_ref, status, sync_mode, active_sync_id,
    safe_error, records_received, records_inserted, records_updated,
    records_hidden, started_at, finished_at, updated_at
  ) values (
    p_company_id, lower(p_counterparty_ref), 'running', p_mode, p_sync_id,
    null, 0, 0, 0, 0, now(), null, now()
  )
  on conflict (company_id) do update set
    counterparty_ref = excluded.counterparty_ref,
    status = excluded.status,
    sync_mode = excluded.sync_mode,
    active_sync_id = excluded.active_sync_id,
    safe_error = null,
    records_received = 0,
    records_inserted = 0,
    records_updated = 0,
    records_hidden = 0,
    started_at = excluded.started_at,
    finished_at = null,
    updated_at = excluded.updated_at
  where public.partner_order_history_sync_state.status <> 'running'
     or public.partner_order_history_sync_state.updated_at <= now() - make_interval(secs => p_stale_after_seconds)
  returning * into acquired;

  if acquired.active_sync_id is null then return 'locked'; end if;
  if previous.status = 'running' and previous.updated_at <= now() - make_interval(secs => p_stale_after_seconds) then
    return 'stale_lock_recovered';
  end if;
  return 'acquired';
end;
$$;

revoke all on function public.acquire_partner_order_history_sync(uuid, text, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.acquire_partner_order_history_sync(uuid, text, uuid, text, integer)
  to service_role;

create or replace function public.start_exact_stock_sync()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state public.stock_sync_state%rowtype;
  new_sync_id uuid := gen_random_uuid();
  v_started_at timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'Stock synchronization is server-only.' using errcode = '42501';
  end if;

  select * into current_state from public.stock_sync_state where id = 'exact_stock' for update;
  if current_state.status in ('queued', 'running') and current_state.updated_at > now() - interval '10 minutes' then
    return jsonb_build_object('result', 'locked', 'sync_id', current_state.active_sync_id);
  end if;
  if exists(select 1 from public.price_sync_state where id = 'product_prices' and status in ('queued', 'running')) then
    return jsonb_build_object('result', 'blocked_price', 'sync_id', null);
  end if;
  if exists(select 1 from public.catalog_sync_state where id = 'daily_catalog' and status = 'running') then
    return jsonb_build_object('result', 'blocked_catalog', 'sync_id', null);
  end if;

  if current_state.active_sync_id is not null or current_state.last_failed_sync_id is not null then
    delete from public.stock_balance_sync_stage where sync_id = coalesce(current_state.active_sync_id, current_state.last_failed_sync_id);
    delete from public.stock_balance_stage_receipts where sync_id = coalesce(current_state.active_sync_id, current_state.last_failed_sync_id);
    delete from public.stock_warehouse_sync_stage where sync_id = coalesce(current_state.active_sync_id, current_state.last_failed_sync_id);
    delete from public.supplier_arrival_balance_stage where sync_id = coalesce(current_state.active_sync_id, current_state.last_failed_sync_id);
    delete from public.supplier_order_document_stage where sync_id = coalesce(current_state.active_sync_id, current_state.last_failed_sync_id);
  end if;

  update public.stock_sync_state set
    status = 'queued', active_sync_id = new_sync_id, last_failed_sync_id = null,
    snapshot_time = v_started_at, current_stage = 'warehouse_scan', next_skip = 0,
    page_size = 500, pages_processed = 0, physical_rows = 0, reserved_rows = 0,
    incoming_rows = 0, warehouses_loaded = 0, products_matched = 0,
    products_unmatched = 0, rows_published = 0, rows_deactivated = 0,
    supplier_balance_rows = 0, supplier_balance_groups = 0, supplier_positive_groups = 0,
    supplier_nonpositive_excluded = 0, supplier_orders_requested = 0,
    supplier_documents_resolved = 0, supplier_documents_missing = 0,
    supplier_unposted_excluded = 0, supplier_deleted_excluded = 0,
    supplier_closed_excluded = 0, supplier_state_excluded = 0,
    supplier_missing_date_excluded = 0, supplier_date_placement_excluded = 0,
    supplier_overdue_excluded = 0, supplier_valid_arrivals = 0,
    supplier_arrivals_published = 0, scan_complete = false, started_at = v_started_at,
    finished_at = null, error_category = null, failed_stage = null, safe_error = null,
    database_error_code = null, failed_page = null, active_chunk_token = null,
    chunk_started_at = null, updated_at = v_started_at
  where id = 'exact_stock';

  return jsonb_build_object('result', case when current_state.status in ('queued', 'running') then 'stale_lock_recovered' else 'acquired' end, 'sync_id', new_sync_id);
end;
$$;

revoke all on function public.start_exact_stock_sync() from public, anon, authenticated;
grant execute on function public.start_exact_stock_sync() to service_role;

create index if not exists partner_order_history_active_refresh_idx
  on public.partner_order_history(one_c_last_synced_at, company_id, id)
  where partner_visible = true
    and one_c_deletion_mark = false
    and (one_c_posted = false or one_c_state_code is distinct from 'completed');

create or replace function public.touch_partner_order_history_refs(
  p_company_id uuid,
  p_order_refs text[],
  p_synced_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history synchronization is server-only.' using errcode = '42501';
  end if;
  update public.partner_order_history
  set one_c_last_synced_at = p_synced_at
  where company_id = p_company_id and external_1c_order_ref = any(p_order_refs);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.touch_partner_order_history_refs(uuid, text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.touch_partner_order_history_refs(uuid, text[], timestamptz)
  to service_role;

create or replace function public.publish_commercial_exchange_rate(
  p_source_code text,
  p_source_ref text,
  p_base_currency_ref text,
  p_source_document_type text,
  p_source_document_date timestamptz,
  p_source_mdl_per_usd_rate numeric,
  p_markup_percent numeric,
  p_bcru_mdl_per_usd_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_rate public.commercial_exchange_rates%rowtype;
  published public.commercial_exchange_rates%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Exchange-rate publication is server-only.' using errcode = '42501';
  end if;
  if p_source_code <> '113'
    or p_source_ref <> 'd5303dea-f2f5-11ec-4f83-7239d3b7bd5c'
    or p_base_currency_ref <> '00b49bb3-63d6-11e8-80d2-000c29a58b59'
    or nullif(trim(p_source_document_type), '') is null
    or p_source_mdl_per_usd_rate <= 0
    or p_bcru_mdl_per_usd_rate <= 0
    or p_source_document_date > now()
  then
    raise exception 'Invalid commercial exchange-rate publication payload.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('commercial_exchange_rate:' || p_source_code));

  select * into current_rate from public.commercial_exchange_rates
  where source_code = p_source_code and base_currency = 'USD' and quote_currency = 'MDL' and is_published
  order by effective_date desc, source_document_date desc nulls last, published_at desc
  limit 1 for update;

  if current_rate.id is not null and current_rate.source_document_date > p_source_document_date then
    return to_jsonb(current_rate);
  end if;

  insert into public.commercial_exchange_rates(
    source_code, source_ref, base_currency, base_currency_ref, quote_currency,
    rate_direction, rate, effective_date, source_updated_at, source_document_type,
    source_document_date, source_mdl_per_usd_rate, markup_percent, published_at, is_published
  ) values (
    p_source_code, p_source_ref, 'USD', p_base_currency_ref, 'MDL', 'quote_per_base',
    p_bcru_mdl_per_usd_rate, p_source_document_date::date, p_source_document_date,
    p_source_document_type, p_source_document_date, p_source_mdl_per_usd_rate,
    p_markup_percent, now(), true
  )
  on conflict (source_code, base_currency, quote_currency, effective_date)
  do update set
    source_ref = excluded.source_ref,
    base_currency_ref = excluded.base_currency_ref,
    rate = excluded.rate,
    source_updated_at = excluded.source_updated_at,
    source_document_type = excluded.source_document_type,
    source_document_date = excluded.source_document_date,
    source_mdl_per_usd_rate = excluded.source_mdl_per_usd_rate,
    markup_percent = excluded.markup_percent,
    published_at = excluded.published_at,
    is_published = true
  returning * into published;

  update public.commercial_exchange_rates set is_published = false
  where source_code = p_source_code and base_currency = 'USD' and quote_currency = 'MDL'
    and id <> published.id and is_published;
  return to_jsonb(published);
end;
$$;

revoke all on function public.publish_commercial_exchange_rate(text, text, text, text, timestamptz, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.publish_commercial_exchange_rate(text, text, text, text, timestamptz, numeric, numeric, numeric)
  to service_role;
