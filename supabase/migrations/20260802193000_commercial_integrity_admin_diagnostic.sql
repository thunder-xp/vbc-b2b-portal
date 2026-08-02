begin;

create or replace function public.get_admin_commercial_integrity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
begin
  if not (
    public.has_internal_permission('admin.prices.view')
    or public.has_internal_permission('admin.stock.view')
    or public.has_internal_permission('admin.orders.view')
  ) then
    raise exception 'Commercial integrity diagnostics are not allowed.'
      using errcode = '42501';
  end if;

  with active_lines as (
    select
      item.id,
      cart.id as cart_id,
      cart.updated_at,
      company.display_name as company_name,
      product.sku,
      product.name as product_name,
      product.is_active,
      product.is_visible,
      company.external_1c_price_type_id,
      partner_price.synced_at as partner_price_synced_at,
      retail_price.synced_at as retail_price_synced_at,
      stock.synced_at as stock_synced_at,
      stock.is_published as stock_published,
      arrival.expected_arrival_date,
      array_remove(array[
        case when not product.is_active or not product.is_visible then 'unpublished_product' end,
        case when company.external_1c_price_type_id is null then 'company_price_profile_missing' end,
        case when company.external_1c_price_type_id is not null and partner_price.id is null then 'missing_partner_price' end,
        case when partner_price.id is not null and partner_price.synced_at < now() - interval '36 hours' then 'stale_partner_price' end,
        case when retail_price.id is null then 'missing_retail' end,
        case when stock.product_id is null or not coalesce(stock.is_published, false) then 'missing_stock' end,
        case when stock.is_published and stock.synced_at < now() - interval '5 hours' then 'stale_stock' end
      ], null) as reasons
    from public.carts cart
    join public.cart_items item on item.cart_id = cart.id
    join public.partner_companies company on company.id = cart.company_id
    join public.catalog_products product on product.id = item.product_id
    left join lateral (
      select price.id, price.synced_at
      from public.product_prices price
      where price.product_id = product.id
        and price.external_1c_price_type_id = company.external_1c_price_type_id
        and (price.company_id is null or price.company_id = company.id)
        and price.is_active and price.is_published
        and price.currency_status = 'resolved'
        and price.valid_from <= now()
        and (price.valid_to is null or price.valid_to >= now())
      order by price.effective_at desc nulls last
      limit 1
    ) partner_price on true
    left join lateral (
      select price.id, price.synced_at
      from public.product_prices price
      join public.price_types price_type
        on price_type.external_ref = price.external_1c_price_type_id
      where price.product_id = product.id
        and price_type.external_code = 'UU-000020'
        and price_type.is_active
        and price.is_active and price.is_published
        and price.currency_status = 'resolved'
        and price.valid_from <= now()
        and (price.valid_to is null or price.valid_to >= now())
      order by price.effective_at desc nulls last
      limit 1
    ) retail_price on true
    left join public.product_stock_totals stock on stock.product_id = product.id
    left join lateral (
      select source.expected_arrival_date
      from public.product_supplier_arrivals source
      where source.product_id = product.id
        and source.is_published
        and source.expected_quantity > 0
        and source.expected_arrival_date >= current_date
      order by source.expected_arrival_date
      limit 1
    ) arrival on true
    where cart.status in ('active', 'submitting')
  ),
  line_summary as (
    select
      count(*)::integer as total,
      count(*) filter (where cardinality(reasons) = 0)::integer as resolved,
      count(*) filter (where 'missing_partner_price' = any(reasons))::integer as missing_partner_price,
      count(*) filter (where 'missing_retail' = any(reasons))::integer as missing_retail,
      count(*) filter (where 'missing_stock' = any(reasons))::integer as missing_stock,
      count(*) filter (where 'stale_stock' = any(reasons))::integer as stale_stock,
      count(*) filter (where 'stale_partner_price' = any(reasons))::integer as stale_price,
      count(*) filter (where 'company_price_profile_missing' = any(reasons))::integer as missing_profile,
      min(updated_at) filter (where cardinality(reasons) > 0) as oldest_unresolved_at
    from active_lines
  ),
  order_counts as (
    select history.id, count(item.id)::integer as local_line_count,
      count(item.id) filter (where item.product_id is null)::integer as unmapped_line_count
    from public.partner_order_history history
    left join public.partner_order_history_items item on item.order_history_id = history.id
    group by history.id
  ),
  order_gaps as (
    select history.id, history.external_1c_order_number as order_number,
      company.display_name as company_name, history.position_count as source_line_count,
      counts.local_line_count, counts.unmapped_line_count,
      case
        when history.one_c_deletion_mark then 'source_document_deleted'
        when history.position_count = 0 and counts.local_line_count = 0 then 'source_zero_lines'
        when counts.local_line_count = 0 then 'zero_local_lines'
        when counts.local_line_count < history.position_count then 'partially_resolved'
        when counts.unmapped_line_count > 0 then 'unmapped_products'
        else 'complete'
      end as reason,
      history.one_c_last_synced_at
    from public.partner_order_history history
    join order_counts counts on counts.id = history.id
    join public.partner_companies company on company.id = history.company_id
    where history.one_c_document_date >= now() - interval '18 months'
      and (
        history.one_c_deletion_mark
        or history.position_count <> counts.local_line_count
        or counts.unmapped_line_count > 0
      )
    order by history.one_c_last_synced_at desc
    limit 100
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'cartSummary', jsonb_build_object(
      'activeLines', line_summary.total,
      'fullyResolved', line_summary.resolved,
      'missingPartnerPrice', line_summary.missing_partner_price,
      'missingRetail', line_summary.missing_retail,
      'missingStock', line_summary.missing_stock,
      'staleStock', line_summary.stale_stock,
      'stalePrice', line_summary.stale_price,
      'missingCompanyPriceProfile', line_summary.missing_profile,
      'oldestUnresolvedAt', line_summary.oldest_unresolved_at
    ),
    'cartLines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id, 'cartId', line.cart_id, 'companyName', line.company_name,
        'sku', line.sku, 'productName', line.product_name,
        'reasons', to_jsonb(line.reasons),
        'hasConfirmedArrival', line.expected_arrival_date is not null,
        'updatedAt', line.updated_at
      ) order by line.updated_at)
      from (select * from active_lines where cardinality(reasons) > 0 order by updated_at limit 100) line
    ), '[]'::jsonb),
    'orderSummary', jsonb_build_object(
      'reviewRequired', (select count(*) from order_gaps where reason not in ('complete', 'source_document_deleted')),
      'sourceDeleted', (select count(*) from order_gaps where reason = 'source_document_deleted'),
      'zeroLocalLines', (select count(*) from order_gaps where reason = 'zero_local_lines'),
      'partiallyResolved', (select count(*) from order_gaps where reason = 'partially_resolved')
    ),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'orderNumber', item.order_number,
        'companyName', item.company_name, 'sourceLineCount', item.source_line_count,
        'localLineCount', item.local_line_count, 'unmappedLineCount', item.unmapped_line_count,
        'reason', item.reason, 'lastSyncedAt', item.one_c_last_synced_at
      )) from order_gaps item
    ), '[]'::jsonb),
    'priceSync', (select jsonb_build_object(
      'status', status, 'stage', current_stage, 'lastSuccessfulAt', last_successful_sync_at,
      'failedStage', failed_stage, 'databaseErrorCode', database_error_code,
      'safeError', safe_error, 'updatedAt', updated_at
    ) from public.price_sync_state where id = 'product_prices'),
    'stockSync', (select jsonb_build_object(
      'status', status, 'stage', current_stage, 'lastSuccessfulAt', last_successful_sync_at,
      'failedStage', failed_stage, 'databaseErrorCode', database_error_code,
      'safeError', safe_error, 'updatedAt', updated_at
    ) from public.stock_sync_state where id = 'exact_stock')
  ) into result
  from line_summary;

  return result;
end;
$$;

revoke all on function public.get_admin_commercial_integrity() from public, anon;
grant execute on function public.get_admin_commercial_integrity() to authenticated;

commit;
