begin;

alter table public.notification_delivery_attempts
  add column provider_code text null,
  add column provider_message text null,
  add column provider_timestamp text null;

alter table public.notification_delivery_attempts
  add constraint notification_delivery_attempts_provider_code_check
    check (provider_code is null or char_length(provider_code) between 1 and 40),
  add constraint notification_delivery_attempts_provider_message_check
    check (provider_message is null or char_length(provider_message) between 1 and 160),
  add constraint notification_delivery_attempts_provider_timestamp_check
    check (provider_timestamp is null or char_length(provider_timestamp) between 1 and 80);

alter table public.notification_delivery_receipts
  add column provider_code text null,
  add column provider_message text null,
  add column provider_timestamp text null;

alter table public.notification_delivery_receipts
  add constraint notification_delivery_receipts_provider_code_check
    check (provider_code is null or char_length(provider_code) between 1 and 40),
  add constraint notification_delivery_receipts_provider_message_check
    check (provider_message is null or char_length(provider_message) between 1 and 160),
  add constraint notification_delivery_receipts_provider_timestamp_check
    check (provider_timestamp is null or char_length(provider_timestamp) between 1 and 80);

create table public.notification_provider_rate_policies (
  provider_identity text not null,
  channel public.notification_channel not null,
  channel_mode public.communication_channel_mode not null,
  recipient_limit_per_hour integer not null check (recipient_limit_per_hour between 1 and 10000),
  company_limit_per_hour integer not null check (company_limit_per_hour between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_identity, channel, channel_mode),
  constraint notification_provider_rate_policies_provider_check
    check (provider_identity ~ '^[a-z0-9_-]{1,100}$')
);

alter table public.notification_provider_rate_policies enable row level security;
alter table public.notification_provider_rate_policies force row level security;
revoke all on table public.notification_provider_rate_policies from public, anon, authenticated, service_role;

insert into public.notification_provider_rate_policies(
  provider_identity, channel, channel_mode, recipient_limit_per_hour, company_limit_per_hour
) values ('moldcell', 'sms', 'SANDBOX', 1, 5);

create or replace function public.prepare_notification_receipt_governance()
returns trigger language plpgsql set search_path = '' as $$
begin
  select delivery.channel_mode into new.channel_mode
  from public.notification_deliveries delivery where delivery.id = new.notification_delivery_id;

  select attempt.provider_code, attempt.provider_message, attempt.provider_timestamp
    into new.provider_code, new.provider_message, new.provider_timestamp
  from public.notification_delivery_attempts attempt
  where attempt.notification_delivery_id = new.notification_delivery_id
  order by attempt.attempt_number desc
  limit 1;
  return new;
end;
$$;

create or replace function public.reserve_notification_delivery_rate_limit(
  p_delivery_id uuid,
  p_lease_token uuid
)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_event public.notification_events%rowtype;
  v_existing public.notification_delivery_rate_limit_reservations%rowtype;
  v_policy record;
  v_window timestamptz := date_trunc('hour', now());
  v_recipient_count integer;
  v_company_count integer;
  v_recipient_limit integer := 10;
  v_company_limit integer := 100;
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

  select policy.recipient_limit_per_hour, policy.company_limit_per_hour into v_policy
  from public.notification_provider_rate_policies policy
  where policy.provider_identity = coalesce(v_delivery.adapter_identity, v_delivery.channel::text)
    and policy.channel = v_delivery.channel
    and policy.channel_mode = v_delivery.channel_mode;
  if found then
    v_recipient_limit := v_policy.recipient_limit_per_hour;
    v_company_limit := v_policy.company_limit_per_hour;
  end if;

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

create function public.claim_moldcell_sandbox_delivery(
  p_delivery_id uuid,
  p_lease_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 90), 30), 300);
  v_lease_token uuid := gen_random_uuid();
  v_delivery public.notification_deliveries%rowtype;
  v_event public.notification_events%rowtype;
  v_attempt_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Moldcell sandbox delivery claim requires service role.' using errcode = '42501';
  end if;

  select delivery.* into v_delivery
  from public.notification_deliveries delivery
  join public.notification_events event on event.id = delivery.notification_event_id
  where delivery.id = p_delivery_id
    and delivery.channel = 'sms'
    and delivery.channel_mode = 'SANDBOX'
    and delivery.adapter_identity = 'moldcell'
    and delivery.attempt_count < 3
    and event.event_type = 'support.sms_sandbox_test'
    and event.communication_purpose = 'SUPPORT'
    and (
      (delivery.delivery_state in ('READY','QUEUED','FAILED_RETRYABLE') and delivery.next_attempt_at <= now())
      or (delivery.delivery_state = 'PROCESSING' and delivery.leased_until < now())
    )
  for update of delivery skip locked;
  if v_delivery.id is null then return null; end if;

  update public.notification_deliveries set
    status = 'processing', delivery_state = 'PROCESSING',
    attempt_count = attempt_count + 1, attempt_sequence = attempt_sequence + 1,
    lease_token = v_lease_token, leased_until = now() + make_interval(secs => v_lease_seconds),
    last_error_category = null
  where id = v_delivery.id returning * into v_delivery;

  select * into v_event from public.notification_events where id = v_delivery.notification_event_id;
  update public.notification_events set status = 'processing', last_error_category = null
  where id = v_event.id;

  insert into public.notification_delivery_attempts(
    notification_delivery_id, attempt_number, lease_token, channel, adapter_identity, started_at
  ) values (
    v_delivery.id, v_delivery.attempt_sequence, v_delivery.lease_token,
    v_delivery.channel, v_delivery.adapter_identity, now()
  ) returning id into v_attempt_id;

  insert into public.notification_delivery_audit_events(
    notification_event_id, notification_delivery_id, event_name, attempt,
    correlation_id, idempotency_key
  ) values (
    v_event.id, v_delivery.id, 'notification_delivery_claimed', v_delivery.attempt_count,
    v_event.correlation_id,
    'notification_delivery_claimed:' || v_delivery.id::text || ':' || v_delivery.lease_token::text
  ) on conflict (idempotency_key) do nothing;

  return jsonb_build_object(
    'deliveryId',v_delivery.id,'eventId',v_event.id,'intentId',v_event.intent_id,
    'eventType',v_event.event_type,'companyId',v_event.company_id,
    'partnerOrderId',v_event.partner_order_id,'correlationId',v_event.communication_correlation_id,
    'payloadVersion',v_event.payload_version,'payload',v_event.payload,
    'channel',v_delivery.channel,'channelMode',v_delivery.channel_mode,
    'purpose',v_event.communication_purpose,'policyDecision',v_delivery.policy_decision,
    'preferenceOutcome',v_delivery.preference_result,'rateLimitOutcome',v_delivery.rate_limit_result,
    'sandboxOutcome',v_delivery.sandbox_result,'recipient',v_delivery.recipient,
    'recipientLocale',v_delivery.recipient_locale,'templateKey',v_delivery.template_key,
    'templateVersion',v_delivery.template_version,'templateRevision',v_delivery.template_revision,
    'sensitivity',v_delivery.sensitivity,'renderedSnapshot',v_delivery.rendered_snapshot,
    'attempt',v_delivery.attempt_count,'attemptSequence',v_delivery.attempt_sequence,
    'attemptId',v_attempt_id,'leaseToken',v_delivery.lease_token,'idempotencyKey',v_delivery.idempotency_key
  );
end;
$$;

create or replace function public.complete_notification_deliveries(p_results jsonb)
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
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) not between 1 and 50 then
    raise exception 'Notification delivery result batch is invalid.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_results)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Notification delivery result is invalid.' using errcode = '22023';
    end if;
    update public.notification_delivery_attempts attempt set
      provider_code = nullif(left(btrim(coalesce(item->>'providerCode','')),40),''),
      provider_message = nullif(left(regexp_replace(btrim(coalesce(item->>'providerMessage','')), E'[\\n\\r\\t]+', ' ', 'g'),160),''),
      provider_timestamp = nullif(left(btrim(coalesce(item->>'providerTimestamp','')),80),'')
    where attempt.notification_delivery_id = (item->>'deliveryId')::uuid
      and attempt.lease_token = (item->>'leaseToken')::uuid
      and attempt.finished_at is null;

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

create function public.get_admin_moldcell_sms_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_result jsonb;
  v_recipient_limit integer := 1;
  v_company_limit integer := 5;
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Moldcell SMS diagnostics access denied.' using errcode = '42501';
  end if;
  select recipient_limit_per_hour, company_limit_per_hour
    into v_recipient_limit, v_company_limit
  from public.notification_provider_rate_policies
  where provider_identity = 'moldcell' and channel = 'sms' and channel_mode = 'SANDBOX';

  select jsonb_build_object(
    'lastSandboxSuccess', max(attempt.finished_at) filter (where attempt.result_classification = 'ACCEPTED'),
    'lastFailure', max(attempt.finished_at) filter (where attempt.result_classification in ('RETRYABLE','FINAL')),
    'p50LatencyMs', percentile_disc(0.50) within group (order by attempt.duration_ms) filter (where attempt.duration_ms is not null),
    'p95LatencyMs', percentile_disc(0.95) within group (order by attempt.duration_ms) filter (where attempt.duration_ms is not null),
    'acceptedCount', count(*) filter (where attempt.result_classification = 'ACCEPTED'),
    'failedCount', count(*) filter (where attempt.result_classification = 'FINAL'),
    'retryCount', count(*) filter (where attempt.result_classification = 'RETRYABLE'),
    'recipientLimitPerHour', v_recipient_limit,
    'companyLimitPerHour', v_company_limit
  ) into v_result
  from public.notification_delivery_attempts attempt
  join public.notification_deliveries delivery on delivery.id = attempt.notification_delivery_id
  where delivery.channel = 'sms' and delivery.channel_mode = 'SANDBOX'
    and delivery.adapter_identity = 'moldcell';
  return v_result;
end;
$$;

revoke all on function public.prepare_notification_receipt_governance() from public, anon, authenticated, service_role;
revoke all on function public.reserve_notification_delivery_rate_limit(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_notification_delivery_rate_limit(uuid,uuid) to service_role;
revoke all on function public.claim_moldcell_sandbox_delivery(uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_moldcell_sandbox_delivery(uuid,integer) to service_role;
revoke all on function public.complete_notification_deliveries(jsonb) from public, anon, authenticated;
grant execute on function public.complete_notification_deliveries(jsonb) to service_role;
revoke all on function public.get_admin_moldcell_sms_health() from public, anon;
grant execute on function public.get_admin_moldcell_sms_health() to authenticated;

comment on table public.notification_provider_rate_policies is
  'Private provider/channel burst limits. SMS remains governed by channel and purpose activation policy.';
comment on column public.notification_delivery_attempts.provider_timestamp is
  'Provider-returned timestamp kept as bounded text because the Moldcell timezone contract is unverified.';
comment on function public.claim_moldcell_sandbox_delivery(uuid,integer) is
  'Service-only targeted claim for the permission-gated SUPPORT Moldcell sandbox diagnostic.';

commit;
