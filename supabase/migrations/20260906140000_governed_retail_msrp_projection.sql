begin;

create or replace function public.get_product_price_projection_v2(
  p_company_id uuid,
  p_product_ids uuid[],
  p_external_price_type_ids text[]
)
returns table (
  id uuid,
  product_id uuid,
  company_id uuid,
  external_1c_price_type_id text,
  currency text,
  currency_status text,
  price_amount numeric,
  valid_from timestamptz,
  valid_to timestamptz,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  company_price_type text;
  requested_price_types text[];
  can_view_partner_price boolean;
  can_view_retail_price boolean;
begin
  select array_agg(distinct btrim(requested.price_type) order by btrim(requested.price_type))
  into requested_price_types
  from unnest(coalesce(p_external_price_type_ids, '{}'::text[])) requested(price_type)
  where nullif(btrim(requested.price_type), '') is not null;

  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or coalesce(array_length(p_product_ids, 1), 0) not between 1 and 250
    or coalesce(array_length(requested_price_types, 1), 0) not between 1 and 3
  then
    raise exception 'Commercial price projection access denied.' using errcode = '42501';
  end if;

  select company.external_1c_price_type_id
  into company_price_type
  from public.partner_companies company
  where company.id = p_company_id and company.status = 'active';

  can_view_partner_price := public.has_permission(
    p_company_id,
    'pricing.partner_price.view'
  );
  can_view_retail_price := public.has_permission(
    p_company_id,
    'pricing.retail_price.view'
  );

  if exists (
    select 1
    from unnest(requested_price_types) requested(price_type)
    where not (
      can_view_retail_price and requested.price_type in (
        'e181c772-93fc-11e9-94cb-000c2988d323',
        'd9c92519-658b-11e8-80d3-000c29a58b59'
      )
      or can_view_partner_price
        and company_price_type is not null
        and requested.price_type = company_price_type
    )
  ) then
    raise exception 'Commercial price projection access denied.' using errcode = '42501';
  end if;

  return query
  select
    price.id,
    price.product_id,
    price.company_id,
    price.external_1c_price_type_id,
    price.currency,
    price.currency_status,
    price.price_amount,
    price.valid_from,
    price.valid_to,
    price.is_active,
    price.created_at,
    price.updated_at
  from public.product_prices price
  where price.product_id = any(p_product_ids)
    and price.external_1c_price_type_id = any(requested_price_types)
    and price.is_active
    and price.is_published
    and price.valid_from <= now()
    and (price.valid_to is null or price.valid_to >= now())
    and (
      price.external_1c_price_type_id in (
        'e181c772-93fc-11e9-94cb-000c2988d323',
        'd9c92519-658b-11e8-80d3-000c29a58b59'
      ) and price.company_id is null
      or price.external_1c_price_type_id = company_price_type
        and (price.company_id is null or price.company_id = p_company_id)
    )
  order by price.product_id, price.external_1c_price_type_id,
    (price.company_id = p_company_id) desc, price.valid_from desc, price.id;
end;
$$;

revoke all on function public.get_product_price_projection_v2(uuid, uuid[], text[])
  from public, anon;
grant execute on function public.get_product_price_projection_v2(uuid, uuid[], text[])
  to authenticated;

create or replace function public.catalog_partner_page_v7(
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
  base_result := public.catalog_partner_page_v6(
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
    select page.item, (page.item ->> 'id')::uuid as product_id, page.ordinal
    from jsonb_array_elements(coalesce(base_result -> 'items', '[]'::jsonb))
      with ordinality page(item, ordinal)
  ),
  retail_prices as (
    select distinct on (price.product_id)
      price.product_id,
      price.price_amount,
      price.currency,
      price.currency_status,
      price.updated_at
    from public.product_prices price
    join page_items page on page.product_id = price.product_id
    where public.has_permission(p_company_id, 'pricing.retail_price.view')
      and price.company_id is null
      and price.external_1c_price_type_id = 'e181c772-93fc-11e9-94cb-000c2988d323'
      and price.is_active
      and price.is_published
      and price.currency_status = 'resolved'
      and upper(btrim(price.currency)) in ('MDL', '498')
      and price.price_amount > 0
      and price.valid_from <= now()
      and (price.valid_to is null or price.valid_to >= now())
    order by price.product_id, price.valid_from desc, price.updated_at desc, price.id
  )
  select coalesce(
    jsonb_agg(
      page.item || jsonb_build_object(
        'retail_price_amount', retail.price_amount,
        'retail_price_currency', case when retail.price_amount is null then null else 'MDL' end,
        'retail_price_currency_status', retail.currency_status,
        'retail_price_updated_at', retail.updated_at
      ) order by page.ordinal
    ),
    '[]'::jsonb
  )
  into enriched_items
  from page_items page
  left join retail_prices retail on retail.product_id = page.product_id;

  return base_result || jsonb_build_object('items', enriched_items);
end;
$$;

revoke all on function public.catalog_partner_page_v7(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_page_v7(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) to authenticated;

comment on function public.get_product_price_projection_v2(uuid, uuid[], text[]) is
  'Returns a bounded authorized batch of independent governed partner, RETAIL MDL, and MSRP USD price-type truths.';
comment on function public.catalog_partner_page_v7(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer
) is
  'Returns the partner catalog page with independent canonical RETAIL MDL and MSRP USD projections in one RPC.';

commit;
