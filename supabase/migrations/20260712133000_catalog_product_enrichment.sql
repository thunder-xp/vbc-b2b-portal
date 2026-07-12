alter table public.catalog_products
  add column if not exists image_source_url text,
  add column if not exists full_description text,
  add column if not exists enrichment_synced_at timestamptz,
  add column if not exists enrichment_source_version text;

create table if not exists public.catalog_product_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  property_ref text not null,
  attribute_key text not null,
  label text not null,
  raw_value jsonb,
  display_value text not null,
  value_type text,
  is_filterable boolean not null default false,
  is_visible boolean not null default true,
  source_updated_at timestamptz,
  last_seen_sync_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, property_ref)
);

create index if not exists catalog_product_attributes_product_idx on public.catalog_product_attributes(product_id);
create index if not exists catalog_product_attributes_key_idx on public.catalog_product_attributes(attribute_key);
create index if not exists catalog_product_attributes_filterable_idx on public.catalog_product_attributes(is_filterable);
create index if not exists catalog_product_attributes_value_idx on public.catalog_product_attributes(display_value);
create index if not exists catalog_product_attributes_product_filterable_idx on public.catalog_product_attributes(product_id, is_filterable);

alter table public.catalog_product_attributes enable row level security;
revoke all on public.catalog_product_attributes from anon, authenticated;
grant select on public.catalog_product_attributes to authenticated;

drop policy if exists "Approved users can read product attributes" on public.catalog_product_attributes;
create policy "Approved users can read product attributes"
  on public.catalog_product_attributes for select to authenticated
  using (public.can_select_catalog());

create or replace function public.preserve_valid_catalog_image()
returns trigger language plpgsql as $$
begin
  if new.image_source_url is null then new.image_source_url := old.image_source_url; end if;
  return new;
end;
$$;
drop trigger if exists preserve_valid_catalog_image_trigger on public.catalog_products;
create trigger preserve_valid_catalog_image_trigger before update on public.catalog_products
for each row execute function public.preserve_valid_catalog_image();

alter table public.catalog_sync_state
  add column if not exists property_definitions_loaded integer not null default 0,
  add column if not exists products_with_image_url integer not null default 0,
  add column if not exists products_without_image_url integer not null default 0,
  add column if not exists invalid_image_urls integer not null default 0,
  add column if not exists products_with_full_description integer not null default 0,
  add column if not exists products_with_attributes integer not null default 0,
  add column if not exists attribute_rows_received integer not null default 0,
  add column if not exists attribute_rows_upserted integer not null default 0,
  add column if not exists attribute_rows_removed integer not null default 0,
  add column if not exists filterable_attribute_rows integer not null default 0;
