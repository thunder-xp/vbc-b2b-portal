begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('75000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'governed-business@example.test', now(), '+37369000101', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('75000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'customer-only@example.test', now(), '+37369000102', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

insert into public.user_profiles (id, email, full_name, phone, status, user_type) values
  ('75000000-0000-4000-8000-000000000001', 'governed-business@example.test', 'Governed Business', '+37369000101', 'active', 'partner');

insert into public.partner_companies (id, external_1c_id, display_name, status) values
  ('75000000-0000-4000-8000-000000000010', 'governed-business-company', 'Governed Business Company', 'active');

insert into public.company_memberships (user_id, company_id, role_id, status)
select
  '75000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000010',
  role.id,
  'active'
from public.roles role
where role.scope = 'partner'
order by role.code
limit 1;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.business_phone_enrollment_challenges(
  id, auth_user_id, phone_key_hash, status, otp_send_count, otp_sent_at, expires_at
) values (
  '75000000-0000-4000-8000-000000000020',
  '75000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  'OTP_SENT',
  1,
  now(),
  now() + interval '10 minutes'
);

select is(
  public.resolve_governed_business_auth_sms_v1('75000000-0000-4000-8000-000000000001', repeat('a', 64)),
  'BUSINESS_PHONE_ENROLLMENT',
  'valid Business enrollment challenge is authorized'
);
select is(
  public.resolve_governed_business_auth_sms_v1('75000000-0000-4000-8000-000000000002', repeat('a', 64)),
  null::text,
  'mismatched Auth user is rejected'
);
select is(
  public.resolve_governed_business_auth_sms_v1('75000000-0000-4000-8000-000000000001', repeat('f', 64)),
  null::text,
  'mismatched keyed phone proof is rejected'
);

update public.business_phone_enrollment_challenges
set status = 'OPEN'
where id = '75000000-0000-4000-8000-000000000020';
select is(
  public.resolve_governed_business_auth_sms_v1('75000000-0000-4000-8000-000000000001', repeat('a', 64)),
  null::text,
  'OPEN enrollment challenge is rejected'
);

update public.business_phone_enrollment_challenges
set status = 'FAILED'
where id = '75000000-0000-4000-8000-000000000020';
select is(
  public.resolve_governed_business_auth_sms_v1('75000000-0000-4000-8000-000000000001', repeat('a', 64)),
  null::text,
  'FAILED enrollment challenge is rejected'
);

update public.business_phone_enrollment_challenges
set status = 'OTP_SENT',
    created_at = now() - interval '20 minutes',
    expires_at = now() - interval '10 minutes'
where id = '75000000-0000-4000-8000-000000000020';
select is(
  public.resolve_governed_business_auth_sms_v1('75000000-0000-4000-8000-000000000001', repeat('a', 64)),
  null::text,
  'expired enrollment challenge is rejected'
);

insert into public.quick_auth_challenges(
  phone_key_hash, requester_key_hash, subject_auth_user_id, otp_subject_auth_user_id,
  resolution, email_verification_required, business_recovery_kind,
  status, email_verified_at, otp_send_count, otp_sent_at, expires_at
) values
  (repeat('b', 64), repeat('1', 64), '75000000-0000-4000-8000-000000000001', '75000000-0000-4000-8000-000000000001',
    'BUSINESS_EMAIL_REQUIRED', true, 'DIRECT', 'OTP_SENT', now(), 1, now(), now() + interval '10 minutes'),
  (repeat('c', 64), repeat('2', 64), '75000000-0000-4000-8000-000000000002', '75000000-0000-4000-8000-000000000002',
    'CUSTOMER_OTP', false, 'DIRECT', 'OTP_SENT', null, 1, now(), now() + interval '10 minutes');

select is(
  public.resolve_governed_business_auth_sms_v1('75000000-0000-4000-8000-000000000001', repeat('b', 64)),
  'BUSINESS_QUICK_AUTH',
  'live Quick Auth challenge for active Partner is authorized'
);
select is(
  public.resolve_governed_business_auth_sms_v1('75000000-0000-4000-8000-000000000002', repeat('c', 64)),
  null::text,
  'Quick Auth challenge for non-Business identity is rejected'
);

reset role;
set local role authenticated;
select ok(
  not has_function_privilege(
    current_user,
    'public.resolve_governed_business_auth_sms_v1(uuid,text)',
    'execute'
  ),
  'authenticated browser role cannot invoke governed Business Auth SMS resolver'
);

select * from finish();
rollback;
