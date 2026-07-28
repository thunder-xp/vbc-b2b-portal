-- Adds merchandising filtering and labels to the existing partner catalog
-- aggregate. Filtering happens before sorting and pagination.
create or replace function public.catalog_partner_page_v3(
  p_company_id uuid,
  p_category_id uuid default null,
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
set search_path = public
as $$
declare
  result jsonb;
  partner_price_type_ref text;
  can_view_partner_price boolean;
  can_view_retail_price boolean;
  can_view_stock boolean;
  effective_sort text;
begin
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
      and p_merchandising_label not in ('NEW', 'TOP', 'HOT'))
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
    where p_category_id is not null
      and category.id = p_category_id
      and category.is_active
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
        p_category_id is null
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
        or exists (
          select 1
          from public.product_merchandising_assignments assignment
          where assignment.product_id = product.id
            and assignment.label_code = p_merchandising_label
            and assignment.source in ('manual', 'one_c')
            and assignment.is_active
            and assignment.is_curated_visible
            and assignment.starts_at <= now()
            and (assignment.ends_at is null or assignment.ends_at > now())
        )
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

revoke all on function public.catalog_partner_page_v3(
  uuid, uuid, uuid, text, text, jsonb, text, text, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_page_v3(
  uuid, uuid, uuid, text, text, jsonb, text, text, integer, integer
) to authenticated;

comment on function public.catalog_partner_page_v3(
  uuid, uuid, uuid, text, text, jsonb, text, text, integer, integer
) is
  'Returns one permission-aware catalog page with active portal merchandising labels. Label filtering precedes sorting and pagination.';

create or replace function public.get_published_product_labels(
  p_company_id uuid,
  p_product_ids uuid[]
)
returns table (
  product_id uuid,
  label_code text,
  priority integer,
  starts_at timestamptz,
  ends_at timestamptz,
  source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
    or coalesce(array_length(p_product_ids, 1), 0) not between 1 and 100
  then
    raise exception 'Published merchandising access denied.'
      using errcode = '42501';
  end if;

  return query
  select assignment.product_id, assignment.label_code,
    max(assignment.priority)::integer,
    min(assignment.starts_at),
    max(assignment.ends_at),
    (array_agg(assignment.source order by
      case assignment.source when 'manual' then 0 else 1 end))[1]
  from public.product_merchandising_assignments assignment
  join public.catalog_products product on product.id = assignment.product_id
  where assignment.product_id = any(p_product_ids)
    and product.is_active
    and product.is_visible
    and assignment.source in ('manual', 'one_c')
    and assignment.is_active
    and assignment.is_curated_visible
    and assignment.starts_at <= now()
    and (assignment.ends_at is null or assignment.ends_at > now())
  group by assignment.product_id, assignment.label_code
  order by assignment.product_id, max(assignment.priority) desc,
    assignment.label_code;
end;
$$;

revoke all on function public.get_published_product_labels(uuid, uuid[])
  from public, anon;
grant execute on function public.get_published_product_labels(uuid, uuid[])
  to authenticated;
