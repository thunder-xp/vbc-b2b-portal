begin;

alter table public.partner_companies
  add column if not exists commercial_profile_version integer not null default 1,
  add column if not exists commercial_profile_state text not null default 'never_verified',
  add column if not exists commercial_profile_verified_at timestamptz null;

alter table public.partner_companies
  add constraint partner_companies_commercial_profile_version_check
    check (commercial_profile_version > 0) not valid,
  add constraint partner_companies_commercial_profile_state_check
    check (commercial_profile_state in (
      'never_verified', 'aligned', 'mismatch', 'contract_missing',
      'contract_invalid', 'price_type_unknown', 'price_data_stale'
    )) not valid;

create table public.partner_company_commercial_profile_sync_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  correlation_id uuid not null unique,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  expected_version integer not null check (expected_version > 0),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  result_code text null check (result_code in (
    'COMMERCIAL_PROFILE_SYNC_SUCCESS', 'COMMERCIAL_PROFILE_MISMATCH',
    'COMMERCIAL_CONTRACT_MISSING', 'COMMERCIAL_CONTRACT_INVALID',
    'COMMERCIAL_PRICE_TYPE_MISSING', 'COMMERCIAL_PRICE_TYPE_UNKNOWN',
    'COMMERCIAL_PRICE_DATA_STALE', 'COMMERCIAL_CURRENCY_MISMATCH',
    'COMMERCIAL_PROFILE_SYNC_FAILED'
  )),
  previous_price_type_ref text null,
  next_price_type_ref text null,
  contract_ref text not null,
  source_evidence jsonb null,
  safe_failure_reason text null,
  lease_expires_at timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index partner_company_commercial_profile_sync_running_idx
  on public.partner_company_commercial_profile_sync_runs(company_id)
  where status = 'running';
create index partner_company_commercial_profile_sync_company_idx
  on public.partner_company_commercial_profile_sync_runs(company_id, created_at desc, id desc);
create index if not exists product_prices_commercial_profile_freshness_idx
  on public.product_prices((lower(external_1c_price_type_id)), synced_at desc)
  where is_published and is_active and currency_status = 'resolved';

create table public.partner_company_commercial_profile_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  contract_ref text not null,
  previous_price_type_ref text null,
  next_price_type_ref text not null,
  previous_derived_status text null,
  next_derived_status text not null,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  source text not null check (source = '1C'),
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  correlation_id uuid not null unique,
  profile_version integer not null check (profile_version > 0),
  occurred_at timestamptz not null default now()
);

create index partner_company_commercial_profile_events_company_idx
  on public.partner_company_commercial_profile_events(company_id, occurred_at desc, id desc);

create or replace function public.prevent_partner_company_commercial_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Partner commercial profile events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_partner_company_commercial_profile_event_mutation
before update or delete on public.partner_company_commercial_profile_events
for each row execute function public.prevent_partner_company_commercial_event_mutation();

alter table public.partner_company_commercial_profile_sync_runs enable row level security;
alter table public.partner_company_commercial_profile_events enable row level security;
revoke all on table public.partner_company_commercial_profile_sync_runs,
  public.partner_company_commercial_profile_events from public, anon, authenticated;
grant select, insert, update on table public.partner_company_commercial_profile_sync_runs to service_role;
grant select, insert on table public.partner_company_commercial_profile_events to service_role;
revoke all on function public.prevent_partner_company_commercial_event_mutation()
  from public, anon, authenticated;

create or replace function public.reconcile_partner_company_commercial_profiles()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  affected integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Commercial profile reconciliation requires service role.' using errcode = '42501';
  end if;

  with facts as (
    select
      company.id,
      case
        when company.external_1c_contract_id is null then 'contract_missing'
        when contract.id is null or not contract.is_active or contract.is_deleted then 'contract_invalid'
        when contract.price_type_external_1c_id is null or price_type.id is null or not price_type.is_active then 'price_type_unknown'
        when lower(contract.price_type_external_1c_id) <> lower(coalesce(company.external_1c_price_type_id, '')) then 'mismatch'
        when price_snapshot.last_synced_at is null
          or price_snapshot.last_synced_at < now() - interval '36 hours' then 'price_data_stale'
        else 'aligned'
      end as next_state
    from public.partner_companies company
    left join lateral (
      select candidate.*
      from public.one_c_counterparty_contracts candidate
      where candidate.is_published
        and lower(candidate.external_1c_id) = lower(company.external_1c_contract_id)
      order by candidate.synchronized_at desc, candidate.id
      limit 1
    ) contract on true
    left join public.price_types price_type
      on lower(price_type.external_ref) = lower(contract.price_type_external_1c_id)
    left join lateral (
      select max(price.synced_at) as last_synced_at
      from public.product_prices price
      where price.is_published and price.is_active and price.currency_status = 'resolved'
        and lower(price.external_1c_price_type_id) = lower(contract.price_type_external_1c_id)
    ) price_snapshot on true
    where company.status = 'active'
  )
  update public.partner_companies company
  set commercial_profile_state = facts.next_state,
      updated_at = case when company.commercial_profile_state is distinct from facts.next_state then now() else company.updated_at end
  from facts
  where company.id = facts.id
    and company.commercial_profile_state is distinct from facts.next_state;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.reconcile_partner_company_commercial_profiles()
  from public, anon, authenticated;
grant execute on function public.reconcile_partner_company_commercial_profiles() to service_role;

create or replace function public.reconcile_commercial_profiles_after_directory_sync()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.status = 'succeeded' and old.status is distinct from new.status then
    perform public.reconcile_partner_company_commercial_profiles();
  end if;
  return new;
end;
$$;

create trigger reconcile_commercial_profiles_after_directory_sync
after update of status on public.one_c_counterparty_directory_syncs
for each row execute function public.reconcile_commercial_profiles_after_directory_sync();
revoke all on function public.reconcile_commercial_profiles_after_directory_sync()
  from public, anon, authenticated;

create or replace function public.begin_admin_partner_commercial_profile_sync(
  p_company_id uuid,
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
  existing public.partner_company_commercial_profile_sync_runs%rowtype;
  run_id uuid;
begin
  if actor_id is null or not public.has_internal_permission('admin.partner_integrity.manage') then
    raise exception 'Commercial profile synchronization is not allowed.' using errcode = '42501';
  end if;
  if p_company_id is null or p_correlation_id is null
    or p_expected_version is null or p_expected_version < 1
    or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Invalid commercial profile synchronization request.' using errcode = '22023';
  end if;

  select * into existing
  from public.partner_company_commercial_profile_sync_runs
  where correlation_id = p_correlation_id;
  if existing.id is not null then
    return jsonb_build_object(
      'claimed', existing.status = 'running', 'runId', existing.id,
      'code', coalesce(existing.result_code, 'COMMERCIAL_PROFILE_MISMATCH'),
      'correlationId', existing.correlation_id, 'idempotent', true
    );
  end if;

  select * into company from public.partner_companies where id = p_company_id for update;
  if company.id is null or company.status <> 'active' then
    return jsonb_build_object('claimed', false, 'code', 'COMMERCIAL_PROFILE_SYNC_FAILED', 'correlationId', p_correlation_id);
  end if;
  if company.commercial_profile_version <> p_expected_version then
    return jsonb_build_object(
      'claimed', false, 'code', 'COMMERCIAL_PROFILE_MISMATCH',
      'correlationId', p_correlation_id, 'version', company.commercial_profile_version
    );
  end if;
  if company.external_1c_contract_id is null then
    return jsonb_build_object('claimed', false, 'code', 'COMMERCIAL_CONTRACT_MISSING', 'correlationId', p_correlation_id);
  end if;

  update public.partner_company_commercial_profile_sync_runs
  set status = 'failed', result_code = 'COMMERCIAL_PROFILE_SYNC_FAILED',
      safe_failure_reason = 'lease_expired', finished_at = now()
  where company_id = company.id and status = 'running' and lease_expires_at <= now();

  if exists (
    select 1 from public.partner_company_commercial_profile_sync_runs
    where company_id = company.id and status = 'running'
  ) then
    return jsonb_build_object(
      'claimed', false, 'code', 'COMMERCIAL_PROFILE_SYNC_FAILED',
      'correlationId', p_correlation_id, 'inProgress', true
    );
  end if;

  insert into public.partner_company_commercial_profile_sync_runs(
    company_id, actor_user_id, correlation_id, reason, expected_version,
    status, previous_price_type_ref, contract_ref, lease_expires_at
  ) values (
    company.id, actor_id, p_correlation_id, btrim(p_reason), p_expected_version,
    'running', company.external_1c_price_type_id, lower(company.external_1c_contract_id), now() + interval '2 minutes'
  ) returning id into run_id;

  return jsonb_build_object(
    'claimed', true, 'runId', run_id, 'code', 'COMMERCIAL_PROFILE_MISMATCH',
    'correlationId', p_correlation_id, 'companyId', company.id,
    'counterpartyRef', company.external_1c_id,
    'contractRef', company.external_1c_contract_id,
    'version', company.commercial_profile_version,
    'idempotent', false
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'claimed', false, 'code', 'COMMERCIAL_PROFILE_SYNC_FAILED',
      'correlationId', p_correlation_id, 'inProgress', true
    );
end;
$$;

revoke all on function public.begin_admin_partner_commercial_profile_sync(uuid, integer, text, uuid)
  from public, anon;
grant execute on function public.begin_admin_partner_commercial_profile_sync(uuid, integer, text, uuid)
  to authenticated;

create or replace function public.fail_partner_commercial_profile_sync(
  p_run_id uuid,
  p_safe_reason text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Commercial profile failure publication requires service role.' using errcode = '42501';
  end if;
  update public.partner_company_commercial_profile_sync_runs
  set status = 'failed', result_code = 'COMMERCIAL_PROFILE_SYNC_FAILED',
      safe_failure_reason = left(coalesce(nullif(btrim(p_safe_reason), ''), 'provider_failure'), 100),
      finished_at = now()
  where id = p_run_id and status = 'running';
end;
$$;

revoke all on function public.fail_partner_commercial_profile_sync(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_partner_commercial_profile_sync(uuid, text) to service_role;

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
    or lower(regexp_replace(coalesce(p_source ->> 'contractType', ''), '[^[:alpha:]]', '', 'g')) <> 'спокупателем'
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
    elsif source_contract_currency is null or source_price_currency is null
      or source_contract_currency <> source_price_currency
      or source_price_currency <> lower(coalesce(local_price_type.currency_ref, '')) then
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
grant execute on function public.publish_partner_commercial_profile_sync(uuid, jsonb) to service_role;

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
    select contract.*, price_type.name as price_type_name, price_type.currency_code
    from company
    join public.one_c_counterparty_contracts contract
      on lower(contract.counterparty_external_1c_id) = lower(company.external_1c_id)
     and contract.is_published
    left join public.price_types price_type
      on lower(price_type.external_ref) = lower(contract.price_type_external_1c_id)
    order by contract.is_default desc, contract.is_active desc, contract.is_deleted, contract.name, contract.id
    limit 50
  ), price_snapshot as (
    select max(price.synced_at) as last_synced_at, count(*) filter (
      where price.is_published and price.is_active and price.currency_status = 'resolved'
    ) as published_count
    from company
    left join public.product_prices price
      on lower(price.external_1c_price_type_id) = lower(company.external_1c_price_type_id)
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
    'candidates', coalesce((select jsonb_agg(jsonb_build_object(
      'external1cId', candidate.external_1c_id, 'code', candidate.code,
      'name', candidate.name, 'number', candidate.contract_number,
      'date', candidate.contract_date, 'contractType', candidate.contract_type,
      'organizationRef', candidate.organization_external_1c_id,
      'signed', candidate.is_signed, 'active', candidate.is_active,
      'deleted', candidate.is_deleted, 'priceTypeRef', candidate.price_type_external_1c_id,
      'priceTypeName', candidate.price_type_name, 'currencyCode', candidate.currency_code,
      'default', candidate.is_default, 'synchronizedAt', candidate.synchronized_at
    ) order by candidate.is_default desc, candidate.is_active desc, candidate.is_deleted, candidate.name)
      from candidates candidate), '[]'::jsonb)
  )
  from company
  left join public.price_types current_price_type
    on lower(current_price_type.external_ref) = lower(company.external_1c_price_type_id)
  cross join price_snapshot;
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
  if normalized_contract_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or normalized_contract_ref = '00000000-0000-0000-0000-000000000000' then
    return jsonb_build_object('code', 'CONTRACT_NOT_FOUND', 'correlationId', p_correlation_id);
  end if;
  select * into contract from public.one_c_counterparty_contracts candidate
  where lower(candidate.external_1c_id) = normalized_contract_ref and candidate.is_published
  order by candidate.synchronized_at desc, candidate.id limit 1;
  if contract.id is null then return jsonb_build_object('code', 'CONTRACT_NOT_FOUND', 'correlationId', p_correlation_id); end if;
  if lower(contract.counterparty_external_1c_id) <> lower(coalesce(company.external_1c_id, '')) then
    return jsonb_build_object('code', 'CONTRACT_NOT_OWNED_BY_COMPANY', 'correlationId', p_correlation_id); end if;
  if not contract.is_active or contract.is_deleted then
    return jsonb_build_object('code', 'CONTRACT_INACTIVE', 'correlationId', p_correlation_id); end if;
  if encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') <>
    'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc' then
    return jsonb_build_object('code', 'CONTRACT_INVALID_TYPE', 'correlationId', p_correlation_id); end if;
  if lower(coalesce(contract.organization_external_1c_id, '')) <> '4643d461-aa49-4b70-9486-a59f80ee6af8' then
    return jsonb_build_object('code', 'CONTRACT_ORGANIZATION_MISMATCH', 'correlationId', p_correlation_id); end if;
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

with facts as (
  select company.id,
    case
      when company.external_1c_contract_id is null then 'contract_missing'
      when contract.id is null or not contract.is_active or contract.is_deleted then 'contract_invalid'
      when contract.price_type_external_1c_id is null or price_type.id is null then 'price_type_unknown'
      when lower(contract.price_type_external_1c_id) <> lower(coalesce(company.external_1c_price_type_id, '')) then 'mismatch'
      when prices.last_synced_at is null or prices.last_synced_at < now() - interval '36 hours' then 'price_data_stale'
      else 'aligned'
    end as state
  from public.partner_companies company
  left join lateral (
    select candidate.* from public.one_c_counterparty_contracts candidate
    where candidate.is_published and lower(candidate.external_1c_id) = lower(company.external_1c_contract_id)
    order by candidate.synchronized_at desc, candidate.id limit 1
  ) contract on true
  left join public.price_types price_type on lower(price_type.external_ref) = lower(contract.price_type_external_1c_id)
  left join lateral (
    select max(price.synced_at) last_synced_at from public.product_prices price
    where price.is_published and price.is_active and price.currency_status = 'resolved'
      and lower(price.external_1c_price_type_id) = lower(contract.price_type_external_1c_id)
  ) prices on true
)
update public.partner_companies company
set commercial_profile_state = facts.state
from facts where company.id = facts.id;

comment on column public.partner_companies.external_1c_price_type_id is
  'Published commercial price type derived only from the verified mapped primary 1C customer contract.';
comment on column public.partner_companies.commercial_profile_state is
  'Local reconciliation state; mismatch detection never changes the published price type automatically.';
comment on table public.partner_company_commercial_profile_sync_runs is
  'Company-scoped leased and idempotent 1C commercial profile synchronization runs.';
comment on table public.partner_company_commercial_profile_events is
  'Append-only audit of verified 1C commercial profile publications.';

commit;
