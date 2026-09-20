begin;

create table public.auth_sms_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null unique,
  challenge_id uuid null references public.business_phone_enrollment_challenges(id) on delete set null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  phone_key_hash text not null check (phone_key_hash ~ '^[0-9a-f]{64}$'),
  recipient_suffix text not null check (recipient_suffix ~ '^[0-9]{3}$'),
  purpose text not null default 'PHONE_VERIFICATION' check (purpose in ('PHONE_VERIFICATION', 'QUICK_AUTH', 'AUTH_OTP')),
  intent text null check (intent in ('BUSINESS_PHONE_ENROLLMENT', 'BUSINESS_QUICK_AUTH')),
  stage text not null check (stage in ('REQUEST_CREATED', 'POLICY', 'RATE_LIMIT', 'SMS_PROVIDER_REQUEST', 'SMS_PROVIDER_RESULT', 'OTP_VERIFY', 'PHONE_PROMOTION')),
  delivery_state text not null check (delivery_state in ('REQUEST_CREATED', 'SENDING', 'PROVIDER_ACCEPTED', 'FAILED_RETRYABLE', 'FAILED_FINAL')),
  provider text not null default 'moldcell' check (provider = 'moldcell'),
  transport text not null check (transport in ('relay', 'direct')),
  provider_http_status integer null check (provider_http_status between 100 and 599),
  provider_code text null check (char_length(provider_code) <= 80),
  provider_timestamp text null check (char_length(provider_timestamp) <= 100),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  retry_state text not null default 'NOT_ATTEMPTED' check (retry_state in ('NOT_ATTEMPTED', 'NOT_REQUIRED', 'RETRYABLE', 'EXHAUSTED', 'PERMANENT')),
  safe_error_code text null check (char_length(safe_error_code) <= 100),
  verification_state text not null default 'PENDING' check (verification_state in ('PENDING', 'VERIFIED', 'FAILED')),
  requested_at timestamptz not null default now(),
  last_attempt_at timestamptz null,
  provider_completed_at timestamptz null,
  verification_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index auth_sms_delivery_attempts_user_requested_idx
  on public.auth_sms_delivery_attempts(auth_user_id, requested_at desc);
create index auth_sms_delivery_attempts_challenge_idx
  on public.auth_sms_delivery_attempts(challenge_id, requested_at desc)
  where challenge_id is not null;
create index auth_sms_delivery_attempts_recent_idx
  on public.auth_sms_delivery_attempts(requested_at desc);

alter table public.auth_sms_delivery_attempts enable row level security;
alter table public.auth_sms_delivery_attempts force row level security;
revoke all on table public.auth_sms_delivery_attempts from public, anon, authenticated, service_role;
grant select, insert, update on table public.auth_sms_delivery_attempts to service_role;

create or replace function public.begin_auth_sms_delivery_attempt_v1(
  p_correlation_id uuid,
  p_auth_user_id uuid,
  p_phone_key_hash text,
  p_recipient_suffix text,
  p_purpose text,
  p_intent text,
  p_transport text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created boolean := false;
  v_attempt public.auth_sms_delivery_attempts%rowtype;
begin
  if p_correlation_id is null or p_auth_user_id is null
    or p_phone_key_hash is null or p_phone_key_hash !~ '^[0-9a-f]{64}$'
    or p_recipient_suffix is null or p_recipient_suffix !~ '^[0-9]{3}$'
    or p_purpose not in ('PHONE_VERIFICATION', 'QUICK_AUTH', 'AUTH_OTP')
    or (p_intent is not null and p_intent not in ('BUSINESS_PHONE_ENROLLMENT', 'BUSINESS_QUICK_AUTH'))
    or p_transport not in ('relay', 'direct') then
    raise exception 'auth_sms_delivery_invalid_input' using errcode = '22023';
  end if;

  insert into public.auth_sms_delivery_attempts(
    correlation_id, challenge_id, auth_user_id, phone_key_hash, recipient_suffix,
    purpose, intent, stage, delivery_state, transport
  ) values (
    p_correlation_id,
    (select challenge.id
       from public.business_phone_enrollment_challenges challenge
      where challenge.auth_user_id = p_auth_user_id
        and challenge.phone_key_hash = p_phone_key_hash
        and challenge.status in ('OPEN', 'OTP_SENT')
      order by challenge.created_at desc
      limit 1),
    p_auth_user_id, p_phone_key_hash, p_recipient_suffix,
    p_purpose, p_intent, 'REQUEST_CREATED', 'REQUEST_CREATED', p_transport
  )
  on conflict (correlation_id) do nothing
  returning true into v_created;
  v_created := coalesce(v_created, false);

  select * into v_attempt
  from public.auth_sms_delivery_attempts attempt
  where attempt.correlation_id = p_correlation_id
    and attempt.auth_user_id = p_auth_user_id
    and attempt.phone_key_hash = p_phone_key_hash
  for update;

  if not found then
    raise exception 'auth_sms_delivery_identity_mismatch' using errcode = '42501';
  end if;
  if v_attempt.delivery_state = 'PROVIDER_ACCEPTED' then
    return jsonb_build_object('result', 'ALREADY_ACCEPTED', 'isNew', false, 'attemptCount', v_attempt.attempt_count);
  end if;
  if v_attempt.delivery_state = 'SENDING' and v_attempt.updated_at > now() - interval '30 seconds' then
    return jsonb_build_object('result', 'IN_PROGRESS', 'isNew', false, 'attemptCount', v_attempt.attempt_count);
  end if;
  if v_attempt.delivery_state = 'FAILED_FINAL' then
    return jsonb_build_object('result', 'FAILED_FINAL', 'isNew', false, 'attemptCount', v_attempt.attempt_count);
  end if;
  if v_attempt.attempt_count >= 3 then
    update public.auth_sms_delivery_attempts
       set retry_state = 'EXHAUSTED', updated_at = now()
     where id = v_attempt.id;
    return jsonb_build_object('result', 'EXHAUSTED', 'isNew', false, 'attemptCount', v_attempt.attempt_count);
  end if;

  update public.auth_sms_delivery_attempts
     set stage = 'SMS_PROVIDER_REQUEST', delivery_state = 'SENDING', safe_error_code = null, updated_at = now()
   where id = v_attempt.id;
  return jsonb_build_object('result', 'DISPATCH', 'isNew', v_created, 'attemptCount', v_attempt.attempt_count);
end;
$$;

create or replace function public.start_auth_sms_provider_attempt_v1(p_correlation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update public.auth_sms_delivery_attempts attempt
     set attempt_count = attempt.attempt_count + 1,
         last_attempt_at = now(),
         stage = 'SMS_PROVIDER_REQUEST',
         delivery_state = 'SENDING',
         updated_at = now()
   where attempt.correlation_id = p_correlation_id
     and attempt.delivery_state in ('SENDING', 'FAILED_RETRYABLE')
     and attempt.attempt_count < 3
  returning attempt_count into v_count;
  return v_count;
end;
$$;

create or replace function public.complete_auth_sms_delivery_attempt_v1(
  p_correlation_id uuid,
  p_delivery_state text,
  p_stage text,
  p_provider_http_status integer,
  p_provider_code text,
  p_provider_timestamp text,
  p_safe_error_code text,
  p_retry_state text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_delivery_state not in ('PROVIDER_ACCEPTED', 'FAILED_RETRYABLE', 'FAILED_FINAL')
    or p_stage not in ('POLICY', 'RATE_LIMIT', 'SMS_PROVIDER_REQUEST', 'SMS_PROVIDER_RESULT')
    or p_retry_state not in ('NOT_REQUIRED', 'RETRYABLE', 'EXHAUSTED', 'PERMANENT')
    or (p_provider_http_status is not null and p_provider_http_status not between 100 and 599)
    or char_length(coalesce(p_provider_code, '')) > 80
    or char_length(coalesce(p_provider_timestamp, '')) > 100
    or char_length(coalesce(p_safe_error_code, '')) > 100 then
    raise exception 'auth_sms_delivery_result_invalid' using errcode = '22023';
  end if;

  update public.auth_sms_delivery_attempts
     set delivery_state = p_delivery_state,
         stage = p_stage,
         provider_http_status = p_provider_http_status,
         provider_code = nullif(p_provider_code, ''),
         provider_timestamp = nullif(p_provider_timestamp, ''),
         safe_error_code = nullif(p_safe_error_code, ''),
         retry_state = p_retry_state,
         provider_completed_at = case when p_delivery_state = 'PROVIDER_ACCEPTED' then now() else provider_completed_at end,
         updated_at = now()
   where correlation_id = p_correlation_id;
  return found;
end;
$$;

create or replace function public.record_business_phone_enrollment_verification_result_v1(
  p_challenge_id uuid,
  p_auth_user_id uuid,
  p_phone_key_hash text,
  p_verification_state text,
  p_safe_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_verification_state not in ('VERIFIED', 'FAILED')
    or p_phone_key_hash is null or p_phone_key_hash !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(p_safe_error_code, '')) > 100 then
    raise exception 'auth_sms_verification_result_invalid' using errcode = '22023';
  end if;
  select attempt.id into v_id
  from public.auth_sms_delivery_attempts attempt
  where attempt.challenge_id = p_challenge_id
    and attempt.auth_user_id = p_auth_user_id
    and attempt.phone_key_hash = p_phone_key_hash
  order by attempt.requested_at desc
  limit 1
  for update;
  if not found then return false; end if;
  update public.auth_sms_delivery_attempts
     set verification_state = p_verification_state,
         verification_at = now(),
         stage = case when p_verification_state = 'VERIFIED' then 'PHONE_PROMOTION' else 'OTP_VERIFY' end,
         safe_error_code = case when p_verification_state = 'VERIFIED' then null else nullif(p_safe_error_code, '') end,
         updated_at = now()
   where id = v_id;
  return true;
end;
$$;

create or replace function public.get_admin_auth_sms_diagnostics_v1(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_internal_permission('admin.integrations.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', attempt.id,
      'authUserId', attempt.auth_user_id,
      'account', case when auth_user.email is null then null
        else left(auth_user.email, 1) || '***@' || split_part(auth_user.email, '@', 2) end,
      'maskedTarget', '+373*****' || attempt.recipient_suffix,
      'purpose', attempt.purpose,
      'intent', attempt.intent,
      'stage', attempt.stage,
      'deliveryState', attempt.delivery_state,
      'provider', attempt.provider,
      'transport', attempt.transport,
      'providerHttpStatus', attempt.provider_http_status,
      'providerCode', attempt.provider_code,
      'providerTimestamp', attempt.provider_timestamp,
      'attemptCount', attempt.attempt_count,
      'retryState', attempt.retry_state,
      'safeErrorCode', attempt.safe_error_code,
      'verificationState', attempt.verification_state,
      'correlationId', attempt.correlation_id,
      'requestedAt', attempt.requested_at,
      'lastAttemptAt', attempt.last_attempt_at
    ) order by attempt.requested_at desc)
    from (
      select * from public.auth_sms_delivery_attempts
      order by requested_at desc
      limit greatest(1, least(coalesce(p_limit, 20), 100))
    ) attempt
    left join auth.users auth_user on auth_user.id = attempt.auth_user_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.begin_auth_sms_delivery_attempt_v1(uuid, uuid, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.start_auth_sms_provider_attempt_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.complete_auth_sms_delivery_attempt_v1(uuid, text, text, integer, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.record_business_phone_enrollment_verification_result_v1(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_auth_sms_diagnostics_v1(integer) from public, anon, authenticated, service_role;
grant execute on function public.begin_auth_sms_delivery_attempt_v1(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.start_auth_sms_provider_attempt_v1(uuid) to service_role;
grant execute on function public.complete_auth_sms_delivery_attempt_v1(uuid, text, text, integer, text, text, text, text) to service_role;
grant execute on function public.record_business_phone_enrollment_verification_result_v1(uuid, uuid, text, text, text) to service_role;
grant execute on function public.get_admin_auth_sms_diagnostics_v1(integer) to authenticated;

comment on table public.auth_sms_delivery_attempts is
  'Security-sensitive durable AUTH SMS diagnostics. Stores keyed phone proof and suffix only; never OTP plaintext or provider credentials.';

commit;
