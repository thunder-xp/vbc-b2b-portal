begin;

alter table public.one_c_counterparties
  add column if not exists counterparty_type_code text null,
  add column if not exists government_body_type_code text null;

create table public.one_c_delivery_carriers (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.one_c_counterparty_directory_syncs(sync_id) on delete cascade,
  external_1c_id text not null,
  code text null,
  name text not null,
  is_active boolean not null,
  is_deleted boolean not null,
  is_published boolean not null default false,
  synchronized_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(sync_id, external_1c_id),
  constraint one_c_delivery_carriers_guid_check check (
    external_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and external_1c_id <> '00000000-0000-0000-0000-000000000000'
  )
);

create index one_c_delivery_carriers_published_idx
  on public.one_c_delivery_carriers(name, id)
  where is_published and is_active and not is_deleted;

alter table public.one_c_delivery_carriers enable row level security;
revoke all on table public.one_c_delivery_carriers from public, anon, authenticated;
grant select, insert, update, delete on table public.one_c_delivery_carriers to service_role;

create table public.partner_company_cash_contract_mappings (
  company_id uuid primary key references public.partner_companies(id) on delete restrict,
  contract_external_1c_id text not null,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  updated_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_company_cash_contract_guid_check check (
    contract_external_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and contract_external_1c_id <> '00000000-0000-0000-0000-000000000000'
  )
);

create table public.partner_company_cash_contract_mapping_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  previous_contract_ref text null,
  new_contract_ref text not null,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  correlation_id uuid not null unique,
  mapping_version integer not null check (mapping_version > 0),
  occurred_at timestamptz not null default now()
);

create index partner_company_cash_contract_events_company_idx
  on public.partner_company_cash_contract_mapping_events(company_id, occurred_at desc, id desc);

create or replace function public.prevent_cash_contract_mapping_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Cash contract mapping events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_cash_contract_mapping_event_mutation
before update or delete on public.partner_company_cash_contract_mapping_events
for each row execute function public.prevent_cash_contract_mapping_event_mutation();

alter table public.partner_company_cash_contract_mappings enable row level security;
alter table public.partner_company_cash_contract_mapping_events enable row level security;
revoke all on table public.partner_company_cash_contract_mappings from public, anon, authenticated;
revoke all on table public.partner_company_cash_contract_mapping_events from public, anon, authenticated;
grant select, insert, update on table public.partner_company_cash_contract_mappings to service_role;
grant select, insert on table public.partner_company_cash_contract_mapping_events to service_role;
revoke all on function public.prevent_cash_contract_mapping_event_mutation() from public, anon, authenticated;

alter table public.partner_orders
  add column if not exists request_fingerprint text null;

create unique index partner_orders_submission_fingerprint_idx
  on public.partner_orders(submission_key, request_fingerprint)
  where request_fingerprint is not null;

create table public.partner_order_export_diagnostics (
  order_id uuid primary key references public.partner_orders(id) on delete restrict,
  payment_method text not null check (payment_method in ('cashless', 'cash')),
  planned_payment_date date not null,
  fulfillment_method text not null check (fulfillment_method in ('pickup', 'delivery')),
  carrier_id uuid null references public.one_c_delivery_carriers(id) on delete restrict,
  resolved_contract_ref text not null,
  resolved_price_type_ref text not null,
  resolved_counterparty_ref text not null,
  request_fingerprint text not null,
  read_back_verified boolean not null default false,
  read_back_result jsonb null,
  created_at timestamptz not null default now(),
  verified_at timestamptz null,
  constraint partner_order_export_carrier_check check (
    (fulfillment_method = 'pickup' and carrier_id is null)
    or (fulfillment_method = 'delivery' and carrier_id is not null)
  )
);

alter table public.partner_order_export_diagnostics enable row level security;
revoke all on table public.partner_order_export_diagnostics from public, anon, authenticated;
grant select, insert, update on table public.partner_order_export_diagnostics to service_role;

create or replace function public.map_admin_partner_company_cash_contract(
  p_company_id uuid,
  p_contract_ref text,
  p_expected_version integer,
  p_reason text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  company public.partner_companies%rowtype;
  current_mapping public.partner_company_cash_contract_mappings%rowtype;
  contract public.one_c_counterparty_contracts%rowtype;
  normalized_contract_ref text := lower(btrim(coalesce(p_contract_ref, '')));
  next_version integer;
begin
  if actor_id is null or not public.has_internal_permission('admin.partner_integrity.manage') then
    raise exception 'Cash contract mapping is not allowed.' using errcode = '42501';
  end if;
  if p_company_id is null or p_correlation_id is null
    or p_expected_version is null or p_expected_version < 0
    or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Invalid cash contract mapping request.' using errcode = '22023';
  end if;

  select * into company from public.partner_companies where id = p_company_id for update;
  if company.id is null then
    return jsonb_build_object('code', 'CASH_CONTRACT_MAPPING_FAILED', 'correlationId', p_correlation_id);
  end if;
  select * into current_mapping from public.partner_company_cash_contract_mappings
  where company_id = company.id for update;
  if coalesce(current_mapping.version, 0) <> p_expected_version then
    return jsonb_build_object(
      'code', 'CASH_CONTRACT_MAPPING_CONFLICT',
      'correlationId', p_correlation_id,
      'version', coalesce(current_mapping.version, 0)
    );
  end if;
  if normalized_contract_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or normalized_contract_ref = '00000000-0000-0000-0000-000000000000' then
    return jsonb_build_object('code', 'CASH_CONTRACT_NOT_FOUND', 'correlationId', p_correlation_id);
  end if;

  select * into contract
  from public.one_c_counterparty_contracts candidate
  where lower(candidate.external_1c_id) = normalized_contract_ref and candidate.is_published
  order by candidate.synchronized_at desc, candidate.id
  limit 1;
  if contract.id is null then
    return jsonb_build_object('code', 'CASH_CONTRACT_NOT_FOUND', 'correlationId', p_correlation_id);
  end if;
  if lower(contract.counterparty_external_1c_id) <> lower(coalesce(company.external_1c_id, '')) then
    return jsonb_build_object('code', 'CASH_CONTRACT_NOT_OWNED_BY_COMPANY', 'correlationId', p_correlation_id);
  end if;
  if not contract.is_active or contract.is_deleted then
    return jsonb_build_object('code', 'CASH_CONTRACT_INACTIVE', 'correlationId', p_correlation_id);
  end if;
  if encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') <>
    'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc' then
    return jsonb_build_object('code', 'CASH_CONTRACT_INVALID_TYPE', 'correlationId', p_correlation_id);
  end if;
  if lower(coalesce(contract.organization_external_1c_id, '')) <>
    '4643d461-aa49-4b70-9486-a59f80ee6af8' then
    return jsonb_build_object('code', 'CASH_CONTRACT_ORGANIZATION_MISMATCH', 'correlationId', p_correlation_id);
  end if;
  if lower(coalesce(contract.price_type_external_1c_id, '')) <>
    lower(coalesce(company.external_1c_price_type_id, '')) then
    return jsonb_build_object('code', 'CASH_CONTRACT_PRICE_TYPE_MISMATCH', 'correlationId', p_correlation_id);
  end if;

  if current_mapping.company_id is not null
    and current_mapping.active
    and lower(current_mapping.contract_external_1c_id) = normalized_contract_ref then
    return jsonb_build_object(
      'code', 'CASH_CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
      'contractRef', normalized_contract_ref, 'version', current_mapping.version, 'unchanged', true
    );
  end if;

  next_version := coalesce(current_mapping.version, 0) + 1;
  insert into public.partner_company_cash_contract_mappings(
    company_id, contract_external_1c_id, version, active, reason, created_by, updated_by
  ) values (
    company.id, normalized_contract_ref, next_version, true, btrim(p_reason), actor_id, actor_id
  ) on conflict (company_id) do update set
    contract_external_1c_id = excluded.contract_external_1c_id,
    version = excluded.version,
    active = true,
    reason = excluded.reason,
    updated_by = actor_id,
    updated_at = now();

  insert into public.partner_company_cash_contract_mapping_events(
    company_id, previous_contract_ref, new_contract_ref, actor_user_id,
    reason, correlation_id, mapping_version
  ) values (
    company.id, current_mapping.contract_external_1c_id, normalized_contract_ref,
    actor_id, btrim(p_reason), p_correlation_id, next_version
  );

  return jsonb_build_object(
    'code', 'CASH_CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
    'contractRef', normalized_contract_ref, 'version', next_version, 'unchanged', false
  );
exception
  when unique_violation then
    select event.new_contract_ref, event.mapping_version
      into normalized_contract_ref, next_version
    from public.partner_company_cash_contract_mapping_events event
    where event.correlation_id = p_correlation_id;
    if found then
      return jsonb_build_object(
        'code', 'CASH_CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
        'contractRef', normalized_contract_ref, 'version', next_version, 'unchanged', true
      );
    end if;
    raise;
end;
$$;

revoke all on function public.map_admin_partner_company_cash_contract(uuid, text, integer, text, uuid)
  from public, anon;
grant execute on function public.map_admin_partner_company_cash_contract(uuid, text, integer, text, uuid)
  to authenticated;

create or replace function public.get_partner_checkout_configuration(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with company as (
    select * from public.partner_companies
    where id = p_company_id and status = 'active'
  ), counterparty as (
    select source.*
    from company
    join lateral (
      select candidate.* from public.one_c_counterparties candidate
      where candidate.is_published
        and lower(candidate.external_1c_id) = lower(company.external_1c_id)
      order by candidate.synchronized_at desc, candidate.id
      limit 1
    ) source on true
  ), cashless_contract as (
    select candidate.*
    from company
    join lateral (
      select contract.* from public.one_c_counterparty_contracts contract
      where contract.is_published
        and lower(contract.external_1c_id) = lower(company.external_1c_contract_id)
      order by contract.synchronized_at desc, contract.id
      limit 1
    ) candidate on true
  ), cash_contract as (
    select candidate.*
    from company
    join public.partner_company_cash_contract_mappings mapping
      on mapping.company_id = company.id and mapping.active
    join lateral (
      select contract.* from public.one_c_counterparty_contracts contract
      where contract.is_published
        and lower(contract.external_1c_id) = lower(mapping.contract_external_1c_id)
      order by contract.synchronized_at desc, contract.id
      limit 1
    ) candidate on true
  ), price_type as (
    select price.* from company
    join public.price_types price
      on lower(price.external_ref) = lower(company.external_1c_price_type_id)
    limit 1
  )
  select jsonb_build_object(
    'companyId', company.id,
    'counterpartyTypeCode', counterparty.counterparty_type_code,
    'governmentBodyTypeCode', counterparty.government_body_type_code,
    'counterpartyActive', counterparty.is_active and not counterparty.is_deleted,
    'counterpartyRef', company.external_1c_id,
    'priceTypeRef', company.external_1c_price_type_id,
    'currencyRef', price_type.currency_ref,
    'currencyCode', price_type.currency_code,
    'cashless', case when cashless_contract.id is null then null else jsonb_build_object(
      'contractRef', cashless_contract.external_1c_id,
      'name', cashless_contract.name,
      'number', cashless_contract.contract_number,
      'active', cashless_contract.is_active and not cashless_contract.is_deleted,
      'contractType', cashless_contract.contract_type,
      'organizationRef', cashless_contract.organization_external_1c_id,
      'priceTypeRef', cashless_contract.price_type_external_1c_id
    ) end,
    'cash', case when cash_contract.id is null then null else jsonb_build_object(
      'contractRef', cash_contract.external_1c_id,
      'name', cash_contract.name,
      'number', cash_contract.contract_number,
      'active', cash_contract.is_active and not cash_contract.is_deleted,
      'contractType', cash_contract.contract_type,
      'organizationRef', cash_contract.organization_external_1c_id,
      'priceTypeRef', cash_contract.price_type_external_1c_id
    ) end,
    'carriers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', carrier.id,
        'name', carrier.name,
        'externalRef', carrier.external_1c_id
      ) order by carrier.name, carrier.id)
      from public.one_c_delivery_carriers carrier
      where carrier.is_published and carrier.is_active and not carrier.is_deleted
    ), '[]'::jsonb)
  )
  from company
  left join counterparty on true
  left join cashless_contract on true
  left join cash_contract on true
  left join price_type on true;
$$;

revoke all on function public.get_partner_checkout_configuration(uuid)
  from public, anon, authenticated;
grant execute on function public.get_partner_checkout_configuration(uuid) to service_role;

create or replace function public.begin_partner_order_submission_v3(
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
  target_carrier public.one_c_delivery_carriers;
  resolved_contract_ref text;
  resolved_price_type_ref text;
  resolved_counterparty_ref text;
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

  select * into target_company
  from public.partner_companies
  where id = target_cart.company_id and status = 'active';
  if target_company.id is null then
    raise exception 'Order company mapping is unavailable.' using errcode = '23514';
  end if;

  resolved_counterparty_ref := lower(btrim(coalesce(target_company.external_1c_id, '')));
  resolved_price_type_ref := lower(btrim(coalesce(target_company.external_1c_price_type_id, '')));
  resolved_contract_ref := case
    when target_payment_method = 'cashless'
      then lower(btrim(coalesce(target_company.external_1c_contract_id, '')))
    else (
      select lower(btrim(mapping.contract_external_1c_id))
      from public.partner_company_cash_contract_mappings mapping
      where mapping.company_id = target_company.id and mapping.active
    )
  end;

  if resolved_counterparty_ref = '' or resolved_price_type_ref = '' or coalesce(resolved_contract_ref, '') = ''
    or lower(btrim(coalesce(target_payload->'partnerCompanyReference'->>'externalId', ''))) <> resolved_counterparty_ref
    or lower(btrim(coalesce(target_payload->'priceTypeReference'->>'externalId', ''))) <> resolved_price_type_ref
    or lower(btrim(coalesce(target_payload->'contractReference'->>'externalId', ''))) <> resolved_contract_ref
    or target_payload->>'paymentMethod' is distinct from target_payment_method
    or target_payload->>'plannedPaymentDate' is distinct from target_payment_date::text
    or target_payload->>'fulfillmentMethod' is distinct from target_fulfillment_method then
    raise exception 'Order commercial mapping is invalid.' using errcode = '23514';
  end if;

  select * into target_contract
  from public.one_c_counterparty_contracts candidate
  where candidate.is_published
    and lower(candidate.external_1c_id) = resolved_contract_ref
  order by candidate.synchronized_at desc, candidate.id
  limit 1;
  if target_contract.id is null
    or not target_contract.is_active or target_contract.is_deleted
    or lower(target_contract.counterparty_external_1c_id) <> resolved_counterparty_ref
    or encode(convert_to(lower(btrim(coalesce(target_contract.contract_type, ''))), 'UTF8'), 'hex') <>
      'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
    or lower(coalesce(target_contract.organization_external_1c_id, '')) <>
      '4643d461-aa49-4b70-9486-a59f80ee6af8'
    or lower(coalesce(target_contract.price_type_external_1c_id, '')) <> resolved_price_type_ref then
    raise exception 'Order contract mapping is invalid.' using errcode = '23514';
  end if;

  if target_fulfillment_method = 'delivery' then
    select * into target_carrier
    from public.one_c_delivery_carriers carrier
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

revoke all on function public.begin_partner_order_submission_v3(
  uuid, bigint, uuid, uuid, date, text, date, text, uuid, text, jsonb, jsonb
) from public, anon;
grant execute on function public.begin_partner_order_submission_v3(
  uuid, bigint, uuid, uuid, date, text, date, text, uuid, text, jsonb, jsonb
) to authenticated;

create or replace function public.complete_partner_order_submission_v3(
  target_order_id uuid,
  one_c_ref text,
  one_c_number text,
  one_c_date timestamptz,
  one_c_status text,
  confirmed_document_total numeric,
  confirmed_currency_code text,
  confirmed_contract_number text,
  target_read_back_result jsonb
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.partner_orders;
begin
  result := public.complete_partner_order_submission_v2(
    target_order_id, one_c_ref, one_c_number, one_c_date, one_c_status,
    confirmed_document_total, confirmed_currency_code, confirmed_contract_number
  );
  update public.partner_order_export_diagnostics
  set read_back_verified = true,
      read_back_result = target_read_back_result,
      verified_at = coalesce(verified_at, now())
  where order_id = result.id;
  return result;
end;
$$;

revoke all on function public.complete_partner_order_submission_v3(
  uuid, text, text, timestamptz, text, numeric, text, text, jsonb
) from public, anon;
grant execute on function public.complete_partner_order_submission_v3(
  uuid, text, text, timestamptz, text, numeric, text, text, jsonb
) to authenticated;

create or replace function public.get_admin_partner_order_export_diagnostic(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when not public.has_internal_permission('admin.orders.view') then null
    else jsonb_build_object(
      'orderId', diagnostic.order_id,
      'paymentMethod', diagnostic.payment_method,
      'plannedPaymentDate', diagnostic.planned_payment_date,
      'fulfillmentMethod', diagnostic.fulfillment_method,
      'carrier', case when carrier.id is null then null else jsonb_build_object(
        'name', carrier.name,
        'externalRef', carrier.external_1c_id
      ) end,
      'contract', jsonb_build_object(
        'name', contract.name,
        'number', contract.contract_number,
        'externalRef', diagnostic.resolved_contract_ref
      ),
      'priceType', jsonb_build_object(
        'name', price_type.name,
        'externalRef', diagnostic.resolved_price_type_ref
      ),
      'counterpartyRef', diagnostic.resolved_counterparty_ref,
      'readBackVerified', diagnostic.read_back_verified,
      'readBackResult', diagnostic.read_back_result,
      'verifiedAt', diagnostic.verified_at
    )
  end
  from public.partner_order_export_diagnostics diagnostic
  left join public.one_c_delivery_carriers carrier on carrier.id = diagnostic.carrier_id
  left join lateral (
    select source.name, source.contract_number
    from public.one_c_counterparty_contracts source
    where source.is_published
      and lower(source.external_1c_id) = lower(diagnostic.resolved_contract_ref)
    order by source.synchronized_at desc, source.id
    limit 1
  ) contract on true
  left join public.price_types price_type
    on lower(price_type.external_ref) = lower(diagnostic.resolved_price_type_ref)
  where diagnostic.order_id = p_order_id;
$$;

revoke all on function public.get_admin_partner_order_export_diagnostic(uuid)
  from public, anon;
grant execute on function public.get_admin_partner_order_export_diagnostic(uuid)
  to authenticated;

create or replace function public.get_admin_operations_list(
  p_view text,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  required_permission text;
  page_number integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
begin
  required_permission := case p_view
    when 'orders' then 'admin.orders.view'
    when 'shipments' then 'admin.shipments.view'
    when 'reservations' then 'reservations.review'
    else null
  end;
  if required_permission is null
    or not public.has_internal_permission(required_permission) then
    raise exception 'Operational administration access is not allowed.'
      using errcode = '42501';
  end if;

  if p_view in ('orders', 'shipments') then
    return (
      with filtered as (
        select history.*, company.display_name company_name,
          count(*) over() total_count,
          case when diagnostic.order_id is null then null else jsonb_build_object(
            'paymentMethod', diagnostic.payment_method,
            'plannedPaymentDate', diagnostic.planned_payment_date,
            'fulfillmentMethod', diagnostic.fulfillment_method,
            'carrier', carrier.name,
            'contract', coalesce(contract.contract_number, contract.name),
            'priceType', price_type.name,
            'readBackVerified', diagnostic.read_back_verified,
            'readBackResult', diagnostic.read_back_result,
            'verifiedAt', diagnostic.verified_at
          ) end export_diagnostic
        from public.partner_order_history history
        join public.partner_companies company on company.id = history.company_id
        left join public.partner_order_export_diagnostics diagnostic
          on diagnostic.order_id = history.portal_order_id
        left join public.one_c_delivery_carriers carrier on carrier.id = diagnostic.carrier_id
        left join lateral (
          select source.name, source.contract_number
          from public.one_c_counterparty_contracts source
          where source.is_published
            and lower(source.external_1c_id) = lower(diagnostic.resolved_contract_ref)
          order by source.synchronized_at desc, source.id
          limit 1
        ) contract on true
        left join public.price_types price_type
          on lower(price_type.external_ref) = lower(diagnostic.resolved_price_type_ref)
        where p_view = 'orders'
          or (
            history.partner_visible
            and not history.one_c_deletion_mark
            and history.one_c_delivery_date is not null
          )
      ),
      page_rows as (
        select * from filtered
        order by case when p_view = 'shipments' then one_c_delivery_date end,
          one_c_document_date desc nulls last, id
        limit page_size offset (page_number - 1) * page_size
      )
      select jsonb_build_object(
        'records', coalesce(jsonb_agg(jsonb_build_object(
          'id', id,
          'company', company_name,
          'reference', coalesce(external_1c_order_number, portal_order_id::text),
          'date', one_c_document_date,
          'plannedDate', one_c_delivery_date,
          'status', coalesce(one_c_state_code, 'unknown'),
          'posted', one_c_posted,
          'positions', position_count,
          'units', total_unit_count,
          'syncAt', one_c_last_synced_at,
          'warning', hidden_reason,
          'exportDiagnostic', export_diagnostic
        ) order by case when p_view = 'shipments' then one_c_delivery_date end,
          one_c_document_date desc nulls last), '[]'::jsonb),
        'total', coalesce(max(total_count), 0),
        'page', page_number,
        'pageSize', page_size
      ) from page_rows
    );
  end if;

  return (
    with filtered as (
      select request.*, company.display_name company_name,
        count(*) over() total_count,
        (select count(*) from public.reservation_request_items item
          where item.reservation_request_id = request.id) item_count
      from public.reservation_requests request
      join public.partner_companies company on company.id = request.company_id
    ),
    page_rows as (
      select * from filtered order by created_at desc, id
      limit page_size offset (page_number - 1) * page_size
    )
    select jsonb_build_object(
      'records', coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'company', company_name,
        'reference', specification_id::text, 'date', created_at,
        'plannedDate', requested_delivery_date, 'status', status,
        'posted', false, 'positions', item_count, 'units', 0,
        'syncAt', reviewed_at, 'warning', manager_comment,
        'exportDiagnostic', null
      ) order by created_at desc), '[]'::jsonb),
      'total', coalesce(max(total_count), 0),
      'page', page_number,
      'pageSize', page_size
    ) from page_rows
  );
end;
$$;

revoke all on function public.get_admin_operations_list(text, integer, integer)
  from public, anon;
grant execute on function public.get_admin_operations_list(text, integer, integer)
  to authenticated;

create or replace function public.publish_one_c_counterparty_directory(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  published_count integer;
  sync public.one_c_counterparty_directory_syncs%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Directory publication requires service role.' using errcode = '42501';
  end if;
  select * into sync from public.one_c_counterparty_directory_syncs
  where sync_id = p_sync_id and status = 'running' for update;
  if sync.sync_id is null then
    raise exception 'Active directory synchronization was not found.' using errcode = 'P0002';
  end if;
  if sync.fetched_counterparties <= 0 or sync.staged_counterparties <= 0
    or sync.duplicate_counterparty_rows <> 0
    or sync.fetched_counterparties <> sync.staged_counterparties + sync.skipped_counterparties
    or sync.pages_processed <= 0 then
    raise exception 'Directory synchronization is incomplete.' using errcode = '22023';
  end if;

  update public.one_c_counterparties set is_published = false where is_published;
  update public.one_c_counterparty_contracts set is_published = false where is_published;
  update public.one_c_counterparty_price_profiles set is_published = false where is_published;
  update public.one_c_delivery_carriers set is_published = false where is_published;

  update public.one_c_counterparties counterparty
  set is_published = true, portal_company_id = company.id, updated_at = now()
  from public.partner_companies company
  where counterparty.sync_id = p_sync_id
    and lower(company.external_1c_id) = lower(counterparty.external_1c_id);
  update public.one_c_counterparties set is_published = true, updated_at = now()
  where sync_id = p_sync_id and not is_published;
  update public.one_c_counterparty_contracts set is_published = true where sync_id = p_sync_id;
  update public.one_c_counterparty_price_profiles set is_published = true where sync_id = p_sync_id;
  update public.one_c_delivery_carriers set is_published = true where sync_id = p_sync_id;

  select count(*) into published_count from public.one_c_counterparties
  where sync_id = p_sync_id and is_published;
  update public.one_c_counterparty_directory_syncs
  set status = 'succeeded', finished_at = now(), lock_acquired_at = null,
      published_counterparties = published_count,
      portal_linked = (select count(*) from public.one_c_counterparties where sync_id = p_sync_id and portal_company_id is not null),
      updated_at = now()
  where sync_id = p_sync_id;

  return jsonb_build_object(
    'published', published_count,
    'portalLinked', (select count(*) from public.one_c_counterparties where sync_id = p_sync_id and portal_company_id is not null),
    'carriers', (select count(*) from public.one_c_delivery_carriers where sync_id = p_sync_id and is_published),
    'syncId', p_sync_id
  );
end;
$$;

revoke all on function public.publish_one_c_counterparty_directory(uuid) from public, anon, authenticated;
grant execute on function public.publish_one_c_counterparty_directory(uuid) to service_role;

comment on table public.partner_company_cash_contract_mappings is
  'Explicit governed cash-payment contract for one partner company; the primary company contract remains cashless authority.';
comment on table public.partner_order_export_diagnostics is
  'Internal-only resolved checkout semantics and verified 1C order read-back evidence.';
comment on function public.get_partner_checkout_configuration(uuid) is
  'Service-role-only bounded checkout projection; raw 1C references never cross to browser DTOs.';

commit;
