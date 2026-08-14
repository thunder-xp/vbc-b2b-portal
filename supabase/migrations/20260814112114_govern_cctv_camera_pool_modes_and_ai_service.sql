alter table public.cctv_camera_candidate_pools
  add column eligible_for_recommended boolean not null default true,
  add column eligible_for_economy boolean not null default true;

drop function public.list_cctv_camera_candidate_pools();
create function public.list_cctv_camera_candidate_pools()
returns table(id uuid,object_type text,placement_type text,product_id uuid,sku text,product_name text,
  image_url text,manual_priority text,enabled boolean,eligible_for_recommended boolean,
  eligible_for_economy boolean,notes text,version integer,resolution_mp smallint,network_camera boolean,
  poe_supported boolean,color_night boolean,anpr boolean,video_analytics boolean,technical_verified boolean,
  evidence_source text,available_stock numeric,recent_sales_qty numeric,last_sale_at timestamptz,
  signal_updated_at timestamptz,public_published boolean,retail_price_amount numeric,retail_price_currency text)
language sql stable security definer set search_path=public as $$
 select pool.id,pool.object_type,pool.placement_type,product.id,product.sku,product.name,product.image_url,
   pool.manual_priority,pool.enabled,pool.eligible_for_recommended,pool.eligible_for_economy,pool.notes,pool.version,
   cap.resolution_mp,cap.network_camera,cap.poe_supported,cap.color_night,cap.anpr,cap.video_analytics,
   cap.verified,cap.evidence_source,coalesce(signal.available_stock,0),coalesce(signal.recent_sales_qty,0),
   signal.last_sale_at,signal.signal_updated_at,retail.public_id is not null,
   retail.retail_price_amount,retail.retail_price_currency
 from public.cctv_camera_candidate_pools pool
 join public.catalog_products product on product.id=pool.product_id
 join public.cctv_camera_capabilities cap on cap.product_id=pool.product_id
 left join public.cctv_camera_turnover_signals signal on signal.product_id=pool.product_id
 left join public.public_retail_publications publication on publication.status='published'
 left join public.public_retail_products retail on retail.publication_id=publication.id and retail.sku=product.sku
 where public.has_internal_permission('admin.estimates.view') and pool.archived_at is null
 order by pool.object_type,pool.placement_type,pool.product_id;
$$;
revoke all on function public.list_cctv_camera_candidate_pools() from public,anon;
grant execute on function public.list_cctv_camera_candidate_pools() to authenticated;

drop function public.upsert_cctv_camera_candidate(text,text,uuid,text,boolean,text,integer);
create function public.upsert_cctv_camera_candidate(
  target_object_type text,target_placement_type text,target_product_id uuid,target_manual_priority text,
  target_enabled boolean,target_eligible_for_recommended boolean,target_eligible_for_economy boolean,
  target_notes text,expected_version integer default null
) returns table(candidate_id uuid,resulting_version integer)
language plpgsql security definer set search_path=public as $$
declare existing public.cctv_camera_candidate_pools; actor uuid:=auth.uid(); saved public.cctv_camera_candidate_pools;
begin
  if not public.has_internal_permission('admin.integrations.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or target_placement_type not in ('indoor','outdoor') or target_manual_priority not in ('high','normal','low')
    or char_length(coalesce(target_notes,''))>1000 then raise exception 'Invalid candidate.' using errcode='22023'; end if;
  if not exists(select 1 from public.cctv_camera_capabilities c join public.catalog_products p on p.id=c.product_id
    where c.product_id=target_product_id and p.is_active and p.is_visible) then
    raise exception 'Camera capability is unavailable.' using errcode='22023';
  end if;
  select * into existing from public.cctv_camera_candidate_pools where object_type=target_object_type
    and placement_type=target_placement_type and product_id=target_product_id for update;
  if existing.id is null then
    if expected_version is not null then raise exception 'CCTV_CAMERA_POOL_CONFLICT' using errcode='PT409'; end if;
    insert into public.cctv_camera_candidate_pools(object_type,placement_type,product_id,manual_priority,enabled,
      eligible_for_recommended,eligible_for_economy,notes,created_by,updated_by)
    values(target_object_type,target_placement_type,target_product_id,target_manual_priority,target_enabled,
      target_eligible_for_recommended,target_eligible_for_economy,nullif(trim(target_notes),''),actor,actor)
    returning * into saved;
    insert into public.cctv_camera_candidate_pool_events(candidate_id,event_type,actor_user_id,resulting_snapshot)
      values(saved.id,'candidate_added',actor,to_jsonb(saved));
  else
    if expected_version is null or existing.version<>expected_version then
      raise exception 'CCTV_CAMERA_POOL_CONFLICT' using errcode='PT409';
    end if;
    update public.cctv_camera_candidate_pools set manual_priority=target_manual_priority,enabled=target_enabled,
      eligible_for_recommended=target_eligible_for_recommended,eligible_for_economy=target_eligible_for_economy,
      notes=nullif(trim(target_notes),''),archived_at=null,archived_by=null,version=version+1,
      updated_by=actor,updated_at=now() where id=existing.id returning * into saved;
    insert into public.cctv_camera_candidate_pool_events(candidate_id,event_type,actor_user_id,previous_snapshot,resulting_snapshot)
      values(saved.id,case when existing.archived_at is not null then 'candidate_restored'
        when existing.enabled and not saved.enabled then 'candidate_disabled'
        when not existing.enabled and saved.enabled then 'candidate_enabled' else 'candidate_updated' end,
        actor,to_jsonb(existing),to_jsonb(saved));
  end if;
  return query select saved.id,saved.version;
end; $$;
revoke all on function public.upsert_cctv_camera_candidate(text,text,uuid,text,boolean,boolean,boolean,text,integer)
  from public,anon;
grant execute on function public.upsert_cctv_camera_candidate(text,text,uuid,text,boolean,boolean,boolean,text,integer)
  to authenticated;

create or replace function public.resolve_cctv_camera_candidate_pool(
  target_object_type text,target_placements text[],target_locale text default 'ru'
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or target_locale not in ('ru','ro') or coalesce(cardinality(target_placements),0)<1 or cardinality(target_placements)>2
    or exists(select 1 from unnest(target_placements) value where value not in ('indoor','outdoor')) then
    raise exception 'CCTV camera pool input is invalid.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'candidateId',pool.id,'objectType',pool.object_type,'placement',pool.placement_type,
    'productId',product.id,'manualPriority',pool.manual_priority,'enabled',pool.enabled,
    'eligibleForRecommended',pool.eligible_for_recommended,'eligibleForEconomy',pool.eligible_for_economy,
    'resolutionMp',capability.resolution_mp,'networkCamera',capability.network_camera,
    'poeSupported',capability.poe_supported,'colorNight',capability.color_night,'anpr',capability.anpr,
    'videoAnalytics',capability.video_analytics,'technicalVerified',capability.verified,
    'availableStock',coalesce(signal.available_stock,0),'recentSalesQty',coalesce(signal.recent_sales_qty,0),
    'lastSaleAt',signal.last_sale_at,'signalUpdatedAt',signal.signal_updated_at,'sku',product.sku,'name',product.name,
    'imageUrl',product.image_url,'publicProduct',case when retail.public_id is null then null else jsonb_build_object(
      'id',retail.public_id,'slug',retail.slug,'sku',retail.sku,
      'name',case when target_locale='ro' then coalesce(retail.name_ro,retail.name_ru) else retail.name_ru end,
      'shortDescription',case when target_locale='ro' then coalesce(retail.short_description_ro,retail.short_description_ru) else retail.short_description_ru end,
      'image',case when retail.primary_image_url is null then null else jsonb_build_object('url',retail.primary_image_url,
        'alt',case when target_locale='ro' then coalesce(retail.primary_image_alt_ro,retail.primary_image_alt_ru) else retail.primary_image_alt_ru end) end,
      'brand',null,'category',null,'price',jsonb_build_object('amount',retail.retail_price_amount,
        'currency',retail.retail_price_currency,'vatPresentation',retail.vat_presentation),
      'availability',retail.availability,'highlights','[]'::jsonb,'calculatorEligible',true) end
  ) order by pool.placement_type,pool.product_id),'[]'::jsonb) into result
  from public.cctv_camera_candidate_pools pool
  join public.cctv_camera_capabilities capability on capability.product_id=pool.product_id
  join public.catalog_products product on product.id=pool.product_id and product.is_active and product.is_visible
  left join public.cctv_camera_turnover_signals signal on signal.product_id=pool.product_id
  left join public.public_retail_publications publication on publication.status='published'
  left join public.public_retail_products retail on retail.publication_id=publication.id and retail.sku=product.sku
  where pool.object_type in (target_object_type,'other') and pool.placement_type=any(target_placements)
    and pool.enabled and pool.archived_at is null
    and (pool.eligible_for_recommended or pool.eligible_for_economy);
  return result;
end; $$;

create or replace function public.resolve_cctv_object_services(
  target_object_type text,target_service_types text[]
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; tariff public.installation_tariff_sets;
begin
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or coalesce(cardinality(target_service_types),0)<1 or cardinality(target_service_types)>5
    or exists(select 1 from unnest(target_service_types) value where value not in
      ('camera_installation','cable_laying','commissioning','remote_configuration','ai_scenario_programming')) then
    raise exception 'Invalid CCTV service request.' using errcode='22023';
  end if;
  select * into tariff from public.installation_tariff_sets where system_type='cctv'
    and status in ('published','superseded') and effective_from<=now()
    and (effective_to is null or effective_to>now()) limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'requestServiceType',requested.service_type,'serviceCode',chosen.code,'serviceLabel',chosen.label_ru,
    'estimateServiceId',adapter.estimate_service_id,'partnerServiceId',chosen.partner_service_id,
    'unitCode',chosen.unit_code,'unitPrice',line.customer_unit_price,'currency',tariff.currency,
    'vatTreatment',tariff.vat_treatment,'tariffSetId',tariff.id,'tariffVersion',tariff.version
  ) order by requested.ordinality),'[]'::jsonb) into result
  from unnest(target_service_types) with ordinality requested(service_type,ordinality)
  left join lateral (
    select definition.* from public.cctv_object_service_bindings binding
    join public.cctv_service_definitions definition on definition.code=binding.service_code and definition.active
    where binding.object_type=target_object_type and binding.enabled and binding.calculator_default
      and definition.family=case requested.service_type
        when 'camera_installation' then 'equipment_installation'
        when 'cable_laying' then 'cable_routing'
        when 'commissioning' then 'commissioning'
        when 'ai_scenario_programming' then 'ai_scenario_programming'
        else 'remote_viewing_configuration' end
    order by binding.display_order,definition.sort_order limit 1
  ) chosen on true
  left join public.cctv_estimate_service_adapters adapter on adapter.service_code=chosen.code
  left join public.installation_tariffs line on line.tariff_set_id=tariff.id
    and line.service_type=chosen.tariff_service_type;
  return result;
end; $$;

create function public.list_public_cctv_service_options()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'objectType',binding.object_type,
    'requestServiceType',case definition.family
      when 'equipment_installation' then 'camera_installation'
      when 'cable_routing' then 'cable_laying'
      when 'commissioning' then 'commissioning'
      when 'remote_viewing_configuration' then 'remote_configuration'
      else 'ai_scenario_programming' end,
    'labelRu',definition.label_ru,'labelRo',definition.label_ro)
    order by binding.object_type,binding.display_order,definition.sort_order),'[]'::jsonb)
  from public.cctv_object_service_bindings binding
  join public.cctv_service_definitions definition on definition.code=binding.service_code and definition.active
  join public.installation_tariff_sets tariff_set on tariff_set.system_type='cctv'
    and tariff_set.status in ('published','superseded') and tariff_set.effective_from<=now()
    and (tariff_set.effective_to is null or tariff_set.effective_to>now())
  join public.installation_tariffs tariff on tariff.tariff_set_id=tariff_set.id
    and tariff.service_type=definition.tariff_service_type and tariff.customer_unit_price>0
  where binding.enabled and binding.calculator_default;
$$;
revoke all on function public.list_public_cctv_service_options() from public,anon,authenticated;
grant execute on function public.list_public_cctv_service_options() to service_role;

comment on column public.cctv_camera_candidate_pools.eligible_for_recommended is
  'Eligibility for shared deterministic Recommended selection; not a hard winner assignment.';
comment on column public.cctv_camera_candidate_pools.eligible_for_economy is
  'Eligibility for cheapest technically valid governed-price selection.';
