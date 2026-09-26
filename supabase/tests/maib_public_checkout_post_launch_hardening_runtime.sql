begin;

set local session_replication_role = replica;
insert into public.retail_orders (
  id, public_number, source_cart_id, customer_id, submission_key,
  request_fingerprint, checkout_fingerprint, status, locale, publication_id,
  currency, equipment_subtotal, materials_subtotal, priced_scope_total,
  vat_presentation, customer_snapshot, delivery_address_snapshot, checkout_channel
) values
  ('91000000-0000-4000-8000-000000000001', 'R-2099-000001', '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000004', repeat('a', 64), repeat('b', 64), 'awaiting_payment', 'ro', '91000000-0000-4000-8000-000000000005', 'MDL', 17, 0, 17, 'included', '{}'::jsonb, '{}'::jsonb, 'public'),
  ('92000000-0000-4000-8000-000000000001', 'R-2099-000002', '92000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000004', repeat('c', 64), repeat('d', 64), 'awaiting_payment', 'ro', '92000000-0000-4000-8000-000000000005', 'MDL', 17, 0, 17, 'included', '{}'::jsonb, '{}'::jsonb, 'maib_review');
set local session_replication_role = origin;

insert into public.retail_payment_attempts (
  id, retail_order_id, provider, status, amount, currency, idempotency_key,
  provider_checkout_id, provider_checkout_url, provider_status
) values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'maib', 'pending', 17, 'MDL', '93000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000003', 'https://checkout.maib.md/fixture', 'WaitingForInit'),
  ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'maib', 'pending', 17, 'MDL', '94000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000003', 'https://checkout-sandbox.maib.md/fixture', 'WaitingForInit');

update public.retail_payment_attempts set reconciliation_next_at = now() - interval '1 minute';

do $$
declare
  claimed integer;
  competing integer;
  result jsonb;
begin
  select count(*) into claimed
  from public.claim_maib_retail_payment_reconciliation_batch_v1(3, '95000000-0000-4000-8000-000000000001');
  if claimed <> 1 then raise exception 'Expected one public claim and no review claim, got %', claimed; end if;

  select count(*) into competing
  from public.claim_maib_retail_payment_reconciliation_batch_v1(3, '95000000-0000-4000-8000-000000000002');
  if competing <> 0 then raise exception 'Concurrent claim bypassed lease: %', competing; end if;

  result := public.record_maib_retail_payment_reconciliation_v1(
    '93000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001',
    18, 'MDL', 'Initialized', now(), 'PENDING'
  );
  if result->>'outcome' <> 'INVALID_EVIDENCE' then raise exception 'Malformed amount did not fail closed: %', result; end if;

  result := public.record_maib_retail_payment_reconciliation_v1(
    '93000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001',
    17, 'MDL', 'Initialized', now(), 'PENDING'
  );
  if result->>'outcome' <> 'PENDING' then raise exception 'Active checkout did not remain pending: %', result; end if;
end;
$$;

update public.retail_payment_attempts
set reconciliation_next_at = now() - interval '1 minute'
where id = '93000000-0000-4000-8000-000000000001';

do $$
declare
  claimed integer;
  result jsonb;
begin
  select count(*) into claimed
  from public.claim_maib_retail_payment_reconciliation_batch_v1(3, '95000000-0000-4000-8000-000000000003');
  if claimed <> 1 then raise exception 'Expected expired checkout claim, got %', claimed; end if;

  result := public.record_maib_retail_payment_reconciliation_v1(
    '93000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000003',
    '93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000001',
    17, 'MDL', 'Expired', now(), 'EXPIRED'
  );
  if result->>'outcome' <> 'EXPIRED' or result->>'paymentStatus' <> 'expired' then
    raise exception 'Expired checkout did not terminalize safely: %', result;
  end if;
end;
$$;

do $$
begin
  if (select status from public.retail_orders where id = '91000000-0000-4000-8000-000000000001') <> 'awaiting_payment' then
    raise exception 'Unpaid RetailOrder status changed.';
  end if;
  if exists (select 1 from public.retail_payment_activations where retail_order_id = '91000000-0000-4000-8000-000000000001') then
    raise exception 'Unpaid checkout created payment activation.';
  end if;
  if exists (select 1 from public.installation_requirements where retail_order_id = '91000000-0000-4000-8000-000000000001') then
    raise exception 'Unpaid checkout created installation work.';
  end if;
  if exists (select 1 from public.customer_external_provisioning_jobs where source_retail_order_id = '91000000-0000-4000-8000-000000000001') then
    raise exception 'Unpaid checkout created downstream customer/1C work.';
  end if;
  if (select payment_state from public.retail_payment_current_states_v1 where retail_order_id = '91000000-0000-4000-8000-000000000001') <> 'FAILED' then
    raise exception 'Finance projection did not expose terminal unpaid state.';
  end if;
end;
$$;

insert into public.retail_payment_attempts (
  id, retail_order_id, provider, status, amount, currency, idempotency_key,
  provider_checkout_id, provider_checkout_url, provider_status
) values (
  '96000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'maib', 'pending', 17, 'MDL',
  '96000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000003', 'https://checkout.maib.md/retry-fixture', 'WaitingForInit'
);

do $$
begin
  if (select count(*) from public.retail_payment_attempts where retail_order_id = '91000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'Retry did not reuse the existing RetailOrder.';
  end if;
  if not has_function_privilege('service_role', 'public.claim_maib_retail_payment_reconciliation_batch_v1(integer,uuid)', 'execute')
    or has_function_privilege('anon', 'public.claim_maib_retail_payment_reconciliation_batch_v1(integer,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.claim_maib_retail_payment_reconciliation_batch_v1(integer,uuid)', 'execute') then
    raise exception 'Reconciliation function grants are unsafe.';
  end if;
end;
$$;

rollback;
