create or replace function public.reconcile_cctv_camera_capabilities(p_product_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_upserted integer := 0;
  v_removed integer := 0;
begin
  if coalesce(cardinality(p_product_ids), 0) = 0 then
    return jsonb_build_object('upserted', 0, 'removed', 0);
  end if;

  with attribute_facts as (
    select
      product.id as product_id,
      max(attribute.display_value) filter (
        where attribute.label = 'Разрешение-MPx'
          and attribute.display_value ~ '^[0-9]{1,2}$'
      ) as resolution_mp,
      bool_or(attribute.display_value in (
        'TCP-IP (Цифровая)',
        'WI-FI (Беспроводная)',
        'TCP+WIFI (Гибридная)',
        'TCP+4G (Гибридная)'
      )) filter (
        where attribute.label = 'Передача-данных'
      ) as has_network_transport,
      bool_or(trim(attribute.display_value) <> '') filter (
        where attribute.label = 'Тип-объектива'
      ) as has_lens,
      bool_or(trim(attribute.display_value) <> '') filter (
        where attribute.label = 'Форм-фактор'
      ) as has_form_factor,
      bool_or(attribute.display_value in ('Smart Dual Light', 'Starlight', 'WizColor', 'WizColor Lite')) filter (
        where attribute.label = 'Светочувствительность'
      ) as color_night,
      bool_or(attribute.display_value = 'SMART ANPR') filter (
        where attribute.label = 'Технология'
      ) as anpr,
      bool_or(attribute.display_value <> 'Отсутствует') filter (
        where attribute.label = 'Аналитика'
      ) as video_analytics
    from public.catalog_products product
    join public.catalog_product_attributes attribute on attribute.product_id = product.id
    where product.id = any(p_product_ids)
      and product.is_active
      and product.is_visible
    group by product.id
  ), eligible as (
    select
      product_id,
      resolution_mp::smallint as resolution_mp,
      color_night,
      anpr,
      video_analytics
    from attribute_facts
    where resolution_mp is not null
      and has_network_transport
      and has_lens
      and has_form_factor
  ), removed as (
    delete from public.cctv_camera_capabilities capability
    where capability.product_id = any(p_product_ids)
      and capability.evidence_source like 'synchronized_catalog_attributes%'
      and not exists (
        select 1 from eligible where eligible.product_id = capability.product_id
      )
    returning 1
  ), upserted as (
    insert into public.cctv_camera_capabilities as capability (
      product_id, resolution_mp, network_camera, poe_supported, color_night, anpr,
      video_analytics, verified, evidence_source, verified_at
    )
    select
      product_id,
      resolution_mp,
      true,
      null,
      color_night,
      anpr,
      video_analytics,
      true,
      'synchronized_catalog_attributes:network_camera_v2',
      now()
    from eligible
    on conflict (product_id) do update set
      resolution_mp = excluded.resolution_mp,
      network_camera = excluded.network_camera,
      poe_supported = excluded.poe_supported,
      color_night = excluded.color_night,
      anpr = excluded.anpr,
      video_analytics = excluded.video_analytics,
      verified = excluded.verified,
      evidence_source = excluded.evidence_source,
      verified_at = excluded.verified_at,
      version = capability.version + 1,
      updated_at = now()
    where (
      capability.resolution_mp,
      capability.network_camera,
      capability.poe_supported,
      capability.color_night,
      capability.anpr,
      capability.video_analytics,
      capability.verified,
      capability.evidence_source
    ) is distinct from (
      excluded.resolution_mp,
      excluded.network_camera,
      excluded.poe_supported,
      excluded.color_night,
      excluded.anpr,
      excluded.video_analytics,
      excluded.verified,
      excluded.evidence_source
    )
    returning 1
  )
  select
    (select count(*) from upserted),
    (select count(*) from removed)
  into v_upserted, v_removed;

  return jsonb_build_object('upserted', v_upserted, 'removed', v_removed);
end;
$$;

revoke all on function public.reconcile_cctv_camera_capabilities(uuid[])
  from public, anon, authenticated;
grant execute on function public.reconcile_cctv_camera_capabilities(uuid[])
  to service_role;

comment on function public.reconcile_cctv_camera_capabilities(uuid[]) is
  'Derives verified network CCTV capability from the authoritative local catalog attribute snapshot.';

create or replace function public.publish_catalog_product_attributes(
  p_sync_id uuid,
  p_product_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_published integer := 0;
  v_removed integer := 0;
begin
  insert into public.catalog_product_attributes (
    product_id, property_ref, attribute_key, label, raw_value, display_value,
    resolved_display_value, resolution_status, resolved_value_ref, value_type,
    is_filterable, is_visible, source_updated_at, last_seen_sync_id, updated_at
  )
  select
    product_id, property_ref, attribute_key, label, raw_value, display_value,
    resolved_display_value, resolution_status, resolved_value_ref, value_type,
    is_filterable, is_visible, source_updated_at, p_sync_id, updated_at
  from public.catalog_product_attribute_sync_stage
  where sync_id = p_sync_id
  on conflict (product_id, property_ref) do update set
    attribute_key = excluded.attribute_key,
    label = excluded.label,
    raw_value = excluded.raw_value,
    display_value = excluded.display_value,
    resolved_display_value = excluded.resolved_display_value,
    resolution_status = excluded.resolution_status,
    resolved_value_ref = excluded.resolved_value_ref,
    value_type = excluded.value_type,
    is_filterable = excluded.is_filterable,
    is_visible = excluded.is_visible,
    source_updated_at = excluded.source_updated_at,
    last_seen_sync_id = excluded.last_seen_sync_id,
    updated_at = excluded.updated_at;

  get diagnostics v_published = row_count;

  delete from public.catalog_product_attributes
  where product_id = any(p_product_ids)
    and last_seen_sync_id is distinct from p_sync_id;
  get diagnostics v_removed = row_count;

  perform public.reconcile_cctv_camera_capabilities(p_product_ids);

  delete from public.catalog_product_attribute_sync_stage where sync_id = p_sync_id;

  return jsonb_build_object('published', v_published, 'removed', v_removed);
end;
$$;

revoke all on function public.publish_catalog_product_attributes(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.publish_catalog_product_attributes(uuid, uuid[])
  to service_role;

comment on function public.publish_catalog_product_attributes(uuid, uuid[]) is
  'Publishes one complete attribute snapshot, removes stale rows, and reconciles derived CCTV capability in one transaction.';

select public.reconcile_cctv_camera_capabilities(array_agg(id))
from public.catalog_products;

select public.refresh_cctv_camera_turnover_signals();
