-- Partner-scoped catalog card page. Commercial data stays behind existing RLS
-- and permission checks; sort names are allowlisted and no dynamic SQL is used.
create or replace function public.catalog_partner_page(
  p_company_id uuid,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_search text default null,
  p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'default',
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb;
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
  ) or p_availability not in ('all', 'in_stock', 'expected')
    or p_limit not between 1 and 48 or p_offset < 0
    or jsonb_typeof(coalesce(p_filters, '{}'::jsonb)) <> 'object'
  then
    raise exception 'Invalid catalog page input.' using errcode = '22023';
  end if;

  with recursive category_scope as (
    select c.id
    from public.catalog_categories c
    where p_category_id is not null and c.id = p_category_id and c.is_active
    union all
    select child.id
    from public.catalog_categories child
    join category_scope parent on child.parent_id = parent.id
    where child.is_active
  ),
  access_scope as (
    select
      pc.external_1c_price_type_id as partner_price_type_ref,
      public.has_permission(p_company_id, 'prices.view') as can_view_prices,
      public.has_permission(p_company_id, 'stock.view') as can_view_stock
    from public.partner_companies pc
    where pc.id = p_company_id and pc.status = 'active'
  ),
  rates as (
    select
      max(rate) filter (where purpose = 'partner_price_usd_to_mdl') as partner_rate,
      max(rate) filter (where purpose = 'retail_price_usd_to_mdl') as retail_rate,
      max(published_at) filter (where purpose = 'partner_price_usd_to_mdl') as partner_rate_published_at,
      max(published_at) filter (where purpose = 'retail_price_usd_to_mdl') as retail_rate_published_at
    from public.commercial_exchange_rates
    where is_active and is_published
      and purpose in ('partner_price_usd_to_mdl', 'retail_price_usd_to_mdl')
  ),
  filtered as (
    select
      p.id,
      p.sku,
      p.name,
      p.slug,
      p.short_description,
      p.image_url,
      p.sort_order,
      b.id as brand_id,
      b.name as brand_name,
      b.slug as brand_slug,
      c.id as category_id,
      c.parent_id as category_parent_id,
      c.name as category_name,
      c.slug as category_slug,
      case
        when nullif(btrim(p_search), '') is null then 0
        when lower(p.sku) = lower(btrim(p_search)) then 0
        when lower(p.sku) like lower(btrim(p_search)) || '%' then 1
        when p.name ilike '%' || btrim(p_search) || '%' then 2
        when b.name ilike '%' || btrim(p_search) || '%' then 3
        else 4
      end as search_rank
    from public.catalog_products p
    left join public.catalog_brands b on b.id = p.brand_id and b.is_active
    left join public.catalog_categories c on c.id = p.category_id and c.is_active
    where p.is_active and p.is_visible
      and (p_category_id is null or p.category_id in (select id from category_scope))
      and (p_brand_id is null or p.brand_id = p_brand_id)
      and (
        nullif(btrim(p_search), '') is null
        or lower(p.sku) = lower(btrim(p_search))
        or lower(p.sku) like lower(btrim(p_search)) || '%'
        or p.name ilike '%' || btrim(p_search) || '%'
        or b.name ilike '%' || btrim(p_search) || '%'
        or (char_length(btrim(p_search)) >= 3 and p.short_description ilike '%' || btrim(p_search) || '%')
      )
      and not exists (
        select 1
        from jsonb_each(coalesce(p_filters, '{}'::jsonb)) selected_filter
        where not exists (
          select 1
          from public.catalog_product_attributes attribute
          where attribute.product_id = p.id
            and attribute.is_visible
            and attribute.is_filterable
            and attribute.attribute_key = selected_filter.key
            and attribute.display_value in (
              select jsonb_array_elements_text(selected_filter.value)
            )
        )
      )
      and (
        p_availability = 'all'
        or (
          p_availability = 'in_stock'
          and exists (
            select 1 from public.product_stock_totals stock_filter
            where stock_filter.product_id = p.id
              and stock_filter.is_published
              and stock_filter.available_quantity > 0
          )
        )
        or (
          p_availability = 'expected'
          and exists (
            select 1 from public.product_supplier_arrivals arrival_filter
            where arrival_filter.product_id = p.id
              and arrival_filter.is_published
              and arrival_filter.expected_quantity > 0
              and arrival_filter.expected_arrival_date >= current_date
          )
        )
      )
  ),
  commercial as (
    select
      f.*,
      partner_price.price_amount as partner_price_amount,
      partner_price.currency as partner_price_currency,
      partner_price.currency_status as partner_price_currency_status,
      partner_price.updated_at as partner_price_updated_at,
      msrp_price.price_amount as msrp_price_amount,
      msrp_price.currency as msrp_price_currency,
      msrp_price.currency_status as msrp_price_currency_status,
      msrp_price.updated_at as msrp_price_updated_at,
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
      case
        when partner_price.price_amount > 0 then partner_price.price_amount
      end as price_sort_value,
      case
        when partner_price.price_amount > 0
          and partner_price.currency_status = 'resolved'
          and upper(partner_price.currency) in ('USD', '840', '999')
          and msrp_price.price_amount > 0
          and rates.partner_rate > 0 and rates.retail_rate > 0
        then (
          (round(msrp_price.price_amount * rates.retail_rate) / rates.partner_rate)
          / (round(partner_price.price_amount * rates.partner_rate) / rates.retail_rate)
          - 1
        ) * 100
      end as markup_sort_value
    from filtered f
    cross join access_scope access
    cross join rates
    left join lateral (
      select pp.*
      from public.product_prices pp
      where access.can_view_prices
        and access.partner_price_type_ref is not null
        and pp.product_id = f.id
        and pp.external_1c_price_type_id = access.partner_price_type_ref
        and pp.is_active and pp.is_published
        and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to >= now())
        and (pp.company_id is null or pp.company_id = p_company_id)
      order by (pp.company_id = p_company_id) desc, pp.valid_from desc, pp.id
      limit 1
    ) partner_price on true
    left join lateral (
      select pp.*
      from public.product_prices pp
      where access.can_view_prices
        and pp.product_id = f.id
        and pp.external_1c_price_type_id = 'd9c92519-658b-11e8-80d3-000c29a58b59'
        and pp.is_active and pp.is_published
        and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to >= now())
        and (pp.company_id is null or pp.company_id = p_company_id)
      order by (pp.company_id = p_company_id) desc, pp.valid_from desc, pp.id
      limit 1
    ) msrp_price on true
    left join public.product_stock_totals stock
      on access.can_view_stock and stock.product_id = f.id and stock.is_published
    left join lateral (
      select
        psa.expected_arrival_date,
        sum(psa.expected_quantity) as expected_quantity,
        max(psa.published_at) as published_at
      from public.product_supplier_arrivals psa
      where access.can_view_stock
        and psa.product_id = f.id
        and psa.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
        and psa.is_published and psa.expected_quantity > 0
        and psa.expected_arrival_date >= current_date
      group by psa.expected_arrival_date
      order by psa.expected_arrival_date
      limit 1
    ) arrival on true
  ),
  ranked as (
    select c.*, row_number() over (order by
      case when nullif(btrim(p_search), '') is not null then c.search_rank end,
      case when p_sort = 'default' then c.sort_order end,
      case when p_sort = 'availability_asc' then c.available_quantity end asc nulls last,
      case when p_sort = 'availability_desc' then c.available_quantity end desc nulls last,
      case when p_sort = 'price_asc' then c.price_sort_value end asc nulls last,
      case when p_sort = 'price_desc' then c.price_sort_value end desc nulls last,
      case when p_sort = 'markup_asc' then c.markup_sort_value end asc nulls last,
      case when p_sort = 'markup_desc' then c.markup_sort_value end desc nulls last,
      lower(c.name), c.id
    ) as ordinal
    from commercial c
  ),
  page_rows as (
    select * from ranked
    where ordinal > p_offset and ordinal <= p_offset + p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page_rows.id,
        'sku', page_rows.sku,
        'name', page_rows.name,
        'slug', page_rows.slug,
        'image_url', page_rows.image_url,
        'brand_id', page_rows.brand_id,
        'brand_name', page_rows.brand_name,
        'brand_slug', page_rows.brand_slug,
        'category_id', page_rows.category_id,
        'category_parent_id', page_rows.category_parent_id,
        'category_name', page_rows.category_name,
        'category_slug', page_rows.category_slug
      ) order by ordinal)
      from page_rows
    ), '[]'::jsonb),
    'totalCount', (select count(*) from commercial)
  ) into result
  ;

  return result;
end;
$$;

revoke all on function public.catalog_partner_page(uuid, uuid, uuid, text, text, jsonb, text, integer, integer)
  from public, anon;
grant execute on function public.catalog_partner_page(uuid, uuid, uuid, text, text, jsonb, text, integer, integer)
  to authenticated;

comment on function public.catalog_partner_page(uuid, uuid, uuid, text, text, jsonb, text, integer, integer) is
  'Returns one bounded partner catalog card page with allowlisted database sorting. Prices remain company scoped and the function performs no writes.';
