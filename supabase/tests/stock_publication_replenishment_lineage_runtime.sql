-- Isolated local DB only; synthetic receipt and two stock products; no production data.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.catalog_sync_state(id,root_name,root_external_1c_id)
values('daily_catalog','SECURITYPARK DISTRIBUTION','11111111-1111-1111-1111-111111111111');
insert into public.catalog_products(id,external_1c_id,sku,name,slug,source_root_1c_id) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','LINEAGE-1','Receipt fixture','stock-lineage-fixture-1','11111111-1111-1111-1111-111111111111'),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','LINEAGE-2','Other affected product','stock-lineage-fixture-2','11111111-1111-1111-1111-111111111111');
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000003','stock-fixture@example.invalid');
insert into public.user_profiles(id,email,status,user_type) values('10000000-0000-4000-8000-000000000003','stock-fixture@example.invalid','active','partner')
on conflict(id) do update set status='active',user_type='partner';
insert into public.roles(id,code,name,scope) values('10000000-0000-4000-8000-000000000004','lineage_fixture_partner','Fixture Partner','partner');
insert into public.permissions(id,code,scope) values('10000000-0000-4000-8000-000000000005','catalog.view','partner');
insert into public.role_permissions(role_id,permission_id) values('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005');
insert into public.partner_access_presets(code,name,sort_order) values('full_partner_access','Fixture full access',1);
insert into public.partner_access_preset_capabilities(preset_code,permission_id) values('full_partner_access','10000000-0000-4000-8000-000000000005');
insert into public.partner_companies(id,external_1c_id,display_name,status) values('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000006','Fixture Partner','active');
insert into public.company_memberships(company_id,user_id,role_id,status) values('10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','active');
insert into public.supplier_order_source_states(source_order_ref,source_order_number,source_document_date,current_state_ref,is_posted,is_deleted,is_closed,last_seen_sync_id,source_version)
values('30000000-0000-4000-8000-000000000001','RECEIPT-FIXTURE',current_date,'02166cc3-bf4b-11e9-a7fe-000c2988d323',true,false,false,'40000000-0000-4000-8000-000000000001','before');
insert into public.product_supplier_arrivals(product_id,external_characteristic_ref,expected_arrival_date,expected_quantity,is_published,published_at,source_sync_id)
values('10000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',current_date+1,20,true,now(),'40000000-0000-4000-8000-000000000001');

create function pg_temp.stage_snapshot(p_sync uuid) returns void language plpgsql as $$
begin
insert into public.stock_sync_state(id,status,active_sync_id,snapshot_time,scan_complete)
values('exact_stock','running',p_sync,statement_timestamp(),true)
on conflict(id) do update set status='running',active_sync_id=p_sync,snapshot_time=statement_timestamp(),scan_complete=true;
insert into public.stock_warehouse_sync_stage(sync_id,external_ref,code,name,is_active)
values(p_sync,'86197770-0aac-431a-aad6-8e7099029bbb','FIX','Depozit principal Chisinau',true);
insert into public.stock_balance_sync_stage(sync_id,balance_kind,source_page,external_product_ref,external_warehouse_ref,external_characteristic_ref,quantity)
select p_sync,kind,0,product.external_1c_id,'86197770-0aac-431a-aad6-8e7099029bbb','00000000-0000-0000-0000-000000000000',
case kind when 'physical' then 20 when 'reserved' then 0 else 3 end
from public.catalog_products product cross join unnest(array['physical','reserved','incoming']) kind;
insert into public.supplier_order_document_stage(sync_id,external_supplier_order_ref,is_posted,is_deleted,is_closed,external_state_ref,expected_arrival_date,date_placement,source_version,source_order_number,source_document_date,warehouse_ref)
values(p_sync,'30000000-0000-4000-8000-000000000001',true,false,false,'585a9991-314b-11e9-a7dc-94de80db60f1',current_date,'ВШапке','after','RECEIPT-FIXTURE',current_date,'86197770-0aac-431a-aad6-8e7099029bbb');
insert into public.supplier_order_item_stage(sync_id,external_supplier_order_ref,line_number,external_product_ref,external_characteristic_ref,ordered_quantity,unit,expected_arrival_date)
values(p_sync,'30000000-0000-4000-8000-000000000001',1,'20000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',20,'pcs',current_date);
end $$;
select pg_temp.stage_snapshot('40000000-0000-4000-8000-000000000002');

create function pg_temp.reject_projection() returns trigger language plpgsql as $$ begin raise exception 'Injected latest-three projection failure'; end $$;

do $$
declare result jsonb; events_before bigint; notifications_before bigint; arrivals_before bigint; definition text;
begin
assert (select count(*)=4 from information_schema.columns where table_schema='public' and table_name='current_warehouse_replenishment_items' and column_name in ('source_arrival_id','source_order_ref','actual_arrival_at','window_position') and is_nullable='NO'),'lineage stays NOT NULL';
select pg_get_functiondef('public.publish_exact_stock_snapshot_replenishment_day_base(uuid)'::regprocedure) into definition;
assert definition not ilike '%insert into public.current_warehouse_replenishment_items%','obsolete INSERT absent';
assert public.notification_user_has_permission('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006','catalog.view'),'notification fixture permission';
execute 'create trigger fixture_reject_projection before insert on public.current_warehouse_replenishment_items for each row execute function pg_temp.reject_projection()';
begin
 perform public.publish_exact_stock_snapshot('40000000-0000-4000-8000-000000000002');
 raise exception 'Injected projection failure was not reached';
exception when raise_exception then
 if SQLERRM <> 'Injected latest-three projection failure' then raise; end if;
end;
assert not exists(select 1 from public.product_stock_totals),'failed publication rolled back physical stock';
assert not exists(select 1 from public.warehouse_arrivals),'failed publication rolled back immutable arrival insertion';
assert not exists(select 1 from public.partner_notifications),'failed publication rolled back notifications';
assert exists(select 1 from public.product_supplier_arrivals where is_published),'failed publication preserves expected arrival';
assert (select count(*)=6 from public.stock_balance_sync_stage),'failed publication preserves staged stock for retry';
execute 'drop trigger fixture_reject_projection on public.current_warehouse_replenishment_items';
result:=public.publish_exact_stock_snapshot('40000000-0000-4000-8000-000000000002');
assert (select status='succeeded' and last_completed_sync_id='40000000-0000-4000-8000-000000000002' from public.stock_sync_state where id='exact_stock'),'real full-chain publication succeeded';
assert (select count(*)=2 from public.product_stock_totals where physical_quantity=20 and reserved_quantity=0 and available_quantity=20 and incoming_quantity=3 and is_published),'all affected product stock published';
assert not exists(select 1 from public.product_supplier_arrivals where is_published),'obsolete supplier arrival deactivated';
assert (select count(*)=1 from public.warehouse_arrivals),'one completed receipt recorded';
assert (select count(*)=1 from public.current_warehouse_replenishment_items item join public.warehouse_arrivals arrival on arrival.id=item.source_arrival_id where item.source_order_ref=arrival.source_order_ref and item.actual_arrival_at=arrival.completed_at and item.window_position=1),'projection retains valid receipt/order lineage';
assert not exists(select 1 from public.current_warehouse_replenishment_items where source_arrival_id is null),'no null source arrival';
assert (select count(*)=1 from public.current_warehouse_replenishment_sources),'dashboard ARRIVAL source remains available';
perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
result:=public.get_partner_current_warehouse_replenishment_v2('10000000-0000-4000-8000-000000000006',5,0);
assert result->>'totalCount'='1' and jsonb_array_length(result->'items')=1,'partner dashboard/replenishment RPC returns canonical membership';
perform set_config('request.jwt.claims','{"role":"service_role"}',true);
assert (select count(*)=1 from public.partner_notifications where archived_at is null and event_code='warehouse_arrival_completed'),'one active current-window notification';
select count(*) into events_before from public.partner_notification_events;
select count(*) into notifications_before from public.partner_notifications;
select count(*) into arrivals_before from public.warehouse_arrivals;
-- Real RPC calls run in separate transactions. Drop only their transaction-local
-- scratch tables so a second call can be exercised inside this rollback fixture.
execute 'drop table pg_temp.stock_publication_desired_arrivals,pg_temp.stock_publication_desired_balances,pg_temp.stock_publication_desired_totals,pg_temp.stock_publication_reconciliation';
perform pg_temp.stage_snapshot('40000000-0000-4000-8000-000000000003');
result:=public.publish_exact_stock_snapshot('40000000-0000-4000-8000-000000000003');
assert events_before=(select count(*) from public.partner_notification_events),'retry does not duplicate notification events';
assert notifications_before=(select count(*) from public.partner_notifications),'retry does not duplicate notifications';
assert arrivals_before=(select count(*) from public.warehouse_arrivals),'retry does not duplicate receipt history';
assert not (result->'current_warehouse_replenishment_day'->>'updated')::boolean,'retry leaves unchanged latest-three projection intact';
assert not has_function_privilege('anon','public.publish_exact_stock_snapshot_replenishment_day_base(uuid)','EXECUTE'),'anon remains denied';
assert not has_function_privilege('authenticated','public.publish_exact_stock_snapshot_replenishment_day_base(uuid)','EXECUTE'),'browser remains denied';
end $$;
select 'stock publication and replenishment lineage assertions passed' as result;
rollback;
