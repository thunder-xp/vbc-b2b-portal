begin;
set local session_replication_role = replica;

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'b2b-maib-runtime@example.test', now(), now());
insert into public.user_profiles(id, email, status, user_type) values
  ('10000000-0000-4000-8000-000000000001', 'b2b-maib-runtime@example.test', 'active', 'external');
insert into public.partner_companies(id, external_1c_id, display_name, status) values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   'B2B MAIB Runtime', 'active');
insert into public.partner_orders(
  id, company_id, submitted_by, submission_key, submission_attempt_id, status,
  requested_delivery_date, external_1c_ref, external_1c_number, external_1c_date,
  payload_snapshot, submitted_at, integration_status, document_total, currency_code,
  confirmed_at, authoritative_presence
) values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  'submitted', current_date + 1, '70000000-0000-4000-8000-000000000001',
  'B2B-TEST-1', now(), '{}'::jsonb, now(), 'confirmed', 1250.75, 'MDL', now(), 'confirmed_present_in_1c'
);
insert into public.b2b_payment_attempts(
  id, partner_order_id, company_id, initiated_by, provider, status,
  idempotency_key, amount, currency, locale, return_access_token_hash,
  provider_checkout_id, provider_checkout_url, provider_status
) values (
  '80000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'maib', 'pending', '90000000-0000-4000-8000-000000000001', 1250.75, 'MDL', 'ru',
  repeat('a', 64), 'a0000000-0000-4000-8000-000000000001',
  'https://checkout.maib.md/runtime', 'WaitingForInit'
);
set local session_replication_role = origin;

do $$
declare malformed_result jsonb; first_result jsonb; replay_result jsonb; mismatch_result jsonb; return_state jsonb;
begin
  malformed_result := public.confirm_maib_b2b_payment_callback_v1(
    'a0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    null, null, null, null, null, null, now(), 'runtime-rrn'
  );
  first_result := public.confirm_maib_b2b_payment_callback_v1(
    'a0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    1250.75, 'MDL', 1250.75, 'MDL', 'Executed', now(), 'runtime-rrn'
  );
  replay_result := public.confirm_maib_b2b_payment_callback_v1(
    'a0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    1250.75, 'MDL', 1250.75, 'MDL', 'Executed', now(), 'runtime-rrn'
  );
  mismatch_result := public.confirm_maib_b2b_payment_callback_v1(
    'a0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    1250.76, 'MDL', 1250.76, 'MDL', 'Executed', now(), 'runtime-rrn-2'
  );
  return_state := public.get_b2b_payment_return_state_v1(
    '80000000-0000-4000-8000-000000000001', repeat('a', 64));
  if malformed_result->>'outcome' <> 'ORDER_MISMATCH' then raise exception 'malformed callback did not fail closed: %', malformed_result; end if;
  if first_result->>'outcome' <> 'PAID' then raise exception 'first callback was not PAID: %', first_result; end if;
  if replay_result->>'outcome' <> 'DUPLICATE' then raise exception 'callback replay was not idempotent: %', replay_result; end if;
  if mismatch_result->>'outcome' <> 'AMOUNT_MISMATCH' then raise exception 'amount mismatch was accepted: %', mismatch_result; end if;
  if return_state->>'status' <> 'PAID' then raise exception 'return state did not read verified truth: %', return_state; end if;
  if (select count(*) from public.b2b_payment_events where payment_attempt_id =
      '80000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'payment confirmation event was not exactly once';
  end if;
end;
$$;

rollback;
