begin;

-- Ranking V2 keeps calculation in the domain service. Postgres owns bounded,
-- set-based evidence retrieval plus immutable decision/exposure audit facts.

create table public.installation_ranking_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete restrict,
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  ranking_policy_version text not null check (char_length(ranking_policy_version) between 3 and 80),
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  decision_window timestamptz not null,
  candidate_count integer not null check (candidate_count between 0 and 100),
  shortlist_limit integer not null check (shortlist_limit between 1 and 5),
  ordered_provider_ids uuid[] not null check (cardinality(ordered_provider_ids) <= 5),
  shadow_v1_provider_ids uuid[] not null check (cardinality(shadow_v1_provider_ids) <= 5),
  decision jsonb not null check (jsonb_typeof(decision) = 'object'),
  created_at timestamptz not null default now(),
  unique (project_id, ranking_policy_version, decision_window, evidence_fingerprint)
);

create table public.installation_ranking_exposures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete restrict,
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  provider_id uuid not null references public.installation_providers(id) on delete restrict,
  decision_id uuid not null references public.installation_ranking_decisions(id) on delete restrict,
  ranking_policy_version text not null check (char_length(ranking_policy_version) between 3 and 80),
  impression_window timestamptz not null,
  position smallint not null check (position between 1 and 5),
  first_seen_at timestamptz not null default now(),
  unique (project_id, provider_id, ranking_policy_version, impression_window)
);

create index installation_ranking_decisions_project_idx
  on public.installation_ranking_decisions(project_id, created_at desc, id desc);
create index installation_ranking_exposures_provider_idx
  on public.installation_ranking_exposures(provider_id, first_seen_at desc, id desc);
create index installation_ranking_exposures_project_idx
  on public.installation_ranking_exposures(project_id, first_seen_at desc, id desc);

create trigger prevent_installation_ranking_decision_mutation
before update or delete on public.installation_ranking_decisions
for each row execute function private.prevent_installation_marketplace_history_mutation();

create trigger prevent_installation_ranking_exposure_mutation
before update or delete on public.installation_ranking_exposures
for each row execute function private.prevent_installation_marketplace_history_mutation();

alter table public.installation_ranking_decisions enable row level security;
alter table public.installation_ranking_decisions force row level security;
alter table public.installation_ranking_exposures enable row level security;
alter table public.installation_ranking_exposures force row level security;

revoke all on table public.installation_ranking_decisions, public.installation_ranking_exposures
  from public, anon, authenticated, service_role;
grant select, insert on table public.installation_ranking_decisions,
  public.installation_ranking_exposures to service_role;
grant select on table public.installation_ranking_decisions, public.installation_ranking_exposures to authenticated;

create policy installation_ranking_decisions_admin_select on public.installation_ranking_decisions
for select to authenticated using ((select public.has_internal_permission('admin.retail_marketplace.view')));
create policy installation_ranking_exposures_admin_select on public.installation_ranking_exposures
for select to authenticated using ((select public.has_internal_permission('admin.retail_marketplace.view')));

create or replace function public.service_get_installation_ranking_evidence_v2(
  p_customer_account_id uuid,
  p_project_id uuid,
  p_locale text default 'ru'
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  project public.installation_projects%rowtype;
  region_code text;
  result jsonb;
begin
  if p_locale not in ('ru','ro') then
    raise exception 'INSTALLATION_RANKING_INPUT_INVALID' using errcode = '22023';
  end if;
  select p.* into project
  from public.installation_projects p
  where p.id = p_project_id and p.customer_account_id = p_customer_account_id
    and p.status in ('DRAFT','PARTNER_DECLINED');
  if project.id is null then
    raise exception 'INSTALLATION_RANKING_PROJECT_DENIED' using errcode = '42501';
  end if;
  select r.code into region_code from public.installation_service_regions r where r.id = project.region_id;

  with recursive ancestry as (
    select r.id, r.parent_id, 0 as depth
    from public.installation_service_regions r where r.id = project.region_id
    union all
    select parent.id, parent.parent_id, ancestry.depth + 1
    from ancestry join public.installation_service_regions parent on parent.id = ancestry.parent_id
  ), review_stats as (
    select r.partner_company_id,
      count(*)::integer as review_count,
      avg(r.overall_rating)::numeric as average_overall,
      avg(r.workmanship_rating)::numeric as average_workmanship,
      avg(r.communication_rating)::numeric as average_communication,
      avg(r.agreement_rating)::numeric as average_agreement
    from public.installation_reviews r
    where r.verification_status = 'VERIFIED_INSTALLATION' and r.moderation_status = 'PUBLISHED'
    group by r.partner_company_id
  ), assignment_stats as (
    select a.partner_company_id,
      count(*)::integer as assignment_count,
      count(*) filter (where a.accepted_at is not null or a.declined_at is not null)::integer as response_sample_count,
      count(*) filter (where a.accepted_at is not null)::integer as accepted_count,
      count(*) filter (where a.declined_at is not null)::integer as declined_count,
      count(*) filter (where a.status = 'EXPIRED')::integer as expired_count,
      count(*) filter (where a.completed_at is not null)::integer as installed_count,
      count(*) filter (where p.status in ('CUSTOMER_CONFIRMED','CLOSED'))::integer as confirmed_count,
      count(*) filter (where p.status = 'DISPUTED')::integer as dispute_count,
      count(*) filter (where p.status = 'CANCELLED')::integer as cancellation_count,
      percentile_cont(0.5) within group (
        order by extract(epoch from (coalesce(a.accepted_at,a.declined_at) - a.selected_at)) / 60
      ) filter (where a.accepted_at is not null or a.declined_at is not null) as median_response_minutes
    from public.installation_partner_assignments a
    join public.installation_projects p on p.id = a.project_id
    group by a.partner_company_id
  ), exposure_stats as (
    select e.provider_id, count(*)::integer as impression_count
    from public.installation_ranking_exposures e
    where e.first_seen_at >= now() - interval '30 days'
      and not (e.project_id = project.id
        and e.impression_window = date_bin(interval '30 minutes', now(), timestamptz '2001-01-01 00:00:00+00'))
    group by e.provider_id
  ), candidate_rows as (
    select provider.id as provider_id, provider.partner_company_id,
      coalesce(case when p_locale='ro' then profile.public_name_ro else profile.public_name_ru end,
        company.public_display_name, company.display_name, '') as display_name,
      case when p_locale='ro' then profile.public_description_ro else profile.public_description_ru end as description,
      company.public_directory_logo_asset_path as logo_path,
      coalesce(profile.availability_state,'unavailable') as availability,
      company.status='active' as company_active,
      company.public_directory_visible as public_listing_enabled,
      provider.operational_status, provider.approval_status='approved' as provider_approved,
      provider.marketplace_enabled,
      coalesce(profile.public_profile_status='published',false) as profile_published,
      exists(select 1 from public.installation_provider_competencies c where c.provider_id=provider.id and c.system_type=project.system_type and c.active) as exact_capability,
      exists(select 1 from public.installation_provider_regions pr where pr.provider_id=provider.id and pr.active) as has_any_active_region,
      (select min(ancestry.depth) from public.installation_provider_regions pr join ancestry on ancestry.id=pr.region_id where pr.provider_id=provider.id and pr.active) as geography_rank,
      coalesce(review_stats.review_count,0) as review_count,
      review_stats.average_overall, review_stats.average_workmanship,
      review_stats.average_communication, review_stats.average_agreement,
      coalesce(assignment_stats.assignment_count,0) as assignment_count,
      coalesce(assignment_stats.response_sample_count,0) as response_sample_count,
      coalesce(assignment_stats.accepted_count,0) as accepted_count,
      coalesce(assignment_stats.declined_count,0) as declined_count,
      coalesce(assignment_stats.expired_count,0) as expired_count,
      coalesce(assignment_stats.installed_count,0) as installed_count,
      coalesce(assignment_stats.confirmed_count,0) as confirmed_count,
      coalesce(assignment_stats.dispute_count,0) as dispute_count,
      coalesce(assignment_stats.cancellation_count,0) as cancellation_count,
      assignment_stats.median_response_minutes,
      coalesce(exposure_stats.impression_count,0) as impression_count
    from public.installation_providers provider
    join public.partner_companies company on company.id = provider.partner_company_id
    left join public.installation_provider_profiles profile on profile.provider_id = provider.id
    left join review_stats on review_stats.partner_company_id = provider.partner_company_id
    left join assignment_stats on assignment_stats.partner_company_id = provider.partner_company_id
    left join exposure_stats on exposure_stats.provider_id = provider.id
    where provider.provider_type = 'partner_company'
    order by lower(coalesce(case when p_locale='ro' then profile.public_name_ro else profile.public_name_ru end,
      company.public_display_name, company.display_name, '')), provider.id
    limit 100
  )
  select jsonb_build_object(
    'projectId', project.id,
    'customerAccountId', project.customer_account_id,
    'systemType', project.system_type,
    'locality', project.locality,
    'regionCode', region_code,
    'generatedAt', now(),
    'candidates', coalesce(jsonb_agg(jsonb_build_object(
      'providerId', c.provider_id, 'partnerCompanyId', c.partner_company_id,
      'displayName', c.display_name, 'description', c.description, 'logoPath', c.logo_path,
      'availability', c.availability, 'companyActive', c.company_active,
      'publicListingEnabled', c.public_listing_enabled, 'providerOperationalStatus', c.operational_status,
      'providerApproved', c.provider_approved, 'marketplaceEnabled', c.marketplace_enabled,
      'profilePublished', c.profile_published, 'exactCapability', c.exact_capability,
      'hasAnyActiveRegion', c.has_any_active_region, 'geographyRank', c.geography_rank,
      'verifiedReviewCount', c.review_count, 'averageOverallRating', c.average_overall,
      'averageWorkmanshipRating', c.average_workmanship, 'averageCommunicationRating', c.average_communication,
      'averageAgreementRating', c.average_agreement, 'assignmentCount', c.assignment_count,
      'responseSampleCount', c.response_sample_count, 'acceptedCount', c.accepted_count,
      'declinedCount', c.declined_count, 'expiredCount', c.expired_count,
      'installedCount', c.installed_count, 'customerConfirmedCount', c.confirmed_count,
      'disputeCount', c.dispute_count, 'cancellationCount', c.cancellation_count,
      'medianResponseMinutes', c.median_response_minutes, 'eligibleImpressions30d', c.impression_count
    ) order by lower(c.display_name), c.provider_id), '[]'::jsonb)
  ) into result from candidate_rows c;
  return result;
end;
$$;

create or replace function public.service_record_installation_ranking_decision_v2(
  p_customer_account_id uuid,
  p_project_id uuid,
  p_policy_version text,
  p_evidence_fingerprint text,
  p_decision jsonb,
  p_ordered_provider_ids uuid[],
  p_shadow_v1_provider_ids uuid[],
  p_shortlist_limit integer,
  p_window_started_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  resolved_decision_id uuid;
  current_provider_id uuid;
  provider_position integer := 0;
  exposure_id uuid;
  counted integer := 0;
begin
  if p_policy_version <> 'installation-ranking-v2.1'
    or p_evidence_fingerprint !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_decision) <> 'object'
    or jsonb_typeof(p_decision->'candidates') <> 'array'
    or jsonb_array_length(p_decision->'candidates') > 100
    or p_shortlist_limit not between 1 and 5
    or cardinality(p_ordered_provider_ids) > p_shortlist_limit
    or cardinality(p_shadow_v1_provider_ids) > p_shortlist_limit
    or p_window_started_at <> date_bin(interval '30 minutes', p_window_started_at, timestamptz '2001-01-01 00:00:00+00')
    or p_window_started_at < now() - interval '35 minutes'
    or p_window_started_at > now() + interval '5 minutes'
  then raise exception 'INSTALLATION_RANKING_DECISION_INVALID' using errcode = '22023'; end if;
  if not exists(select 1 from public.installation_projects p where p.id=p_project_id and p.customer_account_id=p_customer_account_id and p.status in ('DRAFT','PARTNER_DECLINED')) then
    raise exception 'INSTALLATION_RANKING_PROJECT_DENIED' using errcode = '42501';
  end if;
  if cardinality(p_ordered_provider_ids) <> (select count(distinct value) from unnest(p_ordered_provider_ids) value)
    or exists(select 1 from unnest(p_ordered_provider_ids) value where not exists(
      select 1 from public.installation_providers provider where provider.id=value and provider.provider_type='partner_company'
    )) then raise exception 'INSTALLATION_RANKING_PROVIDER_INVALID' using errcode = '22023'; end if;

  insert into public.installation_ranking_decisions(project_id,customer_account_id,ranking_policy_version,evidence_fingerprint,
    decision_window,candidate_count,shortlist_limit,ordered_provider_ids,shadow_v1_provider_ids,decision)
  values(p_project_id,p_customer_account_id,p_policy_version,p_evidence_fingerprint,p_window_started_at,
    jsonb_array_length(p_decision->'candidates'),p_shortlist_limit,p_ordered_provider_ids,p_shadow_v1_provider_ids,p_decision)
  on conflict(project_id,ranking_policy_version,decision_window,evidence_fingerprint) do nothing
  returning id into resolved_decision_id;
  if resolved_decision_id is null then
    select d.id into resolved_decision_id from public.installation_ranking_decisions d
    where d.project_id=p_project_id and d.ranking_policy_version=p_policy_version and d.decision_window=p_window_started_at
      and d.evidence_fingerprint=p_evidence_fingerprint;
  end if;

  foreach current_provider_id in array p_ordered_provider_ids loop
    provider_position := provider_position + 1;
    exposure_id := null;
    insert into public.installation_ranking_exposures(project_id,customer_account_id,provider_id,decision_id,
      ranking_policy_version,impression_window,position)
    values(p_project_id,p_customer_account_id,current_provider_id,resolved_decision_id,p_policy_version,p_window_started_at,provider_position)
    on conflict(project_id,provider_id,ranking_policy_version,impression_window) do nothing
    returning id into exposure_id;
    if exposure_id is not null then counted := counted + 1; end if;
  end loop;
  return jsonb_build_object('decisionId',resolved_decision_id,'countedImpressions',counted);
end;
$$;

create or replace function public.admin_get_installation_ranking_diagnostics_v2(p_project_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  total_impressions numeric;
  top1 numeric := 0; top3 numeric := 0; top5 numeric := 0; hhi numeric := 0;
  latest jsonb;
begin
  if not public.has_internal_permission('admin.retail_marketplace.view') then
    raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501';
  end if;
  select count(*)::numeric into total_impressions from public.installation_ranking_exposures;
  if total_impressions > 0 then
    with counts as (
      select count(*)::numeric as n from public.installation_ranking_exposures group by provider_id order by n desc
    ), ranked as (select n,row_number() over(order by n desc) as position from counts)
    select coalesce(max(n) filter(where position=1),0)/total_impressions,
      coalesce(sum(n) filter(where position<=3),0)/total_impressions,
      coalesce(sum(n) filter(where position<=5),0)/total_impressions,
      coalesce(sum(power(n/total_impressions,2)),0)
    into top1,top3,top5,hhi from ranked;
  end if;
  select jsonb_build_object('id',d.id,'projectId',d.project_id,'policyVersion',d.ranking_policy_version,
    'candidateCount',d.candidate_count,'createdAt',d.created_at,'orderedProviderIds',d.ordered_provider_ids,
    'shadowV1ProviderIds',d.shadow_v1_provider_ids,'decision',d.decision)
  into latest from public.installation_ranking_decisions d
  where p_project_id is null or d.project_id=p_project_id
  order by d.created_at desc,d.id desc limit 1;
  return jsonb_build_object(
    'policyVersion','installation-ranking-v2.1',
    'decisionCount',(select count(*) from public.installation_ranking_decisions),
    'deduplicatedImpressions',total_impressions,
    'top1ImpressionShare',top1,'top3ImpressionShare',top3,'top5ImpressionShare',top5,
    'exposureHhi',hhi,'latestDecision',latest
  );
end;
$$;

-- Attribute selections to the latest visible Ranking V2 decision without
-- trusting a browser-supplied decision/position identifier.
create or replace function public.customer_select_installation_partner_v1(
  p_project_id uuid, p_provider_id uuid, p_expected_revision bigint, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid; project public.installation_projects%rowtype;
  provider public.installation_providers%rowtype; assignment_id uuid;
  ranking_decision_id uuid; ranking_policy_version text; ranking_position integer;
begin
  select a.id into account_id from public.customer_accounts a where a.auth_user_id=auth.uid() and a.status='ACTIVE';
  if exists(select 1 from public.installation_project_events where idempotency_key=p_idempotency_key) then
    select p.selected_assignment_id into assignment_id from public.installation_projects p where p.id=p_project_id and p.customer_account_id=account_id;
    return jsonb_build_object('assignmentId',assignment_id,'status',(select status from public.installation_projects where id=p_project_id),'repeated',true);
  end if;
  select * into project from public.installation_projects p where p.id=p_project_id and p.customer_account_id=account_id for update;
  if project.id is null then raise exception 'INSTALLATION_PROJECT_DENIED' using errcode='42501'; end if;
  if project.revision<>p_expected_revision then raise exception 'INSTALLATION_PROJECT_CONFLICT' using errcode='PT409'; end if;
  if project.status not in ('DRAFT','PARTNER_DECLINED') then raise exception 'INSTALLATION_PROJECT_TRANSITION_INVALID' using errcode='22023'; end if;
  select ip.* into provider from public.installation_providers ip
  join public.partner_companies company on company.id=ip.partner_company_id and company.status='active' and company.public_directory_visible
  join public.installation_provider_profiles profile on profile.provider_id=ip.id and profile.public_profile_status='published' and profile.availability_state in ('available','limited')
  join public.installation_provider_competencies competency on competency.provider_id=ip.id and competency.system_type=project.system_type and competency.active
  where ip.id=p_provider_id and ip.provider_type='partner_company' and ip.operational_status='active' and ip.approval_status='approved' and ip.marketplace_enabled
    and (project.region_id is null or exists(
      with recursive ancestry as (
        select r.id,r.parent_id from public.installation_service_regions r where r.id=project.region_id
        union all select parent.id,parent.parent_id from ancestry join public.installation_service_regions parent on parent.id=ancestry.parent_id
      ) select 1 from public.installation_provider_regions pr join ancestry on ancestry.id=pr.region_id
        where pr.provider_id=ip.id and pr.active
    ));
  if provider.id is null then raise exception 'INSTALLATION_PARTNER_NOT_ELIGIBLE' using errcode='22023'; end if;
  select d.id,d.ranking_policy_version,array_position(d.ordered_provider_ids,provider.id)
  into ranking_decision_id,ranking_policy_version,ranking_position
  from public.installation_ranking_decisions d
  where d.project_id=project.id and provider.id=any(d.ordered_provider_ids)
  order by d.created_at desc,d.id desc limit 1;
  insert into public.installation_partner_assignments(project_id,provider_id,partner_company_id)
  values(project.id,provider.id,provider.partner_company_id) returning id into assignment_id;
  update public.installation_projects set selected_assignment_id=assignment_id,status='PARTNER_PENDING',revision=revision+1 where id=project.id;
  insert into public.installation_project_events(project_id,assignment_id,actor_kind,actor_user_id,event_type,idempotency_key,safe_evidence)
  values(project.id,assignment_id,'CUSTOMER',auth.uid(),'PARTNER_SELECTED',p_idempotency_key,
    jsonb_strip_nulls(jsonb_build_object('providerId',provider.id,'rankingDecisionId',ranking_decision_id,
      'rankingPolicyVersion',ranking_policy_version,'shortlistPosition',ranking_position)));
  return jsonb_build_object('assignmentId',assignment_id,'status','PARTNER_PENDING','repeated',false);
end;
$$;

revoke all on function public.service_get_installation_ranking_evidence_v2(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.service_record_installation_ranking_decision_v2(uuid,uuid,text,text,jsonb,uuid[],uuid[],integer,timestamptz) from public,anon,authenticated;
revoke all on function public.admin_get_installation_ranking_diagnostics_v2(uuid) from public,anon,authenticated;
grant execute on function public.service_get_installation_ranking_evidence_v2(uuid,uuid,text) to service_role;
grant execute on function public.service_record_installation_ranking_decision_v2(uuid,uuid,text,text,jsonb,uuid[],uuid[],integer,timestamptz) to service_role;
grant execute on function public.admin_get_installation_ranking_diagnostics_v2(uuid) to authenticated;

commit;
