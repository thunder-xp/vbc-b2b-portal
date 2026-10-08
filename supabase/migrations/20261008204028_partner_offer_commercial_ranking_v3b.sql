begin;
set local lock_timeout='5s';
-- Policy V3B: commercial value 60 (saving 40 + markup 20), stock 30, time 10.
-- Missing commercial factors have no invented benefit; evidence tier precedes score.
-- Stock unknown is neutral .5; known zero is 0; confirmed coverage ramps .55..1.
-- Time is an actual end-date band, never a synthetic scarcity/popularity signal.
create or replace function private.partner_offer_attractiveness_v3b(p_saving numeric,p_markup numeric,p_stock_coverage numeric,p_remaining_seconds numeric)
returns numeric language sql immutable set search_path='' as $$
 select 40*coalesce(least(1,greatest(0,p_saving)/50),0)
  +20*coalesce(least(1,greatest(0,p_markup)/100),0)
  +30*case when p_stock_coverage is null then .5 when p_stock_coverage<=0 then 0 when p_stock_coverage<1 then p_stock_coverage/2 else least(1,.5+p_stock_coverage/20) end
  +10*case when p_remaining_seconds<=0 then 0 when p_remaining_seconds<86400 then 1 when p_remaining_seconds<=259200 then .6 else .2 end;
$$;
revoke all on function private.partner_offer_attractiveness_v3b(numeric,numeric,numeric,numeric) from public,anon,authenticated,service_role;
-- Offer identity is selected and paginated before commercial enrichment.
create or replace function public.list_partner_special_offer_feed_v1(
 p_company_id uuid,p_filter text default 'active',p_mechanic text default 'all',p_search text default '',
 p_category_id uuid default null,p_brand_id uuid default null,p_sort text default 'recommended',p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare result jsonb; can_partner boolean; can_retail boolean;
begin
 if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_limit not between 1 and 50 or p_offset not between 0 and 100000 or length(p_search)>100
 or p_filter not in ('active','ending','stock','arrivals','purchased')
 or p_mechanic not in ('all','promo','quantity','bundle','conditional','spend')
 or p_sort not in ('recommended','saving','markup','ending') then raise exception 'Invalid feed scope' using errcode='22023'; end if;
 can_partner:=public.has_permission(p_company_id,'pricing.partner_price.view');
 can_retail:=public.has_permission(p_company_id,'pricing.retail_price.view');
 with authorized as materialized (
  select c.*,v.item_snapshot published_item_snapshot from public.commercial_campaigns c
  join public.commercial_campaign_audience_snapshots a on a.campaign_id=c.id and a.version_number=c.current_version and a.company_id=p_company_id and a.included
  join public.commercial_campaign_versions v on v.campaign_id=c.id and v.version_number=c.current_version
  where c.status in ('active','scheduled') and c.starts_at<=now() and c.ends_at>now()
 ), published_items as materialized (
  select c.id campaign_id,item.value from authorized c cross join lateral jsonb_array_elements(c.published_item_snapshot) item
  where p_sort<>'ending'
 ), scoped as materialized (
  select c.id campaign_id,c.current_version,c.priority,c.ends_at,c.mechanic_type,
   case when c.mechanic_type in ('legacy_promo','quantity_threshold_promo') then i.id end item_id,
   case c.mechanic_type when 'legacy_promo' then 'PRODUCT' when 'quantity_threshold_promo' then 'PRODUCT'
    when 'fixed_bundle_promo' then 'BUNDLE' when 'bundle_special_price' then 'BUNDLE'
    when 'conditional_attach_promo' then 'CONDITIONAL' when 'spend_threshold_promo' then 'SPEND_THRESHOLD' end kind,
   min(i.sort_order) item_order
  from authorized c join public.commercial_campaign_items i on i.campaign_id=c.id
  join public.catalog_products p on p.id=i.product_id and p.is_active and p.is_visible and p.external_1c_id is not null
  where (p_mechanic='all' or p_mechanic='promo' and c.mechanic_type='legacy_promo'
   or p_mechanic='quantity' and c.mechanic_type='quantity_threshold_promo'
   or p_mechanic='bundle' and c.mechanic_type in ('fixed_bundle_promo','bundle_special_price')
   or p_mechanic='conditional' and c.mechanic_type='conditional_attach_promo'
   or p_mechanic='spend' and c.mechanic_type='spend_threshold_promo')
  -- Product facets apply to the product; compound facets/search match any component.
  and (p_search='' or position(lower(p_search) in lower(concat_ws(' ',p.sku,p.name,c.partner_title)))>0)
  and (p_category_id is null or p.category_id=p_category_id) and (p_brand_id is null or p.brand_id=p_brand_id)
  and (p_filter='active' or p_filter='ending' and c.ends_at<=now()+interval '7 days'
   or p_filter='stock' and exists(select 1 from public.product_stock_totals s where s.product_id=i.product_id and s.is_published and s.freshness_state='authoritative' and s.available_quantity>0)
   or p_filter='arrivals' and exists(select 1 from public.product_supplier_arrivals r where r.product_id=i.product_id and r.is_published and r.expected_arrival_date>=current_date)
   or p_filter='purchased' and exists(select 1 from public.partner_order_history_items hi join public.partner_order_history h on h.id=hi.order_history_id and h.company_id=p_company_id and h.partner_visible where hi.product_id=i.product_id))
  group by c.id,c.current_version,c.priority,c.ends_at,c.mechanic_type,case when c.mechanic_type in ('legacy_promo','quantity_threshold_promo') then i.id end
 ), rank_scope as materialized (
  -- All matching offer identities are ranked before pagination. Compound evidence uses all components.
  select x.item_id,i.*,x.kind,x.mechanic_type,
   case when x.kind='BUNDLE' then i.required_bundle_quantity else 1 end units,
   case when x.kind='BUNDLE' then i.required_bundle_quantity
    when i.attach_role='TRIGGER' then i.required_trigger_quantity
    when x.mechanic_type='quantity_threshold_promo' then greatest(i.minimum_quantity,i.promo_threshold_quantity)
    else i.minimum_quantity end required_stock,
   x.kind in ('PRODUCT','BUNDLE') or i.attach_role='REWARD' or sr.role='REWARD' economic_line,
   rp.is_active and rp.is_visible and rp.external_1c_id is not null identity_ready,
   (published.value @> jsonb_build_object('id',i.id,'product_id',i.product_id,'minimum_quantity',i.minimum_quantity,
      'maximum_quantity_per_company',i.maximum_quantity_per_company,'benefit_type',i.benefit_type,'governed_benefit_reference',i.governed_benefit_reference)
     and (x.mechanic_type<>'quantity_threshold_promo' or (published.value->>'promo_threshold_quantity')::integer=i.promo_threshold_quantity)
     and (x.kind<>'BUNDLE' or (published.value->>'required_bundle_quantity')::integer=i.required_bundle_quantity)
     and (x.mechanic_type<>'conditional_attach_promo' or published.value @> jsonb_build_object('attach_role',i.attach_role,'required_trigger_quantity',i.required_trigger_quantity))
     and (x.mechanic_type<>'bundle_special_price' or published.value @> jsonb_build_object('bundle_special_unit_price',i.bundle_special_unit_price,'bundle_special_currency',i.bundle_special_currency))) published_ready
  from scoped x join public.commercial_campaign_items i on i.campaign_id=x.campaign_id and (x.item_id is null or i.id=x.item_id)
  join public.catalog_products rp on rp.id=i.product_id
  left join published_items published on published.campaign_id=i.campaign_id and published.value->>'id'=i.id::text
  left join public.commercial_campaign_spend_roles sr on sr.campaign_id=i.campaign_id and sr.product_id=i.product_id
  where p_sort<>'ending'
 ), rank_prices as materialized (
  select distinct on (r.product_id,r.external_1c_price_type_id) r.* from public.product_prices r
  where r.product_id in(select product_id from rank_scope) and r.is_active and r.is_published and r.currency_status='resolved'
   and upper(r.currency) in ('USD','MDL') and r.price_amount>0 and r.valid_from<=now() and (r.valid_to is null or r.valid_to>=now())
   and (r.company_id is null or r.company_id=p_company_id)
  order by r.product_id,r.external_1c_price_type_id,coalesce(r.company_id=p_company_id,false) desc,r.valid_from desc,r.updated_at desc,r.id
 ), rank_rates as materialized (
  select
   (select case when rate>0 and (source_type='one_c_automatic' or source_type='manual_from_1c' and published_by is not null) then rate end
    from public.commercial_exchange_rates where purpose='partner_price_usd_to_mdl' and is_active and is_published order by effective_at desc limit 1) partner_rate,
   (select case when rate>0 and (source_type='one_c_automatic' or source_type='manual_from_1c' and published_by is not null) then rate end
    from public.commercial_exchange_rates where purpose='retail_price_usd_to_mdl' and is_active and is_published order by effective_at desc limit 1) retail_rate
 ), rank_lines as materialized (
  select i.*,upper(n.currency) normal_currency,n.price_amount normal_price,
   case when can_partner and i.published_ready then case when i.mechanic_type='bundle_special_price' then i.bundle_special_unit_price
    when i.benefit_type='existing_price_profile' and i.governed_benefit_reference='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' and promo.id is not null then sp.price_amount end end special_price,
   case when i.mechanic_type='bundle_special_price' then i.bundle_special_currency else 'USD' end special_currency,
   case when can_retail and upper(r.currency)='MDL' then r.price_amount end retail_price,
   case when can_partner and upper(n.currency)='USD' then rates.partner_rate end partner_rate,
   case when can_retail and upper(n.currency)='USD' then rates.retail_rate end retail_rate,
   case when stock.is_published and stock.freshness_state='authoritative' then stock.available_quantity end stock
  from rank_scope i cross join rank_rates rates join public.partner_companies company on company.id=p_company_id
  left join rank_prices n on can_partner and n.product_id=i.product_id and n.external_1c_price_type_id=company.external_1c_price_type_id
  left join rank_prices sp on sp.product_id=i.product_id and sp.external_1c_price_type_id='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' and upper(sp.currency)='USD'
  left join public.price_types promo on promo.id=sp.price_type_id and promo.is_active and promo.external_ref='b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
   and promo.external_code='UU-000021' and promo.name='PROMO' and upper(promo.currency_code)='USD'
  left join rank_prices r on r.product_id=i.product_id and r.external_1c_price_type_id='e181c772-93fc-11e9-94cb-000c2988d323'
  left join public.product_stock_totals stock on stock.product_id=i.product_id
 ), rank_totals as (
  select campaign_id,item_id,
   bool_and(coalesce(published_ready and identity_ready and required_stock>0,false))
    and bool_and(coalesce(special_price>0 and units>0,false)) filter(where economic_line) and count(distinct special_currency) filter(where economic_line)=1 special_ready,
   bool_and(coalesce(normal_price>0 and (normal_currency=special_currency or special_currency='MDL' and normal_currency='USD' and partner_rate>0),false)) filter(where economic_line) normal_ready,
   bool_and(coalesce(retail_price>0 and partner_rate>0 and retail_rate>0,false)) filter(where economic_line) markup_ready,
   sum(special_price*units) filter(where economic_line) special_total,
   sum((case when normal_currency=special_currency then normal_price when special_currency='MDL' and normal_currency='USD' then round(normal_price*partner_rate) end)*units) filter(where economic_line) normal_total,
   sum((case when special_currency='USD' then round(special_price*partner_rate) when special_currency='MDL' then special_price end)*units) filter(where economic_line) special_mdl,
   sum(retail_price*units) filter(where economic_line) retail_mdl,
   min(partner_rate) filter(where economic_line) partner_rate,min(retail_rate) filter(where economic_line) retail_rate,
   case when bool_or(stock=0) then 0 when count(stock)<count(*) then null else min(stock/nullif(required_stock,0)) end stock_coverage
  from rank_lines group by campaign_id,item_id
 ), rank_factors as (
  select *,case when special_ready and normal_ready and normal_total>0 then greatest(0,(normal_total-special_total)/normal_total*100) end saving_percent,
   -- Mirrors createCommercialOpportunity: per-line rounded SPECIAL MDL, actual RTL999 MDL, then cross-rate reverse markup.
   case when special_ready and markup_ready and special_mdl>0 then ((retail_mdl/partner_rate)/(special_mdl/retail_rate)-1)*100 end markup_percent
  from rank_totals
 ), ranked as (
  select x.*,f.saving_percent,f.markup_percent,
   case when f.saving_percent is not null and f.markup_percent is not null then 2 when f.saving_percent is not null or f.markup_percent is not null then 1 else 0 end evidence_tier,
   private.partner_offer_attractiveness_v3b(f.saving_percent,f.markup_percent,f.stock_coverage,extract(epoch from x.ends_at-now())) score
  from scoped x left join rank_factors f on f.campaign_id=x.campaign_id and f.item_id is not distinct from x.item_id
 ), page as materialized (
  select *,row_number() over(order by
   case when p_sort='recommended' then evidence_tier end desc nulls last,
   case when p_sort='recommended' then score end desc nulls last,
   case when p_sort='saving' then saving_percent end desc nulls last,
   case when p_sort='markup' then markup_percent end desc nulls last,
   ends_at,campaign_id,item_order,item_id) ord from ranked
  order by case when p_sort='recommended' then evidence_tier end desc nulls last,
   case when p_sort='recommended' then score end desc nulls last,
   case when p_sort='saving' then saving_percent end desc nulls last,
   case when p_sort='markup' then markup_percent end desc nulls last,
   ends_at,campaign_id,item_order,item_id limit p_limit offset p_offset
 ), product_scope as materialized (
  select i.*,p.sku,p.name,p.slug,coalesce(p.image_source_url,p.image_url) image_url
  from page x join public.commercial_campaign_items i on i.id=x.item_id join public.catalog_products p on p.id=i.product_id
 ), prices as materialized (
  select distinct on (r.product_id,r.external_1c_price_type_id) r.* from public.product_prices r
  join product_scope s on s.product_id=r.product_id
  where r.is_active and r.is_published and r.currency_status='resolved' and upper(r.currency)='USD' and r.price_amount>0
   and r.valid_from<=now() and (r.valid_to is null or r.valid_to>=now()) and (r.company_id is null or r.company_id=p_company_id)
  order by r.product_id,r.external_1c_price_type_id,coalesce(r.company_id=p_company_id,false) desc,r.valid_from desc,r.updated_at desc,r.id
 ), product_projection as (
  select i.id,jsonb_build_object('itemId',i.id,'productId',i.product_id,'sku',i.sku,'name',i.name,'slug',i.slug,'imageUrl',i.image_url,
   'minimumQuantity',i.minimum_quantity,'maximumQuantityPerCompany',i.maximum_quantity_per_company,'partnerMessage',i.partner_message,
   'mechanicType',c.mechanic_type,'promoThresholdQuantity',i.promo_threshold_quantity,
   'partnerPrice',case when can_partner and n.price_amount is not null then jsonb_build_object('amount',n.price_amount,'currency','USD') end,
   'specialPrice',case when can_partner and promo.id is not null and i.benefit_type='existing_price_profile'
    and i.governed_benefit_reference='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' then jsonb_build_object('amount',sp.price_amount,'currency','USD') end,
   'msrpPrice',case when can_retail and m.price_amount is not null then jsonb_build_object('amount',m.price_amount,'currency','USD') end,
   'price',case when can_partner and n.price_amount is not null then jsonb_build_object('amount',n.price_amount,'currency','USD') end,
   'availableQuantity',case when stock.is_published and stock.freshness_state='authoritative' then stock.available_quantity end,
   'expectedArrivalDate',arr.expected_arrival_date) product
  from product_scope i join authorized c on c.id=i.campaign_id join public.partner_companies company on company.id=p_company_id
  left join prices n on n.product_id=i.product_id and n.external_1c_price_type_id=company.external_1c_price_type_id
  left join prices m on m.product_id=i.product_id and m.external_1c_price_type_id='d9c92519-658b-11e8-80d3-000c29a58b59'
  left join prices sp on sp.product_id=i.product_id and sp.external_1c_price_type_id='b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
  left join public.price_types promo on promo.id=sp.price_type_id and promo.is_active and promo.external_ref='b9f5d585-dab1-11e9-8a58-000c29cf9dd4' and promo.external_code='UU-000021' and promo.name='PROMO' and upper(promo.currency_code)='USD'
  left join public.product_stock_totals stock on stock.product_id=i.product_id
  left join (select r.product_id,min(r.expected_arrival_date) expected_arrival_date from public.product_supplier_arrivals r join product_scope s on s.product_id=r.product_id where r.is_published and r.expected_arrival_date>=current_date group by r.product_id) arr on arr.product_id=i.product_id
 ), compound as materialized (
  -- Existing condition/price authority, once per selected compound campaign; no application per-card RPC.
  select campaign_id,public.get_partner_commercial_campaign(p_company_id,campaign_id) campaign
  from (select distinct campaign_id from page where item_id is null) ids
 ), enriched as (
  select x.ord,jsonb_build_object('offerId',concat(x.campaign_id,':',x.current_version,':',coalesce(x.item_id::text,x.kind)), 'kind',x.kind,'rankPosition',x.ord,
   'campaign',case when x.item_id is null then compound.campaign else jsonb_build_object('id',c.id,'publicationVersion',c.current_version,'code',c.code,'title',c.partner_title,
    'description',c.partner_description,'type',c.campaign_type,'startsAt',c.starts_at,'endsAt',c.ends_at,'priority',c.priority,'termsSummary',c.terms_summary,
    'mechanicType',c.mechanic_type,'products',jsonb_build_array(pp.product)) end) item
  from page x join authorized c on c.id=x.campaign_id left join product_projection pp on pp.id=x.item_id left join compound on compound.campaign_id=x.campaign_id
 ), facets as (
  select distinct p.category_id,p.brand_id from authorized c join public.commercial_campaign_items i on i.campaign_id=c.id join public.catalog_products p on p.id=i.product_id and p.is_active and p.is_visible
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(item order by ord) from enriched),'[]'::jsonb),
  'totalCount',(select count(*) from scoped),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',cat.id,'name',cat.name) order by cat.name) from public.catalog_categories cat where cat.id in(select category_id from facets)),'[]'::jsonb),
  'brands',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name) from public.catalog_brands b where b.id in(select brand_id from facets)),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.list_partner_special_offer_feed_v1(uuid,text,text,text,uuid,uuid,text,integer,integer) from public,anon,service_role;
grant execute on function public.list_partner_special_offer_feed_v1(uuid,text,text,text,uuid,uuid,text,integer,integer) to authenticated;
commit;
