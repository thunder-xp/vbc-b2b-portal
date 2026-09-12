begin;

update public.catalog_sync_state
set root_external_1c_id = '11111111-1111-1111-1111-111111111111',
  root_name = 'SECURITYPARK DISTRIBUTION'
where id = 'daily_catalog';

insert into public.catalog_products(
  id, external_1c_id, sku, name, slug, is_active, is_visible,
  source_root_1c_id
) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'ARR-1', 'Arrival 1', 'arrival-1', true, true, '11111111-1111-1111-1111-111111111111'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'ARR-2', 'Arrival 2', 'arrival-2', true, true, '11111111-1111-1111-1111-111111111111'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'ARR-3', 'Arrival 3', 'arrival-3', true, true, '11111111-1111-1111-1111-111111111111'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'OUTSIDE', 'Outside root', 'outside-root', true, true, '99999999-9999-9999-9999-999999999999'),
  ('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 'INACTIVE', 'Inactive', 'inactive-arrival', false, true, '11111111-1111-1111-1111-111111111111');

insert into public.supplier_order_source_states(
  source_order_ref, source_order_number, source_document_date,
  current_state_ref, is_posted, is_deleted, is_closed,
  expected_arrival_date, last_seen_sync_id
) values
  ('30000000-0000-0000-0000-000000000001', 'ZERO-ELIGIBLE', current_date - 1, '585a9991-314b-11e9-a7dc-94de80db60f1', true, false, false, current_date - 1, '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 'AIR-CONTROL', current_date - 20, '585a9991-314b-11e9-a7dc-94de80db60f1', true, false, false, current_date - 18, '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', 'SEA-CONTROL', current_date - 19, '585a9991-314b-11e9-a7dc-94de80db60f1', true, false, false, current_date - 15, '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000004', 'ROAD-CONTROL', current_date - 18, '585a9991-314b-11e9-a7dc-94de80db60f1', true, false, false, current_date - 12, '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000005', 'OLDER-ELIGIBLE', current_date - 17, '585a9991-314b-11e9-a7dc-94de80db60f1', true, false, false, current_date - 9, '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000006', 'FUTURE-IGNORED', current_date, '585a9991-314b-11e9-a7dc-94de80db60f1', true, false, false, current_date, '40000000-0000-0000-0000-000000000001');

insert into public.warehouse_arrivals(
  id, source_order_ref, source_order_number, source_status_before,
  source_status_after, completed_at, source_updated_at, source_sync_id,
  fingerprint, source_line_count, mapped_product_count,
  unmapped_line_count
) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'ZERO-ELIGIBLE', '02166cc3-bf4b-11e9-a7fe-000c2988d323', '585a9991-314b-11e9-a7dc-94de80db60f1', statement_timestamp() - interval '1 hour', statement_timestamp() - interval '1 hour', '40000000-0000-0000-0000-000000000001', repeat('1', 64), 2, 2, 0),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'AIR-CONTROL', '02166cc3-bf4b-11e9-a7fe-000c2988d323', '585a9991-314b-11e9-a7dc-94de80db60f1', statement_timestamp() - interval '2 hours', statement_timestamp() - interval '2 hours', '40000000-0000-0000-0000-000000000001', repeat('2', 64), 2, 2, 0),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'SEA-CONTROL', '02166cc3-bf4b-11e9-a7fe-000c2988d323', '585a9991-314b-11e9-a7dc-94de80db60f1', statement_timestamp() - interval '3 hours', statement_timestamp() - interval '3 hours', '40000000-0000-0000-0000-000000000001', repeat('3', 64), 1, 1, 0),
  ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', 'ROAD-CONTROL', '02166cc3-bf4b-11e9-a7fe-000c2988d323', '585a9991-314b-11e9-a7dc-94de80db60f1', statement_timestamp() - interval '4 hours', statement_timestamp() - interval '4 hours', '40000000-0000-0000-0000-000000000001', repeat('4', 64), 1, 1, 0),
  ('50000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005', 'OLDER-ELIGIBLE', '02166cc3-bf4b-11e9-a7fe-000c2988d323', '585a9991-314b-11e9-a7dc-94de80db60f1', statement_timestamp() - interval '5 hours', statement_timestamp() - interval '5 hours', '40000000-0000-0000-0000-000000000001', repeat('5', 64), 1, 1, 0),
  ('50000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000006', 'FUTURE-IGNORED', '02166cc3-bf4b-11e9-a7fe-000c2988d323', '585a9991-314b-11e9-a7dc-94de80db60f1', statement_timestamp() + interval '1 hour', statement_timestamp(), '40000000-0000-0000-0000-000000000001', repeat('6', 64), 1, 1, 0);

insert into public.warehouse_arrival_items(
  arrival_id, source_line_number, external_product_ref,
  external_characteristic_ref, product_id, source_ordered_quantity
) values
  ('50000000-0000-0000-0000-000000000001', 1, '20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 1),
  ('50000000-0000-0000-0000-000000000001', 2, '20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005', 1),
  ('50000000-0000-0000-0000-000000000002', 1, '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 2),
  ('50000000-0000-0000-0000-000000000002', 2, '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 3),
  ('50000000-0000-0000-0000-000000000003', 1, '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 4),
  ('50000000-0000-0000-0000-000000000004', 1, '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 5),
  ('50000000-0000-0000-0000-000000000005', 1, '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 6),
  ('50000000-0000-0000-0000-000000000006', 1, '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 7);

do $$
declare
  first_result jsonb;
  second_result jsonb;
begin
  first_result := public.reconcile_current_warehouse_replenishment_day(false);

  if first_result->>'active_shipment_count' <> '3'
    or first_result->>'unique_product_count' <> '3' then
    raise exception 'unexpected reconciliation result: %', first_result;
  end if;

  if (select array_agg(source_order_number order by window_position)
      from public.current_warehouse_replenishment_sources
      where singleton_key = 1)
    <> array['AIR-CONTROL', 'SEA-CONTROL', 'ROAD-CONTROL'] then
    raise exception 'eligible shipment window or ordering is incorrect';
  end if;

  if exists (
    select 1 from public.current_warehouse_replenishment_sources
    where source_order_number in ('ZERO-ELIGIBLE', 'OLDER-ELIGIBLE', 'FUTURE-IGNORED')
  ) then
    raise exception 'zero-eligible, fourth-oldest, or future shipment consumed a slot';
  end if;

  if (select source_arrival_id
      from public.current_warehouse_replenishment_items
      where product_id = '10000000-0000-0000-0000-000000000001')
    <> '50000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'newest shipment provenance did not win deduplication';
  end if;

  if (select count(*) from public.current_warehouse_replenishment_items
      where singleton_key = 1) <> 3 then
    raise exception 'canonical product projection is not deduplicated';
  end if;

  if (select count(*) from public.current_warehouse_replenishment_item_sources
      where singleton_key = 1) <> 4 then
    raise exception 'shipment membership provenance was not preserved';
  end if;

  second_result := public.reconcile_current_warehouse_replenishment_day(false);
  if (second_result->>'updated')::boolean then
    raise exception 'unchanged source window produced a new projection';
  end if;

  update public.supplier_order_source_states
  set is_closed = true
  where source_order_number = 'AIR-CONTROL';
  perform public.reconcile_current_warehouse_replenishment_day(false);
  if (select array_agg(source_order_number order by window_position)
      from public.current_warehouse_replenishment_sources
      where singleton_key = 1)
    <> array['SEA-CONTROL', 'ROAD-CONTROL', 'OLDER-ELIGIBLE'] then
    raise exception 'invalidated shipment did not pull in the next older eligible shipment';
  end if;

  update public.supplier_order_source_states
  set is_deleted = true
  where source_order_number = 'SEA-CONTROL';
  perform public.reconcile_current_warehouse_replenishment_day(false);
  if (select count(*) from public.current_warehouse_replenishment_sources
      where singleton_key = 1) <> 2 then
    raise exception 'two-shipment window was not preserved';
  end if;

  update public.supplier_order_source_states
  set is_posted = false
  where source_order_number = 'ROAD-CONTROL';
  perform public.reconcile_current_warehouse_replenishment_day(false);
  if (select count(*) from public.current_warehouse_replenishment_sources
      where singleton_key = 1) <> 1 then
    raise exception 'one-shipment window was not preserved';
  end if;
end;
$$;

rollback;
