begin;
do $$ begin if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004' or current_setting('application_name')<>'campaign-intent-disposable' then raise exception 'Disposable target assertion missing'; end if; end $$;
do $$
declare
 actor uuid := 'aa500000-0000-4000-8000-000000000001';
 partner uuid := 'aa500000-0000-4000-8000-000000000002';
 company uuid := 'ba500000-0000-4000-8000-000000000001';
 product uuid := 'ca500000-0000-4000-8000-000000000001';
 campaign uuid := 'fa510000-0000-4000-8000-000000000001';
 cart_id uuid := 'ea510000-0000-4000-8000-000000000001';
 item uuid; prices jsonb; component jsonb; mdl_price numeric; submitted_items jsonb; payload jsonb; validation jsonb; trial jsonb;
 rate_id uuid; created_order public.partner_orders;
 contract_ref text := '22222222-2222-4222-8222-222222222222';
 base_ref text := '23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c';
 mdl_ref text := '55555555-5555-4555-8555-555555555555';
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform public.publish_commercial_campaign(campaign,'fc610000-0000-4000-8000-000000000001');
 select id into item from public.commercial_campaign_items where campaign_id=campaign and product_id=product;
 perform set_config('request.jwt.claim.sub',partner::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
 perform public.add_partner_cart_item(company,product,2);
 perform public.add_commercial_campaign_item_to_cart_v2(company,item,1,1,'fd610000-0000-4000-8000-000000000001');
 prices := public.resolve_partner_cart_prices_v1(cart_id,null,true);
 select id into rate_id from public.commercial_exchange_rates where purpose='retail_price_usd_to_mdl' and is_active;
  submitted_items := '[]'::jsonb;
  payload := jsonb_build_object(
    'partnerCompanyReference',jsonb_build_object('externalId','11111111-1111-4111-8111-111111111111'),
    'priceTypeReference',jsonb_build_object('externalId',base_ref),'contractReference',jsonb_build_object('externalId',contract_ref),
    'currencyReference',jsonb_build_object('externalId',mdl_ref),'currency','MDL','paymentMethod','cashless',
    'pricingMode','rate_999_default','paymentIntent','pay_later','plannedPaymentDate',current_date::text,'fulfillmentMethod','pickup',
    'documentTotal',0,'items','[]'::jsonb);
  for component in select value from jsonb_array_elements(prices->'items') loop
    mdl_price := round((component->'evidence'->>'sourceAmount')::numeric*18.041,0);
    submitted_items := submitted_items || jsonb_build_array(jsonb_build_object(
      'cart_item_id',component->'cartItemId','product_id',component->'productId','external_product_ref',component->'productId',
      'external_characteristic_ref','00000000-0000-0000-0000-000000000000','external_unit_ref','99999999-9999-4999-8999-999999999999',
      'external_vat_rate_ref','99999999-9999-4999-8999-999999999999','product_name','Bundle product','sku','BUNDLE',
      'quantity',component->'quantity','partner_unit_price',mdl_price,'currency_code','MDL','line_total',mdl_price*(component->>'quantity')::integer,
      'source_unit_price',(component->'evidence'->>'sourceAmount')::numeric,'source_currency_code','USD','applied_exchange_rate',18.041,'exchange_rate_id',rate_id,
      'exchange_rate_purpose','retail_price_usd_to_mdl','exchange_rate_source_type','one_c_automatic',
      'exchange_rate_effective_at',(select effective_at from public.commercial_exchange_rates where id=rate_id),'exchange_rate_published_at',(select published_at from public.commercial_exchange_rates where id=rate_id),'effective_price_evidence',component->'evidence'));
    payload := jsonb_set(payload,'{items}',(payload->'items') || jsonb_build_array(jsonb_build_object(
      'productReference',jsonb_build_object('externalId',component->'productId'),'quantity',component->'quantity',
      'price',jsonb_build_object('amount',mdl_price,'currency','MDL'),'lineTotal',mdl_price*(component->>'quantity')::integer)));
  end loop;
  payload := jsonb_set(payload,'{documentTotal}',(select to_jsonb(sum((value->>'line_total')::numeric)) from jsonb_array_elements(submitted_items)));
  validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if not (validation->>'valid')::boolean then raise exception 'bundle v5 failed: %',validation; end if;


  for n in 1..4 loop
    trial := case n when 1 then jsonb_set(submitted_items,'{0,cart_item_id}',submitted_items->1->'cart_item_id')
      when 2 then jsonb_set(submitted_items,'{0,effective_price_evidence,campaignId}','"fa510000-0000-4000-8000-000000000005"')
      when 3 then jsonb_set(submitted_items,'{0,source_unit_price}','1')
      else jsonb_build_array(submitted_items->0,submitted_items->0) end;
    validation := public.validate_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,trial);
    if (validation->>'valid')::boolean then raise exception 'Forged line/context/price accepted: %',n; end if;
  end loop;
  created_order := public.begin_partner_order_submission_v5(cart_id,(select intent_version from public.carts where id=cart_id),'fe610000-0000-4000-8000-000000000001','fe610000-0000-4000-8000-000000000002',current_date+1,'cashless',current_date,'pickup',null,repeat('a',64),payload,submitted_items);
  if (select count(*) from public.partner_order_items where order_id=created_order.id and product_id=product)<>2 then raise exception 'Order collapsed mixed contexts'; end if;
  if not exists(select 1 from public.partner_order_items where order_id=created_order.id and quantity=2 and partner_unit_price=166 and source_unit_price=9.21 and effective_price_evidence->>'commercialSource'='STANDARD' and effective_price_evidence->>'priceSource'='PARTNER') then raise exception 'STANDARD snapshot changed'; end if;
  if not exists(select 1 from public.partner_order_items where order_id=created_order.id and quantity=1 and partner_unit_price=149 and source_unit_price=8.25 and effective_price_evidence->>'commercialSource'='CAMPAIGN' and effective_price_evidence->>'priceSource'='CAMPAIGN_PROMO' and effective_price_evidence->>'campaignId'=campaign::text and effective_price_evidence->>'publicationVersion'='1') then raise exception 'PROMO snapshot lost'; end if;
  if (select count(*) from public.commercial_campaign_order_attributions where order_id=created_order.id)<>1 then raise exception 'Measurement claimed ordinary purchase as campaign benefit'; end if;
  if jsonb_array_length(created_order.payload_snapshot->'items')<>2 or (created_order.payload_snapshot->>'documentTotal')::numeric<>481 then raise exception 'ERP payload price/quantity total mismatch'; end if;
  for component in select value from jsonb_array_elements(created_order.payload_snapshot->'items') loop
   if not exists(select 1 from public.partner_order_items where order_id=created_order.id and partner_unit_price=(component->'price'->>'amount')::numeric and quantity=(component->>'quantity')::integer and line_total=(component->>'lineTotal')::numeric) then raise exception 'ERP payload differs from immutable order line'; end if;
  end loop;
  raise notice 'PASS mixed checkout/order/ERP/measurement: 2 x 166 STANDARD + 1 x 149 PROMO; exact line IDs; forged evidence rejected';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform public.pause_commercial_campaign(campaign,'Isolated immutable order attribution regression');
  perform public.reopen_commercial_campaign_for_edit_v1(campaign,'Isolated immutable order attribution regression');
  perform public.update_commercial_campaign_draft_v2(campaign,
    (select draft_revision from public.commercial_campaigns where id=campaign),
    'fb610000-0000-4000-8000-000000000001',intent_fixture.legacy_draft(campaign));
  if not exists(select 1 from public.commercial_campaign_order_attributions where order_id=created_order.id
    and campaign_item_id=item and publication_version=1) then raise exception 'Draft editing erased historical order attribution'; end if;
  raise notice 'PASS historical order attribution remains unchanged after live item retirement';
end $$;
rollback;
