begin;

create or replace function public.can_manage_company_users(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.has_internal_permission('company_users.manage')
    or public.has_permission(p_company_id, 'company_users.manage');
$$;

revoke all on function public.can_manage_company_users(uuid) from public, anon;
grant execute on function public.can_manage_company_users(uuid) to authenticated;

alter table public.company_user_events
  drop constraint if exists company_user_events_event_type_check;
alter table public.company_user_events
  add constraint company_user_events_event_type_check check (event_type in (
    'invitation_created',
    'invitation_link_generated',
    'invitation_resent',
    'invitation_revoked',
    'invitation_expired',
    'invitation_accepted',
    'employee_suspended',
    'employee_restored',
    'role_changed',
    'price_access_changed',
    'permission_override_changed',
    'owner_appointed',
    'owner_transferred',
    'admin_intervention'
  ));

create or replace function public.require_access_change_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(normalized_reason) not between 3 and 500 then
    raise exception 'A bounded access-change reason is required.'
      using errcode = '22023';
  end if;
  return normalized_reason;
end;
$$;

revoke all on function public.require_access_change_reason(text)
  from public, anon, authenticated;

create or replace function public.set_company_membership_state_v2(
  p_membership_id uuid,
  p_target_status text,
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
  normalized_reason text := public.require_access_change_reason(p_reason);
  target public.company_memberships%rowtype;
  target_role_code text;
  active_owner_count integer;
begin
  select * into target
  from public.company_memberships membership
  where membership.id = p_membership_id
  for update;
  if target.id is null or not public.can_manage_company_users(target.company_id) then
    raise exception 'Membership is unavailable.' using errcode = '42501';
  end if;
  if p_target_status not in ('active', 'suspended') then
    raise exception 'Membership state is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target.company_id::text, 0));
  select role.code into target_role_code
  from public.roles role
  where role.id = target.role_id;

  if p_target_status = 'suspended' and target_role_code = 'partner_owner' then
    select count(*) into active_owner_count
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    where membership.company_id = target.company_id
      and membership.status = 'active'
      and role.code = 'partner_owner';
    if active_owner_count <= 1 then
      raise exception 'The final active owner cannot be suspended.'
        using errcode = '55000';
    end if;
  end if;

  if target.status = p_target_status then
    return target.id;
  end if;
  if (p_target_status = 'suspended' and target.status <> 'active')
    or (p_target_status = 'active' and target.status <> 'suspended') then
    raise exception 'Membership transition is invalid.' using errcode = '55000';
  end if;

  update public.company_memberships
  set status = p_target_status,
      revoked_by = case when p_target_status = 'suspended' then actor_id else null end,
      revoked_at = case when p_target_status = 'suspended' then now() else null end,
      updated_at = now()
  where id = target.id;

  insert into public.company_user_events(
    company_id, target_user_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id,
    target.user_id,
    actor_id,
    case when p_target_status = 'suspended'
      then 'employee_suspended' else 'employee_restored' end,
    jsonb_build_object('reason', normalized_reason)
  );
  return target.id;
end;
$$;

create or replace function public.update_company_membership_access_v2(
  p_membership_id uuid,
  p_role_code text,
  p_price_access text,
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
  normalized_reason text := public.require_access_change_reason(p_reason);
  target public.company_memberships%rowtype;
  current_role_code text;
  next_role public.roles%rowtype;
  permission_record record;
  actor_is_internal boolean;
begin
  select * into target
  from public.company_memberships membership
  where membership.id = p_membership_id
  for update;
  if target.id is null or not public.can_manage_company_users(target.company_id) then
    raise exception 'Membership is unavailable.' using errcode = '42501';
  end if;
  if p_price_access not in ('full', 'retail_only') then
    raise exception 'Price access is invalid.' using errcode = '22023';
  end if;

  actor_is_internal := public.has_internal_permission('admin.users.view');
  if target.user_id = actor_id and not actor_is_internal then
    raise exception 'Employees cannot change their own role or access overrides.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target.company_id::text, 0));
  select role.code into current_role_code
  from public.roles role
  where role.id = target.role_id;
  select * into next_role
  from public.roles role
  where role.code = p_role_code
    and role.scope = 'partner'
    and (
      role.code in (
        'partner_manager',
        'partner_buyer',
        'partner_accounting',
        'partner_viewer'
      )
      or (role.code = 'partner_owner' and current_role_code = 'partner_owner')
    );
  if next_role.id is null then
    raise exception 'Partner role is not assignable.' using errcode = '42501';
  end if;
  if current_role_code = 'partner_owner' and next_role.code <> 'partner_owner' then
    raise exception 'Ownership must be transferred atomically.'
      using errcode = '55000';
  end if;

  update public.company_memberships
  set role_id = next_role.id, updated_at = now()
  where id = target.id;

  delete from public.membership_permission_overrides permission_override
  using public.permissions permission
  where permission_override.membership_id = target.id
    and permission.id = permission_override.permission_id
    and permission.code in (
      'pricing.partner_price.view',
      'pricing.retail_price.view'
    );

  for permission_record in
    select permission.id, permission.code
    from public.permissions permission
    where permission.code in (
      'pricing.partner_price.view',
      'pricing.retail_price.view'
    )
      and permission.delegable_by_partner_owner
  loop
    insert into public.membership_permission_overrides(
      membership_id, permission_id, effect, created_by
    ) values (
      target.id,
      permission_record.id,
      case
        when permission_record.code = 'pricing.partner_price.view'
          and p_price_access = 'retail_only' then 'deny'
        else 'allow'
      end,
      actor_id
    );
  end loop;

  if current_role_code <> next_role.code then
    insert into public.company_user_events(
      company_id, target_user_id, actor_user_id, event_type, safe_payload
    ) values (
      target.company_id,
      target.user_id,
      actor_id,
      'role_changed',
      jsonb_build_object(
        'from', current_role_code,
        'to', next_role.code,
        'reason', normalized_reason
      )
    );
  end if;

  insert into public.company_user_events(
    company_id, target_user_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id,
    target.user_id,
    actor_id,
    'price_access_changed',
    jsonb_build_object(
      'priceAccess', p_price_access,
      'reason', normalized_reason
    )
  );
  return target.id;
end;
$$;

create or replace function public.appoint_company_owner_v2(
  p_membership_id uuid,
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
  normalized_reason text := public.require_access_change_reason(p_reason);
  target public.company_memberships%rowtype;
  owner_role_id uuid;
  active_owner_count integer;
begin
  select * into target
  from public.company_memberships membership
  where membership.id = p_membership_id
  for update;
  if target.id is null
    or target.status <> 'active'
    or not public.can_manage_company_users(target.company_id) then
    raise exception 'Membership is unavailable.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target.company_id::text, 0));
  select count(*) into active_owner_count
  from public.company_memberships membership
  join public.roles role on role.id = membership.role_id
  where membership.company_id = target.company_id
    and membership.status = 'active'
    and role.code = 'partner_owner';
  if active_owner_count > 0 then
    raise exception 'An active owner exists; use atomic ownership transfer.'
      using errcode = '55000';
  end if;

  select role.id into owner_role_id
  from public.roles role
  where role.code = 'partner_owner' and role.scope = 'partner';
  update public.company_memberships
  set role_id = owner_role_id, updated_at = now()
  where id = target.id;

  insert into public.company_user_events(
    company_id, target_user_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id,
    target.user_id,
    actor_id,
    'owner_appointed',
    jsonb_build_object('reason', normalized_reason)
  );
  return target.id;
end;
$$;

create or replace function public.transfer_company_owner_v2(
  p_current_owner_membership_id uuid,
  p_next_owner_membership_id uuid,
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
  normalized_reason text := public.require_access_change_reason(p_reason);
  current_owner public.company_memberships%rowtype;
  next_owner public.company_memberships%rowtype;
  owner_role_id uuid;
  manager_role_id uuid;
begin
  if p_current_owner_membership_id = p_next_owner_membership_id then
    raise exception 'Ownership transfer requires two memberships.'
      using errcode = '22023';
  end if;

  select * into current_owner
  from public.company_memberships membership
  where membership.id = p_current_owner_membership_id
  for update;
  select * into next_owner
  from public.company_memberships membership
  where membership.id = p_next_owner_membership_id
  for update;

  if current_owner.id is null
    or next_owner.id is null
    or current_owner.company_id <> next_owner.company_id
    or current_owner.status <> 'active'
    or next_owner.status <> 'active'
    or not public.can_manage_company_users(current_owner.company_id) then
    raise exception 'Ownership transfer is unavailable.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_owner.company_id::text, 0)
  );
  select role.id into owner_role_id
  from public.roles role
  where role.code = 'partner_owner' and role.scope = 'partner';
  select role.id into manager_role_id
  from public.roles role
  where role.code = 'partner_manager' and role.scope = 'partner';

  if current_owner.role_id <> owner_role_id then
    raise exception 'The source membership is not an active owner.'
      using errcode = '55000';
  end if;

  -- Promote first. The company never passes through an ownerless state.
  update public.company_memberships
  set role_id = owner_role_id, updated_at = now()
  where id = next_owner.id;
  update public.company_memberships
  set role_id = manager_role_id, updated_at = now()
  where id = current_owner.id;

  insert into public.company_user_events(
    company_id, target_user_id, actor_user_id, event_type, safe_payload
  ) values (
    current_owner.company_id,
    next_owner.user_id,
    actor_id,
    'owner_transferred',
    jsonb_build_object(
      'previousOwnerUserId', current_owner.user_id,
      'reason', normalized_reason
    )
  );
  return next_owner.id;
end;
$$;

create or replace function public.revoke_company_invitation_v2(
  p_invitation_id uuid,
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
  normalized_reason text := public.require_access_change_reason(p_reason);
  target public.invitations%rowtype;
begin
  select * into target
  from public.invitations invitation
  where invitation.id = p_invitation_id
  for update;
  if target.id is null or not public.can_manage_company_users(target.company_id) then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;
  if target.status = 'revoked' then return target.id; end if;
  if target.status <> 'pending' then
    raise exception 'Invitation cannot be revoked.' using errcode = '55000';
  end if;

  update public.invitations
  set status = 'revoked',
      token_hash = null,
      revoked_at = now(),
      revoked_by = actor_id,
      updated_at = now()
  where id = target.id;

  insert into public.company_user_events(
    company_id, target_invitation_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id,
    target.id,
    actor_id,
    'invitation_revoked',
    jsonb_build_object('reason', normalized_reason)
  );
  return target.id;
end;
$$;

create or replace function public.set_membership_permission_override(
  p_membership_id uuid,
  p_permission_code text,
  p_effect text,
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
  normalized_reason text := public.require_access_change_reason(p_reason);
  target public.company_memberships%rowtype;
  target_permission public.permissions%rowtype;
  saved_override public.membership_permission_overrides%rowtype;
  is_permission_admin boolean;
begin
  select * into target
  from public.company_memberships membership
  where membership.id = p_membership_id
  for update;
  if target.id is null or not public.can_manage_company_users(target.company_id) then
    raise exception 'Membership is unavailable.' using errcode = '42501';
  end if;
  if p_effect not in ('allow', 'deny', 'inherit') then
    raise exception 'Permission override effect is invalid.'
      using errcode = '22023';
  end if;

  select * into target_permission
  from public.permissions permission
  where permission.code = p_permission_code
    and permission.scope in ('partner', 'both');
  if target_permission.id is null then
    raise exception 'Partner permission is unavailable.' using errcode = '22023';
  end if;

  is_permission_admin :=
    public.has_internal_permission('admin.permissions.manage');
  if not target_permission.delegable_by_partner_owner
    and not is_permission_admin then
    raise exception 'Protected permission override is not allowed.'
      using errcode = '42501';
  end if;

  if p_effect = 'inherit' then
    delete from public.membership_permission_overrides permission_override
    where permission_override.membership_id = target.id
      and permission_override.permission_id = target_permission.id
    returning * into saved_override;
  else
    insert into public.membership_permission_overrides(
      membership_id, permission_id, effect, created_by
    ) values (
      target.id, target_permission.id, p_effect, actor_id
    )
    on conflict (membership_id, permission_id)
    do update set
      effect = excluded.effect,
      created_by = excluded.created_by,
      updated_at = now()
    returning * into saved_override;
  end if;

  insert into public.company_user_events(
    company_id, target_user_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id,
    target.user_id,
    actor_id,
    'permission_override_changed',
    jsonb_build_object(
      'permissionCode', target_permission.code,
      'effect', p_effect,
      'reason', normalized_reason
    )
  );
  return coalesce(saved_override.id, p_membership_id);
end;
$$;

create or replace function public.assign_internal_user_role(
  p_user_id uuid,
  p_role_code text,
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
  target_role public.roles%rowtype;
  existing_assignment public.internal_user_role_assignments%rowtype;
  created_assignment public.internal_user_role_assignments%rowtype;
  normalized_reason text := public.require_access_change_reason(p_reason);
begin
  if not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Internal role management is not allowed.'
      using errcode = '42501';
  end if;

  select * into target_profile
  from public.user_profiles profile
  where profile.id = p_user_id
  for update;
  if target_profile.id is null
    or target_profile.status <> 'active'
    or target_profile.user_type not in ('internal', 'admin') then
    raise exception 'An active internal user is required.'
      using errcode = '42501';
  end if;

  select * into target_role
  from public.roles role
  where role.code = p_role_code
    and role.scope = 'internal';
  if target_role.id is null then
    raise exception 'Internal role is not available.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into existing_assignment
  from public.internal_user_role_assignments assignment
  where assignment.user_id = p_user_id
    and assignment.revoked_at is null
  for update;

  if existing_assignment.id is not null
    and existing_assignment.role_id = target_role.id then
    return existing_assignment.id;
  end if;

  if existing_assignment.id is not null then
    update public.internal_user_role_assignments
    set revoked_at = now()
    where id = existing_assignment.id;
    insert into public.internal_role_assignment_audit_events(
      assignment_id, target_user_id, role_id, actor_user_id, event_type, reason
    ) values (
      existing_assignment.id,
      existing_assignment.user_id,
      existing_assignment.role_id,
      actor_id,
      'revoked',
      normalized_reason
    );
  end if;

  insert into public.internal_user_role_assignments(
    user_id, role_id, assigned_by
  ) values (
    p_user_id, target_role.id, actor_id
  ) returning * into created_assignment;
  insert into public.internal_role_assignment_audit_events(
    assignment_id, target_user_id, role_id, actor_user_id, event_type, reason
  ) values (
    created_assignment.id,
    p_user_id,
    target_role.id,
    actor_id,
    'assigned',
    normalized_reason
  );
  return created_assignment.id;
end;
$$;

revoke all on function public.set_company_membership_state_v2(uuid, text, text)
  from public, anon;
revoke all on function public.update_company_membership_access_v2(uuid, text, text, text)
  from public, anon;
revoke all on function public.appoint_company_owner_v2(uuid, text)
  from public, anon;
revoke all on function public.transfer_company_owner_v2(uuid, uuid, text)
  from public, anon;
revoke all on function public.revoke_company_invitation_v2(uuid, text)
  from public, anon;
revoke all on function public.set_membership_permission_override(uuid, text, text, text)
  from public, anon;
revoke all on function public.assign_internal_user_role(uuid, text, text)
  from public, anon;

grant execute on function public.set_company_membership_state_v2(uuid, text, text)
  to authenticated;
grant execute on function public.update_company_membership_access_v2(uuid, text, text, text)
  to authenticated;
grant execute on function public.appoint_company_owner_v2(uuid, text)
  to authenticated;
grant execute on function public.transfer_company_owner_v2(uuid, uuid, text)
  to authenticated;
grant execute on function public.revoke_company_invitation_v2(uuid, text)
  to authenticated;
grant execute on function public.set_membership_permission_override(uuid, text, text, text)
  to authenticated;
grant execute on function public.assign_internal_user_role(uuid, text, text)
  to authenticated;

commit;
