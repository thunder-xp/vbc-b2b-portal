-- Run ONLY using the asserted task-owned disposable environment.
begin;
do $$ begin
 if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004' or current_setting('application_name') <> 'campaign-intent-disposable' then
  raise exception 'Disposable target assertion missing'; end if;
end $$;
create schema intent_fixture;
create sequence intent_fixture.ids start 1000;
grant usage on schema intent_fixture to postgres;
grant usage on sequence intent_fixture.ids to postgres;
create function intent_fixture.next_id() returns uuid language sql set search_path='' as $$
 select ('fa500000-0000-4000-8000-'||lpad(nextval('intent_fixture.ids')::text,12,'0'))::uuid;
$$;
alter table public.company_memberships alter column id set default intent_fixture.next_id();
alter table public.price_types alter column id set default intent_fixture.next_id();
alter table public.product_prices alter column id set default intent_fixture.next_id();
alter table public.commercial_exchange_rates alter column id set default intent_fixture.next_id();
alter table public.commercial_campaign_items alter column id set default intent_fixture.next_id();
alter table public.commercial_campaign_versions alter column id set default intent_fixture.next_id();
alter table public.commercial_campaign_audience_rules alter column id set default intent_fixture.next_id();
alter table public.commercial_campaign_audience_snapshots alter column id set default intent_fixture.next_id();
alter table public.cart_items alter column id set default intent_fixture.next_id();
alter table public.commercial_campaign_audit_events alter column id set default intent_fixture.next_id();
alter table public.commercial_campaign_engagement_events alter column id set default intent_fixture.next_id();

-- Context/order identities are stable even after a rolled-back test advanced a sequence.
create function intent_fixture.stable_id(p_key text) returns uuid language sql immutable set search_path='' as $$
 select (substr(md5(p_key),1,12)||'5'||substr(md5(p_key),14,3)||'8'||substr(md5(p_key),18,15))::uuid;
$$;
-- Generated columns are unavailable in BEFORE triggers; derive the same context key from inputs.
create function intent_fixture.identify_line() returns trigger language plpgsql set search_path='' as $$
begin
 new.id := intent_fixture.stable_id(new.cart_id::text||':'||new.product_id::text||':'||
   case when new.commercial_source='STANDARD' then 'STANDARD' else
    'CAMPAIGN:'||new.campaign_id::text||':'||new.campaign_publication_version::text||':'||new.campaign_item_id::text end);
 return new;
end $$;
create trigger fixture_cart_line_identity before insert on public.cart_items
 for each row execute function intent_fixture.identify_line();
create function intent_fixture.identify_order_line() returns trigger language plpgsql set search_path='' as $$
begin
 new.id := intent_fixture.stable_id(new.order_id::text||':'||new.cart_item_id::text);
 return new;
end $$;
create trigger fixture_order_line_identity before insert on public.partner_order_items
 for each row execute function intent_fixture.identify_order_line();
create function intent_fixture.identify_order() returns trigger language plpgsql set search_path='' as $$
begin
 new.id := intent_fixture.stable_id(new.submission_key::text);
 return new;
end $$;
create trigger fixture_order_identity before insert on public.partner_orders
 for each row execute function intent_fixture.identify_order();
create function intent_fixture.legacy_draft(p_campaign uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('contractVersion','3','code',code,'name',name,'partnerTitle',partner_title,
  'partnerDescription',partner_description,'campaignType',campaign_type,'startsAt',starts_at,'endsAt',ends_at,
  'priority',priority,'termsSummary',terms_summary,'mechanicType','legacy_promo','audienceMode','explicit_company',
  'companyIds',jsonb_build_array('ba500000-0000-4000-8000-000000000001'),
  'items',jsonb_build_array(jsonb_build_object('productId','ca500000-0000-4000-8000-000000000001',
    'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',100,'benefitType','existing_price_profile',
    'governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4')))
 from public.commercial_campaigns where id=p_campaign;
$$;
do $$
declare
  product_c uuid := 'ca500000-0000-4000-8000-000000000003';
  actor uuid := 'aa500000-0000-4000-8000-000000000001';
  partner uuid := 'aa500000-0000-4000-8000-000000000002';
  outsider uuid := 'aa500000-0000-4000-8000-000000000003';
  company uuid := 'ba500000-0000-4000-8000-000000000001';
  outsider_company uuid := 'ba500000-0000-4000-8000-000000000002';
  product uuid := 'ca500000-0000-4000-8000-000000000001';
  product_without_promo uuid := 'ca500000-0000-4000-8000-000000000002';
  promo_profile uuid := 'da500000-0000-4000-8000-000000000001';
  contract_ref text := '22222222-2222-4222-8222-222222222222';
  base_ref text := '23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c';
  usd_ref text := '44444444-4444-4444-8444-444444444444';
  mdl_ref text := '55555555-5555-4555-8555-555555555555';
  sync uuid := '66666666-6666-4666-8666-666666666666';
  rate_id uuid;
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
    (product,'33333333-3333-4333-8333-333333333331','160016','ARA34E intent fixture','ara34e-intent-fixture'),
    (product_without_promo,'33333333-3333-4333-8333-333333333332','QTY-NO-PROMO','Quantity no promo product','quantity-no-promo-product');
  insert into public.price_types(id,external_ref,external_code,name,currency_code,currency_status,is_active)
  values(promo_profile,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','UU-000021','PROMO','USD','resolved',true);
  insert into public.product_prices(
    product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,
    price_type_id,effective_at,currency_status,is_published
  ) values(
    product,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',84,now()-interval '1 day',true,
    promo_profile,now()-interval '1 day','resolved',true
  );

  insert into public.catalog_products(id,external_1c_id,sku,name,slug) values(product_c,'33333333-3333-4333-8333-333333333333','ATTACH-C','Attach reward','attach-reward');
  delete from public.product_prices where price_type_id=promo_profile;
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,
    price_type_id,effective_at,currency_status,is_published) values(product_c,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',8.25,now()-interval '1 day',true,promo_profile,now()-interval '1 day','resolved',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  update public.partner_companies set external_1c_id='11111111-1111-4111-8111-111111111111',
    external_1c_contract_id=contract_ref, external_1c_price_type_id=base_ref where id=company;
  insert into public.price_types(external_ref,external_code,name,currency_ref,currency_code,currency_status,is_active)
  values(base_ref,'TEST','Partner','44444444-4444-4444-8444-444444444444','USD','resolved',true),
    ('77777777-7777-4777-8777-777777777777','TEST-MDL','MDL',mdl_ref,'MDL','resolved',true);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
  values(product,base_ref,'USD',9.21,now()-interval '1 day',true,'resolved',true);
  insert into public.one_c_counterparty_directory_syncs(sync_id,status,started_at) values(sync,'succeeded',now());
  insert into public.one_c_counterparty_price_profiles(sync_id,counterparty_external_1c_id,external_1c_id,name,is_active,is_deleted,is_published,synchronized_at,currency_external_1c_id)
  values(sync,'11111111-1111-4111-8111-111111111111',base_ref,'Partner',true,false,true,now(),usd_ref);
  insert into public.one_c_counterparty_contracts(sync_id,counterparty_external_1c_id,external_1c_id,name,price_type_external_1c_id,is_active,is_deleted,is_published,synchronized_at,contract_type,organization_external_1c_id,contract_currency_external_1c_id)
  values(sync,'11111111-1111-4111-8111-111111111111',contract_ref,'Partner contract',base_ref,true,false,true,now(),convert_from(decode('d181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc','hex'),'UTF8'),'4643d461-aa49-4b70-9486-a59f80ee6af8',mdl_ref);
  insert into public.commercial_exchange_rates(source_code,base_currency,quote_currency,rate_direction,rate,effective_date,is_published,is_active,purpose,source_type,effective_at,published_at,source_currency_ref,source_symbolic_code,source_raw_rate,source_multiplicity,source_data_version,source_checked_at)
  values('999','USD','MDL','quote_per_base',18.041,current_date,true,true,'retail_price_usd_to_mdl','one_c_automatic',now(),now(),mdl_ref,'BCR',18.041,1,'wave1b',now()) returning id into rate_id;

  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
    values(product_without_promo,base_ref,'USD',20,now()-interval '1 day',true,'resolved',true),
      (product_c,base_ref,'USD',10,now()-interval '1 day',true,'resolved',true);

  insert into public.product_stock_totals(product_id,physical_quantity,available_quantity,synced_at,last_seen_sync_id,freshness_state)
    select id,100,100,now(),gen_random_uuid(),'authoritative' from public.catalog_products where id in(product,product_without_promo,product_c);

  insert into public.product_prices(id,product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,price_type_id,effective_at,currency_status,is_published)
  values('da510000-0000-4000-8000-000000000001',product,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',8.25,now()-interval '1 day',true,promo_profile,now()-interval '1 day','resolved',true),
    ('da510000-0000-4000-8000-000000000002',product_without_promo,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',15,now()-interval '1 day',true,promo_profile,now()-interval '1 day','resolved',true);
  insert into public.carts(id,company_id,created_by,status) values('ea510000-0000-4000-8000-000000000001',company,partner,'active');
end $$;
do $$
declare
 actor uuid := 'aa500000-0000-4000-8000-000000000001';
 company uuid := 'ba500000-0000-4000-8000-000000000001';
 a uuid := 'ca500000-0000-4000-8000-000000000001';
 b uuid := 'ca500000-0000-4000-8000-000000000002';
 c uuid := 'ca500000-0000-4000-8000-000000000003';
 campaign uuid; mechanic text; draft jsonb; items jsonb; extra jsonb;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 for n in 1..5 loop
  campaign := ('fa510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  mechanic := (array['legacy_promo','quantity_threshold_promo','fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo'])[n];
  insert into public.commercial_campaigns(id,code,name,partner_title,partner_description,campaign_type,starts_at,ends_at,terms_summary,created_by)
   values(campaign,'INTENT_'||n,'Intent fixture '||n,'Special Offer '||n,'Deterministic commercial intent fixture','product_offer',now()-interval '1 day',now()+interval '30 days','Governed PROMO intent only',actor);
  items := jsonb_build_array(jsonb_build_object('productId',a,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',100,
    'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','promoThresholdQuantity',case when n=2 then 3 else null end));
  extra := '{}'::jsonb;
  if n=3 then
   items := jsonb_build_array(
    jsonb_build_object('productId',a,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',100,'requiredBundleQuantity',2,'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4'),
    jsonb_build_object('productId',b,'sortOrder',2,'minimumQuantity',1,'maximumQuantityPerCompany',100,'requiredBundleQuantity',1,'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4'));
  elsif n=4 then
   items := jsonb_build_array(
    jsonb_build_object('productId',a,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',100,'attachRole','TRIGGER','requiredTriggerQuantity',2,'benefitType','informational_only','governedBenefitReference',null),
    jsonb_build_object('productId',c,'sortOrder',2,'minimumQuantity',1,'maximumQuantityPerCompany',100,'attachRole','REWARD','requiredTriggerQuantity',null,'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4'));
  elsif n=5 then
   items := jsonb_build_array(
    jsonb_build_object('productId',a,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',100,'benefitType','informational_only','governedBenefitReference',null),
    jsonb_build_object('productId',c,'sortOrder',2,'minimumQuantity',1,'maximumQuantityPerCompany',100,'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4'));
   extra := jsonb_build_object('spendConfig',jsonb_build_object('thresholdAmountUsd','18.42','currency','USD','qualifyingProductIds',jsonb_build_array(a),'rewardProductId',c));
  end if;
  draft := extra || jsonb_build_object('contractVersion','3','code','INTENT_'||n,'name','Intent fixture '||n,
   'partnerTitle','Special Offer '||n,'partnerDescription','Deterministic commercial intent fixture','campaignType','product_offer',
   'startsAt',now()-interval '1 day','endsAt',now()+interval '30 days','priority',100,'termsSummary','Governed PROMO intent only',
   'mechanicType',mechanic,'audienceMode','explicit_company','companyIds',jsonb_build_array(company),'items',items);
  perform public.update_commercial_campaign_draft_v2(campaign,0,('fb510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,draft);
  -- Conflicting mechanics are intentionally active at different times during matrix validation.
 end loop;
end $$;
commit;
