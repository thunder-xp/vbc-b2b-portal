begin;

alter table public.one_c_counterparty_contracts
  add column if not exists contract_number text null,
  add column if not exists contract_date text null,
  add column if not exists contract_type text null,
  add column if not exists organization_external_1c_id text null,
  add column if not exists contract_currency_external_1c_id text null,
  add column if not exists is_signed boolean null,
  add column if not exists is_default boolean not null default false;

alter table public.one_c_counterparty_contracts
  add constraint one_c_counterparty_contracts_organization_guid_check
  check (
    organization_external_1c_id is null
    or (
      organization_external_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and organization_external_1c_id <> '00000000-0000-0000-0000-000000000000'
    )
  ) not valid,
  add constraint one_c_counterparty_contracts_currency_guid_check
  check (
    contract_currency_external_1c_id is null
    or (
      contract_currency_external_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and contract_currency_external_1c_id <> '00000000-0000-0000-0000-000000000000'
    )
  ) not valid;

create index if not exists one_c_counterparty_contracts_admin_mapping_idx
  on public.one_c_counterparty_contracts(
    (lower(counterparty_external_1c_id)),
    is_published,
    is_default desc,
    name,
    id
  );

create index if not exists one_c_counterparty_contracts_published_ref_idx
  on public.one_c_counterparty_contracts((lower(external_1c_id)))
  where is_published;

alter table public.partner_companies
  add column if not exists contract_mapping_version integer not null default 1;

alter table public.partner_companies
  add constraint partner_companies_contract_mapping_version_check
  check (contract_mapping_version > 0) not valid;

create table if not exists public.partner_company_contract_mapping_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  previous_contract_ref text null,
  new_contract_ref text not null,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  correlation_id uuid not null unique,
  mapping_version integer not null check (mapping_version > 1),
  occurred_at timestamptz not null default now()
);

create index if not exists partner_company_contract_mapping_events_company_idx
  on public.partner_company_contract_mapping_events(company_id, occurred_at desc, id desc);

create or replace function public.prevent_partner_company_contract_mapping_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Partner company contract mapping events are append-only.' using errcode = '55000';
end;
$$;

drop trigger if exists prevent_partner_company_contract_mapping_event_mutation
  on public.partner_company_contract_mapping_events;
create trigger prevent_partner_company_contract_mapping_event_mutation
before update or delete on public.partner_company_contract_mapping_events
for each row execute function public.prevent_partner_company_contract_mapping_event_mutation();

alter table public.partner_company_contract_mapping_events enable row level security;
revoke all on table public.partner_company_contract_mapping_events from public, anon, authenticated;
grant select, insert on table public.partner_company_contract_mapping_events to service_role;

create or replace function public.get_admin_partner_contract_mapping(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with company as (
    select
      company.id,
      company.external_1c_id,
      company.external_1c_contract_id,
      company.external_1c_price_type_id,
      company.contract_mapping_version
    from public.partner_companies company
    where company.id = p_company_id
      and public.has_internal_permission('admin.companies.view')
  ), candidates as (
    select
      contract.external_1c_id,
      contract.code,
      contract.name,
      contract.contract_number,
      contract.contract_date,
      contract.contract_type,
      contract.organization_external_1c_id,
      contract.is_signed,
      contract.is_active,
      contract.is_deleted,
      contract.price_type_external_1c_id,
      price_type.name as price_type_name,
      price_type.currency_code,
      contract.is_default,
      contract.synchronized_at
    from company
    join public.one_c_counterparty_contracts contract
      on lower(contract.counterparty_external_1c_id) = lower(company.external_1c_id)
     and contract.is_published
    left join public.price_types price_type
      on lower(price_type.external_ref) = lower(contract.price_type_external_1c_id)
    order by contract.is_default desc, contract.is_active desc, contract.is_deleted, contract.name, contract.id
    limit 50
  )
  select case
    when not public.has_internal_permission('admin.companies.view') then
      null
    when not exists(select 1 from company) then
      null
    else jsonb_build_object(
      'companyId', company.id,
      'counterpartyRef', company.external_1c_id,
      'currentContractRef', company.external_1c_contract_id,
      'currentPriceTypeRef', company.external_1c_price_type_id,
      'currentPriceTypeName', current_price_type.name,
      'currentCurrencyCode', current_price_type.currency_code,
      'version', company.contract_mapping_version,
      'canManage', public.has_internal_permission('admin.partner_integrity.manage'),
      'candidates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'external1cId', candidate.external_1c_id,
          'code', candidate.code,
          'name', candidate.name,
          'number', candidate.contract_number,
          'date', candidate.contract_date,
          'contractType', candidate.contract_type,
          'organizationRef', candidate.organization_external_1c_id,
          'signed', candidate.is_signed,
          'active', candidate.is_active,
          'deleted', candidate.is_deleted,
          'priceTypeRef', candidate.price_type_external_1c_id,
          'priceTypeName', candidate.price_type_name,
          'currencyCode', candidate.currency_code,
          'default', candidate.is_default,
          'synchronizedAt', candidate.synchronized_at
        ) order by candidate.is_default desc, candidate.is_active desc, candidate.is_deleted, candidate.name)
        from candidates candidate
      ), '[]'::jsonb)
    )
  end
  from company
  left join public.price_types current_price_type
    on lower(current_price_type.external_ref) = lower(company.external_1c_price_type_id);
$$;

revoke all on function public.get_admin_partner_contract_mapping(uuid)
  from public, anon;
grant execute on function public.get_admin_partner_contract_mapping(uuid)
  to authenticated;

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
  if normalized_contract_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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

revoke all on function public.prevent_partner_company_contract_mapping_event_mutation()
  from public, anon, authenticated;

comment on table public.partner_company_contract_mapping_events is
  'Append-only audit for manual selection of a verified synchronized 1C customer contract.';
comment on function public.get_admin_partner_contract_mapping(uuid) is
  'Bounded local contract-directory projection for one authorized internal company page.';
comment on function public.map_admin_partner_company_contract(uuid, text, integer, text, uuid) is
  'Atomically validates and maps one published 1C customer contract with optimistic locking.';

commit;
