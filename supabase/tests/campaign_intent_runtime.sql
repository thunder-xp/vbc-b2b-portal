-- Requires campaign_intent_fixture.sql in the asserted disposable project only.
begin;
do $$ begin
 if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004' or current_setting('application_name') <> 'campaign-intent-disposable' then raise exception 'Disposable target assertion missing'; end if;
end $$;
do $$
declare
 admin uuid := 'aa500000-0000-4000-8000-000000000001';
 partner uuid := 'aa500000-0000-4000-8000-000000000002';
 outsider uuid := 'aa500000-0000-4000-8000-000000000003';
 company uuid := 'ba500000-0000-4000-8000-000000000001';
 a uuid := 'ca500000-0000-4000-8000-000000000001';
 b uuid := 'ca500000-0000-4000-8000-000000000002';
 c uuid := 'ca500000-0000-4000-8000-000000000003';
 cart uuid := 'ea510000-0000-4000-8000-000000000001';
 campaign uuid; item uuid; reward uuid; result jsonb; prices jsonb; progress jsonb; line uuid; normal uuid;
 request uuid; rejected boolean;
begin
 for n in 1..5 loop
  campaign := ('fa510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  perform set_config('request.jwt.claim.sub',admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);
  perform public.publish_commercial_campaign(campaign,('fc510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  delete from public.cart_items where cart_id=cart;
  perform public.add_partner_cart_item(company,a,10);
  perform public.add_partner_cart_item(company,b,10);
  perform public.add_partner_cart_item(company,c,10);
  prices := public.resolve_partner_cart_prices_v1(cart,null,true);
  if jsonb_array_length(prices->'items')<>3 or exists(select 1 from jsonb_array_elements(prices->'items') x
    where x->>'commercialSource'<>'STANDARD' or x->'evidence'->>'priceSource'<>'PARTNER' or x->'campaignContext'<>'null'::jsonb) then
   raise exception 'STANDARD was captured by mechanic %: %',n,prices; end if;
  select id into item from public.commercial_campaign_items where campaign_id=campaign and product_id=a;
  select id into reward from public.commercial_campaign_items where campaign_id=campaign and product_id=c;
  request := ('fd510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  result := public.add_commercial_campaign_item_to_cart_v2(company,item,1,1,request);
  line := (result->>'cartItemId')::uuid;
  select id into normal from public.cart_items where cart_id=cart and product_id=a and commercial_source='STANDARD';
  if line=normal or (select count(*) from public.cart_items where cart_id=cart and product_id=a)<>2 then raise exception 'Context identity collapsed'; end if;
  if not exists(select 1 from public.cart_items where id=line and commercial_source='CAMPAIGN' and campaign_id=campaign and campaign_publication_version=1) then raise exception 'Trusted intent missing'; end if;
  perform public.add_commercial_campaign_item_to_cart_v2(company,item,1,1,request);
  if (select quantity from public.cart_items where id=line)<>1 then raise exception 'Idempotent request added quantity twice'; end if;
  prices := public.resolve_partner_cart_prices_v1(cart,null,true);
  if n=1 then
   if not exists(select 1 from jsonb_array_elements(prices->'items') x where x->>'cartItemId'=line::text
    and x->'evidence'->>'priceSource'='CAMPAIGN_PROMO' and (x->'price'->>'price_amount')::numeric=8.25) then raise exception 'Legacy PROMO not selected: %',prices; end if;
   if round(9.21*18.041,0)<>166 or round(8.25*18.041,0)<>149 then raise exception 'Monetary fixture mismatch'; end if;
  elsif n=2 then
   if not exists(select 1 from jsonb_array_elements(prices->'items') x where x->>'cartItemId'=line::text and x->'evidence'->>'priceSource'='PARTNER') then raise exception 'STANDARD quantity satisfied campaign threshold'; end if;
   perform public.add_commercial_campaign_item_to_cart_v2(company,item,1,2,'fd520000-0000-4000-8000-000000000002');
  elsif n=3 then
   progress := private.resolve_campaign_bundle_v1(company,campaign,cart,true);
   if (progress->>'eligible')::boolean then raise exception 'STANDARD components completed campaign bundle'; end if;
   perform public.complete_commercial_campaign_bundle_v2(company,campaign,1,'fd520000-0000-4000-8000-000000000003');
   perform public.complete_commercial_campaign_bundle_v2(company,campaign,1,'fd520000-0000-4000-8000-000000000003');
   if (select quantity from public.cart_items where id=line)<>2 then raise exception 'Bundle merge/idempotency incorrect'; end if;
  elsif n in (4,5) then
   progress := case when n=4 then private.resolve_campaign_attach_v1(company,campaign,cart,true)
    else private.resolve_campaign_spend_v1(company,campaign,cart,true) end;
   if coalesce((progress->>'eligible')::boolean,false) then raise exception 'STANDARD scope unlocked campaign reward'; end if;
   rejected := false;
   begin
    perform public.add_commercial_campaign_item_to_cart_v2(company,reward,1,1,('fd530000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
   exception when check_violation then rejected := true;
   end;
   if not rejected then raise exception 'Unqualified reward mutation accepted'; end if;
   perform public.add_commercial_campaign_item_to_cart_v2(company,item,1,1,('fd540000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
   result := public.add_commercial_campaign_item_to_cart_v2(company,reward,1,1,('fd550000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
   line := (result->>'cartItemId')::uuid;
  end if;
  prices := public.resolve_partner_cart_prices_v1(cart,null,true);
  if not exists(select 1 from jsonb_array_elements(prices->'items') x where x->>'cartItemId'=line::text
   and x->'evidence'->>'priceSource'='CAMPAIGN_PROMO' and (x->'campaignContext'->>'eligible')::boolean) then
   raise exception 'Qualified mechanic % failed: %',n,prices; end if;
  if exists(select 1 from jsonb_array_elements(prices->'items') x where x->>'commercialSource'='STANDARD' and x->'evidence'->>'priceSource'<>'PARTNER') then raise exception 'Mixed STANDARD scope captured'; end if;
  perform public.set_partner_cart_item_quantity(normal,2);
  if (select quantity from public.cart_items where id=line) is null then raise exception 'STANDARD mutation changed campaign context'; end if;
  perform public.remove_partner_cart_item(normal);
  if not exists(select 1 from public.cart_items where id=line) then raise exception 'Remove targeted another context'; end if;
  -- Exact publication and actor/company checks must reject forged or stale references.
  rejected := false;
  begin perform public.add_commercial_campaign_item_to_cart_v2(company,item,999,1,'fd560000-0000-4000-8000-000000000001');
   exception when sqlstate 'PT409' then rejected:=true; end;
  if not rejected then raise exception 'Forged publication accepted'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  rejected := false;
  begin perform public.add_commercial_campaign_item_to_cart_v2(company,item,1,1,'fd570000-0000-4000-8000-000000000001');
   exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Cross-company mutation accepted'; end if;
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  prices := public.resolve_partner_cart_prices_v1(cart,null,true);
  perform set_config('request.jwt.claim.sub',admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);
  perform public.pause_commercial_campaign(campaign,'Isolated reviewed price invalidation');
  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  rejected := false;
  begin perform public.resolve_partner_cart_prices_v1(cart,null,false);
   exception when sqlstate 'PT409' then rejected:=true; end;
  if not rejected then raise exception 'Reviewed invalidation silently raised price'; end if;
  if n=1 then
   perform set_config('request.jwt.claim.sub',admin::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);
   perform public.reopen_commercial_campaign_for_edit_v1(campaign,'Isolated immutable publication regression');
   perform public.update_commercial_campaign_draft_v2(campaign,
     (select draft_revision from public.commercial_campaigns where id=campaign),
     'fb580000-0000-4000-8000-000000000001',intent_fixture.legacy_draft(campaign));
   perform public.publish_commercial_campaign(campaign,'fc580000-0000-4000-8000-000000000001');
   perform set_config('request.jwt.claim.sub',partner::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
   if not exists(select 1 from public.cart_items where id=line and campaign_item_id=item and campaign_publication_version=1) then
    raise exception 'Draft replacement erased immutable cart context'; end if;
   perform public.set_partner_cart_item_quantity(line,2);
   select id into reward from public.commercial_campaign_items where campaign_id=campaign and product_id=a;
   perform public.add_commercial_campaign_item_to_cart_v2(company,reward,2,1,'fd580000-0000-4000-8000-000000000001');
   if (select count(*) from public.cart_items where cart_id=cart and product_id=a and commercial_source='CAMPAIGN')<>2 then
    raise exception 'Different publications merged'; end if;
   prices := public.resolve_partner_cart_prices_v1(cart,null,true);
   if not exists(select 1 from jsonb_array_elements(prices->'items') x where x->>'cartItemId'=line::text
     and x->'evidence'->>'priceSource'='PARTNER' and x->'campaignContext'->>'publicationVersion'='1') then
    raise exception 'Obsolete publication did not retain unqualified intent'; end if;
   if not exists(select 1 from jsonb_array_elements(prices->'items') x where x->'evidence'->>'publicationVersion'='2'
     and x->'evidence'->>'priceSource'='CAMPAIGN_PROMO') then raise exception 'Republished offer failed'; end if;
   perform public.remove_partner_cart_item(line);
   if (select count(*) from public.cart_items where cart_id=cart and product_id=a and commercial_source='CAMPAIGN')<>1 then
    raise exception 'Removal changed another publication'; end if;
   perform set_config('request.jwt.claim.sub',admin::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);
   perform public.pause_commercial_campaign(campaign,'Isolated matrix campaign scope separation');
   raise notice 'PASS pause/reopen/edit/republish: immutable old context, independent versions, old quantity/removal';
  end if;
  raise notice 'PASS mechanic %: STANDARD/CAMPAIGN/mixed/idempotency/exact-line/publication/cross-company/reviewed invalidation',n;
 end loop;
 if has_table_privilege('authenticated','public.cart_items','INSERT') or has_table_privilege('authenticated','public.cart_items','UPDATE')
  or has_function_privilege('anon','public.add_commercial_campaign_item_to_cart_v2(uuid,uuid,integer,integer,uuid)','EXECUTE') then
  raise exception 'Forged direct/anonymous mutation privileges'; end if;
end $$;
rollback;
