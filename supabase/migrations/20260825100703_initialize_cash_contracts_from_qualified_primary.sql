begin;

alter table public.partner_company_cash_contract_mapping_events
  drop constraint if exists partner_company_cash_contract_event_type_check;
alter table public.partner_company_cash_contract_mapping_events
  add constraint partner_company_cash_contract_event_type_check
  check (event_type in ('mapped', 'changed', 'removed', 'initialized_from_primary'));

create or replace function public.initialize_partner_cash_contract_from_primary(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_correlation_id uuid,
  p_batch_correlation_id uuid,
  p_source text,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  company public.partner_companies%rowtype;
  current_mapping public.partner_company_cash_contract_mappings%rowtype;
  qualification jsonb;
  history_count integer;
  has_removed_history boolean;
  has_different_history boolean;
  normalized_primary_ref text;
  inserted_count integer;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Cash contract initialization requires service role.' using errcode = '42501';
  end if;
  if p_company_id is null
    or p_actor_user_id is null
    or p_correlation_id is null
    or p_batch_correlation_id is null
    or p_source not in ('system_remediation', 'commercial_profile_sync')
    or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Invalid cash contract initialization request.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.user_profiles actor
    where actor.id = p_actor_user_id
      and actor.status = 'active'
      and actor.user_type in ('internal', 'admin')
  ) then
    return jsonb_build_object(
      'companyId', p_company_id,
      'code', 'CASH_INITIALIZATION_ACTOR_INVALID',
      'initialized', false
    );
  end if;

  select * into company
  from public.partner_companies candidate
  where candidate.id = p_company_id
  for update;

  if company.id is null then
    return jsonb_build_object(
      'companyId', p_company_id,
      'code', 'CASH_INITIALIZATION_COMPANY_NOT_FOUND',
      'initialized', false
    );
  end if;
  if company.status <> 'active' then
    return jsonb_build_object(
      'companyId', company.id,
      'companyName', company.display_name,
      'code', 'CASH_INITIALIZATION_COMPANY_INACTIVE',
      'initialized', false
    );
  end if;

  normalized_primary_ref := nullif(lower(btrim(coalesce(company.external_1c_contract_id, ''))), '');
  if normalized_primary_ref is null then
    return jsonb_build_object(
      'companyId', company.id,
      'companyName', company.display_name,
      'code', 'CASH_INITIALIZATION_PRIMARY_MISSING',
      'initialized', false
    );
  end if;

  select * into current_mapping
  from public.partner_company_cash_contract_mappings mapping
  where mapping.company_id = company.id
  for update;

  select count(*),
         coalesce(bool_or(event.event_type = 'removed'), false),
         coalesce(bool_or(
           event.new_contract_ref is not null
           and lower(event.new_contract_ref) <> normalized_primary_ref
         ), false)
    into history_count, has_removed_history, has_different_history
  from public.partner_company_cash_contract_mapping_events event
  where event.company_id = company.id;

  if current_mapping.company_id is not null then
    return jsonb_build_object(
      'companyId', company.id,
      'companyName', company.display_name,
      'code', case
        when not current_mapping.active then 'CASH_INITIALIZATION_EXPLICITLY_REMOVED'
        when lower(current_mapping.contract_external_1c_id) = normalized_primary_ref
          then 'CASH_INITIALIZATION_EXISTING_SAME_MAPPING'
        else 'CASH_INITIALIZATION_EXISTING_DIFFERENT_MAPPING'
      end,
      'initialized', false,
      'contractRef', current_mapping.contract_external_1c_id
    );
  end if;
  if has_removed_history then
    return jsonb_build_object(
      'companyId', company.id,
      'companyName', company.display_name,
      'code', 'CASH_INITIALIZATION_EXPLICITLY_REMOVED',
      'initialized', false
    );
  end if;
  if history_count > 0 then
    return jsonb_build_object(
      'companyId', company.id,
      'companyName', company.display_name,
      'code', case
        when has_different_history then 'CASH_INITIALIZATION_EXISTING_DIFFERENT_HISTORY'
        else 'CASH_INITIALIZATION_AMBIGUOUS_HISTORY'
      end,
      'initialized', false
    );
  end if;

  qualification := public.qualify_partner_cash_contract_candidate(company.id, normalized_primary_ref);
  if qualification->>'code' <> 'CASH_CONTRACT_QUALIFIED'
    or not coalesce((qualification->>'qualified')::boolean, false) then
    return jsonb_build_object(
      'companyId', company.id,
      'companyName', company.display_name,
      'code', coalesce(qualification->>'code', 'CASH_INITIALIZATION_QUALIFICATION_FAILED'),
      'initialized', false,
      'contractRef', normalized_primary_ref,
      'qualification', qualification
    );
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'companyId', company.id,
      'companyName', company.display_name,
      'code', 'CASH_INITIALIZATION_READY',
      'initialized', false,
      'contractRef', normalized_primary_ref,
      'qualification', qualification
    );
  end if;

  insert into public.partner_company_cash_contract_mappings(
    company_id, contract_external_1c_id, contract_role, version, active,
    reason, created_by, updated_by
  ) values (
    company.id, normalized_primary_ref, 'cash', 1, true,
    btrim(p_reason), p_actor_user_id, p_actor_user_id
  )
  on conflict (company_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    return jsonb_build_object(
      'companyId', company.id,
      'companyName', company.display_name,
      'code', 'CASH_INITIALIZATION_CONCURRENT_MAPPING',
      'initialized', false
    );
  end if;

  insert into public.partner_company_cash_contract_mapping_events(
    company_id, previous_contract_ref, new_contract_ref, actor_user_id,
    reason, correlation_id, mapping_version, event_type, qualification_snapshot
  ) values (
    company.id, null, normalized_primary_ref, p_actor_user_id,
    btrim(p_reason), p_correlation_id, 1, 'initialized_from_primary',
    qualification || jsonb_build_object(
      'initializationSource', p_source,
      'batchCorrelationId', p_batch_correlation_id
    )
  );

  return jsonb_build_object(
    'companyId', company.id,
    'companyName', company.display_name,
    'code', 'CASH_INITIALIZATION_SUCCESS',
    'initialized', true,
    'contractRef', normalized_primary_ref,
    'correlationId', p_correlation_id,
    'qualification', qualification
  );
exception
  when unique_violation then
    if exists (
      select 1
      from public.partner_company_cash_contract_mapping_events event
      where event.correlation_id = p_correlation_id
        and event.company_id = p_company_id
    ) then
      return jsonb_build_object(
        'companyId', p_company_id,
        'code', 'CASH_INITIALIZATION_IDEMPOTENT_REPLAY',
        'initialized', false,
        'correlationId', p_correlation_id
      );
    end if;
    raise;
end;
$$;

revoke all on function public.initialize_partner_cash_contract_from_primary(
  uuid, uuid, text, uuid, uuid, text, boolean
) from public, anon, authenticated;
grant execute on function public.initialize_partner_cash_contract_from_primary(
  uuid, uuid, text, uuid, uuid, text, boolean
) to service_role;

create or replace function public.reconcile_partner_cash_contracts_from_primary(
  p_actor_user_id uuid,
  p_reason text,
  p_batch_correlation_id uuid,
  p_limit integer default 50,
  p_company_ids uuid[] default null,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  candidate record;
  item jsonb;
  items jsonb := '[]'::jsonb;
  operation_correlation_id uuid;
  selected_count integer := 0;
  initialized_count integer := 0;
  failed_count integer := 0;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Cash contract reconciliation requires service role.' using errcode = '42501';
  end if;
  if p_actor_user_id is null
    or p_batch_correlation_id is null
    or p_limit not between 1 and 100
    or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Invalid cash contract reconciliation request.' using errcode = '22023';
  end if;

  for candidate in
    select company.id, company.display_name
    from public.partner_companies company
    where company.status = 'active'
      and (p_company_ids is null or company.id = any(p_company_ids))
      and not exists (
        select 1
        from public.partner_company_cash_contract_mappings mapping
        where mapping.company_id = company.id and mapping.active
      )
      and (
        p_company_ids is not null
        or coalesce((public.qualify_partner_cash_contract_candidate(
          company.id, company.external_1c_contract_id
        )->>'qualified')::boolean, false)
      )
    order by company.id
    limit p_limit
  loop
    selected_count := selected_count + 1;
    operation_correlation_id := gen_random_uuid();
    begin
      item := public.initialize_partner_cash_contract_from_primary(
        candidate.id,
        p_actor_user_id,
        p_reason,
        operation_correlation_id,
        p_batch_correlation_id,
        'system_remediation',
        p_dry_run
      );
    exception when others then
      item := jsonb_build_object(
        'companyId', candidate.id,
        'companyName', candidate.display_name,
        'code', 'CASH_INITIALIZATION_FAILED',
        'initialized', false,
        'safeErrorCode', sqlstate
      );
      failed_count := failed_count + 1;
    end;
    if coalesce((item->>'initialized')::boolean, false) then
      initialized_count := initialized_count + 1;
    end if;
    items := items || jsonb_build_array(item);
  end loop;

  return jsonb_build_object(
    'code', 'CASH_RECONCILIATION_COMPLETE',
    'batchCorrelationId', p_batch_correlation_id,
    'dryRun', p_dry_run,
    'selectedCount', selected_count,
    'initializedCount', initialized_count,
    'failedCount', failed_count,
    'items', items
  );
end;
$$;

revoke all on function public.reconcile_partner_cash_contracts_from_primary(
  uuid, text, uuid, integer, uuid[], boolean
) from public, anon, authenticated;
grant execute on function public.reconcile_partner_cash_contracts_from_primary(
  uuid, text, uuid, integer, uuid[], boolean
) to service_role;

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
  if new.status <> 'active'
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

drop trigger if exists initialize_cash_contract_after_commercial_profile
  on public.partner_companies;
create trigger initialize_cash_contract_after_commercial_profile
after update of external_1c_contract_id, commercial_profile_state, commercial_profile_verified_at
on public.partner_companies
for each row execute function public.initialize_cash_contract_after_commercial_profile();

comment on function public.initialize_partner_cash_contract_from_primary(
  uuid, uuid, text, uuid, uuid, text, boolean
) is 'Initializes an explicit cash mapping only from the exact canonical-qualified primary contract when no mapping or historical intent exists.';
comment on function public.reconcile_partner_cash_contracts_from_primary(
  uuid, text, uuid, integer, uuid[], boolean
) is 'Runs a bounded, idempotent service-role reconciliation with per-company results and no live 1C access.';
comment on function public.initialize_cash_contract_after_commercial_profile() is
  'Attempts initial cash mapping after a verified aligned commercial-profile transition without blocking the profile publication.';

commit;
