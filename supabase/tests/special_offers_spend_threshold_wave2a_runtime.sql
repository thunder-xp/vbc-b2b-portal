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
  config jsonb; version_one_config jsonb; source_before jsonb;
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
    price_type_id,effective_at,currency_status,is_published) values(product_c,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',80,now()-interval '1 day',true,promo_profile,now()-interval '1 day','resolved',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  update public.partner_companies set external_1c_id='11111111-1111-4111-8111-111111111111',
    external_1c_contract_id=contract_ref, external_1c_price_type_id=base_ref where id=company;
  insert into public.price_types(external_ref,external_code,name,currency_ref,currency_code,currency_status,is_active)
  values(base_ref,'TEST','Partner','44444444-4444-4444-8444-444444444444','USD','resolved',true),
    ('77777777-7777-4777-8777-777777777777','TEST-MDL','MDL',mdl_ref,'MDL','resolved',true);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
  values(product,base_ref,'USD',300,now()-interval '1 day',true,'resolved',true);
  insert into public.one_c_counterparty_directory_syncs(sync_id,status,started_at) values(sync,'succeeded',now());
  insert into public.one_c_counterparty_price_profiles(sync_id,counterparty_external_1c_id,external_1c_id,name,is_active,is_deleted,is_published,synchronized_at,currency_external_1c_id)
  values(sync,'11111111-1111-4111-8111-111111111111',base_ref,'Partner',true,false,true,now(),usd_ref);
  insert into public.one_c_counterparty_contracts(sync_id,counterparty_external_1c_id,external_1c_id,name,price_type_external_1c_id,is_active,is_deleted,is_published,synchronized_at,contract_type,organization_external_1c_id,contract_currency_external_1c_id)
  values(sync,'11111111-1111-4111-8111-111111111111',contract_ref,'Partner contract',base_ref,true,false,true,now(),convert_from(decode('d181d0bfd0bed0bad183d0bfd0b0d182d0b5d0bbd0b5d0bc','hex'),'UTF8'),'4643d461-aa49-4b70-9486-a59f80ee6af8',mdl_ref);
  insert into public.commercial_exchange_rates(source_code,base_currency,quote_currency,rate_direction,rate,effective_date,is_published,is_active,purpose,source_type,effective_at,published_at,source_currency_ref,source_symbolic_code,source_raw_rate,source_multiplicity,source_data_version,source_checked_at)
  values('999','USD','MDL','quote_per_base',18.0105,current_date,true,true,'retail_price_usd_to_mdl','one_c_automatic',now(),now(),mdl_ref,'BCR',18.0105,1,'wave1b',now()) returning id into rate_id;

  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
    values(product_without_promo,base_ref,'USD',400,now()-interval '1 day',true,'resolved',true),
      (product_c,base_ref,'USD',100,now()-interval '1 day',true,'resolved',true);

  insert into public.product_stock_totals(product_id,physical_quantity,available_quantity,synced_at,last_seen_sync_id,freshness_state)
    select id,100,100,now(),gen_random_uuid(),'authoritative' from public.catalog_products where id in(product,product_without_promo,product_c);
  config := jsonb_build_object('thresholdAmountUsd','1500.00','currency','USD','qualifyingProductIds',jsonb_build_array(product,product_without_promo),'rewardProductId',product_c);
  draft := jsonb_build_object('contractVersion','3','requestId',gen_random_uuid(),'code','SPEND_PROMO','name','Spend PROMO',
    'partnerTitle','USD purchase unlocks reward PROMO','partnerDescription','Governed reward only for a scoped base USD purchase',
    'campaignType','product_offer','startsAt',now()-interval '1 minute','endsAt',now()+interval '7 days','priority',100,
    'termsSummary','1500 USD A+B unlocks PROMO C','mechanicType','spend_threshold_promo','spendConfig',config,
    'audienceMode','explicit_company','companyIds',jsonb_build_array(company),'items',jsonb_build_array(
      jsonb_build_object('productId',product,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',null,
        'benefitType','informational_only','governedBenefitReference',null,'promoThresholdQuantity',null),
      jsonb_build_object('productId',product_without_promo,'sortOrder',2,'minimumQuantity',1,'maximumQuantityPerCompany',null,
        'benefitType','informational_only','governedBenefitReference',null,'promoThresholdQuantity',null),
      jsonb_build_object('productId',product_c,'sortOrder',3,'minimumQuantity',1,'maximumQuantityPerCompany',4,
        'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','promoThresholdQuantity',null)));
  for n in 1..9 loop
    trial := case n when 1 then jsonb_set(draft,'{spendConfig,thresholdAmountUsd}','"0"')
      when 2 then jsonb_set(draft,'{spendConfig,thresholdAmountUsd}','"-1"')
      when 3 then jsonb_set(draft,'{spendConfig,thresholdAmountUsd}','"1500.001"')
      when 4 then jsonb_set(draft,'{spendConfig,thresholdAmountUsd}','"NaN"')
      when 5 then jsonb_set(draft,'{spendConfig,qualifyingProductIds}','[]')
      when 6 then jsonb_set(draft,'{spendConfig,rewardProductId}','null')
      when 7 then jsonb_set(draft,'{spendConfig,rewardProductId}',to_jsonb(product))
      when 8 then jsonb_set(draft,'{spendConfig,currency}','"MDL"')
      else jsonb_set(draft,'{items,0,promoThresholdQuantity}','1') end;
    begin perform public.create_commercial_campaign_draft_v2(trial); raise exception 'invalid spend draft % accepted',n;
    exception when invalid_parameter_value or check_violation then null; end;
  end loop;
  campaign := public.create_commercial_campaign_draft_v2(draft);
  collision := public.duplicate_commercial_campaign_v1(campaign,'ea500000-0000-4000-8000-000000000030');
  if private.campaign_spend_config_v1(collision) is distinct from private.campaign_spend_config_v1(campaign) then raise exception 'duplicate lost typed spend configuration'; end if;
  perform public.update_commercial_campaign_draft_v2(collision,(select draft_revision from public.commercial_campaigns where id=collision),gen_random_uuid(),
    draft || jsonb_build_object('code','SPEND_EDITED_COPY','spendConfig',config||jsonb_build_object('thresholdAmountUsd','2000.00')));
  if public.duplicate_commercial_campaign_v1(campaign,'ea500000-0000-4000-8000-000000000030')<>collision
    or (private.campaign_spend_config_v1(collision)->>'thresholdAmountUsd')::numeric<>2000 then raise exception 'duplicate retry overwrote edited configuration'; end if;
  update public.product_prices set is_published=false where product_id=product_c and price_type_id=promo_profile;
  begin perform public.publish_commercial_campaign(campaign,gen_random_uuid()); raise exception 'missing reward PROMO published'; exception when check_violation then null; end;
  if exists(select 1 from public.commercial_campaign_versions where campaign_id=campaign) then raise exception 'failed reward readiness retained history'; end if;
  update public.product_prices set is_published=true where product_id=product_c and price_type_id=promo_profile;
  update public.product_prices set currency='MDL' where product_id=product and external_1c_price_type_id=base_ref;
  begin perform public.publish_commercial_campaign(campaign,gen_random_uuid()); raise exception 'missing base USD published'; exception when check_violation then null; end;
  if exists(select 1 from public.commercial_campaign_versions where campaign_id=campaign) then raise exception 'failed publication retained history'; end if;
  update public.product_prices set currency='USD' where product_id=product and external_1c_price_type_id=base_ref;
  perform public.publish_commercial_campaign(campaign,gen_random_uuid());
  select campaign_snapshot->'spendConfig' into version_one_config from public.commercial_campaign_versions where campaign_id=campaign and version_number=1;
  if (version_one_config->>'thresholdAmountUsd')::numeric<>1500 then raise exception 'snapshot threshold missing'; end if;
  select id into item from public.commercial_campaign_items where campaign_id=campaign and product_id=product;
  select id into reward_item from public.commercial_campaign_items where campaign_id=campaign and product_id=product_c;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  insert into public.carts(company_id,created_by) values(company,partner) returning id into cart_id;
  insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,product,3) returning id into cart_item;
  insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,product_without_promo,1) returning id into item_b;
  eligibility := public.resolve_commercial_campaign_item_eligibility_v1(company,reward_item,9999);
  if (eligibility->>'eligible')::boolean then raise exception 'browser quantity unlocked reward'; end if;
  begin perform public.add_commercial_campaign_item_to_cart(company,reward_item,1,gen_random_uuid()); raise exception 'below threshold reward CTA accepted'; exception when check_violation then null; end;
  insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,product_c,1) returning id into legacy_item;
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if (state->>'qualifyingSpendUsd')::numeric<>1300 or (state->>'remainingSpendUsd')::numeric<>200 or (state->>'eligible')::boolean then raise exception '1300 progress incorrect: %',state; end if;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product_c::text)<>100 then raise exception 'below threshold discounted'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,4);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,false);
  if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product_c::text)<>80 then raise exception '1600 reward not PROMO'; end if;
  perform public.set_partner_cart_item_quantity(legacy_item,3);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if (state->>'qualifyingSpendUsd')::numeric<>1600 or not (state->>'eligible')::boolean then raise exception 'reward circular spend'; end if;
  if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product_c::text)<>80 then raise exception 'excess reward not whole line'; end if;
  perform public.set_partner_cart_item_quantity(legacy_item,5);
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if (state->>'eligible')::boolean then raise exception 'reward cap ignored'; end if;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,false);
  if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product_c::text)<>100 then raise exception 'reward above cap discounted'; end if;
  perform public.set_partner_cart_item_quantity(legacy_item,3);
  for n in 1..3 loop
    update public.product_prices set price_amount=case n when 1 then 1099.99 when 2 then 1100.00 else 1100.01 end
      where product_id=product and external_1c_price_type_id=base_ref;
    perform public.set_partner_cart_item_quantity(cart_item,1);
    state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
    if (state->>'thresholdReached')::boolean is distinct from (n>1) then raise exception 'decimal boundary % wrong: %',n,state; end if;
  end loop;
  update public.product_prices set price_amount=300 where product_id=product and external_1c_price_type_id=base_ref;
  perform public.set_partner_cart_item_quantity(cart_item,4);
  perform public.set_partner_cart_item_quantity(legacy_item,1);
  perform public.resolve_partner_cart_prices_v1(cart_id,null,true);
  update public.product_prices set price_amount=301 where product_id=product and external_1c_price_type_id=base_ref;
  begin perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'external base price change accepted'; exception when sqlstate 'PT409' then null; end;
  update public.product_prices set price_amount=300 where product_id=product and external_1c_price_type_id=base_ref;
  update public.product_prices set currency='MDL' where product_id=product_c and price_type_id=promo_profile;
  begin perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'non-USD PROMO accepted'; exception when sqlstate 'PT409' then null; end;
  update public.product_prices set currency='USD' where product_id=product_c and price_type_id=promo_profile;
  update public.price_types set external_code='WRONG' where id=promo_profile;
  begin perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'wrong PROMO identity accepted'; exception when sqlstate 'PT409' then null; end;
  update public.price_types set external_code='UU-000021' where id=promo_profile;
  update public.product_prices set is_published=false where product_id=product_c and price_type_id=promo_profile;
  begin perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'missing PROMO silently repriced'; exception when sqlstate 'PT409' then null; end;
  update public.product_prices set is_published=true where product_id=product_c and price_type_id=promo_profile;
  update public.commercial_campaigns set status='paused' where id=campaign;
  begin perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'paused campaign silently repriced'; exception when sqlstate 'PT409' then null; end;
  update public.commercial_campaigns set status='active' where id=campaign;
  perform public.remove_partner_cart_item(legacy_item);
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if not (state->>'thresholdReached')::boolean or (state->>'eligible')::boolean or (state->>'rewardPresent')::boolean then raise exception 'reward absence applied benefit'; end if;
  update public.product_stock_totals set physical_quantity=0,available_quantity=0 where product_id=product_c;
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if not (state->>'thresholdReached')::boolean or (state->>'rewardStockReady')::boolean then raise exception 'stock shortage changed spend or enabled CTA'; end if;
  begin perform public.add_commercial_campaign_item_to_cart(company,reward_item,1,gen_random_uuid()); raise exception 'stock shortage reward added'; exception when check_violation then null; end;
  update public.product_stock_totals set physical_quantity=100,available_quantity=100 where product_id=product_c;
  cart_result := public.add_commercial_campaign_item_to_cart(company,reward_item,1,'ea500000-0000-4000-8000-000000000025');
  cart_result := public.add_commercial_campaign_item_to_cart(company,reward_item,1,'ea500000-0000-4000-8000-000000000025');
  if (cart_result->>'quantity')::integer<>1 or not (cart_result->>'idempotent')::boolean then raise exception 'reward retry duplicated'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,3);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,false);
  if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product_c::text)<>100 then raise exception 'explicit drop failed'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,4);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  begin perform private.resolve_campaign_spend_v1(outsider_company,campaign,cart_id); raise exception 'foreign company accepted'; exception when insufficient_privilege then null; end;
  begin perform private.resolve_campaign_spend_v1(company,campaign,gen_random_uuid()); raise exception 'foreign cart accepted'; exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.resolve_commercial_campaign_item_eligibility_v1(uuid,uuid,integer)','execute')
    or has_function_privilege('authenticated','private.resolve_campaign_spend_v1(uuid,uuid,uuid,boolean,jsonb)','execute')
    or has_table_privilege('authenticated','public.commercial_campaign_spend_configs','insert') then raise exception 'spend grants unsafe'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  state := public.resolve_commercial_campaign_item_eligibility_v1(outsider_company,reward_item,1);
  if coalesce((state->>'eligible')::boolean,true) or state->>'reason'<>'outside_audience'
    or state ? 'productId' or state ? 'qualifyingSpendUsd' or state ? 'reward' then raise exception 'outside audience projection exposed private campaign conditions'; end if;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  -- A valuable unrelated line must not self-unlock or change scoped spend.
  insert into public.catalog_products(id,external_1c_id,sku,name,slug) values('ca500000-0000-4000-8000-000000000004','SPEND-X','SPEND-X','Unrelated X','spend-x');
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,currency_status,is_published)
    values('ca500000-0000-4000-8000-000000000004',base_ref,'USD',10000,now()-interval '1 day',true,'resolved',true);
  insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,'ca500000-0000-4000-8000-000000000004',1) returning id into legacy_item;
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if (state->>'qualifyingSpendUsd')::numeric<>1600 then raise exception 'unrelated X counted'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,1);
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if (state->>'qualifyingSpendUsd')::numeric<>700 or (state->>'thresholdReached')::boolean then raise exception 'unrelated X unlocked reward'; end if;
  perform public.remove_partner_cart_item(legacy_item);
  perform public.set_partner_cart_item_quantity(cart_item,4);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,price_type_id,effective_at,currency_status,is_published)
    values(product,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',1,now()-interval '1 day',true,promo_profile,now(),'resolved',true);
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if (state->>'qualifyingSpendUsd')::numeric<>1600 then raise exception 'alternate qualifying PROMO value changed base spend'; end if;
  delete from public.product_prices where product_id=product and price_type_id=promo_profile;
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if (state->>'qualifyingSpendUsd')::numeric<>1600 then raise exception 'alternate PROMO removal changed base spend'; end if;
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

  for n in 1..11 loop
    trial := case n when 1 then jsonb_set(submitted_items,'{2,effective_price_evidence,thresholdReached}','true')
      when 2 then jsonb_set(submitted_items,'{2,effective_price_evidence,campaignId}',to_jsonb(gen_random_uuid()))
      when 3 then jsonb_set(submitted_items,'{2,effective_price_evidence,publicationVersion}','99')
      when 4 then jsonb_set(submitted_items,'{2,effective_price_evidence,rewardProductId}',to_jsonb(product))
      when 5 then jsonb_set(submitted_items,'{2,effective_price_evidence,qualifyingSpendUsd}','"9999"')
      when 6 then jsonb_set(submitted_items,'{2,source_unit_price}','1')
      when 7 then jsonb_set(submitted_items,'{2,partner_unit_price}','1')
      when 8 then jsonb_set(submitted_items,'{2,effective_price_evidence,companyId}',to_jsonb(outsider_company))
      when 9 then jsonb_set(submitted_items,'{2,effective_price_evidence,spendConfig,thresholdAmountUsd}','"1.00"')
      when 10 then jsonb_set(submitted_items,'{2,effective_price_evidence,rewardEligible}','true')
      else jsonb_set(submitted_items,'{2,effective_price_evidence,sourceAmount}','1') end;
    validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,trial);
    if (validation->>'valid')::boolean or validation->>'code' not in ('ORDER_PRICE_CHANGED','ORDER_PAYLOAD_VALIDATION_FAILED') then raise exception 'forged attach input % accepted: %',n,validation; end if;
  end loop;
  created_order := public.begin_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),gen_random_uuid(),gen_random_uuid(),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if not exists(select 1 from public.partner_order_items where order_id=created_order.id and product_id=product_c
    and source_unit_price=80 and partner_unit_price=1441 and effective_price_evidence->>'mechanicType'='spend_threshold_promo'
    and effective_price_evidence->>'spendRole'='REWARD' and effective_price_evidence->>'publicationVersion'='1'
    and (effective_price_evidence->>'qualifyingSpendUsd')::numeric=1600
    and (effective_price_evidence->'spendConfig'->>'thresholdAmountUsd')::numeric=1500) then raise exception 'reward provenance missing'; end if;
  if exists(select 1 from public.partner_order_items where order_id=created_order.id and product_id<>product_c
    and effective_price_evidence->>'priceSource'<>'PARTNER') then raise exception 'trigger persisted discounted'; end if;
  if exists(select 1 from public.partner_order_items i where order_id=created_order.id and not exists(
    select 1 from jsonb_array_elements(created_order.payload_snapshot->'items') v where v->'productReference'->>'externalId'=i.external_product_ref
      and (v->'price'->>'amount')::numeric=i.partner_unit_price and (v->>'lineTotal')::numeric=i.line_total)) then raise exception 'export differs from persisted prices'; end if;


  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  -- Conservative product-scope conflict includes qualifying SKUs against all four previous mechanics and spend itself.
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,price_type_id,effective_at,currency_status,is_published)
    select product,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',80,now()-interval '1 day',true,promo_profile,now(),'resolved',true;
  for n in 1..5 loop
    trial := draft || jsonb_build_object('code','SPEND_CONFLICT_'||n,'requestId',gen_random_uuid(),'spendConfig',null,
      'mechanicType',case n when 1 then 'legacy_promo' when 2 then 'quantity_threshold_promo' when 3 then 'fixed_bundle_promo' when 4 then 'conditional_attach_promo' else 'spend_threshold_promo' end);
    if n=1 then trial:=jsonb_set(trial,'{items}',jsonb_build_array(draft->'items'->0));
    elsif n=2 then trial:=jsonb_set(trial,'{items}',jsonb_build_array((draft->'items'->0)||jsonb_build_object('benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','promoThresholdQuantity',1)));
    elsif n=3 then trial:=jsonb_set(trial,'{items}',jsonb_build_array((draft->'items'->0)||jsonb_build_object('benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','requiredBundleQuantity',1),(draft->'items'->2)||jsonb_build_object('requiredBundleQuantity',1)));
    elsif n=4 then trial:=jsonb_set(trial,'{items}',jsonb_build_array((draft->'items'->0)||jsonb_build_object('attachRole','TRIGGER','requiredTriggerQuantity',1),(draft->'items'->2)||jsonb_build_object('attachRole','REWARD')));
    else trial:=jsonb_set(trial,'{spendConfig}',config); end if;
    collision:=public.create_commercial_campaign_draft_v2(trial);
    begin perform public.publish_commercial_campaign(collision,gen_random_uuid()); raise exception 'scope collision % published',n; exception when check_violation then null; end;
    if exists(select 1 from public.commercial_campaign_versions where campaign_id=collision) then raise exception 'conflicted publication retained a version'; end if;
  end loop;
  update public.commercial_campaigns set status='paused' where id=campaign;
  perform public.reopen_commercial_campaign_for_edit_v1(campaign,'Spend snapshot acceptance');
  draft := draft || jsonb_build_object('spendConfig',config || jsonb_build_object('thresholdAmountUsd','2000.00'));
  perform public.update_commercial_campaign_draft_v2(campaign,(select draft_revision from public.commercial_campaigns where id=campaign),gen_random_uuid(),draft);
  perform public.publish_commercial_campaign(campaign,gen_random_uuid());
  if (select campaign_snapshot->'spendConfig' from public.commercial_campaign_versions where campaign_id=campaign and version_number=1) is distinct from version_one_config
    or (select (campaign_snapshot->'spendConfig'->>'thresholdAmountUsd')::numeric from public.commercial_campaign_versions where campaign_id=campaign and version_number=2)<>2000 then raise exception 'publication snapshots mutated'; end if;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  begin perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'new publication silently repriced stale checkout'; exception when sqlstate 'PT409' then null; end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  update public.commercial_campaigns set status='paused' where id=campaign;
  perform public.reopen_commercial_campaign_for_edit_v1(campaign,'Reward shared minimum acceptance');
  draft := jsonb_set(draft,'{spendConfig,thresholdAmountUsd}','"1500.00"');
  draft := jsonb_set(draft,'{items,2,minimumQuantity}','2');
  perform public.update_commercial_campaign_draft_v2(campaign,(select draft_revision from public.commercial_campaigns where id=campaign),gen_random_uuid(),draft);
  perform public.publish_commercial_campaign(campaign,gen_random_uuid());
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  state := private.resolve_campaign_spend_v1(company,campaign,cart_id);
  if coalesce((state->>'eligible')::boolean,true) or state->>'reason'<>'below_minimum' then raise exception 'shared reward minimum bypassed'; end if;

  raise notice 'SPEND Wave 2A: draft, USD readiness, decimal boundaries, anti-circularity, whole line, cart edits, stale conditions, owned scope, persistence and snapshot acceptance PASS';
end;
$$;
rollback;
