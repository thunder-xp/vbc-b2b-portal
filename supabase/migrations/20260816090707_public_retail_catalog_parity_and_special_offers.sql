begin;

-- SPECIAL_OFFER is an explicit, audited Retail merchandising signal. It is
-- intentionally distinct from HOT and never derives from price ordering.
alter table public.product_merchandising_assignments
  drop constraint product_merchandising_assignments_label_code_check,
  drop constraint product_merchandising_assignments_check1,
  add constraint product_merchandising_assignments_label_code_check
    check (label_code in ('NEW', 'TOP', 'HOT', 'SPECIAL_OFFER')),
  add constraint product_merchandising_assignments_check1
    check (label_code not in ('HOT', 'SPECIAL_OFFER') or ends_at is not null);

alter table public.product_merchandising_audit_events
  drop constraint product_merchandising_audit_events_label_code_check,
  add constraint product_merchandising_audit_events_label_code_check
    check (label_code in ('NEW', 'TOP', 'HOT', 'SPECIAL_OFFER'));

alter table public.public_retail_products
  drop constraint public_retail_product_merchandising_labels_check,
  add column special_offer_priority integer null,
  add constraint public_retail_product_merchandising_labels_check
    check (merchandising_labels <@ array['NEW','TOP','HOT','SPECIAL_OFFER']::text[]),
  add constraint public_retail_product_special_offer_priority_check
    check (special_offer_priority is null or special_offer_priority between 0 and 1000);

create or replace function public.validate_product_merchandising_assignment()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.catalog_products product
    where product.id = new.product_id and product.is_active and product.is_visible
  ) and new.is_active and new.is_curated_visible then
    raise exception 'MERCHANDISING_PRODUCT_INACTIVE' using errcode = '23514';
  end if;
  if new.label_code in ('NEW', 'HOT', 'SPECIAL_OFFER')
    and new.source = 'manual' and new.ends_at is null then
    raise exception 'MERCHANDISING_EXPIRY_REQUIRED' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.product_id is distinct from old.product_id
      or new.label_code is distinct from old.label_code
      or new.source is distinct from old.source
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'MERCHANDISING_IDENTITY_IMMUTABLE' using errcode = '23514';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.manage_product_merchandising_v2(
  p_request_id uuid, p_operation text, p_product_ids uuid[], p_label_code text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_priority integer, p_reason text
)
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  target_product_id uuid;
  assignment public.product_merchandising_assignments%rowtype;
  affected integer := 0;
  normalized_reason text := btrim(p_reason);
  assignment_created boolean;
  result jsonb;
begin
  if actor_id is null or not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'MERCHANDISING_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_request_id is null or p_request_id = '00000000-0000-0000-0000-000000000000'::uuid
    or p_operation not in ('assign', 'revoke', 'hide', 'show')
    or p_label_code not in ('NEW', 'TOP', 'HOT', 'SPECIAL_OFFER')
    or coalesce(array_length(p_product_ids, 1), 0) not between 1 and 100
    or p_priority not between 0 and 1000
    or char_length(normalized_reason) not between 3 and 500
    or (p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, now()))
    or (p_operation in ('assign', 'show') and p_label_code in ('NEW', 'HOT', 'SPECIAL_OFFER') and p_ends_at is null)
  then raise exception 'MERCHANDISING_INVALID_PERIOD' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('merchandising-request:' || p_request_id::text, 0));
  if exists (select 1 from public.product_merchandising_audit_events event where event.request_id = p_request_id) then
    select jsonb_build_object(
      'affected', count(distinct event.product_id),
      'assignments', coalesce(jsonb_agg(jsonb_build_object(
        'productId', event.product_id, 'productName', product.name,
        'sku', product.sku, 'labelCode', event.label_code
      ) order by product.name, event.product_id), '[]'::jsonb)
    ) into result
    from public.product_merchandising_audit_events event
    join public.catalog_products product on product.id = event.product_id
    where event.request_id = p_request_id;
    return result;
  end if;

  foreach target_product_id in array p_product_ids loop
    if not exists (select 1 from public.catalog_products product where product.id = target_product_id) then
      raise exception 'MERCHANDISING_PRODUCT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_operation in ('assign', 'show') and not exists (
      select 1 from public.catalog_products product
      where product.id = target_product_id and product.is_active and product.is_visible
    ) then raise exception 'MERCHANDISING_PRODUCT_INACTIVE' using errcode = '23514'; end if;

    perform pg_advisory_xact_lock(hashtextextended(target_product_id::text || ':' || p_label_code || ':manual', 0));
    assignment := null;
    select existing.* into assignment
    from public.product_merchandising_assignments existing
    where existing.product_id = target_product_id and existing.label_code = p_label_code
      and existing.source = 'manual' and existing.is_active and existing.revoked_at is null
    for update;
    assignment_created := assignment.id is null;

    if p_operation in ('assign', 'show') then
      if assignment_created then
        insert into public.product_merchandising_assignments (
          product_id, label_code, starts_at, ends_at, priority,
          is_active, is_curated_visible, source, reason, created_by, updated_by
        ) values (
          target_product_id, p_label_code, coalesce(p_starts_at, now()), p_ends_at,
          p_priority, true, true, 'manual', normalized_reason, actor_id, actor_id
        ) returning * into assignment;
      else
        update public.product_merchandising_assignments current_assignment
        set starts_at = coalesce(p_starts_at, current_assignment.starts_at),
          ends_at = p_ends_at, priority = p_priority, is_curated_visible = true,
          reason = normalized_reason, updated_by = actor_id
        where current_assignment.id = assignment.id returning * into assignment;
      end if;
    elsif assignment.id is null then
      raise exception 'MERCHANDISING_DUPLICATE_ASSIGNMENT' using errcode = 'P0002';
    elsif p_operation = 'revoke' then
      update public.product_merchandising_assignments current_assignment
      set is_active = false, is_curated_visible = false, reason = normalized_reason,
        updated_by = actor_id, revoked_at = now()
      where current_assignment.id = assignment.id returning * into assignment;
    else
      update public.product_merchandising_assignments current_assignment
      set is_curated_visible = false, reason = normalized_reason, updated_by = actor_id
      where current_assignment.id = assignment.id returning * into assignment;
    end if;

    begin
      insert into public.product_merchandising_audit_events (
        request_id, assignment_id, product_id, actor_user_id, event_type,
        label_code, reason, safe_payload
      ) values (
        p_request_id, assignment.id, target_product_id, actor_id,
        case when assignment_created then 'assigned' when p_operation = 'assign' then 'updated'
          when p_operation = 'revoke' then 'revoked' when p_operation = 'hide' then 'hidden' else 'shown' end,
        p_label_code, normalized_reason, jsonb_build_object(
          'operation', p_operation, 'priority', assignment.priority,
          'starts_at', assignment.starts_at, 'ends_at', assignment.ends_at,
          'source', assignment.source, 'batch_size', array_length(p_product_ids, 1)
        )
      );
    exception when others then
      raise exception 'MERCHANDISING_AUDIT_FAILURE' using errcode = 'P0001';
    end;
    affected := affected + 1;
  end loop;

  select jsonb_build_object(
    'affected', affected,
    'assignments', coalesce(jsonb_agg(jsonb_build_object(
      'productId', product.id, 'productName', product.name,
      'sku', product.sku, 'labelCode', p_label_code
    ) order by product.name, product.id), '[]'::jsonb)
  ) into result from public.catalog_products product where product.id = any(p_product_ids);
  return result;
end;
$$;

-- Keep the partner catalog's three-label contract unchanged.
create or replace function public.get_published_product_labels(p_company_id uuid, p_product_ids uuid[])
returns table(product_id uuid, label_code text, priority integer, starts_at timestamptz, ends_at timestamptz, source text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
    or coalesce(array_length(p_product_ids, 1), 0) not between 1 and 100 then
    raise exception 'Published merchandising access denied.' using errcode = '42501';
  end if;
  return query
  select assignment.product_id, assignment.label_code, max(assignment.priority)::integer,
    min(assignment.starts_at), max(assignment.ends_at),
    (array_agg(assignment.source order by case assignment.source when 'manual' then 0 else 1 end))[1]
  from public.product_merchandising_assignments assignment
  join public.catalog_products product on product.id = assignment.product_id
  where assignment.product_id = any(p_product_ids) and product.is_active and product.is_visible
    and assignment.label_code in ('NEW', 'TOP', 'HOT')
    and assignment.source in ('manual', 'one_c') and assignment.is_active
    and assignment.is_curated_visible and assignment.starts_at <= now()
    and (assignment.ends_at is null or assignment.ends_at > now())
  group by assignment.product_id, assignment.label_code
  order by assignment.product_id, max(assignment.priority) desc, assignment.label_code;
end;
$$;

create or replace function public.get_published_product_merchandising(
  p_company_id uuid, p_label_code text default null, p_limit_per_label integer default 8
)
returns table(product_id uuid, label_code text, priority integer, starts_at timestamptz, ends_at timestamptz, source text)
language plpgsql stable security definer set search_path = public set row_security = off as $$
begin
  if auth.uid() is null or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view') then
    raise exception 'Catalog merchandising access denied.' using errcode = '42501';
  end if;
  if (p_label_code is not null and p_label_code not in ('NEW', 'TOP', 'HOT'))
    or p_limit_per_label not between 1 and 24 then
    raise exception 'Invalid merchandising projection input.' using errcode = '22023';
  end if;
  return query
  with eligible as (
    select assignment.product_id, assignment.label_code, assignment.priority,
      assignment.starts_at, assignment.ends_at, assignment.source,
      row_number() over (partition by assignment.label_code order by assignment.priority desc,
        assignment.updated_at desc, product.sort_order, lower(product.name), product.id) label_rank
    from public.product_merchandising_assignments assignment
    join public.catalog_products product on product.id = assignment.product_id and product.is_active and product.is_visible
    where assignment.label_code in ('NEW', 'TOP', 'HOT') and assignment.is_active
      and assignment.is_curated_visible and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c') and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
      and (p_label_code is null or assignment.label_code = p_label_code)
  )
  select eligible.product_id, eligible.label_code, eligible.priority,
    eligible.starts_at, eligible.ends_at, eligible.source
  from eligible where eligible.label_rank <= p_limit_per_label
  order by case eligible.label_code when 'TOP' then 1 when 'NEW' then 2 else 3 end, eligible.label_rank;
end;
$$;

create or replace function public.hydrate_public_retail_product_presentation(p_publication_id uuid)
returns void language plpgsql set search_path = public as $$
begin
  update public.public_retail_products product
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
    from public.public_retail_products inserted
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
end;
$$;

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
    or (p_mode is not null and p_mode not in ('popular','new','special','price_asc','price_desc'))
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
    ) then raise exception 'Public Retail list input is invalid.' using errcode = '22023'; end if;

  with current_products as (
    select product.* from public.public_retail_products product
    join public.public_retail_publications publication on publication.id = product.publication_id
    where publication.status = 'published'
      and (p_category_slug is null or exists (
        select 1 from jsonb_array_elements(product.category_path) path where path->>'slug' = p_category_slug))
      and (p_availability is null or product.availability = p_availability)
      and (p_search is null or lower(product.search_document) like '%' || lower(btrim(p_search)) || '%')
      and (nullif(btrim(p_search), '') is not null or p_mode is null
        or p_mode not in ('popular','new','special')
        or (p_mode = 'popular' and 'TOP' = any(product.merchandising_labels))
        or (p_mode = 'new' and 'NEW' = any(product.merchandising_labels))
        or (p_mode = 'special' and 'SPECIAL_OFFER' = any(product.merchandising_labels)))
      and not exists (
        select 1 from jsonb_each(p_facets) selected(key, values)
        where not exists (
          select 1 from jsonb_array_elements(product.specifications) specification
          where specification->>'key' = selected.key
            and specification->>'value' in (select jsonb_array_elements_text(selected.values))))
  ), page as (
    select * from current_products order by
      case when p_mode = 'popular' then popular_priority end desc nulls last,
      case when p_mode = 'new' then new_started_at end desc nulls last,
      case when p_mode = 'new' then new_priority end desc nulls last,
      case when p_mode = 'special' then special_offer_priority end desc nulls last,
      case when p_mode = 'price_asc' then retail_price_amount end asc,
      case when p_mode = 'price_desc' then retail_price_amount end desc,
      sort_order, name_ru, public_id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(public.build_public_retail_product_summary(page::public.public_retail_products, p_locale) order by
      case when p_mode = 'popular' then page.popular_priority end desc nulls last,
      case when p_mode = 'new' then page.new_started_at end desc nulls last,
      case when p_mode = 'new' then page.new_priority end desc nulls last,
      case when p_mode = 'special' then page.special_offer_priority end desc nulls last,
      case when p_mode = 'price_asc' then page.retail_price_amount end asc,
      case when p_mode = 'price_desc' then page.retail_price_amount end desc,
      page.sort_order, page.name_ru, page.public_id), '[]'::jsonb),
    'totalCount', (select count(*) from current_products), 'limit', p_limit, 'offset', p_offset
  ) into result from page;
  return coalesce(result, jsonb_build_object('items','[]'::jsonb,'totalCount',0,'limit',p_limit,'offset',p_offset));
end;
$$;

-- Contextual public facets follow the B2B rule: AND across facet keys, OR within
-- one key, and counts are calculated with every active key except the candidate.
create or replace function public.list_public_retail_facets_v2(
  p_category_slug text default null, p_search text default null,
  p_availability text default null, p_facets jsonb default '{}'::jsonb,
  p_locale text default 'ru', p_max_values integer default 30
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_locale not in ('ru', 'ro') or p_max_values not between 1 and 50
    or (p_availability is not null and p_availability not in ('in_stock','low_stock','available_to_order','unavailable','unknown'))
    or (p_search is not null and char_length(btrim(p_search)) > 100)
    or jsonb_typeof(p_facets) <> 'object'
    or (select count(*) from jsonb_object_keys(p_facets)) > 8
    or exists (
      select 1 from jsonb_each(p_facets) selected(key, values)
      where selected.key !~ '^property_[0-9a-f-]{36}$'
        or jsonb_typeof(selected.values) <> 'array'
        or jsonb_array_length(selected.values) not between 1 and 10
        or exists (select 1 from jsonb_array_elements(selected.values) value
          where jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 1000)
    ) then raise exception 'Public Retail facet input is invalid.' using errcode = '22023'; end if;

  with scoped_products as (
    select product.* from public.public_retail_products product
    join public.public_retail_publications publication on publication.id = product.publication_id
    where publication.status = 'published'
      and (p_category_slug is null or exists (
        select 1 from jsonb_array_elements(product.category_path) path where path->>'slug' = p_category_slug))
      and (p_availability is null or product.availability = p_availability)
      and (p_search is null or lower(product.search_document) like '%' || lower(btrim(p_search)) || '%')
  ), counted as (
    select candidate.value->>'key' facet_key,
      min(case when p_locale = 'ro' then coalesce(candidate.value->>'labelRo', candidate.value->>'labelRu')
        else candidate.value->>'labelRu' end) label,
      candidate.value->>'value' display_value,
      count(distinct product.public_id) product_count
    from scoped_products product
    cross join lateral jsonb_array_elements(product.specifications) candidate(value)
    where candidate.value->>'key' ~ '^property_[0-9a-f-]{36}$'
      and nullif(btrim(candidate.value->>'value'), '') is not null
      and not exists (
        select 1 from jsonb_each(p_facets) selected_filter
        where selected_filter.key <> candidate.value->>'key'
          and not exists (
            select 1 from jsonb_array_elements(product.specifications) selected(value)
            where selected.value->>'key' = selected_filter.key
              and selected.value->>'value' in (select jsonb_array_elements_text(selected_filter.value))))
    group by candidate.value->>'key', candidate.value->>'value'
  ), ranked as (
    select counted.*,
      sum(product_count) over (partition by facet_key) coverage,
      row_number() over (partition by facet_key order by product_count desc, display_value) value_rank
    from counted
  ), bounded as (
    select * from ranked
    where value_rank <= p_max_values
      or coalesce(p_facets -> facet_key, '[]'::jsonb) ? display_value
  ), grouped as (
    select facet_key, min(label) label, max(coverage)::integer coverage,
      jsonb_agg(jsonb_build_object('value', display_value, 'count', product_count)
        order by product_count desc, display_value) values
    from bounded group by facet_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', facet_key, 'label', label, 'values', values, 'coverage', coverage
  ) order by coverage desc, label, facet_key), '[]'::jsonb)
  into result from grouped;
  return result;
end;
$$;

alter table public.public_retail_products disable trigger prevent_public_retail_product_mutation;
select public.hydrate_public_retail_product_presentation(publication.id)
from public.public_retail_publications publication where publication.status = 'published';
alter table public.public_retail_products enable trigger prevent_public_retail_product_mutation;

revoke all on function public.list_public_retail_facets_v2(text,text,text,jsonb,text,integer)
  from public, authenticated;
grant execute on function public.list_public_retail_facets_v2(text,text,text,jsonb,text,integer)
  to anon, authenticated;

revoke all on function public.list_public_retail_facets(text,text)
  from public, anon, authenticated;

comment on function public.list_public_retail_facets_v2(text,text,text,jsonb,text,integer) is
  'Bounded contextual Public Retail facets using B2B AND-across/OR-within filter semantics over the public snapshot.';
comment on function public.list_public_retail_facets(text,text) is
  'Deprecated non-contextual Public Retail facet projection. Execution is revoked; use list_public_retail_facets_v2.';
comment on column public.public_retail_products.special_offer_priority is
  'Governed Retail-only SPECIAL_OFFER priority; never derived from price or partner commercial data.';

commit;
