begin;

create or replace function public.claim_one_c_service_history_sync_v3(p_page_size integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target public.one_c_service_history_sync_runs;
  token uuid := gen_random_uuid();
  run_mode text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role access required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('one_c_service_history_sync'));
  update public.one_c_service_history_sync_runs
  set status = 'failed', safe_error_code = 'stale_lock', finished_at = now(), updated_at = now()
  where status = 'running' and locked_until < now() - interval '2 minutes';

  select * into target
  from public.one_c_service_history_sync_runs
  where status = 'running'
  limit 1
  for update;

  if found and target.locked_until > now() then
    return null;
  end if;

  if not found then
    if exists (select 1 from public.one_c_service_history where completed_work_checked_at is null) then
      run_mode := 'completed_work_backfill';
    elsif exists (
      select 1
      from public.one_c_service_history
      where service_financial_checked_at is null and is_active
    ) then
      run_mode := 'financial_backfill';
    else
      if exists (
        select 1 from public.one_c_service_history_sync_runs
        where status = 'succeeded' and finished_at > now() - interval '55 minutes'
      ) then
        return null;
      end if;
      run_mode := case
        when not exists (select 1 from public.one_c_service_history_sync_runs where status = 'succeeded') then 'initial'
        when not exists (
          select 1 from public.one_c_service_history_sync_runs
          where status = 'succeeded' and mode = 'historical_reconciliation'
            and finished_at > now() - interval '6 days'
        ) then 'historical_reconciliation'
        else 'incremental'
      end;
    end if;

    insert into public.one_c_service_history_sync_runs(mode, range_start, range_end, page_size)
    values (
      run_mode,
      case
        when run_mode in ('completed_work_backfill', 'financial_backfill') then coalesce(
          (select min(source_document_date)::date from public.one_c_service_history),
          current_date - interval '60 months'
        )
        when run_mode in ('initial', 'historical_reconciliation') then current_date - interval '60 months'
        else current_date - interval '120 days'
      end,
      current_date,
      least(greatest(p_page_size, 1), 100)
    )
    returning * into target;
  end if;

  update public.one_c_service_history_sync_runs
  set lock_token = token, locked_until = now() + interval '4 minutes', updated_at = now()
  where id = target.id
  returning * into target;

  return jsonb_build_object(
    'runId', target.id,
    'lockToken', token,
    'mode', target.mode,
    'skip', target.current_skip,
    'pageSize', target.page_size,
    'rangeStart', target.range_start,
    'rangeEnd', target.range_end,
    'baseline', target.mode = 'initial'
  );
end;
$$;

revoke all on function public.claim_one_c_service_history_sync_v3(integer)
  from public, anon, authenticated;
grant execute on function public.claim_one_c_service_history_sync_v3(integer)
  to service_role;

commit;
