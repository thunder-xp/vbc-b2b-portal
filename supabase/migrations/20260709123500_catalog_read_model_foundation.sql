-- Novotech Partner Platform
-- Catalog Read Model foundation migration.
--
-- Scope:
-- - Read-only catalog cache for categories, brands, products, product images,
--   and product document references.
-- - 1C remains the source of truth for official product identity and product
--   master data.
-- - The portal may cache/display this data for partner browsing, search, and
--   filtering readiness.
--
-- This migration intentionally does not create prices, stock, warehouses,
-- reservations, carts, orders, finance, credit limits, debts, contracts, or
-- partner-specific commercial terms.

create extension if not exists "pgcrypto";

create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  external_1c_id text unique null,
  parent_id uuid null references public.catalog_categories(id),
  name text not null,
  slug text not null unique,
  description text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_categories is
  'Read-only catalog category cache for partner browsing. 1C or approved portal navigation mapping remains the source; no prices, stock, or commercial terms belong here.';
comment on column public.catalog_categories.external_1c_id is
  'Optional 1C category reference for sync. This is not a security boundary.';

create trigger set_catalog_categories_updated_at
before update on public.catalog_categories
for each row execute function public.set_updated_at();

create table public.catalog_brands (
  id uuid primary key default gen_random_uuid(),
  external_1c_id text unique null,
  name text not null,
  slug text not null unique,
  description text null,
  logo_url text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_brands is
  'Read-only catalog brand cache for partner browsing and filtering. Official brand ownership stays in 1C or an approved master source.';
comment on column public.catalog_brands.external_1c_id is
  'Optional 1C brand reference for sync. This is not a security boundary.';

create trigger set_catalog_brands_updated_at
before update on public.catalog_brands
for each row execute function public.set_updated_at();

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  external_1c_id text not null unique,
  category_id uuid null references public.catalog_categories(id),
  brand_id uuid null references public.catalog_brands(id),
  sku text not null,
  name text not null,
  slug text not null unique,
  short_description text null,
  description text null,
  image_url text null,
  is_active boolean not null default true,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_products is
  'Read-only product catalog cache. 1C remains source of truth. This table must not contain prices, stock, warehouse balances, reservation state, debt, credit limits, commercial terms, partner-specific prices, or order data.';
comment on column public.catalog_products.external_1c_id is
  'Required 1C product reference for sync. This is not a security boundary.';
comment on column public.catalog_products.is_visible is
  'Global portal visibility flag for read-model browsing. Future partner-specific visibility belongs in approved access design.';

create trigger set_catalog_products_updated_at
before update on public.catalog_products
for each row execute function public.set_updated_at();

create table public.catalog_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  url text not null,
  alt_text text null,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.catalog_product_images is
  'Read-only product image references for catalog display. Images do not define product identity and must not contain commercial data.';

create table public.catalog_product_documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  title text not null,
  document_type text not null,
  url text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint catalog_product_documents_document_type_check
    check (document_type in ('datasheet', 'manual', 'certificate', 'warranty', 'marketing', 'other'))
);

comment on table public.catalog_product_documents is
  'Read-only product document references for catalog display. Full document access remains governed by Documents Domain; no accounting documents, invoices, prices, or commercial terms belong here.';
comment on column public.catalog_product_documents.document_type is
  'Safe product-document reference type. Sensitive documents require future Documents Domain permission checks.';

create index catalog_categories_parent_id_idx on public.catalog_categories(parent_id);
create index catalog_categories_active_sort_idx
  on public.catalog_categories(is_active, sort_order, name);

create index catalog_brands_active_sort_idx
  on public.catalog_brands(is_active, sort_order, name);

create index catalog_products_category_id_idx on public.catalog_products(category_id);
create index catalog_products_brand_id_idx on public.catalog_products(brand_id);
create index catalog_products_sku_idx on public.catalog_products(sku);
create index catalog_products_active_visible_sort_idx
  on public.catalog_products(is_active, is_visible, sort_order, name);

create index catalog_product_images_product_id_idx on public.catalog_product_images(product_id);
create index catalog_product_documents_product_id_idx on public.catalog_product_documents(product_id);

-- Helper function for safe catalog RLS checks.
-- This function checks only the current authenticated user. It does not expose
-- partner company rows, product rows, or 1C identifiers.

create or replace function public.can_select_catalog()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.status = 'active'
      and up.user_type in ('internal', 'admin', 'system')
  )
  or exists (
    select 1
    from public.company_memberships cm
    join public.partner_companies pc on pc.id = cm.company_id
    join public.role_permissions rp on rp.role_id = cm.role_id
    join public.permissions p on p.id = rp.permission_id
    join public.user_profiles up on up.id = cm.user_id
    where cm.user_id = auth.uid()
      and up.status = 'active'
      and cm.status = 'active'
      and pc.status = 'active'
      and p.code = 'catalog.view'
  );
$$;

comment on function public.can_select_catalog() is
  'Returns true when auth.uid() may read active catalog read-model data. It does not use external_1c_id as security.';

revoke all on function public.can_select_catalog() from public;
grant execute on function public.can_select_catalog() to authenticated;

alter table public.catalog_categories enable row level security;
alter table public.catalog_brands enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_product_images enable row level security;
alter table public.catalog_product_documents enable row level security;

-- Keep catalog read model read-only for authenticated users. Future system sync
-- workflows may use isolated, reviewed server-side privileges, but partner
-- users must not insert/update/delete catalog cache rows.

revoke all on table public.catalog_categories from anon, authenticated;
revoke all on table public.catalog_brands from anon, authenticated;
revoke all on table public.catalog_products from anon, authenticated;
revoke all on table public.catalog_product_images from anon, authenticated;
revoke all on table public.catalog_product_documents from anon, authenticated;

grant select on table public.catalog_categories to authenticated;
grant select on table public.catalog_brands to authenticated;
grant select on table public.catalog_products to authenticated;
grant select on table public.catalog_product_images to authenticated;
grant select on table public.catalog_product_documents to authenticated;

create policy "Approved users can select active catalog categories"
on public.catalog_categories
for select
to authenticated
using (
  public.can_select_catalog()
  and is_active = true
);

create policy "Approved users can select active catalog brands"
on public.catalog_brands
for select
to authenticated
using (
  public.can_select_catalog()
  and is_active = true
);

create policy "Approved users can select active visible catalog products"
on public.catalog_products
for select
to authenticated
using (
  public.can_select_catalog()
  and is_active = true
  and is_visible = true
);

create policy "Approved users can select images for active visible products"
on public.catalog_product_images
for select
to authenticated
using (
  public.can_select_catalog()
  and exists (
    select 1
    from public.catalog_products p
    where p.id = product_id
      and p.is_active = true
      and p.is_visible = true
  )
);

create policy "Approved users can select documents for active visible products"
on public.catalog_product_documents
for select
to authenticated
using (
  public.can_select_catalog()
  and is_active = true
  and exists (
    select 1
    from public.catalog_products p
    where p.id = product_id
      and p.is_active = true
      and p.is_visible = true
  )
);
