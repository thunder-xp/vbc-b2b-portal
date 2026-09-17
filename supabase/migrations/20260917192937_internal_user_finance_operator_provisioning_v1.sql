begin;

create table public.internal_user_provisioning_requests (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null,
  display_name text not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  requested_by uuid not null references public.user_profiles(id) on delete restrict,
  reason text not null,
  status text not null default 'requested',
  target_auth_user_id uuid null references auth.users(id) on delete restrict,
  invited_at timestamptz null,
  activated_at timestamptz null,
  failed_at timestamptz null,
  safe_error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_user_provisioning_email_check check (
    normalized_email = lower(btrim(normalized_email))
    and char_length(normalized_email) between 3 and 320
    and normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  ),
  constraint internal_user_provisioning_display_name_check check (
    char_length(btrim(display_name)) between 2 and 160
  ),
  constraint internal_user_provisioning_reason_check check (
    char_length(btrim(reason)) between 3 and 500
  ),
  constraint internal_user_provisioning_status_check check (
    status in ('requested', 'invited', 'active', 'failed')
  ),
  constraint internal_user_provisioning_state_check check (
    (status = 'requested' and target_auth_user_id is null and invited_at is null and activated_at is null and failed_at is null)
    or (status = 'invited' and target_auth_user_id is not null and invited_at is not null and activated_at is null and failed_at is null)
    or (status = 'active' and target_auth_user_id is not null and invited_at is not null and activated_at is not null and failed_at is null)
    or (status = 'failed' and activated_at is null and failed_at is not null and safe_error_code is not null)
  )
);

create unique index internal_user_provisioning_open_email_idx
  on public.internal_user_provisioning_requests(normalized_email)
  where status in ('requested', 'invited', 'active');
create unique index internal_user_provisioning_auth_user_idx
  on public.internal_user_provisioning_requests(target_auth_user_id)
  where target_auth_user_id is not null;
create index internal_user_provisioning_created_idx
  on public.internal_user_provisioning_requests(created_at desc, id desc);

create trigger set_internal_user_provisioning_updated_at
before update on public.internal_user_provisioning_requests
for each row execute function public.set_updated_at();

comment on table public.internal_user_provisioning_requests is
  'Governed server-only lifecycle for separate Novotech internal identities. Authentication remains owned by Supabase Auth and role authority remains in internal_user_role_assignments.';

create table public.internal_user_provisioning_audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.internal_user_provisioning_requests(id) on delete restrict,
  target_auth_user_id uuid null references auth.users(id) on delete restrict,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('requested', 'invite_sent', 'activated', 'failed')),
  safe_detail text null check (safe_detail is null or char_length(safe_detail) <= 100),
  created_at timestamptz not null default now()
);

create index internal_user_provisioning_audit_request_idx
  on public.internal_user_provisioning_audit_events(request_id, created_at, id);
create index internal_user_provisioning_audit_target_idx
  on public.internal_user_provisioning_audit_events(target_auth_user_id, created_at desc)
  where target_auth_user_id is not null;

comment on table public.internal_user_provisioning_audit_events is
  'Append-only safe audit of internal identity request, Auth invitation, activation, and failure. Credentials and invitation tokens are never stored.';

create or replace function public.reject_internal_user_provisioning_audit_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Internal user provisioning audit is append-only.' using errcode = '42501';
end;
$$;

create trigger protect_internal_user_provisioning_audit
before update or delete on public.internal_user_provisioning_audit_events
for each row execute function public.reject_internal_user_provisioning_audit_mutation();

create or replace function public.begin_finance_operator_provisioning(
  p_email text,
  p_display_name text,
  p_reason text
)
returns table(request_id uuid, newly_created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  normalized_target_email text := lower(btrim(coalesce(p_email, '')));
  normalized_display_name text := btrim(coalesce(p_display_name, ''));
  normalized_reason text := public.require_access_change_reason(p_reason);
  finance_role public.roles%rowtype;
  existing_request public.internal_user_provisioning_requests%rowtype;
  created_request public.internal_user_provisioning_requests%rowtype;
begin
  if actor_id is null or not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Internal user provisioning is not allowed.' using errcode = '42501';
  end if;
  if char_length(normalized_target_email) not between 3 and 320
    or normalized_target_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'A valid internal email is required.' using errcode = '22023';
  end if;
  if char_length(normalized_display_name) not between 2 and 160 then
    raise exception 'An internal display name between 2 and 160 characters is required.' using errcode = '22023';
  end if;

  select * into finance_role
  from public.roles role
  where role.code = 'novotech_finance' and role.scope = 'internal';
  if finance_role.id is null then
    raise exception 'The governed finance role is unavailable.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(normalized_target_email, 0));

  if exists (
    select 1 from auth.users auth_user
    where lower(btrim(auth_user.email)) = normalized_target_email
  ) or exists (
    select 1 from public.user_profiles profile
    where lower(btrim(profile.email)) = normalized_target_email
  ) then
    raise exception 'An identity with this email already exists.' using errcode = '23505';
  end if;

  select * into existing_request
  from public.internal_user_provisioning_requests request
  where request.normalized_email = normalized_target_email
    and request.status in ('requested', 'invited', 'active')
  for update;
  if existing_request.id is not null then
    return query select existing_request.id, false;
    return;
  end if;

  insert into public.internal_user_provisioning_requests(
    normalized_email, display_name, role_id, requested_by, reason
  ) values (
    normalized_target_email, normalized_display_name, finance_role.id, actor_id, normalized_reason
  ) returning * into created_request;

  insert into public.internal_user_provisioning_audit_events(
    request_id, actor_user_id, event_type, safe_detail
  ) values (
    created_request.id, actor_id, 'requested', finance_role.code
  );

  return query select created_request.id, true;
end;
$$;

create or replace function public.mark_finance_operator_invited(
  p_request_id uuid,
  p_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target_request public.internal_user_provisioning_requests%rowtype;
  auth_email text;
begin
  if actor_id is null or not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Internal user provisioning is not allowed.' using errcode = '42501';
  end if;
  select * into target_request
  from public.internal_user_provisioning_requests request
  where request.id = p_request_id
  for update;
  if target_request.id is null then
    raise exception 'Internal user provisioning request was not found.' using errcode = 'P0002';
  end if;
  if target_request.status = 'invited' and target_request.target_auth_user_id = p_auth_user_id then
    return target_request.id;
  end if;
  if target_request.status <> 'requested' then
    raise exception 'Internal user provisioning request is not awaiting Auth invitation.' using errcode = '55000';
  end if;

  select lower(btrim(auth_user.email)) into auth_email
  from auth.users auth_user
  where auth_user.id = p_auth_user_id;
  if auth_email is null or auth_email <> target_request.normalized_email then
    raise exception 'Auth invitation identity does not match the governed request.' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_profiles profile where profile.id = p_auth_user_id) then
    raise exception 'Auth invitation identity already has a Portal profile.' using errcode = '23505';
  end if;

  update public.internal_user_provisioning_requests
  set status = 'invited', target_auth_user_id = p_auth_user_id,
      invited_at = now(), safe_error_code = null
  where id = target_request.id;

  insert into public.internal_user_provisioning_audit_events(
    request_id, target_auth_user_id, actor_user_id, event_type, safe_detail
  ) values (
    target_request.id, p_auth_user_id, actor_id, 'invite_sent', 'supabase_auth'
  );
  return target_request.id;
end;
$$;

create or replace function public.fail_finance_operator_provisioning(
  p_request_id uuid,
  p_safe_error_code text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target_request public.internal_user_provisioning_requests%rowtype;
  normalized_code text := upper(btrim(coalesce(p_safe_error_code, '')));
begin
  if actor_id is null or not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Internal user provisioning is not allowed.' using errcode = '42501';
  end if;
  if normalized_code !~ '^[A-Z0-9_]{3,100}$' then
    raise exception 'A safe provisioning error code is required.' using errcode = '22023';
  end if;
  select * into target_request
  from public.internal_user_provisioning_requests request
  where request.id = p_request_id
  for update;
  if target_request.id is null then
    raise exception 'Internal user provisioning request was not found.' using errcode = 'P0002';
  end if;
  if target_request.status = 'failed' then return target_request.id; end if;
  if target_request.status not in ('requested', 'invited') then
    raise exception 'Active internal user provisioning cannot be failed.' using errcode = '55000';
  end if;

  update public.internal_user_provisioning_requests
  set status = 'failed', failed_at = now(), safe_error_code = normalized_code
  where id = target_request.id;
  insert into public.internal_user_provisioning_audit_events(
    request_id, target_auth_user_id, actor_user_id, event_type, safe_detail
  ) values (
    target_request.id, target_request.target_auth_user_id, actor_id, 'failed', normalized_code
  );
  return target_request.id;
end;
$$;

create or replace function public.activate_invited_finance_operator()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  email_confirmed_at timestamptz;
  target_request public.internal_user_provisioning_requests%rowtype;
  finance_role public.roles%rowtype;
  existing_assignment public.internal_user_role_assignments%rowtype;
  created_assignment public.internal_user_role_assignments%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));

  select lower(btrim(auth_user.email)), auth_user.email_confirmed_at
    into actor_email, email_confirmed_at
  from auth.users auth_user
  where auth_user.id = actor_id;
  if actor_email is null or email_confirmed_at is null then
    raise exception 'A verified invited email identity is required.' using errcode = '42501';
  end if;

  select * into target_request
  from public.internal_user_provisioning_requests request
  where request.target_auth_user_id = actor_id
    and request.status in ('invited', 'active')
  for update;
  if target_request.id is null or target_request.normalized_email <> actor_email then
    raise exception 'An active internal invitation was not found.' using errcode = '42501';
  end if;

  select * into finance_role from public.roles role where role.id = target_request.role_id;
  if finance_role.code <> 'novotech_finance' or finance_role.scope <> 'internal' then
    raise exception 'The governed finance role does not match the invitation.' using errcode = '42501';
  end if;

  if target_request.status = 'active' then
    select * into existing_assignment
    from public.internal_user_role_assignments assignment
    where assignment.user_id = actor_id and assignment.revoked_at is null;
    if existing_assignment.role_id <> finance_role.id then
      raise exception 'The active finance operator role is inconsistent.' using errcode = '55000';
    end if;
    return existing_assignment.id;
  end if;

  if exists (select 1 from public.user_profiles profile where profile.id = actor_id) then
    raise exception 'The invited Auth identity already has a Portal profile.' using errcode = '23505';
  end if;

  insert into public.user_profiles(id, email, full_name, status, user_type)
  values (actor_id, actor_email, target_request.display_name, 'active', 'internal');

  insert into public.internal_user_role_assignments(user_id, role_id, assigned_by)
  values (actor_id, finance_role.id, target_request.requested_by)
  returning * into created_assignment;

  insert into public.internal_role_assignment_audit_events(
    assignment_id, target_user_id, role_id, actor_user_id, event_type, reason
  ) values (
    created_assignment.id, actor_id, finance_role.id,
    target_request.requested_by, 'assigned', target_request.reason
  );

  update public.internal_user_provisioning_requests
  set status = 'active', activated_at = now(), safe_error_code = null
  where id = target_request.id;

  insert into public.internal_user_provisioning_audit_events(
    request_id, target_auth_user_id, actor_user_id, event_type, safe_detail
  ) values (
    target_request.id, actor_id, actor_id, 'activated', finance_role.code
  );
  return created_assignment.id;
end;
$$;

create or replace function public.get_my_internal_user_provisioning()
returns table(
  request_id uuid,
  email text,
  display_name text,
  role_code text,
  provisioning_status text
)
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select request.id, request.normalized_email, request.display_name,
    role.code, request.status
  from public.internal_user_provisioning_requests request
  join public.roles role on role.id = request.role_id
  where request.target_auth_user_id = auth.uid()
    and request.status in ('invited', 'active')
  order by request.created_at desc
  limit 1;
$$;

create or replace function public.get_internal_user_provisioning_audit(p_request_id uuid)
returns table(
  event_type text,
  safe_detail text,
  actor_user_id uuid,
  target_auth_user_id uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if not public.has_internal_permission('admin.audit.view')
    and not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Internal provisioning audit access is not allowed.' using errcode = '42501';
  end if;
  return query
  select event.event_type, event.safe_detail, event.actor_user_id,
    event.target_auth_user_id, event.created_at
  from public.internal_user_provisioning_audit_events event
  where event.request_id = p_request_id
  order by event.created_at, event.id;
end;
$$;

alter table public.internal_user_provisioning_requests enable row level security;
alter table public.internal_user_provisioning_audit_events enable row level security;

revoke all on table public.internal_user_provisioning_requests from public, anon, authenticated;
revoke all on table public.internal_user_provisioning_audit_events from public, anon, authenticated;

revoke all on function public.reject_internal_user_provisioning_audit_mutation() from public, anon, authenticated;
revoke all on function public.begin_finance_operator_provisioning(text, text, text) from public, anon, authenticated;
revoke all on function public.mark_finance_operator_invited(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_finance_operator_provisioning(uuid, text) from public, anon, authenticated;
revoke all on function public.activate_invited_finance_operator() from public, anon, authenticated;
revoke all on function public.get_my_internal_user_provisioning() from public, anon, authenticated;
revoke all on function public.get_internal_user_provisioning_audit(uuid) from public, anon, authenticated;

grant execute on function public.begin_finance_operator_provisioning(text, text, text) to authenticated;
grant execute on function public.mark_finance_operator_invited(uuid, uuid) to authenticated;
grant execute on function public.fail_finance_operator_provisioning(uuid, text) to authenticated;
grant execute on function public.activate_invited_finance_operator() to authenticated;
grant execute on function public.get_my_internal_user_provisioning() to authenticated;
grant execute on function public.get_internal_user_provisioning_audit(uuid) to authenticated;

commit;
