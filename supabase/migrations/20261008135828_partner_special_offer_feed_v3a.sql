begin;
-- Offer identity is selected and paginated before commercial enrichment.
create function public.list_partner_special_offer_feed_v1(
 p_company_id uuid,p_filter text default 'active',p_mechanic text default 'all',p_search text default '',
 p_category_id uuid default null,p_brand_id uuid default null,p_sort text default 'recommended',p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare result jsonb; can_partner boolean; can_retail boolean;
begin
 if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_limit not between 1 and 50 or p_offset not between 0 and 100000 or length(p_search)>100
 or p_filter not in ('active','ending','stock','arrivals','purchased')
 or p_mechanic not in ('all','promo','quantity','bundle','conditional','spend')
 or p_sort not in ('recommended','ending') then raise exception 'Invalid feed scope' using errcode='22023'; end if;
 can_partner:=public.has_permission(p_company_id,'pricing.partner_price.view');
 can_retail:=public.has_permission(p_company_id,'pricing.retail_price.view');
 with authorized as materialized (
  select c.* from public.commercial_campaigns c
  join public.commercial_campaign_audience_snapshots a on a.campaign_id=c.id and a.version_number=c.current_version and a.company_id=p_company_id and a.included
  join public.commercial_campaign_versions v on v.campaign_id=c.id and v.version_number=c.current_version
  where c.status in ('active','scheduled') and c.starts_at<=now() and c.ends_at>now()
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
 ), page as materialized (
  select *,row_number() over(order by case when p_sort='recommended' then priority end,ends_at,campaign_id,item_order,item_id) ord from scoped
  order by case when p_sort='recommended' then priority end,ends_at,campaign_id,item_order,item_id limit p_limit offset p_offset
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
  select x.ord,jsonb_build_object('offerId',concat(x.campaign_id,':',x.current_version,':',coalesce(x.item_id::text,x.kind)), 'kind',x.kind,
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
