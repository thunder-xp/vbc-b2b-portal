-- Portal-owned estimate and commercial proposal draft foundation.
-- 1C remains the source of truth for products, prices, stock, currencies, and orders.

insert into public.permissions (code, description)
values
  ('estimates.view', 'View company estimates and commercial proposals.'),
  ('estimates.manage', 'Create and edit company estimate drafts.'),
  ('estimates.pricing.manage', 'Manage estimate selling prices and commercial inputs.'),
  ('estimates.generate_pdf', 'Generate customer-facing estimate PDFs.'),
  ('estimates.convert_to_cart', 'Convert estimate product lines to a cart.'),
  ('proposal_templates.manage', 'Manage company proposal templates.')
on conflict (code) do update set description = excluded.description;

with role_permission_seed(role_code, permission_code) as (
  values
    ('partner_owner', 'estimates.view'),
    ('partner_owner', 'estimates.manage'),
    ('partner_owner', 'estimates.pricing.manage'),
    ('partner_manager', 'estimates.view'),
    ('partner_manager', 'estimates.manage'),
    ('partner_manager', 'estimates.pricing.manage'),
    ('partner_buyer', 'estimates.view'),
    ('partner_buyer', 'estimates.manage'),
    ('partner_buyer', 'estimates.pricing.manage'),
    ('novotech_admin', 'estimates.view'),
    ('novotech_admin', 'estimates.manage'),
    ('novotech_admin', 'estimates.pricing.manage'),
    ('novotech_sales', 'estimates.view'),
    ('novotech_sales', 'estimates.manage'),
    ('novotech_sales', 'estimates.pricing.manage')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permission_seed seed
join public.roles role on role.code = seed.role_code
join public.permissions permission on permission.code = seed.permission_code
on conflict (role_id, permission_id) do nothing;

create sequence if not exists public.estimate_number_sequence;

create or replace function public.generate_estimate_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'KP-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.estimate_number_sequence')::text, 6, '0');
$$;

revoke all on function public.generate_estimate_number() from public;

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  estimate_number text not null default public.generate_estimate_number() unique,
  name text not null,
  customer_name text null,
  project_name text null,
  currency_code text not null,
  validity_days integer not null default 14,
  status text not null default 'draft',
  total_amount numeric(18, 2) not null default 0,
  has_incomplete_pricing boolean not null default false,
  revision integer not null default 1,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimates_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint estimates_customer_name_check check (customer_name is null or char_length(customer_name) <= 200),
  constraint estimates_project_name_check check (project_name is null or char_length(project_name) <= 200),
  constraint estimates_currency_code_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint estimates_validity_days_check check (validity_days between 1 and 365),
  constraint estimates_status_check check (status in ('draft', 'ready', 'sent', 'accepted', 'rejected', 'archived')),
  constraint estimates_archive_check check ((status = 'archived') = (archived_at is not null))
);

comment on table public.estimates is
  'Portal-owned estimate drafts and customer-facing commercial preparation. Not CRM, an order, or editable 1C truth.';

create trigger set_estimates_updated_at
before update on public.estimates
for each row execute function public.set_updated_at();

create or replace function public.increment_estimate_revision()
returns trigger
language plpgsql
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger increment_estimate_revision_before_update
before update on public.estimates
for each row execute function public.increment_estimate_revision();

create table public.estimate_sections (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  show_subtotal boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_sections_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint estimate_sections_sort_order_check check (sort_order >= 0),
  constraint estimate_sections_order_unique unique (estimate_id, sort_order)
);

create trigger set_estimate_sections_updated_at
before update on public.estimate_sections
for each row execute function public.set_updated_at();

create table public.partner_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null references public.partner_companies(id) on delete cascade,
  name text not null,
  default_unit text not null,
  description text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_services_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint partner_services_unit_check check (default_unit in ('pcs', 'hour', 'meter', 'set', 'visit', 'service')),
  constraint partner_services_description_check check (description is null or char_length(description) <= 1000)
);

create unique index partner_services_global_name_unique
  on public.partner_services(lower(name)) where company_id is null;
create unique index partner_services_company_name_unique
  on public.partner_services(company_id, lower(name)) where company_id is not null;

create trigger set_partner_services_updated_at
before update on public.partner_services
for each row execute function public.set_updated_at();

insert into public.partner_services (name, default_unit, sort_order)
values
  ('Монтаж видеокамеры', 'pcs', 10),
  ('Прокладка кабеля', 'meter', 20),
  ('Настройка оборудования', 'service', 30),
  ('Пусконаладочные работы', 'service', 40),
  ('Проектирование', 'service', 50),
  ('Выезд специалиста', 'visit', 60),
  ('Обучение', 'hour', 70),
  ('Гарантийное обслуживание', 'service', 80),
  ('Транспортные расходы', 'service', 90)
on conflict do nothing;

create table public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  section_id uuid not null references public.estimate_sections(id) on delete cascade,
  line_type text not null,
  product_id uuid null references public.catalog_products(id) on delete restrict,
  service_id uuid null references public.partner_services(id) on delete restrict,
  position integer not null,
  sku_snapshot text null,
  product_name_snapshot text null,
  source_unit_price numeric(18, 2) null,
  source_currency_code text null,
  source_snapshot_at timestamptz null,
  description text not null,
  quantity numeric(12, 3) not null,
  unit text not null,
  selling_unit_price numeric(18, 2) null,
  line_total numeric(18, 2) generated always as (
    case when selling_unit_price is null then null else round(selling_unit_price * quantity, 2) end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_items_line_type_check check (line_type in ('product', 'service', 'custom')),
  constraint estimate_items_position_check check (position > 0),
  constraint estimate_items_description_check check (char_length(btrim(description)) between 1 and 2000),
  constraint estimate_items_quantity_check check (quantity > 0 and quantity <= 999999),
  constraint estimate_items_unit_check check (unit in ('pcs', 'hour', 'meter', 'set', 'visit', 'service')),
  constraint estimate_items_source_price_check check (source_unit_price is null or source_unit_price >= 0),
  constraint estimate_items_selling_price_check check (selling_unit_price is null or selling_unit_price >= 0),
  constraint estimate_items_source_currency_check check (source_currency_code is null or source_currency_code ~ '^[A-Z]{3}$'),
  constraint estimate_items_product_shape_check check (
    (line_type = 'product' and product_id is not null and service_id is null and sku_snapshot is not null and product_name_snapshot is not null)
    or (line_type = 'service' and product_id is null)
    or (line_type = 'custom' and product_id is null and service_id is null)
  ),
  constraint estimate_items_position_unique unique (estimate_id, position)
);

create trigger set_estimate_items_updated_at
before update on public.estimate_items
for each row execute function public.set_updated_at();

create table public.estimate_events (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  event_type text not null,
  created_at timestamptz not null default now(),
  constraint estimate_events_type_check check (event_type in ('created', 'saved', 'line_added', 'line_updated', 'line_removed', 'archived'))
);

create index estimates_company_updated_idx on public.estimates(company_id, updated_at desc);
create index estimates_company_status_updated_idx on public.estimates(company_id, status, updated_at desc);
create index estimate_sections_estimate_order_idx on public.estimate_sections(estimate_id, sort_order);
create index estimate_items_estimate_position_idx on public.estimate_items(estimate_id, position);
create index estimate_items_product_idx on public.estimate_items(product_id) where product_id is not null;
create index partner_services_company_active_idx on public.partner_services(company_id, is_active, sort_order);
create index estimate_events_estimate_created_idx on public.estimate_events(estimate_id, created_at desc);

create or replace function public.can_access_estimates(target_company_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    join public.company_memberships membership on membership.user_id = profile.id
    join public.partner_companies company on company.id = membership.company_id
    join public.role_permissions role_permission on role_permission.role_id = membership.role_id
    join public.permissions permission on permission.id = role_permission.permission_id
    where profile.id = auth.uid()
      and profile.status = 'active'
      and membership.company_id = target_company_id
      and membership.status = 'active'
      and company.status = 'active'
      and permission.code = required_permission
  );
$$;

revoke all on function public.can_access_estimates(uuid, text) from public;
grant execute on function public.can_access_estimates(uuid, text) to authenticated;

create or replace function public.refresh_estimate_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid := coalesce(new.estimate_id, old.estimate_id);
begin
  update public.estimates
  set
    total_amount = coalesce((select sum(item.line_total) from public.estimate_items item where item.estimate_id = target_id), 0),
    has_incomplete_pricing = exists (select 1 from public.estimate_items item where item.estimate_id = target_id and item.selling_unit_price is null),
    updated_at = now()
  where id = target_id;
  return null;
end;
$$;

create trigger refresh_estimate_totals_after_item_change
after insert or update or delete on public.estimate_items
for each row execute function public.refresh_estimate_totals();

create or replace function public.record_estimate_item_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (
    coalesce(new.estimate_id, old.estimate_id),
    auth.uid(),
    case tg_op when 'INSERT' then 'line_added' when 'UPDATE' then 'line_updated' else 'line_removed' end
  );
  return null;
end;
$$;

create trigger record_estimate_item_event_after_change
after insert or update or delete on public.estimate_items
for each row execute function public.record_estimate_item_event();

alter table public.estimates enable row level security;
alter table public.estimate_sections enable row level security;
alter table public.estimate_items enable row level security;
alter table public.partner_services enable row level security;
alter table public.estimate_events enable row level security;

revoke all on table public.estimates, public.estimate_sections, public.estimate_items, public.partner_services, public.estimate_events from anon, authenticated;
grant select on table public.estimates, public.estimate_sections, public.estimate_items, public.partner_services, public.estimate_events to authenticated;

create policy "Company members can view estimates"
on public.estimates for select to authenticated
using (public.can_access_estimates(company_id, 'estimates.view'));

create policy "Company members can view estimate sections"
on public.estimate_sections for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_id and public.can_access_estimates(estimate.company_id, 'estimates.view')));

create policy "Company members can view estimate items"
on public.estimate_items for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_id and public.can_access_estimates(estimate.company_id, 'estimates.view')));

create policy "Company members can view service catalog"
on public.partner_services for select to authenticated
using (
  is_active
  and (
    (company_id is not null and public.can_access_estimates(company_id, 'estimates.view'))
    or (
      company_id is null
      and exists (
        select 1 from public.company_memberships membership
        where membership.user_id = auth.uid()
          and public.can_access_estimates(membership.company_id, 'estimates.view')
      )
    )
  )
);

create policy "Company members can view estimate events"
on public.estimate_events for select to authenticated
using (exists (select 1 from public.estimates estimate where estimate.id = estimate_id and public.can_access_estimates(estimate.company_id, 'estimates.view')));

create or replace function public.create_estimate(
  target_company_id uuid,
  estimate_name text,
  target_customer_name text,
  target_project_name text,
  target_currency_code text,
  target_validity_days integer
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.estimates;
begin
  if not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.price_types price_type
    where price_type.is_active = true
      and price_type.currency_status = 'resolved'
      and price_type.currency_code = target_currency_code
  ) then
    raise exception 'Estimate currency is not available.' using errcode = '22023';
  end if;

  insert into public.estimates (company_id, created_by, name, customer_name, project_name, currency_code, validity_days)
  values (target_company_id, auth.uid(), estimate_name, nullif(target_customer_name, ''), nullif(target_project_name, ''), target_currency_code, target_validity_days)
  returning * into created;

  insert into public.estimate_sections (estimate_id, name, sort_order)
  values (created.id, 'Оборудование и услуги', 0);

  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (created.id, auth.uid(), 'created');

  return created;
end;
$$;

revoke all on function public.create_estimate(uuid, text, text, text, text, integer) from public;
grant execute on function public.create_estimate(uuid, text, text, text, text, integer) to authenticated;

create or replace function public.update_estimate_draft(
  target_estimate_id uuid,
  expected_revision integer,
  estimate_name text,
  target_customer_name text,
  target_project_name text,
  target_validity_days integer
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft' or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;

  update public.estimates
  set name = estimate_name,
      customer_name = nullif(target_customer_name, ''),
      project_name = nullif(target_project_name, ''),
      validity_days = target_validity_days
  where id = target.id
  returning * into target;

  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (target.id, auth.uid(), 'saved');
  return target;
end;
$$;

revoke all on function public.update_estimate_draft(uuid, integer, text, text, text, integer) from public;
grant execute on function public.update_estimate_draft(uuid, integer, text, text, text, integer) to authenticated;

create or replace function public.add_estimate_items(target_estimate_id uuid, expected_revision integer, line_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  default_section_id uuid;
  starting_position integer;
  inserted_count integer;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft' or not public.can_access_estimates(target.company_id, 'estimates.manage') or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  if jsonb_typeof(line_items) <> 'array' or jsonb_array_length(line_items) < 1 or jsonb_array_length(line_items) > 50 then
    raise exception 'Estimate line batch is invalid.' using errcode = '22023';
  end if;

  select id into default_section_id from public.estimate_sections where estimate_id = target.id order by sort_order, id limit 1;
  select coalesce(max(position), 0) into starting_position from public.estimate_items where estimate_id = target.id;

  insert into public.estimate_items (
    estimate_id, section_id, line_type, product_id, service_id, position,
    sku_snapshot, product_name_snapshot, source_unit_price, source_currency_code,
    source_snapshot_at, description, quantity, unit, selling_unit_price
  )
  select
    target.id,
    default_section_id,
    payload.line_type,
    payload.product_id,
    payload.service_id,
    starting_position + payload.ordinality,
    payload.sku_snapshot,
    payload.product_name_snapshot,
    payload.source_unit_price,
    payload.source_currency_code,
    payload.source_snapshot_at,
    payload.description,
    payload.quantity,
    payload.unit,
    payload.selling_unit_price
  from jsonb_to_recordset(line_items) with ordinality as payload(
    line_type text,
    product_id uuid,
    service_id uuid,
    sku_snapshot text,
    product_name_snapshot text,
    source_unit_price numeric,
    source_currency_code text,
    source_snapshot_at timestamptz,
    description text,
    quantity numeric,
    unit text,
    selling_unit_price numeric,
    ordinality bigint
  )
  where
    (payload.line_type <> 'product' or exists (select 1 from public.catalog_products product where product.id = payload.product_id and product.is_active and product.is_visible))
    and (payload.service_id is null or exists (select 1 from public.partner_services service where service.id = payload.service_id and service.is_active and (service.company_id is null or service.company_id = target.company_id)));

  get diagnostics inserted_count = row_count;
  if inserted_count <> jsonb_array_length(line_items) then
    raise exception 'One or more estimate lines are invalid.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.add_estimate_items(uuid, integer, jsonb) from public;
grant execute on function public.add_estimate_items(uuid, integer, jsonb) to authenticated;

create or replace function public.update_estimate_item(
  target_estimate_id uuid,
  target_item_id uuid,
  expected_revision integer,
  target_description text,
  target_quantity numeric,
  target_unit text,
  target_selling_unit_price numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft' or not public.can_access_estimates(target.company_id, 'estimates.manage') or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;

  update public.estimate_items
  set description = target_description,
      quantity = target_quantity,
      unit = target_unit,
      selling_unit_price = target_selling_unit_price
  where id = target_item_id and estimate_id = target.id;
  if not found then
    raise exception 'Estimate line was not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_estimate_item(uuid, uuid, integer, text, numeric, text, numeric) from public;
grant execute on function public.update_estimate_item(uuid, uuid, integer, text, numeric, text, numeric) to authenticated;

create or replace function public.remove_estimate_item(
  target_estimate_id uuid,
  target_item_id uuid,
  expected_revision integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft' or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  delete from public.estimate_items where id = target_item_id and estimate_id = target.id;
  if not found then
    raise exception 'Estimate line was not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.remove_estimate_item(uuid, uuid, integer) from public;
grant execute on function public.remove_estimate_item(uuid, uuid, integer) to authenticated;

create or replace function public.archive_estimate(target_estimate_id uuid, expected_revision integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft' or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  update public.estimates set status = 'archived', archived_at = now() where id = target.id;
  insert into public.estimate_events (estimate_id, actor_user_id, event_type) values (target.id, auth.uid(), 'archived');
end;
$$;

revoke all on function public.archive_estimate(uuid, integer) from public;
grant execute on function public.archive_estimate(uuid, integer) to authenticated;
