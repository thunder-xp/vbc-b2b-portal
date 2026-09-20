begin;

insert into auth.users (
  id, aud, role, phone, phone_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000031', 'authenticated', 'authenticated', '+37369444441', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', '+37369444442', now(), '{"provider":"phone","providers":["phone"]}', '{}', now(), now());

insert into public.customer_identities (id, identity_kind) values
  ('20000000-0000-4000-8000-000000000031', 'PERSON'),
  ('20000000-0000-4000-8000-000000000032', 'PERSON');

insert into public.customer_accounts (
  id, auth_user_id, customer_identity_id, status, identity_resolution_status
) values
  ('30000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-000000000031', 'ACTIVE', 'MATCHED'),
  ('30000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000032', '20000000-0000-4000-8000-000000000032', 'ACTIVE', 'MATCHED');

insert into public.customer_objects (
  id, customer_identity_id, name, object_type
) values
  ('40000000-0000-4000-8000-000000000031', '20000000-0000-4000-8000-000000000031', 'Home', 'HOME'),
  ('40000000-0000-4000-8000-000000000032', '20000000-0000-4000-8000-000000000032', 'Office', 'OFFICE');

insert into public.retail_customers (
  id, normalized_phone_hash, name, phone, processing_acknowledged_at, customer_identity_id
) values
  ('50000000-0000-4000-8000-000000000031', repeat('a', 64), 'Customer One', '+37369444441', now(), '20000000-0000-4000-8000-000000000031');

insert into public.public_retail_publications (
  id, status, checksum_sha256, source_product_count, eligible_product_count,
  published_at, build_duration_ms, publication_duration_ms
) values (
  '60000000-0000-4000-8000-000000000031', 'building', repeat('b', 64), 1, 1, null, 0, 0
);

insert into public.retail_carts (id, token_hash, status, expires_at)
values ('70000000-0000-4000-8000-000000000031', repeat('c', 64), 'converted', now() + interval '1 day');

insert into public.retail_orders (
  id, public_number, source_cart_id, customer_id, submission_key,
  request_fingerprint, checkout_fingerprint, status, locale, publication_id,
  currency, equipment_subtotal, materials_subtotal, priced_scope_total,
  vat_presentation, customer_snapshot, delivery_address_snapshot,
  paid_at, payment_activation_mode
) values (
  '80000000-0000-4000-8000-000000000031', 'R-2026-980031',
  '70000000-0000-4000-8000-000000000031', '50000000-0000-4000-8000-000000000031',
  '81000000-0000-4000-8000-000000000031', repeat('d', 64), repeat('e', 64),
  'confirmed', 'ru', '60000000-0000-4000-8000-000000000031', 'MDL', 100, 0, 100,
  'included', '{"name":"Customer One"}', '{}', now(), 'pilot_simulated'
);

insert into public.retail_order_lines (
  id, order_id, line_number, public_product_id, source, commercial_group,
  sku, product_name, slug_snapshot, quantity, unit_code, unit_price,
  line_total, currency, vat_presentation, availability_snapshot
) values (
  '82000000-0000-4000-8000-000000000031', '80000000-0000-4000-8000-000000000031',
  1, '83000000-0000-4000-8000-000000000031', 'catalog', 'equipment',
  '100077', 'Camera', 'camera', 1, 'piece', 100, 100, 'MDL', 'included', 'in_stock'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000031', true);

do $$
begin
  if (select count(*) from public.customer_objects) <> 1 then
    raise exception 'Customer object RLS exposed another customer.';
  end if;
  if exists (select 1 from public.customer_objects where id = '40000000-0000-4000-8000-000000000032') then
    raise exception 'Cross-customer object was visible.';
  end if;
  if has_table_privilege(current_user, 'public.customer_objects', 'insert')
    or has_table_privilege(current_user, 'public.customer_objects', 'update')
    or has_table_privilege(current_user, 'public.customer_object_purchase_links', 'insert') then
    raise exception 'Browser role can mutate customer object data directly.';
  end if;
  if has_function_privilege(current_user, 'public.create_customer_object_v1(uuid,uuid,uuid,text,text,text,text,uuid)', 'execute') then
    raise exception 'Browser role can invoke service-only object mutation.';
  end if;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  v_workspace jsonb;
  v_request_id uuid;
begin
  perform public.link_customer_object_purchase_v1(
    '30000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000031',
    '40000000-0000-4000-8000-000000000031',
    '80000000-0000-4000-8000-000000000031'
  );

  v_workspace := public.get_customer_object_workspace_v1(
    '30000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000031',
    false
  );
  if jsonb_array_length(v_workspace->'unlinkedPurchases') <> 0
    or (v_workspace->'objects'->0->>'purchaseCount')::integer <> 1
    or (v_workspace->'objects'->0->>'productCount')::integer <> 1 then
    raise exception 'Confirmed purchase/object aggregate is incorrect: %', v_workspace;
  end if;

  v_request_id := public.create_customer_service_request_v3(
    '30000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000031',
    'OTHER', 'Camera issue', 'Camera is not responding', 'PHONE', 'ru',
    '40000000-0000-4000-8000-000000000031',
    '80000000-0000-4000-8000-000000000031',
    '82000000-0000-4000-8000-000000000031'
  );
  if not exists (
    select 1 from public.customer_service_requests
    where id = v_request_id and customer_object_id = '40000000-0000-4000-8000-000000000031'
  ) then raise exception 'Service object context was not persisted.'; end if;

  begin
    perform public.create_customer_object_v1(
      '30000000-0000-4000-8000-000000000031',
      '20000000-0000-4000-8000-000000000031',
      '10000000-0000-4000-8000-000000000032',
      'Wrong actor', 'HOME', null, null, null
    );
    raise exception 'Cross-customer actor unexpectedly created an object.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.link_customer_object_purchase_v1(
      '30000000-0000-4000-8000-000000000031',
      '20000000-0000-4000-8000-000000000031',
      '10000000-0000-4000-8000-000000000031',
      '40000000-0000-4000-8000-000000000032',
      '80000000-0000-4000-8000-000000000031'
    );
    raise exception 'Cross-customer purchase link unexpectedly succeeded.';
  exception when insufficient_privilege then
    null;
  end;

  if public.get_customer_object_detail_v1(
    '30000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000031',
    '40000000-0000-4000-8000-000000000032'
  ) is not null then
    raise exception 'Cross-customer detail unexpectedly resolved.';
  end if;

  perform public.archive_customer_object_v1(
    '30000000-0000-4000-8000-000000000031',
    '20000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000031',
    '40000000-0000-4000-8000-000000000031', 0
  );
  if not exists (
    select 1 from public.customer_object_purchase_links
    where customer_object_id = '40000000-0000-4000-8000-000000000031'
  ) or not exists (
    select 1 from public.customer_service_requests where id = v_request_id
  ) then raise exception 'Archive removed preserved history.'; end if;
end;
$$;

rollback;
