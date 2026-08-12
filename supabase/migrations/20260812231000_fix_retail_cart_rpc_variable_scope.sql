create or replace function public.get_public_retail_cart_summary(p_token_hash text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare target_cart_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('distinctItemCount',0,'totalQuantity',0); end if;
  select id into target_cart_id from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now();
  if target_cart_id is null then return jsonb_build_object('distinctItemCount',0,'totalQuantity',0); end if;
  return (select jsonb_build_object('distinctItemCount',count(*),'totalQuantity',coalesce(sum(quantity),0)) from public.retail_cart_items item where item.cart_id=target_cart_id);
end; $$;

create or replace function public.add_public_retail_cart_product(p_token_hash text,p_public_product_id uuid,p_quantity integer,p_source text,p_request_id uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path=public as $$
declare target_cart_id uuid; product public.public_retail_products; previous public.retail_cart_requests; response jsonb; current_quantity integer;
begin
  if p_quantity not between 1 and 99 or p_source not in ('catalog','product_detail') or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid cart command.' using errcode='22023'; end if;
  target_cart_id:=public.ensure_active_retail_cart(p_token_hash);
  select * into previous from public.retail_cart_requests request where request.cart_id=target_cart_id and request.request_id=p_request_id;
  if previous.cart_id is not null then if previous.fingerprint<>p_fingerprint then raise exception 'Idempotency conflict.' using errcode='23505'; end if; return previous.response; end if;
  select p.* into product from public.public_retail_products p join public.public_retail_publications publication on publication.id=p.publication_id and publication.status='published' where p.public_id=p_public_product_id;
  if product.public_id is null then raise exception 'Public product unavailable.' using errcode='P0002'; end if;
  select item.quantity into current_quantity from public.retail_cart_items item where item.cart_id=target_cart_id and item.bundle_id is null and item.public_product_id=p_public_product_id for update;
  if coalesce(current_quantity,0)+p_quantity>99 then raise exception 'Retail quantity limit exceeded.' using errcode='22023'; end if;
  insert into public.retail_cart_items(cart_id,public_product_id,source,commercial_group,quantity,observed_price_amount,observed_currency,snapshot_slug,snapshot_sku,snapshot_name_ru,snapshot_name_ro,snapshot_image_url)
  values(target_cart_id,product.public_id,p_source,'equipment',p_quantity,product.retail_price_amount,product.retail_price_currency,product.slug,product.sku,product.name_ru,product.name_ro,product.primary_image_url)
  on conflict(cart_id,public_product_id) where bundle_id is null do update set quantity=retail_cart_items.quantity+excluded.quantity,observed_price_amount=excluded.observed_price_amount,observed_currency=excluded.observed_currency,observed_at=now(),snapshot_slug=excluded.snapshot_slug,snapshot_sku=excluded.snapshot_sku,snapshot_name_ru=excluded.snapshot_name_ru,snapshot_name_ro=excluded.snapshot_name_ro,snapshot_image_url=excluded.snapshot_image_url,updated_at=now();
  update public.retail_carts set revision=revision+1,last_activity_at=now(),updated_at=now() where id=target_cart_id;
  response:=public.retail_cart_mutation_result(target_cart_id,false,null);
  insert into public.retail_cart_requests values(target_cart_id,p_request_id,'add_product',p_fingerprint,response,now());
  return response;
end; $$;

create or replace function public.add_public_retail_cart_cctv_bundle(p_token_hash text,p_items jsonb,p_installation_intent jsonb,p_request_id uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path=public as $$
declare target_cart_id uuid; target_bundle_id uuid; previous public.retail_cart_requests; response jsonb; requested_count integer; resolved_count integer;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30 or p_fingerprint !~ '^[0-9a-f]{64}$' or (p_installation_intent is not null and jsonb_typeof(p_installation_intent)<>'object') then raise exception 'Invalid bundle command.' using errcode='22023'; end if;
  if p_installation_intent is not null and (
    not p_installation_intent ?& array['cameraInstallation','cableLaying','commissioning','remoteViewing']
    or (select count(*) from jsonb_object_keys(p_installation_intent))<>4
    or jsonb_typeof(p_installation_intent->'cameraInstallation')<>'boolean'
    or jsonb_typeof(p_installation_intent->'cableLaying')<>'boolean'
    or jsonb_typeof(p_installation_intent->'commissioning')<>'boolean'
    or jsonb_typeof(p_installation_intent->'remoteViewing')<>'boolean'
  ) then raise exception 'Invalid installation intent.' using errcode='22023'; end if;
  target_cart_id:=public.ensure_active_retail_cart(p_token_hash);
  select * into previous from public.retail_cart_requests request where request.cart_id=target_cart_id and request.request_id=p_request_id;
  if previous.cart_id is not null then if previous.fingerprint<>p_fingerprint then raise exception 'Idempotency conflict.' using errcode='23505'; end if; return previous.response; end if;
  with requested as (select public_product_id,commercial_group,sum(quantity)::integer quantity from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text) group by 1,2)
  select count(*) into requested_count from requested where quantity between 1 and 99 and commercial_group in ('equipment','materials');
  if requested_count=0 or requested_count<>(select count(*) from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text)) then raise exception 'Invalid bundle items.' using errcode='22023'; end if;
  with requested as (select distinct public_product_id from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text))
  select count(*) into resolved_count from requested join public.public_retail_products p on p.public_id=requested.public_product_id join public.public_retail_publications publication on publication.id=p.publication_id and publication.status='published';
  if resolved_count<>(select count(distinct public_product_id) from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text)) then raise exception 'Calculator configuration changed.' using errcode='P0002'; end if;
  insert into public.retail_cart_bundles(cart_id,source,installation_intent) values(target_cart_id,'cctv_calculator',p_installation_intent) returning id into target_bundle_id;
  with requested as (select public_product_id,commercial_group,sum(quantity)::integer quantity from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text) group by 1,2), current_products as (select p.* from public.public_retail_products p join public.public_retail_publications publication on publication.id=p.publication_id and publication.status='published')
  insert into public.retail_cart_items(cart_id,bundle_id,public_product_id,source,commercial_group,quantity,observed_price_amount,observed_currency,snapshot_slug,snapshot_sku,snapshot_name_ru,snapshot_name_ro,snapshot_image_url)
  select target_cart_id,target_bundle_id,p.public_id,'cctv_calculator',r.commercial_group,r.quantity,p.retail_price_amount,p.retail_price_currency,p.slug,p.sku,p.name_ru,p.name_ro,p.primary_image_url from requested r join current_products p on p.public_id=r.public_product_id;
  update public.retail_carts set revision=revision+1,last_activity_at=now(),updated_at=now() where id=target_cart_id;
  response:=public.retail_cart_mutation_result(target_cart_id,false,target_bundle_id);
  insert into public.retail_cart_requests values(target_cart_id,p_request_id,'add_cctv_bundle',p_fingerprint,response,now());
  return response;
end; $$;

create or replace function public.update_public_retail_cart_quantity(p_token_hash text,p_public_product_id uuid,p_bundle_id uuid,p_quantity integer,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare target_cart_id uuid; affected integer;
begin
  if p_quantity not between 1 and 99 then raise exception 'Invalid quantity.' using errcode='22023'; end if;
  select id into target_cart_id from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now() for update;
  if target_cart_id is null then raise exception 'Cart unavailable.' using errcode='28000'; end if;
  update public.retail_carts set revision=revision+1,last_activity_at=now(),expires_at=now()+interval '30 days',updated_at=now() where id=target_cart_id and revision=p_expected_revision; get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Cart revision conflict.' using errcode='40001'; end if;
  update public.retail_cart_items item set quantity=p_quantity,updated_at=now() where item.cart_id=target_cart_id and item.public_product_id=p_public_product_id and item.bundle_id is not distinct from p_bundle_id; get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Cart item unavailable.' using errcode='P0002'; end if;
  return public.retail_cart_mutation_result(target_cart_id,false,p_bundle_id);
end; $$;

create or replace function public.remove_public_retail_cart_item(p_token_hash text,p_public_product_id uuid,p_bundle_id uuid,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare target_cart_id uuid; affected integer;
begin
  select id into target_cart_id from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now() for update;
  if target_cart_id is null then raise exception 'Cart unavailable.' using errcode='28000'; end if;
  update public.retail_carts set revision=revision+1,last_activity_at=now(),expires_at=now()+interval '30 days',updated_at=now() where id=target_cart_id and revision=p_expected_revision; get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Cart revision conflict.' using errcode='40001'; end if;
  delete from public.retail_cart_items item where item.cart_id=target_cart_id and item.public_product_id=p_public_product_id and item.bundle_id is not distinct from p_bundle_id; get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Cart item unavailable.' using errcode='P0002'; end if;
  if p_bundle_id is not null and not exists(select 1 from public.retail_cart_items item where item.bundle_id=p_bundle_id) then delete from public.retail_cart_bundles bundle where bundle.id=p_bundle_id and bundle.cart_id=target_cart_id; end if;
  return public.retail_cart_mutation_result(target_cart_id,false,p_bundle_id);
end; $$;

revoke all on function public.get_public_retail_cart_summary(text), public.add_public_retail_cart_product(text,uuid,integer,text,uuid,text), public.add_public_retail_cart_cctv_bundle(text,jsonb,jsonb,uuid,text), public.update_public_retail_cart_quantity(text,uuid,uuid,integer,bigint), public.remove_public_retail_cart_item(text,uuid,uuid,bigint) from public, authenticated;
grant execute on function public.get_public_retail_cart_summary(text), public.add_public_retail_cart_product(text,uuid,integer,text,uuid,text), public.add_public_retail_cart_cctv_bundle(text,jsonb,jsonb,uuid,text), public.update_public_retail_cart_quantity(text,uuid,uuid,integer,bigint), public.remove_public_retail_cart_item(text,uuid,uuid,bigint) to anon, service_role;
