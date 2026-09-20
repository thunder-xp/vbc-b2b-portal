begin;

insert into auth.users (
  id, aud, role, phone, phone_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000041', 'authenticated', 'authenticated', '+37369444451', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000042', 'authenticated', 'authenticated', '+37369444452', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

insert into public.customer_identities (id, identity_kind) values
  ('20000000-0000-4000-8000-000000000041', 'PERSON'),
  ('20000000-0000-4000-8000-000000000042', 'PERSON');

insert into public.customer_accounts (
  id, auth_user_id, customer_identity_id, status, identity_resolution_status
) values
  ('30000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000041', '20000000-0000-4000-8000-000000000041', 'ACTIVE', 'MATCHED'),
  ('30000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000042', '20000000-0000-4000-8000-000000000042', 'ACTIVE', 'MATCHED');

insert into public.retail_customers (
  id, normalized_phone_hash, name, phone, processing_acknowledged_at, customer_identity_id
) values (
  '50000000-0000-4000-8000-000000000041', repeat('f', 64), 'Workspace Customer', '+37369444451', now(), '20000000-0000-4000-8000-000000000041'
);

insert into public.public_retail_publications (
  id, status, checksum_sha256, source_product_count, eligible_product_count,
  published_at, build_duration_ms, publication_duration_ms
) values (
  '60000000-0000-4000-8000-000000000041', 'building', repeat('1', 64), 1, 1, null, 0, 0
);

insert into public.retail_carts (id, token_hash, status, expires_at)
values ('70000000-0000-4000-8000-000000000041', repeat('2', 64), 'converted', now() + interval '1 day');

insert into public.retail_orders (
  id, public_number, source_cart_id, customer_id, submission_key,
  request_fingerprint, checkout_fingerprint, status, locale, publication_id,
  currency, equipment_subtotal, materials_subtotal, priced_scope_total,
  vat_presentation, customer_snapshot, delivery_address_snapshot,
  paid_at, payment_activation_mode
) values (
  '80000000-0000-4000-8000-000000000041', 'R-2026-980041',
  '70000000-0000-4000-8000-000000000041', '50000000-0000-4000-8000-000000000041',
  '81000000-0000-4000-8000-000000000041', repeat('3', 64), repeat('4', 64),
  'confirmed', 'ru', '60000000-0000-4000-8000-000000000041', 'MDL', 100, 0, 100,
  'included', '{"name":"Workspace Customer"}', '{}', now(), 'pilot_simulated'
);

insert into public.retail_order_lines (
  id, order_id, line_number, public_product_id, source, commercial_group,
  sku, product_name, slug_snapshot, quantity, unit_code, unit_price,
  line_total, currency, vat_presentation, availability_snapshot
) values (
  '82000000-0000-4000-8000-000000000041', '80000000-0000-4000-8000-000000000041',
  1, '83000000-0000-4000-8000-000000000041', 'catalog', 'equipment',
  '100077', 'Camera', 'camera', 2, 'piece', 50, 100, 'MDL', 'included', 'in_stock'
);

set local role service_role;

do $$
declare
  v_object_a uuid;
  v_object_b uuid;
  v_other_object uuid;
  v_workspace jsonb;
  v_detail jsonb;
  v_request_id uuid;
begin
  v_object_a := public.create_customer_object_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    'Home', 'HOME', 'Chișinău', null, null
  );
  v_object_b := public.create_customer_object_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    'Office', 'OFFICE', 'Chișinău', null, null
  );
  v_other_object := public.create_customer_object_v2(
    '30000000-0000-4000-8000-000000000042',
    '20000000-0000-4000-8000-000000000042',
    '10000000-0000-4000-8000-000000000042',
    'Other customer', 'HOME', null, null, null
  );

  -- A/G: an empty object and the complete unassigned-purchase count are visible.
  v_workspace := public.get_customer_object_workspace_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041', false
  );
  if (v_workspace->>'unlinkedPurchaseCount')::integer <> 1
    or jsonb_array_length(v_workspace->'objects') <> 2 then
    raise exception 'Empty object/unassigned-purchase workspace is incorrect: %', v_workspace;
  end if;

  -- B/H: one factual purchase can be assigned and safely reassigned while no
  -- service context exists. The second call is idempotent.
  perform public.assign_customer_object_purchase_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    v_object_a, '80000000-0000-4000-8000-000000000041'
  );
  perform public.assign_customer_object_purchase_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    v_object_b, '80000000-0000-4000-8000-000000000041'
  );
  perform public.assign_customer_object_purchase_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    v_object_b, '80000000-0000-4000-8000-000000000041'
  );
  if (select count(*) from public.customer_object_purchase_links where retail_order_id = '80000000-0000-4000-8000-000000000041') <> 1
    or (select count(*) from public.customer_object_events where retail_order_id = '80000000-0000-4000-8000-000000000041' and event_type = 'PURCHASE_REASSIGNED') <> 1 then
    raise exception 'Assignment was not idempotent/audited exactly once.';
  end if;

  -- D: the normal governed service boundary accepts the coherent object/order/line context.
  v_request_id := public.create_customer_service_request_v3(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    'OTHER', 'Camera issue', 'Camera is not responding', 'PHONE', 'ru',
    v_object_b,
    '80000000-0000-4000-8000-000000000041',
    '82000000-0000-4000-8000-000000000041'
  );

  -- H: once service references the old context, moving the purchase fails closed.
  begin
    perform public.assign_customer_object_purchase_v2(
      '30000000-0000-4000-8000-000000000041',
      '20000000-0000-4000-8000-000000000041',
      '10000000-0000-4000-8000-000000000041',
      v_object_a, '80000000-0000-4000-8000-000000000041'
    );
    raise exception 'Service-bound purchase was reassigned unexpectedly.';
  exception when sqlstate 'PT409' then
    null;
  end;

  -- D/F: the detail is one bounded payload and preserves purchase/service context.
  v_detail := public.get_customer_object_detail_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    v_object_b
  );
  if jsonb_array_length(v_detail->'purchases') <> 1
    or jsonb_array_length(v_detail->'serviceRequests') <> 1
    or not (v_detail->'activity' @> '[{"eventType":"SERVICE_REQUEST_OPENED"}]'::jsonb)
    or v_detail->'serviceRequests'->0->>'id' <> v_request_id::text then
    raise exception 'Object detail payload is incomplete: %', v_detail;
  end if;

  -- J: an object from another identity never resolves.
  if public.get_customer_object_detail_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    v_other_object
  ) is not null then
    raise exception 'Cross-customer detail unexpectedly resolved.';
  end if;

  -- I: archive preserves purchase and service history and disables reassignment from it.
  perform public.archive_customer_object_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    v_object_b, 0
  );
  v_detail := public.get_customer_object_detail_v2(
    '30000000-0000-4000-8000-000000000041',
    '20000000-0000-4000-8000-000000000041',
    '10000000-0000-4000-8000-000000000041',
    v_object_b
  );
  if v_detail->'object'->>'status' <> 'ARCHIVED'
    or jsonb_array_length(v_detail->'purchases') <> 1
    or jsonb_array_length(v_detail->'serviceRequests') <> 1 then
    raise exception 'Archived object history was not preserved: %', v_detail;
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000041', true);

do $$
begin
  if exists (
    select 1 from public.customer_object_events
    where customer_identity_id = '20000000-0000-4000-8000-000000000042'
  ) then raise exception 'Cross-customer event was visible.'; end if;
  if has_table_privilege(current_user, 'public.customer_object_events', 'insert')
    or has_table_privilege(current_user, 'public.customer_object_events', 'update')
    or has_table_privilege(current_user, 'public.customer_object_events', 'delete') then
    raise exception 'Browser role can mutate object audit events.';
  end if;
  if has_function_privilege(current_user, 'public.assign_customer_object_purchase_v2(uuid,uuid,uuid,uuid,uuid)', 'execute') then
    raise exception 'Browser role can invoke service-only assignment.';
  end if;
end;
$$;

rollback;
