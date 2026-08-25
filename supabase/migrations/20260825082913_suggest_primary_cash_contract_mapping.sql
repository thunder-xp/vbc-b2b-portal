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
  ), primary_cash_suggestion as (
    select min(candidate.external_1c_id) as contract_ref
    from company
    join candidates candidate
      on lower(candidate.external_1c_id) = lower(company.external_1c_contract_id)
    where coalesce((candidate.cash_qualification->>'qualified')::boolean, false)
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
    'suggestedCashContractRef', case
      when cash_mapping.company_id is null then primary_cash_suggestion.contract_ref
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
  cross join primary_cash_suggestion
  left join cash_mapping on true;
$$;

revoke all on function public.get_admin_partner_contract_mapping(uuid) from public, anon;
grant execute on function public.get_admin_partner_contract_mapping(uuid) to authenticated;

comment on function public.get_admin_partner_contract_mapping(uuid) is
  'Returns the bounded admin contract aggregate and a read-only qualified primary cash-contract suggestion without creating a mapping.';
