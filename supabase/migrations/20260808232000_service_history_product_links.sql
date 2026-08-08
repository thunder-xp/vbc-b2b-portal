create or replace function public.list_partner_service_history(
  p_company_id uuid,
  p_query text default '',
  p_filter text default 'all',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
with input as (
  select
    lower(btrim(coalesce(p_query, ''))) q,
    case when p_filter in ('active', 'ready', 'completed', 'all') then p_filter else 'all' end filter_mode,
    greatest(p_page, 1) page,
    least(greatest(p_page_size, 1), 50) page_size
),
unified as (
  select
    c.id,
    'portal' source_type,
    c.case_number number,
    c.created_at document_date,
    c.status status,
    p.id product_id,
    p.sku,
    p.name product_name,
    p.image_url,
    case when p.id is not null and p.is_active and p.is_visible then '/cabinet/catalog/' || p.slug end product_href,
    case
      when c.entered_serial_number is null then null
      when char_length(c.entered_serial_number) <= 6 then left(c.entered_serial_number, 1) || '***' || right(c.entered_serial_number, 1)
      else left(c.entered_serial_number, 3) || '***' || right(c.entered_serial_number, 3)
    end masked_serial,
    c.partner_description reported_fault,
    c.warranty_eligibility_state warranty_state,
    c.warranty_end_date,
    c.updated_at,
    '/cabinet/service/' || c.id href,
    c.status not in ('closed', 'rejected', 'cancelled') active,
    c.status = 'ready_for_pickup' ready,
    c.status in ('closed', 'rejected', 'cancelled') completed
  from public.service_cases c
  left join public.catalog_products p on p.id = c.product_id
  where c.company_id = p_company_id

  union all

  select
    h.id,
    'one_c',
    h.source_document_number,
    h.source_document_date,
    h.normalized_status,
    p.id,
    p.sku,
    coalesce(p.name, h.product_name_snapshot),
    p.image_url,
    case when p.id is not null and p.is_active and p.is_visible then '/cabinet/catalog/' || p.slug end,
    h.masked_serial,
    h.reported_fault,
    h.warranty_state_snapshot,
    h.warranty_end_date,
    h.updated_at,
    '/cabinet/service/history/' || h.id,
    h.normalized_status not in ('issued_to_customer', 'closed', 'rejected'),
    h.normalized_status = 'ready_for_pickup',
    h.normalized_status in ('issued_to_customer', 'closed', 'rejected')
  from public.one_c_service_history h
  left join public.catalog_products p on p.id = h.product_id
  where h.company_id = p_company_id
    and h.partner_visible
    and h.is_active
),
visible as (
  select unified.*
  from unified, input
  where public.has_permission(p_company_id, 'service.view')
    and (input.q = '' or lower(number || ' ' || coalesce(sku, '') || ' ' || coalesce(product_name, '') || ' ' || coalesce(masked_serial, '')) like '%' || input.q || '%')
    and (input.filter_mode = 'all' or input.filter_mode = 'active' and active or input.filter_mode = 'ready' and ready or input.filter_mode = 'completed' and completed)
),
paged as (
  select visible.*, count(*) over() total_count
  from visible
  order by document_date desc, id desc
  offset (select (page - 1) * page_size from input)
  limit (select page_size from input)
)
select jsonb_build_object(
  'items', coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'sourceType', source_type,
    'number', number,
    'date', document_date,
    'status', status,
    'productId', product_id,
    'productSku', sku,
    'productName', product_name,
    'productImageUrl', image_url,
    'productHref', product_href,
    'maskedSerial', masked_serial,
    'reportedFault', reported_fault,
    'warrantyState', warranty_state,
    'warrantyEndDate', warranty_end_date,
    'updatedAt', updated_at,
    'href', href
  ) order by document_date desc, id desc), '[]'::jsonb),
  'total', coalesce(max(total_count), 0),
  'page', (select page from input)
)
from paged;
$$;

revoke all on function public.list_partner_service_history(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.list_partner_service_history(uuid, text, text, integer, integer) to authenticated;
