begin;
set local statement_timeout='30s';
do $$ begin if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004' or current_setting('application_name')<>'campaign-intent-disposable' then raise exception 'Disposable target assertion missing'; end if; end $$;
create temporary table perf_definitions(model text,definition text);
insert into perf_definitions values ('before',$before$CREATE OR REPLACE FUNCTION public.resolve_partner_cart_prices_internal_v1(p_cart_id uuid, p_price_type_ref text DEFAULT NULL::text, p_review boolean DEFAULT false)
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
  v_candidates jsonb;
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

  -- Discover all candidate campaigns once per cart, not once per line. Locks pin scope/publication.
  if public.has_permission(v_cart.company_id,'campaigns.view') then
    select coalesce(jsonb_agg(to_jsonb(candidate)), '[]'::jsonb) into v_candidates from (
      select i.id,c.id as campaign_id,i.product_id,c.mechanic_type
      from public.commercial_campaign_items i join public.commercial_campaigns c on c.id = i.campaign_id
      where i.product_id in (select product_id from public.cart_items where cart_id = v_cart.id)
        and c.status in ('active','scheduled') and c.starts_at <= now() and c.ends_at > now()
        and exists (select 1 from public.commercial_campaign_audience_snapshots a where a.campaign_id = c.id
          and a.version_number = c.current_version and a.company_id = v_cart.company_id and a.included)
      order by c.id,i.id for share of c,i
    ) candidate;
    if exists (select 1 from jsonb_array_elements(v_candidates) a,jsonb_array_elements(v_candidates) z
      where a->>'product_id' = z->>'product_id' and a->>'campaign_id' <> z->>'campaign_id'
        and (a->>'mechanic_type' in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo') or z->>'mechanic_type' in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo'))) then
      raise exception 'ORDER_PRICE_CHANGED' using errcode = 'PT409', detail = 'campaign_scope_collision'; end if;
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
      where value->>'mechanic_type' in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo') loop
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

  for v_item in select * from public.cart_items where cart_id = v_cart.id order by product_id loop
    v_selected := null;
    v_eligible_count := 0;
    if public.has_permission(v_cart.company_id, 'campaigns.view') then
      -- Product index bounds discovery. Wave 1A owns all benefit eligibility rules.
      for v_candidate in
        select (value->>'id')::uuid as id,(value->>'campaign_id')::uuid as campaign_id,
          value->>'mechanic_type' as mechanic_type from jsonb_array_elements(v_candidates)
        where value->>'product_id' = v_item.product_id::text and value->>'mechanic_type' <> 'legacy_promo'
      loop
        perform pg_advisory_xact_lock(hashtextextended(v_candidate.id::text || ':' || v_cart.company_id::text, 0));
        if v_candidate.mechanic_type in ('conditional_attach_promo','spend_threshold_promo') then
          v_bundle := v_bundles->v_candidate.campaign_id::text;
          if v_bundle->'reward'->>'campaignItemId' is distinct from v_candidate.id::text then continue; end if;
          v_eligibility := v_bundle->'reward' || jsonb_build_object('eligible',v_bundle->'eligible','reason',v_bundle->'reason');
          if v_candidate.mechanic_type='spend_threshold_promo' then
            v_eligibility := v_eligibility || jsonb_build_object('spendConfig',private.campaign_spend_config_v1(v_candidate.campaign_id),
              'qualifyingSpendUsd',v_bundle->'qualifyingSpendUsd','qualifyingSources',v_bundle->'qualifyingSources');
          end if;
        elsif v_candidate.mechanic_type = 'fixed_bundle_promo' then
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
    select evidence into v_review_evidence from private.partner_cart_price_reviews where cart_item_id = v_item.id;
    if not p_review and v_review_evidence->>'priceSource' = 'CAMPAIGN_PROMO'
      and v_review_evidence is distinct from v_evidence then
      raise exception 'ORDER_PRICE_CHANGED' using errcode = 'PT409', detail = 'campaign_conditions_changed_review_cart';
    end if;
    if p_review and v_cart.status = 'active' and v_review_evidence is distinct from v_evidence then
      insert into private.partner_cart_price_reviews(cart_item_id, evidence) values(v_item.id, v_evidence)
      on conflict (cart_item_id) do update set evidence = excluded.evidence
      where partner_cart_price_reviews.evidence is distinct from excluded.evidence;
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'productId', v_item.product_id, 'quantity', v_item.quantity, 'price',
      case when v_price.id is null then null else to_jsonb(v_price) end, 'evidence', v_evidence
    ));
  end loop;
  return jsonb_build_object('items', v_rows, 'intentVersion', v_cart.intent_version);
end;
$function$
$before$),('after',$after$CREATE OR REPLACE FUNCTION public.resolve_partner_cart_prices_internal_v1(p_cart_id uuid, p_price_type_ref text DEFAULT NULL::text, p_review boolean DEFAULT false)
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
      where value->>'mechanic_type' in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo') loop
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
        elsif v_candidate.mechanic_type = 'fixed_bundle_promo' then
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
    if not p_review and v_review_evidence->>'priceSource' = 'CAMPAIGN_PROMO'
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
$function$$after$);
do $$
declare
 admin uuid := 'aa500000-0000-4000-8000-000000000001';
 partner uuid := 'aa500000-0000-4000-8000-000000000002';
 company uuid := 'ba500000-0000-4000-8000-000000000001';
 cart uuid := 'ea510000-0000-4000-8000-000000000001';
 campaign uuid := 'fa530000-0000-4000-8000-000000000001';
 product uuid; base uuid; promo uuid; draft jsonb; draft_items jsonb := '[]';
 started timestamptz; result jsonb; mode text; row_count integer; v_model text; promo_count integer;
begin
 select id into base from public.price_types where external_ref='23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c';
 select id into promo from public.price_types where external_ref='b9f5d585-dab1-11e9-8a58-000c29cf9dd4';
 for n in 1..50 loop
  product := ('ca530000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  insert into public.catalog_products(id,external_1c_id,sku,name,slug) values(product,product::text,'INTENT-PERF-'||n,'Intent benchmark product '||n,'intent-perf-'||n);
  insert into public.product_prices(product_id,external_1c_price_type_id,currency,price_amount,valid_from,is_active,price_type_id,effective_at,currency_status,is_published)
   values(product,'23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c','USD',75,now()-interval '1 day',true,base,now()-interval '1 day','resolved',true),
   (product,'b9f5d585-dab1-11e9-8a58-000c29cf9dd4','USD',68,now()-interval '1 day',true,promo,now()-interval '1 day','resolved',true);
  insert into public.product_stock_totals(product_id,physical_quantity,available_quantity,synced_at,last_seen_sync_id,freshness_state,is_published)
   values(product,500,500,now(),'fa530000-0000-4000-8000-000000000099','authoritative',true);
  draft_items:=draft_items||jsonb_build_array(jsonb_build_object('productId',product,'sortOrder',n,'minimumQuantity',1,
   'maximumQuantityPerCompany',null,'benefitType','existing_price_profile','governedBenefitReference','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','promoThresholdQuantity',4));
 end loop;
 perform set_config('request.jwt.claim.sub',admin::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated')::text,true);
 insert into public.commercial_campaigns(id,code,name,partner_title,partner_description,campaign_type,starts_at,ends_at,terms_summary,created_by)
  values(campaign,'INTENT_PERF','Intent performance','Intent benchmark','Deterministic performance fixture only','product_offer',now()-interval '1 day',now()+interval '1 day','No commercial rules change',admin);
 draft := jsonb_build_object('contractVersion','3','code','INTENT_PERF','name','Intent performance','partnerTitle','Intent benchmark',
  'partnerDescription','Deterministic performance fixture only','campaignType','product_offer','startsAt',now()-interval '1 day',
  'endsAt',now()+interval '1 day','priority',100,'termsSummary','No commercial rules change','mechanicType','quantity_threshold_promo',
  'audienceMode','explicit_company','companyIds',jsonb_build_array(company),'items',draft_items);
 perform public.update_commercial_campaign_draft_v2(campaign,0,'fb530000-0000-4000-8000-000000000001',draft);
 perform public.publish_commercial_campaign(campaign,'fc530000-0000-4000-8000-000000000001');
 perform set_config('request.jwt.claim.sub',partner::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
 foreach row_count in array array[20,50] loop
  foreach mode in array array['STANDARD','CAMPAIGN','MIXED'] loop
   delete from public.cart_items where cart_id=cart;
   insert into public.cart_items(cart_id,product_id,quantity,commercial_source,campaign_id,campaign_item_id,campaign_publication_version,campaign_mechanic_type,campaign_attribution_fingerprint)
    select cart,i.product_id,5,case when mode='STANDARD' or (mode='MIXED' and i.sort_order%2=0) then 'STANDARD' else 'CAMPAIGN' end,
     case when mode<>'STANDARD' and (mode<>'MIXED' or i.sort_order%2=1) then campaign end,
     case when mode<>'STANDARD' and (mode<>'MIXED' or i.sort_order%2=1) then i.id end,
     case when mode<>'STANDARD' and (mode<>'MIXED' or i.sort_order%2=1) then 1 end,
     case when mode<>'STANDARD' and (mode<>'MIXED' or i.sort_order%2=1) then 'quantity_threshold_promo' end,
     case when mode<>'STANDARD' and (mode<>'MIXED' or i.sort_order%2=1) then repeat('b',64) end
    from public.commercial_campaign_items i where i.campaign_id=campaign and i.sort_order<=row_count;
   foreach v_model in array array['before','after'] loop
    execute (select definition from perf_definitions where perf_definitions.model=v_model);
    -- Warm the same dataset once before measuring 10 calls.
    result:=public.resolve_partner_cart_prices_v1(cart,null,true);
    started:=clock_timestamp();
    for attempt in 1..10 loop result:=public.resolve_partner_cart_prices_v1(cart,null,true); end loop;
    promo_count := (select count(*) from jsonb_array_elements(result->'items') x where x->'evidence'->>'priceSource'='CAMPAIGN_PROMO');
    if v_model='after' and promo_count<>(case mode when 'STANDARD' then 0 when 'CAMPAIGN' then row_count else row_count/2 end) then
     raise exception 'Intent benchmark semantics mismatch'; end if;
    raise notice 'INTENT_PERF model=% context=% lines=% average_ms=% promo_lines=%',v_model,mode,row_count,
     extract(epoch from clock_timestamp()-started)*1000/10,promo_count;
   end loop;
  end loop;
 end loop;
end $$;
rollback;
