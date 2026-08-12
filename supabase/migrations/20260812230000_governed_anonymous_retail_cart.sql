create table public.retail_carts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active','locked','converted','expired','abandoned')),
  revision bigint not null default 0 check (revision >= 0),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index retail_carts_expiration_idx on public.retail_carts (expires_at, id) where status = 'active';

create table public.retail_cart_bundles (
  id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.retail_carts(id) on delete cascade,
  source text not null check (source = 'cctv_calculator'), calculator_version text not null default 'public-cctv-v1',
  installation_intent jsonb null check (installation_intent is null or jsonb_typeof(installation_intent) = 'object'),
  created_at timestamptz not null default now()
);
create index retail_cart_bundles_cart_idx on public.retail_cart_bundles (cart_id, created_at, id);

create table public.retail_cart_items (
  id uuid primary key default gen_random_uuid(), cart_id uuid not null references public.retail_carts(id) on delete cascade,
  bundle_id uuid null references public.retail_cart_bundles(id) on delete cascade,
  public_product_id uuid not null, source text not null check (source in ('catalog','product_detail','cctv_calculator')),
  commercial_group text not null default 'equipment' check (commercial_group in ('equipment','materials')),
  quantity integer not null check (quantity between 1 and 99),
  observed_price_amount numeric(14,2) not null check (observed_price_amount > 0), observed_currency text not null check (observed_currency ~ '^[A-Z]{3}$'),
  observed_at timestamptz not null default now(), snapshot_slug text not null, snapshot_sku text not null,
  snapshot_name_ru text not null, snapshot_name_ro text null, snapshot_image_url text null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((bundle_id is null and source in ('catalog','product_detail')) or (bundle_id is not null and source = 'cctv_calculator'))
);
create unique index retail_cart_standalone_product_idx on public.retail_cart_items (cart_id, public_product_id) where bundle_id is null;
create unique index retail_cart_bundle_product_idx on public.retail_cart_items (bundle_id, public_product_id, commercial_group) where bundle_id is not null;
create index retail_cart_items_cart_idx on public.retail_cart_items (cart_id, created_at, id);

create table public.retail_cart_requests (
  cart_id uuid not null references public.retail_carts(id) on delete cascade, request_id uuid not null,
  operation text not null check (operation in ('add_product','add_cctv_bundle')), fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  response jsonb not null check (jsonb_typeof(response) = 'object'), created_at timestamptz not null default now(),
  primary key (cart_id, request_id)
);
create index retail_cart_requests_created_idx on public.retail_cart_requests (created_at, cart_id);

alter table public.retail_carts enable row level security;
alter table public.retail_cart_bundles enable row level security;
alter table public.retail_cart_items enable row level security;
alter table public.retail_cart_requests enable row level security;
revoke all on public.retail_carts, public.retail_cart_bundles, public.retail_cart_items, public.retail_cart_requests from public, anon, authenticated;

create or replace function public.ensure_active_retail_cart(p_token_hash text) returns uuid language plpgsql security definer set search_path = public as $$
declare result uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid cart credential.' using errcode='22023'; end if;
  insert into public.retail_carts(token_hash) values(p_token_hash)
  on conflict(token_hash) do update set last_activity_at=now(), expires_at=now()+interval '30 days', updated_at=now()
    where retail_carts.status='active' and retail_carts.expires_at>now()
  returning id into result;
  if result is null then raise exception 'Cart expired.' using errcode='28000'; end if;
  return result;
end; $$;

create or replace function public.retail_cart_mutation_result(p_cart_id uuid, p_repeated boolean, p_bundle_id uuid default null) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('revision',cart.revision,'distinctItemCount',count(item.id),'totalQuantity',coalesce(sum(item.quantity),0),'repeated',p_repeated,'bundleId',p_bundle_id)
  from public.retail_carts cart left join public.retail_cart_items item on item.cart_id=cart.id where cart.id=p_cart_id group by cart.revision;
$$;

create or replace function public.get_public_retail_cart_summary(p_token_hash text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare cart_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('distinctItemCount',0,'totalQuantity',0); end if;
  select id into cart_id from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now();
  if cart_id is null then return jsonb_build_object('distinctItemCount',0,'totalQuantity',0); end if;
  return (select jsonb_build_object('distinctItemCount',count(*),'totalQuantity',coalesce(sum(quantity),0)) from public.retail_cart_items where retail_cart_items.cart_id=cart_id);
end; $$;

create or replace function public.get_public_retail_cart(p_token_hash text, p_locale text default 'ru') returns jsonb language plpgsql stable security definer set search_path=public as $$
declare cart_row public.retail_carts; result jsonb;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_locale not in ('ru','ro') then return null; end if;
  select * into cart_row from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now();
  if cart_row.id is null then return null; end if;
  with current_publication as (select id from public.public_retail_publications where status='published'),
  enriched as (
    select item.*, product.public_id current_id, product.slug current_slug, product.sku current_sku,
      case when p_locale='ro' then coalesce(product.name_ro,product.name_ru) else product.name_ru end current_name,
      product.primary_image_url current_image, product.retail_price_amount current_price, product.retail_price_currency current_currency,
      product.vat_presentation, product.availability current_availability
    from public.retail_cart_items item left join current_publication publication on true
    left join public.public_retail_products product on product.publication_id=publication.id and product.public_id=item.public_product_id
    where item.cart_id=cart_row.id
  ), currency_state as (select count(distinct current_currency) filter(where current_id is not null) currencies, bool_or(current_id is null) stale from enriched),
  totals as (select sum(current_price*quantity) filter(where commercial_group='equipment') equipment, sum(current_price*quantity) filter(where commercial_group='materials') materials from enriched),
  item_json as (select coalesce(jsonb_agg(jsonb_build_object(
    'publicProductId',public_product_id,'bundleId',bundle_id,'source',source,'commercialGroup',commercial_group,
    'slug',current_slug,'sku',coalesce(current_sku,snapshot_sku),'name',coalesce(current_name,case when p_locale='ro' then coalesce(snapshot_name_ro,snapshot_name_ru) else snapshot_name_ru end),
    'image',case when coalesce(current_image,snapshot_image_url) is null then null else jsonb_build_object('url',coalesce(current_image,snapshot_image_url),'alt',coalesce(current_name,snapshot_name_ru)) end,
    'quantity',quantity,'price',case when current_id is null then null else jsonb_build_object('amount',current_price,'currency',current_currency,'vatPresentation',vat_presentation) end,
    'availability',coalesce(current_availability,'unavailable'),'lineAmount',case when current_id is null then null else current_price*quantity end,
    'stale',current_id is null,'priceChanged',current_id is not null and (current_price<>observed_price_amount or current_currency<>observed_currency)
  ) order by created_at,id),'[]'::jsonb) value from enriched),
  bundle_json as (select coalesce(jsonb_agg(jsonb_build_object('id',id,'source',source,'installationIntent',installation_intent) order by created_at,id),'[]'::jsonb) value from public.retail_cart_bundles where cart_id=cart_row.id)
  select jsonb_build_object('revision',cart_row.revision,'distinctItemCount',(select count(*) from enriched),'totalQuantity',(select coalesce(sum(quantity),0) from enriched),
    'items',(select value from item_json),'bundles',(select value from bundle_json),'totals',jsonb_build_object(
      'equipment',case when (select coalesce(stale,false) or currencies>1 from currency_state) then null else coalesce((select equipment from totals),0) end,
      'materials',case when (select coalesce(stale,false) or currencies>1 from currency_state) then null else coalesce((select materials from totals),0) end,
      'total',case when (select coalesce(stale,false) or currencies>1 from currency_state) then null else coalesce((select equipment from totals),0)+coalesce((select materials from totals),0) end,
      'currency',case when (select coalesce(stale,false) or currencies<>1 from currency_state) then null else (select min(current_currency) from enriched) end)) into result;
  return result;
end; $$;

create or replace function public.add_public_retail_cart_product(p_token_hash text,p_public_product_id uuid,p_quantity integer,p_source text,p_request_id uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path=public as $$
declare cart_id uuid; product public.public_retail_products; previous public.retail_cart_requests; response jsonb; current_quantity integer;
begin
  if p_quantity not between 1 and 99 or p_source not in ('catalog','product_detail') or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid cart command.' using errcode='22023'; end if;
  cart_id:=public.ensure_active_retail_cart(p_token_hash); select * into previous from public.retail_cart_requests where retail_cart_requests.cart_id=cart_id and request_id=p_request_id;
  if previous.cart_id is not null then if previous.fingerprint<>p_fingerprint then raise exception 'Idempotency conflict.' using errcode='23505'; end if; return previous.response; end if;
  select p.* into product from public.public_retail_products p join public.public_retail_publications publication on publication.id=p.publication_id and publication.status='published' where p.public_id=p_public_product_id;
  if product.public_id is null then raise exception 'Public product unavailable.' using errcode='P0002'; end if;
  select quantity into current_quantity from public.retail_cart_items where retail_cart_items.cart_id=cart_id and bundle_id is null and public_product_id=p_public_product_id for update;
  if coalesce(current_quantity,0)+p_quantity>99 then raise exception 'Retail quantity limit exceeded.' using errcode='22023'; end if;
  insert into public.retail_cart_items(cart_id,public_product_id,source,commercial_group,quantity,observed_price_amount,observed_currency,snapshot_slug,snapshot_sku,snapshot_name_ru,snapshot_name_ro,snapshot_image_url)
  values(cart_id,product.public_id,p_source,'equipment',p_quantity,product.retail_price_amount,product.retail_price_currency,product.slug,product.sku,product.name_ru,product.name_ro,product.primary_image_url)
  on conflict(cart_id,public_product_id) where bundle_id is null do update set quantity=retail_cart_items.quantity+excluded.quantity,observed_price_amount=excluded.observed_price_amount,observed_currency=excluded.observed_currency,observed_at=now(),snapshot_slug=excluded.snapshot_slug,snapshot_sku=excluded.snapshot_sku,snapshot_name_ru=excluded.snapshot_name_ru,snapshot_name_ro=excluded.snapshot_name_ro,snapshot_image_url=excluded.snapshot_image_url,updated_at=now();
  update public.retail_carts set revision=revision+1,last_activity_at=now(),updated_at=now() where id=cart_id;
  response:=public.retail_cart_mutation_result(cart_id,false,null); insert into public.retail_cart_requests values(cart_id,p_request_id,'add_product',p_fingerprint,response,now()); return response;
end; $$;

create or replace function public.add_public_retail_cart_cctv_bundle(p_token_hash text,p_items jsonb,p_installation_intent jsonb,p_request_id uuid,p_fingerprint text) returns jsonb language plpgsql security definer set search_path=public as $$
declare cart_id uuid; bundle_id uuid; previous public.retail_cart_requests; response jsonb; requested_count integer; resolved_count integer;
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
  cart_id:=public.ensure_active_retail_cart(p_token_hash); select * into previous from public.retail_cart_requests where retail_cart_requests.cart_id=cart_id and request_id=p_request_id;
  if previous.cart_id is not null then if previous.fingerprint<>p_fingerprint then raise exception 'Idempotency conflict.' using errcode='23505'; end if; return previous.response; end if;
  with requested as (select public_product_id,commercial_group,sum(quantity)::integer quantity from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text) group by 1,2)
  select count(*) into requested_count from requested where quantity between 1 and 99 and commercial_group in ('equipment','materials');
  if requested_count=0 or requested_count<>(select count(*) from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text)) then raise exception 'Invalid bundle items.' using errcode='22023'; end if;
  with requested as (select distinct public_product_id from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text)) select count(*) into resolved_count from requested join public.public_retail_products p on p.public_id=requested.public_product_id join public.public_retail_publications publication on publication.id=p.publication_id and publication.status='published';
  if resolved_count<>(select count(distinct public_product_id) from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text)) then raise exception 'Calculator configuration changed.' using errcode='P0002'; end if;
  insert into public.retail_cart_bundles(cart_id,source,installation_intent) values(cart_id,'cctv_calculator',p_installation_intent) returning id into bundle_id;
  with requested as (select public_product_id,commercial_group,sum(quantity)::integer quantity from jsonb_to_recordset(p_items) as x(public_product_id uuid,quantity integer,commercial_group text) group by 1,2), current_products as (select p.* from public.public_retail_products p join public.public_retail_publications publication on publication.id=p.publication_id and publication.status='published')
  insert into public.retail_cart_items(cart_id,bundle_id,public_product_id,source,commercial_group,quantity,observed_price_amount,observed_currency,snapshot_slug,snapshot_sku,snapshot_name_ru,snapshot_name_ro,snapshot_image_url)
  select cart_id,bundle_id,p.public_id,'cctv_calculator',r.commercial_group,r.quantity,p.retail_price_amount,p.retail_price_currency,p.slug,p.sku,p.name_ru,p.name_ro,p.primary_image_url from requested r join current_products p on p.public_id=r.public_product_id;
  update public.retail_carts set revision=revision+1,last_activity_at=now(),updated_at=now() where id=cart_id; response:=public.retail_cart_mutation_result(cart_id,false,bundle_id);
  insert into public.retail_cart_requests values(cart_id,p_request_id,'add_cctv_bundle',p_fingerprint,response,now()); return response;
end; $$;

create or replace function public.update_public_retail_cart_quantity(p_token_hash text,p_public_product_id uuid,p_bundle_id uuid,p_quantity integer,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare cart_id uuid; affected integer;
begin
  if p_quantity not between 1 and 99 then raise exception 'Invalid quantity.' using errcode='22023'; end if;
  select id into cart_id from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now() for update;
  if cart_id is null then raise exception 'Cart unavailable.' using errcode='28000'; end if;
  update public.retail_carts set revision=revision+1,last_activity_at=now(),expires_at=now()+interval '30 days',updated_at=now() where id=cart_id and revision=p_expected_revision; get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Cart revision conflict.' using errcode='40001'; end if;
  update public.retail_cart_items set quantity=p_quantity,updated_at=now() where retail_cart_items.cart_id=cart_id and public_product_id=p_public_product_id and bundle_id is not distinct from p_bundle_id; get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Cart item unavailable.' using errcode='P0002'; end if; return public.retail_cart_mutation_result(cart_id,false,p_bundle_id);
end; $$;

create or replace function public.remove_public_retail_cart_item(p_token_hash text,p_public_product_id uuid,p_bundle_id uuid,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare cart_id uuid; affected integer;
begin
  select id into cart_id from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now() for update; if cart_id is null then raise exception 'Cart unavailable.' using errcode='28000'; end if;
  update public.retail_carts set revision=revision+1,last_activity_at=now(),expires_at=now()+interval '30 days',updated_at=now() where id=cart_id and revision=p_expected_revision; get diagnostics affected=row_count; if affected<>1 then raise exception 'Cart revision conflict.' using errcode='40001'; end if;
  delete from public.retail_cart_items where retail_cart_items.cart_id=cart_id and public_product_id=p_public_product_id and bundle_id is not distinct from p_bundle_id; get diagnostics affected=row_count; if affected<>1 then raise exception 'Cart item unavailable.' using errcode='P0002'; end if;
  if p_bundle_id is not null and not exists(select 1 from public.retail_cart_items where bundle_id=p_bundle_id) then delete from public.retail_cart_bundles where id=p_bundle_id and retail_cart_bundles.cart_id=cart_id; end if;
  return public.retail_cart_mutation_result(cart_id,false,p_bundle_id);
end; $$;

revoke all on function public.ensure_active_retail_cart(text), public.retail_cart_mutation_result(uuid,boolean,uuid) from public, anon, authenticated;
revoke all on function public.get_public_retail_cart_summary(text), public.get_public_retail_cart(text,text), public.add_public_retail_cart_product(text,uuid,integer,text,uuid,text), public.add_public_retail_cart_cctv_bundle(text,jsonb,jsonb,uuid,text), public.update_public_retail_cart_quantity(text,uuid,uuid,integer,bigint), public.remove_public_retail_cart_item(text,uuid,uuid,bigint) from public, authenticated;
grant execute on function public.get_public_retail_cart_summary(text), public.get_public_retail_cart(text,text), public.add_public_retail_cart_product(text,uuid,integer,text,uuid,text), public.add_public_retail_cart_cctv_bundle(text,jsonb,jsonb,uuid,text), public.update_public_retail_cart_quantity(text,uuid,uuid,integer,bigint), public.remove_public_retail_cart_item(text,uuid,uuid,bigint) to anon, service_role;
