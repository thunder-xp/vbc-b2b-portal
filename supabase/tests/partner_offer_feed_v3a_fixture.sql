begin;
do $$ begin if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-V3A-PARTNER-MIXED-OFFER-MARKETPLACE-20261008' then raise exception 'Local V3A target assertion missing'; end if; end $$;

do $$
<<acceptance>>
declare
  actor uuid := 'aa500000-0000-4000-8000-000000000001';
  product_c uuid := 'ca500000-0000-4000-8000-000000000003';
  component jsonb;
  bundle jsonb;
  req uuid;
  item_b uuid;
  before_qty jsonb;
  partner uuid := 'aa500000-0000-4000-8000-000000000002';
  outsider uuid := 'aa500000-0000-4000-8000-000000000003';
  company uuid := 'ba500000-0000-4000-8000-000000000001';
  outsider_company uuid := 'ba500000-0000-4000-8000-000000000002';
  product uuid := 'ca500000-0000-4000-8000-000000000001';
  product_without_promo uuid := 'ca500000-0000-4000-8000-000000000002';
  promo_profile uuid := 'da500000-0000-4000-8000-000000000001';
  campaign uuid;
  item uuid;
  legacy_campaign uuid;
  legacy_item uuid;
  draft jsonb;
  eligibility jsonb;
  partner_detail jsonb;
  cart_result jsonb;
  version_one_items jsonb;
  cart_id uuid;
  cart_item uuid;
  prices jsonb;
  evidence jsonb;
  contract_ref text := '22222222-2222-4222-8222-222222222222';
  base_ref text := '23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c';
  usd_ref text := '44444444-4444-4444-8444-444444444444';
  mdl_ref text := '55555555-5555-4555-8555-555555555555';
  sync uuid := '66666666-6666-4666-8666-666666666666';
  rate_id uuid;
  submitted_items jsonb;
  payload jsonb;
  validation jsonb;
  created_order public.partner_orders;
  collision uuid;
  outsider_cart uuid;
  started timestamptz;
  previous_updated_at timestamptz;
  reopened jsonb; duplicated uuid; preview jsonb; before_prices jsonb; unit_mdl numeric; total_mdl numeric;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (actor,'authenticated','authenticated','quantity-promo-admin@example.test',now(),now()),
    (partner,'authenticated','authenticated','quantity-promo-partner@example.test',now(),now()),
    (outsider,'authenticated','authenticated','quantity-promo-outsider@example.test',now(),now());
  insert into public.user_profiles(id,email,full_name,status,user_type) values
    (actor,'quantity-promo-admin@example.test','Quantity promo admin','active','internal'),
    (partner,'quantity-promo-partner@example.test','Quantity promo partner','active','partner'),
    (outsider,'quantity-promo-outsider@example.test','Quantity promo outsider','active','partner');
  insert into public.internal_user_role_assignments(user_id,role_id,assigned_by)
  select actor,id,actor from public.roles where code='novotech_admin';
  insert into public.partner_companies(id,external_1c_id,display_name,status) values
    (company,'QUANTITY-PROMO-COMPANY','Quantity promo company','active'),
    (outsider_company,'QUANTITY-PROMO-OUTSIDER','Quantity promo outsider','active');
  insert into public.company_memberships(user_id,company_id,role_id,status,approved_by,approved_at)
  select partner,company,id,'active',actor,now() from public.roles where code='partner_owner'
  union all
  select outsider,outsider_company,id,'active',actor,now() from public.roles where code='partner_owner';
  insert into public.catalog_products(id,external_1c_id,sku,name,slug) values
    (product,'QUANTITY-PROMO-PRODUCT','QTY-PROMO-SKU','Quantity promo product','quantity-promo-product'),
    (product_without_promo,'QUANTITY-PROMO-NO-PRICE','QTY-NO-PROMO','Quantity no promo product','quantity-no-promo-product');
  insert into public.price_types(id,external_ref,external_code,name,currency_code,currency_status,is_active)
  values(promo_profile,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','UU-000021','PROMO','USD','resolved',true);
  insert into public.product_prices(
    product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,
    price_type_id,effective_at,currency_status,is_published
  ) values(
    product,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',84,now()-interval '1 day',true,
    promo_profile,now()-interval '1 day','resolved',true
  );

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);


  update public.partner_companies set external_1c_id='11111111-1111-4111-8111-111111111111',
    external_1c_contract_id=contract_ref, external_1c_price_type_id=base_ref where id=company;
  insert into public.price_types(external_ref,external_code,name,currency_ref,currency_code,currency_status,is_active)
  values(base_ref,'TEST','Partner','44444444-4444-4444-8444-444444444444','USD','resolved',true),
    ('77777777-7777-4777-8777-777777777777','TEST-MDL','MDL',mdl_ref,'MDL','resolved',true);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
  values(product,base_ref,'USD',92,now()-interval '1 day',true,'resolved',true);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
    select id,base_ref,'USD',92,now()-interval '1 day',true,'resolved',true from public.catalog_products where id in (product_without_promo,product_c);
  insert into public.one_c_counterparty_directory_syncs(sync_id,status,started_at) values(sync,'succeeded',now());
  insert into public.one_c_counterparty_price_profiles(sync_id,counterparty_external_1c_id,external_1c_id,name,is_active,is_deleted,is_published,synchronized_at,currency_external_1c_id)
  values(sync,'11111111-1111-4111-8111-111111111111',base_ref,'Partner',true,false,true,now(),usd_ref);
  insert into public.one_c_counterparty_contracts(sync_id,counterparty_external_1c_id,external_1c_id,name,price_type_external_1c_id,is_active,is_deleted,is_published,synchronized_at,contract_type,organization_external_1c_id,contract_currency_external_1c_id)
  values(sync,'11111111-1111-4111-8111-111111111111',contract_ref,'Partner contract',base_ref,true,false,true,now(),convert_from(decode('d181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc','hex'),'UTF8'),'4643d461-aa49-4b70-9486-a59f80ee6af8',mdl_ref);
  insert into public.commercial_exchange_rates(source_code,base_currency,quote_currency,rate_direction,rate,effective_date,is_published,is_active,purpose,source_type,effective_at,published_at,source_currency_ref,source_symbolic_code,source_raw_rate,source_multiplicity,source_data_version,source_checked_at)
  values('999','USD','MDL','quote_per_base',18.0105,current_date,true,true,'retail_price_usd_to_mdl','one_c_automatic',now(),now(),mdl_ref,'BCR',18.0105,1,'wave1b',now()) returning id into rate_id;


end $$;

insert into public.price_types(external_ref,external_code,name,currency_code,currency_status,is_active) values('e181c772-93fc-11e9-94cb-000c2988d323','UU-000020','RETAIL','MDL','resolved',true);
create schema offer_feed_fixture;
create table offer_feed_fixture.campaigns(mechanic text primary key,campaign_id uuid not null);
do $$
declare actor uuid:='aa500000-0000-4000-8000-000000000001'; company uuid:='ba500000-0000-4000-8000-000000000001';
 promo uuid:='da500000-0000-4000-8000-000000000001'; base_ref text:='23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c';
 product_id uuid; a uuid; b uuid; mechanic text; items jsonb; extra jsonb; draft jsonb; campaign uuid;
begin
 for n in 1..48 loop
  product_id:=('cf350000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  insert into public.catalog_products(id,external_1c_id,sku,name,slug) values(product_id,product_id::text,'V3A-'||lpad(n::text,3,'0'),'Dahua AIR SHIELD / Датчик '||n,'v3a-product-'||n);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
   values(product_id,base_ref,'USD',92,now()-interval '1 day',true,'resolved',true),
   (product_id,'d9c92519-658b-11e8-80d3-000c29a58b59','USD',120,now()-interval '1 day',true,'resolved',true);
  insert into public.product_prices(product_id,external_product_ref,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published) values(product_id,product_id,'e181c772-93fc-11e9-94cb-000c2988d323','MDL',2280,now()-interval '1 day',true,'resolved',true);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,price_type_id,effective_at,currency_status,is_published)
   values(product_id,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',84,now()-interval '1 day',true,promo,now()-interval '1 day','resolved',true);
  insert into public.product_stock_totals(product_id,physical_quantity,available_quantity,synced_at,last_seen_sync_id,freshness_state,is_published)
   values(product_id,100,100,now(),gen_random_uuid(),'authoritative',true);
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 for m in 1..6 loop
  mechanic:=(array['legacy_promo','quantity_threshold_promo','fixed_bundle_promo','bundle_special_price','conditional_attach_promo','spend_threshold_promo'])[m];
  a:=('cf350000-0000-4000-8000-'||lpad((37+m*2)::text,12,'0'))::uuid; b:=('cf350000-0000-4000-8000-'||lpad((38+m*2)::text,12,'0'))::uuid;
  -- Legacy uses 1..38, quantity 39..40, each compound distinct component pair.
  a:=('cf350000-0000-4000-8000-'||lpad((35+m*2)::text,12,'0'))::uuid; b:=('cf350000-0000-4000-8000-'||lpad((36+m*2)::text,12,'0'))::uuid;
  extra:='{}';
  if m=1 then
   select jsonb_agg(jsonb_build_object('productId',id,'sortOrder',substring(sku from 5)::integer,'minimumQuantity',1,'maximumQuantityPerCompany',100,'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4') order by sku) into items from public.catalog_products where sku between 'V3A-001' and 'V3A-038';
  elsif m=2 then
   items:=jsonb_build_array(jsonb_build_object('productId',a,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',100,'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','promoThresholdQuantity',3));
  elsif m in(3,4) then
   items:=jsonb_build_array(jsonb_build_object('productId',a,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',100,'benefitType',case when m=4 then 'informational_only' else 'existing_price_profile' end,'governedBenefitReference',case when m=3 then 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4' end,'requiredBundleQuantity',2,'bundleSpecialUnitPrice',case when m=4 then '80.15' end,'bundleSpecialCurrency',case when m=4 then 'USD' end),
   jsonb_build_object('productId',b,'sortOrder',2,'minimumQuantity',1,'maximumQuantityPerCompany',100,'benefitType',case when m=4 then 'informational_only' else 'existing_price_profile' end,'governedBenefitReference',case when m=3 then 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4' end,'requiredBundleQuantity',1,'bundleSpecialUnitPrice',case when m=4 then '70.00' end,'bundleSpecialCurrency',case when m=4 then 'USD' end));
  else
   items:=jsonb_build_array(jsonb_build_object('productId',a,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',100,'benefitType','informational_only','governedBenefitReference',null,'attachRole',case when m=5 then 'TRIGGER' end,'requiredTriggerQuantity',case when m=5 then 2 end),
   jsonb_build_object('productId',b,'sortOrder',2,'minimumQuantity',1,'maximumQuantityPerCompany',100,'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','attachRole',case when m=5 then 'REWARD' end));
   if m=6 then extra:=jsonb_build_object('spendConfig',jsonb_build_object('thresholdAmountUsd','1500','currency','USD','qualifyingProductIds',jsonb_build_array(a),'rewardProductId',b)); end if;
  end if;
  draft:=extra||jsonb_build_object('contractVersion','3','requestId',gen_random_uuid(),'code','LOCAL_V3A_'||m,'name','Local V3A '||mechanic,'partnerTitle',case when m=1 then 'Всегда готов к защите — Dahua AIR SHIELD' else 'Спецпредложение '||mechanic end,'partnerDescription','LOCAL TEST ONLY / реальная опубликованная механика','campaignType','product_offer','startsAt',now()-interval '1 hour','endsAt',now()+interval '30 days','priority',m,'termsSummary','Локальный тест: условия регулируются campaign engine','mechanicType',mechanic,'audienceMode','explicit_company','companyIds',jsonb_build_array(company),'items',items);
  campaign:=public.create_commercial_campaign_draft_v2(draft);
  perform public.publish_commercial_campaign(campaign,gen_random_uuid());
  insert into offer_feed_fixture.campaigns values(mechanic,campaign);
 end loop;
end $$;
-- Local-only fixture login through the normal sign-in UI; never a production account.
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',encrypted_password=extensions.crypt('V3a-local-test-2026!',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change_token_new='',email_change='' where id='aa500000-0000-4000-8000-000000000002';
insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'aa500000-0000-4000-8000-000000000002','aa500000-0000-4000-8000-000000000002','{"sub":"aa500000-0000-4000-8000-000000000002","email":"quantity-promo-partner@example.test","email_verified":true}','email',now(),now(),now());
commit;
