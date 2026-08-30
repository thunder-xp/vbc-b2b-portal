begin;

create or replace function public.append_order_registered_in_1c_notification_event(
  p_order public.partner_orders,
  p_read_back_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  company_name text;
  customer_name text;
  manager_name text;
  manager_phone text;
  manager_email text;
  notification_locale text;
  confirmed_delivery_date text;
  event_id uuid;
  event_payload jsonb;
  payment_calendar jsonb := '[]'::jsonb;
begin
  select companies.display_name,
    nullif(btrim(customer.full_name), ''),
    nullif(btrim(manager.full_name), ''),
    nullif(btrim(manager.phone), ''),
    nullif(lower(btrim(manager.email)), '')
  into company_name, customer_name, manager_name, manager_phone, manager_email
  from public.partner_companies companies
  left join public.user_profiles customer
    on customer.id = p_order.submitted_by
  left join public.user_profiles manager
    on manager.id = companies.assigned_internal_manager_user_id
    and manager.status = 'active'
  where companies.id = p_order.company_id;

  if p_order.id is null
    or p_order.status <> 'submitted'
    or p_order.integration_status <> 'confirmed'
    or p_order.external_1c_number is null
    or p_order.external_1c_date is null
    or jsonb_typeof(p_read_back_result) <> 'object'
    or coalesce(p_read_back_result->>'priceTypeRef', '')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or lower(p_read_back_result->>'priceTypeRef')
      = '00000000-0000-0000-0000-000000000000'
    or coalesce(p_read_back_result->>'paymentMethod', '')
      not in ('cashless', 'cash')
    or coalesce(p_read_back_result->>'plannedPaymentDate', '')
      !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(p_read_back_result->>'fulfillmentMethod', '')
      not in ('pickup', 'delivery')
    or (case
      when jsonb_typeof(p_read_back_result->'paymentAmount') = 'number'
        then (p_read_back_result->>'paymentAmount')::numeric < 0
      else true
    end) then
    return null;
  end if;

  notification_locale := case
    when p_order.payload_snapshot->>'notificationLocale' = 'ro' then 'ro'
    else 'ru'
  end;

  if coalesce(p_read_back_result->>'confirmedDeliveryDate', '')
       ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    confirmed_delivery_date := p_read_back_result->>'confirmedDeliveryDate';
  end if;

  if coalesce(p_read_back_result->>'plannedPaymentDate', '')
       ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and jsonb_typeof(p_read_back_result->'paymentAmount') = 'number' then
    payment_calendar := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'date', p_read_back_result->>'plannedPaymentDate',
      'amount', p_read_back_result->'paymentAmount',
      'currency', p_order.currency_code
    )));
  end if;

  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'locale', notification_locale,
    'customerName', customer_name,
    'companyName', company_name,
    'portalOrderId', p_order.id,
    'oneCOrderNumber', p_order.external_1c_number,
    'orderDate', p_order.external_1c_date,
    'requestedDeliveryDate', p_order.requested_delivery_date,
    'confirmedDeliveryDate', confirmed_delivery_date,
    'paymentMethod', p_read_back_result->>'paymentMethod',
    'paymentCalendar', payment_calendar,
    'orderTotal', p_order.document_total,
    'currency', p_order.currency_code,
    'orderPath', '/cabinet/orders/' || p_order.id::text,
    'manager', case when manager_name is null then null else jsonb_strip_nulls(jsonb_build_object(
      'name', manager_name,
      'phone', manager_phone,
      'email', manager_email
    )) end
  ));

  insert into public.notification_events(
    event_type, company_id, partner_order_id, correlation_id,
    payload_version, payload, status, available_at
  ) values (
    'order.registered_in_1c', p_order.company_id, p_order.id,
    p_order.submission_key, 2, event_payload, 'queued', now()
  )
  on conflict (event_type, partner_order_id) do nothing
  returning id into event_id;

  if event_id is null then
    select events.id into event_id
    from public.notification_events events
    where events.event_type = 'order.registered_in_1c'
      and events.partner_order_id = p_order.id;
  else
    insert into public.notification_delivery_audit_events(
      notification_event_id, event_name, correlation_id, idempotency_key
    ) values (
      event_id, 'notification_event_created', p_order.submission_key,
      'notification_event_created:' || event_id::text
    ) on conflict (idempotency_key) do nothing;
  end if;

  return event_id;
end;
$$;

create or replace function public.claim_notification_deliveries(
  p_batch_size integer default 20,
  p_lease_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  normalized_batch_size integer := least(greatest(coalesce(p_batch_size, 20), 1), 50);
  normalized_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 90), 30), 300);
  claim_token uuid := gen_random_uuid();
  claimed jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Notification delivery claim requires service role.' using errcode = '42501';
  end if;

  with eligible as (
    select events.id event_id, events.event_type, events.partner_order_id,
      events.payload_version, orders.submitted_by recipient_user_id,
      lower(btrim(auth_user.email)) recipient
    from public.notification_events events
    join public.partner_orders orders on orders.id = events.partner_order_id
      and orders.company_id = events.company_id
      and orders.status = 'submitted'
      and orders.integration_status = 'confirmed'
    join public.partner_companies companies on companies.id = events.company_id
      and companies.status = 'active'
    join public.company_memberships memberships
      on memberships.company_id = events.company_id
      and memberships.user_id = orders.submitted_by
      and memberships.status = 'active'
    join public.user_profiles profiles on profiles.id = orders.submitted_by
      and profiles.status = 'active'
    join auth.users auth_user on auth_user.id = profiles.id
      and auth_user.email_confirmed_at is not null
      and auth_user.email is not null
    where events.status in ('queued', 'failed')
      and events.available_at <= now()
      and events.event_type = 'order.registered_in_1c'
      and lower(btrim(auth_user.email))
        ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
      and not exists (
        select 1
        from public.notification_deliveries deliveries
        where deliveries.notification_event_id = events.id
          and deliveries.channel = 'email'
          and deliveries.recipient = lower(btrim(auth_user.email))
      )
    order by events.available_at, events.created_at, events.id
    limit normalized_batch_size
  )
  insert into public.notification_deliveries(
    notification_event_id, channel, recipient_user_id, recipient,
    template_version, idempotency_key, status, next_attempt_at
  )
  select eligible.event_id, 'email', eligible.recipient_user_id, eligible.recipient,
    2,
    eligible.event_type || ':' || eligible.partner_order_id::text || ':email:'
      || eligible.recipient || ':v2',
    'queued', now()
  from eligible
  on conflict (notification_event_id, channel, recipient, template_version) do nothing;

  with unavailable as (
    update public.notification_events events
    set status = 'dead_letter', processed_at = now(),
        last_error_category = 'recipient_unavailable'
    where events.status in ('queued', 'failed')
      and events.available_at <= now()
      and events.event_type = 'order.registered_in_1c'
      and not exists (
        select 1 from public.notification_deliveries deliveries
        where deliveries.notification_event_id = events.id
      )
      and not exists (
        select 1
        from public.partner_orders orders
        join public.partner_companies companies on companies.id = events.company_id
          and companies.status = 'active'
        join public.company_memberships memberships
          on memberships.company_id = events.company_id
          and memberships.user_id = orders.submitted_by
          and memberships.status = 'active'
        join public.user_profiles profiles on profiles.id = orders.submitted_by
          and profiles.status = 'active'
        join auth.users auth_user on auth_user.id = profiles.id
          and auth_user.email_confirmed_at is not null
          and auth_user.email is not null
        where orders.id = events.partner_order_id
          and lower(btrim(auth_user.email))
            ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
      )
    returning events.id, events.correlation_id
  )
  insert into public.notification_delivery_audit_events(
    notification_event_id, event_name, error_category,
    correlation_id, idempotency_key
  )
  select unavailable.id, 'notification_delivery_dead_letter',
    'recipient_unavailable', unavailable.correlation_id,
    'notification_delivery_dead_letter:' || unavailable.id::text || ':recipient_unavailable'
  from unavailable
  on conflict (idempotency_key) do nothing;

  with due as (
    select deliveries.id
    from public.notification_deliveries deliveries
    join public.notification_events events on events.id = deliveries.notification_event_id
    where deliveries.attempt_count < 3
      and (
        (deliveries.status in ('queued', 'failed') and deliveries.next_attempt_at <= now())
        or (deliveries.status = 'processing' and deliveries.leased_until < now())
      )
    order by deliveries.next_attempt_at, deliveries.created_at, deliveries.id
    for update of deliveries skip locked
    limit normalized_batch_size
  ), updated as (
    update public.notification_deliveries deliveries
    set status = 'processing', attempt_count = deliveries.attempt_count + 1,
        lease_token = claim_token,
        leased_until = now() + make_interval(secs => normalized_lease_seconds),
        last_error_category = null
    from due
    where deliveries.id = due.id
    returning deliveries.*
  ), event_updates as (
    update public.notification_events events
    set status = 'processing', last_error_category = null
    where events.id in (select notification_event_id from updated)
    returning events.id
  ), audits as (
    insert into public.notification_delivery_audit_events(
      notification_event_id, notification_delivery_id, event_name, attempt,
      correlation_id, idempotency_key
    )
    select updated.notification_event_id, updated.id, 'notification_delivery_claimed',
      updated.attempt_count, events.correlation_id,
      'notification_delivery_claimed:' || updated.id::text || ':' || updated.lease_token::text
    from updated
    join public.notification_events events on events.id = updated.notification_event_id
    on conflict (idempotency_key) do nothing
    returning id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId', updated.id,
    'eventId', events.id,
    'eventType', events.event_type,
    'companyId', events.company_id,
    'partnerOrderId', events.partner_order_id,
    'correlationId', events.correlation_id,
    'payloadVersion', events.payload_version,
    'payload', events.payload,
    'channel', updated.channel,
    'recipient', updated.recipient,
    'templateVersion', updated.template_version,
    'attempt', updated.attempt_count,
    'leaseToken', updated.lease_token,
    'idempotencyKey', updated.idempotency_key
  ) order by updated.created_at, updated.id), '[]'::jsonb)
  into claimed
  from updated
  join public.notification_events events on events.id = updated.notification_event_id;

  return coalesce(claimed, '[]'::jsonb);
end;
$$;

revoke all on function public.append_order_registered_in_1c_notification_event(
  public.partner_orders, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.claim_notification_deliveries(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer, integer)
  to service_role;

comment on function public.append_order_registered_in_1c_notification_event(
  public.partner_orders, jsonb
) is
  'Appends a localized partner order-confirmation event after verified authoritative 1C read-back.';

commit;
