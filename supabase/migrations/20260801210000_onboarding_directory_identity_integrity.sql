begin;

alter table public.one_c_counterparty_directory_syncs
  add column if not exists fetched_counterparties integer not null default 0,
  add column if not exists staged_counterparties integer not null default 0,
  add column if not exists skipped_counterparties integer not null default 0,
  add column if not exists malformed_fiscal_codes integer not null default 0,
  add column if not exists normalized_fiscal_codes_changed integer not null default 0,
  add column if not exists duplicate_counterparty_rows integer not null default 0,
  add column if not exists pages_processed integer not null default 0,
  add column if not exists duration_ms integer not null default 0;

create or replace function public.normalize_moldova_fiscal_code(p_value text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  normalized text;
begin
  if p_value is null then return null; end if;
  normalized := regexp_replace(
    translate(btrim(p_value), chr(160) || chr(8239) || chr(8203) || chr(65279), '    '),
    '[[:space:][:punct:]]+', '', 'g'
  );
  return case when normalized ~ '^[0-9]+$' then normalized else null end;
end;
$$;

create or replace function public.set_canonical_counterparty_fiscal_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.normalized_fiscal_code := public.normalize_moldova_fiscal_code(new.fiscal_code);
  return new;
end;
$$;

drop trigger if exists one_c_counterparties_canonical_fiscal_code
  on public.one_c_counterparties;
create trigger one_c_counterparties_canonical_fiscal_code
before insert or update of fiscal_code on public.one_c_counterparties
for each row execute function public.set_canonical_counterparty_fiscal_code();

update public.one_c_counterparties
set normalized_fiscal_code = public.normalize_moldova_fiscal_code(fiscal_code)
where normalized_fiscal_code is distinct from public.normalize_moldova_fiscal_code(fiscal_code);

create or replace function public.set_canonical_onboarding_fiscal_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized text;
begin
  if nullif(btrim(new.requested_fiscal_code), '') is null then
    new.requested_fiscal_code := null;
    return new;
  end if;
  normalized := public.normalize_moldova_fiscal_code(new.requested_fiscal_code);
  if normalized is null then
    raise exception 'invalid_fiscal_code' using errcode = '22023';
  end if;
  new.requested_fiscal_code := normalized;
  return new;
end;
$$;

drop trigger if exists access_requests_canonical_fiscal_code on public.access_requests;
create trigger access_requests_canonical_fiscal_code
before insert or update of requested_fiscal_code on public.access_requests
for each row execute function public.set_canonical_onboarding_fiscal_code();

drop trigger if exists onboarding_revisions_canonical_fiscal_code
  on public.onboarding_application_revisions;
create trigger onboarding_revisions_canonical_fiscal_code
before insert or update of requested_fiscal_code on public.onboarding_application_revisions
for each row execute function public.set_canonical_onboarding_fiscal_code();

update public.access_requests
set requested_fiscal_code = public.normalize_moldova_fiscal_code(requested_fiscal_code)
where public.normalize_moldova_fiscal_code(requested_fiscal_code) is not null
  and requested_fiscal_code is distinct from public.normalize_moldova_fiscal_code(requested_fiscal_code);

update public.onboarding_application_revisions
set requested_fiscal_code = public.normalize_moldova_fiscal_code(requested_fiscal_code)
where public.normalize_moldova_fiscal_code(requested_fiscal_code) is not null
  and requested_fiscal_code is distinct from public.normalize_moldova_fiscal_code(requested_fiscal_code);

create or replace function public.get_onboarding_request_detail_v4(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  base jsonb;
  candidate_payload jsonb;
begin
  base := public.get_onboarding_request_detail_v3(p_request_id);
  if base is null then return null; end if;

  with request_context as (
    select
      revision.requested_fiscal_code,
      lower(regexp_replace(revision.requested_company_name, '[^[:alnum:]]+', '', 'g')) as normalized_name
    from public.access_requests request
    join public.onboarding_application_revisions revision
      on revision.id = request.current_revision_id
    where request.id = p_request_id
  ), selected as (
    select
      candidate.*,
      case
        when candidate.normalized_fiscal_code = public.normalize_moldova_fiscal_code(context.requested_fiscal_code) then 0
        else 1
      end as priority,
      case
        when candidate.normalized_fiscal_code = public.normalize_moldova_fiscal_code(context.requested_fiscal_code)
          then 'exact_fiscal_code'
        when nullif(btrim(coalesce(candidate.fiscal_code, '')), '') is null
          then 'exact_name_fiscal_missing'
        when candidate.normalized_fiscal_code is null
          then 'exact_name_fiscal_malformed'
        else 'exact_name_different_fiscal'
      end as match_reason,
      case
        when nullif(btrim(coalesce(candidate.fiscal_code, '')), '') is null then 'missing'
        when candidate.normalized_fiscal_code is null then 'malformed'
        else 'valid'
      end as fiscal_code_state
    from public.one_c_counterparties candidate
    cross join request_context context
    where candidate.is_published
      and (
        candidate.normalized_fiscal_code = public.normalize_moldova_fiscal_code(context.requested_fiscal_code)
        or candidate.normalized_name = context.normalized_name
      )
    order by priority, candidate.name, candidate.id
    limit 20
  ), contract_counts as (
    select contract.counterparty_external_1c_id, count(*)::integer as contract_count
    from public.one_c_counterparty_contracts contract
    join selected on selected.external_1c_id = contract.counterparty_external_1c_id
    where contract.is_published and contract.is_active and not contract.is_deleted
    group by contract.counterparty_external_1c_id
  ), profile_counts as (
    select profile.counterparty_external_1c_id, count(*)::integer as profile_count
    from public.one_c_counterparty_price_profiles profile
    join selected on selected.external_1c_id = profile.counterparty_external_1c_id
    where profile.is_published and profile.is_active and not profile.is_deleted
    group by profile.counterparty_external_1c_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', selected.id,
    'external1cId', selected.external_1c_id,
    'externalCode', selected.external_code,
    'companyName', selected.name,
    'fiscalCode', selected.fiscal_code,
    'active', selected.is_active and not selected.is_deleted,
    'locality', selected.locality,
    'assignedManager', selected.assigned_manager_name,
    'contractCount', coalesce(contract_counts.contract_count, 0),
    'priceProfileCount', coalesce(profile_counts.profile_count, 0),
    'portalLinkageState', case when selected.portal_company_id is null then 'not_linked' else 'already_linked' end,
    'synchronizedAt', selected.synchronized_at,
    'matchReason', selected.match_reason,
    'published', selected.is_published,
    'fiscalCodeState', selected.fiscal_code_state,
    'contracts', coalesce((
      select jsonb_agg(jsonb_build_object('name', contract.name, 'code', contract.code) order by contract.name)
      from public.one_c_counterparty_contracts contract
      where contract.counterparty_external_1c_id = selected.external_1c_id
        and contract.is_published and contract.is_active and not contract.is_deleted
    ), '[]'::jsonb),
    'priceProfiles', coalesce((
      select jsonb_agg(jsonb_build_object('id', profile.id, 'name', profile.name, 'code', profile.code) order by profile.name)
      from public.one_c_counterparty_price_profiles profile
      where profile.counterparty_external_1c_id = selected.external_1c_id
        and profile.is_published and profile.is_active and not profile.is_deleted
    ), '[]'::jsonb)
  ) order by selected.priority, selected.name, selected.id), '[]'::jsonb)
  into candidate_payload
  from selected
  left join contract_counts on contract_counts.counterparty_external_1c_id = selected.external_1c_id
  left join profile_counts on profile_counts.counterparty_external_1c_id = selected.external_1c_id;

  return jsonb_set(base, '{candidates}', candidate_payload)
    || jsonb_build_object('directoryFiscalMatchCount', (
      select count(*)
      from public.one_c_counterparties candidate
      join public.access_requests request on request.id = p_request_id
      join public.onboarding_application_revisions revision on revision.id = request.current_revision_id
      where candidate.is_published
        and candidate.normalized_fiscal_code = public.normalize_moldova_fiscal_code(revision.requested_fiscal_code)
    ));
end;
$$;

revoke all on function public.get_onboarding_request_detail_v4(uuid) from public, anon;
grant execute on function public.get_onboarding_request_detail_v4(uuid) to authenticated;

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
begin
  if auth.role() <> 'service_role' then
    raise exception 'Directory publication requires service role.' using errcode = '42501';
  end if;
  select * into sync from public.one_c_counterparty_directory_syncs
  where sync_id = p_sync_id and status = 'running' for update;
  if sync.sync_id is null then
    raise exception 'Active directory synchronization was not found.' using errcode = 'P0002';
  end if;
  if sync.fetched_counterparties <= 0
    or sync.staged_counterparties <= 0
    or sync.duplicate_counterparty_rows <> 0
    or sync.fetched_counterparties <> sync.staged_counterparties + sync.skipped_counterparties
    or sync.pages_processed <= 0 then
    raise exception 'Directory synchronization is incomplete.' using errcode = '22023';
  end if;

  update public.one_c_counterparties set is_published = false where is_published;
  update public.one_c_counterparty_contracts set is_published = false where is_published;
  update public.one_c_counterparty_price_profiles set is_published = false where is_published;

  update public.one_c_counterparties counterparty
  set is_published = true, portal_company_id = company.id, updated_at = now()
  from public.partner_companies company
  where counterparty.sync_id = p_sync_id
    and lower(company.external_1c_id) = lower(counterparty.external_1c_id);
  update public.one_c_counterparties set is_published = true, updated_at = now()
  where sync_id = p_sync_id and not is_published;
  update public.one_c_counterparty_contracts set is_published = true where sync_id = p_sync_id;
  update public.one_c_counterparty_price_profiles set is_published = true where sync_id = p_sync_id;

  select count(*) into published_count from public.one_c_counterparties
  where sync_id = p_sync_id and is_published;
  update public.one_c_counterparty_directory_syncs
  set status = 'succeeded', finished_at = now(), lock_acquired_at = null,
      published_counterparties = published_count,
      portal_linked = (select count(*) from public.one_c_counterparties where sync_id = p_sync_id and portal_company_id is not null),
      updated_at = now()
  where sync_id = p_sync_id;

  return jsonb_build_object(
    'published', published_count,
    'portalLinked', (select count(*) from public.one_c_counterparties where sync_id = p_sync_id and portal_company_id is not null),
    'syncId', p_sync_id
  );
end;
$$;

revoke all on function public.publish_one_c_counterparty_directory(uuid) from public, anon, authenticated;
grant execute on function public.publish_one_c_counterparty_directory(uuid) to service_role;

commit;
