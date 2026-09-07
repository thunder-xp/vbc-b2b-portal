begin;

create type public.communication_channel_mode as enum ('DISABLED', 'DRY_RUN', 'LIVE');
create type public.communication_delivery_state as enum (
  'PROJECTED', 'SUPPRESSED', 'READY', 'QUEUED', 'PROCESSING',
  'ACCEPTED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED'
);

alter table public.notification_events
  alter column partner_order_id drop not null,
  add column intent_id text,
  add column business_entity_references jsonb not null default '[]'::jsonb,
  add column business_identity text,
  add column communication_correlation_id text,
  add column sensitivity text not null default 'PARTNER_PRIVATE';

update public.notification_events events set
  intent_id = events.event_type || ':' || events.partner_order_id::text,
  business_entity_references = jsonb_build_array(events.partner_order_id::text),
  business_identity = events.event_type || ':' || events.partner_order_id::text,
  communication_correlation_id = events.correlation_id::text
where events.intent_id is null;

alter table public.notification_events
  alter column intent_id set not null,
  alter column business_identity set not null,
  alter column communication_correlation_id set not null,
  add constraint notification_events_intent_id_check check (char_length(intent_id) between 1 and 200),
  add constraint notification_events_business_references_check check (
    jsonb_typeof(business_entity_references) = 'array'
    and jsonb_array_length(business_entity_references) between 1 and 100
  ),
  add constraint notification_events_business_identity_check check (char_length(business_identity) between 1 and 500),
  add constraint notification_events_communication_correlation_check check (char_length(communication_correlation_id) between 1 and 200),
  add constraint notification_events_sensitivity_check check (
    sensitivity in ('PUBLIC', 'PARTNER_PRIVATE', 'FINANCIAL_PRIVATE', 'SECURITY_SENSITIVE')
  );

create unique index notification_events_intent_identity_idx
  on public.notification_events(intent_id);
alter table public.notification_deliveries
  add column delivery_identity text,
  add column channel_mode public.communication_channel_mode not null default 'LIVE',
  add column delivery_state public.communication_delivery_state not null default 'QUEUED',
  add column template_key text,
  add column template_revision text,
  add column recipient_locale text not null default 'ru',
  add column recipient_fingerprint text,
  add column sensitivity text not null default 'PARTNER_PRIVATE',
  add column rendered_snapshot jsonb,
  add column suppression_reason text,
  add column adapter_identity text,
  add column attempt_sequence integer not null default 0,
  add column accepted_at timestamptz;

update public.notification_deliveries deliveries set
  delivery_identity = encode(extensions.digest(deliveries.idempotency_key, 'sha256'), 'hex'),
  delivery_state = case deliveries.status
    when 'queued' then 'QUEUED'::public.communication_delivery_state
    when 'processing' then 'PROCESSING'::public.communication_delivery_state
    when 'sent' then 'ACCEPTED'::public.communication_delivery_state
    when 'failed' then 'FAILED_RETRYABLE'::public.communication_delivery_state
    else 'FAILED_FINAL'::public.communication_delivery_state
  end,
  template_key = events.event_type,
  template_revision = 'v' || deliveries.template_version::text,
  recipient_locale = case when events.payload->>'locale' in ('ru', 'ro') then events.payload->>'locale' else 'ru' end,
  recipient_fingerprint = encode(extensions.digest(deliveries.recipient, 'sha256'), 'hex'),
  sensitivity = events.sensitivity,
  adapter_identity = case when deliveries.channel = 'email' then 'smtp' else null end,
  attempt_sequence = deliveries.attempt_count,
  accepted_at = deliveries.sent_at
from public.notification_events events
where events.id = deliveries.notification_event_id;

alter table public.notification_deliveries
  alter column delivery_identity set not null,
  alter column template_key set not null,
  alter column template_revision set not null,
  alter column recipient_fingerprint set not null,
  drop constraint notification_deliveries_identity_unique,
  add constraint notification_deliveries_identity_check check (delivery_identity ~ '^[0-9a-f]{64}$'),
  add constraint notification_deliveries_template_key_check check (template_key ~ '^[a-z][a-z0-9_.]{2,100}$'),
  add constraint notification_deliveries_template_revision_check check (char_length(template_revision) between 1 and 50),
  add constraint notification_deliveries_locale_check check (recipient_locale in ('ru', 'ro')),
  add constraint notification_deliveries_recipient_fingerprint_check check (recipient_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint notification_deliveries_sensitivity_check check (
    sensitivity in ('PUBLIC', 'PARTNER_PRIVATE', 'FINANCIAL_PRIVATE', 'SECURITY_SENSITIVE')
  ),
  add constraint notification_deliveries_render_snapshot_check check (
    rendered_snapshot is null or (
      jsonb_typeof(rendered_snapshot) = 'object'
      and octet_length(rendered_snapshot::text) <= 131072
    )
  ),
  add constraint notification_deliveries_suppression_reason_check check (
    suppression_reason is null or char_length(suppression_reason) between 1 and 100
  ),
  add constraint notification_deliveries_attempt_sequence_check check (attempt_sequence >= attempt_count),
  add constraint notification_deliveries_mode_state_check check (
    (channel_mode = 'LIVE' and delivery_state in ('READY', 'QUEUED', 'PROCESSING', 'ACCEPTED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED'))
    or (channel_mode = 'DRY_RUN' and delivery_state in ('PROJECTED', 'SUPPRESSED', 'CANCELLED'))
    or (channel_mode = 'DISABLED' and delivery_state in ('SUPPRESSED', 'CANCELLED'))
  );

create unique index notification_deliveries_durable_identity_idx
  on public.notification_deliveries(delivery_identity, channel_mode);
create index notification_deliveries_core_claim_idx
  on public.notification_deliveries(next_attempt_at, created_at, id)
  where channel_mode = 'LIVE'
    and delivery_state in ('READY', 'QUEUED', 'PROCESSING', 'FAILED_RETRYABLE');
create index notification_deliveries_core_observability_idx
  on public.notification_deliveries(delivery_state, channel, created_at desc);

create table public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_delivery_id uuid not null references public.notification_deliveries(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  lease_token uuid not null,
  channel public.notification_channel not null,
  adapter_identity text null check (adapter_identity is null or char_length(adapter_identity) between 1 and 100),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  result_classification text null check (
    result_classification is null or result_classification in ('ACCEPTED', 'RETRYABLE', 'FINAL', 'STALE')
  ),
  safe_error_category text null check (safe_error_category is null or char_length(safe_error_category) between 1 and 100),
  duration_ms integer null check (duration_ms is null or duration_ms between 0 and 300000),
  created_at timestamptz not null default now(),
  constraint notification_delivery_attempt_identity_unique unique(notification_delivery_id, lease_token),
  constraint notification_delivery_attempt_number_unique unique(notification_delivery_id, attempt_number)
);

create table public.notification_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  notification_delivery_id uuid not null unique references public.notification_deliveries(id) on delete restrict,
  delivery_identity text not null,
  channel public.notification_channel not null,
  adapter_identity text not null,
  accepted_at timestamptz not null,
  provider_reference text null,
  template_key text not null,
  template_revision text not null,
  recipient_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint notification_delivery_receipt_identity_check check (delivery_identity ~ '^[0-9a-f]{64}$'),
  constraint notification_delivery_receipt_provider_check check (provider_reference is null or char_length(provider_reference) <= 300),
  constraint notification_delivery_receipt_recipient_check check (recipient_fingerprint ~ '^[0-9a-f]{64}$')
);

create index notification_delivery_attempts_delivery_started_idx
  on public.notification_delivery_attempts(notification_delivery_id, started_at desc);
create index notification_delivery_receipts_channel_accepted_idx
  on public.notification_delivery_receipts(channel, accepted_at desc);

create function public.prevent_notification_delivery_receipt_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Notification delivery receipts are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_notification_delivery_receipt_mutation
before update or delete on public.notification_delivery_receipts
for each row execute function public.prevent_notification_delivery_receipt_mutation();

alter table public.notification_delivery_attempts enable row level security;
alter table public.notification_delivery_receipts enable row level security;
revoke all on table public.notification_delivery_attempts from public, anon, authenticated;
revoke all on table public.notification_delivery_receipts from public, anon, authenticated;
revoke all on table public.notification_delivery_attempts from service_role;
revoke all on table public.notification_delivery_receipts from service_role;
grant select, insert, update on table public.notification_delivery_attempts to service_role;
grant select, insert on table public.notification_delivery_receipts to service_role;
revoke all on type public.communication_channel_mode from public;
revoke all on type public.communication_delivery_state from public;
grant usage on type public.communication_channel_mode to service_role;
grant usage on type public.communication_delivery_state to service_role;

alter table public.notification_delivery_audit_events
  drop constraint notification_delivery_audit_events_event_name_check,
  add constraint notification_delivery_audit_events_event_name_check check (event_name in (
    'notification_event_created',
    'communication_intent_persisted',
    'notification_delivery_projected',
    'notification_delivery_suppressed',
    'notification_delivery_claimed',
    'notification_delivery_sent',
    'notification_delivery_failed',
    'notification_delivery_dead_letter',
    'notification_delivery_retried'
  ));

create function public.prepare_notification_event_core()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.intent_id := coalesce(nullif(new.intent_id, ''), new.event_type || ':' || new.partner_order_id::text);
  new.business_entity_references := case
    when jsonb_array_length(coalesce(new.business_entity_references, '[]'::jsonb)) > 0 then new.business_entity_references
    else jsonb_build_array(new.partner_order_id::text)
  end;
  new.business_identity := coalesce(nullif(new.business_identity, ''), new.intent_id);
  new.communication_correlation_id := coalesce(nullif(new.communication_correlation_id, ''), new.correlation_id::text);
  return new;
end;
$$;

create trigger prepare_notification_event_core
before insert on public.notification_events
for each row execute function public.prepare_notification_event_core();

create function public.prepare_notification_delivery_core()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  event_row public.notification_events%rowtype;
begin
  select * into event_row from public.notification_events where id = new.notification_event_id;
  new.delivery_identity := coalesce(
    nullif(new.delivery_identity, ''),
    encode(extensions.digest(new.idempotency_key, 'sha256'), 'hex')
  );
  new.template_key := coalesce(nullif(new.template_key, ''), event_row.event_type);
  new.template_revision := coalesce(nullif(new.template_revision, ''), 'v' || new.template_version::text);
  new.recipient_locale := case
    when new.recipient_locale in ('ru', 'ro') then new.recipient_locale
    when event_row.payload->>'locale' in ('ru', 'ro') then event_row.payload->>'locale'
    else 'ru'
  end;
  new.recipient_fingerprint := coalesce(
    nullif(new.recipient_fingerprint, ''),
    encode(extensions.digest(new.recipient, 'sha256'), 'hex')
  );
  new.sensitivity := coalesce(nullif(new.sensitivity, ''), event_row.sensitivity);
  new.attempt_sequence := greatest(new.attempt_sequence, new.attempt_count);
  return new;
end;
$$;

create trigger prepare_notification_delivery_core
before insert on public.notification_deliveries
for each row execute function public.prepare_notification_delivery_core();

create function public.persist_communication_intent(
  p_intent jsonb,
  p_deliveries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_event_id uuid;
  v_intent_id text := nullif(btrim(p_intent->>'intentId'), '');
  v_company_id uuid;
  v_recipient_user_id uuid;
  v_event_type text := nullif(btrim(p_intent->>'businessEventType'), '');
  v_business_identity text := nullif(btrim(p_intent->>'businessIdentity'), '');
  v_correlation text := nullif(btrim(p_intent->>'correlationId'), '');
  v_sensitivity text := nullif(btrim(p_intent->>'sensitivity'), '');
  v_event_status public.notification_delivery_status;
  item jsonb;
  v_delivery_id uuid;
  v_ids jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Communication intent persistence requires service role.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_intent) <> 'object'
    or jsonb_typeof(p_intent->'businessEntityReferences') <> 'array'
    or jsonb_array_length(p_intent->'businessEntityReferences') not between 1 and 100
    or jsonb_typeof(p_deliveries) <> 'array'
    or jsonb_array_length(p_deliveries) not between 1 and 3
    or v_intent_id is null or char_length(v_intent_id) > 200
    or v_event_type is null or v_event_type !~ '^[a-z][a-z0-9_.]{2,100}$'
    or v_business_identity is null or char_length(v_business_identity) > 500
    or v_correlation is null or char_length(v_correlation) > 200
    or v_sensitivity not in ('PUBLIC', 'PARTNER_PRIVATE', 'FINANCIAL_PRIVATE', 'SECURITY_SENSITIVE') then
    raise exception 'Communication intent is invalid.' using errcode = '22023';
  end if;
  begin
    v_company_id := (p_intent->>'companyId')::uuid;
    v_recipient_user_id := (p_intent->>'recipientUserId')::uuid;
  exception when others then
    raise exception 'Communication company or recipient identity is invalid.' using errcode = '22023';
  end;
  if not exists (
    select 1 from public.partner_companies company
    where company.id = v_company_id and company.status = 'active'
  ) then
    raise exception 'Communication company is unavailable.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.user_profiles profile
    join public.company_memberships membership
      on membership.user_id = profile.id
      and membership.company_id = v_company_id
      and membership.status = 'active'
    where profile.id = v_recipient_user_id and profile.status = 'active'
  ) then
    raise exception 'Communication recipient is not an active company member.' using errcode = '22023';
  end if;

  v_event_status := case
    when exists (
      select 1 from jsonb_array_elements(p_deliveries) delivery
      where delivery->>'channelMode' = 'LIVE'
        and delivery->>'state' in ('READY', 'QUEUED')
    ) then 'queued'::public.notification_delivery_status
    when exists (
      select 1 from jsonb_array_elements(p_deliveries) delivery
      where delivery->>'state' = 'PROJECTED'
    ) then 'projected'::public.notification_delivery_status
    else 'suppressed'::public.notification_delivery_status
  end;

  insert into public.notification_events(
    event_type, company_id, partner_order_id, correlation_id, payload_version,
    payload, status, available_at, intent_id, business_entity_references,
    business_identity, communication_correlation_id, sensitivity
  ) values (
    v_event_type, v_company_id, null, gen_random_uuid(), 1,
    jsonb_strip_nulls(jsonb_build_object(
      'scheduledBusinessDate', p_intent->>'scheduledBusinessDate',
      'businessEntityReferences', p_intent->'businessEntityReferences'
    )),
    v_event_status, now(), v_intent_id, p_intent->'businessEntityReferences',
    v_business_identity, v_correlation, v_sensitivity
  )
  on conflict (intent_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select event.id into v_event_id
    from public.notification_events event
    where event.intent_id = v_intent_id
      and event.company_id = v_company_id
      and event.event_type = v_event_type
      and event.business_identity = v_business_identity;
    if v_event_id is null then
      raise exception 'Communication intent identity conflicts with persisted evidence.' using errcode = '23505';
    end if;
  else
    insert into public.notification_delivery_audit_events(
      notification_event_id, event_name, correlation_id, idempotency_key
    ) values (
      v_event_id, 'communication_intent_persisted',
      (select correlation_id from public.notification_events where id = v_event_id),
      'communication_intent_persisted:' || v_intent_id
    ) on conflict (idempotency_key) do nothing;
  end if;

  for item in select value from jsonb_array_elements(p_deliveries)
  loop
    if item->>'channel' not in ('email', 'in_app', 'sms')
      or item->>'channelMode' not in ('DISABLED', 'DRY_RUN', 'LIVE')
      or item->>'state' not in ('PROJECTED', 'SUPPRESSED', 'READY', 'QUEUED')
      or (item->>'channelMode' = 'LIVE' and item->>'state' not in ('READY', 'QUEUED'))
      or (item->>'channelMode' = 'DRY_RUN' and item->>'state' not in ('PROJECTED', 'SUPPRESSED'))
      or (item->>'channelMode' = 'DISABLED' and item->>'state' <> 'SUPPRESSED')
      or coalesce(item->>'deliveryIdentity', '') !~ '^[0-9a-f]{64}$'
      or coalesce(item->>'templateKey', '') !~ '^[a-z][a-z0-9_.]{2,100}$'
      or item->>'locale' not in ('ru', 'ro')
      or coalesce(item->>'recipient', '') = ''
      or coalesce(item->>'recipientUserId', '') = '' then
      raise exception 'Communication delivery is invalid.' using errcode = '22023';
    end if;
    if (item->>'recipientUserId')::uuid is distinct from (p_intent->>'recipientUserId')::uuid then
      raise exception 'Communication recipient identity mismatch.' using errcode = '22023';
    end if;
    if item->>'channel' = 'email' and not exists (
      select 1 from public.user_profiles profile
      where profile.id = v_recipient_user_id
        and lower(btrim(profile.email)) = lower(btrim(item->>'recipient'))
    ) then
      raise exception 'Communication email does not match the governed recipient.' using errcode = '22023';
    end if;

    insert into public.notification_deliveries(
      notification_event_id, channel, recipient_user_id, recipient,
      template_version, idempotency_key, status, next_attempt_at,
      delivery_identity, channel_mode, delivery_state, template_key,
      template_revision, recipient_locale, recipient_fingerprint, sensitivity,
      rendered_snapshot, suppression_reason, adapter_identity
    ) values (
      v_event_id, (item->>'channel')::public.notification_channel,
      (item->>'recipientUserId')::uuid, lower(btrim(item->>'recipient')),
      greatest(coalesce(nullif(regexp_replace(item->>'templateRevision', '[^0-9]', '', 'g'), '')::integer, 1), 1),
      (item->>'deliveryIdentity') || ':' || (item->>'channelMode'),
      case item->>'state'
        when 'PROJECTED' then 'projected'::public.notification_delivery_status
        when 'SUPPRESSED' then 'suppressed'::public.notification_delivery_status
        else 'queued'::public.notification_delivery_status
      end,
      now(), item->>'deliveryIdentity',
      (item->>'channelMode')::public.communication_channel_mode,
      (item->>'state')::public.communication_delivery_state,
      item->>'templateKey', item->>'templateRevision', item->>'locale',
      encode(extensions.digest(lower(btrim(item->>'recipient')), 'sha256'), 'hex'),
      v_sensitivity, item->'renderSnapshot', nullif(item->>'suppressionReason', ''),
      nullif(item->>'adapterIdentity', '')
    )
    on conflict (delivery_identity, channel_mode) do nothing
    returning id into v_delivery_id;

    if v_delivery_id is null then
      select delivery.id into v_delivery_id
      from public.notification_deliveries delivery
      where delivery.delivery_identity = item->>'deliveryIdentity'
        and delivery.channel_mode = (item->>'channelMode')::public.communication_channel_mode
        and delivery.notification_event_id = v_event_id
        and delivery.channel = (item->>'channel')::public.notification_channel;
      if v_delivery_id is null then
        raise exception 'Communication delivery identity conflicts with persisted evidence.' using errcode = '23505';
      end if;
    else
      insert into public.notification_delivery_audit_events(
        notification_event_id, notification_delivery_id, event_name,
        error_category, correlation_id, idempotency_key
      ) values (
        v_event_id, v_delivery_id,
        case when item->>'state' = 'SUPPRESSED'
          then 'notification_delivery_suppressed'
          else 'notification_delivery_projected' end,
        nullif(item->>'suppressionReason', ''),
        (select correlation_id from public.notification_events where id = v_event_id),
        'notification_delivery_created:' || v_delivery_id::text
      ) on conflict (idempotency_key) do nothing;
    end if;
    v_ids := v_ids || jsonb_build_array(jsonb_build_object(
      'deliveryId', v_delivery_id,
      'deliveryIdentity', item->>'deliveryIdentity',
      'channel', item->>'channel',
      'channelMode', item->>'channelMode',
      'state', item->>'state'
    ));
  end loop;

  return jsonb_build_object('intentId', v_intent_id, 'eventId', v_event_id, 'deliveries', v_ids);
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
      orders.submitted_by recipient_user_id, lower(btrim(auth_user.email)) recipient,
      case when events.payload->>'locale' in ('ru', 'ro') then events.payload->>'locale' else 'ru' end locale
    from public.notification_events events
    join public.partner_orders orders on orders.id = events.partner_order_id
      and orders.company_id = events.company_id and orders.status = 'submitted'
      and orders.integration_status = 'confirmed'
    join public.partner_companies companies on companies.id = events.company_id and companies.status = 'active'
    join public.company_memberships memberships on memberships.company_id = events.company_id
      and memberships.user_id = orders.submitted_by and memberships.status = 'active'
    join public.user_profiles profiles on profiles.id = orders.submitted_by and profiles.status = 'active'
    join auth.users auth_user on auth_user.id = profiles.id
      and auth_user.email_confirmed_at is not null and auth_user.email is not null
    where events.status in ('queued', 'failed') and events.available_at <= now()
      and events.event_type = 'order.registered_in_1c'
      and lower(btrim(auth_user.email)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    order by events.available_at, events.created_at, events.id
    limit normalized_batch_size
  )
  insert into public.notification_deliveries(
    notification_event_id, channel, recipient_user_id, recipient,
    template_version, idempotency_key, status, next_attempt_at,
    channel_mode, delivery_state, template_key, template_revision,
    recipient_locale, sensitivity, adapter_identity
  )
  select eligible.event_id, 'email', eligible.recipient_user_id, eligible.recipient,
    2, eligible.event_type || ':' || eligible.partner_order_id::text || ':email:' || eligible.recipient || ':v2',
    'queued', now(), 'LIVE', 'QUEUED', eligible.event_type, 'v2', eligible.locale,
    'PARTNER_PRIVATE', 'smtp'
  from eligible
  on conflict (delivery_identity, channel_mode) do nothing;

  with unavailable as (
    update public.notification_events events
    set status = 'dead_letter', processed_at = now(), last_error_category = 'recipient_unavailable'
    where events.status in ('queued', 'failed') and events.available_at <= now()
      and events.event_type = 'order.registered_in_1c'
      and not exists (select 1 from public.notification_deliveries delivery where delivery.notification_event_id = events.id)
      and not exists (
        select 1 from public.partner_orders orders
        join public.partner_companies companies on companies.id = events.company_id and companies.status = 'active'
        join public.company_memberships memberships on memberships.company_id = events.company_id
          and memberships.user_id = orders.submitted_by and memberships.status = 'active'
        join public.user_profiles profiles on profiles.id = orders.submitted_by and profiles.status = 'active'
        join auth.users auth_user on auth_user.id = profiles.id
          and auth_user.email_confirmed_at is not null and auth_user.email is not null
        where orders.id = events.partner_order_id
          and lower(btrim(auth_user.email)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
      )
    returning events.id, events.correlation_id
  )
  insert into public.notification_delivery_audit_events(
    notification_event_id, event_name, error_category, correlation_id, idempotency_key
  )
  select unavailable.id, 'notification_delivery_dead_letter', 'recipient_unavailable',
    unavailable.correlation_id, 'notification_delivery_dead_letter:' || unavailable.id::text || ':recipient_unavailable'
  from unavailable on conflict (idempotency_key) do nothing;

  with due as (
    select deliveries.id
    from public.notification_deliveries deliveries
    where deliveries.channel_mode = 'LIVE'
      and deliveries.attempt_count < 3
      and (
        (deliveries.delivery_state in ('READY', 'QUEUED', 'FAILED_RETRYABLE') and deliveries.next_attempt_at <= now())
        or (deliveries.delivery_state = 'PROCESSING' and deliveries.leased_until < now())
      )
    order by deliveries.next_attempt_at, deliveries.created_at, deliveries.id
    for update of deliveries skip locked
    limit normalized_batch_size
  ), updated as (
    update public.notification_deliveries deliveries set
      status = 'processing', delivery_state = 'PROCESSING',
      attempt_count = deliveries.attempt_count + 1,
      attempt_sequence = deliveries.attempt_sequence + 1,
      lease_token = claim_token,
      leased_until = now() + make_interval(secs => normalized_lease_seconds),
      last_error_category = null
    from due where deliveries.id = due.id
    returning deliveries.*
  ), event_updates as (
    update public.notification_events events set status = 'processing', last_error_category = null
    where events.id in (select notification_event_id from updated)
    returning events.id
  ), attempt_rows as (
    insert into public.notification_delivery_attempts(
      notification_delivery_id, attempt_number, lease_token, channel,
      adapter_identity, started_at
    )
    select updated.id, updated.attempt_sequence, updated.lease_token, updated.channel,
      updated.adapter_identity, now() from updated
    on conflict (notification_delivery_id, lease_token) do nothing
    returning id
  ), audits as (
    insert into public.notification_delivery_audit_events(
      notification_event_id, notification_delivery_id, event_name, attempt,
      correlation_id, idempotency_key
    )
    select updated.notification_event_id, updated.id, 'notification_delivery_claimed',
      updated.attempt_count, events.correlation_id,
      'notification_delivery_claimed:' || updated.id::text || ':' || updated.lease_token::text
    from updated join public.notification_events events on events.id = updated.notification_event_id
    on conflict (idempotency_key) do nothing returning id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId', updated.id, 'eventId', events.id, 'intentId', events.intent_id,
    'eventType', events.event_type, 'companyId', events.company_id,
    'partnerOrderId', events.partner_order_id, 'correlationId', events.communication_correlation_id,
    'payloadVersion', events.payload_version, 'payload', events.payload,
    'channel', updated.channel, 'channelMode', updated.channel_mode,
    'recipient', updated.recipient, 'recipientLocale', updated.recipient_locale,
    'templateKey', updated.template_key, 'templateVersion', updated.template_version,
    'templateRevision', updated.template_revision, 'sensitivity', updated.sensitivity,
    'renderedSnapshot', updated.rendered_snapshot, 'attempt', updated.attempt_count,
    'attemptSequence', updated.attempt_sequence, 'leaseToken', updated.lease_token,
    'idempotencyKey', updated.idempotency_key
  ) order by updated.created_at, updated.id), '[]'::jsonb) into claimed
  from updated join public.notification_events events on events.id = updated.notification_event_id;
  return coalesce(claimed, '[]'::jsonb);
end;
$$;

create or replace function public.complete_notification_delivery(
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
  next_state public.communication_delivery_state;
  next_attempt timestamptz;
  audit_name text;
  normalized_error text := nullif(left(lower(btrim(coalesce(p_error_category, ''))), 100), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Notification delivery completion requires service role.' using errcode = '42501';
  end if;
  select * into delivery from public.notification_deliveries where id = p_delivery_id for update;
  if delivery.id is null then raise exception 'Notification delivery was not found.' using errcode = 'P0002'; end if;
  if delivery.delivery_state = 'ACCEPTED' then
    return jsonb_build_object('deliveryId', delivery.id, 'status', delivery.status);
  end if;
  if delivery.channel_mode <> 'LIVE' or delivery.delivery_state <> 'PROCESSING' or delivery.lease_token <> p_lease_token then
    return jsonb_build_object('deliveryId', delivery.id, 'status', 'stale_claim');
  end if;
  select * into event_row from public.notification_events where id = delivery.notification_event_id for update;

  if p_succeeded then
    next_status := 'sent'; next_state := 'ACCEPTED'; next_attempt := delivery.next_attempt_at;
    audit_name := 'notification_delivery_sent';
  elsif p_retryable and delivery.attempt_count < 3 then
    next_status := 'failed'; next_state := 'FAILED_RETRYABLE';
    next_attempt := now() + case delivery.attempt_count when 1 then interval '2 minutes' else interval '15 minutes' end;
    audit_name := 'notification_delivery_failed';
  else
    next_status := 'dead_letter'; next_state := 'FAILED_FINAL'; next_attempt := delivery.next_attempt_at;
    audit_name := 'notification_delivery_dead_letter';
  end if;

  update public.notification_deliveries set
    status = next_status, delivery_state = next_state, next_attempt_at = next_attempt,
    provider_message_id = case when p_succeeded then nullif(left(btrim(coalesce(p_provider_message_id, '')), 300), '') else provider_message_id end,
    last_error_category = case when p_succeeded then null else coalesce(normalized_error, 'provider_unavailable') end,
    last_duration_ms = case when p_duration_ms is null then null else least(greatest(p_duration_ms, 0), 300000) end,
    lease_token = null, leased_until = null,
    sent_at = case when p_succeeded then coalesce(sent_at, now()) else sent_at end,
    accepted_at = case when p_succeeded then coalesce(accepted_at, now()) else accepted_at end
  where id = delivery.id;

  update public.notification_delivery_attempts set
    finished_at = now(),
    result_classification = case when p_succeeded then 'ACCEPTED' when next_state = 'FAILED_RETRYABLE' then 'RETRYABLE' else 'FINAL' end,
    safe_error_category = case when p_succeeded then null else coalesce(normalized_error, 'provider_unavailable') end,
    duration_ms = case when p_duration_ms is null then null else least(greatest(p_duration_ms, 0), 300000) end
  where notification_delivery_id = delivery.id and lease_token = p_lease_token and finished_at is null;

  if p_succeeded then
    insert into public.notification_delivery_receipts(
      notification_delivery_id, delivery_identity, channel, adapter_identity,
      accepted_at, provider_reference, template_key, template_revision, recipient_fingerprint
    ) values (
      delivery.id, delivery.delivery_identity, delivery.channel,
      coalesce(delivery.adapter_identity, delivery.channel::text), now(),
      nullif(left(btrim(coalesce(p_provider_message_id, '')), 300), ''),
      delivery.template_key, delivery.template_revision, delivery.recipient_fingerprint
    ) on conflict (notification_delivery_id) do nothing;
  end if;

  update public.notification_events event set
    status = case
      when exists (select 1 from public.notification_deliveries d where d.notification_event_id = event.id and d.delivery_state = 'PROCESSING') then 'processing'::public.notification_delivery_status
      when exists (select 1 from public.notification_deliveries d where d.notification_event_id = event.id and d.delivery_state = 'FAILED_RETRYABLE') then 'failed'::public.notification_delivery_status
      when exists (select 1 from public.notification_deliveries d where d.notification_event_id = event.id and d.delivery_state in ('READY', 'QUEUED')) then 'queued'::public.notification_delivery_status
      when exists (select 1 from public.notification_deliveries d where d.notification_event_id = event.id and d.delivery_state = 'FAILED_FINAL') then 'dead_letter'::public.notification_delivery_status
      when exists (select 1 from public.notification_deliveries d where d.notification_event_id = event.id and d.delivery_state = 'ACCEPTED') then 'sent'::public.notification_delivery_status
      when exists (select 1 from public.notification_deliveries d where d.notification_event_id = event.id and d.delivery_state = 'PROJECTED') then 'projected'::public.notification_delivery_status
      else 'suppressed'::public.notification_delivery_status
    end,
    available_at = coalesce((
      select min(d.next_attempt_at) from public.notification_deliveries d
      where d.notification_event_id = event.id and d.delivery_state = 'FAILED_RETRYABLE'
    ), event.available_at),
    processed_at = case when exists (
      select 1 from public.notification_deliveries d
      where d.notification_event_id = event.id
        and d.delivery_state in ('READY', 'QUEUED', 'PROCESSING', 'FAILED_RETRYABLE', 'PROJECTED')
    ) then null else now() end,
    last_error_category = (
      select d.last_error_category from public.notification_deliveries d
      where d.notification_event_id = event.id and d.last_error_category is not null
      order by d.updated_at desc, d.id desc limit 1
    )
  where event.id = event_row.id;

  insert into public.notification_delivery_audit_events(
    notification_event_id, notification_delivery_id, event_name, attempt,
    error_category, correlation_id, idempotency_key
  ) values (
    event_row.id, delivery.id, audit_name, delivery.attempt_count,
    case when p_succeeded then null else coalesce(normalized_error, 'provider_unavailable') end,
    event_row.correlation_id, audit_name || ':' || delivery.id::text || ':' || delivery.lease_token::text
  ) on conflict (idempotency_key) do nothing;

  return jsonb_build_object('deliveryId', delivery.id, 'status', next_status,
    'nextAttemptAt', case when next_status = 'failed' then next_attempt else null end);
end;
$$;

create or replace function public.retry_admin_notification_delivery(p_delivery_id uuid)
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
  if auth.uid() is null or not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'Notification delivery retry is not allowed.' using errcode = '42501';
  end if;
  select * into delivery from public.notification_deliveries where id = p_delivery_id for update;
  if delivery.id is null then raise exception 'Notification delivery was not found.' using errcode = 'P0002'; end if;
  if delivery.channel_mode <> 'LIVE' or delivery.delivery_state not in ('FAILED_RETRYABLE', 'FAILED_FINAL') then
    return jsonb_build_object('deliveryId', delivery.id, 'status', delivery.status, 'retried', false);
  end if;
  select * into event_row from public.notification_events where id = delivery.notification_event_id for update;
  update public.notification_deliveries set status = 'queued', delivery_state = 'QUEUED',
    attempt_count = 0, next_attempt_at = now(), last_error_category = null,
    lease_token = null, leased_until = null where id = delivery.id;
  update public.notification_events set status = 'queued', available_at = now(), processed_at = null,
    last_error_category = null where id = event_row.id;
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

create or replace function public.publish_finance_reminder_dry_run(
  p_business_date date,
  p_duration_ms integer,
  p_projections jsonb,
  p_suppressions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_run_id uuid;
  v_duplicate_count integer;
  intent_group record;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Finance reminder simulation is server-only.' using errcode = '42501';
  end if;
  if p_duration_ms < 0 or jsonb_typeof(p_projections) <> 'array' or jsonb_typeof(p_suppressions) <> 'array' then
    raise exception 'Finance reminder dry-run input is invalid.' using errcode = '22023';
  end if;
  select coalesce(sum(grouped.row_count - 1), 0)::integer into v_duplicate_count
  from (select count(*) row_count from jsonb_to_recordset(p_projections) source(fingerprint text)
    group by source.fingerprint having count(*) > 1) grouped;
  insert into public.partner_finance_reminder_runs(business_date, policy_version, duration_ms)
  values (p_business_date, 'FINANCE_REMINDER_V1', p_duration_ms) returning id into v_run_id;
  insert into public.partner_finance_reminder_projections(
    run_id, company_id, channel, recipient_user_id, recipient_email, locale,
    milestone, timing_states, obligation_ids, totals_by_currency, subject, body,
    from_name, from_email, cta_label, cta_target, content_payload, delivery_identity, fingerprint
  )
  select v_run_id, source.company_id, source.channel, source.recipient_user_id,
    nullif(lower(btrim(source.recipient_email)), ''), source.locale, source.milestone,
    coalesce(source.timing_states, '{}'::text[]), source.obligation_ids, source.totals_by_currency,
    source.subject, source.body, nullif(btrim(source.from_name), ''),
    nullif(lower(btrim(source.from_email)), ''), coalesce(source.cta_label, ''),
    coalesce(source.cta_target, '/cabinet/finance'), coalesce(source.content_payload, '{}'::jsonb),
    coalesce(source.delivery_identity, encode(extensions.digest('LEGACY_COMPAT|' || source.fingerprint, 'sha256'), 'hex')),
    source.fingerprint
  from jsonb_to_recordset(p_projections) source(
    company_id uuid, channel text, recipient_user_id uuid, recipient_email text,
    locale text, milestone text, timing_states text[], obligation_ids uuid[], totals_by_currency jsonb,
    subject text, body text, from_name text, from_email text, cta_label text, cta_target text,
    content_payload jsonb, delivery_identity text, fingerprint text
  ) on conflict (run_id, fingerprint) do nothing;
  insert into public.partner_finance_reminder_suppressions(run_id, company_id, obligation_id, reason)
  select v_run_id, source.company_id, source.obligation_id, source.reason
  from jsonb_to_recordset(p_suppressions) source(company_id uuid, obligation_id uuid, reason text);

  for intent_group in
    select
      projection.content_payload#>>'{communication,intentId}' intent_id,
      min(projection.company_id::text)::uuid company_id,
      min(projection.recipient_user_id::text)::uuid recipient_user_id,
      min(projection.content_payload#>>'{communication,businessEventType}') event_type,
      coalesce(
        min(projection.content_payload#>>'{communication,businessIdentity}'),
        min(projection.content_payload#>>'{communication,intentId}')
      ) business_identity,
      min(projection.content_payload#>>'{communication,correlationId}') correlation_id,
      min(projection.content_payload#>>'{communication,sensitivity}') sensitivity,
      (jsonb_agg(projection.content_payload#>'{communication,businessEntityReferences}')->0) business_references,
      jsonb_agg(jsonb_build_object(
        'deliveryIdentity', projection.delivery_identity,
        'channel', case projection.channel when 'sms_future' then 'sms' else projection.channel end,
        'channelMode', projection.content_payload#>>'{communication,mode}',
        'state', case when projection.content_payload#>>'{communication,mode}' = 'DISABLED'
          then 'SUPPRESSED' else projection.content_payload#>>'{communication,state}' end,
        'suppressionReason', case when projection.content_payload#>>'{communication,mode}' = 'DISABLED'
          then 'CHANNEL_DISABLED' else projection.content_payload#>>'{communication,suppressionReason}' end,
        'recipient', case when projection.channel = 'email'
          then projection.recipient_email else projection.recipient_user_id::text end,
        'recipientUserId', projection.recipient_user_id,
        'locale', projection.locale,
        'templateKey', projection.content_payload#>>'{communication,templateKey}',
        'templateRevision', projection.content_payload#>>'{communication,templateVersion}',
        'adapterIdentity', case when projection.channel = 'email' then 'smtp' else null end,
        'renderSnapshot', jsonb_build_object(
          'subject', projection.subject,
          'textBody', projection.body,
          'providerPayload', projection.content_payload - 'communication'
        )
      ) order by projection.channel) deliveries
    from public.partner_finance_reminder_projections projection
    where projection.run_id = v_run_id
    group by projection.content_payload#>>'{communication,intentId}'
  loop
    perform public.persist_communication_intent(
      jsonb_build_object(
        'intentId', intent_group.intent_id,
        'businessEventType', intent_group.event_type,
        'businessEntityReferences', intent_group.business_references,
        'companyId', intent_group.company_id,
        'recipientUserId', intent_group.recipient_user_id,
        'businessIdentity', intent_group.business_identity,
        'correlationId', intent_group.correlation_id,
        'sensitivity', intent_group.sensitivity,
        'scheduledBusinessDate', p_business_date
      ),
      intent_group.deliveries
    );
  end loop;

  update public.partner_finance_reminder_runs run set
    eligible_company_count = (select count(distinct company_id) from public.partner_finance_reminder_projections where run_id = run.id and channel in ('email', 'in_app')),
    obligation_count = (select coalesce(sum(cardinality(obligation_ids)), 0) from public.partner_finance_reminder_projections where run_id = run.id and channel = 'in_app'),
    projected_email_count = (select count(*) from public.partner_finance_reminder_projections where run_id = run.id and channel = 'email'),
    projected_in_app_count = (select count(*) from public.partner_finance_reminder_projections where run_id = run.id and channel = 'in_app'),
    future_sms_eligible_count = (select count(*) from public.partner_finance_reminder_projections where run_id = run.id and channel = 'sms_future'),
    suppressed_count = (select count(*) from public.partner_finance_reminder_suppressions where run_id = run.id),
    duplicate_count = v_duplicate_count where run.id = v_run_id;
  return (select to_jsonb(run) from public.partner_finance_reminder_runs run where run.id = v_run_id);
end;
$$;

create or replace function public.get_admin_notification_gateway_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare summary jsonb;
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Notification diagnostics access denied.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'queued', count(*) filter (where delivery_state in ('READY', 'QUEUED')),
    'processing', count(*) filter (where delivery_state = 'PROCESSING'),
    'sentLast24Hours', count(*) filter (where delivery_state = 'ACCEPTED' and accepted_at >= now() - interval '24 hours'),
    'failed', count(*) filter (where delivery_state = 'FAILED_RETRYABLE'),
    'deadLetter', count(*) filter (where delivery_state = 'FAILED_FINAL') + (
      select count(*) from public.notification_events event where event.status = 'dead_letter'
        and not exists (select 1 from public.notification_deliveries delivery where delivery.notification_event_id = event.id)
    ),
    'stateCounts', jsonb_build_object(
      'projected', count(*) filter (where delivery_state = 'PROJECTED'),
      'suppressed', count(*) filter (where delivery_state = 'SUPPRESSED'),
      'ready', count(*) filter (where delivery_state = 'READY'),
      'queued', count(*) filter (where delivery_state = 'QUEUED'),
      'processing', count(*) filter (where delivery_state = 'PROCESSING'),
      'accepted', count(*) filter (where delivery_state = 'ACCEPTED'),
      'failedRetryable', count(*) filter (where delivery_state = 'FAILED_RETRYABLE'),
      'failedFinal', count(*) filter (where delivery_state = 'FAILED_FINAL'),
      'cancelled', count(*) filter (where delivery_state = 'CANCELLED')
    )
  ) into summary from public.notification_deliveries;
  return summary || jsonb_build_object(
    'byCommunicationTypeChannel', coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventType', grouped.event_type, 'channel', grouped.channel,
        'state', grouped.delivery_state, 'count', grouped.row_count
      ) order by grouped.event_type, grouped.channel, grouped.delivery_state)
      from (
        select event.event_type, delivery.channel::text channel,
          delivery.delivery_state::text delivery_state, count(*) row_count
        from public.notification_deliveries delivery
        join public.notification_events event on event.id = delivery.notification_event_id
        group by event.event_type, delivery.channel, delivery.delivery_state
      ) grouped
    ), '[]'::jsonb),
    'recentDeliveries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'deliveryId', recent.delivery_id, 'eventId', recent.event_id,
        'eventType', recent.event_type, 'companyId', recent.company_id,
        'companyName', recent.company_name, 'partnerOrderId', recent.partner_order_id,
        'orderNumber', recent.order_number, 'channel', recent.channel,
        'mode', recent.channel_mode, 'recipient', recent.recipient_reference,
        'status', recent.status, 'state', recent.delivery_state,
        'attempts', recent.attempt_count, 'sentAt', recent.accepted_at,
        'attemptedAt', recent.attempted_at, 'safeError', recent.last_error_category,
        'correlationId', recent.communication_correlation_id,
        'templateKey', recent.template_key, 'templateVersion', recent.template_revision,
        'createdAt', recent.created_at
      ) order by recent.created_at desc, recent.delivery_id desc)
      from (
        select delivery.id delivery_id, event.id event_id, event.event_type,
          event.company_id, company.display_name company_name, event.partner_order_id,
          orders.external_1c_number order_number, delivery.channel::text channel,
          delivery.channel_mode::text channel_mode,
          case when delivery.sensitivity = 'FINANCIAL_PRIVATE'
            then 'fingerprint:' || left(delivery.recipient_fingerprint, 12)
            else delivery.recipient end recipient_reference,
          delivery.status::text status, delivery.delivery_state::text delivery_state,
          delivery.attempt_count, delivery.accepted_at,
          attempt.started_at attempted_at, delivery.last_error_category,
          event.communication_correlation_id, delivery.template_key,
          delivery.template_revision, delivery.created_at
        from public.notification_deliveries delivery
        join public.notification_events event on event.id = delivery.notification_event_id
        join public.partner_companies company on company.id = event.company_id
        left join public.partner_orders orders on orders.id = event.partner_order_id
        left join lateral (
          select a.started_at from public.notification_delivery_attempts a
          where a.notification_delivery_id = delivery.id order by a.attempt_number desc limit 1
        ) attempt on true
        order by delivery.created_at desc, delivery.id desc limit 50
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.prevent_notification_delivery_receipt_mutation() from public, anon, authenticated, service_role;
revoke all on function public.prepare_notification_event_core() from public, anon, authenticated, service_role;
revoke all on function public.prepare_notification_delivery_core() from public, anon, authenticated, service_role;
revoke all on function public.persist_communication_intent(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_communication_intent(jsonb, jsonb) to service_role;
revoke all on table public.notification_events from service_role;
revoke all on table public.notification_deliveries from service_role;
revoke all on table public.notification_delivery_audit_events from service_role;
grant select, insert, update on table public.notification_events to service_role;
grant select, insert, update on table public.notification_deliveries to service_role;
grant select, insert on table public.notification_delivery_audit_events to service_role;

comment on table public.notification_events is
  'Shared application-owned communication intent outbox. Legacy order rows remain valid through an additive compatibility bridge.';
comment on table public.notification_deliveries is
  'Durable per-channel communication delivery state. DRY_RUN and DISABLED rows cannot enter LIVE claims.';
comment on table public.notification_delivery_attempts is
  'Service-only provider attempt evidence. Contains safe classifications, never provider secrets or message bodies.';
comment on table public.notification_delivery_receipts is
  'Immutable provider acceptance evidence. ACCEPTED means provider acceptance, never delivered or read.';
comment on function public.persist_communication_intent(jsonb, jsonb) is
  'Service-only atomic intent and channel-delivery persistence boundary with separate DRY_RUN/LIVE identities.';

commit;
