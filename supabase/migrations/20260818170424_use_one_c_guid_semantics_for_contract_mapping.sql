begin;

create or replace function public.map_admin_partner_company_contract(
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
  contract public.one_c_counterparty_contracts%rowtype;
  normalized_contract_ref text := lower(btrim(coalesce(p_contract_ref, '')));
  next_version integer;
begin
  if actor_id is null or not public.has_internal_permission('admin.partner_integrity.manage') then
    raise exception 'Contract mapping is not allowed.' using errcode = '42501';
  end if;
  if p_company_id is null or p_correlation_id is null
    or p_expected_version is null or p_expected_version < 1
    or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Invalid contract mapping request.' using errcode = '22023';
  end if;

  select * into company
  from public.partner_companies
  where id = p_company_id
  for update;

  if company.id is null then
    return jsonb_build_object('code', 'CONTRACT_MAPPING_FAILED', 'correlationId', p_correlation_id);
  end if;
  if company.contract_mapping_version <> p_expected_version then
    return jsonb_build_object(
      'code', 'CONTRACT_MAPPING_CONFLICT',
      'correlationId', p_correlation_id,
      'version', company.contract_mapping_version,
      'currentContractRef', company.external_1c_contract_id
    );
  end if;
  if normalized_contract_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or normalized_contract_ref = '00000000-0000-0000-0000-000000000000' then
    return jsonb_build_object('code', 'CONTRACT_NOT_FOUND', 'correlationId', p_correlation_id);
  end if;

  select * into contract
  from public.one_c_counterparty_contracts candidate
  where lower(candidate.external_1c_id) = normalized_contract_ref
    and candidate.is_published
  order by candidate.synchronized_at desc, candidate.id
  limit 1;

  if contract.id is null then
    return jsonb_build_object('code', 'CONTRACT_NOT_FOUND', 'correlationId', p_correlation_id);
  end if;
  if lower(contract.counterparty_external_1c_id) <> lower(coalesce(company.external_1c_id, '')) then
    return jsonb_build_object('code', 'CONTRACT_NOT_OWNED_BY_COMPANY', 'correlationId', p_correlation_id);
  end if;
  if not contract.is_active or contract.is_deleted then
    return jsonb_build_object('code', 'CONTRACT_INACTIVE', 'correlationId', p_correlation_id);
  end if;
  if encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') <>
    'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc' then
    return jsonb_build_object('code', 'CONTRACT_INVALID_TYPE', 'correlationId', p_correlation_id);
  end if;
  if lower(coalesce(contract.organization_external_1c_id, '')) <>
    '4643d461-aa49-4b70-9486-a59f80ee6af8' then
    return jsonb_build_object('code', 'CONTRACT_ORGANIZATION_MISMATCH', 'correlationId', p_correlation_id);
  end if;
  if lower(coalesce(contract.price_type_external_1c_id, '')) <>
    lower(coalesce(company.external_1c_price_type_id, '')) then
    return jsonb_build_object(
      'code', 'CONTRACT_PRICE_TYPE_MISMATCH',
      'correlationId', p_correlation_id,
      'currentPriceTypeRef', company.external_1c_price_type_id,
      'selectedPriceTypeRef', contract.price_type_external_1c_id
    );
  end if;

  if lower(coalesce(company.external_1c_contract_id, '')) = normalized_contract_ref then
    return jsonb_build_object(
      'code', 'CONTRACT_MAPPING_SUCCESS',
      'correlationId', p_correlation_id,
      'contractRef', normalized_contract_ref,
      'version', company.contract_mapping_version,
      'unchanged', true
    );
  end if;

  next_version := company.contract_mapping_version + 1;
  update public.partner_companies
  set external_1c_contract_id = normalized_contract_ref,
      contract_mapping_version = next_version,
      updated_at = now()
  where id = company.id;

  insert into public.partner_company_contract_mapping_events(
    company_id,
    previous_contract_ref,
    new_contract_ref,
    actor_user_id,
    reason,
    correlation_id,
    mapping_version
  ) values (
    company.id,
    company.external_1c_contract_id,
    normalized_contract_ref,
    actor_id,
    btrim(p_reason),
    p_correlation_id,
    next_version
  );

  return jsonb_build_object(
    'code', 'CONTRACT_MAPPING_SUCCESS',
    'correlationId', p_correlation_id,
    'contractRef', normalized_contract_ref,
    'version', next_version,
    'unchanged', false
  );
exception
  when unique_violation then
    select event.new_contract_ref, event.mapping_version
      into normalized_contract_ref, next_version
    from public.partner_company_contract_mapping_events event
    where event.correlation_id = p_correlation_id;
    if found then
      return jsonb_build_object(
        'code', 'CONTRACT_MAPPING_SUCCESS',
        'correlationId', p_correlation_id,
        'contractRef', normalized_contract_ref,
        'version', next_version,
        'unchanged', true
      );
    end if;
    raise;
end;
$$;

revoke all on function public.map_admin_partner_company_contract(uuid, text, integer, text, uuid)
  from public, anon;
grant execute on function public.map_admin_partner_company_contract(uuid, text, integer, text, uuid)
  to authenticated;

comment on function public.map_admin_partner_company_contract(uuid, text, integer, text, uuid) is
  'Atomically validates and maps one published non-zero 1C GUID customer contract with optimistic locking.';

commit;
