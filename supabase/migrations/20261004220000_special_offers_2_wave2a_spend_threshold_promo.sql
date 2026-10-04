begin;
set local lock_timeout = '5s';

-- Explicit fifth-mechanic configuration; no new nullable item economic fields.
create table public.commercial_campaign_spend_configs (
  campaign_id uuid primary key references public.commercial_campaigns(id) on delete cascade,
  threshold_amount_usd numeric(14,2) not null check (threshold_amount_usd > 0 and threshold_amount_usd < 1000000000000),
  currency text not null default 'USD' check (currency = 'USD')
);
create table public.commercial_campaign_spend_roles (
  campaign_id uuid not null references public.commercial_campaign_spend_configs(campaign_id) on delete cascade,
  product_id uuid not null,
  role text not null check (role in ('QUALIFYING_SPEND','REWARD')),
  primary key (campaign_id,product_id),
  foreign key (campaign_id,product_id) references public.commercial_campaign_items(campaign_id,product_id) on delete cascade
);
create unique index campaign_spend_one_reward on public.commercial_campaign_spend_roles(campaign_id) where role = 'REWARD';
alter table public.commercial_campaign_spend_configs enable row level security;
alter table public.commercial_campaign_spend_roles enable row level security;
revoke all on public.commercial_campaign_spend_configs,public.commercial_campaign_spend_roles from public,anon,authenticated,service_role;
comment on table public.commercial_campaign_spend_configs is 'USD base-governed-Partner-price threshold. Only permission-gated campaign lifecycle functions write drafts; immutable publication snapshots own accepted definitions.';
comment on table public.commercial_campaign_spend_roles is 'Explicit mutually exclusive qualifying/reward product scope. Exactly one reward; qualifying products never require PROMO.';

alter table public.commercial_campaigns drop constraint commercial_campaign_mechanic_type_check;
alter table public.commercial_campaigns add constraint commercial_campaign_mechanic_type_check check
  (mechanic_type in ('legacy_promo','quantity_threshold_promo','fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo'));
alter table public.commercial_campaign_engagement_events drop constraint commercial_campaign_engagement_mechanic_check;
alter table public.commercial_campaign_engagement_events add constraint commercial_campaign_engagement_mechanic_check check
  (mechanic_type is null or mechanic_type in ('legacy_promo','quantity_threshold_promo','fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo'));
alter table public.commercial_campaign_order_attributions drop constraint commercial_campaign_attribution_mechanic_check;
alter table public.commercial_campaign_order_attributions add constraint commercial_campaign_attribution_mechanic_check check
  (mechanic_type is null or mechanic_type in ('legacy_promo','quantity_threshold_promo','fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo'));

create function private.campaign_spend_config_v1(p_campaign_id uuid)
returns jsonb language sql stable security definer set search_path = '' set row_security = off as $$
  select jsonb_build_object('thresholdAmountUsd',config.threshold_amount_usd::text,'currency',config.currency,
    'qualifyingProductIds',(select coalesce(jsonb_agg(role.product_id order by role.product_id),'[]'::jsonb)
      from public.commercial_campaign_spend_roles role where role.campaign_id = config.campaign_id and role.role = 'QUALIFYING_SPEND'),
    'rewardProductId',(select role.product_id from public.commercial_campaign_spend_roles role where role.campaign_id = config.campaign_id and role.role = 'REWARD'))
  from public.commercial_campaign_spend_configs config where config.campaign_id = p_campaign_id;
$$;
revoke all on function private.campaign_spend_config_v1(uuid) from public,anon,authenticated,service_role;

-- Same normal-price selection policy as the central resolver, batched and before benefits.
-- Private lookup has no browser endpoint. Callers own actor/company/profile authorization.
create function private.partner_base_price_context_v1(p_company_id uuid,p_product_ids uuid[],p_price_type_ref text)
returns jsonb language sql stable security definer set search_path = '' set row_security = off as $$
  select coalesce(jsonb_object_agg(scope.product_id::text,to_jsonb(price)) filter (where price.id is not null),'{}'::jsonb)
  from (select distinct unnest(p_product_ids) as product_id) scope
  cross join lateral (
    select pp.* from public.product_prices pp where pp.product_id = scope.product_id
      and pp.external_1c_price_type_id = p_price_type_ref
      and pp.is_active and pp.is_published and pp.currency_status = 'resolved'
      and upper(pp.currency) in ('USD','MDL') and pp.price_amount > 0
      and pp.valid_from <= now() and (pp.valid_to is null or pp.valid_to >= now())
      and (pp.company_id is null or pp.company_id = p_company_id)
    order by coalesce(pp.company_id = p_company_id,false) desc,pp.valid_from desc,pp.updated_at desc,pp.id limit 1
  ) price;
$$;
revoke all on function private.partner_base_price_context_v1(uuid,uuid[],text) from public,anon,authenticated,service_role;

alter function public.apply_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb,uuid) rename to apply_campaign_draft_pre_spend_wave2a;
revoke all on function public.apply_campaign_draft_pre_spend_wave2a(uuid,integer,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
create function public.apply_commercial_campaign_draft_v2(p_campaign_id uuid,p_expected_revision integer,p_request_id uuid,p_input jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_config jsonb := p_input->'spendConfig'; v_item jsonb; v_result jsonb; v_qualifying uuid[]; v_reward uuid; v_amount numeric;
begin
  if p_input->>'mechanicType' is distinct from 'spend_threshold_promo' then
    if coalesce(v_config,'null'::jsonb) <> 'null'::jsonb then raise exception 'CAMPAIGN_MECHANIC_INVALID' using errcode='22023'; end if;
    v_result := public.apply_campaign_draft_pre_spend_wave2a(p_campaign_id,p_expected_revision,p_request_id,p_input,p_actor);
    if not coalesce((v_result->>'idempotent')::boolean,false) then delete from public.commercial_campaign_spend_configs where campaign_id=p_campaign_id; end if;
    return v_result;
  end if;
  if jsonb_typeof(v_config) is distinct from 'object' or v_config->>'currency' is distinct from 'USD'
    or jsonb_typeof(v_config->'thresholdAmountUsd') is distinct from 'string'
    or coalesce(v_config->>'thresholdAmountUsd','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$'
    or jsonb_typeof(v_config->'qualifyingProductIds') is distinct from 'array'
    or jsonb_typeof(p_input->'items') is distinct from 'array' then
    raise exception 'CAMPAIGN_SPEND_CONFIG_INVALID' using errcode='22023'; end if;
  v_amount := (v_config->>'thresholdAmountUsd')::numeric;
  if v_amount <= 0 or v_amount >= 1000000000000 then raise exception 'CAMPAIGN_SPEND_THRESHOLD_INVALID' using errcode='22023'; end if;
  select array_agg(value::uuid) into v_qualifying from jsonb_array_elements_text(v_config->'qualifyingProductIds');
  v_reward := (v_config->>'rewardProductId')::uuid;
  if coalesce(cardinality(v_qualifying),0) < 1 or v_reward is null or v_reward = any(v_qualifying)
    or cardinality(v_qualifying) <> (select count(distinct id) from unnest(v_qualifying) id)
    or jsonb_array_length(p_input->'items') <> cardinality(v_qualifying) + 1
    or (select count(distinct value->>'productId') from jsonb_array_elements(p_input->'items')) <> jsonb_array_length(p_input->'items') then
    raise exception 'CAMPAIGN_SPEND_COMPOSITION_INVALID' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_input->'items') loop
    if (v_item->>'productId')::uuid = v_reward then
      if v_item->>'benefitType' is distinct from 'existing_price_profile' or v_item->>'governedBenefitReference' is distinct from 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4' then
        raise exception 'CAMPAIGN_SPEND_REWARD_INVALID' using errcode='22023'; end if;
    elsif not ((v_item->>'productId')::uuid = any(v_qualifying))
      or v_item->>'benefitType' is distinct from 'informational_only' or nullif(v_item->>'governedBenefitReference','') is not null then
      raise exception 'CAMPAIGN_SPEND_SCOPE_INVALID' using errcode='22023'; end if;
  end loop;
  -- Reuse the existing authorized/idempotent draft lifecycle and all inactive-field/price checks.
  v_result := public.apply_campaign_draft_pre_spend_wave2a(p_campaign_id,p_expected_revision,p_request_id,
    jsonb_set(p_input,'{mechanicType}','"legacy_promo"'::jsonb),p_actor);
  if coalesce((v_result->>'idempotent')::boolean,false) then return v_result; end if;
  update public.commercial_campaigns set mechanic_type='spend_threshold_promo' where id=p_campaign_id;
  insert into public.commercial_campaign_spend_configs(campaign_id,threshold_amount_usd) values(p_campaign_id,v_amount)
    on conflict(campaign_id) do update set threshold_amount_usd=excluded.threshold_amount_usd;
  delete from public.commercial_campaign_spend_roles where campaign_id=p_campaign_id;
  insert into public.commercial_campaign_spend_roles(campaign_id,product_id,role)
    select p_campaign_id,id,'QUALIFYING_SPEND' from unnest(v_qualifying) id
    union all select p_campaign_id,v_reward,'REWARD';
  return v_result || jsonb_build_object('mechanicType','spend_threshold_promo');
end;
$$;
revoke all on function public.apply_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb,uuid) from public,anon,authenticated,service_role;

alter function public.duplicate_commercial_campaign_v1(uuid,uuid) rename to duplicate_campaign_pre_spend_wave2a;
revoke all on function public.duplicate_campaign_pre_spend_wave2a(uuid,uuid) from public,anon,authenticated,service_role;
create function public.duplicate_commercial_campaign_v1(p_campaign_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_target uuid; v_source uuid;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.create') then raise exception 'Forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('spend_campaign_duplicate:'||auth.uid()::text||':'||p_request_id::text,0));
  select id,duplicated_from_campaign_id into v_target,v_source from public.commercial_campaigns
    where created_by=auth.uid() and creation_request_id=p_request_id;
  if found then
    if v_source is distinct from p_campaign_id then raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode='22023'; end if;
    return v_target;
  end if;
  v_target := public.duplicate_campaign_pre_spend_wave2a(p_campaign_id,p_request_id);
  insert into public.commercial_campaign_spend_configs select v_target,threshold_amount_usd,currency
    from public.commercial_campaign_spend_configs where campaign_id=p_campaign_id on conflict do nothing;
  insert into public.commercial_campaign_spend_roles select v_target,product_id,role
    from public.commercial_campaign_spend_roles where campaign_id=p_campaign_id on conflict do nothing;
  return v_target;
end;
$$;
revoke all on function public.duplicate_commercial_campaign_v1(uuid,uuid) from public,anon;
grant execute on function public.duplicate_commercial_campaign_v1(uuid,uuid) to authenticated;

-- One qualification per campaign/basket. Optional context is trusted private-call-only data.
create function private.resolve_campaign_spend_v1(p_company_id uuid,p_campaign_id uuid,p_cart_id uuid default null,
  p_include_prices boolean default false,p_base_prices jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_campaign public.commercial_campaigns; v_cart public.carts; v_config jsonb; v_published jsonb;
  v_prices jsonb; v_price jsonb; v_row record; v_reward jsonb; v_qualifiers jsonb := '[]'::jsonb;
  v_sources jsonb := '[]'::jsonb; v_spend numeric := 0; v_threshold numeric; v_ready boolean := true;
  v_reason text := 'below_threshold'; v_reached boolean := false; v_present boolean := false; v_stock boolean := false;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  if not public.has_permission(p_company_id,'pricing.partner_price.view') then
    return jsonb_build_object('campaignId',p_campaign_id,'conditionsReady',false,'eligible',false,'reason','base_price_access_denied'); end if;
  select * into v_cart from public.carts where company_id=p_company_id and created_by=auth.uid()
    and status in ('active','submitting') and (p_cart_id is null or id=p_cart_id) order by updated_at desc,id limit 1;
  if p_cart_id is not null and v_cart.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into v_campaign from public.commercial_campaigns where id=p_campaign_id;
  if v_campaign.id is null or v_campaign.status not in ('active','scheduled') then
    return jsonb_build_object('campaignId',p_campaign_id,'conditionsReady',false,'eligible',false,'reason','inactive_campaign');
  elsif v_campaign.starts_at > now() or v_campaign.ends_at <= now() then
    return jsonb_build_object('campaignId',p_campaign_id,'conditionsReady',false,'eligible',false,'reason','outside_period');
  elsif not exists(select 1 from public.commercial_campaign_audience_snapshots where campaign_id=p_campaign_id
      and version_number=v_campaign.current_version and company_id=p_company_id and included) then
    return jsonb_build_object('campaignId',p_campaign_id,'conditionsReady',false,'eligible',false,'reason','outside_audience');
  end if;
  v_config := private.campaign_spend_config_v1(p_campaign_id);
  select campaign_snapshot->'spendConfig' into v_published from public.commercial_campaign_versions
    where campaign_id=p_campaign_id and version_number=v_campaign.current_version
      and campaign_snapshot->>'mechanic_type'='spend_threshold_promo';
  if v_campaign.mechanic_type is distinct from 'spend_threshold_promo' or v_config is null
    or v_config is distinct from v_published then
    return jsonb_build_object('campaignId',p_campaign_id,'conditionsReady',false,'eligible',false,'reason','invalid_publication'); end if;
  v_threshold := (v_config->>'thresholdAmountUsd')::numeric;
  v_prices := coalesce(p_base_prices,private.partner_base_price_context_v1(p_company_id,
    array(select value::uuid from jsonb_array_elements_text(v_config->'qualifyingProductIds')),
    (select external_1c_price_type_id from public.partner_companies where id=p_company_id)));
  for v_row in select item.*,role.role,product.sku,product.name,coalesce(cart_item.quantity,0) as cart_quantity,
      case when stock.is_published and stock.freshness_state='authoritative' then stock.available_quantity end as available_quantity
    from public.commercial_campaign_spend_roles role
    join public.commercial_campaign_items item on item.campaign_id=role.campaign_id and item.product_id=role.product_id
    join public.catalog_products product on product.id=item.product_id
    left join public.cart_items cart_item on cart_item.cart_id=v_cart.id and cart_item.product_id=item.product_id
    left join public.product_stock_totals stock on stock.product_id=item.product_id
    where role.campaign_id=p_campaign_id order by item.product_id loop
    if v_row.role='QUALIFYING_SPEND' then
      v_price := v_prices->v_row.product_id::text;
      if v_price is null or upper(v_price->>'currency') is distinct from 'USD' then v_ready:=false; v_reason:='missing_base_usd';
      else
        v_spend := v_spend + (v_price->>'price_amount')::numeric * v_row.cart_quantity;
        if v_row.cart_quantity > 0 then v_sources := v_sources || jsonb_build_array(jsonb_build_object('productId',v_row.product_id,
          'quantity',v_row.cart_quantity,'priceId',v_price->>'id','sourceAmountUsd',v_price->>'price_amount')); end if;
      end if;
      v_qualifiers := v_qualifiers || jsonb_build_array(jsonb_build_object('campaignItemId',v_row.id,'productId',v_row.product_id,
        'sku',v_row.sku,'name',v_row.name,'currentQuantity',v_row.cart_quantity));
    else
      v_reward := private.resolve_campaign_component_conditions_v1(p_company_id,v_row.id,case when v_row.cart_quantity>0 then v_row.cart_quantity else v_row.minimum_quantity end)
        || jsonb_build_object('sku',v_row.sku,'name',v_row.name,'minimumQuantity',v_row.minimum_quantity,
          'currentQuantity',v_row.cart_quantity,'availableQuantity',v_row.available_quantity);
      v_present := v_row.cart_quantity > 0;
      v_stock := coalesce(v_row.available_quantity >= greatest(v_row.minimum_quantity,v_row.cart_quantity),false);
      if not coalesce((v_reward->>'eligible')::boolean,false) then v_ready:=false; v_reason:=v_reward->>'reason'; end if;
    end if;
  end loop;
  if v_reward is null or jsonb_array_length(v_qualifiers)=0 then v_ready:=false; v_reason:='invalid_publication'; end if;
  v_reached := v_ready and v_spend >= v_threshold;
  if v_ready then v_reason := case when not v_reached then 'below_threshold' when not v_present then 'reward_absent' else 'eligible' end; end if;
  if not p_include_prices then v_reward := v_reward - 'promoPrice' - 'promoProfile'; end if;
  return jsonb_build_object('campaignId',p_campaign_id,'publicationVersion',v_campaign.current_version,
    'conditionsReady',v_ready,'eligible',v_reached and v_present,'thresholdReached',v_reached,
    'thresholdAmountUsd',v_threshold::text,'qualifyingSpendUsd',v_spend::text,'remainingSpendUsd',greatest(v_threshold-v_spend,0)::text,
    'currency','USD','rewardPresent',v_present,'rewardStockReady',v_stock,'reason',v_reason,
    'qualifyingProducts',v_qualifiers,'reward',v_reward)
    || case when p_include_prices then jsonb_build_object('qualifyingSources',v_sources) else '{}'::jsonb end;
end;
$$;
revoke all on function private.resolve_campaign_spend_v1(uuid,uuid,uuid,boolean,jsonb) from public,anon,authenticated,service_role;

alter function public.publish_commercial_campaign(uuid,uuid) rename to publish_campaign_pre_spend_wave2a;
revoke all on function public.publish_campaign_pre_spend_wave2a(uuid,uuid) from public,anon,authenticated,service_role;
create function public.publish_commercial_campaign(p_campaign_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_campaign public.commercial_campaigns; v_result jsonb; v_config jsonb; v_company record; v_prices jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.publish') then raise exception 'Forbidden' using errcode='42501'; end if;
  -- Same publication serialization as all previous typed mechanics.
  perform pg_advisory_xact_lock(hashtextextended('quantity_promo_publication',0));
  select * into v_campaign from public.commercial_campaigns where id=p_campaign_id for update;
  if v_campaign.mechanic_type='spend_threshold_promo' then
    v_config := private.campaign_spend_config_v1(p_campaign_id);
    if v_config is null or jsonb_array_length(v_config->'qualifyingProductIds') < 1 or v_config->>'rewardProductId' is null
      or exists(select 1 from public.commercial_campaign_items item left join public.commercial_campaign_spend_roles role
        on role.campaign_id=item.campaign_id and role.product_id=item.product_id where item.campaign_id=p_campaign_id
          and (role.role is null or item.promo_threshold_quantity is not null or item.required_bundle_quantity is not null
            or item.attach_role is not null or item.required_trigger_quantity is not null
            or (role.role='REWARD' and (item.benefit_type<>'existing_price_profile' or item.governed_benefit_reference is distinct from 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'))
            or (role.role='QUALIFYING_SPEND' and (item.benefit_type<>'informational_only' or item.governed_benefit_reference is not null)))) then
      raise exception 'CAMPAIGN_SPEND_CONFIG_INVALID' using errcode='23514'; end if;
  end if;
  v_result := public.publish_campaign_pre_spend_wave2a(p_campaign_id,p_request_id);
  if v_campaign.mechanic_type='spend_threshold_promo' then
    -- Validate every included company's actual governed normal USD source, not MSRP or an arbitrary profile.
    for v_company in select company.id,company.external_1c_price_type_id from public.commercial_campaign_audience_snapshots audience
      join public.partner_companies company on company.id=audience.company_id where audience.campaign_id=p_campaign_id
        and audience.version_number=(select current_version from public.commercial_campaigns where id=p_campaign_id) and audience.included loop
      v_prices := private.partner_base_price_context_v1(v_company.id,
        array(select value::uuid from jsonb_array_elements_text(v_config->'qualifyingProductIds')),v_company.external_1c_price_type_id);
      if exists(select 1 from jsonb_array_elements_text(v_config->'qualifyingProductIds') id
        where v_prices->id is null or upper(v_prices->id->>'currency') is distinct from 'USD') then
        raise exception 'CAMPAIGN_SPEND_BASE_USD_MISSING' using errcode='23514'; end if;
    end loop;
  end if;
  return v_result;
end;
$$;
revoke all on function public.publish_commercial_campaign(uuid,uuid) from public,anon;
grant execute on function public.publish_commercial_campaign(uuid,uuid) to authenticated;


-- Extend existing authorities; previous mechanics retain their explicit dispatch.

create or replace function private.snapshot_campaign_bundle_contract_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.campaign_snapshot->>'mechanic_type' in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo') then
    new.campaign_snapshot := new.campaign_snapshot || jsonb_build_object('bundleExcessQuantitySemantics','whole_line',
      'promoProfile',jsonb_build_object('name','PROMO','externalCode','UU-000021',
        'externalRef','b9f5d585-dab1-11e9-8a58-000c29cf9dd4','currency','USD'));
  end if;
  if new.campaign_snapshot->>'mechanic_type' in ('conditional_attach_promo','spend_threshold_promo') then
    new.campaign_snapshot := (new.campaign_snapshot - 'bundleExcessQuantitySemantics')
      || jsonb_build_object('rewardExcessQuantitySemantics','whole_line');
  end if;
  if new.campaign_snapshot->>'mechanic_type' = 'spend_threshold_promo' then
    new.campaign_snapshot := new.campaign_snapshot || jsonb_build_object('spendConfig',private.campaign_spend_config_v1(new.campaign_id),'spendBasis','base_partner_usd');
  end if;
  return new;
end;
$$;

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
          when v_campaign.mechanic_type = 'conditional_attach_promo' then published_item->>'attach_role' = 'REWARD' and v_item.attach_role = 'REWARD'
          when v_campaign.mechanic_type = 'spend_threshold_promo' then exists (select 1 from public.commercial_campaign_spend_roles role where role.campaign_id=v_campaign.id and role.product_id=v_item.product_id and role.role='REWARD')
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

create or replace function private.campaign_scope_conflicts_v1(p_campaign_id uuid)
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
      and (c.mechanic_type in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo') or other_c.mechanic_type in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo')
        or (c.mechanic_type = 'quantity_threshold_promo' and other_c.mechanic_type = 'quantity_threshold_promo')) and other_c.status in ('active', 'scheduled')
      and c.starts_at < other_c.ends_at and other_c.starts_at < c.ends_at
  );
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
        join public.commercial_campaigns campaign on campaign.id = changed.campaign_id and campaign.mechanic_type in ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo')
        join public.commercial_campaign_items related on related.campaign_id = changed.campaign_id
        where changed.product_id = v_product_id and related.product_id = i.product_id));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

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
$$;

alter function public.resolve_commercial_campaign_item_eligibility_v1(uuid,uuid,integer) rename to resolve_campaign_item_pre_spend_wave2a;
revoke all on function public.resolve_campaign_item_pre_spend_wave2a(uuid,uuid,integer) from public,anon,authenticated,service_role;
create function public.resolve_commercial_campaign_item_eligibility_v1(p_company_id uuid,p_campaign_item_id uuid,p_quantity integer)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_campaign uuid; v_mechanic text; v_state jsonb;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_quantity is null or p_quantity not between 1 and 9999 then raise exception 'CAMPAIGN_QUANTITY_INVALID' using errcode='22023'; end if;
  select c.id,c.mechanic_type into v_campaign,v_mechanic from public.commercial_campaign_items i join public.commercial_campaigns c on c.id=i.campaign_id where i.id=p_campaign_item_id;
  if v_mechanic is distinct from 'spend_threshold_promo' then return public.resolve_campaign_item_pre_spend_wave2a(p_company_id,p_campaign_item_id,p_quantity); end if;
  v_state := private.resolve_campaign_spend_v1(p_company_id,v_campaign);
  if not coalesce((v_state->>'conditionsReady')::boolean,false) then
    return jsonb_build_object('eligible',false,'reason',v_state->'reason'); end if;
  if v_state->'reward'->>'campaignItemId'=p_campaign_item_id::text then
    return v_state->'reward' || jsonb_build_object('eligible',v_state->'eligible','reason',v_state->'reason'); end if;
  return jsonb_build_object('eligible',false,'reason','qualifying_normal_price','mechanicType',v_mechanic,'campaignId',v_campaign,
    'campaignItemId',p_campaign_item_id,'publicationVersion',v_state->'publicationVersion',
    'productId',(select product_id from public.commercial_campaign_items where id=p_campaign_item_id));
end;
$$;
revoke all on function public.resolve_commercial_campaign_item_eligibility_v1(uuid,uuid,integer) from public,anon;
grant execute on function public.resolve_commercial_campaign_item_eligibility_v1(uuid,uuid,integer) to authenticated;

-- Add only the new server progress/roles to already-authorized shared projections.
create function private.project_campaign_spend_v1(p_company_id uuid,p_campaign jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_products jsonb;
begin
  if p_campaign->>'mechanicType' is distinct from 'spend_threshold_promo' then return p_campaign; end if;
  select coalesce(jsonb_agg(product.value || jsonb_build_object('spendRole',role.role) order by product.ordinality),'[]'::jsonb)
    into v_products from jsonb_array_elements(p_campaign->'products') with ordinality product(value,ordinality)
    join public.commercial_campaign_spend_roles role on role.campaign_id=(p_campaign->>'id')::uuid and role.product_id=(product.value->>'productId')::uuid;
  return p_campaign || jsonb_build_object('spendProgress',private.resolve_campaign_spend_v1(p_company_id,(p_campaign->>'id')::uuid),'products',v_products);
end;
$$;
revoke all on function private.project_campaign_spend_v1(uuid,jsonb) from public,anon,authenticated,service_role;
alter function public.list_partner_commercial_campaigns(uuid,text,integer,integer) rename to list_partner_campaigns_pre_spend_wave2a;
revoke all on function public.list_partner_campaigns_pre_spend_wave2a(uuid,text,integer,integer) from public,anon,authenticated,service_role;
create function public.list_partner_commercial_campaigns(p_company_id uuid,p_filter text default 'active',p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_result jsonb; v_items jsonb;
begin
  v_result := public.list_partner_campaigns_pre_spend_wave2a(p_company_id,p_filter,p_limit,p_offset);
  select coalesce(jsonb_agg(private.project_campaign_spend_v1(p_company_id,value) order by ordinality),'[]'::jsonb)
    into v_items from jsonb_array_elements(v_result->'items') with ordinality;
  return jsonb_set(v_result,'{items}',v_items);
end;
$$;
revoke all on function public.list_partner_commercial_campaigns(uuid,text,integer,integer) from public,anon;
grant execute on function public.list_partner_commercial_campaigns(uuid,text,integer,integer) to authenticated;
alter function public.get_partner_commercial_campaign(uuid,uuid) rename to get_partner_campaign_pre_spend_wave2a;
revoke all on function public.get_partner_campaign_pre_spend_wave2a(uuid,uuid) from public,anon,authenticated,service_role;
create function public.get_partner_commercial_campaign(p_company_id uuid,p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_result jsonb;
begin
  v_result := public.get_partner_campaign_pre_spend_wave2a(p_company_id,p_campaign_id);
  if v_result is null then return null; end if;
  return private.project_campaign_spend_v1(p_company_id,v_result);
end;
$$;
revoke all on function public.get_partner_commercial_campaign(uuid,uuid) from public,anon;
grant execute on function public.get_partner_commercial_campaign(uuid,uuid) to authenticated;

alter function public.get_admin_commercial_campaign_v2(uuid) rename to get_admin_campaign_pre_spend_wave2a;
revoke all on function public.get_admin_campaign_pre_spend_wave2a(uuid) from public,anon,authenticated,service_role;
create function public.get_admin_commercial_campaign_v2(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_result jsonb;
begin
  v_result := public.get_admin_campaign_pre_spend_wave2a(p_campaign_id);
  if v_result is null then return null; end if;
  return jsonb_set(v_result,'{campaign}',v_result->'campaign' || jsonb_build_object('spendConfig',private.campaign_spend_config_v1(p_campaign_id)));
end;
$$;
revoke all on function public.get_admin_commercial_campaign_v2(uuid) from public,anon;
grant execute on function public.get_admin_commercial_campaign_v2(uuid) to authenticated;

alter function public.add_commercial_campaign_item_to_cart(uuid,uuid,integer,uuid) rename to add_campaign_item_pre_spend_wave2a;
revoke all on function public.add_campaign_item_pre_spend_wave2a(uuid,uuid,integer,uuid) from public,anon,authenticated,service_role;
create function public.add_commercial_campaign_item_to_cart(p_company_id uuid,p_campaign_item_id uuid,p_quantity integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_item public.commercial_campaign_items; v_campaign public.commercial_campaigns; v_state jsonb; v_event public.commercial_campaign_engagement_events; v_cart_item public.cart_items;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'cart.manage') or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('effective-cart-pricing:' || p_company_id::text,0));
  select * into v_item from public.commercial_campaign_items where id=p_campaign_item_id for share;
  select * into v_campaign from public.commercial_campaigns where id=v_item.campaign_id for share;
  if v_campaign.mechanic_type is distinct from 'spend_threshold_promo' then
    return public.add_campaign_item_pre_spend_wave2a(p_company_id,p_campaign_item_id,p_quantity,p_request_id); end if;
  if p_request_id is null or p_quantity is null or p_quantity not between 1 and 9999 then raise exception 'CAMPAIGN_QUANTITY_INVALID' using errcode='22023'; end if;
  select * into v_event from public.commercial_campaign_engagement_events where request_id=p_request_id;
  if v_event.id is not null then
    if v_event.company_id<>p_company_id or v_event.user_id<>auth.uid() or v_event.campaign_item_id<>p_campaign_item_id
      or v_event.event_type<>'added_to_cart' or v_event.quantity<>p_quantity then raise exception 'Forbidden' using errcode='42501'; end if;
    if v_event.publication_version<>v_campaign.current_version then raise exception 'ORDER_PRICE_CHANGED' using errcode='PT409'; end if;
    select item.* into v_cart_item from public.cart_items item join public.carts cart on cart.id=item.cart_id
      where cart.company_id=p_company_id and cart.created_by=auth.uid() and cart.status='active' and item.product_id=v_item.product_id;
    return jsonb_build_object('cartItemId',v_cart_item.id,'quantity',coalesce(v_cart_item.quantity,0),'idempotent',true,
      'mechanicType','spend_threshold_promo','promoEligible',v_event.mechanic_eligible);
  end if;
  if exists(select 1 from public.commercial_campaign_spend_roles where campaign_id=v_campaign.id and product_id=v_item.product_id and role='REWARD') then
    perform 1 from public.commercial_campaign_items where campaign_id=v_campaign.id order by id for share;
    v_state := private.resolve_campaign_spend_v1(p_company_id,v_campaign.id);
    if not coalesce((v_state->>'conditionsReady')::boolean,false) or not coalesce((v_state->>'thresholdReached')::boolean,false) then
      raise exception 'CAMPAIGN_SPEND_UNAVAILABLE' using errcode='23514'; end if;
    if not coalesce((v_state->>'rewardStockReady')::boolean,false)
      or (v_state->'reward'->>'availableQuantity')::numeric < (v_state->'reward'->>'currentQuantity')::integer + p_quantity then
      raise exception 'CAMPAIGN_SPEND_STOCK_INSUFFICIENT' using errcode='23514'; end if;
  end if;
  return public.add_campaign_cart_pre_pricing_wave1b(p_company_id,p_campaign_item_id,p_quantity,p_request_id);
end;
$$;
revoke all on function public.add_commercial_campaign_item_to_cart(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.add_commercial_campaign_item_to_cart(uuid,uuid,integer,uuid) to authenticated;

comment on function private.resolve_campaign_spend_v1(uuid,uuid,uuid,boolean,jsonb) is
  'One server-owned numeric base-Partner-USD spend qualification per basket/campaign. Reward and unrelated lines never contribute. Whole reward line uses existing exact PROMO resolver subject to shared caps; no price engine or telemetry events.';
comment on function private.partner_base_price_context_v1(uuid,uuid[],text) is
  'Private batched normal-price selection reused before campaign benefits. Central cart authority validates actor/company/profile, pins source rows, and shares the result with spend qualifications and normal line resolution.';
notify pgrst,'reload schema';
commit;
