begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.get_partner_previously_purchased_products_v1(
  p_company_id uuid,
  p_limit integer default 5,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  can_view_partner_price boolean;
  can_view_stock boolean;
  partner_price_type_ref text;
  result jsonb;
begin
  if actor is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'orders.view')
    or not public.has_permission(p_company_id, 'catalog.view')
  then
    raise exception 'Previously purchased products access denied.'
      using errcode = '42501';
  end if;

  if p_limit not between 1 and 20 or p_offset not between 0 and 500 then
    raise exception 'Invalid previously purchased products page.'
      using errcode = '22023';
  end if;

  select company.external_1c_price_type_id
  into partner_price_type_ref
  from public.partner_companies company
  where company.id = p_company_id
    and company.status = 'active';

  if not found then
    raise exception 'Previously purchased products access denied.'
      using errcode = '42501';
  end if;

  can_view_partner_price := public.has_permission(
    p_company_id,
    'pricing.partner_price.view'
  );
  can_view_stock := public.has_permission(p_company_id, 'stock.view');

  with completed_order_products as materialized (
    select
      history.id as order_id,
      item.product_id,
      history.one_c_document_date as purchased_at,
      sum(item.quantity)::numeric as quantity
    from public.partner_order_history history
    join public.partner_order_history_items item
      on item.order_history_id = history.id
     and item.product_id is not null
     and item.quantity > 0
    where history.company_id = p_company_id
      and history.partner_visible
      and history.one_c_posted
      and not history.one_c_deletion_mark
      and history.one_c_state_code = 'completed'
      and history.origin_type <> 'internal_1c'
      and history.one_c_document_date <= now()
    group by history.id, item.product_id, history.one_c_document_date
  ), purchase_evidence as (
    select
      purchase.product_id,
      count(*)::integer as purchase_count,
      sum(purchase.quantity)::numeric as total_quantity,
      max(purchase.purchased_at) as last_purchased_at,
      (array_agg(
        purchase.quantity
        order by purchase.purchased_at desc, purchase.order_id desc
      ))[1]::numeric as last_quantity
    from completed_order_products purchase
    group by purchase.product_id
  ), products as (
    select
      product.id,
      product.sku,
      product.name,
      product.slug,
      coalesce(product.image_source_url, product.image_url) as image_url,
      brand.id as brand_id,
      brand.name as brand_name,
      brand.slug as brand_slug,
      category.id as category_id,
      category.parent_id as category_parent_id,
      category.name as category_name,
      category.slug as category_slug,
      evidence.purchase_count,
      evidence.total_quantity,
      evidence.last_purchased_at,
      evidence.last_quantity,
      exists (
        select 1
        from public.partner_commercial_opportunities opportunity
        where opportunity.company_id = p_company_id
          and opportunity.recipient_user_id = actor
          and opportunity.product_id = product.id
          and opportunity.opportunity_type = 'repeat_purchase_available'
          and opportunity.status = 'active'
          and opportunity.expires_at > now()
          and not exists (
            select 1
            from public.partner_commercial_opportunity_dismissals dismissal
            where dismissal.recipient_user_id = actor
              and dismissal.commercial_state_fingerprint =
                opportunity.commercial_state_fingerprint
          )
      ) as repeat_purchase_due
    from purchase_evidence evidence
    join public.catalog_products product
      on product.id = evidence.product_id
     and product.is_active
     and product.is_visible
     and nullif(btrim(product.external_1c_id), '') is not null
    left join public.catalog_brands brand
      on brand.id = product.brand_id and brand.is_active
    left join public.catalog_categories category
      on category.id = product.category_id and category.is_active
  ), commercial as (
    select
      product.*,
      partner_price.price_amount as partner_price_amount,
      partner_price.currency as partner_price_currency,
      partner_price.currency_status as partner_price_currency_status,
      partner_price.updated_at as partner_price_updated_at,
      stock.physical_quantity,
      stock.reserved_quantity,
      stock.available_quantity,
      stock.incoming_quantity,
      stock.has_variant_stock,
      stock.synced_at as stock_synced_at,
      arrival.expected_arrival_date,
      arrival.expected_quantity,
      arrival.published_at as arrival_published_at
    from products product
    left join lateral (
      select
        price.price_amount,
        price.currency,
        price.currency_status,
        price.updated_at
      from public.product_prices price
      where can_view_partner_price
        and partner_price_type_ref is not null
        and price.product_id = product.id
        and price.external_1c_price_type_id = partner_price_type_ref
        and (price.company_id is null or price.company_id = p_company_id)
        and price.is_active
        and price.is_published
        and price.valid_from <= now()
        and (price.valid_to is null or price.valid_to >= now())
      order by
        (price.company_id = p_company_id) desc,
        price.valid_from desc,
        price.id
      limit 1
    ) partner_price on true
    left join public.product_stock_totals stock
      on can_view_stock
     and stock.product_id = product.id
     and stock.is_published
    left join lateral (
      select
        supplier.expected_arrival_date,
        sum(supplier.expected_quantity)::numeric as expected_quantity,
        max(supplier.published_at) as published_at
      from public.product_supplier_arrivals supplier
      where can_view_stock
        and supplier.product_id = product.id
        and supplier.external_characteristic_ref =
          '00000000-0000-0000-0000-000000000000'
        and supplier.is_published
        and supplier.expected_quantity > 0
        and supplier.expected_arrival_date >= current_date
      group by supplier.expected_arrival_date
      order by supplier.expected_arrival_date
      limit 1
    ) arrival on true
  ), page as (
    select commercial.*
    from commercial
    order by
      commercial.repeat_purchase_due desc,
      case
        when commercial.partner_price_amount > 0
          and commercial.available_quantity > 0 then 0
        when commercial.partner_price_amount > 0 then 1
        else 2
      end,
      commercial.last_purchased_at desc,
      commercial.purchase_count desc,
      commercial.id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'sku', item.sku,
        'name', item.name,
        'slug', item.slug,
        'image_url', item.image_url,
        'brand_id', item.brand_id,
        'brand_name', item.brand_name,
        'brand_slug', item.brand_slug,
        'category_id', item.category_id,
        'category_parent_id', item.category_parent_id,
        'category_name', item.category_name,
        'category_slug', item.category_slug,
        'partner_price_amount', item.partner_price_amount,
        'partner_price_currency', item.partner_price_currency,
        'partner_price_currency_status', item.partner_price_currency_status,
        'partner_price_updated_at', item.partner_price_updated_at,
        'msrp_price_amount', null,
        'msrp_price_currency', null,
        'msrp_price_currency_status', null,
        'msrp_price_updated_at', null,
        'physical_quantity', item.physical_quantity,
        'reserved_quantity', item.reserved_quantity,
        'available_quantity', item.available_quantity,
        'incoming_quantity', item.incoming_quantity,
        'has_variant_stock', item.has_variant_stock,
        'stock_synced_at', item.stock_synced_at,
        'expected_arrival_date', item.expected_arrival_date,
        'expected_quantity', item.expected_quantity,
        'arrival_published_at', item.arrival_published_at,
        'partner_rate', null,
        'retail_rate', null,
        'partner_rate_published_at', null,
        'retail_rate_published_at', null,
        'can_view_stock', can_view_stock,
        'merchandising_labels', '[]'::jsonb,
        'key_characteristics', '[]'::jsonb,
        'purchase_count', item.purchase_count,
        'total_quantity', item.total_quantity,
        'last_purchased_at', item.last_purchased_at,
        'last_quantity', item.last_quantity,
        'repeat_purchase_due', item.repeat_purchase_due
      ) order by
        item.repeat_purchase_due desc,
        case
          when item.partner_price_amount > 0
            and item.available_quantity > 0 then 0
          when item.partner_price_amount > 0 then 1
          else 2
        end,
        item.last_purchased_at desc,
        item.purchase_count desc,
        item.id)
      from page item
    ), '[]'::jsonb),
    'totalCount', (select count(*) from commercial)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_partner_previously_purchased_products_v1(
  uuid,
  integer,
  integer
) from public, anon;
grant execute on function public.get_partner_previously_purchased_products_v1(
  uuid,
  integer,
  integer
) to authenticated;

comment on function public.get_partner_previously_purchased_products_v1(
  uuid,
  integer,
  integer
) is
  'Returns a bounded company-private product projection from reliable completed order history, enriched only with current governed price and stock read models.';

commit;
