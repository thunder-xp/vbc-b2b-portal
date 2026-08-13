begin;

create or replace function public.complete_partner_order_history_bootstrap_v2(
  p_bootstrap_id uuid, p_lock_token uuid, p_result jsonb
) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$
declare state public.partner_order_history_bootstrap_state%rowtype; fingerprint text; earliest_at timestamptz; latest_at timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'Order bootstrap denied' using errcode='42501'; end if;
  select * into state from public.partner_order_history_bootstrap_state where id=p_bootstrap_id for update;
  if not found then return jsonb_build_object('status','coordination_conflict','code','run_not_found','runId',p_bootstrap_id); end if;
  if state.status='succeeded' then return jsonb_build_object('status','coordination_conflict','code','already_completed','runId',p_bootstrap_id); end if;
  if state.status<>'running' then return jsonb_build_object('status','coordination_conflict','code','superseded','runId',p_bootstrap_id); end if;
  if state.lock_token is distinct from p_lock_token then return jsonb_build_object('status','coordination_conflict','code','lease_lost','runId',p_bootstrap_id); end if;

  select min(one_c_document_date),max(one_c_document_date) into earliest_at,latest_at
  from public.partner_order_history where company_id=state.company_id;
  fingerprint:=encode(extensions.digest(state.company_id::text||'|'||lower(state.one_c_counterparty_ref)||'|'||
    coalesce(p_result->>'received','0')||'|'||coalesce(latest_at::text,''),'sha256'),'hex');
  update public.partner_order_history_bootstrap_state set
    status='succeeded',completed_at=now(),cursor=null,
    pages_processed=greatest(0,coalesce((p_result->>'pagesFetched')::integer,0)),
    source_rows=greatest(0,coalesce((p_result->>'rawReceived')::integer,0)),
    staged_rows=greatest(0,coalesce((p_result->>'received')::integer,0)),
    published_rows=greatest(0,coalesce((p_result->>'received')::integer,0)),
    rejected_rows=greatest(0,coalesce((p_result->>'rejected')::integer,0)),
    earliest_order_at=earliest_at,latest_order_at=latest_at,last_error_code=null,next_retry_at=null,
    source_fingerprint=fingerprint,locked_at=null,lock_token=null,updated_at=now()
  where id=state.id;
  insert into public.partner_order_history_bootstrap_events(bootstrap_id,company_id,event_type,safe_reason,safe_metadata)
  values(state.id,state.company_id,'completed','full_history_import_succeeded',jsonb_build_object(
    'pages',greatest(0,coalesce((p_result->>'pagesFetched')::integer,0)),
    'sourceRows',greatest(0,coalesce((p_result->>'rawReceived')::integer,0)),
    'publishedRows',greatest(0,coalesce((p_result->>'received')::integer,0)),
    'rejectedRows',greatest(0,coalesce((p_result->>'rejected')::integer,0))));
  perform public.enqueue_partner_momentum_company(state.company_id,'order_history_bootstrap_completed');
  insert into public.partner_commercial_opportunity_dirty_companies(company_id,reason)
  values(state.company_id,'order_history_bootstrap_completed')
  on conflict(company_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null;
  return jsonb_build_object('status','completed','runId',state.id);
end $$;

create or replace function public.complete_partner_order_history_bootstrap(
  p_bootstrap_id uuid,p_lock_token uuid,p_result jsonb
) returns void language plpgsql security definer set search_path=public set row_security=off as $$
declare result jsonb;
begin
  result:=public.complete_partner_order_history_bootstrap_v2(p_bootstrap_id,p_lock_token,p_result);
  if result->>'status'='coordination_conflict' then
    raise exception '%',result->>'code' using errcode='PT409';
  end if;
end $$;

do $migration$
declare target regprocedure; definition text;
begin
  foreach target in array array[
    'public.complete_warranty_serial_sync_run(uuid,uuid)'::regprocedure,
    'public.publish_warranty_serial_sync_step(uuid,uuid,text,integer,integer,jsonb,jsonb,boolean)'::regprocedure,
    'public.publish_one_c_service_history_page(uuid,uuid,integer,jsonb,boolean)'::regprocedure,
    'public.publish_one_c_service_serial_enrichment(uuid,uuid,jsonb,boolean)'::regprocedure
  ] loop
    definition:=pg_get_functiondef(target);
    if position('40001' in definition)=0 then raise exception 'Expected worker 40001 contract missing for %',target; end if;

    if target='public.complete_warranty_serial_sync_run(uuid,uuid)'::regprocedure then
      definition:=replace(definition,
        E'if not found or run.status<>\'running\' or run.current_stage<>\'state_rebuild\' or run.lock_token is distinct from p_lock_token then\n    raise exception \'Warranty sync completion lease is stale\' using errcode=\'40001\';\n  end if;',
        E'if not found then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'run_not_found\',\'runId\',p_run_id); end if;\n  if run.status=\'succeeded\' then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'already_completed\',\'runId\',p_run_id); end if;\n  if run.status<>\'running\' or run.current_stage<>\'state_rebuild\' then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'superseded\',\'runId\',p_run_id); end if;\n  if run.lock_token is distinct from p_lock_token or run.locked_until<now() then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'lease_lost\',\'runId\',p_run_id); end if;');
    elsif target='public.publish_warranty_serial_sync_step(uuid,uuid,text,integer,integer,jsonb,jsonb,boolean)'::regprocedure then
      definition:=replace(definition,
        E'if not found or run.status<>\'running\' or run.lock_token is distinct from p_lock_token or run.current_stage<>p_stage then\n    raise exception \'Warranty sync lease is stale\' using errcode=\'40001\';\n  end if;',
        E'if not found then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'run_not_found\',\'runId\',p_run_id); end if;\n  if run.status=\'succeeded\' then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'already_completed\',\'runId\',p_run_id); end if;\n  if run.status<>\'running\' or run.current_stage<>p_stage then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'superseded\',\'runId\',p_run_id); end if;\n  if run.lock_token is distinct from p_lock_token or run.locked_until<now() then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'lease_lost\',\'runId\',p_run_id); end if;');
      definition:=replace(definition,E'raise exception \'Warranty sync cursor is stale\' using errcode=\'40001\';',E'return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'stale_cursor\',\'runId\',p_run_id);');
      definition:=replace(definition,E'then raise exception \'Warranty sync repeated a previously seen page\' using errcode=\'40001\'; end if;',E'then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'replayed_page\',\'runId\',p_run_id); end if;');
    elsif target='public.publish_one_c_service_history_page(uuid,uuid,integer,jsonb,boolean)'::regprocedure then
      definition:=replace(definition,
        E'if not found or run.status <> \'running\' or run.lock_token is distinct from p_lock_token or run.current_skip <> p_skip then\n    raise exception \'Invalid service-history sync lease.\' using errcode = \'40001\';\n  end if;',
        E'if not found then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'run_not_found\',\'runId\',p_run_id); end if;\n  if run.status=\'succeeded\' then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'already_completed\',\'runId\',p_run_id); end if;\n  if run.status<>\'running\' then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'superseded\',\'runId\',p_run_id); end if;\n  if run.lock_token is distinct from p_lock_token or run.locked_until<now() then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'lease_lost\',\'runId\',p_run_id); end if;\n  if run.current_skip<>p_skip then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'stale_cursor\',\'runId\',p_run_id); end if;');
    else
      definition:=replace(definition,
        E'if not found or run.status<>\'running\' or run.lock_token is distinct from p_lock_token or run.locked_until<now() then\n    raise exception \'Invalid serial-enrichment lease.\' using errcode=\'40001\';\n  end if;',
        E'if not found then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'run_not_found\',\'runId\',p_run_id); end if;\n  if run.status=\'succeeded\' then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'already_completed\',\'runId\',p_run_id); end if;\n  if run.status<>\'running\' then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'superseded\',\'runId\',p_run_id); end if;\n  if run.lock_token is distinct from p_lock_token or run.locked_until<now() then return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'lease_lost\',\'runId\',p_run_id); end if;');
      definition:=replace(definition,E'raise exception \'Stale serial-enrichment source.\' using errcode=\'40001\';',E'return jsonb_build_object(\'status\',\'coordination_conflict\',\'code\',\'stale_source\',\'runId\',p_run_id);');
    end if;
    if position('40001' in definition)>0 then raise exception 'Worker 40001 replacement incomplete for %',target; end if;
    execute definition;
  end loop;
end $migration$;

create or replace function public.publish_one_c_service_history_page_v2(
  p_run_id uuid,p_lock_token uuid,p_skip integer,p_rows jsonb,p_page_complete boolean
) returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare result jsonb; checked_count integer:=0; populated_count integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'Service-role access required.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_rows,'[]'::jsonb))>100 then
    raise exception 'Invalid service-history page.' using errcode='22023';
  end if;
  result:=public.publish_one_c_service_history_page(p_run_id,p_lock_token,p_skip,p_rows,p_page_complete);
  if result->>'status'='coordination_conflict' then return result; end if;
  with source as (
    select lower(row->>'source_document_ref') source_document_ref,
      nullif(btrim(left(coalesce(row->>'completed_work_summary',''),8000)),'') completed_work_summary
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) row
  ),updated as (
    update public.one_c_service_history history set completed_work_summary=source.completed_work_summary,
      completed_work_checked_at=now(),updated_at=now() from source
    where history.source_document_ref=source.source_document_ref and history.last_seen_run_id=p_run_id
    returning history.completed_work_summary
  ) select count(*),count(*) filter(where completed_work_summary is not null) into checked_count,populated_count from updated;
  return result||jsonb_build_object('completedWorkChecked',checked_count,'completedWorkPopulated',populated_count);
end $$;

revoke all on function public.complete_partner_order_history_bootstrap_v2(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_partner_order_history_bootstrap_v2(uuid,uuid,jsonb) to service_role;

comment on function public.complete_partner_order_history_bootstrap_v2(uuid,uuid,jsonb) is
  'Completes one owned bootstrap lease. Expected stale/duplicate coordination returns a structured result and is never surfaced as SQLSTATE 40001.';
comment on function public.publish_warranty_serial_sync_step(uuid,uuid,text,integer,integer,jsonb,jsonb,boolean) is
  'Publishes one exact owned cursor. Expected lease, cursor, and replay conflicts return structured worker outcomes.';
comment on function public.complete_warranty_serial_sync_run(uuid,uuid) is
  'Advances one bounded rebuild batch under an exact lease. Expected coordination conflicts return structured outcomes.';
comment on function public.publish_one_c_service_history_page(uuid,uuid,integer,jsonb,boolean) is
  'Publishes one exact service-history page under an owned lease. Expected coordination conflicts return structured outcomes.';
comment on function public.publish_one_c_service_serial_enrichment(uuid,uuid,jsonb,boolean) is
  'Publishes one bounded enrichment page. Lease and stale-source conflicts return structured outcomes.';

do $assert$
begin
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'complete_partner_order_history_bootstrap','complete_partner_order_history_bootstrap_v2',
      'complete_warranty_serial_sync_run','publish_warranty_serial_sync_step',
      'publish_one_c_service_history_page','publish_one_c_service_serial_enrichment'
    ) and pg_get_functiondef(p.oid) like '%40001%'
  ) then raise exception 'Worker coordination migration retained application-generated 40001'; end if;
end $assert$;

commit;
