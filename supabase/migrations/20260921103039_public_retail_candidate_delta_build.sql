-- Avoid deterministic full rebuilds for zero source deltas and remove candidate write amplification.
-- The active immutable generation remains readable until atomic publication of a successful replacement.
begin;

create extension if not exists btree_gin with schema extensions;

alter table public.public_retail_publications
  drop constraint public_retail_publications_status_check;
alter table public.public_retail_publications
  add constraint public_retail_publications_status_check
  check (status in ('building', 'published', 'failed', 'superseded', 'no_op'));

CREATE OR REPLACE FUNCTION public.hydrate_inserted_public_retail_product_presentation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare target_publication_id uuid;
begin
  if current_setting('app.public_retail_candidate_prepared', true) = 'on' then
    return null;
  end if;
  for target_publication_id in
    select distinct inserted.publication_id from inserted_public_retail_products inserted
  loop
    perform public.hydrate_public_retail_product_presentation(target_publication_id);
  end loop;
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.merge_product_localization_into_public_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  merge_started_at timestamptz := clock_timestamp();
begin
  if current_setting('app.public_retail_candidate_prepared', true) = 'on' then
    return null;
  end if;
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
$function$
;
CREATE OR REPLACE FUNCTION public.merge_category_localization_into_public_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare merge_started_at timestamptz := clock_timestamp();
begin
  if current_setting('app.public_retail_candidate_prepared', true) = 'on' then
    return null;
  end if;
  update public.public_retail_categories snapshot set
    name_ro=localization.localized_name,description_ro=localization.intro,
    seo_title_ro=localization.seo_title,seo_description_ro=localization.seo_description
  from new_category_rows inserted
  join public.public_retail_category_identities identity on identity.public_id=inserted.public_id
  join public.category_localizations localization on localization.category_id=identity.source_category_id and localization.locale='ro'
    and localization.translation_status in ('machine_draft','reviewed')
    and localization.source_hash=public.category_localization_source_hash(identity.source_category_id)
  where snapshot.publication_id=inserted.publication_id and snapshot.public_id=inserted.public_id;
  update public.public_retail_publications publication set
    localization_merge_duration_ms = publication.localization_merge_duration_ms
      + greatest(0, extract(milliseconds from clock_timestamp()-merge_started_at)::integer)
  where publication.id in (select distinct publication_id from new_category_rows);
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.merge_terminology_into_public_facets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare merge_started_at timestamptz := clock_timestamp();
begin
  if current_setting('app.public_retail_candidate_prepared', true) = 'on' then
    return null;
  end if;
  update public.public_retail_facets snapshot set label_ro=term.localized_term
  from new_facet_rows inserted
  join public.localization_terminology term on term.source_locale='ru' and term.target_locale='ro'
    and term.source_term=inserted.label_ru and term.context='technical' and term.is_active
  where snapshot.publication_id=inserted.publication_id and snapshot.category_public_id=inserted.category_public_id
    and snapshot.facet_key=inserted.facet_key;
  update public.public_retail_publications publication set
    localization_merge_duration_ms = publication.localization_merge_duration_ms
      + greatest(0, extract(milliseconds from clock_timestamp()-merge_started_at)::integer)
  where publication.id in (select distinct publication_id from new_facet_rows);
  return null;
end;
$function$
;

create index public_retail_products_publication_search_idx
  on public.public_retail_products using gin (
    publication_id extensions.uuid_ops,
    (lower(search_document)) extensions.gin_trgm_ops
  );
drop index public.public_retail_products_search_idx;

CREATE OR REPLACE FUNCTION public.build_public_retail_candidate(p_publication_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '8s'
AS $function$
declare
  target public.public_retail_publications;
  started timestamptz := clock_timestamp();
  source_count integer;
  eligible_count integer;
  missing_retail integer;
  missing_image integer;
  missing_category integer;
  structured_specs integer;
  source_snapshot timestamptz;
  candidate_checksum text;
  active_publication public.public_retail_publications;
  product_delta jsonb;
  no_change boolean := false;
  result_publication_id uuid := p_publication_id;
begin
  select * into target from public.public_retail_publications
  where id = p_publication_id for update;
  if target.id is null or target.status <> 'building' then
    raise exception 'Public Retail publication is not buildable.' using errcode = '22023';
  end if;

  create temporary table retail_candidate_products
    (like public.public_retail_products including defaults) on commit drop;
  create temporary table retail_candidate_categories
    (like public.public_retail_categories including defaults) on commit drop;
  create temporary table retail_candidate_facets
    (like public.public_retail_facets including defaults) on commit drop;

  insert into public.public_retail_product_identities(source_product_id)
  select product.id from public.catalog_products product
  where product.is_active and product.is_visible
  on conflict (source_product_id) do nothing;
  insert into public.public_retail_category_identities(source_category_id)
  select category.id from public.catalog_categories category where category.is_active
  on conflict (source_category_id) do nothing;

  select count(*)::integer into source_count
  from public.catalog_products product where product.is_active and product.is_visible;

  select count(*)::integer into missing_retail
  from public.catalog_products product
  where product.is_active and product.is_visible and not exists (
    select 1 from public.product_prices price
    join public.price_types price_type on price_type.id = price.price_type_id
    where price.product_id = product.id and price.company_id is null
      and price_type.external_code = 'UU-000020'
      and price.is_active and price.is_published and price.currency_status = 'resolved'
      and price.price_amount > 0 and price.valid_from <= now()
      and (price.valid_to is null or price.valid_to >= now())
  );

  with recursive category_path as (
    select category.id, category.parent_id, identity.public_id,
      jsonb_build_array(jsonb_build_object('id', identity.public_id, 'slug', category.slug,
        'nameRu', category.name, 'nameRo', null)) path
    from public.catalog_categories category
    join public.public_retail_category_identities identity on identity.source_category_id = category.id
    where category.is_active and category.parent_id is null
    union all
    select child.id, child.parent_id, identity.public_id,
      parent.path || jsonb_build_object('id', identity.public_id, 'slug', child.slug,
        'nameRu', child.name, 'nameRo', null)
    from public.catalog_categories child
    join category_path parent on parent.id = child.parent_id
    join public.public_retail_category_identities identity on identity.source_category_id = child.id
    where child.is_active
  ), eligible as (
    select product.*, product_identity.public_id, category_path.public_id category_public_id, category_path.path,
      case when brand.id is null then null else jsonb_build_object(
        'slug', brand.slug, 'nameRu', brand.name, 'nameRo', null) end brand_json,
      retail.price_amount, upper(retail.currency) price_currency, retail.effective_at,
      case
        when stock.freshness_state is distinct from 'authoritative' then 'unknown'
        when stock.available_quantity > 5 then 'in_stock'
        when stock.available_quantity > 0 then 'low_stock'
        when arrival.product_id is not null then 'available_to_order'
        else 'unavailable'
      end availability_state,
      case
        when public.is_safe_public_retail_media_url(product.image_source_url) then product.image_source_url
        when public.is_safe_public_retail_media_url(product.image_url) then product.image_url
        else image.url
      end primary_image
    from public.catalog_products product
    join public.public_retail_product_identities product_identity on product_identity.source_product_id = product.id
    left join category_path on category_path.id = product.category_id
    left join public.catalog_brands brand on brand.id = product.brand_id and brand.is_active
    join lateral (
      select price.price_amount, price.currency,
        coalesce(price.effective_at, price.valid_from) effective_at
      from public.product_prices price
      join public.price_types price_type on price_type.id = price.price_type_id
      where price.product_id = product.id and price.company_id is null
        and price_type.external_code = 'UU-000020'
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and price.price_amount > 0 and price.valid_from <= now()
        and (price.valid_to is null or price.valid_to >= now())
      order by coalesce(price.effective_at, price.valid_from) desc, price.id
      limit 1
    ) retail on true
    left join public.product_stock_totals stock on stock.product_id = product.id and stock.is_published
    left join lateral (
      select candidate.product_id from public.product_supplier_arrivals candidate
      where candidate.product_id = product.id and candidate.is_published
        and candidate.expected_quantity > 0 and candidate.expected_arrival_date >= current_date
      order by candidate.expected_arrival_date limit 1
    ) arrival on true
    left join lateral (
      select media.url from public.catalog_product_images media
      where media.product_id = product.id and public.is_safe_public_retail_media_url(media.url)
      order by media.is_primary desc, media.sort_order, media.id limit 1
    ) image on true
    where product.is_active and product.is_visible
  ), projected as (
    select eligible.*,
      coalesce((select jsonb_agg(jsonb_build_object(
        'key', attribute.attribute_key, 'labelRu', attribute.label, 'labelRo', null,
        'value', coalesce(attribute.resolved_display_value, attribute.display_value)
      ) order by attribute.label, attribute.attribute_key)
      from public.catalog_product_attributes attribute
      where attribute.product_id = eligible.id and attribute.is_visible
        and attribute.resolution_status in ('not_required', 'resolved')
        and coalesce(attribute.resolved_display_value, attribute.display_value) <> ''), '[]'::jsonb) specs,
      coalesce((select jsonb_agg(jsonb_build_object(
        'url', media.url, 'altRu', coalesce(media.alt_text, eligible.name), 'altRo', null
      ) order by media.is_primary desc, media.sort_order, media.id)
      from public.catalog_product_images media
      where media.product_id = eligible.id and public.is_safe_public_retail_media_url(media.url)), '[]'::jsonb) gallery_json,
      coalesce((select array_agg(profile.profile_key order by profile.profile_key)
      from public.estimate_generator_calculator_profiles profile
      where profile.catalog_product_id = eligible.id and profile.is_active), array[]::text[]) calculator_keys
    from eligible
  )
  insert into pg_temp.retail_candidate_products (
    publication_id, public_id, slug, sku, name_ru, name_ro,
    short_description_ru, short_description_ro, description_ru, description_ro,
    category_public_id, category_path, brand, retail_price_amount,
    retail_price_currency, retail_price_effective_at, vat_presentation, availability,
    primary_image_url, primary_image_alt_ru, primary_image_alt_ro,
    specification_highlights, specifications, gallery, calculator_profile_keys,
    search_document, sort_order
  )
  select p_publication_id, projected.public_id, projected.slug, projected.sku,
    projected.name, null, projected.short_description, null,
    coalesce(projected.full_description, projected.description), null,
    projected.category_public_id, coalesce(projected.path, '[]'::jsonb), projected.brand_json,
    projected.price_amount, projected.price_currency, projected.effective_at,
    'not_specified', projected.availability_state,
    case when public.is_safe_public_retail_media_url(projected.primary_image) then projected.primary_image end,
    projected.name, null,
    (select coalesce(jsonb_agg(value), '[]'::jsonb) from (
      select value from jsonb_array_elements(projected.specs) value limit 3
    ) highlights), projected.specs, projected.gallery_json, projected.calculator_keys,
    concat_ws(' ', projected.sku, projected.name, projected.short_description,
      projected.brand_json->>'nameRu', projected.path::text), projected.sort_order
  from projected;

  get diagnostics eligible_count = row_count;

  update pg_temp.retail_candidate_products product
  set merchandising_labels = coalesce(source.labels, array[]::text[]),
    popular_priority = source.popular_priority,
    new_priority = source.new_priority,
    new_started_at = source.new_started_at,
    special_offer_priority = source.special_offer_priority,
    datasheet_url = source.datasheet_url,
    specifications = source.safe_specifications,
    specification_highlights = source.safe_highlights
  from (
    select inserted.publication_id, inserted.public_id,
      coalesce(labels.labels, array[]::text[]) labels,
      labels.popular_priority, labels.new_priority, labels.new_started_at,
      labels.special_offer_priority,
      case when datasheet.url ~* '^https://(materialfile\.dahuasecurity\.com|www\.dahuasecurity\.com)/[^?#]*\.pdf([?#].*)?$'
        and char_length(datasheet.url) <= 2000 then datasheet.url end datasheet_url,
      coalesce(specifications.value, '[]'::jsonb) safe_specifications,
      coalesce(highlights.value, '[]'::jsonb) safe_highlights
    from pg_temp.retail_candidate_products inserted
    join public.public_retail_product_identities identity on identity.public_id = inserted.public_id
    left join lateral (
      select array_agg(assignment.label_code order by assignment.priority desc, assignment.label_code) labels,
        max(assignment.priority) filter (where assignment.label_code = 'TOP') popular_priority,
        max(assignment.priority) filter (where assignment.label_code = 'NEW') new_priority,
        max(assignment.starts_at) filter (where assignment.label_code = 'NEW') new_started_at,
        max(assignment.priority) filter (where assignment.label_code = 'SPECIAL_OFFER') special_offer_priority
      from public.product_merchandising_assignments assignment
      where assignment.product_id = identity.source_product_id
        and assignment.source in ('manual', 'one_c') and assignment.is_active
        and assignment.is_curated_visible and assignment.revoked_at is null
        and assignment.starts_at <= now() and (assignment.ends_at is null or assignment.ends_at > now())
    ) labels on true
    left join lateral (
      select specification->>'value' url from jsonb_array_elements(inserted.specifications) specification
      where lower(btrim(coalesce(specification->>'key', ''))) = 'datasheeturl'
        or lower(btrim(coalesce(specification->>'labelRu', ''))) = 'datasheeturl' limit 1
    ) datasheet on true
    left join lateral (
      select jsonb_agg(specification order by ordinal) value
      from jsonb_array_elements(inserted.specifications) with ordinality item(specification, ordinal)
      where lower(btrim(coalesce(specification->>'key', ''))) <> 'datasheeturl'
        and lower(btrim(coalesce(specification->>'labelRu', ''))) <> 'datasheeturl'
    ) specifications on true
    left join lateral (
      select jsonb_agg(specification order by ordinal) value from (
        select specification, ordinal
        from jsonb_array_elements(inserted.specifications) with ordinality item(specification, ordinal)
        where lower(btrim(coalesce(specification->>'key', ''))) <> 'datasheeturl'
          and lower(btrim(coalesce(specification->>'labelRu', ''))) <> 'datasheeturl'
        order by ordinal limit 3
      ) safe
    ) highlights on true
    where inserted.publication_id = p_publication_id
  ) source
  where product.publication_id = source.publication_id and product.public_id = source.public_id;
  update pg_temp.retail_candidate_products snapshot set
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
  from pg_temp.retail_candidate_products inserted
  join public.public_retail_product_identities identity on identity.public_id=inserted.public_id
  left join public.product_localizations localization on localization.product_id=identity.source_product_id and localization.locale='ro'
    and localization.translation_status in ('machine_draft','reviewed')
    and localization.source_hash=public.product_localization_source_hash(identity.source_product_id)
  where snapshot.publication_id=inserted.publication_id and snapshot.public_id=inserted.public_id;


  insert into pg_temp.retail_candidate_categories (
    publication_id, public_id, parent_public_id, slug, name_ru, name_ro,
    description_ru, description_ro, sort_order, product_count
  )
  select p_publication_id, identity.public_id, parent_identity.public_id, category.slug,
    category.name, null, category.description, null, category.sort_order,
    count(product.public_id)::integer
  from public.catalog_categories category
  join public.public_retail_category_identities identity on identity.source_category_id = category.id
  left join public.public_retail_category_identities parent_identity on parent_identity.source_category_id = category.parent_id
  join pg_temp.retail_candidate_products product
    on product.publication_id = p_publication_id
   and exists (select 1 from jsonb_array_elements(product.category_path) path where path->>'id' = identity.public_id::text)
  where category.is_active
  group by identity.public_id, parent_identity.public_id, category.slug, category.name,
    category.description, category.sort_order;

  update pg_temp.retail_candidate_categories snapshot set
    name_ro=localization.localized_name,description_ro=localization.intro,
    seo_title_ro=localization.seo_title,seo_description_ro=localization.seo_description
  from pg_temp.retail_candidate_categories inserted
  join public.public_retail_category_identities identity on identity.public_id=inserted.public_id
  join public.category_localizations localization on localization.category_id=identity.source_category_id and localization.locale='ro'
    and localization.translation_status in ('machine_draft','reviewed')
    and localization.source_hash=public.category_localization_source_hash(identity.source_category_id)
  where snapshot.publication_id=inserted.publication_id and snapshot.public_id=inserted.public_id;

  insert into pg_temp.retail_candidate_facets (
    publication_id, category_public_id, facet_key, label_ru, label_ro,
    values, coverage, sort_order
  )
  select p_publication_id, attribute.category_public_id, attribute.attribute_key,
    min(attribute.label), null,
    jsonb_agg(jsonb_build_object('value', attribute.display_value, 'count', attribute.product_count)
      order by attribute.product_count desc, attribute.display_value),
    sum(attribute.product_count)::integer, 0
  from (
    select projected.category_public_id, source.attribute_key, source.label,
      coalesce(source.resolved_display_value, source.display_value) display_value,
      count(distinct projected.public_id)::integer product_count
    from pg_temp.retail_candidate_products projected
    join public.public_retail_product_identities identity on identity.public_id = projected.public_id
    join public.catalog_product_attributes source on source.product_id = identity.source_product_id
    where projected.publication_id = p_publication_id and source.is_filterable and source.is_visible
      and projected.category_public_id is not null
      and source.resolution_status in ('not_required', 'resolved')
      and coalesce(source.resolved_display_value, source.display_value) <> ''
    group by projected.category_public_id, source.attribute_key, source.label,
      coalesce(source.resolved_display_value, source.display_value)
  ) attribute
  group by attribute.category_public_id, attribute.attribute_key
  having count(*) between 2 and 30;

  update pg_temp.retail_candidate_facets snapshot set label_ro=term.localized_term
  from pg_temp.retail_candidate_facets inserted
  join public.localization_terminology term on term.source_locale='ru' and term.target_locale='ro'
    and term.source_term=inserted.label_ru and term.context='technical' and term.is_active
  where snapshot.publication_id=inserted.publication_id and snapshot.category_public_id=inserted.category_public_id
    and snapshot.facet_key=inserted.facet_key;

  select count(*)::integer into missing_image from pg_temp.retail_candidate_products
  where publication_id = p_publication_id and primary_image_url is null;
  select count(*)::integer into missing_category from pg_temp.retail_candidate_products
  where publication_id = p_publication_id and category_public_id is null;
  select count(*)::integer into structured_specs from pg_temp.retail_candidate_products
  where publication_id = p_publication_id and jsonb_array_length(specifications) > 0;
  select greatest(
    coalesce((select max(updated_at) from public.catalog_products), '-infinity'::timestamptz),
    coalesce((select max(updated_at) from public.product_prices where is_published), '-infinity'::timestamptz),
    coalesce((select max(synced_at) from public.product_stock_totals where is_published), '-infinity'::timestamptz)
  ) into source_snapshot;
  select encode(extensions.digest(coalesce(string_agg(snapshot.payload, '|' order by snapshot.kind, snapshot.identity), ''), 'sha256'), 'hex')
  into candidate_checksum from (
    select 'category' kind, category.public_id::text identity,
      (to_jsonb(category) - 'publication_id')::text payload
    from pg_temp.retail_candidate_categories category where category.publication_id = p_publication_id
    union all
    select 'product', product.public_id::text,
      (to_jsonb(product) - 'publication_id')::text
    from pg_temp.retail_candidate_products product where product.publication_id = p_publication_id
    union all
    select 'facet', coalesce(facet.category_public_id::text, 'all') || ':' || facet.facet_key,
      (to_jsonb(facet) - 'publication_id')::text
    from pg_temp.retail_candidate_facets facet where facet.publication_id = p_publication_id
  ) snapshot;


  select * into active_publication
  from public.public_retail_publications where status = 'published';

  select jsonb_build_object(
    'inserted', count(*) filter (where previous.public_id is null),
    'updated', count(*) filter (where previous.public_id is not null and desired.public_id is not null
      and (to_jsonb(previous) - 'publication_id') is distinct from
        (to_jsonb(desired) - 'publication_id')),
    'removed', count(*) filter (where desired.public_id is null),
    'unchanged', count(*) filter (where previous.public_id is not null and desired.public_id is not null
      and (to_jsonb(previous) - 'publication_id') is not distinct from
        (to_jsonb(desired) - 'publication_id'))
  ) into product_delta
  from pg_temp.retail_candidate_products desired
  full join (
    select * from public.public_retail_products
    where publication_id = active_publication.id
  ) previous on previous.public_id = desired.public_id;

  no_change := active_publication.id is not null
    and active_publication.checksum_sha256 = candidate_checksum;

  if no_change then
    result_publication_id := active_publication.id;
  else
    perform set_config('app.public_retail_candidate_prepared', 'on', true);
    insert into public.public_retail_products select * from pg_temp.retail_candidate_products;
    insert into public.public_retail_categories select * from pg_temp.retail_candidate_categories;
    insert into public.public_retail_facets select * from pg_temp.retail_candidate_facets;
    perform set_config('app.public_retail_candidate_prepared', 'off', true);
  end if;

  update public.public_retail_publications set
    status = case when no_change then 'no_op' else 'building' end,
    checksum_sha256 = candidate_checksum,
    source_product_count = source_count,
    eligible_product_count = eligible_count,
    excluded_product_count = source_count - eligible_count,
    missing_retail_count = missing_retail,
    missing_image_count = missing_image,
    missing_category_count = missing_category,
    products_with_structured_specs = structured_specs,
    source_snapshot_at = nullif(source_snapshot, '-infinity'::timestamptz),
    build_duration_ms = greatest(0, extract(milliseconds from clock_timestamp() - started)::integer)
  where id = p_publication_id;

  insert into public.public_retail_publication_events(publication_id,event_type,safe_evidence)
  values(p_publication_id,'built',jsonb_build_object('sourceProducts',source_count,
    'eligibleProducts',eligible_count,'excludedProducts',source_count-eligible_count,
    'noOp',no_change,'productDelta',product_delta,'activePublicationId',result_publication_id));

  return jsonb_build_object(
    'publicationId', result_publication_id,
    'candidatePublicationId', p_publication_id,
    'noOp', no_change,
    'productDelta', product_delta,
    'sourceProducts', source_count,
    'eligibleProducts', eligible_count,
    'excludedProducts', source_count - eligible_count,
    'missingRetail', missing_retail,
    'missingImage', missing_image,
    'missingCategory', missing_category,
    'productsWithStructuredSpecifications', structured_specs,
    'checksum', candidate_checksum
  );
exception when others then
  update public.public_retail_publications set status = 'failed', failed_at = now(),
    safe_error = left(sqlstate || ': ' || sqlerrm, 500),
    build_duration_ms = greatest(0, extract(milliseconds from clock_timestamp() - started)::integer)
  where id = p_publication_id and status = 'building';
  if exists (select 1 from public.public_retail_publications where id = p_publication_id) then
    insert into public.public_retail_publication_events(publication_id,event_type,safe_evidence)
    values(p_publication_id,'failed',jsonb_build_object('sqlstate',sqlstate));
  end if;
  return jsonb_build_object('publicationId', p_publication_id, 'failed', true, 'sqlstate', sqlstate);
end;
$function$
;

create or replace function public.complete_catalog_synchronization_source(
  p_source_sync_id uuid,
  p_source_domain text,
  p_changed_counts jsonb default '{}'::jsonb,
  p_source_duration_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.catalog_synchronization_runs;
  changed boolean := false;
  skip_public_projection boolean := false;
begin
  if jsonb_typeof(coalesce(p_changed_counts, '{}'::jsonb)) <> 'object'
    or (p_source_duration_ms is not null and p_source_duration_ms < 0) then
    raise exception 'Invalid catalog synchronization completion.' using errcode = '22023';
  end if;

  skip_public_projection := (
    p_source_domain = 'prices'
    and jsonb_typeof(p_changed_counts -> 'prices') = 'number'
    and jsonb_typeof(p_changed_counts -> 'deactivated') = 'number'
    and (p_changed_counts ->> 'prices')::numeric = 0
    and (p_changed_counts ->> 'deactivated')::numeric = 0
  ) or (
    p_source_domain = 'stock'
    and jsonb_typeof(p_changed_counts -> 'stockRows') = 'number'
    and jsonb_typeof(p_changed_counts -> 'deactivated') = 'number'
    and jsonb_typeof(p_changed_counts -> 'arrivalRows') = 'number'
    and (p_changed_counts ->> 'stockRows')::numeric = 0
    and (p_changed_counts ->> 'deactivated')::numeric = 0
    and (p_changed_counts ->> 'arrivalRows')::numeric = 0
  );

  perform pg_advisory_xact_lock(
    hashtextextended('catalog_sync:' || p_source_domain || ':' || p_source_sync_id::text, 0)
  );

  update public.catalog_synchronization_runs
  set source_status = 'succeeded',
    b2b_projection_status = 'succeeded',
    source_completed_at = coalesce(source_completed_at, now()),
    source_duration_ms = coalesce(p_source_duration_ms, source_duration_ms),
    changed_counts = coalesce(p_changed_counts, '{}'::jsonb),
    public_retail_projection_status = case
      when skip_public_projection then 'skipped'
      else public_retail_projection_status
    end,
    public_retail_publication_status = case
      when skip_public_projection then 'skipped'
      else public_retail_publication_status
    end,
    overall_status = case
      when skip_public_projection then 'succeeded'
      else overall_status
    end,
    finished_at = case
      when skip_public_projection then now()
      else finished_at
    end,
    next_projection_attempt_at = case
      when skip_public_projection then null
      else next_projection_attempt_at
    end,
    safe_error_code = case
      when skip_public_projection then null
      else safe_error_code
    end,
    updated_at = now()
  where source_domain = p_source_domain
    and source_sync_id = p_source_sync_id
    and source_status = 'running'
  returning * into target;

  changed := found;
  if not changed then
    select * into target
    from public.catalog_synchronization_runs
    where source_domain = p_source_domain
      and source_sync_id = p_source_sync_id;
  end if;

  if target.id is null then
    raise exception 'Catalog synchronization run is not registered.' using errcode = '22023';
  end if;

  if changed then
    insert into public.catalog_synchronization_events(
      synchronization_run_id,
      event_type,
      safe_evidence
    ) values (
      target.id,
      'source_succeeded',
      jsonb_build_object(
        'changedCounts', target.changed_counts,
        'publicProjectionSkipped', skip_public_projection
      )
    );
  end if;

  return jsonb_build_object(
    'runId', target.id,
    'trigger', target.trigger_kind,
    'sourceStatus', target.source_status,
    'overallStatus', target.overall_status,
    'projectionSkipped', target.public_retail_projection_status = 'skipped',
    'idempotent', not changed
  );
end;
$$;


revoke all on function public.complete_catalog_synchronization_source(uuid, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.complete_catalog_synchronization_source(uuid, text, jsonb, integer)
  to service_role;

revoke all on function public.start_public_retail_publication()
  from public, anon, authenticated;
revoke all on function public.build_public_retail_candidate(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_public_retail_candidate(uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_public_retail_candidate(uuid, text)
  from public, anon, authenticated;
grant execute on function public.start_public_retail_publication() to service_role;
grant execute on function public.build_public_retail_candidate(uuid) to service_role;
grant execute on function public.publish_public_retail_candidate(uuid, text) to service_role;
grant execute on function public.fail_public_retail_candidate(uuid, text) to service_role;

comment on function public.build_public_retail_candidate(uuid) is
  'Builds and enriches a candidate off-table, records exact product delta, skips identical content, and persists changed generations once.';

commit;

;
