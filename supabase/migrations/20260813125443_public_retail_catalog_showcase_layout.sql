begin;

create or replace function public.build_public_retail_product_summary(
  p_product public.public_retail_products, p_locale text
)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p_product.public_id, 'slug', p_product.slug, 'sku', p_product.sku,
    'name', case when p_locale = 'ro' then coalesce(p_product.name_ro, p_product.name_ru) else p_product.name_ru end,
    'shortDescription', case when p_locale = 'ro' then coalesce(p_product.short_description_ro, p_product.short_description_ru) else p_product.short_description_ru end,
    'image', case when p_product.primary_image_url is null then null else jsonb_build_object(
      'url', p_product.primary_image_url,
      'alt', case when p_locale = 'ro' then coalesce(p_product.primary_image_alt_ro, p_product.primary_image_alt_ru) else p_product.primary_image_alt_ru end
    ) end,
    'brand', case when p_product.brand is null then null else jsonb_build_object(
      'slug', p_product.brand->>'slug',
      'name', case when p_locale = 'ro' then coalesce(p_product.brand->>'nameRo', p_product.brand->>'nameRu') else p_product.brand->>'nameRu' end
    ) end,
    'category', case when jsonb_array_length(p_product.category_path) = 0 then null else jsonb_build_object(
      'slug', p_product.category_path->-1->>'slug',
      'name', case when p_locale = 'ro' then coalesce(p_product.category_path->-1->>'nameRo', p_product.category_path->-1->>'nameRu') else p_product.category_path->-1->>'nameRu' end
    ) end,
    'price', jsonb_build_object('amount', p_product.retail_price_amount, 'currency', p_product.retail_price_currency,
      'vatPresentation', p_product.vat_presentation),
    'availability', p_product.availability,
    'highlights', (select coalesce(jsonb_agg(jsonb_build_object(
      'key', value->>'key',
      'label', case when p_locale = 'ro' then coalesce(value->>'labelRo', value->>'labelRu') else value->>'labelRu' end,
      'value', value->>'value'
    )), '[]'::jsonb) from jsonb_array_elements(p_product.specification_highlights) value),
    'calculatorEligible', cardinality(p_product.calculator_profile_keys) > 0
  );
$$;

create or replace function public.list_public_retail_hot_products(
  p_locale text default 'ru', p_limit integer default 24, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_locale not in ('ru', 'ro') or p_limit not between 1 and 48
    or p_offset < 0 or p_offset > 10000 then
    raise exception 'Public Retail HOT list input is invalid.' using errcode = '22023';
  end if;

  with current_products as (
    select product from public.public_retail_products product
    join public.public_retail_publications publication on publication.id = product.publication_id
    where publication.status = 'published' and 'HOT' = any(product.merchandising_labels)
  ), page as (
    select product from current_products
    order by (product).sort_order, (product).name_ru, (product).public_id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(public.build_public_retail_product_summary(page.product, p_locale)
      order by (page.product).sort_order, (page.product).name_ru, (page.product).public_id), '[]'::jsonb),
    'totalCount', (select count(*) from current_products),
    'limit', p_limit, 'offset', p_offset
  ) into result from page;
  return coalesce(result, jsonb_build_object('items','[]'::jsonb,'totalCount',0,'limit',p_limit,'offset',p_offset));
end;
$$;

create or replace function public.get_public_retail_showcase(p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare popular jsonb; new_products jsonb; hot jsonb;
begin
  if p_locale not in ('ru', 'ro') then
    raise exception 'Public Retail showcase input is invalid.' using errcode = '22023';
  end if;
  popular := public.list_public_retail_products_v2(p_locale, null, null, null, '{}'::jsonb, 'popular', 5, 0);
  new_products := public.list_public_retail_products_v2(p_locale, null, null, null, '{}'::jsonb, 'new', 5, 0);
  hot := public.list_public_retail_hot_products(p_locale, 5, 0);
  return jsonb_build_object(
    'popular', popular->'items',
    'new', new_products->'items',
    'hot', hot->'items'
  );
end;
$$;

revoke all on function public.build_public_retail_product_summary(public.public_retail_products,text),
  public.list_public_retail_hot_products(text,integer,integer),
  public.get_public_retail_showcase(text) from public, authenticated;
grant execute on function public.list_public_retail_hot_products(text,integer,integer),
  public.get_public_retail_showcase(text) to anon, authenticated;

comment on function public.get_public_retail_showcase(text) is
  'One bounded anonymous TOP/NEW/HOT storefront aggregate over the immutable Public Retail projection.';

commit;
