begin;
set local lock_timeout = '5s';

-- One fixed composition in existing campaign items; snapshots already serialize typed rows.
alter table public.commercial_campaigns drop constraint commercial_campaign_mechanic_type_check;
alter table public.commercial_campaigns add constraint commercial_campaign_mechanic_type_check
  check (mechanic_type in ('legacy_promo','quantity_threshold_promo','fixed_bundle_promo'));
alter table public.commercial_campaign_items add column required_bundle_quantity integer;
alter table public.commercial_campaign_items add constraint campaign_bundle_quantity_check
  check (required_bundle_quantity is null or (required_bundle_quantity between 1 and 9999
    and required_bundle_quantity >= minimum_quantity
    and (maximum_quantity_per_company is null or maximum_quantity_per_company >= required_bundle_quantity)));
comment on column public.commercial_campaign_items.required_bundle_quantity is
  'Required units of this component in one fixed bundle. A complete basket unlocks governed PROMO for the entire participating line, including excess.';
alter table public.commercial_campaign_engagement_events drop constraint commercial_campaign_engagement_mechanic_check;
alter table public.commercial_campaign_engagement_events add constraint commercial_campaign_engagement_mechanic_check
  check (mechanic_type is null or mechanic_type in ('legacy_promo','quantity_threshold_promo','fixed_bundle_promo'));
alter table public.commercial_campaign_order_attributions drop constraint commercial_campaign_attribution_mechanic_check;
alter table public.commercial_campaign_order_attributions add constraint commercial_campaign_attribution_mechanic_check
  check (mechanic_type is null or mechanic_type in ('legacy_promo','quantity_threshold_promo','fixed_bundle_promo'));
alter table public.commercial_campaign_engagement_events drop constraint commercial_campaign_engagement_events_event_type_check;
alter table public.commercial_campaign_engagement_events add constraint commercial_campaign_engagement_events_event_type_check
  check (event_type in ('impression','detail_opened','product_opened','added_to_cart','bundle_added_to_cart'));

create or replace function public.apply_commercial_campaign_draft_v2(
  p_campaign_id uuid,
  p_expected_revision integer,
  p_request_id uuid,
  p_input jsonb,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_contract text := coalesce(p_input->>'contractVersion', '');
  v_mechanic text := coalesce(nullif(p_input->>'mechanicType', ''), 'legacy_promo');
  v_item jsonb;
  v_result jsonb;
  v_threshold integer;
begin
  if p_input ? 'finalPrice' or p_input ? 'discountAmount' or p_input ? 'campaignPrice' then
    raise exception 'CAMPAIGN_PRICE_OWNERSHIP_DENIED' using errcode = '22023';
  end if;
  if v_contract not in ('2', '3') then
    raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode = '22023';
  end if;
  if v_mechanic not in ('legacy_promo', 'quantity_threshold_promo', 'fixed_bundle_promo') then
    raise exception 'CAMPAIGN_MECHANIC_INVALID' using errcode = '22023';
  end if;

  if v_mechanic = 'fixed_bundle_promo' and (
    jsonb_array_length(coalesce(p_input->'items','[]'::jsonb)) < 2 or
    (select count(distinct value->>'productId') from jsonb_array_elements(p_input->'items'))
      <> jsonb_array_length(p_input->'items')
  ) then raise exception 'CAMPAIGN_BUNDLE_COMPOSITION_INVALID' using errcode = '22023'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_input->'items', '[]'::jsonb)) loop
    if v_item ? 'finalPrice' or v_item ? 'discountAmount' or v_item ? 'campaignPrice' then
      raise exception 'CAMPAIGN_PRICE_OWNERSHIP_DENIED' using errcode = '22023';
    end if;
    if v_mechanic = 'fixed_bundle_promo' then
      if coalesce(v_item->>'requiredBundleQuantity','') !~ '^[0-9]{1,4}$'
        or coalesce(v_item->>'benefitType','') <> 'existing_price_profile'
        or coalesce(v_item->>'governedBenefitReference','') <> 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        or nullif(v_item->>'promoThresholdQuantity','') is not null then
        raise exception 'CAMPAIGN_BUNDLE_QUANTITY_INVALID' using errcode = '22023';
      end if;
      v_threshold := (v_item->>'requiredBundleQuantity')::integer;
      if v_threshold not between 1 and 9999 or v_threshold < (v_item->>'minimumQuantity')::integer
        or (nullif(v_item->>'maximumQuantityPerCompany','') is not null
          and (v_item->>'maximumQuantityPerCompany')::integer < v_threshold) then
        raise exception 'CAMPAIGN_BUNDLE_QUANTITY_INVALID' using errcode = '22023';
      end if;
    elsif nullif(v_item->>'requiredBundleQuantity','') is not null then
      raise exception 'CAMPAIGN_MECHANIC_INVALID' using errcode = '22023';
    end if;
    if v_mechanic = 'quantity_threshold_promo' then
      if coalesce(v_item->>'promoThresholdQuantity', '') !~ '^[0-9]{1,4}$' then
        raise exception 'CAMPAIGN_PROMO_THRESHOLD_INVALID' using errcode = '22023';
      end if;
      v_threshold := (v_item->>'promoThresholdQuantity')::integer;
      if v_threshold not between 1 and 9999
        or v_item->>'benefitType' <> 'existing_price_profile'
        or v_item->>'governedBenefitReference' <> 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        or (nullif(v_item->>'maximumQuantityPerCompany', '') is not null
          and (v_item->>'maximumQuantityPerCompany')::integer < v_threshold)
      then
        raise exception 'CAMPAIGN_PROMO_THRESHOLD_INVALID' using errcode = '22023';
      end if;
    elsif nullif(v_item->>'promoThresholdQuantity', '') is not null then
      raise exception 'CAMPAIGN_LEGACY_MECHANIC_INVALID' using errcode = '22023';
    end if;
  end loop;

  v_result := public.apply_commercial_campaign_draft_pre_quantity_promo_wave1a(
    p_campaign_id,
    p_expected_revision,
    p_request_id,
    jsonb_set(p_input, '{contractVersion}', '"2"'::jsonb),
    p_actor
  );

  if coalesce((v_result->>'idempotent')::boolean, false) then
    return v_result;
  end if;

  update public.commercial_campaigns
  set mechanic_type = v_mechanic
  where id = p_campaign_id;

  if v_mechanic = 'quantity_threshold_promo' then
    update public.commercial_campaign_items item
    set promo_threshold_quantity = (source.value->>'promoThresholdQuantity')::integer
    from jsonb_array_elements(p_input->'items') source(value)
    where item.campaign_id = p_campaign_id
      and item.product_id = (source.value->>'productId')::uuid;
  end if;

  update public.commercial_campaign_items item
  set required_bundle_quantity = case when v_mechanic = 'fixed_bundle_promo'
    then (source.value->>'requiredBundleQuantity')::integer else null end
  from jsonb_array_elements(p_input->'items') source(value)
  where item.campaign_id = p_campaign_id and item.product_id = (source.value->>'productId')::uuid;
  return v_result || jsonb_build_object('mechanicType', v_mechanic);
end;
$$;

create or replace function public.duplicate_commercial_campaign_v1(p_campaign_id uuid, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_target uuid;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.create') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  v_target := public.duplicate_commercial_campaign_pre_quantity_promo_wave1a(p_campaign_id, p_request_id);
  update public.commercial_campaigns target
  set mechanic_type = source.mechanic_type
  from public.commercial_campaigns source
  where target.id = v_target and source.id = p_campaign_id;
  update public.commercial_campaign_items target
  set promo_threshold_quantity = source.promo_threshold_quantity, required_bundle_quantity = source.required_bundle_quantity
  from public.commercial_campaign_items source
  where target.campaign_id = v_target
    and source.campaign_id = p_campaign_id
    and target.product_id = source.product_id;
  return v_target;
end;
$$;

create function private.snapshot_campaign_bundle_contract_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.campaign_snapshot->>'mechanic_type' = 'fixed_bundle_promo' then
    new.campaign_snapshot := new.campaign_snapshot || jsonb_build_object('bundleExcessQuantitySemantics','whole_line',
      'promoProfile',jsonb_build_object('name','PROMO','externalCode','UU-000021',
        'externalRef','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','currency','USD'));
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_campaign_bundle_contract_v1() from public,anon,authenticated;
create trigger snapshot_campaign_bundle_contract before insert on public.commercial_campaign_versions
  for each row execute function private.snapshot_campaign_bundle_contract_v1();

create or replace function private.resolve_campaign_component_conditions_v1(
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
        and version.campaign_snapshot->>'mechanic_type' = v_campaign.mechanic_type
        and published_item->>'id' = v_item.id::text
        and published_item->>'product_id' = v_item.product_id::text
        and case when v_campaign.mechanic_type = 'fixed_bundle_promo'
          then (published_item->>'required_bundle_quantity')::integer = v_item.required_bundle_quantity
          else (published_item->>'promo_threshold_quantity')::integer = v_item.promo_threshold_quantity end
        and published_item->>'governed_benefit_reference' = v_item.governed_benefit_reference
        and v_item.governed_benefit_reference = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        and v_item.benefit_type = 'existing_price_profile'
    ) then
      v_reason := 'invalid_publication';
    elsif (v_campaign.mechanic_type = 'quantity_threshold_promo' and v_item.promo_threshold_quantity is null)
      or (v_campaign.mechanic_type = 'fixed_bundle_promo' and v_item.required_bundle_quantity is null) then
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
      elsif v_campaign.mechanic_type = 'quantity_threshold_promo' and p_quantity < v_item.promo_threshold_quantity then
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
    'requiredBundleQuantity', v_item.required_bundle_quantity,
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
revoke all on function private.resolve_campaign_component_conditions_v1(uuid,uuid,integer) from public,anon,authenticated;

-- Complete basket context, immutable composition and every component's exact PROMO.
-- This helper never accepts client quantities, eligibility, prices or publication versions.
create function private.resolve_campaign_bundle_v1(p_company_id uuid, p_campaign_id uuid, p_cart_id uuid default null, p_include_prices boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare
  v_campaign public.commercial_campaigns; v_cart public.carts; v_item record;
  v_result jsonb; v_components jsonb := '[]'::jsonb; v_qty integer; v_missing integer;
  v_conditions_ready boolean := true; v_complete boolean := true; v_stock_ready boolean := true;
  v_reason text := 'eligible'; v_definition jsonb; v_published jsonb;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
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
      where cart_id = v_cart.id and product_id = v_item.product_id;
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
$$;
revoke all on function private.resolve_campaign_bundle_v1(uuid,uuid,uuid,boolean) from public,anon,authenticated;

create or replace function public.resolve_commercial_campaign_item_eligibility_v1(p_company_id uuid,p_campaign_item_id uuid,p_quantity integer)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_campaign uuid; v_mechanic text; v_bundle jsonb; v_component jsonb;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select c.id,c.mechanic_type into v_campaign,v_mechanic from public.commercial_campaign_items i
    join public.commercial_campaigns c on c.id = i.campaign_id where i.id = p_campaign_item_id;
  if v_mechanic = 'fixed_bundle_promo' then
    v_bundle := private.resolve_campaign_bundle_v1(p_company_id,v_campaign);
    select value into v_component from jsonb_array_elements(v_bundle->'components')
      where value->>'campaignItemId' = p_campaign_item_id::text;
    return v_component || jsonb_build_object('eligible',v_bundle->'eligible','reason',v_bundle->'reason');
  end if;
  return private.resolve_campaign_component_conditions_v1(p_company_id,p_campaign_item_id,p_quantity);
end;
$$;
revoke all on function public.resolve_commercial_campaign_item_eligibility_v1(uuid,uuid,integer) from public,anon;
grant execute on function public.resolve_commercial_campaign_item_eligibility_v1(uuid,uuid,integer) to authenticated;

create function private.campaign_scope_conflicts_v1(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.commercial_campaigns c
    join public.commercial_campaign_items i on i.campaign_id = c.id
    join public.commercial_campaign_items other_i on other_i.product_id = i.product_id and other_i.campaign_id <> c.id
    join public.commercial_campaigns other_c on other_c.id = other_i.campaign_id
    join public.commercial_campaign_audience_snapshots a on a.campaign_id = c.id and a.version_number = c.current_version and a.included
    join public.commercial_campaign_audience_snapshots other_a on other_a.campaign_id = other_c.id
      and other_a.version_number = other_c.current_version and other_a.included and other_a.company_id = a.company_id
    where c.id = p_campaign_id
      and (c.mechanic_type = 'fixed_bundle_promo' or other_c.mechanic_type = 'fixed_bundle_promo'
        or (c.mechanic_type = 'quantity_threshold_promo' and other_c.mechanic_type = 'quantity_threshold_promo')) and other_c.status in ('active', 'scheduled')
      and c.starts_at < other_c.ends_at and other_c.starts_at < c.ends_at
  );
$$;
revoke all on function private.campaign_scope_conflicts_v1(uuid) from public,anon,authenticated;

create or replace function public.publish_commercial_campaign(p_campaign_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_result jsonb; v_campaign public.commercial_campaigns;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.publish') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  -- Serialize publication; reject ambiguous overlapping product/audience/time scopes.
  perform pg_advisory_xact_lock(hashtextextended('quantity_promo_publication', 0));
  select * into v_campaign from public.commercial_campaigns where id = p_campaign_id for update;
  if v_campaign.status = 'draft' and v_campaign.mechanic_type = 'fixed_bundle_promo' then
    if (select count(distinct product_id) from public.commercial_campaign_items where campaign_id = p_campaign_id) < 2
      or exists (select 1 from public.commercial_campaign_items i where i.campaign_id = p_campaign_id
        and (i.required_bundle_quantity is null or i.required_bundle_quantity < 1
          or i.promo_threshold_quantity is not null or i.benefit_type <> 'existing_price_profile'
          or i.governed_benefit_reference is distinct from 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4')) then
      raise exception 'CAMPAIGN_BUNDLE_COMPOSITION_INVALID' using errcode = '23514'; end if;
  end if;
  v_result := public.publish_commercial_campaign_pre_governed_pricing_wave1b(p_campaign_id, p_request_id);
  if private.campaign_scope_conflicts_v1(p_campaign_id) then
    raise exception 'CAMPAIGN_COMMERCIAL_SCOPE_CONFLICT' using errcode = '23514';
  end if;
  return v_result;
end;
$$;

create or replace function public.resume_commercial_campaign_v1(p_campaign_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' set row_security=off as $$
declare v_actor uuid:=auth.uid();v_target public.commercial_campaigns;v_status text;
begin
  if v_actor is null or not public.has_internal_permission('campaigns.pause') then raise exception 'Forbidden' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('quantity_promo_publication',0));
  select * into v_target from public.commercial_campaigns where id=p_campaign_id for update;if v_target.id is null then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
  if v_target.status<>'paused' or v_target.current_version=0 or v_target.ends_at<=now() then raise exception 'CAMPAIGN_RESUME_STATE_INVALID' using errcode='23514';end if;
  if private.campaign_scope_conflicts_v1(p_campaign_id) then raise exception 'CAMPAIGN_COMMERCIAL_SCOPE_CONFLICT' using errcode='23514'; end if;
  v_status:=case when v_target.starts_at>now() then 'scheduled' else 'active' end;
  update public.commercial_campaigns set status=v_status,updated_at=now() where id=v_target.id;
  insert into public.commercial_campaign_audit_events(campaign_id,version_number,event_type,actor_user_id,reason) values(v_target.id,v_target.current_version,'resumed',v_actor,left(btrim(p_reason),500));
  if v_status='active' then perform public.project_commercial_campaign_search(v_target.id);end if;return true;
end $$;

create or replace function public.resolve_partner_cart_prices_internal_v1(
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
  v_candidates jsonb;
  v_bundles jsonb := '{}'::jsonb;
  v_bundle jsonb;
  v_bundle_id uuid;
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
        and (a->>'mechanic_type' = 'fixed_bundle_promo' or z->>'mechanic_type' = 'fixed_bundle_promo')) then
      raise exception 'ORDER_PRICE_CHANGED' using errcode = 'PT409', detail = 'campaign_scope_collision'; end if;
    for v_bundle_id in select distinct (value->>'campaign_id')::uuid from jsonb_array_elements(v_candidates)
      where value->>'mechanic_type' = 'fixed_bundle_promo' loop
      perform 1 from public.commercial_campaign_items where campaign_id = v_bundle_id order by id for share;
      -- Pin every component price, including components absent from the basket.
      perform 1 from public.product_prices price join public.price_types profile on profile.id = price.price_type_id
        where price.product_id in (select product_id from public.commercial_campaign_items where campaign_id = v_bundle_id)
          and profile.external_ref = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4' order by price.id for share of price,profile;
      v_bundle := private.resolve_campaign_bundle_v1(v_cart.company_id,v_bundle_id,v_cart.id,true);
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
        if v_candidate.mechanic_type = 'fixed_bundle_promo' then
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

create or replace function public.clear_cart_price_acknowledgement_on_quantity()
returns trigger language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_cart_id uuid := case when tg_op = 'DELETE' then old.cart_id else new.cart_id end;
  v_product_id uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  v_item_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if tg_op <> 'UPDATE' or new.quantity is distinct from old.quantity then
    delete from private.partner_cart_price_reviews r using public.cart_items i
      where r.cart_item_id = i.id and i.cart_id = v_cart_id and (i.id = v_item_id or exists (
        select 1 from public.commercial_campaign_items changed
        join public.commercial_campaigns campaign on campaign.id = changed.campaign_id and campaign.mechanic_type = 'fixed_bundle_promo'
        join public.commercial_campaign_items related on related.campaign_id = changed.campaign_id
        where changed.product_id = v_product_id and related.product_id = i.product_id));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger clear_cart_price_acknowledgement_on_quantity on public.cart_items;
create trigger clear_cart_price_acknowledgement_on_quantity before insert or delete or update of quantity on public.cart_items
  for each row execute function public.clear_cart_price_acknowledgement_on_quantity();
revoke all on function public.clear_cart_price_acknowledgement_on_quantity() from public,anon,authenticated;

create function public.complete_commercial_campaign_bundle_v1(p_company_id uuid,p_campaign_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
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
      insert into public.cart_items(cart_id,product_id,quantity,campaign_id,campaign_item_id,campaign_attribution_fingerprint)
        values(v_cart.id,(v_component->>'productId')::uuid,(v_component->>'requiredBundleQuantity')::integer,
          p_campaign_id,(v_component->>'campaignItemId')::uuid,v_fingerprint)
        on conflict(cart_id,product_id) do update set quantity=greatest(cart_items.quantity,excluded.quantity),
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
$$;
revoke all on function public.complete_commercial_campaign_bundle_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.complete_commercial_campaign_bundle_v1(uuid,uuid,uuid) to authenticated;

create or replace function public.list_partner_commercial_campaigns(
  p_company_id uuid,
  p_filter text default 'active',
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_base jsonb;
  v_items jsonb;
begin
  v_base := public.list_partner_commercial_campaigns_pre_quantity_promo_wave1a(p_company_id, p_filter, p_limit, p_offset);
  select coalesce(jsonb_agg(
    campaign.value
      || jsonb_build_object('mechanicType', definition.mechanic_type,'bundleProgress',
        case when definition.mechanic_type = 'fixed_bundle_promo' then private.resolve_campaign_bundle_v1(p_company_id,definition.id) end)
      || jsonb_build_object('products', coalesce((
        select jsonb_agg(product.value || jsonb_build_object(
          'mechanicType', definition.mechanic_type,
          'promoThresholdQuantity', item.promo_threshold_quantity,'requiredBundleQuantity',item.required_bundle_quantity
        ) order by product.ordinality)
        from jsonb_array_elements(campaign.value->'products') with ordinality product(value, ordinality)
        join public.commercial_campaign_items item on item.id = (product.value->>'itemId')::uuid
      ), '[]'::jsonb))
    order by campaign.ordinality
  ), '[]'::jsonb) into v_items
  from jsonb_array_elements(coalesce(v_base->'items', '[]'::jsonb)) with ordinality campaign(value, ordinality)
  join public.commercial_campaigns definition on definition.id = (campaign.value->>'id')::uuid;
  return jsonb_set(v_base, '{items}', v_items);
end;
$$;

create or replace function public.get_partner_commercial_campaign(p_company_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_base jsonb;
  v_mechanic text;
  v_products jsonb;
begin
  v_base := public.get_partner_commercial_campaign_pre_quantity_promo_wave1a(p_company_id, p_campaign_id);
  if v_base is null then return null; end if;
  select mechanic_type into v_mechanic from public.commercial_campaigns where id = p_campaign_id;
  select coalesce(jsonb_agg(product.value || jsonb_build_object(
    'mechanicType', v_mechanic,
    'promoThresholdQuantity', item.promo_threshold_quantity,'requiredBundleQuantity',item.required_bundle_quantity
  ) order by product.ordinality), '[]'::jsonb) into v_products
  from jsonb_array_elements(coalesce(v_base->'products', '[]'::jsonb)) with ordinality product(value, ordinality)
  join public.commercial_campaign_items item on item.id = (product.value->>'itemId')::uuid;
  return v_base
    || jsonb_build_object('mechanicType', coalesce(v_mechanic, 'legacy_promo'),'bundleProgress',
      case when v_mechanic = 'fixed_bundle_promo' then private.resolve_campaign_bundle_v1(p_company_id,p_campaign_id) end)
    || jsonb_build_object('products', v_products);
end;
$$;

commit;
