begin;

create or replace function private.normalize_moldova_phone_e164_v1(p_value text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_compact text := regexp_replace(btrim(p_value), '[[:space:]().-]', '', 'g');
begin
  if v_compact ~ '^\+373[0-9]{8}$' then
    return v_compact;
  elsif v_compact ~ '^00373[0-9]{8}$' then
    return '+' || substr(v_compact, 3);
  elsif v_compact ~ '^373[0-9]{8}$' then
    return '+' || v_compact;
  elsif v_compact ~ '^0[0-9]{8}$' then
    return '+373' || substr(v_compact, 2);
  elsif v_compact ~ '^[0-9]{8}$' then
    return '+373' || v_compact;
  end if;
  return null;
end;
$$;

revoke all on function private.normalize_moldova_phone_e164_v1(text)
  from public, anon, authenticated, service_role;

-- Repair representation only when the normalized identity is provably unchanged.
update public.user_profiles profile
set phone = private.normalize_moldova_phone_e164_v1(profile.phone),
    updated_at = now()
where profile.status = 'active'
  and private.has_active_business_access_v1(profile.id)
  and profile.phone is not null
  and private.normalize_moldova_phone_e164_v1(profile.phone) is not null
  and profile.phone <> private.normalize_moldova_phone_e164_v1(profile.phone);

alter table public.user_profiles
  drop constraint if exists user_profiles_phone_canonical_moldova_e164,
  add constraint user_profiles_phone_canonical_moldova_e164
  check (phone is null or (
    private.normalize_moldova_phone_e164_v1(phone) is not null
    and phone = private.normalize_moldova_phone_e164_v1(phone)
  ))
  not valid;

alter table public.business_phone_enrollment_challenges
  add column if not exists failure_stage text null,
  add column if not exists safe_error_code text null;

alter table public.business_phone_enrollment_challenges
  drop constraint if exists business_phone_enrollment_challenges_failure_stage_check,
  add constraint business_phone_enrollment_challenges_failure_stage_check check (
    failure_stage is null or failure_stage in (
      'PHONE_CANONICALIZATION', 'AUTH_CHALLENGE_CREATE', 'AUTH_RESEND',
      'SEND_SMS_HOOK', 'RELAY_AUTH', 'RELAY_REQUEST', 'PROVIDER_PHONE_FORMAT',
      'PROVIDER_AUTH', 'PROVIDER_REJECTED', 'PROVIDER_ACCEPTED_NOT_DELIVERED',
      'RATE_LIMIT', 'VERIFICATION', 'CHALLENGE_EXPIRED'
    )
  ),
  drop constraint if exists business_phone_enrollment_challenges_safe_error_code_check,
  add constraint business_phone_enrollment_challenges_safe_error_code_check check (
    safe_error_code is null or char_length(safe_error_code) between 1 and 100
  );

update public.business_phone_enrollment_challenges challenge
set failure_stage = 'AUTH_CHALLENGE_CREATE',
    safe_error_code = 'AUTH_PHONE_IDENTITY_NOT_FOUND',
    updated_at = now()
where challenge.status = 'FAILED'
  and challenge.failure_stage is null
  and not challenge.is_phone_change
  and not exists (
    select 1 from public.auth_sms_delivery_attempts attempt
    where attempt.challenge_id = challenge.id
  )
  and exists (
    select 1
    from public.user_profiles profile
    join auth.users auth_user on auth_user.id = profile.id
    where profile.id = challenge.auth_user_id
      and private.normalize_moldova_phone_e164_v1(profile.phone) is not null
      and private.normalize_moldova_phone_e164_v1(auth_user.phone) is null
  );

with expired as (
  update public.business_phone_enrollment_challenges challenge
  set status = 'FAILED',
      failure_stage = 'CHALLENGE_EXPIRED',
      safe_error_code = 'CHALLENGE_EXPIRED',
      updated_at = now()
  where challenge.status in ('OPEN', 'OTP_SENT')
    and challenge.expires_at <= now()
  returning challenge.id, challenge.auth_user_id, challenge.phone_key_hash
)
insert into public.business_phone_enrollment_audit_events(
  challenge_id, auth_user_id, event_type, phone_key_hash
)
select expired.id, expired.auth_user_id, 'BUSINESS_PHONE_ENROLLMENT_FAILED', expired.phone_key_hash
from expired;

delete from public.customer_auth_sms_rate_buckets bucket
where bucket.expires_at <= now();

create or replace function public.reserve_business_phone_enrollment_send_v2(
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
  if exists (
    select 1 from auth.users candidate
    where candidate.id <> p_auth_user_id
      and (
        (private.normalize_moldova_phone_e164_v1(candidate.phone) = p_phone_e164
          and candidate.phone_confirmed_at is not null)
        or private.normalize_moldova_phone_e164_v1(nullif(candidate.phone_change, '')) = p_phone_e164
      )
  ) then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 0);
  end if;

  select * into v_challenge
  from public.business_phone_enrollment_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.auth_user_id = p_auth_user_id
    and challenge.phone_key_hash = p_phone_key_hash
  for update;

  if not found or v_challenge.status not in ('OPEN', 'OTP_SENT') or v_challenge.expires_at <= now() then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 0);
  end if;

  if v_challenge.otp_send_count >= 3 then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_challenge.expires_at - now())))::integer);
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', v_retry_after);
  end if;

  if v_challenge.otp_sent_at is not null and v_challenge.otp_sent_at > now() - interval '60 seconds' then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_challenge.otp_sent_at + interval '60 seconds' - now())))::integer);
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', v_retry_after);
  end if;

  update public.business_phone_enrollment_challenges challenge
  set status = 'OTP_SENT',
      otp_send_count = challenge.otp_send_count + 1,
      otp_sent_at = now(),
      failure_stage = null,
      safe_error_code = null,
      updated_at = now()
  where challenge.id = v_challenge.id;

  return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
end;
$$;

revoke all on function public.reserve_business_phone_enrollment_send_v2(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_business_phone_enrollment_send_v2(uuid, uuid, text, text)
  to service_role;

create or replace function public.fail_business_phone_enrollment_v2(
  p_challenge_id uuid,
  p_auth_user_id uuid,
  p_phone_key_hash text,
  p_failure_stage text default null,
  p_safe_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failed public.business_phone_enrollment_challenges%rowtype;
begin
  if p_failure_stage is not null and p_failure_stage not in (
    'PHONE_CANONICALIZATION', 'AUTH_CHALLENGE_CREATE', 'AUTH_RESEND',
    'SEND_SMS_HOOK', 'RELAY_AUTH', 'RELAY_REQUEST', 'PROVIDER_PHONE_FORMAT',
    'PROVIDER_AUTH', 'PROVIDER_REJECTED', 'PROVIDER_ACCEPTED_NOT_DELIVERED',
    'RATE_LIMIT', 'VERIFICATION', 'CHALLENGE_EXPIRED'
  ) then
    raise exception 'business_phone_enrollment_invalid_failure_stage' using errcode = '22023';
  end if;
  if char_length(coalesce(p_safe_error_code, '')) > 100 then
    raise exception 'business_phone_enrollment_invalid_safe_error' using errcode = '22023';
  end if;

  update public.business_phone_enrollment_challenges challenge
  set status = 'FAILED',
      failure_stage = p_failure_stage,
      safe_error_code = nullif(p_safe_error_code, ''),
      updated_at = now()
  where challenge.id = p_challenge_id
    and challenge.auth_user_id = p_auth_user_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.status in ('OPEN', 'OTP_SENT')
  returning * into v_failed;

  if not found then return false; end if;

  insert into public.business_phone_enrollment_audit_events(
    challenge_id, auth_user_id, event_type, phone_key_hash
  ) values (
    v_failed.id, v_failed.auth_user_id, 'BUSINESS_PHONE_ENROLLMENT_FAILED', v_failed.phone_key_hash
  );
  return true;
end;
$$;

revoke all on function public.fail_business_phone_enrollment_v2(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_business_phone_enrollment_v2(uuid, uuid, text, text, text)
  to service_role;

create or replace function public.get_admin_business_phone_health_v1(
  p_auth_user_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.integrations.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  with active_business as (
    select profile.id as auth_user_id,
      profile.email,
      profile.phone as profile_phone,
      auth_user.phone as auth_phone,
      auth_user.phone_confirmed_at,
      nullif(auth_user.phone_change, '') as pending_phone,
      auth_user.phone_change_sent_at,
      private.normalize_moldova_phone_e164_v1(profile.phone) as profile_e164,
      private.normalize_moldova_phone_e164_v1(auth_user.phone) as auth_e164,
      private.normalize_moldova_phone_e164_v1(nullif(auth_user.phone_change, '')) as pending_e164
    from public.user_profiles profile
    join auth.users auth_user on auth_user.id = profile.id
    where profile.status = 'active'
      and private.has_active_business_access_v1(profile.id)
      and (p_auth_user_id is null or profile.id = p_auth_user_id)
  ), duplicate_phones as (
    select profile_e164
    from active_business
    where profile_e164 is not null
    group by profile_e164
    having count(*) > 1
  ), latest_challenge as (
    select distinct on (challenge.auth_user_id)
      challenge.auth_user_id, challenge.id, challenge.status, challenge.expires_at,
      challenge.phone_key_hash, challenge.otp_send_count, challenge.failure_stage, challenge.safe_error_code,
      challenge.created_at
    from public.business_phone_enrollment_challenges challenge
    order by challenge.auth_user_id, challenge.created_at desc
  ), latest_delivery as (
    select distinct on (attempt.auth_user_id)
      attempt.auth_user_id, attempt.correlation_id, attempt.stage, attempt.delivery_state,
      attempt.provider, attempt.transport, attempt.provider_http_status, attempt.provider_code,
      attempt.attempt_count, attempt.retry_state, attempt.safe_error_code,
      attempt.verification_state, attempt.requested_at
    from public.auth_sms_delivery_attempts attempt
    where attempt.intent in ('BUSINESS_PHONE_ENROLLMENT', 'BUSINESS_QUICK_AUTH')
    order by attempt.auth_user_id, attempt.requested_at desc
  ), fleet as (
    select account.*,
      challenge.id as challenge_id,
      challenge.status as challenge_status,
      challenge.expires_at as challenge_expires_at,
      challenge.otp_send_count,
      challenge.failure_stage,
      challenge.safe_error_code as challenge_error,
      delivery.correlation_id,
      delivery.stage as delivery_stage,
      delivery.delivery_state,
      delivery.provider,
      delivery.transport,
      delivery.provider_http_status,
      delivery.provider_code,
      delivery.attempt_count,
      delivery.retry_state,
      delivery.safe_error_code as delivery_error,
      delivery.verification_state,
      delivery.requested_at,
      (account.profile_e164 is not null and account.auth_e164 = account.profile_e164
        and account.phone_confirmed_at is not null) as verified_healthy,
      (account.profile_phone is null and account.auth_phone is null) as no_phone,
      (account.profile_phone is not null and account.profile_e164 is null)
        or (account.auth_phone is not null and account.auth_e164 is null) as malformed_phone,
      account.profile_e164 in (select duplicate_phones.profile_e164 from duplicate_phones) as duplicate_phone,
      account.profile_e164 is not null and account.auth_e164 is not null
        and account.profile_e164 <> account.auth_e164 as auth_profile_phone_mismatch,
      account.profile_e164 is not null and account.auth_e164 is null as orphaned_profile_phone,
      account.profile_e164 is null and account.auth_e164 is not null as orphaned_auth_phone,
      coalesce(challenge.status in ('OPEN', 'OTP_SENT') and challenge.expires_at > now(), false) as pending_verification,
      coalesce(challenge.status in ('OPEN', 'OTP_SENT') and challenge.expires_at <= now(), false) as stale_pending_challenge,
      exists (
        select 1 from public.customer_auth_sms_rate_buckets bucket
        where bucket.phone_key_hash = challenge.phone_key_hash
          and bucket.expires_at <= now()
      ) as stale_rate_limit,
      coalesce(delivery.delivery_state in ('FAILED_RETRYABLE', 'FAILED_FINAL')
        and delivery.requested_at >= now() - interval '30 days', false) as recent_delivery_failure,
      (account.phone_confirmed_at is not null and account.auth_e164 is distinct from account.profile_e164)
        or (account.phone_confirmed_at is null and account.auth_e164 is not null) as verified_state_mismatch
    from active_business account
    left join latest_challenge challenge on challenge.auth_user_id = account.auth_user_id
    left join latest_delivery delivery on delivery.auth_user_id = account.auth_user_id
  ), metric_windows(window_name, window_interval) as (
    values ('24h', interval '24 hours'), ('7d', interval '7 days'), ('30d', interval '30 days')
  ), window_metrics as (
    select metric_window.window_name,
      (select count(*) from public.business_phone_enrollment_challenges challenge
        where challenge.created_at >= now() - metric_window.window_interval) as challenge_attempts,
      (select count(*) from public.auth_sms_delivery_attempts attempt
        where attempt.requested_at >= now() - metric_window.window_interval
          and attempt.intent in ('BUSINESS_PHONE_ENROLLMENT', 'BUSINESS_QUICK_AUTH')) as send_attempts,
      (select count(*) from public.auth_sms_delivery_attempts attempt
        where attempt.requested_at >= now() - metric_window.window_interval
          and attempt.intent in ('BUSINESS_PHONE_ENROLLMENT', 'BUSINESS_QUICK_AUTH')
          and attempt.delivery_state = 'PROVIDER_ACCEPTED') as provider_accepted,
      (select count(*) from public.auth_sms_delivery_attempts attempt
        where attempt.requested_at >= now() - metric_window.window_interval
          and attempt.intent in ('BUSINESS_PHONE_ENROLLMENT', 'BUSINESS_QUICK_AUTH')
          and attempt.delivery_state = 'FAILED_FINAL'
          and attempt.provider_http_status is not null) as provider_rejected,
      (select count(*) from public.auth_sms_delivery_attempts attempt
        where attempt.requested_at >= now() - metric_window.window_interval
          and attempt.intent in ('BUSINESS_PHONE_ENROLLMENT', 'BUSINESS_QUICK_AUTH')
          and attempt.safe_error_code ~* '(NETWORK|TIMEOUT|FETCH|RELAY)') as network_failures,
      (select count(*) from public.business_phone_enrollment_challenges challenge
        where challenge.verified_at >= now() - metric_window.window_interval
          and challenge.status = 'VERIFIED') as verification_success,
      (select count(*) from public.auth_sms_delivery_attempts attempt
        where attempt.verification_at >= now() - metric_window.window_interval
          and attempt.intent = 'BUSINESS_PHONE_ENROLLMENT'
          and attempt.verification_state = 'FAILED') as verification_failure,
      (select count(*) from public.business_phone_enrollment_challenges challenge
        where challenge.updated_at >= now() - metric_window.window_interval
          and challenge.failure_stage = 'CHALLENGE_EXPIRED') as challenge_expiration
    from metric_windows metric_window
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
      'totalActiveB2b', count(*),
      'verifiedHealthy', count(*) filter (where verified_healthy),
      'noPhone', count(*) filter (where no_phone),
      'pendingVerification', count(*) filter (where pending_verification),
      'authProfilePhoneMismatch', count(*) filter (where auth_profile_phone_mismatch),
      'verifiedStateMismatch', count(*) filter (where verified_state_mismatch),
      'malformedPhone', count(*) filter (where malformed_phone),
      'duplicatePhone', count(*) filter (where duplicate_phone),
      'stalePendingChallenge', count(*) filter (where stale_pending_challenge),
      'staleRateLimit', count(*) filter (where stale_rate_limit),
      'recentDeliveryFailure', count(*) filter (where recent_delivery_failure),
      'orphanedAuthPhone', count(*) filter (where orphaned_auth_phone),
      'orphanedProfilePhone', count(*) filter (where orphaned_profile_phone)
    ) from fleet),
    'windows', (select coalesce(jsonb_agg(to_jsonb(window_metrics) order by
      case window_name when '24h' then 1 when '7d' then 2 else 3 end), '[]'::jsonb) from window_metrics),
    'accounts', (select coalesce(jsonb_agg(account_payload order by account_payload->>'account'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'authUserId', fleet.auth_user_id,
          'account', case when fleet.email is null then null else left(fleet.email, 1) || '***@' || split_part(fleet.email, '@', 2) end,
          'companies', coalesce((select jsonb_agg(distinct company.display_name)
            from public.company_memberships membership
            join public.partner_companies company on company.id = membership.company_id
            where membership.user_id = fleet.auth_user_id and membership.status = 'active'), '[]'::jsonb),
          'maskedPhone', case when fleet.profile_e164 is null then 'INVALID_OR_EMPTY'
            else '+373******' || right(fleet.profile_e164, 3) end,
          'classifications', to_jsonb(array_remove(array[
            case when fleet.verified_healthy then 'VERIFIED_HEALTHY' end,
            case when fleet.no_phone then 'NO_PHONE' end,
            case when fleet.pending_verification then 'PENDING_VERIFICATION' end,
            case when fleet.auth_profile_phone_mismatch then 'AUTH_PROFILE_PHONE_MISMATCH' end,
            case when fleet.verified_state_mismatch then 'VERIFIED_STATE_MISMATCH' end,
            case when fleet.malformed_phone then 'MALFORMED_PHONE' end,
            case when fleet.duplicate_phone then 'DUPLICATE_PHONE' end,
            case when fleet.stale_pending_challenge then 'STALE_PENDING_CHALLENGE' end,
            case when fleet.stale_rate_limit then 'STALE_RATE_LIMIT' end,
            case when fleet.recent_delivery_failure then 'RECENT_DELIVERY_FAILURE' end,
            case when fleet.orphaned_auth_phone then 'ORPHANED_AUTH_PHONE' end,
            case when fleet.orphaned_profile_phone then 'ORPHANED_PROFILE_PHONE' end
          ], null)),
          'stage', coalesce(fleet.failure_stage, fleet.delivery_stage),
          'safeCode', coalesce(fleet.challenge_error, fleet.delivery_error),
          'provider', fleet.provider,
          'transport', fleet.transport,
          'httpStatus', fleet.provider_http_status,
          'providerCode', fleet.provider_code,
          'attempt', coalesce(fleet.attempt_count, fleet.otp_send_count, 0),
          'correlationId', fleet.correlation_id,
          'time', coalesce(fleet.requested_at, fleet.challenge_expires_at),
          'recovery', case
            when fleet.duplicate_phone then 'ADMIN_REVIEW_DUPLICATE_AUTH_PHONE'
            when fleet.malformed_phone then 'CORRECT_PROFILE_PHONE'
            when fleet.verified_state_mismatch or fleet.auth_profile_phone_mismatch then 'ADMIN_REVIEW_IDENTITY'
            when fleet.no_phone then 'ADD_PROFILE_PHONE'
            when fleet.orphaned_profile_phone then 'VERIFY_PROFILE_PHONE'
            when fleet.pending_verification then 'COMPLETE_OR_RESEND_CHALLENGE'
            else 'NONE' end
        ) account_payload
        from fleet
        where p_auth_user_id is not null
          or not fleet.verified_healthy
          or fleet.recent_delivery_failure
        limit greatest(1, least(coalesce(p_limit, 50), 100))
      ) bounded_accounts)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_business_phone_health_v1(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_business_phone_health_v1(uuid, integer)
  to authenticated;

comment on function public.get_admin_business_phone_health_v1(uuid, integer) is
  'Admin-only masked B2B phone integrity, delivery, verification, retry, and recovery diagnostics; never returns OTP or plaintext phone.';

commit;
