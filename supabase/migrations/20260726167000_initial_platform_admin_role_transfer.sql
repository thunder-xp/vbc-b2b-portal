begin;

alter table public.internal_role_assignment_audit_events
  add column if not exists previous_role_id uuid null
    references public.roles(id) on delete restrict;

alter table public.internal_role_assignment_audit_events
  drop constraint if exists internal_role_assignment_audit_events_event_type_check;
alter table public.internal_role_assignment_audit_events
  add constraint internal_role_assignment_audit_events_event_type_check
  check (event_type in ('assigned', 'revoked', 'transferred'));

alter table public.internal_role_assignment_audit_events
  drop constraint if exists internal_role_assignment_audit_events_transfer_shape_check;
alter table public.internal_role_assignment_audit_events
  add constraint internal_role_assignment_audit_events_transfer_shape_check
  check (
    (event_type = 'transferred' and previous_role_id is not null)
    or (event_type <> 'transferred' and previous_role_id is null)
  );

create or replace function public.transfer_initial_platform_admin(
  p_user_id uuid,
  p_email text,
  p_expected_sales_assignment_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  expected_confirmation text;
  target_profile public.user_profiles%rowtype;
  sales_role public.roles%rowtype;
  admin_role public.roles%rowtype;
  active_assignment public.internal_user_role_assignments%rowtype;
  admin_assignment public.internal_user_role_assignments%rowtype;
  active_assignment_count integer;
  active_admin_count integer;
  auth_identity_count integer;
  transfer_audit_count integer;
  transfer_reason constant text :=
    'Initial platform administrator role transfer approved by Novotech platform owner.';
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Initial platform administrator transfer is not allowed.'
      using errcode = '42501';
  end if;

  if p_user_id is null
    or p_expected_sales_assignment_id is null
    or normalized_email = '' then
    raise exception 'Exact transfer identity and assignment are required.'
      using errcode = '22023';
  end if;

  expected_confirmation :=
    'TRANSFER NOVOTECH ADMIN '
    || p_user_id::text || ' '
    || normalized_email || ' '
    || p_expected_sales_assignment_id::text;
  if p_confirmation is distinct from expected_confirmation then
    raise exception 'Exact platform administrator transfer confirmation is required.'
      using errcode = '22023';
  end if;

  perform public.lock_platform_admin_transition();

  select count(*) into auth_identity_count
  from auth.users auth_user
  where lower(btrim(auth_user.email)) = normalized_email;

  if auth_identity_count <> 1 or not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_user_id
      and lower(btrim(auth_user.email)) = normalized_email
      and auth_user.email_confirmed_at is not null
      and auth_user.deleted_at is null
  ) then
    raise exception 'A unique verified authentication identity is required.'
      using errcode = '23514';
  end if;

  select * into target_profile
  from public.user_profiles profile
  where profile.id = p_user_id
  for update;

  if target_profile.id is null
    or target_profile.status <> 'active'
    or target_profile.user_type not in ('internal', 'admin')
    or lower(btrim(coalesce(target_profile.email, ''))) <> normalized_email then
    raise exception 'An exact active internal profile is required.'
      using errcode = '23514';
  end if;

  select * into sales_role
  from public.roles role
  where role.code = 'novotech_sales'
    and role.scope = 'internal';
  select * into admin_role
  from public.roles role
  where role.code = 'novotech_admin'
    and role.scope = 'internal';

  if sales_role.id is null or admin_role.id is null then
    raise exception 'Required internal roles are unavailable.'
      using errcode = '23514';
  end if;

  select count(*) into active_assignment_count
  from public.internal_user_role_assignments assignment
  where assignment.user_id = p_user_id
    and assignment.revoked_at is null;

  select * into active_assignment
  from public.internal_user_role_assignments assignment
  where assignment.user_id = p_user_id
    and assignment.revoked_at is null
  for update;

  select count(*) into active_admin_count
  from public.internal_user_role_assignments assignment
  join public.roles role on role.id = assignment.role_id
  join public.user_profiles profile on profile.id = assignment.user_id
  where assignment.revoked_at is null
    and role.code = 'novotech_admin'
    and role.scope = 'internal'
    and profile.status = 'active'
    and profile.user_type in ('internal', 'admin');

  if active_assignment_count = 1
    and active_assignment.role_id = admin_role.id then
    select count(*) into transfer_audit_count
    from public.internal_role_assignment_audit_events event
    where event.assignment_id = active_assignment.id
      and event.target_user_id = p_user_id
      and event.role_id = admin_role.id
      and event.previous_role_id = sales_role.id
      and event.actor_user_id is null
      and event.event_type = 'transferred'
      and event.reason = transfer_reason;

    if active_admin_count = 1
      and transfer_audit_count = 1
      and exists (
        select 1
        from public.internal_user_role_assignments previous
        where previous.id = p_expected_sales_assignment_id
          and previous.user_id = p_user_id
          and previous.role_id = sales_role.id
          and previous.revoked_at is not null
      ) then
      return jsonb_build_object(
        'assignmentId', active_assignment.id,
        'previousAssignmentId', p_expected_sales_assignment_id,
        'idempotent', true
      );
    end if;

    raise exception 'Existing platform administrator state is not a valid prior transfer.'
      using errcode = '23514';
  end if;

  if active_admin_count <> 0 then
    raise exception 'A platform administrator already exists.'
      using errcode = '23505';
  end if;

  if active_assignment_count <> 1
    or active_assignment.id <> p_expected_sales_assignment_id
    or active_assignment.role_id <> sales_role.id then
    raise exception 'The verified sales assignment has changed.'
      using errcode = '23514';
  end if;

  update public.internal_user_role_assignments
  set revoked_at = now()
  where id = active_assignment.id;

  insert into public.internal_user_role_assignments(
    user_id,
    role_id,
    assigned_by
  ) values (
    p_user_id,
    admin_role.id,
    null
  ) returning * into admin_assignment;

  insert into public.internal_role_assignment_audit_events(
    assignment_id,
    target_user_id,
    role_id,
    previous_role_id,
    actor_user_id,
    event_type,
    reason
  ) values (
    admin_assignment.id,
    p_user_id,
    admin_role.id,
    sales_role.id,
    null,
    'transferred',
    transfer_reason
  );

  if (
    select count(*)
    from public.internal_user_role_assignments assignment
    where assignment.user_id = p_user_id
      and assignment.revoked_at is null
  ) <> 1 then
    raise exception 'Platform administrator transfer invariant failed.'
      using errcode = '23514';
  end if;

  return jsonb_build_object(
    'assignmentId', admin_assignment.id,
    'previousAssignmentId', active_assignment.id,
    'idempotent', false
  );
end;
$$;

comment on function public.transfer_initial_platform_admin(uuid, text, uuid, text)
is 'Service-role-only atomic transfer of the verified first Novotech platform owner from sales to platform administrator.';

revoke all on function public.transfer_initial_platform_admin(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.transfer_initial_platform_admin(uuid, text, uuid, text)
  to service_role;

commit;
