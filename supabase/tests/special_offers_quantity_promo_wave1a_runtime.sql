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
  if (select mechanic_type from public.commercial_campaigns where id=campaign)<>'quantity_threshold_promo'
     or (select promo_threshold_quantity from public.commercial_campaign_items where id=item)<>5 then
    raise exception 'Quantity mechanic draft was not persisted';
  end if;

  begin
    perform public.update_commercial_campaign_draft_v2(
      campaign,1,'ea500000-0000-4000-8000-000000000002',
      jsonb_set(draft,'{items,0,promoThresholdQuantity}','0'::jsonb)
        || jsonb_build_object('requestId','ea500000-0000-4000-8000-000000000002')
    );
    raise exception 'Invalid zero threshold was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.create_commercial_campaign_draft_v2(
      jsonb_set(
        jsonb_set(draft,'{requestId}','"ea500000-0000-4000-8000-000000000008"'::jsonb),
        '{code}','"QTY_MANUAL_PRICE"'::jsonb
      ) || jsonb_build_object('campaignPrice',80)
    );
    raise exception 'Manual campaign price was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.create_commercial_campaign_draft_v2(
      jsonb_set(
        jsonb_set(draft,'{requestId}','"ea500000-0000-4000-8000-000000000003"'::jsonb),
        '{code}','"QTY_NO_PROMO"'::jsonb
      ) || jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
        'productId',product_without_promo,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',20,
        'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4',
        'partnerMessage',null,'promoThresholdQuantity',5
      )))
    );
    raise exception 'Missing PROMO price was accepted';
  exception when check_violation then null;
  end;

  begin
    perform public.create_commercial_campaign_draft_v2(
      jsonb_set(
        jsonb_set(draft,'{requestId}','"ea500000-0000-4000-8000-000000000004"'::jsonb),
        '{code}','"QTY_WRONG_PROFILE"'::jsonb
      ) || jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
        'productId',product,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',20,
        'benefitType','existing_price_profile','governedBenefitReference','not-promo',
        'partnerMessage',null,'promoThresholdQuantity',5
      )))
    );
    raise exception 'Wrong price profile was accepted';
  exception when invalid_parameter_value then null;
  end;

  perform public.publish_commercial_campaign(campaign,'ea500000-0000-4000-8000-000000000005');
  select item_snapshot into version_one_items
  from public.commercial_campaign_versions where campaign_id=campaign and version_number=1;
  if (version_one_items->0->>'promo_threshold_quantity')::integer<>5
     or (select campaign_snapshot->>'mechanic_type' from public.commercial_campaign_versions where campaign_id=campaign and version_number=1)<>'quantity_threshold_promo' then
    raise exception 'Published mechanic snapshot is incomplete';
  end if;

  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  partner_detail := public.get_partner_commercial_campaign(company,campaign);
  if partner_detail->>'mechanicType'<>'quantity_threshold_promo'
     or partner_detail->'products'->0->>'promoThresholdQuantity'<>'5'
     or partner_detail->'products'->0->'specialPrice'->>'amount'<>'84.00' then
    raise exception 'Partner projection did not expose governed threshold PROMO';
  end if;
  eligibility := public.resolve_commercial_campaign_item_eligibility_v1(company,item,4);
  if (eligibility->>'eligible')::boolean or eligibility->>'reason'<>'below_threshold' then
    raise exception 'Below-threshold quantity was not rejected';
  end if;
  eligibility := public.resolve_commercial_campaign_item_eligibility_v1(company,item,5);
  if not (eligibility->>'eligible')::boolean or eligibility->>'reason'<>'eligible' then
    raise exception 'Equal threshold was not eligible';
  end if;
  eligibility := public.resolve_commercial_campaign_item_eligibility_v1(company,item,6);
  if not (eligibility->>'eligible')::boolean then
    raise exception 'Above threshold was not eligible';
  end if;
  cart_result := public.add_commercial_campaign_item_to_cart(company,item,4,'fa500000-0000-4000-8000-000000000001');
  if (cart_result->>'promoEligible')::boolean or cart_result->>'eligibilityReason'<>'below_threshold' then
    raise exception 'Cart mutation did not preserve below-threshold Partner pricing evidence';
  end if;
  cart_result := public.add_commercial_campaign_item_to_cart(company,item,1,'fa500000-0000-4000-8000-000000000002');
  if not (cart_result->>'promoEligible')::boolean or cart_result->>'eligibilityReason'<>'eligible'
     or (cart_result->>'quantity')::integer<>5
     or not exists(
       select 1 from public.commercial_campaign_engagement_events
       where request_id='fa500000-0000-4000-8000-000000000002'
         and publication_version=1 and mechanic_type='quantity_threshold_promo'
         and mechanic_threshold_quantity=5 and mechanic_eligible
     ) then
    raise exception 'Cart mutation did not record threshold eligibility evidence';
  end if;

  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  eligibility := public.resolve_commercial_campaign_item_eligibility_v1(outsider_company,item,5);
  if (eligibility->>'eligible')::boolean or eligibility->>'reason'<>'outside_audience' then
    raise exception 'Non-audience partner received eligibility';
  end if;

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  legacy_campaign := public.create_commercial_campaign_draft_v2(
    jsonb_set(
      jsonb_set(
        jsonb_set(draft,'{requestId}','"ea500000-0000-4000-8000-000000000009"'::jsonb),
        '{code}','"LEGACY_PROMO"'::jsonb
      ),
      '{mechanicType}','"legacy_promo"'::jsonb
    ) || jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
      'productId',product,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',null,
      'benefitType','informational_only','governedBenefitReference',null,
      'partnerMessage',null,'promoThresholdQuantity',null
    )))
  );
  perform public.publish_commercial_campaign(legacy_campaign,'ea500000-0000-4000-8000-000000000010');
  select id into legacy_item from public.commercial_campaign_items where campaign_id=legacy_campaign;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  eligibility := public.resolve_commercial_campaign_item_eligibility_v1(company,legacy_item,1);
  if (eligibility->>'eligible')::boolean or eligibility->>'reason'<>'legacy_campaign'
     or (select mechanic_type from public.commercial_campaigns where id=legacy_campaign)<>'legacy_promo' then
    raise exception 'Legacy campaign behavior was reinterpreted';
  end if;

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform public.pause_commercial_campaign(campaign,'Threshold update acceptance');
  reopened := public.reopen_commercial_campaign_for_edit_v1(campaign,'Threshold update acceptance');
  perform public.update_commercial_campaign_draft_v2(
    campaign,(reopened->>'revision')::integer,'ea500000-0000-4000-8000-000000000006',
    jsonb_set(draft,'{items,0,promoThresholdQuantity}','10'::jsonb)
      || jsonb_build_object('requestId','ea500000-0000-4000-8000-000000000006')
  );
  select id into item from public.commercial_campaign_items where campaign_id=campaign and product_id=product;
  if (version_one_items->0->>'promo_threshold_quantity')::integer<>5
     or (select item_snapshot->0->>'promo_threshold_quantity' from public.commercial_campaign_versions where campaign_id=campaign and version_number=1)<>'5' then
    raise exception 'Editing the reopened draft mutated version one';
  end if;
  perform public.publish_commercial_campaign(campaign,'ea500000-0000-4000-8000-000000000007');
  if (select item_snapshot->0->>'promo_threshold_quantity' from public.commercial_campaign_versions where campaign_id=campaign and version_number=2)<>'10'
     or (select item_snapshot->0->>'promo_threshold_quantity' from public.commercial_campaign_versions where campaign_id=campaign and version_number=1)<>'5' then
    raise exception 'Republish did not preserve immutable version thresholds';
  end if;

  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  update public.commercial_campaigns set status='paused' where id=campaign;
  eligibility := public.resolve_commercial_campaign_item_eligibility_v1(company,item,10);
  if (eligibility->>'eligible')::boolean or eligibility->>'reason'<>'inactive_campaign' then
    raise exception 'Inactive campaign remained eligible';
  end if;

  if has_function_privilege('anon','public.resolve_commercial_campaign_item_eligibility_v1(uuid,uuid,integer)','execute')
     or has_function_privilege('anon','public.add_commercial_campaign_item_to_cart(uuid,uuid,integer,uuid)','execute') then
    raise exception 'Anonymous mechanic execution is exposed';
  end if;
  if not has_function_privilege('authenticated','public.resolve_commercial_campaign_item_eligibility_v1(uuid,uuid,integer)','execute') then
    raise exception 'Authenticated eligibility grant is missing';
  end if;
  if (select not prosecdef or not (coalesce(proconfig,'{}'::text[]) @> array['search_path=""'])
      from pg_proc where oid='public.resolve_commercial_campaign_item_eligibility_v1(uuid,uuid,integer)'::regprocedure) then
    raise exception 'Eligibility function security configuration is invalid';
  end if;

  raise notice 'PASS: quantity threshold, exact PROMO, audience/lifecycle denial, immutable v1/v2 snapshots, grants';
end;
$$;

rollback;
