begin;

create or replace function public.process_partner_commercial_opportunity_dirty_companies(target_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid;
  target record;
  processed_count integer := 0;
  failure_count integer := 0;
  active_total integer := 0;
  started timestamptz := clock_timestamp();
  resulting_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if target_limit not between 1 and 100 then raise exception 'Invalid limit' using errcode = '22023'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('partner_commercial_opportunity_projection', 0)) then
    return jsonb_build_object('status', 'locked', 'companiesProcessed', 0);
  end if;

  insert into public.partner_commercial_opportunity_projection_runs(status)
  values ('running') returning id into run_id;

  for target in
    select dirty.company_id
    from public.partner_commercial_opportunity_dirty_companies dirty
    where dirty.locked_at is null or dirty.locked_at < now() - interval '10 minutes'
    order by dirty.first_dirtied_at
    limit target_limit
    for update skip locked
  loop
    begin
      update public.partner_commercial_opportunity_dirty_companies
      set locked_at = now(), attempts = attempts + 1
      where company_id = target.company_id;
      active_total := active_total + public.refresh_partner_commercial_opportunities(target.company_id);
      delete from public.partner_commercial_opportunity_dirty_companies
      where company_id = target.company_id;
      processed_count := processed_count + 1;
    exception when others then
      failure_count := failure_count + 1;
      update public.partner_commercial_opportunity_dirty_companies
      set locked_at = null, last_error_code = sqlstate
      where company_id = target.company_id;
    end;
  end loop;

  resulting_status := case
    when failure_count = 0 then 'succeeded'
    when processed_count > 0 then 'partial'
    else 'failed'
  end;

  update public.partner_commercial_opportunity_projection_runs projection_run
  set status = resulting_status,
      companies_processed = processed_count,
      opportunities_active = active_total,
      failures = failure_count,
      duration_ms = extract(milliseconds from clock_timestamp() - started)::integer,
      finished_at = now()
  where projection_run.id = run_id;

  return jsonb_build_object(
    'runId', run_id,
    'status', resulting_status,
    'companiesProcessed', processed_count,
    'opportunitiesActive', active_total,
    'failures', failure_count,
    'durationMs', extract(milliseconds from clock_timestamp() - started)::integer
  );
end;
$$;

revoke all on function public.process_partner_commercial_opportunity_dirty_companies(integer)
from public, anon, authenticated;
grant execute on function public.process_partner_commercial_opportunity_dirty_companies(integer)
to service_role;

commit;
