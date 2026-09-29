begin;
set local lock_timeout = '5s';

alter table public.partner_orders
  add column if not exists pricing_mode text not null default 'rate_999_default';
alter table public.partner_orders
  drop constraint if exists partner_orders_pricing_mode_check;
alter table public.partner_orders
  add constraint partner_orders_pricing_mode_check
  check (pricing_mode in ('rate_999_default', 'rate_113_online'));

alter table public.partner_order_items
  add column if not exists exchange_rate_source_type text;
alter table public.partner_order_items
  drop constraint if exists partner_order_items_mdl_snapshot_evidence_check;
alter table public.partner_order_items
  add constraint partner_order_items_mdl_snapshot_evidence_check check (
    (source_unit_price is null and source_currency_code is null and applied_exchange_rate is null
      and exchange_rate_id is null and exchange_rate_purpose is null and exchange_rate_source_type is null
      and exchange_rate_effective_at is null and exchange_rate_published_at is null)
    or (source_unit_price > 0 and source_currency_code in ('USD', 'MDL') and currency_code = 'MDL'
      and partner_unit_price > 0 and (
        (source_currency_code = 'MDL' and source_unit_price = partner_unit_price
          and applied_exchange_rate is null and exchange_rate_id is null and exchange_rate_purpose is null
          and exchange_rate_source_type is null and exchange_rate_effective_at is null and exchange_rate_published_at is null)
        or (source_currency_code = 'USD' and applied_exchange_rate > 0 and exchange_rate_id is not null
          and exchange_rate_purpose in ('retail_price_usd_to_mdl', 'partner_price_usd_to_mdl')
          and exchange_rate_source_type in ('manual_from_1c', 'one_c_automatic') and exchange_rate_effective_at is not null
          and exchange_rate_published_at is not null
          and partner_unit_price = round(source_unit_price * applied_exchange_rate, 0))
      ))
  );

create or replace function public.set_partner_order_pricing_mode_from_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  new.pricing_mode := coalesce(new.payload_snapshot->>'pricingMode', 'rate_999_default');
  if new.pricing_mode not in ('rate_999_default', 'rate_113_online') then
    raise exception 'Invalid order pricing mode.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists partner_order_pricing_mode_snapshot on public.partner_orders;
create trigger partner_order_pricing_mode_snapshot before insert or update of payload_snapshot, pricing_mode
  on public.partner_orders for each row execute function public.set_partner_order_pricing_mode_from_snapshot();
create or replace function public.validate_partner_order_submission_v5(
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
  resolved_document_currency_ref text;
  resolved_document_currency_code text;
  resolved_source_currency_code text;
  selected_pricing_mode text;
  expected_rate_purpose text;
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

  selected_pricing_mode := coalesce(target_payload->>'pricingMode', 'rate_999_default');
  expected_rate_purpose := case selected_pricing_mode
    when 'rate_113_online' then 'partner_price_usd_to_mdl'
    when 'rate_999_default' then 'retail_price_usd_to_mdl'
    else null end;
  if expected_rate_purpose is null
    or (selected_pricing_mode = 'rate_113_online' and
      (target_payload->>'paymentIntent' is distinct from 'pay_now' or target_payment_method <> 'cashless'))
    or (selected_pricing_mode = 'rate_999_default' and target_payload->>'paymentIntent' is distinct from 'pay_later') then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED', 'stage', 'pricing_mode_validation');
  end if;

  if char_length(coalesce(target_request_fingerprint, '')) <> 64
    or coalesce(jsonb_typeof(target_payload), 'null') <> 'object'
    or coalesce(jsonb_typeof(target_items), 'null') <> 'array'
    or coalesce(jsonb_typeof(target_payload->'items'), 'null') <> 'array'
    or jsonb_array_length(target_items) = 0 then
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
    qualification := public.qualify_partner_contract_candidate(target_company.id, resolved_contract_ref);
  else
    select lower(btrim(mapping.contract_external_1c_id))
    into resolved_contract_ref
    from public.partner_company_cash_contract_mappings mapping
    where mapping.company_id = target_company.id
      and mapping.active
      and mapping.contract_role = 'cash';
    qualification := public.qualify_partner_cash_contract_candidate(target_company.id, resolved_contract_ref);
  end if;

  if not coalesce((qualification->>'qualified')::boolean, false) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_CONTRACT_INVALID',
      'stage', 'contract_mapping_validation', 'diagnosticCode', qualification->>'code');
  end if;

  resolved_price_type_ref := lower(btrim(coalesce(qualification->>'priceTypeRef', '')));
  resolved_document_currency_ref := lower(btrim(coalesce(qualification->>'settlementCurrencyRef', '')));
  resolved_document_currency_code := upper(btrim(coalesce(qualification->>'settlementCurrencyCode', '')));
  resolved_source_currency_code := upper(btrim(coalesce(qualification->>'publishedPriceCurrencyCode', '')));

  if resolved_counterparty_ref = ''
    or coalesce(resolved_contract_ref, '') = ''
    or resolved_price_type_ref = ''
    or resolved_document_currency_ref = ''
    or resolved_document_currency_code <> 'MDL'
    or resolved_source_currency_code not in ('USD', 'MDL')
    or (target_payment_method = 'cashless' and resolved_price_type_ref <>
      lower(btrim(coalesce(target_company.external_1c_price_type_id, '')))) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_CONTRACT_INVALID',
      'stage', 'contract_mapping_validation');
  end if;

  if lower(btrim(coalesce(target_payload->'partnerCompanyReference'->>'externalId', ''))) <> resolved_counterparty_ref
    or lower(btrim(coalesce(target_payload->'priceTypeReference'->>'externalId', ''))) <> resolved_price_type_ref
    or lower(btrim(coalesce(target_payload->'contractReference'->>'externalId', ''))) <> resolved_contract_ref
    or lower(btrim(coalesce(target_payload->'currencyReference'->>'externalId', ''))) <> resolved_document_currency_ref
    or upper(btrim(coalesce(target_payload->>'currency', ''))) <> 'MDL'
    or target_payload->>'paymentMethod' is distinct from target_payment_method
    or target_payload->>'pricingMode' is distinct from selected_pricing_mode
    or target_payload->>'plannedPaymentDate' is distinct from target_payment_date::text
    or target_payload->>'fulfillmentMethod' is distinct from target_fulfillment_method then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'commercial_payload_validation');
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(
      product_id uuid, quantity integer, partner_unit_price numeric, currency_code text,
      line_total numeric, source_unit_price numeric, source_currency_code text,
      applied_exchange_rate numeric, exchange_rate_id uuid, exchange_rate_purpose text, exchange_rate_source_type text,
      exchange_rate_effective_at timestamptz, exchange_rate_published_at timestamptz
    )
    left join public.commercial_exchange_rates rate on rate.id = item.exchange_rate_id
    where item.quantity is null or item.quantity < 1
      or item.partner_unit_price is null or item.partner_unit_price <= 0
      or upper(coalesce(item.currency_code, '')) <> 'MDL'
      or item.line_total is distinct from round(item.partner_unit_price * item.quantity, 2)
      or item.source_unit_price is null or item.source_unit_price <= 0
      or upper(coalesce(item.source_currency_code, '')) <> resolved_source_currency_code
      or (
        resolved_source_currency_code = 'MDL' and (
          item.partner_unit_price is distinct from item.source_unit_price
          or item.applied_exchange_rate is not null or item.exchange_rate_id is not null
          or item.exchange_rate_purpose is not null or item.exchange_rate_source_type is not null or item.exchange_rate_effective_at is not null
          or item.exchange_rate_published_at is not null
        )
      )
      or (
        resolved_source_currency_code = 'USD' and (
          item.applied_exchange_rate is null or item.applied_exchange_rate <= 0
          or item.exchange_rate_id is null
          or item.exchange_rate_purpose <> expected_rate_purpose
          or item.partner_unit_price is distinct from round(item.source_unit_price * item.applied_exchange_rate, 0)
          or rate.id is null or rate.purpose <> expected_rate_purpose
          or item.exchange_rate_source_type <> 'one_c_automatic'
          or rate.source_type <> 'one_c_automatic'
          or not rate.is_active or not rate.is_published
          or rate.rate is distinct from item.applied_exchange_rate
          or rate.effective_at is distinct from item.exchange_rate_effective_at
          or rate.published_at is distinct from item.exchange_rate_published_at
        )
      )
  ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'mdl_pricing_validation');
  end if;

  if jsonb_array_length(target_payload->'items') <> jsonb_array_length(target_items)
    or (target_payload->>'documentTotal')::numeric is distinct from (
      select round(sum(item.line_total), 2)
      from jsonb_to_recordset(target_items) item(line_total numeric)
    )
    or exists (
      select 1
      from jsonb_array_elements(target_items) with ordinality submitted(item, line_number)
      left join jsonb_array_elements(target_payload->'items') with ordinality payload(item, line_number)
        using (line_number)
      where lower(coalesce(payload.item->'productReference'->>'externalId', '')) <>
          lower(coalesce(submitted.item->>'external_product_ref', ''))
        or (payload.item->>'quantity')::integer is distinct from (submitted.item->>'quantity')::integer
        or upper(coalesce(payload.item->'price'->>'currency', '')) <> 'MDL'
        or (payload.item->'price'->>'amount')::numeric is distinct from
          (submitted.item->>'partner_unit_price')::numeric
        or (payload.item->>'lineTotal')::numeric is distinct from
          (submitted.item->>'line_total')::numeric
    ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'mdl_payload_consistency_validation');
  end if;

  if target_fulfillment_method = 'delivery' then
    select * into target_carrier
    from public.one_c_delivery_carriers carrier
    where carrier.id = target_carrier_id
      and carrier.is_published and carrier.is_active and not carrier.is_deleted;
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

  return jsonb_build_object('valid', true, 'code', 'ORDER_PREPARATION_VALID',
    'stage', 'completed', 'paymentMethod', target_payment_method,
    'paymentDate', target_payment_date, 'fulfillmentMethod', target_fulfillment_method,
    'requestedDeliveryDate', target_delivery_date, 'currencyCode', 'MDL');
end;
$$;
comment on column public.partner_orders.pricing_mode is
  'Immutable checkout pricing mode captured with the order payload snapshot.';
comment on column public.partner_order_items.exchange_rate_source_type is
  'Commercial rate source captured with the governed order line price.';
commit;
