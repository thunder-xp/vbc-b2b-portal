-- Bounded, privacy-safe wizard progress extends existing generator session telemetry.
create table public.estimate_generator_guided_progress (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  flow_id uuid not null,
  stage text not null check (stage in ('object','zones','requirements','review','replacement')),
  session_id uuid null references public.estimate_generator_sessions(id) on delete cascade,
  facts jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (actor_user_id, flow_id, stage)
);
create index estimate_generator_guided_progress_company_time on public.estimate_generator_guided_progress(company_id, created_at desc);
alter table public.estimate_generator_guided_progress enable row level security;
revoke all on public.estimate_generator_guided_progress from public, anon, authenticated;
-- No direct table grants. Writes only through the scoped RPC; administration remains server-side.
create function public.record_estimate_generator_guided_progress(
  target_company_id uuid, target_flow_id uuid, target_stage text, target_session_id uuid, target_facts jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare clean_facts jsonb;
begin
  if auth.uid() is null or not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Generator progress unavailable.' using errcode='42501';
  end if;
  if target_session_id is not null and not exists(select 1 from public.estimate_generator_sessions
    where id=target_session_id and company_id=target_company_id and actor_user_id=auth.uid()) then
    raise exception 'Generator session unavailable.' using errcode='42501';
  end if;
  if target_flow_id is null or target_stage not in ('object','zones','requirements','review','replacement')
    or target_facts is null or jsonb_typeof(target_facts) <> 'object'
    or coalesce(target_facts->>'objectType','') not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or coalesce((target_facts->>'zoneCount')::integer,-1) not between 0 and 128
    or coalesce((target_facts->>'observationPointCount')::integer,-1) not between 0 and 256
    or coalesce((target_facts->>'indoorPointCount')::integer,-1) not between 0 and 128
    or coalesce((target_facts->>'outdoorPointCount')::integer,-1) not between 0 and 128
    or (target_facts->>'observationPointCount')::integer <> (target_facts->>'indoorPointCount')::integer + (target_facts->>'outdoorPointCount')::integer
    or coalesce((target_facts->>'selectedArchiveDays')::integer,-1) not between 1 and 365
    or coalesce(target_facts->>'selectedResolutionTier','') not in ('2mp','4mp','6mp','8mp','mixed')
    or coalesce((target_facts->>'manualReplacementCount')::integer,0) not between 0 and 10000
    or jsonb_typeof(target_facts->'zoneTypes') is distinct from 'array'
    or jsonb_typeof(target_facts->'advancedRequirementFlags') is distinct from 'array' then
    raise exception 'Invalid guided progress facts.' using errcode='22023';
  end if;
  if jsonb_array_length(target_facts->'zoneTypes') > 14 or jsonb_array_length(target_facts->'advancedRequirementFlags') > 4
    or exists(select 1 from jsonb_array_elements_text(target_facts->'zoneTypes') z where z not in ('entrance','perimeter','parking','gate','checkout','reception','sales','office','corridor','storage','production','loading','inside','custom'))
    or exists(select 1 from jsonb_array_elements_text(target_facts->'advancedRequirementFlags') f where f not in ('color_night','license_plate_recognition','video_analytics','backup_power')) then
    raise exception 'Invalid guided progress flags.' using errcode='22023';
  end if;
  -- Allowlist fields explicitly; free text and arbitrary browser keys are discarded.
  select jsonb_object_agg(key,value) into clean_facts from jsonb_each(target_facts)
    where key in ('objectType','zoneCount','zoneTypes','observationPointCount','indoorPointCount','outdoorPointCount','selectedArchiveDays','selectedResolutionTier','advancedRequirementFlags','manualReplacementCount');
  insert into public.estimate_generator_guided_progress(actor_user_id,company_id,flow_id,stage,session_id,facts)
    values(auth.uid(),target_company_id,target_flow_id,target_stage,target_session_id,clean_facts)
    on conflict(actor_user_id,flow_id,stage) do update set facts=excluded.facts,
      session_id=coalesce(excluded.session_id,estimate_generator_guided_progress.session_id),updated_at=now()
      where estimate_generator_guided_progress.company_id=excluded.company_id;
end $$;
revoke all on function public.record_estimate_generator_guided_progress(uuid,uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.record_estimate_generator_guided_progress(uuid,uuid,text,uuid,jsonb) to authenticated;
