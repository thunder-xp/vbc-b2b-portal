begin;

alter table public.commercial_campaigns
  add column mechanic_type text not null default 'legacy_promo';

alter table public.commercial_campaigns
  add constraint commercial_campaign_mechanic_type_check
  check (mechanic_type in ('legacy_promo', 'quantity_threshold_promo'));

alter table public.commercial_campaign_items
  add column promo_threshold_quantity integer null;

alter table public.commercial_campaign_items
  add constraint commercial_campaign_item_promo_threshold_check
  check (promo_threshold_quantity is null or promo_threshold_quantity between 1 and 9999),
  add constraint commercial_campaign_item_promo_threshold_limit_check
  check (promo_threshold_quantity is null or maximum_quantity_per_company is null or maximum_quantity_per_company >= promo_threshold_quantity);

alter table public.commercial_campaign_engagement_events
  add column product_id uuid null references public.catalog_products(id) on delete restrict,
  add column publication_version integer null,
  add column mechanic_type text null,
  add column mechanic_threshold_quantity integer null,
  add column mechanic_eligible boolean null;

alter table public.commercial_campaign_engagement_events
  add constraint commercial_campaign_engagement_mechanic_check
  check (mechanic_type is null or mechanic_type in ('legacy_promo', 'quantity_threshold_promo')),
  add constraint commercial_campaign_engagement_threshold_check
  check (mechanic_threshold_quantity is null or mechanic_threshold_quantity between 1 and 9999);

alter table public.commercial_campaign_order_attributions
  add column product_id uuid null references public.catalog_products(id) on delete restrict,
  add column publication_version integer null,
  add column mechanic_type text null,
  add column mechanic_threshold_quantity integer null;

alter table public.commercial_campaign_order_attributions
  add constraint commercial_campaign_attribution_mechanic_check
  check (mechanic_type is null or mechanic_type in ('legacy_promo', 'quantity_threshold_promo')),
  add constraint commercial_campaign_attribution_threshold_check
  check (mechanic_threshold_quantity is null or mechanic_threshold_quantity between 1 and 9999);

create or replace function public.prevent_commercial_campaign_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'commercial_campaign_order_attributions'
    and (to_jsonb(new) - 'product_id' - 'campaign_item_id') = (to_jsonb(old) - 'product_id' - 'campaign_item_id')
    and (
      (to_jsonb(old)->>'product_id' is null and to_jsonb(new)->>'product_id' is not null)
      or (to_jsonb(old)->>'campaign_item_id' is not null and to_jsonb(new)->>'campaign_item_id' is null)
    )
  then
    return new;
  end if;
  raise exception 'Campaign history is append-only.' using errcode = '42501';
end;
$$;

update public.commercial_campaign_engagement_events event
set product_id = item.product_id
from public.commercial_campaign_items item
where item.id = event.campaign_item_id and event.product_id is null;

update public.commercial_campaign_order_attributions attribution
set product_id = item.product_id
from public.commercial_campaign_items item
where item.id = attribution.campaign_item_id and attribution.product_id is null;

alter table public.commercial_campaign_order_attributions
  alter column product_id set not null,
  alter column campaign_item_id drop not null,
  drop constraint commercial_campaign_order_attributions_campaign_item_id_fkey,
  add constraint commercial_campaign_order_attributions_campaign_item_id_fkey
    foreign key (campaign_item_id) references public.commercial_campaign_items(id) on delete set null;

alter table public.commercial_campaign_engagement_events
  drop constraint commercial_campaign_engagement_events_campaign_item_id_fkey,
  add constraint commercial_campaign_engagement_events_campaign_item_id_fkey
    foreign key (campaign_item_id) references public.commercial_campaign_items(id) on delete set null;

create or replace function public.prevent_commercial_campaign_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'commercial_campaign_order_attributions'
    and (to_jsonb(new) - 'campaign_item_id') = (to_jsonb(old) - 'campaign_item_id')
    and to_jsonb(old)->>'campaign_item_id' is not null
    and to_jsonb(new)->>'campaign_item_id' is null
  then
    return new;
  end if;
  raise exception 'Campaign history is append-only.' using errcode = '42501';
end;
$$;

comment on column public.commercial_campaigns.mechanic_type is
  'Portal-owned governed mechanic discriminator. Historical campaigns deterministically remain legacy_promo.';
comment on column public.commercial_campaign_items.promo_threshold_quantity is
  'Per-product integer quantity that unlocks the synchronized exact PROMO price; never a selling price.';

alter function public.apply_commercial_campaign_draft_v2(uuid, integer, uuid, jsonb, uuid)
  rename to apply_commercial_campaign_draft_pre_quantity_promo_wave1a;
revoke all on function public.apply_commercial_campaign_draft_pre_quantity_promo_wave1a(uuid, integer, uuid, jsonb, uuid)
  from public, anon, authenticated;

create function public.apply_commercial_campaign_draft_v2(
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
  if v_mechanic not in ('legacy_promo', 'quantity_threshold_promo') then
    raise exception 'CAMPAIGN_MECHANIC_INVALID' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_input->'items', '[]'::jsonb)) loop
    if v_item ? 'finalPrice' or v_item ? 'discountAmount' or v_item ? 'campaignPrice' then
      raise exception 'CAMPAIGN_PRICE_OWNERSHIP_DENIED' using errcode = '22023';
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

  return v_result || jsonb_build_object('mechanicType', v_mechanic);
end;
$$;

revoke all on function public.apply_commercial_campaign_draft_v2(uuid, integer, uuid, jsonb, uuid)
  from public, anon, authenticated;

alter function public.create_commercial_campaign_draft_v2(jsonb)
  rename to create_commercial_campaign_draft_pre_quantity_promo_wave1a;
revoke all on function public.create_commercial_campaign_draft_pre_quantity_promo_wave1a(jsonb)
  from public, anon, authenticated;

create function public.create_commercial_campaign_draft_v2(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if coalesce(p_input->>'contractVersion', '') not in ('2', '3') then
    raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode = '22023';
  end if;
  return public.create_commercial_campaign_draft_pre_quantity_promo_wave1a(
    jsonb_set(p_input, '{contractVersion}', '"2"'::jsonb)
  );
end;
$$;

revoke all on function public.create_commercial_campaign_draft_v2(jsonb) from public, anon;
grant execute on function public.create_commercial_campaign_draft_v2(jsonb) to authenticated;

alter function public.duplicate_commercial_campaign_v1(uuid, uuid)
  rename to duplicate_commercial_campaign_pre_quantity_promo_wave1a;
revoke all on function public.duplicate_commercial_campaign_pre_quantity_promo_wave1a(uuid, uuid)
  from public, anon, authenticated;

create function public.duplicate_commercial_campaign_v1(p_campaign_id uuid, p_request_id uuid)
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
  set promo_threshold_quantity = source.promo_threshold_quantity
  from public.commercial_campaign_items source
  where target.campaign_id = v_target
    and source.campaign_id = p_campaign_id
    and target.product_id = source.product_id;
  return v_target;
end;
$$;

revoke all on function public.duplicate_commercial_campaign_v1(uuid, uuid) from public, anon;
grant execute on function public.duplicate_commercial_campaign_v1(uuid, uuid) to authenticated;

alter function public.publish_commercial_campaign(uuid, uuid)
  rename to publish_commercial_campaign_pre_quantity_promo_wave1a;
revoke all on function public.publish_commercial_campaign_pre_quantity_promo_wave1a(uuid, uuid)
  from public, anon, authenticated;

create function public.publish_commercial_campaign(p_campaign_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_campaign public.commercial_campaigns;
  v_sku text;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.publish') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select * into v_campaign
  from public.commercial_campaigns
  where id = p_campaign_id
  for update;
  if v_campaign.id is null then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_campaign.status = 'draft' and v_campaign.mechanic_type = 'quantity_threshold_promo' then
    if exists (
      select 1
      from public.commercial_campaign_items item
      where item.campaign_id = p_campaign_id
        and (
          item.promo_threshold_quantity is null
          or item.benefit_type <> 'existing_price_profile'
          or item.governed_benefit_reference <> 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
          or (item.maximum_quantity_per_company is not null and item.maximum_quantity_per_company < item.promo_threshold_quantity)
        )
    ) then
      raise exception 'CAMPAIGN_PROMO_THRESHOLD_INVALID' using errcode = '23514';
    end if;
    select product.sku into v_sku
    from public.commercial_campaign_items item
    join public.catalog_products product on product.id = item.product_id
    where item.campaign_id = p_campaign_id
      and not exists (
        select 1
        from public.price_types profile
        join public.product_prices price
          on price.price_type_id = profile.id and price.product_id = item.product_id
        where profile.is_active
          and profile.external_ref = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
          and profile.external_code = 'UU-000021'
          and profile.name = 'PROMO'
          and upper(coalesce(nullif(btrim(profile.currency_code), ''), '')) = 'USD'
          and price.is_active and price.is_published and price.currency_status = 'resolved'
          and upper(coalesce(nullif(btrim(price.currency), ''), '')) = 'USD'
          and price.price_amount > 0
          and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
      )
    order by item.sort_order, item.id
    limit 1;
    if v_sku is not null then
      raise exception 'CAMPAIGN_PROMO_PRICE_MISSING:%', v_sku using errcode = '23514';
    end if;
  end if;
  return public.publish_commercial_campaign_pre_quantity_promo_wave1a(p_campaign_id, p_request_id);
end;
$$;

revoke all on function public.publish_commercial_campaign(uuid, uuid) from public, anon;
grant execute on function public.publish_commercial_campaign(uuid, uuid) to authenticated;

create function public.resolve_commercial_campaign_item_eligibility_v1(
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
    elsif v_item.promo_threshold_quantity is null then
      v_reason := 'invalid_threshold';
    else
      select price.price_amount into v_price
      from public.price_types profile
      join public.product_prices price
        on price.price_type_id = profile.id and price.product_id = v_item.product_id
      where profile.is_active
        and profile.external_ref = 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4'
        and profile.external_code = 'UU-000021'
        and profile.name = 'PROMO'
        and upper(coalesce(nullif(btrim(profile.currency_code), ''), '')) = 'USD'
        and price.is_active and price.is_published and price.currency_status = 'resolved'
        and upper(coalesce(nullif(btrim(price.currency), ''), '')) = 'USD'
        and price.price_amount > 0
        and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
        and (price.company_id is null or price.company_id = p_company_id)
      order by (price.company_id = p_company_id) desc, price.valid_from desc, price.updated_at desc, price.id
      limit 1;
      if v_price is null then
        v_reason := 'missing_promo';
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
    'promoPrice', case when v_price is null then null else jsonb_build_object('amount', v_price, 'currency', 'USD') end,
    'promoProfile', jsonb_build_object(
      'name', 'PROMO',
      'externalCode', 'UU-000021',
      'externalRef', 'b9f5d585-dab1-11e9-8a58-000c29cf9dd4',
      'currency', 'USD'
    )
  );
end;
$$;

revoke all on function public.resolve_commercial_campaign_item_eligibility_v1(uuid, uuid, integer) from public, anon;
grant execute on function public.resolve_commercial_campaign_item_eligibility_v1(uuid, uuid, integer) to authenticated;

alter function public.add_commercial_campaign_item_to_cart(uuid, uuid, integer, uuid)
  rename to add_commercial_campaign_item_to_cart_pre_quantity_promo_wave1a;
revoke all on function public.add_commercial_campaign_item_to_cart_pre_quantity_promo_wave1a(uuid, uuid, integer, uuid)
  from public, anon, authenticated;

create function public.add_commercial_campaign_item_to_cart(
  p_company_id uuid,
  p_campaign_item_id uuid,
  p_quantity integer,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_result jsonb;
  v_eligibility jsonb;
begin
  v_result := public.add_commercial_campaign_item_to_cart_pre_quantity_promo_wave1a(
    p_company_id, p_campaign_item_id, p_quantity, p_request_id
  );
  v_eligibility := public.resolve_commercial_campaign_item_eligibility_v1(
    p_company_id, p_campaign_item_id, (v_result->>'quantity')::integer
  );
  if v_eligibility->>'mechanicType' = 'quantity_threshold_promo'
    and v_eligibility->>'reason' in ('missing_promo', 'invalid_threshold')
  then
    raise exception 'CAMPAIGN_PROMO_UNAVAILABLE' using errcode = '23514';
  end if;
  update public.commercial_campaign_engagement_events
  set product_id = nullif(v_eligibility->>'productId', '')::uuid,
      publication_version = nullif(v_eligibility->>'publicationVersion', '')::integer,
      mechanic_type = v_eligibility->>'mechanicType',
      mechanic_threshold_quantity = nullif(v_eligibility->>'thresholdQuantity', '')::integer,
      mechanic_eligible = (v_eligibility->>'eligible')::boolean
  where request_id = p_request_id;
  return v_result || jsonb_build_object(
    'mechanicType', v_eligibility->>'mechanicType',
    'thresholdQuantity', nullif(v_eligibility->>'thresholdQuantity', '')::integer,
    'promoEligible', (v_eligibility->>'eligible')::boolean,
    'eligibilityReason', v_eligibility->>'reason'
  );
end;
$$;

revoke all on function public.add_commercial_campaign_item_to_cart(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.add_commercial_campaign_item_to_cart(uuid, uuid, integer, uuid) to authenticated;

alter function public.list_partner_commercial_campaigns(uuid, text, integer, integer)
  rename to list_partner_commercial_campaigns_pre_quantity_promo_wave1a;
revoke all on function public.list_partner_commercial_campaigns_pre_quantity_promo_wave1a(uuid, text, integer, integer)
  from public, anon, authenticated;

create function public.list_partner_commercial_campaigns(
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
      || jsonb_build_object('mechanicType', definition.mechanic_type)
      || jsonb_build_object('products', coalesce((
        select jsonb_agg(product.value || jsonb_build_object(
          'mechanicType', definition.mechanic_type,
          'promoThresholdQuantity', item.promo_threshold_quantity
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

revoke all on function public.list_partner_commercial_campaigns(uuid, text, integer, integer) from public, anon;
grant execute on function public.list_partner_commercial_campaigns(uuid, text, integer, integer) to authenticated;

alter function public.get_partner_commercial_campaign(uuid, uuid)
  rename to get_partner_commercial_campaign_pre_quantity_promo_wave1a;
revoke all on function public.get_partner_commercial_campaign_pre_quantity_promo_wave1a(uuid, uuid)
  from public, anon, authenticated;

create function public.get_partner_commercial_campaign(p_company_id uuid, p_campaign_id uuid)
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
    'promoThresholdQuantity', item.promo_threshold_quantity
  ) order by product.ordinality), '[]'::jsonb) into v_products
  from jsonb_array_elements(coalesce(v_base->'products', '[]'::jsonb)) with ordinality product(value, ordinality)
  join public.commercial_campaign_items item on item.id = (product.value->>'itemId')::uuid;
  return v_base
    || jsonb_build_object('mechanicType', coalesce(v_mechanic, 'legacy_promo'))
    || jsonb_build_object('products', v_products);
end;
$$;

revoke all on function public.get_partner_commercial_campaign(uuid, uuid) from public, anon;
grant execute on function public.get_partner_commercial_campaign(uuid, uuid) to authenticated;

alter function public.record_commercial_campaign_engagement(uuid, uuid, uuid, text, integer, uuid)
  rename to record_commercial_campaign_engagement_pre_quantity_promo_wave1a;
revoke all on function public.record_commercial_campaign_engagement_pre_quantity_promo_wave1a(uuid, uuid, uuid, text, integer, uuid)
  from public, anon, authenticated;

create function public.record_commercial_campaign_engagement(
  p_company_id uuid,
  p_campaign_id uuid,
  p_campaign_item_id uuid,
  p_event_type text,
  p_quantity integer,
  p_request_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_recorded boolean;
begin
  v_recorded := public.record_commercial_campaign_engagement_pre_quantity_promo_wave1a(
    p_company_id, p_campaign_id, p_campaign_item_id, p_event_type, p_quantity, p_request_id
  );
  if v_recorded then
    update public.commercial_campaign_engagement_events event
    set product_id = item.product_id,
        publication_version = campaign.current_version,
        mechanic_type = campaign.mechanic_type,
        mechanic_threshold_quantity = item.promo_threshold_quantity
    from public.commercial_campaigns campaign
    left join public.commercial_campaign_items item on item.id = p_campaign_item_id
    where event.request_id = p_request_id and campaign.id = p_campaign_id;
  end if;
  return v_recorded;
end;
$$;

revoke all on function public.record_commercial_campaign_engagement(uuid, uuid, uuid, text, integer, uuid) from public, anon;
grant execute on function public.record_commercial_campaign_engagement(uuid, uuid, uuid, text, integer, uuid) to authenticated;

create or replace function public.attribute_commercial_campaign_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  insert into public.commercial_campaign_order_attributions(
    campaign_id, campaign_item_id, product_id, company_id, order_id, order_item_id, quantity,
    attribution_fingerprint, publication_version, mechanic_type, mechanic_threshold_quantity
  )
  select cart_item.campaign_id, cart_item.campaign_item_id, item.product_id, orders.company_id, new.order_id, new.id, new.quantity,
    cart_item.campaign_attribution_fingerprint, campaign.current_version, campaign.mechanic_type, item.promo_threshold_quantity
  from public.partner_orders orders
  join public.cart_items cart_item on cart_item.cart_id = orders.cart_id and cart_item.product_id = new.product_id
  join public.commercial_campaigns campaign on campaign.id = cart_item.campaign_id
  join public.commercial_campaign_items item on item.id = cart_item.campaign_item_id
  where orders.id = new.order_id
    and cart_item.campaign_id is not null
    and campaign.status in ('active', 'scheduled')
    and campaign.starts_at <= now() and campaign.ends_at > now()
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.attribute_commercial_campaign_order_item() from public, anon, authenticated;

comment on function public.resolve_commercial_campaign_item_eligibility_v1(uuid, uuid, integer) is
  'Authoritative server-side Quantity to PROMO eligibility using immutable audience publication and exact synchronized 1C PROMO identity.';
comment on function public.add_commercial_campaign_item_to_cart(uuid, uuid, integer, uuid) is
  'Adds through the existing cart path and returns governed mechanic eligibility; it does not create a campaign selling-price authority.';

commit;
