-- Novotech Partner Platform
-- Access Control foundation migration.
--
-- Scope:
-- - Portal-owned identity, company access representation, memberships, roles,
--   permissions, access requests, and invitations.
-- - No commercial catalog/order/finance tables.
-- - No prices, stock, debts, invoices, credit limits, contracts, bank data,
--   addresses, or full 1C counterparty copies.
--
-- 1C remains the source of truth for commercial data. The portal stores only
-- access-control data and external 1C references required for safe scoping.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Maintains updated_at timestamps for portal-owned access-control records.';

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text null,
  phone text null,
  status text not null default 'registered',
  user_type text not null default 'external',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_status_check
    check (status in ('registered', 'pending_approval', 'active', 'suspended', 'revoked', 'rejected')),
  constraint user_profiles_user_type_check
    check (user_type in ('external', 'partner', 'internal', 'admin', 'system'))
);

comment on table public.user_profiles is
  'Portal-owned application profile extending Supabase auth.users. Does not store commercial rights directly.';
comment on column public.user_profiles.id is
  'Matches auth.users.id. Supabase Auth remains the source of authentication identity.';
comment on column public.user_profiles.status is
  'Portal access lifecycle status. Transitions are controlled by services, not UI.';
comment on column public.user_profiles.user_type is
  'Application user classification. Client users must not self-promote this value.';

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create table public.partner_companies (
  id uuid primary key default gen_random_uuid(),
  external_1c_id text not null unique,
  display_name text not null,
  status text not null default 'pending_approval',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_companies_status_check
    check (status in ('pending_approval', 'active', 'suspended', 'revoked', 'rejected'))
);

comment on table public.partner_companies is
  'Minimal portal-side access representation of a 1C partner company. Not a full 1C counterparty copy.';
comment on column public.partner_companies.external_1c_id is
  'Reference to 1C-owned partner/counterparty identity. This is not a security credential.';
comment on column public.partner_companies.display_name is
  'Portal display label only. Official company master data remains in 1C.';

create trigger set_partner_companies_updated_at
before update on public.partner_companies
for each row execute function public.set_updated_at();

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  scope text not null,
  created_at timestamptz not null default now(),
  constraint roles_scope_check
    check (scope in ('partner', 'internal', 'system'))
);

comment on table public.roles is
  'Stable portal application roles. Roles express business responsibility, not UI navigation.';

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text null,
  created_at timestamptz not null default now()
);

comment on table public.permissions is
  'Stable portal permissions used by services and RLS helpers for access checks.';

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

comment on table public.role_permissions is
  'Many-to-many mapping between stable roles and stable permissions.';

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  status text not null default 'pending_approval',
  approved_by uuid null references public.user_profiles(id),
  approved_at timestamptz null,
  revoked_by uuid null references public.user_profiles(id),
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_memberships_status_check
    check (status in ('pending_approval', 'active', 'suspended', 'revoked', 'rejected')),
  constraint company_memberships_user_company_unique
    unique (user_id, company_id)
);

comment on table public.company_memberships is
  'Portal-owned relationship between a user profile and a partner company. Does not store prices, stock, debt, or commercial terms.';
comment on column public.company_memberships.status is
  'Only active memberships grant partner company access.';

create index company_memberships_user_id_idx on public.company_memberships(user_id);
create index company_memberships_company_id_idx on public.company_memberships(company_id);
create index company_memberships_role_id_idx on public.company_memberships(role_id);
create index company_memberships_active_company_user_idx
  on public.company_memberships(company_id, user_id)
  where status = 'active';

create trigger set_company_memberships_updated_at
before update on public.company_memberships
for each row execute function public.set_updated_at();

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  company_id uuid null references public.partner_companies(id),
  requested_external_1c_id text null,
  requested_company_name text null,
  message text null,
  status text not null default 'pending',
  reviewed_by uuid null references public.user_profiles(id),
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

comment on table public.access_requests is
  'Portal-owned access request workflow input. Submitted company data is not trusted commercial truth.';
comment on column public.access_requests.requested_external_1c_id is
  'Optional requested 1C reference for manager review. Never use client-supplied 1C IDs as security scope.';

create index access_requests_user_id_idx on public.access_requests(user_id);
create index access_requests_company_id_idx on public.access_requests(company_id);
create index access_requests_status_idx on public.access_requests(status);

create trigger set_access_requests_updated_at
before update on public.access_requests
for each row execute function public.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  email text not null,
  role_id uuid not null references public.roles(id),
  invited_by uuid not null references public.user_profiles(id),
  accepted_by uuid null references public.user_profiles(id),
  status text not null default 'pending',
  expires_at timestamptz null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked'))
);

comment on table public.invitations is
  'Portal-owned invitation workflow. Invitations do not grant access until accepted and converted into approved membership.';

create index invitations_company_id_idx on public.invitations(company_id);
create index invitations_email_status_idx on public.invitations(lower(email), status);
create index invitations_role_id_idx on public.invitations(role_id);

create trigger set_invitations_updated_at
before update on public.invitations
for each row execute function public.set_updated_at();

-- Helper functions for safe RLS checks.
-- These return booleans for the current authenticated user only and do not
-- expose underlying rows.

create or replace function public.has_active_company_membership(company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships cm
    join public.partner_companies pc on pc.id = cm.company_id
    where cm.company_id = company
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and pc.status = 'active'
  );
$$;

comment on function public.has_active_company_membership(uuid) is
  'Returns true when auth.uid() has an active membership in an active partner company. Does not expose company data.';

create or replace function public.has_permission(company uuid, permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_memberships cm
    join public.partner_companies pc on pc.id = cm.company_id
    join public.role_permissions rp on rp.role_id = cm.role_id
    join public.permissions p on p.id = rp.permission_id
    where cm.company_id = company
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and pc.status = 'active'
      and p.code = permission_code
  );
$$;

comment on function public.has_permission(uuid, text) is
  'Returns true when auth.uid() has an active company membership with the requested permission. Services still own business decisions.';

revoke all on function public.has_active_company_membership(uuid) from public;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_active_company_membership(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;

-- Seed stable roles.

insert into public.roles (code, name, scope)
values
  ('partner_owner', 'Partner Owner', 'partner'),
  ('partner_manager', 'Partner Manager', 'partner'),
  ('partner_buyer', 'Partner Buyer', 'partner'),
  ('partner_accounting', 'Partner Accounting', 'partner'),
  ('partner_viewer', 'Partner Viewer', 'partner'),
  ('novotech_admin', 'Novotech Admin', 'internal'),
  ('novotech_sales', 'Novotech Sales', 'internal'),
  ('novotech_finance', 'Novotech Finance', 'internal'),
  ('novotech_support', 'Novotech Support', 'internal'),
  ('novotech_content_manager', 'Novotech Content Manager', 'internal'),
  ('system_integration', 'System Integration', 'system')
on conflict (code) do update
set name = excluded.name,
    scope = excluded.scope;

-- Seed stable permissions.

insert into public.permissions (code, description)
values
  ('catalog.view', 'View permitted catalog data.'),
  ('prices.view', 'View permitted price information.'),
  ('stock.view', 'View permitted stock availability information.'),
  ('cart.manage', 'Create and manage portal cart state.'),
  ('orders.create', 'Create or submit permitted order workflows.'),
  ('orders.view_company', 'View permitted company order history.'),
  ('documents.view_company', 'View permitted company and product documents.'),
  ('finance.view_company', 'View permitted company finance information.'),
  ('company_users.manage', 'Manage permitted company user access workflows.'),
  ('access_requests.approve', 'Approve or reject partner access requests.'),
  ('admin.access', 'Access internal administrative platform controls.'),
  ('content.manage', 'Manage portal-owned content and presentation metadata.')
on conflict (code) do update
set description = excluded.description;

-- Seed practical role-permission mappings.
-- Company access profiles and service-level checks may further reduce what is
-- actually visible or actionable for partner users.

with role_permission_seed(role_code, permission_code) as (
  values
    -- Partner roles.
    ('partner_owner', 'catalog.view'),
    ('partner_owner', 'prices.view'),
    ('partner_owner', 'stock.view'),
    ('partner_owner', 'cart.manage'),
    ('partner_owner', 'orders.create'),
    ('partner_owner', 'orders.view_company'),
    ('partner_owner', 'documents.view_company'),
    ('partner_owner', 'finance.view_company'),
    ('partner_owner', 'company_users.manage'),

    ('partner_manager', 'catalog.view'),
    ('partner_manager', 'prices.view'),
    ('partner_manager', 'stock.view'),
    ('partner_manager', 'cart.manage'),
    ('partner_manager', 'orders.create'),
    ('partner_manager', 'orders.view_company'),
    ('partner_manager', 'documents.view_company'),

    ('partner_buyer', 'catalog.view'),
    ('partner_buyer', 'prices.view'),
    ('partner_buyer', 'stock.view'),
    ('partner_buyer', 'cart.manage'),
    ('partner_buyer', 'orders.create'),
    ('partner_buyer', 'orders.view_company'),

    ('partner_accounting', 'orders.view_company'),
    ('partner_accounting', 'documents.view_company'),
    ('partner_accounting', 'finance.view_company'),

    ('partner_viewer', 'catalog.view'),
    ('partner_viewer', 'prices.view'),
    ('partner_viewer', 'stock.view'),
    ('partner_viewer', 'documents.view_company'),

    -- Internal roles.
    ('novotech_admin', 'catalog.view'),
    ('novotech_admin', 'prices.view'),
    ('novotech_admin', 'stock.view'),
    ('novotech_admin', 'cart.manage'),
    ('novotech_admin', 'orders.create'),
    ('novotech_admin', 'orders.view_company'),
    ('novotech_admin', 'documents.view_company'),
    ('novotech_admin', 'finance.view_company'),
    ('novotech_admin', 'company_users.manage'),
    ('novotech_admin', 'access_requests.approve'),
    ('novotech_admin', 'admin.access'),
    ('novotech_admin', 'content.manage'),

    ('novotech_sales', 'catalog.view'),
    ('novotech_sales', 'prices.view'),
    ('novotech_sales', 'stock.view'),
    ('novotech_sales', 'orders.create'),
    ('novotech_sales', 'orders.view_company'),
    ('novotech_sales', 'documents.view_company'),
    ('novotech_sales', 'company_users.manage'),
    ('novotech_sales', 'access_requests.approve'),

    ('novotech_finance', 'documents.view_company'),
    ('novotech_finance', 'finance.view_company'),

    ('novotech_support', 'catalog.view'),
    ('novotech_support', 'stock.view'),
    ('novotech_support', 'documents.view_company'),

    ('novotech_content_manager', 'catalog.view'),
    ('novotech_content_manager', 'documents.view_company'),
    ('novotech_content_manager', 'content.manage')

    -- system_integration intentionally receives no broad permissions yet.
    -- Add explicit system permissions later when integration jobs are designed.
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from role_permission_seed seed
join public.roles r on r.code = seed.role_code
join public.permissions p on p.code = seed.permission_code
on conflict (role_id, permission_id) do nothing;

-- Row level security.

alter table public.user_profiles enable row level security;
alter table public.partner_companies enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.company_memberships enable row level security;
alter table public.access_requests enable row level security;
alter table public.invitations enable row level security;

-- Keep table privileges narrow. RLS decides rows; grants decide operations and
-- columns. This is especially important because RLS cannot restrict update
-- columns by itself.

revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.partner_companies from anon, authenticated;
revoke all on table public.roles from anon, authenticated;
revoke all on table public.permissions from anon, authenticated;
revoke all on table public.role_permissions from anon, authenticated;
revoke all on table public.company_memberships from anon, authenticated;
revoke all on table public.access_requests from anon, authenticated;
revoke all on table public.invitations from anon, authenticated;

grant select on table public.user_profiles to authenticated;
grant update (full_name, phone) on table public.user_profiles to authenticated;

grant select on table public.partner_companies to authenticated;
grant select on table public.company_memberships to authenticated;

grant select on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;

grant select on table public.access_requests to authenticated;
grant insert (
  user_id,
  company_id,
  requested_external_1c_id,
  requested_company_name,
  message
) on table public.access_requests to authenticated;
grant update (status, message) on table public.access_requests to authenticated;

grant select on table public.invitations to authenticated;

-- user_profiles policies.

create policy "Users can select own profile"
on public.user_profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can update own safe profile fields"
on public.user_profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- partner_companies policies.
-- Users may see only companies where they have active membership. Internal/admin
-- policies are intentionally deferred until internal role helpers are approved.

create policy "Users can select active membership companies"
on public.partner_companies
for select
to authenticated
using (public.has_active_company_membership(id));

-- company_memberships policies.
-- TODO: Add company user management policy after admin/helper behavior is
-- explicitly designed and tested. Keep MVP foundation to own memberships only.

create policy "Users can select own memberships"
on public.company_memberships
for select
to authenticated
using (user_id = auth.uid());

-- Role metadata policies.
-- These tables contain stable capability metadata, not partner commercial data.

create policy "Authenticated users can select roles"
on public.roles
for select
to authenticated
using (true);

create policy "Authenticated users can select permissions"
on public.permissions
for select
to authenticated
using (true);

create policy "Authenticated users can select role permissions"
on public.role_permissions
for select
to authenticated
using (true);

-- access_requests policies.
-- Approval/rejection by internal admins is deferred until admin helper functions
-- and service workflows are designed.

create policy "Users can insert own access requests"
on public.access_requests
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can select own access requests"
on public.access_requests
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can cancel own pending access requests"
on public.access_requests
for update
to authenticated
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid() and status = 'cancelled');

-- invitations policies.
-- Email-matched invitation reads are intentionally narrow and pending-only.
-- TODO: Revisit after invitation token flow and email verification behavior are
-- designed. Do not add broad company invitation listing yet.

create policy "Users can select own pending email invitations"
on public.invitations
for select
to authenticated
using (
  status = 'pending'
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  and (expires_at is null or expires_at > now())
);
