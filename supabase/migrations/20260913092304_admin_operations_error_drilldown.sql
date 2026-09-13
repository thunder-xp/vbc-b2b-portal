begin;

alter table public.catalog_sync_state
  add column if not exists last_failed_sync_id uuid null;

comment on column public.catalog_sync_state.last_failed_sync_id is
  'Stable correlation identity for the latest failed governed catalog synchronization.';

create or replace function private.get_admin_commercial_health(
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
  v_catalog jsonb;
  v_prices jsonb;
  v_stock jsonb;
  v_arrivals jsonb;
  v_rates jsonb;
begin
  select jsonb_build_object(
    'key', 'catalog',
    'status', case
      when state.status = 'failed' then 'FAILED'
      when state.status in ('running', 'queued') then 'RUNNING'
      when state.status = 'never_run' or state.last_successful_sync_at is null then 'NEVER_SYNCED'
      when state.last_successful_sync_at < p_now - interval '36 hours' then 'STALE'
      else 'HEALTHY'
    end,
    'lastAttemptAt', state.last_started_at,
    'lastSuccessAt', state.last_successful_sync_at,
    'lastSeenAt', state.updated_at,
    'operation', 'catalog_sync',
    'stage', coalesce(state.failed_stage, case when state.status in ('running', 'queued') then 'synchronization' else 'completed' end),
    'safeErrorCode', coalesce(state.database_error_code, state.error_category),
    'safeMessage', case
      when state.status = 'failed' then 'Синхронизация каталога не завершилась. Последняя подтверждённая публикация не заменена.'
      when state.status = 'never_run' or state.last_successful_sync_at is null then 'Синхронизация каталога ещё не выполнялась.'
      when state.last_successful_sync_at < p_now - interval '36 hours' then 'Последняя успешная синхронизация каталога старше допустимого интервала.'
      else null
    end,
    'runId', coalesce(state.last_failed_sync_id, state.active_sync_id)::text,
    'correlationId', coalesce(state.last_failed_sync_id, state.active_sync_id)::text,
    'recoverability', case when state.status = 'failed' then 'MANUAL_AVAILABLE' else 'AUTOMATIC' end,
    'automaticRetryState', case when state.status in ('running', 'queued') then 'RUNNING' else 'SCHEDULED' end,
    'affectedScope', 'catalog',
    'currentDataState', case
      when state.last_successful_sync_at is null then 'Подтверждённая публикация каталога отсутствует.'
      else 'Последняя подтверждённая публикация каталога остаётся активной.'
    end,
    'received', coalesce(state.products_received, 0),
    'staged', coalesce(state.products_upserted, 0),
    'published', coalesce(state.products_upserted, 0),
    'durationMs', state.duration_ms,
    'sourceCalls', coalesce(state.pages_processed, 0),
    'retryCount', 0,
    'technicalCode', state.database_error_code,
    'historyHref', '/admin/integrations/jobs?domain=catalog'
  ) into v_catalog
  from public.catalog_sync_state state
  where state.id = 'daily_catalog';

  select jsonb_build_object(
    'key', 'prices',
    'status', case
      when state.status = 'failed' then 'FAILED'
      when state.status in ('running', 'queued') then 'RUNNING'
      when state.status = 'never_run' or state.last_successful_sync_at is null then 'NEVER_SYNCED'
      when state.last_successful_sync_at < p_now - interval '36 hours' then 'STALE'
      else 'HEALTHY'
    end,
    'lastAttemptAt', state.started_at,
    'lastSuccessAt', state.last_successful_sync_at,
    'lastSeenAt', state.updated_at,
    'operation', 'price_sync',
    'stage', coalesce(state.failed_stage, state.current_stage, 'not_started'),
    'safeErrorCode', coalesce(state.database_error_code, state.error_category),
    'safeMessage', case
      when state.status = 'failed' then coalesce(nullif(left(state.safe_error, 300), ''), 'Публикация цен не завершилась за допустимое время.')
      when state.status = 'never_run' or state.last_successful_sync_at is null then 'Синхронизация цен ещё не выполнялась.'
      when state.last_successful_sync_at < p_now - interval '36 hours' then 'Последняя успешная синхронизация цен старше допустимого интервала.'
      else null
    end,
    'runId', coalesce(state.last_failed_sync_id, state.active_sync_id)::text,
    'correlationId', coalesce(state.last_failed_sync_id, state.active_sync_id)::text,
    'recoverability', case when state.status = 'failed' then 'MANUAL_AVAILABLE' else 'AUTOMATIC' end,
    'automaticRetryState', case when state.status in ('running', 'queued') then 'RUNNING' else 'SCHEDULED' end,
    'affectedScope', 'partner_prices',
    'currentDataState', case
      when state.last_successful_sync_at is null then 'Подтверждённая публикация партнёрских цен отсутствует.'
      else 'Последняя подтверждённая публикация партнёрских цен остаётся активной.'
    end,
    'received', coalesce(state.price_rows_received, state.rows_scanned, 0),
    'staged', coalesce(state.rows_staged, 0),
    'published', coalesce(state.prices_published, 0),
    'durationMs', case when state.finished_at is null or state.started_at is null then null else greatest(0, extract(epoch from (state.finished_at - state.started_at)) * 1000)::bigint end,
    'sourceCalls', coalesce(state.odata_request_count, 0),
    'retryCount', coalesce(state.retry_count, 0),
    'technicalCode', state.database_error_code,
    'failedPage', state.failed_page,
    'historyHref', '/admin/integrations/jobs?domain=prices'
  ) into v_prices
  from public.price_sync_state state
  where state.id = 'product_prices';

  select jsonb_build_object(
    'key', 'stock',
    'status', case
      when state.status = 'failed' then 'FAILED'
      when state.status in ('running', 'queued') then 'RUNNING'
      when state.status = 'never_run' or state.last_successful_sync_at is null then 'NEVER_SYNCED'
      when state.last_successful_sync_at < p_now - interval '36 hours' then 'STALE'
      else 'HEALTHY'
    end,
    'lastAttemptAt', state.started_at,
    'lastSuccessAt', state.last_successful_sync_at,
    'lastSeenAt', state.updated_at,
    'operation', 'stock_sync',
    'stage', coalesce(state.failed_stage, state.current_stage, 'not_started'),
    'safeErrorCode', coalesce(state.database_error_code, state.error_category),
    'safeMessage', case
      when state.status = 'failed' then coalesce(nullif(left(state.safe_error, 300), ''), 'Синхронизация остатков не завершилась.')
      when state.status = 'never_run' or state.last_successful_sync_at is null then 'Синхронизация остатков ещё не выполнялась.'
      when state.last_successful_sync_at < p_now - interval '36 hours' then 'Последняя успешная синхронизация остатков старше допустимого интервала.'
      else null
    end,
    'runId', coalesce(state.last_failed_sync_id, state.active_sync_id)::text,
    'correlationId', coalesce(state.last_failed_sync_id, state.active_sync_id)::text,
    'recoverability', case when state.status = 'failed' then 'MANUAL_AVAILABLE' else 'AUTOMATIC' end,
    'automaticRetryState', case when state.status in ('running', 'queued') then 'RUNNING' else 'SCHEDULED' end,
    'affectedScope', 'exact_stock',
    'currentDataState', case
      when state.last_successful_sync_at is null then 'Подтверждённый снимок остатков отсутствует.'
      else 'Последний подтверждённый снимок остатков остаётся активным.'
    end,
    'received', coalesce(state.physical_rows, 0) + coalesce(state.reserved_rows, 0) + coalesce(state.incoming_rows, 0),
    'staged', coalesce(state.products_matched, 0),
    'published', coalesce(state.rows_published, 0),
    'durationMs', case when state.finished_at is null or state.started_at is null then null else greatest(0, extract(epoch from (state.finished_at - state.started_at)) * 1000)::bigint end,
    'sourceCalls', coalesce(state.pages_processed, 0),
    'retryCount', 0,
    'technicalCode', state.database_error_code,
    'failedPage', state.failed_page,
    'historyHref', '/admin/integrations/jobs?domain=stock'
  ) into v_stock
  from public.stock_sync_state state
  where state.id = 'exact_stock';

  select jsonb_build_object(
    'key', 'arrivals',
    'status', case
      when state.status = 'failed' then 'FAILED'
      when state.status in ('running', 'queued') then 'RUNNING'
      when state.status = 'never_run' or state.last_successful_sync_at is null then 'NEVER_SYNCED'
      when state.last_successful_sync_at < p_now - interval '7 days' then 'STALE'
      when coalesce(state.supplier_arrivals_published, 0) = 0 then 'SUCCESS_EMPTY'
      else 'HEALTHY'
    end,
    'lastAttemptAt', state.started_at,
    'lastSuccessAt', state.last_successful_sync_at,
    'lastSeenAt', state.updated_at,
    'operation', 'supplier_arrivals_sync',
    'stage', coalesce(state.failed_stage, state.current_stage, 'not_started'),
    'safeErrorCode', coalesce(state.database_error_code, state.error_category),
    'safeMessage', case
      when state.status = 'failed' then coalesce(nullif(left(state.safe_error, 300), ''), 'Синхронизация поступлений не завершилась.')
      when state.status = 'never_run' or state.last_successful_sync_at is null then 'Синхронизация поступлений ещё не выполнялась.'
      when state.last_successful_sync_at < p_now - interval '7 days' then 'Последняя успешная синхронизация поступлений старше допустимого интервала.'
      else null
    end,
    'runId', coalesce(state.last_failed_sync_id, state.active_sync_id)::text,
    'correlationId', coalesce(state.last_failed_sync_id, state.active_sync_id)::text,
    'recoverability', case when state.status = 'failed' then 'MANUAL_AVAILABLE' else 'AUTOMATIC' end,
    'automaticRetryState', case when state.status in ('running', 'queued') then 'RUNNING' else 'SCHEDULED' end,
    'affectedScope', 'supplier_arrivals',
    'currentDataState', case
      when state.last_successful_sync_at is null then 'Подтверждённая синхронизация поступлений отсутствует.'
      when coalesce(state.supplier_arrivals_published, 0) = 0 then 'Синхронизация завершена успешно; актуальных поступлений в 1С нет.'
      else 'Последняя подтверждённая публикация поступлений остаётся активной.'
    end,
    'received', coalesce(state.supplier_balance_rows, 0),
    'staged', coalesce(state.supplier_documents_resolved, 0),
    'published', coalesce(state.supplier_arrivals_published, 0),
    'durationMs', case when state.finished_at is null or state.started_at is null then null else greatest(0, extract(epoch from (state.finished_at - state.started_at)) * 1000)::bigint end,
    'sourceCalls', coalesce(state.pages_processed, 0),
    'retryCount', 0,
    'technicalCode', state.database_error_code,
    'failedPage', state.failed_page,
    'historyHref', '/admin/integrations/jobs?domain=stock'
  ) into v_arrivals
  from public.stock_sync_state state
  where state.id = 'exact_stock';

  with latest_rate as (
    select rate.id, rate.published_at, rate.updated_at
    from public.commercial_exchange_rates rate
    where rate.is_published = true and rate.is_active = true
    order by rate.published_at desc
    limit 1
  ), latest_action as (
    select event.id, event.result_status, event.run_id, event.created_at, event.duration_ms
    from public.internal_sync_action_audit_events event
    where event.domain = 'rates'
    order by event.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'key', 'rates',
    'status', case
      when action.result_status = 'failed' and (rate.published_at is null or action.created_at > rate.published_at) then 'FAILED'
      when action.result_status = 'started' and (rate.published_at is null or action.created_at > rate.published_at) then 'RUNNING'
      when rate.published_at is null then 'NEVER_SYNCED'
      when rate.published_at < p_now - interval '7 days' then 'STALE'
      else 'HEALTHY'
    end,
    'lastAttemptAt', action.created_at,
    'lastSuccessAt', rate.published_at,
    'lastSeenAt', coalesce(action.created_at, rate.updated_at),
    'operation', 'commercial_rate_sync',
    'stage', case when action.result_status = 'failed' then 'publication' else 'completed' end,
    'safeErrorCode', case when action.result_status = 'failed' then 'COMMERCIAL_RATE_SYNC_FAILED' else null end,
    'safeMessage', case
      when action.result_status = 'failed' then 'Обновление коммерческого курса не завершилось.'
      when rate.published_at is null then 'Синхронизация коммерческого курса ещё не выполнялась.'
      when rate.published_at < p_now - interval '7 days' then 'Последний подтверждённый коммерческий курс старше допустимого интервала.'
      else null
    end,
    'runId', coalesce(action.run_id, action.id::text),
    'correlationId', coalesce(action.run_id, action.id::text),
    'recoverability', case when action.result_status = 'failed' then 'MANUAL_AVAILABLE' else 'AUTOMATIC' end,
    'automaticRetryState', case when action.result_status = 'started' then 'RUNNING' else 'SCHEDULED' end,
    'affectedScope', 'commercial_rate',
    'currentDataState', case when rate.published_at is null then 'Подтверждённый коммерческий курс отсутствует.' else 'Последний подтверждённый коммерческий курс остаётся активным.' end,
    'received', case when rate.id is null then 0 else 1 end,
    'staged', case when rate.id is null then 0 else 1 end,
    'published', case when rate.id is null then 0 else 1 end,
    'durationMs', action.duration_ms,
    'sourceCalls', case when action.id is null then 0 else 1 end,
    'retryCount', 0,
    'technicalCode', null,
    'historyHref', '/admin/integrations/jobs?domain=rates'
  ) into v_rates
  from latest_rate rate
  full join latest_action action on true;

  if v_rates is null then
    v_rates := jsonb_build_object(
      'key', 'rates', 'status', 'NEVER_SYNCED', 'lastAttemptAt', null,
      'lastSuccessAt', null, 'lastSeenAt', null, 'operation', 'commercial_rate_sync',
      'stage', 'not_started', 'safeErrorCode', null, 'safeMessage', 'Синхронизация коммерческого курса ещё не выполнялась.',
      'runId', null, 'correlationId', null, 'recoverability', 'AUTOMATIC',
      'automaticRetryState', 'SCHEDULED', 'affectedScope', 'commercial_rate',
      'currentDataState', 'Подтверждённый коммерческий курс отсутствует.',
      'received', 0, 'staged', 0, 'published', 0, 'durationMs', null,
      'sourceCalls', 0, 'retryCount', 0, 'technicalCode', null,
      'historyHref', '/admin/integrations/jobs?domain=rates'
    );
  end if;

  return jsonb_build_array(
    coalesce(v_catalog, jsonb_build_object('key', 'catalog', 'status', 'NEVER_SYNCED')),
    coalesce(v_prices, jsonb_build_object('key', 'prices', 'status', 'NEVER_SYNCED')),
    coalesce(v_stock, jsonb_build_object('key', 'stock', 'status', 'NEVER_SYNCED')),
    coalesce(v_arrivals, jsonb_build_object('key', 'arrivals', 'status', 'NEVER_SYNCED')),
    v_rates
  );
end;
$$;

revoke all on function private.get_admin_commercial_health(timestamptz)
  from public, anon, authenticated;

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
      'id', health.value->>'key' || ':' || coalesce(health.value->>'runId', md5(coalesce(health.value->>'lastSeenAt', 'never'))),
      'domain', health.value->>'key',
      'severity', case when health.value->>'status' = 'FAILED' then 'HIGH' else 'MEDIUM' end,
      'status', 'ACTIVE',
      'healthStatus', health.value->>'status',
      'startedAt', health.value->>'lastAttemptAt',
      'detailHref', '/admin/operations/issues/' || health.value->>'key' || ':' || coalesce(health.value->>'runId', md5(coalesce(health.value->>'lastSeenAt', 'never')))
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

create or replace function public.get_admin_operational_issue(
  p_issue_id text,
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
  v_issue jsonb;
begin
  if not (
    public.has_internal_permission('admin.dashboard.view')
    or public.has_internal_permission('admin.integrations.view')
  ) then
    raise exception 'Operational issue access is not allowed.' using errcode = '42501';
  end if;

  if p_issue_id is null or char_length(p_issue_id) > 160 or p_issue_id !~ '^[a-z0-9:_-]+$' then
    raise exception 'Operational issue identity is invalid.' using errcode = '22023';
  end if;

  select issue.value into v_issue
  from jsonb_array_elements(public.list_admin_operational_issues(p_now)) issue(value)
  where issue.value->>'id' = p_issue_id
  limit 1;

  return v_issue;
end;
$$;

create or replace function public.get_admin_dashboard_projection(
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
  v_issues jsonb;
begin
  if not public.has_internal_permission('admin.dashboard.view') then
    raise exception 'Admin dashboard access is not allowed.' using errcode = '42501';
  end if;

  v_issues := public.list_admin_operational_issues(p_now);

  return jsonb_build_object(
    'health', private.get_admin_commercial_health(p_now),
    'operational', public.get_admin_operational_summary(),
    'recentEvents', public.get_admin_recent_events(20),
    'issues', v_issues,
    'criticalCount', jsonb_array_length(v_issues)
  );
end;
$$;

revoke all on function public.list_admin_operational_issues(timestamptz)
  from public, anon;
revoke all on function public.get_admin_operational_issue(text, timestamptz)
  from public, anon;
revoke all on function public.get_admin_dashboard_projection(timestamptz)
  from public, anon;

grant execute on function public.list_admin_operational_issues(timestamptz)
  to authenticated;
grant execute on function public.get_admin_operational_issue(text, timestamptz)
  to authenticated;
grant execute on function public.get_admin_dashboard_projection(timestamptz)
  to authenticated;

comment on function public.list_admin_operational_issues(timestamptz) is
  'Bounded current operational issue projection. Resolved source states disappear without persisting duplicate logs.';
comment on function public.get_admin_operational_issue(text, timestamptz) is
  'Returns one permission-gated safe current diagnostic by exact issue identity.';
comment on function public.get_admin_dashboard_projection(timestamptz) is
  'Single-request Admin Dashboard projection including current issue cardinality and commercial health.';

commit;
