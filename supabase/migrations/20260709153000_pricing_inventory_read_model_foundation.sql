-- Novotech Partner Platform
-- Pricing and Inventory Read Model foundation migration.
--
-- Scope:
-- - Read-only price and stock cache for partner catalog display.
-- - 1C remains the source of truth for official prices, stock balances,
--   warehouses, reservations, contracts, and commercial terms.
-- - The portal controls visibility and may display safe partner-facing
--   snapshots according to access permissions.
--
-- This migration intentionally does not create carts, orders, reservation
-- workflows, finance data, credit limits, debts, contracts, or 1C integration.

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  company_id uuid null references public.partner_companies(id) on delete cascade,
  external_1c_price_type_id text null,
  currency text not null,
  price_amount numeric(14, 2) not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_prices_amount_non_negative_check
    check (price_amount >= 0),
  constraint product_prices_valid_window_check
    check (valid_to is null or valid_to >= valid_from),
  constraint product_prices_currency_format_check
    check (char_length(currency) between 3 and 8)
);

comment on table public.product_prices is
  'Read-only cached product price snapshots for partner catalog display. 1C remains source of truth; no discounts, contracts, cart, order, finance, or official pricing engine data belongs here.';
comment on column public.product_prices.company_id is
  'Optional partner company scope for future company-specific cached prices. Access must be validated by active membership and permission, not by external 1C ids.';
comment on column public.product_prices.external_1c_price_type_id is
  'Optional 1C price type reference for sync. This is not a security boundary.';
comment on column public.product_prices.price_amount is
  'Cached snapshot amount from 1C. It is not an order or checkout commitment.';

create trigger set_product_prices_updated_at
before update on public.product_prices
for each row execute function public.set_updated_at();

create table public.product_stock_balances (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  warehouse_name text not null,
  available_quantity numeric(14, 3) not null default 0,
  reserved_quantity numeric(14, 3) null,
  updated_from_1c_at timestamptz null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_stock_available_non_negative_check
    check (available_quantity >= 0),
  constraint product_stock_reserved_non_negative_check
    check (reserved_quantity is null or reserved_quantity >= 0)
);

comment on table public.product_stock_balances is
  'Read-only cached product stock snapshots for partner availability display. 1C remains source of truth; this table does not create reservations, orders, warehouse management, or fulfillment promises.';
comment on column public.product_stock_balances.warehouse_name is
  'Cached source warehouse label. Warehouse-level display remains controlled by future stock visibility design.';
comment on column public.product_stock_balances.available_quantity is
  'Cached quantity snapshot from 1C. MVP UI should expose availability labels, not exact quantity.';
comment on column public.product_stock_balances.reserved_quantity is
  'Optional cached source quantity from 1C. This is not a portal reservation workflow.';
comment on column public.product_stock_balances.updated_from_1c_at is
  'Timestamp when the stock snapshot was refreshed from 1C or approved integration source.';

create trigger set_product_stock_balances_updated_at
before update on public.product_stock_balances
for each row execute function public.set_updated_at();

create index product_prices_product_id_idx on public.product_prices(product_id);
create index product_prices_company_id_idx on public.product_prices(company_id);
create index product_prices_active_scope_idx
  on public.product_prices(product_id, company_id, is_active, valid_from, valid_to);

create index product_stock_balances_product_id_idx
  on public.product_stock_balances(product_id);
create index product_stock_balances_active_product_idx
  on public.product_stock_balances(product_id, is_active);

-- Helper function for safe price/stock RLS checks.
-- This function checks only the current authenticated user, active company
-- membership, active company status, requested permission, and active visible
-- product status. It does not expose rows and does not use external_1c_id as a
-- security boundary.

create or replace function public.can_select_product_commercial_data(
  target_product_id uuid,
  target_company_id uuid,
  required_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.catalog_products cp
    join public.company_memberships cm
      on cm.user_id = auth.uid()
    join public.partner_companies pc
      on pc.id = cm.company_id
    join public.role_permissions rp
      on rp.role_id = cm.role_id
    join public.permissions p
      on p.id = rp.permission_id
    join public.user_profiles up
      on up.id = cm.user_id
    where cp.id = target_product_id
      and cp.is_active = true
      and cp.is_visible = true
      and up.status = 'active'
      and cm.status = 'active'
      and pc.status = 'active'
      and p.code = required_permission_code
      and (
        target_company_id is null
        or cm.company_id = target_company_id
      )
  );
$$;

comment on function public.can_select_product_commercial_data(uuid, uuid, text) is
  'Returns true when auth.uid() may read cached product price or stock rows for an active visible product and permitted active company context. It does not use external_1c_id as security.';

revoke all on function public.can_select_product_commercial_data(uuid, uuid, text) from public;
grant execute on function public.can_select_product_commercial_data(uuid, uuid, text) to authenticated;

alter table public.product_prices enable row level security;
alter table public.product_stock_balances enable row level security;

-- Partner-facing users may read permitted cache rows only. Future system sync
-- writes must be isolated server-side operations and are intentionally not
-- granted to authenticated users here.

revoke all on table public.product_prices from anon, authenticated;
revoke all on table public.product_stock_balances from anon, authenticated;

grant select on table public.product_prices to authenticated;
grant select on table public.product_stock_balances to authenticated;

create policy "Approved users can select permitted active product prices"
on public.product_prices
for select
to authenticated
using (
  is_active = true
  and valid_from <= now()
  and (valid_to is null or valid_to >= now())
  and public.can_select_product_commercial_data(
    product_id,
    company_id,
    'prices.view'
  )
);

create policy "Approved users can select permitted active product stock"
on public.product_stock_balances
for select
to authenticated
using (
  is_active = true
  and public.can_select_product_commercial_data(
    product_id,
    null,
    'stock.view'
  )
);
