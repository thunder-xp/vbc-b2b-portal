begin;

create or replace function public.get_effective_company_permissions(p_company_id uuid)
returns table (
  user_id uuid, company_id uuid, profile_status text, company_status text,
  membership_id uuid, membership_status text, role_id uuid, role_code text,
  role_name text, is_internal_override boolean, role_permission_codes text[],
  allowed_override_codes text[], denied_override_codes text[], effective_permission_codes text[]
)
language plpgsql stable security definer set search_path = public set row_security = off as $$
declare target_user public.user_profiles%rowtype; target_company public.partner_companies%rowtype;
declare target_membership public.company_memberships%rowtype; target_role public.roles%rowtype;
declare internal_roles text[]; internal_codes text[]; role_codes text[] := '{}';
declare allowed_codes text[] := '{}'; denied_codes text[] := '{}'; company_codes text[] := '{}'; effective_codes text[] := '{}';
begin
  if auth.uid() is null or p_company_id is null then return; end if;
  select profile.* into target_user
  from public.user_profiles profile
  where profile.id = auth.uid() and profile.status = 'active';
  if not found then return; end if;
  select company.* into target_company
  from public.partner_companies company
  where company.id = p_company_id and company.status = 'active';
  if not found then return; end if;

  select context.internal_role_codes, context.effective_permission_codes into internal_roles, internal_codes
  from public.get_effective_internal_permissions() context where context.user_id = target_user.id;
  if found then
    return query select target_user.id, target_company.id, target_user.status, target_company.status,
      null::uuid, null::text, null::uuid, internal_roles[1], internal_roles[1], true,
      internal_codes, '{}'::text[], '{}'::text[], internal_codes;
    return;
  end if;

  if target_user.user_type = 'admin' then
    select coalesce(array_agg(permission.code order by permission.code), '{}') into internal_codes
    from public.permissions permission;
    return query select target_user.id, target_company.id, target_user.status, target_company.status,
      null::uuid, null::text, null::uuid, 'novotech_admin'::text, 'Novotech Admin'::text, true,
      internal_codes, '{}'::text[], '{}'::text[], internal_codes;
    return;
  end if;

  select membership.* into target_membership
  from public.company_memberships membership
  where membership.user_id = target_user.id
    and membership.company_id = target_company.id
    and membership.status = 'active';
  if not found then return; end if;
  select role.* into target_role
  from public.roles role
  where role.id = target_membership.role_id and role.scope = 'partner';
  if not found then return; end if;
  if not exists (
    select 1 from public.partner_company_access_policies policy
    where policy.company_id = target_company.id
  ) then return; end if;

  select coalesce(array_agg(permission.code order by permission.code), '{}') into role_codes
  from public.role_permissions role_permission
  join public.permissions permission on permission.id = role_permission.permission_id
  where role_permission.role_id = target_role.id and permission.scope in ('partner', 'both');
  select coalesce(array_agg(permission.code order by permission.code), '{}') into company_codes
  from public.partner_company_capabilities capability
  join public.permissions permission on permission.id = capability.permission_id
  where capability.company_id = target_company.id;
  select coalesce(array_agg(permission.code order by permission.code) filter (where permission_override.effect = 'allow'), '{}'),
    coalesce(array_agg(permission.code order by permission.code) filter (where permission_override.effect = 'deny'), '{}')
  into allowed_codes, denied_codes
  from public.membership_permission_overrides permission_override
  join public.permissions permission on permission.id = permission_override.permission_id
  where permission_override.membership_id = target_membership.id and permission.scope in ('partner', 'both');

  select coalesce(array_agg(resolved.code order by resolved.code), '{}') into effective_codes from (
    select role_code.code
    from unnest(role_codes) role_code(code)
    where role_code.code = 'company_users.manage'
       or role_code.code = any(company_codes)
    except select unnest(denied_codes) code
  ) resolved;
  return query select target_user.id, target_company.id, target_user.status, target_company.status,
    target_membership.id, target_membership.status, target_role.id, target_role.code, target_role.name,
    false, role_codes, allowed_codes, denied_codes, effective_codes;
end;
$$;

revoke all on function public.get_effective_company_permissions(uuid) from public, anon;
grant execute on function public.get_effective_company_permissions(uuid) to authenticated;

comment on function public.get_effective_company_permissions(uuid) is
  'Role grants intersect explicit company capabilities; membership deny wins. All table references are qualified to avoid output-column ambiguity.';

commit;
