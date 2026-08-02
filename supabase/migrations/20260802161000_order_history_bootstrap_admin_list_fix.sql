begin;

create or replace function public.list_admin_order_history_bootstraps(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if auth.uid() is null or not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'summary', (select jsonb_build_object(
      'notRequested', (select count(*) from public.partner_companies c where c.status='active' and c.external_1c_id is not null and not exists(select 1 from public.partner_order_history_bootstrap_state s where s.company_id=c.id)),
      'queued', count(*) filter(where status='queued'), 'running', count(*) filter(where status='running'),
      'succeeded', count(*) filter(where status='succeeded'),
      'failed', count(*) filter(where status in ('failed_retryable','failed_terminal')),
      'stale', count(*) filter(where status='stale'),
      'oldestPending', min(requested_at) filter(where status in ('queued','running','failed_retryable'))
    ) from public.partner_order_history_bootstrap_state),
    'items', (select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value."requestedAt" desc),'[]'::jsonb) from (
      select state.id, state.company_id as "companyId", company.display_name as "companyName",
        state.status, state.requested_at as "requestedAt", state.started_at as "startedAt",
        state.completed_at as "completedAt", state.pages_processed as "pagesProcessed",
        state.source_rows as "sourceRows", state.published_rows as "publishedRows",
        state.rejected_rows as "rejectedRows", state.earliest_order_at as "earliestOrderAt",
        state.latest_order_at as "latestOrderAt", state.last_error_code as "lastErrorCode",
        sync.last_successful_full_sync_at as "lastFullSyncAt", sync.last_incremental_sync_at as "lastIncrementalSyncAt"
      from public.partner_order_history_bootstrap_state state
      join public.partner_companies company on company.id=state.company_id
      left join public.partner_order_history_sync_state sync on sync.company_id=state.company_id
      order by state.requested_at desc limit greatest(1,least(p_limit,100))
    ) row_value)
  );
end;
$$;

revoke all on function public.list_admin_order_history_bootstraps(integer) from public, anon;
grant execute on function public.list_admin_order_history_bootstraps(integer) to authenticated;

commit;
