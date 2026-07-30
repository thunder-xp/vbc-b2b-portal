begin;

alter table public.partner_behavior_events
  drop constraint if exists partner_behavior_event_name_check;

alter table public.partner_behavior_events
  add constraint partner_behavior_event_name_check check (event_name = any(array[
    'catalog_viewed', 'category_viewed', 'search_performed',
    'search_no_results', 'filters_applied',
    'merchandising_section_viewed', 'merchandising_product_clicked',
    'product_viewed', 'product_overview_viewed',
    'product_description_viewed', 'product_characteristics_viewed',
    'product_datasheet_viewed', 'product_pricing_tab_viewed',
    'retail_price_history_range_changed', 'retail_price_history_data_opened',
    'product_document_downloaded', 'stock_state_viewed', 'arrival_date_viewed',
    'product_added_to_favorites', 'product_removed_from_favorites',
    'product_added_to_compare', 'product_removed_from_compare',
    'product_added_to_cart', 'product_removed_from_cart',
    'cart_quantity_changed', 'product_added_to_estimate',
    'estimate_created', 'proposal_generated', 'order_submitted',
    'reorder_started', 'reorder_submitted',
    'out_of_stock_product_viewed', 'unavailable_product_added',
    'arrival_interest_viewed',
    'dashboard_viewed', 'dashboard_action_clicked',
    'partner_dashboard_viewed', 'dashboard_attention_opened',
    'dashboard_quick_action_clicked', 'dashboard_order_opened',
    'dashboard_shipment_opened', 'dashboard_continue_work_clicked',
    'dashboard_reorder_product_added', 'dashboard_finance_opened',
    'dashboard_offer_opened', 'dashboard_company_opened',
    'order_list_viewed', 'order_opened', 'shipment_viewed',
    'date_change_started', 'finance_viewed', 'company_users_viewed',
    'estimates_viewed', 'estimate_product_added', 'estimate_service_added',
    'estimate_price_check_started', 'estimate_price_check_applied',
    'proposal_created', 'proposal_version_created', 'proposal_previewed',
    'proposal_pdf_generated', 'proposal_sent', 'proposal_send_failed',
    'proposal_converted_to_order',
    'notifications_opened', 'notification_opened',
    'notification_marked_read', 'notifications_marked_all_read',
    'notification_dismissed', 'notification_preferences_updated'
  ]));

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(procedure.oid)
  into function_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'record_partner_behavior_event'
  limit 1;

  if function_definition is null then
    raise exception 'Behavior event RPC is unavailable.';
  end if;
  if position('notifications_opened' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      '''proposal_converted_to_order''',
      '''proposal_converted_to_order'', ''notifications_opened'', ''notification_opened'', ''notification_marked_read'', ''notifications_marked_all_read'', ''notification_dismissed'', ''notification_preferences_updated'''
    );
    execute function_definition;
  end if;
end;
$$;

commit;
