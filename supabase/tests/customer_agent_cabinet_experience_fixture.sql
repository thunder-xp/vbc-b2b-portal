-- Local/acceptance-only fixture. This file is intentionally outside migrations
-- and seeds. A local database reset removes every row created below.
do $$
declare
  active_user_id constant uuid := '22000000-0000-4000-8000-000000000001';
  onboarding_user_id constant uuid := '22000000-0000-4000-8000-000000000002';
  active_agent_id uuid;
  onboarding_agent_id uuid;
  fixture_token_hash constant text := encode(digest(repeat('T', 43), 'sha256'), 'hex');
  referral_id uuid;
  customer_id uuid;
  referral_specs jsonb := jsonb_build_array(
    jsonb_build_object('key', 'new', 'name', 'Test Client New', 'final', 'CAPTURED', 'resolved', false),
    jsonb_build_object('key', 'qualified', 'name', 'Test Client Qualified', 'final', 'VERIFIED', 'resolved', true),
    jsonb_build_object('key', 'active', 'name', 'Test Client Active', 'final', 'ACTIVE', 'resolved', true),
    jsonb_build_object('key', 'closed', 'name', 'Test Client Closed', 'final', 'REJECTED', 'resolved', false)
  );
  spec jsonb;
  position integer := 0;
begin
  insert into public.user_profiles (id, email, full_name, status, user_type, preferred_locale)
  values
    (active_user_id, 'test.agent.novotech@example.test', 'Test Agent Novotech', 'active', 'external', 'ru'),
    (onboarding_user_id, 'test.agent.onboarding@example.test', 'Test Agent Onboarding Novotech', 'active', 'external', 'ru')
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    status = 'active',
    user_type = 'external',
    preferred_locale = 'ru';

  select id into active_agent_id from public.commercial_agents where user_id = active_user_id;
  if active_agent_id is null then
    select id into active_agent_id
    from public.create_commercial_agent_record(
      active_user_id, active_user_id, 'INDIVIDUAL', 'Test Agent Novotech', null,
      null, '+37360000001', 'test.agent.novotech@example.test', 'Chișinău',
      'Consultant test', 'Novotech acceptance'
    );
  end if;

  select id into onboarding_agent_id from public.commercial_agents where user_id = onboarding_user_id;
  if onboarding_agent_id is null then
    select id into onboarding_agent_id
    from public.create_commercial_agent_record(
      onboarding_user_id, onboarding_user_id, 'INDIVIDUAL', 'Test Agent Onboarding Novotech', null,
      null, '+37360000002', 'test.agent.onboarding@example.test', 'Chișinău',
      'Consultant test', 'Novotech acceptance'
    );
  end if;

  if (select status from public.commercial_agents where id = active_agent_id) = 'APPLIED' then
    perform public.transition_commercial_agent_record(active_agent_id, 'COMPLIANCE_REVIEW', active_user_id);
  end if;
  if (select compliance_status from public.commercial_agents where id = active_agent_id) <> 'APPROVED' then
    perform public.review_commercial_agent_compliance(
      active_agent_id, active_user_id, false, 'ALLOWED', false,
      'NONE_DECLARED', 'APPROVED', 'Local UX acceptance fixture'
    );
  end if;
  if (select status from public.commercial_agents where id = active_agent_id) = 'COMPLIANCE_REVIEW' then
    perform public.transition_commercial_agent_record(active_agent_id, 'CONTRACT_PENDING', active_user_id);
  end if;
  if (select status from public.commercial_agents where id = active_agent_id) = 'CONTRACT_PENDING' then
    perform public.transition_commercial_agent_record(active_agent_id, 'APPROVED', active_user_id);
  end if;
  if (select status from public.commercial_agents where id = active_agent_id) = 'APPROVED' then
    perform public.transition_commercial_agent_record(active_agent_id, 'ACTIVE', active_user_id);
  end if;
  update public.commercial_agents set contract_ready = true where id = active_agent_id and not contract_ready;

  if not exists (
    select 1 from public.agent_referral_tokens
    where agent_id = active_agent_id and token_hash = fixture_token_hash and status = 'ACTIVE'
  ) then
    insert into public.agent_referral_tokens (agent_id, token_hash, public_token, token_type)
    values (active_agent_id, fixture_token_hash, repeat('T', 43), 'QR');
    insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
    values (active_agent_id, active_user_id, 'TOKEN_CREATED', jsonb_build_object('source', 'LOCAL_ACCEPTANCE_FIXTURE'));
  end if;

  if not exists (select 1 from public.agent_referrals where agent_id = active_agent_id) then
    for spec in select value from jsonb_array_elements(referral_specs)
    loop
      position := position + 1;
      customer_id := null;
      if (spec->>'resolved')::boolean then
        customer_id := public.create_customer_identity_with_evidence(
          'PERSON',
          jsonb_build_array(jsonb_build_object(
            'key_type', 'PHONE',
            'key_hash', encode(digest('agent-fixture-' || (spec->>'key'), 'sha256'), 'hex'),
            'key_version', 1,
            'verified', true
          )),
          null
        );
      end if;

      referral_id := public.create_agent_referral_record(
        fixture_token_hash,
        customer_id,
        'PERSON',
        spec->>'name',
        '+37360000' || lpad((10 + position)::text, 3, '0'),
        null,
        'Chișinău',
        'Oficiu test',
        'Soluție CCTV pentru acceptarea UX',
        'Date sintetice, exclusiv pentru mediul local de acceptare.',
        'În următoarele 30 de zile',
        case when customer_id is null then 'NEW' else 'MATCHED' end,
        case when customer_id is null then 'NEW_IDENTITY' else 'EXACT_VERIFIED_PHONE' end,
        'test-agent-fixture-v1',
        now()
      );

      if spec->>'final' = 'REJECTED' then
        perform public.transition_agent_referral_record(referral_id, 'REJECTED', active_user_id, null, null, null);
      elsif spec->>'final' <> 'CAPTURED' then
        perform public.transition_agent_referral_record(referral_id, 'PENDING_REVIEW', active_user_id, customer_id, null, null);
        perform public.transition_agent_referral_record(referral_id, 'VERIFIED', active_user_id, customer_id, null, null);
        if spec->>'final' = 'ACTIVE' then
          perform public.create_agent_attribution_record(referral_id, active_user_id, now());
        end if;
      end if;
    end loop;
  end if;
end;
$$;
