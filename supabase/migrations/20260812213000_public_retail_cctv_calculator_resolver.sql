create index if not exists public_retail_products_calculator_profiles_idx
  on public.public_retail_products using gin (calculator_profile_keys);

create or replace function public.resolve_public_retail_calculator_products(
  p_profile_keys text[],
  p_locale text default 'ru'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_locale not in ('ru', 'ro')
    or coalesce(cardinality(p_profile_keys), 0) < 1
    or cardinality(p_profile_keys) > 30
    or exists (
      select 1 from unnest(p_profile_keys) profile_key
      where profile_key !~ '^cctv\.[a-z0-9]+(?:\.[a-z0-9]+)*$'
        or char_length(profile_key) > 100
    ) then
    raise exception 'Public CCTV calculator input is invalid.' using errcode = '22023';
  end if;

  with requested as (
    select profile_key, min(ordinality)::integer ordinality
    from unnest(p_profile_keys) with ordinality request(profile_key, ordinality)
    group by profile_key
  ), resolved as (
    select requested.profile_key, requested.ordinality,
      count(product.public_id)::integer match_count,
      (jsonb_agg(jsonb_build_object(
        'id', product.public_id,
        'slug', product.slug,
        'sku', product.sku,
        'name', case when p_locale = 'ro' then coalesce(product.name_ro, product.name_ru) else product.name_ru end,
        'shortDescription', case when p_locale = 'ro' then coalesce(product.short_description_ro, product.short_description_ru) else product.short_description_ru end,
        'image', case when product.primary_image_url is null then null else jsonb_build_object(
          'url', product.primary_image_url,
          'alt', case when p_locale = 'ro' then coalesce(product.primary_image_alt_ro, product.primary_image_alt_ru) else product.primary_image_alt_ru end
        ) end,
        'brand', case when product.brand is null then null else jsonb_build_object(
          'slug', product.brand->>'slug',
          'name', case when p_locale = 'ro' then coalesce(product.brand->>'nameRo', product.brand->>'nameRu') else product.brand->>'nameRu' end
        ) end,
        'category', case when category.public_id is null then null else jsonb_build_object(
          'slug', category.slug,
          'name', case when p_locale = 'ro' then coalesce(category.name_ro, category.name_ru) else category.name_ru end
        ) end,
        'price', jsonb_build_object(
          'amount', product.retail_price_amount,
          'currency', product.retail_price_currency,
          'vatPresentation', product.vat_presentation
        ),
        'availability', product.availability,
        'highlights', (select coalesce(jsonb_agg(jsonb_build_object(
          'key', value->>'key',
          'label', case when p_locale = 'ro' then coalesce(value->>'labelRo', value->>'labelRu') else value->>'labelRu' end,
          'value', value->>'value'
        ) order by ordinal), '[]'::jsonb)
          from jsonb_array_elements(product.specification_highlights) with ordinality highlight(value, ordinal)),
        'calculatorEligible', true
      ) order by product.public_id) filter (where product.public_id is not null))->0 product
    from requested
    left join public.public_retail_publications publication on publication.status = 'published'
    left join public.public_retail_products product
      on product.publication_id = publication.id
     and requested.profile_key = any(product.calculator_profile_keys)
    left join public.public_retail_categories category
      on category.publication_id = product.publication_id
     and category.public_id = product.category_public_id
    group by requested.profile_key, requested.ordinality
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'profileKey', profile_key,
    'matchCount', match_count,
    'product', case when match_count = 1 then product else null end
  ) order by ordinality), '[]'::jsonb)
  into result
  from resolved;

  return result;
end;
$$;

revoke all on function public.resolve_public_retail_calculator_products(text[], text)
  from public, authenticated;
grant execute on function public.resolve_public_retail_calculator_products(text[], text)
  to anon, service_role;

comment on function public.resolve_public_retail_calculator_products(text[], text) is
  'Resolves a bounded set of governed CCTV profile keys exclusively against the current published Public Retail snapshot.';
