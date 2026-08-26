begin;

set local lock_timeout = '5s';

create or replace function public.validate_commercial_currency_context(
  p_settlement_currency_ref text,
  p_authoritative_price_currency_ref text,
  p_published_price_currency_ref text
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  settlement_ref text := lower(nullif(btrim(p_settlement_currency_ref), ''));
  authoritative_price_ref text := lower(nullif(btrim(p_authoritative_price_currency_ref), ''));
  published_price_ref text := lower(nullif(btrim(p_published_price_currency_ref), ''));
  guid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  zero_guid constant text := '00000000-0000-0000-0000-000000000000';
  result_code text;
begin
  result_code := case
    when settlement_ref is null or settlement_ref !~* guid_pattern or settlement_ref = zero_guid
      then 'SETTLEMENT_CURRENCY_MISSING'
    when authoritative_price_ref is null or authoritative_price_ref !~* guid_pattern
      or authoritative_price_ref = zero_guid
      then 'AUTHORITATIVE_PRICE_CURRENCY_MISSING'
    when published_price_ref is null or published_price_ref !~* guid_pattern
      or published_price_ref = zero_guid
      then 'PUBLISHED_PRICE_CURRENCY_MISSING'
    when authoritative_price_ref <> published_price_ref
      then 'PRICE_CURRENCY_MISMATCH'
    else 'COMMERCIAL_CURRENCY_VALID'
  end;

  return jsonb_build_object(
    'valid', result_code = 'COMMERCIAL_CURRENCY_VALID',
    'code', result_code,
    'settlementCurrencyRef', settlement_ref,
    'authoritativePriceCurrencyRef', authoritative_price_ref,
    'publishedPriceCurrencyRef', published_price_ref
  );
end;
$$;

revoke all on function public.validate_commercial_currency_context(text, text, text)
  from public, anon, authenticated;
grant execute on function public.validate_commercial_currency_context(text, text, text)
  to service_role;

comment on function public.validate_commercial_currency_context(text, text, text) is
  'Validates settlement currency independently and aligns only authoritative versus published price currency.';

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
  'Qualifies exact contract evidence using independent settlement and aligned authoritative/published price currencies.';

create or replace function public.publish_partner_commercial_profile_sync(
  p_run_id uuid,
  p_source jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  run public.partner_company_commercial_profile_sync_runs%rowtype;
  company public.partner_companies%rowtype;
  local_price_type public.price_types%rowtype;
  previous_status text;
  next_status text;
  next_ref text := lower(nullif(btrim(p_source ->> 'priceTypeReference'), ''));
  source_counterparty text := lower(nullif(btrim(p_source ->> 'counterpartyReference'), ''));
  source_contract text := lower(nullif(btrim(p_source ->> 'contractReference'), ''));
  source_organization text := lower(nullif(btrim(p_source ->> 'organizationReference'), ''));
  source_contract_currency text := lower(nullif(btrim(p_source ->> 'contractCurrencyReference'), ''));
  source_price_currency text := lower(nullif(btrim(p_source ->> 'priceTypeCurrencyReference'), ''));
  currency_validation jsonb;
  price_count integer;
  price_synced_at timestamptz;
  next_version integer;
  outcome text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Commercial profile publication requires service role.' using errcode = '42501';
  end if;

  select * into run from public.partner_company_commercial_profile_sync_runs where id = p_run_id for update;
  if run.id is null then
    raise exception 'Commercial profile synchronization run was not found.' using errcode = 'P0002';
  end if;
  if run.status <> 'running' then
    return jsonb_build_object(
      'code', run.result_code, 'correlationId', run.correlation_id,
      'version', run.expected_version, 'idempotent', true
    );
  end if;
  if run.lease_expires_at <= now() then
    update public.partner_company_commercial_profile_sync_runs
    set status = 'failed', result_code = 'COMMERCIAL_PROFILE_SYNC_FAILED',
        safe_failure_reason = 'lease_expired', finished_at = now()
    where id = run.id;
    return jsonb_build_object('code', 'COMMERCIAL_PROFILE_SYNC_FAILED', 'correlationId', run.correlation_id);
  end if;

  select * into company from public.partner_companies where id = run.company_id for update;
  if company.id is null or company.commercial_profile_version <> run.expected_version then
    outcome := 'COMMERCIAL_PROFILE_MISMATCH';
  elsif source_contract is null or source_contract <> lower(run.contract_ref)
    or source_counterparty is null or source_counterparty <> lower(coalesce(company.external_1c_id, ''))
    or source_contract <> lower(coalesce(company.external_1c_contract_id, ''))
    or source_organization <> '4643d461-aa49-4b70-9486-a59f80ee6af8'
    or lower(regexp_replace(coalesce(p_source ->> 'contractType', ''), '[^[:alpha:]]', '', 'g')) <>
      convert_from(decode('d181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc', 'hex'), 'UTF8')
    or coalesce((p_source ->> 'default')::boolean, false) is not true
    or coalesce((p_source ->> 'active')::boolean, false) is not true
    or coalesce((p_source ->> 'deleted')::boolean, false) is true then
    outcome := 'COMMERCIAL_CONTRACT_INVALID';
  elsif next_ref is null then
    outcome := 'COMMERCIAL_PRICE_TYPE_MISSING';
  elsif coalesce((p_source ->> 'priceTypeActive')::boolean, false) is not true then
    outcome := 'COMMERCIAL_PRICE_TYPE_UNKNOWN';
  else
    select * into local_price_type from public.price_types
    where lower(external_ref) = next_ref and is_active limit 1;
    if local_price_type.id is null then
      outcome := 'COMMERCIAL_PRICE_TYPE_UNKNOWN';
    else
      currency_validation := public.validate_commercial_currency_context(
        source_contract_currency,
        source_price_currency,
        local_price_type.currency_ref
      );
      if not coalesce((currency_validation->>'valid')::boolean, false) then
        outcome := 'COMMERCIAL_CURRENCY_MISMATCH';
      else
        select count(*), max(price.synced_at) into price_count, price_synced_at
        from public.product_prices price
        where price.is_published and price.is_active and price.currency_status = 'resolved'
          and lower(price.external_1c_price_type_id) = next_ref;
        if price_count = 0 or price_synced_at is null
          or price_synced_at < now() - interval '36 hours' then
          outcome := 'COMMERCIAL_PRICE_DATA_STALE';
        else
          outcome := 'COMMERCIAL_PROFILE_SYNC_SUCCESS';
        end if;
      end if;
    end if;
  end if;

  if outcome <> 'COMMERCIAL_PROFILE_SYNC_SUCCESS' then
    update public.partner_company_commercial_profile_sync_runs
    set status = 'failed', result_code = outcome, next_price_type_ref = next_ref,
        source_evidence = p_source, safe_failure_reason = lower(outcome), finished_at = now()
    where id = run.id;
    update public.partner_companies
    set commercial_profile_state = case
      when outcome = 'COMMERCIAL_CONTRACT_INVALID' then 'contract_invalid'
      when outcome in ('COMMERCIAL_PRICE_TYPE_MISSING', 'COMMERCIAL_PRICE_TYPE_UNKNOWN') then 'price_type_unknown'
      when outcome = 'COMMERCIAL_PRICE_DATA_STALE' then 'price_data_stale'
      else commercial_profile_state
    end
    where id = company.id;
    return jsonb_build_object('code', outcome, 'correlationId', run.correlation_id, 'version', company.commercial_profile_version);
  end if;

  select name into previous_status from public.price_types
  where lower(external_ref) = lower(company.external_1c_price_type_id) limit 1;
  next_status := local_price_type.name;
  next_version := company.commercial_profile_version + 1;

  update public.partner_companies
  set external_1c_price_type_id = next_ref,
      commercial_profile_version = next_version,
      commercial_profile_state = 'aligned',
      commercial_profile_verified_at = (p_source ->> 'verifiedAt')::timestamptz,
      updated_at = now()
  where id = company.id;

  insert into public.partner_company_commercial_profile_events(
    company_id, contract_ref, previous_price_type_ref, next_price_type_ref,
    previous_derived_status, next_derived_status, actor_user_id, source,
    reason, correlation_id, profile_version
  ) values (
    company.id, source_contract, company.external_1c_price_type_id, next_ref,
    previous_status, next_status, run.actor_user_id, '1C', run.reason,
    run.correlation_id, next_version
  );

  update public.partner_company_commercial_profile_sync_runs
  set status = 'succeeded', result_code = 'COMMERCIAL_PROFILE_SYNC_SUCCESS',
      next_price_type_ref = next_ref, source_evidence = p_source, finished_at = now()
  where id = run.id;

  return jsonb_build_object(
    'code', 'COMMERCIAL_PROFILE_SYNC_SUCCESS', 'correlationId', run.correlation_id,
    'companyId', company.id, 'contractRef', source_contract,
    'previousPriceTypeRef', company.external_1c_price_type_id,
    'nextPriceTypeRef', next_ref, 'derivedStatus', next_status,
    'currencyCode', local_price_type.currency_code, 'version', next_version,
    'unchanged', lower(coalesce(company.external_1c_price_type_id, '')) = next_ref,
    'idempotent', false
  );
end;
$$;

revoke all on function public.publish_partner_commercial_profile_sync(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_partner_commercial_profile_sync(uuid, jsonb)
  to service_role;

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
    select candidate.*,
      public.qualify_partner_contract_candidate(company.id, candidate.external_1c_id) as qualification
    from company join lateral (
      select contract.* from public.one_c_counterparty_contracts contract
      where contract.is_published and lower(contract.external_1c_id) = lower(company.external_1c_contract_id)
      order by contract.synchronized_at desc, contract.id limit 1
    ) candidate on true
  ), cash_mapping as (
    select mapping.*,
      public.qualify_partner_cash_contract_candidate(mapping.company_id, mapping.contract_external_1c_id) as qualification
    from company join public.partner_company_cash_contract_mappings mapping
      on mapping.company_id = company.id and mapping.active and mapping.contract_role = 'cash'
  ), cash_contract as (
    select candidate.*, cash_mapping.qualification
    from cash_mapping join lateral (
      select contract.* from public.one_c_counterparty_contracts contract
      where contract.is_published and lower(contract.external_1c_id) = lower(cash_mapping.contract_external_1c_id)
      order by contract.synchronized_at desc, contract.id limit 1
    ) candidate on coalesce((cash_mapping.qualification->>'qualified')::boolean, false)
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
    'publishedPriceCurrencyRef', company_price_type.currency_ref,
    'publishedPriceCurrencyCode', company_price_type.currency_code,
    'currencyRef', company_price_type.currency_ref,
    'currencyCode', company_price_type.currency_code,
    'cashDiagnosticCode', case
      when cash_mapping.company_id is null then 'CASH_MAPPING_MISSING'
      else cash_mapping.qualification->>'code'
    end,
    'cashless', case when cashless_contract.id is null then null else jsonb_build_object(
      'contractRef', cashless_contract.external_1c_id, 'name', cashless_contract.name,
      'number', cashless_contract.contract_number,
      'active', coalesce((cashless_contract.qualification->>'qualified')::boolean, false),
      'contractType', cashless_contract.contract_type,
      'organizationRef', cashless_contract.organization_external_1c_id,
      'priceTypeRef', cashless_contract.price_type_external_1c_id,
      'settlementCurrencyRef', cashless_contract.qualification->>'settlementCurrencyRef',
      'settlementCurrencyCode', cashless_contract.qualification->>'settlementCurrencyCode',
      'authoritativePriceCurrencyRef', cashless_contract.qualification->>'authoritativePriceCurrencyRef',
      'authoritativePriceCurrencyCode', cashless_contract.qualification->>'authoritativePriceCurrencyCode',
      'publishedPriceCurrencyRef', cashless_contract.qualification->>'publishedPriceCurrencyRef',
      'publishedPriceCurrencyCode', cashless_contract.qualification->>'publishedPriceCurrencyCode',
      'currencyRef', cashless_contract.qualification->>'publishedPriceCurrencyRef',
      'currencyCode', cashless_contract.qualification->>'publishedPriceCurrencyCode',
      'contractCurrencyRef', cashless_contract.qualification->>'settlementCurrencyRef'
    ) end,
    'cash', case when cash_contract.id is null then null else jsonb_build_object(
      'contractRef', cash_contract.external_1c_id, 'name', cash_contract.name,
      'number', cash_contract.contract_number,
      'active', coalesce((cash_contract.qualification->>'qualified')::boolean, false),
      'contractType', cash_contract.contract_type,
      'organizationRef', cash_contract.organization_external_1c_id,
      'priceTypeRef', cash_contract.price_type_external_1c_id,
      'settlementCurrencyRef', cash_contract.qualification->>'settlementCurrencyRef',
      'settlementCurrencyCode', cash_contract.qualification->>'settlementCurrencyCode',
      'authoritativePriceCurrencyRef', cash_contract.qualification->>'authoritativePriceCurrencyRef',
      'authoritativePriceCurrencyCode', cash_contract.qualification->>'authoritativePriceCurrencyCode',
      'publishedPriceCurrencyRef', cash_contract.qualification->>'publishedPriceCurrencyRef',
      'publishedPriceCurrencyCode', cash_contract.qualification->>'publishedPriceCurrencyCode',
      'currencyRef', cash_contract.qualification->>'publishedPriceCurrencyRef',
      'currencyCode', cash_contract.qualification->>'publishedPriceCurrencyCode',
      'contractCurrencyRef', cash_contract.qualification->>'settlementCurrencyRef'
    ) end,
    'carriers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', carrier.id, 'name', carrier.name, 'externalRef', carrier.external_1c_id
      ) order by carrier.name, carrier.id)
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
grant execute on function public.get_partner_checkout_configuration(uuid)
  to service_role;

comment on function public.get_partner_checkout_configuration(uuid) is
  'Returns explicit settlement, authoritative price, and published price currency semantics; legacy aliases remain for rolling deployment compatibility.';

commit;
