-- One allowlisted, bounded read for sitemap generation. The function exposes
-- canonical public slugs only and never returns commercial or source identity.
create or replace function public.list_public_retail_sitemap_inventory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with published_products as (
    select product.slug, product.category_path
    from public.public_retail_products product
    join public.public_retail_publications publication
      on publication.id = product.publication_id
     and publication.status = 'published'
    where not exists (
      select 1
      from jsonb_array_elements(product.category_path) path(value)
      where upper(trim(regexp_replace(coalesce(path.value->>'nameRu', path.value->>'nameRo', ''), '[^A-Za-z0-9]+', ' ', 'g')))
        = 'PROJECT EQUIPMENT'
    )
    order by product.slug
    limit 5001
  ), safe_inventory as (
    select product.slug,
      coalesce((
        select jsonb_agg(jsonb_build_object('slug', path.value->>'slug') order by path.ordinal)
        from jsonb_array_elements(product.category_path) with ordinality path(value, ordinal)
        where path.value->>'slug' ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      ), '[]'::jsonb) as category_path
    from published_products product
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('slug', inventory.slug, 'categoryPath', inventory.category_path)
    order by inventory.slug
  ), '[]'::jsonb)
  from safe_inventory inventory;
$function$;

comment on function public.list_public_retail_sitemap_inventory() is
  'Returns at most 5001 published public product slugs with public category slugs for bounded sitemap generation.';

revoke all on function public.list_public_retail_sitemap_inventory() from public, anon, authenticated;
grant execute on function public.list_public_retail_sitemap_inventory() to anon, authenticated, service_role;
