begin;

alter table public.internal_sync_action_audit_events
  drop constraint if exists internal_sync_action_audit_events_domain_check;

alter table public.internal_sync_action_audit_events
  add constraint internal_sync_action_audit_events_domain_check
  check (domain in (
    'rates', 'catalog', 'prices', 'stock', 'commercial',
    'active_orders', 'order_history', 'finance', 'product_relations'
  ));

commit;
