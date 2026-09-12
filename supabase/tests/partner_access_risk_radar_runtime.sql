begin;

select plan(20);

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('a1000000-0000-4000-8000-000000000001','authenticated','authenticated','risk-admin@example.test',now(),now()),
  ('a1000000-0000-4000-8000-000000000002','authenticated','authenticated','device-only@example.test',now(),now()),
  ('a1000000-0000-4000-8000-000000000003','authenticated','authenticated','strong-signal@example.test',now(),now()),
  ('a1000000-0000-4000-8000-000000000004','authenticated','authenticated','normal-member@example.test',now(),now());

insert into public.user_profiles(id,email,full_name,status,user_type) values
  ('a1000000-0000-4000-8000-000000000001','risk-admin@example.test','Risk Admin','active','internal'),
  ('a1000000-0000-4000-8000-000000000002','device-only@example.test','Device Only','active','partner'),
  ('a1000000-0000-4000-8000-000000000003','strong-signal@example.test','Strong Signal','active','partner'),
  ('a1000000-0000-4000-8000-000000000004','normal-member@example.test','Normal Member','active','partner');

insert into public.internal_user_role_assignments(user_id,role_id,assigned_by)
select 'a1000000-0000-4000-8000-000000000001',id,null from public.roles where code='novotech_admin';

insert into public.partner_companies(id,external_1c_id,display_name,status)
values ('c1000000-0000-4000-8000-000000000001','RISK-RUNTIME-TEST','Risk Runtime Test','active');

insert into public.company_memberships(user_id,company_id,role_id,status,approved_at)
select fixture.user_id,'c1000000-0000-4000-8000-000000000001',role.id,'active',now()
from (values
  ('a1000000-0000-4000-8000-000000000002'::uuid),
  ('a1000000-0000-4000-8000-000000000003'::uuid),
  ('a1000000-0000-4000-8000-000000000004'::uuid)
) fixture(user_id) cross join public.roles role where role.code='partner_owner';

insert into public.access_risk_hourly_aggregates(
  company_id,user_id,hour_bucket,browse_event_count,product_view_count,
  session_mask,device_mask,network_mask,product_mask,category_mask
) values
  ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',date_trunc('hour',now()),10,10,
    public.access_risk_mask_from_buckets(array[1]),public.access_risk_mask_from_buckets(array[11,12,13]),B'0'::bit(256),public.access_risk_mask_from_buckets(array[21,22]),public.access_risk_mask_from_buckets(array[31])),
  ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003',date_trunc('hour',now()),160,80,
    public.access_risk_mask_from_buckets(array[1,2,3,4,5]),public.access_risk_mask_from_buckets(array[11,12,13]),public.access_risk_mask_from_buckets(array[41,42,43,44]),public.access_risk_mask_from_buckets(array(select generate_series(50,79))),public.access_risk_mask_from_buckets(array(select generate_series(80,94))));

select is(public.evaluate_partner_access_risk(200)->>'status','COMPLETED','risk evaluation completes');
select is((select risk_state from public.access_risk_user_snapshots where user_id='a1000000-0000-4000-8000-000000000002'),'LEARNING','new-device-only user remains learning, never high');
select isnt((select risk_state from public.access_risk_user_snapshots where user_id='a1000000-0000-4000-8000-000000000002'),'HIGH','new devices alone cannot create HIGH');
select is((select risk_state from public.access_risk_user_snapshots where user_id='a1000000-0000-4000-8000-000000000003'),'HIGH','concurrency plus identity and velocity creates HIGH');
select ok((select reason_codes @> array['CONCURRENT_SESSION_ANOMALY','NETWORK_CHURN','HIGH_VELOCITY_BROWSING'] from public.access_risk_user_snapshots where user_id='a1000000-0000-4000-8000-000000000003'),'HIGH snapshot is explainable');
select ok(not exists(
  select 1
  from public.access_risk_user_snapshots snapshot
  cross join lateral jsonb_array_elements(snapshot.reasons) reason
  where snapshot.user_id='a1000000-0000-4000-8000-000000000003'
    and (reason->>'observed')::integer < (reason->>'threshold')::integer
),'every active reason displays an attained threshold');
select is((select risk_state from public.access_risk_company_snapshots where company_id='c1000000-0000-4000-8000-000000000001'),'HIGH','company aggregates strongest user state');
select is((select active_user_count from public.access_risk_company_snapshots where company_id='c1000000-0000-4000-8000-000000000001'),3,'multiple legitimate users remain distinct and are not themselves a signal');

select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select ok(
  (public.get_admin_access_risk_overview(null,null,null,'risk_desc',1,25)->'kpis') ? 'low'
  and (public.get_admin_access_risk_overview(null,null,null,'risk_desc',1,25)->'items'->0) ?&
    array['devices_24h','networks_24h','unique_skus_24h','commercial_intents_24h'],
  'Admin overview returns LOW KPI and the required bounded activity metrics'
);
select is(public.set_admin_access_risk_monitoring('c1000000-0000-4000-8000-000000000001','ENHANCED',14,'Runtime security acceptance')->>'mode','ENHANCED','authorized Admin activates Enhanced mode');
select ok((select expires_at <= activated_at + interval '14 days 1 second' from public.access_risk_monitoring_profiles where company_id='c1000000-0000-4000-8000-000000000001'),'Enhanced duration is bounded');

select is(public.record_partner_access_risk_batch(
  'b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003',
  array[7],array[8],array[9],'v1:'||repeat('a',64),'v1:'||repeat('b',64),'v1:'||repeat('c',64),'MD','CU',array[]::integer[],array[]::integer[],
  '[{"eventName":"product_viewed","routeFamily":"/cabinet/catalog","occurredAt":"2026-09-13T00:00:00Z"}]'::jsonb
)->>'accepted','true','service boundary accepts bounded telemetry');
select is((select count(*)::integer from public.access_risk_enhanced_events where company_id='c1000000-0000-4000-8000-000000000001'),1,'Enhanced mode persists one bounded detail row');
select is((select count(*)::integer from public.access_risk_enhanced_events where network_hash like '%203.0.113%'),0,'raw network address is absent');

update public.access_risk_monitoring_profiles set activated_at=now()-interval '8 days',expires_at=now()-interval '1 second' where company_id='c1000000-0000-4000-8000-000000000001';
select is(public.evaluate_partner_access_risk(200)->>'status','COMPLETED','expiry evaluation completes');
select is((select mode from public.access_risk_monitoring_profiles where company_id='c1000000-0000-4000-8000-000000000001'),'NORMAL','Enhanced mode expires automatically');
select ok(exists(select 1 from public.access_risk_monitoring_events where company_id='c1000000-0000-4000-8000-000000000001' and event_type='ENHANCED_EXPIRED'),'automatic expiry is audited');

select table_privs_are('public','access_risk_hourly_aggregates','authenticated',array[]::text[],'partners have no direct aggregate-table privileges');
select function_privs_are(
  'public','record_partner_access_risk_batch',
  array['uuid','uuid','uuid','integer[]','integer[]','integer[]','text','text','text','text','text','integer[]','integer[]','jsonb'],
  'authenticated',array[]::text[],'browser-authenticated role cannot call the telemetry writer directly'
);
select throws_ok(
  $$select public.record_partner_access_risk_batch(
    'b1000000-0000-4000-8000-000000000099','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    array[1],array[2],array[3],'v1:'||repeat('a',64),'v1:'||repeat('b',64),'v1:'||repeat('c',64),null,null,array[]::integer[],array[]::integer[],
    '[{"eventName":"product_viewed","routeFamily":"/cabinet/catalog","occurredAt":"2026-09-13T00:00:00Z"}]'::jsonb
  )$$,
  '22023','Invalid access risk telemetry batch.','mismatched company/user identity is rejected server-side'
);

select * from finish();
rollback;
