begin;
do $$ begin
 if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004'
 or current_setting('application_name')<>'campaign-intent-disposable' then raise exception 'Disposable target missing'; end if;
end $$;
do $$
declare
 campaign uuid := 'fa510000-0000-4000-8000-000000000001';
 company uuid := 'ba500000-0000-4000-8000-000000000001';
 cart uuid := 'ea510000-0000-4000-8000-000000000001';
 product uuid := 'ca500000-0000-4000-8000-000000000001';
 partner uuid := 'aa500000-0000-4000-8000-000000000002';
 admin uuid := 'aa500000-0000-4000-8000-000000000001';
 item uuid; publication integer; denied boolean; original_end timestamptz; original_price uuid;
begin
 select current_version,ends_at into publication,original_end from public.commercial_campaigns where id=campaign;
 select id into item from public.commercial_campaign_items where campaign_id=campaign and product_id=product;
 select p.id into original_price from public.product_prices p join public.price_types t on t.id=p.price_type_id
  where p.product_id=product and t.external_ref='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' and p.is_active and p.is_published;
 for n in 1..3 loop
  delete from public.cart_items where cart_id=cart;
  update public.commercial_campaigns set ends_at=original_end where id=campaign;
  update public.product_prices set is_active=true where id=original_price;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  perform public.add_commercial_campaign_item_to_cart_v2(company,item,publication,1,
   ('fd920000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
  perform public.resolve_partner_cart_prices_v1(cart,null,true);
  if n=1 then update public.commercial_campaigns set ends_at=now()-interval '1 second' where id=campaign;
  elsif n=2 then update public.product_prices set is_active=false where id=original_price;
  else
   -- Legitimate audience replacement is a new immutable publication, never editing the old snapshot.
   perform set_config('request.jwt.claim.sub',admin::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);
   perform public.pause_commercial_campaign(campaign,'Isolated audience replacement acceptance');
   perform public.reopen_commercial_campaign_for_edit_v1(campaign,'Isolated audience replacement acceptance');
   perform public.update_commercial_campaign_draft_v2(campaign,
    (select draft_revision from public.commercial_campaigns where id=campaign),
    'fb920000-0000-4000-8000-000000000001',jsonb_set(intent_fixture.legacy_draft(campaign),'{companyIds}',
      '["ba500000-0000-4000-8000-000000000002"]'));
   perform public.publish_commercial_campaign(campaign,'fc920000-0000-4000-8000-000000000001');
   perform set_config('request.jwt.claim.sub',partner::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  end if;
  denied:=false;
  begin perform public.resolve_partner_cart_prices_v1(cart,null,false);
   exception when sqlstate 'PT409' then denied:=true; end;
  if not denied then raise exception 'Reviewed invalidation % accepted a silent price increase',n; end if;
 end loop;
 raise notice 'PASS expired campaign, inactive governed PROMO and governed audience replacement: ORDER_PRICE_CHANGED, intent retained';
end $$;
rollback;
