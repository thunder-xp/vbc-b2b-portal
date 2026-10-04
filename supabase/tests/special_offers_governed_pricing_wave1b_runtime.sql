begin;

do $$
declare
  actor uuid := 'aa500000-0000-4000-8000-000000000001';
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
  reopened jsonb;
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

  draft := jsonb_build_object(
    'contractVersion','3','requestId','ea500000-0000-4000-8000-000000000001',
    'code','QTY_PROMO','name','Quantity promo','partnerTitle','Quantity PROMO offer',
    'partnerDescription','Governed quantity threshold PROMO acceptance campaign','internalNote','',
    'campaignType','product_offer','startsAt',(now()-interval '1 minute'),
    'endsAt',(now()+interval '7 days'),'priority',100,'imageAssetPath','',
    'termsSummary','Five units unlock governed PROMO','mechanicType','quantity_threshold_promo',
    'audienceMode','explicit_company','companyIds',jsonb_build_array(company),
    'items',jsonb_build_array(jsonb_build_object(
      'productId',product,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',20,
      'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4',
      'partnerMessage',null,'promoThresholdQuantity',5
    ))
  );
  campaign := public.create_commercial_campaign_draft_v2(draft);
  select id into item from public.commercial_campaign_items where campaign_id=campaign and product_id=product;
  perform public.publish_commercial_campaign(campaign,'ea500000-0000-4000-8000-000000000005');
  update public.partner_companies set external_1c_id='11111111-1111-4111-8111-111111111111',
    external_1c_contract_id=contract_ref, external_1c_price_type_id=base_ref where id=company;
  insert into public.price_types(external_ref,external_code,name,currency_ref,currency_code,currency_status,is_active)
  values(base_ref,'TEST','Partner','44444444-4444-4444-8444-444444444444','USD','resolved',true),
    ('77777777-7777-4777-8777-777777777777','TEST-MDL','MDL',mdl_ref,'MDL','resolved',true);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
  values(product,base_ref,'USD',92,now()-interval '1 day',true,'resolved',true);
  insert into public.one_c_counterparty_directory_syncs(sync_id,status,started_at) values(sync,'succeeded',now());
  insert into public.one_c_counterparty_price_profiles(sync_id,counterparty_external_1c_id,external_1c_id,name,is_active,is_deleted,is_published,synchronized_at,currency_external_1c_id)
  values(sync,'11111111-1111-4111-8111-111111111111',base_ref,'Partner',true,false,true,now(),usd_ref);
  insert into public.one_c_counterparty_contracts(sync_id,counterparty_external_1c_id,external_1c_id,name,price_type_external_1c_id,is_active,is_deleted,is_published,synchronized_at,contract_type,organization_external_1c_id,contract_currency_external_1c_id)
  values(sync,'11111111-1111-4111-8111-111111111111',contract_ref,'Partner contract',base_ref,true,false,true,now(),convert_from(decode('d181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc','hex'),'UTF8'),'4643d461-aa49-4b70-9486-a59f80ee6af8',mdl_ref);
  insert into public.commercial_exchange_rates(source_code,base_currency,quote_currency,rate_direction,rate,effective_date,is_published,is_active,purpose,source_type,effective_at,published_at,source_currency_ref,source_symbolic_code,source_raw_rate,source_multiplicity,source_data_version,source_checked_at)
  values('999','USD','MDL','quote_per_base',18.0105,current_date,true,true,'retail_price_usd_to_mdl','one_c_automatic',now(),now(),mdl_ref,'BCR',18.0105,1,'wave1b',now()) returning id into rate_id;

  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  insert into public.carts(company_id,created_by) values(company,partner) returning id into cart_id;
  insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,product,1) returning id into cart_item;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if (prices->'items'->0->'evidence'->>'sourceAmount')::numeric<>92 then raise exception 'qty1 must be base92'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,5);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  evidence := prices->'items'->0->'evidence';
  if evidence->>'priceSource'<>'CAMPAIGN_PROMO' or (evidence->>'sourceAmount')::numeric<>84 or evidence->>'publicationVersion'<>'1' then raise exception 'qty5 must use governed84 v1'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,6);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,false);
  if (prices->'items'->0->'evidence'->>'sourceAmount')::numeric<>84 then raise exception 'qty6 must be promo84'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,4);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,false);
  if (prices->'items'->0->'evidence'->>'sourceAmount')::numeric<>92 then raise exception 'explicit qty4 must restore92 without conflict'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,5);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);

  update public.commercial_campaigns set status='paused' where id=campaign;
  begin
    perform public.resolve_partner_cart_prices_v1(cart_id,null,false);
    raise exception 'lost PROMO silently increased checkout';
  exception when sqlstate 'PT409' then null; end;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if (prices->'items'->0->'evidence'->>'sourceAmount')::numeric<>92 then raise exception 'paused must show base'; end if;
  update public.commercial_campaigns set status='active' where id=campaign;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  update public.product_prices set is_published=false where product_id=product and external_1c_price_type_id='b9f5d585-dab1-11e9-8a58-000c29cf9dd4';
  begin
    perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'missing PROMO accepted';
  exception when sqlstate 'PT409' then null; end;
  update public.product_prices set is_published=true where product_id=product and external_1c_price_type_id='b9f5d585-dab1-11e9-8a58-000c29cf9dd4';
  update public.price_types set currency_code='MDL' where id=promo_profile;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if prices->'items'->0->'evidence'->>'priceSource'<>'PARTNER' then raise exception 'malformed source applied PROMO'; end if;
  update public.price_types set currency_code='USD' where id=promo_profile;
  update public.commercial_campaigns set ends_at=now()-interval '1 second' where id=campaign;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if prices->'items'->0->'evidence'->>'priceSource'<>'PARTNER' then raise exception 'expired applied PROMO'; end if;
  update public.commercial_campaigns set ends_at=now()+interval '7 days' where id=campaign;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  evidence := prices->'items'->0->'evidence';

  -- Publication rejects overlapping scope instead of choosing a campaign arbitrarily.
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  collision := public.create_commercial_campaign_draft_v2(draft || jsonb_build_object('code','COLLISION','requestId',gen_random_uuid()));
  begin
    perform public.publish_commercial_campaign(collision,gen_random_uuid()); raise exception 'overlapping publication accepted';
  exception when check_violation then
    if sqlerrm <> 'CAMPAIGN_COMMERCIAL_SCOPE_CONFLICT' then raise; end if;
  end;
  if (select status from public.commercial_campaigns where id=collision)<>'draft' then raise exception 'failed publication changed lifecycle'; end if;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);

  -- Invalid publication, wrong profile identity and lack of audience all stay at base.
  update public.commercial_campaigns set current_version=99 where id=campaign;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if prices->'items'->0->'evidence'->>'priceSource'<>'PARTNER' then raise exception 'forged version unlocked PROMO'; end if;
  update public.commercial_campaigns set current_version=1 where id=campaign;
  update public.price_types set name='NOT_PROMO' where id=promo_profile;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if prices->'items'->0->'evidence'->>'priceSource'<>'PARTNER' then raise exception 'invalid PROMO identity applied'; end if;
  update public.price_types set name='PROMO' where id=promo_profile;
  update public.partner_companies set external_1c_price_type_id=base_ref where id=outsider_company;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  insert into public.carts(company_id,created_by) values(outsider_company,outsider) returning id into outsider_cart;
  insert into public.cart_items(cart_id,product_id,quantity) values(outsider_cart,product,5);
  prices := public.resolve_partner_cart_prices_v1(outsider_cart,null,true);
  if prices->'items'->0->'evidence'->>'priceSource'<>'PARTNER' then raise exception 'outsider received PROMO'; end if;
  begin
    perform public.resolve_partner_cart_prices_v1(cart_id,null,true); raise exception 'cross-user cart exposed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  evidence := prices->'items'->0->'evidence';
  select updated_at into previous_updated_at from public.cart_items where id=cart_item;
  started := clock_timestamp();
  for n in 1..100 loop
    perform id from public.product_prices where product_id=product and external_1c_price_type_id=base_ref
      and is_active and is_published and (company_id is null or company_id=company)
      order by valid_from desc limit 1;
  end loop;
  raise notice '100 baseline source-price reads elapsed ms: %', extract(epoch from clock_timestamp()-started)*1000;
  started := clock_timestamp();
  for n in 1..100 loop perform public.resolve_partner_cart_prices_v1(cart_id,null,true); end loop;
  raise notice '100 unchanged cart resolution calls elapsed ms: %', extract(epoch from clock_timestamp()-started)*1000;
  if (select updated_at from public.cart_items where id=cart_item) is distinct from previous_updated_at then raise exception 'unchanged render rewrote evidence'; end if;

  -- Reuse real v5 preparation and persistence with explicit MDL settlement and exact FX evidence.
  submitted_items := jsonb_build_array(jsonb_build_object(
    'product_id',product,'external_product_ref','88888888-8888-4888-8888-888888888888',
    'external_characteristic_ref','00000000-0000-0000-0000-000000000000','external_unit_ref','99999999-9999-4999-8999-999999999999',
    'external_vat_rate_ref','99999999-9999-4999-8999-999999999999', 'product_name','Quantity promo product','sku','QTY-PROMO-SKU','quantity',5,
    'partner_unit_price',1513,'currency_code','MDL','line_total',7565,'source_unit_price',84,'source_currency_code','USD',
    'applied_exchange_rate',18.0105,'exchange_rate_id',rate_id,'exchange_rate_purpose','retail_price_usd_to_mdl','exchange_rate_source_type','one_c_automatic',
    'exchange_rate_effective_at',now(),'exchange_rate_published_at',now(),'effective_price_evidence',evidence
  ));
  payload := jsonb_build_object(
    'partnerCompanyReference',jsonb_build_object('externalId','11111111-1111-4111-8111-111111111111'),
    'priceTypeReference',jsonb_build_object('externalId',base_ref),'contractReference',jsonb_build_object('externalId',contract_ref),
    'currencyReference',jsonb_build_object('externalId',mdl_ref),'currency','MDL','paymentMethod','cashless',
    'pricingMode','rate_999_default','paymentIntent','pay_later','plannedPaymentDate',current_date::text,'fulfillmentMethod','pickup','documentTotal',7565,
    'items',jsonb_build_array(jsonb_build_object('productReference',jsonb_build_object('externalId','88888888-8888-4888-8888-888888888888'),
      'quantity',5,'price',jsonb_build_object('amount',1513,'currency','MDL'),'lineTotal',7565))
  );
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if not (validation->>'valid')::boolean then raise exception 'legitimate PROMO validation failed: %',validation; end if;
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,jsonb_set(submitted_items,'{0,source_unit_price}','1'));
  if validation->>'code'<>'ORDER_PRICE_CHANGED' then raise exception 'forged price accepted: %',validation; end if;
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,jsonb_set(submitted_items,'{0,effective_price_evidence,publicationVersion}','999'));
  if validation->>'code'<>'ORDER_PRICE_CHANGED' then raise exception 'forged publication accepted'; end if;
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,jsonb_set(submitted_items,'{0,effective_price_evidence,campaignId}',to_jsonb(outsider)));
  if validation->>'code'<>'ORDER_PRICE_CHANGED' then raise exception 'forged campaign accepted'; end if;
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,jsonb_set(submitted_items,'{0,effective_price_evidence,mechanicEligible}','true'));
  if validation->>'code'<>'ORDER_PRICE_CHANGED' then raise exception 'forged eligibility accepted'; end if;
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,jsonb_set(submitted_items,'{0,partner_unit_price}','1'));
  if (validation->>'valid')::boolean then raise exception 'forged settlement price accepted'; end if;
  created_order := public.begin_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),gen_random_uuid(),gen_random_uuid(),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if not exists(select 1 from public.partner_order_items where order_id=created_order.id and source_unit_price=84 and partner_unit_price=1513 and effective_price_evidence=evidence) then raise exception 'provenance not persisted'; end if;
  if not exists(select 1 from public.commercial_campaign_order_attributions where order_id=created_order.id and campaign_id=campaign and publication_version=1 and quantity=5) then raise exception 'attribution missing'; end if;
  begin
    update public.partner_order_items set effective_price_evidence='{}'::jsonb where order_id=created_order.id;
    raise exception 'historical provenance changed';
  exception when insufficient_privilege then null; end;
  if has_table_privilege('authenticated','private.partner_cart_price_reviews','SELECT')
    or has_table_privilege('anon','private.partner_cart_price_reviews','SELECT')
    or has_table_privilege('authenticated','public.partner_order_items','UPDATE') then
    raise exception 'unsafe commercial table grants';
  end if;
  if has_function_privilege('authenticated','public.resolve_partner_cart_prices_for_order_v1(uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','public.resolve_partner_cart_prices_internal_v1(uuid,text,boolean)','execute')
    or has_function_privilege('anon','public.resolve_partner_cart_prices_v1(uuid,text,boolean)','execute')
    or has_function_privilege('authenticated','public.begin_partner_order_submission_v4(uuid,bigint,uuid,uuid,date,text,date,text,uuid,text,jsonb,jsonb)','execute') then raise exception 'unsafe RPC grants'; end if;
  raise notice 'PASS: qty1/4=92, qty5/6=84, pause/missing/expiry/malformed fail closed, v5 spoof denial, persisted84+FX+provenance, attribution, grants';
end;
$$;
rollback;

