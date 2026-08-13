-- Object-specific CCTV service availability backed by the shared installation tariff catalog.

alter table public.installation_tariffs drop constraint if exists installation_tariffs_service_type_check;
alter table public.installation_tariffs add constraint installation_tariffs_service_type_check check(service_type in (
  'camera_installation','cable_laying','commissioning','remote_configuration',
  'equipment_installation_class_2','equipment_installation_class_3',
  'cable_routing_class_2','cable_routing_class_3','ai_scenario_programming'
));

create or replace function public.admin_save_installation_tariff_draft(
  p_tariff_set_id uuid,p_effective_from timestamptz,p_currency text,p_vat_treatment text,
  p_lines jsonb,p_expected_revision bigint,p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare target_id uuid; next_version integer; affected integer;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if p_currency !~ '^[A-Z]{3}$' or p_vat_treatment not in ('included','excluded','not_specified')
    or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 9
    or char_length(btrim(p_reason))<5 then raise exception 'Invalid tariff draft.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) x(service_type text,unit_code text,unit_price numeric)
    where service_type not in ('camera_installation','cable_laying','commissioning','remote_configuration',
      'equipment_installation_class_2','equipment_installation_class_3','cable_routing_class_2',
      'cable_routing_class_3','ai_scenario_programming')
      or unit_code not in ('piece','meter','service') or unit_price<0) then
    raise exception 'Invalid tariff line.' using errcode='22023';
  end if;
  if (select count(distinct service_type) from jsonb_to_recordset(p_lines) x(service_type text))<>jsonb_array_length(p_lines) then
    raise exception 'Duplicate tariff line.' using errcode='22023';
  end if;
  if p_tariff_set_id is null then
    select coalesce(max(version),0)+1 into next_version from public.installation_tariff_sets where system_type='cctv';
    insert into public.installation_tariff_sets(system_type,version,currency,vat_treatment,effective_from,created_by)
    values('cctv',next_version,p_currency,p_vat_treatment,p_effective_from,auth.uid()) returning id into target_id;
    insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('tariff_set',target_id,'tariff_draft_created',auth.uid(),jsonb_build_object('reason',btrim(p_reason),'lineCount',jsonb_array_length(p_lines)));
  else
    update public.installation_tariff_sets set currency=p_currency,vat_treatment=p_vat_treatment,
      effective_from=p_effective_from,revision=revision+1,updated_at=now()
    where id=p_tariff_set_id and status='draft' and revision=p_expected_revision returning id into target_id;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Tariff revision conflict.' using errcode='PT409'; end if;
    delete from public.installation_tariffs where tariff_set_id=target_id;
    insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('tariff_set',target_id,'tariff_draft_updated',auth.uid(),jsonb_build_object('reason',btrim(p_reason),'lineCount',jsonb_array_length(p_lines)));
  end if;
  insert into public.installation_tariffs(tariff_set_id,service_type,unit_code,customer_unit_price)
  select target_id,service_type,unit_code,unit_price from jsonb_to_recordset(p_lines) x(service_type text,unit_code text,unit_price numeric);
  return target_id;
end; $$;

alter table public.cctv_camera_candidate_pools
  add column archived_at timestamptz null,
  add column archived_by uuid null references public.user_profiles(id) on delete restrict;
alter table public.cctv_camera_candidate_pool_events drop constraint if exists cctv_camera_candidate_pool_events_event_type_check;
alter table public.cctv_camera_candidate_pool_events add constraint cctv_camera_candidate_pool_events_event_type_check
  check(event_type in ('candidate_added','candidate_updated','candidate_disabled','candidate_enabled','candidate_removed','candidate_restored'));

create table public.cctv_service_definitions (
  code text primary key check(code in (
    'cable_routing_class_1','cable_routing_class_2','cable_routing_class_3',
    'equipment_installation_class_1','equipment_installation_class_2','equipment_installation_class_3',
    'commissioning','remote_viewing_configuration','ai_scenario_programming'
  )),
  family text not null check(family in ('cable_routing','equipment_installation','commissioning','remote_viewing_configuration','ai_scenario_programming')),
  complexity_class smallint null check(complexity_class between 1 and 3),
  unit_code text not null check(unit_code in ('piece','meter','service')),
  tariff_service_type text not null unique,
  partner_service_id uuid null references public.partner_services(id) on delete restrict,
  label_ru text not null,
  label_ro text not null,
  active boolean not null default true,
  sort_order smallint not null check(sort_order between 1 and 100),
  check((family in ('cable_routing','equipment_installation') and complexity_class is not null)
    or (family in ('commissioning','remote_viewing_configuration','ai_scenario_programming') and complexity_class is null))
);

create table public.cctv_object_service_bindings (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check(object_type in ('apartment','house','office','retail','warehouse','industrial','horeca','other')),
  service_code text not null references public.cctv_service_definitions(code) on delete restrict,
  enabled boolean not null default false,
  calculator_default boolean not null default false,
  display_order smallint not null default 50 check(display_order between 1 and 100),
  notes text null check(notes is null or char_length(notes) <= 1000),
  version integer not null default 1 check(version > 0),
  created_by uuid null references public.user_profiles(id) on delete restrict,
  updated_by uuid null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(not calculator_default or enabled),
  unique(object_type,service_code)
);

create table public.cctv_object_service_binding_events (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.cctv_object_service_bindings(id) on delete restrict,
  event_type text not null check(event_type in ('binding_created','binding_updated','binding_enabled','binding_disabled','default_changed')),
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  previous_snapshot jsonb null,
  resulting_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index cctv_object_service_bindings_lookup_idx
  on public.cctv_object_service_bindings(object_type,enabled,calculator_default,display_order,service_code);
create index cctv_object_service_binding_events_binding_idx
  on public.cctv_object_service_binding_events(binding_id,created_at desc,id);

alter table public.cctv_service_definitions enable row level security;
alter table public.cctv_object_service_bindings enable row level security;
alter table public.cctv_object_service_binding_events enable row level security;
revoke all on public.cctv_service_definitions,public.cctv_object_service_bindings,
  public.cctv_object_service_binding_events from public,anon,authenticated;
grant select,insert,update,delete on public.cctv_service_definitions,public.cctv_object_service_bindings,
  public.cctv_object_service_binding_events to service_role;

insert into public.cctv_service_definitions(
  code,family,complexity_class,unit_code,tariff_service_type,partner_service_id,label_ru,label_ro,sort_order
)
values
  ('cable_routing_class_1','cable_routing',1,'meter','cable_laying',null,'Прокладка кабеля · класс I','Pozare cablu · clasa I',10),
  ('cable_routing_class_2','cable_routing',2,'meter','cable_routing_class_2',null,'Прокладка кабеля · класс II','Pozare cablu · clasa II',20),
  ('cable_routing_class_3','cable_routing',3,'meter','cable_routing_class_3',null,'Прокладка кабеля · класс III','Pozare cablu · clasa III',30),
  ('equipment_installation_class_1','equipment_installation',1,'piece','camera_installation',null,'Монтаж оборудования · класс I','Instalare echipament · clasa I',40),
  ('equipment_installation_class_2','equipment_installation',2,'piece','equipment_installation_class_2',null,'Монтаж оборудования · класс II','Instalare echipament · clasa II',50),
  ('equipment_installation_class_3','equipment_installation',3,'piece','equipment_installation_class_3',null,'Монтаж оборудования · класс III','Instalare echipament · clasa III',60),
  ('commissioning','commissioning',null,'piece','commissioning',null,'Пусконаладочные работы','Punere în funcțiune',70),
  ('remote_viewing_configuration','remote_viewing_configuration',null,'service','remote_configuration',null,'Настройка удалённого просмотра','Configurare vizualizare la distanță',80),
  ('ai_scenario_programming','ai_scenario_programming',null,'service','ai_scenario_programming',null,'Программирование AI-сценария','Programare scenariu AI',90);

update public.cctv_service_definitions definition set partner_service_id=profile.partner_service_id
from public.estimate_generator_calculator_profiles profile
where (definition.code,profile.profile_key) in (
  ('cable_routing_class_1','cctv.install.cable'),
  ('equipment_installation_class_1','cctv.install.camera'),
  ('commissioning','cctv.commissioning.system'),
  ('remote_viewing_configuration','cctv.commissioning.remote')
) and profile.partner_service_id is not null;

insert into public.cctv_object_service_bindings(object_type,service_code,enabled,calculator_default,display_order)
select object_type,definition.code,
  definition.code in ('cable_routing_class_1','equipment_installation_class_1','commissioning','remote_viewing_configuration'),
  definition.code in ('cable_routing_class_1','equipment_installation_class_1','commissioning','remote_viewing_configuration'),
  definition.sort_order
from unnest(array['apartment','house','office','retail','warehouse','industrial','horeca','other']) object_type
cross join public.cctv_service_definitions definition;

insert into public.cctv_object_service_binding_events(binding_id,event_type,resulting_snapshot)
select id,'binding_created',to_jsonb(binding) from public.cctv_object_service_bindings binding;

create function public.prevent_cctv_object_service_event_mutation() returns trigger
language plpgsql set search_path=public as $$
begin raise exception 'CCTV object service events are append-only.' using errcode='42501'; end; $$;
create trigger protect_cctv_object_service_binding_events before update or delete
on public.cctv_object_service_binding_events for each row execute function public.prevent_cctv_object_service_event_mutation();

revoke execute on function public.prevent_cctv_object_service_event_mutation() from public,anon,authenticated;

create function public.get_cctv_object_configuration(target_object_type text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; tariff public.installation_tariff_sets;
begin
  if not public.has_internal_permission('admin.estimates.view') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other') then
    raise exception 'Invalid CCTV object type.' using errcode='22023';
  end if;
  select * into tariff from public.installation_tariff_sets where system_type='cctv'
    and status in ('published','superseded') and effective_from<=now() and (effective_to is null or effective_to>now()) limit 1;
  select jsonb_build_object(
    'objectType',target_object_type,
    'tariffSet',case when tariff.id is null then null else jsonb_build_object(
      'id',tariff.id,'version',tariff.version,'currency',tariff.currency,'vatTreatment',tariff.vat_treatment) end,
    'services',coalesce(jsonb_agg(jsonb_build_object(
      'bindingId',binding.id,'serviceCode',definition.code,'family',definition.family,
      'complexityClass',definition.complexity_class,'label',definition.label_ru,'unitCode',definition.unit_code,
      'enabled',binding.enabled,'calculatorDefault',binding.calculator_default,'displayOrder',binding.display_order,
      'notes',binding.notes,'version',binding.version,'partnerServiceId',definition.partner_service_id,
      'tariffServiceType',definition.tariff_service_type,'tariffActive',line.id is not null,
      'unitPrice',line.customer_unit_price,'currency',tariff.currency,'vatTreatment',tariff.vat_treatment
    ) order by definition.sort_order),'[]'::jsonb)
  ) into result
  from public.cctv_service_definitions definition
  join public.cctv_object_service_bindings binding on binding.service_code=definition.code and binding.object_type=target_object_type
  left join public.installation_tariffs line on line.tariff_set_id=tariff.id and line.service_type=definition.tariff_service_type
  where definition.active;
  return result;
end; $$;
revoke all on function public.get_cctv_object_configuration(text) from public,anon;
grant execute on function public.get_cctv_object_configuration(text) to authenticated;

create function public.get_all_cctv_object_configurations()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_internal_permission('admin.estimates.view') then raise exception 'Forbidden.' using errcode='42501'; end if;
  return (select jsonb_agg(public.get_cctv_object_configuration(object_type) order by ordinality)
    from unnest(array['apartment','house','office','retail','warehouse','industrial','horeca','other'])
      with ordinality object_types(object_type,ordinality));
end; $$;
revoke all on function public.get_all_cctv_object_configurations() from public,anon;
grant execute on function public.get_all_cctv_object_configurations() to authenticated;

create function public.resolve_cctv_object_services(target_object_type text,target_service_types text[])
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; tariff public.installation_tariff_sets;
begin
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or coalesce(cardinality(target_service_types),0)<1 or cardinality(target_service_types)>4
    or exists(select 1 from unnest(target_service_types) value where value not in ('camera_installation','cable_laying','commissioning','remote_configuration')) then
    raise exception 'Invalid CCTV service request.' using errcode='22023';
  end if;
  select * into tariff from public.installation_tariff_sets where system_type='cctv'
    and status in ('published','superseded') and effective_from<=now() and (effective_to is null or effective_to>now()) limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'requestServiceType',requested.service_type,'serviceCode',chosen.code,'partnerServiceId',chosen.partner_service_id,
    'unitCode',chosen.unit_code,'unitPrice',line.customer_unit_price,'currency',tariff.currency,
    'vatTreatment',tariff.vat_treatment,'tariffSetId',tariff.id,'tariffVersion',tariff.version
  ) order by requested.ordinality),'[]'::jsonb) into result
  from unnest(target_service_types) with ordinality requested(service_type,ordinality)
  left join lateral (
    select definition.* from public.cctv_object_service_bindings binding
    join public.cctv_service_definitions definition on definition.code=binding.service_code and definition.active
    where binding.object_type=target_object_type and binding.enabled and binding.calculator_default
      and definition.family=case requested.service_type
        when 'camera_installation' then 'equipment_installation'
        when 'cable_laying' then 'cable_routing'
        when 'commissioning' then 'commissioning'
        else 'remote_viewing_configuration' end
    order by binding.display_order,definition.sort_order limit 1
  ) chosen on true
  left join public.installation_tariffs line on line.tariff_set_id=tariff.id and line.service_type=chosen.tariff_service_type;
  return result;
end; $$;
revoke all on function public.resolve_cctv_object_services(text,text[]) from public,anon,authenticated;
grant execute on function public.resolve_cctv_object_services(text,text[]) to service_role;

create function public.resolve_generator_cctv_object_services(
  target_company_id uuid,target_session_id uuid,target_profile_keys text[]
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare object_type text; requested_types text[]; resolved jsonb;
begin
  if not public.can_access_estimates(target_company_id,'estimates.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  select session.object_type into object_type from public.estimate_generator_sessions session
  where session.id=target_session_id and session.company_id=target_company_id and session.actor_user_id=auth.uid();
  if object_type is null or coalesce(cardinality(target_profile_keys),0)<1 or cardinality(target_profile_keys)>4
    or exists(select 1 from unnest(target_profile_keys) value where value not in (
      'cctv.install.camera','cctv.install.cable','cctv.commissioning.system','cctv.commissioning.remote')) then
    raise exception 'Generator service context is invalid.' using errcode='22023';
  end if;
  requested_types:=array(select case value when 'cctv.install.camera' then 'camera_installation'
    when 'cctv.install.cable' then 'cable_laying' when 'cctv.commissioning.system' then 'commissioning'
    else 'remote_configuration' end from unnest(target_profile_keys) value);
  select public.resolve_cctv_object_services(object_type,requested_types) into resolved;
  return (select coalesce(jsonb_agg(item.value || jsonb_build_object('profileKey',profile.value)),'[]'::jsonb)
    from jsonb_array_elements(resolved) with ordinality item(value,ordinality)
    join unnest(target_profile_keys) with ordinality profile(value,ordinality) using(ordinality));
end; $$;
revoke all on function public.resolve_generator_cctv_object_services(uuid,uuid,text[]) from public,anon;
grant execute on function public.resolve_generator_cctv_object_services(uuid,uuid,text[]) to authenticated;

create function public.upsert_cctv_object_service_binding(
  target_object_type text,target_service_code text,target_enabled boolean,target_calculator_default boolean,
  target_display_order smallint,target_notes text,expected_version integer
) returns table(binding_id uuid,resulting_version integer)
language plpgsql security definer set search_path=public as $$
declare existing public.cctv_object_service_bindings; saved public.cctv_object_service_bindings;
begin
  if not public.has_internal_permission('admin.integrations.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or not exists(select 1 from public.cctv_service_definitions where code=target_service_code and active)
    or target_display_order not between 1 and 100 or char_length(coalesce(target_notes,''))>1000
    or (target_calculator_default and not target_enabled) then raise exception 'Invalid service binding.' using errcode='22023'; end if;
  select * into existing from public.cctv_object_service_bindings where object_type=target_object_type
    and service_code=target_service_code for update;
  if existing.id is null or existing.version<>expected_version then raise exception 'CCTV_SERVICE_BINDING_CONFLICT' using errcode='PT409'; end if;
  if target_calculator_default then
    update public.cctv_object_service_bindings other set calculator_default=false,version=version+1,
      updated_by=auth.uid(),updated_at=now()
    from public.cctv_service_definitions selected,public.cctv_service_definitions current
    where selected.code=target_service_code and current.code=other.service_code and current.family=selected.family
      and other.object_type=target_object_type and other.id<>existing.id and other.calculator_default;
  end if;
  update public.cctv_object_service_bindings set enabled=target_enabled,calculator_default=target_calculator_default,
    display_order=target_display_order,notes=nullif(btrim(target_notes),''),version=version+1,
    updated_by=auth.uid(),updated_at=now() where id=existing.id returning * into saved;
  insert into public.cctv_object_service_binding_events(binding_id,event_type,actor_user_id,previous_snapshot,resulting_snapshot)
  values(saved.id,case when existing.enabled and not saved.enabled then 'binding_disabled'
    when not existing.enabled and saved.enabled then 'binding_enabled'
    when existing.calculator_default<>saved.calculator_default then 'default_changed' else 'binding_updated' end,
    auth.uid(),to_jsonb(existing),to_jsonb(saved));
  return query select saved.id,saved.version;
end; $$;
revoke all on function public.upsert_cctv_object_service_binding(text,text,boolean,boolean,smallint,text,integer) from public,anon;
grant execute on function public.upsert_cctv_object_service_binding(text,text,boolean,boolean,smallint,text,integer) to authenticated;

create function public.remove_cctv_camera_candidate(target_candidate_id uuid,expected_version integer)
returns integer language plpgsql security definer set search_path=public as $$
declare existing public.cctv_camera_candidate_pools; saved public.cctv_camera_candidate_pools;
begin
  if not public.has_internal_permission('admin.integrations.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  select * into existing from public.cctv_camera_candidate_pools where id=target_candidate_id for update;
  if existing.id is null or existing.version<>expected_version or existing.archived_at is not null then
    raise exception 'CCTV_CAMERA_POOL_CONFLICT' using errcode='PT409';
  end if;
  update public.cctv_camera_candidate_pools set enabled=false,archived_at=now(),archived_by=auth.uid(),
    version=version+1,updated_by=auth.uid(),updated_at=now() where id=existing.id returning * into saved;
  insert into public.cctv_camera_candidate_pool_events(candidate_id,event_type,actor_user_id,previous_snapshot,resulting_snapshot)
  values(saved.id,'candidate_removed',auth.uid(),to_jsonb(existing),to_jsonb(saved));
  return saved.version;
end; $$;
revoke all on function public.remove_cctv_camera_candidate(uuid,integer) from public,anon;
grant execute on function public.remove_cctv_camera_candidate(uuid,integer) to authenticated;

drop function public.list_cctv_camera_candidate_pools();
create function public.list_cctv_camera_candidate_pools()
returns table(id uuid,object_type text,placement_type text,product_id uuid,sku text,product_name text,
  image_url text,manual_priority text,enabled boolean,notes text,version integer,resolution_mp smallint,
  network_camera boolean,poe_supported boolean,color_night boolean,anpr boolean,video_analytics boolean,
  technical_verified boolean,evidence_source text,available_stock numeric,recent_sales_qty numeric,
  last_sale_at timestamptz,signal_updated_at timestamptz,public_published boolean,
  retail_price_amount numeric,retail_price_currency text)
language sql stable security definer set search_path=public as $$
 select pool.id,pool.object_type,pool.placement_type,product.id,product.sku,product.name,product.image_url,pool.manual_priority,pool.enabled,
   pool.notes,pool.version,cap.resolution_mp,cap.network_camera,cap.poe_supported,cap.color_night,cap.anpr,
   cap.video_analytics,cap.verified,cap.evidence_source,coalesce(signal.available_stock,0),
   coalesce(signal.recent_sales_qty,0),signal.last_sale_at,signal.signal_updated_at,
   retail.public_id is not null,retail.retail_price_amount,retail.retail_price_currency
 from public.cctv_camera_candidate_pools pool join public.catalog_products product on product.id=pool.product_id
 join public.cctv_camera_capabilities cap on cap.product_id=pool.product_id
 left join public.cctv_camera_turnover_signals signal on signal.product_id=pool.product_id
 left join public.public_retail_publications publication on publication.status='published'
 left join public.public_retail_products retail on retail.publication_id=publication.id and retail.sku=product.sku
 where public.has_internal_permission('admin.estimates.view') and pool.archived_at is null
 order by pool.object_type,pool.placement_type,pool.product_id;
$$;
revoke all on function public.list_cctv_camera_candidate_pools() from public,anon;
grant execute on function public.list_cctv_camera_candidate_pools() to authenticated;

create or replace function public.upsert_cctv_camera_candidate(
  target_object_type text,target_placement_type text,target_product_id uuid,target_manual_priority text,
  target_enabled boolean,target_notes text,expected_version integer default null
) returns table(candidate_id uuid,resulting_version integer)
language plpgsql security definer set search_path=public as $$
declare existing public.cctv_camera_candidate_pools; actor uuid:=auth.uid(); saved public.cctv_camera_candidate_pools;
begin
  if not public.has_internal_permission('admin.integrations.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or target_placement_type not in ('indoor','outdoor') or target_manual_priority not in ('high','normal','low')
    or char_length(coalesce(target_notes,''))>1000 then raise exception 'Invalid candidate.' using errcode='22023'; end if;
  if not exists(select 1 from public.cctv_camera_capabilities c join public.catalog_products p on p.id=c.product_id
    where c.product_id=target_product_id and p.is_active and p.is_visible) then raise exception 'Camera capability is unavailable.' using errcode='22023'; end if;
  select * into existing from public.cctv_camera_candidate_pools where object_type=target_object_type
    and placement_type=target_placement_type and product_id=target_product_id for update;
  if existing.id is null then
    if expected_version is not null then raise exception 'CCTV_CAMERA_POOL_CONFLICT' using errcode='PT409'; end if;
    insert into public.cctv_camera_candidate_pools(object_type,placement_type,product_id,manual_priority,enabled,notes,created_by,updated_by)
    values(target_object_type,target_placement_type,target_product_id,target_manual_priority,target_enabled,nullif(trim(target_notes),''),actor,actor) returning * into saved;
    insert into public.cctv_camera_candidate_pool_events(candidate_id,event_type,actor_user_id,resulting_snapshot)
      values(saved.id,'candidate_added',actor,to_jsonb(saved));
  else
    if expected_version is null or existing.version<>expected_version then raise exception 'CCTV_CAMERA_POOL_CONFLICT' using errcode='PT409'; end if;
    update public.cctv_camera_candidate_pools set manual_priority=target_manual_priority,enabled=target_enabled,
      notes=nullif(trim(target_notes),''),archived_at=null,archived_by=null,version=version+1,updated_by=actor,updated_at=now()
      where id=existing.id returning * into saved;
    insert into public.cctv_camera_candidate_pool_events(candidate_id,event_type,actor_user_id,previous_snapshot,resulting_snapshot)
      values(saved.id,case when existing.archived_at is not null then 'candidate_restored'
        when existing.enabled and not saved.enabled then 'candidate_disabled'
        when not existing.enabled and saved.enabled then 'candidate_enabled' else 'candidate_updated' end,
        actor,to_jsonb(existing),to_jsonb(saved));
  end if;
  return query select saved.id,saved.version;
end; $$;

-- Runtime resolver ignores archived memberships without changing the shared selection policy.
create or replace function public.resolve_cctv_camera_candidate_pool(
  target_object_type text,target_placements text[],target_locale text default 'ru'
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or target_locale not in ('ru','ro') or coalesce(cardinality(target_placements),0)<1 or cardinality(target_placements)>2
    or exists(select 1 from unnest(target_placements) value where value not in ('indoor','outdoor')) then
    raise exception 'CCTV camera pool input is invalid.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'candidateId',pool.id,'objectType',pool.object_type,'placement',pool.placement_type,
    'productId',product.id,'manualPriority',pool.manual_priority,'enabled',pool.enabled,
    'resolutionMp',capability.resolution_mp,'networkCamera',capability.network_camera,
    'poeSupported',capability.poe_supported,'colorNight',capability.color_night,'anpr',capability.anpr,
    'videoAnalytics',capability.video_analytics,'technicalVerified',capability.verified,
    'availableStock',coalesce(signal.available_stock,0),'recentSalesQty',coalesce(signal.recent_sales_qty,0),
    'lastSaleAt',signal.last_sale_at,'signalUpdatedAt',signal.signal_updated_at,'sku',product.sku,'name',product.name,
    'imageUrl',product.image_url,'publicProduct',case when retail.public_id is null then null else jsonb_build_object(
      'id',retail.public_id,'slug',retail.slug,'sku',retail.sku,
      'name',case when target_locale='ro' then coalesce(retail.name_ro,retail.name_ru) else retail.name_ru end,
      'shortDescription',case when target_locale='ro' then coalesce(retail.short_description_ro,retail.short_description_ru) else retail.short_description_ru end,
      'image',case when retail.primary_image_url is null then null else jsonb_build_object('url',retail.primary_image_url,
        'alt',case when target_locale='ro' then coalesce(retail.primary_image_alt_ro,retail.primary_image_alt_ru) else retail.primary_image_alt_ru end) end,
      'brand',null,'category',null,'price',jsonb_build_object('amount',retail.retail_price_amount,
        'currency',retail.retail_price_currency,'vatPresentation',retail.vat_presentation),
      'availability',retail.availability,'highlights','[]'::jsonb,'calculatorEligible',true) end
  ) order by pool.placement_type,pool.product_id),'[]'::jsonb) into result
  from public.cctv_camera_candidate_pools pool
  join public.cctv_camera_capabilities capability on capability.product_id=pool.product_id
  join public.catalog_products product on product.id=pool.product_id and product.is_active and product.is_visible
  left join public.cctv_camera_turnover_signals signal on signal.product_id=pool.product_id
  left join public.public_retail_publications publication on publication.status='published'
  left join public.public_retail_products retail on retail.publication_id=publication.id and retail.sku=product.sku
  where pool.object_type in (target_object_type,'other') and pool.placement_type=any(target_placements)
    and pool.enabled and pool.archived_at is null;
  return result;
end; $$;

comment on table public.cctv_object_service_bindings is 'Object relevance and calculator defaults only; installation_tariffs remains the shared B2B/B2C price truth.';
