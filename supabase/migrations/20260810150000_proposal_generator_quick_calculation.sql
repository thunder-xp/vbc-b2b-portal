-- Unified Generator KP: governed CCTV quick-calculation profiles and bounded structured telemetry.

alter table public.estimate_generator_sessions
  add column generation_mode text not null default 'description',
  add column system_type text null,
  add column object_type text null,
  add column indoor_camera_count integer null,
  add column outdoor_camera_count integer null,
  add column archive_days integer null,
  add column cable_length integer null,
  add column installation_requested boolean null,
  add column commissioning_requested boolean null,
  add column remote_viewing_requested boolean null,
  add column advanced_flags text[] not null default array[]::text[];

alter table public.estimate_generator_sessions
  add constraint estimate_generator_generation_mode_check check (generation_mode in ('description', 'quick_calculation')),
  add constraint estimate_generator_quick_facts_check check (
    (generation_mode = 'description' and system_type is null and object_type is null)
    or (generation_mode = 'quick_calculation' and system_type = 'cctv'
      and object_type in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
      and indoor_camera_count between 0 and 128 and outdoor_camera_count between 0 and 128
      and archive_days between 1 and 365 and cable_length between 0 and 20000
      and installation_requested is not null and commissioning_requested is not null and remote_viewing_requested is not null)
  );

create index estimate_generator_sessions_mode_created_idx
  on public.estimate_generator_sessions(generation_mode, created_at desc, id);

create table public.estimate_generator_calculator_profiles (
  profile_key text primary key,
  system_type text not null default 'cctv',
  section_key text not null,
  label text not null,
  unit text not null,
  catalog_product_id uuid null references public.catalog_products(id) on delete restrict,
  external_nomenclature_id uuid null references public.external_nomenclature_items(id) on delete restrict,
  is_active boolean not null default true,
  version integer not null default 1,
  updated_by uuid null references public.user_profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint estimate_generator_profile_key_check check (profile_key ~ '^cctv\.[a-z0-9.]+$'),
  constraint estimate_generator_profile_system_check check (system_type = 'cctv'),
  constraint estimate_generator_profile_section_check check (section_key in ('equipment','installation_materials','installation_works','commissioning_works')),
  constraint estimate_generator_profile_unit_check check (unit in ('pcs','hour','meter','set','visit','service')),
  constraint estimate_generator_profile_target_check check (num_nonnulls(catalog_product_id, external_nomenclature_id) <= 1),
  constraint estimate_generator_profile_version_check check (version > 0)
);

create table public.estimate_generator_calculator_profile_events (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null references public.estimate_generator_calculator_profiles(profile_key) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null default 'mapping_changed',
  previous_target_type text not null,
  previous_target_id uuid null,
  target_type text not null,
  target_id uuid null,
  created_at timestamptz not null default now(),
  constraint estimate_generator_profile_event_type_check check (event_type = 'mapping_changed'),
  constraint estimate_generator_profile_event_target_check check (previous_target_type in ('unresolved','catalog','external_nomenclature') and target_type in ('unresolved','catalog','external_nomenclature'))
);

alter table public.estimate_generator_calculator_profiles enable row level security;
alter table public.estimate_generator_calculator_profile_events enable row level security;
revoke all on table public.estimate_generator_calculator_profiles, public.estimate_generator_calculator_profile_events from public, anon, authenticated;

insert into public.estimate_generator_calculator_profiles(profile_key, section_key, label, unit) values
  ('cctv.indoor.standard','equipment','Камера для помещений','pcs'),
  ('cctv.outdoor.standard','equipment','Уличная камера','pcs'),
  ('cctv.nvr.8','equipment','Видеорегистратор на 8 каналов','pcs'),
  ('cctv.nvr.16','equipment','Видеорегистратор на 16 каналов','pcs'),
  ('cctv.nvr.32','equipment','Видеорегистратор на 32 канала','pcs'),
  ('cctv.storage','equipment','Накопитель для архива','pcs'),
  ('cctv.poe','equipment','PoE-коммутатор','pcs'),
  ('cctv.cable','installation_materials','Кабель','meter'),
  ('cctv.mounting','installation_materials','Монтажные коробки и комплектующие','pcs'),
  ('cctv.ups','equipment','Резервное питание','pcs'),
  ('cctv.install.camera','installation_works','Монтаж камеры','service'),
  ('cctv.install.cable','installation_works','Прокладка кабеля','meter'),
  ('cctv.install.infrastructure','installation_works','Монтаж регистратора и сети','service'),
  ('cctv.commissioning.camera','commissioning_works','Настройка камер','service'),
  ('cctv.commissioning.recorder','commissioning_works','Настройка видеорегистратора','service'),
  ('cctv.commissioning.remote','commissioning_works','Настройка удалённого просмотра','service')
on conflict(profile_key) do nothing;

create or replace function public.prevent_estimate_generator_profile_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Generator profile events are immutable.' using errcode='42501'; end;
$$;
create trigger prevent_estimate_generator_profile_event_mutation
before update or delete on public.estimate_generator_calculator_profile_events
for each row execute function public.prevent_estimate_generator_profile_event_mutation();
revoke all on function public.prevent_estimate_generator_profile_event_mutation() from public, anon, authenticated;

create or replace function public.record_estimate_generator_session(
  target_company_id uuid, target_request_key uuid, target_request_fingerprint text,
  target_requirement_count integer, target_duration_ms integer, target_failed boolean default false,
  target_generation_mode text default 'description', target_structured_facts jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare prior public.estimate_generator_sessions; created_id uuid; facts jsonb := coalesce(target_structured_facts, '{}'::jsonb);
begin
  if auth.uid() is null or not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Proposal generator is not available.' using errcode='42501';
  end if;
  if target_request_key is null or target_request_fingerprint !~ '^[0-9a-f]{64}$'
    or target_requirement_count not between 0 and 30 or target_duration_ms not between 0 and 120000
    or target_generation_mode not in ('description','quick_calculation') then
    raise exception 'Generator request is invalid.' using errcode='22023';
  end if;
  if target_generation_mode='quick_calculation' and (
    facts->>'systemType' <> 'cctv' or facts->>'objectType' not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or (facts->>'indoorCameraCount')::integer not between 0 and 128 or (facts->>'outdoorCameraCount')::integer not between 0 and 128
    or (facts->>'archiveDays')::integer not between 1 and 365 or (facts->>'cableLength')::integer not between 0 and 20000
  ) then raise exception 'Generator structured facts are invalid.' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || target_request_key::text,0));
  select * into prior from public.estimate_generator_sessions where actor_user_id=auth.uid() and request_key=target_request_key;
  if prior.id is not null then
    if prior.company_id<>target_company_id or prior.request_fingerprint<>target_request_fingerprint then
      raise exception 'Generator request key was reused with different data.' using errcode='22023';
    end if;
    return prior.id;
  end if;
  insert into public.estimate_generator_sessions(
    company_id,actor_user_id,request_key,request_fingerprint,status,requirement_count,generation_duration_ms,
    generation_mode,system_type,object_type,indoor_camera_count,outdoor_camera_count,archive_days,cable_length,
    installation_requested,commissioning_requested,remote_viewing_requested,advanced_flags
  ) values (
    target_company_id,auth.uid(),target_request_key,target_request_fingerprint,case when target_failed then 'failed' else 'completed' end,
    target_requirement_count,target_duration_ms,target_generation_mode,
    case when target_generation_mode='quick_calculation' then facts->>'systemType' end,
    case when target_generation_mode='quick_calculation' then facts->>'objectType' end,
    case when target_generation_mode='quick_calculation' then (facts->>'indoorCameraCount')::integer end,
    case when target_generation_mode='quick_calculation' then (facts->>'outdoorCameraCount')::integer end,
    case when target_generation_mode='quick_calculation' then (facts->>'archiveDays')::integer end,
    case when target_generation_mode='quick_calculation' then (facts->>'cableLength')::integer end,
    case when target_generation_mode='quick_calculation' then (facts->>'installationRequested')::boolean end,
    case when target_generation_mode='quick_calculation' then (facts->>'commissioningRequested')::boolean end,
    case when target_generation_mode='quick_calculation' then (facts->>'remoteViewingRequested')::boolean end,
    case when target_generation_mode='quick_calculation' then array(select jsonb_array_elements_text(coalesce(facts->'advancedFlags','[]'::jsonb))) else array[]::text[] end
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.resolve_estimate_generator_calculator_profiles(target_company_id uuid, target_profile_keys text[])
returns table(profile_key text,label text,section_key text,unit text,version integer,resolution text,resolved_id uuid,resolved_label text)
language sql security definer set search_path=public stable as $$
  select profile.profile_key,profile.label,profile.section_key,profile.unit,profile.version,
    case
      when product.id is not null then 'catalog'
      when external_item.id is not null and library.external_nomenclature_id is not null then 'own_nomenclature'
      when external_item.id is not null and external_item.curation_status='active' then 'shared_nomenclature'
      else 'unresolved'
    end,
    coalesce(product.id,external_item.id),
    case when product.id is not null then product.sku || ' · ' || product.name when external_item.id is not null then external_item.name end
  from public.estimate_generator_calculator_profiles profile
  left join public.catalog_products product on product.id=profile.catalog_product_id and product.is_active and product.is_visible
  left join public.external_nomenclature_items external_item on external_item.id=profile.external_nomenclature_id and external_item.is_active
    and external_item.canonical_item_id is null and external_item.curation_status in ('active','review_required')
  left join public.partner_external_nomenclature_library library on library.company_id=target_company_id
    and library.external_nomenclature_id=external_item.id and library.status='active'
  where profile.profile_key=any(coalesce(target_profile_keys,array[]::text[])) and profile.is_active
    and public.can_access_estimates(target_company_id,'estimates.manage');
$$;

create or replace function public.list_estimate_generator_calculator_profiles()
returns table(profile_key text,system_type text,label text,section_key text,unit text,version integer,is_active boolean,resolution text,resolved_id uuid,resolved_label text)
language sql security definer set search_path=public stable as $$
  select profile.profile_key,profile.system_type,profile.label,profile.section_key,profile.unit,profile.version,profile.is_active,
    case when product.id is not null then 'catalog' when external_item.id is not null then 'shared_nomenclature' else 'unresolved' end,
    coalesce(product.id,external_item.id),
    case when product.id is not null then product.sku || ' · ' || product.name when external_item.id is not null then external_item.name end
  from public.estimate_generator_calculator_profiles profile
  left join public.catalog_products product on product.id=profile.catalog_product_id and product.is_active and product.is_visible
  left join public.external_nomenclature_items external_item on external_item.id=profile.external_nomenclature_id and external_item.is_active and external_item.canonical_item_id is null
  where public.has_internal_permission('admin.estimates.view') order by profile.section_key,profile.profile_key;
$$;

create or replace function public.search_estimate_generator_mapping_targets(search_query text,result_limit integer default 12)
returns table(target_type text,id uuid,label text,secondary text)
language sql security definer set search_path=public stable as $$
  select result.target_type,result.id,result.label,result.secondary from (
    select 'catalog'::text target_type,product.id,product.name label,product.sku secondary,0 rank
    from public.catalog_products product where product.is_active and product.is_visible
      and (product.sku ilike '%'||btrim(search_query)||'%' or product.name ilike '%'||btrim(search_query)||'%')
    union all
    select 'external_nomenclature',item.id,item.name,concat_ws(' · ',nullif(item.manufacturer,''),nullif(item.model,'')),1
    from public.external_nomenclature_items item where item.is_active and item.canonical_item_id is null and item.curation_status='active'
      and (item.name ilike '%'||btrim(search_query)||'%' or item.model ilike '%'||btrim(search_query)||'%')
  ) result where public.has_internal_permission('admin.integrations.manage') and char_length(btrim(search_query)) between 2 and 120
  order by result.rank,result.secondary,result.label limit greatest(1,least(result_limit,20));
$$;

create or replace function public.update_estimate_generator_calculator_profile(target_profile_key text,expected_version integer,target_type text,target_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare profile public.estimate_generator_calculator_profiles; previous_type text; previous_id uuid;
begin
  if not public.has_internal_permission('admin.integrations.manage') then raise exception 'Generator mapping management is not available.' using errcode='42501'; end if;
  if target_type not in ('unresolved','catalog','external_nomenclature') or (target_type='unresolved' and target_id is not null)
    or (target_type<>'unresolved' and target_id is null) then raise exception 'Generator mapping is invalid.' using errcode='22023'; end if;
  select * into profile from public.estimate_generator_calculator_profiles where profile_key=target_profile_key for update;
  if profile.profile_key is null then raise exception 'Generator profile was not found.' using errcode='22023'; end if;
  if profile.version<>expected_version then raise exception 'Generator profile changed. Refresh and retry.' using errcode='40001'; end if;
  if target_type='catalog' and not exists(select 1 from public.catalog_products where id=target_id and is_active and is_visible) then raise exception 'Catalog product is unavailable.' using errcode='22023'; end if;
  if target_type='external_nomenclature' and not exists(select 1 from public.external_nomenclature_items where id=target_id and is_active and canonical_item_id is null and curation_status='active') then raise exception 'External nomenclature is unavailable.' using errcode='22023'; end if;
  previous_type:=case when profile.catalog_product_id is not null then 'catalog' when profile.external_nomenclature_id is not null then 'external_nomenclature' else 'unresolved' end;
  previous_id:=coalesce(profile.catalog_product_id,profile.external_nomenclature_id);
  update public.estimate_generator_calculator_profiles set
    catalog_product_id=case when target_type='catalog' then target_id end,
    external_nomenclature_id=case when target_type='external_nomenclature' then target_id end,
    version=version+1,updated_by=auth.uid(),updated_at=now()
  where profile_key=target_profile_key returning version into expected_version;
  insert into public.estimate_generator_calculator_profile_events(profile_key,actor_user_id,previous_target_type,previous_target_id,target_type,target_id)
  values(target_profile_key,auth.uid(),previous_type,previous_id,target_type,target_id);
  return expected_version;
end;
$$;

create or replace function public.get_estimate_generator_admin_report(result_limit integer default 20)
returns jsonb language sql security definer set search_path=public stable as $$
  select case when not public.has_internal_permission('admin.estimates.view') then null else jsonb_build_object(
    'summary',jsonb_build_object(
      'usageCount',count(*),'generationCompleted',count(*) filter(where status in ('completed','estimate_created')),
      'generationFailed',count(*) filter(where status='failed'),'companiesCount',count(distinct company_id),
      'estimatesCreated',count(*) filter(where status='estimate_created'),
      'completionRate',coalesce(round(100.0*count(*) filter(where status in ('completed','estimate_created'))/nullif(count(*),0),1),0),
      'generatorToEstimateConversionRate',coalesce(round(100.0*count(*) filter(where status='estimate_created')/nullif(count(*) filter(where status in ('completed','estimate_created')),0),1),0),
      'averageGenerationDurationMs',coalesce(round(avg(generation_duration_ms) filter(where status in ('completed','estimate_created'))),0),
      'averageGenerationToEstimateMs',coalesce(round(avg(extract(epoch from (estimate_created_at-created_at))*1000) filter(where status='estimate_created')),0),
      'averageGeneratedLines',coalesce(round(avg(requirement_count) filter(where status in ('completed','estimate_created')),1),0),
      'resolvedCatalogCount',coalesce(sum(resolved_catalog_count),0),'ownNomenclatureCount',coalesce(sum(own_nomenclature_count),0),
      'sharedNomenclatureCount',coalesce(sum(shared_nomenclature_count),0),'unresolvedCount',coalesce(sum(unresolved_count),0),
      'feedbackYes',(select count(*) from public.estimate_generator_feedback where answer='yes'),
      'feedbackPartial',(select count(*) from public.estimate_generator_feedback where answer='partial'),
      'feedbackNo',(select count(*) from public.estimate_generator_feedback where answer='no'),
      'descriptionStarts',count(*) filter(where generation_mode='description'),
      'quickCalculationStarts',count(*) filter(where generation_mode='quick_calculation'),
      'descriptionEstimatesCreated',count(*) filter(where generation_mode='description' and status='estimate_created'),
      'quickCalculationEstimatesCreated',count(*) filter(where generation_mode='quick_calculation' and status='estimate_created'),
      'quickCalculationCompleted',count(*) filter(where generation_mode='quick_calculation' and status in ('completed','estimate_created')),
      'quickCalculationUnresolvedCount',coalesce(sum(unresolved_count) filter(where generation_mode='quick_calculation'),0),
      'averageQuickCalculationToEstimateMs',coalesce(round(avg(extract(epoch from (estimate_created_at-created_at))*1000) filter(where generation_mode='quick_calculation' and status='estimate_created')),0)
    ),
    'comments',coalesce((select jsonb_agg(row_data order by created_at desc) from (select feedback.answer,feedback.comment,feedback.created_at from public.estimate_generator_feedback feedback where feedback.comment is not null order by feedback.created_at desc limit greatest(1,least(result_limit,50))) row_data),'[]'::jsonb),
    'quickCalculationByObjectType',coalesce((select jsonb_agg(jsonb_build_object('objectType',object_type,'starts',starts,'estimatesCreated',estimates_created) order by object_type) from (select object_type,count(*) starts,count(*) filter(where status='estimate_created') estimates_created from public.estimate_generator_sessions where generation_mode='quick_calculation' group by object_type) object_data),'[]'::jsonb)
  ) end from public.estimate_generator_sessions;
$$;

revoke all on function public.record_estimate_generator_session(uuid,uuid,text,integer,integer,boolean,text,jsonb),
  public.resolve_estimate_generator_calculator_profiles(uuid,text[]),public.list_estimate_generator_calculator_profiles(),
  public.search_estimate_generator_mapping_targets(text,integer),public.update_estimate_generator_calculator_profile(text,integer,text,uuid),
  public.get_estimate_generator_admin_report(integer) from public,anon;
grant execute on function public.record_estimate_generator_session(uuid,uuid,text,integer,integer,boolean,text,jsonb),
  public.resolve_estimate_generator_calculator_profiles(uuid,text[]),public.list_estimate_generator_calculator_profiles(),
  public.search_estimate_generator_mapping_targets(text,integer),public.update_estimate_generator_calculator_profile(text,integer,text,uuid),
  public.get_estimate_generator_admin_report(integer) to authenticated;
