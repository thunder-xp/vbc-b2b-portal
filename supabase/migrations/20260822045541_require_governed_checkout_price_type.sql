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
     and price.is_active
     and price.currency_status = 'resolved'
     and price.currency_ref is not null
     and price.currency_ref <> '00000000-0000-0000-0000-000000000000'
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

comment on function public.get_partner_checkout_configuration(uuid) is
  'Returns bounded local checkout mappings; only active price types with resolved authoritative currency are eligible.';
