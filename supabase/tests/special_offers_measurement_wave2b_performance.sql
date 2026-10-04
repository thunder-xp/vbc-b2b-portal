-- Isolated acceptance clone only; 100k events / 1000 extra orders. Roll back everything.
begin;
set local statement_timeout='30s';
create temporary table measurement_order_copies(id uuid primary key);
insert into measurement_order_copies select gen_random_uuid() from generate_series(1,1000);
insert into public.partner_orders
select (jsonb_populate_record(null::public.partner_orders,to_jsonb(o)||jsonb_build_object(
  'id',copies.id,'submission_key',gen_random_uuid(),'submission_attempt_id',gen_random_uuid(),'cart_id',null,
  'created_at',now()-interval '1 day','submitted_at',now()-interval '1 day'))).*
from measurement_order_copies copies cross join public.partner_orders o
where o.id='9b2e3ac3-335b-43ab-844b-a411a7bb2a0f';
alter table public.partner_order_items disable trigger snapshot_partner_order_effective_price;
insert into public.partner_order_items
select (jsonb_populate_record(null::public.partner_order_items,to_jsonb(i)||jsonb_build_object('id',gen_random_uuid(),'order_id',copies.id))).*
from measurement_order_copies copies cross join public.partner_order_items i
where i.order_id='9b2e3ac3-335b-43ab-844b-a411a7bb2a0f';
alter table public.partner_order_items enable trigger snapshot_partner_order_effective_price;
insert into public.commercial_campaign_engagement_events(request_id,campaign_id,company_id,user_id,event_type,publication_version,mechanic_type,session_id,created_at,mechanic_eligible)
select gen_random_uuid(),case when n<=10000 then '83ea6436-c3f9-44f3-b374-a984b44bb200'::uuid else 'f59e3b33-a8b4-447d-8def-3f9cc4a54c80'::uuid end,
  'ba500000-0000-4000-8000-000000000001','aa500000-0000-4000-8000-000000000002',
  case when n%2=0 then 'detail_opened' else 'added_to_cart' end,1,'spend_threshold_promo',
  case when n%2=0 then gen_random_uuid() end,now()-make_interval(days=>n%30),n%3=0
from generate_series(1,100000) n;
analyze public.commercial_campaign_engagement_events;
analyze public.commercial_campaign_order_attributions;
analyze public.partner_order_items;
analyze public.partner_orders;
select set_config('request.jwt.claim.sub','aa500000-0000-4000-8000-000000000001',true);
do $$
declare started timestamptz; result jsonb;
begin
  started:=clock_timestamp();
  for n in 1..20 loop
    result:=public.get_admin_campaign_performance_v1(array['83ea6436-c3f9-44f3-b374-a984b44bb200'::uuid],now()-interval '7 days',now()+interval '1 minute');
  end loop;
  if result->0->>'attributedOrders' is distinct from '1001' then raise exception 'Benchmark lost orders: %',result; end if;
  raise notice 'RESULTS 100000 events / 1001 attributed orders: average ms=%',extract(epoch from clock_timestamp()-started)*1000/20;
end;
$$;
-- The exact reporting CTE is EXPLAINed by the local acceptance harness here, before rollback.
rollback;
