begin;
set local lock_timeout = '5s';

-- Private cart acknowledgement avoids exposing hidden source prices through cart SELECT/RPCs.
create table private.partner_cart_price_reviews (
  cart_item_id uuid primary key references public.cart_items(id) on delete cascade,
  evidence jsonb check (evidence is null or jsonb_typeof(evidence) = 'object')
);
alter table private.partner_cart_price_reviews enable row level security;
revoke all on private.partner_cart_price_reviews from public, anon, authenticated;
alter table public.partner_order_items add column effective_price_evidence jsonb;
alter table public.partner_order_items add constraint order_effective_price_evidence_object
  check (effective_price_evidence is null or jsonb_typeof(effective_price_evidence) = 'object');

create index commercial_campaign_items_product_campaign_idx
  on public.commercial_campaign_items(product_id, campaign_id);

create function public.clear_cart_price_acknowledgement_on_quantity()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  if new.quantity is distinct from old.quantity then
    delete from private.partner_cart_price_reviews where cart_item_id = new.id;
  end if;
  return new;
end;
$$;
create trigger clear_cart_price_acknowledgement_on_quantity
  before update of quantity on public.cart_items
  for each row execute function public.clear_cart_price_acknowledgement_on_quantity();
revoke all on function public.clear_cart_price_acknowledgement_on_quantity() from public, anon, authenticated;

comment on table private.partner_cart_price_reviews is
  'Last server-resolved source price shown on cart review. Explicit quantity change clears it; campaign lifecycle changes preserve it for checkout conflict detection.';
comment on column public.partner_order_items.effective_price_evidence is
  'Immutable server-resolved source-price provenance at submission, including synchronized price row and campaign publication. Settlement and FX evidence remain in existing columns.';

-- One batch resolver for cart review, checkout preflight and mutation validation.
-- No client amounts, company IDs, campaign IDs or eligibility flags are inputs.
create function public.resolve_partner_cart_prices_internal_v1(
  p_cart_id uuid,
  p_price_type_ref text default null,
  p_review boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' set row_security = off as $$
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

  for v_item in select * from public.cart_items where cart_id = v_cart.id order by product_id loop
    v_selected := null;
    v_eligible_count := 0;
    if public.has_permission(v_cart.company_id, 'campaigns.view') then
      -- Product index bounds discovery. Wave 1A owns all benefit eligibility rules.
      for v_candidate in
        select i.id, c.id as campaign_id from public.commercial_campaign_items i
        join public.commercial_campaigns c on c.id = i.campaign_id
        where i.product_id = v_item.product_id and c.mechanic_type = 'quantity_threshold_promo'
          and c.status in ('active', 'scheduled')
          and c.starts_at <= now() and c.ends_at > now()
          and exists (select 1 from public.commercial_campaign_audience_snapshots a
            where a.campaign_id = c.id and a.version_number = c.current_version
              and a.company_id = v_cart.company_id and a.included)
        order by c.id, i.id for share of c, i
      loop
        perform pg_advisory_xact_lock(hashtextextended(v_candidate.id::text || ':' || v_cart.company_id::text, 0));
        v_eligibility := public.resolve_commercial_campaign_item_eligibility_v1(v_cart.company_id, v_candidate.id, v_item.quantity);
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
        'mechanicType', v_selected->>'mechanicType', 'thresholdQuantity', (v_selected->>'thresholdQuantity')::integer
      );
    else
      select price.* into v_price from public.product_prices price
      where price.product_id = v_item.product_id and price.external_1c_price_type_id = v_ref
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(price.currency) in ('USD', 'MDL') and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = v_cart.company_id)
      order by coalesce(price.company_id = v_cart.company_id, false) desc,
        price.valid_from desc, price.updated_at desc, price.id
      limit 1 for share;
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
$$;
revoke all on function public.resolve_partner_cart_prices_internal_v1(uuid, text, boolean) from public, anon, authenticated;

create function public.resolve_partner_cart_prices_v1(p_cart_id uuid, p_price_type_ref text default null, p_review boolean default false)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  if not exists (select 1 from public.carts c where c.id = p_cart_id and c.created_by = auth.uid()
    and public.has_permission(c.company_id, 'pricing.partner_price.view')) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return public.resolve_partner_cart_prices_internal_v1(p_cart_id, p_price_type_ref, p_review);
end;
$$;
revoke all on function public.resolve_partner_cart_prices_v1(uuid, text, boolean) from public, anon;
grant execute on function public.resolve_partner_cart_prices_v1(uuid, text, boolean) to authenticated;

-- Server-only adapter preserves hidden-price employee checkout without exposing source prices through RPC.
create function public.resolve_partner_cart_prices_for_order_v1(p_actor uuid, p_cart_id uuid, p_price_type_ref text)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_result jsonb;
begin
  if p_actor is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  v_result := public.resolve_partner_cart_prices_internal_v1(p_cart_id, p_price_type_ref, false);
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_previous_claims, '{}'), true);
  return v_result;
end;
$$;
revoke all on function public.resolve_partner_cart_prices_for_order_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_partner_cart_prices_for_order_v1(uuid, uuid, text) to service_role;

alter function public.add_commercial_campaign_item_to_cart(uuid, uuid, integer, uuid)
  rename to add_campaign_cart_pre_pricing_wave1b;
revoke all on function public.add_campaign_cart_pre_pricing_wave1b(uuid, uuid, integer, uuid)
  from public, anon, authenticated;
create function public.add_commercial_campaign_item_to_cart(p_company_id uuid, p_campaign_item_id uuid, p_quantity integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  if auth.uid() is null or not public.has_permission(p_company_id, 'cart.manage') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('effective-cart-pricing:' || p_company_id::text, 0));
  return public.add_campaign_cart_pre_pricing_wave1b(p_company_id, p_campaign_item_id, p_quantity, p_request_id);
end;
$$;
revoke all on function public.add_commercial_campaign_item_to_cart(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.add_commercial_campaign_item_to_cart(uuid, uuid, integer, uuid) to authenticated;

-- Historical legacy_promo remains presentation/attribution only. No retroactive numeric benefit.
alter function public.publish_commercial_campaign(uuid, uuid) rename to publish_commercial_campaign_pre_governed_pricing_wave1b;
revoke all on function public.publish_commercial_campaign_pre_governed_pricing_wave1b(uuid, uuid) from public, anon, authenticated;
create function public.publish_commercial_campaign(p_campaign_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.publish') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  -- Serialize publication; reject ambiguous overlapping product/audience/time scopes.
  perform pg_advisory_xact_lock(hashtextextended('quantity_promo_publication', 0));
  v_result := public.publish_commercial_campaign_pre_governed_pricing_wave1b(p_campaign_id, p_request_id);
  if exists (
    select 1 from public.commercial_campaigns c
    join public.commercial_campaign_items i on i.campaign_id = c.id
    join public.commercial_campaign_items other_i on other_i.product_id = i.product_id and other_i.campaign_id <> c.id
    join public.commercial_campaigns other_c on other_c.id = other_i.campaign_id
    join public.commercial_campaign_audience_snapshots a on a.campaign_id = c.id and a.version_number = c.current_version and a.included
    join public.commercial_campaign_audience_snapshots other_a on other_a.campaign_id = other_c.id
      and other_a.version_number = other_c.current_version and other_a.included and other_a.company_id = a.company_id
    where c.id = p_campaign_id and c.mechanic_type = 'quantity_threshold_promo'
      and other_c.mechanic_type = 'quantity_threshold_promo' and other_c.status in ('active', 'scheduled')
      and c.starts_at < other_c.ends_at and other_c.starts_at < c.ends_at
  ) then
    raise exception 'CAMPAIGN_COMMERCIAL_SCOPE_CONFLICT' using errcode = '23514';
  end if;
  return v_result;
end;
$$;
revoke all on function public.publish_commercial_campaign(uuid, uuid) from public, anon;
grant execute on function public.publish_commercial_campaign(uuid, uuid) to authenticated;

create or replace function public.resolve_commercial_campaign_item_eligibility_v1(
  p_company_id uuid,
  p_campaign_item_id uuid,
  p_quantity integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_item public.commercial_campaign_items;
  v_campaign public.commercial_campaigns;
  v_price numeric;
  v_price_id uuid;
  v_reason text;
  v_eligible boolean := false;
begin
  if auth.uid() is null or not public.has_permission(p_company_id, 'campaigns.view') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity not between 1 and 9999 then
    raise exception 'CAMPAIGN_QUANTITY_INVALID' using errcode = '22023';
  end if;
  select * into v_item from public.commercial_campaign_items where id = p_campaign_item_id;
  if v_item.id is null then
    v_reason := 'product_not_in_scope';
  else
    select * into v_campaign from public.commercial_campaigns where id = v_item.campaign_id;
    if v_campaign.status not in ('active', 'scheduled') then
      v_reason := 'inactive_campaign';
    elsif v_campaign.starts_at > now() or v_campaign.ends_at <= now() then
      v_reason := 'outside_period';
    elsif not exists (
      select 1 from public.commercial_campaign_audience_snapshots audience
      where audience.campaign_id = v_campaign.id
        and audience.version_number = v_campaign.current_version
        and audience.company_id = p_company_id
        and audience.included
    ) then
      v_reason := 'outside_audience';
    elsif v_campaign.mechanic_type = 'legacy_promo' then
      v_reason := 'legacy_campaign';
    elsif not exists (
      select 1 from public.commercial_campaign_versions version,
        lateral jsonb_array_elements(version.item_snapshot) published_item
      where version.campaign_id = v_campaign.id and version.version_number = v_campaign.current_version
        and version.campaign_snapshot->>'mechanic_type' = 'quantity_threshold_promo'
        and published_item->>'id' = v_item.id::text
        and published_item->>'product_id' = v_item.product_id::text
        and (published_item->>'promo_threshold_quantity')::integer = v_item.promo_threshold_quantity
        and published_item->>'governed_benefit_reference' = v_item.governed_benefit_reference
        and v_item.governed_benefit_reference = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        and v_item.benefit_type = 'existing_price_profile'
    ) then
      v_reason := 'invalid_publication';
    elsif v_item.promo_threshold_quantity is null then
      v_reason := 'invalid_threshold';
    else
      select price.price_amount, price.id into v_price, v_price_id
      from public.price_types profile
      join public.product_prices price
        on price.price_type_id = profile.id and price.product_id = v_item.product_id
      where profile.is_active
        and profile.external_ref = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        and profile.external_code = 'UU-000021'
        and profile.name = 'PROMO'
        and upper(coalesce(nullif(btrim(profile.currency_code), ''), '')) = 'USD'
        and price.external_1c_price_type_id = profile.external_ref
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(coalesce(nullif(btrim(price.currency), ''), '')) = 'USD'
        and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by coalesce(price.company_id = p_company_id, false) desc, price.valid_from desc, price.updated_at desc, price.id
      limit 1;
      if v_price is null then
        v_reason := 'missing_promo';
      elsif p_quantity < v_item.minimum_quantity then
        v_reason := 'below_minimum';
      elsif v_item.maximum_quantity_per_company is not null and p_quantity + (
        select coalesce(sum(a.quantity), 0) from public.commercial_campaign_order_attributions a
        where a.campaign_item_id = v_item.id and a.company_id = p_company_id
      ) > v_item.maximum_quantity_per_company then
        v_reason := 'company_limit';
      elsif p_quantity < v_item.promo_threshold_quantity then
        v_reason := 'below_threshold';
      else
        v_reason := 'eligible';
        v_eligible := true;
      end if;
    end if;
  end if;
  return jsonb_build_object(
    'eligible', v_eligible,
    'reason', v_reason,
    'mechanicType', coalesce(v_campaign.mechanic_type, 'legacy_promo'),
    'thresholdQuantity', v_item.promo_threshold_quantity,
    'requestedQuantity', p_quantity,
    'campaignId', v_campaign.id,
    'campaignItemId', v_item.id,
    'productId', v_item.product_id,
    'publicationVersion', v_campaign.current_version,
    'promoPrice', case when v_price is null then null else jsonb_build_object('amount', v_price, 'currency', 'USD', 'priceId', v_price_id) end,
    'promoProfile', jsonb_build_object(
      'name', 'PROMO',
      'externalCode', 'UU-000021',
      'externalRef', 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4',
      'currency', 'USD'
    )
  );
end;
$$;


-- Preserve v5 contract, FX, quantity and payload checks; validate effective source truth.
create or replace function public.validate_partner_order_submission_v5(
  target_cart_id uuid,
  target_expected_intent_version bigint,
  target_delivery_date date,
  target_payment_method text,
  target_payment_date date,
  target_fulfillment_method text,
  target_carrier_id uuid,
  target_request_fingerprint text,
  target_payload jsonb,
  target_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_cart public.carts%rowtype;
  target_company public.partner_companies%rowtype;
  target_carrier public.one_c_delivery_carriers%rowtype;
  qualification jsonb;
  resolved_contract_ref text;
  resolved_price_type_ref text;
  resolved_document_currency_ref text;
  resolved_document_currency_code text;
  resolved_source_currency_code text;
  selected_pricing_mode text;
  expected_rate_purpose text;
  resolved_counterparty_ref text;
  effective_prices jsonb;
  business_date date := (now() at time zone 'Europe/Chisinau')::date;
begin
  select * into target_cart from public.carts where id = target_cart_id and created_by = auth.uid();
  if target_cart.id is null or not public.can_manage_partner_order_company(target_cart.company_id) then
    raise exception 'Cart is not available for submission.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('effective-cart-pricing:' || target_cart.company_id::text, 0));
  select * into target_cart
  from public.carts
  where id = target_cart_id and created_by = auth.uid()
  for update;

  if target_cart.id is null or target_cart.status <> 'active'
    or not public.can_manage_partner_order_company(target_cart.company_id) then
    raise exception 'Cart is not available for submission.' using errcode = '42501';
  end if;

  if target_expected_intent_version is null
    or target_cart.intent_version <> target_expected_intent_version then
    return jsonb_build_object('valid', false, 'code', 'ORDER_CART_VERSION_CONFLICT',
      'stage', 'cart_intent_validation');
  end if;

  if target_delivery_date is null or target_delivery_date < business_date then
    return jsonb_build_object('valid', false, 'code', 'ORDER_INVALID_SHIPMENT_DATE',
      'stage', 'delivery_date_validation');
  end if;

  if target_payment_method is null
    or target_payment_method not in ('cashless', 'cash')
    or target_payment_date is null or target_payment_date < business_date then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYMENT_CONFIGURATION_INVALID',
      'stage', 'payment_validation');
  end if;

  if target_fulfillment_method is null
    or target_fulfillment_method not in ('pickup', 'delivery')
    or (target_fulfillment_method = 'pickup' and target_carrier_id is not null)
    or (target_fulfillment_method = 'delivery' and target_carrier_id is null) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_FULFILLMENT_CONFIGURATION_INVALID',
      'stage', 'fulfillment_validation');
  end if;

  selected_pricing_mode := coalesce(target_payload->>'pricingMode', 'rate_999_default');
  expected_rate_purpose := case selected_pricing_mode
    when 'rate_113_online' then 'partner_price_usd_to_mdl'
    when 'rate_999_default' then 'retail_price_usd_to_mdl'
    else null end;
  if expected_rate_purpose is null
    or (selected_pricing_mode = 'rate_113_online' and
      (target_payload->>'paymentIntent' is distinct from 'pay_now' or target_payment_method <> 'cashless'))
    or (selected_pricing_mode = 'rate_999_default' and target_payload->>'paymentIntent' is distinct from 'pay_later') then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED', 'stage', 'pricing_mode_validation');
  end if;

  if char_length(coalesce(target_request_fingerprint, '')) <> 64
    or coalesce(jsonb_typeof(target_payload), 'null') <> 'object'
    or coalesce(jsonb_typeof(target_items), 'null') <> 'array'
    or coalesce(jsonb_typeof(target_payload->'items'), 'null') <> 'array'
    or jsonb_array_length(target_items) = 0 then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'payload_validation');
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
    group by item.product_id
    having count(*) > 1
  ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'line_identity_validation');
  end if;

  if exists (
    (select item.product_id, item.quantity
       from public.cart_items item where item.cart_id = target_cart.id
     except
     select submitted.product_id, submitted.quantity
       from jsonb_to_recordset(target_items) submitted(product_id uuid, quantity integer))
    union all
    (select submitted.product_id, submitted.quantity
       from jsonb_to_recordset(target_items) submitted(product_id uuid, quantity integer)
     except
     select item.product_id, item.quantity
       from public.cart_items item where item.cart_id = target_cart.id)
  ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_CART_VERSION_CONFLICT',
      'stage', 'cart_line_validation');
  end if;

  select * into target_company
  from public.partner_companies
  where id = target_cart.company_id and status = 'active';

  if target_company.id is null then
    return jsonb_build_object('valid', false, 'code', 'ORDER_COMPANY_MAPPING_MISSING',
      'stage', 'company_mapping_validation');
  end if;

  resolved_counterparty_ref := lower(btrim(coalesce(target_company.external_1c_id, '')));
  if target_payment_method = 'cashless' then
    resolved_contract_ref := lower(btrim(coalesce(target_company.external_1c_contract_id, '')));
    qualification := public.qualify_partner_contract_candidate(target_company.id, resolved_contract_ref);
  else
    select lower(btrim(mapping.contract_external_1c_id))
    into resolved_contract_ref
    from public.partner_company_cash_contract_mappings mapping
    where mapping.company_id = target_company.id
      and mapping.active
      and mapping.contract_role = 'cash';
    qualification := public.qualify_partner_cash_contract_candidate(target_company.id, resolved_contract_ref);
  end if;

  if not coalesce((qualification->>'qualified')::boolean, false) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_CONTRACT_INVALID',
      'stage', 'contract_mapping_validation', 'diagnosticCode', qualification->>'code');
  end if;

  resolved_price_type_ref := lower(btrim(coalesce(qualification->>'priceTypeRef', '')));
  resolved_document_currency_ref := lower(btrim(coalesce(qualification->>'settlementCurrencyRef', '')));
  resolved_document_currency_code := upper(btrim(coalesce(qualification->>'settlementCurrencyCode', '')));
  resolved_source_currency_code := upper(btrim(coalesce(qualification->>'publishedPriceCurrencyCode', '')));

  if resolved_counterparty_ref = ''
    or coalesce(resolved_contract_ref, '') = ''
    or resolved_price_type_ref = ''
    or resolved_document_currency_ref = ''
    or resolved_document_currency_code <> 'MDL'
    or resolved_source_currency_code not in ('USD', 'MDL')
    or (target_payment_method = 'cashless' and resolved_price_type_ref <>
      lower(btrim(coalesce(target_company.external_1c_price_type_id, '')))) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_CONTRACT_INVALID',
      'stage', 'contract_mapping_validation');
  end if;

  if lower(btrim(coalesce(target_payload->'partnerCompanyReference'->>'externalId', ''))) <> resolved_counterparty_ref
    or lower(btrim(coalesce(target_payload->'priceTypeReference'->>'externalId', ''))) <> resolved_price_type_ref
    or lower(btrim(coalesce(target_payload->'contractReference'->>'externalId', ''))) <> resolved_contract_ref
    or lower(btrim(coalesce(target_payload->'currencyReference'->>'externalId', ''))) <> resolved_document_currency_ref
    or upper(btrim(coalesce(target_payload->>'currency', ''))) <> 'MDL'
    or target_payload->>'paymentMethod' is distinct from target_payment_method
    or target_payload->>'pricingMode' is distinct from selected_pricing_mode
    or target_payload->>'plannedPaymentDate' is distinct from target_payment_date::text
    or target_payload->>'fulfillmentMethod' is distinct from target_fulfillment_method then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'commercial_payload_validation');
  end if;

  effective_prices := public.resolve_partner_cart_prices_internal_v1(target_cart.id, resolved_price_type_ref, false);
  if exists (
    select 1 from jsonb_array_elements(effective_prices->'items') effective
    left join jsonb_to_recordset(target_items) submitted(product_id uuid, source_unit_price numeric, source_currency_code text, effective_price_evidence jsonb)
      on submitted.product_id = (effective->>'productId')::uuid
    where effective->'price' = 'null'::jsonb
      or submitted.source_unit_price is distinct from (effective->'evidence'->>'sourceAmount')::numeric
      or submitted.source_currency_code is distinct from effective->'evidence'->>'sourceCurrency'
      or (effective->'evidence'->>'priceSource' = 'PARTNER'
        and submitted.source_currency_code is distinct from resolved_source_currency_code)
      or (submitted.effective_price_evidence is not null and submitted.effective_price_evidence is distinct from effective->'evidence')
  ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PRICE_CHANGED', 'stage', 'effective_source_price_validation');
  end if;
  -- The insertion trigger reads validated server evidence, not submitted JSON.
  insert into private.partner_cart_price_reviews(cart_item_id, evidence)
  select item.id, effective->'evidence'
  from public.cart_items item join jsonb_array_elements(effective_prices->'items') effective
    on item.product_id = (effective->>'productId')::uuid
  where item.cart_id = target_cart.id
  on conflict (cart_item_id) do update set evidence = excluded.evidence
  where partner_cart_price_reviews.evidence is distinct from excluded.evidence;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(
      product_id uuid, quantity integer, partner_unit_price numeric, currency_code text,
      line_total numeric, source_unit_price numeric, source_currency_code text,
      applied_exchange_rate numeric, exchange_rate_id uuid, exchange_rate_purpose text, exchange_rate_source_type text,
      exchange_rate_effective_at timestamptz, exchange_rate_published_at timestamptz
    )
    left join public.commercial_exchange_rates rate on rate.id = item.exchange_rate_id
    where item.quantity is null or item.quantity < 1
      or item.partner_unit_price is null or item.partner_unit_price <= 0
      or upper(coalesce(item.currency_code, '')) <> 'MDL'
      or item.line_total is distinct from round(item.partner_unit_price * item.quantity, 2)
      or item.source_unit_price is null or item.source_unit_price <= 0
      or upper(coalesce(item.source_currency_code, '')) <> (
        select effective->'evidence'->>'sourceCurrency' from jsonb_array_elements(effective_prices->'items') effective
        where (effective->>'productId')::uuid = item.product_id
      )
      or (
        upper(item.source_currency_code) = 'MDL' and (
          item.partner_unit_price is distinct from item.source_unit_price
          or item.applied_exchange_rate is not null or item.exchange_rate_id is not null
          or item.exchange_rate_purpose is not null or item.exchange_rate_source_type is not null or item.exchange_rate_effective_at is not null
          or item.exchange_rate_published_at is not null
        )
      )
      or (
        upper(item.source_currency_code) = 'USD' and (
          item.applied_exchange_rate is null or item.applied_exchange_rate <= 0
          or item.exchange_rate_id is null
          or item.exchange_rate_purpose <> expected_rate_purpose
          or item.partner_unit_price is distinct from round(item.source_unit_price * item.applied_exchange_rate, 0)
          or rate.id is null or rate.purpose <> expected_rate_purpose
          or item.exchange_rate_source_type <> 'one_c_automatic'
          or rate.source_type <> 'one_c_automatic'
          or not rate.is_active or not rate.is_published
          or rate.rate is distinct from item.applied_exchange_rate
          or rate.effective_at is distinct from item.exchange_rate_effective_at
          or rate.published_at is distinct from item.exchange_rate_published_at
        )
      )
  ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'mdl_pricing_validation');
  end if;

  if jsonb_array_length(target_payload->'items') <> jsonb_array_length(target_items)
    or (target_payload->>'documentTotal')::numeric is distinct from (
      select round(sum(item.line_total), 2)
      from jsonb_to_recordset(target_items) item(line_total numeric)
    )
    or exists (
      select 1
      from jsonb_array_elements(target_items) with ordinality submitted(item, line_number)
      left join jsonb_array_elements(target_payload->'items') with ordinality payload(item, line_number)
        using (line_number)
      where lower(coalesce(payload.item->'productReference'->>'externalId', '')) <>
          lower(coalesce(submitted.item->>'external_product_ref', ''))
        or (payload.item->>'quantity')::integer is distinct from (submitted.item->>'quantity')::integer
        or upper(coalesce(payload.item->'price'->>'currency', '')) <> 'MDL'
        or (payload.item->'price'->>'amount')::numeric is distinct from
          (submitted.item->>'partner_unit_price')::numeric
        or (payload.item->>'lineTotal')::numeric is distinct from
          (submitted.item->>'line_total')::numeric
    ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'mdl_payload_consistency_validation');
  end if;

  if target_fulfillment_method = 'delivery' then
    select * into target_carrier
    from public.one_c_delivery_carriers carrier
    where carrier.id = target_carrier_id
      and carrier.is_published and carrier.is_active and not carrier.is_deleted;
    if target_carrier.id is null
      or lower(btrim(coalesce(target_payload->'carrierReference'->>'externalId', ''))) <>
        lower(target_carrier.external_1c_id) then
      return jsonb_build_object('valid', false,
        'code', 'ORDER_FULFILLMENT_CONFIGURATION_INVALID', 'stage', 'carrier_validation');
    end if;
  elsif target_payload->'carrierReference' is not null
    and target_payload->'carrierReference' <> 'null'::jsonb then
    return jsonb_build_object('valid', false,
      'code', 'ORDER_FULFILLMENT_CONFIGURATION_INVALID', 'stage', 'carrier_validation');
  end if;

  return jsonb_build_object('valid', true, 'code', 'ORDER_PREPARATION_VALID',
    'stage', 'completed', 'paymentMethod', target_payment_method,
    'paymentDate', target_payment_date, 'fulfillmentMethod', target_fulfillment_method,
    'requestedDeliveryDate', target_delivery_date, 'currencyCode', 'MDL');
end;
$$;

create function public.snapshot_partner_order_effective_price()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_evidence jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.effective_price_evidence is distinct from old.effective_price_evidence then
      raise exception 'Order price provenance is immutable' using errcode = '42501';
    end if;
    return new;
  end if;
  select review.evidence into v_evidence
  from public.partner_orders orders join public.cart_items item
    on item.cart_id = orders.cart_id and item.product_id = new.product_id and item.quantity = new.quantity
  join private.partner_cart_price_reviews review on review.cart_item_id = item.id
  where orders.id = new.order_id and orders.submitted_by = auth.uid();
  if v_evidence is null or new.source_unit_price is distinct from (v_evidence->>'sourceAmount')::numeric
    or new.source_currency_code is distinct from v_evidence->>'sourceCurrency' then
    raise exception 'ORDER_PRICE_CHANGED' using errcode = 'PT409';
  end if;
  new.effective_price_evidence := v_evidence;
  return new;
end;
$$;
create trigger snapshot_partner_order_effective_price
  before insert or update of effective_price_evidence on public.partner_order_items
  for each row execute function public.snapshot_partner_order_effective_price();
revoke all on function public.snapshot_partner_order_effective_price() from public, anon, authenticated;

-- Retired APIs lack current source-price validation; only v5 is used by the portal.
revoke execute on function public.begin_partner_order_submission(uuid,uuid,uuid,date,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public.begin_partner_order_submission_v2(uuid,bigint,uuid,uuid,date,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public.begin_partner_order_submission_v3(uuid,bigint,uuid,uuid,date,text,date,text,uuid,text,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public.begin_partner_order_submission_v4(uuid,bigint,uuid,uuid,date,text,date,text,uuid,text,jsonb,jsonb) from public, anon, authenticated;

create or replace function public.attribute_commercial_campaign_order_item()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $$
begin
  if new.effective_price_evidence->>'priceSource' = 'CAMPAIGN_PROMO' then
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
  else
    -- Retain legacy/non-price attribution without claiming a numeric PROMO benefit.
    insert into public.commercial_campaign_order_attributions(
      campaign_id, campaign_item_id, product_id, company_id, order_id, order_item_id, quantity,
      attribution_fingerprint, publication_version, mechanic_type, mechanic_threshold_quantity
    ) select cart_item.campaign_id, cart_item.campaign_item_id, item.product_id, orders.company_id,
      new.order_id, new.id, new.quantity, cart_item.campaign_attribution_fingerprint,
      campaign.current_version, campaign.mechanic_type, item.promo_threshold_quantity
    from public.partner_orders orders
    join public.cart_items cart_item on cart_item.cart_id = orders.cart_id and cart_item.product_id = new.product_id
    join public.commercial_campaigns campaign on campaign.id = cart_item.campaign_id
    join public.commercial_campaign_items item on item.id = cart_item.campaign_item_id
    where orders.id = new.order_id and campaign.status in ('active', 'scheduled')
      and campaign.starts_at <= now() and campaign.ends_at > now()
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.attribute_commercial_campaign_order_item() from public, anon, authenticated;

commit;
