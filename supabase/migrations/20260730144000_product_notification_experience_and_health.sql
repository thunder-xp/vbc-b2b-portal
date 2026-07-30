begin;

create or replace function public.list_partner_notifications(
  p_company_id uuid,
  p_event_group text default null,
  p_unread_only boolean default false,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_id uuid default null,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  normalized_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  result jsonb;
begin
  if not public.has_active_notification_membership(p_company_id, auth.uid()) then
    raise exception 'Notification access denied.' using errcode = '42501';
  end if;
  if p_event_group is not null
     and p_event_group not in (
       'orders', 'shipments', 'company_access', 'products'
     ) then
    raise exception 'Notification filter is invalid.' using errcode = '22023';
  end if;
  if (p_cursor_occurred_at is null) <> (p_cursor_id is null) then
    raise exception 'Notification cursor is invalid.' using errcode = '22023';
  end if;

  with page as (
    select notification.*
    from public.partner_notifications notification
    where notification.company_id = p_company_id
      and notification.recipient_user_id = auth.uid()
      and notification.dismissed_at is null
      and notification.expires_at > now()
      and (p_event_group is null or notification.event_group = p_event_group)
      and (not p_unread_only or notification.read_at is null)
      and (
        p_cursor_occurred_at is null
        or (notification.occurred_at, notification.id)
          < (p_cursor_occurred_at, p_cursor_id)
      )
    order by notification.occurred_at desc, notification.id desc
    limit normalized_size + 1
  ),
  visible as (
    select * from page
    order by occurred_at desc, id desc
    limit normalized_size
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', visible.id,
      'eventCode', visible.event_code,
      'eventGroup', visible.event_group,
      'severity', visible.severity,
      'mandatory', visible.mandatory,
      'title', visible.title,
      'message', visible.message,
      'actionLabel', visible.action_label,
      'actionUrl', visible.action_url,
      'occurredAt', visible.occurred_at,
      'readAt', visible.read_at,
      'dismissedAt', visible.dismissed_at,
      'expiresAt', visible.expires_at
    ) order by visible.occurred_at desc, visible.id desc), '[]'::jsonb),
    'nextCursor', case when (select count(*) from page) > normalized_size then (
      select jsonb_build_object('occurredAt', tail.occurred_at, 'id', tail.id)
      from visible tail order by tail.occurred_at, tail.id limit 1
    ) else null end
  ) into result
  from visible;

  return coalesce(
    result,
    jsonb_build_object('items', '[]'::jsonb, 'nextCursor', null)
  );
end;
$$;

create or replace function public.get_admin_notification_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Notification diagnostics access denied.'
      using errcode = '42501';
  end if;
  return jsonb_build_object(
    'generated', (
      select count(*) from public.partner_notifications
      where created_at >= now() - interval '24 hours'
    ),
    'unread', (
      select count(*) from public.partner_notifications
      where read_at is null and dismissed_at is null and expires_at > now()
    ),
    'deduplicated', coalesce((
      select sum(deduplicated)
      from public.partner_notification_generation_runs
      where started_at >= now() - interval '24 hours'
    ), 0),
    'recentFailures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'runId', failure.id,
        'worker', failure.worker,
        'safeErrorCode', failure.safe_error_code,
        'startedAt', failure.started_at,
        'finishedAt', failure.finished_at
      ) order by failure.started_at desc)
      from (
        select * from public.partner_notification_generation_runs
        where status = 'failed'
        order by started_at desc
        limit 10
      ) failure
    ), '[]'::jsonb),
    'lastShipmentWorkerRun', (
      select jsonb_build_object(
        'runId', run.id,
        'status', run.status,
        'businessDate', run.business_date,
        'sourceEventsProcessed', run.source_events_processed,
        'notificationsCreated', run.notifications_created,
        'deduplicated', run.deduplicated,
        'durationMs', run.duration_ms,
        'startedAt', run.started_at,
        'finishedAt', run.finished_at
      )
      from public.partner_notification_generation_runs run
      where run.worker = 'partner_notification_deadlines'
      order by run.started_at desc
      limit 1
    ),
    'productTransitionsCaptured', (
      select count(*) from public.partner_product_transition_events
      where occurred_at >= now() - interval '24 hours'
    ),
    'productWatcherRecipientsResolved', coalesce((
      select sum(watcher_recipients_resolved)
      from public.partner_product_notification_projection_runs
      where started_at >= now() - interval '24 hours'
    ), 0),
    'productNotificationsCreated', coalesce((
      select sum(notifications_created)
      from public.partner_product_notification_projection_runs
      where started_at >= now() - interval '24 hours'
    ), 0),
    'productDeduplicated', coalesce((
      select sum(deduplicated)
      from public.partner_product_notification_projection_runs
      where started_at >= now() - interval '24 hours'
    ), 0),
    'productSuppressed', coalesce((
      select sum(suppressed)
      from public.partner_product_notification_projection_runs
      where started_at >= now() - interval '24 hours'
    ), 0),
    'productFailedProjections', coalesce((
      select sum(failed_projections)
      from public.partner_product_notification_projection_runs
      where started_at >= now() - interval '24 hours'
    ), 0),
    'lastProcessedProductSyncIds', coalesce((
      select jsonb_agg(recent.source_sync_id order by recent.latest_at desc)
      from (
        select transition.source_sync_id, max(transition.processed_at) latest_at
        from public.partner_product_transition_events transition
        where transition.processing_status = 'processed'
        group by transition.source_sync_id
        order by latest_at desc
        limit 5
      ) recent
    ), '[]'::jsonb),
    'oldestUnprocessedProductTransition', (
      select min(occurred_at)
      from public.partner_product_transition_events
      where processing_status in ('pending', 'failed')
    ),
    'lastProductProjectionRun', (
      select jsonb_build_object(
        'runId', run.id,
        'status', run.status,
        'sourceSyncId', run.source_sync_id,
        'transitionsProcessed', run.transitions_processed,
        'watcherRecipientsResolved', run.watcher_recipients_resolved,
        'notificationsCreated', run.notifications_created,
        'deduplicated', run.deduplicated,
        'suppressed', run.suppressed,
        'failedProjections', run.failed_projections,
        'durationMs', run.duration_ms,
        'startedAt', run.started_at,
        'finishedAt', run.finished_at
      )
      from public.partner_product_notification_projection_runs run
      order by run.started_at desc
      limit 1
    )
  );
end;
$$;

alter table public.partner_behavior_events
  drop constraint if exists partner_behavior_event_name_check;
alter table public.partner_behavior_events
  add constraint partner_behavior_event_name_check check (event_name = any(array[
    'catalog_viewed', 'category_viewed', 'search_performed',
    'search_no_results', 'filters_applied',
    'merchandising_section_viewed', 'merchandising_product_clicked',
    'product_viewed', 'product_overview_viewed',
    'product_description_viewed', 'product_characteristics_viewed',
    'product_datasheet_viewed', 'product_pricing_tab_viewed',
    'retail_price_history_range_changed', 'retail_price_history_data_opened',
    'product_document_downloaded', 'stock_state_viewed', 'arrival_date_viewed',
    'product_added_to_favorites', 'product_removed_from_favorites',
    'product_added_to_compare', 'product_removed_from_compare',
    'product_added_to_cart', 'product_removed_from_cart',
    'cart_quantity_changed', 'product_added_to_estimate',
    'estimate_created', 'proposal_generated', 'order_submitted',
    'reorder_started', 'reorder_submitted',
    'out_of_stock_product_viewed', 'unavailable_product_added',
    'arrival_interest_viewed',
    'dashboard_viewed', 'dashboard_action_clicked',
    'partner_dashboard_viewed', 'dashboard_attention_opened',
    'dashboard_quick_action_clicked', 'dashboard_order_opened',
    'dashboard_shipment_opened', 'dashboard_continue_work_clicked',
    'dashboard_reorder_product_added', 'dashboard_finance_opened',
    'dashboard_offer_opened', 'dashboard_company_opened',
    'order_list_viewed', 'order_opened', 'shipment_viewed',
    'date_change_started', 'finance_viewed', 'company_users_viewed',
    'estimates_viewed', 'estimate_product_added', 'estimate_service_added',
    'estimate_price_check_started', 'estimate_price_check_applied',
    'proposal_created', 'proposal_version_created', 'proposal_previewed',
    'proposal_pdf_generated', 'proposal_sent', 'proposal_send_failed',
    'proposal_converted_to_order',
    'notifications_opened', 'notification_opened',
    'notification_marked_read', 'notifications_marked_all_read',
    'notification_dismissed', 'notification_preferences_updated',
    'product_notification_opened', 'product_notification_product_opened',
    'product_notification_cart_opened'
  ]));

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(procedure.oid)
  into function_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'record_partner_behavior_event'
  limit 1;

  if function_definition is null then
    raise exception 'Behavior event RPC is unavailable.';
  end if;
  if position('product_notification_opened' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '''notification_preferences_updated''',
      '''notification_preferences_updated'', ''product_notification_opened'', ''product_notification_product_opened'', ''product_notification_cart_opened'''
    );
    execute function_definition;
  end if;
end;
$$;

revoke all on function public.list_partner_notifications(
  uuid, text, boolean, timestamptz, uuid, integer
) from public, anon;
grant execute on function public.list_partner_notifications(
  uuid, text, boolean, timestamptz, uuid, integer
) to authenticated;
revoke all on function public.get_admin_notification_health()
  from public, anon;
grant execute on function public.get_admin_notification_health()
  to authenticated;

commit;
