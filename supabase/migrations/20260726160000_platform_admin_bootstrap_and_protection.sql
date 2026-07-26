begin;

-- Serializes bootstrap and final-administrator transitions across all callers.
create or replace function public.lock_platform_admin_transition()
returns void
language sql
volatile
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended('novotech:platform-admin', 0));
$$;

revoke all on function public.lock_platform_admin_transition()
  from public, anon, authenticated;

create or replace function public.protect_last_platform_admin_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_role_code text;
  remaining_admin_count integer;
begin
  if old.revoked_at is not null or new.revoked_at is null then
    return new;
  end if;

  select role.code into old_role_code
  from public.roles role
  where role.id = old.role_id;

  if old_role_code <> 'novotech_admin' then
    return new;
  end if;

  perform public.lock_platform_admin_transition();

  select count(*) into remaining_admin_count
  from public.internal_user_role_assignments assignment
  join public.roles role on role.id = assignment.role_id
  join public.user_profiles profile on profile.id = assignment.user_id
  where assignment.revoked_at is null
    and assignment.id <> old.id
    and role.code = 'novotech_admin'
    and role.scope = 'internal'
    and profile.status = 'active'
    and profile.user_type in ('internal', 'admin');

  if remaining_admin_count = 0 then
    raise exception 'The final active platform administrator cannot be revoked.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_last_platform_admin_assignment
  on public.internal_user_role_assignments;
create trigger protect_last_platform_admin_assignment
before update of revoked_at on public.internal_user_role_assignments
for each row execute function public.protect_last_platform_admin_assignment();

create or replace function public.protect_last_platform_admin_profile()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_active_admin boolean;
  remaining_admin_count integer;
begin
  if old.status <> 'active' or new.status = 'active' then
    return new;
  end if;

  select exists (
    select 1
    from public.internal_user_role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.user_id = old.id
      and assignment.revoked_at is null
      and role.code = 'novotech_admin'
      and role.scope = 'internal'
  ) into is_active_admin;

  if not is_active_admin then
    return new;
  end if;

  perform public.lock_platform_admin_transition();

  select count(*) into remaining_admin_count
  from public.internal_user_role_assignments assignment
  join public.roles role on role.id = assignment.role_id
  join public.user_profiles profile on profile.id = assignment.user_id
  where assignment.revoked_at is null
    and assignment.user_id <> old.id
    and role.code = 'novotech_admin'
    and role.scope = 'internal'
    and profile.status = 'active'
    and profile.user_type in ('internal', 'admin');

  if remaining_admin_count = 0 then
    raise exception 'The final active platform administrator cannot be suspended.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_last_platform_admin_profile
  on public.user_profiles;
create trigger protect_last_platform_admin_profile
before update of status on public.user_profiles
for each row execute function public.protect_last_platform_admin_profile();

create or replace function public.bootstrap_platform_admin(
  p_user_id uuid,
  p_email text,
  p_confirmation text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  expected_confirmation text;
  target_profile public.user_profiles%rowtype;
  target_role public.roles%rowtype;
  existing_assignment public.internal_user_role_assignments%rowtype;
  existing_admin_count integer;
  created_assignment public.internal_user_role_assignments%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Platform administrator bootstrap is not allowed.'
      using errcode = '42501';
  end if;

  if p_user_id is null or normalized_email = '' then
    raise exception 'An exact internal identity is required.'
      using errcode = '22023';
  end if;

  expected_confirmation :=
    'BOOTSTRAP NOVOTECH ADMIN ' || p_user_id::text || ' ' || normalized_email;
  if p_confirmation is distinct from expected_confirmation then
    raise exception 'Exact platform administrator confirmation is required.'
      using errcode = '22023';
  end if;

  perform public.lock_platform_admin_transition();

  select * into target_profile
  from public.user_profiles profile
  where profile.id = p_user_id
  for update;

  if target_profile.id is null
    or target_profile.status <> 'active'
    or target_profile.user_type not in ('internal', 'admin')
    or lower(coalesce(target_profile.email, '')) <> normalized_email then
    raise exception 'An exact active internal profile is required.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_user_id
      and lower(auth_user.email) = normalized_email
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'A matching verified authentication identity is required.'
      using errcode = '23514';
  end if;

  select * into target_role
  from public.roles role
  where role.code = 'novotech_admin'
    and role.scope = 'internal';

  if target_role.id is null then
    raise exception 'The platform administrator role is unavailable.'
      using errcode = '23514';
  end if;

  select * into existing_assignment
  from public.internal_user_role_assignments assignment
  where assignment.user_id = p_user_id
    and assignment.revoked_at is null
  for update;

  select count(*) into existing_admin_count
  from public.internal_user_role_assignments assignment
  join public.roles role on role.id = assignment.role_id
  join public.user_profiles profile on profile.id = assignment.user_id
  where assignment.revoked_at is null
    and role.code = 'novotech_admin'
    and role.scope = 'internal'
    and profile.status = 'active'
    and profile.user_type in ('internal', 'admin');

  if existing_admin_count > 0 then
    if existing_assignment.id is not null
      and existing_assignment.role_id = target_role.id then
      return existing_assignment.id;
    end if;
    raise exception 'A platform administrator already exists.'
      using errcode = '23505';
  end if;

  if existing_assignment.id is not null then
    raise exception 'The target user already has an active internal role.'
      using errcode = '23505';
  end if;

  insert into public.internal_user_role_assignments(
    user_id,
    role_id,
    assigned_by
  ) values (
    p_user_id,
    target_role.id,
    null
  ) returning * into created_assignment;

  insert into public.internal_role_assignment_audit_events(
    assignment_id,
    target_user_id,
    role_id,
    actor_user_id,
    event_type,
    reason
  ) values (
    created_assignment.id,
    p_user_id,
    target_role.id,
    null,
    'assigned',
    'Controlled first platform administrator bootstrap.'
  );

  return created_assignment.id;
end;
$$;

comment on function public.bootstrap_platform_admin(uuid, text, text) is
  'Service-role-only, exact-identity bootstrap for the first Novotech platform administrator. It is idempotent only for the same active administrator.';

revoke all on function public.bootstrap_platform_admin(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_platform_admin(uuid, text, text)
  to service_role;

create or replace function public.revoke_internal_user_role(
  p_user_id uuid,
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
  normalized_reason text := btrim(coalesce(p_reason, ''));
  target_assignment public.internal_user_role_assignments%rowtype;
begin
  if not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Internal role management is not allowed.'
      using errcode = '42501';
  end if;
  if char_length(normalized_reason) not between 3 and 500 then
    raise exception 'A role revocation reason is required.'
      using errcode = '22023';
  end if;

  select * into target_assignment
  from public.internal_user_role_assignments assignment
  where assignment.user_id = p_user_id
    and assignment.revoked_at is null
  for update;

  if target_assignment.id is null then
    raise exception 'An active internal role assignment was not found.'
      using errcode = 'P0002';
  end if;

  update public.internal_user_role_assignments
  set revoked_at = now()
  where id = target_assignment.id;

  insert into public.internal_role_assignment_audit_events(
    assignment_id,
    target_user_id,
    role_id,
    actor_user_id,
    event_type,
    reason
  ) values (
    target_assignment.id,
    target_assignment.user_id,
    target_assignment.role_id,
    actor_id,
    'revoked',
    normalized_reason
  );

  return target_assignment.id;
end;
$$;

revoke all on function public.revoke_internal_user_role(uuid, text)
  from public, anon;
grant execute on function public.revoke_internal_user_role(uuid, text)
  to authenticated;

commit;
