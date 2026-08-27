begin;

set local lock_timeout = '5s';

create or replace function public.qualify_partner_contract_candidate(
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
  company public.partner_companies%rowtype;
  contract public.one_c_counterparty_contracts%rowtype;
  source_price_type public.one_c_counterparty_price_profiles%rowtype;
  local_price_type public.price_types%rowtype;
  normalized_contract_ref text := lower(btrim(coalesce(p_contract_ref, '')));
  settlement_currency_code text;
  currency_validation jsonb;
  result_code text;
begin
  select * into company from public.partner_companies where id = p_company_id;
  if company.id is null or company.status <> 'active' then
    result_code := 'CONTRACT_INACTIVE';
  elsif normalized_contract_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or normalized_contract_ref = '00000000-0000-0000-0000-000000000000' then
    result_code := 'CONTRACT_NOT_FOUND';
  else
    select * into contract
    from public.one_c_counterparty_contracts candidate
    where candidate.is_published
      and lower(candidate.external_1c_id) = normalized_contract_ref
    order by candidate.synchronized_at desc, candidate.id desc
    limit 1;

    if contract.id is null then
      result_code := 'CONTRACT_NOT_FOUND';
    elsif lower(contract.counterparty_external_1c_id) <> lower(coalesce(company.external_1c_id, '')) then
      result_code := 'CONTRACT_NOT_OWNED_BY_COMPANY';
    elsif not contract.is_active or contract.is_deleted then
      result_code := 'CONTRACT_INACTIVE';
    elsif encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') <>
      'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc' then
      result_code := 'CONTRACT_INVALID_TYPE';
    elsif lower(coalesce(contract.organization_external_1c_id, '')) <>
      '4643d461-aa49-4b70-9486-a59f80ee6af8' then
      result_code := 'CONTRACT_ORGANIZATION_MISMATCH';
    elsif coalesce(contract.price_type_external_1c_id, '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or lower(contract.price_type_external_1c_id) = '00000000-0000-0000-0000-000000000000' then
      result_code := 'CONTRACT_PRICE_TYPE_MISSING';
    else
      select * into source_price_type
      from public.one_c_counterparty_price_profiles candidate
      where candidate.is_published
        and lower(candidate.counterparty_external_1c_id) = lower(contract.counterparty_external_1c_id)
        and lower(candidate.external_1c_id) = lower(contract.price_type_external_1c_id)
      order by candidate.synchronized_at desc, candidate.id desc
      limit 1;

      select * into local_price_type
      from public.price_types candidate
      where lower(candidate.external_ref) = lower(contract.price_type_external_1c_id)
      limit 1;

      if source_price_type.id is null or not source_price_type.is_active or source_price_type.is_deleted
        or local_price_type.id is null or not local_price_type.is_active
        or local_price_type.currency_status <> 'resolved' then
        result_code := 'CONTRACT_PRICE_TYPE_INVALID';
      else
        currency_validation := public.validate_commercial_currency_context(
          contract.contract_currency_external_1c_id,
          source_price_type.currency_external_1c_id,
          local_price_type.currency_ref
        );
        result_code := case currency_validation->>'code'
          when 'COMMERCIAL_CURRENCY_VALID' then 'CONTRACT_QUALIFIED'
          when 'SETTLEMENT_CURRENCY_MISSING' then 'CONTRACT_SETTLEMENT_CURRENCY_MISSING'
          when 'PRICE_CURRENCY_MISMATCH' then 'CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH'
          else 'CONTRACT_PRICE_TYPE_INVALID'
        end;
      end if;
    end if;
  end if;

  select candidate.currency_code into settlement_currency_code
  from public.price_types candidate
  where lower(candidate.currency_ref) = lower(contract.contract_currency_external_1c_id)
    and candidate.currency_status = 'resolved'
  order by candidate.is_active desc, candidate.updated_at desc, candidate.id
  limit 1;

  return jsonb_build_object(
    'code', result_code,
    'qualified', result_code = 'CONTRACT_QUALIFIED',
    'companyId', p_company_id,
    'contractRef', nullif(normalized_contract_ref, ''),
    'organizationRef', contract.organization_external_1c_id,
    'priceTypeRef', contract.price_type_external_1c_id,
    'settlementCurrencyRef', contract.contract_currency_external_1c_id,
    'settlementCurrencyCode', settlement_currency_code,
    'authoritativePriceCurrencyRef', source_price_type.currency_external_1c_id,
    'authoritativePriceCurrencyCode', local_price_type.currency_code,
    'publishedPriceCurrencyRef', local_price_type.currency_ref,
    'publishedPriceCurrencyCode', local_price_type.currency_code,
    'sourcePriceCurrencyRef', source_price_type.currency_external_1c_id,
    'priceCurrencyCode', local_price_type.currency_code
  );
end;
$$;

revoke all on function public.qualify_partner_contract_candidate(uuid, text)
  from public, anon, authenticated;
grant execute on function public.qualify_partner_contract_candidate(uuid, text)
  to service_role;

comment on function public.qualify_partner_contract_candidate(uuid, text) is
  'Canonical contract qualification used by checkout projection and atomic order preflight; includes stable organization and price-type identity fields.';

commit;
