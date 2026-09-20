begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('76000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'canonical-partner@example.test', now(), null, null,
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('76000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', null, null, '37361000001', now(),
    '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('76000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'duplicate-partner@example.test', now(), null, null,
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('76000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'operational-customer@example.test', now(), '37361000002', now(),
    '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('76000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'blocked-partner@example.test', now(), null, null,
    '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values
  ('76000000-0000-4000-8000-000000000101', '76000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001', 'email',
    '{"sub":"76000000-0000-4000-8000-000000000001","email":"canonical-partner@example.test","email_verified":true,"phone_verified":false}',
    now(), now(), now()),
  ('76000000-0000-4000-8000-000000000102', '76000000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000002', 'phone',
    '{"sub":"76000000-0000-4000-8000-000000000002","email_verified":false,"phone_verified":true}',
    now(), now(), now()),
  ('76000000-0000-4000-8000-000000000103', '76000000-0000-4000-8000-000000000003',
    '76000000-0000-4000-8000-000000000003', 'email',
    '{"sub":"76000000-0000-4000-8000-000000000003","email":"duplicate-partner@example.test","email_verified":true,"phone_verified":false}',
    now(), now(), now()),
  ('76000000-0000-4000-8000-000000000104', '76000000-0000-4000-8000-000000000004',
    '76000000-0000-4000-8000-000000000004', 'phone',
    '{"sub":"76000000-0000-4000-8000-000000000004","email_verified":false,"phone_verified":true}',
    now(), now(), now()),
  ('76000000-0000-4000-8000-000000000105', '76000000-0000-4000-8000-000000000005',
    '76000000-0000-4000-8000-000000000005', 'email',
    '{"sub":"76000000-0000-4000-8000-000000000005","email":"blocked-partner@example.test","email_verified":true,"phone_verified":false}',
    now(), now(), now());

insert into public.user_profiles (id, email, full_name, phone, status, user_type) values
  ('76000000-0000-4000-8000-000000000001', 'canonical-partner@example.test', 'Canonical Partner', '+37361000001', 'active', 'partner'),
  ('76000000-0000-4000-8000-000000000003', 'duplicate-partner@example.test', 'Duplicate Partner', '061000003', 'active', 'partner'),
  ('76000000-0000-4000-8000-000000000005', 'blocked-partner@example.test', 'Blocked Partner', '+37361000002', 'active', 'partner');

insert into public.partner_companies (id, external_1c_id, display_name, status) values
  ('76000000-0000-4000-8000-000000000201', 'recovery-company-1', 'Recovery Company', 'active'),
  ('76000000-0000-4000-8000-000000000203', 'recovery-company-3', 'Duplicate Company', 'active'),
  ('76000000-0000-4000-8000-000000000205', 'recovery-company-5', 'Blocked Company', 'active');

insert into public.customer_identities (id, identity_kind) values
  ('76000000-0000-4000-8000-000000000304', 'PERSON');

insert into public.company_memberships (user_id, company_id, role_id, status)
select fixture.user_id, fixture.company_id, role.id, 'active'
from (values
  ('76000000-0000-4000-8000-000000000001'::uuid, '76000000-0000-4000-8000-000000000201'::uuid),
  ('76000000-0000-4000-8000-000000000003'::uuid, '76000000-0000-4000-8000-000000000203'::uuid),
  ('76000000-0000-4000-8000-000000000005'::uuid, '76000000-0000-4000-8000-000000000205'::uuid)
) fixture(user_id, company_id)
cross join lateral (
  select id from public.roles where scope = 'partner' order by code limit 1
) role;

insert into public.customer_accounts (
  id, auth_user_id, customer_identity_id, status, identity_resolution_status
) values (
  '76000000-0000-4000-8000-000000000404',
  '76000000-0000-4000-8000-000000000004',
  '76000000-0000-4000-8000-000000000304',
  'ACTIVE',
  'MATCHED'
);

create function pg_temp.auth_phone(target_user_id uuid)
returns text
language sql
security definer
set search_path = auth, pg_catalog
as $$
  select phone from auth.users where id = target_user_id;
$$;

create function pg_temp.auth_phone_confirmed(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = auth, pg_catalog
as $$
  select phone_confirmed_at is not null from auth.users where id = target_user_id;
$$;

create function pg_temp.has_canonical_phone_identity(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = auth, pg_catalog
as $$
  select exists (
    select 1 from auth.identities identity
    where identity.provider = 'phone'
      and identity.user_id = target_user_id
      and identity.provider_id = target_user_id::text
      and identity.identity_data ->> 'sub' = target_user_id::text
  );
$$;

create function pg_temp.has_phone_identity(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = auth, pg_catalog
as $$
  select exists (
    select 1 from auth.identities identity
    where identity.provider = 'phone' and identity.user_id = target_user_id
  );
$$;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  challenge jsonb;
  v_challenge_id uuid;
  phone_hash text := repeat('a', 64);
begin
  challenge := public.start_quick_auth_challenge_v1(
    '+37361000001', phone_hash, repeat('1', 64), true
  );
  v_challenge_id := (challenge ->> 'challengeId')::uuid;

  if challenge ->> 'resolution' <> 'BUSINESS_EMAIL_REQUIRED'
    or challenge ->> 'recoveryKind' <> 'ORPHAN_REBIND'
    or (challenge ->> 'subjectAuthUserId')::uuid <> '76000000-0000-4000-8000-000000000001' then
    raise exception 'Governed Partner plus non-operational orphan was not classified for recovery: %', challenge;
  end if;
  if public.reserve_quick_auth_otp_send_v1(v_challenge_id, phone_hash) then
    raise exception 'Business recovery OTP was allowed before email confirmation.';
  end if;
  if not public.reserve_quick_auth_business_email_attempt_v1(v_challenge_id, phone_hash)
    or not public.confirm_quick_auth_business_email_v1(v_challenge_id, phone_hash)
    or not public.reserve_quick_auth_otp_send_v1(v_challenge_id, phone_hash) then
    raise exception 'Email-gated Business recovery could not reach OTP_SENT.';
  end if;

  if public.complete_quick_auth_orphan_rebind_v1(
    v_challenge_id, '+37361000001', phone_hash, '76000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'Wrong OTP subject was accepted as possession proof.';
  end if;
  if pg_temp.auth_phone('76000000-0000-4000-8000-000000000002') is null
    or pg_temp.auth_phone('76000000-0000-4000-8000-000000000001') is not null then
    raise exception 'Rejected recovery partially mutated Auth ownership.';
  end if;

  if not public.complete_quick_auth_orphan_rebind_v1(
    v_challenge_id, '+37361000001', phone_hash, '76000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Valid non-operational orphan recovery was rejected.';
  end if;

  if pg_temp.auth_phone('76000000-0000-4000-8000-000000000002') is not null
    or pg_temp.auth_phone('76000000-0000-4000-8000-000000000001') <> '37361000001'
    or not pg_temp.auth_phone_confirmed('76000000-0000-4000-8000-000000000001') then
    raise exception 'Atomic recovery did not move confirmed phone ownership to canonical Partner.';
  end if;
  if not pg_temp.has_canonical_phone_identity('76000000-0000-4000-8000-000000000001')
    or pg_temp.has_phone_identity('76000000-0000-4000-8000-000000000002') then
    raise exception 'Phone Auth identity was not transferred atomically.';
  end if;

  if not public.complete_quick_auth_challenge_v1(v_challenge_id, phone_hash, '+37361000001') then
    raise exception 'Canonical Partner Quick Auth completion was rejected.';
  end if;
  if (select status from public.quick_auth_challenges where id = v_challenge_id) <> 'VERIFIED' then
    raise exception 'Recovered challenge did not reach VERIFIED.';
  end if;
  if (
    select count(distinct event_type)
    from public.business_quick_auth_audit_events event
    where event.challenge_id = v_challenge_id
  ) <> 6 then
    raise exception 'Complete immutable recovery audit sequence was not persisted.';
  end if;
end;
$$;

reset role;
update public.user_profiles
set phone = '+37361000003'
where id in (
  '76000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000003'
);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  blocked jsonb;
begin
  blocked := public.start_quick_auth_challenge_v1(
    '+37361000003', repeat('b', 64), repeat('2', 64), true
  );
  if blocked ->> 'resolution' <> 'BLOCKED' then
    raise exception 'Two active Business profiles sharing a canonical phone did not fail closed: %', blocked;
  end if;

  blocked := public.start_quick_auth_challenge_v1(
    '+37361000002', repeat('c', 64), repeat('3', 64), true
  );
  if blocked ->> 'resolution' <> 'BLOCKED' then
    raise exception 'Operational Customer phone conflict was eligible for automatic rebind: %', blocked;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('quick_auth_challenges', 'business_quick_auth_audit_events')
      and column_name ~ '(otp|token|phone|email)'
      and column_name not in (
        'phone_key_hash', 'email_verification_required', 'email_verification_attempt_count',
        'otp_subject_auth_user_id', 'otp_send_count', 'otp_verification_attempt_count',
        'otp_sent_at', 'email_verified_at', 'phone_rebound_at'
      )
  ) then
    raise exception 'Recovery schema stores unapproved raw authentication material.';
  end if;
end;
$$;

reset role;
set local role authenticated;

do $$
begin
  if has_table_privilege(current_user, 'public.business_quick_auth_audit_events', 'select')
    or has_table_privilege(current_user, 'public.business_quick_auth_audit_events', 'insert')
    or has_function_privilege(
      current_user,
      'public.complete_quick_auth_orphan_rebind_v1(uuid,text,text,uuid)',
      'execute'
    )
    or has_function_privilege(
      current_user,
      'public.complete_quick_auth_challenge_v1(uuid,text,text)',
      'execute'
    ) then
    raise exception 'Browser role can access Business recovery state or mutation functions.';
  end if;
end;
$$;

rollback;
