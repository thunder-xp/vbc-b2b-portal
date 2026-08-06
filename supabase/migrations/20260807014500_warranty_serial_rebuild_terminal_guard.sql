begin;

create or replace function public.complete_warranty_serial_sync_run(p_run_id uuid,p_lock_token uuid)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare run public.warranty_serial_sync_runs; batch jsonb; rebuilt integer; terminal boolean; last_hash text;
begin
  if auth.role()<>'service_role' then raise exception 'Warranty sync denied' using errcode='42501'; end if;
  select * into run from public.warranty_serial_sync_runs where id=p_run_id for update;
  if not found or run.status<>'running' or run.current_stage<>'state_rebuild' or run.lock_token is distinct from p_lock_token then
    raise exception 'Warranty sync completion lease is stale' using errcode='40001';
  end if;
  batch:=public.rebuild_warranty_serial_states_batch(p_run_id,run.rebuild_cursor,250);
  rebuilt:=(batch->>'rebuilt')::integer;
  last_hash:=nullif(batch->>'lastHash','');
  terminal:=not exists(
    select 1 from public.warranty_serial_events
    where normalized_serial_hash>coalesce(last_hash,'')
  );
  update public.warranty_serial_sync_runs set
    rebuild_cursor=last_hash,states_rebuilt=states_rebuilt+rebuilt,
    status=case when terminal then 'succeeded' else status end,
    current_stage=case when terminal then 'completed' else current_stage end,
    lock_token=null,locked_until=null,finished_at=case when terminal then now() else null end
  where id=p_run_id;
  return jsonb_build_object('runId',p_run_id,'status',case when terminal then 'succeeded' else 'running' end,
    'statesRebuilt',rebuilt,'totalStatesRebuilt',(select states_rebuilt from public.warranty_serial_sync_runs where id=p_run_id));
end $$;

do $$
declare invalid_run_id uuid;
begin
  select run.id into invalid_run_id
  from public.warranty_serial_sync_runs run
  where run.status='succeeded'
    and run.mode='full'
    and run.rebuild_cursor is not null
    and exists(
      select 1 from public.warranty_serial_events event
      where event.normalized_serial_hash>run.rebuild_cursor
    )
  order by run.finished_at desc
  limit 1
  for update;

  if invalid_run_id is not null then
    if not exists(
      select 1 from public.warranty_serial_sync_runs run
      where run.status='succeeded' and run.id<>invalid_run_id
    ) then
      delete from public.warranty_serial_state;
    end if;
    update public.warranty_serial_sync_runs set
      status='failed',current_stage='state_rebuild',rebuild_cursor=null,states_rebuilt=0,
      lock_token=null,locked_until=null,safe_error_code='rebuild_terminal_guard_corrected',finished_at=now()
    where id=invalid_run_id;
  end if;
end $$;

revoke all on function public.complete_warranty_serial_sync_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_warranty_serial_sync_run(uuid,uuid) to service_role;

commit;
