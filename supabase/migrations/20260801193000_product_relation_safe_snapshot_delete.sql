begin;

create or replace function public.publish_product_relation_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  run public.product_relation_sync_runs%rowtype;
  published_count integer;
  analog_sources integer;
  related_sources integer;
  duplicate_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('product_relation_publication'));
  select * into run from public.product_relation_sync_runs where id = p_sync_id for update;
  if run.id is null or run.status <> 'running' then
    raise exception 'invalid_relation_sync_state' using errcode = '22023';
  end if;

  insert into public.product_relation_sync_rejections(
    sync_id, relation_type, reason, source_product_external_1c_id,
    target_product_external_1c_id
  )
  select p_sync_id, stage.relation_type,
    case
      when source.id is null then 'unmapped_source'
      when target.id is null then 'unmapped_target'
      when source.id = target.id then 'self_relation'
      when not source.is_active or not source.is_visible then 'outside_scope_source'
      when not target.is_active then 'inactive_target'
      when not target.is_visible then 'unpublished_target'
      else 'outside_scope_target'
    end,
    stage.source_product_external_1c_id,
    stage.target_product_external_1c_id
  from public.product_relation_sync_stage stage
  left join public.catalog_products source
    on lower(source.external_1c_id) = lower(stage.source_product_external_1c_id)
  left join public.catalog_products target
    on lower(target.external_1c_id) = lower(stage.target_product_external_1c_id)
  where stage.sync_id = p_sync_id
    and (
      source.id is null or target.id is null or source.id = target.id
      or not source.is_active or not source.is_visible
      or not target.is_active or not target.is_visible
    );

  with ranked as (
    select stage.*,
      row_number() over (
        partition by stage.relation_type, stage.source_product_external_1c_id,
          stage.target_product_external_1c_id
        order by stage.source_priority, stage.source_ordinal, stage.source_fingerprint
      ) as row_rank
    from public.product_relation_sync_stage stage
    where stage.sync_id = p_sync_id
  )
  select count(*) into duplicate_count from ranked where row_rank > 1;

  delete from public.product_relations where id is not null;
  insert into public.product_relations(
    source_product_id, target_product_id, relation_type,
    source_product_external_1c_id, target_product_external_1c_id,
    source_characteristic_external_1c_id, target_characteristic_external_1c_id,
    source_fingerprint, source_version, sort_order, synchronized_at
  )
  select source.id, target.id, ranked.relation_type,
    ranked.source_product_external_1c_id, ranked.target_product_external_1c_id,
    ranked.source_characteristic_external_1c_id,
    ranked.target_characteristic_external_1c_id,
    ranked.source_fingerprint, p_sync_id::text, ranked.source_priority, now()
  from (
    select stage.*,
      row_number() over (
        partition by stage.relation_type, stage.source_product_external_1c_id,
          stage.target_product_external_1c_id
        order by stage.source_priority, stage.source_ordinal, stage.source_fingerprint
      ) as row_rank
    from public.product_relation_sync_stage stage
    where stage.sync_id = p_sync_id
  ) ranked
  join public.catalog_products source
    on lower(source.external_1c_id) = lower(ranked.source_product_external_1c_id)
    and source.is_active and source.is_visible
  join public.catalog_products target
    on lower(target.external_1c_id) = lower(ranked.target_product_external_1c_id)
    and target.is_active and target.is_visible
  where ranked.row_rank = 1 and source.id <> target.id;

  get diagnostics published_count = row_count;
  select count(distinct source_product_id) filter (where relation_type = 'analog'),
         count(distinct source_product_id) filter (where relation_type = 'related')
  into analog_sources, related_sources
  from public.product_relations;

  perform public.enqueue_all_partner_commercial_opportunity_companies();

  update public.product_relation_sync_runs sync
  set status = 'succeeded', finished_at = now(), lock_acquired_at = null,
      rows_published = published_count,
      source_products_with_analogs = coalesce(analog_sources, 0),
      source_products_with_related = coalesce(related_sources, 0),
      duplicate_rows = sync.duplicate_rows + duplicate_count,
      unmapped_sources = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'unmapped_source'),
      unmapped_targets = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'unmapped_target'),
      inactive_targets = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'inactive_target'),
      unpublished_targets = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'unpublished_target'),
      outside_scope_targets = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'outside_scope_target'),
      outside_scope_sources = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'outside_scope_source'),
      self_relations = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'self_relation'),
      duration_ms = greatest(0, floor(extract(epoch from (now() - sync.started_at)) * 1000)::integer),
      updated_at = now()
  where sync.id = p_sync_id;

  return jsonb_build_object(
    'syncId', p_sync_id, 'published', published_count,
    'sourceProductsWithAnalogs', coalesce(analog_sources, 0),
    'sourceProductsWithRelated', coalesce(related_sources, 0)
  );
end;
$$;

revoke all on function public.publish_product_relation_snapshot(uuid)
from public, anon, authenticated;
grant execute on function public.publish_product_relation_snapshot(uuid) to service_role;

comment on function public.publish_product_relation_snapshot(uuid) is
  'Atomically replaces product relations using a pg-safeupdate-compatible guarded delete.';

commit;
