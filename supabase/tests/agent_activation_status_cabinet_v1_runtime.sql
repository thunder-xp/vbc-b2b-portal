\set ON_ERROR_STOP on

begin;

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('21000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'activation-admin@example.test', now(), now()),
  ('21000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'activation-agent@example.test', now(), now()),
  ('21000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'activation-agent-2@example.test', now(), now());
insert into public.user_profiles(id, email, full_name, status, user_type) values
  ('21000000-0000-4000-8000-000000000001', 'activation-admin@example.test', 'Activation Admin', 'active', 'admin'),
  ('21000000-0000-4000-8000-000000000002', 'activation-agent@example.test', 'Activation Agent', 'active', 'external'),
  ('21000000-0000-4000-8000-000000000003', 'activation-agent-2@example.test', 'Activation Agent 2', 'active', 'external');

select to_jsonb(public.create_commercial_agent_record(
  '21000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002',
  'INDIVIDUAL', 'Activation Runtime Agent'
)) as agent_record \gset

select to_jsonb(public.create_commercial_agent_record(
  '21000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000003',
  'INDIVIDUAL', 'Invalid Jump Runtime Agent'
)) as invalid_agent_record \gset

do $$
begin
  begin
    perform public.transition_commercial_agent_record(
      (select id from public.commercial_agents where user_id = '21000000-0000-4000-8000-000000000003'), 'ACTIVE',
      '21000000-0000-4000-8000-000000000001'
    );
    raise exception 'Invalid lifecycle jump was accepted.';
  exception when check_violation then null;
  end;
end;
$$;

select public.transition_commercial_agent_record(
  (:'agent_record'::jsonb->>'id')::uuid, 'COMPLIANCE_REVIEW',
  '21000000-0000-4000-8000-000000000001'
);

do $$
begin
  begin
    perform public.confirm_commercial_agent_contract(
      (select id from public.commercial_agents where user_id = '21000000-0000-4000-8000-000000000002'),
      '21000000-0000-4000-8000-000000000001'
    );
    raise exception 'Contract confirmation was accepted before compliance approval.';
  exception when check_violation then null;
  end;
end;
$$;

select public.review_commercial_agent_compliance(
  (:'agent_record'::jsonb->>'id')::uuid,
  '21000000-0000-4000-8000-000000000001', false, 'ALLOWED', false,
  'NONE_DECLARED', 'APPROVED', 'Activation governance runtime acceptance'
);
select public.transition_commercial_agent_record(
  (:'agent_record'::jsonb->>'id')::uuid, 'CONTRACT_PENDING',
  '21000000-0000-4000-8000-000000000001'
);

do $$
begin
  begin
    perform public.transition_commercial_agent_record(
      (select id from public.commercial_agents where user_id = '21000000-0000-4000-8000-000000000002'), 'APPROVED',
      '21000000-0000-4000-8000-000000000001'
    );
    raise exception 'Approval was accepted before contract confirmation.';
  exception when check_violation then null;
  end;
  begin
    perform public.create_agent_referral_token_record(
      (select id from public.commercial_agents where user_id = '21000000-0000-4000-8000-000000000002'), repeat('1', 64), 'QR', null, null,
      '21000000-0000-4000-8000-000000000001'
    );
    raise exception 'Referral token was accepted before activation.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.confirm_commercial_agent_contract(
  (:'agent_record'::jsonb->>'id')::uuid,
  '21000000-0000-4000-8000-000000000001'
);
select public.confirm_commercial_agent_contract(
  (:'agent_record'::jsonb->>'id')::uuid,
  '21000000-0000-4000-8000-000000000001'
);

do $$
declare
  target public.commercial_agents;
  confirmation_count integer;
begin
  select * into target from public.commercial_agents
  where user_id = '21000000-0000-4000-8000-000000000002';
  select count(*) into confirmation_count from public.agent_domain_events
  where agent_id = target.id and event_type = 'AGENT_CONTRACT_CONFIRMED';
  if not target.contract_ready or target.contract_confirmed_at is null
    or target.contract_confirmed_by <> '21000000-0000-4000-8000-000000000001'
    or confirmation_count <> 1 then
    raise exception 'Contract confirmation metadata or idempotency failed.';
  end if;
end;
$$;

select public.transition_commercial_agent_record(
  (:'agent_record'::jsonb->>'id')::uuid, 'APPROVED',
  '21000000-0000-4000-8000-000000000001'
);

do $$
begin
  begin
    perform public.create_agent_referral_token_record(
      (select id from public.commercial_agents where user_id = '21000000-0000-4000-8000-000000000002'), repeat('2', 64), 'QR', null, null,
      '21000000-0000-4000-8000-000000000001'
    );
    raise exception 'Referral token was accepted for an approved but inactive Agent.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.transition_commercial_agent_record(
  (:'agent_record'::jsonb->>'id')::uuid, 'ACTIVE',
  '21000000-0000-4000-8000-000000000001'
);
select public.create_agent_referral_token_record(
  (:'agent_record'::jsonb->>'id')::uuid, repeat('3', 64), 'QR', null, null,
  '21000000-0000-4000-8000-000000000001'
);

rollback;
