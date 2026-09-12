-- Keep the displayed high-velocity threshold identical to the activation rule.
create or replace function public.evaluate_partner_access_risk(p_company_limit integer default 1000)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  run_started timestamptz := clock_timestamp();
  expired_count integer := 0;
  deleted_count integer := 0;
  company_count integer := 0;
  user_count integer := 0;
  canonical_since timestamptz;
begin
  if current_user not in ('postgres', 'service_role') or p_company_limit not between 1 and 1000 then
    raise exception 'Access risk evaluation denied.' using errcode = '42501';
  end if;

  with expired as (
    update public.access_risk_monitoring_profiles profile
    set mode = 'NORMAL', activated_at = null, activated_by = null, expires_at = null,
      reason = null, updated_at = now()
    where profile.mode = 'ENHANCED' and profile.expires_at <= now()
    returning profile.company_id
  ), audited as (
    insert into public.access_risk_monitoring_events(
      company_id, actor_user_id, event_type, previous_mode, next_mode, reason
    ) select company_id, null, 'ENHANCED_EXPIRED', 'ENHANCED', 'NORMAL', 'Automatic expiry'
      from expired returning 1
  ) select count(*) into expired_count from audited;

  delete from public.access_risk_enhanced_events where expires_at <= now();
  get diagnostics deleted_count = row_count;
  delete from public.access_risk_ingestion_receipts where expires_at <= now();
  delete from public.access_risk_hourly_aggregates where hour_bucket < now() - interval '32 days';
  delete from public.access_risk_evaluation_runs where completed_at < now() - interval '90 days';
  delete from public.access_risk_monitoring_events where occurred_at < now() - interval '13 months';
  canonical_since := case
    when exists(select 1 from public.access_risk_evaluation_runs where status = 'COMPLETED')
      then now() - interval '3 hours'
    else now() - interval '32 days'
  end;

  -- Canonical behavior records own browse and commercial counters. The Risk Radar
  -- only projects them into hourly aggregates and never creates a second NORMAL raw stream.
  insert into public.access_risk_hourly_aggregates(
    company_id, user_id, hour_bucket, canonical_event_count, browse_event_count,
    product_view_count, search_count, cart_intent_count, estimate_intent_count,
    order_intent_count, session_mask, product_mask, category_mask,
    first_activity_at, last_activity_at
  )
  select event.company_id, event.user_id, date_trunc('hour', event.occurred_at), count(*)::integer,
    count(*) filter (where event.event_name in ('catalog_viewed','category_viewed','search_performed','search_no_results','filters_applied','product_viewed','merchandising_product_clicked'))::integer,
    count(*) filter (where event.event_name in ('product_viewed','merchandising_product_clicked'))::integer,
    count(*) filter (where event.event_name in ('search_performed','search_no_results'))::integer,
    count(*) filter (where event.event_name in ('product_added_to_cart','reorder_started','reorder_submitted'))::integer,
    count(*) filter (where event.event_name in ('product_added_to_estimate','estimate_created','proposal_generated','proposal_created','proposal_version_created'))::integer,
    count(*) filter (where event.event_name in ('order_submitted','proposal_converted_to_order','reorder_submitted'))::integer,
    public.access_risk_merge_masks(array_agg(distinct public.access_risk_mask_for_bucket(get_byte(extensions.digest('aggregate:session:'||event.session_id::text, 'sha256'), 31)))),
    public.access_risk_merge_masks(array_agg(distinct public.access_risk_mask_for_bucket(get_byte(extensions.digest('aggregate:product:'||event.product_id::text, 'sha256'), 31))) filter (where event.product_id is not null)),
    public.access_risk_merge_masks(array_agg(distinct public.access_risk_mask_for_bucket(get_byte(extensions.digest('aggregate:category:'||event.category_id::text, 'sha256'), 31))) filter (where event.category_id is not null)),
    min(event.occurred_at), max(event.occurred_at)
  from public.partner_behavior_events event
  where event.occurred_at >= canonical_since
  group by event.company_id, event.user_id, date_trunc('hour', event.occurred_at)
  on conflict(company_id, user_id, hour_bucket) do update set
    canonical_event_count = excluded.canonical_event_count,
    browse_event_count = excluded.browse_event_count,
    product_view_count = excluded.product_view_count,
    search_count = excluded.search_count,
    cart_intent_count = excluded.cart_intent_count,
    estimate_intent_count = excluded.estimate_intent_count,
    order_intent_count = excluded.order_intent_count,
    session_mask = access_risk_hourly_aggregates.session_mask | excluded.session_mask,
    product_mask = access_risk_hourly_aggregates.product_mask | excluded.product_mask,
    category_mask = access_risk_hourly_aggregates.category_mask | excluded.category_mask,
    first_activity_at = least(access_risk_hourly_aggregates.first_activity_at, excluded.first_activity_at),
    last_activity_at = greatest(access_risk_hourly_aggregates.last_activity_at, excluded.last_activity_at),
    updated_at = now();

  with eligible_companies as (
    select id from public.partner_companies where status = 'active' order by id limit p_company_limit
  ), eligible_members as (
    select membership.company_id, membership.user_id
    from public.company_memberships membership
    join eligible_companies company on company.id = membership.company_id
    join public.user_profiles profile on profile.id = membership.user_id and profile.status = 'active'
    where membership.status = 'active'
  ), current_stats as (
    select member.company_id, member.user_id,
      coalesce(sum(a.browse_event_count),0)::integer browse_events,
      coalesce(sum(a.product_view_count),0)::integer product_views,
      coalesce(sum(a.cart_intent_count+a.estimate_intent_count+a.order_intent_count),0)::integer commercial_intents,
      public.access_risk_merge_masks(array_agg(a.session_mask) filter(where a.hour_bucket is not null)) session_mask,
      public.access_risk_merge_masks(array_agg(a.device_mask) filter(where a.hour_bucket is not null)) device_mask,
      public.access_risk_merge_masks(array_agg(a.network_mask) filter(where a.hour_bucket is not null)) network_mask,
      public.access_risk_merge_masks(array_agg(a.product_mask) filter(where a.hour_bucket is not null)) product_mask,
      public.access_risk_merge_masks(array_agg(a.category_mask) filter(where a.hour_bucket is not null)) category_mask,
      coalesce(max(public.access_risk_mask_count(a.session_mask)),0)::integer peak_session_count
    from eligible_members member
    left join public.access_risk_hourly_aggregates a
      on a.company_id=member.company_id and a.user_id=member.user_id
      and a.hour_bucket>=now()-interval '24 hours'
    group by member.company_id,member.user_id
  ), baseline_stats as (
    select member.company_id, member.user_id,
      count(distinct date_trunc('day',a.hour_bucket))::integer active_days,
      coalesce(avg(a.browse_event_count),0)::numeric avg_hourly_browse,
      public.access_risk_merge_masks(array_agg(a.device_mask) filter(where a.hour_bucket is not null)) known_device_mask
    from eligible_members member
    left join public.access_risk_hourly_aggregates a
      on a.company_id=member.company_id and a.user_id=member.user_id
      and a.hour_bucket>=now()-interval '31 days' and a.hour_bucket<now()-interval '24 hours'
    group by member.company_id,member.user_id
  ), metrics as (
    select current.*,
      baseline.active_days,baseline.avg_hourly_browse,
      public.access_risk_mask_count(current.session_mask) session_count,
      public.access_risk_mask_count(current.device_mask) device_count,
      public.access_risk_mask_count(current.network_mask) network_count,
      public.access_risk_mask_count(current.product_mask) product_count,
      public.access_risk_mask_count(current.category_mask) category_count,
      public.access_risk_mask_count(current.device_mask & ~baseline.known_device_mask) new_device_count
    from current_stats current join baseline_stats baseline using(company_id,user_id)
  ), flags as (
    select metrics.*,
      new_device_count>=3 has_new_device,
      peak_session_count>=5 has_concurrent,
      network_count>=4 has_network_churn,
      browse_events>=least(150,greatest(80,ceil(avg_hourly_browse*24*3))) has_velocity,
      least(150,greatest(80,ceil(avg_hourly_browse*24*3)))::integer velocity_threshold
    from metrics
  ), scored as (
    select flags.*,
      ((case when has_new_device then 2 else 0 end)
       +(case when has_concurrent then 4 else 0 end)
       +(case when has_network_churn then 3 else 0 end)
       +(case when has_velocity then 2 else 0 end)
       +(case when browse_events>=100 then 2 else 0 end)
       +(case when product_count>=30 then 2 else 0 end)
       +(case when category_count>=15 then 1 else 0 end)
       +(case when product_views>=30 and commercial_intents=0 then 1 else 0 end))::integer score
    from flags
  ), classified as (
    select scored.*,
      case when score>=7 and has_concurrent and (has_new_device or has_network_churn or has_velocity) then 'HIGH'
        when score>=4 then 'ELEVATED' when active_days<7 then 'LEARNING' else 'LOW' end risk_state,
      array[]::text[]
        ||case when has_new_device then array['NEW_DEVICE_SURGE'] else array[]::text[] end
        ||case when has_concurrent then array['CONCURRENT_SESSION_ANOMALY'] else array[]::text[] end
        ||case when has_network_churn then array['NETWORK_CHURN'] else array[]::text[] end
        ||case when has_velocity then array['HIGH_VELOCITY_BROWSING'] else array[]::text[] end
        ||case when browse_events>=100 then array['BROWSE_VOLUME_ANOMALY'] else array[]::text[] end
        ||case when product_count>=30 then array['UNIQUE_SKU_SURGE'] else array[]::text[] end
        ||case when category_count>=15 then array['CATEGORY_BREADTH_ANOMALY'] else array[]::text[] end
        ||case when product_views>=30 and commercial_intents=0 then array['COMMERCIAL_DEAD_END'] else array[]::text[] end reason_codes,
      '[]'::jsonb
        ||case when has_new_device then jsonb_build_array(jsonb_build_object('code','NEW_DEVICE_SURGE','observed',new_device_count,'threshold',3)) else '[]'::jsonb end
        ||case when has_concurrent then jsonb_build_array(jsonb_build_object('code','CONCURRENT_SESSION_ANOMALY','observed',peak_session_count,'threshold',5)) else '[]'::jsonb end
        ||case when has_network_churn then jsonb_build_array(jsonb_build_object('code','NETWORK_CHURN','observed',network_count,'threshold',4)) else '[]'::jsonb end
        ||case when has_velocity then jsonb_build_array(jsonb_build_object('code','HIGH_VELOCITY_BROWSING','observed',browse_events,'threshold',velocity_threshold)) else '[]'::jsonb end
        ||case when browse_events>=100 then jsonb_build_array(jsonb_build_object('code','BROWSE_VOLUME_ANOMALY','observed',browse_events,'threshold',100)) else '[]'::jsonb end
        ||case when product_count>=30 then jsonb_build_array(jsonb_build_object('code','UNIQUE_SKU_SURGE','observed',product_count,'threshold',30)) else '[]'::jsonb end
        ||case when category_count>=15 then jsonb_build_array(jsonb_build_object('code','CATEGORY_BREADTH_ANOMALY','observed',category_count,'threshold',15)) else '[]'::jsonb end
        ||case when product_views>=30 and commercial_intents=0 then jsonb_build_array(jsonb_build_object('code','COMMERCIAL_DEAD_END','observed',product_views,'threshold',30)) else '[]'::jsonb end reasons
    from scored
  )
  insert into public.access_risk_user_snapshots(
    company_id,user_id,risk_state,risk_score,reason_codes,reasons,observed_metrics,baseline_days,evaluated_at
  )
  select company_id,user_id,risk_state,least(score,20),reason_codes,reasons,
    jsonb_build_object(
      'browseEvents24h',browse_events,'productViews24h',product_views,
      'commercialIntents24h',commercial_intents,'sessions24h',session_count,
      'devices24h',device_count,'peakSessionsHour',peak_session_count,
      'networks24h',network_count,'uniqueSkus24h',product_count,
      'categories24h',category_count,'newDevices24h',new_device_count
    ),active_days,now()
  from classified
  on conflict(company_id,user_id) do update set
    risk_state=excluded.risk_state,risk_score=excluded.risk_score,
    reason_codes=excluded.reason_codes,reasons=excluded.reasons,
    observed_metrics=excluded.observed_metrics,baseline_days=excluded.baseline_days,
    evaluated_at=excluded.evaluated_at;
  get diagnostics user_count = row_count;

  insert into public.access_risk_company_snapshots(
    company_id, risk_state, risk_score, affected_user_count, active_user_count,
    reason_codes, reasons, last_activity_at, evaluated_at, updated_at
  )
  select company.id,
    coalesce((array_agg(snapshot.risk_state order by
      case snapshot.risk_state when 'HIGH' then 4 when 'ELEVATED' then 3 when 'LOW' then 2 else 1 end desc))[1], 'LEARNING'),
    coalesce(max(snapshot.risk_score), 0),
    count(distinct snapshot.user_id) filter (where snapshot.risk_state in ('ELEVATED','HIGH'))::integer,
    count(distinct snapshot.user_id)::integer,
    coalesce(array_agg(distinct reason_code) filter (where reason_code is not null), '{}'),
    coalesce(jsonb_agg(distinct reason) filter (where reason is not null), '[]'::jsonb),
    (select max(aggregate.last_activity_at) from public.access_risk_hourly_aggregates aggregate where aggregate.company_id = company.id),
    now(), now()
  from public.partner_companies company
  left join public.access_risk_user_snapshots snapshot on snapshot.company_id = company.id
  left join lateral unnest(snapshot.reason_codes) reason_code on true
  left join lateral jsonb_array_elements(snapshot.reasons) reason on true
  where company.status = 'active'
    and company.id in (select id from public.partner_companies where status = 'active' order by id limit p_company_limit)
  group by company.id
  on conflict(company_id) do update set
    risk_state = excluded.risk_state, risk_score = excluded.risk_score,
    affected_user_count = excluded.affected_user_count, active_user_count = excluded.active_user_count,
    reason_codes = excluded.reason_codes, reasons = excluded.reasons,
    last_activity_at = excluded.last_activity_at, evaluated_at = excluded.evaluated_at,
    updated_at = excluded.updated_at;
  get diagnostics company_count = row_count;

  insert into public.access_risk_evaluation_runs(
    started_at, completed_at, status, companies_evaluated, users_evaluated,
    enhanced_profiles_expired, enhanced_events_deleted, duration_ms
  ) values (
    run_started, clock_timestamp(), 'COMPLETED', company_count, user_count,
    expired_count, deleted_count,
    greatest(0, extract(milliseconds from clock_timestamp() - run_started)::integer)
  );

  return jsonb_build_object(
    'status','COMPLETED','companiesEvaluated',company_count,'usersEvaluated',user_count,
    'enhancedProfilesExpired',expired_count,'enhancedEventsDeleted',deleted_count,
    'durationMs',greatest(0,extract(milliseconds from clock_timestamp()-run_started)::integer)
  );
exception when others then
  insert into public.access_risk_evaluation_runs(
    started_at, completed_at, status, duration_ms, safe_error_code
  ) values (
    run_started, clock_timestamp(), 'FAILED',
    greatest(0, extract(milliseconds from clock_timestamp() - run_started)::integer), sqlstate
  );
  return jsonb_build_object(
    'status','FAILED','safeErrorCode',sqlstate,
    'durationMs',greatest(0,extract(milliseconds from clock_timestamp()-run_started)::integer)
  );
end;
$$;
