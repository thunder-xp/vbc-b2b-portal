begin;

set local lock_timeout = '5s';

create or replace function public.validate_partner_order_submission_v4(
  target_cart_id uuid,
  target_expected_intent_version bigint,
  target_delivery_date date,
  target_payment_method text,
  target_payment_date date,
  target_fulfillment_method text,
  target_carrier_id uuid,
  target_request_fingerprint text,
  target_payload jsonb,
  target_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_cart public.carts%rowtype;
  target_company public.partner_companies%rowtype;
  target_carrier public.one_c_delivery_carriers%rowtype;
  qualification jsonb;
  resolved_contract_ref text;
  resolved_price_type_ref text;
  resolved_currency_ref text;
  resolved_counterparty_ref text;
  business_date date := (now() at time zone 'Europe/Chisinau')::date;
begin
  select * into target_cart
  from public.carts
  where id = target_cart_id and created_by = auth.uid()
  for update;

  if target_cart.id is null or target_cart.status <> 'active'
    or not public.can_manage_partner_order_company(target_cart.company_id) then
    raise exception 'Cart is not available for submission.' using errcode = '42501';
  end if;

  if target_expected_intent_version is null
    or target_cart.intent_version <> target_expected_intent_version then
    return jsonb_build_object('valid', false, 'code', 'ORDER_CART_VERSION_CONFLICT',
      'stage', 'cart_intent_validation');
  end if;

  if target_delivery_date is null or target_delivery_date < business_date then
    return jsonb_build_object('valid', false, 'code', 'ORDER_INVALID_SHIPMENT_DATE',
      'stage', 'delivery_date_validation');
  end if;

  if target_payment_method is null
    or target_payment_method not in ('cashless', 'cash')
    or target_payment_date is null or target_payment_date < business_date then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYMENT_CONFIGURATION_INVALID',
      'stage', 'payment_validation');
  end if;

  if target_fulfillment_method is null
    or target_fulfillment_method not in ('pickup', 'delivery')
    or (target_fulfillment_method = 'pickup' and target_carrier_id is not null)
    or (target_fulfillment_method = 'delivery' and target_carrier_id is null) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_FULFILLMENT_CONFIGURATION_INVALID',
      'stage', 'fulfillment_validation');
  end if;

  if char_length(coalesce(target_request_fingerprint, '')) <> 64
    or coalesce(jsonb_typeof(target_payload), 'null') <> 'object'
    or coalesce(jsonb_typeof(target_items), 'null') <> 'array' then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'payload_validation');
  end if;

  if jsonb_array_length(target_items) = 0 then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'payload_validation');
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
    group by item.product_id
    having count(*) > 1
  ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'line_identity_validation');
  end if;

  if exists (
    (select item.product_id, item.quantity
       from public.cart_items item where item.cart_id = target_cart.id
     except
     select submitted.product_id, submitted.quantity
       from jsonb_to_recordset(target_items) submitted(product_id uuid, quantity integer))
    union all
    (select submitted.product_id, submitted.quantity
       from jsonb_to_recordset(target_items) submitted(product_id uuid, quantity integer)
     except
     select item.product_id, item.quantity
       from public.cart_items item where item.cart_id = target_cart.id)
  ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_CART_VERSION_CONFLICT',
      'stage', 'cart_line_validation');
  end if;

  select * into target_company
  from public.partner_companies
  where id = target_cart.company_id and status = 'active';

  if target_company.id is null then
    return jsonb_build_object('valid', false, 'code', 'ORDER_COMPANY_MAPPING_MISSING',
      'stage', 'company_mapping_validation');
  end if;

  resolved_counterparty_ref := lower(btrim(coalesce(target_company.external_1c_id, '')));
  if target_payment_method = 'cashless' then
    resolved_contract_ref := lower(btrim(coalesce(target_company.external_1c_contract_id, '')));
    qualification := public.qualify_partner_contract_candidate(
      target_company.id, resolved_contract_ref
    );
  else
    select lower(btrim(mapping.contract_external_1c_id))
    into resolved_contract_ref
    from public.partner_company_cash_contract_mappings mapping
    where mapping.company_id = target_company.id
      and mapping.active
      and mapping.contract_role = 'cash';
    qualification := public.qualify_partner_cash_contract_candidate(
      target_company.id, resolved_contract_ref
    );
  end if;

  if not coalesce((qualification->>'qualified')::boolean, false) then
    return jsonb_build_object(
      'valid', false,
      'code', 'ORDER_CONTRACT_INVALID',
      'stage', 'contract_mapping_validation',
      'diagnosticCode', qualification->>'code'
    );
  end if;

  resolved_price_type_ref := lower(btrim(coalesce(qualification->>'priceTypeRef', '')));
  resolved_currency_ref := lower(btrim(coalesce(qualification->>'publishedPriceCurrencyRef', '')));

  if resolved_counterparty_ref = ''
    or coalesce(resolved_contract_ref, '') = ''
    or resolved_price_type_ref = ''
    or resolved_currency_ref = ''
    or (target_payment_method = 'cashless' and resolved_price_type_ref <>
      lower(btrim(coalesce(target_company.external_1c_price_type_id, '')))) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_CONTRACT_INVALID',
      'stage', 'contract_mapping_validation');
  end if;

  if lower(btrim(coalesce(target_payload->'partnerCompanyReference'->>'externalId', ''))) <>
      resolved_counterparty_ref
    or lower(btrim(coalesce(target_payload->'priceTypeReference'->>'externalId', ''))) <>
      resolved_price_type_ref
    or lower(btrim(coalesce(target_payload->'contractReference'->>'externalId', ''))) <>
      resolved_contract_ref
    or lower(btrim(coalesce(target_payload->'currencyReference'->>'externalId', ''))) <>
      resolved_currency_ref
    or target_payload->>'paymentMethod' is distinct from target_payment_method
    or target_payload->>'plannedPaymentDate' is distinct from target_payment_date::text
    or target_payload->>'fulfillmentMethod' is distinct from target_fulfillment_method then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'commercial_payload_validation');
  end if;

  if target_fulfillment_method = 'delivery' then
    select * into target_carrier
    from public.one_c_delivery_carriers carrier
    where carrier.id = target_carrier_id
      and carrier.is_published
      and carrier.is_active
      and not carrier.is_deleted;
    if target_carrier.id is null
      or lower(btrim(coalesce(target_payload->'carrierReference'->>'externalId', ''))) <>
        lower(target_carrier.external_1c_id) then
      return jsonb_build_object('valid', false,
        'code', 'ORDER_FULFILLMENT_CONFIGURATION_INVALID', 'stage', 'carrier_validation');
    end if;
  elsif target_payload->'carrierReference' is not null
    and target_payload->'carrierReference' <> 'null'::jsonb then
    return jsonb_build_object('valid', false,
      'code', 'ORDER_FULFILLMENT_CONFIGURATION_INVALID', 'stage', 'carrier_validation');
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', 'ORDER_PREPARATION_VALID',
    'stage', 'completed',
    'paymentMethod', target_payment_method,
    'paymentDate', target_payment_date,
    'fulfillmentMethod', target_fulfillment_method,
    'requestedDeliveryDate', target_delivery_date
  );
end;
$$;

revoke all on function public.validate_partner_order_submission_v4(
  uuid, bigint, date, text, date, text, uuid, text, jsonb, jsonb
) from public, anon;
grant execute on function public.validate_partner_order_submission_v4(
  uuid, bigint, date, text, date, text, uuid, text, jsonb, jsonb
) to authenticated;

create or replace function public.begin_partner_order_submission_v4(
  target_cart_id uuid,
  target_expected_intent_version bigint,
  target_submission_key uuid,
  target_attempt_id uuid,
  target_delivery_date date,
  target_payment_method text,
  target_payment_date date,
  target_fulfillment_method text,
  target_carrier_id uuid,
  target_request_fingerprint text,
  target_payload jsonb,
  target_items jsonb
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cart public.carts%rowtype;
  target_order public.partner_orders%rowtype;
  validation jsonb;
  resolved_contract_ref text;
  resolved_price_type_ref text;
  resolved_counterparty_ref text;
begin
  select * into target_order
  from public.partner_orders
  where submission_key = target_submission_key;
  if target_order.id is not null then
    if target_order.submitted_by <> auth.uid() then
      raise exception 'Order submission key is not available.' using errcode = '42501';
    end if;
    if target_order.request_fingerprint is distinct from target_request_fingerprint then
      raise exception 'ORDER_SUBMISSION_FINGERPRINT_CONFLICT' using errcode = 'PT409';
    end if;
    return target_order;
  end if;

  validation := public.validate_partner_order_submission_v4(
    target_cart_id,
    target_expected_intent_version,
    target_delivery_date,
    target_payment_method,
    target_payment_date,
    target_fulfillment_method,
    target_carrier_id,
    target_request_fingerprint,
    target_payload,
    target_items
  );

  if not coalesce((validation->>'valid')::boolean, false) then
    raise exception '%', coalesce(validation->>'code', 'ORDER_PAYLOAD_VALIDATION_FAILED')
      using errcode = 'PT409', detail = validation->>'stage';
  end if;

  select * into strict target_cart
  from public.carts
  where id = target_cart_id and created_by = auth.uid();

  resolved_contract_ref := lower(btrim(target_payload->'contractReference'->>'externalId'));
  resolved_price_type_ref := lower(btrim(target_payload->'priceTypeReference'->>'externalId'));
  resolved_counterparty_ref := lower(btrim(target_payload->'partnerCompanyReference'->>'externalId'));

  insert into public.partner_orders(
    company_id, submitted_by, cart_id, submission_key, submission_attempt_id,
    requested_delivery_date, request_fingerprint, payload_snapshot
  ) values (
    target_cart.company_id, auth.uid(), target_cart.id, target_submission_key,
    target_attempt_id, target_delivery_date, target_request_fingerprint, target_payload
  ) returning * into target_order;

  insert into public.partner_order_items(
    order_id, product_id, external_product_ref, external_characteristic_ref,
    external_unit_ref, external_vat_rate_ref, product_name, sku, quantity,
    partner_unit_price, currency_code, line_total, available_stock,
    nearest_arrival_date, nearest_arrival_quantity
  )
  select target_order.id, item.product_id, item.external_product_ref,
    item.external_characteristic_ref, item.external_unit_ref, item.external_vat_rate_ref,
    item.product_name, item.sku, item.quantity, item.partner_unit_price,
    item.currency_code, item.line_total, item.available_stock,
    item.nearest_arrival_date, item.nearest_arrival_quantity
  from jsonb_to_recordset(target_items) item(
    product_id uuid, external_product_ref text, external_characteristic_ref text,
    external_unit_ref text, external_vat_rate_ref text, product_name text, sku text,
    quantity integer, partner_unit_price numeric, currency_code text, line_total numeric,
    available_stock numeric, nearest_arrival_date date, nearest_arrival_quantity numeric
  );

  insert into public.partner_order_export_diagnostics(
    order_id, payment_method, planned_payment_date, fulfillment_method, carrier_id,
    resolved_contract_ref, resolved_price_type_ref, resolved_counterparty_ref, request_fingerprint
  ) values (
    target_order.id, target_payment_method, target_payment_date, target_fulfillment_method,
    target_carrier_id, resolved_contract_ref, resolved_price_type_ref,
    resolved_counterparty_ref, target_request_fingerprint
  );

  update public.carts set status = 'submitting' where id = target_cart.id;
  return target_order;
end;
$$;

revoke all on function public.begin_partner_order_submission_v4(
  uuid, bigint, uuid, uuid, date, text, date, text, uuid, text, jsonb, jsonb
) from public, anon;
grant execute on function public.begin_partner_order_submission_v4(
  uuid, bigint, uuid, uuid, date, text, date, text, uuid, text, jsonb, jsonb
) to authenticated;

comment on function public.validate_partner_order_submission_v4(
  uuid, bigint, date, text, date, text, uuid, text, jsonb, jsonb
) is 'Read-only order preparation validator shared by dry-run diagnostics and the governed begin-submission boundary.';

commit;
