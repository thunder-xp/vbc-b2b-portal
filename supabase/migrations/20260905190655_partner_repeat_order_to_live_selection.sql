begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.get_partner_repeat_order_summaries_v1(
  p_company_id uuid,
  p_limit integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'orders.view')
    or not public.has_permission(p_company_id, 'catalog.view')
  then
    raise exception 'Repeat order access denied.' using errcode = '42501';
  end if;

  if p_limit not between 1 and 5 then
    raise exception 'Invalid repeat order limit.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id,
    'order_number', recent.external_1c_order_number,
    'document_date', recent.one_c_document_date,
    'position_count', recent.position_count,
    'total_unit_count', recent.total_unit_count
  ) order by recent.one_c_document_date desc, recent.id desc), '[]'::jsonb)
  into result
  from (
    select history.*
    from public.partner_order_history history
    where history.company_id = p_company_id
      and history.partner_visible
      and history.one_c_posted
      and not history.one_c_deletion_mark
      and history.one_c_state_code = 'completed'
      and history.origin_type <> 'internal_1c'
      and history.one_c_document_date <= now()
      and history.position_count > 0
      and exists (
        select 1
        from public.partner_order_history_items item
        where item.order_history_id = history.id
          and item.quantity > 0
      )
    order by history.one_c_document_date desc, history.id desc
    limit p_limit
  ) recent;

  return result;
end;
$$;

create or replace function public.get_partner_repeat_order_selection_source_v1(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  source_order public.partner_order_history;
begin
  select * into source_order
  from public.partner_order_history history
  where history.id = p_order_id
    and history.partner_visible
    and history.one_c_posted
    and not history.one_c_deletion_mark
    and history.one_c_state_code = 'completed'
    and history.origin_type <> 'internal_1c'
    and history.one_c_document_date <= now()
    and history.position_count > 0;

  if source_order.id is null
    or auth.uid() is null
    or not public.has_active_company_membership(source_order.company_id)
    or not public.has_permission(source_order.company_id, 'orders.view')
    or not public.has_permission(source_order.company_id, 'catalog.view')
  then
    return null;
  end if;

  return jsonb_build_object(
    'order', jsonb_build_object(
      'id', source_order.id,
      'company_id', source_order.company_id,
      'external_1c_order_number', source_order.external_1c_order_number,
      'currency_code', source_order.currency_code
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_id', item.id,
        'line_number', item.line_number,
        'product_id', item.product_id,
        'historical_external_product_ref', item.external_product_ref,
        'historical_product_name', item.product_name,
        'historical_sku', item.sku,
        'historical_quantity', item.quantity,
        'historical_unit_price', item.unit_price,
        'historical_currency_code', coalesce(item.currency_code, source_order.currency_code),
        'product_exists', product.id is not null,
        'current_external_product_ref', product.external_1c_id,
        'current_name', product.name,
        'current_sku', product.sku,
        'current_slug', product.slug,
        'current_image_url', coalesce(product.image_source_url, product.image_url),
        'current_category_id', product.category_id,
        'current_is_active', coalesce(product.is_active, false),
        'current_is_visible', coalesce(product.is_visible, false)
      ) order by item.line_number, item.id)
      from (
        select source_item.*
        from public.partner_order_history_items source_item
        where source_item.order_history_id = source_order.id
          and source_item.quantity > 0
        order by source_item.line_number, source_item.id
        limit 50
      ) item
      left join public.catalog_products product on product.id = item.product_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_partner_repeat_order_summaries_v1(uuid, integer) from public, anon;
grant execute on function public.get_partner_repeat_order_summaries_v1(uuid, integer) to authenticated;

revoke all on function public.get_partner_repeat_order_selection_source_v1(uuid) from public, anon;
grant execute on function public.get_partner_repeat_order_selection_source_v1(uuid) to authenticated;

comment on function public.get_partner_repeat_order_summaries_v1(uuid, integer) is
  'Returns bounded company-private summaries of reliable completed orders for the Live Commerce Selection entry point.';

comment on function public.get_partner_repeat_order_selection_source_v1(uuid) is
  'Returns one eligible company-private completed-order composition with current catalog identity; commercial truth is resolved separately at request time.';

commit;
