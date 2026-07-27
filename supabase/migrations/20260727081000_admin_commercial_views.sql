begin;

create or replace function public.get_admin_commercial_summary(
  p_domain text,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  required_permission text;
  metrics jsonb;
  records jsonb := '[]'::jsonb;
begin
  required_permission := case p_domain
    when 'catalog' then 'admin.catalog.view'
    when 'prices' then 'admin.prices.view'
    when 'stock' then 'admin.stock.view'
    when 'arrivals' then 'admin.stock.view'
    else null
  end;
  if required_permission is null
    or not public.has_internal_permission(required_permission) then
    raise exception 'Commercial administration access is not allowed.'
      using errcode = '42501';
  end if;

  if p_domain = 'catalog' then
    select jsonb_build_object(
      'published', count(*) filter (where is_active and is_visible),
      'inactive', count(*) filter (where not is_active or not is_visible),
      'missingImage', count(*) filter (
        where is_active and is_visible and coalesce(image_url, image_source_url) is null
      ),
      'missingTaxonomy', count(*) filter (
        where is_active and is_visible and (category_id is null or brand_id is null)
      )
    ) into metrics from public.catalog_products;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'primary', sku, 'secondary', name,
      'status', case when is_active and is_visible then 'published' else 'inactive' end
    ) order by sku), '[]'::jsonb) into records
    from (
      select id, sku, name, is_active, is_visible
      from public.catalog_products
      where p_search is null or sku ilike '%' || btrim(p_search) || '%'
        or name ilike '%' || btrim(p_search) || '%'
      order by sku limit 25
    ) product;
  elsif p_domain = 'prices' then
    select jsonb_build_object(
      'published', count(*) filter (where is_published and is_active),
      'priceTypes', count(distinct price_type_id) filter (where is_published and is_active),
      'stale', count(*) filter (
        where is_published and is_active and synced_at < now() - interval '36 hours'
      ),
      'unresolvedCurrency', count(*) filter (
        where is_published and is_active and currency_status <> 'resolved'
      )
    ) into metrics from public.product_prices;
  elsif p_domain = 'stock' then
    select jsonb_build_object(
      'published', count(*) filter (where is_published),
      'positive', count(*) filter (where is_published and available_quantity > 0),
      'stale', count(*) filter (
        where is_published and synced_at < now() - interval '36 hours'
      ),
      'warehouses', (
        select count(*) from public.stock_warehouses
        where is_active and public_included
      )
    ) into metrics from public.product_stock_totals;
  elsif p_domain = 'arrivals' then
    select jsonb_build_object(
      'published', count(*) filter (where is_published),
      'upcoming', count(*) filter (
        where is_published and expected_arrival_date >= current_date
      ),
      'overdue', count(*) filter (
        where is_published and expected_arrival_date < current_date
      ),
      'lastPublishedAt', max(published_at)
    ) into metrics from public.product_supplier_arrivals;
  end if;

  return jsonb_build_object(
    'domain', p_domain,
    'metrics', coalesce(metrics, '{}'::jsonb),
    'records', records
  );
end;
$$;

revoke all on function public.get_admin_commercial_summary(text, text)
  from public, anon;
grant execute on function public.get_admin_commercial_summary(text, text)
  to authenticated;

commit;
