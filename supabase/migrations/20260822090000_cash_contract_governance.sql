-- Govern an explicit cash contract role without inferring payment semantics from 1C labels.

alter table public.partner_company_cash_contract_mappings
  add column if not exists contract_role text not null default 'cash';

alter table public.partner_company_cash_contract_mappings
  drop constraint if exists partner_company_cash_contract_role_check;
alter table public.partner_company_cash_contract_mappings
  add constraint partner_company_cash_contract_role_check
  check (contract_role = 'cash');

alter table public.partner_company_cash_contract_mapping_events
  alter column new_contract_ref drop not null;
alter table public.partner_company_cash_contract_mapping_events
  add column if not exists event_type text not null default 'mapped',
  add column if not exists qualification_snapshot jsonb not null default '{}'::jsonb;

alter table public.partner_company_cash_contract_mapping_events
  drop constraint if exists partner_company_cash_contract_event_type_check;
alter table public.partner_company_cash_contract_mapping_events
  add constraint partner_company_cash_contract_event_type_check
  check (event_type in ('mapped', 'changed', 'removed'));

create or replace function public.qualify_partner_cash_contract_candidate(
  p_company_id uuid,
  p_contract_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  company public.partner_companies;
  contract public.one_c_counterparty_contracts;
  price_type public.price_types;
  normalized_contract_ref text := lower(btrim(coalesce(p_contract_ref, '')));
  result_code text;
begin
  select * into company from public.partner_companies where id = p_company_id;
  if company.id is null or company.status <> 'active' then
    result_code := 'CASH_COMPANY_INACTIVE';
  elsif normalized_contract_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or normalized_contract_ref = '00000000-0000-0000-0000-000000000000' then
    result_code := 'CASH_CONTRACT_NOT_FOUND';
  else
    select * into contract
    from public.one_c_counterparty_contracts candidate
    where candidate.is_published
      and lower(candidate.external_1c_id) = normalized_contract_ref
    order by candidate.synchronized_at desc, candidate.id
    limit 1;

    if contract.id is null then
      result_code := 'CASH_CONTRACT_NOT_FOUND';
    elsif lower(contract.counterparty_external_1c_id) <> lower(coalesce(company.external_1c_id, '')) then
      result_code := 'CASH_CONTRACT_NOT_OWNED_BY_COMPANY';
    elsif not contract.is_active or contract.is_deleted then
      result_code := 'CASH_CONTRACT_INACTIVE';
    elsif encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') <>
      'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc' then
      result_code := 'CASH_CONTRACT_INVALID_TYPE';
    elsif lower(coalesce(contract.organization_external_1c_id, '')) <>
      '4643d461-aa49-4b70-9486-a59f80ee6af8' then
      result_code := 'CASH_CONTRACT_ORGANIZATION_MISMATCH';
    elsif coalesce(contract.price_type_external_1c_id, '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or lower(contract.price_type_external_1c_id) = '00000000-0000-0000-0000-000000000000' then
      result_code := 'CASH_CONTRACT_PRICE_TYPE_MISSING';
    else
      select * into price_type
      from public.price_types candidate
      where lower(candidate.external_ref) = lower(contract.price_type_external_1c_id)
      limit 1;

      if price_type.id is null or not price_type.is_active or price_type.currency_status <> 'resolved' then
        result_code := 'CASH_CONTRACT_PRICE_TYPE_INVALID';
      elsif coalesce(contract.contract_currency_external_1c_id, '') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or lower(contract.contract_currency_external_1c_id) = '00000000-0000-0000-0000-000000000000' then
        result_code := 'CASH_CONTRACT_CURRENCY_MISSING';
      elsif lower(coalesce(price_type.currency_ref, '')) <>
        lower(contract.contract_currency_external_1c_id) then
        result_code := 'CASH_CONTRACT_CURRENCY_MISMATCH';
      else
        result_code := 'CASH_CONTRACT_QUALIFIED';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'code', result_code,
    'qualified', result_code = 'CASH_CONTRACT_QUALIFIED',
    'companyId', p_company_id,
    'contractRef', nullif(normalized_contract_ref, ''),
    'priceTypeRef', contract.price_type_external_1c_id,
    'currencyRef', contract.contract_currency_external_1c_id,
    'currencyCode', price_type.currency_code
  );
end;
$$;

revoke all on function public.qualify_partner_cash_contract_candidate(uuid, text)
  from public, anon, authenticated;
grant execute on function public.qualify_partner_cash_contract_candidate(uuid, text)
  to service_role;

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
  company public.partner_companies;
  current_mapping public.partner_company_cash_contract_mappings;
  qualification jsonb;
  normalized_contract_ref text := nullif(lower(btrim(coalesce(p_contract_ref, ''))), '');
  next_version integer;
  event_kind text;
begin
  if actor_id is null or not public.has_internal_permission('admin.partner_integrity.manage') then
    raise exception 'Cash contract mapping is not permitted.' using errcode = '42501';
  end if;
  if p_expected_version < 0
    or p_correlation_id is null
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

  if normalized_contract_ref is null then
    if current_mapping.company_id is null or not current_mapping.active then
      return jsonb_build_object(
        'code', 'CASH_CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
        'contractRef', null, 'version', coalesce(current_mapping.version, 0), 'unchanged', true
      );
    end if;
    next_version := current_mapping.version + 1;
    update public.partner_company_cash_contract_mappings
    set active = false, version = next_version, reason = btrim(p_reason),
        updated_by = actor_id, updated_at = now()
    where company_id = company.id;
    insert into public.partner_company_cash_contract_mapping_events(
      company_id, previous_contract_ref, new_contract_ref, actor_user_id,
      reason, correlation_id, mapping_version, event_type, qualification_snapshot
    ) values (
      company.id, current_mapping.contract_external_1c_id, null, actor_id,
      btrim(p_reason), p_correlation_id, next_version, 'removed',
      jsonb_build_object('code', 'CASH_MAPPING_REMOVED', 'qualified', false)
    );
    return jsonb_build_object(
      'code', 'CASH_CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
      'contractRef', null, 'version', next_version, 'unchanged', false
    );
  end if;

  qualification := public.qualify_partner_cash_contract_candidate(company.id, normalized_contract_ref);
  if not coalesce((qualification->>'qualified')::boolean, false) then
    return jsonb_build_object(
      'code', qualification->>'code', 'correlationId', p_correlation_id,
      'contractRef', normalized_contract_ref, 'qualification', qualification
    );
  end if;

  if current_mapping.company_id is not null and current_mapping.active
    and lower(current_mapping.contract_external_1c_id) = normalized_contract_ref then
    return jsonb_build_object(
      'code', 'CASH_CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
      'contractRef', normalized_contract_ref, 'version', current_mapping.version, 'unchanged', true
    );
  end if;

  next_version := coalesce(current_mapping.version, 0) + 1;
  event_kind := case when current_mapping.company_id is null then 'mapped' else 'changed' end;
  insert into public.partner_company_cash_contract_mappings(
    company_id, contract_external_1c_id, contract_role, version, active, reason, created_by, updated_by
  ) values (
    company.id, normalized_contract_ref, 'cash', next_version, true, btrim(p_reason), actor_id, actor_id
  ) on conflict (company_id) do update set
    contract_external_1c_id = excluded.contract_external_1c_id,
    contract_role = 'cash', version = excluded.version, active = true,
    reason = excluded.reason, updated_by = actor_id, updated_at = now();

  insert into public.partner_company_cash_contract_mapping_events(
    company_id, previous_contract_ref, new_contract_ref, actor_user_id,
    reason, correlation_id, mapping_version, event_type, qualification_snapshot
  ) values (
    company.id, current_mapping.contract_external_1c_id, normalized_contract_ref,
    actor_id, btrim(p_reason), p_correlation_id, next_version, event_kind, qualification
  );

  return jsonb_build_object(
    'code', 'CASH_CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
    'contractRef', normalized_contract_ref, 'version', next_version, 'unchanged', false,
    'qualification', qualification
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

create or replace function public.get_admin_partner_contract_mapping(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with company as (
    select company.* from public.partner_companies company
    where company.id = p_company_id and public.has_internal_permission('admin.companies.view')
  ), candidates as (
    select contract.*, price_type.name as price_type_name, price_type.currency_code,
      jsonb_build_object(
        'code', cash_status.code,
        'qualified', cash_status.code = 'CASH_CONTRACT_QUALIFIED'
      ) as cash_qualification
    from company
    join public.one_c_counterparty_contracts contract
      on lower(contract.counterparty_external_1c_id) = lower(company.external_1c_id)
     and contract.is_published
    left join public.price_types price_type
      on lower(price_type.external_ref) = lower(contract.price_type_external_1c_id)
    cross join lateral (
      select case
        when not contract.is_active or contract.is_deleted then 'CASH_CONTRACT_INACTIVE'
        when encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') <>
          'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc' then 'CASH_CONTRACT_INVALID_TYPE'
        when lower(coalesce(contract.organization_external_1c_id, '')) <>
          '4643d461-aa49-4b70-9486-a59f80ee6af8' then 'CASH_CONTRACT_ORGANIZATION_MISMATCH'
        when coalesce(contract.price_type_external_1c_id, '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or lower(contract.price_type_external_1c_id) = '00000000-0000-0000-0000-000000000000'
          then 'CASH_CONTRACT_PRICE_TYPE_MISSING'
        when price_type.id is null or not price_type.is_active or price_type.currency_status <> 'resolved'
          then 'CASH_CONTRACT_PRICE_TYPE_INVALID'
        when coalesce(contract.contract_currency_external_1c_id, '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or lower(contract.contract_currency_external_1c_id) = '00000000-0000-0000-0000-000000000000'
          then 'CASH_CONTRACT_CURRENCY_MISSING'
        when lower(coalesce(price_type.currency_ref, '')) <> lower(contract.contract_currency_external_1c_id)
          then 'CASH_CONTRACT_CURRENCY_MISMATCH'
        else 'CASH_CONTRACT_QUALIFIED'
      end as code
    ) cash_status
    order by contract.is_default desc, contract.is_active desc, contract.is_deleted, contract.name, contract.id
    limit 50
  ), price_snapshot as (
    select max(price.synced_at) as last_synced_at, count(*) filter (
      where price.is_published and price.is_active and price.currency_status = 'resolved'
    ) as published_count
    from company
    left join public.product_prices price
      on lower(price.external_1c_price_type_id) = lower(company.external_1c_price_type_id)
  ), cash_mapping as (
    select mapping.*,
      public.qualify_partner_cash_contract_candidate(mapping.company_id, mapping.contract_external_1c_id) as qualification
    from company
    join public.partner_company_cash_contract_mappings mapping on mapping.company_id = company.id
  )
  select jsonb_build_object(
    'companyId', company.id,
    'counterpartyRef', company.external_1c_id,
    'currentContractRef', company.external_1c_contract_id,
    'currentPriceTypeRef', company.external_1c_price_type_id,
    'currentPriceTypeName', current_price_type.name,
    'currentCurrencyCode', current_price_type.currency_code,
    'commercialProfileState', company.commercial_profile_state,
    'commercialProfileVersion', company.commercial_profile_version,
    'commercialProfileVerifiedAt', company.commercial_profile_verified_at,
    'priceSnapshotAt', price_snapshot.last_synced_at,
    'publishedPriceCount', price_snapshot.published_count,
    'version', company.contract_mapping_version,
    'canManage', public.has_internal_permission('admin.partner_integrity.manage'),
    'canSync', public.has_internal_permission('admin.partner_integrity.manage'),
    'cashMapping', jsonb_build_object(
      'contractRole', 'cash',
      'contractRef', cash_mapping.contract_external_1c_id,
      'active', coalesce(cash_mapping.active, false),
      'version', coalesce(cash_mapping.version, 0),
      'reason', cash_mapping.reason,
      'updatedAt', cash_mapping.updated_at,
      'qualificationCode', case
        when cash_mapping.company_id is null then 'CASH_MAPPING_MISSING'
        when not cash_mapping.active then 'CASH_MAPPING_REMOVED'
        else cash_mapping.qualification->>'code'
      end,
      'qualified', cash_mapping.active and coalesce((cash_mapping.qualification->>'qualified')::boolean, false),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', event.id, 'eventType', event.event_type,
          'previousContractRef', event.previous_contract_ref,
          'newContractRef', event.new_contract_ref,
          'reason', event.reason, 'occurredAt', event.occurred_at,
          'mappingVersion', event.mapping_version,
          'qualificationCode', event.qualification_snapshot->>'code'
        ) order by event.occurred_at desc, event.id desc)
        from (
          select source.* from public.partner_company_cash_contract_mapping_events source
          where source.company_id = company.id
          order by source.occurred_at desc, source.id desc limit 10
        ) event
      ), '[]'::jsonb)
    ),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object(
      'external1cId', candidate.external_1c_id, 'code', candidate.code,
      'name', candidate.name, 'number', candidate.contract_number,
      'date', candidate.contract_date, 'contractType', candidate.contract_type,
      'organizationRef', candidate.organization_external_1c_id,
      'signed', candidate.is_signed, 'active', candidate.is_active,
      'deleted', candidate.is_deleted, 'priceTypeRef', candidate.price_type_external_1c_id,
      'priceTypeName', candidate.price_type_name, 'currencyCode', candidate.currency_code,
      'currencyRef', candidate.contract_currency_external_1c_id,
      'default', candidate.is_default, 'synchronizedAt', candidate.synchronized_at,
      'cashQualified', coalesce((candidate.cash_qualification->>'qualified')::boolean, false),
      'cashQualificationCode', candidate.cash_qualification->>'code'
    ) order by candidate.is_default desc, candidate.is_active desc, candidate.is_deleted, candidate.name)
      from candidates candidate), '[]'::jsonb)
  )
  from company
  left join public.price_types current_price_type
    on lower(current_price_type.external_ref) = lower(company.external_1c_price_type_id)
  cross join price_snapshot
  left join cash_mapping on true;
$$;

revoke all on function public.get_admin_partner_contract_mapping(uuid) from public, anon;
grant execute on function public.get_admin_partner_contract_mapping(uuid) to authenticated;

create or replace function public.get_partner_checkout_configuration(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with company as (
    select * from public.partner_companies where id = p_company_id and status = 'active'
  ), counterparty as (
    select source.* from company join lateral (
      select candidate.* from public.one_c_counterparties candidate
      where candidate.is_published and lower(candidate.external_1c_id) = lower(company.external_1c_id)
      order by candidate.synchronized_at desc, candidate.id limit 1
    ) source on true
  ), cashless_contract as (
    select candidate.*, price_type.currency_ref as resolved_currency_ref,
      price_type.currency_code as resolved_currency_code,
      price_type.is_active as price_type_active,
      price_type.currency_status as price_type_currency_status
    from company join lateral (
      select contract.* from public.one_c_counterparty_contracts contract
      where contract.is_published and lower(contract.external_1c_id) = lower(company.external_1c_contract_id)
      order by contract.synchronized_at desc, contract.id limit 1
    ) candidate on true
    left join public.price_types price_type
      on lower(price_type.external_ref) = lower(candidate.price_type_external_1c_id)
  ), cash_mapping as (
    select mapping.*,
      public.qualify_partner_cash_contract_candidate(mapping.company_id, mapping.contract_external_1c_id) as qualification
    from company join public.partner_company_cash_contract_mappings mapping
      on mapping.company_id = company.id and mapping.active and mapping.contract_role = 'cash'
  ), cash_contract as (
    select candidate.*, price_type.currency_ref as resolved_currency_ref,
      price_type.currency_code as resolved_currency_code,
      price_type.is_active as price_type_active,
      price_type.currency_status as price_type_currency_status
    from cash_mapping join lateral (
      select contract.* from public.one_c_counterparty_contracts contract
      where contract.is_published and lower(contract.external_1c_id) = lower(cash_mapping.contract_external_1c_id)
      order by contract.synchronized_at desc, contract.id limit 1
    ) candidate on coalesce((cash_mapping.qualification->>'qualified')::boolean, false)
    left join public.price_types price_type
      on lower(price_type.external_ref) = lower(candidate.price_type_external_1c_id)
  ), company_price_type as (
    select price.* from company join public.price_types price
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
    'currencyRef', company_price_type.currency_ref,
    'currencyCode', company_price_type.currency_code,
    'cashDiagnosticCode', case
      when cash_mapping.company_id is null then 'CASH_MAPPING_MISSING'
      else cash_mapping.qualification->>'code'
    end,
    'cashless', case when cashless_contract.id is null then null else jsonb_build_object(
      'contractRef', cashless_contract.external_1c_id, 'name', cashless_contract.name,
      'number', cashless_contract.contract_number,
      'active', cashless_contract.is_active and not cashless_contract.is_deleted
        and cashless_contract.price_type_active and cashless_contract.price_type_currency_status = 'resolved',
      'contractType', cashless_contract.contract_type,
      'organizationRef', cashless_contract.organization_external_1c_id,
      'priceTypeRef', cashless_contract.price_type_external_1c_id,
      'currencyRef', cashless_contract.resolved_currency_ref,
      'currencyCode', cashless_contract.resolved_currency_code,
      'contractCurrencyRef', cashless_contract.contract_currency_external_1c_id
    ) end,
    'cash', case when cash_contract.id is null then null else jsonb_build_object(
      'contractRef', cash_contract.external_1c_id, 'name', cash_contract.name,
      'number', cash_contract.contract_number,
      'active', cash_contract.is_active and not cash_contract.is_deleted
        and cash_contract.price_type_active and cash_contract.price_type_currency_status = 'resolved',
      'contractType', cash_contract.contract_type,
      'organizationRef', cash_contract.organization_external_1c_id,
      'priceTypeRef', cash_contract.price_type_external_1c_id,
      'currencyRef', cash_contract.resolved_currency_ref,
      'currencyCode', cash_contract.resolved_currency_code,
      'contractCurrencyRef', cash_contract.contract_currency_external_1c_id
    ) end,
    'carriers', coalesce((
      select jsonb_agg(jsonb_build_object('id', carrier.id, 'name', carrier.name, 'externalRef', carrier.external_1c_id)
        order by carrier.name, carrier.id)
      from public.one_c_delivery_carriers carrier
      where carrier.is_published and carrier.is_active and not carrier.is_deleted
    ), '[]'::jsonb)
  )
  from company
  left join counterparty on true
  left join cashless_contract on true
  left join cash_mapping on true
  left join cash_contract on true
  left join company_price_type on true;
$$;

revoke all on function public.get_partner_checkout_configuration(uuid)
  from public, anon, authenticated;
grant execute on function public.get_partner_checkout_configuration(uuid) to service_role;

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
    or lower(coalesce(target_contract.contract_currency_external_1c_id, '')) <> resolved_currency_ref
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

comment on column public.partner_company_cash_contract_mappings.contract_role is
  'Explicit administrator-governed payment contract role. Cash is never inferred from a contract label.';
comment on function public.qualify_partner_cash_contract_candidate(uuid, text) is
  'Validates an exact counterparty contract, organization, lifecycle, price type, and currency for the governed cash role.';
