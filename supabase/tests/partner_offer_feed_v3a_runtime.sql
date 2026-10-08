begin;
do $$ begin if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-V3A-PARTNER-MIXED-OFFER-MARKETPLACE-20261008' then raise exception 'Local V3A target assertion missing'; end if; end $$;
do $$
declare company uuid:='ba500000-0000-4000-8000-000000000001'; partner uuid:='aa500000-0000-4000-8000-000000000002';
 f jsonb; all_items jsonb; r record; detail jsonb; item jsonb; cart_result jsonb; resolved jsonb; cart_id uuid; q integer; expected text; before_prices text; before_versions text; started timestamptz;
begin
 before_prices:=(select md5(jsonb_agg(to_jsonb(p) order by id)::text) from public.product_prices p);
 before_versions:=(select md5(jsonb_agg(to_jsonb(v) order by id)::text) from public.commercial_campaign_versions v);
 perform set_config('request.jwt.claim.sub',partner::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
 started:=clock_timestamp(); f:=public.list_partner_special_offer_feed_v1(company); raise notice 'Feed first page ms: %',extract(epoch from(clock_timestamp()-started))*1000;
 if (f->>'totalCount')::integer<>43 or jsonb_array_length(f->'items')<>20 then raise exception 'Offer pagination wrong: %',f; end if;
 all_items:=f->'items'; f:=public.list_partner_special_offer_feed_v1(company,p_offset=>20);all_items:=all_items||(f->'items');f:=public.list_partner_special_offer_feed_v1(company,p_offset=>40);all_items:=all_items||(f->'items');
 if jsonb_array_length(all_items)<>43 or(select count(distinct value->>'offerId') from jsonb_array_elements(all_items))<>43 then raise exception 'Pagination repeats or drops offers'; end if;
 if(select count(*) from jsonb_array_elements(all_items) where value->'campaign'->>'mechanicType'='legacy_promo' and value->>'kind'='PRODUCT' and jsonb_array_length(value->'campaign'->'products')=1)<>38 then raise exception 'AIR SHIELD not independently discoverable'; end if;
 f:=public.list_partner_special_offer_feed_v1(company,p_search=>'V3A-038'); if(f->>'totalCount')::integer<>1 or f->'items'->0->'campaign'->'products'->0->>'sku'<>'V3A-038' then raise exception 'SKU search is not global'; end if;
 f:=public.list_partner_special_offer_feed_v1(company,p_search=>'Датчик 38'); if(f->>'totalCount')::integer<>1 then raise exception 'Cyrillic search wrong'; end if;
 f:=public.list_partner_special_offer_feed_v1(company,p_mechanic=>'bundle'); if(f->>'totalCount')::integer<>2 or exists(select 1 from jsonb_array_elements(f->'items') where value->>'kind'<>'BUNDLE') then raise exception 'Bundles flattened'; end if;
 f:=public.list_partner_special_offer_feed_v1(company,p_filter=>'stock');if(f->>'totalCount')::integer<>43 then raise exception 'Stock filter wrong';end if;
 f:=public.list_partner_special_offer_feed_v1(company,p_offset=>1000);if(f->>'totalCount')::integer<>43 or jsonb_array_length(f->'items')<>0 then raise exception 'Empty page loses total';end if;
 for r in select * from offer_feed_fixture.campaigns loop
  detail:=public.get_partner_commercial_campaign(company,r.campaign_id);if detail is null then raise exception 'Existing detail lost for %',r.mechanic;end if;
  if not exists(select 1 from jsonb_array_elements(all_items) where(value->'campaign'->>'id')::uuid=r.campaign_id) then raise exception 'Mechanic missing in feed: %',r.mechanic;end if;
  if r.mechanic in('fixed_bundle_promo','bundle_special_price') then
   cart_result:=public.complete_commercial_campaign_bundle_v2(company,r.campaign_id,(detail->>'publicationVersion')::integer,gen_random_uuid());
   if not(cart_result->>'eligible')::boolean then raise exception 'Governed bundle incomplete: %',cart_result;end if;
  else
   for item in select value from jsonb_array_elements(detail->'products') loop
    q:=case when r.mechanic='quantity_threshold_promo' then 3 when r.mechanic='conditional_attach_promo' and item->>'attachRole'='TRIGGER' then(item->>'requiredTriggerQuantity')::integer when r.mechanic='spend_threshold_promo' and item->>'spendRole'='QUALIFYING_SPEND' then 17 else 1 end;
    cart_result:=public.add_commercial_campaign_item_to_cart_v2(company,(item->>'itemId')::uuid,(detail->>'publicationVersion')::integer,q,gen_random_uuid());
   end loop;
  end if;
  select id into cart_id from public.carts where company_id=company and created_by=partner and status='active';
  resolved:=public.resolve_partner_cart_prices_v1(cart_id,null,true);
  expected:=case when r.mechanic='bundle_special_price' then 'CAMPAIGN_SPECIAL_PRICE' else 'CAMPAIGN_PROMO' end;
  if not exists(select 1 from jsonb_array_elements(resolved->'items') where value->'evidence'->>'priceSource'=expected and value->'evidence'->>'mechanicType'=r.mechanic) then raise exception 'Governed price evidence lost for %: %',r.mechanic,resolved;end if;
  raise notice 'Mechanic acceptance PASS: %',r.mechanic;
 end loop;
 if before_prices is distinct from(select md5(jsonb_agg(to_jsonb(p) order by id)::text) from public.product_prices p) or before_versions is distinct from(select md5(jsonb_agg(to_jsonb(v) order by id)::text) from public.commercial_campaign_versions v) then raise exception 'Read/cart altered ERP or publication';end if;
 -- Existing company permission guard, immutable audience, anon grants.
 perform set_config('request.jwt.claim.sub','aa500000-0000-4000-8000-000000000003',true);perform set_config('request.jwt.claims','{"sub":"aa500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
 begin perform public.list_partner_special_offer_feed_v1(company);raise exception 'Cross-company leak';exception when insufficient_privilege then null;end;
 f:=public.list_partner_special_offer_feed_v1('ba500000-0000-4000-8000-000000000002');if(f->>'totalCount')::integer<>0 then raise exception 'Outside published audience leak';end if;
 if has_function_privilege('anon','public.list_partner_special_offer_feed_v1(uuid,text,text,text,uuid,uuid,text,integer,integer)','execute') then raise exception 'Anon feed exposed';end if;
 raise notice 'Feed security/pagination/search/cart authority PASS';
end $$;
rollback;
