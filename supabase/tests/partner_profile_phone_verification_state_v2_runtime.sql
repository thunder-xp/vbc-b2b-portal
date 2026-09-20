begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('77000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'profile-state-partner@example.test', now(), null, null,
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('77000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'profile-state-customer@example.test', now(), '37361000012', now(),
    '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('77000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', null, null, '37361000013', now(),
    '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values
  ('77000000-0000-4000-8000-000000000101', '77000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001', 'email',
    '{"sub":"77000000-0000-4000-8000-000000000001","email":"profile-state-partner@example.test","email_verified":true,"phone_verified":false}',
    now(), now(), now()),
  ('77000000-0000-4000-8000-000000000102', '77000000-0000-4000-8000-000000000002',
    '77000000-0000-4000-8000-000000000002', 'phone',
    '{"sub":"77000000-0000-4000-8000-000000000002","email_verified":false,"phone_verified":true}',
    now(), now(), now()),
  ('77000000-0000-4000-8000-000000000103', '77000000-0000-4000-8000-000000000003',
    '77000000-0000-4000-8000-000000000003', 'phone',
    '{"sub":"77000000-0000-4000-8000-000000000003","email_verified":false,"phone_verified":true}',
    now(), now(), now());

insert into public.user_profiles (id, email, full_name, phone, status, user_type) values
  ('77000000-0000-4000-8000-000000000001', 'profile-state-partner@example.test', 'Profile State Partner', '+37361000011', 'active', 'partner');

insert into public.partner_companies (id, external_1c_id, display_name, status) values
  ('77000000-0000-4000-8000-000000000201', 'profile-state-company', 'Profile State Company', 'active');

insert into public.company_memberships (user_id, company_id, role_id, status)
select
  '77000000-0000-4000-8000-000000000001'::uuid,
  '77000000-0000-4000-8000-000000000201'::uuid,
  role.id,
  'active'
from public.roles role
where role.scope = 'partner'
order by role.code
limit 1;

insert into public.customer_identities (id, identity_kind) values
  ('77000000-0000-4000-8000-000000000302', 'PERSON');

insert into public.customer_accounts (
  id, auth_user_id, customer_identity_id, status, identity_resolution_status
) values (
  '77000000-0000-4000-8000-000000000402',
  '77000000-0000-4000-8000-000000000002',
  '77000000-0000-4000-8000-000000000302',
  'ACTIVE',
  'MATCHED'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
begin
  if public.has_business_profile_phone_operational_conflict_v2(
    '77000000-0000-4000-8000-000000000001', '+37361000011'
  ) then
    raise exception 'Partner own saved phone was misclassified as conflict.';
  end if;
end;
$$;

reset role;
update public.user_profiles
set phone = '+37361000012'
where id = '77000000-0000-4000-8000-000000000001';
set local role service_role;

do $$
begin
  if not public.has_business_profile_phone_operational_conflict_v2(
    '77000000-0000-4000-8000-000000000001', '+37361000012'
  ) then
    raise exception 'Operational Customer phone ownership was not classified as conflict.';
  end if;
end;
$$;

reset role;
update public.user_profiles
set phone = '+37361000013'
where id = '77000000-0000-4000-8000-000000000001';
set local role service_role;

do $$
begin
  if public.has_business_profile_phone_operational_conflict_v2(
    '77000000-0000-4000-8000-000000000001', '+37361000013'
  ) then
    raise exception 'Strict non-operational orphan was exposed as an operational conflict.';
  end if;

  if has_function_privilege('anon', 'public.has_business_profile_phone_operational_conflict_v2(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.has_business_profile_phone_operational_conflict_v2(uuid,text)', 'EXECUTE') then
    raise exception 'Browser roles can execute the phone conflict resolver.';
  end if;
end;
$$;

rollback;
