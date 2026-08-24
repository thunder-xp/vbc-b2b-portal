begin;

set local lock_timeout = '5s';

alter table public.one_c_counterparty_price_profiles
  add column if not exists currency_external_1c_id text null;

alter table public.one_c_counterparty_price_profiles
  drop constraint if exists one_c_counterparty_price_profiles_currency_guid_check;
alter table public.one_c_counterparty_price_profiles
  add constraint one_c_counterparty_price_profiles_currency_guid_check
  check (
    currency_external_1c_id is null
    or (
      currency_external_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and lower(currency_external_1c_id) <> '00000000-0000-0000-0000-000000000000'
    )
  );

update public.one_c_counterparty_price_profiles profile
set currency_external_1c_id = price_type.currency_ref
from public.price_types price_type
where profile.currency_external_1c_id is null
  and lower(price_type.external_ref) = lower(profile.external_1c_id)
  and price_type.currency_status = 'resolved'
  and price_type.currency_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and lower(price_type.currency_ref) <> '00000000-0000-0000-0000-000000000000';

create index if not exists one_c_counterparty_price_profiles_qualification_idx
  on public.one_c_counterparty_price_profiles(
    lower(counterparty_external_1c_id), lower(external_1c_id),
    is_published, synchronized_at desc
  );

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
        or local_price_type.currency_status <> 'resolved'
        or coalesce(source_price_type.currency_external_1c_id, '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(local_price_type.currency_ref, '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        result_code := 'CONTRACT_PRICE_TYPE_INVALID';
      elsif lower(source_price_type.currency_external_1c_id) <> lower(local_price_type.currency_ref) then
        result_code := 'CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH';
      elsif coalesce(contract.contract_currency_external_1c_id, '') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or lower(contract.contract_currency_external_1c_id) = '00000000-0000-0000-0000-000000000000' then
        result_code := 'CONTRACT_SETTLEMENT_CURRENCY_MISSING';
      else
        result_code := 'CONTRACT_QUALIFIED';
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
    'priceTypeRef', contract.price_type_external_1c_id,
    'sourcePriceCurrencyRef', source_price_type.currency_external_1c_id,
    'publishedPriceCurrencyRef', local_price_type.currency_ref,
    'priceCurrencyCode', local_price_type.currency_code
  );
end;
$$;

revoke all on function public.qualify_partner_contract_candidate(uuid, text)
  from public, anon, authenticated;
grant execute on function public.qualify_partner_contract_candidate(uuid, text)
  to service_role;

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
  qualification jsonb := public.qualify_partner_contract_candidate(p_company_id, p_contract_ref);
  generic_code text := qualification->>'code';
  cash_code text;
begin
  cash_code := case generic_code
    when 'CONTRACT_QUALIFIED' then 'CASH_CONTRACT_QUALIFIED'
    when 'CONTRACT_NOT_FOUND' then 'CASH_CONTRACT_NOT_FOUND'
    when 'CONTRACT_NOT_OWNED_BY_COMPANY' then 'CASH_CONTRACT_NOT_OWNED_BY_COMPANY'
    when 'CONTRACT_INACTIVE' then 'CASH_CONTRACT_INACTIVE'
    when 'CONTRACT_INVALID_TYPE' then 'CASH_CONTRACT_INVALID_TYPE'
    when 'CONTRACT_ORGANIZATION_MISMATCH' then 'CASH_CONTRACT_ORGANIZATION_MISMATCH'
    when 'CONTRACT_PRICE_TYPE_MISSING' then 'CASH_CONTRACT_PRICE_TYPE_MISSING'
    when 'CONTRACT_PRICE_TYPE_INVALID' then 'CASH_CONTRACT_PRICE_TYPE_INVALID'
    when 'CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH' then 'CASH_CONTRACT_PRICE_TYPE_CURRENCY_MISMATCH'
    when 'CONTRACT_SETTLEMENT_CURRENCY_MISSING' then 'CASH_CONTRACT_CURRENCY_MISSING'
    else 'CASH_CONTRACT_PRICE_TYPE_INVALID'
  end;
  return qualification || jsonb_build_object(
    'code', cash_code,
    'qualified', cash_code = 'CASH_CONTRACT_QUALIFIED',
    'currencyRef', qualification->>'publishedPriceCurrencyRef',
    'currencyCode', qualification->>'priceCurrencyCode'
  );
end;
$$;

revoke all on function public.qualify_partner_cash_contract_candidate(uuid, text)
  from public, anon, authenticated;
grant execute on function public.qualify_partner_cash_contract_candidate(uuid, text)
  to service_role;

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
  ), ranked_contracts as (
    select contract.*,
      row_number() over (
        partition by lower(contract.external_1c_id)
        order by contract.is_published desc, contract.synchronized_at desc, contract.id desc
      ) as history_rank
    from company
    join public.one_c_counterparty_contracts contract
      on lower(contract.counterparty_external_1c_id) = lower(company.external_1c_id)
  ), candidates as (
    select contract.*, price_type.name as price_type_name,
      qualification.value as qualification,
      cash_qualification.value as cash_qualification
    from company
    join ranked_contracts contract on contract.history_rank = 1 and contract.is_published
    left join public.price_types price_type
      on lower(price_type.external_ref) = lower(contract.price_type_external_1c_id)
    cross join lateral (select public.qualify_partner_contract_candidate(company.id, contract.external_1c_id) value) qualification
    cross join lateral (select public.qualify_partner_cash_contract_candidate(company.id, contract.external_1c_id) value) cash_qualification
    order by contract.is_default desc, contract.is_active desc, contract.is_deleted, contract.name, contract.id
    limit 50
  ), valid_defaults as (
    select count(*) as default_count, min(external_1c_id) as default_ref
    from candidates
    where is_default and coalesce((qualification->>'qualified')::boolean, false)
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
    'suggestedContractRef', case
      when company.external_1c_contract_id is null and valid_defaults.default_count = 1 then valid_defaults.default_ref
      else null
    end,
    'defaultContractAmbiguous', valid_defaults.default_count > 1,
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
      'priceTypeName', candidate.price_type_name,
      'settlementCurrencyCode', candidate.qualification->>'settlementCurrencyCode',
      'settlementCurrencyRef', candidate.qualification->>'settlementCurrencyRef',
      'priceCurrencyCode', candidate.qualification->>'priceCurrencyCode',
      'priceCurrencyRef', candidate.qualification->>'publishedPriceCurrencyRef',
      'selectable', coalesce((candidate.qualification->>'qualified')::boolean, false),
      'qualificationCode', candidate.qualification->>'code',
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
  cross join valid_defaults
  left join cash_mapping on true;
$$;

revoke all on function public.get_admin_partner_contract_mapping(uuid) from public, anon;
grant execute on function public.get_admin_partner_contract_mapping(uuid) to authenticated;

create or replace function public.map_admin_partner_company_contract(
  p_company_id uuid, p_contract_ref text, p_expected_version integer,
  p_reason text, p_correlation_id uuid
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
  contract public.one_c_counterparty_contracts%rowtype;
  qualification jsonb;
  normalized_contract_ref text := lower(btrim(coalesce(p_contract_ref, '')));
  next_version integer;
begin
  if actor_id is null or not public.has_internal_permission('admin.partner_integrity.manage') then
    raise exception 'Contract mapping is not allowed.' using errcode = '42501';
  end if;
  if p_company_id is null or p_correlation_id is null or p_expected_version is null or p_expected_version < 1
    or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Invalid contract mapping request.' using errcode = '22023';
  end if;
  select * into company from public.partner_companies where id = p_company_id for update;
  if company.id is null then return jsonb_build_object('code', 'CONTRACT_MAPPING_FAILED', 'correlationId', p_correlation_id); end if;
  if company.contract_mapping_version <> p_expected_version then
    return jsonb_build_object('code', 'CONTRACT_MAPPING_CONFLICT', 'correlationId', p_correlation_id,
      'version', company.contract_mapping_version, 'currentContractRef', company.external_1c_contract_id);
  end if;

  qualification := public.qualify_partner_contract_candidate(company.id, normalized_contract_ref);
  if not coalesce((qualification->>'qualified')::boolean, false) then
    return jsonb_build_object('code', qualification->>'code', 'correlationId', p_correlation_id,
      'contractRef', normalized_contract_ref, 'qualification', qualification);
  end if;

  select * into contract from public.one_c_counterparty_contracts candidate
  where candidate.is_published and lower(candidate.external_1c_id) = normalized_contract_ref
  order by candidate.synchronized_at desc, candidate.id desc limit 1;

  if lower(coalesce(company.external_1c_contract_id, '')) = normalized_contract_ref then
    return jsonb_build_object('code', 'CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
      'contractRef', normalized_contract_ref, 'version', company.contract_mapping_version, 'unchanged', true);
  end if;
  next_version := company.contract_mapping_version + 1;
  update public.partner_companies
  set external_1c_contract_id = normalized_contract_ref,
      contract_mapping_version = next_version,
      commercial_profile_state = case
        when lower(coalesce(external_1c_price_type_id, '')) = lower(coalesce(contract.price_type_external_1c_id, '')) then 'aligned'
        else 'mismatch'
      end,
      commercial_profile_verified_at = null,
      updated_at = now()
  where id = company.id;
  insert into public.partner_company_contract_mapping_events(
    company_id, previous_contract_ref, new_contract_ref, actor_user_id,
    reason, correlation_id, mapping_version
  ) values (company.id, company.external_1c_contract_id, normalized_contract_ref,
    actor_id, btrim(p_reason), p_correlation_id, next_version);
  return jsonb_build_object('code', 'CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
    'contractRef', normalized_contract_ref, 'version', next_version, 'unchanged', false,
    'profileMismatch', lower(coalesce(company.external_1c_price_type_id, '')) <> lower(coalesce(contract.price_type_external_1c_id, '')));
exception
  when unique_violation then
    select event.new_contract_ref, event.mapping_version into normalized_contract_ref, next_version
    from public.partner_company_contract_mapping_events event where event.correlation_id = p_correlation_id;
    if found then return jsonb_build_object('code', 'CONTRACT_MAPPING_SUCCESS', 'correlationId', p_correlation_id,
      'contractRef', normalized_contract_ref, 'version', next_version, 'unchanged', true); end if;
    raise;
end;
$$;

revoke all on function public.map_admin_partner_company_contract(uuid, text, integer, text, uuid)
  from public, anon;
grant execute on function public.map_admin_partner_company_contract(uuid, text, integer, text, uuid)
  to authenticated;

comment on function public.qualify_partner_contract_candidate(uuid, text) is
  'Validates exact local 1C contract evidence while keeping settlement currency independent from authoritative price-type currency.';

commit;
