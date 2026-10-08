begin;
-- Additive nullable fields: old PROMO definitions and immutable historical snapshots are untouched.
alter table public.commercial_campaign_items
 add column bundle_special_unit_price numeric(18,2),
 add column bundle_special_currency text,
 add constraint campaign_special_line_shape check ((bundle_special_unit_price is null and bundle_special_currency is null)
   or (bundle_special_unit_price is not null and bundle_special_currency is not null
    and bundle_special_unit_price > 0 and bundle_special_currency in ('USD','MDL') and (required_bundle_quantity is null or required_bundle_quantity > 0)));
-- Extend existing mechanic constraints, without changing their other commercial-source guards.
do $$ declare c record; begin
 for c in select n.nspname,t.relname,k.conname,pg_get_constraintdef(k.oid) definition
  from pg_constraint k join pg_class t on t.oid=k.conrelid join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname in ('commercial_campaigns','cart_items','commercial_campaign_engagement_events','commercial_campaign_order_attributions')
   and k.contype='c' and pg_get_constraintdef(k.oid) like '%spend_threshold_promo%'
 loop
  execute format('alter table %I.%I drop constraint %I',c.nspname,c.relname,c.conname);
  execute format('alter table %I.%I add constraint %I %s',c.nspname,c.relname,c.conname,
   replace(c.definition,'''spend_threshold_promo''::text','''spend_threshold_promo''::text, ''bundle_special_price''::text'));
 end loop;
end $$;

alter function public.apply_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb,uuid) rename to apply_campaign_draft_pre_bundle_special_v2a;
revoke all on function public.apply_campaign_draft_pre_bundle_special_v2a(uuid,integer,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
create function public.apply_commercial_campaign_draft_v2(p_campaign_id uuid,p_expected_revision integer,p_request_id uuid,p_input jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare r jsonb; adapted jsonb; lines jsonb;
begin
 if p_input->>'mechanicType' is distinct from 'bundle_special_price' then
  if exists(select 1 from jsonb_array_elements(p_input->'items') i where nullif(i->>'bundleSpecialUnitPrice','') is not null or nullif(i->>'bundleSpecialCurrency','') is not null) then
   raise exception 'CAMPAIGN_MECHANIC_INVALID' using errcode='22023'; end if;
  r:=public.apply_campaign_draft_pre_bundle_special_v2a(p_campaign_id,p_expected_revision,p_request_id,p_input,p_actor);
  if not coalesce((r->>'idempotent')::boolean,false) then
   update public.commercial_campaign_items set bundle_special_unit_price=null,bundle_special_currency=null where campaign_id=p_campaign_id;
  end if;
  return r;
 end if;
 if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 50
  or exists(select 1 from jsonb_array_elements(p_input->'items') i where
   coalesce(i->>'requiredBundleQuantity','') !~ '^[0-9]{1,4}$' or (i->>'requiredBundleQuantity')::integer not between 1 and 9999
   or jsonb_typeof(i->'bundleSpecialUnitPrice') is distinct from 'string'
   or coalesce(i->>'bundleSpecialUnitPrice','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
   or (i->>'bundleSpecialUnitPrice')::numeric <= 0 or coalesce(i->>'bundleSpecialCurrency','') not in ('USD','MDL')
   or i->>'benefitType' is distinct from 'informational_only' or nullif(i->>'governedBenefitReference','') is not null)
  or (select count(distinct i->>'bundleSpecialCurrency') from jsonb_array_elements(p_input->'items') i) <> 1 then
  raise exception 'CAMPAIGN_BUNDLE_SPECIAL_INVALID' using errcode='22023'; end if;
 select jsonb_agg((i - 'bundleSpecialUnitPrice' - 'bundleSpecialCurrency') || jsonb_build_object('requiredBundleQuantity',null)) into lines from jsonb_array_elements(p_input->'items') i;
 adapted := jsonb_set(jsonb_set(p_input,'{mechanicType}','"legacy_promo"'),'{items}',lines);
 -- Existing authorized/idempotent lifecycle owns products, audience, dates, revision and identity validation.
 r := public.apply_campaign_draft_pre_bundle_special_v2a(p_campaign_id,p_expected_revision,p_request_id,adapted,p_actor);
 if coalesce((r->>'idempotent')::boolean,false) then return r; end if;
 update public.commercial_campaigns set mechanic_type='bundle_special_price' where id=p_campaign_id;
 update public.commercial_campaign_items t set required_bundle_quantity=(i->>'requiredBundleQuantity')::integer,
  bundle_special_unit_price=(i->>'bundleSpecialUnitPrice')::numeric,bundle_special_currency=i->>'bundleSpecialCurrency'
 from jsonb_array_elements(p_input->'items') i where t.campaign_id=p_campaign_id and t.product_id=(i->>'productId')::uuid;
 return r;
end $$;
revoke all on function public.apply_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb,uuid) from public,anon,authenticated,service_role;

alter function public.publish_commercial_campaign(uuid,uuid) rename to publish_campaign_pre_bundle_special_v2a;
revoke all on function public.publish_campaign_pre_bundle_special_v2a(uuid,uuid) from public,anon,authenticated,service_role;
create function public.publish_commercial_campaign(p_campaign_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare c public.commercial_campaigns;
begin
 if auth.uid() is null or not public.has_internal_permission('campaigns.publish') then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('quantity_promo_publication',0));
 select * into c from public.commercial_campaigns where id=p_campaign_id for update;
 if c.mechanic_type='bundle_special_price' and c.status='draft' and (
  not exists(select 1 from public.commercial_campaign_items where campaign_id=c.id)
  or exists(select 1 from public.commercial_campaign_items i left join public.catalog_products p on p.id=i.product_id where i.campaign_id=c.id
   and (i.bundle_special_unit_price is null or i.bundle_special_unit_price<=0 or i.bundle_special_currency not in ('USD','MDL')
    or i.required_bundle_quantity is null or i.required_bundle_quantity<=0 or not coalesce(p.is_active and p.is_visible,false)
    or p.external_1c_id is null or i.benefit_type<>'informational_only' or i.governed_benefit_reference is not null))
  or (select count(distinct bundle_special_currency) from public.commercial_campaign_items where campaign_id=c.id)<>1) then
  raise exception 'CAMPAIGN_BUNDLE_SPECIAL_INVALID' using errcode='23514'; end if;
 return public.publish_campaign_pre_bundle_special_v2a(p_campaign_id,p_request_id);
end $$;
revoke all on function public.publish_commercial_campaign(uuid,uuid) from public,anon,service_role;
grant execute on function public.publish_commercial_campaign(uuid,uuid) to authenticated;

-- New mechanic, same immutable publication, audience and basket identity. One set-based projection.
create function private.resolve_bundle_special_price_v2a(p_company_id uuid,p_campaign_id uuid,p_cart_id uuid default null,p_include_prices boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare c public.commercial_campaigns; basket public.carts; components jsonb; ready boolean; complete boolean; stock_ready boolean;
begin
 if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into c from public.commercial_campaigns where id=p_campaign_id;
 select * into basket from public.carts where company_id=p_company_id and created_by=auth.uid() and status in ('active','submitting')
  and (p_cart_id is null or id=p_cart_id) order by (status='active') desc,created_at desc limit 1;
 if p_cart_id is not null and basket.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
 ready := c.mechanic_type='bundle_special_price' and c.status in ('active','scheduled') and c.starts_at<=now() and c.ends_at>now()
  and (select count(*) from public.commercial_campaign_items where campaign_id=c.id)=(select jsonb_array_length(item_snapshot) from public.commercial_campaign_versions where campaign_id=c.id and version_number=c.current_version)
  and exists(select 1 from public.commercial_campaign_audience_snapshots a where a.campaign_id=c.id and a.version_number=c.current_version and a.company_id=p_company_id and a.included);
 with lines as (
  select i.*,p.sku,p.name,p.is_active and p.is_visible and p.external_1c_id is not null identity_ready,
   coalesce(used.used_quantity,0) used_quantity,coalesce(q.quantity,0)::integer current_qty,case when s.is_published and s.freshness_state='authoritative' then s.available_quantity end stock,
   exists(select 1 from public.commercial_campaign_versions v,lateral jsonb_array_elements(v.item_snapshot) published
    where v.campaign_id=c.id and v.version_number=c.current_version and v.campaign_snapshot->>'mechanic_type'='bundle_special_price'
     and published=to_jsonb(i)) published_ready
  from public.commercial_campaign_items i join public.catalog_products p on p.id=i.product_id
  left join public.product_stock_totals s on s.product_id=i.product_id
  left join (select campaign_item_id,sum(quantity) used_quantity from public.commercial_campaign_order_attributions where company_id=p_company_id and campaign_id=c.id group by campaign_item_id) used on used.campaign_item_id=i.id
  left join (select campaign_item_id,sum(quantity) quantity from public.cart_items where cart_id=basket.id and commercial_source='CAMPAIGN'
   and campaign_id=c.id and campaign_publication_version=c.current_version group by campaign_item_id) q on q.campaign_item_id=i.id
  where i.campaign_id=c.id
 ), evaluated as (
  select *, greatest(required_bundle_quantity-current_qty,0) missing,
   identity_ready and published_ready and bundle_special_unit_price>0 and required_bundle_quantity>0
    and (maximum_quantity_per_company is null or greatest(current_qty,required_bundle_quantity)+used_quantity<=maximum_quantity_per_company) line_ready
  from lines
 ) select coalesce(jsonb_agg(jsonb_build_object('campaignId',c.id,'campaignItemId',id,'productId',product_id,'publicationVersion',c.current_version,
  'mechanicType',c.mechanic_type,'sku',sku,'name',name,'requiredBundleQuantity',required_bundle_quantity,'currentQuantity',current_qty,'missingQuantity',missing,'availableQuantity',stock)
  || case when p_include_prices then jsonb_build_object('promoPrice',jsonb_build_object('amount',bundle_special_unit_price,'currency',bundle_special_currency,'priceId',id)) else '{}'::jsonb end order by sort_order,id),'[]'::jsonb),
  ready and count(*)>0 and coalesce(bool_and(line_ready),false),coalesce(bool_and(missing=0),false),coalesce(bool_and(stock is null or stock>=greatest(current_qty,required_bundle_quantity)),true)
 into components,ready,complete,stock_ready from evaluated;
 return jsonb_build_object('campaignId',c.id,'publicationVersion',c.current_version,'mechanicType',c.mechanic_type,'eligible',coalesce(ready and complete,false),
  'conditionsReady',coalesce(ready,false),'stockReady',stock_ready,'reason',case when not coalesce(ready,false) then 'invalid_publication' when not complete then 'incomplete_bundle' else 'eligible' end,'components',components);
end $$;
revoke all on function private.resolve_bundle_special_price_v2a(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.resolve_campaign_bundle_v1(p_company_id uuid, p_campaign_id uuid, p_cart_id uuid DEFAULT NULL::uuid, p_include_prices boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  v_campaign public.commercial_campaigns; v_cart public.carts; v_item record;
  v_result jsonb; v_components jsonb := '[]'::jsonb; v_qty integer; v_missing integer;
  v_conditions_ready boolean := true; v_complete boolean := true; v_stock_ready boolean := true;
  v_reason text := 'eligible'; v_definition jsonb; v_published jsonb;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if (select mechanic_type from public.commercial_campaigns where id=p_campaign_id)='bundle_special_price' then return private.resolve_bundle_special_price_v2a(p_company_id,p_campaign_id,p_cart_id,p_include_prices); end if;
  select * into v_cart from public.carts where company_id = p_company_id and created_by = auth.uid()
    and status in ('active','submitting') and (p_cart_id is null or id = p_cart_id)
    order by (status = 'active') desc, created_at desc limit 1;
  if p_cart_id is not null and v_cart.id is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into v_campaign from public.commercial_campaigns where id = p_campaign_id;
  select jsonb_agg(jsonb_build_object('id',id,'product_id',product_id,
    'required_bundle_quantity',required_bundle_quantity,'minimum_quantity',minimum_quantity,
    'maximum_quantity_per_company',maximum_quantity_per_company,'benefit_type',benefit_type,
    'governed_benefit_reference',governed_benefit_reference) order by product_id)
  into v_definition from public.commercial_campaign_items where campaign_id = p_campaign_id;
  select jsonb_agg(jsonb_build_object('id',value->'id','product_id',value->'product_id',
    'required_bundle_quantity',value->'required_bundle_quantity','minimum_quantity',value->'minimum_quantity',
    'maximum_quantity_per_company',value->'maximum_quantity_per_company','benefit_type',value->'benefit_type',
    'governed_benefit_reference',value->'governed_benefit_reference') order by value->>'product_id')
  into v_published from public.commercial_campaign_versions version,
    lateral jsonb_array_elements(version.item_snapshot) where version.campaign_id = p_campaign_id
    and version.version_number = v_campaign.current_version
    and version.campaign_snapshot->>'mechanic_type' = 'fixed_bundle_promo';
  if v_campaign.mechanic_type is distinct from 'fixed_bundle_promo'
    or coalesce(jsonb_array_length(v_definition),0) < 2 or v_definition is distinct from v_published then
    v_conditions_ready := false; v_reason := 'invalid_publication'; end if;
  for v_item in select i.*, p.sku, p.name, case when stock.is_published and stock.freshness_state = 'authoritative'
    then stock.available_quantity end as available_quantity
    from public.commercial_campaign_items i join public.catalog_products p on p.id = i.product_id
    left join public.product_stock_totals stock on stock.product_id = i.product_id
    where i.campaign_id = p_campaign_id order by i.sort_order, i.id loop
    select coalesce(sum(quantity),0)::integer into v_qty from public.cart_items
      where cart_id = v_cart.id and product_id = v_item.product_id and commercial_source='CAMPAIGN'
        and campaign_id=p_campaign_id and campaign_publication_version=v_campaign.current_version and campaign_item_id=v_item.id;
    v_missing := greatest(coalesce(v_item.required_bundle_quantity,1) - v_qty, 0);
    v_result := private.resolve_campaign_component_conditions_v1(p_company_id,v_item.id,
      greatest(v_qty,coalesce(v_item.required_bundle_quantity,1)));
    if not coalesce((v_result->>'eligible')::boolean,false) then
      v_conditions_ready := false; v_reason := v_result->>'reason'; end if;
    if v_missing > 0 then v_complete := false; end if;
    if v_item.available_quantity is not null and v_item.available_quantity < greatest(v_qty,v_item.required_bundle_quantity) then
      v_stock_ready := false; end if;
    v_components := v_components || jsonb_build_array((case when p_include_prices then v_result else v_result - 'promoPrice' - 'promoProfile' end) || jsonb_build_object(
      'sku',v_item.sku,'name',v_item.name,'currentQuantity',v_qty,'missingQuantity',v_missing,
      'availableQuantity',v_item.available_quantity));
  end loop;
  if v_conditions_ready and not v_complete then v_reason := 'incomplete_bundle'; end if;
  return jsonb_build_object('campaignId',p_campaign_id,'publicationVersion',v_campaign.current_version,
    'eligible',v_conditions_ready and v_complete,'conditionsReady',v_conditions_ready,
    'stockReady',v_stock_ready,'reason',v_reason,'components',v_components);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_commercial_campaign_bundle_v1(p_company_id uuid, p_campaign_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare v_cart public.carts; v_campaign public.commercial_campaigns; v_bundle jsonb;
  v_component jsonb; v_event public.commercial_campaign_engagement_events; v_request uuid; v_fingerprint text;
  v_delta integer; v_total integer := 0;
begin
  if auth.uid() is null or p_request_id is null or not public.has_permission(p_company_id,'cart.manage')
    or not public.has_permission(p_company_id,'campaigns.view') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('effective-cart-pricing:' || p_company_id::text,0));
  select * into v_cart from public.carts where company_id = p_company_id and created_by = auth.uid() and status = 'active' for update;
  if v_cart.id is null then insert into public.carts(company_id,created_by) values(p_company_id,auth.uid()) returning * into v_cart; end if;
  select * into v_campaign from public.commercial_campaigns where id = p_campaign_id for share;
  perform 1 from public.commercial_campaign_items where campaign_id = p_campaign_id order by id for share;
  perform 1 from public.product_prices price join public.price_types profile on profile.id = price.price_type_id
    where price.product_id in (select product_id from public.commercial_campaign_items where campaign_id = p_campaign_id)
      and profile.external_ref = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4' order by price.id for share of price,profile;
  v_bundle := private.resolve_campaign_bundle_v1(p_company_id,p_campaign_id,v_cart.id);
  select * into v_event from public.commercial_campaign_engagement_events where request_id = p_request_id;
  if v_event.id is not null then
    if v_event.company_id <> p_company_id or v_event.user_id <> auth.uid() or v_event.campaign_id <> p_campaign_id
      or v_event.event_type <> 'bundle_added_to_cart' then raise exception 'Forbidden' using errcode = '42501'; end if;
    if v_event.publication_version <> v_campaign.current_version then raise exception 'ORDER_PRICE_CHANGED' using errcode = 'PT409'; end if;
    return v_bundle || jsonb_build_object('idempotent',true,'addedQuantity',0);
  end if;
  if not coalesce((v_bundle->>'conditionsReady')::boolean,false) then
    raise exception 'CAMPAIGN_BUNDLE_UNAVAILABLE' using errcode = '23514',detail = v_bundle->>'reason'; end if;
  if v_campaign.mechanic_type='bundle_special_price' then
    insert into public.cart_items(cart_id,product_id,quantity,campaign_id,campaign_item_id,campaign_attribution_fingerprint,commercial_source,campaign_publication_version,campaign_mechanic_type)
    select v_cart.id,(line->>'productId')::uuid,(line->>'requiredBundleQuantity')::integer,p_campaign_id,(line->>'campaignItemId')::uuid,
      encode(extensions.digest(p_campaign_id::text||':'||v_campaign.current_version::text||':'||(line->>'campaignItemId')||':'||p_company_id::text,'sha256'),'hex'),
      'CAMPAIGN',v_campaign.current_version,'bundle_special_price'
    from jsonb_array_elements(v_bundle->'components') line where (line->>'missingQuantity')::integer>0
    on conflict(cart_id,product_id,commercial_context_key) do update set quantity=greatest(cart_items.quantity,excluded.quantity);
    v_bundle := private.resolve_campaign_bundle_v1(p_company_id,p_campaign_id,v_cart.id);
    insert into public.commercial_campaign_engagement_events(request_id,campaign_id,company_id,user_id,event_type,publication_version,mechanic_type,mechanic_eligible)
      values(p_request_id,p_campaign_id,p_company_id,auth.uid(),'bundle_added_to_cart',v_campaign.current_version,'bundle_special_price',true);
    return v_bundle;
  end if;
  if not coalesce((v_bundle->>'stockReady')::boolean,false) then
    raise exception 'CAMPAIGN_BUNDLE_STOCK_INSUFFICIENT' using errcode = '23514'; end if;
  for v_component in select value from jsonb_array_elements(v_bundle->'components') order by value->>'productId' loop
    v_delta := (v_component->>'missingQuantity')::integer;
    if v_delta > 0 then
      v_request := md5(p_request_id::text || ':' || (v_component->>'campaignItemId'))::uuid;
      -- Apply the validated final quantity. Legacy single-product add validates the delta
      -- against its minimum and cannot safely complete a partial bundle (e.g. 3 -> 4).
      v_fingerprint := encode(extensions.digest(p_campaign_id::text || ':' || v_campaign.current_version::text
        || ':' || (v_component->>'campaignItemId') || ':' || p_company_id::text,'sha256'),'hex');
      insert into public.cart_items(cart_id,product_id,quantity,campaign_id,campaign_item_id,campaign_attribution_fingerprint,commercial_source,campaign_publication_version,campaign_mechanic_type)
        values(v_cart.id,(v_component->>'productId')::uuid,(v_component->>'requiredBundleQuantity')::integer,
          p_campaign_id,(v_component->>'campaignItemId')::uuid,v_fingerprint,'CAMPAIGN',v_campaign.current_version,v_campaign.mechanic_type)
        on conflict(cart_id,product_id,commercial_context_key) do update set quantity=greatest(cart_items.quantity,excluded.quantity),
          campaign_id=excluded.campaign_id,campaign_item_id=excluded.campaign_item_id,
          campaign_attribution_fingerprint=excluded.campaign_attribution_fingerprint;
      insert into public.commercial_campaign_engagement_events(request_id,campaign_id,campaign_item_id,company_id,user_id,
        event_type,quantity,product_id,publication_version,mechanic_type,mechanic_eligible)
        values(v_request,p_campaign_id,(v_component->>'campaignItemId')::uuid,p_company_id,auth.uid(),'added_to_cart',
          v_delta,(v_component->>'productId')::uuid,v_campaign.current_version,'fixed_bundle_promo',true);
      v_total := v_total + v_delta;
    end if;
  end loop;
  v_bundle := private.resolve_campaign_bundle_v1(p_company_id,p_campaign_id,v_cart.id);
  if not (v_bundle->>'eligible')::boolean then raise exception 'CAMPAIGN_BUNDLE_UNAVAILABLE' using errcode = '23514'; end if;
  insert into public.commercial_campaign_engagement_events(request_id,campaign_id,company_id,user_id,event_type,
    publication_version,mechanic_type,mechanic_eligible,quantity)
    values(p_request_id,p_campaign_id,p_company_id,auth.uid(),'bundle_added_to_cart',v_campaign.current_version,
      'fixed_bundle_promo',true,nullif(v_total,0));
  return v_bundle || jsonb_build_object('idempotent',false,'addedQuantity',v_total);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_partner_cart_prices_internal_v1(p_cart_id uuid, p_price_type_ref text DEFAULT NULL::text, p_review boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  v_cart public.carts;
  v_company public.partner_companies;
  v_item public.cart_items;
  v_price public.product_prices;
  v_ref text;
  v_candidate record;
  v_eligibility jsonb;
  v_selected jsonb;
  v_evidence jsonb;
  v_review_evidence jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_eligible_count integer;
  v_candidates jsonb := '[]'::jsonb;
  v_bundles jsonb := '{}'::jsonb;
  v_bundle jsonb;
  v_bundle_id uuid;
  v_base_prices jsonb;
  v_base_scope uuid[];
  v_spend_base_prices jsonb;
begin
  select * into v_cart from public.carts where id = p_cart_id and created_by = auth.uid();
  if auth.uid() is null or v_cart.id is null or v_cart.status not in ('active', 'submitting')
    or not public.can_manage_partner_order_company(v_cart.company_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  -- Consistent ordering with campaign-add: company lease before cart/item locks.
  perform pg_advisory_xact_lock(hashtextextended('effective-cart-pricing:' || v_cart.company_id::text, 0));
  select * into v_cart from public.carts where id = p_cart_id and created_by = auth.uid() for update;
  if v_cart.status not in ('active', 'submitting') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select * into v_company from public.partner_companies where id = v_cart.company_id and status = 'active';
  v_ref := coalesce(p_price_type_ref, v_company.external_1c_price_type_id);
  -- Alternative cash price profiles must be governed mappings, never arbitrary RPC input.
  if v_ref is distinct from v_company.external_1c_price_type_id and not exists (
    select 1 from public.partner_company_cash_contract_mappings m
    where m.company_id = v_company.id and m.active and m.contract_role = 'cash'
      and public.qualify_partner_cash_contract_candidate(v_company.id, m.contract_external_1c_id)->>'priceTypeRef' = v_ref
  ) then
    raise exception 'Forbidden price profile' using errcode = '42501';
  end if;

  -- Load only explicitly entered campaign contexts, once per cart. STANDARD never discovers campaigns.
  if exists(select 1 from public.cart_items where cart_id=v_cart.id and commercial_source='CAMPAIGN')
    and public.has_permission(v_cart.company_id,'campaigns.view') then
    select coalesce(jsonb_agg(to_jsonb(candidate)), '[]'::jsonb) into v_candidates from (
      select i.id,c.id as campaign_id,i.product_id,c.mechanic_type
      from public.commercial_campaign_items i join public.commercial_campaigns c on c.id = i.campaign_id
      where exists (select 1 from public.cart_items ci where ci.cart_id=v_cart.id and ci.commercial_source='CAMPAIGN'
        and ci.campaign_id=c.id and ci.campaign_item_id=i.id and ci.product_id=i.product_id
        and ci.campaign_publication_version=c.current_version and ci.campaign_mechanic_type=c.mechanic_type)
        and c.status in ('active','scheduled') and c.starts_at <= now() and c.ends_at > now()
        and exists (select 1 from public.commercial_campaign_audience_snapshots a where a.campaign_id = c.id
          and a.version_number = c.current_version and a.company_id = v_cart.company_id and a.included)
      order by c.id,i.id for share of c,i
    ) candidate;
    select array_agg(distinct product_id) into v_base_scope from (
      select product_id from public.cart_items where cart_id=v_cart.id
      union all select role.product_id from public.commercial_campaign_spend_roles role
        where role.role='QUALIFYING_SPEND' and role.campaign_id in (
          select (value->>'campaign_id')::uuid from jsonb_array_elements(v_candidates) where value->>'mechanic_type'='spend_threshold_promo')
    ) scope;
    -- Pin current base-price rows before the batch selection and numeric spend comparison.
    perform 1 from public.product_prices price where price.product_id=any(v_base_scope)
      and price.external_1c_price_type_id=v_ref and (price.company_id is null or price.company_id=v_cart.company_id)
      order by price.id for share;
    v_base_prices := private.partner_base_price_context_v1(v_cart.company_id,v_base_scope,v_ref);
    v_spend_base_prices := v_base_prices;
    -- Progress and spend use the company's base Partner profile, independent of checkout/FX presentation.
    -- An authorized alternate cash contract still owns normal transaction prices as before.
    if v_ref is distinct from v_company.external_1c_price_type_id and exists (
      select 1 from jsonb_array_elements(v_candidates) where value->>'mechanic_type'='spend_threshold_promo') then
      perform 1 from public.product_prices price where price.product_id=any(v_base_scope)
        and price.external_1c_price_type_id=v_company.external_1c_price_type_id
        and (price.company_id is null or price.company_id=v_cart.company_id) order by price.id for share;
      v_spend_base_prices := private.partner_base_price_context_v1(v_cart.company_id,v_base_scope,v_company.external_1c_price_type_id);
    end if;
    for v_bundle_id in select distinct (value->>'campaign_id')::uuid from jsonb_array_elements(v_candidates)
      where value->>'mechanic_type' in ('fixed_bundle_promo','bundle_special_price','conditional_attach_promo','spend_threshold_promo') loop
      perform 1 from public.commercial_campaign_items where campaign_id = v_bundle_id order by id for share;
      -- Pin every component price, including components absent from the basket.
      perform 1 from public.product_prices price join public.price_types profile on profile.id = price.price_type_id
        where price.product_id in (select product_id from public.commercial_campaign_items where campaign_id = v_bundle_id)
          and profile.external_ref = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4' order by price.id for share of price,profile;
      if (select mechanic_type from public.commercial_campaigns where id=v_bundle_id) = 'conditional_attach_promo' then
        v_bundle := private.resolve_campaign_attach_v1(v_cart.company_id,v_bundle_id,v_cart.id,true);
      elsif (select mechanic_type from public.commercial_campaigns where id=v_bundle_id) = 'spend_threshold_promo' then
        v_bundle := private.resolve_campaign_spend_v1(v_cart.company_id,v_bundle_id,v_cart.id,true,v_spend_base_prices);
      else v_bundle := private.resolve_campaign_bundle_v1(v_cart.company_id,v_bundle_id,v_cart.id,true); end if;
      v_bundles := v_bundles || jsonb_build_object(v_bundle_id::text,v_bundle);
    end loop;
  end if;

  if v_base_prices is null then
    select array_agg(distinct product_id) into v_base_scope from public.cart_items where cart_id=v_cart.id;
    perform 1 from public.product_prices price where price.product_id=any(v_base_scope)
      and price.external_1c_price_type_id=v_ref and (price.company_id is null or price.company_id=v_cart.company_id) order by price.id for share;
    v_base_prices := private.partner_base_price_context_v1(v_cart.company_id,v_base_scope,v_ref);
  end if;

  for v_item in select * from public.cart_items where cart_id = v_cart.id order by product_id,commercial_context_key loop
    v_selected := null;
    v_eligibility := null;
    v_bundle := null;
    v_eligible_count := 0;
    if public.has_permission(v_cart.company_id, 'campaigns.view') then
      -- Product index bounds discovery. Wave 1A owns all benefit eligibility rules.
      for v_candidate in
        select (value->>'id')::uuid as id,(value->>'campaign_id')::uuid as campaign_id,
          value->>'mechanic_type' as mechanic_type from jsonb_array_elements(v_candidates)
        where v_item.commercial_source='CAMPAIGN' and value->>'id'=v_item.campaign_item_id::text
          and value->>'campaign_id'=v_item.campaign_id::text and value->>'product_id'=v_item.product_id::text
      loop
        perform pg_advisory_xact_lock(hashtextextended(v_candidate.id::text || ':' || v_cart.company_id::text, 0));
        if v_candidate.mechanic_type in ('conditional_attach_promo','spend_threshold_promo') then
          v_bundle := v_bundles->v_candidate.campaign_id::text;
          if v_bundle->'reward'->>'campaignItemId' is distinct from v_candidate.id::text then
            v_eligibility := jsonb_build_object('reason',case when v_candidate.mechanic_type='conditional_attach_promo' then 'trigger_normal_price' else 'qualifying_normal_price' end);
            continue; end if;
          v_eligibility := v_bundle->'reward' || jsonb_build_object('eligible',v_bundle->'eligible','reason',v_bundle->'reason');
          if v_candidate.mechanic_type='spend_threshold_promo' then
            v_eligibility := v_eligibility || jsonb_build_object('spendConfig',private.campaign_spend_config_v1(v_candidate.campaign_id),
              'qualifyingSpendUsd',v_bundle->'qualifyingSpendUsd','qualifyingSources',v_bundle->'qualifyingSources');
          end if;
        elsif v_candidate.mechanic_type in ('fixed_bundle_promo','bundle_special_price') then
          v_bundle := v_bundles->v_candidate.campaign_id::text;
          select value || jsonb_build_object('eligible',v_bundle->'eligible','reason',v_bundle->'reason')
            into v_eligibility from jsonb_array_elements(v_bundle->'components')
            where value->>'campaignItemId' = v_candidate.id::text;
        else
          v_eligibility := private.resolve_campaign_component_conditions_v1(v_cart.company_id,v_candidate.id,v_item.quantity);
        end if;
        if coalesce((v_eligibility->>'eligible')::boolean, false) then
          v_eligible_count := v_eligible_count + 1;
          v_selected := v_eligibility;
        end if;
      end loop;
    end if;
    if v_eligible_count > 1 then
      raise exception 'ORDER_PRICE_CHANGED' using errcode = 'PT409', detail = 'campaign_scope_collision';
    end if;

    if v_selected is not null then
      if v_selected->>'mechanicType'='bundle_special_price' then
        -- Composite source-price view, NOT an INSERT/UPDATE of any ERP/catalog price.
        v_price := jsonb_populate_record(null::public.product_prices,
          coalesce(v_base_prices->v_item.product_id::text,'{}'::jsonb) || jsonb_build_object(
           'id',v_selected->'promoPrice'->>'priceId','product_id',v_item.product_id,'price_amount',v_selected->'promoPrice'->'amount',
           'currency',v_selected->'promoPrice'->>'currency','currency_status','resolved','is_active',true,'is_published',true,
           'external_1c_price_type_id',v_ref));
        v_evidence := jsonb_build_object('priceSource','CAMPAIGN_SPECIAL_PRICE','priceTypeRef',v_ref,'priceId',v_price.id,
         'sourceAmount',v_price.price_amount,'sourceCurrency',v_price.currency,'campaignId',v_selected->>'campaignId',
         'campaignItemId',v_selected->>'campaignItemId','publicationVersion',(v_selected->>'publicationVersion')::integer,
         'mechanicType','bundle_special_price','requiredBundleQuantity',(v_selected->>'requiredBundleQuantity')::integer);
      else
      select price.* into v_price from public.product_prices price
      join public.price_types profile on profile.id = price.price_type_id
      where price.id = (v_selected->'promoPrice'->>'priceId')::uuid
        and price.external_1c_price_type_id = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        and profile.external_ref = price.external_1c_price_type_id and profile.is_active
        and profile.name = 'PROMO' and profile.external_code = 'UU-000021' and upper(profile.currency_code) = 'USD'
        and price.currency_status = 'resolved' and upper(price.currency) = 'USD'
        and price.is_active and price.is_published and price.price_amount = (v_selected->'promoPrice'->>'amount')::numeric
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
      for share of price, profile;
      if v_price.id is null then
        raise exception 'ORDER_PRICE_CHANGED' using errcode = 'PT409', detail = 'governed_promo_changed';
      end if;
      v_evidence := jsonb_build_object(
        'priceSource', 'CAMPAIGN_PROMO', 'priceTypeRef', v_selected->'promoProfile'->>'externalRef',
        'priceId', v_price.id, 'sourceAmount', v_price.price_amount, 'sourceCurrency', 'USD',
        'campaignId', v_selected->>'campaignId', 'campaignItemId', v_selected->>'campaignItemId',
        'publicationVersion', (v_selected->>'publicationVersion')::integer,
        'mechanicType', v_selected->>'mechanicType', 'thresholdQuantity', (v_selected->>'thresholdQuantity')::integer,
        'requiredBundleQuantity', (v_selected->>'requiredBundleQuantity')::integer
      );
      if v_selected->>'mechanicType' = 'conditional_attach_promo' then
        v_evidence := v_evidence || jsonb_build_object('attachRole','REWARD'); end if;
      if v_selected->>'mechanicType' = 'spend_threshold_promo' then
        v_evidence := v_evidence || jsonb_build_object('spendRole','REWARD','spendConfig',v_selected->'spendConfig',
          'qualifyingSpendUsd',v_selected->'qualifyingSpendUsd','qualifyingSources',v_selected->'qualifyingSources'); end if;
      end if;
    else
      if v_base_prices is not null then
        select * into v_price from jsonb_populate_record(null::public.product_prices,v_base_prices->v_item.product_id::text);
      else
        -- Preserve the normal path for actors with no campaign visibility.
        select price.* into v_price from public.product_prices price
        where price.product_id=v_item.product_id and price.external_1c_price_type_id=v_ref
          and price.is_active and price.is_published and price.currency_status='resolved'
          and upper(price.currency) in ('USD','MDL') and price.price_amount > 0
          and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
          and (price.company_id is null or price.company_id=v_cart.company_id)
        order by coalesce(price.company_id=v_cart.company_id,false) desc,price.valid_from desc,price.updated_at desc,price.id
        limit 1 for share;
      end if;
      v_evidence := case when v_price.id is null then null else jsonb_build_object(
        'priceSource', 'PARTNER', 'priceTypeRef', v_ref, 'priceId', v_price.id,
        'sourceAmount', v_price.price_amount, 'sourceCurrency', upper(v_price.currency)
      ) end;
    end if;
    if v_evidence is not null then
      v_evidence := v_evidence || jsonb_build_object('commercialSource',v_item.commercial_source);
      if v_item.commercial_source='CAMPAIGN' then
        v_evidence := v_evidence || jsonb_build_object('campaignId',v_item.campaign_id,'campaignItemId',v_item.campaign_item_id,
          'publicationVersion',v_item.campaign_publication_version,'mechanicType',v_item.campaign_mechanic_type);
      end if;
    end if;
    select evidence into v_review_evidence from private.partner_cart_price_reviews where cart_item_id = v_item.id;
    if not p_review and v_review_evidence->>'priceSource' in ('CAMPAIGN_PROMO','CAMPAIGN_SPECIAL_PRICE')
      and v_review_evidence is distinct from v_evidence then
      raise exception 'ORDER_PRICE_CHANGED' using errcode = 'PT409', detail = 'campaign_conditions_changed_review_cart';
    end if;
    if p_review and v_cart.status = 'active' and v_review_evidence is distinct from v_evidence then
      insert into private.partner_cart_price_reviews(cart_item_id, evidence) values(v_item.id, v_evidence)
      on conflict (cart_item_id) do update set evidence = excluded.evidence
      where partner_cart_price_reviews.evidence is distinct from excluded.evidence;
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'cartItemId',v_item.id,'commercialSource',v_item.commercial_source,
      'campaignContext',case when v_item.commercial_source='CAMPAIGN' then jsonb_build_object(
        'campaignId',v_item.campaign_id,'campaignItemId',v_item.campaign_item_id,'publicationVersion',v_item.campaign_publication_version,
        'mechanicType',v_item.campaign_mechanic_type,'eligible',v_selected is not null,
        'reason',coalesce(v_eligibility->>'reason','invalid_campaign_context'),
        'thresholdQuantity',v_eligibility->'thresholdQuantity','requestedQuantity',v_item.quantity,
        'progress',case when v_bundle is null then null else v_bundle - 'reward' - 'qualifyingSources' end) else null end,
      'productId', v_item.product_id, 'quantity', v_item.quantity, 'price',
      case when v_price.id is null then null else to_jsonb(v_price) end, 'evidence', v_evidence
    ));
  end loop;
  return jsonb_build_object('items', v_rows, 'intentVersion', v_cart.intent_version);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_cart_price_acknowledgement_on_quantity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare changed public.cart_items;
begin
  changed := case when tg_op='DELETE' then old else new end;
  if tg_op<>'UPDATE' or new.quantity is distinct from old.quantity then
    delete from private.partner_cart_price_reviews r using public.cart_items i
      where r.cart_item_id=i.id and i.cart_id=changed.cart_id and (i.id=changed.id or (
        changed.commercial_source='CAMPAIGN' and changed.campaign_mechanic_type in
          ('fixed_bundle_promo','bundle_special_price','conditional_attach_promo','spend_threshold_promo')
        and i.commercial_source='CAMPAIGN' and i.campaign_id=changed.campaign_id
        and i.campaign_publication_version=changed.campaign_publication_version));
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.attribute_commercial_campaign_order_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
begin
  if new.effective_price_evidence->>'priceSource' in ('CAMPAIGN_PROMO','CAMPAIGN_SPECIAL_PRICE') then
    insert into public.commercial_campaign_order_attributions(
      campaign_id, campaign_item_id, product_id, company_id, order_id, order_item_id, quantity,
      attribution_fingerprint, publication_version, mechanic_type, mechanic_threshold_quantity
    ) select (new.effective_price_evidence->>'campaignId')::uuid,
      (new.effective_price_evidence->>'campaignItemId')::uuid, new.product_id, orders.company_id,
      new.order_id, new.id, new.quantity,
      encode(extensions.digest(new.effective_price_evidence::text, 'sha256'), 'hex'),
      (new.effective_price_evidence->>'publicationVersion')::integer,
      new.effective_price_evidence->>'mechanicType',
      (new.effective_price_evidence->>'thresholdQuantity')::integer
    from public.partner_orders orders where orders.id = new.order_id
    on conflict do nothing;
  end if;
  return new;
end;
$function$
;

create function private.project_bundle_special_v2a(p_company_id uuid,p_campaign jsonb)
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare products jsonb;
begin
 if p_campaign is null then return null; end if;
 if p_campaign->>'mechanicType'='bundle_special_price' then
  select jsonb_agg(product || jsonb_build_object('requiredBundleQuantity',i.required_bundle_quantity,
    'specialPrice',case when public.has_permission(p_company_id,'pricing.partner_price.view') then jsonb_build_object('amount',i.bundle_special_unit_price,'currency',i.bundle_special_currency) else null end) order by ord)
   into products from jsonb_array_elements(p_campaign->'products') with ordinality source(product,ord)
   join public.commercial_campaign_items i on i.id=(product->>'itemId')::uuid and i.campaign_id=(p_campaign->>'id')::uuid;
  p_campaign := p_campaign || jsonb_build_object('products',coalesce(products,'[]'::jsonb),
    'bundleProgress',private.resolve_bundle_special_price_v2a(p_company_id,(p_campaign->>'id')::uuid));
 end if;
 return p_campaign;
end $$;
revoke all on function private.project_bundle_special_v2a(uuid,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_partner_commercial_campaign(p_company_id uuid, p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare v_result jsonb;
begin
  v_result := public.get_partner_campaign_pre_spend_wave2a(p_company_id,p_campaign_id);
  if v_result is null then return null; end if;
  return private.project_bundle_special_v2a(p_company_id,private.project_campaign_spend_v1(p_company_id,v_result)) || jsonb_build_object('publicationVersion',
    (select current_version from public.commercial_campaigns where id=p_campaign_id));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_partner_commercial_campaigns(p_company_id uuid, p_filter text DEFAULT 'active'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare v_result jsonb; v_items jsonb;
begin
  v_result := public.list_partner_campaigns_pre_spend_wave2a(p_company_id,p_filter,p_limit,p_offset);
  select coalesce(jsonb_agg(private.project_bundle_special_v2a(p_company_id,private.project_campaign_spend_v1(p_company_id,value)) order by ordinality),'[]'::jsonb)
    into v_items from jsonb_array_elements(v_result->'items') with ordinality;
  return jsonb_set(v_result,'{items}',v_items);
end;
$function$
;

-- Authorized Admin preview: server-selected normal company profile; no supplied prices/profile trusted.
create function public.get_campaign_preview_context_v2a(p_company_id uuid,p_product_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare company public.partner_companies; bases jsonb; pr numeric; rr numeric; products jsonb;
begin
 if auth.uid() is null or not (public.has_internal_permission('campaigns.create') or public.has_internal_permission('campaigns.edit')) then raise exception 'Forbidden' using errcode='42501'; end if;
 if cardinality(p_product_ids) not between 1 and 50 then raise exception 'Invalid preview scope' using errcode='22023'; end if;
 select * into company from public.partner_companies where id=p_company_id and status='active';
 if company.id is null then raise exception 'Invalid preview company' using errcode='22023'; end if;
 bases := private.partner_base_price_context_v1(company.id,p_product_ids,company.external_1c_price_type_id);
 select rate into pr from public.commercial_exchange_rates where purpose='partner_price_usd_to_mdl' and is_active and is_published order by effective_at desc limit 1;
 select rate into rr from public.commercial_exchange_rates where purpose='retail_price_usd_to_mdl' and is_active and is_published order by effective_at desc limit 1;
 with retail as (
  select distinct on (product_id) product_id,price_amount,currency from public.product_prices
   where product_id=any(p_product_ids) and external_1c_price_type_id='e181c772-93fc-11e9-94cb-000c2988d323'
    and is_active and is_published and currency_status='resolved' and upper(currency)='MDL' and price_amount>0
    and valid_from<=now() and (valid_to is null or valid_to>=now()) and (company_id is null or company_id=company.id)
   order by product_id,coalesce(company_id=company.id,false) desc,valid_from desc,updated_at desc,id
 ) select jsonb_agg(jsonb_build_object('productId',p.id,'partnerPrice',case when bases->p.id::text is null then null else
  jsonb_build_object('amount',bases->p.id::text->'price_amount','currency',bases->p.id::text->>'currency') end,
  'retailPrice',case when r.product_id is null then null else jsonb_build_object('amount',r.price_amount,'currency',r.currency) end)) into products
 from public.catalog_products p left join retail r on r.product_id=p.id where p.id=any(p_product_ids) and p.is_active and p.is_visible and p.external_1c_id is not null;
 return jsonb_build_object('products',coalesce(products,'[]'::jsonb),'partnerRate',pr,'retailRate',rr);
end $$;
revoke all on function public.get_campaign_preview_context_v2a(uuid,uuid[]) from public,anon,service_role;
grant execute on function public.get_campaign_preview_context_v2a(uuid,uuid[]) to authenticated;
-- Reuse the existing duplicate lifecycle and preserve private campaign price definition.
alter function public.duplicate_commercial_campaign_v1(uuid,uuid) rename to duplicate_campaign_pre_bundle_special_v2a;
revoke all on function public.duplicate_campaign_pre_bundle_special_v2a(uuid,uuid) from public,anon,authenticated,service_role;
create function public.duplicate_commercial_campaign_v1(p_campaign_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare target uuid; source uuid;
begin
 if auth.uid() is null or not public.has_internal_permission('campaigns.create') then raise exception 'Forbidden' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('bundle_special_duplicate:'||auth.uid()::text||':'||p_request_id::text,0));
 select id,duplicated_from_campaign_id into target,source from public.commercial_campaigns where created_by=auth.uid() and creation_request_id=p_request_id;
 if found then
  if source is distinct from p_campaign_id then raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode='22023'; end if;
  return target;
 end if;
 target:=public.duplicate_campaign_pre_bundle_special_v2a(p_campaign_id,p_request_id);
 update public.commercial_campaign_items t set bundle_special_unit_price=s.bundle_special_unit_price,bundle_special_currency=s.bundle_special_currency
 from public.commercial_campaign_items s where t.campaign_id=target and s.campaign_id=p_campaign_id and t.product_id=s.product_id;
 return target;
end $$;
revoke all on function public.duplicate_commercial_campaign_v1(uuid,uuid) from public,anon,service_role;
grant execute on function public.duplicate_commercial_campaign_v1(uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.campaign_scope_conflicts_v1(p_campaign_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1 from public.commercial_campaigns c
    join public.commercial_campaign_items i on i.campaign_id = c.id
    join public.commercial_campaign_items other_i on other_i.product_id = i.product_id and other_i.campaign_id <> c.id
    join public.commercial_campaigns other_c on other_c.id = other_i.campaign_id
    join public.commercial_campaign_audience_snapshots a on a.campaign_id = c.id and a.version_number = c.current_version and a.included
    join public.commercial_campaign_audience_snapshots other_a on other_a.campaign_id = other_c.id
      and other_a.version_number = other_c.current_version and other_a.included and other_a.company_id = a.company_id
    where c.id = p_campaign_id
      and (c.mechanic_type in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo','bundle_special_price') or other_c.mechanic_type in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo','bundle_special_price')
        or (c.mechanic_type = 'quantity_threshold_promo' and other_c.mechanic_type = 'quantity_threshold_promo')) and other_c.status in ('active', 'scheduled')
      and c.starts_at < other_c.ends_at and other_c.starts_at < c.ends_at
  );
$function$

;
commit;
