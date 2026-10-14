begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Only server-side live verification can issue evidence. The authenticated
-- atomic Apply consumes its opaque identity; the browser cannot supply source facts.
create table public.partner_manual_contract_verifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id),
  actor_user_id uuid not null references public.user_profiles(id),
  main_contract_ref text not null,
  cash_contract_ref text,
  expected_contract_version integer not null,
  expected_cash_version integer not null,
  expected_profile_version integer not null,
  snapshot jsonb not null,
  profile_source jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  correlation_id uuid not null unique,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes'
);
create index partner_manual_contract_verifications_company_idx
  on public.partner_manual_contract_verifications(company_id, verified_at desc);
alter table public.partner_manual_contract_verifications enable row level security;
revoke all on public.partner_manual_contract_verifications from public, anon, authenticated;
grant select, insert on public.partner_manual_contract_verifications to service_role;
create trigger prevent_partner_manual_contract_verification_mutation
before update or delete on public.partner_manual_contract_verifications
for each row execute function public.prevent_partner_company_commercial_event_mutation();

alter table public.partner_companies
  add column commercial_contract_selection_mode text not null default 'CANONICAL_DEFAULT'
    check (commercial_contract_selection_mode in ('CANONICAL_DEFAULT', 'MANUAL_VERIFIED')),
  add column commercial_contract_verification_id uuid references public.partner_manual_contract_verifications(id),
  add column commercial_contract_selected_by uuid references public.user_profiles(id),
  add column commercial_contract_selected_at timestamptz,
  add constraint partner_manual_contract_provenance_check check (
    commercial_contract_selection_mode <> 'MANUAL_VERIFIED'
    or (commercial_contract_verification_id is not null
      and commercial_contract_selected_by is not null and commercial_contract_selected_at is not null)
  );

create or replace function public.guard_manual_partner_contract_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.commercial_contract_selection_mode = 'MANUAL_VERIFIED'
    and new.external_1c_contract_id is distinct from old.external_1c_contract_id
    and not exists (
      select 1 from public.partner_manual_contract_verifications evidence
      where evidence.id = new.commercial_contract_verification_id
        and evidence.company_id = new.id
        and evidence.main_contract_ref = lower(new.external_1c_contract_id)
        and evidence.actor_user_id = new.commercial_contract_selected_by
    ) then
    raise exception 'Manual contract changes require fresh governed verification.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_manual_partner_contract_identity() from public, anon, authenticated;
create trigger guard_manual_partner_contract_identity before update on public.partner_companies
for each row execute function public.guard_manual_partner_contract_identity();

-- Shared source validation for the atomic preflight. It does not publish or map.
create or replace function public.validate_partner_manual_profile_source(
  p_counterparty_ref text, p_contract_ref text, p_source jsonb
) returns text language plpgsql stable security definer
set search_path = public set row_security = off as $$
declare
  price_type public.price_types%rowtype;
  currencies jsonb;
begin
  if lower(coalesce(p_source->>'counterpartyReference','')) <> lower(p_counterparty_ref)
    or lower(coalesce(p_source->>'contractReference','')) <> lower(p_contract_ref)
    or lower(coalesce(p_source->>'organizationReference','')) <> '4643d461-aa49-4b70-9486-a59f80ee6af8'
    or lower(regexp_replace(coalesce(p_source->>'contractType',''),'[^[:alpha:]]','','g')) <> 'спокупателем'
    or coalesce((p_source->>'active')::boolean,false) is not true
    or coalesce((p_source->>'deleted')::boolean,true) is true then
    return 'COMMERCIAL_CONTRACT_INVALID';
  end if;
  if nullif(p_source->>'priceTypeReference','') is null then return 'COMMERCIAL_PRICE_TYPE_MISSING'; end if;
  select * into price_type from public.price_types
    where lower(external_ref)=lower(p_source->>'priceTypeReference') and is_active limit 1;
  if price_type.id is null or price_type.currency_status <> 'resolved'
    or coalesce((p_source->>'priceTypeActive')::boolean,false) is not true then
    return 'COMMERCIAL_PRICE_TYPE_UNKNOWN';
  end if;
  currencies := public.validate_commercial_currency_context(
    p_source->>'contractCurrencyReference', p_source->>'priceTypeCurrencyReference', price_type.currency_ref);
  if not coalesce((currencies->>'valid')::boolean,false) then return 'COMMERCIAL_CURRENCY_MISMATCH'; end if;
  if not exists (select 1 from public.product_prices price
    where lower(price.external_1c_price_type_id)=lower(price_type.external_ref)
      and price.is_published and price.is_active and price.currency_status='resolved'
      and price.synced_at >= now()-interval '36 hours') then
    return 'COMMERCIAL_PRICE_DATA_STALE';
  end if;
  return 'COMMERCIAL_PROFILE_SYNC_SUCCESS';
end;
$$;
revoke all on function public.validate_partner_manual_profile_source(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.validate_partner_manual_profile_source(text,text,jsonb) to service_role;

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
  if coalesce(auth.role(),'') <> 'service_role'
    and not (auth.uid() is not null
      and public.has_internal_permission('admin.integrations.manage')
      and public.has_internal_permission('admin.partner_integrity.manage')) then
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
    or (coalesce((p_source ->> 'default')::boolean, false) is not true
      and not (company.commercial_contract_selection_mode = 'MANUAL_VERIFIED'
        and exists (select 1 from public.partner_manual_contract_verifications evidence
          where evidence.id = company.commercial_contract_verification_id
            and evidence.company_id = company.id
            and evidence.main_contract_ref = source_contract
            and evidence.actor_user_id = company.commercial_contract_selected_by)))
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
revoke all on function public.publish_partner_commercial_profile_sync(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.publish_partner_commercial_profile_sync(uuid,jsonb) to service_role;

create or replace function public.get_partner_commercial_readiness(
  p_company_ids uuid[] default null,
  p_order_capable_only boolean default false
)
returns table (
  company_id uuid,
  company_name text,
  order_capable boolean,
  counterparty_active boolean,
  canonical_contract_count integer,
  canonical_contract_ref text,
  canonical_price_type_ref text,
  canonical_repairable boolean,
  cashless_qualified boolean,
  cash_qualified boolean,
  has_payment_path boolean,
  mapping_aligned boolean,
  readiness_class text,
  payment_path_class text,
  repairable boolean,
  commercial_profile_state text,
  commercial_profile_verified_at timestamptz,
  active_cart_item_count bigint,
  last_order_at timestamptz,
  severity text,
  commercial_consequence text,
  required_action text
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
#variable_conflict use_column
begin
  if session_user <> 'postgres'
    and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and not public.has_internal_permission('admin.companies.view') then
    raise exception 'Commercial readiness inspection is not allowed.' using errcode = '42501';
  end if;
  if p_company_ids is not null and cardinality(p_company_ids) not between 1 and 1000 then
    raise exception 'Invalid commercial readiness scope.' using errcode = '22023';
  end if;

  return query
  with target_companies as materialized (
    select company.*
    from public.partner_companies company
    where company.status = 'active'
      and (p_company_ids is null or company.id = any(p_company_ids))
  ), order_capability as materialized (
    select distinct membership.company_id
    from public.company_memberships membership
    join target_companies company on company.id = membership.company_id
    join public.user_profiles profile
      on profile.id = membership.user_id and profile.status = 'active'
    join public.roles role
      on role.id = membership.role_id and role.scope = 'partner'
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission
      on permission.id = role_permission.permission_id
     and permission.code = 'orders.manage'
     and permission.scope in ('partner', 'both')
    join public.partner_company_access_policies access_policy
      on access_policy.company_id = membership.company_id
    join public.partner_company_capabilities capability
      on capability.company_id = membership.company_id
     and capability.permission_id = permission.id
    where membership.status = 'active'
      and not exists (
        select 1
        from public.membership_permission_overrides permission_override
        where permission_override.membership_id = membership.id
          and permission_override.permission_id = permission.id
          and permission_override.effect = 'deny'
      )
  ), counterparties as materialized (
    select distinct on (lower(source.external_1c_id))
      lower(source.external_1c_id) as counterparty_ref,
      source.is_active,
      source.is_deleted
    from public.one_c_counterparties source
    where source.is_published
    order by lower(source.external_1c_id), source.synchronized_at desc, source.id desc
  ), contract_rollup as materialized (
    select
      lower(contract.counterparty_external_1c_id) as counterparty_ref,
      count(*) filter (
        where contract.is_default and contract.is_active and not contract.is_deleted
      )::integer as raw_default_count,
      count(*) filter (
        where contract.is_default
          and contract.is_active
          and not contract.is_deleted
          and lower(coalesce(contract.organization_external_1c_id, '')) =
            '4643d461-aa49-4b70-9486-a59f80ee6af8'
          and encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') =
            'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
      )::integer as qualified_default_count,
      min(contract.external_1c_id) filter (
        where contract.is_default
          and contract.is_active
          and not contract.is_deleted
          and lower(coalesce(contract.organization_external_1c_id, '')) =
            '4643d461-aa49-4b70-9486-a59f80ee6af8'
          and encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') =
            'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
      ) as default_contract_ref,
      min(contract.price_type_external_1c_id) filter (
        where contract.is_default
          and contract.is_active
          and not contract.is_deleted
          and lower(coalesce(contract.organization_external_1c_id, '')) =
            '4643d461-aa49-4b70-9486-a59f80ee6af8'
          and encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') =
            'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
      ) as default_price_type_ref,
      min(contract.contract_currency_external_1c_id) filter (
        where contract.is_default
          and contract.is_active
          and not contract.is_deleted
          and lower(coalesce(contract.organization_external_1c_id, '')) =
            '4643d461-aa49-4b70-9486-a59f80ee6af8'
          and encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') =
            'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
      ) as default_settlement_currency_ref
    from public.one_c_counterparty_contracts contract
    where contract.is_published
    group by lower(contract.counterparty_external_1c_id)
  ), source_price_profiles as materialized (
    select distinct on (
      lower(profile.counterparty_external_1c_id),
      lower(profile.external_1c_id)
    )
      lower(profile.counterparty_external_1c_id) as counterparty_ref,
      lower(profile.external_1c_id) as price_type_ref,
      profile.currency_external_1c_id,
      profile.is_active,
      profile.is_deleted
    from public.one_c_counterparty_price_profiles profile
    where profile.is_published
    order by
      lower(profile.counterparty_external_1c_id),
      lower(profile.external_1c_id),
      profile.synchronized_at desc,
      profile.id desc
  ), current_contracts as materialized (
    select distinct on (company.id)
      company.id as company_id,
      contract.external_1c_id,
      contract.counterparty_external_1c_id,
      contract.price_type_external_1c_id,
      contract.contract_currency_external_1c_id,
      contract.organization_external_1c_id,
      contract.contract_type,
      contract.is_active,
      contract.is_deleted
    from target_companies company
    left join public.one_c_counterparty_contracts contract
      on contract.is_published
     and lower(contract.external_1c_id) = lower(company.external_1c_contract_id)
    order by company.id, contract.synchronized_at desc, contract.id desc
  ), cash_contracts as materialized (
    select distinct on (company.id)
      company.id as company_id,
      mapping.active as mapping_active,
      mapping.contract_external_1c_id as cash_mapping_ref,
      contract.external_1c_id,
      contract.counterparty_external_1c_id,
      contract.price_type_external_1c_id,
      contract.contract_currency_external_1c_id,
      contract.organization_external_1c_id,
      contract.contract_type,
      contract.is_active,
      contract.is_deleted,
      local_price_type.id as local_price_type_id,
      local_price_type.is_active as local_price_type_active,
      local_price_type.currency_status as local_price_currency_status,
      local_price_type.currency_ref as local_price_currency_ref
    from target_companies company
    left join public.partner_company_cash_contract_mappings mapping
      on mapping.company_id = company.id and mapping.contract_role = 'cash'
    left join public.one_c_counterparty_contracts contract
      on contract.is_published
     and lower(contract.external_1c_id) = lower(mapping.contract_external_1c_id)
    left join public.price_types local_price_type
      on lower(local_price_type.external_ref) = lower(contract.price_type_external_1c_id)
    order by company.id, contract.synchronized_at desc, contract.id desc
  ), cart_exposure as materialized (
    select cart.company_id, count(item.id)::bigint as item_count
    from public.carts cart
    join target_companies company on company.id = cart.company_id
    join public.cart_items item on item.cart_id = cart.id
    where cart.status in ('active', 'submitting')
    group by cart.company_id
  ), order_exposure as materialized (
    select orders.company_id, max(orders.created_at) as last_order_at
    from public.partner_orders orders
    join target_companies company on company.id = orders.company_id
    group by orders.company_id
  ), current_price_freshness as materialized (
    select lower(price.external_1c_price_type_id) as price_ref, max(price.synced_at) as synced_at
    from public.product_prices price
    join (select distinct lower(external_1c_price_type_id) as price_ref from target_companies) selected
      on selected.price_ref = lower(price.external_1c_price_type_id)
    where price.is_published and price.is_active and price.currency_status = 'resolved'
    group by lower(price.external_1c_price_type_id)
  ), facts as (
    select
      company.id,
      company.display_name,
      capability.company_id is not null as order_capable,
      coalesce(counterparty.is_active and not counterparty.is_deleted, false) as counterparty_active,
      coalesce(contracts.raw_default_count, 0) as raw_default_count,
      coalesce(contracts.qualified_default_count, 0) as qualified_default_count,
      contracts.default_contract_ref,
      contracts.default_price_type_ref,
      source_price_profile.is_active as source_price_type_active,
      source_price_profile.is_deleted as source_price_type_deleted,
      canonical_price_type.id as canonical_local_price_type_id,
      canonical_price_type.is_active as canonical_local_price_type_active,
      canonical_price_type.currency_status as canonical_local_currency_status,
      coalesce((public.validate_commercial_currency_context(
        contracts.default_settlement_currency_ref,
        source_price_profile.currency_external_1c_id,
        canonical_price_type.currency_ref
      ) ->> 'valid')::boolean, false) as canonical_currency_valid,
      current_contract.external_1c_id as current_contract_ref,
      current_contract.price_type_external_1c_id as current_contract_price_type_ref,
      current_source_price.is_active as current_source_price_active,
      current_source_price.is_deleted as current_source_price_deleted,
      current_local_price.id as current_local_price_type_id,
      current_local_price.is_active as current_local_price_type_active,
      current_local_price.currency_status as current_local_currency_status,
      coalesce((public.validate_commercial_currency_context(
        current_contract.contract_currency_external_1c_id,
        current_source_price.currency_external_1c_id,
        current_local_price.currency_ref
      ) ->> 'valid')::boolean, false) as current_currency_valid,
      current_contract.counterparty_external_1c_id as current_contract_counterparty_ref,
      current_contract.organization_external_1c_id as current_contract_organization_ref,
      current_contract.contract_type as current_contract_type,
      current_contract.is_active as current_contract_active,
      current_contract.is_deleted as current_contract_deleted,
      cash_contract.*,
      cash_source_price.is_active as cash_source_price_active,
      cash_source_price.is_deleted as cash_source_price_deleted,
      coalesce((public.validate_commercial_currency_context(
        cash_contract.contract_currency_external_1c_id, cash_source_price.currency_external_1c_id, cash_contract.local_price_currency_ref
      )->>'valid')::boolean,false) as cash_currency_valid,
      company.external_1c_id as company_counterparty_ref,
      company.external_1c_contract_id,
      company.external_1c_price_type_id,
      company.commercial_contract_selection_mode,
      (company.commercial_contract_verification_id is not null and exists (
        select 1 from public.partner_manual_contract_verifications evidence
        where evidence.id=company.commercial_contract_verification_id
          and evidence.company_id=company.id
          and evidence.main_contract_ref=lower(company.external_1c_contract_id)
          and evidence.actor_user_id=company.commercial_contract_selected_by
      )) as manual_provenance_valid,
      current_freshness.synced_at as current_price_synced_at,
      company.commercial_profile_state,
      company.commercial_profile_verified_at,
      coalesce(cart.item_count, 0) as cart_item_count,
      orders.last_order_at
    from target_companies company
    left join order_capability capability on capability.company_id = company.id
    left join counterparties counterparty
      on counterparty.counterparty_ref = lower(company.external_1c_id)
    left join contract_rollup contracts
      on contracts.counterparty_ref = lower(company.external_1c_id)
    left join source_price_profiles source_price_profile
      on source_price_profile.counterparty_ref = lower(company.external_1c_id)
     and source_price_profile.price_type_ref = lower(contracts.default_price_type_ref)
    left join public.price_types canonical_price_type
      on lower(canonical_price_type.external_ref) = lower(contracts.default_price_type_ref)
    left join current_contracts current_contract on current_contract.company_id = company.id
    left join source_price_profiles current_source_price
      on current_source_price.counterparty_ref = lower(company.external_1c_id)
     and current_source_price.price_type_ref = lower(current_contract.price_type_external_1c_id)
    left join public.price_types current_local_price
      on lower(current_local_price.external_ref) = lower(company.external_1c_price_type_id)
    left join cash_contracts cash_contract on cash_contract.company_id = company.id
    left join source_price_profiles cash_source_price
      on cash_source_price.counterparty_ref=lower(company.external_1c_id)
     and cash_source_price.price_type_ref=lower(cash_contract.price_type_external_1c_id)
    left join current_price_freshness current_freshness
      on current_freshness.price_ref = lower(company.external_1c_price_type_id)
    left join cart_exposure cart on cart.company_id = company.id
    left join order_exposure orders on orders.company_id = company.id
    where not p_order_capable_only or capability.company_id is not null
  ), evaluated as (
    select
      facts.*,
      (
        commercial_contract_selection_mode = 'CANONICAL_DEFAULT'
        and counterparty_active
        and qualified_default_count = 1
        and default_contract_ref is not null
        and default_price_type_ref is not null
        and coalesce(source_price_type_active, false)
        and not coalesce(source_price_type_deleted, true)
        and canonical_local_price_type_id is not null
        and coalesce(canonical_local_price_type_active, false)
        and canonical_local_currency_status = 'resolved'
        and canonical_currency_valid
      ) as can_repair,
      (
        counterparty_active
        and current_contract_ref is not null
        and lower(coalesce(current_contract_counterparty_ref, '')) = lower(coalesce(company_counterparty_ref, ''))
        and coalesce(current_contract_active, false)
        and not coalesce(current_contract_deleted, true)
        and encode(convert_to(lower(btrim(coalesce(current_contract_type, ''))), 'UTF8'), 'hex') =
          'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
        and lower(coalesce(current_contract_organization_ref, '')) =
          '4643d461-aa49-4b70-9486-a59f80ee6af8'
        and current_contract_price_type_ref is not null
        and lower(current_contract_price_type_ref) = lower(coalesce(external_1c_price_type_id, ''))
        and coalesce(current_source_price_active, false)
        and not coalesce(current_source_price_deleted, true)
        and current_local_price_type_id is not null
        and coalesce(current_local_price_type_active, false)
        and current_local_currency_status = 'resolved'
        and current_currency_valid
        and (commercial_contract_selection_mode = 'CANONICAL_DEFAULT'
          or (manual_provenance_valid and current_price_synced_at >= now()-interval '36 hours'))
      ) as cashless_is_qualified,
      (
        (commercial_contract_selection_mode = 'MANUAL_VERIFIED'
          and coalesce(mapping_active,false)
          and counterparty_active
          and lower(coalesce(counterparty_external_1c_id,''))=lower(coalesce(company_counterparty_ref,''))
          and coalesce(is_active,false) and not coalesce(is_deleted,true)
          and encode(convert_to(lower(btrim(coalesce(contract_type,''))),'UTF8'),'hex')='d181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
          and lower(coalesce(organization_external_1c_id,''))='4643d461-aa49-4b70-9486-a59f80ee6af8'
          and local_price_type_id is not null and coalesce(local_price_type_active,false)
          and local_price_currency_status='resolved'
          and coalesce(cash_source_price_active,false) and not coalesce(cash_source_price_deleted,true)
          and cash_currency_valid)
        or (commercial_contract_selection_mode = 'CANONICAL_DEFAULT'
        and counterparty_active
        and coalesce(mapping_active, false)
        and external_1c_id is not null
        and lower(coalesce(counterparty_external_1c_id, '')) = lower(coalesce(company_counterparty_ref, ''))
        and coalesce(is_active, false)
        and not coalesce(is_deleted, true)
        and encode(convert_to(lower(btrim(coalesce(contract_type, ''))), 'UTF8'), 'hex') =
          'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
        and lower(coalesce(organization_external_1c_id, '')) =
          '4643d461-aa49-4b70-9486-a59f80ee6af8'
        and price_type_external_1c_id is not null
        and local_price_type_id is not null
        and coalesce(local_price_type_active, false)
        and local_price_currency_status = 'resolved'
        and lower(coalesce(local_price_currency_ref, '')) =
          lower(coalesce(contract_currency_external_1c_id, '')))
      ) as cash_is_qualified
    from facts
  ), classified as (
    select
      evaluated.*,
      cashless_is_qualified or cash_is_qualified as any_payment_path,
      (
        (commercial_contract_selection_mode = 'MANUAL_VERIFIED' and manual_provenance_valid and cashless_is_qualified
          or (commercial_contract_selection_mode = 'CANONICAL_DEFAULT'
            and lower(coalesce(external_1c_contract_id, '')) = lower(coalesce(default_contract_ref, ''))
            and lower(coalesce(external_1c_price_type_id, '')) = lower(coalesce(default_price_type_ref, ''))))
        and commercial_profile_state = 'aligned'
        and commercial_profile_verified_at is not null
      ) as is_mapping_aligned,
      case
        when not counterparty_active then 'DIRECTORY_CONFLICT'
        when commercial_contract_selection_mode = 'MANUAL_VERIFIED' then case
          when not manual_provenance_valid or not cashless_is_qualified then 'DIRECTORY_CONFLICT'
          when commercial_profile_state <> 'aligned' then 'DIRECTORY_CONFLICT'
          when commercial_profile_verified_at is null then 'UNVERIFIED_PROFILE'
          when not (cashless_is_qualified or cash_is_qualified) then 'NO_PAYMENT_PATH'
          else 'READY' end
        when raw_default_count = 0 then 'MISSING_CANONICAL_CONTRACT'
        when qualified_default_count <> 1 then 'DIRECTORY_CONFLICT'
        when default_price_type_ref is null
          or not coalesce(source_price_type_active, false)
          or coalesce(source_price_type_deleted, true)
          or canonical_local_price_type_id is null
          or not coalesce(canonical_local_price_type_active, false)
          or canonical_local_currency_status is distinct from 'resolved'
          or not canonical_currency_valid then 'UNKNOWN_PRICE_TYPE'
        when lower(coalesce(external_1c_contract_id, '')) = lower(default_contract_ref)
          and lower(coalesce(external_1c_price_type_id, '')) = lower(default_price_type_ref)
          and commercial_profile_state = 'aligned'
          and commercial_profile_verified_at is null then 'UNVERIFIED_PROFILE'
        when can_repair and (
          lower(coalesce(external_1c_contract_id, '')) <> lower(default_contract_ref)
          or lower(coalesce(external_1c_price_type_id, '')) <> lower(default_price_type_ref)
          or commercial_profile_state <> 'aligned'
          or not cashless_is_qualified
        ) then 'REPAIRABLE_STALE_PROFILE'
        when not (cashless_is_qualified or cash_is_qualified) then 'NO_PAYMENT_PATH'
        else 'READY'
      end as classification
    from evaluated
  )
  select
    classified.id,
    classified.display_name,
    classified.order_capable,
    classified.counterparty_active,
    classified.qualified_default_count,
    classified.default_contract_ref,
    classified.default_price_type_ref,
    classified.can_repair,
    classified.cashless_is_qualified,
    classified.cash_is_qualified,
    classified.any_payment_path,
    classified.is_mapping_aligned,
    classified.classification,
    case when classified.any_payment_path then 'PAYMENT_PATH_READY' else 'NO_PAYMENT_PATH' end,
    classified.commercial_contract_selection_mode = 'CANONICAL_DEFAULT'
      and classified.classification in ('REPAIRABLE_STALE_PROFILE', 'UNVERIFIED_PROFILE'),
    classified.commercial_profile_state,
    classified.commercial_profile_verified_at,
    classified.cart_item_count,
    classified.last_order_at,
    case
      when classified.classification = 'READY' then 'none'
      when classified.cart_item_count > 0 then 'high'
      when classified.last_order_at >= now() - interval '30 days' then 'high'
      when classified.order_capable and not classified.any_payment_path then 'medium'
      else 'low'
    end,
    case
      when classified.classification = 'READY' then 'Partner checkout has a governed payment path.'
      else 'Partner cannot reliably submit an order until commercial readiness is restored.'
    end,
    case when classified.commercial_contract_selection_mode = 'MANUAL_VERIFIED' and classified.classification <> 'READY'
      then 'Administrator must revalidate the selected manual contract; automatic fallback is disabled.'
      else case classified.classification
      when 'MISSING_CANONICAL_CONTRACT' then 'Create and publish one canonical default customer contract in 1C, then synchronize the directory.'
      when 'UNKNOWN_PRICE_TYPE' then 'Assign an active governed price type and valid settlement currency to the canonical contract in 1C.'
      when 'DIRECTORY_CONFLICT' then 'Resolve the counterparty or canonical-contract publication conflict in 1C, then synchronize the directory.'
      when 'NO_PAYMENT_PATH' then 'Configure at least one qualified payment contract through the governed commercial process.'
      when 'REPAIRABLE_STALE_PROFILE' then 'Automatic local reconciliation is pending; run the bounded readiness audit if it does not clear.'
      when 'UNVERIFIED_PROFILE' then 'Run governed local reconciliation to record verification against the current directory snapshot.'
      else 'No action required.'
    end end
  from classified
  order by classified.id;
end;
$$;
revoke all on function public.get_partner_commercial_readiness(uuid[],boolean) from public, anon, authenticated;
grant execute on function public.get_partner_commercial_readiness(uuid[],boolean) to service_role;

create or replace function public.get_admin_partner_commercial_readiness(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'selectionMode', company.commercial_contract_selection_mode,
    'selectedContractRef', company.external_1c_contract_id,
    'selectionVerifiedAt', company.commercial_contract_selected_at,
    'selectedBy', company.commercial_contract_selected_by,
    'canonicalContractRef', readiness.canonical_contract_ref,
    'defaultDivergence', case when company.commercial_contract_selection_mode = 'MANUAL_VERIFIED'
      and lower(coalesce(company.external_1c_contract_id,'')) <> lower(coalesce(readiness.canonical_contract_ref,''))
      then '1C_DEFAULT_DIFFERS_FROM_MANUAL_SELECTION' else null end,
    'cashlessQualified', readiness.cashless_qualified,
    'cashQualified', coalesce((public.qualify_partner_cash_contract_candidate(
      company.id, cash.contract_external_1c_id)->>'qualified')::boolean,false) and coalesce(cash.active,false),
    'class', readiness.readiness_class,
    'paymentPathClass', readiness.payment_path_class,
    'ready', readiness.readiness_class = 'READY',
    'repairable', readiness.repairable,
    'severity', readiness.severity,
    'activeCartItemCount', readiness.active_cart_item_count,
    'lastOrderAt', readiness.last_order_at,
    'lastVerifiedAt', readiness.commercial_profile_verified_at,
    'commercialConsequence', readiness.commercial_consequence,
    'requiredAction', readiness.required_action
  )
  from public.get_partner_commercial_readiness(array[p_company_id], false) readiness
  join public.partner_companies company on company.id = readiness.company_id
  left join public.partner_company_cash_contract_mappings cash on cash.company_id = company.id
  where public.has_internal_permission('admin.companies.view');
$$;
revoke all on function public.get_admin_partner_commercial_readiness(uuid) from public, anon;
grant execute on function public.get_admin_partner_commercial_readiness(uuid) to authenticated;

-- Preserve the existing bounded mapping projection and suppress canonical
-- suggestions for a governed manual selection.
alter function public.get_admin_partner_contract_mapping(uuid) rename to get_admin_partner_contract_mapping_canonical_v1;
revoke all on function public.get_admin_partner_contract_mapping_canonical_v1(uuid) from public, anon, authenticated;
create or replace function public.get_admin_partner_contract_mapping(p_company_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select public.get_admin_partner_contract_mapping_canonical_v1(p_company_id)
  || jsonb_build_object('selectionMode',company.commercial_contract_selection_mode,
     'selectionVerifiedAt',company.commercial_contract_selected_at,
     'selectedBy',company.commercial_contract_selected_by)
  || case when company.commercial_contract_selection_mode='MANUAL_VERIFIED'
       then jsonb_build_object('suggestedContractRef',null) else '{}'::jsonb end
from public.partner_companies company
where company.id=p_company_id and public.has_internal_permission('admin.companies.view');
$$;
revoke all on function public.get_admin_partner_contract_mapping(uuid) from public,anon;
grant execute on function public.get_admin_partner_contract_mapping(uuid) to authenticated;


-- Bulk automatic cash initialization also must respect separately governed roles.
alter function public.initialize_partner_cash_contract_from_primary(uuid,uuid,text,uuid,uuid,text,boolean)
  rename to initialize_partner_cash_contract_from_primary_canonical_v1;
revoke all on function public.initialize_partner_cash_contract_from_primary_canonical_v1(uuid,uuid,text,uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.initialize_partner_cash_contract_from_primary(
  p_company_id uuid,p_actor_user_id uuid,p_reason text,p_correlation_id uuid,
  p_batch_correlation_id uuid,p_source text,p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Cash contract initialization requires service role.' using errcode='42501';
  end if;
  if exists(select 1 from public.partner_companies where id=p_company_id and commercial_contract_selection_mode='MANUAL_VERIFIED') then
    return jsonb_build_object('companyId',p_company_id,'code','CASH_INITIALIZATION_MANUAL_SELECTION_REQUIRES_ADMIN','initialized',false);
  end if;
  return public.initialize_partner_cash_contract_from_primary_canonical_v1(
    p_company_id,p_actor_user_id,p_reason,p_correlation_id,p_batch_correlation_id,p_source,p_dry_run);
end;
$$;
revoke all on function public.initialize_partner_cash_contract_from_primary(uuid,uuid,text,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.initialize_partner_cash_contract_from_primary(uuid,uuid,text,uuid,uuid,text,boolean) to service_role;

-- Manual cash role is explicit; retain automatic initialization only for canonical mode.
create or replace function public.initialize_cash_contract_after_commercial_profile()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid;
  initialization_result jsonb;
begin
  if new.commercial_contract_selection_mode = 'MANUAL_VERIFIED'
    or new.status <> 'active'
    or new.external_1c_contract_id is null
    or new.commercial_profile_state <> 'aligned'
    or new.commercial_profile_verified_at is null
    or not (
      old.external_1c_contract_id is distinct from new.external_1c_contract_id
      or old.commercial_profile_state is distinct from new.commercial_profile_state
      or old.commercial_profile_verified_at is distinct from new.commercial_profile_verified_at
    ) then
    return new;
  end if;

  select run.actor_user_id into actor_id
  from public.partner_company_commercial_profile_sync_runs run
  where run.company_id = new.id and run.status = 'running'
  order by run.started_at desc, run.id desc
  limit 1;

  if actor_id is null then
    return new;
  end if;

  initialization_result := public.initialize_partner_cash_contract_from_primary(
    new.id,
    actor_id,
    'Initial cash contract setup after verified commercial profile.',
    gen_random_uuid(),
    gen_random_uuid(),
    'commercial_profile_sync',
    false
  );
  return new;
exception when others then
  raise warning 'Cash contract initialization after commercial profile failed for company %: %', new.id, sqlstate;
  return new;
end;
$$;

revoke all on function public.initialize_cash_contract_after_commercial_profile()
  from public, anon, authenticated;


create or replace function public.apply_admin_partner_manual_contract_selection(p_verification_id uuid)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare
  evidence public.partner_manual_contract_verifications%rowtype;
  company public.partner_companies%rowtype;
  actor uuid := auth.uid();
  cash_version integer;
  result jsonb;
  profile_run jsonb;
  main_snapshot jsonb;
  main_qualification jsonb;
  cash_qualification jsonb;
  readiness record;
  failure_code text := 'MANUAL_ONE_C_SYNC_FAILED';
begin
  if actor is null or not public.has_internal_permission('admin.integrations.manage')
    or not public.has_internal_permission('admin.partner_integrity.manage') then
    raise exception 'Manual commercial selection is not permitted.' using errcode='42501';
  end if;
  select * into evidence from public.partner_manual_contract_verifications where id=p_verification_id;
  if evidence.id is null or evidence.actor_user_id <> actor then
    raise exception 'Live verification evidence is unavailable.' using errcode='42501';
  end if;
  select * into company from public.partner_companies where id=evidence.company_id for update;
  if company.id is null then return jsonb_build_object('status','error','code','COUNTERPARTY_CONFLICT'); end if;
  if company.commercial_contract_verification_id=evidence.id
    and exists(select 1 from public.partner_company_commercial_profile_events event
      where event.company_id=company.id and event.correlation_id=evidence.correlation_id) then
    return jsonb_build_object('status','success','code','MANUAL_ONE_C_SYNC_SUCCESS',
      'readiness',(select readiness_class from public.get_partner_commercial_readiness(array[company.id],false)),
      'mainContractRef',company.external_1c_contract_id,'cashContractRef',evidence.cash_contract_ref,
      'priceTypeRef',company.external_1c_price_type_id,'correlationId',evidence.correlation_id,'idempotent',true);
  end if;
  select version into cash_version from public.partner_company_cash_contract_mappings
    where company_id=company.id for update;
  if evidence.expires_at <= now() or evidence.verified_at > now()
    or company.contract_mapping_version <> evidence.expected_contract_version
    or company.commercial_profile_version <> evidence.expected_profile_version
    or coalesce(cash_version,0) <> evidence.expected_cash_version then
    return jsonb_build_object('status','error','code','MANUAL_SELECTION_CONFLICT','correlationId',evidence.correlation_id);
  end if;
  if lower(coalesce(evidence.snapshot->'counterparty'->>'reference','')) <> lower(coalesce(company.external_1c_id,''))
    or nullif(evidence.profile_source->>'verifiedAt','') is null
    or (evidence.profile_source->>'verifiedAt')::timestamptz < now()-interval '5 minutes'
    or (evidence.profile_source->>'verifiedAt')::timestamptz > now()+interval '5 seconds' then
    return jsonb_build_object('status','error','code','COUNTERPARTY_CONFLICT','correlationId',evidence.correlation_id);
  end if;
  select value into main_snapshot from jsonb_array_elements(evidence.snapshot->'contracts') value
    where lower(value->>'reference')=lower(evidence.main_contract_ref);
  if main_snapshot is null
    or main_snapshot->>'ownerReference' is distinct from evidence.profile_source->>'counterpartyReference'
    or main_snapshot->>'priceTypeReference' is distinct from evidence.profile_source->>'priceTypeReference'
    or main_snapshot->>'organizationReference' is distinct from evidence.profile_source->>'organizationReference'
    or main_snapshot->>'settlementCurrencyReference' is distinct from evidence.profile_source->>'contractCurrencyReference'
    or main_snapshot->>'contractType' is distinct from evidence.profile_source->>'contractType'
    or (main_snapshot->>'active')::boolean is distinct from (evidence.profile_source->>'active')::boolean
    or (main_snapshot->>'deleted')::boolean is distinct from (evidence.profile_source->>'deleted')::boolean
    or (main_snapshot->>'default')::boolean is distinct from (evidence.profile_source->>'default')::boolean then
    return jsonb_build_object('status','error','code','COMMERCIAL_CONTRACT_INVALID','correlationId',evidence.correlation_id);
  end if;
  failure_code := public.validate_partner_manual_profile_source(company.external_1c_id,evidence.main_contract_ref,evidence.profile_source);
  if failure_code <> 'COMMERCIAL_PROFILE_SYNC_SUCCESS' then
    return jsonb_build_object('status','error','code',failure_code,'correlationId',evidence.correlation_id);
  end if;

  -- Subtransaction: every failure below rolls back snapshot, mappings, profile,
  -- selection provenance and all publication/mapping/audit events together.
  begin
    update public.partner_companies set commercial_contract_selection_mode='MANUAL_VERIFIED',
      commercial_contract_verification_id=evidence.id, commercial_contract_selected_by=actor,
      commercial_contract_selected_at=evidence.verified_at where id=company.id;
    failure_code := 'MANUAL_ONE_C_SNAPSHOT_CONFLICT';
    result := public.publish_admin_partner_company_one_c_snapshot(company.id,evidence.snapshot,
      jsonb_build_object('mainContractRef',company.external_1c_contract_id,'priceTypeRef',company.external_1c_price_type_id),
      jsonb_build_object('mainContractRef',evidence.main_contract_ref,'cashContractRef',evidence.cash_contract_ref,
        'priceTypeRef',evidence.profile_source->>'priceTypeReference','selectionMode','MANUAL_VERIFIED'),
      evidence.reason,evidence.correlation_id);
    if result->>'code' <> 'MANUAL_ONE_C_SNAPSHOT_PUBLISHED' then raise exception 'Snapshot validation failed.'; end if;
    main_qualification := public.qualify_partner_contract_candidate(company.id,evidence.main_contract_ref);
    failure_code := main_qualification->>'code';
    if not coalesce((main_qualification->>'qualified')::boolean,false) then raise exception 'Main qualification failed.'; end if;
    if evidence.cash_contract_ref is not null then
      cash_qualification := public.qualify_partner_cash_contract_candidate(company.id,evidence.cash_contract_ref);
      failure_code := cash_qualification->>'code';
      if not coalesce((cash_qualification->>'qualified')::boolean,false) then raise exception 'Cash qualification failed.'; end if;
    end if;
    result := public.map_admin_partner_company_contract(company.id,evidence.main_contract_ref,
      evidence.expected_contract_version,evidence.reason,evidence.correlation_id);
    failure_code := result->>'code';
    if failure_code <> 'CONTRACT_MAPPING_SUCCESS' then raise exception 'Main mapping failed.'; end if;
    if evidence.cash_contract_ref is not null then
      result := public.map_admin_partner_company_cash_contract(company.id,evidence.cash_contract_ref,
        evidence.expected_cash_version,evidence.reason,evidence.correlation_id);
      failure_code := result->>'code';
      if failure_code <> 'CASH_CONTRACT_MAPPING_SUCCESS' then raise exception 'Cash mapping failed.'; end if;
    end if;
    profile_run := public.begin_admin_partner_commercial_profile_sync(company.id,
      evidence.expected_profile_version,evidence.reason,evidence.correlation_id);
    failure_code := profile_run->>'code';
    if not coalesce((profile_run->>'claimed')::boolean,false) then raise exception 'Profile claim failed.'; end if;
    result := public.publish_partner_commercial_profile_sync((profile_run->>'runId')::uuid,evidence.profile_source);
    failure_code := result->>'code';
    if failure_code <> 'COMMERCIAL_PROFILE_SYNC_SUCCESS' then raise exception 'Profile publication failed.'; end if;
    select * into readiness from public.get_partner_commercial_readiness(array[company.id],false);
    failure_code := 'COMMERCIAL_PROFILE_NOT_READY';
    if readiness.readiness_class <> 'READY' then raise exception 'Final readiness failed.'; end if;
    return jsonb_build_object('status','success','code','MANUAL_ONE_C_SYNC_SUCCESS','readiness','READY',
      'mainContractRef',evidence.main_contract_ref,
      'cashContractRef',(select contract_external_1c_id from public.partner_company_cash_contract_mappings where company_id=company.id and active),
      'priceTypeRef',evidence.profile_source->>'priceTypeReference','selectionMode','MANUAL_VERIFIED',
      'correlationId',evidence.correlation_id,'idempotent',false);
  exception when others then
    return jsonb_build_object('status','error','code',coalesce(failure_code,'MANUAL_ONE_C_SYNC_FAILED'),
      'correlationId',evidence.correlation_id,'sqlState',SQLSTATE);
  end;
end;
$$;
revoke all on function public.apply_admin_partner_manual_contract_selection(uuid) from public,anon;
grant execute on function public.apply_admin_partner_manual_contract_selection(uuid) to authenticated;

comment on column public.partner_companies.commercial_contract_selection_mode is
  'Canonical automatic default or explicit live-verified administrator selection; 1C owns all source contract attributes.';
commit;
