-- Partner cart and 1C customer-order submission tracking.
-- The portal owns carts and immutable submission snapshots. 1C remains the
-- source of truth for the resulting commercial order.

insert into public.permissions (code, description)
values
  ('orders.manage', 'Manage a partner company cart and submit customer orders.'),
  ('orders.review', 'Review submitted partner customer orders internally.')
on conflict (code) do update set description = excluded.description;

with grants(role_code, permission_code) as (
  values
    ('partner_owner', 'orders.manage'),
    ('partner_manager', 'orders.manage'),
    ('partner_buyer', 'orders.manage'),
    ('novotech_admin', 'orders.review'),
    ('novotech_sales', 'orders.review')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict (role_id, permission_id) do nothing;

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_status_check check (status in ('active', 'submitting', 'converted', 'abandoned'))
);

create unique index if not exists carts_one_active_per_user_company_idx
  on public.carts(company_id, created_by)
  where status in ('active', 'submitting');
create index if not exists carts_company_updated_idx
  on public.carts(company_id, updated_at desc);

drop trigger if exists set_carts_updated_at on public.carts;
create trigger set_carts_updated_at before update on public.carts
for each row execute function public.set_updated_at();

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  quantity integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_quantity_check check (quantity between 1 and 9999),
  constraint cart_items_cart_product_unique unique (cart_id, product_id)
);

create index if not exists cart_items_cart_idx on public.cart_items(cart_id);
drop trigger if exists set_cart_items_updated_at on public.cart_items;
create trigger set_cart_items_updated_at before update on public.cart_items
for each row execute function public.set_updated_at();

create table if not exists public.partner_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  submitted_by uuid not null references public.user_profiles(id) on delete restrict,
  cart_id uuid null references public.carts(id) on delete set null,
  submission_key uuid not null unique,
  submission_attempt_id uuid not null unique,
  status text not null default 'processing',
  requested_delivery_date date not null,
  external_1c_ref text null,
  external_1c_number text null,
  external_1c_date timestamptz null,
  payload_snapshot jsonb not null,
  safe_error_code text null,
  safe_error_message text null,
  safe_error_details text null,
  safe_error_hint text null,
  submitted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_orders_status_check check (status in ('processing', 'submitted', 'failed', 'unknown')),
  constraint partner_orders_success_fields_check check (
    status <> 'submitted'
    or (external_1c_ref is not null and external_1c_number is not null and submitted_at is not null)
  )
);

create index if not exists partner_orders_company_created_idx
  on public.partner_orders(company_id, created_at desc);
create index if not exists partner_orders_status_created_idx
  on public.partner_orders(status, created_at desc);
drop trigger if exists set_partner_orders_updated_at on public.partner_orders;
create trigger set_partner_orders_updated_at before update on public.partner_orders
for each row execute function public.set_updated_at();

create table if not exists public.partner_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.partner_orders(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  external_product_ref text not null,
  external_characteristic_ref text not null,
  external_unit_ref text not null,
  external_vat_rate_ref text not null,
  product_name text not null,
  sku text not null,
  quantity integer not null,
  partner_unit_price numeric(18, 4) not null,
  currency_code text not null,
  line_total numeric(18, 4) not null,
  available_stock numeric(18, 3) null,
  nearest_arrival_date date null,
  nearest_arrival_quantity numeric(18, 3) null,
  snapshot_at timestamptz not null default now(),
  constraint partner_order_items_quantity_check check (quantity between 1 and 9999),
  constraint partner_order_items_price_check check (partner_unit_price > 0),
  constraint partner_order_items_total_check check (line_total = partner_unit_price * quantity),
  constraint partner_order_items_order_product_unique unique (order_id, product_id)
);

create index if not exists partner_order_items_order_idx on public.partner_order_items(order_id);

comment on table public.carts is 'Portal-owned active partner cart state.';
comment on table public.cart_items is 'Portal-owned cart lines. Prices and stock are resolved from current read models.';
comment on table public.partner_orders is 'Portal submission and idempotency tracking for a 1C-owned customer order.';
comment on table public.partner_order_items is 'Immutable product and partner-price snapshots captured immediately before 1C submission.';

create or replace function public.can_manage_partner_order_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(target_company_id, 'orders.manage');
$$;

create or replace function public.can_review_partner_orders()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
  )
  and exists (
    select 1
    from public.roles role
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where role.code in ('novotech_admin', 'novotech_sales')
      and permission.code = 'orders.review'
  );
$$;

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.partner_orders enable row level security;
alter table public.partner_order_items enable row level security;

revoke all on table public.carts, public.cart_items, public.partner_orders, public.partner_order_items from anon, authenticated;
grant select on table public.carts, public.cart_items, public.partner_orders, public.partner_order_items to authenticated;

drop policy if exists "Partners select own company carts" on public.carts;
create policy "Partners select own company carts" on public.carts for select to authenticated
using (created_by = auth.uid() and public.can_manage_partner_order_company(company_id));

drop policy if exists "Partners select own cart items" on public.cart_items;
create policy "Partners select own cart items" on public.cart_items for select to authenticated
using (exists (
  select 1 from public.carts cart
  where cart.id = cart_id
    and cart.created_by = auth.uid()
    and public.can_manage_partner_order_company(cart.company_id)
));

drop policy if exists "Partners select company orders" on public.partner_orders;
create policy "Partners select company orders" on public.partner_orders for select to authenticated
using (public.can_manage_partner_order_company(company_id) or public.can_review_partner_orders());

drop policy if exists "Partners select company order items" on public.partner_order_items;
create policy "Partners select company order items" on public.partner_order_items for select to authenticated
using (exists (
  select 1 from public.partner_orders partner_order
  where partner_order.id = order_id
    and (public.can_manage_partner_order_company(partner_order.company_id) or public.can_review_partner_orders())
));

create or replace function public.add_partner_cart_item(
  target_company_id uuid,
  target_product_id uuid,
  added_quantity integer
)
returns public.cart_items
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cart public.carts;
  target_item public.cart_items;
begin
  if added_quantity < 1 or added_quantity > 9999
    or not public.can_manage_partner_order_company(target_company_id) then
    raise exception 'Cart item is not allowed.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.catalog_products product
    where product.id = target_product_id and product.is_active and product.is_visible
  ) then
    raise exception 'Catalog product is not available.' using errcode = 'P0002';
  end if;

  select * into target_cart from public.carts
  where company_id = target_company_id and created_by = auth.uid() and status = 'active'
  for update;

  if target_cart.id is null then
    insert into public.carts(company_id, created_by)
    values (target_company_id, auth.uid())
    returning * into target_cart;
  end if;

  insert into public.cart_items(cart_id, product_id, quantity)
  values (target_cart.id, target_product_id, added_quantity)
  on conflict (cart_id, product_id) do update
    set quantity = public.cart_items.quantity + excluded.quantity
  returning * into target_item;

  return target_item;
end;
$$;

create or replace function public.set_partner_cart_item_quantity(target_item_id uuid, target_quantity integer)
returns public.cart_items
language plpgsql
security definer
set search_path = public
as $$
declare target_item public.cart_items;
begin
  if target_quantity < 1 or target_quantity > 9999 then
    raise exception 'Cart quantity is invalid.' using errcode = '23514';
  end if;
  update public.cart_items item
  set quantity = target_quantity
  from public.carts cart
  where item.id = target_item_id
    and cart.id = item.cart_id
    and cart.status = 'active'
    and cart.created_by = auth.uid()
    and public.can_manage_partner_order_company(cart.company_id)
  returning item.* into target_item;
  if target_item.id is null then raise exception 'Cart item was not found.' using errcode = 'P0002'; end if;
  return target_item;
end;
$$;

create or replace function public.remove_partner_cart_item(target_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.cart_items item
  using public.carts cart
  where item.id = target_item_id
    and cart.id = item.cart_id
    and cart.status = 'active'
    and cart.created_by = auth.uid()
    and public.can_manage_partner_order_company(cart.company_id);
  if not found then raise exception 'Cart item was not found.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.begin_partner_order_submission(
  target_cart_id uuid,
  target_submission_key uuid,
  target_attempt_id uuid,
  target_delivery_date date,
  target_payload jsonb,
  target_items jsonb
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cart public.carts;
  target_order public.partner_orders;
begin
  select * into target_order from public.partner_orders where submission_key = target_submission_key;
  if target_order.id is not null then
    if target_order.submitted_by <> auth.uid() then
      raise exception 'Order submission key is not available.' using errcode = '42501';
    end if;
    return target_order;
  end if;

  select * into target_cart from public.carts
  where id = target_cart_id and created_by = auth.uid()
  for update;
  if target_cart.id is null or target_cart.status <> 'active'
    or not public.can_manage_partner_order_company(target_cart.company_id) then
    raise exception 'Cart is not available for submission.' using errcode = '42501';
  end if;
  if target_delivery_date < current_date
    or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) = 0 then
    raise exception 'Order submission is invalid.' using errcode = '23514';
  end if;

  insert into public.partner_orders(
    company_id, submitted_by, cart_id, submission_key, submission_attempt_id,
    requested_delivery_date, payload_snapshot
  ) values (
    target_cart.company_id, auth.uid(), target_cart.id, target_submission_key,
    target_attempt_id, target_delivery_date, target_payload
  ) returning * into target_order;

  insert into public.partner_order_items(
    order_id, product_id, external_product_ref, external_characteristic_ref,
    external_unit_ref, external_vat_rate_ref, product_name, sku, quantity,
    partner_unit_price, currency_code, line_total, available_stock,
    nearest_arrival_date, nearest_arrival_quantity
  )
  select
    target_order.id, item.product_id, item.external_product_ref,
    item.external_characteristic_ref, item.external_unit_ref,
    item.external_vat_rate_ref, item.product_name, item.sku, item.quantity,
    item.partner_unit_price, item.currency_code, item.line_total,
    item.available_stock, item.nearest_arrival_date,
    item.nearest_arrival_quantity
  from jsonb_to_recordset(target_items) as item(
    product_id uuid,
    external_product_ref text,
    external_characteristic_ref text,
    external_unit_ref text,
    external_vat_rate_ref text,
    product_name text,
    sku text,
    quantity integer,
    partner_unit_price numeric,
    currency_code text,
    line_total numeric,
    available_stock numeric,
    nearest_arrival_date date,
    nearest_arrival_quantity numeric
  );

  update public.carts set status = 'submitting' where id = target_cart.id;
  return target_order;
end;
$$;

create or replace function public.complete_partner_order_submission(
  target_order_id uuid,
  one_c_ref text,
  one_c_number text,
  one_c_date timestamptz
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare target_order public.partner_orders;
begin
  select * into target_order from public.partner_orders
  where id = target_order_id and submitted_by = auth.uid()
  for update;
  if target_order.id is null then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  if target_order.status = 'submitted' then return target_order; end if;
  if target_order.status <> 'processing' then raise exception 'Order is not processing.' using errcode = 'P0001'; end if;

  update public.partner_orders set
    status = 'submitted', external_1c_ref = one_c_ref,
    external_1c_number = one_c_number, external_1c_date = one_c_date,
    submitted_at = now(), safe_error_code = null, safe_error_message = null,
    safe_error_details = null, safe_error_hint = null
  where id = target_order.id returning * into target_order;
  delete from public.cart_items where cart_id = target_order.cart_id;
  update public.carts set status = 'converted' where id = target_order.cart_id;
  return target_order;
end;
$$;

create or replace function public.fail_partner_order_submission(
  target_order_id uuid,
  target_status text,
  error_code text,
  error_message text,
  error_details text default null,
  error_hint text default null
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare target_order public.partner_orders;
begin
  if target_status not in ('failed', 'unknown') then raise exception 'Invalid failure status.' using errcode = '23514'; end if;
  update public.partner_orders set
    status = target_status,
    safe_error_code = left(error_code, 100),
    safe_error_message = left(error_message, 500),
    safe_error_details = left(error_details, 1000),
    safe_error_hint = left(error_hint, 500)
  where id = target_order_id and submitted_by = auth.uid() and status = 'processing'
  returning * into target_order;
  if target_order.id is null then raise exception 'Order was not found.' using errcode = 'P0002'; end if;
  if target_status = 'failed' then update public.carts set status = 'active' where id = target_order.cart_id; end if;
  return target_order;
end;
$$;

revoke all on function public.can_manage_partner_order_company(uuid), public.can_review_partner_orders() from public, anon;
revoke all on function public.add_partner_cart_item(uuid, uuid, integer) from public, anon;
revoke all on function public.set_partner_cart_item_quantity(uuid, integer) from public, anon;
revoke all on function public.remove_partner_cart_item(uuid) from public, anon;
revoke all on function public.begin_partner_order_submission(uuid, uuid, uuid, date, jsonb, jsonb) from public, anon;
revoke all on function public.complete_partner_order_submission(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.fail_partner_order_submission(uuid, text, text, text, text, text) from public, anon;

grant execute on function public.can_manage_partner_order_company(uuid), public.can_review_partner_orders() to authenticated;
grant execute on function public.add_partner_cart_item(uuid, uuid, integer) to authenticated;
grant execute on function public.set_partner_cart_item_quantity(uuid, integer) to authenticated;
grant execute on function public.remove_partner_cart_item(uuid) to authenticated;
grant execute on function public.begin_partner_order_submission(uuid, uuid, uuid, date, jsonb, jsonb) to authenticated;
grant execute on function public.complete_partner_order_submission(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.fail_partner_order_submission(uuid, text, text, text, text, text) to authenticated;
