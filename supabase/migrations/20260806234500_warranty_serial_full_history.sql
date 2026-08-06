begin;

create or replace function public.claim_warranty_serial_sync_run(p_page_size integer default 25)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare
  run public.warranty_serial_sync_runs;
  token uuid:=gen_random_uuid();
  business_date date:=(now() at time zone 'Europe/Chisinau')::date;
  verified_history_start constant date:=date '2018-01-01';
begin
  if auth.role()<>'service_role' then raise exception 'Warranty sync denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('warranty_serial_sync_claim'));
  select * into run from public.warranty_serial_sync_runs where status='running' order by started_at desc limit 1 for update;
  if found and run.locked_until is not null and run.locked_until>now() then return null; end if;
  if not found then
    select * into run from public.warranty_serial_sync_runs
    where status='failed' and current_stage<>'completed' and finished_at>now()-interval '24 hours'
    order by finished_at desc limit 1 for update;
    if found then
      update public.warranty_serial_sync_runs set status='running',safe_error_code=null,finished_at=null
      where id=run.id returning * into run;
    end if;
  end if;
  if not found then
    if exists(select 1 from public.warranty_serial_sync_runs where status='succeeded' and finished_at>now()-interval '20 hours') then return null; end if;
    insert into public.warranty_serial_sync_runs(mode,status,current_stage,page_size,range_start,range_end)
    values(case when not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded') then 'full'
        when extract(isodow from now() at time zone 'Europe/Chisinau')=7
          and not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded' and mode in ('full','historical_reconciliation') and finished_at>now()-interval '6 days')
          then 'historical_reconciliation' else 'incremental' end,
      'running','sale_scan',least(greatest(p_page_size,1),100),
      case when not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded')
          or (extract(isodow from now() at time zone 'Europe/Chisinau')=7
            and not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded' and mode in ('full','historical_reconciliation') and finished_at>now()-interval '6 days'))
        then verified_history_start else business_date-90 end,
      business_date)
    returning * into run;
  end if;
  update public.warranty_serial_sync_runs set lock_token=token,locked_until=now()+interval '4 minutes'
  where id=run.id returning * into run;
  return jsonb_build_object('runId',run.id,'lockToken',token,'mode',run.mode,'stage',run.current_stage,
    'skip',case when run.current_stage='return_scan' then run.return_skip else run.sale_skip end,
    'pageSize',run.page_size,'rangeStart',run.range_start,'rangeEnd',run.range_end);
end $$;

revoke all on function public.claim_warranty_serial_sync_run(integer) from public,anon,authenticated;
grant execute on function public.claim_warranty_serial_sync_run(integer) to service_role;

select pg_advisory_xact_lock(hashtext('warranty_serial_sync_claim'));

update public.warranty_serial_sync_runs
set range_start=date '2018-01-01',
    status='failed',
    current_stage='sale_scan',
    sale_skip=0,
    return_skip=0,
    sales_scan_complete=false,
    returns_scan_complete=false,
    pages_fetched=0,
    sale_headers_received=0,
    return_headers_received=0,
    details_fetched=0,
    events_published=0,
    conflicts_published=0,
    states_rebuilt=0,
    lock_token=null,
    locked_until=null,
    safe_error_code='full_history_window_extended',
    finished_at=now()
where mode='full'
  and status in ('running','failed')
  and current_stage<>'completed'
  and range_start>date '2018-01-01'
  and not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded');

commit;
