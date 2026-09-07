begin;

alter table public.notification_events
  add column communication_purpose text null,
  add constraint notification_events_communication_purpose_check check (
    communication_purpose is null or communication_purpose in ('TRANSACTIONAL','FINANCE','SECURITY','SUPPORT','MARKETING')
  );

update public.notification_events set communication_purpose = case
  when event_type in ('order.registered_in_1c','proposal.delivery','company.invitation') then 'TRANSACTIONAL'
  when event_type like 'finance.%' then 'FINANCE'
  when event_type like 'security.%' then 'SECURITY'
  when event_type like 'support.%' then 'SUPPORT'
  when event_type like 'marketing.%' or event_type like 'commercial.%' then 'MARKETING'
  else null end;

alter table public.notification_deliveries
  add column requested_mode public.communication_channel_mode,
  add column effective_mode public.communication_channel_mode,
  add column policy_decision text,
  add column preference_result text,
  add column rate_limit_result text,
  add column sandbox_result text,
  add column sandbox_actual_recipient text null,
  add constraint notification_deliveries_policy_decision_check check (policy_decision in ('ALLOW','SUPPRESS')),
  add constraint notification_deliveries_preference_result_check check (
    preference_result in ('ALLOWED','SUPPRESSED','NOT_APPLICABLE','NOT_CONFIGURED')
  ),
  add constraint notification_deliveries_rate_limit_result_check check (
    rate_limit_result in ('ALLOWED','RATE_LIMITED','NOT_EVALUATED')
  ),
  add constraint notification_deliveries_sandbox_result_check check (
    sandbox_result in ('NOT_APPLICABLE','ALLOWED','RECIPIENT_NOT_ALLOWED','PROVIDER_UNAVAILABLE')
  );

update public.notification_deliveries delivery set
  requested_mode = delivery.channel_mode,
  effective_mode = case when delivery.delivery_state = 'SUPPRESSED' then 'DISABLED'::public.communication_channel_mode else delivery.channel_mode end,
  policy_decision = case when delivery.delivery_state = 'SUPPRESSED' then 'SUPPRESS' else 'ALLOW' end,
  preference_result = case
    when event.communication_purpose in ('TRANSACTIONAL','SECURITY') then 'NOT_APPLICABLE'
    when event.communication_purpose = 'FINANCE' and delivery.channel = 'email' then 'NOT_APPLICABLE'
    when event.communication_purpose = 'FINANCE' and delivery.channel = 'in_app' then 'ALLOWED'
    else 'NOT_CONFIGURED' end,
  rate_limit_result = case when delivery.delivery_state = 'ACCEPTED' then 'ALLOWED' else 'NOT_EVALUATED' end,
  sandbox_result = 'NOT_APPLICABLE'
from public.notification_events event where event.id = delivery.notification_event_id;

alter table public.notification_deliveries
  alter column requested_mode set not null,
  alter column effective_mode set not null,
  alter column policy_decision set not null,
  alter column preference_result set not null,
  alter column rate_limit_result set not null,
  alter column sandbox_result set not null,
  drop constraint notification_deliveries_mode_state_check,
  add constraint notification_deliveries_mode_state_check check (
    (channel_mode in ('LIVE','SANDBOX') and delivery_state in ('READY','QUEUED','PROCESSING','ACCEPTED','FAILED_RETRYABLE','FAILED_FINAL','SUPPRESSED','CANCELLED'))
    or (channel_mode = 'DRY_RUN' and delivery_state in ('PROJECTED','SUPPRESSED','CANCELLED'))
    or (channel_mode = 'DISABLED' and delivery_state in ('SUPPRESSED','CANCELLED'))
  );

alter table public.notification_delivery_receipts
  add column channel_mode public.communication_channel_mode not null default 'LIVE';
alter table public.notification_delivery_receipts
  add constraint notification_delivery_receipts_live_mode_check check (channel_mode in ('LIVE','SANDBOX'));

create table public.notification_delivery_rate_limit_reservations (
  id uuid primary key default gen_random_uuid(),
  notification_delivery_id uuid not null unique references public.notification_deliveries(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  communication_purpose text not null check (communication_purpose in ('TRANSACTIONAL','FINANCE','SECURITY','SUPPORT','MARKETING')),
  channel public.notification_channel not null,
  recipient_fingerprint text not null check (recipient_fingerprint ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  outcome text not null check (outcome in ('ALLOWED','RATE_LIMITED')),
  recipient_count integer not null check (recipient_count >= 0),
  company_count integer not null check (company_count >= 0),
  recipient_limit integer not null check (recipient_limit > 0),
  company_limit integer not null check (company_limit > 0),
  created_at timestamptz not null default now()
);
create index notification_rate_limit_recipient_window_idx
  on public.notification_delivery_rate_limit_reservations(recipient_fingerprint, channel, window_started_at)
  where outcome = 'ALLOWED';
create index notification_rate_limit_company_window_idx
  on public.notification_delivery_rate_limit_reservations(company_id, communication_purpose, channel, window_started_at)
  where outcome = 'ALLOWED';

alter table public.notification_delivery_rate_limit_reservations enable row level security;
revoke all on table public.notification_delivery_rate_limit_reservations from public, anon, authenticated, service_role;
grant select, insert on table public.notification_delivery_rate_limit_reservations to service_role;

create or replace function public.prepare_notification_event_governance()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.communication_purpose := case
    when new.event_type in ('order.registered_in_1c','proposal.delivery','company.invitation') then 'TRANSACTIONAL'
    when new.event_type like 'finance.%' then 'FINANCE'
    when new.event_type like 'security.%' then 'SECURITY'
    when new.event_type like 'support.%' then 'SUPPORT'
    when new.event_type like 'marketing.%' or new.event_type like 'commercial.%' then 'MARKETING'
    else null end;
  return new;
end;
$$;
create trigger prepare_notification_event_governance
before insert or update of event_type on public.notification_events
for each row execute function public.prepare_notification_event_governance();

create or replace function public.prepare_notification_delivery_governance()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_purpose text;
  v_explicit_preference public.partner_notification_preferences%rowtype;
begin
  select event.communication_purpose into v_purpose
  from public.notification_events event where event.id = new.notification_event_id;
  new.requested_mode := coalesce(new.requested_mode, new.channel_mode);
  new.effective_mode := coalesce(new.effective_mode,
    case when new.delivery_state = 'SUPPRESSED' then 'DISABLED'::public.communication_channel_mode else new.channel_mode end);
  if v_purpose = 'FINANCE' and new.channel = 'in_app' then
    select preference.* into v_explicit_preference
    from public.partner_notification_preferences preference
    join public.notification_events event on event.id = new.notification_event_id
    where preference.company_id = event.company_id
      and preference.user_id = new.recipient_user_id and preference.event_group = 'finance';
    new.preference_result := coalesce(new.preference_result, case
      when v_explicit_preference.company_id is null then 'ALLOWED'
      when v_explicit_preference.in_app_enabled and v_explicit_preference.delivery_mode <> 'off' then 'ALLOWED'
      else 'SUPPRESSED' end);
  else
    new.preference_result := coalesce(new.preference_result, case
      when v_purpose in ('TRANSACTIONAL','SECURITY') then 'NOT_APPLICABLE'
      when v_purpose = 'FINANCE' and new.channel = 'email' then 'NOT_APPLICABLE'
      else 'NOT_CONFIGURED' end);
  end if;
  if new.preference_result in ('SUPPRESSED','NOT_CONFIGURED') then
    new.delivery_state := 'SUPPRESSED';
    new.status := 'suppressed';
    new.effective_mode := 'DISABLED';
    new.suppression_reason := coalesce(new.suppression_reason,
      case when new.preference_result = 'SUPPRESSED' then 'PREFERENCE_DISABLED' else 'PURPOSE_DISABLED' end);
  end if;
  new.rate_limit_result := coalesce(new.rate_limit_result, 'NOT_EVALUATED');
  new.sandbox_result := coalesce(new.sandbox_result, case when new.channel_mode = 'SANDBOX' then 'RECIPIENT_NOT_ALLOWED' else 'NOT_APPLICABLE' end);
  new.policy_decision := coalesce(new.policy_decision, case
    when new.delivery_state = 'SUPPRESSED' or new.preference_result in ('SUPPRESSED','NOT_CONFIGURED') then 'SUPPRESS'
    else 'ALLOW' end);
  return new;
end;
$$;
create trigger prepare_notification_delivery_governance
before insert on public.notification_deliveries
for each row execute function public.prepare_notification_delivery_governance();

create or replace function public.prepare_notification_receipt_governance()
returns trigger language plpgsql set search_path = '' as $$
begin
  select delivery.channel_mode into new.channel_mode
  from public.notification_deliveries delivery where delivery.id = new.notification_delivery_id;
  return new;
end;
$$;
create trigger prepare_notification_receipt_governance
before insert on public.notification_delivery_receipts
for each row execute function public.prepare_notification_receipt_governance();

create or replace function public.reserve_notification_delivery_rate_limit(
  p_delivery_id uuid,
  p_lease_token uuid
)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_event public.notification_events%rowtype;
  v_existing public.notification_delivery_rate_limit_reservations%rowtype;
  v_window timestamptz := date_trunc('hour', now());
  v_recipient_count integer;
  v_company_count integer;
  v_recipient_limit constant integer := 10;
  v_company_limit constant integer := 100;
  v_outcome text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Communication rate limit is service-only.' using errcode = '42501';
  end if;
  select * into v_delivery from public.notification_deliveries
  where id = p_delivery_id and delivery_state = 'PROCESSING' and lease_token = p_lease_token for update;
  if v_delivery.id is null or v_delivery.channel_mode not in ('LIVE','SANDBOX') then
    raise exception 'Communication rate-limit claim is stale.' using errcode = '55000';
  end if;
  select * into v_existing from public.notification_delivery_rate_limit_reservations
  where notification_delivery_id = v_delivery.id;
  if v_existing.id is not null then
    return jsonb_build_object('deliveryId',v_delivery.id,'outcome',v_existing.outcome,'recipientCount',v_existing.recipient_count,
      'companyCount',v_existing.company_count,'recipientLimit',v_existing.recipient_limit,'companyLimit',v_existing.company_limit);
  end if;
  select * into v_event from public.notification_events where id = v_delivery.notification_event_id;
  if v_event.communication_purpose is null then
    raise exception 'Communication purpose is not governed.' using errcode = '22023';
  end if;

  -- Fixed lock order plus transaction-scoped advisory locks makes parallel workers deterministic.
  perform pg_advisory_xact_lock(hashtextextended('recipient|' || v_delivery.recipient_fingerprint || '|' || v_delivery.channel::text || '|' || v_window::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('company|' || v_event.company_id::text || '|' || v_event.communication_purpose || '|' || v_delivery.channel::text || '|' || v_window::text, 0));
  select count(*) into v_recipient_count from public.notification_delivery_rate_limit_reservations
    where recipient_fingerprint = v_delivery.recipient_fingerprint and channel = v_delivery.channel
      and window_started_at = v_window and outcome = 'ALLOWED';
  select count(*) into v_company_count from public.notification_delivery_rate_limit_reservations
    where company_id = v_event.company_id and communication_purpose = v_event.communication_purpose
      and channel = v_delivery.channel and window_started_at = v_window and outcome = 'ALLOWED';
  v_outcome := case when v_recipient_count >= v_recipient_limit or v_company_count >= v_company_limit
    then 'RATE_LIMITED' else 'ALLOWED' end;
  if v_outcome = 'ALLOWED' then
    v_recipient_count := v_recipient_count + 1;
    v_company_count := v_company_count + 1;
  end if;
  insert into public.notification_delivery_rate_limit_reservations(
    notification_delivery_id,company_id,communication_purpose,channel,recipient_fingerprint,
    window_started_at,outcome,recipient_count,company_count,recipient_limit,company_limit
  ) values (v_delivery.id,v_event.company_id,v_event.communication_purpose,v_delivery.channel,
    v_delivery.recipient_fingerprint,v_window,v_outcome,v_recipient_count,v_company_count,v_recipient_limit,v_company_limit);
  update public.notification_deliveries set rate_limit_result = v_outcome where id = v_delivery.id;
  return jsonb_build_object('deliveryId',v_delivery.id,'outcome',v_outcome,'recipientCount',v_recipient_count,
    'companyCount',v_company_count,'recipientLimit',v_recipient_limit,'companyLimit',v_company_limit);
end;
$$;

create or replace function public.reserve_notification_delivery_rate_limits(p_claims jsonb)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_claim jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Communication rate limits are service-only.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_claims) <> 'array' or jsonb_array_length(p_claims) not between 1 and 50 then
    raise exception 'Communication rate-limit batch is invalid.' using errcode = '22023';
  end if;
  for v_claim in select value from jsonb_array_elements(p_claims) order by value->>'deliveryId'
  loop
    v_results := v_results || jsonb_build_array(public.reserve_notification_delivery_rate_limit(
      (v_claim->>'deliveryId')::uuid,(v_claim->>'leaseToken')::uuid
    ));
  end loop;
  return v_results;
end;
$$;

revoke all on function public.prepare_notification_event_governance() from public, anon, authenticated, service_role;
revoke all on function public.prepare_notification_delivery_governance() from public, anon, authenticated, service_role;
revoke all on function public.prepare_notification_receipt_governance() from public, anon, authenticated, service_role;
revoke all on function public.reserve_notification_delivery_rate_limit(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_notification_delivery_rate_limit(uuid,uuid) to service_role;
revoke all on function public.reserve_notification_delivery_rate_limits(jsonb) from public, anon, authenticated;
grant execute on function public.reserve_notification_delivery_rate_limits(jsonb) to service_role;

comment on table public.notification_delivery_rate_limit_reservations is
  'Service-only durable hourly burst reservations. One row per delivery makes retries idempotent.';
comment on column public.notification_deliveries.preference_result is
  'Technical gateway preference outcome only; it is not a legal-consent assertion.';

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
    where deliveries.channel_mode in ('LIVE', 'SANDBOX')
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
    'purpose', events.communication_purpose, 'policyDecision', updated.policy_decision,
    'preferenceOutcome', updated.preference_result, 'rateLimitOutcome', updated.rate_limit_result,
    'sandboxOutcome', updated.sandbox_result,
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
  if delivery.channel_mode not in ('LIVE', 'SANDBOX') or delivery.delivery_state <> 'PROCESSING' or delivery.lease_token <> p_lease_token then
    return jsonb_build_object('deliveryId', delivery.id, 'status', 'stale_claim');
  end if;
  select * into event_row from public.notification_events where id = delivery.notification_event_id for update;

  if p_succeeded then
    next_status := 'sent'; next_state := 'ACCEPTED'; next_attempt := delivery.next_attempt_at;
    audit_name := 'notification_delivery_sent';
  elsif normalized_error in ('rate_limited','global_kill_switch','channel_kill_switch','channel_disabled','purpose_disabled','mode_disabled','preference_disabled','sandbox_recipient_not_allowed','duplicate_delivery','provider_unavailable') then
    next_status := 'suppressed'; next_state := 'SUPPRESSED'; next_attempt := delivery.next_attempt_at;
    audit_name := 'notification_delivery_suppressed';
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
    effective_mode = case when next_state = 'SUPPRESSED' then 'DISABLED'::public.communication_channel_mode else channel_mode end,
    policy_decision = case when next_state = 'SUPPRESSED' then 'SUPPRESS' else 'ALLOW' end,
    sandbox_result = case
      when normalized_error = 'sandbox_recipient_not_allowed' then 'RECIPIENT_NOT_ALLOWED'
      when channel_mode = 'SANDBOX' and p_succeeded then 'ALLOWED'
      else sandbox_result end,
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

commit;

begin;

create or replace function public.persist_communication_intent(
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
    or v_sensitivity not in ('PUBLIC', 'PARTNER_PRIVATE', 'FINANCIAL_PRIVATE', 'SECURITY_SENSITIVE')
    or p_intent->>'purpose' not in ('TRANSACTIONAL','FINANCE','SECURITY','SUPPORT','MARKETING') then
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
    business_identity, communication_correlation_id, sensitivity, communication_purpose
  ) values (
    v_event_type, v_company_id, null, gen_random_uuid(), 1,
    jsonb_strip_nulls(jsonb_build_object(
      'scheduledBusinessDate', p_intent->>'scheduledBusinessDate',
      'businessEntityReferences', p_intent->'businessEntityReferences'
    )),
    v_event_status, now(), v_intent_id, p_intent->'businessEntityReferences',
    v_business_identity, v_correlation, v_sensitivity, p_intent->>'purpose'
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
      or item->>'channelMode' not in ('DISABLED', 'DRY_RUN', 'SANDBOX', 'LIVE')
      or item->>'state' not in ('PROJECTED', 'SUPPRESSED', 'READY', 'QUEUED')
      or (item->>'channelMode' in ('LIVE', 'SANDBOX') and item->>'state' not in ('READY', 'QUEUED'))
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
      rendered_snapshot, suppression_reason, adapter_identity,
      requested_mode, effective_mode, policy_decision, preference_result,
      rate_limit_result, sandbox_result, sandbox_actual_recipient
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
      nullif(item->>'adapterIdentity', ''),
      coalesce(item->>'requestedMode', item->>'channelMode')::public.communication_channel_mode,
      coalesce(item->>'effectiveMode', item->>'channelMode')::public.communication_channel_mode,
      coalesce(item->>'policyDecision', case when item->>'state'='SUPPRESSED' then 'SUPPRESS' else 'ALLOW' end),
      coalesce(item->>'preferenceOutcome', 'NOT_CONFIGURED'),
      coalesce(item->>'rateLimitOutcome', 'NOT_EVALUATED'),
      coalesce(item->>'sandboxOutcome', 'NOT_APPLICABLE'),
      nullif(lower(btrim(item->>'sandboxActualRecipient')), '')
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

commit;


begin;

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
    'rateLimits', jsonb_build_object(
      'recipientPerHour', 10,
      'companyPurposeChannelPerHour', 100,
      'workerBatchDefault', 20,
      'workerBatchMaximum', 50,
      'allowedLast24Hours', (select count(*) from public.notification_delivery_rate_limit_reservations where outcome = 'ALLOWED' and created_at >= now() - interval '24 hours'),
      'limitedLast24Hours', (select count(*) from public.notification_delivery_rate_limit_reservations where outcome = 'RATE_LIMITED' and created_at >= now() - interval '24 hours')
    ),
    'governanceCounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'purpose', governed.purpose, 'channel', governed.channel,
        'decision', governed.decision, 'reason', governed.reason, 'count', governed.row_count
      ) order by governed.purpose, governed.channel, governed.decision, governed.reason)
      from (
        select coalesce(event.communication_purpose, 'UNKNOWN') purpose,
          delivery.channel::text channel, delivery.policy_decision decision,
          coalesce(delivery.suppression_reason, delivery.last_error_category, 'NONE') reason,
          count(*) row_count
        from public.notification_deliveries delivery
        join public.notification_events event on event.id = delivery.notification_event_id
        group by coalesce(event.communication_purpose, 'UNKNOWN'), delivery.channel,
          delivery.policy_decision, coalesce(delivery.suppression_reason, delivery.last_error_category, 'NONE')
      ) governed
    ), '[]'::jsonb),
    'byCommunicationTypeChannel', coalesce((
      select jsonb_agg(jsonb_build_object(
        'eventType', grouped.event_type, 'purpose', grouped.purpose, 'channel', grouped.channel,
        'mode', grouped.channel_mode, 'state', grouped.delivery_state, 'count', grouped.row_count
      ) order by grouped.event_type, grouped.channel, grouped.delivery_state)
      from (
        select event.event_type, coalesce(event.communication_purpose, 'UNKNOWN') purpose, delivery.channel::text channel,
          delivery.channel_mode::text channel_mode,
          delivery.delivery_state::text delivery_state, count(*) row_count
        from public.notification_deliveries delivery
        join public.notification_events event on event.id = delivery.notification_event_id
        group by event.event_type, event.communication_purpose, delivery.channel, delivery.channel_mode, delivery.delivery_state
      ) grouped
    ), '[]'::jsonb),
    'recentDeliveries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'deliveryId', recent.delivery_id, 'eventId', recent.event_id,
        'eventType', recent.event_type, 'purpose', recent.communication_purpose, 'companyId', recent.company_id,
        'companyName', recent.company_name, 'partnerOrderId', recent.partner_order_id,
        'orderNumber', recent.order_number, 'channel', recent.channel,
        'mode', recent.channel_mode, 'requestedMode', recent.requested_mode,
        'effectiveMode', recent.effective_mode, 'policyDecision', recent.policy_decision,
        'preferenceResult', recent.preference_result, 'rateLimitResult', recent.rate_limit_result,
        'sandboxResult', recent.sandbox_result, 'recipient', recent.recipient_reference,
        'status', recent.status, 'state', recent.delivery_state,
        'attempts', recent.attempt_count, 'sentAt', recent.accepted_at,
        'attemptedAt', recent.attempted_at, 'safeError', recent.last_error_category,
        'correlationId', recent.communication_correlation_id,
        'templateKey', recent.template_key, 'templateVersion', recent.template_revision,
        'createdAt', recent.created_at
      ) order by recent.created_at desc, recent.delivery_id desc)
      from (
        select delivery.id delivery_id, event.id event_id, event.event_type,
          coalesce(event.communication_purpose, 'UNKNOWN') communication_purpose, event.company_id, company.display_name company_name, event.partner_order_id,
          orders.external_1c_number order_number, delivery.channel::text channel,
          delivery.channel_mode::text channel_mode, delivery.requested_mode::text requested_mode,
          delivery.effective_mode::text effective_mode, delivery.policy_decision,
          delivery.preference_result, delivery.rate_limit_result, delivery.sandbox_result,
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

commit;
