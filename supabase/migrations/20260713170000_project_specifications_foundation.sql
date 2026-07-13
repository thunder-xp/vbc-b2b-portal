-- Portal-owned project specification/BOM foundation.
-- 1C remains the source of truth for products, prices, stock, and arrivals.
-- These tables intentionally store only project metadata, product references,
-- quantities, and workflow state. They are not CRM, cart, order, or finance data.

insert into public.permissions (code, description)
values ('specifications.manage', 'Create and submit company project specifications.')
on conflict (code) do update set description = excluded.description;

with role_permission_seed(role_code) as (
  values
    ('partner_owner'),
    ('partner_manager'),
    ('partner_buyer'),
    ('novotech_admin'),
    ('novotech_sales')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permission_seed seed
join public.roles role on role.code = seed.role_code
join public.permissions permission on permission.code = 'specifications.manage'
on conflict (role_id, permission_id) do nothing;

create table public.project_specifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  project_name text not null,
  customer_site_name text not null,
  description text null,
  status text not null default 'draft',
  submitted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_specifications_project_name_check
    check (char_length(btrim(project_name)) between 1 and 200),
  constraint project_specifications_customer_site_name_check
    check (char_length(btrim(customer_site_name)) between 1 and 200),
  constraint project_specifications_description_check
    check (description is null or char_length(description) <= 2000),
  constraint project_specifications_status_check
    check (status in ('draft', 'submitted')),
  constraint project_specifications_submission_time_check
    check (
      (status = 'draft' and submitted_at is null)
      or (status = 'submitted' and submitted_at is not null)
    )
);

comment on table public.project_specifications is
  'Portal-owned installer project/BOM metadata. This is not CRM, an order, or 1C commercial truth.';

create trigger set_project_specifications_updated_at
before update on public.project_specifications
for each row execute function public.set_updated_at();

create table public.project_specification_items (
  id uuid primary key default gen_random_uuid(),
  specification_id uuid not null references public.project_specifications(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  quantity integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_specification_items_quantity_check check (quantity > 0),
  constraint project_specification_items_product_unique unique (specification_id, product_id)
);

comment on table public.project_specification_items is
  'Portal-owned BOM selections. Prices, stock, arrivals, reservations, and order data are intentionally excluded.';

create trigger set_project_specification_items_updated_at
before update on public.project_specification_items
for each row execute function public.set_updated_at();

create index project_specifications_company_status_idx
  on public.project_specifications(company_id, status, updated_at desc);
create index project_specifications_created_by_idx
  on public.project_specifications(created_by);
create index project_specification_items_specification_idx
  on public.project_specification_items(specification_id);
create index project_specification_items_product_idx
  on public.project_specification_items(product_id);

create or replace function public.can_manage_project_specifications(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    join public.company_memberships membership
      on membership.user_id = profile.id
    join public.partner_companies company
      on company.id = membership.company_id
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    where profile.id = auth.uid()
      and profile.status = 'active'
      and membership.company_id = target_company_id
      and membership.status = 'active'
      and company.status = 'active'
      and permission.code = 'specifications.manage'
  );
$$;

revoke all on function public.can_manage_project_specifications(uuid) from public;
grant execute on function public.can_manage_project_specifications(uuid) to authenticated;

alter table public.project_specifications enable row level security;
alter table public.project_specification_items enable row level security;

revoke all on table public.project_specifications from anon, authenticated;
revoke all on table public.project_specification_items from anon, authenticated;

grant select, insert on table public.project_specifications to authenticated;
grant update (project_name, customer_site_name, description)
  on table public.project_specifications to authenticated;
grant select, insert, delete on table public.project_specification_items to authenticated;
grant update (quantity) on table public.project_specification_items to authenticated;

create policy "Company members can select project specifications"
on public.project_specifications
for select
to authenticated
using (public.can_manage_project_specifications(company_id));

create policy "Company members can create draft project specifications"
on public.project_specifications
for insert
to authenticated
with check (
  created_by = auth.uid()
  and status = 'draft'
  and submitted_at is null
  and public.can_manage_project_specifications(company_id)
);

create policy "Company members can update draft project specifications"
on public.project_specifications
for update
to authenticated
using (
  status = 'draft'
  and public.can_manage_project_specifications(company_id)
)
with check (
  status = 'draft'
  and submitted_at is null
  and public.can_manage_project_specifications(company_id)
);

create policy "Company members can select project specification items"
on public.project_specification_items
for select
to authenticated
using (
  exists (
    select 1
    from public.project_specifications specification
    where specification.id = specification_id
      and public.can_manage_project_specifications(specification.company_id)
  )
);

create policy "Company members can add draft project specification items"
on public.project_specification_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.project_specifications specification
    join public.catalog_products product on product.id = product_id
    where specification.id = specification_id
      and specification.status = 'draft'
      and product.is_active = true
      and product.is_visible = true
      and public.can_manage_project_specifications(specification.company_id)
  )
);

create policy "Company members can update draft project specification items"
on public.project_specification_items
for update
to authenticated
using (
  exists (
    select 1
    from public.project_specifications specification
    where specification.id = specification_id
      and specification.status = 'draft'
      and public.can_manage_project_specifications(specification.company_id)
  )
)
with check (
  exists (
    select 1
    from public.project_specifications specification
    where specification.id = specification_id
      and specification.status = 'draft'
      and public.can_manage_project_specifications(specification.company_id)
  )
);

create policy "Company members can remove draft project specification items"
on public.project_specification_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.project_specifications specification
    where specification.id = specification_id
      and specification.status = 'draft'
      and public.can_manage_project_specifications(specification.company_id)
  )
);

create or replace function public.submit_project_specification(target_specification_id uuid)
returns public.project_specifications
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.project_specifications;
begin
  select * into target
  from public.project_specifications
  where id = target_specification_id
  for update;

  if target.id is null
    or not public.can_manage_project_specifications(target.company_id) then
    raise exception 'Project specification is not available.' using errcode = 'P0002';
  end if;

  if target.status <> 'draft' then
    raise exception 'Project specification is not a draft.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.project_specification_items item
    where item.specification_id = target.id
  ) then
    raise exception 'Project specification cannot be submitted without items.' using errcode = '23514';
  end if;

  update public.project_specifications
  set status = 'submitted', submitted_at = now()
  where id = target.id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.submit_project_specification(uuid) from public;
grant execute on function public.submit_project_specification(uuid) to authenticated;
