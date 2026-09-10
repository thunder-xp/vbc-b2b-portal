begin;

select plan(13);

create function pg_temp.create_failed_registration_fixture(
  p_user_id uuid,
  p_request_id uuid,
  p_email text,
  p_application_name text,
  p_profile_status text,
  p_request_status text,
  p_onboarding_status text
)
returns void
language plpgsql
as $$
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at)
  values (p_user_id, 'authenticated', 'authenticated', p_email, now(), now());

  insert into public.user_profiles(id, email, full_name, status, user_type)
  values (p_user_id, p_email, p_application_name, p_profile_status, 'external');

  insert into public.access_requests(
    id,
    user_profile_id,
    requested_company_name,
    status,
    onboarding_status
  ) values (
    p_request_id,
    p_user_id,
    p_application_name,
    p_request_status,
    p_onboarding_status
  );
end;
$$;

insert into auth.users(id, aud, role, email, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'purge-admin@example.test', now(), now()),
  ('a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ordinary-admin@example.test', now(), now());

insert into public.user_profiles(id, email, full_name, status, user_type)
values
  ('a0000000-0000-4000-8000-000000000001', 'purge-admin@example.test', 'Purge admin', 'active', 'internal'),
  ('a0000000-0000-4000-8000-000000000002', 'ordinary-admin@example.test', 'Ordinary user', 'active', 'external');

insert into public.internal_user_role_assignments(user_id, role_id, assigned_by)
select 'a0000000-0000-4000-8000-000000000001', role.id, null
from public.roles role
where role.code = 'novotech_admin';

select pg_temp.create_failed_registration_fixture(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'cancelled@example.test',
  'Cancelled fixture',
  'registered',
  'cancelled',
  'cancelled'
);
select pg_temp.create_failed_registration_fixture(
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'rejected@example.test',
  'Rejected fixture',
  'registered',
  'rejected',
  'rejected'
);
select pg_temp.create_failed_registration_fixture(
  '10000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000003',
  'membership@example.test',
  'Membership fixture',
  'active',
  'cancelled',
  'cancelled'
);
select pg_temp.create_failed_registration_fixture(
  '10000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000004',
  'approved@example.test',
  'Approved fixture',
  'active',
  'approved',
  'approved'
);
select pg_temp.create_failed_registration_fixture(
  '10000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000005',
  'order@example.test',
  'Order fixture',
  'registered',
  'cancelled',
  'cancelled'
);
select pg_temp.create_failed_registration_fixture(
  '10000000-0000-4000-8000-000000000006',
  '20000000-0000-4000-8000-000000000006',
  'estimate@example.test',
  'Estimate fixture',
  'registered',
  'rejected',
  'rejected'
);
select pg_temp.create_failed_registration_fixture(
  '10000000-0000-4000-8000-000000000007',
  '20000000-0000-4000-8000-000000000007',
  'storage@example.test',
  'Storage fixture',
  'registered',
  'cancelled',
  'cancelled'
);
select pg_temp.create_failed_registration_fixture(
  '10000000-0000-4000-8000-000000000008',
  '20000000-0000-4000-8000-000000000008',
  'append-only@example.test',
  'Append only fixture',
  'registered',
  'cancelled',
  'cancelled'
);

insert into public.partner_companies(id, external_1c_id, display_name, status)
values
  ('30000000-0000-4000-8000-000000000001', 'PURGE-TEST-ONE', 'Purge test one', 'active'),
  ('30000000-0000-4000-8000-000000000002', 'PURGE-TEST-TWO', 'Purge test two', 'active');

insert into public.company_memberships(
  user_id,
  company_id,
  role_id,
  status,
  approved_by,
  approved_at
)
select
  '10000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  role.id,
  'active',
  'a0000000-0000-4000-8000-000000000001',
  now()
from public.roles role
where role.code = 'partner_owner';

insert into public.partner_orders(
  id,
  company_id,
  submitted_by,
  submission_key,
  submission_attempt_id,
  requested_delivery_date,
  payload_snapshot
)
values (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000005',
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  current_date,
  '{}'
);

insert into public.estimates(
  id,
  company_id,
  created_by,
  estimate_number,
  name,
  currency_code,
  status
)
values (
  '60000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000006',
  'PURGE-ESTIMATE-001',
  'Protected estimate',
  'USD',
  'draft'
);

insert into storage.objects(id, bucket_id, name, owner_id)
values (
  '70000000-0000-4000-8000-000000000001',
  'partner-documents',
  'purge-test/protected-object.pdf',
  '10000000-0000-4000-8000-000000000007'
);

select ok(
  (public.get_failed_registration_purge_readiness(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'cancelled@example.test',
    'Cancelled fixture'
  ) ->> 'eligible')::boolean,
  'cancelled failed registration without business ownership is eligible'
);

select ok(
  (public.get_failed_registration_purge_readiness(
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'rejected@example.test',
    'Rejected fixture'
  ) ->> 'eligible')::boolean,
  'rejected failed registration is eligible'
);

select ok(
  public.get_failed_registration_purge_readiness(
    '20000000-0000-4000-8000-000000000003', null, null, null
  ) -> 'blockers' @> '[{"code":"PROTECTED_MEMBERSHIP"}]'::jsonb,
  'active membership blocks purge'
);

select ok(
  public.get_failed_registration_purge_readiness(
    '20000000-0000-4000-8000-000000000004', null, null, null
  ) -> 'blockers' @> '[{"code":"APPROVED_ONBOARDING"}]'::jsonb,
  'approved onboarding blocks purge'
);

select ok(
  public.get_failed_registration_purge_readiness(
    '20000000-0000-4000-8000-000000000005', null, null, null
  ) -> 'blockers' @> '[{"code":"PROTECTED_USER_REFERENCE","relation":"public.partner_orders"}]'::jsonb,
  'order ownership blocks purge'
);

select ok(
  public.get_failed_registration_purge_readiness(
    '20000000-0000-4000-8000-000000000006', null, null, null
  ) -> 'blockers' @> '[{"code":"PROTECTED_USER_REFERENCE","relation":"public.estimates"}]'::jsonb,
  'estimate ownership blocks purge'
);

select ok(
  public.get_failed_registration_purge_readiness(
    '20000000-0000-4000-8000-000000000007', null, null, null
  ) -> 'blockers' @> '[{"code":"STORAGE_OWNERSHIP"}]'::jsonb,
  'storage ownership blocks purge'
);

select ok(
  public.get_failed_registration_purge_readiness(
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'wrong@example.test',
    'Rejected fixture'
  ) -> 'blockers' @> '[{"code":"USER_ID_MISMATCH"},{"code":"EMAIL_MISMATCH"}]'::jsonb,
  'wrong user and email pair is rejected'
);

select throws_ok(
  $$delete from public.onboarding_events where access_request_id = '20000000-0000-4000-8000-000000000008'$$,
  '42501',
  'Onboarding history is append-only.',
  'ordinary onboarding history deletion remains blocked'
);

select throws_ok(
  $$select public.purge_failed_registration_local(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'cancelled@example.test',
    'Cancelled fixture',
    'a0000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'failed_registration_purge_permission_denied',
  'non-platform actor cannot invoke governed purge'
);

with first_call as (
  select public.purge_failed_registration_local(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'cancelled@example.test',
    'Cancelled fixture',
    'a0000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000002'
  ) result
), second_call as (
  select public.purge_failed_registration_local(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'cancelled@example.test',
    'Cancelled fixture',
    'a0000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000003'
  ) result
)
select ok(
  first_call.result ->> 'receiptId' = second_call.result ->> 'receiptId'
    and second_call.result ->> 'status' = 'local_purged',
  'repeated local purge is idempotent and returns the same recovery receipt'
)
from first_call cross join second_call;

select is(
  public.complete_failed_registration_purge(
    '80000000-0000-4000-8000-000000000002'
  ) ->> 'status',
  'completed',
  'governed purge verifies zero local state before completion'
);

select function_privs_are(
  'public',
  'purge_failed_registration_local',
  array['uuid', 'uuid', 'text', 'text', 'uuid', 'uuid'],
  'authenticated',
  array[]::text[],
  'authenticated users have no direct purge RPC privilege'
);

select * from finish();
rollback;
