begin;

create table if not exists public.internal_sync_action_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  domain text not null check (domain in (
    'rates', 'catalog', 'prices', 'stock', 'commercial',
    'active_orders', 'order_history', 'finance'
  )),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  result_status text not null check (
    result_status in ('started', 'completed', 'locked', 'failed')
  ),
  run_id text null check (
    run_id is null or char_length(run_id) between 1 and 100
  ),
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists internal_sync_action_audit_created_idx
  on public.internal_sync_action_audit_events(created_at desc);

alter table public.internal_sync_action_audit_events enable row level security;
revoke all on public.internal_sync_action_audit_events
  from public, anon, authenticated;
grant select on public.internal_sync_action_audit_events to authenticated;

drop policy if exists "Internal auditors select sync actions"
  on public.internal_sync_action_audit_events;
create policy "Internal auditors select sync actions"
on public.internal_sync_action_audit_events
for select to authenticated
using (
  public.has_internal_permission('admin.audit.view')
  or public.has_internal_permission('admin.integrations.view')
);

create or replace function public.record_internal_sync_action(
  p_domain text,
  p_reason text,
  p_result_status text,
  p_run_id text,
  p_duration_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_id uuid;
begin
  if not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'Manual synchronization is not allowed.'
      using errcode = '42501';
  end if;

  insert into public.internal_sync_action_audit_events(
    actor_user_id, domain, reason, result_status, run_id, duration_ms
  ) values (
    auth.uid(), p_domain, btrim(p_reason), p_result_status,
    nullif(btrim(coalesce(p_run_id, '')), ''), p_duration_ms
  )
  returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.record_internal_sync_action(
  text, text, text, text, integer
) from public, anon;
grant execute on function public.record_internal_sync_action(
  text, text, text, text, integer
) to authenticated;

create or replace function public.get_admin_integration_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Integration state access is not allowed.'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'domains', jsonb_build_array(
      coalesce((
        select jsonb_build_object(
          'domain', 'catalog', 'status', status,
          'lastAttemptAt', last_started_at,
          'lastSuccessAt', last_successful_sync_at,
          'durationMs', duration_ms,
          'received', coalesce(products_received, 0),
          'published', coalesce(products_upserted, 0),
          'excluded', coalesce(rows_deactivated, 0),
          'safeErrorCode', error_category,
          'runId', active_sync_id
        )
        from public.catalog_sync_state limit 1
      ), public.empty_admin_integration_state('catalog')),
      coalesce((
        select jsonb_build_object(
          'domain', 'prices', 'status', status,
          'lastAttemptAt', started_at,
          'lastSuccessAt', last_successful_sync_at,
          'durationMs', case when finished_at is null then null else
            greatest(0, extract(epoch from (finished_at - started_at)) * 1000)::bigint end,
          'received', coalesce(price_rows_received, 0),
          'published', coalesce(prices_published, 0),
          'excluded', coalesce(unmatched_products, 0) + coalesce(unknown_price_types, 0),
          'safeErrorCode', coalesce(database_error_code, error_category),
          'runId', active_sync_id
        )
        from public.price_sync_state limit 1
      ), public.empty_admin_integration_state('prices')),
      coalesce((
        select jsonb_build_object(
          'domain', 'stock', 'status', status,
          'lastAttemptAt', started_at,
          'lastSuccessAt', last_successful_sync_at,
          'durationMs', case when finished_at is null then null else
            greatest(0, extract(epoch from (finished_at - started_at)) * 1000)::bigint end,
          'received', coalesce(physical_rows, 0) + coalesce(reserved_rows, 0)
            + coalesce(incoming_rows, 0),
          'published', coalesce(rows_published, 0),
          'excluded', coalesce(products_unmatched, 0),
          'safeErrorCode', coalesce(database_error_code, error_category),
          'runId', active_sync_id
        )
        from public.stock_sync_state limit 1
      ), public.empty_admin_integration_state('stock')),
      coalesce((
        select jsonb_build_object(
          'domain', 'arrivals', 'status', status,
          'lastAttemptAt', started_at,
          'lastSuccessAt', last_successful_sync_at,
          'durationMs', null,
          'received', coalesce(supplier_balance_rows, 0),
          'published', coalesce(supplier_arrivals_published, 0),
          'excluded', coalesce(supplier_state_excluded, 0)
            + coalesce(supplier_missing_date_excluded, 0)
            + coalesce(supplier_overdue_excluded, 0),
          'safeErrorCode', coalesce(database_error_code, error_category),
          'runId', active_sync_id
        )
        from public.stock_sync_state limit 1
      ), public.empty_admin_integration_state('arrivals')),
      coalesce((
        select jsonb_build_object(
          'domain', 'rates', 'status', 'succeeded',
          'lastAttemptAt', published_at, 'lastSuccessAt', published_at,
          'durationMs', null, 'received', 1, 'published', 1, 'excluded', 0,
          'safeErrorCode', null, 'runId', id::text
        )
        from public.commercial_exchange_rates
        where is_published = true and is_active = true
        order by published_at desc limit 1
      ), public.empty_admin_integration_state('rates')),
      coalesce((
        select jsonb_build_object(
          'domain', 'order_history',
          'status', case
            when bool_or(status = 'running') then 'running'
            when bool_or(status = 'failed') then 'failed'
            when max(last_successful_full_sync_at) is not null then 'succeeded'
            else 'never_run' end,
          'lastAttemptAt', max(started_at),
          'lastSuccessAt', max(last_successful_full_sync_at),
          'durationMs', null,
          'received', coalesce(sum(records_received), 0),
          'published', coalesce(sum(records_inserted + records_updated), 0),
          'excluded', coalesce(sum(records_hidden), 0),
          'safeErrorCode', max(safe_error) filter (where status = 'failed'),
          'runId', max(active_sync_id::text) filter (where status = 'running')
        )
        from public.partner_order_history_sync_state
      ), public.empty_admin_integration_state('order_history')),
      coalesce((
        select jsonb_build_object(
          'domain', 'finance',
          'status', case
            when bool_or(status = 'running') then 'running'
            when bool_or(status = 'failed') then 'failed'
            when max(last_success_at) is not null then 'succeeded'
            else 'never_run' end,
          'lastAttemptAt', max(last_attempt_at),
          'lastSuccessAt', max(last_success_at),
          'durationMs', max(last_duration_ms),
          'received', coalesce(sum(received_count), 0),
          'published', coalesce(sum(published_count), 0),
          'excluded', coalesce(sum(excluded_deleted_count), 0),
          'safeErrorCode', max(last_error_code) filter (where status = 'failed'),
          'runId', null
        )
        from public.partner_finance_sync_state
      ), public.empty_admin_integration_state('finance'))
    ),
    'locks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'scope', scope, 'runId', run_id,
        'acquiredAt', acquired_at, 'expiresAt', expires_at
      ) order by scope)
      from public.integration_sync_locks where expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.empty_admin_integration_state(p_domain text)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'domain', p_domain, 'status', 'never_run',
    'lastAttemptAt', null, 'lastSuccessAt', null, 'durationMs', null,
    'received', 0, 'published', 0, 'excluded', 0,
    'safeErrorCode', null, 'runId', null
  )
$$;

revoke all on function public.empty_admin_integration_state(text)
  from public, anon, authenticated;
revoke all on function public.get_admin_integration_center() from public, anon;
grant execute on function public.get_admin_integration_center() to authenticated;

create or replace function public.list_admin_sync_jobs(
  p_domain text default null,
  p_status text default null,
  p_trigger text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  normalized_page integer := greatest(coalesce(p_page, 1), 1);
  normalized_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Integration job history access is not allowed.'
      using errcode = '42501';
  end if;

  return (
    with filtered as (
      select event.id::text run_id, event.domain, event.result_status status,
        'manual'::text trigger_type,
        coalesce(profile.email, profile.full_name) actor,
        event.created_at started_at, event.created_at finished_at,
        event.duration_ms, 0::bigint received, 0::bigint published,
        0::bigint excluded, null::text safe_error_code,
        count(*) over() total_count
      from public.internal_sync_action_audit_events event
      left join public.user_profiles profile on profile.id = event.actor_user_id
      where (p_domain is null or event.domain = p_domain)
        and (p_status is null or event.result_status = p_status)
        and (p_trigger is null or p_trigger = 'manual')
        and (p_from is null or event.created_at >= p_from)
        and (p_to is null or event.created_at < p_to)
    ),
    page_rows as (
      select * from filtered order by started_at desc, run_id desc
      limit normalized_size offset (normalized_page - 1) * normalized_size
    )
    select jsonb_build_object(
      'items', coalesce(jsonb_agg(
        to_jsonb(page_rows) - 'total_count' order by started_at desc
      ), '[]'::jsonb),
      'total', coalesce(max(total_count), 0),
      'page', normalized_page,
      'pageSize', normalized_size
    )
    from page_rows
  );
end;
$$;

revoke all on function public.list_admin_sync_jobs(
  text, text, text, timestamptz, timestamptz, integer, integer
) from public, anon;
grant execute on function public.list_admin_sync_jobs(
  text, text, text, timestamptz, timestamptz, integer, integer
) to authenticated;

create or replace function public.list_admin_integration_incidents()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Integration incident access is not allowed.'
      using errcode = '42501';
  end if;

  return (
    with incidents as (
      select 'high' severity, 'prices' domain, 'PRICE_SYNC_FAILED' code,
        started_at first_at, updated_at latest_at, 1::bigint occurrence_count,
        'Review the failed job and retry price synchronization.' action,
        '/admin/integrations/jobs?domain=prices&status=failed' href
      from public.price_sync_state where status = 'failed'
      union all
      select 'high', 'stock', 'STOCK_SYNC_FAILED', started_at, updated_at, 1,
        'Review the failed stage and retry inventory synchronization.',
        '/admin/integrations/jobs?domain=stock&status=failed'
      from public.stock_sync_state where status = 'failed'
      union all
      select 'medium', 'finance', 'FINANCE_SYNC_FAILED',
        min(last_attempt_at), max(updated_at), count(*),
        'Review company mapping and finance synchronization.', '/admin/finance'
      from public.partner_finance_sync_state
      where status = 'failed' having count(*) > 0
      union all
      select 'medium', 'companies', 'COMPANY_MAPPING_MISSING',
        min(created_at), max(updated_at), count(*),
        'Complete and validate the company ERP mapping.',
        '/admin/companies?filter=missing_mapping'
      from public.partner_companies
      where status = 'active' and external_1c_id is null having count(*) > 0
      union all
      select 'high', 'orders', 'ORDER_EXPORT_FAILED',
        min(created_at), max(updated_at), count(*),
        'Review failed order exports and reconcile them safely.',
        '/admin/orders?filter=failed_export'
      from public.partner_orders
      where integration_status in ('failed', 'reconciliation_required')
      having count(*) > 0
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'severity', severity, 'domain', domain, 'code', code,
      'firstOccurrenceAt', first_at, 'latestOccurrenceAt', latest_at,
      'count', occurrence_count, 'recommendedAction', action, 'href', href
    ) order by case severity when 'high' then 1 else 2 end, latest_at desc),
    '[]'::jsonb)
    from incidents
  );
end;
$$;

revoke all on function public.list_admin_integration_incidents()
  from public, anon;
grant execute on function public.list_admin_integration_incidents()
  to authenticated;

commit;
