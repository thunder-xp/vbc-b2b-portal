\set ON_ERROR_STOP on
begin;

insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'agent-ops-admin@example.test', now(), now(), now()),
  ('91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'agent-ops-pilot@example.test', now(), now(), now());
insert into public.user_profiles(id, email, status, user_type) values
  ('91000000-0000-4000-8000-000000000001', 'agent-ops-admin@example.test', 'active', 'internal'),
  ('91000000-0000-4000-8000-000000000002', 'agent-ops-pilot@example.test', 'active', 'external');
insert into public.commercial_agents(id, user_id, agent_code, agent_type, display_name, status, compliance_status) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'MD-P-991', 'INDIVIDUAL', 'Runtime Agent Operations', 'ACTIVE', 'APPROVED');

select public.link_commercial_agent_1c_record(
  '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
  'UU-991', null, 'Runtime Counterparty', '91000000-0000-4000-8000-000000000001'
);
select public.verify_agent_1c_binding_record(
  '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
  'UU-991', null, 'Runtime Counterparty', 'MD-P-991', 'MATCH', now(),
  '91000000-0000-4000-8000-000000000001', null
);

do $$
begin
  begin
    perform public.bind_agent_1c_contract_record(
      '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000001', 'NS-991', 'Runtime Contract', 'СПоставщиком',
      current_date, current_date + 365, true, 'MD-P-999', now(),
      '91000000-0000-4000-8000-000000000001', null
    );
    raise exception 'wrong Agent code was accepted';
  exception when check_violation then null;
  end;
end;
$$;

select public.bind_agent_1c_contract_record(
  '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001', 'NS-991', 'Runtime Contract', 'СПоставщиком',
  current_date, current_date + 365, true, 'MD-P-991', now(),
  '91000000-0000-4000-8000-000000000001', null
);

do $$
begin
  begin
    perform public.bind_agent_1c_project_record(
      '92000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001',
      'AGT · MD-P-991 · Runtime', 'AGT-991', '93000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000099', current_date, null, 'MD-P-991',
      'STRUCTURED_NAME', now(), '91000000-0000-4000-8000-000000000001', null
    );
    raise exception 'unrelated Contract was accepted';
  exception when check_violation then null;
  end;
end;
$$;

select public.bind_agent_1c_project_record(
  '92000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001',
  'AGT · MD-P-991 · Runtime', 'AGT-991', '93000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001', current_date, null, 'MD-P-991',
  'STRUCTURED_NAME', now(), '91000000-0000-4000-8000-000000000001', null
);

select public.bind_agent_1c_contract_record(
  '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002',
  '93000000-0000-4000-8000-000000000001', 'NS-992', 'Renewed Runtime Contract', 'СПоставщиком',
  current_date, current_date + 365, true, 'MD-P-991', now(),
  '91000000-0000-4000-8000-000000000001', 'Renewed contract accepted in 1C'
);

do $$
begin
  if (select count(*) from public.agent_1c_contract_bindings where agent_id = '92000000-0000-4000-8000-000000000001' and is_current) <> 1 then
    raise exception 'contract current-row invariant failed';
  end if;
  if exists (select 1 from public.agent_1c_project_bindings where agent_id = '92000000-0000-4000-8000-000000000001' and is_current) then
    raise exception 'old Contract project remained current';
  end if;
  if (select count(*) from public.agent_domain_events where agent_id = '92000000-0000-4000-8000-000000000001' and event_type in ('AGENT_CONTRACT_LINKED','AGENT_CONTRACT_SUPERSEDED','AGENT_PROJECT_LINKED','AGENT_PROJECT_SUPERSEDED')) <> 5 then
    raise exception 'binding audit event count failed';
  end if;
end;
$$;

select public.record_agent_auth_password_reset_requested(
  '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001'
);
do $$
begin
  if not exists (select 1 from public.agent_domain_events where agent_id = '92000000-0000-4000-8000-000000000001' and event_type = 'AUTH_PASSWORD_RESET_REQUESTED') then
    raise exception 'password recovery audit missing';
  end if;
  if has_table_privilege('service_role', 'public.agent_1c_bindings', 'DELETE')
     or has_table_privilege('service_role', 'public.agent_1c_contract_bindings', 'DELETE')
     or has_table_privilege('service_role', 'public.agent_1c_project_bindings', 'DELETE') then
    raise exception 'service role has delete permission';
  end if;
end;
$$;

rollback;
