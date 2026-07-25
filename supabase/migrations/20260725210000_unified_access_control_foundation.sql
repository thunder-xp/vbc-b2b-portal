-- Unified access-control foundation.
-- Roles grant a baseline. Membership overrides refine that baseline, with
-- explicit deny taking precedence. No commercial truth is stored here.

alter table public.permissions
  add column if not exists scope text not null default 'internal',
  add column if not exists delegable_by_partner_owner boolean not null default false,
  add column if not exists sensitive boolean not null default true,
  add column if not exists category text not null default 'security';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.permissions'::regclass
      and conname = 'permissions_scope_check'
  ) then
    alter table public.permissions
      add constraint permissions_scope_check
      check (scope in ('partner', 'internal', 'both'));
  end if;
end;
$$;

-- Classify the existing permission catalog conservatively from its current
-- role grants. Unassigned permissions remain internal and non-delegable.
with permission_scopes as (
  select
    permission.id,
    bool_or(role.scope = 'partner') as has_partner_role,
    bool_or(role.scope = 'internal') as has_internal_role
  from public.permissions permission
  left join public.role_permissions role_permission
    on role_permission.permission_id = permission.id
  left join public.roles role on role.id = role_permission.role_id
  group by permission.id
)
update public.permissions permission
set scope = case
  when permission_scopes.has_partner_role and permission_scopes.has_internal_role then 'both'
  when permission_scopes.has_partner_role then 'partner'
  else 'internal'
end
from permission_scopes
where permission.id = permission_scopes.id;

update public.permissions
set category = case
  when code like 'catalog.%' then 'catalog'
  when code like 'pricing.%' or code = 'prices.view' then 'pricing'
  when code like 'stock.%' then 'inventory'
  when code like 'orders.%' or code = 'cart.manage' then 'orders'
  when code like 'finance.%' then 'finance'
  when code like 'documents.%' then 'documents'
  when code like 'estimates.%' or code like 'proposal_%' then 'estimates'
  when code like 'purchasing_lists.%' then 'purchasing'
  when code like 'reservations.%' then 'reservations'
  when code like 'specifications.%' then 'specifications'
  when code = 'company_users.manage' then 'company_users'
  else 'security'
end;

insert into public.permissions (
  code,
  description,
  scope,
  delegable_by_partner_owner,
  sensitive,
  category
)
values
  (
    'pricing.partner_price.view',
    'View confidential company partner prices and calculations derived from them.',
    'both',
    true,
    true,
    'pricing'
  ),
  (
    'pricing.retail_price.view',
    'View retail reference prices without confidential company acquisition prices.',
    'both',
    true,
    false,
    'pricing'
  )
on conflict (code) do update
set description = excluded.description,
    scope = excluded.scope,
    delegable_by_partner_owner = excluded.delegable_by_partner_owner,
    sensitive = excluded.sensitive,
    category = excluded.category;

-- Preserve current behavior until Slice 3 replaces the legacy prices.view
-- projection. Every role that currently sees prices receives both explicit
-- capabilities; a membership deny can then remove partner-price visibility.
with price_roles as (
  select distinct role_permission.role_id
  from public.role_permissions role_permission
  join public.permissions permission
    on permission.id = role_permission.permission_id
  where permission.code = 'prices.view'
),
explicit_price_permissions as (
  select id
  from public.permissions
  where code in ('pricing.partner_price.view', 'pricing.retail_price.view')
)
insert into public.role_permissions (role_id, permission_id)
select price_roles.role_id, explicit_price_permissions.id
from price_roles
cross join explicit_price_permissions
on conflict (role_id, permission_id) do nothing;

-- Only an explicit, reviewed subset may be delegated by a partner owner.
update public.permissions
set delegable_by_partner_owner = code in (
  'catalog.view',
  'pricing.partner_price.view',
  'pricing.retail_price.view',
  'stock.view',
  'cart.manage',
  'orders.create',
  'orders.manage',
  'orders.view',
  'orders.view_company',
  'documents.view_company',
  'finance.view_company',
  'specifications.manage',
  'reservations.manage',
  'estimates.view',
  'estimates.manage',
  'estimates.pricing.manage',
  'estimates.generate_pdf',
  'purchasing_lists.view',
  'purchasing_lists.manage'
);

-- Legacy prices.view is intentionally not delegable. New code must use the two
-- explicit pricing permissions, while the legacy permission remains during
-- the Slice 3 compatibility transition.

create table if not exists public.membership_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null
    references public.company_memberships(id) on delete cascade,
  permission_id uuid not null
    references public.permissions(id) on delete restrict,
  effect text not null,
  created_by uuid not null
    references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_permission_overrides_effect_check
    check (effect in ('allow', 'deny')),
  constraint membership_permission_overrides_unique
    unique (membership_id, permission_id)
);

comment on table public.membership_permission_overrides is
  'Portal-owned per-membership permission refinements. Explicit deny wins over role grants and explicit allows.';
comment on column public.membership_permission_overrides.created_by is
  'Audit actor only. It is never used as an authorization grant.';

create index if not exists membership_permission_overrides_membership_idx
  on public.membership_permission_overrides(membership_id);
create index if not exists membership_permission_overrides_permission_idx
  on public.membership_permission_overrides(permission_id);

drop trigger if exists set_membership_permission_overrides_updated_at
  on public.membership_permission_overrides;
create trigger set_membership_permission_overrides_updated_at
before update on public.membership_permission_overrides
for each row execute function public.set_updated_at();

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

  -- Active Novotech administrators are the sole protected super-admin rule.
  -- Other internal roles keep their existing specialized authorization until
  -- explicit internal role assignment is migrated in a later slice.
  if target_user.user_type = 'admin' then
    select coalesce(array_agg(permission.code order by permission.code), '{}'::text[])
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

  select coalesce(array_agg(permission.code order by permission.code), '{}'::text[])
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
  'Returns one tenant-bound effective permission projection for auth.uid(). Active profile, company, and membership are mandatory; explicit deny wins.';

revoke all on function public.get_effective_company_permissions(uuid) from public;
grant execute on function public.get_effective_company_permissions(uuid)
  to authenticated;

create or replace function public.has_permission(
  company uuid,
  permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce((
    select permission_code = any(context.effective_permission_codes)
    from public.get_effective_company_permissions(company) context
  ), false);
$$;

comment on function public.has_permission(uuid, text) is
  'Checks the canonical effective permission projection for auth.uid(). Includes membership overrides; explicit deny wins.';

revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;

alter table public.membership_permission_overrides enable row level security;
revoke all on table public.membership_permission_overrides from anon, authenticated;
grant select on table public.membership_permission_overrides to authenticated;

create policy "Users can select own permission overrides"
on public.membership_permission_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.id = membership_id
      and membership.user_id = auth.uid()
  )
);

create policy "Company user managers can select company permission overrides"
on public.membership_permission_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.id = membership_id
      and public.has_permission(
        membership.company_id,
        'company_users.manage'
      )
  )
);

create policy "Novotech admins can select permission overrides"
on public.membership_permission_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.user_type = 'admin'
  )
);

-- No authenticated INSERT, UPDATE, or DELETE grants are created. Slice 2 will
-- add narrow transition RPCs that enforce company scope, delegation metadata,
-- final-owner protection, and audit recording.
