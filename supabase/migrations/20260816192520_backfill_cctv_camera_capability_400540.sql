-- SKU 400540 is a governed 4 MP hybrid TCP/Wi-Fi camera. The original
-- capability seed only recognized the TCP-IP transport label.
with authoritative_camera as (
  select
    product.id as product_id,
    resolution.display_value::smallint as resolution_mp,
    light.display_value as light_mode,
    technology.display_value as technology,
    analytics.display_value as analytics
  from public.catalog_products product
  join public.catalog_product_attributes resolution
    on resolution.product_id = product.id
   and resolution.label = 'Разрешение-MPx'
   and resolution.display_value ~ '^[0-9]{1,2}$'
  join public.catalog_product_attributes transport
    on transport.product_id = product.id
   and transport.label = 'Передача-данных'
   and transport.display_value = 'TCP+WIFI (Гибридная)'
  left join public.catalog_product_attributes light
    on light.product_id = product.id and light.label = 'Светочувствительность'
  left join public.catalog_product_attributes technology
    on technology.product_id = product.id and technology.label = 'Технология'
  left join public.catalog_product_attributes analytics
    on analytics.product_id = product.id and analytics.label = 'Аналитика'
  where product.sku = '400540'
    and product.is_active
    and product.is_visible
)
insert into public.cctv_camera_capabilities (
  product_id, resolution_mp, network_camera, poe_supported, color_night, anpr,
  video_analytics, verified, evidence_source, verified_at
)
select
  product_id,
  resolution_mp,
  true,
  null,
  light_mode in ('Smart Dual Light', 'Starlight', 'WizColor', 'WizColor Lite'),
  technology = 'SMART ANPR',
  analytics <> 'Отсутствует',
  true,
  'synchronized_catalog_attributes:400540_hybrid_transport',
  now()
from authoritative_camera
on conflict (product_id) do nothing;

insert into public.cctv_camera_turnover_signals (
  product_id, available_stock, recent_sales_qty, last_sale_at, signal_updated_at
)
select
  product.id,
  greatest(coalesce(stock.available_quantity, 0), 0),
  coalesce(sum(sale.quantity) filter (
    where sale.source_document_date >= now() - interval '90 days'
  ), 0),
  max(sale.source_document_date),
  now()
from public.catalog_products product
join public.cctv_camera_capabilities capability on capability.product_id = product.id
left join public.product_stock_totals stock
  on stock.product_id = product.id and stock.is_published
left join public.warranty_serial_events sale
  on sale.product_id = product.id
 and sale.event_type = 'sale_observed'
 and sale.source_posted
 and not sale.source_deletion_mark
where product.sku = '400540'
group by product.id, stock.available_quantity
on conflict (product_id) do update set
  available_stock = excluded.available_stock,
  recent_sales_qty = excluded.recent_sales_qty,
  last_sale_at = excluded.last_sale_at,
  signal_updated_at = excluded.signal_updated_at;
