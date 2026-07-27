begin;

create or replace function public.get_effective_company_permissions(
  p_company_id uuid
)
returns table (
  user_id uuid,
  company_id uuid,
  profile_status text,
  company_status text,
  membership_id uuid,
  membership_status text,
  role_id uuid,
  role_code text,
  role_name text,
  is_internal_override boolean,
  role_permission_codes text[],
  allowed_override_codes text[],
  denied_override_codes text[],
  effective_permission_codes text[]
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  target_user public.user_profiles%rowtype;
  target_company public.partner_companies%rowtype;
  target_membership public.company_memberships%rowtype;
  target_role public.roles%rowtype;
  internal_role_codes text[];
  internal_permission_codes text[];
  role_codes text[] := '{}'::text[];
  allowed_codes text[] := '{}'::text[];
  denied_codes text[] := '{}'::text[];
  effective_codes text[] := '{}'::text[];
begin
  if auth.uid() is null or p_company_id is null then
    return;
  end if;

  select *
  into target_user
  from public.user_profiles profile
  where profile.id = auth.uid()
    and profile.status = 'active';

  if not found then
    return;
  end if;

  select *
  into target_company
  from public.partner_companies company
  where company.id = p_company_id
    and company.status = 'active';

  if not found then
    return;
  end if;

  select
    context.internal_role_codes,
    context.effective_permission_codes
  into
    internal_role_codes,
    internal_permission_codes
  from public.get_effective_internal_permissions() context
  where context.user_id = target_user.id;

  if found then
    return query
    select
      target_user.id,
      target_company.id,
      target_user.status,
      target_company.status,
      null::uuid,
      null::text,
      null::uuid,
      internal_role_codes[1],
      internal_role_codes[1],
      true,
      internal_permission_codes,
      '{}'::text[],
      '{}'::text[],
      internal_permission_codes;
    return;
  end if;

  -- Backward compatibility for a legacy administrator that has not yet been
  -- moved to the canonical internal role assignment model.
  if target_user.user_type = 'admin' then
    select coalesce(
      array_agg(permission.code order by permission.code),
      '{}'::text[]
    )
    into effective_codes
    from public.permissions permission;

    return query
    select
      target_user.id,
      target_company.id,
      target_user.status,
      target_company.status,
      null::uuid,
      null::text,
      null::uuid,
      'novotech_admin'::text,
      'Novotech Admin'::text,
      true,
      effective_codes,
      '{}'::text[],
      '{}'::text[],
      effective_codes;
    return;
  end if;

  select membership.*
  into target_membership
  from public.company_memberships membership
  where membership.user_id = target_user.id
    and membership.company_id = target_company.id
    and membership.status = 'active';

  if not found then
    return;
  end if;

  select *
  into target_role
  from public.roles role
  where role.id = target_membership.role_id
    and role.scope = 'partner';

  if not found then
    return;
  end if;

  select coalesce(
    array_agg(permission.code order by permission.code),
    '{}'::text[]
  )
  into role_codes
  from public.role_permissions role_permission
  join public.permissions permission
    on permission.id = role_permission.permission_id
  where role_permission.role_id = target_role.id
    and permission.scope in ('partner', 'both');

  select
    coalesce(
      array_agg(permission.code order by permission.code)
        filter (where override.effect = 'allow'),
      '{}'::text[]
    ),
    coalesce(
      array_agg(permission.code order by permission.code)
        filter (where override.effect = 'deny'),
      '{}'::text[]
    )
  into allowed_codes, denied_codes
  from public.membership_permission_overrides override
  join public.permissions permission on permission.id = override.permission_id
  where override.membership_id = target_membership.id
    and permission.scope in ('partner', 'both');

  select coalesce(array_agg(code order by code), '{}'::text[])
  into effective_codes
  from (
    select unnest(role_codes || allowed_codes) as code
    except
    select unnest(denied_codes) as code
  ) resolved;

  return query
  select
    target_user.id,
    target_company.id,
    target_user.status,
    target_company.status,
    target_membership.id,
    target_membership.status,
    target_role.id,
    target_role.code,
    target_role.name,
    false,
    role_codes,
    allowed_codes,
    denied_codes,
    effective_codes;
end;
$$;

comment on function public.get_effective_company_permissions(uuid) is
  'Returns tenant-bound partner permissions or canonical internal-role permissions without creating an internal partner membership.';

revoke all on function public.get_effective_company_permissions(uuid)
  from public, anon;
grant execute on function public.get_effective_company_permissions(uuid)
  to authenticated;

commit;
