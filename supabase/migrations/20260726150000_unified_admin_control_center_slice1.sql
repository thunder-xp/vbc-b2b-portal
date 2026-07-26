begin;

-- Platform-scoped internal authorization. Partner memberships remain tenant
-- access records and are intentionally not reused for Novotech staff.

create table if not exists public.internal_user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid null references public.user_profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null
);

create unique index if not exists internal_user_role_assignments_one_active_idx
  on public.internal_user_role_assignments(user_id)
  where revoked_at is null;
create index if not exists internal_user_role_assignments_role_idx
  on public.internal_user_role_assignments(role_id)
  where revoked_at is null;

comment on table public.internal_user_role_assignments is
  'Portal-owned platform role history for Novotech staff. Exactly one primary internal role may be active per user.';
comment on column public.internal_user_role_assignments.assigned_by is
  'Immutable assignment actor. NULL is reserved for audited migration/bootstrap assignments.';

create table if not exists public.internal_role_assignment_audit_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
    references public.internal_user_role_assignments(id) on delete restrict,
  target_user_id uuid not null references public.user_profiles(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('assigned', 'revoked')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  created_at timestamptz not null default now()
);

create index if not exists internal_role_assignment_audit_target_idx
  on public.internal_role_assignment_audit_events(target_user_id, created_at desc);

comment on table public.internal_role_assignment_audit_events is
  'Append-only audit history for platform role assignment and revocation.';

create or replace function public.validate_internal_user_role_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_profile public.user_profiles%rowtype;
  target_role public.roles%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
      or new.role_id is distinct from old.role_id
      or new.assigned_by is distinct from old.assigned_by
      or new.assigned_at is distinct from old.assigned_at then
      raise exception 'Internal role assignment identity is immutable.'
        using errcode = '23514';
    end if;
    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
      raise exception 'A revoked internal role assignment is immutable.'
        using errcode = '23514';
    end if;
  end if;

  select * into target_profile
  from public.user_profiles profile
  where profile.id = new.user_id;

  if target_profile.id is null
    or target_profile.status <> 'active'
    or target_profile.user_type not in ('internal', 'admin') then
    raise exception 'An active internal user profile is required.'
      using errcode = '23514';
  end if;

  select * into target_role
  from public.roles role
  where role.id = new.role_id;

  if target_role.id is null or target_role.scope <> 'internal' then
    raise exception 'Only an internal role may be assigned.'
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_internal_user_role_assignment
  on public.internal_user_role_assignments;
create trigger validate_internal_user_role_assignment
before insert or update on public.internal_user_role_assignments
for each row execute function public.validate_internal_user_role_assignment();

-- Only permissions missing from the existing domain catalog are introduced.
-- Existing mutation permissions remain canonical for their business domains.
insert into public.permissions (
  code,
  description,
  scope,
  delegable_by_partner_owner,
  sensitive,
  category
)
values
  ('admin.dashboard.view', 'View the bounded internal operations dashboard.', 'internal', false, false, 'admin'),
  ('admin.platform_health.view', 'View local platform and synchronization health.', 'internal', false, false, 'admin'),
  ('admin.companies.view', 'View partner company administration data.', 'internal', false, true, 'admin'),
  ('admin.users.view', 'View partner user administration data.', 'internal', false, true, 'admin'),
  ('admin.invitations.view', 'View partner invitation administration data.', 'internal', false, true, 'admin'),
  ('admin.access_requests.view', 'View partner access requests.', 'internal', false, true, 'admin'),
  ('admin.catalog.view', 'View catalog synchronization administration.', 'internal', false, false, 'admin'),
  ('admin.prices.view', 'View price synchronization administration.', 'internal', false, true, 'admin'),
  ('admin.stock.view', 'View stock synchronization administration.', 'internal', false, false, 'admin'),
  ('admin.rates.view', 'View commercial-rate publication history.', 'internal', false, true, 'admin'),
  ('admin.integrations.view', 'View integration state and local diagnostics.', 'internal', false, true, 'admin'),
  ('admin.integrations.manage', 'Run approved integration synchronization operations.', 'internal', false, true, 'admin'),
  ('admin.diagnostics.run', 'Run explicit bounded internal diagnostics.', 'internal', false, true, 'admin'),
  ('admin.orders.view', 'View partner order operations.', 'internal', false, true, 'admin'),
  ('admin.shipments.view', 'View planned shipment operations.', 'internal', false, true, 'admin'),
  ('admin.estimates.view', 'View internal estimate and proposal operations.', 'internal', false, true, 'admin'),
  ('admin.finance.view', 'View internal finance synchronization health.', 'internal', false, true, 'admin'),
  ('admin.audit.view', 'View protected administration audit records.', 'internal', false, true, 'security'),
  ('admin.security.view', 'Inspect effective access without changing it.', 'internal', false, true, 'security'),
  ('admin.permissions.manage', 'Assign and revoke Novotech internal roles.', 'internal', false, true, 'security'),
  ('admin.settings.view', 'View internal platform settings.', 'internal', false, true, 'security')
on conflict (code) do update
set description = excluded.description,
    scope = excluded.scope,
    delegable_by_partner_owner = excluded.delegable_by_partner_owner,
    sensitive = excluded.sensitive,
    category = excluded.category;

-- Baseline role matrix. These grants are additive to existing domain grants.
with role_permission_seed(role_code, permission_code) as (
  values
    ('novotech_sales', 'admin.dashboard.view'),
    ('novotech_sales', 'admin.platform_health.view'),
    ('novotech_sales', 'admin.companies.view'),
    ('novotech_sales', 'admin.users.view'),
    ('novotech_sales', 'admin.invitations.view'),
    ('novotech_sales', 'admin.access_requests.view'),
    ('novotech_sales', 'admin.orders.view'),
    ('novotech_sales', 'admin.shipments.view'),
    ('novotech_sales', 'admin.estimates.view'),
    ('novotech_sales', 'admin.users.view'),
    ('novotech_sales', 'company_users.manage'),
    ('novotech_sales', 'access_requests.approve'),
    ('novotech_sales', 'order_date_changes.review'),
    ('novotech_sales', 'reservations.review'),
    ('novotech_sales', 'specifications.review'),
    ('novotech_sales', 'estimates.view'),
    ('novotech_sales', 'estimates.manage'),
    ('novotech_sales', 'estimates.pricing.manage'),
    ('novotech_sales', 'estimates.generate_pdf'),

    ('novotech_finance', 'admin.dashboard.view'),
    ('novotech_finance', 'admin.platform_health.view'),
    ('novotech_finance', 'admin.companies.view'),
    ('novotech_finance', 'admin.finance.view'),
    ('novotech_finance', 'finance.view_company'),
    ('novotech_finance', 'finance.sync'),
    ('novotech_finance', 'documents.view_company'),

    ('novotech_support', 'admin.dashboard.view'),
    ('novotech_support', 'admin.platform_health.view'),
    ('novotech_support', 'admin.companies.view'),
    ('novotech_support', 'admin.users.view'),
    ('novotech_support', 'admin.invitations.view'),
    ('novotech_support', 'admin.access_requests.view'),
    ('novotech_support', 'admin.integrations.view'),
    ('novotech_support', 'admin.diagnostics.run'),
    ('novotech_support', 'admin.security.view'),

    ('novotech_content_manager', 'admin.dashboard.view'),
    ('novotech_content_manager', 'admin.platform_health.view'),
    ('novotech_content_manager', 'admin.catalog.view'),
    ('novotech_content_manager', 'admin.integrations.view'),
    ('novotech_content_manager', 'catalog.view'),
    ('novotech_content_manager', 'content.manage')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from role_permission_seed seed
join public.roles role
  on role.code = seed.role_code and role.scope = 'internal'
join public.permissions permission
  on permission.code = seed.permission_code
on conflict (role_id, permission_id) do nothing;

-- The platform administrator receives every internal or shared capability.
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code = 'novotech_admin'
  and role.scope = 'internal'
  and permission.scope in ('internal', 'both')
on conflict (role_id, permission_id) do nothing;

-- Deterministic compatibility backfill. The historical application model used
-- internal as the sales-manager classification and admin as platform admin.
insert into public.internal_user_role_assignments(user_id, role_id, assigned_by)
select profile.id, role.id, null
from public.user_profiles profile
join public.roles role on role.code = case profile.user_type
  when 'admin' then 'novotech_admin'
  else 'novotech_sales'
end
where profile.status = 'active'
  and profile.user_type in ('internal', 'admin')
  and role.scope = 'internal'
  and not exists (
    select 1
    from public.internal_user_role_assignments assignment
    where assignment.user_id = profile.id
      and assignment.revoked_at is null
  );

insert into public.internal_role_assignment_audit_events(
  assignment_id,
  target_user_id,
  role_id,
  actor_user_id,
  event_type,
  reason
)
select assignment.id, assignment.user_id, assignment.role_id, null, 'assigned',
  'Slice 1 compatibility backfill from the former internal user classification.'
from public.internal_user_role_assignments assignment
where assignment.assigned_by is null
  and not exists (
    select 1
    from public.internal_role_assignment_audit_events event
    where event.assignment_id = assignment.id
      and event.event_type = 'assigned'
  );

create or replace function public.get_effective_internal_permissions()
returns table (
  user_id uuid,
  profile_status text,
  internal_role_codes text[],
  effective_permission_codes text[],
  is_platform_admin boolean,
  display_name text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with identity as (
    select profile.id, profile.status, profile.full_name, profile.email
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
  ),
  active_roles as (
    select assignment.user_id, role.id, role.code
    from public.internal_user_role_assignments assignment
    join public.roles role
      on role.id = assignment.role_id
      and role.scope = 'internal'
    join identity on identity.id = assignment.user_id
    where assignment.revoked_at is null
  ),
  projection as (
    select
      identity.id as user_id,
      identity.status as profile_status,
      coalesce(array_agg(distinct active_roles.code order by active_roles.code), '{}'::text[])
        as internal_role_codes,
      coalesce(array_agg(distinct permission.code order by permission.code)
        filter (where permission.code is not null), '{}'::text[])
        as effective_permission_codes,
      bool_or(active_roles.code = 'novotech_admin') as is_platform_admin,
      coalesce(nullif(btrim(identity.full_name), ''), identity.email) as display_name
    from identity
    join active_roles on active_roles.user_id = identity.id
    left join public.role_permissions role_permission
      on role_permission.role_id = active_roles.id
    left join public.permissions permission
      on permission.id = role_permission.permission_id
      and permission.scope in ('internal', 'both')
    group by identity.id, identity.status, identity.full_name, identity.email
  )
  select
    projection.user_id,
    projection.profile_status,
    projection.internal_role_codes,
    projection.effective_permission_codes,
    projection.is_platform_admin,
    projection.display_name
  from projection;
$$;

comment on function public.get_effective_internal_permissions() is
  'Returns the compact platform-scoped permission projection for auth.uid(). It never accepts a browser-supplied user or company ID.';

revoke all on function public.get_effective_internal_permissions()
  from public, anon;
grant execute on function public.get_effective_internal_permissions()
  to authenticated;

create or replace function public.has_internal_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce((
    select permission_code = any(context.effective_permission_codes)
    from public.get_effective_internal_permissions() context
  ), false);
$$;

revoke all on function public.has_internal_permission(text) from public, anon;
grant execute on function public.has_internal_permission(text) to authenticated;

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
  target_role public.roles%rowtype;
  existing_assignment public.internal_user_role_assignments%rowtype;
  created_assignment public.internal_user_role_assignments%rowtype;
  normalized_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_internal_permission('admin.permissions.manage') then
    raise exception 'Internal role management is not allowed.' using errcode = '42501';
  end if;
  if char_length(normalized_reason) not between 3 and 500 then
    raise exception 'A role assignment reason is required.' using errcode = '22023';
  end if;

  select * into target_role
  from public.roles role
  where role.code = p_role_code
    and role.scope = 'internal';
  if target_role.id is null then
    raise exception 'Internal role is not available.' using errcode = '22023';
  end if;

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
      existing_assignment.id, existing_assignment.user_id,
      existing_assignment.role_id, actor_id, 'revoked', normalized_reason
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
    created_assignment.id, p_user_id, target_role.id,
    actor_id, 'assigned', normalized_reason
  );

  return created_assignment.id;
end;
$$;

revoke all on function public.assign_internal_user_role(uuid, text, text)
  from public, anon;
grant execute on function public.assign_internal_user_role(uuid, text, text)
  to authenticated;

-- Existing domain helpers now consume the canonical assignment projection.
create or replace function public.can_review_access_requests()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_internal_permission('access_requests.approve'); $$;

create or replace function public.can_manage_commercial_rates()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_internal_permission('commercial_rates.manage'); $$;

create or replace function public.can_review_project_specifications()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_internal_permission('specifications.review'); $$;

create or replace function public.can_review_reservation_requests()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_internal_permission('reservations.review'); $$;

create or replace function public.can_review_partner_orders()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_internal_permission('orders.review'); $$;

create or replace function public.can_review_order_date_changes()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_internal_permission('order_date_changes.review'); $$;

create or replace function public.can_run_partner_finance_sync()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_internal_permission('finance.sync'); $$;

alter table public.internal_user_role_assignments enable row level security;
alter table public.internal_role_assignment_audit_events enable row level security;

revoke all on table public.internal_user_role_assignments
  from public, anon, authenticated;
revoke all on table public.internal_role_assignment_audit_events
  from public, anon, authenticated;
grant select on table public.internal_user_role_assignments to authenticated;
grant select on table public.internal_role_assignment_audit_events to authenticated;

create policy "Internal users select own active role assignment"
on public.internal_user_role_assignments
for select to authenticated
using (user_id = auth.uid() and revoked_at is null);

create policy "Permission administrators select internal role assignments"
on public.internal_user_role_assignments
for select to authenticated
using (public.has_internal_permission('admin.permissions.manage'));

create policy "Permission administrators select internal role audit"
on public.internal_role_assignment_audit_events
for select to authenticated
using (public.has_internal_permission('admin.permissions.manage'));

-- No authenticated INSERT, UPDATE, or DELETE table grant exists. All changes
-- pass through the audited security-definer transition RPC.

commit;
