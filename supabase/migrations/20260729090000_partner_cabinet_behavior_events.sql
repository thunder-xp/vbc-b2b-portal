-- Extend the existing privacy-safe behavior allowlist for bounded cabinet views.
alter table public.partner_behavior_events
  drop constraint if exists partner_behavior_event_name_check;

alter table public.partner_behavior_events
  add constraint partner_behavior_event_name_check check (event_name in (
    'catalog_viewed', 'category_viewed', 'search_performed',
    'search_no_results', 'filters_applied',
    'merchandising_section_viewed', 'merchandising_product_clicked',
    'product_viewed', 'product_document_downloaded',
    'stock_state_viewed', 'arrival_date_viewed',
    'product_added_to_favorites', 'product_removed_from_favorites',
    'product_added_to_compare', 'product_removed_from_compare',
    'product_added_to_cart', 'product_removed_from_cart',
    'cart_quantity_changed', 'product_added_to_estimate',
    'estimate_created', 'proposal_generated', 'order_submitted',
    'reorder_started', 'reorder_submitted',
    'out_of_stock_product_viewed', 'unavailable_product_added',
    'arrival_interest_viewed',
    'dashboard_viewed', 'dashboard_action_clicked',
    'order_list_viewed', 'order_opened', 'shipment_viewed',
    'date_change_started', 'finance_viewed', 'company_users_viewed'
  ));

create or replace function public.record_partner_behavior_event(
  p_company_id uuid,
  p_event_name text,
  p_session_id uuid,
  p_product_id uuid default null,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_route text default '/cabinet/catalog',
  p_search_query text default null,
  p_result_count integer default null,
  p_quantity numeric default null,
  p_source_surface text default null,
  p_metadata_safe jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  normalized_query text := nullif(
    left(regexp_replace(lower(btrim(coalesce(p_search_query, ''))),
      '\s+', ' ', 'g'), 100),
    ''
  );
  normalized_route text := split_part(left(btrim(p_route), 200), '?', 1);
  metadata_text text := lower(coalesce(p_metadata_safe, '{}'::jsonb)::text);
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
  then
    raise exception 'Behavior event access denied.' using errcode = '42501';
  end if;

  if p_event_name not in (
      'catalog_viewed', 'category_viewed', 'search_performed',
      'search_no_results', 'filters_applied',
      'merchandising_section_viewed', 'merchandising_product_clicked',
      'product_viewed', 'product_document_downloaded',
      'stock_state_viewed', 'arrival_date_viewed',
      'product_added_to_favorites', 'product_removed_from_favorites',
      'product_added_to_compare', 'product_removed_from_compare',
      'product_added_to_cart', 'product_removed_from_cart',
      'cart_quantity_changed', 'product_added_to_estimate',
      'estimate_created', 'proposal_generated', 'order_submitted',
      'reorder_started', 'reorder_submitted',
      'out_of_stock_product_viewed', 'unavailable_product_added',
      'arrival_interest_viewed',
      'dashboard_viewed', 'dashboard_action_clicked',
      'order_list_viewed', 'order_opened', 'shipment_viewed',
      'date_change_started', 'finance_viewed', 'company_users_viewed'
    )
    or p_session_id is null
    or normalized_route not like '/cabinet/%'
    or p_result_count is not null and p_result_count not between 0 and 1000000
    or p_quantity is not null and p_quantity <= 0
    or p_source_surface is not null
      and char_length(btrim(p_source_surface)) not between 1 and 50
    or jsonb_typeof(coalesce(p_metadata_safe, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata_safe, '{}'::jsonb)) > 2048
    or metadata_text ~ '(price|amount|token|secret|password|email|authorization|note|comment)'
  then
    raise exception 'Invalid behavior event.' using errcode = '22023';
  end if;

  if p_product_id is not null and not exists (
    select 1 from public.catalog_products product
    where product.id = p_product_id and product.is_active and product.is_visible
  ) then
    raise exception 'Invalid behavior product.' using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.catalog_categories category
    where category.id = p_category_id and category.is_active
  ) then
    raise exception 'Invalid behavior category.' using errcode = '22023';
  end if;
  if p_brand_id is not null and not exists (
    select 1 from public.catalog_brands brand
    where brand.id = p_brand_id and brand.is_active
  ) then
    raise exception 'Invalid behavior brand.' using errcode = '22023';
  end if;

  insert into public.partner_behavior_events (
    event_name, user_id, company_id, session_id,
    product_id, category_id, brand_id, route,
    search_query_normalized, result_count, quantity,
    source_surface, metadata_safe
  ) values (
    p_event_name, auth.uid(), p_company_id, p_session_id,
    p_product_id, p_category_id, p_brand_id, normalized_route,
    normalized_query, p_result_count, p_quantity,
    nullif(btrim(p_source_surface), ''), coalesce(p_metadata_safe, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.record_partner_behavior_event(
  uuid, text, uuid, uuid, uuid, uuid, text, text, integer, numeric, text, jsonb
) from public, anon;
grant execute on function public.record_partner_behavior_event(
  uuid, text, uuid, uuid, uuid, uuid, text, text, integer, numeric, text, jsonb
) to authenticated;
