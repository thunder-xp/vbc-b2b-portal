begin;

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


  before_prices := (select jsonb_agg(to_jsonb(p) order by id) from public.product_prices p);
  draft := jsonb_build_object('contractVersion','3','requestId',gen_random_uuid(),'code','TEST_SPECIAL_BUNDLE','name','TEST ONLY bundle','partnerTitle','TEST ONLY bundle',
    'partnerDescription','TEST FIXTURE: never production commercial data','campaignType','product_offer','startsAt',now()-interval '1 minute','endsAt',now()+interval '7 days',
    'priority',1,'termsSummary','Test special prices only','mechanicType','bundle_special_price','audienceMode','explicit_company','companyIds',jsonb_build_array(company),
    'items',jsonb_build_array(jsonb_build_object('productId',product,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',null,'benefitType','informational_only','governedBenefitReference',null,
       'requiredBundleQuantity',4,'bundleSpecialUnitPrice','80.15','bundleSpecialCurrency','USD'),
       jsonb_build_object('productId',product_without_promo,'sortOrder',2,'minimumQuantity',1,'maximumQuantityPerCompany',null,'benefitType','informational_only','governedBenefitReference',null,
       'requiredBundleQuantity',1,'bundleSpecialUnitPrice','70.00','bundleSpecialCurrency','USD')));
  begin perform public.create_commercial_campaign_draft_v2(jsonb_set(draft,'{items,0,bundleSpecialUnitPrice}','"0"')); raise exception 'zero price accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.create_commercial_campaign_draft_v2(jsonb_set(draft,'{items,0,requiredBundleQuantity}','0')); raise exception 'zero quantity accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.create_commercial_campaign_draft_v2(jsonb_set(draft,'{items,0,bundleSpecialCurrency}','"EUR"')); raise exception 'wrong currency accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.create_commercial_campaign_draft_v2(jsonb_set(draft,'{items}','[]')); raise exception 'empty bundle accepted'; exception when invalid_parameter_value then null; when raise_exception then if sqlerrm <> 'CAMPAIGN_PRODUCTS_REQUIRED' then raise; end if; end;
  campaign:=public.create_commercial_campaign_draft_v2(draft);
  if not exists(select 1 from public.commercial_campaign_items where campaign_id=campaign and bundle_special_unit_price=80.15 and required_bundle_quantity=4) then raise exception 'draft special definition missing'; end if;
  req:=gen_random_uuid();
  reopened:=public.update_commercial_campaign_draft_v2(campaign,(select draft_revision from public.commercial_campaigns where id=campaign),req,draft);
  if not exists(select 1 from public.commercial_campaign_items where campaign_id=campaign and required_bundle_quantity=4 and bundle_special_unit_price=80.15) then raise exception 'editing bundle lost its definition'; end if;
  reopened:=public.update_commercial_campaign_draft_v2(campaign,(reopened->>'revision')::integer-1,req,draft);
  if not (reopened->>'idempotent')::boolean then raise exception 'draft replay not idempotent'; end if;
  preview:=public.get_admin_commercial_campaign_v2(campaign);
  if preview->'items'->0->>'bundle_special_unit_price' is null then raise exception 'admin definition missing'; end if;
  preview:=public.get_campaign_preview_context_v2a(company,array[product,product_without_promo]);
  if jsonb_array_length(preview->'products')<>2 then raise exception 'admin preview identities missing: %',preview; end if;
  perform public.publish_commercial_campaign(campaign,gen_random_uuid());
  if not exists(select 1 from public.commercial_campaign_versions where campaign_id=campaign and item_snapshot->0->>'bundle_special_unit_price' is not null) then raise exception 'immutable special price missing'; end if;
  duplicated:=public.duplicate_commercial_campaign_v1(campaign,gen_random_uuid());
  if not exists(select 1 from public.commercial_campaign_items where campaign_id=duplicated and bundle_special_unit_price=80.15 and required_bundle_quantity=4) then raise exception 'duplicate definition lost'; end if;

  begin perform public.publish_commercial_campaign(duplicated,gen_random_uuid()); raise exception 'ambiguous scope published'; exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  begin perform public.get_campaign_preview_context_v2a(company,array[product]); raise exception 'Partner invoked admin preview'; exception when insufficient_privilege then null; end;
  bundle:=public.get_partner_commercial_campaign(company,campaign);
  if bundle->'products'->0->'specialPrice'->>'amount' is null or (bundle->'bundleProgress'->>'eligible')::boolean then raise exception 'partner offer projection invalid: %',bundle; end if;
  req:=gen_random_uuid(); cart_result:=public.complete_commercial_campaign_bundle_v1(company,campaign,req);
  if not (cart_result->>'eligible')::boolean then raise exception 'unknown stock blocked bundle: %',cart_result; end if;
  select id into cart_id from public.carts where company_id=company and created_by=partner and status='active';
  if (select count(*) from public.cart_items where public.cart_items.cart_id=acceptance.cart_id and commercial_source='CAMPAIGN' and campaign_id=campaign and campaign_mechanic_type='bundle_special_price')<>2 then raise exception 'cart provenance lost'; end if;
  cart_result:=public.complete_commercial_campaign_bundle_v1(company,campaign,req);
  if not (cart_result->>'idempotent')::boolean or (select sum(quantity) from public.cart_items where public.cart_items.cart_id=acceptance.cart_id)<>5 then raise exception 'retry duplicated quantities'; end if;
  prices:=public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if (select count(*) from jsonb_array_elements(prices->'items') where value->'evidence'->>'priceSource'='CAMPAIGN_SPECIAL_PRICE' and value->'evidence'->>'mechanicType'='bundle_special_price')<>2 then raise exception 'special evidence not resolved: %',prices; end if;
  if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product::text)<>80.15 then raise exception 'special source amount changed'; end if;
  if before_prices is distinct from (select jsonb_agg(to_jsonb(p) order by id) from public.product_prices p) then raise exception 'ERP prices overwritten'; end if;


  -- Existing order validator re-derives every price and rejects forged campaign evidence.
  submitted_items:='[]'::jsonb; total_mdl:=0;
  payload:=jsonb_build_object('partnerCompanyReference',jsonb_build_object('externalId','11111111-1111-4111-8111-111111111111'),
    'priceTypeReference',jsonb_build_object('externalId',base_ref),'contractReference',jsonb_build_object('externalId',contract_ref),
    'currencyReference',jsonb_build_object('externalId',mdl_ref),'currency','MDL','paymentMethod','cashless','pricingMode','rate_999_default',
    'paymentIntent','pay_later','plannedPaymentDate',current_date::text,'fulfillmentMethod','pickup','documentTotal',0,'items','[]'::jsonb);
  for component in select value from jsonb_array_elements(prices->'items') loop
    unit_mdl:=case when component->'evidence'->>'sourceCurrency'='USD' then round((component->'evidence'->>'sourceAmount')::numeric*18.0105) else (component->'evidence'->>'sourceAmount')::numeric end;
    total_mdl:=total_mdl+unit_mdl*(component->>'quantity')::integer;
    submitted_items:=submitted_items||jsonb_build_array(jsonb_build_object('cart_item_id',component->'cartItemId','product_id',component->'productId','external_product_ref',component->'productId',
      'external_characteristic_ref','00000000-0000-0000-0000-000000000000','external_unit_ref','99999999-9999-4999-8999-999999999999','external_vat_rate_ref','99999999-9999-4999-8999-999999999999',
      'product_name','Test bundle product','sku','TEST','quantity',component->'quantity','partner_unit_price',unit_mdl,'currency_code','MDL','line_total',unit_mdl*(component->>'quantity')::integer,
      'source_unit_price',component->'evidence'->'sourceAmount','source_currency_code',component->'evidence'->>'sourceCurrency',
      'applied_exchange_rate',case when component->'evidence'->>'sourceCurrency'='USD' then 18.0105 end,'exchange_rate_id',case when component->'evidence'->>'sourceCurrency'='USD' then rate_id end,
      'exchange_rate_purpose',case when component->'evidence'->>'sourceCurrency'='USD' then 'retail_price_usd_to_mdl' end,
      'exchange_rate_source_type',case when component->'evidence'->>'sourceCurrency'='USD' then 'one_c_automatic' end,
      'exchange_rate_effective_at',case when component->'evidence'->>'sourceCurrency'='USD' then now() end,'exchange_rate_published_at',case when component->'evidence'->>'sourceCurrency'='USD' then now() end,
      'effective_price_evidence',component->'evidence'));
    payload:=jsonb_set(payload,'{items}',(payload->'items')||jsonb_build_array(jsonb_build_object('productReference',jsonb_build_object('externalId',component->'productId'),
      'quantity',component->'quantity','price',jsonb_build_object('amount',unit_mdl,'currency','MDL'),'lineTotal',unit_mdl*(component->>'quantity')::integer)));
  end loop;
  payload:=jsonb_set(payload,'{documentTotal}',to_jsonb(total_mdl));
  validation:=public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if not (validation->>'valid')::boolean then raise exception 'existing order validator rejects special evidence: %',validation; end if;
  validation:=public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,jsonb_set(submitted_items,'{0,effective_price_evidence,requiredBundleQuantity}','999'));
  if validation->>'code'<>'ORDER_PRICE_CHANGED' then raise exception 'forged special evidence accepted'; end if;


  begin
    created_order:=public.begin_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),gen_random_uuid(),gen_random_uuid(),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
    if (select count(*) from public.partner_order_items where order_id=created_order.id and effective_price_evidence->>'priceSource'='CAMPAIGN_SPECIAL_PRICE')<>2 then raise exception 'special evidence not snapshotted'; end if;
    if (select count(*) from public.commercial_campaign_order_attributions where order_id=created_order.id and campaign_id=campaign and mechanic_type='bundle_special_price' and publication_version=1)<>2 then raise exception 'special attribution lost'; end if;
    raise exception 'test-only submission rollback' using errcode='PT000';
  exception when sqlstate 'PT000' then null; end;

  -- Universal admission: known shortage is evidence, not a bundle-admission gate.
  insert into public.product_stock_totals(product_id,physical_quantity,available_quantity,synced_at,last_seen_sync_id,freshness_state)
    values(product,1,1,now(),gen_random_uuid(),'authoritative');
  select id into cart_item from public.cart_items where public.cart_items.cart_id=acceptance.cart_id and product_id=product and campaign_id=campaign;
  perform public.set_partner_cart_item_quantity(cart_item,1);
  cart_result:=public.complete_commercial_campaign_bundle_v1(company,campaign,gen_random_uuid());
  if not (cart_result->>'eligible')::boolean or (cart_result->>'stockReady')::boolean then raise exception 'known shortage blocks admission or hides evidence'; end if;
  delete from public.product_stock_totals where product_id=product;
  prices:=public.resolve_partner_cart_prices_v1(cart_id,null,true);

  started:=clock_timestamp(); for n in 1..100 loop perform private.resolve_campaign_bundle_v1(company,campaign,cart_id); end loop;
  raise notice '100 two-line special bundle projections ms: %',extract(epoch from clock_timestamp()-started)*1000;
  update public.commercial_campaigns set status='completed',ends_at=now()-interval '1 second',starts_at=now()-interval '2 days' where id=campaign;
  begin perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'expired price silently retained'; exception when sqlstate 'PT409' then null; end;
  prices:=public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if exists(select 1 from jsonb_array_elements(prices->'items') where value->'evidence'->>'priceSource'<>'PARTNER') then raise exception 'expired special not reverted'; end if;

  -- Current canonical campaign-intent regression: normal context never acquires a discount.
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,price_type_id,effective_at,currency_status,is_published)
    values(product_without_promo,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',70,now()-interval '1 day',true,promo_profile,now()-interval '1 day','resolved',true);
  draft:=jsonb_set(jsonb_set(jsonb_set(draft,'{requestId}',to_jsonb(gen_random_uuid())),'{code}','"TEST_FIXED_REGRESSION"'),'{mechanicType}','"fixed_bundle_promo"');
  select jsonb_agg((line-'bundleSpecialUnitPrice'-'bundleSpecialCurrency') || jsonb_build_object('benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','requiredBundleQuantity',1))
    into component from jsonb_array_elements(draft->'items') line;
  draft:=jsonb_set(draft,'{items}',component);
  legacy_campaign:=public.create_commercial_campaign_draft_v2(draft); perform public.publish_commercial_campaign(legacy_campaign,gen_random_uuid());
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  cart_result:=public.complete_commercial_campaign_bundle_v1(company,legacy_campaign,gen_random_uuid());
  if not (cart_result->>'eligible')::boolean then raise exception 'legacy fixed bundle regressed'; end if;
  prices:=public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if (select count(*) from jsonb_array_elements(prices->'items') where value->'evidence'->>'priceSource'='CAMPAIGN_PROMO' and value->'evidence'->>'mechanicType'='fixed_bundle_promo')<>2 then raise exception 'legacy PROMO price evidence regressed'; end if;

  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  begin perform public.complete_commercial_campaign_bundle_v1(company,campaign,gen_random_uuid()); raise exception 'cross-company admitted'; exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.get_campaign_preview_context_v2a(uuid,uuid[])','execute') or has_function_privilege('authenticated','private.resolve_bundle_special_price_v2a(uuid,uuid,uuid,boolean)','execute') then raise exception 'private RPC exposed'; end if;
  raise notice 'Special Offers V2A runtime acceptance PASS (test-only transaction)';
end $$;
rollback;
