\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'finance-reward@example.test', now(), now()),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'agent-reward@example.test', now(), now());
insert into public.user_profiles (id, email, status, user_type) values
  ('30000000-0000-4000-8000-000000000001', 'finance-reward@example.test', 'active', 'internal'),
  ('30000000-0000-4000-8000-000000000002', 'agent-reward@example.test', 'active', 'external');

insert into public.commercial_agents (
  id, user_id, agent_code, agent_type, display_name, status, compliance_status, contract_ready
) values (
  '31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
  'MD-P-985', 'INDIVIDUAL', 'Runtime Reward Agent', 'ACTIVE', 'APPROVED', true
);
insert into public.customer_identities (id, identity_kind) values
  ('32000000-0000-4000-8000-000000000001', 'LEGAL_ENTITY');
insert into public.agent_referral_consents (
  id, consent_type, consent_text_version, consent_given_at, consent_method, consent_source
) values (
  '33000000-0000-4000-8000-000000000001', 'REFERRAL_CONTACT_PROCESSING', 'runtime-v1', now(), 'ADMIN_RECORDED', 'ADMIN'
);
insert into public.agent_referral_tokens (
  id, agent_id, token_hash, token_type, status
) values (
  '34000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'LINK', 'ACTIVE'
);
insert into public.agent_referrals (
  id, agent_id, customer_identity_id, referral_token_id, consent_id, customer_kind,
  name_snapshot, need_summary, status, identity_resolution_status, identity_resolution_reason
) values (
  '35000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001', 'LEGAL_ENTITY', 'Runtime Customer',
  'Runtime governed payout', 'ACTIVE', 'MATCHED', 'EXACT_1C_REF'
);
insert into public.agent_attributions (
  id, customer_identity_id, agent_id, referral_id, valid_from, status, protection_until, created_by
) values (
  '36000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001', '35000000-0000-4000-8000-000000000001',
  timestamptz '2026-09-01 00:00:00+00', 'ACTIVE', timestamptz '2026-11-30 00:00:00+00',
  '30000000-0000-4000-8000-000000000001'
);
insert into public.agent_sale_links (
  id, agent_id, referral_id, attribution_id, customer_identity_id, source_order_1c_ref,
  source_order_number_snapshot, source_order_date_snapshot, source_customer_1c_ref,
  source_customer_name_snapshot, source_order_gross_snapshot, source_currency_snapshot, linked_by
) values (
  '37000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001', '38000000-0000-4000-8000-000000000001',
  'NS-RUNTIME-985', date '2026-09-20', '39000000-0000-4000-8000-000000000001',
  'Runtime Customer', 8494.00, 'MDL', '30000000-0000-4000-8000-000000000001'
);
insert into public.agent_sale_projections (
  sale_link_id, state, source_order_posted, source_order_deletion_marked, source_realization_refs,
  realized_at, gross_realized_amount, vat_amount, net_realized_amount, paid_gross_amount,
  remaining_gross_amount, payment_state, fully_paid_at, source_version, source_observed_at
) values (
  '37000000-0000-4000-8000-000000000001', 'FULLY_PAID', true, false,
  array['40000000-0000-4000-8000-000000000001'], now(), 8494.00, 1415.67, 7078.33,
  8494.00, 0, 'FULLY_PAID', now(), 'runtime-v1', now()
);
insert into public.agent_reward_projections (
  sale_link_id, policy_id, state, classification_complete, equipment_net_amount,
  installation_net_amount, excluded_net_amount, equipment_rate_percent,
  installation_rate_percent, forecast_reward_amount, currency
) select
  '37000000-0000-4000-8000-000000000001', id, 'BLOCKED', true, 5828.33,
  1250.00, 0, 4.0000, 8.0000, 333.13, 'MDL'
from public.agent_commission_policies where status = 'ACTIVE' order by effective_from desc limit 1;

do $$
declare expected timestamptz;
begin
  select updated_at into expected from public.agent_reward_projections
  where sale_link_id = '37000000-0000-4000-8000-000000000001';
  begin
    perform public.confirm_agent_reward_payout_record(
      '37000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', expected,
      '41000000-0000-4000-8000-000000000001', 'PAY-RUNTIME-BLOCKED', null
    );
    raise exception 'BLOCKED reward was paid';
  exception when check_violation then null;
  end;

  update public.agent_reward_projections set state = 'ELIGIBLE', updated_at = clock_timestamp()
  where sale_link_id = '37000000-0000-4000-8000-000000000001';
  select updated_at into expected from public.agent_reward_projections
  where sale_link_id = '37000000-0000-4000-8000-000000000001';
  begin
    perform public.confirm_agent_reward_payout_record(
      '37000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', expected,
      '41000000-0000-4000-8000-000000000001', 'PAY-RUNTIME-ELIGIBLE', null
    );
    raise exception 'Non-ready reward was paid';
  exception when check_violation then null;
  end;
end $$;

update public.agent_reward_projections
set state = 'READY_FOR_PAYOUT', updated_at = clock_timestamp()
where sale_link_id = '37000000-0000-4000-8000-000000000001';

do $$
declare expected timestamptz; result jsonb;
begin
  select updated_at into expected from public.agent_reward_projections
  where sale_link_id = '37000000-0000-4000-8000-000000000001';
  result := public.confirm_agent_reward_payout_record(
    '37000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', expected,
    '41000000-0000-4000-8000-000000000001', 'PAY-RUNTIME-001', 'Runtime evidence'
  );
  if result->>'outcome' <> 'APPLIED' or result->>'state' <> 'PAID' then
    raise exception 'READY payout did not apply';
  end if;
  result := public.confirm_agent_reward_payout_record(
    '37000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', expected,
    '41000000-0000-4000-8000-000000000001', 'PAY-RUNTIME-001', 'Runtime evidence'
  );
  if result->>'outcome' <> 'ALREADY_APPLIED' then raise exception 'Replay was not idempotent'; end if;
  begin
    perform public.confirm_agent_reward_payout_record(
      '37000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', expected,
      '41000000-0000-4000-8000-000000000002', 'PAY-RUNTIME-002', null
    );
    raise exception 'Concurrent payout was accepted';
  exception when serialization_failure then null;
  end;
end $$;

do $$ begin
  if not exists (
    select 1 from public.agent_reward_projections
    where sale_link_id = '37000000-0000-4000-8000-000000000001'
      and state = 'PAID' and forecast_reward_amount = 333.13
      and paid_by = '30000000-0000-4000-8000-000000000001'
      and payout_reference = 'PAY-RUNTIME-001' and paid_at is not null
  ) then raise exception 'Authoritative payout evidence missing'; end if;
  if (select count(*) from public.agent_reward_events
      where sale_link_id = '37000000-0000-4000-8000-000000000001' and to_state = 'PAID') <> 1 then
    raise exception 'Payout audit was duplicated';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare result jsonb; item jsonb;
begin
  begin
    perform public.confirm_agent_reward_payout_record(
      '37000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', now(),
      '41000000-0000-4000-8000-000000000003', 'UNAUTHORIZED', null
    );
    raise exception 'Authenticated Agent executed payout';
  exception when insufficient_privilege then null;
  end;
  result := public.get_agent_cabinet_rewards();
  item := result->'items'->0;
  if item->>'state' <> 'PAID' or item->>'paidAt' is null then raise exception 'Agent paid state/date missing'; end if;
  if item ? 'payoutReference' or item ? 'payoutNote' or item ? 'paidBy' then
    raise exception 'Finance-only payout metadata leaked to Agent';
  end if;
end $$;

rollback;
