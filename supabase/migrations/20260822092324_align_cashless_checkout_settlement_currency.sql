-- Cashless contracts may settle in a different currency from their governed
-- price type. Cash mappings retain the stricter same-currency qualification.
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
  target_cart public.carts;
  target_order public.partner_orders;
  target_company public.partner_companies;
  target_contract public.one_c_counterparty_contracts;
  target_price_type public.price_types;
  target_carrier public.one_c_delivery_carriers;
  resolved_contract_ref text;
  resolved_price_type_ref text;
  resolved_currency_ref text;
  resolved_counterparty_ref text;
  cash_qualification jsonb;
  business_date date := (now() at time zone 'Europe/Chisinau')::date;
begin
  select * into target_order from public.partner_orders where submission_key = target_submission_key;
  if target_order.id is not null then
    if target_order.submitted_by <> auth.uid() then
      raise exception 'Order submission key is not available.' using errcode = '42501';
    end if;
    if target_order.request_fingerprint is distinct from target_request_fingerprint then
      raise exception 'ORDER_SUBMISSION_FINGERPRINT_CONFLICT' using errcode = 'PT409';
    end if;
    return target_order;
  end if;

  select * into target_cart from public.carts
  where id = target_cart_id and created_by = auth.uid() for update;
  if target_cart.id is null or target_cart.status <> 'active'
    or not public.can_manage_partner_order_company(target_cart.company_id) then
    raise exception 'Cart is not available for submission.' using errcode = '42501';
  end if;
  if target_expected_intent_version is null or target_cart.intent_version <> target_expected_intent_version then
    raise exception 'CART_INTENT_VERSION_CONFLICT' using errcode = 'PT409';
  end if;
  if target_delivery_date < business_date or target_payment_date < business_date
    or target_payment_method not in ('cashless', 'cash')
    or target_fulfillment_method not in ('pickup', 'delivery')
    or (target_fulfillment_method = 'pickup' and target_carrier_id is not null)
    or (target_fulfillment_method = 'delivery' and target_carrier_id is null)
    or char_length(target_request_fingerprint) <> 64
    or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 then
    raise exception 'Order submission is invalid.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
    group by item.product_id having count(*) > 1
  ) then
    raise exception 'Order submission contains duplicate products.' using errcode = '23514';
  end if;
  if exists (
    (select item.product_id, item.quantity from public.cart_items item where item.cart_id = target_cart.id
     except select submitted.product_id, submitted.quantity from jsonb_to_recordset(target_items) submitted(product_id uuid, quantity integer))
    union all
    (select submitted.product_id, submitted.quantity from jsonb_to_recordset(target_items) submitted(product_id uuid, quantity integer)
     except select item.product_id, item.quantity from public.cart_items item where item.cart_id = target_cart.id)
  ) then
    raise exception 'CART_INTENT_VERSION_CONFLICT' using errcode = 'PT409';
  end if;

  select * into target_company from public.partner_companies
  where id = target_cart.company_id and status = 'active';
  if target_company.id is null then
    raise exception 'Order company mapping is unavailable.' using errcode = '23514';
  end if;

  resolved_counterparty_ref := lower(btrim(coalesce(target_company.external_1c_id, '')));
  if target_payment_method = 'cashless' then
    resolved_contract_ref := lower(btrim(coalesce(target_company.external_1c_contract_id, '')));
  else
    select lower(btrim(mapping.contract_external_1c_id)) into resolved_contract_ref
    from public.partner_company_cash_contract_mappings mapping
    where mapping.company_id = target_company.id and mapping.active and mapping.contract_role = 'cash';
    cash_qualification := public.qualify_partner_cash_contract_candidate(target_company.id, resolved_contract_ref);
    if not coalesce((cash_qualification->>'qualified')::boolean, false) then
      raise exception 'Order cash contract mapping is invalid.' using errcode = '23514';
    end if;
  end if;

  select * into target_contract from public.one_c_counterparty_contracts candidate
  where candidate.is_published and lower(candidate.external_1c_id) = resolved_contract_ref
  order by candidate.synchronized_at desc, candidate.id limit 1;
  resolved_price_type_ref := lower(btrim(coalesce(target_contract.price_type_external_1c_id, '')));

  select * into target_price_type from public.price_types candidate
  where lower(candidate.external_ref) = resolved_price_type_ref limit 1;
  resolved_currency_ref := lower(btrim(coalesce(target_price_type.currency_ref, '')));

  if resolved_counterparty_ref = '' or coalesce(resolved_contract_ref, '') = ''
    or resolved_price_type_ref = '' or resolved_currency_ref = ''
    or target_contract.id is null or not target_contract.is_active or target_contract.is_deleted
    or lower(target_contract.counterparty_external_1c_id) <> resolved_counterparty_ref
    or encode(convert_to(lower(btrim(coalesce(target_contract.contract_type, ''))), 'UTF8'), 'hex') <>
      'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
    or lower(coalesce(target_contract.organization_external_1c_id, '')) <>
      '4643d461-aa49-4b70-9486-a59f80ee6af8'
    or target_price_type.id is null or not target_price_type.is_active
    or target_price_type.currency_status <> 'resolved'
    or (target_payment_method = 'cash' and
      lower(coalesce(target_contract.contract_currency_external_1c_id, '')) <> resolved_currency_ref)
    or (target_payment_method = 'cashless' and resolved_price_type_ref <>
      lower(btrim(coalesce(target_company.external_1c_price_type_id, '')))) then
    raise exception 'Order contract mapping is invalid.' using errcode = '23514';
  end if;

  if lower(btrim(coalesce(target_payload->'partnerCompanyReference'->>'externalId', ''))) <> resolved_counterparty_ref
    or lower(btrim(coalesce(target_payload->'priceTypeReference'->>'externalId', ''))) <> resolved_price_type_ref
    or lower(btrim(coalesce(target_payload->'contractReference'->>'externalId', ''))) <> resolved_contract_ref
    or lower(btrim(coalesce(target_payload->'currencyReference'->>'externalId', ''))) <> resolved_currency_ref
    or target_payload->>'paymentMethod' is distinct from target_payment_method
    or target_payload->>'plannedPaymentDate' is distinct from target_payment_date::text
    or target_payload->>'fulfillmentMethod' is distinct from target_fulfillment_method then
    raise exception 'Order commercial mapping is invalid.' using errcode = '23514';
  end if;

  if target_fulfillment_method = 'delivery' then
    select * into target_carrier from public.one_c_delivery_carriers carrier
    where carrier.id = target_carrier_id and carrier.is_published
      and carrier.is_active and not carrier.is_deleted;
    if target_carrier.id is null
      or lower(btrim(coalesce(target_payload->'carrierReference'->>'externalId', ''))) <>
        lower(target_carrier.external_1c_id) then
      raise exception 'Order carrier mapping is invalid.' using errcode = '23514';
    end if;
  elsif target_payload->'carrierReference' is not null
    and target_payload->'carrierReference' <> 'null'::jsonb then
    raise exception 'Pickup cannot include a carrier.' using errcode = '23514';
  end if;

  insert into public.partner_orders(
    company_id, submitted_by, cart_id, submission_key, submission_attempt_id,
    requested_delivery_date, request_fingerprint, payload_snapshot
  ) values (
    target_cart.company_id, auth.uid(), target_cart.id, target_submission_key, target_attempt_id,
    target_delivery_date, target_request_fingerprint, target_payload
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
