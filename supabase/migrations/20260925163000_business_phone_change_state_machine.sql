begin;

alter table public.business_phone_enrollment_challenges
  add column if not exists target_phone_suffix text null,
  add column if not exists correlation_id uuid not null default gen_random_uuid();

update public.business_phone_enrollment_challenges challenge
set target_phone_suffix = (
  select attempt.recipient_suffix
  from public.auth_sms_delivery_attempts attempt
  where attempt.challenge_id = challenge.id
  order by attempt.requested_at desc
  limit 1
)
where challenge.target_phone_suffix is null
  and exists (
    select 1
    from public.auth_sms_delivery_attempts attempt
    where attempt.challenge_id = challenge.id
  );

alter table public.business_phone_enrollment_challenges
  drop constraint if exists business_phone_enrollment_target_suffix_check,
  add constraint business_phone_enrollment_target_suffix_check
    check (target_phone_suffix is null or target_phone_suffix ~ '^[0-9]{3}$');

alter table public.business_phone_enrollment_challenges
  drop constraint if exists business_phone_enrollment_challenges_failure_stage_check,
  add constraint business_phone_enrollment_challenges_failure_stage_check check (
    failure_stage is null or failure_stage in (
      'PHONE_CANONICALIZATION', 'AUTH_CHALLENGE_CREATE', 'AUTH_RESEND',
      'SEND_SMS_HOOK', 'RELAY_AUTH', 'RELAY_REQUEST', 'PROVIDER_PHONE_FORMAT',
      'PROVIDER_AUTH', 'PROVIDER_REJECTED', 'PROVIDER_ACCEPTED_NOT_DELIVERED',
      'RATE_LIMIT', 'VERIFICATION', 'CHALLENGE_EXPIRED', 'TARGET_SUPERSEDED',
      'TARGET_MISMATCH'
    )
  );

comment on table public.business_phone_enrollment_challenges is
  'Business phone verification state. phone_key_hash and target_phone_suffix bind the challenge to the submitted target; user_profiles.phone is not target authority.';

create or replace function public.prepare_business_phone_enrollment_v2(
  p_auth_user_id uuid,
  p_phone_e164 text,
  p_phone_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_challenge public.business_phone_enrollment_challenges%rowtype;
  v_business_available boolean;
  v_conflict boolean;
  v_replaced boolean := false;
begin
  if p_auth_user_id is null
    or p_phone_e164 is null or p_phone_e164 !~ '^\+373[0-9]{8}$'
    or p_phone_key_hash is null or p_phone_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'business_phone_enrollment_invalid_input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 20260925));
  perform pg_advisory_xact_lock(hashtextextended(p_phone_key_hash, 20260925));

  select * into v_user
  from auth.users candidate
  where candidate.id = p_auth_user_id
  for update;
  if not found then
    raise exception 'business_phone_enrollment_auth_required' using errcode = '42501';
  end if;

  v_business_available := private.has_active_business_access_v1(p_auth_user_id);
  if not v_business_available then
    raise exception 'business_phone_enrollment_not_eligible' using errcode = '42501';
  end if;

  if private.normalize_moldova_phone_e164_v1(v_user.phone) = p_phone_e164
    and v_user.phone_confirmed_at is not null then
    return jsonb_build_object('result', 'ALREADY_CONFIRMED');
  end if;

  select exists (
    select 1
    from auth.users candidate
    where candidate.id <> p_auth_user_id
      and (
        (private.normalize_moldova_phone_e164_v1(candidate.phone) = p_phone_e164
          and candidate.phone_confirmed_at is not null)
        or private.normalize_moldova_phone_e164_v1(nullif(candidate.phone_change, '')) = p_phone_e164
      )
      and not private.is_non_operational_phone_orphan_v1(candidate.id, p_phone_e164)
  ) into v_conflict;

  if v_conflict then
    insert into public.business_phone_enrollment_audit_events(
      auth_user_id, event_type, phone_key_hash
    ) values (
      p_auth_user_id, 'BUSINESS_PHONE_ENROLLMENT_FAILED', p_phone_key_hash
    );
    return jsonb_build_object('result', 'CONFLICT');
  end if;

  select * into v_challenge
  from public.business_phone_enrollment_challenges challenge
  where challenge.auth_user_id = p_auth_user_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.status in ('OPEN', 'OTP_SENT')
    and challenge.expires_at > now()
  order by challenge.created_at desc
  limit 1
  for update;

  if found then
    update public.business_phone_enrollment_challenges
    set target_phone_suffix = right(p_phone_e164, 3)
    where id = v_challenge.id;
    return jsonb_build_object(
      'result', 'READY',
      'challengeId', v_challenge.id,
      'expiresAt', v_challenge.expires_at,
      'isPhoneChange', v_challenge.is_phone_change
    );
  end if;

  with replaced as (
    update public.business_phone_enrollment_challenges challenge
    set status = 'FAILED',
        failure_stage = case when challenge.expires_at <= now()
          then 'CHALLENGE_EXPIRED' else 'TARGET_SUPERSEDED' end,
        safe_error_code = case when challenge.expires_at <= now()
          then 'CHALLENGE_EXPIRED' else 'TARGET_SUPERSEDED' end
    where challenge.auth_user_id = p_auth_user_id
      and challenge.status in ('OPEN', 'OTP_SENT')
    returning challenge.id, challenge.auth_user_id, challenge.phone_key_hash
  ), audited as (
    insert into public.business_phone_enrollment_audit_events(
      challenge_id, auth_user_id, event_type, phone_key_hash
    )
    select replaced.id, replaced.auth_user_id,
      'BUSINESS_PHONE_ENROLLMENT_FAILED', replaced.phone_key_hash
    from replaced
    returning 1
  )
  select exists(select 1 from audited) into v_replaced;

  if v_replaced and v_user.phone_change_sent_at is not null
    and exists (
      select 1
      from public.business_phone_enrollment_challenges replaced
      where replaced.auth_user_id = p_auth_user_id
        and replaced.status = 'FAILED'
        and replaced.failure_stage = 'TARGET_SUPERSEDED'
        and replaced.target_phone_suffix = right(
          private.normalize_moldova_phone_e164_v1(nullif(v_user.phone_change, '')),
          3
        )
        and v_user.phone_change_sent_at between replaced.created_at and replaced.expires_at
    ) then
    update auth.users
    set phone_change = '',
        phone_change_token = '',
        phone_change_sent_at = null,
        updated_at = now()
    where id = p_auth_user_id;
  end if;

  insert into public.business_phone_enrollment_challenges(
    auth_user_id, phone_key_hash, target_phone_suffix, is_phone_change, expires_at
  ) values (
    p_auth_user_id,
    p_phone_key_hash,
    right(p_phone_e164, 3),
    v_user.phone_confirmed_at is not null
      and private.normalize_moldova_phone_e164_v1(v_user.phone) is distinct from p_phone_e164,
    now() + interval '10 minutes'
  )
  returning * into v_challenge;

  insert into public.business_phone_enrollment_audit_events(
    challenge_id, auth_user_id, event_type, phone_key_hash
  ) values (
    v_challenge.id, p_auth_user_id,
    'BUSINESS_PHONE_ENROLLMENT_STARTED', p_phone_key_hash
  );

  return jsonb_build_object(
    'result', 'READY',
    'challengeId', v_challenge.id,
    'expiresAt', v_challenge.expires_at,
    'isPhoneChange', v_challenge.is_phone_change
  );
end;
$$;

create or replace function public.reserve_business_phone_enrollment_send_v3(
  p_challenge_id uuid,
  p_auth_user_id uuid,
  p_phone_e164 text,
  p_phone_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.business_phone_enrollment_challenges%rowtype;
  v_retry_after integer := 0;
begin
  select * into v_challenge
  from public.business_phone_enrollment_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.auth_user_id = p_auth_user_id
  for update;

  if not found
    or v_challenge.status not in ('OPEN', 'OTP_SENT')
    or v_challenge.expires_at <= now() then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 0, 'reason', 'EXPIRED');
  end if;

  if p_phone_e164 !~ '^\+373[0-9]{8}$'
    or p_phone_key_hash !~ '^[0-9a-f]{64}$'
    or v_challenge.phone_key_hash <> p_phone_key_hash
    or v_challenge.target_phone_suffix is distinct from right(p_phone_e164, 3) then
    update public.business_phone_enrollment_challenges
    set status = 'FAILED',
        failure_stage = 'TARGET_MISMATCH',
        safe_error_code = 'BUSINESS_PHONE_TARGET_MISMATCH'
    where id = v_challenge.id;
    insert into public.business_phone_enrollment_audit_events(
      challenge_id, auth_user_id, event_type, phone_key_hash
    ) values (
      v_challenge.id, v_challenge.auth_user_id,
      'BUSINESS_PHONE_ENROLLMENT_FAILED', v_challenge.phone_key_hash
    );
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 0, 'reason', 'TARGET_MISMATCH');
  end if;

  if exists (
    select 1 from auth.users candidate
    where candidate.id <> p_auth_user_id
      and (
        (private.normalize_moldova_phone_e164_v1(candidate.phone) = p_phone_e164
          and candidate.phone_confirmed_at is not null)
        or private.normalize_moldova_phone_e164_v1(nullif(candidate.phone_change, '')) = p_phone_e164
      )
      and not private.is_non_operational_phone_orphan_v1(candidate.id, p_phone_e164)
  ) then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 0, 'reason', 'PHONE_CONFLICT');
  end if;

  if v_challenge.otp_send_count >= 3 then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_challenge.expires_at - now())))::integer);
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', v_retry_after, 'reason', 'RATE_LIMITED');
  end if;
  if v_challenge.otp_sent_at is not null
    and v_challenge.otp_sent_at > now() - interval '60 seconds' then
    v_retry_after := greatest(1, ceil(extract(epoch from (
      v_challenge.otp_sent_at + interval '60 seconds' - now()
    )))::integer);
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', v_retry_after, 'reason', 'RATE_LIMITED');
  end if;

  update public.business_phone_enrollment_challenges
  set status = 'OTP_SENT',
      otp_send_count = otp_send_count + 1,
      otp_sent_at = now(),
      failure_stage = null,
      safe_error_code = null
  where id = v_challenge.id;

  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0, 'reason', null);
end;
$$;

create or replace function public.get_business_phone_enrollment_target_v1(
  p_challenge_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_challenge public.business_phone_enrollment_challenges%rowtype;
  v_user auth.users%rowtype;
  v_phone text;
begin
  select * into v_challenge
  from public.business_phone_enrollment_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.auth_user_id = p_auth_user_id;
  if not found then return null; end if;

  select * into v_user from auth.users where id = p_auth_user_id;
  if v_challenge.status = 'VERIFIED' then
    v_phone := private.normalize_moldova_phone_e164_v1(v_user.phone);
  elsif v_challenge.status in ('OPEN', 'OTP_SENT') and v_challenge.expires_at > now() then
    v_phone := private.normalize_moldova_phone_e164_v1(nullif(v_user.phone_change, ''));
  else
    return null;
  end if;

  if v_phone is null
    or v_challenge.target_phone_suffix is distinct from right(v_phone, 3) then
    return jsonb_build_object(
      'status', 'TARGET_MISMATCH',
      'phoneKeyHash', v_challenge.phone_key_hash,
      'targetPhoneSuffix', v_challenge.target_phone_suffix
    );
  end if;

  return jsonb_build_object(
    'status', v_challenge.status,
    'phoneE164', v_phone,
    'phoneKeyHash', v_challenge.phone_key_hash,
    'targetPhoneSuffix', v_challenge.target_phone_suffix,
    'isPhoneChange', v_challenge.is_phone_change,
    'expiresAt', v_challenge.expires_at
  );
end;
$$;

create or replace function public.complete_business_phone_enrollment_v2(
  p_challenge_id uuid,
  p_auth_user_id uuid,
  p_phone_e164 text,
  p_phone_key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.business_phone_enrollment_challenges%rowtype;
  v_auth_phone text;
  v_pending_phone text;
  v_confirmed_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 20260925));
  select * into v_challenge
  from public.business_phone_enrollment_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.auth_user_id = p_auth_user_id
    and challenge.phone_key_hash = p_phone_key_hash
  for update;
  if not found then return false; end if;

  select private.normalize_moldova_phone_e164_v1(phone),
    private.normalize_moldova_phone_e164_v1(nullif(phone_change, '')),
    phone_confirmed_at
  into v_auth_phone, v_pending_phone, v_confirmed_at
  from auth.users
  where id = p_auth_user_id
  for update;

  if v_challenge.status = 'VERIFIED' then
    return v_auth_phone = p_phone_e164 and v_confirmed_at is not null
      and v_pending_phone is null
      and exists (
        select 1 from public.user_profiles profile
        where profile.id = p_auth_user_id
          and private.normalize_moldova_phone_e164_v1(profile.phone) = p_phone_e164
      );
  end if;

  if v_challenge.status <> 'OTP_SENT'
    or v_challenge.expires_at <= now()
    or v_challenge.target_phone_suffix is distinct from right(p_phone_e164, 3)
    or v_auth_phone is distinct from p_phone_e164
    or v_pending_phone is not null
    or v_confirmed_at is null then
    return false;
  end if;

  update public.user_profiles
  set phone = p_phone_e164,
      updated_at = now()
  where id = p_auth_user_id;
  if not found then return false; end if;

  update public.business_phone_enrollment_challenges
  set status = 'VERIFIED', verified_at = coalesce(verified_at, now()),
      failure_stage = null, safe_error_code = null
  where id = v_challenge.id;

  insert into public.business_phone_enrollment_audit_events(
    challenge_id, auth_user_id, event_type, phone_key_hash
  )
  select v_challenge.id, p_auth_user_id,
    case when v_challenge.is_phone_change
      then 'BUSINESS_PHONE_CHANGED'
      else 'BUSINESS_PHONE_ENROLLMENT_CONFIRMED'
    end,
    p_phone_key_hash
  where not exists (
    select 1 from public.business_phone_enrollment_audit_events event
    where event.challenge_id = v_challenge.id
      and event.event_type in ('BUSINESS_PHONE_CHANGED', 'BUSINESS_PHONE_ENROLLMENT_CONFIRMED')
  );
  return true;
end;
$$;

create or replace function public.get_current_business_phone_state_v1(
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_profile_phone text;
  v_auth_phone text;
  v_pending_phone text;
  v_challenge public.business_phone_enrollment_challenges%rowtype;
  v_state text;
begin
  select * into v_user from auth.users where id = p_auth_user_id;
  if not found or not private.has_active_business_access_v1(p_auth_user_id) then
    return null;
  end if;
  select private.normalize_moldova_phone_e164_v1(profile.phone)
  into v_profile_phone
  from public.user_profiles profile
  where profile.id = p_auth_user_id and profile.status = 'active';

  v_auth_phone := private.normalize_moldova_phone_e164_v1(v_user.phone);
  v_pending_phone := private.normalize_moldova_phone_e164_v1(nullif(v_user.phone_change, ''));
  select * into v_challenge
  from public.business_phone_enrollment_challenges challenge
  where challenge.auth_user_id = p_auth_user_id
  order by (
    challenge.status in ('OPEN', 'OTP_SENT')
    and challenge.expires_at > now()
  ) desc, challenge.created_at desc
  limit 1;

  v_state := case
    when v_challenge.status = 'OTP_SENT' and v_challenge.expires_at > now()
      and v_pending_phone is not null
      then case when v_challenge.is_phone_change
        then 'PHONE_CHANGE_PENDING' else 'OTP_SENT' end
    when v_challenge.status = 'OPEN' and v_challenge.expires_at > now()
      then 'PHONE_VERIFICATION_REQUIRED'
    when v_user.phone_confirmed_at is not null and v_auth_phone = v_profile_phone
      then 'VERIFIED'
    when v_challenge.status = 'FAILED'
      then 'VERIFICATION_FAILED'
    when v_profile_phone is null
      then 'NO_PHONE'
    else 'PHONE_VERIFICATION_REQUIRED'
  end;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', v_state,
    'challengeId', case
      when v_challenge.status in ('OPEN', 'OTP_SENT')
        and v_challenge.expires_at > now() then v_challenge.id
      else null end,
    'profilePhoneE164', v_profile_phone,
    'targetPhoneE164', case
      when v_challenge.status in ('OPEN', 'OTP_SENT')
        and v_challenge.expires_at > now() then v_pending_phone
      else v_profile_phone end
  ));
end;
$$;

create or replace function public.resolve_governed_business_auth_sms_v2(
  p_auth_user_id uuid,
  p_phone_key_hash text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_auth_user_id is null
      or p_phone_key_hash is null
      or p_phone_key_hash !~ '^[0-9a-f]{64}$' then null
    when exists (
      select 1 from public.business_phone_enrollment_challenges challenge
      where challenge.auth_user_id = p_auth_user_id
        and challenge.status = 'OTP_SENT'
        and challenge.expires_at > now()
        and challenge.phone_key_hash = p_phone_key_hash
    ) then 'BUSINESS_PHONE_ENROLLMENT'
    when exists (
      select 1 from public.business_phone_enrollment_challenges challenge
      where challenge.auth_user_id = p_auth_user_id
        and challenge.status = 'OTP_SENT'
        and challenge.expires_at > now()
        and challenge.phone_key_hash <> p_phone_key_hash
    ) then 'BUSINESS_PHONE_TARGET_MISMATCH'
    when exists (
      select 1 from public.quick_auth_challenges challenge
      where challenge.subject_auth_user_id = p_auth_user_id
        and challenge.phone_key_hash = p_phone_key_hash
        and challenge.status = 'OTP_SENT'
        and challenge.expires_at > now()
        and private.has_active_business_access_v1(p_auth_user_id)
    ) then 'BUSINESS_QUICK_AUTH'
    else null
  end;
$$;

revoke all on function public.prepare_business_phone_enrollment_v2(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reserve_business_phone_enrollment_send_v3(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_business_phone_enrollment_target_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_business_phone_enrollment_v2(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_current_business_phone_state_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_governed_business_auth_sms_v2(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.prepare_business_phone_enrollment_v2(uuid, text, text) to service_role;
grant execute on function public.reserve_business_phone_enrollment_send_v3(uuid, uuid, text, text) to service_role;
grant execute on function public.get_business_phone_enrollment_target_v1(uuid, uuid) to service_role;
grant execute on function public.complete_business_phone_enrollment_v2(uuid, uuid, text, text) to service_role;
grant execute on function public.get_current_business_phone_state_v1(uuid) to service_role;
grant execute on function public.resolve_governed_business_auth_sms_v2(uuid, text) to service_role;

-- Deterministic repair only: expire stale challenges, clear flow-owned pending
-- Auth phone changes, and synchronize a proven confirmed Auth phone projection.
with expired as (
  update public.business_phone_enrollment_challenges challenge
  set status = 'FAILED',
      failure_stage = 'CHALLENGE_EXPIRED',
      safe_error_code = 'CHALLENGE_EXPIRED'
  where challenge.status in ('OPEN', 'OTP_SENT')
    and challenge.expires_at <= now()
  returning challenge.id, challenge.auth_user_id, challenge.phone_key_hash,
    challenge.target_phone_suffix, challenge.created_at, challenge.expires_at
), audited as (
  insert into public.business_phone_enrollment_audit_events(
    challenge_id, auth_user_id, event_type, phone_key_hash
  )
  select expired.id, expired.auth_user_id,
    'BUSINESS_PHONE_ENROLLMENT_FAILED', expired.phone_key_hash
  from expired
)
update auth.users auth_user
set phone_change = '',
    phone_change_token = '',
    phone_change_sent_at = null,
    updated_at = now()
from expired
where auth_user.id = expired.auth_user_id
  and auth_user.phone_change_sent_at between expired.created_at and expired.expires_at
  and expired.target_phone_suffix = right(
    private.normalize_moldova_phone_e164_v1(nullif(auth_user.phone_change, '')),
    3
  )
  and not exists (
    select 1 from public.business_phone_enrollment_challenges live
    where live.auth_user_id = auth_user.id
      and live.status in ('OPEN', 'OTP_SENT')
      and live.expires_at > now()
  );

update public.user_profiles profile
set phone = private.normalize_moldova_phone_e164_v1(auth_user.phone),
    updated_at = now()
from auth.users auth_user
where auth_user.id = profile.id
  and auth_user.phone_confirmed_at is not null
  and private.normalize_moldova_phone_e164_v1(auth_user.phone) is not null
  and private.normalize_moldova_phone_e164_v1(profile.phone)
    is distinct from private.normalize_moldova_phone_e164_v1(auth_user.phone)
  and private.has_active_business_access_v1(profile.id);

commit;
