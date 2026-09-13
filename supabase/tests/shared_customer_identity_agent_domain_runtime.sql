\set ON_ERROR_STOP on

begin;

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'identity-admin@example.test', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'identity-agent@example.test', now(), now());
insert into public.user_profiles(id, email, status, user_type) values
  ('10000000-0000-4000-8000-000000000001', 'identity-admin@example.test', 'active', 'admin'),
  ('10000000-0000-4000-8000-000000000002', 'identity-agent@example.test', 'active', 'external');

insert into public.partner_companies(id, external_1c_id, display_name, status)
values ('10000000-0000-4000-8000-000000000003', 'identity-runtime-company', 'Identity Runtime Company', 'active');

insert into public.partner_final_customers(
  id, company_id, display_name, customer_type, created_by, updated_by
) values (
  '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003',
  'Runtime Customer', 'individual', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);

do $$
declare root_id uuid;
begin
  select customer_identity_id into root_id
  from public.partner_final_customers where id = '10000000-0000-4000-8000-000000000004';
  if root_id is null or not exists (
    select 1 from public.customer_identity_events
    where customer_identity_id = root_id and event_type = 'CONTEXT_LINKED'
  ) then raise exception 'Additive context-root creation/audit failed.'; end if;
end;
$$;

select to_jsonb(public.create_commercial_agent_record(
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'INDIVIDUAL', 'Runtime Agent'
)) as agent_record \gset

do $$
declare role_id uuid;
begin
  select id into role_id from public.roles where code = 'partner_user' limit 1;
  begin
    insert into public.company_memberships(user_id, company_id, role_id, status)
    values (
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003', role_id, 'active'
    );
    raise exception 'Agent/Partner principal separation did not reject membership.';
  exception when check_violation then null;
  end;
end;
$$;

select public.review_commercial_agent_compliance(
  (:'agent_record'::jsonb->>'id')::uuid,
  '10000000-0000-4000-8000-000000000001', false, 'ALLOWED', false,
  'NONE_DECLARED', 'APPROVED', 'Runtime acceptance'
);
select public.transition_commercial_agent_record((:'agent_record'::jsonb->>'id')::uuid, 'COMPLIANCE_REVIEW', '10000000-0000-4000-8000-000000000001');
select public.transition_commercial_agent_record((:'agent_record'::jsonb->>'id')::uuid, 'CONTRACT_PENDING', '10000000-0000-4000-8000-000000000001');
select public.transition_commercial_agent_record((:'agent_record'::jsonb->>'id')::uuid, 'APPROVED', '10000000-0000-4000-8000-000000000001');
select public.transition_commercial_agent_record((:'agent_record'::jsonb->>'id')::uuid, 'ACTIVE', '10000000-0000-4000-8000-000000000001');

select public.create_customer_identity_with_evidence(
  'PERSON', '[{"key_type":"PHONE","key_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","key_version":1,"verified":true}]'::jsonb
) as customer_identity_id \gset
select public.create_agent_referral_token_record(
  (:'agent_record'::jsonb->>'id')::uuid,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'QR', 'runtime', null, '10000000-0000-4000-8000-000000000001'
);
select public.create_agent_referral_record(
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  :'customer_identity_id'::uuid, 'PERSON', 'Runtime Referral', '+37369123456', null,
  'Chisinau', 'CCTV', 'Runtime need', null, null, 'MATCHED',
  'EXACT_VERIFIED_PHONE', 'agent-referral-v1', now()
) as referral_id \gset
select public.transition_agent_referral_record(:'referral_id'::uuid, 'PENDING_REVIEW', '10000000-0000-4000-8000-000000000001');
select public.transition_agent_referral_record(:'referral_id'::uuid, 'VERIFIED', '10000000-0000-4000-8000-000000000001');
select to_jsonb(public.create_agent_attribution_record(:'referral_id'::uuid, '10000000-0000-4000-8000-000000000001', '2026-09-13T00:00:00Z')) as attribution_record \gset

select (
  (:'attribution_record'::jsonb->>'protection_until')::timestamptz
  = (:'attribution_record'::jsonb->>'valid_from')::timestamptz + interval '90 days'
) as attribution_contract \gset
\if :attribution_contract
\else
  \echo '90-day attribution contract failed.'
  \quit
\endif

select not (
  has_table_privilege('authenticated', 'public.customer_identities', 'select')
  or has_table_privilege('authenticated', 'public.agent_referrals', 'select')
) as browser_isolation \gset
\if :browser_isolation
\else
  \echo 'Browser role received a sensitive table grant.'
  \quit
\endif

rollback;
