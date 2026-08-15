-- Preserve the governed AI-service intent added to the calculator contract.
create or replace function public.add_public_retail_cart_cctv_bundle_v2(
  p_token_hash text, p_items jsonb, p_installation_intent jsonb, p_calculator_input jsonb,
  p_work_scope jsonb, p_request_id uuid, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare target_cart_id uuid; target_bundle_id uuid; previous public.retail_cart_requests;
  response jsonb; requested_count integer; resolved_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_installation_intent is not null and jsonb_typeof(p_installation_intent) <> 'object')
    or (p_calculator_input is not null and jsonb_typeof(p_calculator_input) <> 'object')
    or (p_work_scope is not null and (jsonb_typeof(p_work_scope) <> 'array' or jsonb_array_length(p_work_scope) > 20)) then
    raise exception 'Invalid bundle command.' using errcode = '22023';
  end if;
  if p_installation_intent is not null and (
    not p_installation_intent ?& array['cameraInstallation','cableLaying','commissioning','remoteViewing','aiScenarioProgramming']
    or (select count(*) from jsonb_object_keys(p_installation_intent)) <> 5
    or jsonb_typeof(p_installation_intent->'cameraInstallation') <> 'boolean'
    or jsonb_typeof(p_installation_intent->'cableLaying') <> 'boolean'
    or jsonb_typeof(p_installation_intent->'commissioning') <> 'boolean'
    or jsonb_typeof(p_installation_intent->'remoteViewing') <> 'boolean'
    or jsonb_typeof(p_installation_intent->'aiScenarioProgramming') <> 'boolean') then
    raise exception 'Invalid installation intent.' using errcode = '22023';
  end if;
  target_cart_id := public.ensure_active_retail_cart(p_token_hash);
  select * into previous from public.retail_cart_requests request
    where request.cart_id = target_cart_id and request.request_id = p_request_id;
  if previous.cart_id is not null then
    if previous.fingerprint <> p_fingerprint then raise exception 'Idempotency conflict.' using errcode = '23505'; end if;
    return previous.response;
  end if;
  with requested as (
    select public_product_id, commercial_group, unit_code, sum(quantity)::integer quantity
    from jsonb_to_recordset(p_items) as x(public_product_id uuid, quantity integer, commercial_group text, unit_code text)
    group by 1,2,3
  ) select count(*) into requested_count from requested
    where quantity between 1 and 20000 and commercial_group in ('equipment','materials')
      and unit_code in ('piece','meter','service');
  if requested_count = 0 or requested_count <> jsonb_array_length(p_items) then
    raise exception 'Invalid bundle items.' using errcode = '22023';
  end if;
  with requested as (select distinct public_product_id from jsonb_to_recordset(p_items) as x(public_product_id uuid))
  select count(*) into resolved_count from requested
  join public.public_retail_products product on product.public_id = requested.public_product_id
  join public.public_retail_publications publication on publication.id = product.publication_id and publication.status = 'published';
  if resolved_count <> (select count(distinct public_product_id) from jsonb_to_recordset(p_items) as x(public_product_id uuid)) then
    raise exception 'Calculator configuration changed.' using errcode = 'P0002';
  end if;
  insert into public.retail_cart_bundles(cart_id, source, installation_intent, calculator_input, work_scope)
    values(target_cart_id, 'cctv_calculator', p_installation_intent, p_calculator_input, p_work_scope)
    returning id into target_bundle_id;
  with requested as (
    select public_product_id, commercial_group, unit_code, sum(quantity)::integer quantity
    from jsonb_to_recordset(p_items) as x(public_product_id uuid, quantity integer, commercial_group text, unit_code text)
    group by 1,2,3
  ), current_products as (
    select product.* from public.public_retail_products product
    join public.public_retail_publications publication on publication.id = product.publication_id and publication.status = 'published'
  ) insert into public.retail_cart_items(cart_id, bundle_id, public_product_id, source, commercial_group,
      quantity, unit_code, observed_price_amount, observed_currency, snapshot_slug, snapshot_sku,
      snapshot_name_ru, snapshot_name_ro, snapshot_image_url)
    select target_cart_id, target_bundle_id, product.public_id, 'cctv_calculator', requested.commercial_group,
      requested.quantity, requested.unit_code, product.retail_price_amount, product.retail_price_currency,
      product.slug, product.sku, product.name_ru, product.name_ro, product.primary_image_url
    from requested join current_products product on product.public_id = requested.public_product_id;
  update public.retail_carts set revision = revision + 1, last_activity_at = now(), updated_at = now()
    where id = target_cart_id;
  response := public.retail_cart_mutation_result(target_cart_id, false, target_bundle_id);
  insert into public.retail_cart_requests values(target_cart_id, p_request_id, 'add_cctv_bundle', p_fingerprint, response, now());
  return response;
end;
$$;
