alter table public.catalog_product_attributes
  add column if not exists classification text not null default 'CUSTOMER_SPECIFICATION';

alter table public.catalog_product_attribute_sync_stage
  add column if not exists classification text not null default 'CUSTOMER_SPECIFICATION';

update public.catalog_product_attributes
set classification = case
      when lower(property_ref) = 'cb442472-ac8c-11f1-639c-bc2411369b92'
        then 'MERCHANDISING_INTERNAL'
      when is_filterable then 'FACETABLE_SPECIFICATION'
      else 'CUSTOMER_SPECIFICATION'
    end,
    is_filterable = case
      when lower(property_ref) = 'cb442472-ac8c-11f1-639c-bc2411369b92' then false
      else is_filterable
    end,
    is_visible = case
      when lower(property_ref) = 'cb442472-ac8c-11f1-639c-bc2411369b92' then false
      else is_visible
    end;

update public.catalog_product_attribute_sync_stage
set classification = case
      when lower(property_ref) = 'cb442472-ac8c-11f1-639c-bc2411369b92'
        then 'MERCHANDISING_INTERNAL'
      when is_filterable then 'FACETABLE_SPECIFICATION'
      else 'CUSTOMER_SPECIFICATION'
    end,
    is_filterable = case
      when lower(property_ref) = 'cb442472-ac8c-11f1-639c-bc2411369b92' then false
      else is_filterable
    end,
    is_visible = case
      when lower(property_ref) = 'cb442472-ac8c-11f1-639c-bc2411369b92' then false
      else is_visible
    end;

alter table public.catalog_product_attributes
  add constraint catalog_product_attributes_classification_check
    check (classification in (
      'CUSTOMER_SPECIFICATION',
      'FACETABLE_SPECIFICATION',
      'MERCHANDISING_INTERNAL',
      'SYSTEM_INTERNAL'
    )),
  add constraint catalog_product_attributes_internal_exposure_check
    check (
      classification not in ('MERCHANDISING_INTERNAL', 'SYSTEM_INTERNAL')
      or (not is_visible and not is_filterable)
    );

alter table public.catalog_product_attribute_sync_stage
  add constraint catalog_attribute_stage_classification_check
    check (classification in (
      'CUSTOMER_SPECIFICATION',
      'FACETABLE_SPECIFICATION',
      'MERCHANDISING_INTERNAL',
      'SYSTEM_INTERNAL'
    )),
  add constraint catalog_attribute_stage_internal_exposure_check
    check (
      classification not in ('MERCHANDISING_INTERNAL', 'SYSTEM_INTERNAL')
      or (not is_visible and not is_filterable)
    );

comment on column public.catalog_product_attributes.classification is
  'Stable product-attribute semantic. Internal classifications retain source data but cannot enter customer-facing projections.';

comment on column public.catalog_product_attribute_sync_stage.classification is
  'Stable product-attribute semantic carried through atomic catalog snapshot publication.';

revoke select on public.catalog_product_attributes from authenticated;
grant select (
  id, product_id, property_ref, attribute_key, label, raw_value, display_value,
  resolved_display_value, resolution_status, resolved_value_ref, value_type,
  is_filterable, is_visible, source_updated_at, last_seen_sync_id, created_at,
  updated_at
) on public.catalog_product_attributes to authenticated;

drop policy if exists "Approved users can read product attributes"
  on public.catalog_product_attributes;
create policy "Approved users can read product attributes"
  on public.catalog_product_attributes
  for select
  to authenticated
  using (
    public.can_select_catalog()
    and is_visible
    and classification in ('CUSTOMER_SPECIFICATION', 'FACETABLE_SPECIFICATION')
  );

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
    classification, is_filterable, is_visible, source_updated_at,
    last_seen_sync_id, updated_at
  )
  select
    product_id, property_ref, attribute_key, label, raw_value, display_value,
    resolved_display_value, resolution_status, resolved_value_ref, value_type,
    classification, is_filterable, is_visible, source_updated_at,
    p_sync_id, updated_at
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
    classification = excluded.classification,
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
  'Publishes one complete classified attribute snapshot, removes stale rows, and reconciles derived CCTV capability in one transaction.';
