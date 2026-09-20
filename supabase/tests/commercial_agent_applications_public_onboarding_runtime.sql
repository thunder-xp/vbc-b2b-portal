\set ON_ERROR_STOP on

begin;

select plan(1);

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('7a000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'agent-app-admin@example.test', now(), now()),
  ('7a000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'agent-applicant@example.test', now(), now()),
  ('7a000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rejected-applicant@example.test', now(), now()),
  ('7a000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'new-external@example.test', now(), now()),
  ('7a000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'other-applicant@example.test', now(), now());

insert into public.user_profiles(id, email, status, user_type) values
  ('7a000000-0000-4000-8000-000000000001', 'agent-app-admin@example.test', 'active', 'admin'),
  ('7a000000-0000-4000-8000-000000000002', 'agent-applicant@example.test', 'active', 'partner'),
  ('7a000000-0000-4000-8000-000000000003', 'rejected-applicant@example.test', 'active', 'external'),
  ('7a000000-0000-4000-8000-000000000006', 'other-applicant@example.test', 'active', 'external');

insert into public.partner_companies(id, external_1c_id, display_name, status)
values ('7a000000-0000-4000-8000-000000000004', 'agent-application-runtime-company', 'Agent Application Runtime Company', 'active');

insert into public.company_memberships(user_id, company_id, role_id, status)
select
  '7a000000-0000-4000-8000-000000000002',
  '7a000000-0000-4000-8000-000000000004',
  role.id,
  'active'
from public.roles role
where role.code = 'partner_owner';

do $$
declare
  first_draft public.commercial_agent_applications;
  repeated_draft public.commercial_agent_applications;
  submitted public.commercial_agent_applications;
  repeated_submit public.commercial_agent_applications;
  approved public.commercial_agent_applications;
  repeated_approval public.commercial_agent_applications;
begin
  select * into first_draft from public.ensure_commercial_agent_application_draft(
    '7a000000-0000-4000-8000-000000000002', 'agent-applicant@example.test'
  );
  select * into repeated_draft from public.ensure_commercial_agent_application_draft(
    '7a000000-0000-4000-8000-000000000002', 'agent-applicant@example.test'
  );
  if first_draft.id is null or first_draft.id <> repeated_draft.id then
    raise exception 'Draft creation is not idempotent.';
  end if;

  select * into submitted from public.submit_commercial_agent_application(
    '7a000000-0000-4000-8000-000000000002', 'Runtime Agent', '+37360000000',
    'agent-applicant@example.test', 'Chisinau', 'Consultant', 'Runtime Company',
    'INDIVIDUAL', null
  );
  select * into repeated_submit from public.submit_commercial_agent_application(
    '7a000000-0000-4000-8000-000000000002', 'Runtime Agent', '+37360000000',
    'agent-applicant@example.test', 'Chisinau', 'Consultant', 'Runtime Company',
    'INDIVIDUAL', null
  );
  if submitted.id <> repeated_submit.id or submitted.revision <> repeated_submit.revision then
    raise exception 'Identical submission is not idempotent.';
  end if;
  if (select count(*) from public.commercial_agent_application_events where application_id = submitted.id) <> 2 then
    raise exception 'Duplicate submission emitted an extra audit event.';
  end if;

  select * into approved from public.review_commercial_agent_application(
    submitted.id, '7a000000-0000-4000-8000-000000000001', 'APPROVE', null
  );
  select * into repeated_approval from public.review_commercial_agent_application(
    submitted.id, '7a000000-0000-4000-8000-000000000001', 'APPROVE', null
  );
  if approved.provisioned_agent_id is null or approved.provisioned_agent_id <> repeated_approval.provisioned_agent_id then
    raise exception 'Approval is not idempotent.';
  end if;
  if (select count(*) from public.commercial_agents where user_id = '7a000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'Approval did not provision exactly one Agent.';
  end if;
  if (select status from public.commercial_agents where id = approved.provisioned_agent_id) <> 'APPLIED' then
    raise exception 'Approval bypassed the existing Agent lifecycle.';
  end if;
  if not exists (
    select 1 from public.company_memberships
    where user_id = '7a000000-0000-4000-8000-000000000002' and status = 'active'
  ) then
    raise exception 'Agent approval removed the existing Partner membership.';
  end if;
end;
$$;

do $$
declare
  draft public.commercial_agent_applications;
  submitted public.commercial_agent_applications;
  approved public.commercial_agent_applications;
begin
  select * into draft from public.ensure_commercial_agent_application_draft(
    '7a000000-0000-4000-8000-000000000005', 'untrusted-alternate@example.test',
    'LEGAL_ENTITY', 'ro'
  );
  if not exists (
    select 1 from public.user_profiles
    where id = '7a000000-0000-4000-8000-000000000005'
      and email = 'new-external@example.test'
      and status = 'registered'
      and user_type = 'external'
      and preferred_locale = 'ro'
  ) then
    raise exception 'Authenticated first-visit profile bootstrap failed or trusted browser email.';
  end if;
  if draft.agent_type <> 'LEGAL_ENTITY' or draft.email <> 'new-external@example.test' then
    raise exception 'Registration hints were not bounded to prefill or Auth email was not authoritative.';
  end if;
  select * into submitted from public.submit_commercial_agent_application(
    '7a000000-0000-4000-8000-000000000005', 'New External Agent', '+37360000005',
    'new-external@example.test', null, null, null, 'INDIVIDUAL', null
  );
  select * into approved from public.review_commercial_agent_application(
    submitted.id, '7a000000-0000-4000-8000-000000000001', 'APPROVE', null
  );
  if approved.provisioned_agent_id is null or not exists (
    select 1 from public.user_profiles
    where id = '7a000000-0000-4000-8000-000000000005'
      and status = 'active'
      and user_type = 'external'
  ) then
    raise exception 'Approved new external applicant was not activated for the existing Agent lifecycle.';
  end if;
end;
$$;

do $$
declare
  draft public.commercial_agent_applications;
  submitted public.commercial_agent_applications;
  clarification public.commercial_agent_applications;
  resubmitted public.commercial_agent_applications;
  rejected public.commercial_agent_applications;
begin
  select * into draft from public.ensure_commercial_agent_application_draft(
    '7a000000-0000-4000-8000-000000000003', 'rejected-applicant@example.test'
  );
  select * into submitted from public.submit_commercial_agent_application(
    '7a000000-0000-4000-8000-000000000003', 'Rejected Runtime Agent', '+37360000003',
    'rejected-applicant@example.test', null, null, null, 'INDIVIDUAL', null
  );

  begin
    perform public.review_commercial_agent_application(
      submitted.id, '7a000000-0000-4000-8000-000000000003', 'APPROVE', null
    );
    raise exception 'Self-approval was accepted.';
  exception when insufficient_privilege then
    null;
  end;

  select * into clarification from public.review_commercial_agent_application(
    submitted.id, '7a000000-0000-4000-8000-000000000001', 'REQUEST_CLARIFICATION', 'Clarify locality.'
  );
  select * into resubmitted from public.submit_commercial_agent_application(
    '7a000000-0000-4000-8000-000000000003', 'Rejected Runtime Agent', '+37360000003',
    'rejected-applicant@example.test', 'Balti', null, null, 'INDIVIDUAL', null
  );
  if resubmitted.status <> 'SUBMITTED' or resubmitted.applicant_visible_note is not null
    or resubmitted.reviewed_at is not null or resubmitted.reviewed_by is not null then
    raise exception 'Clarification resubmission did not reset current review state.';
  end if;
  select * into rejected from public.review_commercial_agent_application(
    submitted.id, '7a000000-0000-4000-8000-000000000001', 'REJECT', 'Application is not eligible.'
  );
  if rejected.status <> 'REJECTED' then
    raise exception 'Rejection lifecycle failed.';
  end if;
  if exists (select 1 from public.commercial_agents where user_id = '7a000000-0000-4000-8000-000000000003') then
    raise exception 'Rejected application provisioned an Agent.';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'public.commercial_agent_applications', 'select')
    or has_table_privilege('authenticated', 'public.commercial_agent_applications', 'insert')
    or has_table_privilege('authenticated', 'public.commercial_agent_applications', 'update')
    or has_table_privilege('authenticated', 'public.commercial_agent_applications', 'delete')
    or has_function_privilege('authenticated', 'public.ensure_commercial_agent_application_draft(uuid,text,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.review_commercial_agent_application(uuid,uuid,text,text)', 'execute') then
    raise exception 'Application privilege boundary is too broad.';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000002', true);

do $$
begin
  if (select count(*) from public.commercial_agent_applications) <> 1 then
    raise exception 'Applicant own-row read policy failed.';
  end if;
  if (select count(*) from public.commercial_agent_application_events) <> 4 then
    raise exception 'Applicant own-event read policy failed.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000006', true);

do $$
begin
  if exists (select 1 from public.commercial_agent_applications)
    or exists (select 1 from public.commercial_agent_application_events) then
    raise exception 'Cross-user application isolation failed.';
  end if;
end;
$$;

reset role;
select pass('Commercial Agent application lifecycle, provisioning, RLS, and isolation pass.');
select * from finish();
rollback;
