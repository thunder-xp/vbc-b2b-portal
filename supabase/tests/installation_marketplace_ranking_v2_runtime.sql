begin;

insert into auth.users (
  id, aud, role, phone, phone_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  '+37369000001', now(), '{"provider":"phone","providers":["phone"]}',
  '{}', now(), now()
);

insert into public.customer_identities (id, identity_kind)
values ('82000000-0000-4000-8000-000000000001', 'PERSON');

insert into public.customer_accounts (
  id, auth_user_id, customer_identity_id, status, identity_resolution_status
) values (
  '83000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'ACTIVE', 'MATCHED'
);

insert into public.partner_companies (
  id, external_1c_id, display_name, status, public_directory_visible,
  public_display_name, public_directory_published_at
) values (
  '84000000-0000-4000-8000-000000000001',
  'ranking-v2-runtime-partner', 'Ranking V2 Runtime Partner', 'active', true,
  'Ranking V2 Runtime Partner', now()
);

insert into public.installation_providers (
  id, provider_type, partner_company_id, operational_status,
  approval_status, marketplace_enabled
) values (
  '85000000-0000-4000-8000-000000000001', 'partner_company',
  '84000000-0000-4000-8000-000000000001', 'active', 'approved', true
);

insert into public.installation_provider_profiles (
  provider_id, public_name_ru, public_name_ro, public_profile_status,
  availability_state, max_concurrent_jobs, acceptance_sla_minutes
) values (
  '85000000-0000-4000-8000-000000000001', 'Тестовый монтажник',
  'Instalator de test', 'published', 'available', 2, 120
);

insert into public.installation_provider_competencies (
  provider_id, system_type, active, approved_at
) values (
  '85000000-0000-4000-8000-000000000001', 'cctv', true, now()
);

insert into public.installation_provider_regions (provider_id, region_id, active)
select '85000000-0000-4000-8000-000000000001', region.id, true
from public.installation_service_regions region
where region.code = 'MD-CU';

insert into public.installation_projects (
  id, customer_account_id, customer_identity_id, source_type, system_type,
  object_type, locality, region_id, need_type, status, contact_consent_at,
  creation_key
)
select
  '86000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001', 'CUSTOM', 'cctv',
  'HOUSE', 'Chișinău', region.id, 'DESIGN_AND_INSTALL', 'DRAFT', now(),
  '87000000-0000-4000-8000-000000000001'
from public.installation_service_regions region
where region.code = 'MD-CU';

set local role service_role;

create temp table ranking_v2_runtime_timings (
  operation text not null,
  duration_ms numeric not null
) on commit drop;

do $$
declare
  evidence jsonb;
  first_result jsonb;
  repeated_result jsonb;
  window_start timestamptz := date_bin(
    interval '30 minutes', now(), timestamptz '2001-01-01 00:00:00+00'
  );
begin
  evidence := public.service_get_installation_ranking_evidence_v2(
    '83000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    'ru'
  );

  if jsonb_array_length(evidence->'candidates') <> 1
    or evidence->'candidates'->0->>'providerId' <> '85000000-0000-4000-8000-000000000001'
    or (evidence->'candidates'->0->>'exactCapability')::boolean is not true
    or (evidence->'candidates'->0->>'geographyRank')::integer <> 0
  then
    raise exception 'Ranking V2 set-based evidence projection failed.';
  end if;

  first_result := public.service_record_installation_ranking_decision_v2(
    '83000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    'installation-ranking-v2.1', repeat('a', 64),
    jsonb_build_object('candidates', evidence->'candidates'),
    array['85000000-0000-4000-8000-000000000001'::uuid],
    array['85000000-0000-4000-8000-000000000001'::uuid],
    5, window_start
  );
  repeated_result := public.service_record_installation_ranking_decision_v2(
    '83000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    'installation-ranking-v2.1', repeat('a', 64),
    jsonb_build_object('candidates', evidence->'candidates'),
    array['85000000-0000-4000-8000-000000000001'::uuid],
    array['85000000-0000-4000-8000-000000000001'::uuid],
    5, window_start
  );

  if (first_result->>'countedImpressions')::integer <> 1
    or (repeated_result->>'countedImpressions')::integer <> 0
    or (select count(*) from public.installation_ranking_decisions) <> 1
    or (select count(*) from public.installation_ranking_exposures) <> 1
  then
    raise exception 'Ranking V2 decision or impression deduplication failed.';
  end if;
end;
$$;

do $$
declare
  index integer;
  started_at timestamptz;
  evidence jsonb;
  window_start timestamptz := date_bin(
    interval '30 minutes', now(), timestamptz '2001-01-01 00:00:00+00'
  );
begin
  for index in 1..100 loop
    started_at := clock_timestamp();
    evidence := public.service_get_installation_ranking_evidence_v2(
      '83000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000001',
      'ru'
    );
    insert into ranking_v2_runtime_timings values (
      'evidence', extract(epoch from clock_timestamp() - started_at) * 1000
    );

    started_at := clock_timestamp();
    perform public.service_record_installation_ranking_decision_v2(
      '83000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000001',
      'installation-ranking-v2.1', repeat('a', 64),
      jsonb_build_object('candidates', evidence->'candidates'),
      array['85000000-0000-4000-8000-000000000001'::uuid],
      array['85000000-0000-4000-8000-000000000001'::uuid],
      5, window_start
    );
    insert into ranking_v2_runtime_timings values (
      'record', extract(epoch from clock_timestamp() - started_at) * 1000
    );
  end loop;
end;
$$;

select jsonb_build_object(
  'status', 'passed',
  'candidateCount', 1,
  'rpcCountPerShortlist', 2,
  'timingsMs', jsonb_object_agg(operation, jsonb_build_object('p50', p50, 'p95', p95))
) as runtime_result
from (
  select operation,
    percentile_cont(0.5) within group (order by duration_ms) as p50,
    percentile_cont(0.95) within group (order by duration_ms) as p95
  from ranking_v2_runtime_timings
  group by operation
) measurements;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-4000-8000-000000000001',
  true
);

do $$
begin
  if has_function_privilege(
    current_user,
    'public.service_get_installation_ranking_evidence_v2(uuid,uuid,text)',
    'execute'
  ) or has_function_privilege(
    current_user,
    'public.service_record_installation_ranking_decision_v2(uuid,uuid,text,text,jsonb,uuid[],uuid[],integer,timestamptz)',
    'execute'
  ) then
    raise exception 'Authenticated browser role can invoke a private Ranking V2 RPC.';
  end if;
  if (select count(*) from public.installation_ranking_decisions) <> 0
    or (select count(*) from public.installation_ranking_exposures) <> 0
  then
    raise exception 'Customer can read private Ranking V2 evidence.';
  end if;
  if has_table_privilege(
    current_user, 'public.installation_ranking_decisions', 'insert,update,delete'
  ) or has_table_privilege(
    current_user, 'public.installation_ranking_exposures', 'insert,update,delete'
  ) then
    raise exception 'Authenticated browser role can mutate Ranking V2 audit tables.';
  end if;
end;
$$;

rollback;
