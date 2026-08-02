begin;

do $$
declare
  target_company_id uuid;
  target_membership_id uuid;
  target_user_id uuid;
  admin_user_id uuid;
  target_version integer;
  permission_codes text[];
  event_id uuid;
begin
  select company.id, membership.id, membership.user_id
  into target_company_id, target_membership_id, target_user_id
  from public.partner_companies company
  join public.company_memberships membership on membership.company_id = company.id
  where company.status = 'active' and membership.status = 'active'
  order by company.created_at, membership.created_at
  limit 1;

  if target_company_id is null then
    raise exception 'smoke_requires_active_partner_company';
  end if;

  select assignment.user_id into admin_user_id
  from public.internal_user_role_assignments assignment
  join public.role_permissions role_permission on role_permission.role_id = assignment.role_id
  join public.permissions permission on permission.id = role_permission.permission_id
  where assignment.revoked_at is null and permission.code = 'admin.permissions.manage'
  limit 1;

  if admin_user_id is null then
    raise exception 'smoke_requires_access_admin';
  end if;

  if (select count(*) from public.partner_company_access_policies where company_id = target_company_id) <> 1 then
    raise exception 'expected_exactly_one_company_policy';
  end if;

  perform set_config('request.jwt.claim.sub', target_user_id::text, true);
  select effective_permission_codes into permission_codes
  from public.get_effective_company_permissions(target_company_id);
  if permission_codes is null or not ('catalog.view' = any(permission_codes)) then
    raise exception 'full_access_backfill_failed';
  end if;

  delete from public.partner_company_access_policies where company_id = target_company_id;
  if exists (select 1 from public.get_effective_company_permissions(target_company_id)) then
    raise exception 'missing_policy_must_fail_closed';
  end if;
  begin
    update public.company_memberships set status = 'active' where id = target_membership_id;
    raise exception 'active_membership_without_policy_was_accepted';
  exception when check_violation then
    null;
  end;

  perform public.assign_default_partner_company_access(target_company_id, null, gen_random_uuid(), false);
  perform public.assign_default_partner_company_access(target_company_id, null, gen_random_uuid(), false);
  if (select count(*) from public.partner_company_access_policies where company_id = target_company_id) <> 1 then
    raise exception 'default_assignment_is_not_idempotent';
  end if;

  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  select version into target_version from public.partner_company_access_policies where company_id = target_company_id;
  perform public.update_admin_partner_company_access(
    target_company_id, target_version, 'orders_only', '{}'::text[], 'Smoke orders preset', gen_random_uuid()
  );
  select version into target_version from public.partner_company_access_policies where company_id = target_company_id;
  if exists (
    select 1 from public.partner_company_capabilities capability
    join public.permissions permission on permission.id = capability.permission_id
    where capability.company_id = target_company_id and permission.code = 'finance.view_company'
  ) then raise exception 'orders_preset_includes_finance'; end if;

  perform public.update_admin_partner_company_access(
    target_company_id, target_version, 'custom', array['pricing.partner_price.view'], 'Smoke custom preset', gen_random_uuid()
  );
  select version into target_version from public.partner_company_access_policies where company_id = target_company_id;
  if not exists (
    select 1 from public.partner_company_capabilities capability
    join public.permissions permission on permission.id = capability.permission_id
    where capability.company_id = target_company_id and permission.code = 'prices.view'
  ) then raise exception 'custom_pricing_bridge_missing'; end if;

  begin
    perform public.update_admin_partner_company_access(
      target_company_id, target_version - 1, 'full_partner_access', '{}'::text[], 'Stale smoke update', gen_random_uuid()
    );
    raise exception 'stale_update_was_accepted';
  exception when sqlstate 'PT409' then
    null;
  end;

  perform public.update_admin_partner_company_access(
    target_company_id, target_version, 'full_partner_access', '{}'::text[], 'Smoke restore', gen_random_uuid()
  );

  insert into public.membership_permission_overrides(membership_id, permission_id, effect, created_by)
  select target_membership_id, permission.id, 'deny', admin_user_id
  from public.permissions permission where permission.code = 'finance.view_company'
  on conflict (membership_id, permission_id) do update set effect = 'deny';
  perform set_config('request.jwt.claim.sub', target_user_id::text, true);
  select effective_permission_codes into permission_codes
  from public.get_effective_company_permissions(target_company_id);
  if 'finance.view_company' = any(permission_codes) then
    raise exception 'member_deny_did_not_win';
  end if;

  delete from public.membership_permission_overrides
  where membership_id = target_membership_id
    and permission_id = (select id from public.permissions where code = 'finance.view_company');
  update public.company_memberships set status = 'suspended' where id = target_membership_id;
  if exists (select 1 from public.get_effective_company_permissions(target_company_id)) then
    raise exception 'suspended_membership_was_allowed';
  end if;
  update public.company_memberships set status = 'active' where id = target_membership_id;

  select id into event_id from public.partner_company_access_events
  where company_id = target_company_id order by occurred_at desc limit 1;
  begin
    update public.partner_company_access_events set note = 'mutation' where id = event_id;
    raise exception 'audit_event_was_mutable';
  exception when object_not_in_prerequisite_state then
    null;
  end;
end;
$$;

rollback;
