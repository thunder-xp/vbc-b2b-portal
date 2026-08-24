begin;

insert into public.localization_terminology(
  source_locale,
  target_locale,
  source_term,
  localized_term,
  context
)
values
  ('ru', 'ro', 'Да', 'Da', 'technical'),
  ('ru', 'ro', 'Нет', 'Nu', 'technical'),
  ('ru', 'ro', 'Металл', 'Metal', 'technical'),
  ('ru', 'ro', 'Пластик', 'Plastic', 'technical'),
  ('ru', 'ro', 'NVR (Цифровой)', 'NVR (digital)', 'technical'),
  ('ru', 'ro', 'XVR (Гибридный)', 'XVR (hibrid)', 'technical'),
  ('ru', 'ro', 'Отсутствуют', 'Absente', 'technical')
on conflict(source_locale, target_locale, source_term, context) do update set
  localized_term = excluded.localized_term,
  is_active = true,
  updated_at = now();

create or replace function public.build_public_retail_product_summary(
  p_product public.public_retail_products,
  p_locale text
)
returns jsonb
language sql
stable
set search_path = public
as $$
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
    'price', jsonb_build_object(
      'amount', p_product.retail_price_amount,
      'currency', p_product.retail_price_currency,
      'vatPresentation', p_product.vat_presentation
    ),
    'availability', p_product.availability,
    'highlights', (select coalesce(jsonb_agg(jsonb_build_object(
      'key', value->>'key',
      'label', case when p_locale = 'ro' then coalesce(value->>'labelRo', value->>'labelRu') else value->>'labelRu' end,
      'value', case when p_locale = 'ro' then coalesce(value->>'valueRo', value->>'value') else value->>'value' end
    )), '[]'::jsonb) from jsonb_array_elements(p_product.specification_highlights) value),
    'calculatorEligible', cardinality(p_product.calculator_profile_keys) > 0
  );
$$;

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
  from public.public_retail_product_identities identity where identity.public_id = product.public_id;
  return jsonb_build_object(
    'id', product.public_id, 'slug', product.slug, 'sku', product.sku,
    'name', case when p_locale='ro' then coalesce(product.name_ro,product.name_ru) else product.name_ru end,
    'shortDescription', case when p_locale='ro' then coalesce(product.short_description_ro,product.short_description_ru) else product.short_description_ru end,
    'description', case when p_locale='ro' then coalesce(product.description_ro,product.description_ru) else product.description_ru end,
    'seoTitle', case when p_locale='ro' then product.seo_title_ro else null end,
    'seoDescription', case when p_locale='ro' then product.seo_description_ro else null end,
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
      'value',case when p_locale='ro' then coalesce(value->>'valueRo',value->>'value') else value->>'value' end,
      'filterable', exists (
        select 1 from public.catalog_product_attributes attribute
        where attribute.product_id = source_catalog_product_id and attribute.attribute_key = value->>'key'
          and attribute.is_filterable and attribute.is_visible
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

create or replace function public.merge_product_localization_into_public_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  merge_started_at timestamptz := clock_timestamp();
begin
  update public.public_retail_products snapshot set
    name_ro=coalesce(localization.localized_name,snapshot.name_ro),
    short_description_ro=coalesce(localization.short_description,snapshot.short_description_ro),
    description_ro=coalesce(localization.description,snapshot.description_ro),
    seo_title_ro=coalesce(localization.seo_title,snapshot.seo_title_ro),
    seo_description_ro=coalesce(localization.seo_description,snapshot.seo_description_ro),
    primary_image_alt_ro=coalesce(localization.localized_name,snapshot.primary_image_alt_ro,snapshot.primary_image_alt_ru),
    gallery=(select coalesce(jsonb_agg(media.value || jsonb_build_object('altRo',coalesce(localization.localized_name,media.value->>'altRu')) order by media.ordinal),'[]'::jsonb)
      from jsonb_array_elements(snapshot.gallery) with ordinality media(value,ordinal)),
    category_path=(select coalesce(jsonb_agg(path.value || jsonb_build_object('nameRo',coalesce(category_localization.localized_name,path.value->>'nameRu')) order by path.ordinal),'[]'::jsonb)
      from jsonb_array_elements(snapshot.category_path) with ordinality path(value,ordinal)
      left join public.public_retail_category_identities identity on identity.public_id=(path.value->>'id')::uuid
      left join public.category_localizations category_localization on category_localization.category_id=identity.source_category_id
        and category_localization.locale='ro' and category_localization.translation_status in ('machine_draft','reviewed')
        and category_localization.source_hash=public.category_localization_source_hash(identity.source_category_id)),
    specifications=(select coalesce(jsonb_agg(spec.value || jsonb_build_object(
        'labelRo',coalesce(label_term.localized_term,spec.value->>'labelRu'),
        'valueRo',coalesce(value_term.localized_term,spec.value->>'value')
      ) order by spec.ordinal),'[]'::jsonb)
      from jsonb_array_elements(snapshot.specifications) with ordinality spec(value,ordinal)
      left join public.localization_terminology label_term on label_term.source_locale='ru' and label_term.target_locale='ro'
        and label_term.source_term=spec.value->>'labelRu' and label_term.context='technical' and label_term.is_active
      left join public.localization_terminology value_term on value_term.source_locale='ru' and value_term.target_locale='ro'
        and value_term.source_term=spec.value->>'value' and value_term.context='technical' and value_term.is_active),
    specification_highlights=(select coalesce(jsonb_agg(spec.value || jsonb_build_object(
        'labelRo',coalesce(label_term.localized_term,spec.value->>'labelRu'),
        'valueRo',coalesce(value_term.localized_term,spec.value->>'value')
      ) order by spec.ordinal),'[]'::jsonb)
      from jsonb_array_elements(snapshot.specification_highlights) with ordinality spec(value,ordinal)
      left join public.localization_terminology label_term on label_term.source_locale='ru' and label_term.target_locale='ro'
        and label_term.source_term=spec.value->>'labelRu' and label_term.context='technical' and label_term.is_active
      left join public.localization_terminology value_term on value_term.source_locale='ru' and value_term.target_locale='ro'
        and value_term.source_term=spec.value->>'value' and value_term.context='technical' and value_term.is_active),
    search_document=concat_ws(' ',snapshot.search_document,localization.localized_name,localization.short_description,localization.description)
  from new_product_rows inserted
  join public.public_retail_product_identities identity on identity.public_id=inserted.public_id
  left join public.product_localizations localization on localization.product_id=identity.source_product_id and localization.locale='ro'
    and localization.translation_status in ('machine_draft','reviewed')
    and localization.source_hash=public.product_localization_source_hash(identity.source_product_id)
  where snapshot.publication_id=inserted.publication_id and snapshot.public_id=inserted.public_id;
  update public.public_retail_publications publication set
    localization_merge_duration_ms = publication.localization_merge_duration_ms
      + greatest(0, extract(milliseconds from clock_timestamp()-merge_started_at)::integer)
  where publication.id in (select distinct publication_id from new_product_rows);
  return null;
end;
$$;

revoke all on function public.build_public_retail_product_summary(public.public_retail_products,text),
  public.get_public_retail_product(text,text),
  public.merge_product_localization_into_public_snapshot()
from public, anon, authenticated;

grant execute on function public.get_public_retail_product(text,text) to anon, authenticated;

comment on function public.get_public_retail_product(text,text) is
  'Returns one public-safe localized retail product while preserving authoritative raw specification filter values.';

commit;
