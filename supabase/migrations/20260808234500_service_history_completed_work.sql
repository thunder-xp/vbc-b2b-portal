begin;

alter table public.one_c_service_history
  add column completed_work_summary text null,
  add column completed_work_checked_at timestamptz null;

alter table public.one_c_service_history
  add constraint one_c_service_history_completed_work_length_check
  check (completed_work_summary is null or char_length(completed_work_summary) between 1 and 8000);

alter table public.one_c_service_history_sync_runs
  drop constraint one_c_service_history_sync_runs_mode_check;

alter table public.one_c_service_history_sync_runs
  add constraint one_c_service_history_sync_runs_mode_check
  check (mode in ('initial', 'incremental', 'historical_reconciliation', 'completed_work_backfill'));

create or replace function public.claim_one_c_service_history_sync_v2(p_page_size integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target public.one_c_service_history_sync_runs;
  token uuid := gen_random_uuid();
  run_mode text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role access required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('one_c_service_history_sync'));
  update public.one_c_service_history_sync_runs
  set status = 'failed', safe_error_code = 'stale_lock', finished_at = now(), updated_at = now()
  where status = 'running' and locked_until < now() - interval '2 minutes';

  select * into target
  from public.one_c_service_history_sync_runs
  where status = 'running'
  limit 1
  for update;

  if found and target.locked_until > now() then
    return null;
  end if;

  if not found then
    if exists (select 1 from public.one_c_service_history where completed_work_checked_at is null) then
      run_mode := 'completed_work_backfill';
    else
      if exists (
        select 1 from public.one_c_service_history_sync_runs
        where status = 'succeeded' and finished_at > now() - interval '55 minutes'
      ) then
        return null;
      end if;
      run_mode := case
        when not exists (select 1 from public.one_c_service_history_sync_runs where status = 'succeeded') then 'initial'
        when not exists (
          select 1 from public.one_c_service_history_sync_runs
          where status = 'succeeded' and mode = 'historical_reconciliation'
            and finished_at > now() - interval '6 days'
        ) then 'historical_reconciliation'
        else 'incremental'
      end;
    end if;

    insert into public.one_c_service_history_sync_runs(mode, range_start, range_end, page_size)
    values (
      run_mode,
      case
        when run_mode = 'completed_work_backfill' then coalesce(
          (select min(source_document_date)::date from public.one_c_service_history),
          current_date - interval '60 months'
        )
        when run_mode in ('initial', 'historical_reconciliation') then current_date - interval '60 months'
        else current_date - interval '120 days'
      end,
      current_date,
      least(greatest(p_page_size, 1), 100)
    )
    returning * into target;
  end if;

  update public.one_c_service_history_sync_runs
  set lock_token = token, locked_until = now() + interval '4 minutes', updated_at = now()
  where id = target.id
  returning * into target;

  return jsonb_build_object(
    'runId', target.id,
    'lockToken', token,
    'mode', target.mode,
    'skip', target.current_skip,
    'pageSize', target.page_size,
    'rangeStart', target.range_start,
    'rangeEnd', target.range_end,
    'baseline', target.mode = 'initial'
  );
end;
$$;

create or replace function public.publish_one_c_service_history_page_v2(
  p_run_id uuid,
  p_lock_token uuid,
  p_skip integer,
  p_rows jsonb,
  p_page_complete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
  checked_count integer := 0;
  populated_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role access required.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 100 then
    raise exception 'Invalid service-history page.' using errcode = '22023';
  end if;

  result := public.publish_one_c_service_history_page(
    p_run_id,
    p_lock_token,
    p_skip,
    p_rows,
    p_page_complete
  );

  with source as (
    select
      lower(row->>'source_document_ref') as source_document_ref,
      nullif(btrim(left(coalesce(row->>'completed_work_summary', ''), 8000)), '') as completed_work_summary
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) row
  ), updated as (
    update public.one_c_service_history history
    set completed_work_summary = source.completed_work_summary,
        completed_work_checked_at = now(),
        updated_at = now()
    from source
    where history.source_document_ref = source.source_document_ref
      and history.last_seen_run_id = p_run_id
    returning history.completed_work_summary
  )
  select count(*), count(*) filter (where completed_work_summary is not null)
  into checked_count, populated_count
  from updated;

  return result || jsonb_build_object(
    'completedWorkChecked', checked_count,
    'completedWorkPopulated', populated_count
  );
end;
$$;

create or replace function public.get_partner_one_c_service_history(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
select case when public.has_permission(h.company_id, 'service.view') and h.partner_visible and h.is_active then jsonb_build_object(
  'id', h.id,
  'number', h.source_document_number,
  'date', h.source_document_date,
  'status', h.normalized_status,
  'sourceStatus', h.source_status,
  'product', case when p.id is not null and p.is_active and p.is_visible then jsonb_build_object(
    'id', p.id,
    'sku', p.sku,
    'name', p.name,
    'imageUrl', coalesce(p.image_source_url, p.image_url, image.url),
    'href', '/cabinet/catalog/' || p.slug
  ) else jsonb_build_object(
    'id', null,
    'sku', h.product_sku_snapshot,
    'name', h.product_name_snapshot,
    'imageUrl', null,
    'href', null
  ) end,
  'maskedSerial', h.masked_serial,
  'reportedFault', h.reported_fault,
  'completedWorkSummary', h.completed_work_summary,
  'resolution', h.partner_visible_resolution,
  'warrantyState', h.warranty_state_snapshot,
  'warrantyStartDate', h.warranty_start_date,
  'warrantyEndDate', h.warranty_end_date,
  'serviceCenter', h.service_center_snapshot,
  'updatedAt', h.updated_at,
  'events', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.event_type, 'status', e.normalized_status, 'occurredAt', e.occurred_at) order by e.occurred_at, e.id)
    from public.one_c_service_history_events e
    where e.service_history_id = h.id and e.event_type <> 'redetected'
  ), '[]'::jsonb)
) else null end
from public.one_c_service_history h
left join public.catalog_products p on p.id = h.product_id
left join lateral (
  select product_image.url
  from public.catalog_product_images product_image
  where product_image.product_id = p.id
  order by product_image.is_primary desc, product_image.sort_order, product_image.id
  limit 1
) image on true
where h.id = p_id;
$$;

create or replace function public.get_admin_one_c_service_history(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
select case when public.has_internal_permission('admin.service.view') then jsonb_build_object(
  'id', h.id,
  'number', h.source_document_number,
  'date', h.source_document_date,
  'status', h.normalized_status,
  'sourceStatus', h.source_status,
  'product', case when p.id is not null and p.is_active and p.is_visible then jsonb_build_object(
    'id', p.id,
    'sku', p.sku,
    'name', p.name,
    'imageUrl', p.image_url,
    'href', '/cabinet/catalog/' || p.slug
  ) else jsonb_build_object(
    'id', null,
    'sku', h.product_sku_snapshot,
    'name', h.product_name_snapshot,
    'imageUrl', null,
    'href', null
  ) end,
  'maskedSerial', h.masked_serial,
  'protectedSerial', h.protected_serial,
  'reportedFault', h.reported_fault,
  'completedWorkSummary', h.completed_work_summary,
  'resolution', h.partner_visible_resolution,
  'warrantyState', h.warranty_state_snapshot,
  'warrantyStartDate', h.warranty_start_date,
  'warrantyEndDate', h.warranty_end_date,
  'serviceCenter', h.service_center_snapshot,
  'updatedAt', h.updated_at,
  'events', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.event_type, 'status', e.normalized_status, 'occurredAt', e.occurred_at) order by e.occurred_at, e.id)
    from public.one_c_service_history_events e
    where e.service_history_id = h.id and e.event_type <> 'redetected'
  ), '[]'::jsonb)
) else null end
from public.one_c_service_history h
left join public.catalog_products p on p.id = h.product_id
where h.id = p_id;
$$;

revoke all on function public.claim_one_c_service_history_sync_v2(integer),
  public.publish_one_c_service_history_page_v2(uuid, uuid, integer, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_one_c_service_history_sync_v2(integer),
  public.publish_one_c_service_history_page_v2(uuid, uuid, integer, jsonb, boolean)
  to service_role;

revoke all on function public.get_partner_one_c_service_history(uuid),
  public.get_admin_one_c_service_history(uuid)
  from public, anon;
grant execute on function public.get_partner_one_c_service_history(uuid),
  public.get_admin_one_c_service_history(uuid)
  to authenticated;

commit;
