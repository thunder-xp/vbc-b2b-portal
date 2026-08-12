-- Versioned anonymous Public Retail projection over synchronized local truth.
-- Source catalog, canonical RETAIL and stock remain private; only allowlisted
-- snapshot DTOs are exposed through bounded SECURITY DEFINER read functions.

create table public.public_retail_publications (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'building'
    check (status in ('building', 'published', 'failed', 'superseded')),
  checksum_sha256 text null check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  source_product_count integer not null default 0 check (source_product_count >= 0),
  eligible_product_count integer not null default 0 check (eligible_product_count >= 0),
  excluded_product_count integer not null default 0 check (excluded_product_count >= 0),
  missing_retail_count integer not null default 0 check (missing_retail_count >= 0),
  missing_image_count integer not null default 0 check (missing_image_count >= 0),
  missing_category_count integer not null default 0 check (missing_category_count >= 0),
  products_with_structured_specs integer not null default 0 check (products_with_structured_specs >= 0),
  source_snapshot_at timestamptz null,
  started_at timestamptz not null default now(),
  published_at timestamptz null,
  failed_at timestamptz null,
  safe_error text null check (safe_error is null or char_length(safe_error) <= 500),
  build_duration_ms integer null check (build_duration_ms is null or build_duration_ms >= 0),
  publication_duration_ms integer null check (publication_duration_ms is null or publication_duration_ms >= 0),
  created_at timestamptz not null default now()
);

create unique index public_retail_one_current_publication_idx
  on public.public_retail_publications ((status)) where status = 'published';
create index public_retail_publications_created_idx
  on public.public_retail_publications (created_at desc, id);

create table public.public_retail_product_identities (
  source_product_id uuid primary key references public.catalog_products(id) on delete restrict,
  public_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.public_retail_category_identities (
  source_category_id uuid primary key references public.catalog_categories(id) on delete restrict,
  public_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.public_retail_publication_events (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.public_retail_publications(id) on delete restrict,
  event_type text not null check (event_type in ('started','built','published','failed')),
  safe_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_evidence) = 'object'),
  created_at timestamptz not null default now()
);

create index public_retail_publication_events_publication_idx
  on public.public_retail_publication_events (publication_id, created_at, id);

create table public.public_retail_categories (
  publication_id uuid not null references public.public_retail_publications(id) on delete cascade,
  public_id uuid not null,
  parent_public_id uuid null,
  slug text not null,
  name_ru text not null,
  name_ro text null,
  description_ru text null,
  description_ro text null,
  sort_order integer not null default 0,
  product_count integer not null default 0 check (product_count >= 0),
  primary key (publication_id, public_id),
  unique (publication_id, slug)
);

create index public_retail_categories_parent_idx
  on public.public_retail_categories (publication_id, parent_public_id, sort_order, name_ru);

create table public.public_retail_products (
  publication_id uuid not null references public.public_retail_publications(id) on delete cascade,
  public_id uuid not null,
  slug text not null,
  sku text not null,
  name_ru text not null,
  name_ro text null,
  short_description_ru text null,
  short_description_ro text null,
  description_ru text null,
  description_ro text null,
  category_public_id uuid null,
  category_path jsonb not null default '[]'::jsonb check (jsonb_typeof(category_path) = 'array'),
  brand jsonb null check (brand is null or jsonb_typeof(brand) = 'object'),
  retail_price_amount numeric(14,2) not null check (retail_price_amount > 0),
  retail_price_currency text not null check (retail_price_currency ~ '^[A-Z]{3}$'),
  retail_price_effective_at timestamptz not null,
  vat_presentation text not null default 'not_specified'
    check (vat_presentation in ('included', 'excluded', 'not_specified')),
  availability text not null
    check (availability in ('in_stock', 'low_stock', 'available_to_order', 'unavailable', 'unknown')),
  primary_image_url text null,
  primary_image_alt_ru text null,
  primary_image_alt_ro text null,
  specification_highlights jsonb not null default '[]'::jsonb check (jsonb_typeof(specification_highlights) = 'array'),
  specifications jsonb not null default '[]'::jsonb check (jsonb_typeof(specifications) = 'array'),
  gallery jsonb not null default '[]'::jsonb check (jsonb_typeof(gallery) = 'array'),
  calculator_profile_keys text[] not null default array[]::text[],
  search_document text not null,
  sort_order integer not null default 0,
  primary key (publication_id, public_id),
  unique (publication_id, slug)
);

create index public_retail_products_category_idx
  on public.public_retail_products (publication_id, category_public_id, sort_order, name_ru, public_id);
create index public_retail_products_brand_idx
  on public.public_retail_products (publication_id, ((brand->>'slug')), name_ru, public_id);
create index public_retail_products_price_idx
  on public.public_retail_products (publication_id, retail_price_amount, public_id);
create index public_retail_products_availability_idx
  on public.public_retail_products (publication_id, availability, name_ru, public_id);
create index public_retail_products_search_idx
  on public.public_retail_products using gin ((lower(search_document)) extensions.gin_trgm_ops);

create table public.public_retail_facets (
  publication_id uuid not null references public.public_retail_publications(id) on delete cascade,
  category_public_id uuid not null,
  facet_key text not null,
  label_ru text not null,
  label_ro text null,
  values jsonb not null check (jsonb_typeof(values) = 'array'),
  coverage integer not null default 0 check (coverage >= 0),
  sort_order integer not null default 0,
  primary key (publication_id, category_public_id, facet_key)
);

create index public_retail_facets_category_idx
  on public.public_retail_facets (publication_id, category_public_id, sort_order, label_ru);

alter table public.public_retail_publications enable row level security;
alter table public.public_retail_product_identities enable row level security;
alter table public.public_retail_category_identities enable row level security;
alter table public.public_retail_publication_events enable row level security;
alter table public.public_retail_categories enable row level security;
alter table public.public_retail_products enable row level security;
alter table public.public_retail_facets enable row level security;

revoke all on table public.public_retail_publications, public.public_retail_categories,
  public.public_retail_products, public.public_retail_facets,
  public.public_retail_product_identities, public.public_retail_category_identities,
  public.public_retail_publication_events from public, anon, authenticated;
grant select, insert, update, delete on table public.public_retail_publications,
  public.public_retail_categories, public.public_retail_products, public.public_retail_facets,
  public.public_retail_product_identities, public.public_retail_category_identities to service_role;
grant select, insert on table public.public_retail_publication_events to service_role;

create or replace function public.prevent_published_retail_snapshot_mutation()
returns trigger language plpgsql set search_path = public as $$
declare target_publication_id uuid;
begin
  target_publication_id := case when tg_op = 'DELETE' then old.publication_id else new.publication_id end;
  if exists (
    select 1 from public.public_retail_publications publication
    where publication.id = target_publication_id
      and publication.status in ('published', 'superseded')
  ) then
    raise exception 'Published Public Retail snapshots are immutable.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_public_retail_category_mutation
before insert or update or delete on public.public_retail_categories
for each row execute function public.prevent_published_retail_snapshot_mutation();
create trigger prevent_public_retail_product_mutation
before insert or update or delete on public.public_retail_products
for each row execute function public.prevent_published_retail_snapshot_mutation();
create trigger prevent_public_retail_facet_mutation
before insert or update or delete on public.public_retail_facets
for each row execute function public.prevent_published_retail_snapshot_mutation();

create or replace function public.prevent_public_retail_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Public Retail publication events are immutable.' using errcode = '42501';
end;
$$;
create trigger prevent_public_retail_event_mutation
before update or delete on public.public_retail_publication_events
for each row execute function public.prevent_public_retail_event_mutation();

revoke all on function public.prevent_published_retail_snapshot_mutation() from public, anon, authenticated;
revoke all on function public.prevent_public_retail_event_mutation() from public, anon, authenticated;

create or replace function public.is_safe_public_retail_media_url(p_url text)
returns boolean language sql immutable set search_path = public as $$
  select p_url is not null and (
    p_url ~ '^https://firebasestorage\.googleapis\.com/v0/b/novotech-systems-5449b\.appspot\.com/o/'
    or p_url ~ '^https://storage\.googleapis\.com/novotech-systems-5449b\.appspot\.com/'
  );
$$;

create or replace function public.start_public_retail_publication()
returns uuid language plpgsql security definer set search_path = public as $$
declare publication_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('public_retail_publication', 0));
  if exists (select 1 from public.public_retail_publications where status = 'building') then
    raise exception 'A Public Retail publication is already building.' using errcode = '55P03';
  end if;
  insert into public.public_retail_publications default values returning id into publication_id;
  insert into public.public_retail_publication_events(publication_id, event_type)
  values(publication_id, 'started');
  return publication_id;
end;
$$;

create or replace function public.build_public_retail_candidate(p_publication_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
begin
  select * into target from public.public_retail_publications
  where id = p_publication_id for update;
  if target.id is null or target.status <> 'building' then
    raise exception 'Public Retail publication is not buildable.' using errcode = '22023';
  end if;

  delete from public.public_retail_facets where publication_id = p_publication_id;
  delete from public.public_retail_products where publication_id = p_publication_id;
  delete from public.public_retail_categories where publication_id = p_publication_id;

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
  insert into public.public_retail_products (
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

  insert into public.public_retail_categories (
    publication_id, public_id, parent_public_id, slug, name_ru, name_ro,
    description_ru, description_ro, sort_order, product_count
  )
  select p_publication_id, identity.public_id, parent_identity.public_id, category.slug,
    category.name, null, category.description, null, category.sort_order,
    count(product.public_id)::integer
  from public.catalog_categories category
  join public.public_retail_category_identities identity on identity.source_category_id = category.id
  left join public.public_retail_category_identities parent_identity on parent_identity.source_category_id = category.parent_id
  join public.public_retail_products product
    on product.publication_id = p_publication_id
   and exists (select 1 from jsonb_array_elements(product.category_path) path where path->>'id' = identity.public_id::text)
  where category.is_active
  group by identity.public_id, parent_identity.public_id, category.slug, category.name,
    category.description, category.sort_order;

  insert into public.public_retail_facets (
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
    from public.public_retail_products projected
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

  select count(*)::integer into missing_image from public.public_retail_products
  where publication_id = p_publication_id and primary_image_url is null;
  select count(*)::integer into missing_category from public.public_retail_products
  where publication_id = p_publication_id and category_public_id is null;
  select count(*)::integer into structured_specs from public.public_retail_products
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
    from public.public_retail_categories category where category.publication_id = p_publication_id
    union all
    select 'product', product.public_id::text,
      (to_jsonb(product) - 'publication_id')::text
    from public.public_retail_products product where product.publication_id = p_publication_id
    union all
    select 'facet', coalesce(facet.category_public_id::text, 'all') || ':' || facet.facet_key,
      (to_jsonb(facet) - 'publication_id')::text
    from public.public_retail_facets facet where facet.publication_id = p_publication_id
  ) snapshot;

  update public.public_retail_publications set
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
    'eligibleProducts',eligible_count,'excludedProducts',source_count-eligible_count));

  return jsonb_build_object(
    'publicationId', p_publication_id,
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
$$;

create or replace function public.publish_public_retail_candidate(
  p_publication_id uuid, p_checksum_sha256 text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  started timestamptz := clock_timestamp();
  target public.public_retail_publications;
  product_rows integer;
begin
  if p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Public Retail checksum is invalid.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('public_retail_publication', 0));
  select * into target from public.public_retail_publications
  where id = p_publication_id for update;
  if target.id is null or target.status <> 'building' then
    raise exception 'Public Retail candidate cannot be published.' using errcode = '22023';
  end if;
  select count(*)::integer into product_rows from public.public_retail_products
  where publication_id = p_publication_id;
  if product_rows = 0 or product_rows <> target.eligible_product_count
    or target.checksum_sha256 is null or target.checksum_sha256 <> p_checksum_sha256 then
    raise exception 'Public Retail candidate validation failed.' using errcode = '23514';
  end if;

  update public.public_retail_publications set status = 'superseded'
  where status = 'published' and id <> p_publication_id;
  update public.public_retail_publications set status = 'published',
    checksum_sha256 = p_checksum_sha256, published_at = now(),
    publication_duration_ms = greatest(0, extract(milliseconds from clock_timestamp() - started)::integer)
  where id = p_publication_id;
  insert into public.public_retail_publication_events(publication_id,event_type,safe_evidence)
  values(p_publication_id,'published',jsonb_build_object('productCount',product_rows,'checksum',p_checksum_sha256));

  return jsonb_build_object('publicationId', p_publication_id, 'status', 'published',
    'productCount', product_rows, 'checksum', p_checksum_sha256);
end;
$$;

create or replace function public.fail_public_retail_candidate(
  p_publication_id uuid, p_safe_error text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.public_retail_publications set status = 'failed', failed_at = now(),
    safe_error = left(coalesce(nullif(btrim(p_safe_error), ''), 'PUBLIC_RETAIL_BUILD_FAILED'), 500)
  where id = p_publication_id and status = 'building';
  if found then
    insert into public.public_retail_publication_events(publication_id,event_type,safe_evidence)
    values(p_publication_id,'failed',jsonb_build_object('reason','publisher_reported_failure'));
  end if;
end;
$$;

create or replace function public.list_public_retail_categories(p_locale text default 'ru')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', category.public_id, 'parentId', category.parent_public_id,
    'slug', category.slug,
    'name', case when p_locale = 'ro' then coalesce(category.name_ro, category.name_ru) else category.name_ru end,
    'description', case when p_locale = 'ro' then coalesce(category.description_ro, category.description_ru) else category.description_ru end,
    'productCount', category.product_count
  ) order by category.sort_order, category.name_ru, category.public_id), '[]'::jsonb)
  from public.public_retail_categories category
  join public.public_retail_publications publication on publication.id = category.publication_id
  where publication.status = 'published' and p_locale in ('ru', 'ro');
$$;

create or replace function public.list_public_retail_products(
  p_locale text default 'ru', p_category_slug text default null,
  p_search text default null, p_availability text default null,
  p_facets jsonb default '{}'::jsonb,
  p_limit integer default 24, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_locale not in ('ru', 'ro') or p_limit not between 1 and 48
    or p_offset < 0 or p_offset > 10000
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
      and not exists (
        select 1 from jsonb_each(p_facets) selected(key, values)
        where not exists (
          select 1 from jsonb_array_elements(product.specifications) specification
          where specification->>'key' = selected.key
            and specification->>'value' in (select jsonb_array_elements_text(selected.values))
        )
      )
  ), page as (
    select * from current_products order by sort_order, name_ru, public_id
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
    ) order by page.sort_order, page.name_ru, page.public_id), '[]'::jsonb),
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
      from jsonb_array_elements(product.specifications) with ordinality specification(value,ordinal)),
    'calculatorEligible', cardinality(product.calculator_profile_keys)>0
  );
end;
$$;

create or replace function public.list_public_retail_facets(
  p_category_slug text default null, p_locale text default 'ru'
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare category_id uuid; result jsonb;
begin
  if p_locale not in ('ru','ro') then raise exception 'Public Retail locale is invalid.' using errcode='22023'; end if;
  if p_category_slug is not null then
    select category.public_id into category_id from public.public_retail_categories category
    join public.public_retail_publications publication on publication.id=category.publication_id
    where publication.status='published' and category.slug=p_category_slug;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('key',facet.facet_key,
    'label',case when p_locale='ro' then coalesce(facet.label_ro,facet.label_ru) else facet.label_ru end,
    'values',facet.values,'coverage',facet.coverage) order by facet.sort_order,facet.label_ru),'[]'::jsonb)
  into result from public.public_retail_facets facet
  join public.public_retail_publications publication on publication.id=facet.publication_id
  where publication.status='published' and facet.category_public_id is not distinct from category_id;
  return result;
end;
$$;

revoke all on function public.is_safe_public_retail_media_url(text),
  public.start_public_retail_publication(), public.build_public_retail_candidate(uuid),
  public.publish_public_retail_candidate(uuid,text), public.fail_public_retail_candidate(uuid,text)
  from public, anon, authenticated;
grant execute on function public.start_public_retail_publication(), public.build_public_retail_candidate(uuid),
  public.publish_public_retail_candidate(uuid,text), public.fail_public_retail_candidate(uuid,text)
  to service_role;

revoke all on function public.list_public_retail_categories(text),
  public.list_public_retail_products(text,text,text,text,jsonb,integer,integer),
  public.get_public_retail_product(text,text), public.list_public_retail_facets(text,text)
  from public, authenticated;
grant execute on function public.list_public_retail_categories(text),
  public.list_public_retail_products(text,text,text,text,jsonb,integer,integer),
  public.get_public_retail_product(text,text), public.list_public_retail_facets(text,text)
  to anon, authenticated;

comment on table public.public_retail_products is
  'Immutable versioned Public Retail product DTO storage. Raw 1C refs, company fields, exact stock, partner pricing and diagnostics are forbidden.';
comment on function public.list_public_retail_products(text,text,text,text,jsonb,integer,integer) is
  'Bounded anonymous listing over the current atomic Public Retail publication; no authentication, company context or live integration.';
