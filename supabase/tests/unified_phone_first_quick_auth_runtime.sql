begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'quick-customer@example.test', now(), '+37369000001', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('71000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'quick-business@example.test', now(), '+37369000002', now(), '{"provider":"email","providers":["email","phone"]}', '{}', now(), now()),
  ('71000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'quick-multi@example.test', now(), '+37369000003', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('71000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'quick-blocked@example.test', now(), '+37369000004', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('71000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'quick-unconfirmed@example.test', now(), '+37369000005', null, '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.customer_identities (id, identity_kind) values
  ('72000000-0000-4000-8000-000000000001', 'PERSON'),
  ('72000000-0000-4000-8000-000000000003', 'PERSON');

insert into public.customer_accounts (
  id, auth_user_id, customer_identity_id, status, identity_resolution_status
) values
  ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'ACTIVE', 'MATCHED'),
  ('73000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003', 'ACTIVE', 'MATCHED'),
  ('73000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000004', null, 'IDENTITY_REVIEW_REQUIRED', 'CONFLICT');

insert into public.customer_account_legacy_entitlements (customer_account_id, auth_user_id) values
  ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001'),
  ('73000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003');

insert into public.user_profiles (id, email, full_name, phone, status, user_type) values
  ('71000000-0000-4000-8000-000000000002', 'quick-business@example.test', 'Quick Business', '+37369000002', 'active', 'partner'),
  ('71000000-0000-4000-8000-000000000003', 'quick-multi@example.test', 'Quick Multi', '+37369000003', 'active', 'partner'),
  ('71000000-0000-4000-8000-000000000005', 'quick-unconfirmed@example.test', 'Quick Unconfirmed', '+37369000005', 'active', 'partner');

insert into public.partner_companies (id, external_1c_id, display_name, status) values
  ('74000000-0000-4000-8000-000000000002', 'quick-auth-company-2', 'Quick Business Company', 'active'),
  ('74000000-0000-4000-8000-000000000003', 'quick-auth-company-3', 'Quick Multi Company', 'active'),
  ('74000000-0000-4000-8000-000000000005', 'quick-auth-company-5', 'Quick Unconfirmed Company', 'active');

insert into public.company_memberships (user_id, company_id, role_id, status)
select fixture.user_id, fixture.company_id, role.id, 'active'
from (values
  ('71000000-0000-4000-8000-000000000002'::uuid, '74000000-0000-4000-8000-000000000002'::uuid),
  ('71000000-0000-4000-8000-000000000003'::uuid, '74000000-0000-4000-8000-000000000003'::uuid),
  ('71000000-0000-4000-8000-000000000005'::uuid, '74000000-0000-4000-8000-000000000005'::uuid)
) fixture(user_id, company_id)
cross join lateral (
  select id from public.roles where scope = 'partner' order by code limit 1
) role;

-- The runtime test executes the public RPC contract as service_role, which
-- intentionally has no direct privileges on auth.users. These transaction-
-- scoped helpers simulate the Auth server's phone_change writes without
-- broadening production grants.
create function pg_temp.set_pending_phone_change(
  target_user_id uuid,
  target_phone text,
  sent_at timestamptz default now()
) returns void
language sql
security definer
set search_path = auth, pg_catalog
as $$
  update auth.users
  set phone_change = target_phone,
      phone_change_token = 'redacted-runtime-fixture',
      phone_change_sent_at = sent_at
  where id = target_user_id;
$$;

create function pg_temp.confirm_phone_change(
  target_user_id uuid,
  target_phone text
) returns void
language sql
security definer
set search_path = auth, pg_catalog
as $$
  update auth.users
  set phone = target_phone,
      phone_confirmed_at = now(),
      phone_change = '',
      phone_change_token = '',
      phone_change_sent_at = null
  where id = target_user_id;
$$;

create function pg_temp.get_profile_phone(target_user_id uuid) returns text
language sql
security definer
set search_path = public, pg_catalog
as $$
  select phone from public.user_profiles where id = target_user_id;
$$;

create function pg_temp.get_pending_phone_change(target_user_id uuid) returns text
language sql
security definer
set search_path = auth, pg_catalog
as $$
  select phone_change from auth.users where id = target_user_id;
$$;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  result jsonb;
  customer_count_before bigint;
begin
  select count(*) into customer_count_before from public.customer_accounts;

  result := public.start_quick_auth_challenge_v1('+37369000001', repeat('a', 64), repeat('1', 64), false);
  if result ->> 'resolution' <> 'CUSTOMER_OTP' then
    raise exception 'Eligible legacy Customer did not resolve to CUSTOMER_OTP: %', result;
  end if;

  result := public.start_quick_auth_challenge_v1('+37369999999', repeat('b', 64), repeat('2', 64), false);
  if result ->> 'resolution' <> 'NOT_REGISTERED' then
    raise exception 'Unknown phone leaked or received access: %', result;
  end if;

  result := public.start_quick_auth_challenge_v1('+37369000004', repeat('c', 64), repeat('3', 64), false);
  if result ->> 'resolution' <> 'BLOCKED' then
    raise exception 'Blocked Customer did not fail closed: %', result;
  end if;

  result := public.start_quick_auth_challenge_v1('+37369000002', repeat('d', 64), repeat('4', 64), false);
  if result ->> 'resolution' <> 'BLOCKED' then
    raise exception 'Business identity did not remain fail-closed with gate disabled: %', result;
  end if;

  result := public.start_quick_auth_challenge_v1('+37369000002', repeat('e', 64), repeat('5', 64), true);
  if result ->> 'resolution' <> 'BUSINESS_EMAIL_REQUIRED' then
    raise exception 'Future linked Business contract is not represented correctly: %', result;
  end if;

  result := public.start_quick_auth_challenge_v1('+37369000003', repeat('f', 64), repeat('6', 64), true);
  if result ->> 'resolution' <> 'MULTIPLE_CONTEXT_EDGE_CASE' then
    raise exception 'Customer plus Business ambiguity was silently prioritized: %', result;
  end if;

  result := public.start_quick_auth_challenge_v1('+37369000005', repeat('0', 64), repeat('7', 64), true);
  if result ->> 'resolution' <> 'NOT_REGISTERED' then
    raise exception 'Unconfirmed Auth phone was accepted as an authentication identity: %', result;
  end if;

  if (select count(*) from public.customer_accounts) <> customer_count_before then
    raise exception 'Quick Auth resolver mutated Customer accounts.';
  end if;

  if exists (
    select 1 from public.quick_auth_challenges
    where row_to_json(quick_auth_challenges)::text like '%+3736900000%'
  ) then
    raise exception 'Quick Auth persisted a raw phone.';
  end if;
end;
$$;

do $$
declare
  challenge jsonb;
  challenge_id uuid;
  phone_hash text := repeat('4', 64);
begin
  challenge := public.start_quick_auth_challenge_v1('+37369000002', phone_hash, repeat('3', 64), true);
  challenge_id := (challenge ->> 'challengeId')::uuid;
  if public.reserve_quick_auth_otp_send_v1(challenge_id, phone_hash) then
    raise exception 'Business OTP was reserved before email confirmation.';
  end if;
  if not public.reserve_quick_auth_business_email_attempt_v1(challenge_id, phone_hash) then
    raise exception 'Business email attempt was not reserved.';
  end if;
  if not public.confirm_quick_auth_business_email_v1(challenge_id, phone_hash) then
    raise exception 'Business email match was not recorded.';
  end if;
  if not public.reserve_quick_auth_otp_send_v1(challenge_id, phone_hash) then
    raise exception 'Business OTP was not enabled after same-user email confirmation.';
  end if;
end;
$$;

do $$
declare
  preparation jsonb;
  enrollment_challenge_id uuid;
  phone_hash text := repeat('2', 64);
  coverage jsonb;
begin
  preparation := public.prepare_business_phone_enrollment_v1(
    '71000000-0000-4000-8000-000000000005',
    '+37369000006',
    phone_hash
  );
  if preparation ->> 'result' <> 'READY' then
    raise exception 'Eligible same-user enrollment was not prepared: %', preparation;
  end if;
  enrollment_challenge_id := (preparation ->> 'challengeId')::uuid;

  if not public.reserve_business_phone_enrollment_send_v1(
    enrollment_challenge_id,
    '71000000-0000-4000-8000-000000000005',
    '+37369000006',
    phone_hash
  ) then
    raise exception 'Enrollment OTP send was not reserved.';
  end if;

  perform pg_temp.set_pending_phone_change(
    '71000000-0000-4000-8000-000000000005',
    '+37369000006'
  );

  if public.complete_business_phone_enrollment_v1(
    enrollment_challenge_id,
    '71000000-0000-4000-8000-000000000005',
    '+37369000006',
    phone_hash
  ) then
    raise exception 'Enrollment completed before Auth confirmed phone_change.';
  end if;

  if not public.reserve_business_phone_enrollment_verification_v1(
    enrollment_challenge_id,
    '71000000-0000-4000-8000-000000000005',
    phone_hash
  ) then
    raise exception 'Enrollment verification attempt was not reserved.';
  end if;

  perform pg_temp.confirm_phone_change(
    '71000000-0000-4000-8000-000000000005',
    '+37369000006'
  );

  if not public.complete_business_phone_enrollment_v1(
    enrollment_challenge_id,
    '71000000-0000-4000-8000-000000000005',
    '+37369000006',
    phone_hash
  ) then
    raise exception 'Confirmed same-user enrollment did not complete.';
  end if;

  if not exists (
    select 1 from public.business_phone_enrollment_audit_events event
    where event.challenge_id = enrollment_challenge_id
      and event_type = 'BUSINESS_PHONE_ENROLLMENT_CONFIRMED'
  ) then
    raise exception 'Enrollment confirmation audit was not persisted.';
  end if;

  if pg_temp.get_profile_phone('71000000-0000-4000-8000-000000000005') <> '+37369000005' then
    raise exception 'Auth enrollment overwrote the distinct profile contact phone.';
  end if;

  preparation := public.prepare_business_phone_enrollment_v1(
    '71000000-0000-4000-8000-000000000005',
    '+37369000001',
    repeat('1', 64)
  );
  if preparation ->> 'result' <> 'CONFLICT' then
    raise exception 'Confirmed phone conflict was not rejected: %', preparation;
  end if;

  begin
    preparation := public.prepare_business_phone_enrollment_v1(
      '71000000-0000-4000-8000-000000000001',
      '+37368888881',
      repeat('7', 64)
    );
    raise exception 'Customer-only user was allowed to enroll a Business phone.';
  exception when insufficient_privilege then
    null;
  end;

  coverage := public.business_phone_quick_auth_coverage_v1();
  if (coverage ->> 'businessAuthUsersTotal')::integer <> 3
    or (coverage ->> 'businessAuthUsersWithConfirmedPhone')::integer <> 3 then
    raise exception 'Business phone coverage diagnostic is incorrect: %', coverage;
  end if;
end;
$$;

do $$
declare
  preparation jsonb;
  stale_id uuid;
  stale_hash text := repeat('c', 64);
begin
  insert into public.business_phone_enrollment_challenges(
    auth_user_id, phone_key_hash, status, otp_send_count, expires_at, otp_sent_at, created_at
  ) values (
    '71000000-0000-4000-8000-000000000002', stale_hash, 'OTP_SENT', 1,
    now() - interval '10 minutes', now() - interval '11 minutes', now() - interval '20 minutes'
  ) returning id into stale_id;
  perform pg_temp.set_pending_phone_change(
    '71000000-0000-4000-8000-000000000002',
    '+37367777777',
    now() - interval '11 minutes'
  );

  preparation := public.prepare_business_phone_enrollment_v1(
    '71000000-0000-4000-8000-000000000005',
    '+37367777777',
    stale_hash
  );
  if preparation ->> 'result' <> 'READY' then
    raise exception 'Expired flow-owned phone_change was not safely reclaimed: %', preparation;
  end if;
  if nullif(pg_temp.get_pending_phone_change('71000000-0000-4000-8000-000000000002'), '') is not null then
    raise exception 'Expired flow-owned phone_change was not cleared.';
  end if;
  if (select status from public.business_phone_enrollment_challenges where id = stale_id) <> 'FAILED' then
    raise exception 'Expired enrollment challenge was not closed.';
  end if;
end;
$$;

do $$
declare
  challenge jsonb;
  challenge_id uuid;
  phone_hash text := repeat('8', 64);
begin
  challenge := public.start_quick_auth_challenge_v1('+37369000001', phone_hash, repeat('9', 64), false);
  challenge_id := (challenge ->> 'challengeId')::uuid;

  if public.read_quick_auth_challenge_v1(challenge_id, repeat('7', 64)) is not null then
    raise exception 'Forged phone proof could read a challenge.';
  end if;
  if not public.reserve_quick_auth_otp_send_v1(challenge_id, phone_hash) then
    raise exception 'First OTP reservation failed.';
  end if;
  if public.reserve_quick_auth_otp_send_v1(challenge_id, phone_hash) then
    raise exception 'Server-side resend cooldown was bypassed.';
  end if;

  update public.quick_auth_challenges set otp_sent_at = now() - interval '61 seconds' where id = challenge_id;
  if not public.reserve_quick_auth_otp_send_v1(challenge_id, phone_hash) then
    raise exception 'Second bounded OTP reservation failed.';
  end if;
  update public.quick_auth_challenges set otp_sent_at = now() - interval '61 seconds' where id = challenge_id;
  if not public.reserve_quick_auth_otp_send_v1(challenge_id, phone_hash) then
    raise exception 'Third bounded OTP reservation failed.';
  end if;
  update public.quick_auth_challenges set otp_sent_at = now() - interval '61 seconds' where id = challenge_id;
  if public.reserve_quick_auth_otp_send_v1(challenge_id, phone_hash) then
    raise exception 'Fourth OTP reservation was not rejected.';
  end if;

  for attempt in 1..6 loop
    if not public.reserve_quick_auth_otp_verification_v1(challenge_id, phone_hash) then
      raise exception 'Allowed OTP verification attempt % was rejected.', attempt;
    end if;
  end loop;
  if public.reserve_quick_auth_otp_verification_v1(challenge_id, phone_hash) then
    raise exception 'Seventh OTP verification attempt was not rejected.';
  end if;

  update public.quick_auth_challenges
  set created_at = now() - interval '11 minutes',
      expires_at = now() - interval '1 second'
  where id = challenge_id;
  if public.read_quick_auth_challenge_v1(challenge_id, phone_hash) is not null then
    raise exception 'Expired challenge remained readable.';
  end if;
end;
$$;

do $$
declare
  result jsonb;
begin
  for attempt in 1..5 loop
    result := public.start_quick_auth_challenge_v1(
      '+37368888888', repeat('6', 64), repeat('5', 64), false
    );
  end loop;

  begin
    result := public.start_quick_auth_challenge_v1(
      '+37368888888', repeat('6', 64), repeat('5', 64), false
    );
    raise exception 'Sixth resolver attempt was not throttled.';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'quick_auth_rate_limited' then raise; end if;
  end;
end;
$$;

reset role;
set local role authenticated;

do $$
begin
  if has_table_privilege(current_user, 'public.quick_auth_challenges', 'select')
    or has_table_privilege(current_user, 'public.quick_auth_challenges', 'insert')
    or has_table_privilege(current_user, 'public.quick_auth_challenges', 'update') then
    raise exception 'Authenticated browser role can access Quick Auth challenge state.';
  end if;
  if has_table_privilege(current_user, 'public.business_phone_enrollment_challenges', 'select')
    or has_table_privilege(current_user, 'public.business_phone_enrollment_audit_events', 'select') then
    raise exception 'Authenticated browser role can access Business phone enrollment state.';
  end if;
  if has_function_privilege(current_user, 'public.start_quick_auth_challenge_v1(text,text,text,boolean)', 'execute')
    or has_function_privilege(current_user, 'public.read_quick_auth_challenge_v1(uuid,text)', 'execute')
    or has_function_privilege(current_user, 'public.reserve_quick_auth_otp_send_v1(uuid,text)', 'execute')
    or has_function_privilege(current_user, 'public.reserve_quick_auth_otp_verification_v1(uuid,text)', 'execute')
    or has_function_privilege(current_user, 'public.set_quick_auth_challenge_status_v1(uuid,text,text)', 'execute') then
    raise exception 'Authenticated browser role can invoke a Quick Auth service function.';
  end if;
  if has_function_privilege(current_user, 'public.prepare_business_phone_enrollment_v1(uuid,text,text)', 'execute')
    or has_function_privilege(current_user, 'public.complete_business_phone_enrollment_v1(uuid,uuid,text,text)', 'execute')
    or has_function_privilege(current_user, 'public.business_phone_quick_auth_coverage_v1()', 'execute') then
    raise exception 'Authenticated browser role can invoke a Business phone enrollment service function.';
  end if;
end;
$$;

rollback;
