-- True incremental order-history discovery, bounded existence verification,
-- and a separately governed two-pass full integrity audit.

alter table public.partner_order_history
  add column if not exists last_existence_verified_at timestamptz null,
  add column if not exists last_existence_result text null;

alter table public.partner_order_history
  drop constraint if exists partner_order_history_existence_result_check;
alter table public.partner_order_history
  add constraint partner_order_history_existence_result_check check (
    last_existence_result is null
    or last_existence_result in ('exists', 'deletion_marked', 'absent', 'unknown')
  );

create index if not exists partner_order_history_existence_priority_idx
  on public.partner_order_history(
    company_id,
    last_existence_verified_at nulls first,
    one_c_document_date desc,
    id
  );

alter table public.partner_order_history_sync_state
  add column if not exists incremental_date_watermark timestamptz null,
  add column if not exists integrity_state text not null default 'healthy',
  add column if not exists last_successful_full_audit_at timestamptz null,
  add column if not exists full_audit_requested_at timestamptz null;

alter table public.partner_order_history_sync_state
  drop constraint if exists partner_order_history_integrity_state_check;
alter table public.partner_order_history_sync_state
  add constraint partner_order_history_integrity_state_check check (
    integrity_state in ('healthy', 'audit_requested', 'audit_running', 'check_required', 'failed')
  );

update public.partner_order_history_sync_state state
set incremental_date_watermark = source.max_document_date
from (
  select company_id, max(one_c_document_date) as max_document_date
  from public.partner_order_history
  group by company_id
) source
where state.company_id = source.company_id
  and state.incremental_date_watermark is null;

alter table public.partner_order_history_events
  drop constraint if exists partner_order_history_events_type_check;
alter table public.partner_order_history_events
  add constraint partner_order_history_events_type_check check (event_type in (
    'imported', 'received_by_one_c', 'posted', 'became_unposted',
    'state_changed', 'delivery_date_changed', 'marked_for_deletion', 'sync_restored',
    'restored_from_1c', 'date_change_requested', 'date_change_approved',
    'date_change_rejected', 'date_change_cancelled', 'date_change_reflected'
  ));

create table public.partner_order_history_sync_runs (
  id uuid primary key,
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  counterparty_ref text not null,
  mode text not null check (mode in ('full', 'incremental')),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  cursor_start timestamptz null,
  cursor_end timestamptz null,
  overlap_start timestamptz null,
  headers_received integer not null default 0,
  new_orders integer not null default 0,
  changed_orders integer not null default 0,
  unchanged_orders integer not null default 0,
  line_requests integer not null default 0,
  existence_refs_checked integer not null default 0,
  exists_count integer not null default 0,
  deleted_count integer not null default 0,
  absent_count integer not null default 0,
  unknown_count integer not null default 0,
  one_c_request_count integer not null default 0,
  one_c_duration_ms integer not null default 0,
  db_writes integer not null default 0,
  total_duration_ms integer not null default 0,
  safe_error text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  created_at timestamptz not null default now()
);

create index partner_order_history_sync_runs_company_started_idx
  on public.partner_order_history_sync_runs(company_id, started_at desc);

alter table public.partner_order_history_sync_runs enable row level security;
revoke all on table public.partner_order_history_sync_runs from public, anon, authenticated;
grant select, insert, update on table public.partner_order_history_sync_runs to service_role;

create table public.partner_order_history_full_audits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  counterparty_ref text not null,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'succeeded', 'failed', 'integrity_failed')
  ),
  current_pass smallint not null default 1 check (current_pass in (1, 2)),
  next_skip integer not null default 0 check (next_skip >= 0),
  page_size integer not null default 100 check (page_size between 25 and 200),
  pass_one_count integer null,
  pass_two_count integer null,
  pass_one_set_hash text null,
  pass_two_set_hash text null,
  pass_one_version_hash text null,
  pass_two_version_hash text null,
  duplicate_count integer not null default 0,
  conflicting_version_count integer not null default 0,
  hidden_count integer not null default 0,
  requested_by uuid null references public.user_profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  lease_token uuid null,
  lease_expires_at timestamptz null,
  safe_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index partner_order_history_full_audits_active_company_idx
  on public.partner_order_history_full_audits(company_id)
  where status in ('queued', 'running');
create index partner_order_history_full_audits_queue_idx
  on public.partner_order_history_full_audits(status, requested_at, id);

create table public.partner_order_history_full_audit_pages (
  audit_id uuid not null references public.partner_order_history_full_audits(id) on delete cascade,
  pass_number smallint not null check (pass_number in (1, 2)),
  page_number integer not null check (page_number > 0),
  row_count integer not null check (row_count >= 0),
  page_fingerprint text not null,
  created_at timestamptz not null default now(),
  primary key (audit_id, pass_number, page_number),
  unique (audit_id, pass_number, page_fingerprint)
);

create table public.partner_order_history_full_audit_stage (
  audit_id uuid not null references public.partner_order_history_full_audits(id) on delete cascade,
  pass_number smallint not null check (pass_number in (1, 2)),
  external_1c_order_ref text not null,
  source_version text null,
  deletion_mark boolean not null,
  document_date timestamptz not null,
  page_number integer not null,
  created_at timestamptz not null default now(),
  primary key (audit_id, pass_number, external_1c_order_ref)
);

create table public.partner_order_history_full_audit_events (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.partner_order_history_full_audits(id) on delete cascade,
  event_type text not null check (event_type in (
    'requested', 'claimed', 'page_staged', 'pass_completed',
    'integrity_failed', 'completed', 'failed'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index partner_order_history_full_audit_events_audit_idx
  on public.partner_order_history_full_audit_events(audit_id, created_at, id);

alter table public.partner_order_history_full_audits enable row level security;
alter table public.partner_order_history_full_audit_pages enable row level security;
alter table public.partner_order_history_full_audit_stage enable row level security;
alter table public.partner_order_history_full_audit_events enable row level security;
revoke all on table public.partner_order_history_full_audits,
  public.partner_order_history_full_audit_pages,
  public.partner_order_history_full_audit_stage,
  public.partner_order_history_full_audit_events from public, anon, authenticated;
grant select, insert, update on table public.partner_order_history_full_audits to service_role;
grant select, insert on table public.partner_order_history_full_audit_pages,
  public.partner_order_history_full_audit_stage,
  public.partner_order_history_full_audit_events to service_role;

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
  result text;
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
  result := case
    when previous.status = 'running'
      and previous.updated_at <= now() - make_interval(secs => p_stale_after_seconds)
      then 'stale_lock_recovered'
    else 'acquired'
  end;

  insert into public.partner_order_history_sync_runs(
    id, company_id, counterparty_ref, mode, status, cursor_start, started_at
  ) values (
    p_sync_id, p_company_id, lower(p_counterparty_ref), p_mode, 'running',
    acquired.incremental_date_watermark, acquired.started_at
  ) on conflict (id) do nothing;
  return result;
end;
$$;

create or replace function public.upsert_partner_order_history_delta_batch(
  target_company_id uuid,
  target_sync_id uuid,
  target_synced_at timestamptz,
  target_orders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  updated_count integer := 0;
  hidden_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history synchronization is server-only.' using errcode = '42501';
  end if;
  if jsonb_typeof(target_orders) <> 'array' then
    raise exception 'Order history delta batch is invalid.' using errcode = '22023';
  end if;

  create temporary table order_history_delta_source on commit drop as
  select
    value as source,
    value->>'external_1c_order_ref' as external_ref,
    nullif(value->>'one_c_source_version', '') as source_version
  from jsonb_array_elements(target_orders);

  if exists (
    select 1 from order_history_delta_source
    where external_ref is null
    group by external_ref having count(*) > 1
  ) or exists (
    select 1 from order_history_delta_source
    group by external_ref having count(*) > 1
  ) then
    raise exception 'Order history delta contains duplicate references.' using errcode = '22023';
  end if;

  create temporary table order_history_delta_existing on commit drop as
  select history.*
  from public.partner_order_history history
  join order_history_delta_source source on source.external_ref = history.external_1c_order_ref
  for update of history;

  select count(*) into inserted_count
  from order_history_delta_source source
  left join order_history_delta_existing existing on existing.external_1c_order_ref = source.external_ref
  where existing.id is null;
  select count(*) into updated_count from order_history_delta_existing;

  insert into public.partner_order_history(
    company_id, portal_order_id, external_1c_order_ref, external_1c_order_number,
    one_c_posted, one_c_deletion_mark, one_c_state_ref, one_c_state_raw, one_c_state_code,
    one_c_document_date, one_c_delivery_date, one_c_source_version, one_c_last_synced_at,
    external_contract_ref, external_currency_ref, document_total, currency_code,
    origin_type, partner_visible, hidden_reason, position_count, total_unit_count
  )
  select
    target_company_id,
    portal.id,
    source.external_ref,
    coalesce(source.source->>'external_1c_order_number', ''),
    coalesce((source.source->>'one_c_posted')::boolean, false),
    coalesce((source.source->>'one_c_deletion_mark')::boolean, false),
    nullif(source.source->>'one_c_state_ref', ''),
    nullif(source.source->>'one_c_state_raw', ''),
    nullif(source.source->>'one_c_state_code', ''),
    (source.source->>'one_c_document_date')::timestamptz,
    nullif(source.source->>'one_c_delivery_date', '')::date,
    source.source_version,
    target_synced_at,
    nullif(source.source->>'external_contract_ref', ''),
    nullif(source.source->>'external_currency_ref', ''),
    coalesce((source.source->>'document_total')::numeric, 0),
    nullif(source.source->>'currency_code', ''),
    case when portal.id is not null then 'partner_platform' else 'unknown_1c_source' end,
    not coalesce((source.source->>'one_c_deletion_mark')::boolean, false),
    case when coalesce((source.source->>'one_c_deletion_mark')::boolean, false) then 'deleted_in_1c' else null end,
    coalesce((source.source->>'position_count')::integer, 0),
    coalesce((source.source->>'total_unit_count')::numeric, 0)
  from order_history_delta_source source
  left join lateral (
    select id from public.partner_orders
    where external_1c_ref = source.external_ref
    order by confirmed_at desc nulls last limit 1
  ) portal on true
  on conflict (external_1c_order_ref) do update set
    company_id = excluded.company_id,
    portal_order_id = coalesce(partner_order_history.portal_order_id, excluded.portal_order_id),
    external_1c_order_number = excluded.external_1c_order_number,
    one_c_posted = excluded.one_c_posted,
    one_c_deletion_mark = excluded.one_c_deletion_mark,
    one_c_state_ref = excluded.one_c_state_ref,
    one_c_state_raw = excluded.one_c_state_raw,
    one_c_state_code = excluded.one_c_state_code,
    one_c_document_date = excluded.one_c_document_date,
    one_c_delivery_date = excluded.one_c_delivery_date,
    one_c_source_version = excluded.one_c_source_version,
    one_c_last_synced_at = excluded.one_c_last_synced_at,
    external_contract_ref = excluded.external_contract_ref,
    external_currency_ref = excluded.external_currency_ref,
    document_total = excluded.document_total,
    currency_code = excluded.currency_code,
    partner_visible = excluded.partner_visible,
    hidden_reason = excluded.hidden_reason,
    position_count = excluded.position_count,
    total_unit_count = excluded.total_unit_count;

  create temporary table order_history_delta_saved on commit drop as
  select history.*
  from public.partner_order_history history
  join order_history_delta_source source on source.external_ref = history.external_1c_order_ref;

  insert into public.partner_order_history_events(
    order_history_id, event_type, occurred_at, current_value, fingerprint
  )
  select saved.id, 'imported', target_synced_at, saved.external_1c_order_ref,
    md5(saved.id::text || ':imported')
  from order_history_delta_saved saved
  left join order_history_delta_existing existing on existing.id = saved.id
  where existing.id is null
  on conflict (fingerprint) do nothing;

  insert into public.partner_order_history_events(
    order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint
  )
  select saved.id,
    case when saved.one_c_posted then 'posted' else 'became_unposted' end,
    target_synced_at, existing.one_c_posted::text, saved.one_c_posted::text,
    md5(saved.id::text || ':posted:' || saved.one_c_posted::text || ':' || target_synced_at::text)
  from order_history_delta_saved saved
  join order_history_delta_existing existing on existing.id = saved.id
  where existing.one_c_posted is distinct from saved.one_c_posted
  on conflict (fingerprint) do nothing;

  insert into public.partner_order_history_events(
    order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint
  )
  select saved.id, 'state_changed', target_synced_at,
    coalesce(existing.one_c_state_code, existing.one_c_state_raw, 'unknown'),
    coalesce(saved.one_c_state_code, saved.one_c_state_raw, 'unknown'),
    md5(saved.id::text || ':state:' || coalesce(saved.one_c_state_code, saved.one_c_state_raw, 'unknown') || ':' || target_synced_at::text)
  from order_history_delta_saved saved
  join order_history_delta_existing existing on existing.id = saved.id
  where existing.one_c_state_code is distinct from saved.one_c_state_code
     or existing.one_c_state_raw is distinct from saved.one_c_state_raw
  on conflict (fingerprint) do nothing;

  insert into public.partner_order_history_events(
    order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint
  )
  select saved.id, 'delivery_date_changed', target_synced_at,
    existing.one_c_delivery_date::text, saved.one_c_delivery_date::text,
    md5(saved.id::text || ':delivery:' || coalesce(saved.one_c_delivery_date::text, 'none') || ':' || target_synced_at::text)
  from order_history_delta_saved saved
  join order_history_delta_existing existing on existing.id = saved.id
  where existing.one_c_delivery_date is distinct from saved.one_c_delivery_date
  on conflict (fingerprint) do nothing;

  insert into public.partner_order_history_events(
    order_history_id, event_type, occurred_at, previous_value, current_value, internal_only, fingerprint
  )
  select saved.id, 'restored_from_1c', target_synced_at, existing.hidden_reason, 'visible', true,
    md5(saved.id::text || ':restored:' || target_sync_id::text)
  from order_history_delta_saved saved
  join order_history_delta_existing existing on existing.id = saved.id
  where not existing.partner_visible and saved.partner_visible
  on conflict (fingerprint) do nothing;

  select count(*) into hidden_count
  from order_history_delta_saved saved
  left join order_history_delta_existing existing on existing.id = saved.id
  where saved.one_c_deletion_mark and coalesce(existing.partner_visible, true);

  delete from public.partner_order_history_items item
  using order_history_delta_saved saved
  where item.order_history_id = saved.id;

  insert into public.partner_order_history_items(
    order_history_id, line_number, product_id, external_product_ref,
    external_characteristic_ref, product_name, sku, quantity, unit_price,
    line_total, currency_code
  )
  select
    saved.id,
    (item.value->>'line_number')::integer,
    product.id,
    item.value->>'external_product_ref',
    nullif(item.value->>'external_characteristic_ref', ''),
    product.name,
    product.sku,
    (item.value->>'quantity')::numeric,
    (item.value->>'unit_price')::numeric,
    (item.value->>'line_total')::numeric,
    saved.currency_code
  from order_history_delta_source source
  join order_history_delta_saved saved on saved.external_1c_order_ref = source.external_ref
  cross join lateral jsonb_array_elements(coalesce(source.source->'items', '[]'::jsonb)) item(value)
  left join public.catalog_products product
    on product.external_1c_id = item.value->>'external_product_ref';

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'hidden', hidden_count
  );
end;
$$;

create or replace function public.apply_partner_order_history_existence_batch(
  p_company_id uuid,
  p_sync_id uuid,
  p_verified_at timestamptz,
  p_results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  hidden integer := 0;
  restored integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history verification is server-only.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'Order history verification batch is invalid.' using errcode = '22023';
  end if;

  create temporary table order_history_existence_source on commit drop as
  select value->>'external_1c_order_ref' as external_ref, value->>'status' as status
  from jsonb_array_elements(p_results);
  if exists (select 1 from order_history_existence_source where status not in ('exists', 'deletion_marked', 'absent', 'unknown')) then
    raise exception 'Order history verification status is invalid.' using errcode = '22023';
  end if;

  create temporary table order_history_existence_existing on commit drop as
  select history.*
  from public.partner_order_history history
  join order_history_existence_source source on source.external_ref = history.external_1c_order_ref
  where history.company_id = p_company_id
  for update of history;

  select count(*) filter (where source.status in ('deletion_marked', 'absent') and existing.partner_visible),
    count(*) filter (where source.status = 'exists' and not existing.partner_visible)
  into hidden, restored
  from order_history_existence_existing existing
  join order_history_existence_source source on source.external_ref = existing.external_1c_order_ref;

  update public.partner_order_history history set
    last_existence_verified_at = p_verified_at,
    last_existence_result = source.status,
    one_c_deletion_mark = case
      when source.status = 'deletion_marked' then true
      when source.status = 'exists' then false
      else history.one_c_deletion_mark
    end,
    partner_visible = case
      when source.status = 'exists' then true
      when source.status in ('deletion_marked', 'absent') then false
      else history.partner_visible
    end,
    hidden_reason = case
      when source.status = 'exists' then null
      when source.status = 'deletion_marked' then 'deleted_in_1c'
      when source.status = 'absent' then 'missing_from_1c'
      else history.hidden_reason
    end
  from order_history_existence_source source
  where history.company_id = p_company_id
    and history.external_1c_order_ref = source.external_ref;
  get diagnostics affected = row_count;

  insert into public.partner_order_history_events(
    order_history_id, event_type, occurred_at, previous_value, current_value, internal_only, fingerprint
  )
  select existing.id, 'restored_from_1c', p_verified_at, existing.hidden_reason, 'visible', true,
    md5(existing.id::text || ':existence-restored:' || p_sync_id::text)
  from order_history_existence_existing existing
  join order_history_existence_source source on source.external_ref = existing.external_1c_order_ref
  where source.status = 'exists' and not existing.partner_visible
  on conflict (fingerprint) do nothing;

  return jsonb_build_object('updated', affected, 'hidden', hidden, 'restored', restored);
end;
$$;

create or replace function public.get_partner_order_history_existence_candidates(
  p_company_id uuid,
  p_limit integer default 25
)
returns setof public.partner_order_history
language sql
security definer
set search_path = public
as $$
  select history.*
  from public.partner_order_history history
  where auth.role() = 'service_role'
    and history.company_id = p_company_id
  order by
    case
      when history.partner_visible
        and not history.one_c_deletion_mark
        and (not history.one_c_posted or history.one_c_state_code is distinct from 'completed')
        then 0
      when history.last_existence_verified_at is null then 1
      when history.hidden_reason is not null then 2
      else 3
    end,
    history.last_existence_verified_at asc nulls first,
    history.one_c_document_date desc,
    history.id
  limit greatest(1, least(p_limit, 25));
$$;

create or replace function public.complete_partner_order_history_sync(
  p_company_id uuid,
  p_sync_id uuid,
  p_mode text,
  p_incremental_date_watermark timestamptz,
  p_metrics jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history synchronization is server-only.' using errcode = '42501';
  end if;
  update public.partner_order_history_sync_state set
    status = 'succeeded',
    active_sync_id = null,
    last_successful_full_sync_at = case when p_mode = 'full' then now() else last_successful_full_sync_at end,
    last_incremental_sync_at = case when p_mode = 'incremental' then now() else last_incremental_sync_at end,
    incremental_date_watermark = case
      when p_mode = 'incremental' and p_incremental_date_watermark is not null
        then greatest(coalesce(incremental_date_watermark, p_incremental_date_watermark), p_incremental_date_watermark)
      else incremental_date_watermark
    end,
    safe_error = null,
    records_received = coalesce((p_metrics->>'headers_received')::integer, 0),
    records_inserted = coalesce((p_metrics->>'new_orders')::integer, 0),
    records_updated = coalesce((p_metrics->>'changed_orders')::integer, 0),
    records_hidden = coalesce((p_metrics->>'hidden')::integer, 0),
    finished_at = now(),
    updated_at = now()
  where company_id = p_company_id and active_sync_id = p_sync_id;
  get diagnostics affected = row_count;
  if affected <> 1 then return false; end if;

  update public.partner_order_history_sync_runs set
    status = 'succeeded',
    cursor_end = p_incremental_date_watermark,
    overlap_start = nullif(p_metrics->>'overlap_start', '')::timestamptz,
    headers_received = coalesce((p_metrics->>'headers_received')::integer, 0),
    new_orders = coalesce((p_metrics->>'new_orders')::integer, 0),
    changed_orders = coalesce((p_metrics->>'changed_orders')::integer, 0),
    unchanged_orders = coalesce((p_metrics->>'unchanged_orders')::integer, 0),
    line_requests = coalesce((p_metrics->>'line_requests')::integer, 0),
    existence_refs_checked = coalesce((p_metrics->>'existence_refs_checked')::integer, 0),
    exists_count = coalesce((p_metrics->>'exists_count')::integer, 0),
    deleted_count = coalesce((p_metrics->>'deleted_count')::integer, 0),
    absent_count = coalesce((p_metrics->>'absent_count')::integer, 0),
    unknown_count = coalesce((p_metrics->>'unknown_count')::integer, 0),
    one_c_request_count = coalesce((p_metrics->>'one_c_request_count')::integer, 0),
    one_c_duration_ms = coalesce((p_metrics->>'one_c_duration_ms')::integer, 0),
    db_writes = coalesce((p_metrics->>'db_writes')::integer, 0),
    total_duration_ms = coalesce((p_metrics->>'total_duration_ms')::integer, 0),
    finished_at = now()
  where id = p_sync_id;
  return true;
end;
$$;

create or replace function public.enqueue_partner_order_history_full_audit(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_id uuid;
  counterparty text;
begin
  if auth.role() <> 'service_role' and not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'Order history integrity audit is restricted.' using errcode = '42501';
  end if;
  select external_1c_id into counterparty from public.partner_companies
  where id = p_company_id and status = 'active';
  if nullif(trim(counterparty), '') is null then
    raise exception 'Company has no active 1C mapping.' using errcode = '22023';
  end if;
  select id into audit_id from public.partner_order_history_full_audits
  where company_id = p_company_id and status in ('queued', 'running');
  if audit_id is not null then return audit_id; end if;

  insert into public.partner_order_history_full_audits(company_id, counterparty_ref, requested_by)
  values (p_company_id, lower(counterparty), auth.uid()) returning id into audit_id;
  insert into public.partner_order_history_full_audit_events(audit_id, event_type)
  values (audit_id, 'requested');
  insert into public.partner_order_history_sync_state(company_id, counterparty_ref, integrity_state, full_audit_requested_at)
  values (p_company_id, lower(counterparty), 'audit_requested', now())
  on conflict (company_id) do update set integrity_state = 'audit_requested', full_audit_requested_at = now(), updated_at = now();
  return audit_id;
end;
$$;

create or replace function public.claim_partner_order_history_full_audit()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare target public.partner_order_history_full_audits%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history integrity worker is server-only.' using errcode = '42501';
  end if;
  select * into target from public.partner_order_history_full_audits
  where status in ('queued', 'running')
    and (lease_expires_at is null or lease_expires_at <= now())
  order by requested_at, id
  for update skip locked limit 1;
  if target.id is null then return null; end if;
  update public.partner_order_history_full_audits set
    status = 'running', started_at = coalesce(started_at, now()),
    lease_token = gen_random_uuid(), lease_expires_at = now() + interval '5 minutes', updated_at = now()
  where id = target.id returning * into target;
  update public.partner_order_history_sync_state set integrity_state = 'audit_running', updated_at = now()
  where company_id = target.company_id;
  insert into public.partner_order_history_full_audit_events(audit_id, event_type, payload)
  values (target.id, 'claimed', jsonb_build_object('pass', target.current_pass, 'skip', target.next_skip));
  return to_jsonb(target);
end;
$$;

create or replace function public.stage_partner_order_history_full_audit_page(
  p_audit_id uuid,
  p_lease_token uuid,
  p_pass_number smallint,
  p_page_number integer,
  p_page_fingerprint text,
  p_rows jsonb,
  p_has_more boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare target public.partner_order_history_full_audits%rowtype;
declare duplicate_rows integer;
declare prior_duplicate_rows integer;
declare conflicting_rows integer;
declare prior_conflicting_rows integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history integrity worker is server-only.' using errcode = '42501';
  end if;
  select * into target from public.partner_order_history_full_audits
  where id = p_audit_id and status = 'running' and lease_token = p_lease_token
  for update;
  if target.id is null or target.current_pass <> p_pass_number then
    raise exception 'Order history audit lease is stale.' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Order history audit page is invalid.' using errcode = '22023';
  end if;
  select count(*) - count(distinct value->>'external_1c_order_ref') into duplicate_rows
  from jsonb_array_elements(p_rows);
  select count(*) into conflicting_rows
  from (
    select value->>'external_1c_order_ref'
    from jsonb_array_elements(p_rows)
    group by value->>'external_1c_order_ref'
    having count(distinct coalesce(value->>'source_version', '')) > 1
      or count(distinct coalesce(value->>'deletion_mark', '')) > 1
  ) conflict;
  select count(*),
    count(*) filter (
      where stage.source_version is distinct from nullif(row.value->>'source_version', '')
         or stage.deletion_mark is distinct from (row.value->>'deletion_mark')::boolean
    )
  into prior_duplicate_rows, prior_conflicting_rows
  from jsonb_array_elements(p_rows) row
  join public.partner_order_history_full_audit_stage stage
    on stage.audit_id = p_audit_id and stage.pass_number = p_pass_number
   and stage.external_1c_order_ref = row.value->>'external_1c_order_ref';
  if duplicate_rows > 0
    or prior_duplicate_rows > 0
    or exists (
      select 1 from public.partner_order_history_full_audit_pages
      where audit_id = p_audit_id and pass_number = p_pass_number and page_fingerprint = p_page_fingerprint
    ) then
    update public.partner_order_history_full_audits set
      status = 'integrity_failed',
      duplicate_count = duplicate_count + greatest(duplicate_rows + prior_duplicate_rows, 1),
      conflicting_version_count = conflicting_version_count + conflicting_rows + prior_conflicting_rows,
      safe_error = 'Duplicate order identity detected during deterministic audit.',
      lease_token = null, lease_expires_at = null, finished_at = now(), updated_at = now()
    where id = p_audit_id;
    update public.partner_order_history_sync_state set integrity_state = 'check_required', updated_at = now()
    where company_id = target.company_id;
    insert into public.partner_order_history_full_audit_events(audit_id, event_type, payload)
    values (p_audit_id, 'integrity_failed', jsonb_build_object('reason', 'duplicate_identity', 'page', p_page_number));
    return jsonb_build_object('status', 'integrity_failed');
  end if;

  insert into public.partner_order_history_full_audit_pages(
    audit_id, pass_number, page_number, row_count, page_fingerprint
  ) values (p_audit_id, p_pass_number, p_page_number, jsonb_array_length(p_rows), p_page_fingerprint);
  insert into public.partner_order_history_full_audit_stage(
    audit_id, pass_number, external_1c_order_ref, source_version, deletion_mark, document_date, page_number
  )
  select p_audit_id, p_pass_number, value->>'external_1c_order_ref',
    nullif(value->>'source_version', ''), (value->>'deletion_mark')::boolean,
    (value->>'document_date')::timestamptz, p_page_number
  from jsonb_array_elements(p_rows);
  update public.partner_order_history_full_audits set
    next_skip = case when p_has_more then next_skip + jsonb_array_length(p_rows) else next_skip end,
    lease_token = null, lease_expires_at = null, updated_at = now()
  where id = p_audit_id;
  insert into public.partner_order_history_full_audit_events(audit_id, event_type, payload)
  values (p_audit_id, 'page_staged', jsonb_build_object('pass', p_pass_number, 'page', p_page_number, 'rows', jsonb_array_length(p_rows)));
  return jsonb_build_object('status', case when p_has_more then 'continue' else 'pass_complete' end);
end;
$$;

create or replace function public.finish_partner_order_history_full_audit_pass(
  p_audit_id uuid,
  p_pass_number smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare target public.partner_order_history_full_audits%rowtype;
declare row_count integer;
declare set_hash text;
declare version_hash text;
declare hidden integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history integrity worker is server-only.' using errcode = '42501';
  end if;
  select * into target from public.partner_order_history_full_audits
  where id = p_audit_id and status = 'running' and current_pass = p_pass_number for update;
  if target.id is null then raise exception 'Order history audit state is invalid.' using errcode = 'PT409'; end if;
  select count(*),
    md5(coalesce(string_agg(external_1c_order_ref, '|' order by external_1c_order_ref), '')),
    md5(coalesce(string_agg(external_1c_order_ref || ':' || coalesce(source_version, '') || ':' || deletion_mark::text, '|' order by external_1c_order_ref), ''))
  into row_count, set_hash, version_hash
  from public.partner_order_history_full_audit_stage
  where audit_id = p_audit_id and pass_number = p_pass_number;

  if p_pass_number = 1 then
    update public.partner_order_history_full_audits set
      pass_one_count = row_count, pass_one_set_hash = set_hash, pass_one_version_hash = version_hash,
      current_pass = 2, next_skip = 0, updated_at = now()
    where id = p_audit_id;
    insert into public.partner_order_history_full_audit_events(audit_id, event_type, payload)
    values (p_audit_id, 'pass_completed', jsonb_build_object('pass', 1, 'count', row_count, 'set_hash', set_hash, 'version_hash', version_hash));
    return jsonb_build_object('status', 'second_pass_required', 'count', row_count);
  end if;

  update public.partner_order_history_full_audits set
    pass_two_count = row_count, pass_two_set_hash = set_hash, pass_two_version_hash = version_hash,
    updated_at = now()
  where id = p_audit_id returning * into target;
  if target.pass_one_count is distinct from row_count
    or target.pass_one_set_hash is distinct from set_hash
    or target.pass_one_version_hash is distinct from version_hash then
    update public.partner_order_history_full_audits set
      status = 'integrity_failed', safe_error = 'Two-pass order identity/version evidence did not match.',
      finished_at = now(), updated_at = now()
    where id = p_audit_id;
    update public.partner_order_history_sync_state set integrity_state = 'check_required', updated_at = now()
    where company_id = target.company_id;
    insert into public.partner_order_history_full_audit_events(audit_id, event_type, payload)
    values (p_audit_id, 'integrity_failed', jsonb_build_object('reason', 'second_pass_mismatch', 'pass_two_count', row_count));
    return jsonb_build_object('status', 'integrity_failed', 'hidden', 0);
  end if;

  update public.partner_order_history history set
    partner_visible = false,
    hidden_reason = 'missing_from_1c'
  where history.company_id = target.company_id
    and history.partner_visible
    and not exists (
      select 1 from public.partner_order_history_full_audit_stage stage
      where stage.audit_id = p_audit_id and stage.pass_number = 2
        and stage.external_1c_order_ref = history.external_1c_order_ref
    );
  get diagnostics hidden = row_count;
  update public.partner_order_history_full_audits set
    status = 'succeeded', hidden_count = hidden, finished_at = now(), updated_at = now()
  where id = p_audit_id;
  update public.partner_order_history_sync_state set
    integrity_state = 'healthy', last_successful_full_audit_at = now(), updated_at = now()
  where company_id = target.company_id;
  insert into public.partner_order_history_full_audit_events(audit_id, event_type, payload)
  values (p_audit_id, 'completed', jsonb_build_object('count', row_count, 'hidden', hidden));
  return jsonb_build_object('status', 'succeeded', 'hidden', hidden, 'count', row_count);
end;
$$;

create or replace function public.fail_partner_order_history_full_audit(
  p_audit_id uuid,
  p_lease_token uuid,
  p_safe_error text,
  p_integrity_failure boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare target public.partner_order_history_full_audits%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history integrity worker is server-only.' using errcode = '42501';
  end if;
  update public.partner_order_history_full_audits set
    status = case when p_integrity_failure then 'integrity_failed' else 'failed' end,
    safe_error = left(p_safe_error, 500), lease_token = null, lease_expires_at = null,
    finished_at = now(), updated_at = now()
  where id = p_audit_id and lease_token = p_lease_token
  returning * into target;
  if target.id is null then return false; end if;
  update public.partner_order_history_sync_state set
    integrity_state = case when p_integrity_failure then 'check_required' else 'failed' end,
    updated_at = now()
  where company_id = target.company_id;
  insert into public.partner_order_history_full_audit_events(audit_id, event_type, payload)
  values (p_audit_id, case when p_integrity_failure then 'integrity_failed' else 'failed' end,
    jsonb_build_object('safe_error', left(p_safe_error, 500)));
  return true;
end;
$$;

revoke all on function public.acquire_partner_order_history_sync(uuid, text, uuid, text, integer),
  public.upsert_partner_order_history_delta_batch(uuid, uuid, timestamptz, jsonb),
  public.apply_partner_order_history_existence_batch(uuid, uuid, timestamptz, jsonb),
  public.get_partner_order_history_existence_candidates(uuid, integer),
  public.complete_partner_order_history_sync(uuid, uuid, text, timestamptz, jsonb),
  public.enqueue_partner_order_history_full_audit(uuid),
  public.claim_partner_order_history_full_audit(),
  public.stage_partner_order_history_full_audit_page(uuid, uuid, smallint, integer, text, jsonb, boolean),
  public.finish_partner_order_history_full_audit_pass(uuid, smallint)
  ,public.fail_partner_order_history_full_audit(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.acquire_partner_order_history_sync(uuid, text, uuid, text, integer),
  public.upsert_partner_order_history_delta_batch(uuid, uuid, timestamptz, jsonb),
  public.apply_partner_order_history_existence_batch(uuid, uuid, timestamptz, jsonb),
  public.get_partner_order_history_existence_candidates(uuid, integer),
  public.complete_partner_order_history_sync(uuid, uuid, text, timestamptz, jsonb),
  public.claim_partner_order_history_full_audit(),
  public.stage_partner_order_history_full_audit_page(uuid, uuid, smallint, integer, text, jsonb, boolean),
  public.finish_partner_order_history_full_audit_pass(uuid, smallint)
  ,public.fail_partner_order_history_full_audit(uuid, uuid, text, boolean)
  to service_role;
grant execute on function public.enqueue_partner_order_history_full_audit(uuid) to authenticated, service_role;

comment on column public.partner_order_history_sync_state.incremental_date_watermark is
  'Highest 1C document Date fully published by a successful incremental discovery run. DataVersion is not a global cursor.';
comment on table public.partner_order_history_full_audits is
  'Governed asynchronous two-pass full identity audit. Routine manual and scheduled synchronization must not enqueue it.';
