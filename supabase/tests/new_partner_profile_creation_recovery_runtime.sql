\set ON_ERROR_STOP on

begin;

select plan(18);

insert into auth.users(
  id, aud, role, email, email_confirmed_at, created_at, updated_at
) values
  ('3bc8a2c9-3107-42ab-8f12-bcb020b2e401', 'authenticated', 'authenticated', 'profile-a@example.test', now(), now(), now()),
  ('3bc8a2c9-3107-42ab-8f12-bcb020b2e402', 'authenticated', 'authenticated', 'profile-b@example.test', now(), now(), now()),
  ('3bc8a2c9-3107-42ab-8f12-bcb020b2e403', 'authenticated', 'authenticated', 'profile-c@example.test', now(), now(), now()),
  ('3bc8a2c9-3107-42ab-8f12-bcb020b2e404', 'authenticated', 'authenticated', 'profile-d@example.test', now(), now(), now());

insert into public.user_profiles(id, email, full_name, phone, status, user_type)
values (
  '3bc8a2c9-3107-42ab-8f12-bcb020b2e403',
  'profile-c@example.test',
  null,
  null,
  'registered',
  'external'
);

select ok(
  (
    select bool_and(
      not has_column_privilege(
        'authenticated',
        'public.user_profiles',
        checked.column_name,
        'INSERT'
      )
    )
    from unnest(array[
      'id', 'email', 'full_name', 'phone', 'status', 'user_type'
    ]) checked(column_name)
  ),
  'authenticated users cannot bypass the governed RPC with a raw insert'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_own_user_profile_v1(text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated users can execute the governed profile RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.profile_creation_events', 'SELECT'),
  'technical profile creation diagnostics remain admin/service only'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_own_user_profile_v1(text,text,uuid)',
    'EXECUTE'
  ),
  'unauthenticated users cannot execute profile creation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"3bc8a2c9-3107-42ab-8f12-bcb020b2e401","email":"profile-a@example.test","role":"authenticated"}',
  true
);
select is(
  public.create_own_user_profile_v1(
    'Profile A',
    '067 497 101',
    '3bc8a2c9-3107-42ab-8f12-bcb020b2e411'
  )->>'code',
  'CREATED',
  'confirmed Auth user creates a profile'
);
select is(
  (select phone from public.user_profiles where id = auth.uid()),
  '+37367497101',
  'Moldova phone is persisted in canonical E.164'
);
select is(
  public.create_own_user_profile_v1(
    'Profile A',
    '+37367497101',
    '3bc8a2c9-3107-42ab-8f12-bcb020b2e412'
  )->>'code',
  'PROFILE_ALREADY_EXISTS',
  'a repeated submission recovers the existing profile'
);
select is(
  (select count(*)::integer from public.user_profiles where id = auth.uid()),
  1,
  'a repeated submission creates no duplicate profile'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"3bc8a2c9-3107-42ab-8f12-bcb020b2e402","email":"profile-b@example.test","role":"authenticated"}',
  true
);
select is(
  public.create_own_user_profile_v1(
    'Profile B',
    '+37367497101',
    '3bc8a2c9-3107-42ab-8f12-bcb020b2e413'
  )->>'code',
  'PHONE_ALREADY_IN_USE',
  'another user cannot claim an owned phone'
);
select is(
  (select count(*)::integer from public.user_profiles where id = auth.uid()),
  0,
  'phone conflict creates no partial profile'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"3bc8a2c9-3107-42ab-8f12-bcb020b2e403","email":"profile-c@example.test","role":"authenticated"}',
  true
);
select is(
  public.create_own_user_profile_v1(
    'Recovered Profile',
    '+37360000003',
    '3bc8a2c9-3107-42ab-8f12-bcb020b2e414'
  )->>'code',
  'RECOVERED',
  'a partial initial profile is recovered idempotently'
);
select results_eq(
  $$select full_name, phone from public.user_profiles where id = '3bc8a2c9-3107-42ab-8f12-bcb020b2e403'::uuid$$,
  $$values ('Recovered Profile'::text, '+37360000003'::text)$$,
  'partial recovery fills only missing safe profile fields'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"3bc8a2c9-3107-42ab-8f12-bcb020b2e404","email":"profile-d@example.test","role":"authenticated"}',
  true
);
select is(
  public.create_own_user_profile_v1(
    'Profile D',
    '+373123',
    '3bc8a2c9-3107-42ab-8f12-bcb020b2e415'
  )->>'code',
  'INVALID_PHONE',
  'malformed phone fails closed'
);
reset role;

select is(
  (select count(*)::integer from public.company_memberships
    where user_id in (
      '3bc8a2c9-3107-42ab-8f12-bcb020b2e401',
      '3bc8a2c9-3107-42ab-8f12-bcb020b2e402',
      '3bc8a2c9-3107-42ab-8f12-bcb020b2e403',
      '3bc8a2c9-3107-42ab-8f12-bcb020b2e404'
    )),
  0,
  'profile creation never creates a company membership'
);
select is(
  (select count(*)::integer from public.access_requests
    where user_profile_id in (
      '3bc8a2c9-3107-42ab-8f12-bcb020b2e401',
      '3bc8a2c9-3107-42ab-8f12-bcb020b2e402',
      '3bc8a2c9-3107-42ab-8f12-bcb020b2e403',
      '3bc8a2c9-3107-42ab-8f12-bcb020b2e404'
    )),
  0,
  'profile creation preserves the existing company/onboarding stage boundary'
);
select is(
  (select count(*)::integer from public.partner_companies),
  0,
  'profile creation does not run company matching or create a duplicate company'
);
select is(
  (select count(*)::integer from public.profile_creation_events
    where auth_user_id = '3bc8a2c9-3107-42ab-8f12-bcb020b2e401'),
  2,
  'initial and repeated submissions leave one PII-free event each'
);
select is(
  (select count(*)::integer from public.profile_creation_events
    where safe_error_code = 'PHONE_ALREADY_IN_USE'
      and auth_user_id = '3bc8a2c9-3107-42ab-8f12-bcb020b2e402'),
  1,
  'phone conflicts retain safe admin diagnostics'
);

select * from finish();
rollback;
