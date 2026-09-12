-- Complete the bounded Admin overview contract without adding another read.
create or replace function public.get_admin_access_risk_overview(
  p_query text default null,
  p_risk_state text default null,
  p_mode text default null,
  p_sort text default 'risk_desc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.security.view')
    or (p_risk_state is not null and p_risk_state not in ('LEARNING','LOW','ELEVATED','HIGH'))
    or (p_mode is not null and p_mode not in ('NORMAL','ENHANCED'))
    or p_sort not in ('risk_desc','activity_desc','company_asc')
    or p_page not between 1 and 10000 or p_page_size not between 1 and 100
  then raise exception 'Access risk overview denied.' using errcode='42501'; end if;

  with rows as (
    select company.id, company.display_name,
      coalesce(snapshot.risk_state, 'LEARNING') risk_state,
      coalesce(snapshot.risk_score, 0) risk_score,
      coalesce(snapshot.affected_user_count, 0) affected_user_count,
      coalesce(snapshot.active_user_count, 0) active_user_count,
      coalesce(snapshot.reason_codes, '{}') reason_codes,
      coalesce((top_user.metrics->>'devices24h')::integer, 0) devices_24h,
      coalesce((top_user.metrics->>'networks24h')::integer, 0) networks_24h,
      coalesce((top_user.metrics->>'uniqueSkus24h')::integer, 0) unique_skus_24h,
      coalesce((top_user.metrics->>'commercialIntents24h')::integer, 0) commercial_intents_24h,
      snapshot.last_activity_at, snapshot.evaluated_at,
      case when profile.mode='ENHANCED' and profile.expires_at>now() then 'ENHANCED' else 'NORMAL' end mode,
      case when profile.mode='ENHANCED' and profile.expires_at>now() then profile.expires_at else null end enhanced_until
    from public.partner_companies company
    left join public.access_risk_company_snapshots snapshot on snapshot.company_id=company.id
    left join public.access_risk_monitoring_profiles profile on profile.company_id=company.id
    left join lateral (
      select user_snapshot.observed_metrics as metrics
      from public.access_risk_user_snapshots user_snapshot
      where user_snapshot.company_id=company.id
      order by
        case user_snapshot.risk_state when 'HIGH' then 4 when 'ELEVATED' then 3 when 'LOW' then 2 else 1 end desc,
        user_snapshot.risk_score desc,
        user_snapshot.evaluated_at desc,
        user_snapshot.user_id
      limit 1
    ) top_user on true
    where company.status='active'
      and (p_query is null or btrim(p_query)='' or company.display_name ilike '%'||left(btrim(p_query),100)||'%')
  ), filtered as (
    select * from rows where (p_risk_state is null or risk_state=p_risk_state) and (p_mode is null or mode=p_mode)
  ), paged as (
    select * from filtered order by
      case when p_sort='risk_desc' then case risk_state when 'HIGH' then 4 when 'ELEVATED' then 3 when 'LOW' then 2 else 1 end end desc,
      case when p_sort='risk_desc' then risk_score end desc,
      case when p_sort='activity_desc' then last_activity_at end desc nulls last,
      case when p_sort='company_asc' then display_name end asc,
      display_name asc, id
    offset (p_page-1)*p_page_size limit p_page_size
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'high',count(*) filter(where risk_state='HIGH'),
      'elevated',count(*) filter(where risk_state='ELEVATED'),
      'low',count(*) filter(where risk_state='LOW'),
      'learning',count(*) filter(where risk_state='LEARNING'),
      'enhanced',count(*) filter(where mode='ENHANCED'),
      'total',count(*)
    ),
    'items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
    'total',count(*),'page',p_page,'pageSize',p_page_size,
    'diagnostics',(select to_jsonb(run) || jsonb_build_object('is_stale', run.completed_at < now() - interval '2 hours') from public.access_risk_evaluation_runs run order by completed_at desc limit 1)
  ) into result from filtered;
  return result;
end;
$$;

revoke all on function public.get_admin_access_risk_overview(text,text,text,text,integer,integer) from public, anon;
grant execute on function public.get_admin_access_risk_overview(text,text,text,text,integer,integer) to authenticated;
