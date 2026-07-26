begin;

create or replace function public.list_admin_access_subjects(
  p_search text default null,
  p_limit integer default 50
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  identity_type text,
  company_contexts jsonb
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  normalized_search text := nullif(left(btrim(coalesce(p_search, '')), 100), '');
  normalized_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
begin
  if not public.has_internal_permission('admin.security.view') then
    raise exception 'Access inspection is not allowed.' using errcode = '42501';
  end if;

  return query
  select
    profile.id,
    coalesce(nullif(profile.full_name, ''), profile.email),
    profile.email,
    case
      when profile.user_type in ('internal', 'admin') then 'internal'
      else 'partner'
    end,
    case
      when profile.user_type in ('internal', 'admin') then '[]'::jsonb
      else coalesce(contexts.items, '[]'::jsonb)
    end
  from public.user_profiles profile
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'companyId', company.id,
        'companyName', company.display_name,
        'membershipStatus', membership.status
      )
      order by company.display_name, company.id
    ) as items
    from public.company_memberships membership
    join public.partner_companies company on company.id = membership.company_id
    where membership.user_id = profile.id
  ) contexts on true
  where normalized_search is null
    or profile.full_name ilike '%' || normalized_search || '%'
    or profile.email ilike '%' || normalized_search || '%'
    or exists (
      select 1
      from public.company_memberships membership
      join public.partner_companies company on company.id = membership.company_id
      where membership.user_id = profile.id
        and company.display_name ilike '%' || normalized_search || '%'
    )
  order by lower(coalesce(nullif(profile.full_name, ''), profile.email)), profile.id
  limit normalized_limit;
end;
$$;

revoke all on function public.list_admin_access_subjects(text, integer)
  from public, anon;
grant execute on function public.list_admin_access_subjects(text, integer)
  to authenticated;

create or replace function public.inspect_admin_effective_access(
  p_user_id uuid,
  p_company_id uuid default null
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  identity_type text,
  profile_status text,
  company_id uuid,
  company_name text,
  company_status text,
  membership_id uuid,
  membership_status text,
  role_code text,
  role_name text,
  permission_code text,
  permission_label text,
  permission_category text,
  is_allowed boolean,
  explanation_source text,
  delegable boolean,
  sensitive boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  target_profile public.user_profiles%rowtype;
  target_company public.partner_companies%rowtype;
  target_membership public.company_memberships%rowtype;
  target_role public.roles%rowtype;
  target_assignment public.internal_user_role_assignments%rowtype;
  is_internal boolean;
begin
  if not public.has_internal_permission('admin.security.view') then
    raise exception 'Access inspection is not allowed.' using errcode = '42501';
  end if;

  select * into target_profile
  from public.user_profiles profile
  where profile.id = p_user_id;
  if target_profile.id is null then
    raise exception 'Access subject was not found.' using errcode = 'P0002';
  end if;

  is_internal := target_profile.user_type in ('internal', 'admin');

  if is_internal then
    if p_company_id is not null then
      raise exception 'Internal access uses platform context.'
        using errcode = '22023';
    end if;

    select assignment.* into target_assignment
    from public.internal_user_role_assignments assignment
    where assignment.user_id = target_profile.id
      and assignment.revoked_at is null;

    if target_assignment.id is not null then
      select * into target_role
      from public.roles role
      where role.id = target_assignment.role_id
        and role.scope = 'internal';
    end if;

    return query
    select
      target_profile.id,
      coalesce(nullif(target_profile.full_name, ''), target_profile.email),
      target_profile.email,
      'internal'::text,
      target_profile.status,
      null::uuid,
      null::text,
      null::text,
      null::uuid,
      null::text,
      target_role.code,
      target_role.name,
      permission.code,
      coalesce(nullif(permission.description, ''), permission.code),
      permission.category,
      (
        target_profile.status = 'active'
        and target_role.id is not null
        and role_permission.permission_id is not null
      ),
      case
        when target_profile.status <> 'active' then 'inactive_profile'
        when target_role.id is null then 'no_role_assignment'
        when role_permission.permission_id is not null then 'internal_role'
        else 'not_granted'
      end,
      permission.delegable_by_partner_owner,
      permission.sensitive
    from public.permissions permission
    left join public.role_permissions role_permission
      on role_permission.permission_id = permission.id
      and role_permission.role_id = target_role.id
    where permission.scope in ('internal', 'both')
    order by permission.category, permission.code
    limit 500;
    return;
  end if;

  if p_company_id is null then
    raise exception 'Partner access inspection requires company context.'
      using errcode = '22023';
  end if;

  select * into target_membership
  from public.company_memberships membership
  where membership.user_id = target_profile.id
    and membership.company_id = p_company_id;
  if target_membership.id is null then
    raise exception 'The user has no membership in the requested company.'
      using errcode = '42501';
  end if;

  select * into target_company
  from public.partner_companies company
  where company.id = target_membership.company_id;
  select * into target_role
  from public.roles role
  where role.id = target_membership.role_id
    and role.scope = 'partner';
  if target_company.id is null or target_role.id is null then
    raise exception 'Partner access context is invalid.' using errcode = '23514';
  end if;

  return query
  select
    target_profile.id,
    coalesce(nullif(target_profile.full_name, ''), target_profile.email),
    target_profile.email,
    'partner'::text,
    target_profile.status,
    target_company.id,
    target_company.display_name,
    target_company.status,
    target_membership.id,
    target_membership.status,
    target_role.code,
    target_role.name,
    permission.code,
    coalesce(nullif(permission.description, ''), permission.code),
    permission.category,
    (
      target_profile.status = 'active'
      and target_company.status = 'active'
      and target_membership.status = 'active'
      and permission_override.effect is distinct from 'deny'
      and (
        role_permission.permission_id is not null
        or permission_override.effect = 'allow'
      )
    ),
    case
      when target_profile.status <> 'active' then 'inactive_profile'
      when target_company.status <> 'active' then 'inactive_company'
      when target_membership.status <> 'active' then 'inactive_membership'
      when permission_override.effect = 'deny' then 'membership_deny'
      when permission_override.effect = 'allow' then 'membership_allow'
      when role_permission.permission_id is not null then 'role_grant'
      else 'not_granted'
    end,
    permission.delegable_by_partner_owner,
    permission.sensitive
  from public.permissions permission
  left join public.role_permissions role_permission
    on role_permission.permission_id = permission.id
    and role_permission.role_id = target_role.id
  left join public.membership_permission_overrides permission_override
    on permission_override.permission_id = permission.id
    and permission_override.membership_id = target_membership.id
  where permission.scope in ('partner', 'both')
  order by permission.category, permission.code
  limit 500;
end;
$$;

comment on function public.inspect_admin_effective_access(uuid, uuid) is
  'Read-only admin explanation of effective access. Partner context requires an actual membership; the function does not impersonate or grant access.';

revoke all on function public.inspect_admin_effective_access(uuid, uuid)
  from public, anon;
grant execute on function public.inspect_admin_effective_access(uuid, uuid)
  to authenticated;

commit;
