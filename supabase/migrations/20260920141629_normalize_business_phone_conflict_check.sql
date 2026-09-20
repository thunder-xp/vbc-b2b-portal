-- Supabase Auth persists E.164 phone values without the leading `+`, while
-- Portal boundaries intentionally use canonical `+373...` values. Keep the
-- public RPC contract canonical and accept both Auth storage representations.

create or replace function public.start_quick_auth_challenge_v1(
  p_phone_e164 text,
  p_phone_key_hash text,
  p_requester_key_hash text,
  p_business_phone_otp_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_customer_available boolean := false;
  v_customer_blocked boolean := false;
  v_customer_evidence jsonb;
  v_business_available boolean := false;
  v_resolution text;
  v_challenge public.quick_auth_challenges%rowtype;
  v_phone_count integer;
  v_requester_count integer;
  v_auth_user_count integer;
begin
  if p_phone_e164 is null or p_phone_e164 !~ '^\+373[0-9]{8}$'
    or p_phone_key_hash is null or p_phone_key_hash !~ '^[0-9a-f]{64}$'
    or p_requester_key_hash is null or p_requester_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'quick_auth_invalid_input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone_key_hash, 20260920));
  perform pg_advisory_xact_lock(hashtextextended(p_requester_key_hash, 20260921));

  delete from public.quick_auth_challenges challenge
  where challenge.id in (
    select expired.id
    from public.quick_auth_challenges expired
    where expired.expires_at < now() - interval '24 hours'
    order by expired.expires_at
    limit 100
  );

  select count(*)::integer into v_phone_count
  from public.quick_auth_challenges challenge
  where challenge.phone_key_hash = p_phone_key_hash
    and challenge.created_at >= now() - interval '15 minutes';

  select count(*)::integer into v_requester_count
  from public.quick_auth_challenges challenge
  where challenge.requester_key_hash = p_requester_key_hash
    and challenge.created_at >= now() - interval '15 minutes';

  if v_phone_count >= 5 or v_requester_count >= 20 then
    raise exception 'quick_auth_rate_limited' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_auth_user_count
  from auth.users candidate
  where candidate.phone in (p_phone_e164, substr(p_phone_e164, 2))
    and candidate.phone_confirmed_at is not null;

  if v_auth_user_count = 1 then
    select candidate.id into v_user_id
    from auth.users candidate
    where candidate.phone in (p_phone_e164, substr(p_phone_e164, 2))
      and candidate.phone_confirmed_at is not null
    limit 1;
  end if;

  if v_user_id is not null then
    select public.resolve_customer_access_entitlement_v1(v_user_id)
      into v_customer_evidence;
    v_customer_available := coalesce(v_customer_evidence ->> 'accountStatus', '') = 'ACTIVE'
      and (
        coalesce((v_customer_evidence ->> 'purchaseBacked')::boolean, false)
        or coalesce((v_customer_evidence ->> 'legacyCompatible')::boolean, false)
      );
    v_customer_blocked := coalesce(v_customer_evidence ->> 'accountStatus', '')
      in ('IDENTITY_REVIEW_REQUIRED', 'SUSPENDED');

    select exists (
      select 1
      from public.user_profiles profile
      join public.company_memberships membership on membership.user_id = profile.id
      join public.partner_companies company on company.id = membership.company_id
      where profile.id = v_user_id
        and profile.status = 'active'
        and membership.status = 'active'
        and company.status = 'active'
    ) or exists (
      select 1
      from public.commercial_agents agent
      where agent.user_id = v_user_id
        and agent.status = 'ACTIVE'
    ) into v_business_available;
  end if;

  v_resolution := case
    when v_auth_user_count > 1 then 'BLOCKED'
    when v_customer_available and v_business_available and p_business_phone_otp_enabled
      then 'MULTIPLE_CONTEXT_EDGE_CASE'
    when v_customer_available then 'CUSTOMER_OTP'
    when v_business_available and p_business_phone_otp_enabled
      then 'BUSINESS_EMAIL_REQUIRED'
    when v_customer_blocked or v_business_available then 'BLOCKED'
    else 'NOT_REGISTERED'
  end;

  insert into public.quick_auth_challenges(
    phone_key_hash,
    requester_key_hash,
    subject_auth_user_id,
    resolution,
    expires_at
  ) values (
    p_phone_key_hash,
    p_requester_key_hash,
    case when v_resolution in ('CUSTOMER_OTP', 'BUSINESS_EMAIL_REQUIRED', 'MULTIPLE_CONTEXT_EDGE_CASE') then v_user_id else null end,
    v_resolution,
    now() + interval '10 minutes'
  ) returning * into v_challenge;

  return jsonb_build_object(
    'challengeId', v_challenge.id,
    'resolution', v_challenge.resolution,
    'expiresAt', v_challenge.expires_at,
    'maskedPhone', '+373 ** *** ' || right(p_phone_e164, 2)
  );
end;
$$;

create or replace function public.prepare_business_phone_enrollment_v1(
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
begin
  if p_auth_user_id is null
    or p_phone_e164 is null or p_phone_e164 !~ '^\+373[0-9]{8}$'
    or p_phone_key_hash is null or p_phone_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'business_phone_enrollment_invalid_input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone_key_hash, 20260920));
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 20260920));

  select * into v_user
  from auth.users candidate
  where candidate.id = p_auth_user_id
  for update;

  if not found then
    raise exception 'business_phone_enrollment_auth_required' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.user_profiles profile
    join public.company_memberships membership on membership.user_id = profile.id
    join public.partner_companies company on company.id = membership.company_id
    where profile.id = p_auth_user_id
      and profile.status = 'active'
      and membership.status = 'active'
      and company.status = 'active'
  ) or exists (
    select 1
    from public.commercial_agents agent
    where agent.user_id = p_auth_user_id
      and agent.status = 'ACTIVE'
  ) into v_business_available;

  if not v_business_available then
    raise exception 'business_phone_enrollment_not_eligible' using errcode = '42501';
  end if;

  with stale as (
    select distinct candidate.id
    from auth.users candidate
    join public.business_phone_enrollment_challenges challenge
      on challenge.auth_user_id = candidate.id
     and challenge.phone_key_hash = p_phone_key_hash
    where candidate.phone_change in (p_phone_e164, substr(p_phone_e164, 2))
      and candidate.phone_change_sent_at is not null
      and candidate.phone_change_sent_at <= challenge.expires_at
      and challenge.expires_at <= now()
      and challenge.status in ('OPEN', 'OTP_SENT')
  )
  update auth.users candidate
  set phone_change = '',
      phone_change_token = '',
      phone_change_sent_at = null,
      updated_at = now()
  where candidate.id in (select stale.id from stale);

  with expired as (
    update public.business_phone_enrollment_challenges challenge
    set status = 'FAILED'
    where challenge.status in ('OPEN', 'OTP_SENT')
      and challenge.expires_at <= now()
      and (challenge.auth_user_id = p_auth_user_id or challenge.phone_key_hash = p_phone_key_hash)
    returning challenge.id, challenge.auth_user_id, challenge.phone_key_hash
  )
  insert into public.business_phone_enrollment_audit_events(
    challenge_id,
    auth_user_id,
    event_type,
    phone_key_hash
  )
  select expired.id, expired.auth_user_id, 'BUSINESS_PHONE_ENROLLMENT_FAILED', expired.phone_key_hash
  from expired;

  if v_user.phone in (p_phone_e164, substr(p_phone_e164, 2))
    and v_user.phone_confirmed_at is not null then
    return jsonb_build_object('result', 'ALREADY_CONFIRMED');
  end if;

  select exists (
    select 1
    from auth.users candidate
    where candidate.id <> p_auth_user_id
      and (
        (candidate.phone in (p_phone_e164, substr(p_phone_e164, 2)) and candidate.phone_confirmed_at is not null)
        or candidate.phone_change in (p_phone_e164, substr(p_phone_e164, 2))
      )
  ) into v_conflict;

  if v_conflict then
    insert into public.business_phone_enrollment_audit_events(
      auth_user_id,
      event_type,
      phone_key_hash
    ) values (
      p_auth_user_id,
      'BUSINESS_PHONE_ENROLLMENT_FAILED',
      p_phone_key_hash
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
  limit 1;

  if found then
    return jsonb_build_object(
      'result', 'READY',
      'challengeId', v_challenge.id,
      'expiresAt', v_challenge.expires_at,
      'isPhoneChange', v_challenge.is_phone_change
    );
  end if;

  with replaced as (
    update public.business_phone_enrollment_challenges challenge
    set status = 'FAILED'
    where challenge.auth_user_id = p_auth_user_id
      and challenge.status in ('OPEN', 'OTP_SENT')
    returning challenge.id, challenge.auth_user_id, challenge.phone_key_hash
  )
  insert into public.business_phone_enrollment_audit_events(
    challenge_id,
    auth_user_id,
    event_type,
    phone_key_hash
  )
  select replaced.id, replaced.auth_user_id, 'BUSINESS_PHONE_ENROLLMENT_FAILED', replaced.phone_key_hash
  from replaced;

  insert into public.business_phone_enrollment_challenges(
    auth_user_id,
    phone_key_hash,
    is_phone_change,
    expires_at
  ) values (
    p_auth_user_id,
    p_phone_key_hash,
    v_user.phone_confirmed_at is not null
      and coalesce(v_user.phone, '') not in (p_phone_e164, substr(p_phone_e164, 2)),
    now() + interval '10 minutes'
  ) returning * into v_challenge;

  insert into public.business_phone_enrollment_audit_events(
    challenge_id,
    auth_user_id,
    event_type,
    phone_key_hash
  ) values (
    v_challenge.id,
    p_auth_user_id,
    'BUSINESS_PHONE_ENROLLMENT_STARTED',
    p_phone_key_hash
  );

  return jsonb_build_object(
    'result', 'READY',
    'challengeId', v_challenge.id,
    'expiresAt', v_challenge.expires_at,
    'isPhoneChange', v_challenge.is_phone_change
  );
end;
$$;

create or replace function public.reserve_business_phone_enrollment_send_v1(
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
begin
  if exists (
    select 1
    from auth.users candidate
    where candidate.id <> p_auth_user_id
      and (
        (candidate.phone in (p_phone_e164, substr(p_phone_e164, 2)) and candidate.phone_confirmed_at is not null)
        or candidate.phone_change in (p_phone_e164, substr(p_phone_e164, 2))
      )
  ) then
    return false;
  end if;

  update public.business_phone_enrollment_challenges challenge
  set status = 'OTP_SENT',
      otp_send_count = challenge.otp_send_count + 1,
      otp_sent_at = now()
  where challenge.id = p_challenge_id
    and challenge.auth_user_id = p_auth_user_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and challenge.status in ('OPEN', 'OTP_SENT')
    and challenge.otp_send_count < 3
    and (challenge.otp_sent_at is null or challenge.otp_sent_at <= now() - interval '60 seconds');

  return found;
end;
$$;

create or replace function public.complete_business_phone_enrollment_v1(
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
begin
  select * into v_challenge
  from public.business_phone_enrollment_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.auth_user_id = p_auth_user_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and challenge.status = 'OTP_SENT'
  for update;

  if not found or not exists (
    select 1
    from auth.users candidate
    where candidate.id = p_auth_user_id
      and candidate.phone in (p_phone_e164, substr(p_phone_e164, 2))
      and candidate.phone_confirmed_at is not null
  ) then
    return false;
  end if;

  update public.business_phone_enrollment_challenges
  set status = 'VERIFIED', verified_at = now()
  where id = v_challenge.id;

  insert into public.business_phone_enrollment_audit_events(
    challenge_id,
    auth_user_id,
    event_type,
    phone_key_hash
  ) values (
    v_challenge.id,
    p_auth_user_id,
    case when v_challenge.is_phone_change
      then 'BUSINESS_PHONE_CHANGED'
      else 'BUSINESS_PHONE_ENROLLMENT_CONFIRMED'
    end,
    p_phone_key_hash
  );

  return true;
end;
$$;

comment on function public.start_quick_auth_challenge_v1(text, text, text, boolean) is
  'Starts a privacy-safe phone-first challenge using canonical Portal E.164 input and either supported Supabase Auth phone storage representation.';
comment on function public.prepare_business_phone_enrollment_v1(uuid, text, text) is
  'Validates eligible same-user Business enrollment and phone conflicts across canonical Portal and Supabase Auth phone storage representations.';
comment on function public.complete_business_phone_enrollment_v1(uuid, uuid, text, text) is
  'Completes Business enrollment only after the same Auth user has the canonical phone confirmed, independent of Auth leading-plus storage.';
