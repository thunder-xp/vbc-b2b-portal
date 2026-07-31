begin;

create extension if not exists pgcrypto;

-- A published, versioned read model keeps the last successful 1C snapshot
-- available while the next synchronization is staged.
create table if not exists public.one_c_counterparty_directory_syncs (
  sync_id uuid primary key,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz null,
  lock_acquired_at timestamptz null,
  source_counterparties integer not null default 0,
  active_counterparties integer not null default 0,
  inactive_counterparties integer not null default 0,
  deleted_counterparties integer not null default 0,
  with_fiscal_code integer not null default 0,
  without_fiscal_code integer not null default 0,
  duplicate_fiscal_codes integer not null default 0,
  contracts integer not null default 0,
  price_type_relationships integer not null default 0,
  portal_linked integer not null default 0,
  unresolved_manager_references integer not null default 0,
  published_counterparties integer not null default 0,
  failed_records integer not null default 0,
  safe_error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_c_counterparty_directory_one_running_idx
  on public.one_c_counterparty_directory_syncs ((status))
  where status = 'running';

create table if not exists public.one_c_counterparties (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.one_c_counterparty_directory_syncs(sync_id) on delete restrict,
  external_1c_id text not null,
  external_code text null,
  name text not null,
  normalized_name text not null,
  fiscal_code text null,
  normalized_fiscal_code text null,
  is_active boolean not null,
  is_deleted boolean not null,
  phone text null,
  normalized_phone text null,
  email text null,
  normalized_email text null,
  locality text null,
  assigned_manager_external_id text null,
  assigned_manager_name text null,
  portal_company_id uuid null references public.partner_companies(id) on delete set null,
  synchronization_version text not null,
  source_updated_at timestamptz null,
  synchronized_at timestamptz not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sync_id, external_1c_id)
);

create unique index if not exists one_c_counterparties_published_ref_idx
  on public.one_c_counterparties(external_1c_id)
  where is_published;
create index if not exists one_c_counterparties_fiscal_idx
  on public.one_c_counterparties(normalized_fiscal_code)
  where is_published;
create index if not exists one_c_counterparties_name_idx
  on public.one_c_counterparties(normalized_name)
  where is_published;
create index if not exists one_c_counterparties_phone_idx
  on public.one_c_counterparties(normalized_phone)
  where is_published;
create index if not exists one_c_counterparties_email_idx
  on public.one_c_counterparties(normalized_email)
  where is_published;
create index if not exists one_c_counterparties_active_idx
  on public.one_c_counterparties(is_active, is_deleted)
  where is_published;
create index if not exists one_c_counterparties_portal_company_idx
  on public.one_c_counterparties(portal_company_id)
  where is_published and portal_company_id is not null;
create index if not exists one_c_counterparties_synchronized_idx
  on public.one_c_counterparties(synchronized_at desc)
  where is_published;

create table if not exists public.one_c_counterparty_contracts (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.one_c_counterparty_directory_syncs(sync_id) on delete restrict,
  counterparty_external_1c_id text not null,
  external_1c_id text not null,
  code text null,
  name text not null,
  price_type_external_1c_id text null,
  is_active boolean not null,
  is_deleted boolean not null,
  is_published boolean not null default false,
  synchronized_at timestamptz not null,
  unique (sync_id, external_1c_id)
);

create index if not exists one_c_counterparty_contracts_owner_idx
  on public.one_c_counterparty_contracts(counterparty_external_1c_id)
  where is_published and is_active and not is_deleted;

create table if not exists public.one_c_counterparty_price_profiles (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.one_c_counterparty_directory_syncs(sync_id) on delete restrict,
  counterparty_external_1c_id text not null,
  external_1c_id text not null,
  code text null,
  name text not null,
  is_active boolean not null,
  is_deleted boolean not null,
  is_published boolean not null default false,
  synchronized_at timestamptz not null,
  unique (sync_id, counterparty_external_1c_id, external_1c_id)
);

create index if not exists one_c_counterparty_price_profiles_owner_idx
  on public.one_c_counterparty_price_profiles(counterparty_external_1c_id)
  where is_published and is_active and not is_deleted;

alter table public.one_c_counterparty_directory_syncs enable row level security;
alter table public.one_c_counterparties enable row level security;
alter table public.one_c_counterparty_contracts enable row level security;
alter table public.one_c_counterparty_price_profiles enable row level security;

revoke all on table public.one_c_counterparty_directory_syncs from anon, authenticated;
revoke all on table public.one_c_counterparties from anon, authenticated;
revoke all on table public.one_c_counterparty_contracts from anon, authenticated;
revoke all on table public.one_c_counterparty_price_profiles from anon, authenticated;

-- Internal onboarding is an additive capability assignment. It does not alter
-- the employee's single active primary role.
insert into public.permissions (
  code,
  description,
  scope,
  delegable_by_partner_owner,
  sensitive,
  category
)
values
  ('onboarding.requests.view', 'View the internal partner onboarding queue.', 'internal', false, true, 'onboarding'),
  ('onboarding.requests.assign', 'Assign onboarding applications to capable internal users.', 'internal', false, true, 'onboarding'),
  ('onboarding.requests.review', 'Review and transition onboarding applications.', 'internal', false, true, 'onboarding'),
  ('onboarding.requests.request_clarification', 'Request clarification for an onboarding application.', 'internal', false, true, 'onboarding'),
  ('onboarding.requests.reject', 'Reject an onboarding application.', 'internal', false, true, 'onboarding'),
  ('onboarding.requests.approve', 'Approve a ready onboarding application.', 'internal', false, true, 'onboarding'),
  ('onboarding.company_match.view', 'View local 1C counterparty candidates.', 'internal', false, true, 'onboarding'),
  ('onboarding.company_match.confirm', 'Confirm a local 1C counterparty match.', 'internal', false, true, 'onboarding'),
  ('onboarding.initial_access.assign', 'Assign a governed initial partner access profile.', 'internal', false, true, 'onboarding'),
  ('onboarding.audit.view_limited', 'View limited onboarding audit history.', 'internal', false, true, 'onboarding')
on conflict (code) do update
set description = excluded.description,
    scope = excluded.scope,
    delegable_by_partner_owner = excluded.delegable_by_partner_owner,
    sensitive = excluded.sensitive,
    category = excluded.category;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code = 'novotech_admin'
  and role.scope = 'internal'
  and permission.code like 'onboarding.%'
on conflict (role_id, permission_id) do nothing;

create table if not exists public.internal_user_capability_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete restrict,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  assigned_by uuid not null references public.user_profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  revoked_by uuid null references public.user_profiles(id) on delete restrict,
  revoked_at timestamptz null,
  revoke_reason text null,
  created_at timestamptz not null default now()
);

create unique index if not exists internal_user_capability_one_active_idx
  on public.internal_user_capability_assignments(user_id, permission_id)
  where revoked_at is null;
create index if not exists internal_user_capability_user_idx
  on public.internal_user_capability_assignments(user_id)
  where revoked_at is null;

create table if not exists public.internal_user_capability_audit_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.internal_user_capability_assignments(id) on delete restrict,
  target_user_id uuid not null references public.user_profiles(id) on delete restrict,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('granted', 'revoked')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  created_at timestamptz not null default now()
);

alter table public.internal_user_capability_assignments enable row level security;
alter table public.internal_user_capability_audit_events enable row level security;
revoke all on table public.internal_user_capability_assignments from anon, authenticated;
revoke all on table public.internal_user_capability_audit_events from anon, authenticated;

create or replace function public.get_effective_internal_permissions()
returns table (
  user_id uuid,
  profile_status text,
  internal_role_codes text[],
  effective_permission_codes text[],
  is_platform_admin boolean,
  display_name text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with identity as (
    select profile.id, profile.status, profile.full_name, profile.email
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
  ),
  active_role as (
    select assignment.user_id, role.id, role.code
    from public.internal_user_role_assignments assignment
    join public.roles role on role.id = assignment.role_id and role.scope = 'internal'
    join identity on identity.id = assignment.user_id
    where assignment.revoked_at is null
  ),
  permission_codes as (
    select active_role.user_id, permission.code
    from active_role
    join public.role_permissions role_permission on role_permission.role_id = active_role.id
    join public.permissions permission
      on permission.id = role_permission.permission_id
      and permission.scope in ('internal', 'both')
    union
    select capability.user_id, permission.code
    from public.internal_user_capability_assignments capability
    join identity on identity.id = capability.user_id
    join public.permissions permission
      on permission.id = capability.permission_id
      and permission.scope in ('internal', 'both')
    where capability.revoked_at is null
  )
  select
    identity.id,
    identity.status,
    array_agg(distinct active_role.code order by active_role.code),
    coalesce(array_agg(distinct permission_codes.code order by permission_codes.code)
      filter (where permission_codes.code is not null), '{}'::text[]),
    bool_or(active_role.code = 'novotech_admin'),
    coalesce(nullif(btrim(identity.full_name), ''), identity.email)
  from identity
  join active_role on active_role.user_id = identity.id
  left join permission_codes on permission_codes.user_id = identity.id
  group by identity.id, identity.status, identity.full_name, identity.email;
$$;

create or replace function public.can_review_access_requests()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.has_internal_permission('onboarding.requests.view');
$$;

create or replace function public.grant_internal_onboarding_capability(
  p_user_id uuid,
  p_permission_code text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target_profile public.user_profiles%rowtype;
  target_permission public.permissions%rowtype;
  assignment_id uuid;
begin
  if not exists (
    select 1 from public.get_effective_internal_permissions() context
    where context.is_platform_admin
  ) then
    raise exception 'Capability management is not allowed.' using errcode = '42501';
  end if;
  if actor_id = p_user_id then
    raise exception 'Self-grant is not allowed.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A capability reason is required.' using errcode = '22023';
  end if;

  select * into target_profile from public.user_profiles where id = p_user_id for update;
  if target_profile.id is null
    or target_profile.status <> 'active'
    or target_profile.user_type not in ('internal', 'admin') then
    raise exception 'An active internal user is required.' using errcode = '22023';
  end if;

  select * into target_permission
  from public.permissions
  where code = p_permission_code
    and code like 'onboarding.%'
    and scope in ('internal', 'both');
  if target_permission.id is null then
    raise exception 'Unsupported onboarding capability.' using errcode = '22023';
  end if;

  select id into assignment_id
  from public.internal_user_capability_assignments
  where user_id = p_user_id
    and permission_id = target_permission.id
    and revoked_at is null;
  if assignment_id is not null then
    return assignment_id;
  end if;

  insert into public.internal_user_capability_assignments(
    user_id, permission_id, assigned_by, reason
  )
  values (p_user_id, target_permission.id, actor_id, btrim(p_reason))
  returning id into assignment_id;

  insert into public.internal_user_capability_audit_events(
    assignment_id, target_user_id, permission_id, actor_user_id, event_type, reason
  )
  values (
    assignment_id, p_user_id, target_permission.id, actor_id, 'granted', btrim(p_reason)
  );
  return assignment_id;
end;
$$;

create or replace function public.revoke_internal_onboarding_capability(
  p_assignment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target public.internal_user_capability_assignments%rowtype;
begin
  if not exists (
    select 1 from public.get_effective_internal_permissions() context
    where context.is_platform_admin
  ) then
    raise exception 'Capability management is not allowed.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A revoke reason is required.' using errcode = '22023';
  end if;
  select * into target
  from public.internal_user_capability_assignments
  where id = p_assignment_id
  for update;
  if target.id is null then
    raise exception 'Capability assignment was not found.' using errcode = 'P0002';
  end if;
  if target.user_id = actor_id then
    raise exception 'Self-revoke is not allowed.' using errcode = '42501';
  end if;
  if target.revoked_at is not null then return; end if;

  update public.internal_user_capability_assignments
  set revoked_at = now(), revoked_by = actor_id, revoke_reason = btrim(p_reason)
  where id = target.id;
  insert into public.internal_user_capability_audit_events(
    assignment_id, target_user_id, permission_id, actor_user_id, event_type, reason
  )
  values (
    target.id, target.user_id, target.permission_id, actor_id, 'revoked', btrim(p_reason)
  );
end;
$$;

create or replace function public.grant_internal_onboarding_capability_bundle(
  p_user_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  permission_code text;
  granted_count integer := 0;
begin
  for permission_code in
    select code from public.permissions where code like 'onboarding.%' order by code
  loop
    perform public.grant_internal_onboarding_capability(
      p_user_id, permission_code, p_reason
    );
    granted_count := granted_count + 1;
  end loop;
  return granted_count;
end;
$$;

create or replace function public.revoke_internal_onboarding_capability_bundle(
  p_user_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  assignment record;
  revoked_count integer := 0;
begin
  for assignment in
    select capability.id
    from public.internal_user_capability_assignments capability
    join public.permissions permission on permission.id = capability.permission_id
    where capability.user_id = p_user_id
      and capability.revoked_at is null
      and permission.code like 'onboarding.%'
    order by permission.code
  loop
    perform public.revoke_internal_onboarding_capability(assignment.id, p_reason);
    revoked_count := revoked_count + 1;
  end loop;
  return revoked_count;
end;
$$;

revoke all on function public.grant_internal_onboarding_capability(uuid, text, text) from public, anon, authenticated;
revoke all on function public.revoke_internal_onboarding_capability(uuid, text) from public, anon, authenticated;
revoke all on function public.grant_internal_onboarding_capability_bundle(uuid, text) from public, anon;
revoke all on function public.revoke_internal_onboarding_capability_bundle(uuid, text) from public, anon;
grant execute on function public.grant_internal_onboarding_capability_bundle(uuid, text) to authenticated;
grant execute on function public.revoke_internal_onboarding_capability_bundle(uuid, text) to authenticated;

-- Governed onboarding workflow. The legacy external status remains operational
-- for deployed partner and approval code until the approval wizard is versioned.
alter table public.access_requests
  add column if not exists onboarding_status text not null default 'received',
  add column if not exists current_revision_id uuid null,
  add column if not exists assigned_manager_user_id uuid null references public.user_profiles(id) on delete restrict,
  add column if not exists assigned_at timestamptz null,
  add column if not exists assigned_by uuid null references public.user_profiles(id) on delete restrict,
  add column if not exists review_started_at timestamptz null,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists confirmed_counterparty_id uuid null references public.one_c_counterparties(id) on delete restrict,
  add column if not exists clarification_paused_at timestamptz null,
  add column if not exists clarification_paused_seconds integer not null default 0,
  add column if not exists initial_access_profile text null;

alter table public.access_requests
  drop constraint if exists access_requests_onboarding_status_check;
alter table public.access_requests
  add constraint access_requests_onboarding_status_check check (
    onboarding_status in (
      'received', 'under_review', 'clarification_requested',
      'awaiting_1c_company', 'link_confirmation_required',
      'ready_for_approval', 'approved', 'rejected', 'cancelled'
    )
  );
alter table public.access_requests
  drop constraint if exists access_requests_initial_access_profile_check;
alter table public.access_requests
  add constraint access_requests_initial_access_profile_check check (
    initial_access_profile is null
    or initial_access_profile in ('owner', 'manager', 'buyer', 'accounting', 'retail_only')
  );

update public.access_requests
set onboarding_status = case status
  when 'approved' then 'approved'
  when 'rejected' then 'rejected'
  when 'cancelled' then 'cancelled'
  else 'received'
end
where onboarding_status = 'received';

create index if not exists access_requests_onboarding_queue_idx
  on public.access_requests(onboarding_status, created_at desc);
create index if not exists access_requests_assigned_manager_idx
  on public.access_requests(assigned_manager_user_id, onboarding_status);
create index if not exists access_requests_last_activity_idx
  on public.access_requests(last_activity_at);

create table if not exists public.onboarding_application_revisions (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null references public.access_requests(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  requested_company_name text not null,
  requested_fiscal_code text null,
  contact_name text null,
  contact_phone text null,
  contact_email text null,
  locality text null,
  business_type text null,
  message text null,
  submitted_by uuid not null references public.user_profiles(id) on delete restrict,
  submitted_at timestamptz not null,
  source text not null check (source in ('migration', 'partner_submission', 'partner_clarification')),
  fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (access_request_id, revision_number)
);

create table if not exists public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null references public.access_requests(id) on delete restrict,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in (
    'application_migrated', 'revision_created', 'assigned', 'unassigned',
    'review_started', 'match_suggested', 'match_confirmed',
    'awaiting_1c_company', 'ready_for_approval', 'status_changed',
    'approval_failed', 'capability_granted', 'capability_revoked'
  )),
  previous_status text null,
  next_status text null,
  safe_metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now()
);

create index if not exists onboarding_revisions_request_idx
  on public.onboarding_application_revisions(access_request_id, revision_number desc);
create index if not exists onboarding_events_request_idx
  on public.onboarding_events(access_request_id, occurred_at desc);

alter table public.onboarding_application_revisions enable row level security;
alter table public.onboarding_events enable row level security;
revoke all on table public.onboarding_application_revisions from anon, authenticated;
revoke all on table public.onboarding_events from anon, authenticated;

insert into public.onboarding_application_revisions(
  access_request_id,
  revision_number,
  requested_company_name,
  requested_fiscal_code,
  contact_name,
  contact_phone,
  contact_email,
  message,
  submitted_by,
  submitted_at,
  source,
  fingerprint
)
select
  request.id,
  1,
  coalesce(nullif(btrim(request.requested_company_name), ''), 'Компания не указана'),
  nullif(btrim(request.requested_fiscal_code), ''),
  nullif(btrim(profile.full_name), ''),
  nullif(btrim(request.contact_phone), ''),
  nullif(btrim(profile.email), ''),
  nullif(btrim(request.message), ''),
  request.user_profile_id,
  request.created_at,
  'migration',
  encode(extensions.digest(
    concat_ws('|',
      request.id::text,
      coalesce(request.requested_company_name, ''),
      coalesce(request.requested_fiscal_code, ''),
      coalesce(request.contact_phone, ''),
      coalesce(request.message, '')
    ),
    'sha256'
  ), 'hex')
from public.access_requests request
join public.user_profiles profile on profile.id = request.user_profile_id
where not exists (
  select 1 from public.onboarding_application_revisions revision
  where revision.access_request_id = request.id
);

update public.access_requests request
set current_revision_id = revision.id
from public.onboarding_application_revisions revision
where revision.access_request_id = request.id
  and revision.revision_number = 1
  and request.current_revision_id is null;

insert into public.onboarding_events(
  access_request_id, actor_user_id, event_type, previous_status, next_status, safe_metadata
)
select request.id, null, 'application_migrated', null, request.onboarding_status,
  jsonb_build_object('revision', 1)
from public.access_requests request
where not exists (
  select 1 from public.onboarding_events event
  where event.access_request_id = request.id
    and event.event_type = 'application_migrated'
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.access_requests'::regclass
      and conname = 'access_requests_current_revision_id_fkey'
  ) then
    alter table public.access_requests
      add constraint access_requests_current_revision_id_fkey
      foreign key (current_revision_id)
      references public.onboarding_application_revisions(id)
      on delete restrict;
  end if;
end;
$$;

create or replace function public.create_initial_onboarding_revision()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  profile public.user_profiles%rowtype;
  revision_id uuid;
begin
  select * into profile from public.user_profiles where id = new.user_profile_id;
  insert into public.onboarding_application_revisions(
    access_request_id,
    revision_number,
    requested_company_name,
    requested_fiscal_code,
    contact_name,
    contact_phone,
    contact_email,
    message,
    submitted_by,
    submitted_at,
    source,
    fingerprint
  )
  values (
    new.id,
    1,
    coalesce(nullif(btrim(new.requested_company_name), ''), 'Компания не указана'),
    nullif(btrim(new.requested_fiscal_code), ''),
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(new.contact_phone), ''),
    nullif(btrim(profile.email), ''),
    nullif(btrim(new.message), ''),
    new.user_profile_id,
    new.created_at,
    'partner_submission',
    encode(extensions.digest(
      concat_ws('|',
        new.id::text,
        coalesce(new.requested_company_name, ''),
        coalesce(new.requested_fiscal_code, ''),
        coalesce(new.contact_phone, ''),
        coalesce(new.message, '')
      ),
      'sha256'
    ), 'hex')
  )
  returning id into revision_id;

  update public.access_requests
  set current_revision_id = revision_id
  where id = new.id;
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status, safe_metadata
  )
  values (
    new.id, new.user_profile_id, 'revision_created', null, new.onboarding_status,
    jsonb_build_object('revision', 1, 'source', 'partner_submission')
  );
  return new;
end;
$$;

drop trigger if exists create_initial_onboarding_revision on public.access_requests;
create trigger create_initial_onboarding_revision
after insert on public.access_requests
for each row execute function public.create_initial_onboarding_revision();

create or replace function public.sync_onboarding_terminal_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' then new.onboarding_status := 'approved';
  elsif new.status = 'rejected' then new.onboarding_status := 'rejected';
  elsif new.status = 'cancelled' then new.onboarding_status := 'cancelled';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_onboarding_terminal_status on public.access_requests;
create trigger sync_onboarding_terminal_status
before update of status on public.access_requests
for each row execute function public.sync_onboarding_terminal_status();

create or replace function public.prevent_onboarding_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Onboarding history is append-only.' using errcode = '42501';
end;
$$;

drop trigger if exists prevent_onboarding_revision_mutation
  on public.onboarding_application_revisions;
create trigger prevent_onboarding_revision_mutation
before update or delete on public.onboarding_application_revisions
for each row execute function public.prevent_onboarding_history_mutation();

drop trigger if exists prevent_onboarding_event_mutation on public.onboarding_events;
create trigger prevent_onboarding_event_mutation
before update or delete on public.onboarding_events
for each row execute function public.prevent_onboarding_history_mutation();

drop trigger if exists prevent_capability_audit_mutation
  on public.internal_user_capability_audit_events;
create trigger prevent_capability_audit_mutation
before update or delete on public.internal_user_capability_audit_events
for each row execute function public.prevent_onboarding_history_mutation();

create or replace function public.onboarding_add_working_hours(
  p_started_at timestamptz,
  p_hours integer
)
returns timestamptz
language plpgsql
stable
as $$
declare
  local_time timestamp := p_started_at at time zone 'Europe/Chisinau';
  remaining integer := greatest(p_hours, 0) * 60;
begin
  while remaining > 0 loop
    local_time := local_time + interval '1 minute';
    if extract(isodow from local_time) between 1 and 5
      and local_time::time >= time '09:00'
      and local_time::time < time '18:00' then
      remaining := remaining - 1;
    end if;
  end loop;
  return local_time at time zone 'Europe/Chisinau';
end;
$$;

create or replace function public.onboarding_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    values
      ('received', 'under_review'),
      ('under_review', 'clarification_requested'),
      ('under_review', 'awaiting_1c_company'),
      ('under_review', 'link_confirmation_required'),
      ('under_review', 'ready_for_approval'),
      ('clarification_requested', 'under_review'),
      ('awaiting_1c_company', 'link_confirmation_required'),
      ('awaiting_1c_company', 'under_review'),
      ('link_confirmation_required', 'under_review'),
      ('link_confirmation_required', 'ready_for_approval'),
      ('ready_for_approval', 'under_review'),
      ('ready_for_approval', 'approved'),
      ('received', 'cancelled'),
      ('clarification_requested', 'cancelled'),
      ('under_review', 'rejected'),
      ('clarification_requested', 'rejected'),
      ('awaiting_1c_company', 'rejected'),
      ('link_confirmation_required', 'rejected'),
      ('ready_for_approval', 'rejected')
  );
$$;

create or replace function public.transition_onboarding_request(
  p_request_id uuid,
  p_next_status text,
  p_reason text default null,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
begin
  if not public.has_internal_permission('onboarding.requests.review') then
    raise exception 'Onboarding review is not allowed.' using errcode = '42501';
  end if;
  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null then
    raise exception 'Onboarding request was not found.' using errcode = 'P0002';
  end if;
  if not public.onboarding_transition_allowed(request.onboarding_status, p_next_status) then
    raise exception 'Invalid onboarding status transition.' using errcode = '22023';
  end if;
  if p_next_status = 'ready_for_approval' and (
    request.confirmed_counterparty_id is null
    or request.initial_access_profile is null
  ) then
    raise exception 'Confirmed company match and initial access profile are required.'
      using errcode = '22023';
  end if;

  update public.access_requests
  set onboarding_status = p_next_status,
      review_started_at = case
        when p_next_status = 'under_review' then coalesce(review_started_at, now())
        else review_started_at
      end,
      clarification_paused_at = case
        when p_next_status = 'clarification_requested' then now()
        when onboarding_status = 'clarification_requested' then null
        else clarification_paused_at
      end,
      clarification_paused_seconds = clarification_paused_seconds + case
        when onboarding_status = 'clarification_requested' and clarification_paused_at is not null
          then greatest(0, extract(epoch from (now() - clarification_paused_at))::integer)
        else 0
      end,
      last_activity_at = now()
  where id = request.id;

  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  )
  values (
    request.id,
    actor_id,
    case p_next_status
      when 'under_review' then 'review_started'
      when 'awaiting_1c_company' then 'awaiting_1c_company'
      when 'ready_for_approval' then 'ready_for_approval'
      else 'status_changed'
    end,
    request.onboarding_status,
    p_next_status,
    case when nullif(btrim(coalesce(p_reason, '')), '') is null
      then '{}'::jsonb
      else jsonb_build_object('reason', left(btrim(p_reason), 500))
    end,
    p_correlation_id
  );
end;
$$;

create or replace function public.assign_onboarding_request(
  p_request_id uuid,
  p_assignee_user_id uuid,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
begin
  if not public.has_internal_permission('onboarding.requests.assign') then
    raise exception 'Onboarding assignment is not allowed.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.user_profiles profile
    where profile.id = p_assignee_user_id
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
      and (
        exists (
          select 1
          from public.internal_user_role_assignments assignment
          join public.roles role on role.id = assignment.role_id
          where assignment.user_id = profile.id
            and assignment.revoked_at is null
            and role.code = 'novotech_admin'
        )
        or exists (
          select 1
          from public.internal_user_capability_assignments capability
          join public.permissions permission on permission.id = capability.permission_id
          where capability.user_id = profile.id
            and capability.revoked_at is null
            and permission.code = 'onboarding.requests.review'
        )
      )
  ) then
    raise exception 'Assignee is not an active onboarding manager.' using errcode = '22023';
  end if;

  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null then
    raise exception 'Onboarding request was not found.' using errcode = 'P0002';
  end if;
  if request.onboarding_status in ('approved', 'rejected', 'cancelled') then
    raise exception 'Completed onboarding request cannot be assigned.' using errcode = '22023';
  end if;

  update public.access_requests
  set assigned_manager_user_id = p_assignee_user_id,
      assigned_at = now(),
      assigned_by = actor_id,
      last_activity_at = now()
  where id = request.id;
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  )
  values (
    request.id, actor_id, 'assigned', request.onboarding_status, request.onboarding_status,
    jsonb_build_object('assignment', 'changed'), p_correlation_id
  );
end;
$$;

create or replace function public.unassign_onboarding_request(
  p_request_id uuid,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
begin
  if not public.has_internal_permission('onboarding.requests.assign') then
    raise exception 'Onboarding assignment is not allowed.' using errcode = '42501';
  end if;
  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null then
    raise exception 'Onboarding request was not found.' using errcode = 'P0002';
  end if;
  if request.onboarding_status in ('approved', 'rejected', 'cancelled') then
    raise exception 'Completed onboarding request cannot be unassigned.' using errcode = '22023';
  end if;
  if request.assigned_manager_user_id is null then return; end if;

  update public.access_requests
  set assigned_manager_user_id = null,
      assigned_at = null,
      assigned_by = null,
      last_activity_at = now()
  where id = request.id;
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  )
  values (
    request.id, actor_id, 'unassigned', request.onboarding_status,
    request.onboarding_status, '{}'::jsonb, p_correlation_id
  );
end;
$$;

create or replace function public.confirm_onboarding_counterparty_match(
  p_request_id uuid,
  p_counterparty_id uuid,
  p_initial_access_profile text,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
  counterparty public.one_c_counterparties%rowtype;
begin
  if not public.has_internal_permission('onboarding.company_match.confirm')
    or not public.has_internal_permission('onboarding.initial_access.assign') then
    raise exception 'Company match confirmation is not allowed.' using errcode = '42501';
  end if;
  if p_initial_access_profile not in ('owner', 'manager', 'buyer', 'accounting', 'retail_only') then
    raise exception 'Unsupported initial access profile.' using errcode = '22023';
  end if;
  select * into request from public.access_requests where id = p_request_id for update;
  select * into counterparty
  from public.one_c_counterparties
  where id = p_counterparty_id and is_published;
  if request.id is null or counterparty.id is null then
    raise exception 'Request or synchronized counterparty was not found.' using errcode = 'P0002';
  end if;
  if not counterparty.is_active or counterparty.is_deleted then
    raise exception 'Inactive counterparty cannot be confirmed.' using errcode = '22023';
  end if;
  if counterparty.portal_company_id is not null
    and counterparty.portal_company_id is distinct from request.company_id then
    raise exception 'Counterparty is already linked to another portal company.'
      using errcode = '23505';
  end if;

  update public.access_requests
  set confirmed_counterparty_id = counterparty.id,
      initial_access_profile = p_initial_access_profile,
      onboarding_status = 'link_confirmation_required',
      last_activity_at = now()
  where id = request.id;
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  )
  values (
    request.id, actor_id, 'match_confirmed', request.onboarding_status,
    'link_confirmation_required',
    jsonb_build_object('match_method', 'manager_confirmed', 'initial_access_profile', p_initial_access_profile),
    p_correlation_id
  );
end;
$$;

revoke all on function public.transition_onboarding_request(uuid, text, text, uuid) from public, anon;
revoke all on function public.assign_onboarding_request(uuid, uuid, uuid) from public, anon;
revoke all on function public.unassign_onboarding_request(uuid, uuid) from public, anon;
revoke all on function public.confirm_onboarding_counterparty_match(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.transition_onboarding_request(uuid, text, text, uuid) to authenticated;
grant execute on function public.assign_onboarding_request(uuid, uuid, uuid) to authenticated;
grant execute on function public.unassign_onboarding_request(uuid, uuid) to authenticated;
grant execute on function public.confirm_onboarding_counterparty_match(uuid, uuid, text, uuid) to authenticated;

create or replace function public.get_onboarding_queue(
  p_page integer default 1,
  p_page_size integer default 25,
  p_status text default null,
  p_assigned_manager uuid default null,
  p_unassigned boolean default false,
  p_sla text default null,
  p_match_state text default null,
  p_search text default null,
  p_locality text default null,
  p_business_type text default null,
  p_submitted_from date default null,
  p_submitted_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
  page_number integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
begin
  if not public.has_internal_permission('onboarding.requests.view') then
    raise exception 'Onboarding queue access is not allowed.' using errcode = '42501';
  end if;

  with base as (
    select
      request.id,
      request.onboarding_status,
      request.created_at,
      request.review_started_at,
      request.assigned_manager_user_id,
      request.last_activity_at,
      revision.requested_company_name as company_name,
      revision.requested_fiscal_code as fiscal_code,
      revision.contact_name,
      revision.contact_phone as phone,
      revision.contact_email as email,
      revision.locality,
      revision.business_type,
      assignee.full_name as assigned_manager,
      public.onboarding_add_working_hours(request.created_at, 4) as first_review_due,
      public.onboarding_add_working_hours(coalesce(request.review_started_at, request.created_at), 9)
        + make_interval(secs => request.clarification_paused_seconds) as final_decision_due,
      (
        select count(*) from public.one_c_counterparties candidate
        where candidate.is_published
          and candidate.normalized_fiscal_code is not null
          and candidate.normalized_fiscal_code =
            lower(regexp_replace(coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'))
      ) as fiscal_match_count,
      exists (
        select 1 from public.partner_companies company
        where lower(regexp_replace(company.display_name, '[^[:alnum:]]+', '', 'g')) =
          lower(regexp_replace(revision.requested_company_name, '[^[:alnum:]]+', '', 'g'))
      ) as existing_company,
      exists (
        select 1 from public.access_requests duplicate
        join public.onboarding_application_revisions duplicate_revision
          on duplicate_revision.id = duplicate.current_revision_id
        where duplicate.id <> request.id
          and duplicate.onboarding_status not in ('rejected', 'cancelled')
          and nullif(lower(regexp_replace(coalesce(duplicate_revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g')), '') =
            nullif(lower(regexp_replace(coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g')), '')
      ) as duplicate_fiscal_code
    from public.access_requests request
    join public.onboarding_application_revisions revision on revision.id = request.current_revision_id
    left join public.user_profiles assignee on assignee.id = request.assigned_manager_user_id
  ),
  projected as (
    select *,
      case
        when fiscal_match_count > 1 then 'multiple_candidates'
        when fiscal_match_count = 1 then 'exact_match'
        when existing_company then 'already_linked'
        else 'no_match'
      end as match_state,
      case
        when onboarding_status = 'clarification_requested' then 'paused'
        when review_started_at is null and now() > first_review_due then 'overdue_first_review'
        when review_started_at is not null
          and onboarding_status not in ('approved', 'rejected', 'cancelled')
          and now() > final_decision_due then 'overdue_final_decision'
        else 'on_time'
      end as sla_state,
      case
        when onboarding_status = 'received' then 'Начать проверку'
        when onboarding_status = 'clarification_requested' then 'Ожидать ответ партнёра'
        when onboarding_status = 'awaiting_1c_company' then 'Проверить синхронизацию 1С'
        when fiscal_match_count = 1 then 'Подтвердить контрагента'
        when fiscal_match_count > 1 then 'Разрешить конфликт'
        else 'Проверить данные'
      end as next_action
    from base
  ),
  filtered as (
    select *
    from projected row
    where (p_status is null or row.onboarding_status = p_status)
      and (p_assigned_manager is null or row.assigned_manager_user_id = p_assigned_manager)
      and (not p_unassigned or row.assigned_manager_user_id is null)
      and (p_sla is null or row.sla_state = p_sla)
      and (p_match_state is null or row.match_state = p_match_state)
      and (p_locality is null or row.locality ilike '%' || btrim(p_locality) || '%')
      and (p_business_type is null or row.business_type = p_business_type)
      and (
        p_submitted_from is null
        or row.created_at >= p_submitted_from::timestamp at time zone 'Europe/Chisinau'
      )
      and (
        p_submitted_to is null
        or row.created_at < (p_submitted_to + 1)::timestamp at time zone 'Europe/Chisinau'
      )
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or concat_ws(' ', row.company_name, row.fiscal_code, row.contact_name, row.phone, row.email)
          ilike '%' || btrim(p_search) || '%'
      )
  ),
  rows_page as (
    select *
    from filtered
    order by
      case when sla_state like 'overdue%' then 0 else 1 end,
      created_at asc,
      id
    limit page_size
    offset (page_number - 1) * page_size
  ),
  status_counts as (
    select onboarding_status, count(*) as count
    from projected group by onboarding_status
  ),
  managers as (
    select distinct profile.id, coalesce(nullif(profile.full_name, ''), profile.email) as name
    from public.user_profiles profile
    where profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
      and (
        exists (
          select 1 from public.internal_user_role_assignments assignment
          join public.roles role on role.id = assignment.role_id
          where assignment.user_id = profile.id
            and assignment.revoked_at is null
            and role.code = 'novotech_admin'
        )
        or exists (
          select 1 from public.internal_user_capability_assignments capability
          join public.permissions permission on permission.id = capability.permission_id
          where capability.user_id = profile.id
            and capability.revoked_at is null
            and permission.code = 'onboarding.requests.review'
        )
      )
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(rows_page)) from rows_page), '[]'::jsonb),
    'totalCount', (select count(*) from filtered),
    'page', page_number,
    'pageSize', page_size,
    'statusCounters', coalesce((
      select jsonb_object_agg(onboarding_status, count) from status_counts
    ), '{}'::jsonb),
    'slaCounters', jsonb_build_object(
      'newToday', (select count(*) from projected where created_at >= date_trunc('day', now() at time zone 'Europe/Chisinau') at time zone 'Europe/Chisinau'),
      'waitingOverFourHours', (select count(*) from projected where sla_state = 'overdue_first_review'),
      'waitingOverOneDay', (select count(*) from projected where sla_state = 'overdue_final_decision'),
      'awaitingPartnerResponse', (select count(*) from projected where onboarding_status = 'clarification_requested'),
      'awaitingOneCCompany', (select count(*) from projected where onboarding_status = 'awaiting_1c_company'),
      'readyForApproval', (select count(*) from projected where onboarding_status = 'ready_for_approval'),
      'unassigned', (select count(*) from projected where assigned_manager_user_id is null and onboarding_status not in ('approved', 'rejected', 'cancelled'))
    ),
    'managers', coalesce((select jsonb_agg(to_jsonb(managers) order by name) from managers), '[]'::jsonb),
    'directoryFreshness', (
      select jsonb_build_object(
        'status', sync.status,
        'synchronizedAt', sync.finished_at,
        'stale', sync.finished_at is null or sync.finished_at < now() - interval '36 hours'
      )
      from public.one_c_counterparty_directory_syncs sync
      where sync.status = 'succeeded'
      order by sync.finished_at desc
      limit 1
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.get_onboarding_request_detail(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('onboarding.requests.view') then
    raise exception 'Onboarding detail access is not allowed.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'request', jsonb_build_object(
      'id', request.id,
      'status', request.onboarding_status,
      'createdAt', request.created_at,
      'lastActivityAt', request.last_activity_at,
      'assignedManager', assignee.full_name,
      'reviewStartedAt', request.review_started_at,
      'initialAccessProfile', request.initial_access_profile
    ),
    'revision', jsonb_build_object(
      'revisionNumber', revision.revision_number,
      'companyName', revision.requested_company_name,
      'fiscalCode', revision.requested_fiscal_code,
      'contactName', revision.contact_name,
      'phone', revision.contact_phone,
      'email', revision.contact_email,
      'message', revision.message,
      'submittedAt', revision.submitted_at
    ),
    'sla', jsonb_build_object(
      'firstReviewDue', public.onboarding_add_working_hours(request.created_at, 4),
      'finalDecisionDue', public.onboarding_add_working_hours(coalesce(request.review_started_at, request.created_at), 9)
        + make_interval(secs => request.clarification_paused_seconds),
      'paused', request.onboarding_status = 'clarification_requested'
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event', event.event_type,
        'previousStatus', event.previous_status,
        'nextStatus', event.next_status,
        'occurredAt', event.occurred_at,
        'actor', actor.full_name
      ) order by event.occurred_at desc)
      from public.onboarding_events event
      left join public.user_profiles actor on actor.id = event.actor_user_id
      where event.access_request_id = request.id
    ), '[]'::jsonb),
    'candidates', coalesce((
      select jsonb_agg(candidate_row.payload order by candidate_row.priority, candidate_row.name)
      from (
        select
          candidate.name,
          case when candidate.normalized_fiscal_code =
            lower(regexp_replace(coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'))
            then 0 else 1 end as priority,
          jsonb_build_object(
            'id', candidate.id,
            'companyName', candidate.name,
            'fiscalCode', candidate.fiscal_code,
            'active', candidate.is_active and not candidate.is_deleted,
            'locality', candidate.locality,
            'assignedManager', candidate.assigned_manager_name,
            'contractCount', (
              select count(*) from public.one_c_counterparty_contracts contract
              where contract.is_published
                and contract.counterparty_external_1c_id = candidate.external_1c_id
                and contract.is_active and not contract.is_deleted
            ),
            'priceProfileCount', (
              select count(*) from public.one_c_counterparty_price_profiles price_profile
              where price_profile.is_published
                and price_profile.counterparty_external_1c_id = candidate.external_1c_id
                and price_profile.is_active and not price_profile.is_deleted
            ),
            'portalLinkageState', case when candidate.portal_company_id is null then 'not_linked' else 'already_linked' end,
            'synchronizedAt', candidate.synchronized_at,
            'matchReason', case
              when candidate.normalized_fiscal_code is not null
                and candidate.normalized_fiscal_code = lower(regexp_replace(coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'))
                then 'exact_fiscal_code'
              when candidate.normalized_name = lower(regexp_replace(revision.requested_company_name, '[^[:alnum:]]+', '', 'g'))
                then 'exact_name'
              when candidate.normalized_email is not null
                and candidate.normalized_email = lower(btrim(coalesce(revision.contact_email, '')))
                then 'exact_email'
              else 'exact_phone'
            end
          ) as payload
        from public.one_c_counterparties candidate
        where candidate.is_published
          and (
            (
              candidate.normalized_fiscal_code is not null
              and candidate.normalized_fiscal_code =
                lower(regexp_replace(coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'))
            )
            or candidate.normalized_name =
              lower(regexp_replace(revision.requested_company_name, '[^[:alnum:]]+', '', 'g'))
            or (
              candidate.normalized_email is not null
              and candidate.normalized_email = lower(btrim(coalesce(revision.contact_email, '')))
            )
            or (
              candidate.normalized_phone is not null
              and candidate.normalized_phone =
                regexp_replace(coalesce(revision.contact_phone, ''), '[^0-9]+', '', 'g')
            )
          )
        order by priority, candidate.name
        limit 20
      ) candidate_row
    ), '[]'::jsonb),
    'duplicates', jsonb_build_object(
      'sameFiscalCode', exists (
        select 1
        from public.access_requests duplicate
        join public.onboarding_application_revisions duplicate_revision
          on duplicate_revision.id = duplicate.current_revision_id
        where duplicate.id <> request.id
          and duplicate.onboarding_status not in ('rejected', 'cancelled')
          and nullif(lower(regexp_replace(coalesce(duplicate_revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g')), '') =
            nullif(lower(regexp_replace(coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g')), '')
      ),
      'sameEmail', exists (
        select 1
        from public.user_profiles profile
        where profile.id <> request.user_profile_id
          and lower(btrim(profile.email)) = lower(btrim(coalesce(revision.contact_email, '')))
      ),
      'existingMembership', exists (
        select 1 from public.company_memberships membership
        where membership.user_id = request.user_profile_id
          and membership.status = 'active'
      ),
      'userLinkedToAnotherCompany', exists (
        select 1 from public.company_memberships membership
        where membership.user_id = request.user_profile_id
          and membership.status = 'active'
          and membership.company_id is distinct from request.company_id
      )
    ),
    'managers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', manager.id,
          'name', coalesce(nullif(manager.full_name, ''), manager.email)
        )
        order by coalesce(nullif(manager.full_name, ''), manager.email)
      )
      from public.user_profiles manager
      where manager.status = 'active'
        and manager.user_type in ('internal', 'admin')
        and (
          exists (
            select 1
            from public.internal_user_role_assignments assignment
            join public.roles role on role.id = assignment.role_id
            where assignment.user_id = manager.id
              and assignment.revoked_at is null
              and role.code = 'novotech_admin'
          )
          or exists (
            select 1
            from public.internal_user_capability_assignments capability
            join public.permissions permission on permission.id = capability.permission_id
            where capability.user_id = manager.id
              and capability.revoked_at is null
              and permission.code = 'onboarding.requests.review'
          )
        )
    ), '[]'::jsonb)
  ) into result
  from public.access_requests request
  join public.onboarding_application_revisions revision on revision.id = request.current_revision_id
  left join public.user_profiles assignee on assignee.id = request.assigned_manager_user_id
  where request.id = p_request_id;
  return result;
end;
$$;

create or replace function public.get_onboarding_health()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when not public.has_internal_permission('onboarding.requests.view') then
      jsonb_build_object('allowed', false)
    else jsonb_build_object(
      'allowed', true,
      'directory', (
        select to_jsonb(sync)
        from public.one_c_counterparty_directory_syncs sync
        order by sync.started_at desc limit 1
      ),
      'queue', jsonb_build_object(
        'new', count(*) filter (where onboarding_status = 'received'),
        'unassigned', count(*) filter (
          where assigned_manager_user_id is null
            and onboarding_status not in ('approved', 'rejected', 'cancelled')
        ),
        'overdue', count(*) filter (
          where onboarding_status not in ('approved', 'rejected', 'cancelled', 'clarification_requested')
            and now() > public.onboarding_add_working_hours(created_at, 4)
        ),
        'matchConflicts', count(*) filter (where onboarding_status = 'link_confirmation_required'),
        'awaitingOneCCompany', count(*) filter (where onboarding_status = 'awaiting_1c_company')
      )
    )
  end
  from public.access_requests;
$$;

revoke all on function public.get_onboarding_queue(integer, integer, text, uuid, boolean, text, text, text, text, text, date, date) from public, anon;
revoke all on function public.get_onboarding_request_detail(uuid) from public, anon;
revoke all on function public.get_onboarding_health() from public, anon;
grant execute on function public.get_onboarding_queue(integer, integer, text, uuid, boolean, text, text, text, text, text, date, date) to authenticated;
grant execute on function public.get_onboarding_request_detail(uuid) to authenticated;
grant execute on function public.get_onboarding_health() to authenticated;

-- The publisher is service-role only. Every publication operation is atomic.
create or replace function public.publish_one_c_counterparty_directory(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  published_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Directory publication requires service role.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.one_c_counterparty_directory_syncs
    where sync_id = p_sync_id and status = 'running'
  ) then
    raise exception 'Active directory synchronization was not found.' using errcode = 'P0002';
  end if;

  update public.one_c_counterparties set is_published = false where is_published;
  update public.one_c_counterparty_contracts set is_published = false where is_published;
  update public.one_c_counterparty_price_profiles set is_published = false where is_published;

  update public.one_c_counterparties counterparty
  set is_published = true,
      portal_company_id = company.id,
      updated_at = now()
  from public.partner_companies company
  where counterparty.sync_id = p_sync_id
    and lower(company.external_1c_id) = lower(counterparty.external_1c_id);
  update public.one_c_counterparties
  set is_published = true, updated_at = now()
  where sync_id = p_sync_id and not is_published;
  update public.one_c_counterparty_contracts
  set is_published = true where sync_id = p_sync_id;
  update public.one_c_counterparty_price_profiles
  set is_published = true where sync_id = p_sync_id;

  select count(*) into published_count
  from public.one_c_counterparties
  where sync_id = p_sync_id and is_published;

  update public.one_c_counterparty_directory_syncs
  set status = 'succeeded',
      finished_at = now(),
      lock_acquired_at = null,
      published_counterparties = published_count,
      portal_linked = (
        select count(*) from public.one_c_counterparties
        where sync_id = p_sync_id and portal_company_id is not null
      ),
      updated_at = now()
  where sync_id = p_sync_id;

  return jsonb_build_object(
    'published', published_count,
    'portalLinked', (
      select count(*) from public.one_c_counterparties
      where sync_id = p_sync_id and portal_company_id is not null
    ),
    'syncId', p_sync_id
  );
end;
$$;

revoke all on function public.publish_one_c_counterparty_directory(uuid) from public, anon, authenticated;
grant execute on function public.publish_one_c_counterparty_directory(uuid) to service_role;

comment on table public.one_c_counterparties is
  'Published server-synchronized 1C counterparty onboarding read model. 1C remains authoritative.';
comment on table public.internal_user_capability_assignments is
  'Additive governed internal capabilities. Primary internal role assignments remain unchanged.';
comment on table public.onboarding_application_revisions is
  'Append-only business submissions for onboarding clarification and review.';
comment on table public.onboarding_events is
  'Append-only safe onboarding workflow audit history.';

commit;
