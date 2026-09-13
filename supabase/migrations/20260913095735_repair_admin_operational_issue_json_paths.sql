-- Repair text/jsonb operator precedence in commercial issue links.
create or replace function public.list_admin_operational_issues(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_health jsonb;
  v_result jsonb;
begin
  if not (
    public.has_internal_permission('admin.dashboard.view')
    or public.has_internal_permission('admin.integrations.view')
  ) then
    raise exception 'Operational issue access is not allowed.' using errcode = '42501';
  end if;

  v_health := private.get_admin_commercial_health(p_now);

  with commercial_issues as (
    select health.value || jsonb_build_object(
      'id', format('%s:%s', health.value->>'key', coalesce(health.value->>'runId', md5(coalesce(health.value->>'lastSeenAt', 'never')))),
      'domain', health.value->>'key',
      'severity', case when health.value->>'status' = 'FAILED' then 'HIGH' else 'MEDIUM' end,
      'status', 'ACTIVE',
      'healthStatus', health.value->>'status',
      'startedAt', health.value->>'lastAttemptAt',
      'detailHref', format('/admin/operations/issues/%s:%s', health.value->>'key', coalesce(health.value->>'runId', md5(coalesce(health.value->>'lastSeenAt', 'never'))))
    ) issue
    from jsonb_array_elements(v_health) health(value)
    where health.value->>'status' in ('FAILED', 'DEGRADED', 'STALE', 'NEVER_SYNCED')
  ), operational_issues as (
    select jsonb_build_object(
      'id', 'orders:failed-export', 'domain', 'orders', 'severity', 'HIGH', 'status', 'ACTIVE',
      'healthStatus', 'FAILED', 'startedAt', min(orders.created_at), 'lastSeenAt', max(orders.updated_at),
      'lastSuccessAt', null, 'operation', 'order_export', 'stage', 'export_or_reconciliation',
      'safeErrorCode', 'ORDER_EXPORT_FAILED', 'safeMessage', 'Один или несколько заказов требуют безопасной сверки с 1С.',
      'runId', null, 'correlationId', null, 'recoverability', 'MANUAL_REQUIRED',
      'automaticRetryState', 'NOT_CONFIGURED', 'affectedScope', count(*)::text || ' orders',
      'currentDataState', 'Подтверждённые заказы не изменены; затронуты только перечисленные ошибки экспорта.',
      'received', count(*), 'staged', 0, 'published', 0, 'durationMs', null,
      'sourceCalls', 0, 'retryCount', 0, 'technicalCode', null,
      'historyHref', '/admin/orders?filter=failed_export',
      'detailHref', '/admin/operations/issues/orders:failed-export'
    ) issue
    from public.partner_orders orders
    where orders.integration_status in ('failed', 'reconciliation_required')
    having count(*) > 0

    union all

    select jsonb_build_object(
      'id', 'finance:failed', 'domain', 'finance', 'severity', 'HIGH', 'status', 'ACTIVE',
      'healthStatus', 'FAILED', 'startedAt', min(state.last_attempt_at), 'lastSeenAt', max(state.updated_at),
      'lastSuccessAt', max(state.last_success_at), 'operation', 'finance_sync', 'stage', 'company_finance_publication',
      'safeErrorCode', coalesce(max(state.last_error_code), 'FINANCE_SYNC_FAILED'),
      'safeMessage', 'Финансовая синхронизация одной или нескольких компаний не завершилась.',
      'runId', null, 'correlationId', null, 'recoverability', 'MANUAL_AVAILABLE',
      'automaticRetryState', 'SCHEDULED', 'affectedScope', count(*)::text || ' companies',
      'currentDataState', 'Последние подтверждённые финансовые снимки остаются активными.',
      'received', coalesce(sum(state.received_count), 0), 'staged', 0,
      'published', coalesce(sum(state.published_count), 0), 'durationMs', max(state.last_duration_ms),
      'sourceCalls', 0, 'retryCount', 0, 'technicalCode', null,
      'historyHref', '/admin/finance', 'detailHref', '/admin/operations/issues/finance:failed'
    )
    from public.partner_finance_sync_state state
    where state.status = 'failed'
    having count(*) > 0

    union all

    select jsonb_build_object(
      'id', 'finance:mapping-missing', 'domain', 'finance', 'severity', 'MEDIUM', 'status', 'ACTIVE',
      'healthStatus', 'DEGRADED', 'startedAt', min(state.last_attempt_at), 'lastSeenAt', max(state.updated_at),
      'lastSuccessAt', max(state.last_success_at), 'operation', 'finance_sync', 'stage', 'company_mapping',
      'safeErrorCode', 'COMPANY_MAPPING_MISSING', 'safeMessage', 'Для одной или нескольких компаний отсутствует подтверждённое сопоставление с 1С.',
      'runId', null, 'correlationId', null, 'recoverability', 'MANUAL_REQUIRED',
      'automaticRetryState', 'NOT_CONFIGURED', 'affectedScope', count(*)::text || ' companies',
      'currentDataState', 'Данные других корректно сопоставленных компаний не затронуты.',
      'received', 0, 'staged', 0, 'published', 0, 'durationMs', null,
      'sourceCalls', 0, 'retryCount', 0, 'technicalCode', null,
      'historyHref', '/admin/companies?filter=missing_mapping',
      'detailHref', '/admin/operations/issues/finance:mapping-missing'
    )
    from public.partner_finance_sync_state state
    where state.status = 'mapping_missing'
    having count(*) > 0
  ), combined as (
    select issue from commercial_issues
    union all
    select issue from operational_issues
  )
  select coalesce(jsonb_agg(issue order by
    case issue->>'severity' when 'HIGH' then 1 else 2 end,
    issue->>'lastSeenAt' desc nulls last,
    issue->>'id'
  ), '[]'::jsonb)
  into v_result
  from combined;

  return v_result;
end;
$$;
