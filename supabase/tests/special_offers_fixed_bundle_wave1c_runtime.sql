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
  insert into public.catalog_products(id,external_1c_id,sku,name,slug)
    values(product_c,'BUNDLE-C','BUNDLE-C','Bundle C','bundle-c');
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,
    price_type_id,effective_at,currency_status,is_published)
    select id,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',84,now()-interval '1 day',true,
      promo_profile,now()-interval '1 day','resolved',true from public.catalog_products where id in (product_without_promo,product_c);
  draft := jsonb_set(draft,'{mechanicType}','"fixed_bundle_promo"');
  draft := jsonb_set(draft,'{items,0,promoThresholdQuantity}','null');
  draft := jsonb_set(draft,'{items,0,requiredBundleQuantity}','4');
  begin
    perform public.create_commercial_campaign_draft_v2(draft); raise exception 'one-product bundle accepted';
  exception when invalid_parameter_value then null; end;
  draft := jsonb_set(draft,'{items}',(draft->'items') || jsonb_build_array(
    jsonb_set(jsonb_set(jsonb_set(draft->'items'->0,'{productId}',to_jsonb(product_without_promo)),
      '{requiredBundleQuantity}','1'),'{sortOrder}','2'),
    jsonb_set(jsonb_set(jsonb_set(draft->'items'->0,'{productId}',to_jsonb(product_c)),
      '{requiredBundleQuantity}','1'),'{sortOrder}','3')));
  begin
    perform public.create_commercial_campaign_draft_v2(jsonb_set(draft,'{items,0,requiredBundleQuantity}','0'));
    raise exception 'zero required accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_commercial_campaign_draft_v2(jsonb_set(draft,'{items,1,productId}',to_jsonb(product)));
    raise exception 'duplicate product accepted';
  exception when invalid_parameter_value or check_violation then null;
    when raise_exception then if sqlerrm <> 'CAMPAIGN_PRODUCT_LIMIT_INVALID' then raise; end if; end;
  draft := jsonb_set(draft,'{items,0,minimumQuantity}','2');
  for n in 1..2 loop
    begin
      perform public.create_commercial_campaign_draft_v2(jsonb_set(draft,'{items,0,requiredBundleQuantity}',case when n=1 then '-1'::jsonb else '1.5'::jsonb end));
      raise exception 'negative or fractional requirement accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  perform public.create_commercial_campaign_draft_v2(draft || jsonb_build_object('code','TWO_VALID','requestId',gen_random_uuid(),
    'items',jsonb_build_array(draft->'items'->0,draft->'items'->1)));
  campaign := public.create_commercial_campaign_draft_v2(draft);
  select id into item from public.commercial_campaign_items where campaign_id=campaign and product_id=product;
  update public.product_prices set is_published=false where product_id=product_c;
  begin
    perform public.publish_commercial_campaign(campaign,gen_random_uuid()); raise exception 'missing component PROMO published';
  exception when check_violation then null; end;
  update public.product_prices set is_published=true where product_id=product_c;
  perform public.publish_commercial_campaign(campaign,'ea500000-0000-4000-8000-000000000005');
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

  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  insert into public.carts(company_id,created_by) values(company,partner) returning id into cart_id;
  insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,product,1) returning id into cart_item;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if prices->'items'->0->'evidence'->>'priceSource' <> 'PARTNER' then raise exception 'incomplete bundle discounted'; end if;
  -- Browser-supplied single-item quantity cannot prove a basket.
  eligibility := public.resolve_commercial_campaign_item_eligibility_v1(company,item,9999);
  if (eligibility->>'eligible')::boolean then raise exception 'spoofed basket unlocked PROMO'; end if;
  bundle := public.get_partner_commercial_campaign(company,campaign)->'bundleProgress';
  if bundle->'components'->0 ? 'promoPrice' then raise exception 'progress leaks private price'; end if;
  if (bundle->>'eligible')::boolean or bundle->'components'->0->>'missingQuantity' <> '3' then raise exception 'progress mismatch'; end if;
  req := gen_random_uuid();
  cart_result := public.complete_commercial_campaign_bundle_v1(company,campaign,req);
  if not (cart_result->>'eligible')::boolean or cart_result->>'addedQuantity' <> '5' then raise exception 'partial complete-kit not 4/1/1: %',cart_result; end if;
  cart_result := public.complete_commercial_campaign_bundle_v1(company,campaign,req);
  if not (cart_result->>'idempotent')::boolean or (select sum(quantity) from public.cart_items where public.cart_items.cart_id=acceptance.cart_id) <> 6 then raise exception 'complete-kit retry duplicated'; end if;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if (select count(*) from jsonb_array_elements(prices->'items') where value->'evidence'->>'priceSource'='CAMPAIGN_PROMO'
    and value->'evidence'->>'mechanicType'='fixed_bundle_promo' and value->'evidence'->>'publicationVersion'='1') <> 3 then raise exception 'full basket not PROMO'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,6);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,false);
  if (select (value->'evidence'->>'sourceAmount')::numeric from jsonb_array_elements(prices->'items') where value->>'productId'=product::text) <> 84 then raise exception 'excess not entire-line PROMO'; end if;
  perform public.set_partner_cart_item_quantity(cart_item,3);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,false);
  if exists(select 1 from jsonb_array_elements(prices->'items') where value->'evidence'->>'priceSource'<>'PARTNER') then raise exception 'decreasing component did not restore all lines'; end if;
  perform public.complete_commercial_campaign_bundle_v1(company,campaign,gen_random_uuid());
  select id into item_b from public.cart_items where public.cart_items.cart_id=acceptance.cart_id and product_id=product_without_promo;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  perform public.remove_partner_cart_item(item_b);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,false);
  if exists(select 1 from jsonb_array_elements(prices->'items') where value->'evidence'->>'priceSource'<>'PARTNER') then raise exception 'removal did not restore all lines'; end if;
  -- If one component lacks PROMO, no half-kit mutation is retained.
  update public.product_prices set is_published=false where product_id=product_without_promo and price_type_id=promo_profile;
  begin
    perform public.complete_commercial_campaign_bundle_v1(company,campaign,gen_random_uuid()); raise exception 'missing PROMO complete-kit allowed';
  exception when check_violation then null; end;
  if (select count(*) from public.cart_items where public.cart_items.cart_id=acceptance.cart_id) <> 2 then raise exception 'failed kit left half mutation'; end if;
  update public.product_prices set is_published=true where product_id=product_without_promo and price_type_id=promo_profile;
  perform public.complete_commercial_campaign_bundle_v1(company,campaign,gen_random_uuid());
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  -- Insufficient known synchronized stock must leave the basket unchanged.
  insert into public.product_stock_totals(product_id,physical_quantity,available_quantity,synced_at,last_seen_sync_id,freshness_state)
    values(product,2,2,now(),gen_random_uuid(),'authoritative');
  perform public.set_partner_cart_item_quantity(cart_item,3);
  begin
    perform public.complete_commercial_campaign_bundle_v1(company,campaign,gen_random_uuid()); raise exception 'insufficient stock accepted';
  exception when check_violation then null; end;
  if (select quantity from public.cart_items where id=cart_item) <> 3 then raise exception 'stock failure mutated basket'; end if;
  delete from public.product_stock_totals where product_id=product;
  -- A final valid quantity must work even when the missing delta is below minimum.
  perform public.complete_commercial_campaign_bundle_v1(company,campaign,gen_random_uuid());
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  update public.commercial_campaigns set status='paused' where id=campaign;
  insert into public.catalog_products(id,external_1c_id,sku,name,slug) values('ca500000-0000-4000-8000-000000000009','OUTSIDE-BUNDLE','OUTSIDE-BUNDLE','Outside bundle','outside-bundle');
  insert into public.cart_items(cart_id,product_id,quantity) values(cart_id,'ca500000-0000-4000-8000-000000000009',1);
  update public.cart_items set quantity=2 where product_id='ca500000-0000-4000-8000-000000000009';
  if (select count(*) from private.partner_cart_price_reviews r join public.cart_items i on i.id=r.cart_item_id
    where i.cart_id=acceptance.cart_id and i.product_id in (product,product_without_promo,product_c))<>3 then raise exception 'unrelated edit erased stale bundle protection'; end if;
  delete from public.cart_items where product_id='ca500000-0000-4000-8000-000000000009';
  begin
    perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'pause silently raised checkout';
  exception when sqlstate 'PT409' then null; end;
  update public.commercial_campaigns set status='active' where id=campaign;
  update public.product_prices set is_published=false where product_id=product_c and price_type_id=promo_profile;
  begin
    perform public.resolve_partner_cart_prices_v1(cart_id,null,false); raise exception 'missing component price silently raised checkout';
  exception when sqlstate 'PT409' then null; end;
  update public.product_prices set is_published=true where product_id=product_c and price_type_id=promo_profile;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  perform public.set_partner_cart_item_quantity(cart_item,5);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if exists(select 1 from jsonb_array_elements(prices->'items') where value->'evidence'->>'priceSource'<>'CAMPAIGN_PROMO') then raise exception '5A/1B/1C not eligible'; end if;
  select id into item_b from public.cart_items where public.cart_items.cart_id=acceptance.cart_id and product_id=product_without_promo;
  perform public.set_partner_cart_item_quantity(cart_item,4);
  perform public.set_partner_cart_item_quantity(item_b,2);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if exists(select 1 from jsonb_array_elements(prices->'items') where value->'evidence'->>'priceSource'<>'CAMPAIGN_PROMO') then raise exception '4A/2B/1C not eligible'; end if;
  perform public.set_partner_cart_item_quantity(item_b,1);
  for n in 1..3 loop
    if n=1 then update public.product_prices set is_published=false where product_id=product and price_type_id=promo_profile;
    elsif n=2 then update public.price_types set name='OTHER_PROMO' where id=promo_profile;
    else update public.price_types set currency_code='MDL' where id=promo_profile; end if;
    prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
    if exists(select 1 from jsonb_array_elements(prices->'items') where value->'evidence'->>'priceSource'<>'PARTNER') then raise exception 'malformed bundle PROMO applied'; end if;
    update public.product_prices set is_published=true where product_id=product and price_type_id=promo_profile;
    update public.price_types set name='PROMO',currency_code='USD' where id=promo_profile;
  end loop;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  bundle := private.resolve_campaign_bundle_v1(outsider_company,campaign);
  if (bundle->>'eligible')::boolean or bundle->>'reason'<>'outside_audience' then raise exception 'outside audience discounted'; end if;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  begin
    perform private.resolve_campaign_bundle_v1(company,campaign,gen_random_uuid()); raise exception 'foreign cart accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.complete_commercial_campaign_bundle_v1(outsider_company,campaign,gen_random_uuid()); raise exception 'foreign company complete-kit accepted';
  exception when insufficient_privilege then null; end;
  started := clock_timestamp();
  for n in 1..100 loop perform public.resolve_partner_cart_prices_v1(cart_id,null,true); end loop;
  raise notice '100 complete-bundle cart resolutions ms: %',extract(epoch from clock_timestamp()-started)*1000;
  started := clock_timestamp();
  for n in 1..100 loop perform private.resolve_campaign_bundle_v1(company,campaign,cart_id); end loop;
  raise notice '100 bundle qualifications ms: %',extract(epoch from clock_timestamp()-started)*1000;
  started := clock_timestamp();
  for n in 1..100 loop perform public.list_partner_commercial_campaigns(company); end loop;
  raise notice '100 offer discovery/progress calls ms: %',extract(epoch from clock_timestamp()-started)*1000;
  update public.commercial_campaigns set status='paused' where id=campaign;
  started := clock_timestamp();
  for n in 1..100 loop perform public.resolve_partner_cart_prices_v1(cart_id,null,true); end loop;
  raise notice '100 same-three-line base cart resolutions ms: %',extract(epoch from clock_timestamp()-started)*1000;
  update public.commercial_campaigns set status='active' where id=campaign;
  prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
  if not exists(select 1 from public.commercial_campaign_versions where campaign_id=campaign and version_number=1
    and campaign_snapshot->>'bundleExcessQuantitySemantics'='whole_line'
    and campaign_snapshot->'promoProfile'->>'externalRef'='b9f5d585-dab1-11e9-8a58-000c29cf9dd4') then raise exception 'publication commercial contract missing'; end if;

  submitted_items := '[]'::jsonb;
  payload := jsonb_build_object(
    'partnerCompanyReference',jsonb_build_object('externalId','11111111-1111-4111-8111-111111111111'),
    'priceTypeReference',jsonb_build_object('externalId',base_ref),'contractReference',jsonb_build_object('externalId',contract_ref),
    'currencyReference',jsonb_build_object('externalId',mdl_ref),'currency','MDL','paymentMethod','cashless',
    'pricingMode','rate_999_default','paymentIntent','pay_later','plannedPaymentDate',current_date::text,'fulfillmentMethod','pickup',
    'documentTotal',9078,'items','[]'::jsonb);
  for component in select value from jsonb_array_elements(prices->'items') loop
    submitted_items := submitted_items || jsonb_build_array(jsonb_build_object(
      'product_id',component->'productId','external_product_ref',component->'productId',
      'external_characteristic_ref','00000000-0000-0000-0000-000000000000','external_unit_ref','99999999-9999-4999-8999-999999999999',
      'external_vat_rate_ref','99999999-9999-4999-8999-999999999999','product_name','Bundle product','sku','BUNDLE',
      'quantity',component->'quantity','partner_unit_price',1513,'currency_code','MDL','line_total',1513*(component->>'quantity')::integer,
      'source_unit_price',84,'source_currency_code','USD','applied_exchange_rate',18.0105,'exchange_rate_id',rate_id,
      'exchange_rate_purpose','retail_price_usd_to_mdl','exchange_rate_source_type','one_c_automatic',
      'exchange_rate_effective_at',now(),'exchange_rate_published_at',now(),'effective_price_evidence',component->'evidence'));
    payload := jsonb_set(payload,'{items}',(payload->'items') || jsonb_build_array(jsonb_build_object(
      'productReference',jsonb_build_object('externalId',component->'productId'),'quantity',component->'quantity',
      'price',jsonb_build_object('amount',1513,'currency','MDL'),'lineTotal',1513*(component->>'quantity')::integer)));
  end loop;
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if not (validation->>'valid')::boolean then raise exception 'bundle v5 failed: %',validation; end if;
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,jsonb_set(submitted_items,'{0,effective_price_evidence,requiredBundleQuantity}','999'));
  if validation->>'code'<>'ORDER_PRICE_CHANGED' then raise exception 'forged bundle requirement accepted'; end if;
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,jsonb_set(submitted_items,'{0,effective_price_evidence,bundleEligible}','true'));
  if validation->>'code'<>'ORDER_PRICE_CHANGED' then raise exception 'forged bundle eligibility accepted'; end if;
  created_order := public.begin_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),gen_random_uuid(),gen_random_uuid(),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if (select count(*) from public.partner_order_items where order_id=created_order.id and source_unit_price=84
    and partner_unit_price=1513 and effective_price_evidence->>'mechanicType'='fixed_bundle_promo'
    and effective_price_evidence->>'publicationVersion'='1' and effective_price_evidence ? 'requiredBundleQuantity') <> 3 then raise exception 'bundle provenance not persisted'; end if;
  if (select count(*) from public.commercial_campaign_order_attributions where order_id=created_order.id
    and campaign_id=campaign and mechanic_type='fixed_bundle_promo' and publication_version=1) <> 3 then raise exception 'bundle attribution missing'; end if;
  if exists(select 1 from public.partner_order_items i where order_id=created_order.id and not exists(
    select 1 from jsonb_array_elements(created_order.payload_snapshot->'items') v
    where v->'productReference'->>'externalId'=i.external_product_ref and (v->'price'->>'amount')::numeric=i.partner_unit_price
      and (v->>'lineTotal')::numeric=i.line_total)) then raise exception 'export differs from persisted bundle lines'; end if;

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  select item_snapshot into version_one_items from public.commercial_campaign_versions where campaign_id=campaign and version_number=1;
  perform public.pause_commercial_campaign(campaign,'bundle v2 controlled change');
  reopened := public.reopen_commercial_campaign_for_edit_v1(campaign,'bundle v2 controlled change');
  draft := jsonb_set(draft,'{items,0,requiredBundleQuantity}','6');
  perform public.update_commercial_campaign_draft_v2(campaign,(reopened->>'revision')::integer,gen_random_uuid(),draft);
  perform public.publish_commercial_campaign(campaign,gen_random_uuid());
  if (select item_snapshot from public.commercial_campaign_versions where campaign_id=campaign and version_number=1) <> version_one_items
    or not exists(select 1 from public.commercial_campaign_versions v,lateral jsonb_array_elements(v.item_snapshot) c
      where v.campaign_id=campaign and v.version_number=2 and c->>'product_id'=product::text and c->>'required_bundle_quantity'='6') then raise exception 'publication composition lost'; end if;
  for n in 1..3 loop
    draft := jsonb_set(draft,'{code}',to_jsonb('BUNDLE_COLLISION_' || n));
    draft := jsonb_set(draft,'{requestId}',to_jsonb(gen_random_uuid()));
    if n = 1 then
      draft := jsonb_set(draft,'{mechanicType}','"quantity_threshold_promo"');
      select jsonb_agg((value - 'requiredBundleQuantity') || jsonb_build_object('promoThresholdQuantity',2)) into eligibility from jsonb_array_elements(draft->'items');
      draft := jsonb_set(draft,'{items}',eligibility);
    elsif n = 2 then
      draft := jsonb_set(draft,'{mechanicType}','"legacy_promo"');
      select jsonb_agg(value - 'requiredBundleQuantity' - 'promoThresholdQuantity') into eligibility from jsonb_array_elements(draft->'items');
      draft := jsonb_set(draft,'{items}',eligibility);
    else
      draft := jsonb_set(draft,'{mechanicType}','"fixed_bundle_promo"');
      select jsonb_agg(value || jsonb_build_object('requiredBundleQuantity',greatest((value->>'minimumQuantity')::integer,1))) into eligibility from jsonb_array_elements(draft->'items');
      draft := jsonb_set(draft,'{items}',eligibility);
    end if;
    collision := public.create_commercial_campaign_draft_v2(draft);
    begin perform public.publish_commercial_campaign(collision,gen_random_uuid()); raise exception 'bundle collision allowed';
    exception when check_violation then null; end;
  end loop;
  if has_function_privilege('anon','public.complete_commercial_campaign_bundle_v1(uuid,uuid,uuid)','execute')
    or has_function_privilege('authenticated','private.resolve_campaign_bundle_v1(uuid,uuid,uuid,boolean)','execute') then raise exception 'bundle grants unsafe'; end if;
  raise notice 'PASS: bundle definition, full/partial/excess basket, idempotent atomic completion, removal, stale checkout, forged input, provenance/export, immutable v1/v2, collisions, grants';
end;
$$;
rollback;
