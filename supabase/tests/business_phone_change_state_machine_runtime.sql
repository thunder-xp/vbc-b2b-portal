begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('79000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'phone-change-main@example.test', now(), null, null,
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('79000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'phone-change-mismatch@example.test', now(), null, null,
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('79000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'phone-change-confirmed@example.test', now(), '37369000003', now(),
    '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

insert into public.user_profiles (id, email, full_name, phone, status, user_type) values
  ('79000000-0000-4000-8000-000000000001', 'phone-change-main@example.test',
    'Phone Change Main', '+37369000266', 'active', 'partner'),
  ('79000000-0000-4000-8000-000000000002', 'phone-change-mismatch@example.test',
    'Phone Change Mismatch', '+37369000002', 'active', 'partner'),
  ('79000000-0000-4000-8000-000000000003', 'phone-change-confirmed@example.test',
    'Phone Change Confirmed', '+37369000003', 'active', 'partner');

insert into public.partner_companies (id, external_1c_id, display_name, status) values
  ('79000000-0000-4000-8000-000000000010', 'phone-change-company',
    'Phone Change Company', 'active');

insert into public.company_memberships (user_id, company_id, role_id, status)
select subject.id, '79000000-0000-4000-8000-000000000010', role.id, 'active'
from (values
  ('79000000-0000-4000-8000-000000000001'::uuid),
  ('79000000-0000-4000-8000-000000000002'::uuid),
  ('79000000-0000-4000-8000-000000000003'::uuid)
) subject(id)
cross join lateral (
  select id from public.roles where scope = 'partner' order by code limit 1
) role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  public.prepare_business_phone_enrollment_v2(
    '79000000-0000-4000-8000-000000000001', '+37369000717', repeat('a', 64)
  ) ->> 'result',
  'READY',
  'submitted target starts a ready challenge'
);
select is(
  (select target_phone_suffix from public.business_phone_enrollment_challenges
   where auth_user_id = '79000000-0000-4000-8000-000000000001'
     and status = 'OPEN'),
  '717',
  'challenge records safe evidence for the submitted target'
);
select is(
  (select count(*)::integer from public.business_phone_enrollment_challenges
   where auth_user_id = '79000000-0000-4000-8000-000000000001'
     and status in ('OPEN', 'OTP_SENT')),
  1,
  'one user has one effective Business phone target'
);

select is(
  (public.prepare_business_phone_enrollment_v2(
    '79000000-0000-4000-8000-000000000001', '+37369000717', repeat('a', 64)
  ) ->> 'challengeId')::uuid,
  (select id from public.business_phone_enrollment_challenges
   where auth_user_id = '79000000-0000-4000-8000-000000000001'
     and status = 'OPEN'),
  'double submit reuses the live same-target challenge'
);

select is(
  public.get_business_phone_enrollment_target_v1(
    (select id from public.business_phone_enrollment_challenges
     where auth_user_id = '79000000-0000-4000-8000-000000000001'
       and status = 'OPEN'),
    '79000000-0000-4000-8000-000000000001'
  ) ->> 'status',
  'TARGET_MISMATCH',
  'challenge cannot proceed before Auth pending target agrees'
);

reset role;
update auth.users
set phone_change = '37369000717', phone_change_sent_at = now()
where id = '79000000-0000-4000-8000-000000000001';
set local role service_role;

select is(
  public.get_business_phone_enrollment_target_v1(
    (select id from public.business_phone_enrollment_challenges
     where auth_user_id = '79000000-0000-4000-8000-000000000001'
       and status = 'OPEN'),
    '79000000-0000-4000-8000-000000000001'
  ) ->> 'phoneE164',
  '+37369000717',
  'verification page resolves the exact Auth pending target'
);
select ok(
  (public.reserve_business_phone_enrollment_send_v3(
    (select id from public.business_phone_enrollment_challenges
     where auth_user_id = '79000000-0000-4000-8000-000000000001'
       and status = 'OPEN'),
    '79000000-0000-4000-8000-000000000001', '+37369000717', repeat('a', 64)
  ) ->> 'allowed')::boolean,
  'matching target is reserved for one bounded send'
);
select is(
  public.resolve_governed_business_auth_sms_v2(
    '79000000-0000-4000-8000-000000000001', repeat('a', 64)
  ),
  'BUSINESS_PHONE_ENROLLMENT',
  'matching SMS hook target is governed'
);
select is(
  public.resolve_governed_business_auth_sms_v2(
    '79000000-0000-4000-8000-000000000001', repeat('f', 64)
  ),
  'BUSINESS_PHONE_TARGET_MISMATCH',
  'different SMS hook target fails closed'
);

select is(
  public.prepare_business_phone_enrollment_v2(
    '79000000-0000-4000-8000-000000000001', '+37369000718', repeat('b', 64)
  ) ->> 'result',
  'READY',
  'new submitted target safely supersedes the unverified target'
);
select is(
  (select status from public.business_phone_enrollment_challenges
   where auth_user_id = '79000000-0000-4000-8000-000000000001'
     and phone_key_hash = repeat('a', 64)),
  'FAILED',
  'old target challenge is invalidated'
);
select is(
  (select count(*)::integer from public.business_phone_enrollment_challenges
   where auth_user_id = '79000000-0000-4000-8000-000000000001'
     and status in ('OPEN', 'OTP_SENT')),
  1,
  'supersede leaves exactly one effective target'
);

reset role;
update auth.users
set phone_change = '37369000718', phone_change_sent_at = now()
where id = '79000000-0000-4000-8000-000000000001';
set local role service_role;

select ok(
  (public.reserve_business_phone_enrollment_send_v3(
    (select id from public.business_phone_enrollment_challenges
     where auth_user_id = '79000000-0000-4000-8000-000000000001'
       and status = 'OPEN'),
    '79000000-0000-4000-8000-000000000001', '+37369000718', repeat('b', 64)
  ) ->> 'allowed')::boolean,
  'superseding target can be sent'
);
select is(
  public.get_current_business_phone_state_v1(
    '79000000-0000-4000-8000-000000000001'
  ) ->> 'state',
  'OTP_SENT',
  'unverified Auth user exposes the active OTP state'
);
select ok(
  not public.complete_business_phone_enrollment_v2(
    (select id from public.business_phone_enrollment_challenges
     where auth_user_id = '79000000-0000-4000-8000-000000000001'
       and status = 'OTP_SENT'),
    '79000000-0000-4000-8000-000000000001', '+37369000718', repeat('b', 64)
  ),
  'profile promotion is blocked before Auth confirmation'
);

reset role;
update auth.users
set phone = '37369000718', phone_confirmed_at = now(), phone_change = '',
    phone_change_token = '', phone_change_sent_at = null
where id = '79000000-0000-4000-8000-000000000001';
set local role service_role;

select ok(
  public.complete_business_phone_enrollment_v2(
    (select id from public.business_phone_enrollment_challenges
     where auth_user_id = '79000000-0000-4000-8000-000000000001'
       and status = 'OTP_SENT'),
    '79000000-0000-4000-8000-000000000001', '+37369000718', repeat('b', 64)
  ),
  'confirmed Auth target promotes successfully'
);
select is(
  public.get_current_business_phone_state_v1(
    '79000000-0000-4000-8000-000000000001'
  ) ->> 'profilePhoneE164',
  '+37369000718',
  'profile contact projection follows confirmed Auth target'
);
select ok(
  public.complete_business_phone_enrollment_v2(
    (select id from public.business_phone_enrollment_challenges
     where auth_user_id = '79000000-0000-4000-8000-000000000001'
       and status = 'VERIFIED'),
    '79000000-0000-4000-8000-000000000001', '+37369000718', repeat('b', 64)
  ),
  'completion is idempotent'
);
select is(
  public.get_current_business_phone_state_v1(
    '79000000-0000-4000-8000-000000000001'
  ) ->> 'state',
  'VERIFIED',
  'UI state derives from confirmed Auth and profile projection'
);

select is(
  (public.prepare_business_phone_enrollment_v2(
    '79000000-0000-4000-8000-000000000003', '+37369000721', repeat('e', 64)
  ) ->> 'isPhoneChange')::boolean,
  true,
  'confirmed Auth phone changing to a new target is classified as a phone change'
);
reset role;
update auth.users
set phone_change = '37369000721', phone_change_sent_at = now()
where id = '79000000-0000-4000-8000-000000000003';
set local role service_role;
select ok(
  (public.reserve_business_phone_enrollment_send_v3(
    (select id from public.business_phone_enrollment_challenges
     where auth_user_id = '79000000-0000-4000-8000-000000000003'
       and status = 'OPEN'),
    '79000000-0000-4000-8000-000000000003', '+37369000721', repeat('e', 64)
  ) ->> 'allowed')::boolean,
  'confirmed-phone change can reserve the submitted target'
);
select is(
  public.get_current_business_phone_state_v1(
    '79000000-0000-4000-8000-000000000003'
  ) ->> 'state',
  'PHONE_CHANGE_PENDING',
  'active change takes precedence over the still-valid old verified phone'
);
select is(
  public.get_current_business_phone_state_v1(
    '79000000-0000-4000-8000-000000000003'
  ) ->> 'profilePhoneE164',
  '+37369000003',
  'old profile phone remains active until the change is verified'
);

select is(
  (public.prepare_business_phone_enrollment_v2(
    '79000000-0000-4000-8000-000000000002', '+37369000719', repeat('c', 64)
  ) ->> 'result'),
  'READY',
  'mismatch fixture challenge starts normally'
);
select is(
  public.reserve_business_phone_enrollment_send_v3(
    (select id from public.business_phone_enrollment_challenges
     where auth_user_id = '79000000-0000-4000-8000-000000000002'
       and status = 'OPEN'),
    '79000000-0000-4000-8000-000000000002', '+37369000720', repeat('d', 64)
  ) ->> 'reason',
  'TARGET_MISMATCH',
  'wrong challenge target is rejected before provider dispatch'
);

select * from finish();
rollback;
