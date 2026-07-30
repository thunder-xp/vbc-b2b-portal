begin;

create or replace function public.generate_partner_notification_deadlines(
  p_business_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  run_id uuid;
  worker_started_at timestamptz := clock_timestamp();
  source_count integer := 0;
  recipient_count integer := 0;
  created_count integer := 0;
  deduplicated_count integer := 0;
  projection jsonb;
  candidate record;
begin
  if auth.role() <> 'service_role' or p_business_date is null then
    raise exception 'Notification deadline worker is server-only.'
      using errcode = '42501';
  end if;

  if not pg_try_advisory_xact_lock(
    hashtext('partner_notification_deadlines')
  ) then
    insert into public.partner_notification_generation_runs(
      worker, business_date, status, finished_at, duration_ms
    ) values (
      'partner_notification_deadlines', p_business_date, 'locked',
      clock_timestamp(),
      greatest(
        0,
        floor(extract(
          epoch from clock_timestamp() - worker_started_at
        ) * 1000)
      )::integer
    ) returning id into run_id;
    return jsonb_build_object('runId', run_id, 'status', 'locked');
  end if;

  insert into public.partner_notification_generation_runs(
    worker, business_date, status
  ) values (
    'partner_notification_deadlines', p_business_date, 'running'
  ) returning id into run_id;

  for candidate in
    select
      history.company_id,
      history.id as entity_id,
      history.external_1c_order_number as object_number,
      history.one_c_delivery_date as planned_date,
      case
        when history.one_c_delivery_date = p_business_date + 3
          then 'shipment_due_in_3_days'
        when history.one_c_delivery_date = p_business_date
          then 'shipment_due_today'
        when history.one_c_delivery_date < p_business_date
          then 'shipment_overdue'
      end as event_code
    from public.partner_order_history history
    where history.partner_visible
      and not history.one_c_deletion_mark
      and history.one_c_delivery_date is not null
      and coalesce(history.one_c_state_code, '') <> 'completed'
      and (
        history.one_c_delivery_date in (p_business_date, p_business_date + 3)
        or history.one_c_delivery_date < p_business_date
      )
    order by history.company_id, history.one_c_delivery_date, history.id
  loop
    projection := public.create_partner_notification_event(
      candidate.company_id,
      candidate.event_code,
      'shipment',
      candidate.entity_id,
      'partner_order_history',
      null,
      concat(candidate.planned_date::text, ':', p_business_date::text),
      p_business_date::timestamptz,
      jsonb_build_object(
        'objectNumber', candidate.object_number,
        'plannedDate', candidate.planned_date,
        'businessDate', p_business_date
      )
    );
    source_count := source_count + 1;
    recipient_count := recipient_count
      + coalesce((projection->>'eligibleRecipients')::integer, 0);
    created_count := created_count
      + coalesce((projection->>'created')::integer, 0);
    deduplicated_count := deduplicated_count
      + coalesce((projection->>'deduplicated')::integer, 0);
  end loop;

  for candidate in
    select
      invitation.company_id,
      invitation.id as entity_id,
      invitation.invited_by as inviter_user_id,
      invitation.expires_at
    from public.invitations invitation
    where invitation.status = 'pending'
      and invitation.expires_at::date between p_business_date
        and p_business_date + 3
    order by invitation.company_id, invitation.expires_at, invitation.id
  loop
    projection := public.create_partner_notification_event(
      candidate.company_id,
      'invitation_expiring',
      'invitation',
      candidate.entity_id,
      'invitations',
      null,
      candidate.expires_at::text,
      p_business_date::timestamptz,
      jsonb_build_object(
        'inviterUserId', candidate.inviter_user_id,
        'expiresAt', candidate.expires_at
      )
    );
    source_count := source_count + 1;
    recipient_count := recipient_count
      + coalesce((projection->>'eligibleRecipients')::integer, 0);
    created_count := created_count
      + coalesce((projection->>'created')::integer, 0);
    deduplicated_count := deduplicated_count
      + coalesce((projection->>'deduplicated')::integer, 0);
  end loop;

  update public.partner_notification_generation_runs
  set status = 'succeeded',
      source_events_processed = source_count,
      recipients_resolved = recipient_count,
      notifications_created = created_count,
      deduplicated = deduplicated_count,
      finished_at = clock_timestamp(),
      duration_ms = greatest(
        0,
        floor(extract(
          epoch from clock_timestamp() - worker_started_at
        ) * 1000)
      )::integer
  where id = run_id;

  return jsonb_build_object(
    'runId', run_id,
    'status', 'succeeded',
    'businessDate', p_business_date,
    'sourceEventsProcessed', source_count,
    'recipientsResolved', recipient_count,
    'notificationsCreated', created_count,
    'deduplicated', deduplicated_count
  );
end;
$$;

revoke all on function public.generate_partner_notification_deadlines(date)
  from public, anon, authenticated;
grant execute on function public.generate_partner_notification_deadlines(date)
  to service_role;

commit;
