-- Preserve a minimal current product identity on Estimate-owned cart sources so
-- products that leave the active catalog remain visible in the intended basket.

alter table public.cart_item_sources
  add column product_name_snapshot text,
  add column sku_snapshot text,
  add column slug_snapshot text,
  add column image_url_snapshot text;

update public.cart_item_sources source
set product_name_snapshot = product.name,
    sku_snapshot = product.sku,
    slug_snapshot = product.slug,
    image_url_snapshot = coalesce(
      nullif(btrim(product.image_source_url), ''),
      nullif(btrim(product.image_url), '')
    )
from public.cart_items item
join public.catalog_products product on product.id = item.product_id
where item.id = source.cart_item_id;

alter table public.cart_item_sources
  alter column product_name_snapshot set not null,
  alter column sku_snapshot set not null,
  alter column slug_snapshot set not null;

create or replace function public.populate_cart_item_source_product_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select product.name,
         product.sku,
         product.slug,
         coalesce(
           nullif(btrim(product.image_source_url), ''),
           nullif(btrim(product.image_url), '')
         )
  into new.product_name_snapshot,
       new.sku_snapshot,
       new.slug_snapshot,
       new.image_url_snapshot
  from public.cart_items item
  join public.catalog_products product on product.id = item.product_id
  where item.id = new.cart_item_id;

  if new.product_name_snapshot is null
    or new.sku_snapshot is null
    or new.slug_snapshot is null then
    raise exception 'Cart source product identity is unavailable.' using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger populate_cart_item_source_product_snapshot
before insert or update on public.cart_item_sources
for each row execute function public.populate_cart_item_source_product_snapshot();

revoke all on function public.populate_cart_item_source_product_snapshot()
  from public, anon, authenticated;

