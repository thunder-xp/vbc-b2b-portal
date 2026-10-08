-- Execute only after the existing V3A fixtures in this task-owned disposable project.
begin;
do $$begin
 if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-V3B-COMMERCIAL-ATTRACTIVENESS-20261008' then raise exception 'V3B disposable target required';end if;
 if private.partner_offer_attractiveness_v3b(40,80,10,1000000)<=private.partner_offer_attractiveness_v3b(1,1,10,300) then raise exception 'Urgency overrode material value';end if;
 if not(private.partner_offer_attractiveness_v3b(10,30,10,1000000)>private.partner_offer_attractiveness_v3b(10,30,null,1000000)
  and private.partner_offer_attractiveness_v3b(10,30,null,1000000)>private.partner_offer_attractiveness_v3b(10,30,0,1000000)) then raise exception 'Stock null/zero policy';end if;
 if private.partner_offer_attractiveness_v3b(null,null,null,1000000)<>17 then raise exception 'Missing factor policy';end if;
 if has_function_privilege('anon','public.list_partner_special_offer_feed_v1(uuid,text,text,text,uuid,uuid,text,integer,integer)','execute')
  or has_function_privilege('authenticated','private.partner_offer_attractiveness_v3b(numeric,numeric,numeric,numeric)','execute') then raise exception 'Grant regression';end if;
end $$;
set local request.jwt.claim.sub='aa500000-0000-4000-8000-000000000002';
do $$declare
 company uuid='ba500000-0000-4000-8000-000000000001'; mode text; all_page jsonb; joined jsonb; again jsonb; row jsonb;
begin
 foreach mode in array array['recommended','saving','markup','ending'] loop
  all_page:=public.list_partner_special_offer_feed_v1(company,p_sort=>mode,p_limit=>50);
  joined:=(public.list_partner_special_offer_feed_v1(company,p_sort=>mode,p_limit=>20)->'items')
   ||(public.list_partner_special_offer_feed_v1(company,p_sort=>mode,p_limit=>20,p_offset=>20)->'items')
   ||(public.list_partner_special_offer_feed_v1(company,p_sort=>mode,p_limit=>20,p_offset=>40)->'items');
  again:=public.list_partner_special_offer_feed_v1(company,p_sort=>mode,p_limit=>50);
  if all_page->>'totalCount'<>'43' or jsonb_array_length(joined)<>43 or joined<>all_page->'items' or again<>all_page then raise exception 'Unstable/overlapping sort %',mode;end if;
  if (select count(distinct value->>'offerId') from jsonb_array_elements(joined))<>43 then raise exception 'Duplicate identity';end if;
 end loop;
 all_page:=public.list_partner_special_offer_feed_v1(company,p_mechanic=>'promo',p_limit=>50);
 if all_page->>'totalCount'<>'38' then raise exception 'AIR SHIELD identity regression';end if;
 all_page:=public.list_partner_special_offer_feed_v1(company,p_search=>'V3A-038');
 if all_page->>'totalCount'<>'1' then raise exception 'Global SKU search regression';end if;
 foreach mode in array array['quantity','bundle','conditional','spend'] loop
  all_page:=public.list_partner_special_offer_feed_v1(company,p_mechanic=>mode);
  if jsonb_array_length(all_page->'items')=0 then raise exception 'Missing mechanic %',mode;end if;
 end loop;
 begin perform public.list_partner_special_offer_feed_v1('ba500000-0000-4000-8000-000000000002');raise exception 'Cross-company allowed';exception when insufficient_privilege then null;end;
end $$;
-- Governed published price changes affect sorting, not client order or campaign identity.
update public.product_prices set price_amount=100000 where product_id=(select id from public.catalog_products where sku='V3A-001') and external_1c_price_type_id='e181c772-93fc-11e9-94cb-000c2988d323';
update public.product_prices set price_amount=10 where product_id=(select id from public.catalog_products where sku='V3A-002') and external_1c_price_type_id='b9f5d585-dab1-11e9-8a58-000c29cf9dd4';
update public.product_prices set is_published=false where product_id=(select id from public.catalog_products where sku='V3A-003') and external_1c_price_type_id='e181c772-93fc-11e9-94cb-000c2988d323';
do $$declare page jsonb; company uuid='ba500000-0000-4000-8000-000000000001'; before_position int; after_position int;begin
 page:=public.list_partner_special_offer_feed_v1(company,p_mechanic=>'promo',p_sort=>'markup');
 if page#>>'{items,0,campaign,products,0,sku}'<>'V3A-001' then raise exception 'Canonical markup sort';end if;
 page:=public.list_partner_special_offer_feed_v1(company,p_mechanic=>'promo',p_sort=>'saving');
 if page#>>'{items,0,campaign,products,0,sku}'<>'V3A-002' then raise exception 'Saving percentage sort';end if;
 page:=public.list_partner_special_offer_feed_v1(company,p_mechanic=>'promo',p_sort=>'recommended',p_limit=>50);
 if page#>>'{items,0,campaign,products,0,sku}'<>'V3A-002' then raise exception 'Commercial value priority';end if;
 if (select value->'campaign'->'products'->0->>'sku' from jsonb_array_elements(page->'items') value order by (value->>'rankPosition')::int desc limit 1)<>'V3A-003' then raise exception 'Evidence guardrail';end if;
 select (value->>'rankPosition')::int into before_position from jsonb_array_elements(page->'items') value where value#>>'{campaign,products,0,sku}'='V3A-004';
 update public.product_stock_totals set available_quantity=0 where product_id=(select id from public.catalog_products where sku='V3A-004');
 page:=public.list_partner_special_offer_feed_v1(company,p_mechanic=>'promo',p_limit=>50);
 select (value->>'rankPosition')::int into after_position from jsonb_array_elements(page->'items') value where value#>>'{campaign,products,0,sku}'='V3A-004';
 if after_position is null or after_position<=before_position then raise exception 'Zero stock must remain, lower priority';end if;
end $$;
rollback;
