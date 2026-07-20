-- Compact, access-scoped catalog typeahead. Commercial data remains outside
-- this projection and the full catalog page query remains unchanged.
create index if not exists catalog_products_active_sku_search_idx
  on public.catalog_products (lower(sku) text_pattern_ops)
  where is_active and is_visible;

create index if not exists catalog_products_active_name_search_idx
  on public.catalog_products (lower(name) text_pattern_ops)
  where is_active and is_visible;

create or replace function public.catalog_search_suggestions(
  p_company_id uuid,
  p_query text,
  p_category_id uuid default null,
  p_limit integer default 6
)
returns table(
  id uuid,
  sku text,
  name text,
  slug text,
  image_url text,
  category_id uuid,
  category_name text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  normalized_query text := lower(trim(p_query));
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
  then
    raise exception 'Catalog search access denied.' using errcode = '42501';
  end if;

  if length(normalized_query) not between 2 and 100
    or p_limit not between 1 and 10
  then
    raise exception 'Invalid catalog search input.' using errcode = '22023';
  end if;

  return query
  with recursive category_scope as (
    select category.id
    from public.catalog_categories category
    where p_category_id is not null
      and category.id = p_category_id
      and category.is_active
    union all
    select child.id
    from public.catalog_categories child
    join category_scope parent on parent.id = child.parent_id
    where child.is_active
  ), matches as (
    select
      product.id,
      product.sku,
      product.name,
      product.slug,
      coalesce(product.image_source_url, product.image_url) as image_url,
      category.id as category_id,
      category.name as category_name,
      case
        when lower(product.sku) = normalized_query then 0
        when lower(product.sku) like normalized_query || '%' then 1
        when lower(product.name) like normalized_query || '%' then 2
        else 3
      end as search_rank
    from public.catalog_products product
    left join public.catalog_categories category
      on category.id = product.category_id and category.is_active
    left join public.catalog_brands brand
      on brand.id = product.brand_id and brand.is_active
    where product.is_active
      and product.is_visible
      and (
        p_category_id is null
        or product.category_id in (select scoped.id from category_scope scoped)
      )
      and (
        lower(product.sku) like normalized_query || '%'
        or lower(product.name) like '%' || normalized_query || '%'
        or lower(coalesce(brand.name, '')) like '%' || normalized_query || '%'
      )
  )
  select
    matches.id,
    matches.sku,
    matches.name,
    matches.slug,
    matches.image_url,
    matches.category_id,
    matches.category_name
  from matches
  order by matches.search_rank, lower(matches.name), matches.id
  limit p_limit;
end;
$$;

revoke all on function public.catalog_search_suggestions(uuid, text, uuid, integer) from public;
revoke all on function public.catalog_search_suggestions(uuid, text, uuid, integer) from anon;
grant execute on function public.catalog_search_suggestions(uuid, text, uuid, integer) to authenticated;

comment on function public.catalog_search_suggestions(uuid, text, uuid, integer) is
  'Returns a compact catalog identity projection for authenticated active company members with catalog.view.';
