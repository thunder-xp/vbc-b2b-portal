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

create index if not exists user_profiles_active_moldova_phone_idx
  on public.user_profiles (private.normalize_moldova_phone_e164_v1(phone))
  where status = 'active' and phone is not null;

alter table public.quick_auth_challenges
  add column email_verification_required boolean not null default false,
  add column otp_subject_auth_user_id uuid null references auth.users(id) on delete restrict,
  add column business_recovery_kind text null check (
    business_recovery_kind in ('DIRECT', 'PHONE_ENROLLMENT', 'ORPHAN_REBIND')
  ),
  add column phone_rebound_at timestamptz null;

create index quick_auth_challenges_otp_subject_idx
  on public.quick_auth_challenges(otp_subject_auth_user_id)
  where otp_subject_auth_user_id is not null;

create table public.business_quick_auth_audit_events (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.quick_auth_challenges(id) on delete restrict,
  canonical_subject_auth_user_id uuid not null,
  related_auth_user_id uuid null,
  event_type text not null check (
    event_type in (
      'BUSINESS_PHONE_RECOVERY_STARTED',
      'BUSINESS_EMAIL_CONFIRMED',
      'BUSINESS_PHONE_POSSESSION_CONFIRMED',
      'ORPHAN_PHONE_DETACHED',
      'BUSINESS_PHONE_REBOUND',
      'BUSINESS_QUICK_AUTH_COMPLETED'
    )
  ),
  phone_key_hash text not null check (phone_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (challenge_id, event_type)
);

create index business_quick_auth_audit_subject_idx
  on public.business_quick_auth_audit_events(canonical_subject_auth_user_id, created_at desc);

alter table public.business_quick_auth_audit_events enable row level security;
alter table public.business_quick_auth_audit_events force row level security;
revoke all on table public.business_quick_auth_audit_events
  from public, anon, authenticated, service_role;
grant select, insert on table public.business_quick_auth_audit_events to service_role;

create or replace function private.prevent_business_quick_auth_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Business Quick Auth audit events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_business_quick_auth_audit_mutation
before update or delete on public.business_quick_auth_audit_events
for each row execute function private.prevent_business_quick_auth_audit_mutation();

revoke all on function private.prevent_business_quick_auth_audit_mutation()
  from public, anon, authenticated, service_role;

create or replace function private.has_active_business_access_v1(p_auth_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
  );
$$;

create or replace function private.is_non_operational_phone_orphan_v1(
  p_auth_user_id uuid,
  p_phone_e164 text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_auth_user_id
      and auth_user.email is null
      and auth_user.phone_confirmed_at is not null
      and private.normalize_moldova_phone_e164_v1(auth_user.phone) = p_phone_e164
      and not auth_user.is_anonymous
      and (
        select count(*)
        from auth.identities identity
        where identity.user_id = auth_user.id
      ) = 1
      and exists (
        select 1
        from auth.identities identity
        where identity.user_id = auth_user.id
          and identity.provider = 'phone'
      )
      and not exists (
        select 1 from public.user_profiles profile where profile.id = auth_user.id
      )
      and not exists (
        select 1 from public.company_memberships membership where membership.user_id = auth_user.id
      )
      and not exists (
        select 1 from public.commercial_agents agent where agent.user_id = auth_user.id
      )
      and not exists (
        select 1 from public.commercial_agent_applications application
        where application.applicant_user_id = auth_user.id
      )
      and not exists (
        select 1 from public.customer_accounts account where account.auth_user_id = auth_user.id
      )
      and not exists (
        select 1 from public.customer_account_purchase_entitlements entitlement
        where entitlement.auth_user_id = auth_user.id
      )
      and not exists (
        select 1 from public.retail_order_auth_bindings binding
        where binding.auth_user_id = auth_user.id
      )
  );
$$;

revoke all on function private.has_active_business_access_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.is_non_operational_phone_orphan_v1(uuid, text)
  from public, anon, authenticated, service_role;

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
  v_auth_phone_owner_id uuid;
  v_auth_phone_owner_count integer := 0;
  v_any_auth_phone_owner_id uuid;
  v_any_auth_phone_owner_count integer := 0;
  v_business_candidate_id uuid;
  v_business_candidate_count integer := 0;
  v_customer_available boolean := false;
  v_customer_blocked boolean := false;
  v_customer_evidence jsonb;
  v_business_available boolean := false;
  v_candidate_customer_available boolean := false;
  v_resolution text := 'NOT_REGISTERED';
  v_subject_auth_user_id uuid;
  v_otp_subject_auth_user_id uuid;
  v_recovery_kind text;
  v_email_required boolean := false;
  v_challenge public.quick_auth_challenges%rowtype;
  v_phone_count integer;
  v_requester_count integer;
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

  select count(*)::integer, (array_agg(candidate.id order by candidate.id))[1]
    into v_auth_phone_owner_count, v_auth_phone_owner_id
  from auth.users candidate
  where candidate.phone in (p_phone_e164, substr(p_phone_e164, 2))
    and candidate.phone_confirmed_at is not null;

  select count(*)::integer, (array_agg(candidate.id order by candidate.id))[1]
    into v_any_auth_phone_owner_count, v_any_auth_phone_owner_id
  from auth.users candidate
  where candidate.phone in (p_phone_e164, substr(p_phone_e164, 2));

  select count(*)::integer, (array_agg(candidate.user_id order by candidate.user_id))[1]
    into v_business_candidate_count, v_business_candidate_id
  from (
    select distinct profile.id as user_id
    from public.user_profiles profile
    join public.company_memberships membership on membership.user_id = profile.id
    join public.partner_companies company on company.id = membership.company_id
    where private.normalize_moldova_phone_e164_v1(profile.phone) = p_phone_e164
      and profile.status = 'active'
      and membership.status = 'active'
      and company.status = 'active'
  ) candidate;

  if v_auth_phone_owner_count = 1 then
    select public.resolve_customer_access_entitlement_v1(v_auth_phone_owner_id)
      into v_customer_evidence;
    v_customer_available := coalesce(v_customer_evidence ->> 'accountStatus', '') = 'ACTIVE'
      and (
        coalesce((v_customer_evidence ->> 'purchaseBacked')::boolean, false)
        or coalesce((v_customer_evidence ->> 'legacyCompatible')::boolean, false)
      );
    v_customer_blocked := coalesce(v_customer_evidence ->> 'accountStatus', '')
      in ('IDENTITY_REVIEW_REQUIRED', 'SUSPENDED');
    v_business_available := private.has_active_business_access_v1(v_auth_phone_owner_id);
  end if;

  if v_business_candidate_count = 1 then
    select public.resolve_customer_access_entitlement_v1(v_business_candidate_id)
      into v_customer_evidence;
    v_candidate_customer_available := coalesce(v_customer_evidence ->> 'accountStatus', '') = 'ACTIVE'
      and (
        coalesce((v_customer_evidence ->> 'purchaseBacked')::boolean, false)
        or coalesce((v_customer_evidence ->> 'legacyCompatible')::boolean, false)
      );
  end if;

  if v_any_auth_phone_owner_count > 1 or v_business_candidate_count > 1 then
    v_resolution := 'BLOCKED';
  elsif v_business_candidate_count = 1 then
    if v_any_auth_phone_owner_id is null then
      v_subject_auth_user_id := v_business_candidate_id;
      v_otp_subject_auth_user_id := v_business_candidate_id;
      v_recovery_kind := 'PHONE_ENROLLMENT';
      v_resolution := case when v_candidate_customer_available
        then 'MULTIPLE_CONTEXT_EDGE_CASE' else 'BUSINESS_EMAIL_REQUIRED' end;
      v_email_required := true;
    elsif v_any_auth_phone_owner_id = v_business_candidate_id
      and v_auth_phone_owner_id = v_business_candidate_id then
      v_subject_auth_user_id := v_business_candidate_id;
      v_otp_subject_auth_user_id := v_business_candidate_id;
      v_recovery_kind := 'DIRECT';
      v_resolution := case when v_customer_available
        then 'MULTIPLE_CONTEXT_EDGE_CASE' else 'BUSINESS_EMAIL_REQUIRED' end;
      v_email_required := true;
    elsif v_any_auth_phone_owner_id = v_business_candidate_id
      and v_auth_phone_owner_id is null then
      v_subject_auth_user_id := v_business_candidate_id;
      v_otp_subject_auth_user_id := v_business_candidate_id;
      v_recovery_kind := 'PHONE_ENROLLMENT';
      v_resolution := case when v_candidate_customer_available
        then 'MULTIPLE_CONTEXT_EDGE_CASE' else 'BUSINESS_EMAIL_REQUIRED' end;
      v_email_required := true;
    elsif private.is_non_operational_phone_orphan_v1(v_auth_phone_owner_id, p_phone_e164) then
      v_subject_auth_user_id := v_business_candidate_id;
      v_otp_subject_auth_user_id := v_auth_phone_owner_id;
      v_recovery_kind := 'ORPHAN_REBIND';
      v_resolution := case when v_candidate_customer_available
        then 'MULTIPLE_CONTEXT_EDGE_CASE' else 'BUSINESS_EMAIL_REQUIRED' end;
      v_email_required := true;
    else
      v_resolution := 'BLOCKED';
    end if;
  elsif v_auth_phone_owner_count = 1 then
    v_subject_auth_user_id := v_auth_phone_owner_id;
    v_otp_subject_auth_user_id := v_auth_phone_owner_id;
    v_recovery_kind := 'DIRECT';
    v_resolution := case
      when v_customer_available and v_business_available and p_business_phone_otp_enabled
        then 'MULTIPLE_CONTEXT_EDGE_CASE'
      when v_customer_available then 'CUSTOMER_OTP'
      when v_business_available and p_business_phone_otp_enabled
        then 'BUSINESS_EMAIL_REQUIRED'
      when v_customer_blocked or v_business_available then 'BLOCKED'
      else 'NOT_REGISTERED'
    end;
    v_email_required := v_resolution in ('BUSINESS_EMAIL_REQUIRED', 'MULTIPLE_CONTEXT_EDGE_CASE')
      and v_business_available;
  end if;

  if not p_business_phone_otp_enabled and v_email_required then
    if v_auth_phone_owner_id = v_subject_auth_user_id and v_customer_available then
      v_resolution := 'CUSTOMER_OTP';
      v_recovery_kind := 'DIRECT';
      v_email_required := false;
    else
      v_resolution := 'BLOCKED';
      v_subject_auth_user_id := null;
      v_otp_subject_auth_user_id := null;
      v_recovery_kind := null;
      v_email_required := false;
    end if;
  end if;

  insert into public.quick_auth_challenges(
    phone_key_hash,
    requester_key_hash,
    subject_auth_user_id,
    otp_subject_auth_user_id,
    resolution,
    email_verification_required,
    business_recovery_kind,
    expires_at
  ) values (
    p_phone_key_hash,
    p_requester_key_hash,
    case when v_resolution in ('CUSTOMER_OTP', 'BUSINESS_EMAIL_REQUIRED', 'MULTIPLE_CONTEXT_EDGE_CASE')
      then v_subject_auth_user_id else null end,
    case when v_resolution in ('CUSTOMER_OTP', 'BUSINESS_EMAIL_REQUIRED', 'MULTIPLE_CONTEXT_EDGE_CASE')
      then v_otp_subject_auth_user_id else null end,
    v_resolution,
    v_email_required,
    case when v_resolution in ('CUSTOMER_OTP', 'BUSINESS_EMAIL_REQUIRED', 'MULTIPLE_CONTEXT_EDGE_CASE')
      then v_recovery_kind else null end,
    now() + interval '10 minutes'
  ) returning * into v_challenge;

  if v_challenge.business_recovery_kind = 'ORPHAN_REBIND' then
    insert into public.business_quick_auth_audit_events(
      challenge_id,
      canonical_subject_auth_user_id,
      related_auth_user_id,
      event_type,
      phone_key_hash
    ) values (
      v_challenge.id,
      v_challenge.subject_auth_user_id,
      v_challenge.otp_subject_auth_user_id,
      'BUSINESS_PHONE_RECOVERY_STARTED',
      v_challenge.phone_key_hash
    );
  end if;

  return jsonb_build_object(
    'challengeId', v_challenge.id,
    'resolution', v_challenge.resolution,
    'subjectAuthUserId', v_challenge.subject_auth_user_id,
    'otpSubjectAuthUserId', v_challenge.otp_subject_auth_user_id,
    'emailRequired', v_challenge.email_verification_required,
    'recoveryKind', v_challenge.business_recovery_kind,
    'phoneRebound', false,
    'expiresAt', v_challenge.expires_at,
    'maskedPhone', '+373 ** *** ' || right(p_phone_e164, 2)
  );
end;
$$;

create or replace function public.read_quick_auth_challenge_v1(
  p_challenge_id uuid,
  p_phone_key_hash text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'challengeId', challenge.id,
    'resolution', challenge.resolution,
    'status', challenge.status,
    'subjectAuthUserId', challenge.subject_auth_user_id,
    'otpSubjectAuthUserId', challenge.otp_subject_auth_user_id,
    'emailRequired', challenge.email_verification_required,
    'recoveryKind', challenge.business_recovery_kind,
    'phoneRebound', challenge.phone_rebound_at is not null,
    'expiresAt', challenge.expires_at
  )
  from public.quick_auth_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
  limit 1;
$$;

create or replace function public.reserve_quick_auth_business_email_attempt_v1(
  p_challenge_id uuid,
  p_phone_key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quick_auth_challenges challenge
  set email_verification_attempt_count = challenge.email_verification_attempt_count + 1
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and challenge.resolution in ('BUSINESS_EMAIL_REQUIRED', 'MULTIPLE_CONTEXT_EDGE_CASE')
    and challenge.email_verification_required
    and challenge.status = 'OPEN'
    and challenge.subject_auth_user_id is not null
    and challenge.email_verification_attempt_count < 5
    and private.has_active_business_access_v1(challenge.subject_auth_user_id);

  return found;
end;
$$;

create or replace function public.confirm_quick_auth_business_email_v1(
  p_challenge_id uuid,
  p_phone_key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.quick_auth_challenges%rowtype;
begin
  update public.quick_auth_challenges challenge
  set email_verified_at = now()
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and challenge.resolution in ('BUSINESS_EMAIL_REQUIRED', 'MULTIPLE_CONTEXT_EDGE_CASE')
    and challenge.email_verification_required
    and challenge.status = 'OPEN'
    and challenge.email_verified_at is null
    and challenge.email_verification_attempt_count between 1 and 5
    and private.has_active_business_access_v1(challenge.subject_auth_user_id)
  returning * into v_challenge;

  if not found then
    return false;
  end if;

  insert into public.business_quick_auth_audit_events(
    challenge_id,
    canonical_subject_auth_user_id,
    related_auth_user_id,
    event_type,
    phone_key_hash
  ) values (
    v_challenge.id,
    v_challenge.subject_auth_user_id,
    case when v_challenge.business_recovery_kind = 'ORPHAN_REBIND'
      then v_challenge.otp_subject_auth_user_id else null end,
    'BUSINESS_EMAIL_CONFIRMED',
    v_challenge.phone_key_hash
  ) on conflict (challenge_id, event_type) do nothing;

  return true;
end;
$$;

create or replace function public.reserve_quick_auth_otp_send_v1(
  p_challenge_id uuid,
  p_phone_key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quick_auth_challenges challenge
  set status = 'OTP_SENT',
      otp_send_count = challenge.otp_send_count + 1,
      otp_sent_at = now()
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and (not challenge.email_verification_required or challenge.email_verified_at is not null)
    and challenge.status in ('OPEN', 'OTP_SENT', 'FAILED')
    and challenge.otp_send_count < 3
    and (challenge.otp_sent_at is null or challenge.otp_sent_at <= now() - interval '60 seconds');

  return found;
end;
$$;

create or replace function public.resolve_governed_business_auth_sms_v1(
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
      or p_phone_key_hash !~ '^[0-9a-f]{64}$'
      then null
    when exists (
      select 1
      from public.business_phone_enrollment_challenges challenge
      where challenge.auth_user_id = p_auth_user_id
        and challenge.phone_key_hash = p_phone_key_hash
        and challenge.status = 'OTP_SENT'
        and challenge.expires_at > now()
    ) then 'BUSINESS_PHONE_ENROLLMENT'
    when exists (
      select 1
      from public.quick_auth_challenges challenge
      where challenge.otp_subject_auth_user_id = p_auth_user_id
        and challenge.phone_key_hash = p_phone_key_hash
        and challenge.status = 'OTP_SENT'
        and challenge.expires_at > now()
        and challenge.email_verification_required
        and challenge.email_verified_at is not null
        and private.has_active_business_access_v1(challenge.subject_auth_user_id)
        and (
          challenge.business_recovery_kind <> 'ORPHAN_REBIND'
          or (
            challenge.phone_rebound_at is null
            and private.is_non_operational_phone_orphan_v1(
              challenge.otp_subject_auth_user_id,
              private.normalize_moldova_phone_e164_v1((
                select auth_user.phone
                from auth.users auth_user
                where auth_user.id = challenge.otp_subject_auth_user_id
              ))
            )
          )
          or (
            challenge.phone_rebound_at is not null
            and challenge.otp_subject_auth_user_id = challenge.subject_auth_user_id
            and exists (
              select 1 from auth.users auth_user
              where auth_user.id = challenge.subject_auth_user_id
                and auth_user.phone_confirmed_at is not null
            )
          )
        )
    ) then 'BUSINESS_QUICK_AUTH'
    else null
  end;
$$;

create or replace function public.complete_quick_auth_orphan_rebind_v1(
  p_challenge_id uuid,
  p_phone_e164 text,
  p_phone_key_hash text,
  p_proof_auth_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.quick_auth_challenges%rowtype;
  v_phone_identity_id uuid;
  v_phone_identity_count integer;
begin
  if p_phone_e164 is null or p_phone_e164 !~ '^\+373[0-9]{8}$'
    or p_phone_key_hash is null or p_phone_key_hash !~ '^[0-9a-f]{64}$'
    or p_proof_auth_user_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone_key_hash, 20260920));

  select * into v_challenge
  from public.quick_auth_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and challenge.status = 'OTP_SENT'
    and challenge.email_verification_required
    and challenge.email_verified_at is not null
    and challenge.business_recovery_kind = 'ORPHAN_REBIND'
    and challenge.phone_rebound_at is null
    and challenge.subject_auth_user_id is not null
    and challenge.otp_subject_auth_user_id = p_proof_auth_user_id
  for update;

  if not found
    or not private.has_active_business_access_v1(v_challenge.subject_auth_user_id)
    or not private.is_non_operational_phone_orphan_v1(p_proof_auth_user_id, p_phone_e164)
    or not exists (
      select 1
      from public.user_profiles profile
      where profile.id = v_challenge.subject_auth_user_id
        and profile.status = 'active'
        and private.normalize_moldova_phone_e164_v1(profile.phone) = p_phone_e164
    )
    or (
      select count(distinct profile.id)
      from public.user_profiles profile
      join public.company_memberships membership on membership.user_id = profile.id
      join public.partner_companies company on company.id = membership.company_id
      where private.normalize_moldova_phone_e164_v1(profile.phone) = p_phone_e164
        and profile.status = 'active'
        and membership.status = 'active'
        and company.status = 'active'
    ) <> 1 then
    return false;
  end if;

  perform 1
  from auth.users auth_user
  where auth_user.id in (v_challenge.subject_auth_user_id, p_proof_auth_user_id)
  order by auth_user.id
  for update;

  select count(*)::integer, (array_agg(identity.id order by identity.id))[1]
    into v_phone_identity_count, v_phone_identity_id
  from auth.identities identity
  where identity.user_id = p_proof_auth_user_id
    and identity.provider = 'phone';

  if v_phone_identity_count <> 1
    or exists (
      select 1 from auth.identities identity
      where identity.user_id = v_challenge.subject_auth_user_id
        and identity.provider = 'phone'
    )
    or exists (
      select 1 from auth.users auth_user
      where auth_user.id not in (v_challenge.subject_auth_user_id, p_proof_auth_user_id)
        and auth_user.phone in (p_phone_e164, substr(p_phone_e164, 2))
    ) then
    return false;
  end if;

  update auth.users
  set phone = null,
      phone_confirmed_at = null,
      phone_change = '',
      phone_change_token = '',
      phone_change_sent_at = null,
      raw_app_meta_data = (coalesce(raw_app_meta_data, '{}'::jsonb) - 'provider')
        || jsonb_build_object('providers', '[]'::jsonb),
      updated_at = now()
  where id = p_proof_auth_user_id;

  update auth.users
  set phone = substr(p_phone_e164, 2),
      phone_confirmed_at = now(),
      phone_change = '',
      phone_change_token = '',
      phone_change_sent_at = null,
      updated_at = now()
  where id = v_challenge.subject_auth_user_id;

  update auth.identities
  set user_id = v_challenge.subject_auth_user_id,
      provider_id = v_challenge.subject_auth_user_id::text,
      identity_data = jsonb_set(
        jsonb_set(coalesce(identity_data, '{}'::jsonb), '{sub}', to_jsonb(v_challenge.subject_auth_user_id::text), true),
        '{phone_verified}',
        'true'::jsonb,
        true
      ),
      updated_at = now()
  where id = v_phone_identity_id;

  update public.quick_auth_challenges
  set otp_subject_auth_user_id = v_challenge.subject_auth_user_id,
      phone_rebound_at = now()
  where id = v_challenge.id;

  insert into public.business_quick_auth_audit_events(
    challenge_id,
    canonical_subject_auth_user_id,
    related_auth_user_id,
    event_type,
    phone_key_hash
  ) values
    (v_challenge.id, v_challenge.subject_auth_user_id, p_proof_auth_user_id,
      'BUSINESS_PHONE_POSSESSION_CONFIRMED', v_challenge.phone_key_hash),
    (v_challenge.id, v_challenge.subject_auth_user_id, p_proof_auth_user_id,
      'ORPHAN_PHONE_DETACHED', v_challenge.phone_key_hash),
    (v_challenge.id, v_challenge.subject_auth_user_id, p_proof_auth_user_id,
      'BUSINESS_PHONE_REBOUND', v_challenge.phone_key_hash)
  on conflict (challenge_id, event_type) do nothing;

  return true;
end;
$$;

create or replace function public.complete_quick_auth_challenge_v1(
  p_challenge_id uuid,
  p_phone_key_hash text,
  p_phone_e164 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.quick_auth_challenges%rowtype;
begin
  if p_phone_key_hash is null or p_phone_key_hash !~ '^[0-9a-f]{64}$'
    or p_phone_e164 is null or p_phone_e164 !~ '^\+373[0-9]{8}$' then
    return false;
  end if;

  select * into v_challenge
  from public.quick_auth_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and challenge.status = 'OTP_SENT'
    and challenge.subject_auth_user_id is not null
    and challenge.otp_subject_auth_user_id = challenge.subject_auth_user_id
  for update;

  if not found or not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = v_challenge.subject_auth_user_id
      and auth_user.phone_confirmed_at is not null
      and private.normalize_moldova_phone_e164_v1(auth_user.phone) = p_phone_e164
  ) then
    return false;
  end if;

  if v_challenge.email_verification_required and (
    v_challenge.email_verified_at is null
    or not private.has_active_business_access_v1(v_challenge.subject_auth_user_id)
  ) then
    return false;
  end if;

  update public.quick_auth_challenges
  set status = 'VERIFIED', verified_at = now()
  where id = v_challenge.id;

  if v_challenge.email_verification_required then
    insert into public.business_quick_auth_audit_events(
      challenge_id,
      canonical_subject_auth_user_id,
      related_auth_user_id,
      event_type,
      phone_key_hash
    ) values
      (v_challenge.id, v_challenge.subject_auth_user_id,
        case when v_challenge.business_recovery_kind = 'ORPHAN_REBIND'
          then v_challenge.otp_subject_auth_user_id else null end,
        'BUSINESS_PHONE_POSSESSION_CONFIRMED', v_challenge.phone_key_hash),
      (v_challenge.id, v_challenge.subject_auth_user_id, null,
        'BUSINESS_QUICK_AUTH_COMPLETED', v_challenge.phone_key_hash)
    on conflict (challenge_id, event_type) do nothing;
  end if;

  return true;
end;
$$;

revoke all on function public.complete_quick_auth_orphan_rebind_v1(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_quick_auth_challenge_v1(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_quick_auth_orphan_rebind_v1(uuid, text, text, uuid)
  to service_role;
grant execute on function public.complete_quick_auth_challenge_v1(uuid, text, text)
  to service_role;

comment on function private.normalize_moldova_phone_e164_v1(text) is
  'Canonical server-side Moldova phone normalization shared by governed Business profile discovery and Auth ownership checks.';
comment on table public.business_quick_auth_audit_events is
  'Append-only identity-recovery evidence. Stores internal subject IDs and keyed phone fingerprints, never raw phone, email, OTP, SMS or session material.';
comment on function public.start_quick_auth_challenge_v1(text, text, text, boolean) is
  'Resolves Customer Auth phone ownership and independently resolves exactly one active governed Business profile phone without exposing identity details. Service-role only.';
comment on function public.complete_quick_auth_orphan_rebind_v1(uuid, text, text, uuid) is
  'Atomically transfers a confirmed phone identity from a strictly non-operational Auth orphan to the email-confirmed canonical Business subject after server-verified OTP proof. Service-role only.';
comment on function public.complete_quick_auth_challenge_v1(uuid, text, text) is
  'Completes Quick Auth only when the canonical subject owns a confirmed phone; emits immutable Business completion evidence where applicable. Service-role only.';
