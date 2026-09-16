begin;

create or replace function public.complete_catalog_synchronization_source(
  p_source_sync_id uuid,
  p_source_domain text,
  p_changed_counts jsonb default '{}'::jsonb,
  p_source_duration_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.catalog_synchronization_runs;
  changed boolean := false;
  no_change_price_projection boolean := false;
begin
  if jsonb_typeof(coalesce(p_changed_counts, '{}'::jsonb)) <> 'object'
    or (p_source_duration_ms is not null and p_source_duration_ms < 0) then
    raise exception 'Invalid catalog synchronization completion.' using errcode = '22023';
  end if;

  no_change_price_projection := p_source_domain = 'prices'
    and jsonb_typeof(p_changed_counts -> 'prices') = 'number'
    and jsonb_typeof(p_changed_counts -> 'deactivated') = 'number'
    and (p_changed_counts ->> 'prices')::numeric = 0
    and (p_changed_counts ->> 'deactivated')::numeric = 0;

  perform pg_advisory_xact_lock(
    hashtextextended('catalog_sync:' || p_source_domain || ':' || p_source_sync_id::text, 0)
  );

  update public.catalog_synchronization_runs
  set source_status = 'succeeded',
    b2b_projection_status = 'succeeded',
    source_completed_at = coalesce(source_completed_at, now()),
    source_duration_ms = coalesce(p_source_duration_ms, source_duration_ms),
    changed_counts = coalesce(p_changed_counts, '{}'::jsonb),
    public_retail_projection_status = case
      when no_change_price_projection then 'skipped'
      else public_retail_projection_status
    end,
    public_retail_publication_status = case
      when no_change_price_projection then 'skipped'
      else public_retail_publication_status
    end,
    overall_status = case
      when no_change_price_projection then 'succeeded'
      else overall_status
    end,
    finished_at = case
      when no_change_price_projection then now()
      else finished_at
    end,
    next_projection_attempt_at = case
      when no_change_price_projection then null
      else next_projection_attempt_at
    end,
    safe_error_code = case
      when no_change_price_projection then null
      else safe_error_code
    end,
    updated_at = now()
  where source_domain = p_source_domain
    and source_sync_id = p_source_sync_id
    and source_status = 'running'
  returning * into target;

  changed := found;
  if not changed then
    select * into target
    from public.catalog_synchronization_runs
    where source_domain = p_source_domain
      and source_sync_id = p_source_sync_id;
  end if;

  if target.id is null then
    raise exception 'Catalog synchronization run is not registered.' using errcode = '22023';
  end if;

  if changed then
    insert into public.catalog_synchronization_events(
      synchronization_run_id,
      event_type,
      safe_evidence
    ) values (
      target.id,
      'source_succeeded',
      jsonb_build_object(
        'changedCounts', target.changed_counts,
        'publicProjectionSkipped', no_change_price_projection
      )
    );
  end if;

  return jsonb_build_object(
    'runId', target.id,
    'trigger', target.trigger_kind,
    'sourceStatus', target.source_status,
    'overallStatus', target.overall_status,
    'projectionSkipped', target.public_retail_projection_status = 'skipped',
    'idempotent', not changed
  );
end;
$$;

revoke all on function public.complete_catalog_synchronization_source(uuid, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.complete_catalog_synchronization_source(uuid, text, jsonb, integer)
  to service_role;

commit;
