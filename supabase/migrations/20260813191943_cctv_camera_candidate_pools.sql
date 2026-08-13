-- Governed CCTV camera capabilities, candidate pools and local turnover signals.

create table public.cctv_camera_capabilities (
  product_id uuid primary key references public.catalog_products(id) on delete restrict,
  resolution_mp smallint not null check (resolution_mp between 1 and 32),
  network_camera boolean not null,
  poe_supported boolean null,
  color_night boolean null,
  anpr boolean null,
  video_analytics boolean null,
  verified boolean not null default false,
  evidence_source text null check (evidence_source is null or char_length(evidence_source) between 3 and 1000),
  verified_at timestamptz null,
  version integer not null default 1 check (version > 0),
  updated_by uuid null references public.user_profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint cctv_camera_capabilities_verified_check check (
    not verified or (evidence_source is not null and verified_at is not null)
  )
);

create table public.cctv_camera_candidate_pools (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check (object_type in ('apartment','house','office','retail','warehouse','industrial','horeca','other')),
  placement_type text not null check (placement_type in ('indoor','outdoor')),
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  manual_priority text not null default 'normal' check (manual_priority in ('high','normal','low')),
  enabled boolean not null default true,
  notes text null check (notes is null or char_length(notes) <= 1000),
  version integer not null default 1 check (version > 0),
  created_by uuid null references public.user_profiles(id) on delete restrict,
  updated_by uuid null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(object_type, placement_type, product_id)
);

create table public.cctv_camera_turnover_signals (
  product_id uuid primary key references public.catalog_products(id) on delete cascade,
  available_stock numeric(15,3) not null default 0,
  recent_sales_qty numeric(15,3) not null default 0,
  last_sale_at timestamptz null,
  signal_updated_at timestamptz not null default now(),
  check (available_stock >= 0 and recent_sales_qty >= 0)
);

create table public.cctv_camera_candidate_pool_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.cctv_camera_candidate_pools(id) on delete restrict,
  event_type text not null check (event_type in ('candidate_added','candidate_updated','candidate_disabled','candidate_enabled')),
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  previous_snapshot jsonb null,
  resulting_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index cctv_camera_candidate_pools_lookup_idx
  on public.cctv_camera_candidate_pools(object_type, placement_type, enabled, product_id);
create index cctv_camera_candidate_pool_events_candidate_idx
  on public.cctv_camera_candidate_pool_events(candidate_id, created_at desc, id);
create index warranty_serial_events_cctv_sale_signal_idx
  on public.warranty_serial_events(product_id, source_document_date desc)
  where product_id is not null and event_type='sale_observed' and source_posted and not source_deletion_mark;

alter table public.cctv_camera_capabilities enable row level security;
alter table public.cctv_camera_candidate_pools enable row level security;
alter table public.cctv_camera_turnover_signals enable row level security;
alter table public.cctv_camera_candidate_pool_events enable row level security;
revoke all on public.cctv_camera_capabilities, public.cctv_camera_candidate_pools,
  public.cctv_camera_turnover_signals, public.cctv_camera_candidate_pool_events
  from public, anon, authenticated;
grant select,insert,update,delete on public.cctv_camera_capabilities, public.cctv_camera_candidate_pools,
  public.cctv_camera_turnover_signals, public.cctv_camera_candidate_pool_events to service_role;

insert into public.cctv_camera_capabilities(
  product_id,resolution_mp,network_camera,poe_supported,color_night,anpr,video_analytics,
  verified,evidence_source,verified_at
)
select product.id,resolution.display_value::smallint,true,null,
  case when light.product_id is null then null else light.display_value in ('Smart Dual Light','Starlight','WizColor','WizColor Lite') end,
  case when technology.product_id is null then null else technology.display_value='SMART ANPR' end,
  case when analytics.product_id is null then null else analytics.display_value<>'Отсутствует' end,
  true,'synchronized_catalog_attributes',now()
from public.catalog_products product
join public.catalog_product_attributes resolution on resolution.product_id=product.id
  and resolution.label='Разрешение-MPx' and resolution.display_value ~ '^[0-9]{1,2}$'
join public.catalog_product_attributes transport on transport.product_id=product.id
  and transport.label='Передача-данных' and transport.display_value='TCP-IP (Цифровая)'
left join public.catalog_product_attributes light on light.product_id=product.id and light.label='Светочувствительность'
left join public.catalog_product_attributes technology on technology.product_id=product.id and technology.label='Технология'
left join public.catalog_product_attributes analytics on analytics.product_id=product.id and analytics.label='Аналитика'
where product.is_active and product.is_visible
on conflict(product_id) do nothing;

create function public.prevent_cctv_camera_candidate_event_mutation()
returns trigger language plpgsql set search_path=public as $$ begin
  raise exception 'CCTV camera candidate events are immutable.' using errcode='55000';
end; $$;
create trigger prevent_cctv_camera_candidate_event_update_delete
before update or delete on public.cctv_camera_candidate_pool_events
for each row execute function public.prevent_cctv_camera_candidate_event_mutation();
revoke all on function public.prevent_cctv_camera_candidate_event_mutation() from public,anon,authenticated;

create function public.refresh_cctv_camera_turnover_signals()
returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('cctv_camera_turnover_signals',0)) then
    return 0;
  end if;
  insert into public.cctv_camera_turnover_signals(product_id,available_stock,recent_sales_qty,last_sale_at,signal_updated_at)
  select product.id, greatest(coalesce(stock.available_quantity,0),0),
    coalesce(sum(sale.quantity) filter(where sale.source_document_date>=now()-interval '90 days'),0),
    max(sale.source_document_date), now()
  from public.catalog_products product
  join public.cctv_camera_capabilities capability on capability.product_id=product.id
  left join public.product_stock_totals stock on stock.product_id=product.id and stock.is_published
  left join public.warranty_serial_events sale on sale.product_id=product.id and sale.event_type='sale_observed'
    and sale.source_posted and not sale.source_deletion_mark
  group by product.id,stock.available_quantity
  on conflict(product_id) do update set available_stock=excluded.available_stock,
    recent_sales_qty=excluded.recent_sales_qty,last_sale_at=excluded.last_sale_at,signal_updated_at=excluded.signal_updated_at;
  get diagnostics affected=row_count;
  return affected;
end; $$;
revoke all on function public.refresh_cctv_camera_turnover_signals() from public,anon,authenticated;
grant execute on function public.refresh_cctv_camera_turnover_signals() to service_role;

select public.refresh_cctv_camera_turnover_signals();

insert into public.cctv_camera_candidate_pools(object_type,placement_type,product_id,manual_priority,enabled,notes)
select 'other',case when profile.profile_key='cctv.indoor.6mp' then 'indoor' else 'outdoor' end,
  profile.catalog_product_id,'normal',true,'Migrated from the approved calculator camera mapping.'
from public.estimate_generator_calculator_profiles profile
where profile.profile_key in ('cctv.indoor.6mp','cctv.outdoor.4mp') and profile.catalog_product_id is not null
on conflict(object_type,placement_type,product_id) do nothing;

insert into public.cctv_camera_candidate_pool_events(candidate_id,event_type,resulting_snapshot)
select pool.id,'candidate_added',to_jsonb(pool) from public.cctv_camera_candidate_pools pool
where pool.object_type='other' and pool.notes='Migrated from the approved calculator camera mapping.';

create function public.resolve_cctv_camera_candidate_pool(
  target_object_type text,
  target_placements text[],
  target_locale text default 'ru'
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or target_locale not in ('ru','ro') or coalesce(cardinality(target_placements),0)<1
    or cardinality(target_placements)>2
    or exists(select 1 from unnest(target_placements) value where value not in ('indoor','outdoor')) then
    raise exception 'CCTV camera pool input is invalid.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'candidateId',pool.id,'objectType',pool.object_type,'placement',pool.placement_type,
    'productId',product.id,'manualPriority',pool.manual_priority,'enabled',pool.enabled,
    'resolutionMp',capability.resolution_mp,'networkCamera',capability.network_camera,
    'poeSupported',capability.poe_supported,'colorNight',capability.color_night,
    'anpr',capability.anpr,'videoAnalytics',capability.video_analytics,
    'technicalVerified',capability.verified,'availableStock',coalesce(signal.available_stock,0),
    'recentSalesQty',coalesce(signal.recent_sales_qty,0),'lastSaleAt',signal.last_sale_at,
    'signalUpdatedAt',signal.signal_updated_at,'sku',product.sku,'name',product.name,
    'imageUrl',product.image_url,'publicProduct',case when retail.public_id is null then null else jsonb_build_object(
      'id',retail.public_id,'slug',retail.slug,'sku',retail.sku,
      'name',case when target_locale='ro' then coalesce(retail.name_ro,retail.name_ru) else retail.name_ru end,
      'shortDescription',case when target_locale='ro' then coalesce(retail.short_description_ro,retail.short_description_ru) else retail.short_description_ru end,
      'image',case when retail.primary_image_url is null then null else jsonb_build_object('url',retail.primary_image_url,
        'alt',case when target_locale='ro' then coalesce(retail.primary_image_alt_ro,retail.primary_image_alt_ru) else retail.primary_image_alt_ru end) end,
      'brand',null,'category',null,
      'price',jsonb_build_object('amount',retail.retail_price_amount,'currency',retail.retail_price_currency,'vatPresentation',retail.vat_presentation),
      'availability',retail.availability,'highlights','[]'::jsonb,'calculatorEligible',true
    ) end
  ) order by pool.placement_type,pool.product_id),'[]'::jsonb) into result
  from public.cctv_camera_candidate_pools pool
  join public.cctv_camera_capabilities capability on capability.product_id=pool.product_id
  join public.catalog_products product on product.id=pool.product_id and product.is_active and product.is_visible
  left join public.cctv_camera_turnover_signals signal on signal.product_id=pool.product_id
  left join public.public_retail_publications publication on publication.status='published'
  left join public.public_retail_products retail on retail.publication_id=publication.id and retail.sku=product.sku
  where pool.object_type in (target_object_type,'other') and pool.placement_type=any(target_placements) and pool.enabled;
  return result;
end; $$;
revoke all on function public.resolve_cctv_camera_candidate_pool(text,text[],text) from public,anon,authenticated;
grant execute on function public.resolve_cctv_camera_candidate_pool(text,text[],text) to service_role;

create function public.list_cctv_camera_candidate_pools()
returns table(id uuid,object_type text,placement_type text,product_id uuid,sku text,product_name text,
  image_url text,
  manual_priority text,enabled boolean,notes text,version integer,resolution_mp smallint,network_camera boolean,
  poe_supported boolean,color_night boolean,anpr boolean,video_analytics boolean,technical_verified boolean,
  evidence_source text,available_stock numeric,recent_sales_qty numeric,last_sale_at timestamptz,signal_updated_at timestamptz,
  public_published boolean)
language sql stable security definer set search_path=public as $$
 select pool.id,pool.object_type,pool.placement_type,product.id,product.sku,product.name,product.image_url,pool.manual_priority,pool.enabled,
   pool.notes,pool.version,cap.resolution_mp,cap.network_camera,cap.poe_supported,cap.color_night,cap.anpr,
   cap.video_analytics,cap.verified,cap.evidence_source,coalesce(signal.available_stock,0),
   coalesce(signal.recent_sales_qty,0),signal.last_sale_at,signal.signal_updated_at,
   exists(select 1 from public.public_retail_publications publication join public.public_retail_products retail
     on retail.publication_id=publication.id where publication.status='published' and retail.sku=product.sku)
 from public.cctv_camera_candidate_pools pool join public.catalog_products product on product.id=pool.product_id
 join public.cctv_camera_capabilities cap on cap.product_id=pool.product_id
 left join public.cctv_camera_turnover_signals signal on signal.product_id=pool.product_id
 where public.has_internal_permission('admin.estimates.view')
 order by pool.object_type,pool.placement_type,pool.product_id;
$$;
revoke all on function public.list_cctv_camera_candidate_pools() from public,anon;
grant execute on function public.list_cctv_camera_candidate_pools() to authenticated;

create function public.search_cctv_camera_candidates(
  search_query text,target_object_type text,target_placement_type text,result_limit integer default 12
) returns table(product_id uuid,sku text,product_name text,image_url text,resolution_mp smallint,
  color_night boolean,anpr boolean,video_analytics boolean,technical_verified boolean,
  available_stock numeric,recent_sales_qty numeric,retail_price_amount numeric,retail_price_currency text,
  already_in_pool boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_internal_permission('admin.estimates.view') then
    raise exception 'Forbidden.' using errcode='42501';
  end if;
  if char_length(trim(search_query))<2 or char_length(search_query)>100
    or target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or target_placement_type not in ('indoor','outdoor') or result_limit not between 1 and 20 then
    raise exception 'Invalid CCTV camera search.' using errcode='22023';
  end if;
  return query
  select product.id,product.sku,product.name,product.image_url,cap.resolution_mp,cap.color_night,cap.anpr,
    cap.video_analytics,cap.verified,coalesce(signal.available_stock,0),coalesce(signal.recent_sales_qty,0),
    retail.retail_price_amount,retail.retail_price_currency,
    exists(select 1 from public.cctv_camera_candidate_pools membership where membership.object_type=target_object_type
      and membership.placement_type=target_placement_type and membership.product_id=product.id)
  from public.catalog_products product
  join public.cctv_camera_capabilities cap on cap.product_id=product.id
  left join public.cctv_camera_turnover_signals signal on signal.product_id=product.id
  left join public.public_retail_publications publication on publication.status='published'
  left join public.public_retail_products retail on retail.publication_id=publication.id and retail.sku=product.sku
  where product.is_active and product.is_visible and cap.verified
    and (product.sku ilike '%'||trim(search_query)||'%' or product.name ilike '%'||trim(search_query)||'%')
  order by case when lower(product.sku)=lower(trim(search_query)) then 0 else 1 end,product.sku,product.id
  limit result_limit;
end; $$;
revoke all on function public.search_cctv_camera_candidates(text,text,text,integer) from public,anon;
grant execute on function public.search_cctv_camera_candidates(text,text,text,integer) to authenticated;

create function public.upsert_cctv_camera_candidate(
  target_object_type text,target_placement_type text,target_product_id uuid,target_manual_priority text,
  target_enabled boolean,target_notes text,expected_version integer default null
) returns table(candidate_id uuid,resulting_version integer)
language plpgsql security definer set search_path=public as $$
declare existing public.cctv_camera_candidate_pools; actor uuid:=auth.uid(); saved public.cctv_camera_candidate_pools;
begin
  if not public.has_internal_permission('admin.integrations.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or target_placement_type not in ('indoor','outdoor') or target_manual_priority not in ('high','normal','low')
    or char_length(coalesce(target_notes,''))>1000 then raise exception 'Invalid candidate.' using errcode='22023'; end if;
  if not exists(select 1 from public.cctv_camera_capabilities c join public.catalog_products p on p.id=c.product_id
    where c.product_id=target_product_id and p.is_active and p.is_visible) then raise exception 'Camera capability is unavailable.' using errcode='22023'; end if;
  select * into existing from public.cctv_camera_candidate_pools where object_type=target_object_type
    and placement_type=target_placement_type and product_id=target_product_id for update;
  if existing.id is null then
    if expected_version is not null then raise exception 'CCTV_CAMERA_POOL_CONFLICT' using errcode='PT409'; end if;
    insert into public.cctv_camera_candidate_pools(object_type,placement_type,product_id,manual_priority,enabled,notes,created_by,updated_by)
    values(target_object_type,target_placement_type,target_product_id,target_manual_priority,target_enabled,nullif(trim(target_notes),''),actor,actor) returning * into saved;
    insert into public.cctv_camera_candidate_pool_events(candidate_id,event_type,actor_user_id,resulting_snapshot)
      values(saved.id,'candidate_added',actor,to_jsonb(saved));
  else
    if expected_version is null or existing.version<>expected_version then raise exception 'CCTV_CAMERA_POOL_CONFLICT' using errcode='PT409'; end if;
    update public.cctv_camera_candidate_pools set manual_priority=target_manual_priority,enabled=target_enabled,
      notes=nullif(trim(target_notes),''),version=version+1,updated_by=actor,updated_at=now() where id=existing.id returning * into saved;
    insert into public.cctv_camera_candidate_pool_events(candidate_id,event_type,actor_user_id,previous_snapshot,resulting_snapshot)
      values(saved.id,case when existing.enabled and not saved.enabled then 'candidate_disabled' when not existing.enabled and saved.enabled then 'candidate_enabled' else 'candidate_updated' end,
      actor,to_jsonb(existing),to_jsonb(saved));
  end if;
  return query select saved.id,saved.version;
end; $$;
revoke all on function public.upsert_cctv_camera_candidate(text,text,uuid,text,boolean,text,integer) from public,anon;
grant execute on function public.upsert_cctv_camera_candidate(text,text,uuid,text,boolean,text,integer) to authenticated;

comment on table public.cctv_camera_candidate_pools is 'Admin-governed object and placement candidate membership; canonical product data remains in catalog_products.';
comment on table public.cctv_camera_turnover_signals is 'Local bounded CCTV ranking projection. Inventory age is intentionally absent because no authoritative batch-age source exists.';
