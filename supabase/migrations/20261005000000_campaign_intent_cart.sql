-- Explicit commercial entry, never inferred from product/audience/engagement.
-- Created with CLI migration new; empty unapplied file ordered after the existing 23:00 release.
begin;
alter table public.cart_items
  add column commercial_source text not null default 'STANDARD',
  add column campaign_publication_version integer,
  add column campaign_mechanic_type text,
  add column commercial_context_key text generated always as (
    case when commercial_source = 'STANDARD' then 'STANDARD'
    else 'CAMPAIGN:' || campaign_id::text || ':' || campaign_publication_version::text || ':' || campaign_item_id::text end
  ) stored,
  add constraint cart_items_commercial_intent_shape check (
    (commercial_source = 'STANDARD' and campaign_publication_version is null and campaign_mechanic_type is null)
    or (commercial_source = 'CAMPAIGN' and campaign_id is not null and campaign_item_id is not null
      and campaign_publication_version is not null and campaign_publication_version > 0
      and campaign_mechanic_type is not null and campaign_mechanic_type in
        ('legacy_promo','quantity_threshold_promo','fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo'))
  );
-- Old attribution remains audit evidence only; every old row defaults STANDARD.
alter table public.cart_items drop constraint cart_items_cart_product_unique;
create unique index cart_items_standard_product_unique on public.cart_items(cart_id,product_id)
  where commercial_source = 'STANDARD';
create unique index cart_items_commercial_context_unique on public.cart_items(cart_id,product_id,commercial_context_key);
create index cart_items_campaign_context on public.cart_items(cart_id,campaign_id,campaign_publication_version)
  where commercial_source = 'CAMPAIGN';
-- Public clients already have SELECT only. Keep all intent establishment behind checked definer RPCs.
revoke insert,update,delete on public.cart_items from public,anon,authenticated,service_role;
comment on column public.cart_items.commercial_source is 'STANDARD by default, including historical attribution-only rows. CAMPAIGN is established only by an authorized offer mutation.';
comment on column public.cart_items.commercial_context_key is 'Deterministic product-context identity. Never merges STANDARD with CAMPAIGN or different publications.';

alter table public.partner_order_items add column cart_item_id uuid;
-- Snapshot ID has no cascading FK: deleting a converted cart cannot erase immutable order evidence.
alter table public.partner_order_items drop constraint partner_order_items_order_product_unique;
create unique index partner_order_items_historical_product_unique on public.partner_order_items(order_id,product_id) where cart_item_id is null;
create unique index partner_order_items_cart_line_unique on public.partner_order_items(order_id,cart_item_id) where cart_item_id is not null;
comment on column public.partner_order_items.cart_item_id is 'Exact commercial cart-line snapshot identity. Historical orders are untouched.';

-- Live items are replaced when a draft is edited; accepted context belongs to the immutable publication.
alter table public.cart_items drop constraint cart_items_campaign_item_id_fkey;
alter table public.cart_items add constraint cart_items_campaign_publication_fkey
  foreign key (campaign_id,campaign_publication_version)
  references public.commercial_campaign_versions(campaign_id,version_number) on delete restrict;
-- Prevent future draft editing from erasing the item identity on immutable order attribution.
-- No historical order/attribution rows are rewritten.
alter table public.commercial_campaign_order_attributions
  drop constraint commercial_campaign_order_attributions_campaign_item_id_fkey;
comment on column public.cart_items.campaign_item_id is 'For CAMPAIGN, immutable item identity in the referenced publication snapshot; never a mutable draft item reference.';

-- Keep a campaign's identity even if it is paused/expired. Repricing owns invalidation.
create or replace function public.enforce_commercial_campaign_cart_quantity()
returns trigger language plpgsql security definer set search_path='' set row_security=off as $$
declare item public.commercial_campaign_items; company uuid; used integer;
begin
  if tg_op='UPDATE' and (new.commercial_source is distinct from old.commercial_source or (
    old.commercial_source='CAMPAIGN' and (new.product_id,new.campaign_id,new.campaign_item_id,new.campaign_publication_version,new.campaign_mechanic_type)
    is distinct from (old.product_id,old.campaign_id,old.campaign_item_id,old.campaign_publication_version,old.campaign_mechanic_type))) then
    raise exception 'Cart commercial context is immutable' using errcode='42501'; end if;
  if new.commercial_source='STANDARD' then return new; end if;
  select (jsonb_populate_record(null::public.commercial_campaign_items,published.value)).* into item
    from public.commercial_campaign_versions version,
      lateral jsonb_array_elements(version.item_snapshot) published(value)
    where version.campaign_id=new.campaign_id and version.version_number=new.campaign_publication_version
      and published.value->>'id'=new.campaign_item_id::text
      and coalesce(version.campaign_snapshot->>'mechanic_type','legacy_promo')=new.campaign_mechanic_type;
  select c.company_id into company from public.carts c where c.id=new.cart_id;
  select coalesce(sum(quantity),0) into used from public.commercial_campaign_order_attributions
    where campaign_item_id=item.id and company_id=company;
  if item.id is null or item.campaign_id<>new.campaign_id or item.product_id<>new.product_id
    or new.quantity<item.minimum_quantity or (item.maximum_quantity_per_company is not null and used+new.quantity>item.maximum_quantity_per_company) then
    raise exception 'Campaign quantity is invalid' using errcode='23514'; end if;
  return new;
end; $$;

drop trigger enforce_campaign_cart_quantity on public.cart_items;
create trigger enforce_campaign_cart_quantity before insert or update of quantity,product_id,commercial_source,campaign_id,campaign_item_id,campaign_publication_version,campaign_mechanic_type
  on public.cart_items for each row execute function public.enforce_commercial_campaign_cart_quantity();

-- Inactive offers invalidate benefits through the resolver without erasing commercial intent.
create or replace function public.clear_inactive_campaign_cart_attribution()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('paused','completed','archived') and old.status is distinct from new.status then
    update public.cart_items set campaign_id=null,campaign_item_id=null,campaign_attribution_fingerprint=null,updated_at=now()
      where campaign_id=new.id and commercial_source='STANDARD';
  end if;
  return new;
end; $$;

create or replace function public.clear_cart_price_acknowledgement_on_quantity()
returns trigger language plpgsql security definer set search_path='' set row_security=off as $$
declare changed public.cart_items;
begin
  changed := case when tg_op='DELETE' then old else new end;
  if tg_op<>'UPDATE' or new.quantity is distinct from old.quantity then
    delete from private.partner_cart_price_reviews r using public.cart_items i
      where r.cart_item_id=i.id and i.cart_id=changed.cart_id and (i.id=changed.id or (
        changed.commercial_source='CAMPAIGN' and changed.campaign_mechanic_type in
          ('fixed_bundle_promo','conditional_attach_promo','spend_threshold_promo')
        and i.commercial_source='CAMPAIGN' and i.campaign_id=changed.campaign_id
        and i.campaign_publication_version=changed.campaign_publication_version));
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

-- Rolling-deployment compatibility for old single-context callers. Ambiguous products fail closed.
create function private.normalize_partner_order_cart_lines_v1(p_cart_id uuid,p_items jsonb)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(value || jsonb_build_object('cart_item_id',coalesce(
    nullif(value->>'cart_item_id','')::uuid,
    (select case when count(*)=1 then (array_agg(id))[1] end from public.cart_items
      where cart_id=p_cart_id and product_id=nullif(value->>'product_id','')::uuid))) order by ordinal),'[]'::jsonb)
  from jsonb_array_elements(p_items) with ordinality submitted(value,ordinal);
$$;
revoke all on function private.normalize_partner_order_cart_lines_v1(uuid,jsonb) from public,anon,authenticated,service_role;

-- Browser pins the publication it actually accepted; every other commercial fact comes from the server.
create function public.add_commercial_campaign_item_to_cart_v2(
  p_company_id uuid,p_campaign_item_id uuid,p_publication_version integer,p_quantity integer,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare campaign public.commercial_campaigns;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'cart.manage')
    or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('effective-cart-pricing:' || p_company_id::text,0));
  select c.* into campaign from public.commercial_campaigns c join public.commercial_campaign_items i
    on i.campaign_id=c.id where i.id=p_campaign_item_id for share of c,i;
  if campaign.id is null or p_publication_version is distinct from campaign.current_version then
    raise exception 'ORDER_PRICE_CHANGED' using errcode='PT409',detail='publication_changed'; end if;
  return public.add_commercial_campaign_item_to_cart(p_company_id,p_campaign_item_id,p_quantity,p_request_id);
end; $$;
revoke all on function public.add_commercial_campaign_item_to_cart_v2(uuid,uuid,integer,integer,uuid) from public,anon,service_role;
grant execute on function public.add_commercial_campaign_item_to_cart_v2(uuid,uuid,integer,integer,uuid) to authenticated;

create function public.complete_commercial_campaign_bundle_v2(
  p_company_id uuid,p_campaign_id uuid,p_publication_version integer,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare campaign public.commercial_campaigns;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'cart.manage')
    or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('effective-cart-pricing:' || p_company_id::text,0));
  select * into campaign from public.commercial_campaigns where id=p_campaign_id for share;
  if campaign.id is null or p_publication_version is distinct from campaign.current_version then
    raise exception 'ORDER_PRICE_CHANGED' using errcode='PT409',detail='publication_changed'; end if;
  return public.complete_commercial_campaign_bundle_v1(p_company_id,p_campaign_id,p_request_id);
end; $$;
revoke all on function public.complete_commercial_campaign_bundle_v2(uuid,uuid,integer,uuid) from public,anon,service_role;
grant execute on function public.complete_commercial_campaign_bundle_v2(uuid,uuid,integer,uuid) to authenticated;

drop trigger snapshot_partner_order_effective_price on public.partner_order_items;
create trigger snapshot_partner_order_effective_price before insert or update of effective_price_evidence,cart_item_id
  on public.partner_order_items for each row execute function public.snapshot_partner_order_effective_price();

-- add_partner_cart_item: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.add_partner_cart_item(target_company_id uuid, target_product_id uuid, added_quantity integer)
 RETURNS cart_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_cart public.carts;
  target_item public.cart_items;
begin
  if added_quantity < 1 or added_quantity > 9999
    or not public.can_manage_partner_order_company(target_company_id) then
    raise exception 'Cart item is not allowed.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.catalog_products product
    where product.id = target_product_id and product.is_active and product.is_visible
  ) then
    raise exception 'Catalog product is not available.' using errcode = 'P0002';
  end if;

  select * into target_cart from public.carts
  where company_id = target_company_id and created_by = auth.uid() and status = 'active'
  for update;

  if target_cart.id is null then
    insert into public.carts(company_id, created_by)
    values (target_company_id, auth.uid())
    returning * into target_cart;
  end if;

  insert into public.cart_items(cart_id, product_id, quantity)
  values (target_cart.id, target_product_id, added_quantity)
  on conflict (cart_id, product_id) where commercial_source = 'STANDARD' do update
    set quantity = public.cart_items.quantity + excluded.quantity
  returning * into target_item;

  return target_item;
end;
$function$;

-- add_partner_cart_items: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.add_partner_cart_items(target_company_id uuid, target_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_cart public.carts;
  item_count integer;
  added_count integer;
  updated_count integer;
begin
  if not public.can_manage_partner_order_company(target_company_id)
     or jsonb_typeof(target_items) <> 'array'
     or jsonb_array_length(target_items) < 1
     or jsonb_array_length(target_items) > 50 then
    raise exception 'Cart selection is not allowed.' using errcode = '42501';
  end if;

  with input as (
    select item.product_id, item.quantity
    from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
  )
  select count(*), count(distinct product_id)
  into item_count, added_count
  from input
  where product_id is not null and quantity between 1 and 9999;

  if item_count <> jsonb_array_length(target_items) or added_count <> item_count then
    raise exception 'Cart selection is invalid.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
    left join public.catalog_products product on product.id = item.product_id
    where product.id is null or not product.is_active or not product.is_visible
  ) then
    raise exception 'Catalog product is not available.' using errcode = 'P0002';
  end if;

  select * into target_cart
  from public.carts
  where company_id = target_company_id and created_by = auth.uid() and status = 'active'
  for update;

  if target_cart.id is null then
    insert into public.carts(company_id, created_by)
    values (target_company_id, auth.uid())
    returning * into target_cart;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
    join public.cart_items existing on existing.cart_id = target_cart.id and existing.product_id = item.product_id and existing.commercial_source = 'STANDARD'
    where existing.quantity + item.quantity > 9999
  ) then
    raise exception 'Cart quantity is invalid.' using errcode = '23514';
  end if;

  select count(*) into updated_count
  from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
  join public.cart_items existing on existing.cart_id = target_cart.id and existing.product_id = item.product_id and existing.commercial_source = 'STANDARD';

  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, item.product_id, item.quantity
  from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
  on conflict (cart_id, product_id) where commercial_source = 'STANDARD' do update
    set quantity = public.cart_items.quantity + excluded.quantity;

  return jsonb_build_object(
    'cart_id', target_cart.id,
    'added', item_count - updated_count,
    'updated', updated_count
  );
end;
$function$;

-- merge_order_reorder_items_into_cart: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.merge_order_reorder_items_into_cart(target_order_id uuid, target_request_key uuid, target_request_fingerprint text, target_items jsonb, target_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  source_order public.partner_order_history;
  target_cart public.carts;
  prior public.order_reorder_attempts;
  item_count integer;
  valid_count integer;
  added_ids uuid[] := '{}';
  updated_ids uuid[] := '{}';
  stored_summary jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));

  select * into prior from public.order_reorder_attempts where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.source_order_history_id <> target_order_id
      or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Reorder request key is already used.' using errcode = '23505';
    end if;
    return prior.summary || jsonb_build_object('cart_id', prior.cart_id, 'repeated', true);
  end if;

  select * into source_order from public.partner_order_history
  where id = target_order_id and partner_visible and not one_c_deletion_mark for update;
  if source_order.id is null
    or not public.has_permission(source_order.company_id, 'orders.view')
    or not public.has_permission(source_order.company_id, 'cart.manage')
    or not public.can_manage_partner_order_company(source_order.company_id) then
    raise exception 'Order reorder is not available.' using errcode = '42501';
  end if;
  if jsonb_typeof(target_items) <> 'array' then raise exception 'Reorder lines are invalid.' using errcode = '22023'; end if;

  item_count := jsonb_array_length(target_items);
  if item_count < 1 or item_count > 200 then raise exception 'Reorder line count is invalid.' using errcode = '23514'; end if;
  if (select count(distinct row.line_id) from jsonb_to_recordset(target_items) as row(line_id uuid, quantity integer)) <> item_count then
    raise exception 'Duplicate reorder line.' using errcode = '23514';
  end if;
  select count(*) into valid_count
  from jsonb_to_recordset(target_items) as row(line_id uuid, quantity integer)
  join public.partner_order_history_items item on item.id = row.line_id and item.order_history_id = source_order.id
  join public.catalog_products product on product.id = item.product_id and product.is_active and product.is_visible
  where row.quantity between 1 and 9999
    and btrim(product.external_1c_id) ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    and lower(btrim(product.external_1c_id)) <> '00000000-0000-0000-0000-000000000000';
  if valid_count <> item_count then raise exception 'A selected reorder line is unavailable.' using errcode = '23514'; end if;

  select * into target_cart from public.carts
  where company_id = source_order.company_id and created_by = auth.uid() and status = 'active' for update;
  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status)
    values (source_order.company_id, auth.uid(), 'active') returning * into target_cart;
  end if;

  with requested as (
    select item.product_id, least(9999, sum(row.quantity)::integer) as quantity
    from jsonb_to_recordset(target_items) as row(line_id uuid, quantity integer)
    join public.partner_order_history_items item on item.id = row.line_id and item.order_history_id = source_order.id
    group by item.product_id
  )
  select
    coalesce(array_agg(requested.product_id) filter (where current_item.id is null), '{}'),
    coalesce(array_agg(requested.product_id) filter (where current_item.id is not null), '{}')
  into added_ids, updated_ids
  from requested
  left join public.cart_items current_item on current_item.cart_id = target_cart.id and current_item.product_id = requested.product_id and current_item.commercial_source = 'STANDARD';

  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, item.product_id, least(9999, sum(row.quantity)::integer)
  from jsonb_to_recordset(target_items) as row(line_id uuid, quantity integer)
  join public.partner_order_history_items item on item.id = row.line_id and item.order_history_id = source_order.id
  group by item.product_id
  on conflict (cart_id, product_id) where commercial_source = 'STANDARD' do update
    set quantity = least(9999, public.cart_items.quantity + excluded.quantity), updated_at = now();

  stored_summary := jsonb_build_object(
    'added_product_ids', to_jsonb(added_ids),
    'updated_product_ids', to_jsonb(updated_ids),
    'added', cardinality(added_ids),
    'updated', cardinality(updated_ids),
    'changed_price', greatest(0, coalesce((target_summary->>'changedPrice')::integer, 0)),
    'missing_price', greatest(0, coalesce((target_summary->>'missingPrice')::integer, 0)),
    'unavailable', greatest(0, coalesce((target_summary->>'unavailable')::integer, 0)),
    'inactive', greatest(0, coalesce((target_summary->>'inactive')::integer, 0)),
    'skipped', greatest(0, coalesce((target_summary->>'skipped')::integer, 0))
  );
  insert into public.order_reorder_attempts(
    company_id, source_order_history_id, cart_id, request_key, request_fingerprint,
    selected_line_count, summary, created_by
  ) values (
    source_order.company_id, source_order.id, target_cart.id, target_request_key, target_request_fingerprint,
    item_count, stored_summary, auth.uid()
  );
  return stored_summary || jsonb_build_object('cart_id', target_cart.id, 'repeated', false);
end;
$function$;

-- merge_estimate_products_into_cart: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.merge_estimate_products_into_cart(target_company_id uuid, target_estimate_id uuid, target_version_id uuid, target_items jsonb, target_request_key uuid, target_summary jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare target_cart public.carts; prior public.estimate_cart_conversions;
begin
  select * into prior
  from public.estimate_cart_conversions
  where company_id = target_company_id and request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.direction <> 'estimate_to_cart'
       or prior.estimate_id <> target_estimate_id or prior.version_id is distinct from target_version_id then
      raise exception 'Request key is already used.' using errcode = '23505';
    end if;
    return prior.cart_id;
  end if;

  if not public.can_access_estimates(target_company_id, 'estimates.convert_to_cart')
     or not public.can_manage_partner_order_company(target_company_id)
     or not exists (
       select 1 from public.estimates estimate
       where estimate.id = target_estimate_id and estimate.company_id = target_company_id
     ) then
    raise exception 'Estimate conversion is not available.' using errcode = '42501';
  end if;

  if target_version_id is not null then
    perform 1
    from public.estimate_versions version
    where version.id = target_version_id
      and version.estimate_id = target_estimate_id
      and version.company_id = target_company_id
    for update;
    if not found then
      raise exception 'Estimate conversion is not available.' using errcode = '42501';
    end if;

    select * into prior
    from public.estimate_cart_conversions conversion
    where conversion.company_id = target_company_id
      and conversion.estimate_id = target_estimate_id
      and conversion.version_id = target_version_id
      and conversion.direction = 'estimate_to_cart'
    order by conversion.created_at, conversion.id
    limit 1;
    if prior.id is not null then
      if prior.created_by <> auth.uid() then
        raise exception 'Estimate conversion is not available.' using errcode = '42501';
      end if;
      return prior.cart_id;
    end if;
  end if;

  select * into target_cart
  from public.carts
  where company_id = target_company_id and created_by = auth.uid() and status = 'active'
  for update;
  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status)
    values (target_company_id, auth.uid(), 'active')
    returning * into target_cart;
  end if;

  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, row.product_id, least(9999, sum(row.quantity)::integer)
  from jsonb_to_recordset(target_items) as row(product_id uuid, quantity integer)
  join public.catalog_products product on product.id = row.product_id and product.is_active and product.is_visible
  where row.quantity between 1 and 9999
    and ((target_version_id is null and exists (
      select 1
      from public.estimate_items estimate_item
      where estimate_item.estimate_id = target_estimate_id
        and estimate_item.line_type = 'product'
        and estimate_item.product_id = row.product_id
    ))
    or (target_version_id is not null and exists (
      select 1
      from public.estimate_versions source_version,
        jsonb_array_elements(source_version.snapshot -> 'items') snapshot_item
      where source_version.id = target_version_id
        and snapshot_item ->> 'line_type' = 'product'
        and snapshot_item ->> 'product_id' = row.product_id::text
    )))
  group by row.product_id
  on conflict (cart_id, product_id) where commercial_source = 'STANDARD' do update
    set quantity = least(9999, public.cart_items.quantity + excluded.quantity), updated_at = now();

  insert into public.estimate_cart_conversions(
    company_id, estimate_id, version_id, cart_id, direction, request_key, summary, created_by
  ) values (
    target_company_id, target_estimate_id, target_version_id, target_cart.id,
    'estimate_to_cart', target_request_key, target_summary, auth.uid()
  );
  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (target_estimate_id, auth.uid(), 'added_to_cart');
  return target_cart.id;
end;
$function$;

-- merge_purchase_template_into_cart: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.merge_purchase_template_into_cart(target_template_id uuid, target_request_key uuid, target_request_fingerprint text, target_items jsonb, target_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare source public.purchase_templates; target_cart public.carts; prior public.purchase_template_operations; result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));
  select * into prior from public.purchase_template_operations where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.template_id <> target_template_id
      or prior.operation_type <> 'template_to_cart' or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchase template operation key is already used.' using errcode = '23505'; end if;
    return prior.result || jsonb_build_object('repeated', true);
  end if;
  select * into source from public.purchase_templates where id = target_template_id;
  if source.id is null or source.status <> 'active' or not public.can_view_purchase_template(source)
    or not public.has_permission(source.company_id, 'purchase_templates.use')
    or not public.has_permission(source.company_id, 'orders.manage') then
    raise exception 'Purchase template execution denied.' using errcode = '42501'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) not between 1 and 200
    or exists (
      select 1 from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
      where row.quantity not between 1 and 9999 or not exists (
        select 1 from public.purchase_template_items item
        join public.catalog_products product on product.id = item.product_id
        where item.id = row.item_id and item.template_id = source.id and item.product_id = row.product_id
          and product.is_active and product.is_visible
      )
    ) then raise exception 'Purchase template execution items are invalid.' using errcode = '22023'; end if;
  select * into target_cart from public.carts
  where company_id = source.company_id and created_by = auth.uid() and status = 'active' for update;
  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status) values (source.company_id, auth.uid(), 'active') returning * into target_cart;
  end if;
  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, row.product_id, least(9999, sum(row.quantity)::integer)
  from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
  group by row.product_id
  on conflict (cart_id, product_id) where commercial_source = 'STANDARD' do update
    set quantity = least(9999, public.cart_items.quantity + excluded.quantity), updated_at = now();
  update public.purchase_templates set usage_count = usage_count + 1, last_used_at = now() where id = source.id;
  result := coalesce(target_summary, '{}'::jsonb) || jsonb_build_object('cart_id', target_cart.id, 'repeated', false);
  insert into public.purchase_template_operations(request_key, operation_type, template_id, company_id, created_by, request_fingerprint, result)
  values (target_request_key, 'template_to_cart', source.id, source.company_id, auth.uid(), target_request_fingerprint, result);
  return result;
end;
$function$;

-- merge_purchasing_list_into_cart: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.merge_purchasing_list_into_cart(target_list_id uuid, target_request_key uuid, target_request_fingerprint text, target_items jsonb, target_summary jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare source public.purchasing_lists; target_cart public.carts; prior public.purchasing_list_operations; result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));
  select * into prior from public.purchasing_list_operations where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.list_id <> target_list_id or prior.operation_type <> 'list_to_cart' or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchasing list operation key is already used.' using errcode = '23505'; end if;
    return prior.result || jsonb_build_object('repeated', true);
  end if;
  select * into source from public.purchasing_lists where id = target_list_id;
  if source.id is null or source.archived_at is not null or not public.can_view_purchasing_list(source)
    or not public.has_permission(source.company_id, 'cart.manage') then raise exception 'Purchasing list conversion denied.' using errcode = '42501'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) not between 1 and 200
    or exists (select 1 from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
      where row.quantity not between 1 and 9999 or not exists (
        select 1 from public.purchasing_list_items item join public.catalog_products product on product.id = item.product_id
        where item.id = row.item_id and item.list_id = source.id and item.product_id = row.product_id and product.is_active and product.is_visible))
  then raise exception 'Purchasing list conversion items are invalid.' using errcode = '22023'; end if;
  select * into target_cart from public.carts where company_id = source.company_id and created_by = auth.uid() and status = 'active' for update;
  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status) values (source.company_id, auth.uid(), 'active') returning * into target_cart;
  end if;
  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, row.product_id, least(9999, sum(row.quantity)::integer)
  from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
  group by row.product_id
  on conflict (cart_id, product_id) where commercial_source = 'STANDARD' do update set quantity = least(9999, public.cart_items.quantity + excluded.quantity), updated_at = now();
  result := coalesce(target_summary, '{}'::jsonb) || jsonb_build_object('cart_id', target_cart.id, 'repeated', false);
  insert into public.purchasing_list_operations(request_key, operation_type, list_id, company_id, created_by, request_fingerprint, result)
  values (target_request_key, 'list_to_cart', source.id, source.company_id, auth.uid(), target_request_fingerprint, result);
  insert into public.purchasing_list_events(list_id, actor_user_id, event_type, metadata)
  values (source.id, auth.uid(), 'added_to_cart', jsonb_build_object('item_count', jsonb_array_length(target_items)));
  return result;
end;
$function$;

-- transfer_estimate_to_cart_v2: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.transfer_estimate_to_cart_v2(target_estimate_id uuid, target_request_key uuid, target_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_id uuid := auth.uid();
  target_estimate public.estimates;
  target_cart public.carts;
  prior public.estimate_cart_conversions;
  correlation_id uuid := gen_random_uuid();
  input_count integer;
  expected_count integer;
  distinct_line_count integer;
  external_count integer;
  inserted_demand_count integer := 0;
  result_summary jsonb;
begin
  if actor_id is null or target_request_key is null
    or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) > 500 then
    raise exception 'Estimate transfer input is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || target_request_key::text, 0));

  select * into target_estimate
  from public.estimates estimate
  where estimate.id = target_estimate_id
  for update;

  if target_estimate.id is null or target_estimate.deleted_at is not null
    or not public.can_access_estimates(target_estimate.company_id, 'estimates.convert_to_cart')
    or not public.can_manage_partner_order_company(target_estimate.company_id) then
    raise exception 'Estimate transfer is not available.' using errcode = '42501';
  end if;

  select * into prior
  from public.estimate_cart_conversions conversion
  where conversion.company_id = target_estimate.company_id
    and conversion.request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> actor_id or prior.estimate_id <> target_estimate_id
      or prior.direction <> 'estimate_to_cart' then
      raise exception 'Request key is already used.' using errcode = '23505';
    end if;
    return prior.summary || jsonb_build_object('cartId', prior.cart_id, 'repeated', true);
  end if;

  with input_lines as (
    select row.line_id, row.product_id, row.requested_quantity
    from jsonb_to_recordset(target_items) as row(
      line_id uuid,
      product_id uuid,
      requested_quantity integer,
      current_price numeric,
      currency_code text,
      available_quantity numeric,
      stock_status text
    )
  )
  select count(*), count(distinct line_id)
  into input_count, distinct_line_count
  from input_lines;

  select count(*) into expected_count
  from public.estimate_items line
  where line.estimate_id = target_estimate.id and line.line_type = 'product';

  if input_count <> expected_count or distinct_line_count <> input_count
    or exists (
      select 1
      from jsonb_to_recordset(target_items) as row(
        line_id uuid,
        product_id uuid,
        requested_quantity integer,
        current_price numeric,
        currency_code text,
        available_quantity numeric,
        stock_status text
      )
      left join public.estimate_items line
        on line.id = row.line_id
       and line.estimate_id = target_estimate.id
       and line.line_type = 'product'
       and line.product_id = row.product_id
      where line.id is null
        or line.quantity <> trunc(line.quantity)
        or row.requested_quantity <> line.quantity::integer
        or row.requested_quantity not between 1 and 9999
        or (row.available_quantity is not null and row.available_quantity < 0)
        or (row.currency_code is not null and upper(row.currency_code) !~ '^[A-Z]{3}$')
        or row.stock_status not in ('FULLY_AVAILABLE', 'PARTIAL_STOCK', 'OUT_OF_STOCK', 'STOCK_UNKNOWN', 'NOT_STOCKED')
    ) then
    raise exception 'Estimate transfer lines do not match the persisted estimate.' using errcode = '22023';
  end if;

  select * into target_cart
  from public.carts cart
  where cart.company_id = target_estimate.company_id
    and cart.created_by = actor_id
    and cart.status = 'active'
  for update;

  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status)
    values (target_estimate.company_id, actor_id, 'active')
    returning * into target_cart;
  end if;

  -- Existing product lines receive only the delta from this Estimate source.
  with input_lines as (
    select row.line_id, row.product_id, row.requested_quantity
    from jsonb_to_recordset(target_items) as row(line_id uuid, product_id uuid, requested_quantity integer)
  ), desired as (
    select input.product_id,
      sum(input.requested_quantity)::integer desired_quantity,
      sum(input.requested_quantity - coalesce(source.governed_quantity, 0))::integer delta_quantity
    from input_lines input
    left join public.cart_item_sources source
      on source.cart_id = target_cart.id
     and source.source_type = 'estimate'
     and source.source_estimate_id = target_estimate.id
     and source.source_estimate_line_id = input.line_id
    group by input.product_id
  )
  update public.cart_items item
  set quantity = least(9999, greatest(1, item.quantity + desired.delta_quantity)),
      updated_at = now()
  from desired
  where item.cart_id = target_cart.id
    and item.product_id = desired.product_id and item.commercial_source = 'STANDARD';

  with input_lines as (
    select row.product_id, row.requested_quantity
    from jsonb_to_recordset(target_items) as row(product_id uuid, requested_quantity integer)
  )
  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, input.product_id, least(9999, sum(input.requested_quantity)::integer)
  from input_lines input
  group by input.product_id
  on conflict (cart_id, product_id) where commercial_source = 'STANDARD' do nothing;

  with input_lines as (
    select row.line_id, row.product_id, row.requested_quantity
    from jsonb_to_recordset(target_items) as row(line_id uuid, product_id uuid, requested_quantity integer)
  )
  insert into public.cart_item_sources(
    cart_id, cart_item_id, source_type, source_estimate_id,
    source_estimate_line_id, governed_quantity, created_by
  )
  select target_cart.id, item.id, 'estimate', target_estimate.id,
    input.line_id, input.requested_quantity, actor_id
  from input_lines input
  join public.cart_items item
    on item.cart_id = target_cart.id and item.product_id = input.product_id and item.commercial_source = 'STANDARD'
  on conflict (cart_id, source_type, source_estimate_id, source_estimate_line_id)
  do update set
    cart_item_id = excluded.cart_item_id,
    governed_quantity = excluded.governed_quantity,
    updated_at = now();

  -- A transfer is also the explicit request boundary for existing external
  -- nomenclature. It reuses that workflow and never creates catalog demand.
  with external_lines as (
    select line.id, line.quantity, line.unit, line.external_nomenclature_id
    from public.estimate_items line
    where line.estimate_id = target_estimate.id and line.line_type = 'external'
  ), candidates as (
    select request.id, request.status old_status, external_lines.quantity,
      external_lines.unit
    from public.estimate_external_item_requests request
    join external_lines on external_lines.id = request.estimate_item_id
    where request.status is null or request.status = 'cancelled'
    for update of request
  ), changed as (
    update public.estimate_external_item_requests request
    set status = 'new',
        version = request.version + 1,
        requested_by = coalesce(request.requested_by, actor_id),
        requested_at = coalesce(request.requested_at, now()),
        cancelled_by = null,
        cancelled_at = null,
        final_customer_id = target_estimate.final_customer_id,
        final_customer_industry_code = customer.industry_code,
        final_customer_locality = customer.locality,
        project_name = target_estimate.project_name,
        estimate_lifecycle_status = target_estimate.lifecycle_status,
        requested_quantity = candidates.quantity,
        requested_unit = candidates.unit,
        updated_at = now()
    from candidates
    left join public.partner_final_customers customer
      on customer.id = target_estimate.final_customer_id
     and customer.company_id = target_estimate.company_id
    where request.id = candidates.id
    returning request.id, request.company_id, request.status,
      request.estimate_item_id, request.external_nomenclature_id,
      request.requested_quantity, request.requested_unit,
      candidates.old_status
  )
  insert into public.estimate_external_item_request_events(
    request_id, company_id, actor_user_id, event_type, from_status, to_status, context
  )
  select changed.id, changed.company_id, actor_id,
    case when changed.old_status = 'cancelled' then 'reopened' else 'requested' end,
    changed.old_status, 'new',
    jsonb_build_object(
      'estimateId', target_estimate.id,
      'estimateItemId', changed.estimate_item_id,
      'externalNomenclatureId', changed.external_nomenclature_id,
      'quantity', changed.requested_quantity,
      'unit', changed.requested_unit,
      'source', 'estimate_transfer',
      'correlationId', correlation_id
    )
  from changed;

  select count(*) into external_count
  from public.estimate_items line
  where line.estimate_id = target_estimate.id and line.line_type = 'external';

  with input_lines as (
    select row.line_id, row.product_id, row.requested_quantity,
      row.current_price, upper(row.currency_code) currency_code,
      row.available_quantity, row.stock_status
    from jsonb_to_recordset(target_items) as row(
      line_id uuid,
      product_id uuid,
      requested_quantity integer,
      current_price numeric,
      currency_code text,
      available_quantity numeric,
      stock_status text
    )
  ), demand_rows as (
    select input.*, product.sku, product.name product_name,
      product.category_id, category.name category_name,
      product.brand_id, brand.name brand_name,
      greatest(input.requested_quantity - input.available_quantity, 0)::numeric shortage_quantity,
      case
        when input.stock_status = 'NOT_STOCKED' then 'NOT_STOCKED'
        when input.available_quantity = 0 then 'OUT_OF_STOCK'
        else 'PARTIAL_STOCK'
      end demand_reason,
      encode(extensions.digest(concat_ws('|',
        target_estimate.company_id::text, target_estimate.id::text, input.line_id::text,
        input.requested_quantity::text, input.available_quantity::text,
        greatest(input.requested_quantity - input.available_quantity, 0)::text,
        input.stock_status
      ), 'sha256'), 'hex') state_fingerprint
    from input_lines input
    join public.catalog_products product on product.id = input.product_id
    left join public.catalog_categories category on category.id = product.category_id
    left join public.catalog_brands brand on brand.id = product.brand_id
    where input.available_quantity is not null
      and input.available_quantity < input.requested_quantity
  ), inserted as (
    insert into public.unmet_assortment_demand_events(
      partner_company_id, partner_user_id, estimate_id, estimate_line_id,
      final_customer_id, product_id, sku, product_name,
      category_id, category_name, brand_id, brand_name,
      requested_quantity, available_quantity, shortage_quantity,
      price_at_demand, currency_code, demand_reason,
      state_fingerprint, correlation_id
    )
    select target_estimate.company_id, actor_id, target_estimate.id, demand.line_id,
      target_estimate.final_customer_id, demand.product_id, demand.sku, demand.product_name,
      demand.category_id, demand.category_name, demand.brand_id, demand.brand_name,
      demand.requested_quantity, demand.available_quantity, demand.shortage_quantity,
      demand.current_price, demand.currency_code, demand.demand_reason,
      demand.state_fingerprint, correlation_id
    from demand_rows demand
    on conflict (partner_company_id, estimate_id, estimate_line_id, state_fingerprint) do nothing
    returning *
  ), rollup as (
    select occurred_at::date bucket_date, partner_company_id, partner_user_id,
      product_id, sku, product_name, category_id, category_name, brand_id, brand_name,
      coalesce(brand_id::text, '-') || ':' || coalesce(category_id::text, '-') dimension_key,
      currency_code, coalesce(currency_code, '-') currency_key,
      count(*)::integer request_count,
      sum(requested_quantity) requested_quantity,
      sum(available_quantity) available_quantity,
      sum(shortage_quantity) shortage_quantity,
      sum(coalesce(price_at_demand, 0) * shortage_quantity) potential_value,
      max(occurred_at) last_demand_at
    from inserted
    group by occurred_at::date, partner_company_id, partner_user_id,
      product_id, sku, product_name, category_id, category_name, brand_id, brand_name,
      currency_code
  ), rolled_up as (
    insert into public.unmet_assortment_demand_daily(
      bucket_date, partner_company_id, partner_user_id, product_id,
      sku, product_name, category_id, category_name, brand_id, brand_name,
      dimension_key, currency_code, currency_key, request_count,
      requested_quantity, available_quantity, shortage_quantity,
      potential_value, last_demand_at
    )
    select bucket_date, partner_company_id, partner_user_id, product_id,
      sku, product_name, category_id, category_name, brand_id, brand_name,
      dimension_key, currency_code, currency_key, request_count,
      requested_quantity, available_quantity, shortage_quantity,
      potential_value, last_demand_at
    from rollup
    on conflict (
      bucket_date, partner_company_id, partner_user_id, product_id,
      dimension_key, currency_key
    ) do update set
      request_count = public.unmet_assortment_demand_daily.request_count + excluded.request_count,
      requested_quantity = public.unmet_assortment_demand_daily.requested_quantity + excluded.requested_quantity,
      available_quantity = public.unmet_assortment_demand_daily.available_quantity + excluded.available_quantity,
      shortage_quantity = public.unmet_assortment_demand_daily.shortage_quantity + excluded.shortage_quantity,
      potential_value = public.unmet_assortment_demand_daily.potential_value + excluded.potential_value,
      last_demand_at = greatest(public.unmet_assortment_demand_daily.last_demand_at, excluded.last_demand_at)
    returning request_count
  )
  select coalesce(sum(request_count), 0)::integer into inserted_demand_count
  from rolled_up;

  select jsonb_build_object(
    'totalLines', input_count + external_count,
    'catalogLines', input_count,
    'fullyAvailable', count(*) filter (where state = 'FULLY_AVAILABLE'),
    'partiallyAvailable', count(*) filter (where state = 'PARTIAL_STOCK'),
    'unavailable', count(*) filter (where state in ('OUT_OF_STOCK', 'NOT_STOCKED')),
    'stockUnknown', count(*) filter (where state = 'STOCK_UNKNOWN'),
    'externalLines', external_count,
    'changedPrice', count(*) filter (where price_changed),
    'demandCaptured', inserted_demand_count,
    'correlationId', correlation_id,
    'repeated', false
  ) into result_summary
  from (
    select row.stock_status state,
      line.source_unit_price is not null and row.current_price is distinct from line.source_unit_price price_changed
    from jsonb_to_recordset(target_items) as row(
      line_id uuid,
      current_price numeric,
      stock_status text
    )
    join public.estimate_items line on line.id = row.line_id
  ) classified;

  insert into public.estimate_cart_conversions(
    company_id, estimate_id, cart_id, direction, request_key, summary, created_by
  ) values (
    target_estimate.company_id, target_estimate.id, target_cart.id,
    'estimate_to_cart', target_request_key, result_summary, actor_id
  );

  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (target_estimate.id, actor_id, 'estimate_transferred_to_cart');
  if inserted_demand_count > 0 then
    insert into public.estimate_events(estimate_id, actor_user_id, event_type)
    values (target_estimate.id, actor_id, 'unmet_assortment_demand_captured');
  end if;

  return result_summary || jsonb_build_object('cartId', target_cart.id);
end;
$function$;

-- add_commercial_campaign_item_to_cart_pre_quantity_promo_wave1a: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.add_commercial_campaign_item_to_cart_pre_quantity_promo_wave1a(p_company_id uuid, p_campaign_item_id uuid, p_quantity integer, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare actor uuid:=auth.uid(); item public.commercial_campaign_items; campaign public.commercial_campaigns; cart public.carts; cart_item public.cart_items; event public.commercial_campaign_engagement_events; used integer; fingerprint text;
begin
  if actor is null or not public.has_permission(p_company_id,'cart.manage') or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_request_id is null or p_quantity is null or p_quantity not between 1 and 9999 then raise exception 'CAMPAIGN_QUANTITY_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('effective-cart-pricing:' || p_company_id::text,0));
  select * into item from public.commercial_campaign_items where id=p_campaign_item_id for share;
  if item.id is not null then select * into campaign from public.commercial_campaigns where id=item.campaign_id for share; end if;
  if item.id is null or campaign.status not in ('active','scheduled') or campaign.starts_at>now() or campaign.ends_at<=now()
    or not exists(select 1 from public.commercial_campaign_audience_snapshots audience where audience.campaign_id=campaign.id and audience.version_number=campaign.current_version and audience.company_id=p_company_id and audience.included)
    or p_quantity<item.minimum_quantity then raise exception 'Campaign item unavailable' using errcode='23514'; end if;
  if not exists(select 1 from public.commercial_campaign_versions version, lateral jsonb_array_elements(version.item_snapshot) published_item
    where version.campaign_id=campaign.id and version.version_number=campaign.current_version
      and published_item->>'id'=item.id::text and published_item->>'product_id'=item.product_id::text
      and coalesce(version.campaign_snapshot->>'mechanic_type','legacy_promo')=campaign.mechanic_type) then
    raise exception 'ORDER_PRICE_CHANGED' using errcode='PT409',detail='invalid_publication'; end if;
  select * into event from public.commercial_campaign_engagement_events where request_id=p_request_id;
  if event.id is not null then
    if event.company_id<>p_company_id or event.user_id<>actor or event.campaign_item_id<>p_campaign_item_id
      or event.event_type<>'added_to_cart' or event.quantity<>p_quantity then raise exception 'Forbidden' using errcode='42501'; end if;
    if event.publication_version is distinct from campaign.current_version then raise exception 'ORDER_PRICE_CHANGED' using errcode='PT409'; end if;
    select ci.* into cart_item from public.cart_items ci join public.carts c on c.id=ci.cart_id
      where c.company_id=p_company_id and c.created_by=actor and c.status='active'
        and ci.product_id=item.product_id and ci.commercial_source='CAMPAIGN' and ci.campaign_item_id=item.id
        and ci.campaign_id=campaign.id and ci.campaign_publication_version=campaign.current_version;
    return jsonb_build_object('cartItemId',cart_item.id,'quantity',coalesce(cart_item.quantity,0),'campaignId',campaign.id,'idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(item.id::text||':'||p_company_id::text,0));
  select coalesce(sum(attribution.quantity),0) into used from public.commercial_campaign_order_attributions attribution where attribution.campaign_item_id=item.id and attribution.company_id=p_company_id;
  if item.maximum_quantity_per_company is not null and used+p_quantity>item.maximum_quantity_per_company then raise exception 'Campaign company limit exceeded' using errcode='23514'; end if;
  select * into cart from public.carts where company_id=p_company_id and created_by=actor and status='active' for update;
  if cart.id is null then insert into public.carts(company_id,created_by) values(p_company_id,actor) returning * into cart; end if;
  fingerprint:=encode(digest(campaign.id::text||':'||campaign.current_version||':'||item.id::text||':'||p_company_id::text,'sha256'),'hex');
  insert into public.cart_items(cart_id,product_id,quantity,campaign_id,campaign_item_id,campaign_attribution_fingerprint,commercial_source,campaign_publication_version,campaign_mechanic_type)
  values(cart.id,item.product_id,p_quantity,campaign.id,item.id,fingerprint,'CAMPAIGN',campaign.current_version,campaign.mechanic_type)
  on conflict(cart_id,product_id,commercial_context_key) do update set quantity=public.cart_items.quantity+excluded.quantity,campaign_id=excluded.campaign_id,campaign_item_id=excluded.campaign_item_id,campaign_attribution_fingerprint=excluded.campaign_attribution_fingerprint
  returning * into cart_item;
  if item.maximum_quantity_per_company is not null and used+cart_item.quantity>item.maximum_quantity_per_company then raise exception 'Campaign company limit exceeded' using errcode='23514'; end if;
  insert into public.commercial_campaign_engagement_events(request_id,campaign_id,campaign_item_id,company_id,user_id,event_type,quantity)
  values(p_request_id,campaign.id,item.id,p_company_id,actor,'added_to_cart',p_quantity) on conflict(request_id) do nothing;
  return jsonb_build_object('cartItemId',cart_item.id,'quantity',cart_item.quantity,'campaignId',campaign.id);
end; $function$;

-- complete_commercial_campaign_bundle_v1: preserve existing authorization/business guards; change commercial identity only.
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
$function$;

-- add_campaign_item_pre_spend_wave2a: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.add_campaign_item_pre_spend_wave2a(p_company_id uuid, p_campaign_item_id uuid, p_quantity integer, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare v_item public.commercial_campaign_items; v_campaign public.commercial_campaigns; v_state jsonb;
  v_event public.commercial_campaign_engagement_events; v_result jsonb; v_cart_item public.cart_items;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'cart.manage') or not public.has_permission(p_company_id,'campaigns.view') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('effective-cart-pricing:' || p_company_id::text,0));
  select * into v_item from public.commercial_campaign_items where id=p_campaign_item_id for share;
  select * into v_campaign from public.commercial_campaigns where id=v_item.campaign_id for share;
  if v_campaign.mechanic_type='conditional_attach_promo' then
    if p_request_id is null or p_quantity is null or p_quantity not between 1 and 9999 then
      raise exception 'CAMPAIGN_QUANTITY_INVALID' using errcode='22023'; end if;
    select * into v_event from public.commercial_campaign_engagement_events where request_id=p_request_id;
    if v_event.id is not null then
      if v_event.company_id<>p_company_id or v_event.user_id<>auth.uid() or v_event.campaign_item_id<>p_campaign_item_id
        or v_event.event_type<>'added_to_cart' or v_event.quantity<>p_quantity then raise exception 'Forbidden' using errcode='42501'; end if;
      if v_event.publication_version<>v_campaign.current_version then raise exception 'ORDER_PRICE_CHANGED' using errcode='PT409'; end if;
      select i.* into v_cart_item from public.cart_items i join public.carts c on c.id=i.cart_id
        where c.company_id=p_company_id and c.created_by=auth.uid() and c.status='active' and i.product_id=v_item.product_id and i.commercial_source='CAMPAIGN'
        and i.campaign_id=v_campaign.id and i.campaign_item_id=v_item.id and i.campaign_publication_version=v_campaign.current_version;
      return jsonb_build_object('cartItemId',v_cart_item.id,'quantity',coalesce(v_cart_item.quantity,0),'idempotent',true,
        'mechanicType','conditional_attach_promo','promoEligible',v_event.mechanic_eligible);
    end if;
  end if;
  if v_campaign.mechanic_type='conditional_attach_promo' and v_item.attach_role='REWARD' then
    perform 1 from public.commercial_campaign_items where campaign_id=v_campaign.id order by id for share;
    v_state := private.resolve_campaign_attach_v1(p_company_id,v_campaign.id);
    if not coalesce((v_state->>'conditionsReady')::boolean,false) or not coalesce((v_state->>'triggersSatisfied')::boolean,false) then
      raise exception 'CAMPAIGN_ATTACH_UNAVAILABLE' using errcode='23514'; end if;
    if not (v_state->>'triggerStockReady')::boolean or not (v_state->>'rewardStockReady')::boolean then
      raise exception 'CAMPAIGN_ATTACH_STOCK_INSUFFICIENT' using errcode='23514'; end if;
    if (v_state->'reward'->>'availableQuantity')::numeric < (v_state->'reward'->>'currentQuantity')::integer + p_quantity then
      raise exception 'CAMPAIGN_ATTACH_STOCK_INSUFFICIENT' using errcode='23514'; end if;
  end if;
  v_result := public.add_campaign_cart_pre_pricing_wave1b(p_company_id,p_campaign_item_id,p_quantity,p_request_id);
  if v_campaign.mechanic_type='conditional_attach_promo' and not exists(
    select 1 from public.commercial_campaign_engagement_events where request_id=p_request_id
      and company_id=p_company_id and user_id=auth.uid() and campaign_item_id=p_campaign_item_id and quantity=p_quantity
  ) then raise exception 'Forbidden' using errcode='42501'; end if;
  return v_result;
end;
$function$;

-- add_commercial_campaign_item_to_cart: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.add_commercial_campaign_item_to_cart(p_company_id uuid, p_campaign_item_id uuid, p_quantity integer, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
      where cart.company_id=p_company_id and cart.created_by=auth.uid() and cart.status='active' and item.product_id=v_item.product_id and item.commercial_source='CAMPAIGN'
        and item.campaign_id=v_campaign.id and item.campaign_item_id=v_item.id and item.campaign_publication_version=v_campaign.current_version;
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
$function$;

-- resolve_campaign_component_conditions_v1: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION private.resolve_campaign_component_conditions_v1(p_company_id uuid, p_campaign_item_id uuid, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
    elsif not exists (
      select 1 from public.commercial_campaign_versions version,
        lateral jsonb_array_elements(version.item_snapshot) published_item
      where version.campaign_id = v_campaign.id and version.version_number = v_campaign.current_version
        and coalesce(version.campaign_snapshot->>'mechanic_type','legacy_promo') = v_campaign.mechanic_type
        and published_item->>'id' = v_item.id::text
        and published_item->>'product_id' = v_item.product_id::text
        and case when v_campaign.mechanic_type = 'legacy_promo' then true
          when v_campaign.mechanic_type = 'fixed_bundle_promo'
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
$function$;

-- resolve_campaign_bundle_v1: preserve existing authorization/business guards; change commercial identity only.
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
$function$;

-- resolve_campaign_attach_v1: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION private.resolve_campaign_attach_v1(p_company_id uuid, p_campaign_id uuid, p_cart_id uuid DEFAULT NULL::uuid, p_include_prices boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  v_campaign public.commercial_campaigns; v_cart public.carts; v_item record;
  v_definition jsonb; v_published jsonb; v_reward jsonb; v_conditions jsonb;
  v_triggers jsonb := '[]'::jsonb; v_ready boolean := true; v_complete boolean := true;
  v_trigger_stock boolean := true; v_reward_stock boolean := true; v_present boolean := false;
  v_reason text := 'eligible';
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into v_cart from public.carts where company_id = p_company_id and created_by = auth.uid()
    and status in ('active','submitting') and (p_cart_id is null or id = p_cart_id)
    order by (status = 'active') desc, created_at desc limit 1;
  if p_cart_id is not null and v_cart.id is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into v_campaign from public.commercial_campaigns where id = p_campaign_id;
  select jsonb_agg(jsonb_build_object('id',id,'product_id',product_id,'attach_role',attach_role,
    'required_trigger_quantity',required_trigger_quantity,'minimum_quantity',minimum_quantity,
    'maximum_quantity_per_company',maximum_quantity_per_company,'benefit_type',benefit_type,
    'governed_benefit_reference',governed_benefit_reference) order by product_id)
  into v_definition from public.commercial_campaign_items where campaign_id = p_campaign_id;
  select jsonb_agg(jsonb_build_object('id',value->'id','product_id',value->'product_id','attach_role',value->'attach_role',
    'required_trigger_quantity',value->'required_trigger_quantity','minimum_quantity',value->'minimum_quantity',
    'maximum_quantity_per_company',value->'maximum_quantity_per_company','benefit_type',value->'benefit_type',
    'governed_benefit_reference',value->'governed_benefit_reference') order by value->>'product_id')
  into v_published from public.commercial_campaign_versions version,
    lateral jsonb_array_elements(version.item_snapshot) where version.campaign_id = p_campaign_id
    and version.version_number = v_campaign.current_version
    and version.campaign_snapshot->>'mechanic_type' = 'conditional_attach_promo';
  if v_campaign.mechanic_type is distinct from 'conditional_attach_promo'
    or coalesce(jsonb_array_length(v_definition),0) < 2 or v_definition is distinct from v_published
    or (select count(*) from public.commercial_campaign_items where campaign_id = p_campaign_id and attach_role = 'REWARD') <> 1
    or not exists (select 1 from public.commercial_campaign_items where campaign_id = p_campaign_id and attach_role = 'TRIGGER') then
    v_ready := false; v_reason := 'invalid_publication'; end if;
  for v_item in select i.*, p.sku, p.name, coalesce(ci.quantity,0) as current_quantity,
      case when stock.is_published and stock.freshness_state = 'authoritative' then stock.available_quantity end as available_quantity
    from public.commercial_campaign_items i join public.catalog_products p on p.id = i.product_id
    left join public.cart_items ci on ci.cart_id = v_cart.id and ci.product_id = i.product_id and ci.commercial_source='CAMPAIGN'
      and ci.campaign_id=p_campaign_id and ci.campaign_publication_version=v_campaign.current_version and ci.campaign_item_id=i.id
    left join public.product_stock_totals stock on stock.product_id = i.product_id
    where i.campaign_id = p_campaign_id order by i.sort_order,i.id loop
    if v_item.attach_role = 'TRIGGER' then
      if v_item.required_trigger_quantity is null or v_item.current_quantity < v_item.required_trigger_quantity then v_complete := false; end if;
      if v_item.maximum_quantity_per_company is not null and v_item.current_quantity + (
        select coalesce(sum(quantity),0) from public.commercial_campaign_order_attributions
        where campaign_item_id = v_item.id and company_id = p_company_id) > v_item.maximum_quantity_per_company then
        v_ready := false; v_reason := 'company_limit'; end if;
      if v_item.available_quantity is not null and v_item.available_quantity < greatest(v_item.current_quantity,v_item.required_trigger_quantity) then v_trigger_stock := false; end if;
      v_triggers := v_triggers || jsonb_build_array(jsonb_build_object('campaignItemId',v_item.id,'productId',v_item.product_id,
        'sku',v_item.sku,'name',v_item.name,'requiredTriggerQuantity',v_item.required_trigger_quantity,
        'currentQuantity',v_item.current_quantity,'missingQuantity',greatest(v_item.required_trigger_quantity-v_item.current_quantity,0),
        'availableQuantity',v_item.available_quantity));
    elsif v_item.attach_role = 'REWARD' then
      v_present := v_item.current_quantity > 0;
      v_conditions := private.resolve_campaign_component_conditions_v1(p_company_id,v_item.id,greatest(v_item.current_quantity,v_item.minimum_quantity));
      if not coalesce((v_conditions->>'eligible')::boolean,false) then v_ready := false; v_reason := v_conditions->>'reason'; end if;
      if v_item.available_quantity is not null and v_item.available_quantity < greatest(v_item.current_quantity,v_item.minimum_quantity) then v_reward_stock := false; end if;
      v_reward := (case when p_include_prices then v_conditions else v_conditions - 'promoPrice' - 'promoProfile' end)
        || jsonb_build_object('sku',v_item.sku,'name',v_item.name,'minimumQuantity',v_item.minimum_quantity,
          'currentQuantity',v_item.current_quantity,'availableQuantity',v_item.available_quantity,'attachRole','REWARD');
    else v_ready := false; v_reason := 'invalid_publication'; end if;
  end loop;
  if v_ready and not v_complete then v_reason := 'incomplete_triggers';
  elsif v_ready and not v_present then v_reason := 'reward_absent'; end if;
  return jsonb_build_object('campaignId',p_campaign_id,'publicationVersion',v_campaign.current_version,
    'conditionsReady',v_ready,'triggersSatisfied',v_complete,'rewardPresent',v_present,
    'eligible',v_ready and v_complete and v_present,'triggerStockReady',v_trigger_stock,'rewardStockReady',v_reward_stock,
    'reason',v_reason,'triggers',v_triggers,'reward',v_reward);
end;
$function$;

-- resolve_campaign_spend_v1: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION private.resolve_campaign_spend_v1(p_company_id uuid, p_campaign_id uuid, p_cart_id uuid DEFAULT NULL::uuid, p_include_prices boolean DEFAULT false, p_base_prices jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
    left join public.cart_items cart_item on cart_item.cart_id=v_cart.id and cart_item.product_id=item.product_id and cart_item.commercial_source='CAMPAIGN'
      and cart_item.campaign_id=p_campaign_id and cart_item.campaign_publication_version=v_campaign.current_version and cart_item.campaign_item_id=item.id
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
$function$;

-- get_partner_commercial_campaign: preserve existing authorization/business guards; change commercial identity only.
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
  return private.project_campaign_spend_v1(p_company_id,v_result) || jsonb_build_object('publicationVersion',
    (select current_version from public.commercial_campaigns where id=p_campaign_id));
end;
$function$;

-- resolve_partner_cart_prices_internal_v1: preserve existing authorization/business guards; change commercial identity only.
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
$function$;

-- validate_partner_order_submission_v5: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.validate_partner_order_submission_v5(target_cart_id uuid, target_expected_intent_version bigint, target_delivery_date date, target_payment_method text, target_payment_date date, target_fulfillment_method text, target_carrier_id uuid, target_request_fingerprint text, target_payload jsonb, target_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
  target_items := private.normalize_partner_order_cart_lines_v1(target_cart_id,target_items);
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
    from jsonb_to_recordset(target_items) as item(cart_item_id uuid, product_id uuid, quantity integer)
    group by item.cart_item_id
    having count(*) > 1 or item.cart_item_id is null
  ) then
    return jsonb_build_object('valid', false, 'code', 'ORDER_PAYLOAD_VALIDATION_FAILED',
      'stage', 'line_identity_validation');
  end if;

  if exists (
    (select item.id, item.product_id, item.quantity
       from public.cart_items item where item.cart_id = target_cart.id
     except
     select submitted.cart_item_id, submitted.product_id, submitted.quantity
       from jsonb_to_recordset(target_items) submitted(cart_item_id uuid, product_id uuid, quantity integer))
    union all
    (select submitted.cart_item_id, submitted.product_id, submitted.quantity
       from jsonb_to_recordset(target_items) submitted(cart_item_id uuid, product_id uuid, quantity integer)
     except
     select item.id, item.product_id, item.quantity
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
    left join jsonb_to_recordset(target_items) submitted(cart_item_id uuid, product_id uuid, source_unit_price numeric, source_currency_code text, effective_price_evidence jsonb)
      on submitted.cart_item_id = (effective->>'cartItemId')::uuid
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
    on item.id = (effective->>'cartItemId')::uuid
  where item.cart_id = target_cart.id
  on conflict (cart_item_id) do update set evidence = excluded.evidence
  where partner_cart_price_reviews.evidence is distinct from excluded.evidence;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(
      cart_item_id uuid, product_id uuid, quantity integer, partner_unit_price numeric, currency_code text,
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
        where (effective->>'cartItemId')::uuid = item.cart_item_id
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
$function$;

-- begin_partner_order_submission_v5: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.begin_partner_order_submission_v5(target_cart_id uuid, target_expected_intent_version bigint, target_submission_key uuid, target_attempt_id uuid, target_delivery_date date, target_payment_method text, target_payment_date date, target_fulfillment_method text, target_carrier_id uuid, target_request_fingerprint text, target_payload jsonb, target_items jsonb)
 RETURNS partner_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_cart public.carts%rowtype;
  target_order public.partner_orders%rowtype;
  validation jsonb;
  resolved_contract_ref text;
  resolved_price_type_ref text;
  resolved_counterparty_ref text;
begin
  target_items := private.normalize_partner_order_cart_lines_v1(target_cart_id,target_items);
  select * into target_order from public.partner_orders where submission_key = target_submission_key;
  if target_order.id is not null then
    if target_order.submitted_by <> auth.uid() then
      raise exception 'Order submission key is not available.' using errcode = '42501';
    end if;
    if target_order.request_fingerprint is distinct from target_request_fingerprint then
      raise exception 'ORDER_SUBMISSION_FINGERPRINT_CONFLICT' using errcode = 'PT409';
    end if;
    return target_order;
  end if;

  validation := public.validate_partner_order_submission_v5(
    target_cart_id, target_expected_intent_version, target_delivery_date,
    target_payment_method, target_payment_date, target_fulfillment_method,
    target_carrier_id, target_request_fingerprint, target_payload, target_items
  );
  if not coalesce((validation->>'valid')::boolean, false) then
    raise exception '%', coalesce(validation->>'code', 'ORDER_PAYLOAD_VALIDATION_FAILED')
      using errcode = 'PT409', detail = validation->>'stage';
  end if;

  select * into strict target_cart from public.carts
  where id = target_cart_id and created_by = auth.uid();

  resolved_contract_ref := lower(btrim(target_payload->'contractReference'->>'externalId'));
  resolved_price_type_ref := lower(btrim(target_payload->'priceTypeReference'->>'externalId'));
  resolved_counterparty_ref := lower(btrim(target_payload->'partnerCompanyReference'->>'externalId'));

  insert into public.partner_orders(
    company_id, submitted_by, cart_id, submission_key, submission_attempt_id,
    requested_delivery_date, request_fingerprint, payload_snapshot
  ) values (
    target_cart.company_id, auth.uid(), target_cart.id, target_submission_key,
    target_attempt_id, target_delivery_date, target_request_fingerprint, target_payload
  ) returning * into target_order;

  insert into public.partner_order_items(
    order_id, cart_item_id, product_id, external_product_ref, external_characteristic_ref,
    external_unit_ref, external_vat_rate_ref, product_name, sku, quantity,
    partner_unit_price, currency_code, line_total, source_unit_price,
    source_currency_code, applied_exchange_rate, exchange_rate_id,
    exchange_rate_purpose, exchange_rate_effective_at, exchange_rate_published_at,
    available_stock, nearest_arrival_date, nearest_arrival_quantity
  )
  select target_order.id, item.cart_item_id, item.product_id, item.external_product_ref,
    item.external_characteristic_ref, item.external_unit_ref, item.external_vat_rate_ref,
    item.product_name, item.sku, item.quantity, item.partner_unit_price,
    'MDL', item.line_total, item.source_unit_price, item.source_currency_code,
    item.applied_exchange_rate, item.exchange_rate_id, item.exchange_rate_purpose,
    item.exchange_rate_effective_at, item.exchange_rate_published_at,
    item.available_stock, item.nearest_arrival_date, item.nearest_arrival_quantity
  from jsonb_to_recordset(target_items) item(
    cart_item_id uuid, product_id uuid, external_product_ref text, external_characteristic_ref text,
    external_unit_ref text, external_vat_rate_ref text, product_name text, sku text,
    quantity integer, partner_unit_price numeric, currency_code text, line_total numeric,
    source_unit_price numeric, source_currency_code text, applied_exchange_rate numeric,
    exchange_rate_id uuid, exchange_rate_purpose text,
    exchange_rate_effective_at timestamptz, exchange_rate_published_at timestamptz,
    available_stock numeric, nearest_arrival_date date, nearest_arrival_quantity numeric
  );

  insert into public.partner_order_export_diagnostics(
    order_id, payment_method, planned_payment_date, fulfillment_method, carrier_id,
    resolved_contract_ref, resolved_price_type_ref, resolved_counterparty_ref, request_fingerprint
  ) values (
    target_order.id, target_payment_method, target_payment_date, target_fulfillment_method,
    target_carrier_id, resolved_contract_ref, resolved_price_type_ref,
    resolved_counterparty_ref, target_request_fingerprint
  );

  update public.carts set status = 'submitting' where id = target_cart.id;
  return target_order;
end;
$function$;

-- snapshot_partner_order_effective_price: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.snapshot_partner_order_effective_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare v_evidence jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.effective_price_evidence is distinct from old.effective_price_evidence or new.cart_item_id is distinct from old.cart_item_id then
      raise exception 'Order price provenance is immutable' using errcode = '42501';
    end if;
    return new;
  end if;
  select review.evidence into v_evidence
  from public.partner_orders orders join public.cart_items item
    on item.cart_id = orders.cart_id and item.id = new.cart_item_id and item.product_id = new.product_id and item.quantity = new.quantity
  join private.partner_cart_price_reviews review on review.cart_item_id = item.id
  where orders.id = new.order_id and orders.submitted_by = auth.uid();
  if v_evidence is null or new.source_unit_price is distinct from (v_evidence->>'sourceAmount')::numeric
    or new.source_currency_code is distinct from v_evidence->>'sourceCurrency' then
    raise exception 'ORDER_PRICE_CHANGED' using errcode = 'PT409';
  end if;
  new.effective_price_evidence := v_evidence;
  return new;
end;
$function$;

-- attribute_commercial_campaign_order_item: preserve existing authorization/business guards; change commercial identity only.
CREATE OR REPLACE FUNCTION public.attribute_commercial_campaign_order_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
  end if;
  return new;
end;
$function$;

commit;
