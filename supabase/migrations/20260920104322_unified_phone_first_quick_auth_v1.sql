create table public.quick_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  phone_key_hash text not null check (phone_key_hash ~ '^[0-9a-f]{64}$'),
  requester_key_hash text not null check (requester_key_hash ~ '^[0-9a-f]{64}$'),
  subject_auth_user_id uuid null references auth.users(id) on delete cascade,
  resolution text not null check (
    resolution in (
      'CUSTOMER_OTP',
      'BUSINESS_EMAIL_REQUIRED',
      'NOT_REGISTERED',
      'BLOCKED',
      'MULTIPLE_CONTEXT_EDGE_CASE'
    )
  ),
  status text not null default 'OPEN' check (status in ('OPEN', 'OTP_SENT', 'VERIFIED', 'FAILED')),
  email_verification_attempt_count smallint not null default 0 check (email_verification_attempt_count between 0 and 5),
  otp_send_count smallint not null default 0 check (otp_send_count between 0 and 3),
  otp_verification_attempt_count smallint not null default 0 check (otp_verification_attempt_count between 0 and 6),
  expires_at timestamptz not null,
  email_verified_at timestamptz null,
  otp_sent_at timestamptz null,
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_auth_challenges_expiry_check check (expires_at > created_at),
  constraint quick_auth_challenges_verified_check check (
    (status = 'VERIFIED' and verified_at is not null)
    or (status <> 'VERIFIED' and verified_at is null)
  )
);

create index quick_auth_challenges_phone_window_idx
  on public.quick_auth_challenges(phone_key_hash, created_at desc);
create index quick_auth_challenges_requester_window_idx
  on public.quick_auth_challenges(requester_key_hash, created_at desc);
create index quick_auth_challenges_expiry_idx
  on public.quick_auth_challenges(expires_at);
create index quick_auth_challenges_subject_idx
  on public.quick_auth_challenges(subject_auth_user_id)
  where subject_auth_user_id is not null;

alter table public.quick_auth_challenges enable row level security;
alter table public.quick_auth_challenges force row level security;

revoke all on table public.quick_auth_challenges from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.quick_auth_challenges to service_role;

create table public.business_phone_enrollment_challenges (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  phone_key_hash text not null check (phone_key_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'OPEN' check (status in ('OPEN', 'OTP_SENT', 'VERIFIED', 'FAILED')),
  is_phone_change boolean not null default false,
  otp_send_count smallint not null default 0 check (otp_send_count between 0 and 3),
  otp_verification_attempt_count smallint not null default 0 check (otp_verification_attempt_count between 0 and 6),
  expires_at timestamptz not null,
  otp_sent_at timestamptz null,
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_phone_enrollment_expiry_check check (expires_at > created_at),
  constraint business_phone_enrollment_verified_check check (
    (status = 'VERIFIED' and verified_at is not null)
    or (status <> 'VERIFIED' and verified_at is null)
  )
);

create unique index business_phone_enrollment_active_phone_idx
  on public.business_phone_enrollment_challenges(phone_key_hash)
  where status in ('OPEN', 'OTP_SENT');
create unique index business_phone_enrollment_active_user_idx
  on public.business_phone_enrollment_challenges(auth_user_id)
  where status in ('OPEN', 'OTP_SENT');
create index business_phone_enrollment_auth_user_idx
  on public.business_phone_enrollment_challenges(auth_user_id);
create index business_phone_enrollment_expiry_idx
  on public.business_phone_enrollment_challenges(expires_at);

create table public.business_phone_enrollment_audit_events (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid null references public.business_phone_enrollment_challenges(id) on delete set null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'BUSINESS_PHONE_ENROLLMENT_STARTED',
      'BUSINESS_PHONE_ENROLLMENT_CONFIRMED',
      'BUSINESS_PHONE_ENROLLMENT_FAILED',
      'BUSINESS_PHONE_CHANGED'
    )
  ),
  phone_key_hash text not null check (phone_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index business_phone_enrollment_audit_user_idx
  on public.business_phone_enrollment_audit_events(auth_user_id, created_at desc);
create index business_phone_enrollment_audit_challenge_idx
  on public.business_phone_enrollment_audit_events(challenge_id)
  where challenge_id is not null;

alter table public.business_phone_enrollment_challenges enable row level security;
alter table public.business_phone_enrollment_challenges force row level security;
alter table public.business_phone_enrollment_audit_events enable row level security;
alter table public.business_phone_enrollment_audit_events force row level security;

revoke all on table public.business_phone_enrollment_challenges,
  public.business_phone_enrollment_audit_events from public, anon, authenticated, service_role;
grant select, insert, update on table public.business_phone_enrollment_challenges to service_role;
grant select, insert on table public.business_phone_enrollment_audit_events to service_role;

create or replace function private.touch_quick_auth_challenge_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_quick_auth_challenge_updated_at
before update on public.quick_auth_challenges
for each row execute function private.touch_quick_auth_challenge_updated_at();

create trigger touch_business_phone_enrollment_updated_at
before update on public.business_phone_enrollment_challenges
for each row execute function private.touch_quick_auth_challenge_updated_at();

create or replace function private.prevent_business_phone_enrollment_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Business phone enrollment audit events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_business_phone_enrollment_audit_mutation
before update or delete on public.business_phone_enrollment_audit_events
for each row execute function private.prevent_business_phone_enrollment_audit_mutation();

revoke all on function private.touch_quick_auth_challenge_updated_at() from public, anon, authenticated, service_role;
revoke all on function private.prevent_business_phone_enrollment_audit_mutation() from public, anon, authenticated, service_role;

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

  -- Separate, consistently ordered locks make both the per-phone and
  -- per-requester rate-limit counts atomic across concurrent requests.
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
  where candidate.phone = p_phone_e164
    and candidate.phone_confirmed_at is not null;

  if v_auth_user_count = 1 then
    select candidate.id into v_user_id
    from auth.users candidate
    where candidate.phone = p_phone_e164
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
    and challenge.resolution = 'BUSINESS_EMAIL_REQUIRED'
    and challenge.status = 'OPEN'
    and challenge.subject_auth_user_id is not null
    and challenge.email_verification_attempt_count < 5
    and (
      exists (
        select 1
        from public.user_profiles profile
        join public.company_memberships membership on membership.user_id = profile.id
        join public.partner_companies company on company.id = membership.company_id
        where profile.id = challenge.subject_auth_user_id
          and profile.status = 'active'
          and membership.status = 'active'
          and company.status = 'active'
      )
      or exists (
        select 1
        from public.commercial_agents agent
        where agent.user_id = challenge.subject_auth_user_id
          and agent.status = 'ACTIVE'
      )
    );

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
begin
  update public.quick_auth_challenges challenge
  set email_verified_at = now()
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and challenge.resolution = 'BUSINESS_EMAIL_REQUIRED'
    and challenge.status = 'OPEN'
    and challenge.email_verification_attempt_count between 1 and 5;

  return found;
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
    and (
      challenge.resolution in ('CUSTOMER_OTP', 'MULTIPLE_CONTEXT_EDGE_CASE')
      or (
        challenge.resolution = 'BUSINESS_EMAIL_REQUIRED'
        and challenge.email_verified_at is not null
      )
    )
    and challenge.status in ('OPEN', 'OTP_SENT', 'FAILED')
    and challenge.otp_send_count < 3
    and (challenge.otp_sent_at is null or challenge.otp_sent_at <= now() - interval '60 seconds');

  return found;
end;
$$;

create or replace function public.reserve_quick_auth_otp_verification_v1(
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
  set otp_verification_attempt_count = challenge.otp_verification_attempt_count + 1
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and challenge.status = 'OTP_SENT'
    and challenge.otp_verification_attempt_count < 6;

  return found;
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
    'expiresAt', challenge.expires_at
  )
  from public.quick_auth_challenges challenge
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
  limit 1;
$$;

create or replace function public.set_quick_auth_challenge_status_v1(
  p_challenge_id uuid,
  p_phone_key_hash text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('VERIFIED', 'FAILED') then
    raise exception 'quick_auth_invalid_status' using errcode = '22023';
  end if;

  update public.quick_auth_challenges challenge
  set status = p_status,
      otp_sent_at = challenge.otp_sent_at,
      verified_at = case when p_status = 'VERIFIED' then now() else null end
  where challenge.id = p_challenge_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and (
      (p_status = 'VERIFIED' and challenge.status = 'OTP_SENT')
      or (p_status = 'FAILED' and challenge.status in ('OPEN', 'OTP_SENT'))
    );

  return found;
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
    where candidate.phone_change = p_phone_e164
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

  if v_user.phone = p_phone_e164 and v_user.phone_confirmed_at is not null then
    return jsonb_build_object('result', 'ALREADY_CONFIRMED');
  end if;

  select exists (
    select 1
    from auth.users candidate
    where candidate.id <> p_auth_user_id
      and (
        (candidate.phone = p_phone_e164 and candidate.phone_confirmed_at is not null)
        or candidate.phone_change = p_phone_e164
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
    v_user.phone_confirmed_at is not null and coalesce(v_user.phone, '') <> p_phone_e164,
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
        (candidate.phone = p_phone_e164 and candidate.phone_confirmed_at is not null)
        or candidate.phone_change = p_phone_e164
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

create or replace function public.reserve_business_phone_enrollment_verification_v1(
  p_challenge_id uuid,
  p_auth_user_id uuid,
  p_phone_key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.business_phone_enrollment_challenges challenge
  set otp_verification_attempt_count = challenge.otp_verification_attempt_count + 1
  where challenge.id = p_challenge_id
    and challenge.auth_user_id = p_auth_user_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.expires_at > now()
    and challenge.status = 'OTP_SENT'
    and challenge.otp_verification_attempt_count < 6;

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
      and candidate.phone = p_phone_e164
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

create or replace function public.fail_business_phone_enrollment_v1(
  p_challenge_id uuid,
  p_auth_user_id uuid,
  p_phone_key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failed public.business_phone_enrollment_challenges%rowtype;
begin
  update public.business_phone_enrollment_challenges challenge
  set status = 'FAILED'
  where challenge.id = p_challenge_id
    and challenge.auth_user_id = p_auth_user_id
    and challenge.phone_key_hash = p_phone_key_hash
    and challenge.status in ('OPEN', 'OTP_SENT')
  returning * into v_failed;

  if not found then
    return false;
  end if;

  insert into public.business_phone_enrollment_audit_events(
    challenge_id,
    auth_user_id,
    event_type,
    phone_key_hash
  ) values (
    v_failed.id,
    v_failed.auth_user_id,
    'BUSINESS_PHONE_ENROLLMENT_FAILED',
    v_failed.phone_key_hash
  );

  return true;
end;
$$;

create or replace function public.business_phone_quick_auth_coverage_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select distinct profile.id as auth_user_id
    from public.user_profiles profile
    join public.company_memberships membership on membership.user_id = profile.id
    join public.partner_companies company on company.id = membership.company_id
    where profile.status = 'active'
      and membership.status = 'active'
      and company.status = 'active'
    union
    select agent.user_id
    from public.commercial_agents agent
    where agent.status = 'ACTIVE'
      and agent.user_id is not null
  )
  select jsonb_build_object(
    'businessAuthUsersTotal', count(*)::integer,
    'businessUsersEligibleForPhoneEnrollment', count(*)::integer,
    'businessAuthUsersWithConfirmedPhone', count(*) filter (
      where auth_user.phone is not null and auth_user.phone_confirmed_at is not null
    )::integer,
    'businessPhoneQuickAuthReady', count(*) filter (
      where auth_user.phone is not null and auth_user.phone_confirmed_at is not null
    )::integer
  )
  from eligible
  join auth.users auth_user on auth_user.id = eligible.auth_user_id;
$$;

revoke all on function public.start_quick_auth_challenge_v1(text, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.reserve_quick_auth_business_email_attempt_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.confirm_quick_auth_business_email_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.reserve_quick_auth_otp_send_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.reserve_quick_auth_otp_verification_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.read_quick_auth_challenge_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.set_quick_auth_challenge_status_v1(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.prepare_business_phone_enrollment_v1(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reserve_business_phone_enrollment_send_v1(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reserve_business_phone_enrollment_verification_v1(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.complete_business_phone_enrollment_v1(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.fail_business_phone_enrollment_v1(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.business_phone_quick_auth_coverage_v1() from public, anon, authenticated, service_role;

grant execute on function public.start_quick_auth_challenge_v1(text, text, text, boolean) to service_role;
grant execute on function public.reserve_quick_auth_business_email_attempt_v1(uuid, text) to service_role;
grant execute on function public.confirm_quick_auth_business_email_v1(uuid, text) to service_role;
grant execute on function public.reserve_quick_auth_otp_send_v1(uuid, text) to service_role;
grant execute on function public.reserve_quick_auth_otp_verification_v1(uuid, text) to service_role;
grant execute on function public.read_quick_auth_challenge_v1(uuid, text) to service_role;
grant execute on function public.set_quick_auth_challenge_status_v1(uuid, text, text) to service_role;
grant execute on function public.prepare_business_phone_enrollment_v1(uuid, text, text) to service_role;
grant execute on function public.reserve_business_phone_enrollment_send_v1(uuid, uuid, text, text) to service_role;
grant execute on function public.reserve_business_phone_enrollment_verification_v1(uuid, uuid, text) to service_role;
grant execute on function public.complete_business_phone_enrollment_v1(uuid, uuid, text, text) to service_role;
grant execute on function public.fail_business_phone_enrollment_v1(uuid, uuid, text) to service_role;
grant execute on function public.business_phone_quick_auth_coverage_v1() to service_role;

comment on table public.quick_auth_challenges is
  'Server-only, expiring Quick Auth state. Stores keyed phone/request fingerprints and an internal Auth subject only; never stores raw phone, email, OTP or session material.';
comment on function public.start_quick_auth_challenge_v1(text, text, text, boolean) is
  'Resolves an existing confirmed Supabase phone against governed local Customer/Business access and atomically reserves a bounded Quick Auth challenge. Service-role only.';
comment on function public.reserve_quick_auth_otp_send_v1(uuid, text) is
  'Atomically reserves one of at most three OTP sends with a server-owned 60-second cooldown. Service-role only.';
comment on function public.reserve_quick_auth_otp_verification_v1(uuid, text) is
  'Atomically reserves one of at most six OTP verification attempts. Service-role only.';
comment on function public.read_quick_auth_challenge_v1(uuid, text) is
  'Reads one unexpired Quick Auth challenge by opaque ID plus keyed phone proof. Service-role only.';
comment on function public.set_quick_auth_challenge_status_v1(uuid, text, text) is
  'Advances the bounded Quick Auth challenge state without storing provider OTP material. Service-role only.';
comment on table public.business_phone_enrollment_challenges is
  'Server-only bounded proof that the currently authenticated Business user requested and verified a phone change. Raw phones, OTPs, tokens and SMS content are never persisted.';
comment on table public.business_phone_enrollment_audit_events is
  'Append-only Business phone enrollment audit using Auth user IDs and keyed phone fingerprints only.';
comment on function public.prepare_business_phone_enrollment_v1(uuid, text, text) is
  'Validates eligible same-user Business enrollment, rejects confirmed or pending phone conflicts and safely clears only expired flow-owned phone_change state. Service-role only.';
comment on function public.business_phone_quick_auth_coverage_v1() is
  'Returns aggregate Business phone enrollment coverage without phone values or PII. Service-role only.';
