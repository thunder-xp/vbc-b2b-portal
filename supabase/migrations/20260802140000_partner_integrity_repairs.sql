begin;

insert into public.permissions(code, description, scope, delegable_by_partner_owner, sensitive, category)
values (
  'admin.partner_integrity.manage',
  'Diagnose and repair partner onboarding company and membership integrity.',
  'internal', false, true, 'admin'
)
on conflict (code) do update set
  description = excluded.description,
  scope = excluded.scope,
  delegable_by_partner_owner = excluded.delegable_by_partner_owner,
  sensitive = excluded.sensitive,
  category = excluded.category;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'admin.partner_integrity.manage'
where role.code = 'novotech_admin' and role.scope = 'internal'
on conflict do nothing;

alter table public.company_memberships
  add column if not exists version integer not null default 1;

alter table public.company_memberships
  drop constraint if exists company_memberships_version_check;
alter table public.company_memberships
  add constraint company_memberships_version_check check (version > 0);

create or replace function public.increment_company_membership_version()
returns trigger language plpgsql set search_path = public as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists increment_company_membership_version on public.company_memberships;
create trigger increment_company_membership_version
before update on public.company_memberships
for each row execute function public.increment_company_membership_version();

create table public.user_company_context_preferences (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  active_membership_id uuid not null references public.company_memberships(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  changed_by uuid references public.user_profiles(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create unique index user_company_context_active_membership_idx
  on public.user_company_context_preferences(active_membership_id);

create table public.partner_integrity_repair_events (
  id uuid primary key default gen_random_uuid(),
  operation_key uuid not null unique,
  correlation_id uuid not null unique,
  access_request_id uuid references public.access_requests(id) on delete restrict,
  target_user_id uuid not null references public.user_profiles(id) on delete restrict,
  source_company_id uuid references public.partner_companies(id) on delete restrict,
  target_company_id uuid not null references public.partner_companies(id) on delete restrict,
  source_membership_id uuid references public.company_memberships(id) on delete restrict,
  target_membership_id uuid not null references public.company_memberships(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  operation_type text not null check (operation_type in (
    'move_membership', 'add_membership', 'restore_company', 'restore_membership',
    'relink_approved_request', 'suspend_membership', 'reactivate_membership',
    'change_membership_role', 'set_default_company', 'rerun_bootstrap'
  )),
  reason text not null check (char_length(btrim(reason)) between 20 and 2000),
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index partner_integrity_repair_events_user_idx
  on public.partner_integrity_repair_events(target_user_id, occurred_at desc);
create index partner_integrity_repair_events_request_idx
  on public.partner_integrity_repair_events(access_request_id, occurred_at desc)
  where access_request_id is not null;

create or replace function public.prevent_partner_integrity_repair_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Partner integrity repair events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_partner_integrity_repair_event_mutation
before update or delete on public.partner_integrity_repair_events
for each row execute function public.prevent_partner_integrity_repair_event_mutation();

alter table public.user_company_context_preferences enable row level security;
alter table public.partner_integrity_repair_events enable row level security;
revoke all on public.user_company_context_preferences,
  public.partner_integrity_repair_events from public, anon, authenticated;
grant select, insert, update, delete on public.user_company_context_preferences,
  public.partner_integrity_repair_events to service_role;

create or replace function public.get_approved_onboarding_integrity(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  request public.access_requests%rowtype;
  revision public.onboarding_application_revisions%rowtype;
  expected_counterparty public.one_c_counterparties%rowtype;
  expected_company public.partner_companies%rowtype;
  expected_membership public.company_memberships%rowtype;
  normalized_fiscal text;
  counterparty_count integer;
  active_membership_count integer;
  outcome text;
begin
  if not public.has_internal_permission('admin.users.view')
    and not public.has_internal_permission('onboarding.requests.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select * into request from public.access_requests where id = p_request_id;
  if request.id is null then return null; end if;
  select * into revision from public.onboarding_application_revisions
    where access_request_id = request.id order by revision_number desc limit 1;
  normalized_fiscal := lower(regexp_replace(
    coalesce(revision.requested_fiscal_code, request.requested_fiscal_code, ''),
    '[^[:alnum:]]+', '', 'g'
  ));
  select count(*) into counterparty_count
  from public.one_c_counterparties counterparty
  where counterparty.is_published
    and counterparty.normalized_fiscal_code = normalized_fiscal;
  if counterparty_count = 1 then
    select * into expected_counterparty from public.one_c_counterparties
    where is_published and normalized_fiscal_code = normalized_fiscal;
    select * into expected_company from public.partner_companies company
    where lower(company.external_1c_id) = lower(expected_counterparty.external_1c_id);
  end if;
  if expected_company.id is not null then
    select * into expected_membership from public.company_memberships membership
    where membership.user_id = request.user_profile_id
      and membership.company_id = expected_company.id;
  end if;
  select count(*) into active_membership_count from public.company_memberships membership
  where membership.user_id = request.user_profile_id and membership.status = 'active';

  outcome := case
    when request.status <> 'approved' then 'approval_incomplete'
    when counterparty_count <> 1 then case when counterparty_count > 1 then 'duplicate_company' else '1c_mapping_missing' end
    when not expected_counterparty.is_active or expected_counterparty.is_deleted then '1c_mapping_missing'
    when expected_company.id is null then 'company_missing'
    when expected_company.status <> 'active' then 'company_inactive'
    when expected_membership.id is null and active_membership_count > 0 then 'membership_company_mismatch'
    when expected_membership.id is null then 'membership_missing'
    when expected_membership.status <> 'active' then 'membership_missing'
    when active_membership_count > 1 then 'duplicate_membership'
    when request.company_id is distinct from expected_company.id then 'membership_company_mismatch'
    else 'consistent'
  end;

  return jsonb_build_object(
    'outcome', outcome,
    'requestId', request.id,
    'userProfileId', request.user_profile_id,
    'requestedCompanyName', coalesce(revision.requested_company_name, request.requested_company_name),
    'requestedFiscalCode', coalesce(revision.requested_fiscal_code, request.requested_fiscal_code),
    'normalizedFiscalCode', normalized_fiscal,
    'actualRequestCompanyId', request.company_id,
    'expectedCounterpartyId', expected_counterparty.id,
    'expectedExternal1cId', expected_counterparty.external_1c_id,
    'expectedCompanyId', expected_company.id,
    'expectedMembershipId', expected_membership.id,
    'activeMembershipCount', active_membership_count
  );
end;
$$;

create or replace function public.get_admin_partner_user_integrity(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.users.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'identity', jsonb_build_object(
      'id', profile.id, 'email', profile.email, 'fullName', profile.full_name,
      'status', profile.status, 'userType', profile.user_type
    ),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', membership.id, 'companyId', company.id, 'companyName', company.display_name,
        'companyStatus', company.status, 'roleCode', role.code, 'status', membership.status,
        'version', membership.version, 'createdAt', membership.created_at,
        'isDefault', preference.active_membership_id = membership.id
      ) order by membership.created_at)
      from public.company_memberships membership
      join public.partner_companies company on company.id = membership.company_id
      join public.roles role on role.id = membership.role_id
      left join public.user_company_context_preferences preference on preference.user_id = membership.user_id
      where membership.user_id = profile.id
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.id, 'status', request.status, 'companyId', request.company_id,
        'requestedCompanyName', request.requested_company_name,
        'requestedFiscalCode', request.requested_fiscal_code,
        'integrity', public.get_approved_onboarding_integrity(request.id)
      ) order by request.created_at desc)
      from public.access_requests request where request.user_profile_id = profile.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id, 'operationType', event.operation_type, 'reason', event.reason,
        'correlationId', event.correlation_id, 'occurredAt', event.occurred_at
      ) order by event.occurred_at desc)
      from public.partner_integrity_repair_events event where event.target_user_id = profile.id
    ), '[]'::jsonb)
  ) into result
  from public.user_profiles profile where profile.id = p_profile_id;
  return result;
end;
$$;

create or replace function public.list_partner_integrity_target_companies(p_search text default null)
returns table(company_id uuid, display_name text, status text, external_1c_id text)
language sql stable security definer set search_path = public set row_security = off as $$
  select company.id, company.display_name, company.status, company.external_1c_id
  from public.partner_companies company
  where public.has_internal_permission('admin.partner_integrity.manage')
    and company.status = 'active'
    and (nullif(btrim(coalesce(p_search, '')), '') is null
      or company.display_name ilike '%' || left(btrim(p_search), 100) || '%'
      or company.external_1c_id ilike '%' || left(btrim(p_search), 100) || '%')
  order by lower(company.display_name), company.id
  limit 50;
$$;

create or replace function public.list_own_company_memberships()
returns table(
  id uuid, user_id uuid, company_id uuid, role_id uuid, status text,
  approved_by uuid, approved_at timestamptz, revoked_by uuid, revoked_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public set row_security = off as $$
  select membership.id, membership.user_id, membership.company_id, membership.role_id,
    membership.status, membership.approved_by, membership.approved_at,
    membership.revoked_by, membership.revoked_at, membership.created_at, membership.updated_at
  from public.company_memberships membership
  left join public.user_company_context_preferences preference
    on preference.user_id = membership.user_id
  where membership.user_id = auth.uid()
  order by (membership.id = preference.active_membership_id) desc,
    (membership.status = 'active') desc, membership.created_at, membership.id;
$$;

create or replace function public.repair_approved_onboarding_connection(
  p_request_id uuid,
  p_counterparty_id uuid,
  p_source_membership_id uuid,
  p_expected_source_version integer,
  p_mode text,
  p_role_code text,
  p_reason text,
  p_operation_key uuid,
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
  request public.access_requests%rowtype;
  revision public.onboarding_application_revisions%rowtype;
  counterparty public.one_c_counterparties%rowtype;
  source_membership public.company_memberships%rowtype;
  target_company public.partner_companies%rowtype;
  target_membership public.company_memberships%rowtype;
  target_role public.roles%rowtype;
  existing_event public.partner_integrity_repair_events%rowtype;
  normalized_fiscal text;
  operation_type text;
  audit_id uuid;
  bootstrap_id uuid;
begin
  if actor_id is null or not public.has_internal_permission('admin.partner_integrity.manage') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_mode not in ('move', 'add') or p_role_code not in ('partner_owner','partner_manager','partner_buyer','partner_accounting','partner_viewer') then
    raise exception 'invalid_repair_input' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 20 then
    raise exception 'repair_reason_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_key::text, 0));
  select * into existing_event from public.partner_integrity_repair_events
  where operation_key = p_operation_key;
  if existing_event.id is not null then
    return jsonb_build_object(
      'idempotent', true, 'companyId', existing_event.target_company_id,
      'membershipId', existing_event.target_membership_id,
      'sourceMembershipId', existing_event.source_membership_id,
      'auditEventId', existing_event.id, 'correlationId', existing_event.correlation_id
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null or request.status <> 'approved' then
    raise exception 'approved_request_required' using errcode = '55000';
  end if;
  select * into revision from public.onboarding_application_revisions
  where access_request_id = request.id order by revision_number desc limit 1;
  normalized_fiscal := lower(regexp_replace(
    coalesce(revision.requested_fiscal_code, request.requested_fiscal_code, ''),
    '[^[:alnum:]]+', '', 'g'
  ));
  select * into counterparty from public.one_c_counterparties
  where id = p_counterparty_id for share;
  if counterparty.id is null or not counterparty.is_published
    or not counterparty.is_active or counterparty.is_deleted
    or counterparty.normalized_fiscal_code is distinct from normalized_fiscal
    or (select count(*) from public.one_c_counterparties candidate
        where candidate.is_published and candidate.normalized_fiscal_code = normalized_fiscal) <> 1 then
    raise exception 'authoritative_counterparty_mismatch' using errcode = '23505';
  end if;

  select * into source_membership from public.company_memberships
  where id = p_source_membership_id and user_id = request.user_profile_id for update;
  if source_membership.id is null or source_membership.version <> p_expected_source_version then
    raise exception 'stale_membership_version' using errcode = 'PT409';
  end if;
  select * into target_role from public.roles
  where code = p_role_code and scope = 'partner';
  if target_role.id is null then raise exception 'invalid_partner_role' using errcode = '22023'; end if;

  select * into target_company from public.partner_companies company
  where lower(company.external_1c_id) = lower(counterparty.external_1c_id) for update;
  if target_company.id is null then
    insert into public.partner_companies(
      external_1c_id, external_1c_code, display_name, status,
      assigned_internal_manager_user_id, onboarding_order_access, onboarding_finance_access
    ) values (
      lower(counterparty.external_1c_id), counterparty.external_code,
      coalesce(nullif(btrim(revision.requested_company_name), ''), counterparty.name),
      'active', request.assigned_manager_user_id, true, true
    ) returning * into target_company;
  elsif target_company.status <> 'active' then
    raise exception 'inactive_target_company' using errcode = '55000';
  end if;
  update public.one_c_counterparties set portal_company_id = target_company.id
  where id = counterparty.id and (portal_company_id is null or portal_company_id = target_company.id);
  if not found then raise exception 'counterparty_already_linked' using errcode = '23505'; end if;

  if not exists (select 1 from public.partner_company_access_policies policy where policy.company_id = target_company.id) then
    perform public.assign_default_partner_company_access(target_company.id, actor_id, p_correlation_id, true);
  end if;
  if not exists (select 1 from public.partner_company_access_policies policy where policy.company_id = target_company.id and policy.preset_code = 'full_partner_access') then
    raise exception 'target_company_policy_missing' using errcode = '55000';
  end if;

  select * into target_membership from public.company_memberships membership
  where membership.user_id = request.user_profile_id and membership.company_id = target_company.id for update;
  if target_membership.id is null then
    insert into public.company_memberships(user_id, company_id, role_id, status, approved_by, approved_at)
    values(request.user_profile_id, target_company.id, target_role.id, 'active', actor_id, now())
    returning * into target_membership;
  else
    update public.company_memberships set role_id = target_role.id, status = 'active',
      approved_by = actor_id, approved_at = coalesce(approved_at, now()),
      revoked_by = null, revoked_at = null
    where id = target_membership.id returning * into target_membership;
  end if;

  insert into public.user_company_context_preferences(user_id, active_membership_id, changed_by)
  values(request.user_profile_id, target_membership.id, actor_id)
  on conflict (user_id) do update set active_membership_id = excluded.active_membership_id,
    version = public.user_company_context_preferences.version + 1,
    changed_by = excluded.changed_by, changed_at = now();

  if p_mode = 'move' and source_membership.id <> target_membership.id then
    update public.company_memberships set status = 'revoked', revoked_by = actor_id, revoked_at = now()
    where id = source_membership.id;
  end if;
  if p_mode = 'move' and exists (
    select 1 from public.company_memberships membership
    where membership.user_id = request.user_profile_id and membership.status = 'active'
      and membership.id <> target_membership.id
  ) then raise exception 'unexpected_active_membership' using errcode = '23505'; end if;

  update public.access_requests set company_id = target_company.id,
    requested_external_1c_id = counterparty.external_1c_id,
    confirmed_counterparty_id = counterparty.id,
    assigned_manager_user_id = coalesce(assigned_manager_user_id, target_company.assigned_internal_manager_user_id),
    last_activity_at = now()
  where id = request.id;

  operation_type := case when p_mode = 'move' then 'move_membership' else 'add_membership' end;
  insert into public.partner_integrity_repair_events(
    operation_key, correlation_id, access_request_id, target_user_id,
    source_company_id, target_company_id, source_membership_id, target_membership_id,
    actor_user_id, operation_type, reason, safe_metadata
  ) values (
    p_operation_key, p_correlation_id, request.id, request.user_profile_id,
    source_membership.company_id, target_company.id, source_membership.id,
    target_membership.id, actor_id, operation_type, btrim(p_reason),
    jsonb_build_object('normalizedFiscalCode', normalized_fiscal, 'roleCode', p_role_code)
  ) returning id into audit_id;

  select job.id into bootstrap_id from public.partner_company_bootstrap_jobs job
  where job.company_id = target_company.id;
  return jsonb_build_object(
    'idempotent', false, 'companyId', target_company.id,
    'membershipId', target_membership.id, 'sourceMembershipId', source_membership.id,
    'policyPreset', 'full_partner_access', 'bootstrapJobId', bootstrap_id,
    'auditEventId', audit_id, 'correlationId', p_correlation_id
  );
end;
$$;

create or replace function public.admin_move_or_add_company_membership(
  p_user_id uuid,
  p_source_membership_id uuid,
  p_target_company_id uuid,
  p_expected_source_version integer,
  p_mode text,
  p_role_code text,
  p_reason text,
  p_operation_key uuid,
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
  source_membership public.company_memberships%rowtype;
  target_membership public.company_memberships%rowtype;
  target_company public.partner_companies%rowtype;
  target_role public.roles%rowtype;
  existing_event public.partner_integrity_repair_events%rowtype;
  audit_id uuid;
begin
  if actor_id is null or not public.has_internal_permission('admin.partner_integrity.manage') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_mode not in ('move', 'add') or char_length(btrim(coalesce(p_reason, ''))) < 20 then
    raise exception 'invalid_repair_input' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_key::text, 0));
  select * into existing_event from public.partner_integrity_repair_events
  where operation_key = p_operation_key;
  if existing_event.id is not null then
    return jsonb_build_object('idempotent', true, 'companyId', existing_event.target_company_id,
      'membershipId', existing_event.target_membership_id, 'sourceMembershipId', existing_event.source_membership_id,
      'auditEventId', existing_event.id, 'correlationId', existing_event.correlation_id);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into source_membership from public.company_memberships
  where id = p_source_membership_id and user_id = p_user_id for update;
  if source_membership.id is null or source_membership.version <> p_expected_source_version then
    raise exception 'stale_membership_version' using errcode = 'PT409';
  end if;
  select * into target_company from public.partner_companies
  where id = p_target_company_id for update;
  if target_company.id is null or target_company.status <> 'active' then
    raise exception 'inactive_target_company' using errcode = '55000';
  end if;
  if not exists (select 1 from public.partner_company_access_policies policy where policy.company_id = target_company.id) then
    raise exception 'target_company_policy_missing' using errcode = '55000';
  end if;
  select * into target_role from public.roles where code = p_role_code and scope = 'partner';
  if target_role.id is null then raise exception 'invalid_partner_role' using errcode = '22023'; end if;

  select * into target_membership from public.company_memberships
  where user_id = p_user_id and company_id = target_company.id for update;
  if target_membership.id is null then
    insert into public.company_memberships(user_id, company_id, role_id, status, approved_by, approved_at)
    values(p_user_id, target_company.id, target_role.id, 'active', actor_id, now())
    returning * into target_membership;
  else
    update public.company_memberships set role_id = target_role.id, status = 'active',
      approved_by = actor_id, approved_at = coalesce(approved_at, now()), revoked_by = null, revoked_at = null
    where id = target_membership.id returning * into target_membership;
  end if;

  insert into public.membership_permission_overrides(membership_id, permission_id, effect, created_by)
  select target_membership.id, source_override.permission_id, 'deny', actor_id
  from public.membership_permission_overrides source_override
  where source_override.membership_id = source_membership.id and source_override.effect = 'deny'
  on conflict (membership_id, permission_id) do update set effect = 'deny', created_by = actor_id, updated_at = now();

  insert into public.user_company_context_preferences(user_id, active_membership_id, changed_by)
  values(p_user_id, target_membership.id, actor_id)
  on conflict (user_id) do update set active_membership_id = excluded.active_membership_id,
    version = public.user_company_context_preferences.version + 1,
    changed_by = excluded.changed_by, changed_at = now();
  if p_mode = 'move' and source_membership.id <> target_membership.id then
    update public.company_memberships set status = 'revoked', revoked_by = actor_id, revoked_at = now()
    where id = source_membership.id;
  end if;
  if p_mode = 'move' and exists (
    select 1 from public.company_memberships membership
    where membership.user_id = p_user_id and membership.status = 'active' and membership.id <> target_membership.id
  ) then raise exception 'unexpected_active_membership' using errcode = '23505'; end if;

  insert into public.partner_integrity_repair_events(
    operation_key, correlation_id, target_user_id, source_company_id, target_company_id,
    source_membership_id, target_membership_id, actor_user_id, operation_type, reason,
    safe_metadata
  ) values (
    p_operation_key, p_correlation_id, p_user_id, source_membership.company_id,
    target_company.id, source_membership.id, target_membership.id, actor_id,
    case when p_mode = 'move' then 'move_membership' else 'add_membership' end,
    btrim(p_reason), jsonb_build_object('roleCode', p_role_code)
  ) returning id into audit_id;
  return jsonb_build_object('idempotent', false, 'companyId', target_company.id,
    'membershipId', target_membership.id, 'sourceMembershipId', source_membership.id,
    'auditEventId', audit_id, 'correlationId', p_correlation_id);
end;
$$;

create or replace function public.smoke_repair_approved_onboarding_connection(
  p_request_id uuid,
  p_counterparty_id uuid,
  p_source_membership_id uuid,
  p_expected_source_version integer,
  p_mode text,
  p_role_code text,
  p_reason text,
  p_operation_key uuid,
  p_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.repair_approved_onboarding_connection(
    p_request_id, p_counterparty_id, p_source_membership_id,
    p_expected_source_version, p_mode, p_role_code, p_reason,
    p_operation_key, p_correlation_id
  );
  raise exception 'rollback_smoke_succeeded' using errcode = 'P0001';
end;
$$;

revoke all on function public.get_approved_onboarding_integrity(uuid) from public, anon;
revoke all on function public.get_admin_partner_user_integrity(uuid) from public, anon;
revoke all on function public.list_partner_integrity_target_companies(text) from public, anon;
revoke all on function public.list_own_company_memberships() from public, anon;
revoke all on function public.repair_approved_onboarding_connection(uuid,uuid,uuid,integer,text,text,text,uuid,uuid) from public, anon;
revoke all on function public.admin_move_or_add_company_membership(uuid,uuid,uuid,integer,text,text,text,uuid,uuid) from public, anon;
revoke all on function public.smoke_repair_approved_onboarding_connection(uuid,uuid,uuid,integer,text,text,text,uuid,uuid) from public, anon;
grant execute on function public.get_approved_onboarding_integrity(uuid) to authenticated;
grant execute on function public.get_admin_partner_user_integrity(uuid) to authenticated;
grant execute on function public.list_partner_integrity_target_companies(text) to authenticated;
grant execute on function public.list_own_company_memberships() to authenticated;
grant execute on function public.repair_approved_onboarding_connection(uuid,uuid,uuid,integer,text,text,text,uuid,uuid) to authenticated;
grant execute on function public.admin_move_or_add_company_membership(uuid,uuid,uuid,integer,text,text,text,uuid,uuid) to authenticated;
grant execute on function public.smoke_repair_approved_onboarding_connection(uuid,uuid,uuid,integer,text,text,text,uuid,uuid) to authenticated;

-- Existing single-company partners receive an explicit default context. Ambiguous
-- multi-company users are intentionally left for reviewed repair.
insert into public.user_company_context_preferences(user_id, active_membership_id, changed_by)
select unique_membership.user_id, unique_membership.id, null
from (
  select membership.*, count(*) over (partition by membership.user_id) as active_count
  from public.company_memberships membership
  where membership.status = 'active'
) unique_membership
where unique_membership.active_count = 1
on conflict (user_id) do nothing;

comment on table public.partner_integrity_repair_events is
  'Append-only internal audit for reviewed onboarding and membership integrity repairs.';
comment on function public.repair_approved_onboarding_connection(uuid,uuid,uuid,integer,text,text,text,uuid,uuid) is
  'Atomically recovers an approved onboarding connection from a verified published 1C directory row using explicit move or add semantics.';

commit;
