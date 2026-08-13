begin;

alter table public.public_retail_products
  add column merchandising_labels text[] not null default array[]::text[],
  add column popular_priority integer null,
  add column new_priority integer null,
  add column new_started_at timestamptz null,
  add column datasheet_url text null,
  add constraint public_retail_product_merchandising_labels_check
    check (merchandising_labels <@ array['NEW','TOP','HOT']::text[]),
  add constraint public_retail_product_popular_priority_check
    check (popular_priority is null or popular_priority between 0 and 1000),
  add constraint public_retail_product_new_priority_check
    check (new_priority is null or new_priority between 0 and 1000),
  add constraint public_retail_product_datasheet_url_check
    check (
      datasheet_url is null
      or (
        char_length(datasheet_url) <= 2000
        and datasheet_url ~* '^https://(materialfile\.dahuasecurity\.com|www\.dahuasecurity\.com)/[^?#]*\.pdf([?#].*)?$'
      )
    );

create index public_retail_products_merchandising_idx
  on public.public_retail_products
  using gin (merchandising_labels);

create or replace function public.hydrate_public_retail_product_presentation(p_publication_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.public_retail_products product
  set merchandising_labels = coalesce(source.labels, array[]::text[]),
      popular_priority = source.popular_priority,
      new_priority = source.new_priority,
      new_started_at = source.new_started_at,
      datasheet_url = source.datasheet_url,
      specifications = source.safe_specifications,
      specification_highlights = source.safe_highlights
  from (
    select inserted.publication_id,
      inserted.public_id,
      coalesce(labels.labels, array[]::text[]) labels,
      labels.popular_priority,
      labels.new_priority,
      labels.new_started_at,
      case
        when datasheet.url ~* '^https://(materialfile\.dahuasecurity\.com|www\.dahuasecurity\.com)/[^?#]*\.pdf([?#].*)?$'
          and char_length(datasheet.url) <= 2000
        then datasheet.url
      end datasheet_url,
      coalesce(specifications.value, '[]'::jsonb) safe_specifications,
      coalesce(highlights.value, '[]'::jsonb) safe_highlights
    from public.public_retail_products inserted
    join public.public_retail_product_identities identity
      on identity.public_id = inserted.public_id
    left join lateral (
      select array_agg(assignment.label_code order by assignment.priority desc, assignment.label_code) labels,
        max(assignment.priority) filter (where assignment.label_code = 'TOP') popular_priority,
        max(assignment.priority) filter (where assignment.label_code = 'NEW') new_priority,
        max(assignment.starts_at) filter (where assignment.label_code = 'NEW') new_started_at
      from public.product_merchandising_assignments assignment
      where assignment.product_id = identity.source_product_id
        and assignment.source in ('manual', 'one_c')
        and assignment.is_active
        and assignment.is_curated_visible
        and assignment.revoked_at is null
        and assignment.starts_at <= now()
        and (assignment.ends_at is null or assignment.ends_at > now())
    ) labels on true
    left join lateral (
      select specification->>'value' url
      from jsonb_array_elements(inserted.specifications) specification
      where lower(btrim(coalesce(specification->>'key', ''))) = 'datasheeturl'
        or lower(btrim(coalesce(specification->>'labelRu', ''))) = 'datasheeturl'
      limit 1
    ) datasheet on true
    left join lateral (
      select jsonb_agg(specification order by ordinal) value
      from jsonb_array_elements(inserted.specifications) with ordinality item(specification, ordinal)
      where lower(btrim(coalesce(specification->>'key', ''))) <> 'datasheeturl'
        and lower(btrim(coalesce(specification->>'labelRu', ''))) <> 'datasheeturl'
    ) specifications on true
    left join lateral (
      select jsonb_agg(specification order by ordinal) value
      from (
        select specification, ordinal
        from jsonb_array_elements(inserted.specifications) with ordinality item(specification, ordinal)
        where lower(btrim(coalesce(specification->>'key', ''))) <> 'datasheeturl'
          and lower(btrim(coalesce(specification->>'labelRu', ''))) <> 'datasheeturl'
        order by ordinal
        limit 3
      ) safe
    ) highlights on true
    where inserted.publication_id = p_publication_id
  ) source
  where product.publication_id = source.publication_id
    and product.public_id = source.public_id;

end;
$$;

create or replace function public.hydrate_inserted_public_retail_product_presentation()
returns trigger language plpgsql set search_path = public as $$
declare target_publication_id uuid;
begin
  for target_publication_id in
    select distinct inserted.publication_id from inserted_public_retail_products inserted
  loop
    perform public.hydrate_public_retail_product_presentation(target_publication_id);
  end loop;
  return null;
end;
$$;

create trigger hydrate_public_retail_product_presentation
after insert on public.public_retail_products
referencing new table as inserted_public_retail_products
for each statement execute function public.hydrate_inserted_public_retail_product_presentation();

revoke all on function public.hydrate_public_retail_product_presentation(uuid),
  public.hydrate_inserted_public_retail_product_presentation()
  from public, anon, authenticated;

alter table public.public_retail_products disable trigger prevent_public_retail_product_mutation;
select public.hydrate_public_retail_product_presentation(publication.id)
from public.public_retail_publications publication
where publication.status = 'published';
alter table public.public_retail_products enable trigger prevent_public_retail_product_mutation;

create or replace function public.list_public_retail_products_v2(
  p_locale text default 'ru', p_category_slug text default null,
  p_search text default null, p_availability text default null,
  p_facets jsonb default '{}'::jsonb, p_mode text default null,
  p_limit integer default 24, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_locale not in ('ru', 'ro') or p_limit not between 1 and 48
    or p_offset < 0 or p_offset > 10000
    or (p_mode is not null and p_mode not in ('popular','new','price_asc','price_desc'))
    or (p_availability is not null and p_availability not in ('in_stock','low_stock','available_to_order','unavailable','unknown'))
    or (p_search is not null and char_length(btrim(p_search)) > 100)
    or jsonb_typeof(p_facets) <> 'object'
    or (select count(*) from jsonb_object_keys(p_facets)) > 8
    or exists (
      select 1 from jsonb_each(p_facets) selected(key, values)
      where char_length(selected.key) > 160 or jsonb_typeof(selected.values) <> 'array'
        or jsonb_array_length(selected.values) not between 1 and 10
        or exists (select 1 from jsonb_array_elements(selected.values) value
          where jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 1000)
    ) then
    raise exception 'Public Retail list input is invalid.' using errcode = '22023';
  end if;

  with current_products as (
    select product.* from public.public_retail_products product
    join public.public_retail_publications publication on publication.id = product.publication_id
    where publication.status = 'published'
      and (p_category_slug is null or exists (
        select 1 from jsonb_array_elements(product.category_path) path where path->>'slug' = p_category_slug
      ))
      and (p_availability is null or product.availability = p_availability)
      and (p_search is null or lower(product.search_document) like '%' || lower(btrim(p_search)) || '%')
      and (
        nullif(btrim(p_search), '') is not null
        or p_mode is null
        or p_mode not in ('popular','new')
        or (p_mode = 'popular' and 'TOP' = any(product.merchandising_labels))
        or (p_mode = 'new' and 'NEW' = any(product.merchandising_labels))
      )
      and not exists (
        select 1 from jsonb_each(p_facets) selected(key, values)
        where not exists (
          select 1 from jsonb_array_elements(product.specifications) specification
          where specification->>'key' = selected.key
            and specification->>'value' in (select jsonb_array_elements_text(selected.values))
        )
      )
  ), page as (
    select * from current_products
    order by
      case when p_mode = 'popular' then popular_priority end desc nulls last,
      case when p_mode = 'new' then new_started_at end desc nulls last,
      case when p_mode = 'new' then new_priority end desc nulls last,
      case when p_mode = 'price_asc' then retail_price_amount end asc,
      case when p_mode = 'price_desc' then retail_price_amount end desc,
      sort_order, name_ru, public_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.public_id, 'slug', page.slug, 'sku', page.sku,
      'name', case when p_locale = 'ro' then coalesce(page.name_ro, page.name_ru) else page.name_ru end,
      'shortDescription', case when p_locale = 'ro' then coalesce(page.short_description_ro, page.short_description_ru) else page.short_description_ru end,
      'image', case when page.primary_image_url is null then null else jsonb_build_object(
        'url', page.primary_image_url,
        'alt', case when p_locale = 'ro' then coalesce(page.primary_image_alt_ro, page.primary_image_alt_ru) else page.primary_image_alt_ru end
      ) end,
      'brand', case when page.brand is null then null else jsonb_build_object(
        'slug', page.brand->>'slug',
        'name', case when p_locale = 'ro' then coalesce(page.brand->>'nameRo', page.brand->>'nameRu') else page.brand->>'nameRu' end
      ) end,
      'category', case when jsonb_array_length(page.category_path) = 0 then null else
        jsonb_build_object('slug', page.category_path->-1->>'slug',
          'name', case when p_locale = 'ro' then coalesce(page.category_path->-1->>'nameRo', page.category_path->-1->>'nameRu') else page.category_path->-1->>'nameRu' end) end,
      'price', jsonb_build_object('amount', page.retail_price_amount, 'currency', page.retail_price_currency,
        'vatPresentation', page.vat_presentation),
      'availability', page.availability,
      'highlights', (select coalesce(jsonb_agg(jsonb_build_object(
        'key', value->>'key',
        'label', case when p_locale='ro' then coalesce(value->>'labelRo',value->>'labelRu') else value->>'labelRu' end,
        'value', value->>'value'
      )), '[]'::jsonb) from jsonb_array_elements(page.specification_highlights) value),
      'calculatorEligible', cardinality(page.calculator_profile_keys) > 0
    ) order by
      case when p_mode = 'popular' then page.popular_priority end desc nulls last,
      case when p_mode = 'new' then page.new_started_at end desc nulls last,
      case when p_mode = 'new' then page.new_priority end desc nulls last,
      case when p_mode = 'price_asc' then page.retail_price_amount end asc,
      case when p_mode = 'price_desc' then page.retail_price_amount end desc,
      page.sort_order, page.name_ru, page.public_id), '[]'::jsonb),
    'totalCount', (select count(*) from current_products),
    'limit', p_limit, 'offset', p_offset
  ) into result from page;
  return coalesce(result, jsonb_build_object('items','[]'::jsonb,'totalCount',0,'limit',p_limit,'offset',p_offset));
end;
$$;

create or replace function public.get_public_retail_product(p_slug text, p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare product public.public_retail_products;
begin
  if p_locale not in ('ru','ro') or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_slug) > 160 then
    raise exception 'Public Retail product input is invalid.' using errcode = '22023';
  end if;
  select snapshot.* into product from public.public_retail_products snapshot
  join public.public_retail_publications publication on publication.id = snapshot.publication_id
  where publication.status = 'published' and snapshot.slug = p_slug;
  if product.public_id is null then return null; end if;
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
    'specifications', (select coalesce(jsonb_agg(jsonb_build_object('key',value->>'key',
      'label',case when p_locale='ro' then coalesce(value->>'labelRo',value->>'labelRu') else value->>'labelRu' end,
      'value',value->>'value') order by ordinal), '[]'::jsonb)
      from jsonb_array_elements(product.specifications) with ordinality specification(value,ordinal)
      where lower(btrim(coalesce(value->>'key',''))) <> 'datasheeturl'
        and lower(btrim(coalesce(value->>'labelRu',''))) <> 'datasheeturl'),
    'datasheet', case when product.datasheet_url is null then null
      else jsonb_build_object('type','datasheet','url',product.datasheet_url) end,
    'calculatorEligible', cardinality(product.calculator_profile_keys)>0
  );
end;
$$;

revoke all on function public.list_public_retail_products_v2(text,text,text,text,jsonb,text,integer,integer)
  from public, authenticated;
grant execute on function public.list_public_retail_products_v2(text,text,text,text,jsonb,text,integer,integer)
  to anon, authenticated;

comment on function public.list_public_retail_products_v2(text,text,text,text,jsonb,text,integer,integer) is
  'Bounded anonymous Public Retail listing with governed TOP/NEW showcase modes and canonical RETAIL price sorting.';

commit;
