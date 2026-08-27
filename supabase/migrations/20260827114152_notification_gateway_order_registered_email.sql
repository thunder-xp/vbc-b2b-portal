begin;

create type public.notification_channel as enum ('email', 'sms', 'telegram');
create type public.notification_delivery_status as enum (
  'queued', 'processing', 'sent', 'failed', 'dead_letter'
);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  partner_order_id uuid not null references public.partner_orders(id) on delete restrict,
  correlation_id uuid not null,
  payload_version integer not null default 1,
  payload jsonb not null,
  status public.notification_delivery_status not null default 'queued',
  available_at timestamptz not null default now(),
  processed_at timestamptz null,
  last_error_category text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_events_type_check
    check (event_type ~ '^[a-z][a-z0-9_.]{2,100}$'),
  constraint notification_events_payload_version_check
    check (payload_version between 1 and 1000),
  constraint notification_events_payload_check
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384),
  constraint notification_events_error_category_check
    check (last_error_category is null or char_length(last_error_category) between 1 and 100),
  constraint notification_events_business_identity_unique
    unique (event_type, partner_order_id)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid not null references public.notification_events(id) on delete restrict,
  channel public.notification_channel not null,
  recipient_user_id uuid null references public.user_profiles(id) on delete restrict,
  recipient text not null,
  template_version integer not null,
  idempotency_key text not null unique,
  status public.notification_delivery_status not null default 'queued',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text null,
  last_error_category text null,
  last_duration_ms integer null,
  lease_token uuid null,
  leased_until timestamptz null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_recipient_check
    check (char_length(recipient) between 3 and 320 and recipient = lower(btrim(recipient))),
  constraint notification_deliveries_template_version_check
    check (template_version between 1 and 1000),
  constraint notification_deliveries_attempt_count_check
    check (attempt_count between 0 and 3),
  constraint notification_deliveries_error_category_check
    check (last_error_category is null or char_length(last_error_category) between 1 and 100),
  constraint notification_deliveries_duration_check
    check (last_duration_ms is null or last_duration_ms between 0 and 300000),
  constraint notification_deliveries_identity_unique
    unique (notification_event_id, channel, recipient, template_version),
  constraint notification_deliveries_lease_check
    check ((lease_token is null) = (leased_until is null))
);

create table public.notification_delivery_audit_events (
  id uuid primary key default gen_random_uuid(),
  notification_event_id uuid not null references public.notification_events(id) on delete restrict,
  notification_delivery_id uuid null references public.notification_deliveries(id) on delete restrict,
  event_name text not null check (event_name in (
    'notification_event_created',
    'notification_delivery_claimed',
    'notification_delivery_sent',
    'notification_delivery_failed',
    'notification_delivery_dead_letter',
    'notification_delivery_retried'
  )),
  attempt integer null check (attempt is null or attempt between 0 and 3),
  error_category text null check (
    error_category is null or char_length(error_category) between 1 and 100
  ),
  correlation_id uuid not null,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index notification_events_due_idx
  on public.notification_events(available_at, created_at, id)
  where status in ('queued', 'failed');
create index notification_events_company_created_idx
  on public.notification_events(company_id, created_at desc, id desc);
create index notification_events_status_created_idx
  on public.notification_events(status, created_at desc, id desc);
create index notification_deliveries_due_idx
  on public.notification_deliveries(next_attempt_at, created_at, id)
  where status in ('queued', 'failed', 'processing');
create index notification_deliveries_event_idx
  on public.notification_deliveries(notification_event_id, created_at, id);
create index notification_deliveries_status_sent_idx
  on public.notification_deliveries(status, sent_at desc);
create index notification_delivery_audit_event_idx
  on public.notification_delivery_audit_events(notification_event_id, created_at, id);

create trigger set_notification_events_updated_at
before update on public.notification_events
for each row execute function public.set_updated_at();

create trigger set_notification_deliveries_updated_at
before update on public.notification_deliveries
for each row execute function public.set_updated_at();

create function public.prevent_notification_delivery_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Notification delivery audit events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_notification_delivery_audit_event_mutation
before update or delete on public.notification_delivery_audit_events
for each row execute function public.prevent_notification_delivery_audit_event_mutation();

alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_delivery_audit_events enable row level security;

revoke all on type public.notification_channel from public;
revoke all on type public.notification_delivery_status from public;
grant usage on type public.notification_channel to service_role;
grant usage on type public.notification_delivery_status to service_role;
revoke all on table public.notification_events from public, anon, authenticated;
revoke all on table public.notification_deliveries from public, anon, authenticated;
revoke all on table public.notification_delivery_audit_events from public, anon, authenticated;
grant select, insert, update on table public.notification_events to service_role;
grant select, insert, update on table public.notification_deliveries to service_role;
grant select, insert on table public.notification_delivery_audit_events to service_role;

create function public.append_order_registered_in_1c_notification_event(
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
  event_id uuid;
  event_payload jsonb;
  payment_calendar jsonb := '[]'::jsonb;
begin
  select companies.display_name into company_name
  from public.partner_companies companies
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
    'companyName', company_name,
    'portalOrderId', p_order.id,
    'oneCOrderNumber', p_order.external_1c_number,
    'orderDate', p_order.external_1c_date,
    'requestedDeliveryDate', p_order.requested_delivery_date,
    'confirmedDeliveryDate', p_order.requested_delivery_date,
    'paymentMethod', p_read_back_result->>'paymentMethod',
    'paymentCalendar', payment_calendar,
    'orderTotal', p_order.document_total,
    'currency', p_order.currency_code,
    'orderPath', '/cabinet/orders/' || p_order.id::text
  ));

  insert into public.notification_events(
    event_type, company_id, partner_order_id, correlation_id,
    payload_version, payload, status, available_at
  ) values (
    'order.registered_in_1c', p_order.company_id, p_order.id,
    p_order.submission_key, 1, event_payload, 'queued', now()
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

create function public.claim_notification_deliveries(
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
    order by events.available_at, events.created_at, events.id
    limit normalized_batch_size
  )
  insert into public.notification_deliveries(
    notification_event_id, channel, recipient_user_id, recipient,
    template_version, idempotency_key, status, next_attempt_at
  )
  select eligible.event_id, 'email', eligible.recipient_user_id, eligible.recipient,
    1,
    eligible.event_type || ':' || eligible.partner_order_id::text || ':email:'
      || eligible.recipient || ':v1',
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

create function public.complete_notification_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_retryable boolean,
  p_provider_message_id text default null,
  p_error_category text default null,
  p_duration_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  delivery public.notification_deliveries%rowtype;
  event_row public.notification_events%rowtype;
  next_status public.notification_delivery_status;
  next_attempt timestamptz;
  audit_name text;
  normalized_error text := nullif(left(lower(btrim(coalesce(p_error_category, ''))), 100), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Notification delivery completion requires service role.' using errcode = '42501';
  end if;

  select * into delivery from public.notification_deliveries
  where id = p_delivery_id for update;
  if delivery.id is null then
    raise exception 'Notification delivery was not found.' using errcode = 'P0002';
  end if;
  if delivery.status = 'sent' then
    return jsonb_build_object('deliveryId', delivery.id, 'status', delivery.status);
  end if;
  if delivery.status <> 'processing' or delivery.lease_token <> p_lease_token then
    return jsonb_build_object('deliveryId', delivery.id, 'status', 'stale_claim');
  end if;

  select * into event_row from public.notification_events
  where id = delivery.notification_event_id for update;

  if p_succeeded then
    next_status := 'sent';
    next_attempt := delivery.next_attempt_at;
    audit_name := 'notification_delivery_sent';
  elsif p_retryable and delivery.attempt_count < 3 then
    next_status := 'failed';
    next_attempt := now() + case delivery.attempt_count
      when 1 then interval '2 minutes'
      else interval '15 minutes'
    end;
    audit_name := 'notification_delivery_failed';
  else
    next_status := 'dead_letter';
    next_attempt := delivery.next_attempt_at;
    audit_name := 'notification_delivery_dead_letter';
  end if;

  update public.notification_deliveries
  set status = next_status,
      next_attempt_at = next_attempt,
      provider_message_id = case when p_succeeded
        then nullif(left(btrim(coalesce(p_provider_message_id, '')), 300), '')
        else provider_message_id end,
      last_error_category = case when p_succeeded then null
        else coalesce(normalized_error, 'provider_unavailable') end,
      last_duration_ms = case when p_duration_ms is null then null
        else least(greatest(p_duration_ms, 0), 300000) end,
      lease_token = null,
      leased_until = null,
      sent_at = case when p_succeeded then coalesce(sent_at, now()) else sent_at end
  where id = delivery.id;

  update public.notification_events
  set status = next_status,
      available_at = case when next_status = 'failed' then next_attempt else available_at end,
      processed_at = case when next_status in ('sent', 'dead_letter') then now() else null end,
      last_error_category = case when p_succeeded then null
        else coalesce(normalized_error, 'provider_unavailable') end
  where id = event_row.id;

  insert into public.notification_delivery_audit_events(
    notification_event_id, notification_delivery_id, event_name, attempt,
    error_category, correlation_id, idempotency_key
  ) values (
    event_row.id, delivery.id, audit_name, delivery.attempt_count,
    case when p_succeeded then null else coalesce(normalized_error, 'provider_unavailable') end,
    event_row.correlation_id,
    audit_name || ':' || delivery.id::text || ':' || delivery.lease_token::text
  ) on conflict (idempotency_key) do nothing;

  return jsonb_build_object(
    'deliveryId', delivery.id,
    'status', next_status,
    'nextAttemptAt', case when next_status = 'failed' then next_attempt else null end
  );
end;
$$;

create function public.retry_admin_notification_delivery(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  delivery public.notification_deliveries%rowtype;
  event_row public.notification_events%rowtype;
begin
  if auth.uid() is null
    or not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'Notification delivery retry is not allowed.' using errcode = '42501';
  end if;

  select * into delivery from public.notification_deliveries
  where id = p_delivery_id for update;
  if delivery.id is null then
    raise exception 'Notification delivery was not found.' using errcode = 'P0002';
  end if;
  if delivery.status not in ('failed', 'dead_letter') then
    return jsonb_build_object('deliveryId', delivery.id, 'status', delivery.status, 'retried', false);
  end if;

  select * into event_row from public.notification_events
  where id = delivery.notification_event_id for update;

  update public.notification_deliveries
  set status = 'queued', attempt_count = 0, next_attempt_at = now(),
      last_error_category = null, lease_token = null, leased_until = null
  where id = delivery.id;
  update public.notification_events
  set status = 'queued', available_at = now(), processed_at = null,
      last_error_category = null
  where id = event_row.id;

  insert into public.notification_delivery_audit_events(
    notification_event_id, notification_delivery_id, event_name, attempt,
    correlation_id, actor_user_id, idempotency_key
  ) values (
    event_row.id, delivery.id, 'notification_delivery_retried', 0,
    event_row.correlation_id, auth.uid(),
    'notification_delivery_retried:' || delivery.id::text || ':' || gen_random_uuid()::text
  );

  return jsonb_build_object('deliveryId', delivery.id, 'status', 'queued', 'retried', true);
end;
$$;

create function public.complete_notification_deliveries(p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  item jsonb;
  completed jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Notification delivery batch completion requires service role.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_results) <> 'array'
    or jsonb_array_length(p_results) not between 1 and 50 then
    raise exception 'Notification delivery result batch is invalid.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_results)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Notification delivery result is invalid.' using errcode = '22023';
    end if;
    completed := completed || jsonb_build_array(public.complete_notification_delivery(
      (item->>'deliveryId')::uuid,
      (item->>'leaseToken')::uuid,
      coalesce((item->>'succeeded')::boolean, false),
      coalesce((item->>'retryable')::boolean, false),
      item->>'providerMessageId',
      item->>'errorCategory',
      (item->>'durationMs')::integer
    ));
  end loop;

  return completed;
end;
$$;

create function public.get_admin_notification_gateway_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  summary jsonb;
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Notification diagnostics access denied.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'queued', count(*) filter (where status = 'queued'),
    'processing', count(*) filter (where status = 'processing'),
    'sentLast24Hours', count(*) filter (
      where status = 'sent' and sent_at >= now() - interval '24 hours'
    ),
    'failed', count(*) filter (where status = 'failed'),
    'deadLetter', count(*) filter (where status = 'dead_letter') + (
      select count(*) from public.notification_events events
      where events.status = 'dead_letter'
        and not exists (
          select 1 from public.notification_deliveries deliveries
          where deliveries.notification_event_id = events.id
        )
    )
  ) into summary
  from public.notification_deliveries;

  return summary || jsonb_build_object(
      'recentDeliveries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'deliveryId', recent.delivery_id,
          'eventId', recent.event_id,
          'eventType', recent.event_type,
          'companyId', recent.company_id,
          'companyName', recent.company_name,
          'partnerOrderId', recent.partner_order_id,
          'orderNumber', recent.order_number,
          'channel', recent.channel,
          'recipient', recent.recipient,
          'status', recent.status,
          'attempts', recent.attempt_count,
          'sentAt', recent.sent_at,
          'safeError', recent.last_error_category,
          'correlationId', recent.correlation_id,
          'createdAt', recent.created_at
        ) order by recent.created_at desc, recent.delivery_id desc)
        from (
          select delivered.* from (
            select deliveries.id delivery_id, events.id event_id, events.event_type,
              events.company_id, companies.display_name company_name,
              events.partner_order_id, orders.external_1c_number order_number,
              deliveries.channel, deliveries.recipient, deliveries.status,
              deliveries.attempt_count, deliveries.sent_at,
              deliveries.last_error_category, events.correlation_id,
              deliveries.created_at
            from public.notification_deliveries deliveries
            join public.notification_events events on events.id = deliveries.notification_event_id
            join public.partner_companies companies on companies.id = events.company_id
            join public.partner_orders orders on orders.id = events.partner_order_id
            union all
            select null::uuid delivery_id, events.id event_id, events.event_type,
              events.company_id, companies.display_name company_name,
              events.partner_order_id, orders.external_1c_number order_number,
              'email'::public.notification_channel channel,
              'recipient_unavailable'::text recipient, events.status,
              0 attempt_count, null::timestamptz sent_at,
              events.last_error_category, events.correlation_id,
              events.created_at
            from public.notification_events events
            join public.partner_companies companies on companies.id = events.company_id
            join public.partner_orders orders on orders.id = events.partner_order_id
            where events.status = 'dead_letter'
              and not exists (
                select 1 from public.notification_deliveries deliveries
                where deliveries.notification_event_id = events.id
              )
          ) delivered
          order by delivered.created_at desc, delivered.delivery_id desc nulls last
          limit 50
        ) recent
      ), '[]'::jsonb)
    );
end;
$$;

create or replace function public.complete_partner_order_submission_v3(
  target_order_id uuid,
  one_c_ref text,
  one_c_number text,
  one_c_date timestamptz,
  one_c_status text,
  confirmed_document_total numeric,
  confirmed_currency_code text,
  confirmed_contract_number text,
  target_read_back_result jsonb
)
returns public.partner_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.partner_orders;
  diagnostic_updates integer;
begin
  result := public.complete_partner_order_submission_v2(
    target_order_id, one_c_ref, one_c_number, one_c_date, one_c_status,
    confirmed_document_total, confirmed_currency_code, confirmed_contract_number
  );
  update public.partner_order_export_diagnostics
  set read_back_verified = true,
      read_back_result = target_read_back_result,
      verified_at = coalesce(verified_at, now())
  where order_id = result.id;
  get diagnostics diagnostic_updates = row_count;
  if diagnostic_updates = 1 then
    perform public.append_order_registered_in_1c_notification_event(
      result, target_read_back_result
    );
  end if;
  return result;
end;
$$;

revoke all on function public.prevent_notification_delivery_audit_event_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.append_order_registered_in_1c_notification_event(
  public.partner_orders, jsonb
)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_notification_deliveries(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer, integer)
  to service_role;
revoke all on function public.complete_notification_delivery(
  uuid, uuid, boolean, boolean, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.complete_notification_deliveries(jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_notification_deliveries(jsonb)
  to service_role;
revoke all on function public.retry_admin_notification_delivery(uuid)
  from public, anon;
grant execute on function public.retry_admin_notification_delivery(uuid)
  to authenticated;
revoke all on function public.get_admin_notification_gateway_health()
  from public, anon;
grant execute on function public.get_admin_notification_gateway_health()
  to authenticated;
revoke all on function public.complete_partner_order_submission_v3(
  uuid, text, text, timestamptz, text, numeric, text, text, jsonb
) from public, anon;
grant execute on function public.complete_partner_order_submission_v3(
  uuid, text, text, timestamptz, text, numeric, text, text, jsonb
) to authenticated, service_role;

comment on table public.notification_events is
  'Channel-neutral transactional notification outbox. Business completion appends events; channel workers deliver later.';
comment on table public.notification_deliveries is
  'Idempotent per-recipient channel delivery state with bounded leases and retry attempts.';
comment on table public.notification_delivery_audit_events is
  'Append-only safe lifecycle evidence for notification event creation and delivery attempts.';
comment on function public.append_order_registered_in_1c_notification_event(
  public.partner_orders, jsonb
) is
  'Internal completion-boundary helper. Appends only after a confirmed order and verified authoritative 1C read-back.';

commit;
