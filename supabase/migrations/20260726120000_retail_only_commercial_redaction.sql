-- Enforce explicit commercial permissions at the database projection boundary.
-- Partner-facing callers use trusted, company-bound RPCs. Raw price rows remain
-- available only to internal synchronization operators and the service role.

drop policy if exists "Approved users can select permitted active product prices"
  on public.product_prices;
drop policy if exists "Internal sync users can select product prices"
  on public.product_prices;
create policy "Internal sync users can select product prices"
on public.product_prices
for select
to authenticated
using (public.can_sync_catalog_read_model());

drop policy if exists "Approved users can select published commercial exchange rates"
  on public.commercial_exchange_rates;
create policy "Approved users can select permitted commercial exchange rates"
on public.commercial_exchange_rates
for select
to authenticated
using (
  is_published
  and exists (
    select 1
    from public.company_memberships membership
    join public.partner_companies company
      on company.id = membership.company_id
    join public.user_profiles profile
      on profile.id = membership.user_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and company.status = 'active'
      and profile.status = 'active'
      and (
        (
          purpose = 'partner_price_usd_to_mdl'
          and public.has_permission(company.id, 'pricing.partner_price.view')
        )
        or (
          purpose = 'retail_price_usd_to_mdl'
          and public.has_permission(company.id, 'pricing.retail_price.view')
        )
      )
  )
);

create or replace function public.get_product_price_projection(
  p_company_id uuid,
  p_product_ids uuid[],
  p_external_price_type_id text
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
set search_path = public
as $$
declare
  company_price_type text;
  requested_price_type text := nullif(btrim(p_external_price_type_id), '');
  can_view_requested_price boolean := false;
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or coalesce(array_length(p_product_ids, 1), 0) not between 1 and 250
    or requested_price_type is null
  then
    raise exception 'Commercial price projection access denied.'
      using errcode = '42501';
  end if;

  select partner_company.external_1c_price_type_id
  into company_price_type
  from public.partner_companies partner_company
  where partner_company.id = p_company_id
    and partner_company.status = 'active';

  can_view_requested_price := (
    requested_price_type = 'd9c92519-658b-11e8-80d3-000c29a58b59'
    and public.has_permission(p_company_id, 'pricing.retail_price.view')
  ) or (
    company_price_type is not null
    and requested_price_type = company_price_type
    and public.has_permission(p_company_id, 'pricing.partner_price.view')
  );

  if not can_view_requested_price then
    raise exception 'Commercial price projection access denied.'
      using errcode = '42501';
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
    and price.external_1c_price_type_id = requested_price_type
    and price.is_active
    and price.is_published
    and price.valid_from <= now()
    and (price.valid_to is null or price.valid_to >= now())
    and (price.company_id is null or price.company_id = p_company_id)
  order by
    price.product_id,
    (price.company_id = p_company_id) desc,
    price.valid_from desc,
    price.id;
end;
$$;

revoke all on function public.get_product_price_projection(uuid, uuid[], text)
  from public, anon;
grant execute on function public.get_product_price_projection(uuid, uuid[], text)
  to authenticated;

create or replace function public.list_commercial_currency_codes(
  p_company_id uuid
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  company_price_type text;
  result text[];
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not (
      public.has_permission(p_company_id, 'pricing.partner_price.view')
      or public.has_permission(p_company_id, 'pricing.retail_price.view')
    )
  then
    raise exception 'Partner price access denied.' using errcode = '42501';
  end if;

  select external_1c_price_type_id
  into company_price_type
  from public.partner_companies
  where id = p_company_id and status = 'active';

  select coalesce(array_agg(distinct upper(btrim(price.currency))), '{}'::text[])
  into result
  from public.product_prices price
  where (
      (
        public.has_permission(p_company_id, 'pricing.partner_price.view')
        and price.external_1c_price_type_id = company_price_type
      )
      or (
        public.has_permission(p_company_id, 'pricing.retail_price.view')
        and price.external_1c_price_type_id =
          'd9c92519-658b-11e8-80d3-000c29a58b59'
      )
    )
    and price.currency_status = 'resolved'
    and price.is_active
    and price.is_published
    and price.valid_from <= now()
    and (price.valid_to is null or price.valid_to >= now())
    and (price.company_id is null or price.company_id = p_company_id)
    and nullif(btrim(price.currency), '') is not null;

  return result;
end;
$$;

revoke all on function public.list_commercial_currency_codes(uuid)
  from public, anon;
grant execute on function public.list_commercial_currency_codes(uuid)
  to authenticated;

-- The base aggregate is an implementation detail. Its old public entry point
-- allowed confidential sort-order inference even though it did not return prices.
revoke all on function public.catalog_partner_page(
  uuid, uuid, uuid, text, text, jsonb, text, integer, integer
) from public, anon, authenticated;

create or replace function public.catalog_partner_page_v2(
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
security definer
set search_path = public
as $$
declare
  base_result jsonb;
  enriched_items jsonb;
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

  base_result := public.catalog_partner_page(
    p_company_id,
    p_category_id,
    p_brand_id,
    p_search,
    p_availability,
    p_filters,
    effective_sort,
    p_limit,
    p_offset
  );

  with rates as (
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
    where is_active and is_published
      and purpose in (
        'partner_price_usd_to_mdl',
        'retail_price_usd_to_mdl'
      )
  ),
  page_items as (
    select
      page.item || jsonb_build_object(
        'image_url',
        coalesce(product.image_source_url, product.image_url)
      ) as item,
      (page.item ->> 'id')::uuid as product_id,
      page.ordinal
    from jsonb_array_elements(base_result -> 'items')
      with ordinality page(item, ordinal)
    join public.catalog_products product
      on product.id = (page.item ->> 'id')::uuid
  )
  select coalesce(jsonb_agg(
    page_items.item || jsonb_build_object(
      'partner_price_amount', partner_price.price_amount,
      'partner_price_currency', partner_price.currency,
      'partner_price_currency_status', partner_price.currency_status,
      'partner_price_updated_at', partner_price.updated_at,
      'msrp_price_amount', msrp_price.price_amount,
      'msrp_price_currency', case
        when msrp_price.price_amount is null then null
        else coalesce(nullif(btrim(msrp_price.currency), ''), 'USD')
      end,
      'msrp_price_currency_status', msrp_price.currency_status,
      'msrp_price_updated_at', msrp_price.updated_at,
      'physical_quantity', stock.physical_quantity,
      'reserved_quantity', stock.reserved_quantity,
      'available_quantity', stock.available_quantity,
      'incoming_quantity', stock.incoming_quantity,
      'has_variant_stock', stock.has_variant_stock,
      'stock_synced_at', stock.synced_at,
      'expected_arrival_date', arrival.expected_arrival_date,
      'expected_quantity', arrival.expected_quantity,
      'arrival_published_at', arrival.published_at,
      'partner_rate', rates.partner_rate,
      'retail_rate', rates.retail_rate,
      'partner_rate_published_at', rates.partner_rate_published_at,
      'retail_rate_published_at', rates.retail_rate_published_at,
      'can_view_stock', can_view_stock
    ) order by page_items.ordinal
  ), '[]'::jsonb)
  into enriched_items
  from page_items
  cross join rates
  left join lateral (
    select
      price.price_amount,
      price.currency,
      price.currency_status,
      price.updated_at
    from public.product_prices price
    where can_view_partner_price
      and partner_price_type_ref is not null
      and price.product_id = page_items.product_id
      and price.external_1c_price_type_id = partner_price_type_ref
      and price.is_active
      and price.is_published
      and price.valid_from <= now()
      and (price.valid_to is null or price.valid_to >= now())
      and (price.company_id is null or price.company_id = p_company_id)
    order by
      (price.company_id = p_company_id) desc,
      price.valid_from desc,
      price.id
    limit 1
  ) partner_price on true
  left join lateral (
    select
      price.price_amount,
      price.currency,
      price.currency_status,
      price.updated_at
    from public.product_prices price
    where can_view_retail_price
      and price.product_id = page_items.product_id
      and price.external_1c_price_type_id =
        'd9c92519-658b-11e8-80d3-000c29a58b59'
      and price.is_active
      and price.is_published
      and price.valid_from <= now()
      and (price.valid_to is null or price.valid_to >= now())
      and (price.company_id is null or price.company_id = p_company_id)
    order by
      (price.company_id = p_company_id) desc,
      price.valid_from desc,
      price.id
    limit 1
  ) msrp_price on true
  left join public.product_stock_totals stock
    on can_view_stock
    and stock.product_id = page_items.product_id
    and stock.is_published
  left join lateral (
    select
      arrival.expected_arrival_date,
      sum(arrival.expected_quantity) as expected_quantity,
      max(arrival.published_at) as published_at
    from public.product_supplier_arrivals arrival
    where can_view_stock
      and arrival.product_id = page_items.product_id
      and arrival.external_characteristic_ref =
        '00000000-0000-0000-0000-000000000000'
      and arrival.is_published
      and arrival.expected_quantity > 0
      and arrival.expected_arrival_date >= current_date
    group by arrival.expected_arrival_date
    order by arrival.expected_arrival_date
    limit 1
  ) arrival on true;

  return base_result || jsonb_build_object('items', enriched_items);
end;
$$;

revoke all on function public.catalog_partner_page_v2(
  uuid, uuid, uuid, text, text, jsonb, text, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_page_v2(
  uuid, uuid, uuid, text, text, jsonb, text, integer, integer
) to authenticated;

comment on function public.get_product_price_projection(uuid, uuid[], text) is
  'Returns only the current user commercial price projection for one active company. Explicit membership denies are enforced by has_permission().';
comment on function public.catalog_partner_page_v2(
  uuid, uuid, uuid, text, text, jsonb, text, integer, integer
) is
  'Returns a permission-aware partner catalog page. Confidential partner prices, rates, and commercial sort behavior are unavailable without pricing.partner_price.view.';
