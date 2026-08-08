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
    case when p.id is not null and p.is_active and p.is_visible then coalesce(p.image_source_url, p.image_url) end image_url,
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
    case when p.id is not null and p.is_active and p.is_visible then coalesce(p.image_source_url, p.image_url) end,
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
),
canonical_images as (
  select distinct on (image.product_id) image.product_id, image.url
  from public.catalog_product_images image
  join (select distinct product_id from paged where product_id is not null and image_url is null) relevant
    on relevant.product_id = image.product_id
  order by image.product_id, image.is_primary desc, image.sort_order, image.id
),
enriched as (
  select paged.*, coalesce(paged.image_url, canonical_images.url) resolved_image_url
  from paged
  left join canonical_images on canonical_images.product_id = paged.product_id
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
    'productImageUrl', resolved_image_url,
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
from enriched;
$$;

create or replace function public.get_partner_one_c_service_history(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
select case when public.has_permission(h.company_id, 'service.view') and h.partner_visible and h.is_active then jsonb_build_object(
  'id', h.id,
  'number', h.source_document_number,
  'date', h.source_document_date,
  'status', h.normalized_status,
  'sourceStatus', h.source_status,
  'product', case when p.id is not null and p.is_active and p.is_visible then jsonb_build_object(
    'id', p.id,
    'sku', p.sku,
    'name', p.name,
    'imageUrl', coalesce(p.image_source_url, p.image_url, image.url),
    'href', '/cabinet/catalog/' || p.slug
  ) else jsonb_build_object(
    'id', null,
    'sku', h.product_sku_snapshot,
    'name', h.product_name_snapshot,
    'imageUrl', null,
    'href', null
  ) end,
  'maskedSerial', h.masked_serial,
  'reportedFault', h.reported_fault,
  'resolution', h.partner_visible_resolution,
  'warrantyState', h.warranty_state_snapshot,
  'warrantyStartDate', h.warranty_start_date,
  'warrantyEndDate', h.warranty_end_date,
  'serviceCenter', h.service_center_snapshot,
  'updatedAt', h.updated_at,
  'events', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.event_type, 'status', e.normalized_status, 'occurredAt', e.occurred_at) order by e.occurred_at, e.id)
    from public.one_c_service_history_events e
    where e.service_history_id = h.id and e.event_type <> 'redetected'
  ), '[]'::jsonb)
) else null end
from public.one_c_service_history h
left join public.catalog_products p on p.id = h.product_id
left join lateral (
  select product_image.url
  from public.catalog_product_images product_image
  where product_image.product_id = p.id
  order by product_image.is_primary desc, product_image.sort_order, product_image.id
  limit 1
) image on true
where h.id = p_id;
$$;

create or replace function public.get_service_case(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
select case when public.can_access_service_case(c.id, false) then jsonb_build_object(
  'id', c.id,
  'companyId', c.company_id,
  'caseNumber', c.case_number,
  'caseType', c.case_type,
  'status', c.status,
  'priority', c.priority,
  'productId', c.product_id,
  'orderId', c.order_id,
  'orderLineId', c.order_line_id,
  'serialNumber', c.entered_serial_number,
  'faultCategory', c.fault_category,
  'description', c.partner_description,
  'symptoms', c.symptoms,
  'issueStartedOn', c.issue_started_on,
  'powersOn', c.powers_on,
  'factoryResetAttempted', c.factory_reset_attempted,
  'preferredContact', c.preferred_contact,
  'purchaseVerificationState', c.purchase_verification_state,
  'warrantyState', c.warranty_eligibility_state,
  'warrantyEndDate', c.warranty_end_date,
  'replacementState', c.replacement_policy_state,
  'assignedInternalUserId', c.assigned_internal_user_id,
  'createdAt', c.created_at,
  'updatedAt', c.updated_at,
  'version', c.version,
  'product', case when p.id is null then null else jsonb_build_object(
    'id', p.id,
    'sku', p.sku,
    'name', p.name,
    'imageUrl', case when p.is_active and p.is_visible then coalesce(p.image_source_url, p.image_url, image.url) end,
    'href', case when p.is_active and p.is_visible then '/cabinet/catalog/' || p.slug end
  ) end,
  'order', case when h.id is null then null else jsonb_build_object('id', h.id, 'number', h.external_1c_order_number, 'date', h.one_c_document_date) end,
  'events', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.event_type, 'message', e.message, 'occurredAt', e.occurred_at) order by e.occurred_at, e.id)
    from public.service_case_events e
    where e.case_id = c.id and (public.has_internal_permission('admin.service.view') or e.partner_visible)
  ), '[]'::jsonb),
  'attachments', coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'fileName', a.file_name, 'mimeType', a.mime_type, 'fileSize', a.file_size, 'createdAt', a.created_at) order by a.created_at)
    from public.service_case_attachments a
    where a.case_id = c.id and a.scan_state <> 'rejected'
  ), '[]'::jsonb),
  'documents', coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'documentType', d.document_type, 'fileName', d.file_name) order by link.created_at)
    from public.service_case_documents link
    join public.partner_documents d on d.id = link.document_id
    where link.case_id = c.id and (public.has_internal_permission('admin.service.view') or link.partner_visible)
  ), '[]'::jsonb)
) else null end
from public.service_cases c
left join public.catalog_products p on p.id = c.product_id
left join public.partner_order_history h on h.id = c.order_id
left join lateral (
  select product_image.url
  from public.catalog_product_images product_image
  where product_image.product_id = p.id
  order by product_image.is_primary desc, product_image.sort_order, product_image.id
  limit 1
) image on true
where c.id = p_case_id;
$$;

revoke all on function public.list_partner_service_history(uuid, text, text, integer, integer), public.get_partner_one_c_service_history(uuid), public.get_service_case(uuid) from public, anon;
grant execute on function public.list_partner_service_history(uuid, text, text, integer, integer), public.get_partner_one_c_service_history(uuid), public.get_service_case(uuid) to authenticated;
