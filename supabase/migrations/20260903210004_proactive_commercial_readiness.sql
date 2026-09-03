begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.one_c_counterparty_directory_syncs
  add column if not exists commercial_candidate_company_ids uuid[] not null default '{}'::uuid[],
  add column if not exists commercial_candidate_count integer not null default 0,
  add column if not exists commercial_candidate_selection_ms integer null,
  add column if not exists commercial_reconciled_count integer not null default 0,
  add column if not exists commercial_reconciliation_ms integer null;

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
      company.external_1c_id as company_counterparty_ref,
      company.external_1c_contract_id,
      company.external_1c_price_type_id,
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
    left join cart_exposure cart on cart.company_id = company.id
    left join order_exposure orders on orders.company_id = company.id
    where not p_order_capable_only or capability.company_id is not null
  ), evaluated as (
    select
      facts.*,
      (
        counterparty_active
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
      ) as cashless_is_qualified,
      (
        counterparty_active
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
          lower(coalesce(contract_currency_external_1c_id, ''))
      ) as cash_is_qualified
    from facts
  ), classified as (
    select
      evaluated.*,
      cashless_is_qualified or cash_is_qualified as any_payment_path,
      (
        lower(coalesce(external_1c_contract_id, '')) = lower(coalesce(default_contract_ref, ''))
        and lower(coalesce(external_1c_price_type_id, '')) = lower(coalesce(default_price_type_ref, ''))
        and commercial_profile_state = 'aligned'
        and commercial_profile_verified_at is not null
      ) as is_mapping_aligned,
      case
        when not counterparty_active then 'DIRECTORY_CONFLICT'
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
    classified.classification in ('REPAIRABLE_STALE_PROFILE', 'UNVERIFIED_PROFILE'),
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
    case classified.classification
      when 'MISSING_CANONICAL_CONTRACT' then 'Create and publish one canonical default customer contract in 1C, then synchronize the directory.'
      when 'UNKNOWN_PRICE_TYPE' then 'Assign an active governed price type and valid settlement currency to the canonical contract in 1C.'
      when 'DIRECTORY_CONFLICT' then 'Resolve the counterparty or canonical-contract publication conflict in 1C, then synchronize the directory.'
      when 'NO_PAYMENT_PATH' then 'Configure at least one qualified payment contract through the governed commercial process.'
      when 'REPAIRABLE_STALE_PROFILE' then 'Automatic local reconciliation is pending; run the bounded readiness audit if it does not clear.'
      when 'UNVERIFIED_PROFILE' then 'Run governed local reconciliation to record verification against the current directory snapshot.'
      else 'No action required.'
    end
  from classified
  order by classified.id;
end;
$$;

revoke all on function public.get_partner_commercial_readiness(uuid[], boolean)
  from public, anon, authenticated;
grant execute on function public.get_partner_commercial_readiness(uuid[], boolean)
  to service_role;

create or replace function public.reconcile_partner_company_commercial_profiles_from_directory(
  p_sync_id uuid,
  p_company_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_sync public.one_c_counterparty_directory_syncs%rowtype;
  result jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Directory commercial reconciliation requires service role.' using errcode = '42501';
  end if;
  if p_sync_id is null
    or (p_company_ids is not null and cardinality(p_company_ids) not between 1 and 100) then
    raise exception 'Invalid directory commercial reconciliation request.' using errcode = '22023';
  end if;

  select * into target_sync
  from public.one_c_counterparty_directory_syncs source
  where source.sync_id = p_sync_id and source.status = 'succeeded';
  if target_sync.sync_id is null then
    raise exception 'Succeeded directory synchronization was not found.' using errcode = 'P0002';
  end if;

  perform 1
  from public.partner_companies company
  where company.status = 'active'
    and (p_company_ids is null or company.id = any(p_company_ids))
  order by company.id
  for update;

  with readiness as materialized (
    select *
    from public.get_partner_commercial_readiness(p_company_ids, false)
  ), changes as (
    select
      company.id as company_id,
      company.external_1c_contract_id as previous_contract_ref,
      company.external_1c_price_type_id as previous_price_type_ref,
      company.commercial_profile_state as previous_profile_state,
      company.contract_mapping_version as previous_contract_mapping_version,
      company.commercial_profile_version as previous_commercial_profile_version,
      case
        when readiness.canonical_repairable then readiness.canonical_contract_ref
        else company.external_1c_contract_id
      end as next_contract_ref,
      case
        when readiness.canonical_repairable then readiness.canonical_price_type_ref
        else company.external_1c_price_type_id
      end as next_price_type_ref,
      case readiness.readiness_class
        when 'MISSING_CANONICAL_CONTRACT' then 'contract_missing'
        when 'UNKNOWN_PRICE_TYPE' then 'price_type_unknown'
        when 'DIRECTORY_CONFLICT' then 'mismatch'
        when 'NO_PAYMENT_PATH' then 'contract_invalid'
        else case when readiness.canonical_repairable then 'aligned' else company.commercial_profile_state end
      end as next_profile_state,
      readiness.canonical_repairable
    from public.partner_companies company
    join readiness on readiness.company_id = company.id
  ), updated as (
    update public.partner_companies company
    set
      external_1c_contract_id = change.next_contract_ref,
      external_1c_price_type_id = change.next_price_type_ref,
      contract_mapping_version = company.contract_mapping_version
        + case when lower(coalesce(company.external_1c_contract_id, '')) <>
          lower(coalesce(change.next_contract_ref, '')) then 1 else 0 end,
      commercial_profile_version = company.commercial_profile_version + 1,
      commercial_profile_state = change.next_profile_state,
      commercial_profile_verified_at = case
        when change.next_profile_state = 'aligned' then target_sync.finished_at
        else null
      end,
      updated_at = now()
    from changes change
    where company.id = change.company_id
      and (
        lower(coalesce(company.external_1c_contract_id, '')) <>
          lower(coalesce(change.next_contract_ref, ''))
        or lower(coalesce(company.external_1c_price_type_id, '')) <>
          lower(coalesce(change.next_price_type_ref, ''))
        or company.commercial_profile_state is distinct from change.next_profile_state
        or (change.canonical_repairable and company.commercial_profile_verified_at is null)
      )
    returning
      company.id as company_id,
      change.previous_contract_ref,
      company.external_1c_contract_id as next_contract_ref,
      change.previous_price_type_ref,
      company.external_1c_price_type_id as next_price_type_ref,
      change.previous_profile_state,
      company.commercial_profile_state as next_profile_state,
      change.previous_contract_mapping_version,
      company.contract_mapping_version as next_contract_mapping_version,
      change.previous_commercial_profile_version,
      company.commercial_profile_version as next_commercial_profile_version
  ), audited as (
    insert into public.partner_company_directory_reconciliation_events(
      directory_sync_id,
      company_id,
      previous_contract_ref,
      next_contract_ref,
      previous_price_type_ref,
      next_price_type_ref,
      previous_profile_state,
      next_profile_state,
      previous_contract_mapping_version,
      next_contract_mapping_version,
      previous_commercial_profile_version,
      next_commercial_profile_version,
      reason
    )
    select
      p_sync_id,
      updated.company_id,
      updated.previous_contract_ref,
      updated.next_contract_ref,
      updated.previous_price_type_ref,
      updated.next_price_type_ref,
      updated.previous_profile_state,
      updated.next_profile_state,
      updated.previous_contract_mapping_version,
      updated.next_contract_mapping_version,
      updated.previous_commercial_profile_version,
      updated.next_commercial_profile_version,
      'Targeted commercial readiness reconciliation from the authoritative local 1C directory.'
    from updated
    on conflict (directory_sync_id, company_id) do nothing
    returning next_profile_state
  )
  select jsonb_build_object(
    'code', 'DIRECTORY_COMMERCIAL_RECONCILIATION_COMPLETE',
    'syncId', p_sync_id,
    'selectedCount', (select count(*) from readiness),
    'updatedCount', (select count(*) from audited),
    'alignedCount', (select count(*) from audited where next_profile_state = 'aligned'),
    'nonAlignedCount', (select count(*) from audited where next_profile_state <> 'aligned')
  ) into result;

  return result;
end;
$$;

revoke all on function public.reconcile_partner_company_commercial_profiles_from_directory(
  uuid, uuid[]
) from public, anon, authenticated;
grant execute on function public.reconcile_partner_company_commercial_profiles_from_directory(
  uuid, uuid[]
) to service_role;

create or replace function public.reconcile_commercial_profiles_after_directory_sync()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  chunk_start integer;
  chunk_ids uuid[];
  chunk_result jsonb;
  reconciled_count integer := 0;
  reconciliation_started_at timestamptz;
begin
  if new.status = 'succeeded' and old.status is distinct from new.status
    and cardinality(new.commercial_candidate_company_ids) > 0 then
    reconciliation_started_at := clock_timestamp();
    for chunk_start in 1..cardinality(new.commercial_candidate_company_ids) by 100 loop
      chunk_ids := new.commercial_candidate_company_ids[chunk_start:chunk_start + 99];
      chunk_result := public.reconcile_partner_company_commercial_profiles_from_directory(
        new.sync_id,
        chunk_ids
      );
      reconciled_count := reconciled_count + coalesce((chunk_result ->> 'updatedCount')::integer, 0);
    end loop;
    update public.one_c_counterparty_directory_syncs sync
    set commercial_reconciled_count = reconciled_count,
        commercial_reconciliation_ms = greatest(
          0,
          round(extract(epoch from (clock_timestamp() - reconciliation_started_at)) * 1000)::integer
        ),
        updated_at = now()
    where sync.sync_id = new.sync_id;
  end if;
  return new;
end;
$$;

revoke all on function public.reconcile_commercial_profiles_after_directory_sync()
  from public, anon, authenticated;

create or replace function public.publish_one_c_counterparty_directory(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  published_count integer;
  sync public.one_c_counterparty_directory_syncs%rowtype;
  candidate_ids uuid[] := '{}'::uuid[];
  candidate_started_at timestamptz := clock_timestamp();
  candidate_selection_ms integer;
  publication_result jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Directory publication requires service role.' using errcode = '42501';
  end if;

  select * into sync
  from public.one_c_counterparty_directory_syncs
  where sync_id = p_sync_id and status = 'running'
  for update;

  if sync.sync_id is null then
    raise exception 'Active directory synchronization was not found.' using errcode = 'P0002';
  end if;
  if sync.fetched_counterparties <= 0 or sync.staged_counterparties <= 0
    or sync.duplicate_counterparty_rows <> 0
    or sync.fetched_counterparties <> sync.staged_counterparties + sync.skipped_counterparties
    or sync.pages_processed <= 0 then
    raise exception 'Directory synchronization is incomplete.' using errcode = '22023';
  end if;

  with old_counterparties as materialized (
    select lower(source.external_1c_id) as counterparty_ref,
      jsonb_build_array(source.is_active, source.is_deleted,
        source.counterparty_type_code, source.government_body_type_code) as facts
    from public.one_c_counterparties source where source.is_published
  ), next_counterparties as materialized (
    select lower(source.external_1c_id) as counterparty_ref,
      jsonb_build_array(source.is_active, source.is_deleted,
        source.counterparty_type_code, source.government_body_type_code) as facts
    from public.one_c_counterparties source where source.sync_id = p_sync_id
  ), old_contracts as materialized (
    select lower(source.counterparty_external_1c_id) as counterparty_ref,
      jsonb_agg(jsonb_build_array(
        lower(source.external_1c_id), source.is_active, source.is_deleted,
        source.is_default, lower(coalesce(source.contract_type, '')),
        lower(coalesce(source.organization_external_1c_id, '')),
        lower(coalesce(source.price_type_external_1c_id, '')),
        lower(coalesce(source.contract_currency_external_1c_id, ''))
      ) order by lower(source.external_1c_id)) as facts
    from public.one_c_counterparty_contracts source
    where source.is_published
    group by lower(source.counterparty_external_1c_id)
  ), next_contracts as materialized (
    select lower(source.counterparty_external_1c_id) as counterparty_ref,
      jsonb_agg(jsonb_build_array(
        lower(source.external_1c_id), source.is_active, source.is_deleted,
        source.is_default, lower(coalesce(source.contract_type, '')),
        lower(coalesce(source.organization_external_1c_id, '')),
        lower(coalesce(source.price_type_external_1c_id, '')),
        lower(coalesce(source.contract_currency_external_1c_id, ''))
      ) order by lower(source.external_1c_id)) as facts
    from public.one_c_counterparty_contracts source
    where source.sync_id = p_sync_id
    group by lower(source.counterparty_external_1c_id)
  ), old_price_profiles as materialized (
    select lower(source.counterparty_external_1c_id) as counterparty_ref,
      jsonb_agg(jsonb_build_array(
        lower(source.external_1c_id), source.is_active, source.is_deleted,
        lower(coalesce(source.currency_external_1c_id, ''))
      ) order by lower(source.external_1c_id)) as facts
    from public.one_c_counterparty_price_profiles source
    where source.is_published
    group by lower(source.counterparty_external_1c_id)
  ), next_price_profiles as materialized (
    select lower(source.counterparty_external_1c_id) as counterparty_ref,
      jsonb_agg(jsonb_build_array(
        lower(source.external_1c_id), source.is_active, source.is_deleted,
        lower(coalesce(source.currency_external_1c_id, ''))
      ) order by lower(source.external_1c_id)) as facts
    from public.one_c_counterparty_price_profiles source
    where source.sync_id = p_sync_id
    group by lower(source.counterparty_external_1c_id)
  ), material_changes as (
    select company.id
    from public.partner_companies company
    left join old_counterparties old_counterparty
      on old_counterparty.counterparty_ref = lower(company.external_1c_id)
    left join next_counterparties next_counterparty
      on next_counterparty.counterparty_ref = lower(company.external_1c_id)
    left join old_contracts old_contract
      on old_contract.counterparty_ref = lower(company.external_1c_id)
    left join next_contracts next_contract
      on next_contract.counterparty_ref = lower(company.external_1c_id)
    left join old_price_profiles old_price
      on old_price.counterparty_ref = lower(company.external_1c_id)
    left join next_price_profiles next_price
      on next_price.counterparty_ref = lower(company.external_1c_id)
    where company.status = 'active'
      and jsonb_build_array(old_counterparty.facts, old_contract.facts, old_price.facts)
        is distinct from
        jsonb_build_array(next_counterparty.facts, next_contract.facts, next_price.facts)
  )
  select coalesce(array_agg(change.id order by change.id), '{}'::uuid[])
  into candidate_ids
  from material_changes change;

  candidate_selection_ms := greatest(
    0,
    round(extract(epoch from (clock_timestamp() - candidate_started_at)) * 1000)::integer
  );

  update public.one_c_counterparties set is_published = false where is_published;
  update public.one_c_counterparty_contracts set is_published = false where is_published;
  update public.one_c_counterparty_price_profiles set is_published = false where is_published;
  update public.one_c_delivery_carriers set is_published = false where is_published;

  update public.one_c_counterparties counterparty
  set is_published = true, portal_company_id = company.id, updated_at = now()
  from public.partner_companies company
  where counterparty.sync_id = p_sync_id
    and lower(company.external_1c_id) = lower(counterparty.external_1c_id);
  update public.one_c_counterparties set is_published = true, updated_at = now()
  where sync_id = p_sync_id and not is_published;
  update public.one_c_counterparty_contracts set is_published = true where sync_id = p_sync_id;
  update public.one_c_counterparty_price_profiles set is_published = true where sync_id = p_sync_id;
  update public.one_c_delivery_carriers set is_published = true where sync_id = p_sync_id;

  select count(*) into published_count
  from public.one_c_counterparties
  where sync_id = p_sync_id and is_published;

  update public.one_c_counterparty_directory_syncs target_sync
  set status = 'succeeded',
      finished_at = now(),
      lock_acquired_at = null,
      published_counterparties = published_count,
      portal_linked = (
        select count(*)
        from public.one_c_counterparties
        where sync_id = p_sync_id and portal_company_id is not null
      ),
      commercial_candidate_company_ids = candidate_ids,
      commercial_candidate_count = cardinality(candidate_ids),
      commercial_candidate_selection_ms = candidate_selection_ms,
      updated_at = now()
  where target_sync.sync_id = p_sync_id;

  select jsonb_build_object(
    'published', published_count,
    'portalLinked', target_sync.portal_linked,
    'carriers', (
      select count(*)
      from public.one_c_delivery_carriers
      where sync_id = p_sync_id and is_published
    ),
    'syncId', p_sync_id,
    'commercialCandidateCount', target_sync.commercial_candidate_count,
    'commercialCandidateSelectionMs', target_sync.commercial_candidate_selection_ms,
    'commercialReconciledCount', target_sync.commercial_reconciled_count,
    'commercialReconciliationMs', target_sync.commercial_reconciliation_ms
  ) into publication_result
  from public.one_c_counterparty_directory_syncs target_sync
  where target_sync.sync_id = p_sync_id;

  return publication_result;
end;
$$;

revoke all on function public.publish_one_c_counterparty_directory(uuid)
  from public, anon, authenticated;
grant execute on function public.publish_one_c_counterparty_directory(uuid)
  to service_role;

create or replace function public.run_partner_commercial_readiness_safety_net(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  latest_sync_id uuid;
  candidate_ids uuid[] := '{}'::uuid[];
  candidate_started_at timestamptz := clock_timestamp();
  reconciliation_started_at timestamptz;
  total_started_at timestamptz := clock_timestamp();
  candidate_selection_ms integer;
  reconciliation_ms integer := 0;
  reconciliation jsonb := '{}'::jsonb;
  result jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Commercial readiness safety audit requires service role.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'Commercial readiness safety audit limit must be between 1 and 100.' using errcode = '22023';
  end if;

  select sync.sync_id into latest_sync_id
  from public.one_c_counterparty_directory_syncs sync
  where sync.status = 'succeeded'
  order by sync.finished_at desc, sync.sync_id desc
  limit 1;
  if latest_sync_id is null then
    return jsonb_build_object('status', 'no_directory_snapshot', 'selectedCount', 0);
  end if;

  select coalesce(array_agg(candidate.company_id order by candidate.company_id), '{}'::uuid[])
  into candidate_ids
  from (
    select readiness.company_id
    from public.get_partner_commercial_readiness(null, true) readiness
    where readiness.repairable
    order by
      case readiness.severity when 'high' then 1 when 'medium' then 2 else 3 end,
      readiness.company_id
    limit p_limit
  ) candidate;
  candidate_selection_ms := greatest(
    0,
    round(extract(epoch from (clock_timestamp() - candidate_started_at)) * 1000)::integer
  );

  if cardinality(candidate_ids) > 0 then
    reconciliation_started_at := clock_timestamp();
    reconciliation := public.reconcile_partner_company_commercial_profiles_from_directory(
      latest_sync_id,
      candidate_ids
    );
    reconciliation_ms := greatest(
      0,
      round(extract(epoch from (clock_timestamp() - reconciliation_started_at)) * 1000)::integer
    );
  end if;

  with readiness as materialized (
    select * from public.get_partner_commercial_readiness(null, true)
  ), counts as (
    select
      count(*)::integer as total_order_capable,
      count(*) filter (where readiness_class = 'READY')::integer as ready,
      count(*) filter (where repairable)::integer as repairable_remaining,
      count(*) filter (where not repairable and readiness_class <> 'READY')::integer as irreparable,
      count(*) filter (where payment_path_class = 'NO_PAYMENT_PATH')::integer as no_payment_path,
      count(*) filter (where readiness_class = 'UNVERIFIED_PROFILE')::integer as never_verified,
      count(*) filter (where commercial_profile_state = 'mismatch')::integer as still_mismatch,
      count(*) filter (
        where readiness_class <> 'READY' and active_cart_item_count > 0
      )::integer as blocked_with_non_empty_cart
    from readiness
  )
  select jsonb_build_object(
    'status', 'completed',
    'syncId', latest_sync_id,
    'selectedCount', cardinality(candidate_ids),
    'updatedCount', coalesce((reconciliation ->> 'updatedCount')::integer, 0),
    'candidateSelectionMs', candidate_selection_ms,
    'reconciliationMs', reconciliation_ms,
    'perCompanyReconciliationMs', case
      when cardinality(candidate_ids) = 0 then 0
      else round(reconciliation_ms::numeric / cardinality(candidate_ids), 2)
    end,
    'totalMs', greatest(0, round(extract(epoch from (clock_timestamp() - total_started_at)) * 1000)::integer),
    'totalOrderCapable', counts.total_order_capable,
    'ready', counts.ready,
    'repairableRemaining', counts.repairable_remaining,
    'irreparable', counts.irreparable,
    'noPaymentPath', counts.no_payment_path,
    'neverVerified', counts.never_verified,
    'stillMismatch', counts.still_mismatch,
    'blockedWithNonEmptyCart', counts.blocked_with_non_empty_cart,
    'issues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'companyId', readiness.company_id,
        'companyName', readiness.company_name,
        'readinessClass', readiness.readiness_class,
        'paymentPathClass', readiness.payment_path_class,
        'severity', readiness.severity,
        'activeCartItemCount', readiness.active_cart_item_count,
        'lastVerifiedAt', readiness.commercial_profile_verified_at,
        'commercialConsequence', readiness.commercial_consequence,
        'requiredAction', readiness.required_action
      ) order by
        case readiness.severity when 'high' then 1 when 'medium' then 2 else 3 end,
        readiness.company_name,
        readiness.company_id)
      from readiness
      where readiness.readiness_class <> 'READY'
    ), '[]'::jsonb)
  ) into result
  from counts;

  return result;
end;
$$;

revoke all on function public.run_partner_commercial_readiness_safety_net(integer)
  from public, anon, authenticated;
grant execute on function public.run_partner_commercial_readiness_safety_net(integer)
  to service_role;

create or replace function public.reconcile_partner_company_commercial_profiles()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  audit jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Commercial profile reconciliation requires service role.' using errcode = '42501';
  end if;
  audit := public.run_partner_commercial_readiness_safety_net(100);
  return coalesce((audit ->> 'updatedCount')::integer, 0);
end;
$$;

revoke all on function public.reconcile_partner_company_commercial_profiles()
  from public, anon, authenticated;
grant execute on function public.reconcile_partner_company_commercial_profiles()
  to service_role;

create or replace function public.get_admin_partner_commercial_readiness(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
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
  where public.has_internal_permission('admin.companies.view');
$$;

revoke all on function public.get_admin_partner_commercial_readiness(uuid)
  from public, anon;
grant execute on function public.get_admin_partner_commercial_readiness(uuid)
  to authenticated;

comment on function public.get_partner_commercial_readiness(uuid[], boolean) is
  'Single set-based commercial readiness definition derived from governed checkout contract, price type, counterparty, payment-path, permission, cart and order facts.';
comment on function public.run_partner_commercial_readiness_safety_net(integer) is
  'Bounded service-role safety audit that repairs only stale order-capable company projections from the latest local directory snapshot.';
comment on function public.get_admin_partner_commercial_readiness(uuid) is
  'Permission-gated company diagnostic explaining commercial readiness, consequence, severity and required governed action.';
comment on column public.one_c_counterparty_directory_syncs.commercial_candidate_company_ids is
  'Affected active companies selected from material counterparty, contract and price-profile changes in this directory publication.';

commit;


