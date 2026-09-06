begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.partner_company_directory_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  directory_sync_id uuid not null
    references public.one_c_counterparty_directory_syncs(sync_id) on delete restrict,
  company_id uuid not null
    references public.partner_companies(id) on delete restrict,
  previous_contract_ref text null,
  next_contract_ref text null,
  previous_price_type_ref text null,
  next_price_type_ref text null,
  previous_profile_state text not null,
  next_profile_state text not null,
  previous_contract_mapping_version integer not null,
  next_contract_mapping_version integer not null,
  previous_commercial_profile_version integer not null,
  next_commercial_profile_version integer not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  unique (directory_sync_id, company_id)
);

create index partner_company_directory_reconciliation_company_idx
  on public.partner_company_directory_reconciliation_events(company_id, occurred_at desc);

create trigger prevent_partner_company_directory_reconciliation_event_mutation
before update or delete on public.partner_company_directory_reconciliation_events
for each row execute function public.prevent_partner_company_commercial_event_mutation();

alter table public.partner_company_directory_reconciliation_events enable row level security;
revoke all on table public.partner_company_directory_reconciliation_events
  from public, anon, authenticated;
grant select, insert on table public.partner_company_directory_reconciliation_events
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
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
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

  with target_companies as materialized (
    select company.*
    from public.partner_companies company
    where company.status = 'active'
      and (p_company_ids is null or company.id = any(p_company_ids))
    order by company.id
    for update
  ), published_price_profiles as materialized (
    select distinct on (
      lower(profile.counterparty_external_1c_id),
      lower(profile.external_1c_id)
    )
      profile.counterparty_external_1c_id,
      profile.external_1c_id,
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
  ), canonical_defaults as materialized (
    select
      company.id as company_id,
      count(contract.id) as default_count,
      min(contract.external_1c_id) as default_contract_ref,
      min(contract.price_type_external_1c_id) as default_price_type_ref,
      min(contract.contract_currency_external_1c_id) as settlement_currency_ref
    from target_companies company
    left join public.one_c_counterparty_contracts contract
      on contract.is_published
     and contract.is_active
     and not contract.is_deleted
     and contract.is_default
     and lower(contract.counterparty_external_1c_id) = lower(company.external_1c_id)
     and lower(coalesce(contract.organization_external_1c_id, '')) =
       '4643d461-aa49-4b70-9486-a59f80ee6af8'
     and encode(convert_to(lower(btrim(coalesce(contract.contract_type, ''))), 'UTF8'), 'hex') =
       'd181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc'
    group by company.id
  ), price_freshness as materialized (
    select
      lower(price.external_1c_price_type_id) as price_type_ref,
      max(price.synced_at) as last_synced_at
    from public.product_prices price
    join (
      select distinct lower(canonical.default_price_type_ref) as price_type_ref
      from canonical_defaults canonical
      where canonical.default_count = 1
        and canonical.default_price_type_ref is not null
    ) governed on governed.price_type_ref = lower(price.external_1c_price_type_id)
    where price.is_published
      and price.is_active
      and price.currency_status = 'resolved'
    group by lower(price.external_1c_price_type_id)
  ), facts as (
    select
      company.id as company_id,
      company.external_1c_contract_id as previous_contract_ref,
      company.external_1c_price_type_id as previous_price_type_ref,
      company.commercial_profile_state as previous_profile_state,
      company.contract_mapping_version as previous_contract_mapping_version,
      company.commercial_profile_version as previous_commercial_profile_version,
      canonical.default_count,
      canonical.default_contract_ref,
      canonical.default_price_type_ref,
      source_price_type.external_1c_id as source_price_type_ref,
      source_price_type.currency_external_1c_id as source_price_currency_ref,
      source_price_type.is_active as source_price_type_active,
      source_price_type.is_deleted as source_price_type_deleted,
      local_price_type.id as local_price_type_id,
      local_price_type.is_active as local_price_type_active,
      local_price_type.currency_status as local_price_currency_status,
      local_price_type.currency_ref as local_price_currency_ref,
      freshness.last_synced_at,
      public.validate_commercial_currency_context(
        canonical.settlement_currency_ref,
        source_price_type.currency_external_1c_id,
        local_price_type.currency_ref
      ) as currency_validation
    from target_companies company
    join canonical_defaults canonical on canonical.company_id = company.id
    left join published_price_profiles source_price_type
      on canonical.default_count = 1
     and lower(source_price_type.counterparty_external_1c_id) = lower(company.external_1c_id)
     and lower(source_price_type.external_1c_id) = lower(canonical.default_price_type_ref)
    left join public.price_types local_price_type
      on canonical.default_count = 1
     and lower(local_price_type.external_ref) = lower(canonical.default_price_type_ref)
    left join price_freshness freshness
      on canonical.default_count = 1
     and freshness.price_type_ref = lower(canonical.default_price_type_ref)
  ), decisions as (
    select
      facts.*,
      (
        default_count = 1
        and default_contract_ref is not null
        and default_price_type_ref is not null
        and source_price_type_ref is not null
        and source_price_type_active
        and not source_price_type_deleted
        and local_price_type_id is not null
        and local_price_type_active
        and local_price_currency_status = 'resolved'
        and coalesce((currency_validation ->> 'valid')::boolean, false)
      ) as can_align,
      case
        when default_count = 0 then 'contract_missing'
        when default_count <> 1 then 'mismatch'
        when default_contract_ref is null then 'contract_invalid'
        when default_price_type_ref is null
          or source_price_type_ref is null
          or not coalesce(source_price_type_active, false)
          or coalesce(source_price_type_deleted, true)
          or local_price_type_id is null
          or not coalesce(local_price_type_active, false)
          or local_price_currency_status is distinct from 'resolved' then 'price_type_unknown'
        when not coalesce((currency_validation ->> 'valid')::boolean, false) then 'mismatch'
        when last_synced_at is null
          or last_synced_at < now() - interval '36 hours' then 'price_data_stale'
        else 'aligned'
      end as next_profile_state
    from facts
  ), changes as (
    select
      decision.*,
      case when can_align then default_contract_ref else previous_contract_ref end as next_contract_ref,
      case when can_align then default_price_type_ref else previous_price_type_ref end as next_price_type_ref
    from decisions decision
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
      'Authoritative 1C default-contract directory reconciliation.'
    from updated
    returning next_profile_state
  )
  select jsonb_build_object(
    'code', 'DIRECTORY_COMMERCIAL_RECONCILIATION_COMPLETE',
    'syncId', p_sync_id,
    'selectedCount', (select count(*) from facts),
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

create or replace function public.reconcile_partner_company_commercial_profiles()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  latest_sync_id uuid;
  reconciliation jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Commercial profile reconciliation requires service role.' using errcode = '42501';
  end if;

  select sync.sync_id into latest_sync_id
  from public.one_c_counterparty_directory_syncs sync
  where sync.status = 'succeeded'
  order by sync.finished_at desc, sync.sync_id desc
  limit 1;
  if latest_sync_id is null then
    return 0;
  end if;

  reconciliation := public.reconcile_partner_company_commercial_profiles_from_directory(
    latest_sync_id,
    null
  );
  return coalesce((reconciliation ->> 'updatedCount')::integer, 0);
end;
$$;

revoke all on function public.reconcile_partner_company_commercial_profiles()
  from public, anon, authenticated;
grant execute on function public.reconcile_partner_company_commercial_profiles()
  to service_role;

create or replace function public.reconcile_commercial_profiles_after_directory_sync()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.status = 'succeeded' and old.status is distinct from new.status then
    perform public.reconcile_partner_company_commercial_profiles_from_directory(
      new.sync_id,
      null
    );
  end if;
  return new;
end;
$$;

revoke all on function public.reconcile_commercial_profiles_after_directory_sync()
  from public, anon, authenticated;

comment on table public.partner_company_directory_reconciliation_events is
  'Append-only evidence for atomic partner contract and governed price-type alignment from a published 1C directory snapshot.';
comment on function public.reconcile_partner_company_commercial_profiles_from_directory(
  uuid, uuid[]
) is
  'Set-based service-role reconciliation of affected active companies to one unambiguous qualified Novotech default customer contract; no live 1C or checkout-time work.';

commit;
