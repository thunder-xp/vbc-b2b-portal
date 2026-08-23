begin;

create or replace function public.list_public_retail_related_products(
  p_slug text,
  p_locale text default 'ru',
  p_limit integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(p_slug) > 160
    or p_locale not in ('ru', 'ro')
    or p_limit not between 1 and 6 then
    raise exception 'Public Retail related-product input is invalid.' using errcode = '22023';
  end if;

  with current_publication as (
    select publication.id
    from public.public_retail_publications publication
    where publication.status = 'published'
  ), target as (
    select product.*
    from public.public_retail_products product
    join current_publication publication on publication.id = product.publication_id
    where product.slug = p_slug
  ), target_category as (
    select category.*
    from public.public_retail_categories category
    join target on target.publication_id = category.publication_id
      and target.category_public_id = category.public_id
  ), candidate_categories as (
    select target_category.public_id, 1 as same_leaf
    from target_category
    union all
    select sibling.public_id, 0 as same_leaf
    from target_category
    join public.public_retail_categories sibling
      on sibling.publication_id = target_category.publication_id
     and sibling.parent_public_id = target_category.parent_public_id
     and sibling.public_id <> target_category.public_id
    where target_category.parent_public_id is not null
  ), ranked as (
    select candidate as product_row,
      candidate_category.same_leaf,
      (
        select count(*)::integer
        from jsonb_array_elements(target.specifications) target_specification(value)
        where exists (
          select 1
          from jsonb_array_elements(candidate.specifications) candidate_specification(value)
          where candidate_specification.value->>'key' = target_specification.value->>'key'
            and candidate_specification.value->>'value' = target_specification.value->>'value'
        )
      ) as shared_specifications,
      candidate.sort_order,
      candidate.name_ru,
      candidate.public_id
    from target
    join candidate_categories candidate_category on true
    join public.public_retail_products candidate
      on candidate.publication_id = target.publication_id
     and candidate.category_public_id = candidate_category.public_id
     and candidate.public_id <> target.public_id
    order by same_leaf desc, shared_specifications desc,
      candidate.sort_order, candidate.name_ru, candidate.public_id
    limit p_limit
  )
  select coalesce(jsonb_agg(
    public.build_public_retail_product_summary(ranked.product_row, p_locale)
    order by ranked.same_leaf desc, ranked.shared_specifications desc,
      ranked.sort_order, ranked.name_ru, ranked.public_id
  ), '[]'::jsonb)
  into result
  from ranked;

  return result;
end;
$function$;

comment on function public.list_public_retail_related_products(text,text,integer) is
  'Returns at most six public-safe related products ranked by leaf category, sibling category, and shared governed specifications.';

revoke all on function public.list_public_retail_related_products(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.list_public_retail_related_products(text,text,integer)
  to anon, authenticated;

create or replace function public.list_public_retail_sitemap_inventory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with published_products as (
    select product.slug, product.category_path, publication.published_at
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
    select product.slug, product.published_at,
      coalesce((
        select jsonb_agg(jsonb_build_object('slug', path.value->>'slug') order by path.ordinal)
        from jsonb_array_elements(product.category_path) with ordinality path(value, ordinal)
        where path.value->>'slug' ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      ), '[]'::jsonb) as category_path
    from published_products product
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug', inventory.slug,
      'categoryPath', inventory.category_path,
      'lastModified', inventory.published_at
    )
    order by inventory.slug
  ), '[]'::jsonb)
  from safe_inventory inventory;
$function$;

comment on function public.list_public_retail_sitemap_inventory() is
  'Returns at most 5001 published public product slugs, public category slugs, and the authoritative publication timestamp.';

revoke all on function public.list_public_retail_sitemap_inventory()
  from public, anon, authenticated;
grant execute on function public.list_public_retail_sitemap_inventory()
  to anon, authenticated, service_role;

commit;
