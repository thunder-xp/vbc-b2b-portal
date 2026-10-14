-- Synthetic fixtures only. Run against an isolated local DB; all data is rolled back.
begin;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','manual-admin@example.invalid');
insert into public.user_profiles(id,email,status,user_type) values('10000000-0000-4000-8000-000000000001','manual-admin@example.invalid','active','internal')
on conflict(id) do update set status='active',user_type='internal';
insert into public.roles(id,code,name,scope) values('10000000-0000-4000-8000-000000000002','manual_fixture_admin','Fixture administrator','internal');
insert into public.permissions(code,scope) values('admin.integrations.manage','internal'),('admin.partner_integrity.manage','internal'),('admin.companies.view','internal');
insert into public.role_permissions(role_id,permission_id) select '10000000-0000-4000-8000-000000000002',id from public.permissions;
insert into public.internal_user_role_assignments(user_id,role_id) values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
insert into private.one_c_price_type_domain_registry(external_ref,price_domain,governance_note) values('10000000-0000-4000-8000-000000000007','PARTNER_CONTRACT_PRICE','Synthetic runtime fixture');
insert into public.partner_access_presets(code,name,sort_order) values('full_partner_access','Fixture access',1);
insert into public.partner_companies(id,external_1c_id,external_1c_code,display_name,status,external_1c_contract_id,external_1c_price_type_id,commercial_profile_state,commercial_profile_verified_at)
values('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','FIX-1','Fixture Partner','active','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000007','aligned',now());
insert into public.price_types(id,external_ref,name,currency_ref,currency_code,currency_status,is_active)
values('10000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000007','GOLD','94f0e33e-45d7-11ea-8111-000c29cf9dd4','USD','resolved',true);
insert into public.catalog_products(id,external_1c_id,sku,name,slug) values('10000000-0000-4000-8000-000000000009','fixture-product','FIX','Fixture Product','manual-fixture');
insert into public.product_prices(product_id,external_1c_price_type_id,price_type_id,currency,price_amount,currency_status,synced_at)
values('10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000008','USD',10,'resolved',now());

create function pg_temp.proof(p_main text default '10000000-0000-4000-8000-000000000006',p_cash text default '10000000-0000-4000-8000-000000000006',p_stale boolean default false) returns uuid language plpgsql as $$
declare proof_id uuid; company public.partner_companies%rowtype; snapshot jsonb; source jsonb; item jsonb;
begin
select * into company from public.partner_companies where id='10000000-0000-4000-8000-000000000003';
item:=jsonb_build_object('ownerReference',company.external_1c_id,'code','FIX','name','Fixture contract','number','NS-FIX','date','2026-01-01','contractType','СПокупателем','organizationReference','4643d461-aa49-4b70-9486-a59f80ee6af8','settlementCurrencyReference','cf53f667-77a3-4c69-8146-2fd58525bbfc','priceTypeReference','10000000-0000-4000-8000-000000000007','active',true,'deleted',false,'signed',false);
snapshot:=jsonb_build_object('counterparty',jsonb_build_object('reference',company.external_1c_id,'code','FIX-1','name','Fixture Partner','active',true),
'contracts',jsonb_build_array(item||jsonb_build_object('reference','10000000-0000-4000-8000-000000000005','default',true),item||jsonb_build_object('reference','10000000-0000-4000-8000-000000000006','default',false)),
'priceTypes',jsonb_build_array(jsonb_build_object('reference','10000000-0000-4000-8000-000000000007','name','GOLD','currencyReference','94f0e33e-45d7-11ea-8111-000c29cf9dd4','active',true)));
source:=jsonb_build_object('counterpartyReference',company.external_1c_id,'contractReference',p_main,'organizationReference','4643d461-aa49-4b70-9486-a59f80ee6af8','contractType','СПокупателем','active',true,'deleted',false,'default',p_main='10000000-0000-4000-8000-000000000005','priceTypeReference','10000000-0000-4000-8000-000000000007','priceTypeActive',true,'contractCurrencyReference','cf53f667-77a3-4c69-8146-2fd58525bbfc','priceTypeCurrencyReference','94f0e33e-45d7-11ea-8111-000c29cf9dd4','verifiedAt',now());
insert into public.partner_manual_contract_verifications(company_id,actor_user_id,main_contract_ref,cash_contract_ref,expected_contract_version,expected_cash_version,expected_profile_version,snapshot,profile_source,reason,correlation_id)
values(company.id,auth.uid(),p_main,p_cash,company.contract_mapping_version-case when p_stale then 1 else 0 end,
coalesce((select version from public.partner_company_cash_contract_mappings where company_id=company.id),0),company.commercial_profile_version,snapshot,source,'Explicit independently verified MAIN and CASH fixture',gen_random_uuid()) returning id into proof_id;
return proof_id;
end $$;

create function pg_temp.reject_profile_event() returns trigger language plpgsql as $$ begin raise exception 'Injected publication failure'; end $$;

do $$
declare evidence uuid; result jsonb; before_state jsonb; before_count bigint; source jsonb; changed jsonb; r record; sync uuid; audit_count bigint;
begin
assert public.has_internal_permission('admin.integrations.manage'),'fixture auth permissions';
evidence:=pg_temp.proof();
select snapshot into source from public.partner_manual_contract_verifications where id=evidence;
result:=public.publish_admin_partner_company_one_c_snapshot('10000000-0000-4000-8000-000000000003',source,'{}','{}','Initial canonical fixture snapshot',gen_random_uuid());
assert result->>'code'='MANUAL_ONE_C_SNAPSHOT_PUBLISHED',result::text;
select * into r from public.get_partner_commercial_readiness(array['10000000-0000-4000-8000-000000000003'::uuid],false);
assert r.readiness_class='READY','canonical fixture remains READY';
select profile_source into source from public.partner_manual_contract_verifications where id=evidence;
assert public.validate_partner_manual_profile_source('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000006',source)='COMMERCIAL_PROFILE_SYNC_SUCCESS','nondefault source accepted';
for changed in select value from jsonb_array_elements('[{"counterpartyReference":"wrong"},{"contractReference":"wrong"},{"organizationReference":"wrong"},{"active":false},{"deleted":true},{"contractType":"СПоставщиком"},{"priceTypeReference":null},{"priceTypeActive":false},{"contractCurrencyReference":null},{"priceTypeCurrencyReference":"cf53f667-77a3-4c69-8146-2fd58525bbfc"}]'::jsonb) loop
 assert public.validate_partner_manual_profile_source('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000006',source||changed)<>'COMMERCIAL_PROFILE_SYNC_SUCCESS','invalid source rejected';
end loop;
select to_jsonb(company) into before_state from public.partner_companies company where id='10000000-0000-4000-8000-000000000003';
select count(*) into before_count from public.partner_company_one_c_manual_sync_events;
-- Canonical publisher still rejects a nondefault source. Roll back its failure state.
begin
 result:=public.begin_admin_partner_commercial_profile_sync('10000000-0000-4000-8000-000000000003',1,'Canonical default remains required',gen_random_uuid());
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"service_role"}',true);
 result:=public.publish_partner_commercial_profile_sync((result->>'runId')::uuid,source||jsonb_build_object('contractReference','10000000-0000-4000-8000-000000000005','default',false));
 assert result->>'code'='COMMERCIAL_CONTRACT_INVALID','canonical nondefault rejected';
 raise exception using errcode='ZX001',message='Rollback canonical negative fixture';
exception when sqlstate 'ZX001' then null;
end;
result:=public.apply_admin_partner_manual_contract_selection(pg_temp.proof(p_stale=>true));
assert result->>'code'='MANUAL_SELECTION_CONFLICT','stale reviewed version rejected';
result:=public.apply_admin_partner_manual_contract_selection(pg_temp.proof(p_cash=>'10000000-0000-4000-8000-000000000099'));
assert result->>'status'='error',result::text;
assert before_state=(select to_jsonb(company) from public.partner_companies company where id='10000000-0000-4000-8000-000000000003'),'cash failure is atomic';
assert before_count=(select count(*) from public.partner_company_one_c_manual_sync_events),'failed snapshot/audit rolled back';
execute 'create trigger fixture_reject_profile before insert on public.partner_company_commercial_profile_events for each row execute function pg_temp.reject_profile_event()';
result:=public.apply_admin_partner_manual_contract_selection(evidence);
assert result->>'status'='error','late profile failure rejected';
assert before_state=(select to_jsonb(company) from public.partner_companies company where id='10000000-0000-4000-8000-000000000003'),'profile failure rolls back MAIN/CASH/provenance';
assert before_count=(select count(*) from public.partner_company_one_c_manual_sync_events),'late profile failure rolls back snapshot audit';
execute 'drop trigger fixture_reject_profile on public.partner_company_commercial_profile_events';
result:=public.apply_admin_partner_manual_contract_selection(evidence);
raise notice 'Atomic Apply: %',result;
assert result->>'status'='success' and result->>'readiness'='READY',result::text;
assert (select external_1c_contract_id='10000000-0000-4000-8000-000000000006' and status='active' and commercial_contract_selection_mode='MANUAL_VERIFIED' from public.partner_companies where id='10000000-0000-4000-8000-000000000003'),'approved nondefault main applied';
assert (public.qualify_partner_contract_candidate('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006')->>'qualified')::boolean,'cashless preflight uses explicit MAIN';
assert (public.qualify_partner_cash_contract_candidate('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000006')->>'qualified')::boolean,'cash independently qualified';
assert (select contract_external_1c_id='10000000-0000-4000-8000-000000000006' and active from public.partner_company_cash_contract_mappings where company_id='10000000-0000-4000-8000-000000000003'),'cash explicit mapping';
select * into r from public.get_partner_commercial_readiness(array['10000000-0000-4000-8000-000000000003'::uuid],false);
assert r.readiness_class='READY' and r.canonical_contract_ref='10000000-0000-4000-8000-000000000005' and not r.canonical_repairable,'manual READY despite genuine default divergence';
assert public.get_admin_partner_commercial_readiness('10000000-0000-4000-8000-000000000003')->>'defaultDivergence'='1C_DEFAULT_DIFFERS_FROM_MANUAL_SELECTION','informational divergence';
assert public.get_admin_partner_contract_mapping('10000000-0000-4000-8000-000000000003')->>'suggestedContractRef' is null,'no default suggestion for manual mode';
select count(*) into audit_count from public.partner_company_commercial_profile_events where actor_user_id=auth.uid() and reason='Explicit independently verified MAIN and CASH fixture';
assert audit_count=1,'administrator/reason audit';
result:=public.apply_admin_partner_manual_contract_selection(evidence);
assert (result->>'idempotent')::boolean,'atomic publication idempotency';
assert audit_count=(select count(*) from public.partner_company_commercial_profile_events),'no duplicate profile audit';
select sync_id into sync from public.one_c_counterparty_directory_syncs order by finished_at desc limit 1;
perform set_config('request.jwt.claim.role','service_role',true);
perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"service_role"}',true);
result:=public.initialize_partner_cash_contract_from_primary('10000000-0000-4000-8000-000000000003',auth.uid(),'Automatic cash must respect manual role',gen_random_uuid(),gen_random_uuid(),'system_remediation',false);
assert result->>'code'='CASH_INITIALIZATION_MANUAL_SELECTION_REQUIRES_ADMIN','automatic cash is not inferred from manual MAIN';
perform public.reconcile_partner_company_commercial_profiles_from_directory(sync,array['10000000-0000-4000-8000-000000000003'::uuid]);
assert (select external_1c_contract_id='10000000-0000-4000-8000-000000000006' from public.partner_companies where id='10000000-0000-4000-8000-000000000003'),'safety net preserves valid manual main';
update public.one_c_counterparty_contracts set is_deleted=true where is_published and external_1c_id='10000000-0000-4000-8000-000000000006';
select * into r from public.get_partner_commercial_readiness(array['10000000-0000-4000-8000-000000000003'::uuid],false);
assert r.readiness_class='DIRECTORY_CONFLICT' and not r.canonical_repairable,'invalid manual blocks without fallback';
perform public.reconcile_partner_company_commercial_profiles_from_directory(sync,array['10000000-0000-4000-8000-000000000003'::uuid]);
assert (select external_1c_contract_id='10000000-0000-4000-8000-000000000006' from public.partner_companies where id='10000000-0000-4000-8000-000000000003'),'no fallback after invalidation';
assert not has_table_privilege('authenticated','public.partner_manual_contract_verifications','INSERT'),'browser cannot forge evidence';
assert not has_table_privilege('anon','public.partner_manual_contract_verifications','SELECT'),'anon cannot read private evidence';
assert not has_function_privilege('authenticated','public.publish_partner_commercial_profile_sync(uuid,jsonb)','EXECUTE'),'profile publish stays service only';
end $$;
create temporary table runtime_evidence as select commercial_contract_verification_id as id from public.partner_companies where id='10000000-0000-4000-8000-000000000003';
grant select on runtime_evidence to authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare result jsonb;
begin
 result:=public.apply_admin_partner_manual_contract_selection((select id from runtime_evidence));
 assert result->>'status'='success' and (result->>'idempotent')::boolean,'authenticated RPC succeeds without table access';
 begin
  perform count(*) from public.partner_manual_contract_verifications;
  raise exception 'private evidence unexpectedly readable';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.publish_partner_commercial_profile_sync(gen_random_uuid(),'{}');
  raise exception 'direct profile publication unexpectedly callable';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
 begin
  perform public.apply_admin_partner_manual_contract_selection((select id from runtime_evidence));
  raise exception 'cross-actor Apply unexpectedly permitted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$
begin
 begin
  perform public.apply_admin_partner_manual_contract_selection(gen_random_uuid());
  raise exception 'anon Apply unexpectedly permitted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'manual contract governance runtime assertions passed' as result;
rollback;
