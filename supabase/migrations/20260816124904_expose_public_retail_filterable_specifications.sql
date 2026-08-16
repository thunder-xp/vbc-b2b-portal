begin;

create or replace function public.get_public_retail_product(p_slug text, p_locale text default 'ru')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  product public.public_retail_products;
  source_catalog_product_id uuid;
begin
  if p_locale not in ('ru','ro') or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_slug) > 160 then
    raise exception 'Public Retail product input is invalid.' using errcode = '22023';
  end if;

  select snapshot.* into product
  from public.public_retail_products snapshot
  join public.public_retail_publications publication on publication.id = snapshot.publication_id
  where publication.status = 'published' and snapshot.slug = p_slug;
  if product.public_id is null then return null; end if;

  select identity.source_product_id into source_catalog_product_id
  from public.public_retail_product_identities identity
  where identity.public_id = product.public_id;

  return jsonb_build_object(
    'id', product.public_id, 'slug', product.slug, 'sku', product.sku,
    'name', case when p_locale='ro' then coalesce(product.name_ro,product.name_ru) else product.name_ru end,
    'shortDescription', case when p_locale='ro' then coalesce(product.short_description_ro,product.short_description_ru) else product.short_description_ru end,
    'description', case when p_locale='ro' then coalesce(product.description_ro,product.description_ru) else product.description_ru end,
    'categoryPath', (select coalesce(jsonb_agg(jsonb_build_object(
      'id',value->>'id','slug',value->>'slug',
      'name',case when p_locale='ro' then coalesce(value->>'nameRo',value->>'nameRu') else value->>'nameRu' end
    ) order by ordinal), '[]'::jsonb) from jsonb_array_elements(product.category_path) with ordinality path(value,ordinal)),
    'brand', case when product.brand is null then null else jsonb_build_object(
      'slug',product.brand->>'slug','name',case when p_locale='ro' then coalesce(product.brand->>'nameRo',product.brand->>'nameRu') else product.brand->>'nameRu' end) end,
    'price', jsonb_build_object('amount',product.retail_price_amount,'currency',product.retail_price_currency,'vatPresentation',product.vat_presentation),
    'availability', product.availability,
    'image', case when product.primary_image_url is null then null else jsonb_build_object('url',product.primary_image_url,
      'alt',case when p_locale='ro' then coalesce(product.primary_image_alt_ro,product.primary_image_alt_ru) else product.primary_image_alt_ru end) end,
    'gallery', (select coalesce(jsonb_agg(jsonb_build_object('url',value->>'url',
      'alt',case when p_locale='ro' then coalesce(value->>'altRo',value->>'altRu') else value->>'altRu' end)
      order by ordinal), '[]'::jsonb) from jsonb_array_elements(product.gallery) with ordinality media(value,ordinal)),
    'specifications', (select coalesce(jsonb_agg(jsonb_build_object(
      'key',value->>'key',
      'label',case when p_locale='ro' then coalesce(value->>'labelRo',value->>'labelRu') else value->>'labelRu' end,
      'value',value->>'value',
      'filterable', exists (
        select 1
        from public.catalog_product_attributes attribute
        where attribute.product_id = source_catalog_product_id
          and attribute.attribute_key = value->>'key'
          and attribute.is_filterable
          and attribute.is_visible
          and attribute.resolution_status in ('not_required', 'resolved')
          and coalesce(attribute.resolved_display_value, attribute.display_value) = value->>'value'
      )
    ) order by ordinal), '[]'::jsonb)
      from jsonb_array_elements(product.specifications) with ordinality specification(value,ordinal)
      where lower(btrim(coalesce(value->>'key',''))) <> 'datasheeturl'
        and lower(btrim(coalesce(value->>'labelRu',''))) <> 'datasheeturl'),
    'datasheet', case when product.datasheet_url is null then null
      else jsonb_build_object('type','datasheet','url',product.datasheet_url) end,
    'calculatorEligible', cardinality(product.calculator_profile_keys)>0
  );
end;
$$;

revoke all on function public.get_public_retail_product(text,text) from public;
revoke all on function public.get_public_retail_product(text,text) from anon, authenticated;
grant execute on function public.get_public_retail_product(text,text) to anon, authenticated;

comment on function public.get_public_retail_product(text,text) is
  'Returns one public-safe retail product and marks only governed catalog attributes as filterable.';

commit;
