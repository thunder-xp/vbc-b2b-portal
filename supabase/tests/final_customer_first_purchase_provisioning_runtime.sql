begin;

insert into auth.users (
  id, aud, role, phone, phone_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', '+37369111111', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', '+37369222222', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

insert into public.public_retail_publications (id)
values ('20000000-0000-4000-8000-000000000011');
insert into public.retail_carts (id, token_hash)
values
  ('30000000-0000-4000-8000-000000000011', repeat('1', 64)),
  ('30000000-0000-4000-8000-000000000012', repeat('2', 64));
insert into public.retail_customers (
  id, normalized_phone_hash, normalized_email_hash, name, phone, email, processing_acknowledged_at
) values (
  '40000000-0000-4000-8000-000000000011', repeat('3', 64), repeat('4', 64),
  'Runtime Customer', '+37369111111', 'runtime@example.test', now()
);
insert into public.retail_orders (
  id, public_number, source_cart_id, customer_id, submission_key,
  request_fingerprint, checkout_fingerprint, status, locale, publication_id,
  currency, equipment_subtotal, materials_subtotal, priced_scope_total,
  vat_presentation, customer_snapshot, delivery_address_snapshot,
  base_commercial_total, final_commercial_total, orchestration_snapshot_locked
) values
  (
    '50000000-0000-4000-8000-000000000011', 'R-2026-900011',
    '30000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000011',
    '60000000-0000-4000-8000-000000000011', repeat('5', 64), repeat('6', 64),
    'awaiting_payment', 'ru', '20000000-0000-4000-8000-000000000011', 'MDL',
    100, 0, 100, 'included', '{"name":"Runtime Customer","phone":"+37369111111","email":"runtime@example.test"}',
    '{"locality":"Chisinau","street":"Test","building":"1"}', 100, 100, true
  ),
  (
    '50000000-0000-4000-8000-000000000012', 'R-2026-900012',
    '30000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000011',
    '60000000-0000-4000-8000-000000000012', repeat('7', 64), repeat('8', 64),
    'awaiting_payment', 'ru', '20000000-0000-4000-8000-000000000011', 'MDL',
    200, 0, 200, 'included', '{"name":"Runtime Customer","phone":"+37369111111","email":"runtime@example.test"}',
    '{"locality":"Chisinau","street":"Test","building":"1"}', 200, 200, true
  );
insert into public.retail_order_access_tokens (order_id, token_hash, expires_at)
values
  ('50000000-0000-4000-8000-000000000011', repeat('9', 64), now() + interval '1 day'),
  ('50000000-0000-4000-8000-000000000012', repeat('a', 64), now() + interval '1 day');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select public.bind_retail_order_authenticated_owner_v1(
  repeat('9', 64), '10000000-0000-4000-8000-000000000011', repeat('b', 64), 1
);
select public.activate_paid_retail_order(
  '50000000-0000-4000-8000-000000000011', 'payment_verified',
  '70000000-0000-4000-8000-000000000011', null
);

select public.claim_customer_provisioning_events_v1(20);

do $$
begin
  if public.claim_customer_provisioning_events_v1(20) <> '[]'::jsonb then
    raise exception 'Concurrent duplicate worker claim was not excluded by the active lease.';
  end if;
end;
$$;

-- The first expression claimed the row; get its lease from the table to avoid
-- a second claim and prove the processing state is durable.
do $$
declare claimed public.customer_provisioning_outbox%rowtype;
begin
  select * into claimed from public.customer_provisioning_outbox
  where retail_order_id = '50000000-0000-4000-8000-000000000011';
  perform public.provision_final_customer_from_purchase_v1(claimed.id, claimed.lease_token);
end;
$$;

do $$
begin
  if (select count(*) from public.customer_accounts where auth_user_id = '10000000-0000-4000-8000-000000000011') <> 1 then
    raise exception 'First confirmed purchase did not create exactly one account.';
  end if;
  if (select status from public.customer_accounts where auth_user_id = '10000000-0000-4000-8000-000000000011') <> 'ACTIVE' then
    raise exception 'Confirmed purchase account is not available.';
  end if;
  if (select count(*) from public.customer_account_purchase_entitlements) <> 1
    or (select count(*) from public.customer_external_provisioning_jobs where state = 'PENDING') <> 1 then
    raise exception 'Entitlement or asynchronous 1C seam was not created exactly once.';
  end if;
  if (select count(*) from public.customer_accounts where auth_user_id = '10000000-0000-4000-8000-000000000012') <> 0 then
    raise exception 'OTP-only user received a new-path account without a purchase.';
  end if;
end;
$$;

-- A different authenticated identity cannot bind an order whose verified
-- checkout phone belongs to the first user.
do $$
begin
  begin
    perform public.bind_retail_order_authenticated_owner_v1(
      repeat('a', 64), '10000000-0000-4000-8000-000000000012', repeat('c', 64), 1
    );
    raise exception 'Cross-customer order binding was accepted.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- A later purchase for the same verified owner reuses the account/root and
-- creates one additional order entitlement, not another 1C identity job.
select public.bind_retail_order_authenticated_owner_v1(
  repeat('a', 64), '10000000-0000-4000-8000-000000000011', repeat('b', 64), 1
);
select public.activate_paid_retail_order(
  '50000000-0000-4000-8000-000000000012', 'payment_verified',
  '70000000-0000-4000-8000-000000000012', null
);
select public.claim_customer_provisioning_events_v1(20);
do $$
declare claimed public.customer_provisioning_outbox%rowtype;
begin
  select * into claimed from public.customer_provisioning_outbox
  where retail_order_id = '50000000-0000-4000-8000-000000000012';
  perform public.provision_final_customer_from_purchase_v1(claimed.id, claimed.lease_token);
end;
$$;

-- Repeated activation heals/no-ops the same event and never duplicates state.
select public.activate_paid_retail_order(
  '50000000-0000-4000-8000-000000000012', 'payment_verified',
  '70000000-0000-4000-8000-000000000012', null
);

do $$
begin
  if (select count(*) from public.customer_accounts where auth_user_id = '10000000-0000-4000-8000-000000000011') <> 1 then
    raise exception 'Later purchase duplicated customer account.';
  end if;
  if (select count(*) from public.customer_identity_keys where key_type = 'PHONE' and key_hash = repeat('b', 64)) <> 1 then
    raise exception 'Duplicate confirmation duplicated the verified identity key.';
  end if;
  if (select count(*) from public.customer_provisioning_outbox) <> 2
    or (select count(*) from public.customer_account_purchase_entitlements) <> 2
    or (select count(*) from public.customer_external_provisioning_jobs) <> 1 then
    raise exception 'Retry/later-purchase idempotency contract failed.';
  end if;
  if exists (select 1 from public.customer_provisioning_outbox where status <> 'SUCCEEDED') then
    raise exception 'Provisioning did not converge to SUCCEEDED.';
  end if;
end;
$$;

-- Direct browser table access remains unavailable even though the binding
-- command itself is orchestrated by a Server Action.
do $$
begin
  if has_table_privilege('authenticated', 'public.retail_order_auth_bindings', 'select')
    or has_table_privilege('authenticated', 'public.customer_provisioning_outbox', 'select')
    or has_table_privilege('authenticated', 'public.customer_account_purchase_entitlements', 'select')
    or has_table_privilege('authenticated', 'public.customer_external_provisioning_jobs', 'select') then
    raise exception 'Provisioning evidence is browser-readable.';
  end if;
end;
$$;

rollback;
