begin;

create index current_warehouse_replenishment_sources_order_idx
  on public.current_warehouse_replenishment_sources(source_order_ref);

create index current_warehouse_replenishment_item_sources_order_idx
  on public.current_warehouse_replenishment_item_sources(
    singleton_key, source_order_ref
  );

commit;
