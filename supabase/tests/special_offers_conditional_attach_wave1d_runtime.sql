begin;

do $$
<<acceptance>>
declare
  product_c uuid := 'ca500000-0000-4000-8000-000000000003';
  state jsonb; component jsonb; reward_item uuid; item_b uuid; trial jsonb; mdl_price numeric;
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
  switch_campaign uuid;
  switch_draft jsonb;
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

  insert into public.catalog_products(id,external_1c_id,sku,name,slug) values(product_c,'ATTACH-REWARD','ATTACH-C','Attach reward','attach-reward');
  delete from public.product_prices where price_type_id=promo_profile;
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,
    price_type_id,effective_at,currency_status,is_published) values(product_c,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',68,now()-interval '1 day',true,promo_profile,now()-interval '1 day','resolved',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  draft := jsonb_build_object('contractVersion','3','requestId',gen_random_uuid(),'code','ATTACH_PROMO','name','Attach PROMO',
    'partnerTitle','Four cameras unlock HDD PROMO','partnerDescription','Governed reward only for the complete trigger composition',
    'campaignType','product_offer','startsAt',now()-interval '1 minute','endsAt',now()+interval '7 days','priority',100,
    'termsSummary','Four A and one B unlock reward C','mechanicType','conditional_attach_promo','audienceMode','explicit_company',
    'companyIds',jsonb_build_array(company),'items',jsonb_build_array(
      jsonb_build_object('productId',product,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',null,
        'benefitType','informational_only','governedBenefitReference',null,'promoThresholdQuantity',null,'attachRole','TRIGGER','requiredTriggerQuantity',4),
      jsonb_build_object('productId',product_without_promo,'sortOrder',2,'minimumQuantity',1,'maximumQuantityPerCompany',null,
        'benefitType','informational_only','governedBenefitReference',null,'promoThresholdQuantity',null,'attachRole','TRIGGER','requiredTriggerQuantity',1),
      jsonb_build_object('productId',product_c,'sortOrder',3,'minimumQuantity',1,'maximumQuantityPerCompany',null,
        'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4',
        'promoThresholdQuantity',null,'attachRole','REWARD','requiredTriggerQuantity',null)));
  for n in 1..8 loop
    trial := case n when 1 then jsonb_set(draft,'{items}',jsonb_build_array(draft->'items'->2))
      when 2 then jsonb_set(draft,'{items}',jsonb_build_array(draft->'items'->0,draft->'items'->1))
      when 3 then jsonb_set(draft,'{items,1,attachRole}','"REWARD"')
      when 4 then jsonb_set(draft,'{items,2,productId}',to_jsonb(product))
      when 5 then jsonb_set(draft,'{items,0,requiredTriggerQuantity}','0')
      when 6 then jsonb_set(draft,'{items,0,requiredTriggerQuantity}','-1')
      when 7 then jsonb_set(draft,'{items,0,requiredTriggerQuantity}','1.5')
      else jsonb_set(draft,'{items,0,attachRole}','"OTHER"') end;
    begin perform public.create_commercial_campaign_draft_v2(trial); raise exception 'invalid attach definition % accepted',n;
    exception when invalid_parameter_value or check_violation then null; when raise_exception then if sqlerrm<>'CAMPAIGN_PRODUCT_LIMIT_INVALID' and sqlerrm not like 'CAMPAIGN_PROMO_PRICE_MISSING:%' then raise; end if; end;
  end loop;
  for n in 1..3 loop
    if n=1 then update public.product_prices set is_published=false where price_type_id=promo_profile;
    elsif n=2 then update public.price_types set name='OTHER' where id=promo_profile;
    else update public.price_types set currency_code='MDL' where id=promo_profile; end if;
    begin perform public.create_commercial_campaign_draft_v2(draft); raise exception 'invalid reward price % accepted',n;
    exception when invalid_parameter_value or check_violation then null; when raise_exception then if sqlerrm<>'CAMPAIGN_PRODUCT_LIMIT_INVALID' and sqlerrm not like 'CAMPAIGN_PROMO_PRICE_MISSING:%' then raise; end if; end;
    update public.product_prices set is_published=true where price_type_id=promo_profile;
    update public.price_types set name='PROMO',currency_code='USD' where id=promo_profile;
  end loop;
  campaign := public.create_commercial_campaign_draft_v2(draft);
  -- Reuse this fixture to exercise one existing draft across all four mechanics.
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,
    price_type_id,effective_at,currency_status,is_published)
  values(product,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',84,now()-interval '1 day',true,promo_profile,now()-interval '1 day','resolved',true);
  switch_draft := draft || jsonb_build_object('requestId',gen_random_uuid(),'code','FOUNDATION_SWITCH','mechanicType','quantity_threshold_promo',
    'items',jsonb_build_array(
      (draft->'items'->0) || jsonb_build_object('attachRole',null,'requiredTriggerQuantity',null,'benefitType','existing_price_profile',
        'governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','promoThresholdQuantity',4,'requiredBundleQuantity',null),
      (draft->'items'->2) || jsonb_build_object('attachRole',null,'requiredTriggerQuantity',null,'promoThresholdQuantity',1,'requiredBundleQuantity',null)));
  switch_campaign := public.create_commercial_campaign_draft_v2(switch_draft);
  for mechanic in 1..3 loop
    if mechanic=1 then
      switch_draft := switch_draft || jsonb_build_object('mechanicType','fixed_bundle_promo','items',jsonb_build_array(
        (switch_draft->'items'->0) || jsonb_build_object('promoThresholdQuantity',null,'requiredBundleQuantity',4),
        (switch_draft->'items'->1) || jsonb_build_object('promoThresholdQuantity',null,'requiredBundleQuantity',1)));
    elsif mechanic=2 then
      switch_draft := switch_draft || jsonb_build_object('mechanicType','conditional_attach_promo','items',jsonb_build_array(
        (switch_draft->'items'->0) || jsonb_build_object('requiredBundleQuantity',null,'attachRole','TRIGGER','requiredTriggerQuantity',4,
          'benefitType','informational_only','governedBenefitReference',null),
        (switch_draft->'items'->1) || jsonb_build_object('requiredBundleQuantity',null,'attachRole','REWARD','requiredTriggerQuantity',null)));
    else
      switch_draft := switch_draft || jsonb_build_object('mechanicType','legacy_promo','items',jsonb_build_array(
        (switch_draft->'items'->0) || jsonb_build_object('attachRole',null,'requiredTriggerQuantity',null),
        (switch_draft->'items'->1) || jsonb_build_object('attachRole',null,'requiredTriggerQuantity',null)));
    end if;
    perform public.update_commercial_campaign_draft_v2(switch_campaign,
      (select draft_revision from public.commercial_campaigns where id=switch_campaign),gen_random_uuid(),switch_draft);
    if exists(select 1 from public.commercial_campaign_items where campaign_id=switch_campaign and (
      promo_threshold_quantity is not null or (mechanic<>1 and required_bundle_quantity is not null)
      or (mechanic<>2 and (attach_role is not null or required_trigger_quantity is not null)))) then
      raise exception 'Foundation draft switch retained inactive mechanic state';
    end if;
  end loop;
  if exists(select 1 from public.commercial_campaign_versions where campaign_id=switch_campaign) then
    raise exception 'Draft switch unexpectedly published a version';
  end if;
  delete from public.product_prices where product_id=product and price_type_id=promo_profile;
  perform public.publish_commercial_campaign(campaign,gen_random_uuid());
  select id into item from public.commercial_campaign_items where campaign_id=campaign and product_id=product;
  select id into reward_item from public.commercial_campaign_items where campaign_id=campaign and product_id=product_c;
  if exists(select 1 from public.product_prices where product_id in(product,product_without_promo) and price_type_id=promo_profile) then raise exception 'fixture triggers must have no PROMO'; end if;
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

  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
    values(product_without_promo,base_ref,'USD',180,now()-interval '1 day',true,'resolved',true),
      (product_c,base_ref,'USD',75,now()-interval '1 day',true,'resolved',true);
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  insert into public.carts(company_id,created_by) values(company,partner) returning id into cart_id;
  insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,product,3) returning id into cart_item;
  insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,product_without_promo,1) returning id into item_b;
  eligibility := public.resolve_commercial_campaign_item_eligibility_v1(company,reward_item,9999);
  if (eligibility->>'eligible')::boolean then raise exception 'browser quantity spoof unlocked reward'; end if;
  begin perform public.add_commercial_campaign_item_to_cart(company,reward_item,1,gen_random_uuid()); raise exception 'reward unlocked by incomplete triggers'; exception when check_violation then null; end;
  perform public.set_partner_cart_item_quantity(cart_item,4);
  state := private.resolve_campaign_attach_v1(company,campaign,cart_id);
  if not (state->>'triggersSatisfied')::boolean or (state->>'eligible')::boolean or (state->>'rewardPresent')::boolean then raise exception 'reward absence must unlock without applying'; end if;
  cart_result := public.add_commercial_campaign_item_to_cart(company,reward_item,1,'ea500000-0000-4000-8000-000000000015');
  cart_result := public.add_commercial_campaign_item_to_cart(company,reward_item,1,'ea500000-0000-4000-8000-000000000015');
  if (cart_result->>'quantity')::integer<>1 or not (cart_result->>'idempotent')::boolean then raise exception 'reward retry duplicated'; end if;
  for n in 1..6 loop
    if n=6 then insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,product_without_promo,1) returning id into item_b; end if;
    perform public.set_partner_cart_item_quantity(cart_item,case n when 2 then 5 when 4 then 3 else 4 end);
    perform public.set_partner_cart_item_quantity(item_b,case n when 3 then 2 else 1 end);
    if n=5 then perform public.remove_partner_cart_item(item_b); end if;

    prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
    if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product::text)<>92
      or exists(select 1 from jsonb_array_elements(prices->'items') where value->>'productId'<>product_c::text and value->'evidence'->>'priceSource'<>'PARTNER') then raise exception 'trigger discounted'; end if;
    if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product_c::text)
      <> (case when n in(4,5) then 75 else 68 end) then raise exception 'matrix % wrong reward: %',n,prices; end if;
  end loop;
  select id into legacy_item from public.cart_items where public.cart_items.cart_id=acceptance.cart_id and product_id=product_c;
  perform public.set_partner_cart_item_quantity(legacy_item,3);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product_c::text)<>68 then raise exception 'excess reward not whole line'; end if;
  perform public.set_partner_cart_item_quantity(legacy_item,1);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  partner_detail := public.get_partner_commercial_campaign(company,campaign);
  if exists(select 1 from jsonb_array_elements(partner_detail->'products') where value->>'attachRole'='TRIGGER' and value->'specialPrice'<>'null'::jsonb)
    or not exists(select 1 from jsonb_array_elements(partner_detail->'products') where value->>'attachRole'='REWARD' and (value->'specialPrice'->>'amount')::numeric=68) then raise exception 'offer trigger/reward price projection incorrect'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  state := private.resolve_campaign_attach_v1(outsider_company,campaign);
  if (state->>'conditionsReady')::boolean or (state->>'eligible')::boolean or state->>'reason'<>'outside_audience' then raise exception 'outside audience unlocked reward'; end if;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  for n in 1..5 loop
    if n=1 then update public.commercial_campaigns set status='paused' where id=campaign;
    elsif n=2 then update public.product_prices set is_published=false where price_type_id=promo_profile;
    elsif n=3 then update public.commercial_campaigns set ends_at=now()-interval '1 second' where id=campaign;
    elsif n=4 then update public.price_types set name='OTHER' where id=promo_profile;
    else update public.commercial_campaigns set current_version=99 where id=campaign; end if;
    begin perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'external stale % silently raised checkout',n; exception when sqlstate 'PT409' then null; end;
    update public.commercial_campaigns set status='active',ends_at=now()+interval '7 days',current_version=1 where id=campaign;
    update public.product_prices set is_published=true where price_type_id=promo_profile;
    update public.price_types set name='PROMO' where id=promo_profile;
  end loop;
  -- Known synchronized insufficient reward stock blocks the offer mutation.
  insert into public.product_stock_totals(product_id,physical_quantity,available_quantity,synced_at,last_seen_sync_id,freshness_state)
    values(product_c,1,1,now(),gen_random_uuid(),'authoritative');
  begin perform public.add_commercial_campaign_item_to_cart(company,reward_item,1,gen_random_uuid()); raise exception 'reward shortage accepted'; exception when check_violation then null; end;
  delete from public.product_stock_totals where product_id=product_c;
  -- Permissions cannot be supplied by the browser.
  begin perform private.resolve_campaign_attach_v1(outsider_company,campaign,cart_id); raise exception 'foreign company accepted'; exception when insufficient_privilege then null; end;
  begin perform private.resolve_campaign_attach_v1(company,campaign,gen_random_uuid()); raise exception 'foreign cart accepted'; exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.add_commercial_campaign_item_to_cart(uuid,uuid,integer,uuid)','execute')
    or has_function_privilege('authenticated','private.resolve_campaign_attach_v1(uuid,uuid,uuid,boolean)','execute') then raise exception 'attach grants unsafe'; end if;
  started := clock_timestamp(); for n in 1..100 loop perform public.resolve_partner_cart_prices_v1(cart_id,null,true); end loop;
  raise notice '100 attach central resolver ms: %',extract(epoch from clock_timestamp()-started)*1000;
  started := clock_timestamp(); for n in 1..100 loop perform private.resolve_campaign_attach_v1(company,campaign,cart_id); end loop;
  raise notice '100 attach qualifiers ms: %',extract(epoch from clock_timestamp()-started)*1000;
  started := clock_timestamp(); for n in 1..100 loop perform public.list_partner_commercial_campaigns(company); end loop;
  raise notice '100 attach discovery ms: %',extract(epoch from clock_timestamp()-started)*1000;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  submitted_items := '[]'::jsonb;
  payload := jsonb_build_object(
    'partnerCompanyReference',jsonb_build_object('externalId','11111111-1111-4111-8111-111111111111'),
    'priceTypeReference',jsonb_build_object('externalId',base_ref),'contractReference',jsonb_build_object('externalId',contract_ref),
    'currencyReference',jsonb_build_object('externalId',mdl_ref),'currency','MDL','paymentMethod','cashless',
    'pricingMode','rate_999_default','paymentIntent','pay_later','plannedPaymentDate',current_date::text,'fulfillmentMethod','pickup',
    'documentTotal',0,'items','[]'::jsonb);
  for component in select value from jsonb_array_elements(prices->'items') loop
    mdl_price := round((component->'evidence'->>'sourceAmount')::numeric*18.0105,0);
    submitted_items := submitted_items || jsonb_build_array(jsonb_build_object(
      'product_id',component->'productId','external_product_ref',component->'productId',
      'external_characteristic_ref','00000000-0000-0000-0000-000000000000','external_unit_ref','99999999-9999-4999-8999-999999999999',
      'external_vat_rate_ref','99999999-9999-4999-8999-999999999999','product_name','Bundle product','sku','BUNDLE',
      'quantity',component->'quantity','partner_unit_price',mdl_price,'currency_code','MDL','line_total',mdl_price*(component->>'quantity')::integer,
      'source_unit_price',(component->'evidence'->>'sourceAmount')::numeric,'source_currency_code','USD','applied_exchange_rate',18.0105,'exchange_rate_id',rate_id,
      'exchange_rate_purpose','retail_price_usd_to_mdl','exchange_rate_source_type','one_c_automatic',
      'exchange_rate_effective_at',now(),'exchange_rate_published_at',now(),'effective_price_evidence',component->'evidence'));
    payload := jsonb_set(payload,'{items}',(payload->'items') || jsonb_build_array(jsonb_build_object(
      'productReference',jsonb_build_object('externalId',component->'productId'),'quantity',component->'quantity',
      'price',jsonb_build_object('amount',mdl_price,'currency','MDL'),'lineTotal',mdl_price*(component->>'quantity')::integer)));
  end loop;
  payload := jsonb_set(payload,'{documentTotal}',(select to_jsonb(sum((value->>'line_total')::numeric)) from jsonb_array_elements(submitted_items)));
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if not (validation->>'valid')::boolean then raise exception 'bundle v5 failed: %',validation; end if;

  for n in 1..8 loop
    trial := case n when 1 then jsonb_set(submitted_items,'{2,effective_price_evidence,rewardEligible}','true')
      when 2 then jsonb_set(submitted_items,'{2,effective_price_evidence,campaignId}',to_jsonb(gen_random_uuid()))
      when 3 then jsonb_set(submitted_items,'{2,effective_price_evidence,publicationVersion}','99')
      when 4 then jsonb_set(submitted_items,'{2,effective_price_evidence,rewardProductId}',to_jsonb(product))
      when 5 then jsonb_set(submitted_items,'{2,effective_price_evidence,requiredTriggerQuantity}','1')
      when 6 then jsonb_set(submitted_items,'{2,source_unit_price}','1')
      when 7 then jsonb_set(submitted_items,'{2,partner_unit_price}','1')
      else jsonb_set(submitted_items,'{2,effective_price_evidence,companyId}',to_jsonb(outsider_company)) end;
    validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,trial);
    if (validation->>'valid')::boolean or validation->>'code' not in ('ORDER_PRICE_CHANGED','ORDER_PAYLOAD_VALIDATION_FAILED') then raise exception 'forged attach input % accepted: %',n,validation; end if;
  end loop;
  created_order := public.begin_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),gen_random_uuid(),gen_random_uuid(),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if not exists(select 1 from public.partner_order_items where order_id=created_order.id and product_id=product_c
    and source_unit_price=68 and partner_unit_price=1225 and effective_price_evidence->>'mechanicType'='conditional_attach_promo'
    and effective_price_evidence->>'attachRole'='REWARD' and effective_price_evidence->>'publicationVersion'='1') then raise exception 'reward provenance missing'; end if;
  if exists(select 1 from public.partner_order_items where order_id=created_order.id and product_id<>product_c
    and effective_price_evidence->>'priceSource'<>'PARTNER') then raise exception 'trigger persisted discounted'; end if;
  if exists(select 1 from public.partner_order_items i where order_id=created_order.id and not exists(
    select 1 from jsonb_array_elements(created_order.payload_snapshot->'items') v where v->'productReference'->>'externalId'=i.external_product_ref
      and (v->'price'->>'amount')::numeric=i.partner_unit_price and (v->>'lineTotal')::numeric=i.line_total)) then raise exception 'export differs from persisted prices'; end if;

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  select item_snapshot into version_one_items from public.commercial_campaign_versions where campaign_id=campaign and version_number=1;
  perform public.pause_commercial_campaign(campaign,'attach v2 controlled change');
  validation := public.reopen_commercial_campaign_for_edit_v1(campaign,'attach v2 controlled change');
  draft := jsonb_set(draft,'{items,0,requiredTriggerQuantity}','6');
  perform public.update_commercial_campaign_draft_v2(campaign,(validation->>'revision')::integer,gen_random_uuid(),draft);
  perform public.publish_commercial_campaign(campaign,gen_random_uuid());
  if (select item_snapshot from public.commercial_campaign_versions where campaign_id=campaign and version_number=1)<>version_one_items
    or not exists(select 1 from public.commercial_campaign_versions v,lateral jsonb_array_elements(v.item_snapshot) i
      where v.campaign_id=campaign and version_number=2 and i->>'product_id'=product::text and i->>'required_trigger_quantity'='6') then raise exception 'immutable attach v1/v2 lost'; end if;
  -- Every participating scope, including a normally priced trigger, blocks all competing mechanics.
  for n in 1..4 loop
    trial := draft || jsonb_build_object('code','ATTACH_COLLISION_'||n,'requestId',gen_random_uuid());
    if n<4 then
      trial := jsonb_set(trial,'{mechanicType}',to_jsonb(case n when 1 then 'quantity_threshold_promo' when 2 then 'fixed_bundle_promo' else 'legacy_promo' end));
      trial := jsonb_set(trial,'{items}',jsonb_build_array(((draft->'items'->0) - 'attachRole' - 'requiredTriggerQuantity') || jsonb_build_object(
        'benefitType','informational_only','governedBenefitReference',null)));
      if n in(1,2) then
        insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,price_type_id,effective_at,currency_status,is_published)
          values(product,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',84,now()-interval '1 day',true,promo_profile,now()-interval '1 day','resolved',true) on conflict do nothing;
        trial := jsonb_set(trial,'{items,0}',trial->'items'->0 || jsonb_build_object('benefitType','existing_price_profile',
          'governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4',case n when 1 then 'promoThresholdQuantity' else 'requiredBundleQuantity' end,2));
        if n=2 then trial := jsonb_set(trial,'{items}',trial->'items'||jsonb_build_array(((draft->'items'->2) - 'attachRole' - 'requiredTriggerQuantity')||jsonb_build_object('requiredBundleQuantity',1))); end if;
      end if;
    end if;
    collision := public.create_commercial_campaign_draft_v2(trial);
    begin perform public.publish_commercial_campaign(collision,gen_random_uuid()); raise exception 'attach collision % accepted',n;
    exception when check_violation then if sqlerrm<>'CAMPAIGN_COMMERCIAL_SCOPE_CONFLICT' then raise; end if; end;
  end loop;
  raise notice 'PASS: attach definition/readiness, trigger-without-PROMO, reward-only matrix/excess, idempotency, stock, stale checkout, forged input, provenance/export, immutable v1/v2, strict collision, grants';
end;
$$;
rollback;
