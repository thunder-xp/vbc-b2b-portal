begin;

create or replace function public.catalog_partner_page_category_set_base(
  p_company_id uuid,
  p_category_id uuid default null,
  p_category_ids uuid[] default null,
  p_brand_id uuid default null,
  p_search text default null,
  p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_merchandising_label text default null,
  p_sort text default 'default',
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  partner_price_type_ref text;
  can_view_partner_price boolean;
  can_view_retail_price boolean;
  can_view_stock boolean;
  effective_sort text;
begin
  if p_category_id is not null and coalesce(cardinality(p_category_ids), 0) > 0
    or coalesce(cardinality(p_category_ids), 0) > 3
    or exists (
      select 1
      from unnest(coalesce(p_category_ids, '{}'::uuid[])) requested(category_id)
      left join public.catalog_categories category
        on category.id = requested.category_id
        and category.is_active
      where category.id is null
        or category.external_1c_id is null
        or category.external_1c_id <> all(array[
        '772c9d50-3298-11e9-a216-000c29411cbe',
        'fe802fd7-c941-11e8-80eb-000c29a58b59',
        'f5379005-2857-11e9-80ed-000c29a58b59',
        'b6b833a8-c5fb-11ec-049f-7239d3b7bd5c',
        '772c9d4d-3298-11e9-a216-000c29411cbe',
        'eedee611-3218-11e9-a216-000c29411cbe',
        '9ad481a2-99c1-11e9-804d-000c2988d323',
        '772c9d4b-3298-11e9-a216-000c29411cbe',
        '3b8d3fa9-6457-11e8-80d2-000c29a58b59',
        '72474ac1-e0fc-11e9-920e-000c29cf9dd4',
        '0779591b-9b16-11e8-80e6-000c29a58b59',
        'f5379003-2857-11e9-80ed-000c29a58b59',
        'f5379001-2857-11e9-80ed-000c29a58b59',
        'eedee60b-3218-11e9-a216-000c29411cbe'
      ]::text[])
    )
  then
    raise exception 'Invalid catalog category set.' using errcode = '22023';
  end if;

  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
  then
    raise exception 'Catalog access denied.' using errcode = '42501';
  end if;

  if p_sort not in (
      'default', 'availability_asc', 'availability_desc',
      'price_asc', 'price_desc', 'markup_asc', 'markup_desc'
    )
    or p_availability not in ('all', 'in_stock', 'expected')
    or (p_merchandising_label is not null
      and p_merchandising_label not in ('NEW', 'TOP', 'HOT', 'REPLENISHMENT'))
    or p_limit not between 1 and 48
    or p_offset < 0
    or jsonb_typeof(coalesce(p_filters, '{}'::jsonb)) <> 'object'
  then
    raise exception 'Invalid catalog page input.' using errcode = '22023';
  end if;

  select external_1c_price_type_id
  into partner_price_type_ref
  from public.partner_companies
  where id = p_company_id and status = 'active';

  can_view_partner_price :=
    public.has_permission(p_company_id, 'pricing.partner_price.view');
  can_view_retail_price :=
    public.has_permission(p_company_id, 'pricing.retail_price.view');
  can_view_stock := public.has_permission(p_company_id, 'stock.view');

  if p_availability <> 'all' and not can_view_stock then
    raise exception 'Stock filter access denied.' using errcode = '42501';
  end if;

  effective_sort := case
    when not can_view_partner_price
      and p_sort in ('price_asc', 'price_desc', 'markup_asc', 'markup_desc')
      then 'default'
    else p_sort
  end;

  with recursive category_scope as (
    select category.id
    from public.catalog_categories category
    where category.is_active
      and (
        (p_category_id is not null and category.id = p_category_id)
        or (
          p_category_id is null
          and coalesce(cardinality(p_category_ids), 0) > 0
          and category.id = any(p_category_ids)
        )
      )
    union all
    select child.id
    from public.catalog_categories child
    join category_scope parent on child.parent_id = parent.id
    where child.is_active
  ),
  rates as (
    select
      max(rate) filter (
        where can_view_partner_price
          and purpose = 'partner_price_usd_to_mdl'
      ) as partner_rate,
      max(rate) filter (
        where can_view_retail_price
          and purpose = 'retail_price_usd_to_mdl'
      ) as retail_rate,
      max(published_at) filter (
        where can_view_partner_price
          and purpose = 'partner_price_usd_to_mdl'
      ) as partner_rate_published_at,
      max(published_at) filter (
        where can_view_retail_price
          and purpose = 'retail_price_usd_to_mdl'
      ) as retail_rate_published_at
    from public.commercial_exchange_rates
    where is_active
      and is_published
      and purpose in (
        'partner_price_usd_to_mdl',
        'retail_price_usd_to_mdl'
      )
  ),
  filtered as (
    select
      product.id,
      product.sku,
      product.name,
      product.slug,
      product.short_description,
      coalesce(product.image_source_url, product.image_url) as image_url,
      product.sort_order,
      brand.id as brand_id,
      brand.name as brand_name,
      brand.slug as brand_slug,
      category.id as category_id,
      category.parent_id as category_parent_id,
      category.name as category_name,
      category.slug as category_slug,
      case
        when nullif(btrim(p_search), '') is null then 0
        when lower(product.sku) = lower(btrim(p_search)) then 0
        when lower(product.sku) like lower(btrim(p_search)) || '%' then 1
        when product.name ilike '%' || btrim(p_search) || '%' then 2
        when brand.name ilike '%' || btrim(p_search) || '%' then 3
        else 4
      end as search_rank
    from public.catalog_products product
    left join public.catalog_brands brand
      on brand.id = product.brand_id and brand.is_active
    left join public.catalog_categories category
      on category.id = product.category_id and category.is_active
    where product.is_active
      and product.is_visible
      and (
        (
          p_category_id is null
          and coalesce(cardinality(p_category_ids), 0) = 0
        )
        or product.category_id in (select id from category_scope)
      )
      and (p_brand_id is null or product.brand_id = p_brand_id)
      and (
        nullif(btrim(p_search), '') is null
        or lower(product.sku) = lower(btrim(p_search))
        or lower(product.sku) like lower(btrim(p_search)) || '%'
        or product.name ilike '%' || btrim(p_search) || '%'
        or brand.name ilike '%' || btrim(p_search) || '%'
        or (
          char_length(btrim(p_search)) >= 3
          and product.short_description ilike '%' || btrim(p_search) || '%'
        )
      )
      and not exists (
        select 1
        from jsonb_each(coalesce(p_filters, '{}'::jsonb)) selected_filter
        where not exists (
          select 1
          from public.catalog_product_attributes attribute
          where attribute.product_id = product.id
            and attribute.is_visible
            and attribute.is_filterable
            and attribute.attribute_key = selected_filter.key
            and attribute.display_value in (
              select jsonb_array_elements_text(selected_filter.value)
            )
        )
      )
      and (
        p_merchandising_label is null
        or (p_merchandising_label = 'REPLENISHMENT' and exists (
          select 1
          from public.current_warehouse_replenishment_items replenishment
          where replenishment.singleton_key = 1
            and replenishment.product_id = product.id
        ))
        or (p_merchandising_label <> 'REPLENISHMENT' and exists (
          select 1
          from public.product_merchandising_assignments assignment
          where assignment.product_id = product.id
            and assignment.label_code = p_merchandising_label
            and assignment.source in ('manual', 'one_c')
            and assignment.is_active
            and assignment.is_curated_visible
            and assignment.starts_at <= now()
            and (assignment.ends_at is null or assignment.ends_at > now())
        ))
      )
      and (
        p_availability = 'all'
        or (
          p_availability = 'in_stock'
          and exists (
            select 1
            from public.product_stock_totals stock_filter
            where stock_filter.product_id = product.id
              and stock_filter.is_published
              and stock_filter.available_quantity > 0
          )
        )
        or (
          p_availability = 'expected'
          and exists (
            select 1
            from public.product_supplier_arrivals arrival_filter
            where arrival_filter.product_id = product.id
              and arrival_filter.is_published
              and arrival_filter.expected_quantity > 0
              and arrival_filter.expected_arrival_date >= current_date
          )
        )
      )
  ),
  commercial as (
    select
      filtered.*,
      partner_price.price_amount as partner_price_amount,
      partner_price.currency as partner_price_currency,
      partner_price.currency_status as partner_price_currency_status,
      partner_price.updated_at as partner_price_updated_at,
      retail_price.price_amount as msrp_price_amount,
      case
        when retail_price.price_amount is null then null
        else coalesce(nullif(btrim(retail_price.currency), ''), 'USD')
      end as msrp_price_currency,
      retail_price.currency_status as msrp_price_currency_status,
      retail_price.updated_at as msrp_price_updated_at,
      stock.physical_quantity,
      stock.reserved_quantity,
      stock.available_quantity,
      stock.incoming_quantity,
      stock.has_variant_stock,
      stock.synced_at as stock_synced_at,
      arrival.expected_arrival_date,
      arrival.expected_quantity,
      arrival.published_at as arrival_published_at,
      rates.partner_rate,
      rates.retail_rate,
      rates.partner_rate_published_at,
      rates.retail_rate_published_at,
      labels.label_codes as merchandising_labels,
      case
        when partner_price.price_amount > 0 then partner_price.price_amount
      end as price_sort_value,
      case
        when partner_price.price_amount > 0
          and partner_price.currency_status = 'resolved'
          and upper(partner_price.currency) in ('USD', '840', '999')
          and retail_price.price_amount > 0
          and rates.partner_rate > 0
          and rates.retail_rate > 0
        then (
          (round(retail_price.price_amount * rates.retail_rate)
            / rates.partner_rate)
          / (round(partner_price.price_amount * rates.partner_rate)
            / rates.retail_rate)
          - 1
        ) * 100
      end as markup_sort_value
    from filtered
    cross join rates
    left join lateral (
      select price.price_amount, price.currency, price.currency_status,
        price.updated_at
      from public.product_prices price
      where can_view_partner_price
        and partner_price_type_ref is not null
        and price.product_id = filtered.id
        and price.external_1c_price_type_id = partner_price_type_ref
        and price.is_active
        and price.is_published
        and price.valid_from <= now()
        and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by (price.company_id = p_company_id) desc,
        price.valid_from desc, price.id
      limit 1
    ) partner_price on true
    left join lateral (
      select price.price_amount, price.currency, price.currency_status,
        price.updated_at
      from public.product_prices price
      where can_view_retail_price
        and price.product_id = filtered.id
        and price.external_1c_price_type_id =
          'd9c92519-658b-11e8-80d3-000c29a58b59'
        and price.is_active
        and price.is_published
        and price.valid_from <= now()
        and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by (price.company_id = p_company_id) desc,
        price.valid_from desc, price.id
      limit 1
    ) retail_price on true
    left join public.product_stock_totals stock
      on can_view_stock
      and stock.product_id = filtered.id
      and stock.is_published
    left join lateral (
      select supplier.expected_arrival_date,
        sum(supplier.expected_quantity) as expected_quantity,
        max(supplier.published_at) as published_at
      from public.product_supplier_arrivals supplier
      where can_view_stock
        and supplier.product_id = filtered.id
        and supplier.external_characteristic_ref =
          '00000000-0000-0000-0000-000000000000'
        and supplier.is_published
        and supplier.expected_quantity > 0
        and supplier.expected_arrival_date >= current_date
      group by supplier.expected_arrival_date
      order by supplier.expected_arrival_date
      limit 1
    ) arrival on true
    left join lateral (
      select coalesce(
        jsonb_agg(label.label_code order by label.priority desc,
          label.label_code),
        '[]'::jsonb
      ) as label_codes
      from (
        select assignment.label_code, max(assignment.priority) as priority
        from public.product_merchandising_assignments assignment
        where assignment.product_id = filtered.id
          and assignment.source in ('manual', 'one_c')
          and assignment.is_active
          and assignment.is_curated_visible
          and assignment.starts_at <= now()
          and (assignment.ends_at is null or assignment.ends_at > now())
        group by assignment.label_code
      ) label
    ) labels on true
  ),
  ranked as (
    select commercial.*, row_number() over (order by
      case when nullif(btrim(p_search), '') is not null
        then commercial.search_rank end,
      case when effective_sort = 'default'
        then commercial.sort_order end,
      case when effective_sort = 'availability_asc'
        then commercial.available_quantity end asc nulls last,
      case when effective_sort = 'availability_desc'
        then commercial.available_quantity end desc nulls last,
      case when effective_sort = 'price_asc'
        then commercial.price_sort_value end asc nulls last,
      case when effective_sort = 'price_desc'
        then commercial.price_sort_value end desc nulls last,
      case when effective_sort = 'markup_asc'
        then commercial.markup_sort_value end asc nulls last,
      case when effective_sort = 'markup_desc'
        then commercial.markup_sort_value end desc nulls last,
      lower(commercial.name),
      commercial.id
    ) as ordinal
    from commercial
  ),
  page_rows as (
    select *
    from ranked
    where ordinal > p_offset and ordinal <= p_offset + p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'sku', page.sku,
        'name', page.name,
        'slug', page.slug,
        'image_url', page.image_url,
        'brand_id', page.brand_id,
        'brand_name', page.brand_name,
        'brand_slug', page.brand_slug,
        'category_id', page.category_id,
        'category_parent_id', page.category_parent_id,
        'category_name', page.category_name,
        'category_slug', page.category_slug,
        'partner_price_amount', page.partner_price_amount,
        'partner_price_currency', page.partner_price_currency,
        'partner_price_currency_status', page.partner_price_currency_status,
        'partner_price_updated_at', page.partner_price_updated_at,
        'msrp_price_amount', page.msrp_price_amount,
        'msrp_price_currency', page.msrp_price_currency,
        'msrp_price_currency_status', page.msrp_price_currency_status,
        'msrp_price_updated_at', page.msrp_price_updated_at,
        'physical_quantity', page.physical_quantity,
        'reserved_quantity', page.reserved_quantity,
        'available_quantity', page.available_quantity,
        'incoming_quantity', page.incoming_quantity,
        'has_variant_stock', page.has_variant_stock,
        'stock_synced_at', page.stock_synced_at,
        'expected_arrival_date', page.expected_arrival_date,
        'expected_quantity', page.expected_quantity,
        'arrival_published_at', page.arrival_published_at,
        'partner_rate', page.partner_rate,
        'retail_rate', page.retail_rate,
        'partner_rate_published_at', page.partner_rate_published_at,
        'retail_rate_published_at', page.retail_rate_published_at,
        'can_view_stock', can_view_stock,
        'merchandising_labels', page.merchandising_labels
      ) order by page.ordinal)
      from page_rows page
    ), '[]'::jsonb),
    'totalCount', (select count(*) from commercial)
  )
  into result;

  return result;
end;
$$;

create or replace function public.catalog_partner_page_v6(
  p_company_id uuid,
  p_category_id uuid default null,
  p_category_ids uuid[] default null,
  p_brand_id uuid default null,
  p_search text default null,
  p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_merchandising_label text default null,
  p_sort text default 'default',
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_result jsonb;
  enriched_items jsonb;
begin
  base_result := public.catalog_partner_page_category_set_base(
    p_company_id,
    p_category_id,
    p_category_ids,
    p_brand_id,
    p_search,
    p_availability,
    p_filters,
    p_merchandising_label,
    p_sort,
    p_limit,
    p_offset
  );

  with page_items as (
    select
      page.item,
      (page.item ->> 'id')::uuid as product_id,
      page.ordinal
    from jsonb_array_elements(coalesce(base_result -> 'items', '[]'::jsonb))
      with ordinality page(item, ordinal)
  ),
  ranked_characteristics as (
    select
      attribute.product_id,
      attribute.attribute_key,
      attribute.label,
      public.catalog_public_attribute_value(
        attribute.resolution_status,
        attribute.display_value,
        attribute.resolved_display_value
      ) as display_value,
      btrim(attribute.display_value) as filter_value,
      attribute.value_type,
      row_number() over (
        partition by attribute.product_id
        order by
          public.catalog_card_characteristic_priority(attribute.label),
          attribute.label,
          attribute.attribute_key
      ) as characteristic_rank
    from page_items page
    join public.catalog_product_attributes attribute
      on attribute.product_id = page.product_id
    where attribute.is_visible
      and attribute.is_filterable
      and attribute.resolution_status in ('not_required', 'resolved')
      and attribute.attribute_key ~ '^property_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and nullif(btrim(attribute.display_value), '') is not null
      and char_length(btrim(attribute.display_value)) <= 160
      and btrim(attribute.display_value) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.catalog_public_attribute_value(
        attribute.resolution_status,
        attribute.display_value,
        attribute.resolved_display_value
      ) is not null
  ),
  characteristics_by_product as (
    select
      characteristic.product_id,
      jsonb_agg(
        jsonb_build_object(
          'key', characteristic.attribute_key,
          'label', characteristic.label,
          'value', characteristic.display_value,
          'filterValue', characteristic.filter_value,
          'isFilterable', true,
          'valueType', characteristic.value_type
        ) order by characteristic.characteristic_rank
      ) as characteristics
    from ranked_characteristics characteristic
    where characteristic.characteristic_rank <= 5
    group by characteristic.product_id
  )
  select coalesce(
    jsonb_agg(
      page.item || jsonb_build_object(
        'key_characteristics',
        coalesce(characteristics.characteristics, '[]'::jsonb)
      ) order by page.ordinal
    ),
    '[]'::jsonb
  )
  into enriched_items
  from page_items page
  left join characteristics_by_product characteristics
    on characteristics.product_id = page.product_id;

  return base_result || jsonb_build_object('items', enriched_items);
end;
$$;

create or replace function public.catalog_partner_facets_v3(
  p_company_id uuid,
  p_category_id uuid default null,
  p_category_ids uuid[] default null,
  p_brand_id uuid default null,
  p_search text default null,
  p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_selection text default null,
  p_max_values integer default 30
)
returns table(
  attribute_key text,
  label text,
  display_value text,
  product_count bigint,
  product_coverage bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_category_id is not null and coalesce(cardinality(p_category_ids), 0) > 0
    or coalesce(cardinality(p_category_ids), 0) > 3
    or exists (
      select 1
      from unnest(coalesce(p_category_ids, '{}'::uuid[])) requested(category_id)
      left join public.catalog_categories category
        on category.id = requested.category_id
        and category.is_active
      where category.id is null
        or category.external_1c_id is null
        or category.external_1c_id <> all(array[
        '772c9d50-3298-11e9-a216-000c29411cbe',
        'fe802fd7-c941-11e8-80eb-000c29a58b59',
        'f5379005-2857-11e9-80ed-000c29a58b59',
        'b6b833a8-c5fb-11ec-049f-7239d3b7bd5c',
        '772c9d4d-3298-11e9-a216-000c29411cbe',
        'eedee611-3218-11e9-a216-000c29411cbe',
        '9ad481a2-99c1-11e9-804d-000c2988d323',
        '772c9d4b-3298-11e9-a216-000c29411cbe',
        '3b8d3fa9-6457-11e8-80d2-000c29a58b59',
        '72474ac1-e0fc-11e9-920e-000c29cf9dd4',
        '0779591b-9b16-11e8-80e6-000c29a58b59',
        'f5379003-2857-11e9-80ed-000c29a58b59',
        'f5379001-2857-11e9-80ed-000c29a58b59',
        'eedee60b-3218-11e9-a216-000c29411cbe'
      ]::text[])
    )
  then
    raise exception 'Invalid catalog category set.' using errcode = '22023';
  end if;

  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
    or (p_availability <> 'all' and not public.has_permission(p_company_id, 'stock.view'))
  then
    raise exception 'Catalog facet access denied.' using errcode = '42501';
  end if;

  if p_availability not in ('all', 'in_stock', 'expected')
    or (p_selection is not null and p_selection not in ('NEW', 'TOP', 'HOT', 'REPLENISHMENT'))
    or p_max_values not between 1 and 50
    or jsonb_typeof(coalesce(p_filters, '{}'::jsonb)) <> 'object'
  then
    raise exception 'Invalid catalog facet input.' using errcode = '22023';
  end if;

  return query
  with recursive category_scope as (
    select c.id
    from public.catalog_categories c
    where c.is_active
      and (
        (p_category_id is not null and c.id = p_category_id)
        or (
          p_category_id is null
          and coalesce(cardinality(p_category_ids), 0) > 0
          and c.id = any(p_category_ids)
        )
      )
    union all
    select child.id
    from public.catalog_categories child
    join category_scope parent on child.parent_id = parent.id
    where child.is_active
  ),
  scoped_products as (
    select p.id
    from public.catalog_products p
    left join public.catalog_brands b on b.id = p.brand_id and b.is_active
    where p.is_active and p.is_visible
      and (
        (
          p_category_id is null
          and coalesce(cardinality(p_category_ids), 0) = 0
        )
        or p.category_id in (select id from category_scope)
      )
      and (p_brand_id is null or p.brand_id = p_brand_id)
      and (
        p_selection is null
        or (p_selection = 'REPLENISHMENT' and exists (
          select 1
          from public.current_warehouse_replenishment_items replenishment
          where replenishment.singleton_key = 1
            and replenishment.product_id = p.id
        ))
        or (p_selection <> 'REPLENISHMENT' and exists (
          select 1
          from public.product_merchandising_assignments assignment
          where assignment.product_id = p.id
            and assignment.label_code = p_selection
            and assignment.source in ('manual', 'one_c')
            and assignment.is_active
            and assignment.is_curated_visible
            and assignment.starts_at <= now()
            and (assignment.ends_at is null or assignment.ends_at > now())
        ))
      )
      and (
        nullif(btrim(p_search), '') is null
        or lower(p.sku) = lower(btrim(p_search))
        or lower(p.sku) like lower(btrim(p_search)) || '%'
        or p.name ilike '%' || btrim(p_search) || '%'
        or b.name ilike '%' || btrim(p_search) || '%'
        or (char_length(btrim(p_search)) >= 3 and p.short_description ilike '%' || btrim(p_search) || '%')
      )
      and (
        p_availability = 'all'
        or (p_availability = 'in_stock' and exists (
          select 1 from public.product_stock_totals stock
          where stock.product_id = p.id and stock.is_published and stock.available_quantity > 0
        ))
        or (p_availability = 'expected' and exists (
          select 1 from public.product_supplier_arrivals arrival
          where arrival.product_id = p.id and arrival.is_published
            and arrival.expected_quantity > 0 and arrival.expected_arrival_date >= current_date
        ))
      )
  ),
  counted as (
    select
      candidate.attribute_key,
      min(candidate.label) as label,
      public.catalog_public_attribute_value(
        candidate.resolution_status,
        candidate.display_value,
        candidate.resolved_display_value
      ) as display_value,
      count(distinct product.id) as product_count
    from scoped_products product
    join public.catalog_product_attributes candidate on candidate.product_id = product.id
    where candidate.is_filterable and candidate.is_visible
      and public.catalog_public_attribute_value(
        candidate.resolution_status,
        candidate.display_value,
        candidate.resolved_display_value
      ) is not null
      and not exists (
        select 1
        from jsonb_each(coalesce(p_filters, '{}'::jsonb)) selected_filter
        where selected_filter.key <> candidate.attribute_key
          and not exists (
            select 1
            from public.catalog_product_attributes selected
            where selected.product_id = product.id
              and selected.attribute_key = selected_filter.key
              and selected.is_filterable and selected.is_visible
              and public.catalog_public_attribute_value(
                selected.resolution_status,
                selected.display_value,
                selected.resolved_display_value
              ) in (select jsonb_array_elements_text(selected_filter.value))
          )
      )
    group by
      candidate.attribute_key,
      public.catalog_public_attribute_value(
        candidate.resolution_status,
        candidate.display_value,
        candidate.resolved_display_value
      )
  ),
  ranked as (
    select
      counted.*,
      sum(counted.product_count) over (partition by counted.attribute_key) as product_coverage,
      row_number() over (
        partition by counted.attribute_key
        order by counted.product_count desc, counted.display_value
      ) as value_rank
    from counted
  )
  select
    ranked.attribute_key,
    ranked.label,
    ranked.display_value,
    ranked.product_count,
    ranked.product_coverage::bigint
  from ranked
  where ranked.value_rank <= p_max_values
    or coalesce(p_filters -> ranked.attribute_key, '[]'::jsonb) ? ranked.display_value
  order by ranked.attribute_key, ranked.product_count desc, ranked.display_value;
end;
$$;

revoke all on function public.catalog_partner_page_category_set_base(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) from public, anon, authenticated;

revoke all on function public.catalog_partner_page_v6(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_page_v6(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) to authenticated;

revoke all on function public.catalog_partner_facets_v3(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, integer
) from public, anon;
grant execute on function public.catalog_partner_facets_v3(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, integer
) to authenticated;

comment on function public.catalog_partner_page_v6(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) is 'Returns one bounded permission-aware partner catalog page for either one canonical category or an allowlisted SECURITYPARK DISTRIBUTION category set.';

comment on function public.catalog_partner_facets_v3(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, integer
) is 'Returns bounded partner catalog facets for either one canonical category or an allowlisted SECURITYPARK DISTRIBUTION category set.';

commit;
