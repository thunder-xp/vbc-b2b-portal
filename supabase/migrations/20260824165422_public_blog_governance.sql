begin;

create table public.public_blog_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 160),
  category_slug text not null check (category_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(category_slug) <= 80),
  featured boolean not null default false,
  sort_order integer not null default 0,
  revision integer not null default 1 check (revision > 0),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index public_blog_articles_featured_idx
  on public.public_blog_articles (featured desc, sort_order, updated_at desc, id);
create index public_blog_articles_category_idx
  on public.public_blog_articles (category_slug, updated_at desc, id);

create table public.public_blog_localizations (
  article_id uuid not null references public.public_blog_articles(id) on delete cascade,
  locale text not null check (locale in ('ru', 'ro')),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  title text not null check (char_length(btrim(title)) between 4 and 180),
  excerpt text not null check (char_length(btrim(excerpt)) between 20 and 500),
  content_json jsonb not null default '[]'::jsonb check (jsonb_typeof(content_json) = 'array' and jsonb_array_length(content_json) between 1 and 100),
  meta_title text null check (meta_title is null or char_length(meta_title) between 4 and 180),
  meta_description text null check (meta_description is null or char_length(meta_description) between 20 and 320),
  hero_alt text null check (hero_alt is null or char_length(hero_alt) <= 240),
  hero_source_storage_key text null check (hero_source_storage_key is null or hero_source_storage_key ~ '^articles/[0-9a-f-]{36}/(ru|ro)/[0-9a-f-]{36}\.webp$'),
  hero_public_storage_key text null check (hero_public_storage_key is null or hero_public_storage_key ~ '^articles/[0-9a-f-]{36}/(ru|ro)/[0-9a-f-]{36}\.webp$'),
  hero_public_url text null check (hero_public_url is null or hero_public_url ~ '^https://'),
  hero_width integer null check (hero_width is null or hero_width between 1 and 1920),
  hero_height integer null check (hero_height is null or hero_height between 1 and 1920),
  revision integer not null default 1 check (revision > 0),
  published_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, locale)
);

create index public_blog_localizations_public_idx
  on public.public_blog_localizations (locale, published_at desc, article_id)
  where status = 'published';
create index public_blog_localizations_admin_idx
  on public.public_blog_localizations (status, updated_at desc, article_id);

create table public.public_blog_relations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.public_blog_articles(id) on delete cascade,
  relation_type text not null check (relation_type in ('product', 'category', 'service', 'article')),
  product_public_id uuid null references public.public_retail_product_identities(public_id) on delete restrict,
  category_public_id uuid null references public.public_retail_category_identities(public_id) on delete restrict,
  service_key text null check (service_key is null or service_key in ('cctv_calculator', 'installation', 'catalog')),
  related_article_id uuid null references public.public_blog_articles(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    (relation_type = 'product' and product_public_id is not null and category_public_id is null and service_key is null and related_article_id is null)
    or (relation_type = 'category' and product_public_id is null and category_public_id is not null and service_key is null and related_article_id is null)
    or (relation_type = 'service' and product_public_id is null and category_public_id is null and service_key is not null and related_article_id is null)
    or (relation_type = 'article' and product_public_id is null and category_public_id is null and service_key is null and related_article_id is not null and related_article_id <> article_id)
  )
);

create unique index public_blog_relations_product_uq on public.public_blog_relations(article_id, product_public_id) where relation_type = 'product';
create unique index public_blog_relations_category_uq on public.public_blog_relations(article_id, category_public_id) where relation_type = 'category';
create unique index public_blog_relations_service_uq on public.public_blog_relations(article_id, service_key) where relation_type = 'service';
create unique index public_blog_relations_article_uq on public.public_blog_relations(article_id, related_article_id) where relation_type = 'article';
create index public_blog_relations_product_reverse_idx on public.public_blog_relations(product_public_id, article_id) where relation_type = 'product';
create index public_blog_relations_category_reverse_idx on public.public_blog_relations(category_public_id, article_id) where relation_type = 'category';

create table public.public_blog_events (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.public_blog_articles(id) on delete restrict,
  locale text null check (locale is null or locale in ('ru', 'ro')),
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created', 'updated', 'submitted_for_review', 'published', 'archived', 'restored', 'hero_changed')),
  from_status text null,
  to_status text null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index public_blog_events_article_idx on public.public_blog_events(article_id, created_at desc, id);

alter table public.public_blog_articles enable row level security;
alter table public.public_blog_localizations enable row level security;
alter table public.public_blog_relations enable row level security;
alter table public.public_blog_events enable row level security;

revoke all on table public.public_blog_articles, public.public_blog_localizations,
  public.public_blog_relations, public.public_blog_events from public, anon, authenticated;
grant select, insert, update, delete on table public.public_blog_articles,
  public.public_blog_localizations, public.public_blog_relations to service_role;
grant select, insert on table public.public_blog_events to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-blog-source', 'public-blog-source', false, 5242880, array['image/webp']),
  ('public-blog-media', 'public-blog-media', true, 2097152, array['image/webp'])
on conflict(id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.prevent_public_blog_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Public Blog events are append-only.' using errcode = '42501';
end;
$$;
create trigger prevent_public_blog_event_mutation
before update or delete on public.public_blog_events
for each row execute function public.prevent_public_blog_event_mutation();

create or replace function public.public_blog_content_is_safe(p_content jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_content) = 'array'
    and jsonb_array_length(p_content) between 1 and 100
    and not exists (
      select 1 from jsonb_array_elements(p_content) block
      where block->>'type' not in ('heading2', 'heading3', 'paragraph', 'unordered_list', 'ordered_list')
        or (block->>'type' in ('heading2', 'heading3', 'paragraph') and char_length(btrim(coalesce(block->>'text', ''))) not between 1 and 4000)
        or (block->>'type' in ('unordered_list', 'ordered_list') and (
          jsonb_typeof(block->'items') <> 'array'
          or jsonb_array_length(block->'items') not between 1 and 30
          or exists (select 1 from jsonb_array_elements_text(block->'items') item where char_length(btrim(item)) not between 1 and 500)
        ))
    );
$$;

alter table public.public_blog_localizations
  add constraint public_blog_localizations_safe_content check (public.public_blog_content_is_safe(content_json));

create or replace function public.public_blog_card(a public.public_blog_articles, l public.public_blog_localizations)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'slug', a.slug, 'categorySlug', a.category_slug,
    'featured', a.featured, 'title', l.title, 'excerpt', l.excerpt,
    'heroUrl', l.hero_public_url, 'heroAlt', l.hero_alt,
    'publishedAt', l.published_at, 'updatedAt', l.updated_at
  );
$$;

create or replace function public.list_public_blog_articles(
  p_locale text default 'ru', p_category text default null,
  p_limit integer default 12, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_locale not in ('ru','ro') or p_limit not between 1 and 24 or p_offset not between 0 and 2400
    or (p_category is not null and p_category !~ '^[a-z0-9]+(-[a-z0-9]+)*$') then
    raise exception 'Public Blog list input is invalid.' using errcode = '22023';
  end if;
  with eligible as (
    select article, localization
    from public.public_blog_articles article
    join public.public_blog_localizations localization on localization.article_id = article.id
      and localization.locale = p_locale and localization.status = 'published'
    where p_category is null or article.category_slug = p_category
  ), page as (
    select * from eligible order by (article).featured desc, (article).sort_order, (localization).published_at desc, (article).id limit p_limit offset p_offset
  ), categories as (
    select (article).category_slug slug, count(*)::integer count from eligible group by (article).category_slug order by (article).category_slug
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(public.public_blog_card(article, localization) order by (article).featured desc, (article).sort_order, (localization).published_at desc) from page), '[]'::jsonb),
    'total', (select count(*)::integer from eligible),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'count', count) order by slug) from categories), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_public_blog_article(p_slug text, p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 160 or p_locale not in ('ru','ro') then
    raise exception 'Public Blog article input is invalid.' using errcode = '22023';
  end if;
  with target as (
    select
      article.id,
      article.slug,
      article.category_slug,
      article.featured,
      localization.title,
      localization.excerpt,
      localization.content_json,
      localization.meta_title,
      localization.meta_description,
      localization.hero_public_url,
      localization.hero_alt,
      localization.hero_width,
      localization.hero_height,
      localization.published_at,
      localization.updated_at
    from public.public_blog_articles article
    join public.public_blog_localizations localization on localization.article_id = article.id
      and localization.locale = p_locale and localization.status = 'published'
    where article.slug = p_slug
  ), current_publication as (
    select id from public.public_retail_publications where status = 'published'
  )
  select jsonb_build_object(
    'id', target.id, 'slug', target.slug, 'categorySlug', target.category_slug,
    'featured', target.featured, 'title', target.title, 'excerpt', target.excerpt,
    'content', target.content_json, 'metaTitle', target.meta_title,
    'metaDescription', target.meta_description, 'heroUrl', target.hero_public_url,
    'heroAlt', target.hero_alt, 'heroWidth', target.hero_width, 'heroHeight', target.hero_height,
    'publishedAt', target.published_at, 'updatedAt', target.updated_at,
    'products', coalesce((select jsonb_agg(public.build_public_retail_product_summary(product, p_locale) order by relation.sort_order, product.name_ru) from public.public_blog_relations relation join current_publication publication on true join public.public_retail_products product on product.publication_id = publication.id and product.public_id = relation.product_public_id where relation.article_id = target.id and relation.relation_type = 'product'), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', category.public_id, 'slug', category.slug, 'name', case when p_locale = 'ro' then coalesce(category.name_ro, category.name_ru) else category.name_ru end) order by relation.sort_order, category.sort_order) from public.public_blog_relations relation join current_publication publication on true join public.public_retail_categories category on category.publication_id = publication.id and category.public_id = relation.category_public_id where relation.article_id = target.id and relation.relation_type = 'category'), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('key', relation.service_key, 'href', case relation.service_key when 'cctv_calculator' then '/calculator/cctv' when 'installation' then '/installation' else '/catalog' end) order by relation.sort_order) from public.public_blog_relations relation where relation.article_id = target.id and relation.relation_type = 'service'), '[]'::jsonb),
    'related', coalesce((select jsonb_agg(card order by sort_order, published_at desc) from (select public.public_blog_card(related_article, related_localization) card, relation.sort_order, related_localization.published_at from public.public_blog_relations relation join public.public_blog_articles related_article on related_article.id = relation.related_article_id join public.public_blog_localizations related_localization on related_localization.article_id = related_article.id and related_localization.locale = p_locale and related_localization.status = 'published' where relation.article_id = target.id and relation.relation_type = 'article' order by relation.sort_order, related_localization.published_at desc limit 6) bounded_related), '[]'::jsonb)
  ) into result from target;
  return result;
end;
$$;

create or replace function public.list_public_blog_for_product(p_product_public_id uuid, p_locale text default 'ru', p_limit integer default 3)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_locale not in ('ru','ro') or p_limit not between 1 and 6 then raise exception 'Public Blog relation input is invalid.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(card order by featured desc, published_at desc), '[]'::jsonb) into result from (
    select public.public_blog_card(article, localization) card, article.featured, localization.published_at
    from public.public_blog_relations relation
    join public.public_blog_articles article on article.id = relation.article_id
    join public.public_blog_localizations localization on localization.article_id = article.id and localization.locale = p_locale and localization.status = 'published'
    where relation.relation_type = 'product' and relation.product_public_id = p_product_public_id
    order by article.featured desc, localization.published_at desc limit p_limit
  ) bounded;
  return result;
end;
$$;

create or replace function public.list_public_blog_for_category(p_category_public_id uuid, p_locale text default 'ru', p_limit integer default 3)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_locale not in ('ru','ro') or p_limit not between 1 and 6 then raise exception 'Public Blog relation input is invalid.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(card order by featured desc, published_at desc), '[]'::jsonb) into result from (
    select public.public_blog_card(article, localization) card, article.featured, localization.published_at
    from public.public_blog_relations relation
    join public.public_blog_articles article on article.id = relation.article_id
    join public.public_blog_localizations localization on localization.article_id = article.id and localization.locale = p_locale and localization.status = 'published'
    where relation.relation_type = 'category' and relation.category_public_id = p_category_public_id
    order by article.featured desc, localization.published_at desc limit p_limit
  ) bounded;
  return result;
end;
$$;

create or replace function public.list_public_blog_sitemap_inventory()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', article.slug, 'locale', localization.locale, 'lastModified', greatest(localization.updated_at, localization.published_at)) order by article.slug, localization.locale), '[]'::jsonb)
  from public.public_blog_articles article
  join public.public_blog_localizations localization on localization.article_id = article.id and localization.status = 'published';
$$;

create or replace function public.list_admin_blog_articles(p_status text default null, p_query text default '', p_limit integer default 30, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.catalog.manage') then raise exception 'Blog management is not allowed.' using errcode = '42501'; end if;
  if (p_status is not null and p_status not in ('draft','review','published','archived')) or p_limit not between 1 and 50 or p_offset not between 0 and 5000 then raise exception 'Admin Blog list input is invalid.' using errcode = '22023'; end if;
  with filtered as (
    select article.*, localization.locale, localization.status, localization.title, localization.excerpt, localization.updated_at localization_updated_at, localization.revision localization_revision
    from public.public_blog_articles article join public.public_blog_localizations localization on localization.article_id = article.id
    where (p_status is null or localization.status = p_status)
      and (btrim(p_query) = '' or localization.title ilike '%' || left(btrim(p_query), 100) || '%' or article.slug ilike '%' || left(btrim(p_query), 100) || '%')
  ), page as (select * from filtered order by localization_updated_at desc, id, locale limit p_limit offset p_offset)
  select jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'categorySlug', category_slug, 'featured', featured, 'articleRevision', revision, 'locale', locale, 'status', status, 'title', title, 'excerpt', excerpt, 'localizationRevision', localization_revision, 'updatedAt', localization_updated_at) order by localization_updated_at desc) from page), '[]'::jsonb), 'total', (select count(*)::integer from filtered)) into result;
  return result;
end;
$$;

create or replace function public.get_admin_blog_article(p_article_id uuid, p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.catalog.manage') then raise exception 'Blog management is not allowed.' using errcode = '42501'; end if;
  if p_locale not in ('ru','ro') then raise exception 'Admin Blog locale is invalid.' using errcode = '22023'; end if;
  select jsonb_build_object(
    'id', article.id, 'slug', article.slug, 'categorySlug', article.category_slug, 'featured', article.featured,
    'articleRevision', article.revision, 'locale', p_locale, 'status', coalesce(localization.status, 'draft'),
    'title', coalesce(localization.title, ''), 'excerpt', coalesce(localization.excerpt, ''), 'content', coalesce(localization.content_json, '[]'::jsonb),
    'metaTitle', localization.meta_title, 'metaDescription', localization.meta_description,
    'heroAlt', localization.hero_alt, 'heroSourceStorageKey', localization.hero_source_storage_key,
    'heroPublicStorageKey', localization.hero_public_storage_key, 'heroPublicUrl', localization.hero_public_url,
    'heroWidth', localization.hero_width, 'heroHeight', localization.hero_height,
    'localizationRevision', coalesce(localization.revision, 0), 'publishedAt', localization.published_at,
    'productSkus', coalesce((select jsonb_agg(product.sku order by relation.sort_order, product.sku) from public.public_blog_relations relation join public.public_retail_product_identities identity on identity.public_id = relation.product_public_id join public.catalog_products product on product.id = identity.source_product_id where relation.article_id = article.id and relation.relation_type = 'product'), '[]'::jsonb),
    'categorySlugs', coalesce((select jsonb_agg(category.slug order by relation.sort_order, category.slug) from public.public_blog_relations relation join public.public_retail_category_identities identity on identity.public_id = relation.category_public_id join public.catalog_categories category on category.id = identity.source_category_id where relation.article_id = article.id and relation.relation_type = 'category'), '[]'::jsonb),
    'serviceKeys', coalesce((select jsonb_agg(relation.service_key order by relation.sort_order) from public.public_blog_relations relation where relation.article_id = article.id and relation.relation_type = 'service'), '[]'::jsonb),
    'relatedSlugs', coalesce((select jsonb_agg(related.slug order by relation.sort_order, related.slug) from public.public_blog_relations relation join public.public_blog_articles related on related.id = relation.related_article_id where relation.article_id = article.id and relation.relation_type = 'article'), '[]'::jsonb)
  ) into result from public.public_blog_articles article left join public.public_blog_localizations localization on localization.article_id = article.id and localization.locale = p_locale where article.id = p_article_id;
  return result;
end;
$$;

create or replace function public.save_admin_blog_article(
  p_article_id uuid, p_locale text, p_slug text, p_category_slug text, p_featured boolean,
  p_title text, p_excerpt text, p_content jsonb, p_meta_title text, p_meta_description text, p_hero_alt text,
  p_product_skus text[], p_category_slugs text[], p_service_keys text[], p_related_slugs text[],
  p_expected_article_revision integer, p_expected_localization_revision integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.public_blog_articles; current_localization public.public_blog_localizations; created boolean := false; item text; target_id uuid; next_status text;
begin
  if actor is null or not public.has_internal_permission('admin.catalog.manage') then raise exception 'Blog management is not allowed.' using errcode = '42501'; end if;
  if p_locale not in ('ru','ro') or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 160 or p_category_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(btrim(p_title)) not between 4 and 180 or char_length(btrim(p_excerpt)) not between 20 and 500 or not public.public_blog_content_is_safe(p_content)
    or coalesce(array_length(p_product_skus,1),0) > 24 or coalesce(array_length(p_category_slugs,1),0) > 12 or coalesce(array_length(p_service_keys,1),0) > 6 or coalesce(array_length(p_related_slugs,1),0) > 12 then
    raise exception 'Blog input is invalid.' using errcode = '22023';
  end if;
  if p_article_id is null then
    insert into public.public_blog_articles(slug, category_slug, featured, created_by, updated_by) values(p_slug, p_category_slug, p_featured, actor, actor) returning * into target; created := true;
  else
    select * into target from public.public_blog_articles where id = p_article_id for update;
    if target.id is null then raise exception 'Blog article not found.' using errcode = 'P0002'; end if;
    if target.revision <> p_expected_article_revision then raise exception 'BLOG_VERSION_CONFLICT' using errcode = 'PT409'; end if;
    update public.public_blog_articles set slug = p_slug, category_slug = p_category_slug, featured = p_featured, revision = revision + 1, updated_by = actor, updated_at = now() where id = target.id returning * into target;
  end if;
  select * into current_localization from public.public_blog_localizations where article_id = target.id and locale = p_locale for update;
  if current_localization.article_id is not null and current_localization.revision <> p_expected_localization_revision then raise exception 'BLOG_VERSION_CONFLICT' using errcode = 'PT409'; end if;
  next_status := case when current_localization.status = 'published' then 'draft' else coalesce(current_localization.status, 'draft') end;
  insert into public.public_blog_localizations(article_id, locale, status, title, excerpt, content_json, meta_title, meta_description, hero_alt)
  values(target.id, p_locale, 'draft', btrim(p_title), btrim(p_excerpt), p_content, nullif(btrim(p_meta_title),''), nullif(btrim(p_meta_description),''), nullif(btrim(p_hero_alt),''))
  on conflict(article_id, locale) do update set status = next_status, title = excluded.title, excerpt = excluded.excerpt, content_json = excluded.content_json, meta_title = excluded.meta_title, meta_description = excluded.meta_description, hero_alt = excluded.hero_alt, revision = public.public_blog_localizations.revision + 1, updated_at = now();
  delete from public.public_blog_relations where article_id = target.id;
  foreach item in array coalesce(p_product_skus, array[]::text[]) loop
    target_id := null;
    select identity.public_id into target_id from public.catalog_products product join public.public_retail_product_identities identity on identity.source_product_id = product.id where product.sku = item and product.is_active and product.is_visible;
    if target_id is null then raise exception 'Unknown public product relation.' using errcode = '22023'; end if;
    insert into public.public_blog_relations(article_id, relation_type, product_public_id) values(target.id, 'product', target_id) on conflict do nothing;
  end loop;
  foreach item in array coalesce(p_category_slugs, array[]::text[]) loop
    target_id := null;
    select identity.public_id into target_id from public.catalog_categories category join public.public_retail_category_identities identity on identity.source_category_id = category.id where category.slug = item and category.is_active;
    if target_id is null then raise exception 'Unknown public category relation.' using errcode = '22023'; end if;
    insert into public.public_blog_relations(article_id, relation_type, category_public_id) values(target.id, 'category', target_id) on conflict do nothing;
  end loop;
  foreach item in array coalesce(p_service_keys, array[]::text[]) loop insert into public.public_blog_relations(article_id, relation_type, service_key) values(target.id, 'service', item) on conflict do nothing; end loop;
  foreach item in array coalesce(p_related_slugs, array[]::text[]) loop
    target_id := null;
    select id into target_id from public.public_blog_articles where slug = item and id <> target.id;
    if target_id is null then raise exception 'Unknown related Blog article.' using errcode = '22023'; end if;
    insert into public.public_blog_relations(article_id, relation_type, related_article_id) values(target.id, 'article', target_id) on conflict do nothing;
  end loop;
  insert into public.public_blog_events(article_id, locale, actor_user_id, event_type, from_status, to_status, safe_metadata) values(target.id, p_locale, actor, case when created then 'created' else 'updated' end, current_localization.status, next_status, jsonb_build_object('relationsReplaced', true));
  return target.id;
end;
$$;

create or replace function public.set_admin_blog_hero(p_article_id uuid, p_locale text, p_expected_revision integer, p_source_storage_key text, p_width integer, p_height integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); current public.public_blog_localizations; previous_key text;
begin
  if actor is null or not public.has_internal_permission('admin.catalog.manage') then raise exception 'Blog management is not allowed.' using errcode = '42501'; end if;
  select * into current from public.public_blog_localizations where article_id = p_article_id and locale = p_locale for update;
  if current.article_id is null or current.revision <> p_expected_revision then raise exception 'BLOG_VERSION_CONFLICT' using errcode = 'PT409'; end if;
  previous_key := current.hero_source_storage_key;
  update public.public_blog_localizations set hero_source_storage_key = p_source_storage_key, hero_width = p_width, hero_height = p_height, status = case when status = 'published' then 'draft' else status end, revision = revision + 1, updated_at = now() where article_id = p_article_id and locale = p_locale;
  insert into public.public_blog_events(article_id, locale, actor_user_id, event_type, safe_metadata) values(p_article_id, p_locale, actor, 'hero_changed', jsonb_build_object('hasHero', p_source_storage_key is not null));
  return jsonb_build_object('previousSourceStorageKey', previous_key, 'revision', current.revision + 1);
end;
$$;

create or replace function public.transition_admin_blog_article(p_article_id uuid, p_locale text, p_action text, p_expected_revision integer, p_public_storage_key text default null, p_public_url text default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); current public.public_blog_localizations; next_status text; event_name text; previous_public_key text;
begin
  if actor is null or not public.has_internal_permission('admin.catalog.manage') then raise exception 'Blog management is not allowed.' using errcode = '42501'; end if;
  select * into current from public.public_blog_localizations where article_id = p_article_id and locale = p_locale for update;
  if current.article_id is null or current.revision <> p_expected_revision then raise exception 'BLOG_VERSION_CONFLICT' using errcode = 'PT409'; end if;
  if p_action = 'submit_review' and current.status = 'draft' then next_status := 'review'; event_name := 'submitted_for_review';
  elsif p_action = 'publish' and current.status = 'review' then next_status := 'published'; event_name := 'published';
  elsif p_action = 'archive' and current.status = 'published' then next_status := 'archived'; event_name := 'archived';
  elsif p_action = 'restore' and current.status = 'archived' then next_status := 'draft'; event_name := 'restored';
  else raise exception 'BLOG_STATE_CONFLICT' using errcode = 'PT409'; end if;
  if p_action = 'publish' and current.hero_source_storage_key is not null and (p_public_storage_key is null or p_public_url is null) then raise exception 'Published Blog hero projection is required.' using errcode = '22023'; end if;
  previous_public_key := current.hero_public_storage_key;
  update public.public_blog_localizations set status = next_status,
    hero_public_storage_key = case when p_action = 'publish' then p_public_storage_key else hero_public_storage_key end,
    hero_public_url = case when p_action = 'publish' then p_public_url else hero_public_url end,
    published_at = case when p_action = 'publish' then now() else published_at end,
    archived_at = case when p_action = 'archive' then now() when p_action = 'restore' then null else archived_at end,
    revision = revision + 1, updated_at = now()
  where article_id = p_article_id and locale = p_locale;
  insert into public.public_blog_events(article_id, locale, actor_user_id, event_type, from_status, to_status, safe_metadata)
  values(p_article_id, p_locale, actor, event_name, current.status, next_status, case when nullif(btrim(p_reason),'') is null then '{}'::jsonb else jsonb_build_object('reason', left(btrim(p_reason), 500)) end);
  return jsonb_build_object('status', next_status, 'revision', current.revision + 1, 'previousPublicStorageKey', previous_public_key);
end;
$$;

insert into public.public_blog_articles(id, slug, category_slug, featured, sort_order)
values('6f171fd7-85ae-4c43-a092-2ee06ad43b31', 'kak-podobrat-videonablyudenie', 'video-surveillance', true, 10)
on conflict(slug) do nothing;
insert into public.public_blog_localizations(article_id, locale, status, title, excerpt, content_json, meta_title, meta_description, hero_public_url, hero_alt, hero_width, hero_height, published_at)
values
('6f171fd7-85ae-4c43-a092-2ee06ad43b31','ru','published','Как подобрать видеонаблюдение для дома или бизнеса','Практический порядок выбора камер, архива, сети, питания и монтажа системы CCTV.',jsonb_build_array(jsonb_build_object('type','heading2','text','Определите зоны и задачи'),jsonb_build_object('type','paragraph','text','Отметьте входы, периметр, кассовые или складские зоны. Для каждой зоны решите, нужен общий обзор или распознавание деталей.'),jsonb_build_object('type','heading2','text','Выберите камеры под условия'),jsonb_build_object('type','paragraph','text','В помещении важны угол обзора и освещение. На улице учитывайте корпус, температуру, ночную съёмку и встречный свет.'),jsonb_build_object('type','heading2','text','Рассчитайте архив и сеть'),jsonb_build_object('type','paragraph','text','Глубина архива зависит от числа камер, разрешения, частоты кадров и режима записи. Сеть и питание должны выдерживать выбранную конфигурацию.'),jsonb_build_object('type','heading2','text','Проверьте монтаж'),jsonb_build_object('type','paragraph','text','До покупки определите трассы, высоту установки, точки питания и условия доступа к оборудованию.')), 'Как подобрать видеонаблюдение | Novotech','Практическое руководство Novotech по выбору камер, архива, сети, питания и монтажу видеонаблюдения в Молдове.','https://www.nsd.md/retail/security-installation-hero.webp','Монтаж системы видеонаблюдения Novotech',1600,900,now()),
('6f171fd7-85ae-4c43-a092-2ee06ad43b31','ro','published','Cum alegeți supravegherea video pentru casă sau afacere','Ordinea practică pentru alegerea camerelor, arhivei, rețelei, alimentării și instalării CCTV.',jsonb_build_array(jsonb_build_object('type','heading2','text','Stabiliți zonele și obiectivele'),jsonb_build_object('type','paragraph','text','Marcați intrările, perimetrul, casele de marcat sau zonele de depozitare. Pentru fiecare zonă decideți dacă aveți nevoie de imagine generală sau de recunoașterea detaliilor.'),jsonb_build_object('type','heading2','text','Alegeți camerele pentru condițiile reale'),jsonb_build_object('type','paragraph','text','În interior contează unghiul de vizualizare și iluminarea. La exterior luați în calcul carcasa, temperatura, vederea nocturnă și lumina din față.'),jsonb_build_object('type','heading2','text','Calculați arhiva și rețeaua'),jsonb_build_object('type','paragraph','text','Adâncimea arhivei depinde de numărul camerelor, rezoluție, frecvența cadrelor și regimul de înregistrare. Rețeaua și alimentarea trebuie să susțină configurația.'),jsonb_build_object('type','heading2','text','Verificați instalarea'),jsonb_build_object('type','paragraph','text','Înainte de cumpărare stabiliți traseele, înălțimea montajului, punctele de alimentare și accesul la echipamente.')), 'Cum alegeți supravegherea video | Novotech','Ghid practic Novotech pentru alegerea camerelor, arhivei, rețelei, alimentării și instalării CCTV în Moldova.','https://www.nsd.md/retail/security-installation-hero.webp','Instalarea unui sistem de supraveghere video Novotech',1600,900,now())
on conflict(article_id, locale) do nothing;
insert into public.public_blog_relations(article_id, relation_type, service_key, sort_order)
values
('6f171fd7-85ae-4c43-a092-2ee06ad43b31','service','cctv_calculator',10),
('6f171fd7-85ae-4c43-a092-2ee06ad43b31','service','installation',20)
on conflict do nothing;
insert into public.public_blog_events(article_id, locale, event_type, to_status, safe_metadata)
select '6f171fd7-85ae-4c43-a092-2ee06ad43b31', locale, 'published', 'published', jsonb_build_object('source','existing_public_guide') from (values('ru'),('ro')) locale(locale);

revoke all on function public.prevent_public_blog_event_mutation(), public.public_blog_content_is_safe(jsonb),
  public.public_blog_card(public.public_blog_articles, public.public_blog_localizations),
  public.list_public_blog_articles(text,text,integer,integer), public.get_public_blog_article(text,text),
  public.list_public_blog_for_product(uuid,text,integer), public.list_public_blog_for_category(uuid,text,integer),
  public.list_public_blog_sitemap_inventory(), public.list_admin_blog_articles(text,text,integer,integer),
  public.get_admin_blog_article(uuid,text),
  public.save_admin_blog_article(uuid,text,text,text,boolean,text,text,jsonb,text,text,text,text[],text[],text[],text[],integer,integer),
  public.set_admin_blog_hero(uuid,text,integer,text,integer,integer),
  public.transition_admin_blog_article(uuid,text,text,integer,text,text,text)
from public, anon, authenticated;
grant execute on function public.list_public_blog_articles(text,text,integer,integer), public.get_public_blog_article(text,text),
  public.list_public_blog_for_product(uuid,text,integer), public.list_public_blog_for_category(uuid,text,integer),
  public.list_public_blog_sitemap_inventory() to anon, authenticated, service_role;
grant execute on function public.list_admin_blog_articles(text,text,integer,integer), public.get_admin_blog_article(uuid,text),
  public.save_admin_blog_article(uuid,text,text,text,boolean,text,text,jsonb,text,text,text,text[],text[],text[],text[],integer,integer),
  public.set_admin_blog_hero(uuid,text,integer,text,integer,integer),
  public.transition_admin_blog_article(uuid,text,text,integer,text,text,text) to authenticated, service_role;

comment on table public.public_blog_articles is 'Stable public Blog identities; partner Knowledge remains a separate private domain.';
comment on table public.public_blog_events is 'Append-only audit history for governed public Blog changes.';
comment on function public.list_public_blog_articles(text,text,integer,integer) is 'Bounded anonymous-safe published Blog landing projection.';
comment on function public.get_public_blog_article(text,text) is 'One bounded published Blog aggregate with current public-safe relations.';

commit;
