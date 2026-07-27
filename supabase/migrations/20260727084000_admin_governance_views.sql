begin;

create or replace function public.get_admin_governance_summary(p_view text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_view = 'security'
    and not public.has_internal_permission('admin.security.view') then
    raise exception 'Security administration access is not allowed.'
      using errcode = '42501';
  end if;
  if p_view = 'settings'
    and not public.has_internal_permission('admin.settings.view') then
    raise exception 'Settings access is not allowed.'
      using errcode = '42501';
  end if;
  if p_view not in ('security', 'settings') then
    raise exception 'Unsupported governance view.' using errcode = '22023';
  end if;

  if p_view = 'security' then
    return jsonb_build_object(
      'metrics', jsonb_build_object(
        'platformAdmins', (
          select count(*) from public.internal_user_role_assignments assignment
          join public.roles role on role.id = assignment.role_id
          where assignment.revoked_at is null and role.code = 'novotech_admin'
        ),
        'activeInternalAssignments', (
          select count(*) from public.internal_user_role_assignments
          where revoked_at is null
        ),
        'sensitivePermissionAssignments', (
          select count(*) from public.internal_user_role_assignments assignment
          join public.role_permissions role_permission
            on role_permission.role_id = assignment.role_id
          join public.permissions permission
            on permission.id = role_permission.permission_id
          where assignment.revoked_at is null and permission.sensitive
        ),
        'suspendedMemberships', (
          select count(*) from public.company_memberships where status = 'suspended'
        ),
        'companiesWithoutOwner', (
          select count(*) from public.partner_companies company
          where company.status = 'active' and not exists (
            select 1 from public.company_memberships membership
            join public.roles role on role.id = membership.role_id
            where membership.company_id = company.id
              and membership.status = 'active' and role.code = 'owner'
          )
        ),
        'invitationsNearExpiry', (
          select count(*) from public.invitations
          where status = 'pending' and expires_at between now() and now() + interval '3 days'
        )
      )
    );
  end if;

  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'internalRoles', (select count(*) from public.roles where scope = 'internal'),
      'partnerRoles', (select count(*) from public.roles where scope = 'partner'),
      'permissions', (select count(*) from public.permissions),
      'sensitivePermissions', (select count(*) from public.permissions where sensitive),
      'delegablePermissions', (
        select count(*) from public.permissions where delegable_by_partner_owner
      )
    )
  );
end;
$$;

revoke all on function public.get_admin_governance_summary(text)
  from public, anon;
grant execute on function public.get_admin_governance_summary(text)
  to authenticated;

commit;
