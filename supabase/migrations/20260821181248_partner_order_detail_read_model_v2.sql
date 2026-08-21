create or replace function public.get_partner_order_detail_v2(
  p_order_id uuid,
  p_event_limit integer default 100,
  p_document_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  target public.partner_order_history%rowtype;
  effective_permissions text[];
  can_view_partner_price boolean;
  can_view_catalog boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_event_limit < 1 or p_event_limit > 100 or p_document_limit < 1 or p_document_limit > 20 then
    raise exception 'Invalid order detail bounds.' using errcode = '22023';
  end if;

  select history.*
  into target
  from public.partner_order_history history
  where (history.id = p_order_id or history.portal_order_id = p_order_id)
    and history.partner_visible
    and not history.one_c_deletion_mark
  limit 1;

  if target.id is null then
    return null;
  end if;

  select context.effective_permission_codes
  into effective_permissions
  from public.get_effective_company_permissions(target.company_id) context;

  if not coalesce('orders.view' = any(effective_permissions), false) then
    return null;
  end if;

  can_view_partner_price := coalesce(
    'pricing.partner_price.view' = any(effective_permissions),
    false
  );
  can_view_catalog := coalesce('catalog.view' = any(effective_permissions), false);

  return jsonb_build_object(
    'order', jsonb_build_object(
      'id', target.id,
      'company_id', target.company_id,
      'portal_order_id', target.portal_order_id,
      'external_1c_order_ref', target.external_1c_order_ref,
      'external_1c_order_number', target.external_1c_order_number,
      'one_c_posted', target.one_c_posted,
      'one_c_deletion_mark', target.one_c_deletion_mark,
      'one_c_state_raw', target.one_c_state_raw,
      'one_c_state_code', target.one_c_state_code,
      'one_c_state_ref', target.one_c_state_ref,
      'one_c_document_date', target.one_c_document_date,
      'one_c_delivery_date', target.one_c_delivery_date,
      'one_c_source_version', target.one_c_source_version,
      'one_c_last_synced_at', target.one_c_last_synced_at,
      'external_contract_ref', target.external_contract_ref,
      'external_currency_ref', target.external_currency_ref,
      'document_total', target.document_total,
      'currency_code', target.currency_code,
      'origin_type', target.origin_type,
      'partner_visible', target.partner_visible,
      'hidden_reason', target.hidden_reason,
      'position_count', target.position_count,
      'total_unit_count', target.total_unit_count,
      'created_at', target.created_at,
      'updated_at', target.updated_at
    ),
    'company_name', (
      select company.display_name
      from public.partner_companies company
      where company.id = target.company_id
        and company.status = 'active'
    ),
    'can_view_partner_price', can_view_partner_price,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'order_history_id', item.order_history_id,
        'line_number', item.line_number,
        'product_id', item.product_id,
        'product_name', item.product_name,
        'sku', item.sku,
        'quantity', item.quantity,
        'unit_price', case when can_view_partner_price then item.unit_price else null end,
        'line_total', case when can_view_partner_price then item.line_total else null end,
        'currency_code', case when can_view_partner_price then item.currency_code else null end
      ) order by item.line_number)
      from public.partner_order_history_items item
      where item.order_history_id = target.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'order_history_id', recent.order_history_id,
        'event_type', recent.event_type,
        'occurred_at', recent.occurred_at,
        'previous_value', recent.previous_value,
        'current_value', recent.current_value
      ) order by recent.occurred_at, recent.id)
      from (
        select event.*
        from public.partner_order_history_events event
        where event.order_history_id = target.id
          and not event.internal_only
        order by event.occurred_at desc, event.id desc
        limit p_event_limit
      ) recent
    ), '[]'::jsonb),
    'portal_snapshot', case when target.portal_order_id is null then null else (
      select jsonb_build_object(
        'document_total', portal_order.document_total,
        'currency_code', portal_order.currency_code,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'product_id', item.product_id,
            'product_name', item.product_name,
            'sku', item.sku,
            'quantity', item.quantity,
            'partner_unit_price', case when can_view_partner_price then item.partner_unit_price else null end,
            'line_total', case when can_view_partner_price then item.line_total else null end,
            'currency_code', case when can_view_partner_price then item.currency_code else null end
          ) order by item.id)
          from public.partner_order_items item
          where item.order_id = portal_order.id
        ), '[]'::jsonb)
      )
      from public.partner_orders portal_order
      where portal_order.id = target.portal_order_id
        and portal_order.company_id = target.company_id
    ) end,
    'products', coalesce((
      with product_ids as (
        select item.product_id
        from public.partner_order_history_items item
        where item.order_history_id = target.id and item.product_id is not null
        union
        select item.product_id
        from public.partner_order_items item
        where item.order_id = target.portal_order_id and item.product_id is not null
      )
      select jsonb_agg(jsonb_build_object(
        'product_id', product.id,
        'slug', product.slug,
        'sku', product.sku,
        'name', product.name,
        'thumbnail', coalesce(
          product.image_source_url,
          product.image_url,
          (
            select image.url
            from public.catalog_product_images image
            where image.product_id = product.id
            order by image.is_primary desc, image.sort_order, image.id
            limit 1
          )
        )
      ) order by product.id)
      from product_ids ids
      join public.catalog_products product on product.id = ids.product_id
      where can_view_catalog and product.is_active and product.is_visible
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg((to_jsonb(document_row) - 'sort_date') order by document_row.is_current desc, document_row.sort_date desc, document_row.id)
      from (
        select
          document.id,
          document.document_type,
          document.title,
          document.document_number,
          document.issue_date,
          document.valid_from,
          document.valid_until,
          document.status,
          document.version,
          document.language_code,
          document.file_name,
          document.mime_type,
          document.file_size,
          document.is_current,
          case when document.company_id is null then 'product_public' else 'company_specific' end as source_scope,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', product.id,
              'sku', product.sku,
              'name', product.name,
              'slug', product.slug
            ) order by product.name)
            from public.partner_document_products product_link
            join public.catalog_products product on product.id = product_link.product_id
            where product_link.document_id = document.id
          ), '[]'::jsonb) as related_products,
          jsonb_build_array(jsonb_build_object(
            'id', target.id,
            'number', target.external_1c_order_number
          )) as related_orders,
          coalesce(document.issue_date, document.published_at::date, document.created_at::date) as sort_date
        from public.partner_document_orders order_link
        join public.partner_documents document on document.id = order_link.document_id
        where order_link.order_history_id = target.id
          and document.is_current
          and document.archived_at is null
          and document.status <> 'archived'
          and (document.company_id is null or document.company_id = target.company_id)
          and public.partner_document_permission(document.document_type) = any(effective_permissions)
        order by document.is_current desc,
          coalesce(document.issue_date, document.published_at::date, document.created_at::date) desc,
          document.id
        limit p_document_limit
      ) document_row
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_partner_order_detail_v2(uuid, integer, integer)
from public, anon;
grant execute on function public.get_partner_order_detail_v2(uuid, integer, integer)
to authenticated;
