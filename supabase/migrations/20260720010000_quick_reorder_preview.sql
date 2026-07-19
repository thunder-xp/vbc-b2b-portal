create or replace function public.get_partner_order_reorder_source(target_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  source_order public.partner_order_history;
begin
  select * into source_order
  from public.partner_order_history
  where id = target_order_id
    and partner_visible
    and not one_c_deletion_mark;

  if source_order.id is null
    or not public.has_permission(source_order.company_id, 'orders.view')
    or not public.has_permission(source_order.company_id, 'cart.manage') then
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
        'current_image_url', product.image_url,
        'current_category_id', product.category_id,
        'current_is_active', coalesce(product.is_active, false),
        'current_is_visible', coalesce(product.is_visible, false)
      ) order by item.line_number, item.id)
      from public.partner_order_history_items item
      left join public.catalog_products product on product.id = item.product_id
      where item.order_history_id = source_order.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_partner_order_reorder_source(uuid) from public, anon;
grant execute on function public.get_partner_order_reorder_source(uuid) to authenticated;

comment on function public.get_partner_order_reorder_source(uuid) is
  'Returns one company-scoped immutable order snapshot with current catalog identity for a lazy quick-reorder preview.';
