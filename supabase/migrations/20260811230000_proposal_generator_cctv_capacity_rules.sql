-- Governed CCTV capacity profiles and bounded correction telemetry.

alter table public.estimate_generator_calculator_profiles
  add column recorder_channels smallint null,
  add column integrated_poe_ports smallint null,
  add column drive_bay_count smallint null,
  add column poe_port_count smallint null,
  add column storage_capacity_tb numeric(6,2) null,
  add column camera_resolution_mp smallint null;

alter table public.estimate_generator_calculator_profiles
  add constraint estimate_generator_profile_recorder_channels_check check (recorder_channels is null or recorder_channels in (4,8,16,32)),
  add constraint estimate_generator_profile_integrated_poe_check check (integrated_poe_ports is null or integrated_poe_ports between 0 and 64),
  add constraint estimate_generator_profile_drive_bays_check check (drive_bay_count is null or drive_bay_count between 1 and 16),
  add constraint estimate_generator_profile_poe_ports_check check (poe_port_count is null or poe_port_count in (4,8,16,24,32)),
  add constraint estimate_generator_profile_storage_capacity_check check (storage_capacity_tb is null or storage_capacity_tb in (1,2,4,6,8)),
  add constraint estimate_generator_profile_camera_resolution_check check (camera_resolution_mp is null or camera_resolution_mp in (2,4,6,8));

insert into public.estimate_generator_calculator_profiles(profile_key,section_key,label,unit,is_active,camera_resolution_mp) values
  ('cctv.indoor.2mp','equipment','Камера для помещений, 2 Мп','pcs',true,2),
  ('cctv.indoor.4mp','equipment','Камера для помещений, 4 Мп','pcs',true,4),
  ('cctv.indoor.6mp','equipment','Камера для помещений, 6 Мп','pcs',true,6),
  ('cctv.indoor.8mp','equipment','Камера для помещений, 8 Мп','pcs',true,8),
  ('cctv.outdoor.2mp','equipment','Уличная камера, 2 Мп','pcs',true,2),
  ('cctv.outdoor.4mp','equipment','Уличная камера, 4 Мп','pcs',true,4),
  ('cctv.outdoor.6mp','equipment','Уличная камера, 6 Мп','pcs',true,6),
  ('cctv.outdoor.8mp','equipment','Уличная камера, 8 Мп','pcs',true,8),
  ('cctv.nvr.4','equipment','Видеорегистратор на 4 канала','pcs',true,null),
  ('cctv.storage.1tb','equipment','Накопитель для архива 1 ТБ','pcs',true,null),
  ('cctv.storage.2tb','equipment','Накопитель для архива 2 ТБ','pcs',true,null),
  ('cctv.storage.4tb','equipment','Накопитель для архива 4 ТБ','pcs',true,null),
  ('cctv.storage.6tb','equipment','Накопитель для архива 6 ТБ','pcs',true,null),
  ('cctv.poe.4','equipment','PoE-коммутатор на 4 порта','pcs',true,null),
  ('cctv.poe.8','equipment','PoE-коммутатор на 8 портов','pcs',true,null),
  ('cctv.poe.24','equipment','PoE-коммутатор на 24 порта','pcs',true,null),
  ('cctv.poe.32','equipment','PoE-коммутатор на 32 порта','pcs',true,null)
on conflict(profile_key) do update set is_active=true;

-- These two exact capabilities are already proven by their governed source products.
update public.estimate_generator_calculator_profiles exact
set catalog_product_id=legacy.catalog_product_id,version=case when exact.catalog_product_id is distinct from legacy.catalog_product_id then exact.version+1 else exact.version end
from public.estimate_generator_calculator_profiles legacy
where exact.profile_key='cctv.indoor.6mp' and legacy.profile_key='cctv.indoor.standard' and legacy.catalog_product_id is not null;
update public.estimate_generator_calculator_profiles exact
set catalog_product_id=legacy.catalog_product_id,version=case when exact.catalog_product_id is distinct from legacy.catalog_product_id then exact.version+1 else exact.version end
from public.estimate_generator_calculator_profiles legacy
where exact.profile_key='cctv.outdoor.4mp' and legacy.profile_key='cctv.outdoor.standard' and legacy.catalog_product_id is not null;

update public.estimate_generator_calculator_profiles set recorder_channels=substring(profile_key from 'cctv.nvr.([0-9]+)')::smallint
where profile_key ~ '^cctv\.nvr\.(4|8|16|32)$';
update public.estimate_generator_calculator_profiles set integrated_poe_ports=0,drive_bay_count=1
where profile_key='cctv.nvr.16' and catalog_product_id='155083d0-fb63-467c-aa3d-eccb68f0c1a8';
update public.estimate_generator_calculator_profiles set poe_port_count=substring(profile_key from 'cctv.poe.([0-9]+)')::smallint
where profile_key ~ '^cctv\.poe\.(4|8|16|24|32)$';
update public.estimate_generator_calculator_profiles set storage_capacity_tb=substring(profile_key from 'cctv.storage.([0-9]+)tb')::numeric
where profile_key ~ '^cctv\.storage\.(1|2|4|6|8)tb$';
update public.estimate_generator_calculator_profiles set is_active=true where profile_key in ('cctv.nvr.8','cctv.nvr.32');

drop function public.resolve_estimate_generator_calculator_profiles(uuid,text[]);
create function public.resolve_estimate_generator_calculator_profiles(target_company_id uuid,target_profile_keys text[])
returns table(
  profile_key text,label text,section_key text,unit text,version integer,resolution text,resolved_id uuid,resolved_label text,
  default_selling_unit_price numeric,default_selling_currency_code text,default_selling_vat_mode text,
  recorder_channels smallint,integrated_poe_ports smallint,drive_bay_count smallint,poe_port_count smallint,storage_capacity_tb numeric
)
language sql security definer set search_path=public stable as $$
  select profile.profile_key,profile.label,profile.section_key,profile.unit,profile.version,
    case when product.id is not null then 'catalog' when service.id is not null then 'service'
      when external_item.id is not null and library.external_nomenclature_id is not null then 'own_nomenclature'
      when external_item.id is not null and external_item.curation_status='active' then 'shared_nomenclature' else 'unresolved' end,
    coalesce(product.id,service.id,external_item.id),
    case when product.id is not null then product.sku||' · '||product.name when service.id is not null then service.name when external_item.id is not null then external_item.name end,
    case when service.id is not null then profile.default_selling_unit_price end,
    case when service.id is not null then profile.default_selling_currency_code end,
    case when service.id is not null then profile.default_selling_vat_mode end,
    profile.recorder_channels,profile.integrated_poe_ports,profile.drive_bay_count,profile.poe_port_count,profile.storage_capacity_tb
  from public.estimate_generator_calculator_profiles profile
  left join public.catalog_products product on product.id=profile.catalog_product_id and product.is_active and product.is_visible
  left join public.partner_services service on service.id=profile.partner_service_id and service.is_active and service.company_id is null and service.default_unit=profile.unit
  left join public.external_nomenclature_items external_item on external_item.id=profile.external_nomenclature_id and external_item.is_active and external_item.canonical_item_id is null and external_item.curation_status in ('active','review_required')
  left join public.partner_external_nomenclature_library library on library.company_id=target_company_id and library.external_nomenclature_id=external_item.id and library.status='active'
  where profile.profile_key=any(coalesce(target_profile_keys,array[]::text[])) and profile.is_active
    and public.can_access_estimates(target_company_id,'estimates.manage');
$$;

drop function public.list_estimate_generator_calculator_profiles();
create function public.list_estimate_generator_calculator_profiles()
returns table(
  profile_key text,system_type text,label text,section_key text,unit text,version integer,is_active boolean,resolution text,resolved_id uuid,resolved_label text,
  default_selling_unit_price numeric,default_selling_currency_code text,default_selling_vat_mode text,
  recorder_channels smallint,integrated_poe_ports smallint,drive_bay_count smallint,poe_port_count smallint,storage_capacity_tb numeric
)
language sql security definer set search_path=public stable as $$
  select profile.profile_key,profile.system_type,profile.label,profile.section_key,profile.unit,profile.version,profile.is_active,
    case when product.id is not null then 'catalog' when service.id is not null then 'service' when external_item.id is not null then 'shared_nomenclature' else 'unresolved' end,
    coalesce(product.id,service.id,external_item.id),
    case when product.id is not null then product.sku||' · '||product.name when service.id is not null then service.name when external_item.id is not null then external_item.name end,
    case when service.id is not null then profile.default_selling_unit_price end,
    case when service.id is not null then profile.default_selling_currency_code end,
    case when service.id is not null then profile.default_selling_vat_mode end,
    profile.recorder_channels,profile.integrated_poe_ports,profile.drive_bay_count,profile.poe_port_count,profile.storage_capacity_tb
  from public.estimate_generator_calculator_profiles profile
  left join public.catalog_products product on product.id=profile.catalog_product_id and product.is_active and product.is_visible
  left join public.partner_services service on service.id=profile.partner_service_id and service.is_active and service.company_id is null and service.default_unit=profile.unit
  left join public.external_nomenclature_items external_item on external_item.id=profile.external_nomenclature_id and external_item.is_active and external_item.canonical_item_id is null
  where profile.is_active and public.has_internal_permission('admin.estimates.view') order by profile.section_key,profile.profile_key;
$$;

alter table public.estimate_generator_sessions
  add column auto_nvr_profile text null,
  add column recorder_selection text null,
  add column proposed_hdd_capacity_tb numeric(8,2) null,
  add column poe_auto_profile text null,
  add column nvr_removed boolean not null default false,
  add column auto_product_replacement_count integer not null default 0,
  add column selected_hdd_capacity_tb numeric(8,2) null,
  add column poe_replaced boolean not null default false,
  add column poe_removed boolean not null default false;

alter table public.estimate_generator_sessions
  add constraint estimate_generator_recorder_selection_check check (recorder_selection is null or recorder_selection in ('auto','none','4','8','16','32')),
  add constraint estimate_generator_correction_count_check check (auto_product_replacement_count between 0 and 30);

create function public.record_estimate_generator_session_v4(
  target_company_id uuid,target_request_key uuid,target_request_fingerprint text,target_requirement_count integer,target_duration_ms integer,
  target_failed boolean,target_generation_mode text,target_structured_facts jsonb,target_resolved_catalog_count integer,target_resolved_service_count integer,
  target_own_nomenclature_count integer,target_shared_nomenclature_count integer,target_unresolved_count integer
) returns uuid language plpgsql security definer set search_path=public as $$
declare session_id uuid; facts jsonb:=coalesce(target_structured_facts,'{}'::jsonb);
begin
  session_id:=public.record_estimate_generator_session_v3(target_company_id,target_request_key,target_request_fingerprint,
    target_requirement_count,target_duration_ms,target_failed,target_generation_mode,target_structured_facts,target_resolved_catalog_count,
    target_resolved_service_count,target_own_nomenclature_count,target_shared_nomenclature_count,target_unresolved_count);
  if target_generation_mode='quick_calculation' and not target_failed then
    if coalesce(facts->>'recorderSelection','') not in ('auto','none','4','8','16','32')
      or coalesce((facts->>'indoorResolutionMp')::integer,0) not in (2,4,6,8)
      or coalesce((facts->>'outdoorResolutionMp')::integer,0) not in (2,4,6,8)
      or coalesce(facts->>'autoNvrProfile','') !~ '^(|cctv\.nvr\.(4|8|16|32))$'
      or coalesce(facts->>'poeAutoProfile','') !~ '^(|cctv\.poe\.(4|8|16|24|32))$'
      or (facts->>'proposedHddCapacityTb' is not null and (facts->>'proposedHddCapacityTb')::numeric not between 1 and 10000) then
      raise exception 'Generator correction facts are invalid.' using errcode='22023';
    end if;
    update public.estimate_generator_sessions set
      auto_nvr_profile=nullif(facts->>'autoNvrProfile',''),recorder_selection=facts->>'recorderSelection',
      proposed_hdd_capacity_tb=nullif(facts->>'proposedHddCapacityTb','')::numeric,poe_auto_profile=nullif(facts->>'poeAutoProfile','')
    where id=session_id and estimate_id is null;
  end if;
  return session_id;
end;
$$;

create function public.create_estimate_from_generator_v4(
  target_company_id uuid,target_session_id uuid,target_final_customer_id uuid,estimate_name text,target_project_name text,
  target_currency_code text,target_vat_mode text,target_validity_days integer,target_request_key uuid,target_request_fingerprint text,generated_lines jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare existing_estimate_id uuid; created_estimate_id uuid;
begin
  select estimate_id into existing_estimate_id from public.estimate_generator_sessions where id=target_session_id;
  created_estimate_id:=public.create_estimate_from_generator_v3(target_company_id,target_session_id,target_final_customer_id,estimate_name,
    target_project_name,target_currency_code,target_vat_mode,target_validity_days,target_request_key,target_request_fingerprint,generated_lines);
  if existing_estimate_id is not null then return created_estimate_id; end if;
  update public.estimate_generator_sessions session set
    auto_product_replacement_count=(select count(*) from jsonb_array_elements(generated_lines) line
      join public.estimate_generator_calculator_profiles profile on profile.profile_key=line->>'profile_key'
      where line->>'resolution'='catalog' and profile.catalog_product_id is not null and profile.catalog_product_id<>(line->>'product_id')::uuid),
    selected_hdd_capacity_tb=(select max(profile.storage_capacity_tb*(line->>'quantity')::numeric)
      from jsonb_array_elements(generated_lines) line join public.estimate_generator_calculator_profiles profile on profile.profile_key=line->>'profile_key'
      where profile.storage_capacity_tb is not null and line->>'resolution'='catalog' and profile.catalog_product_id=(line->>'product_id')::uuid),
    nvr_removed=session.recorder_selection='none' or (session.auto_nvr_profile is not null and not exists(
      select 1 from jsonb_array_elements(generated_lines) line where line->>'profile_key' like 'cctv.nvr.%')),
    poe_replaced=exists(select 1 from jsonb_array_elements(generated_lines) line
      join public.estimate_generator_calculator_profiles profile on profile.profile_key=line->>'profile_key'
      where profile.poe_port_count is not null and line->>'resolution'='catalog' and profile.catalog_product_id is distinct from (line->>'product_id')::uuid),
    poe_removed=session.poe_auto_profile is not null and not exists(select 1 from jsonb_array_elements(generated_lines) line where line->>'profile_key' like 'cctv.poe.%')
  where session.id=target_session_id;
  return created_estimate_id;
end;
$$;

revoke all on function public.resolve_estimate_generator_calculator_profiles(uuid,text[]),public.list_estimate_generator_calculator_profiles(),
  public.record_estimate_generator_session_v4(uuid,uuid,text,integer,integer,boolean,text,jsonb,integer,integer,integer,integer,integer),
  public.create_estimate_from_generator_v4(uuid,uuid,uuid,text,text,text,text,integer,uuid,text,jsonb) from public,anon;
grant execute on function public.resolve_estimate_generator_calculator_profiles(uuid,text[]) to authenticated;
grant execute on function public.list_estimate_generator_calculator_profiles() to authenticated;
grant execute on function public.record_estimate_generator_session_v4(uuid,uuid,text,integer,integer,boolean,text,jsonb,integer,integer,integer,integer,integer),
  public.create_estimate_from_generator_v4(uuid,uuid,uuid,text,text,text,text,integer,uuid,text,jsonb) to authenticated;

alter function public.get_estimate_generator_admin_report(integer) rename to get_estimate_generator_admin_report_before_cctv_corrections;
revoke all on function public.get_estimate_generator_admin_report_before_cctv_corrections(integer) from public,anon,authenticated;

create function public.get_estimate_generator_admin_report(result_limit integer default 20)
returns jsonb language sql security definer set search_path=public stable as $$
  with base as (select public.get_estimate_generator_admin_report_before_cctv_corrections(result_limit) report),
  corrections as (
    select jsonb_build_object(
      'nvrManualOverrideCount',count(*) filter(where recorder_selection in ('4','8','16','32')),
      'nvrRemovedCount',count(*) filter(where nvr_removed),
      'autoProductReplacementCount',coalesce(sum(auto_product_replacement_count),0),
      'poeReplacementCount',count(*) filter(where poe_replaced),
      'poeRemovedCount',count(*) filter(where poe_removed),
      'hddCapacityCorrectionCount',count(*) filter(where proposed_hdd_capacity_tb is distinct from selected_hdd_capacity_tb and selected_hdd_capacity_tb is not null)
    ) data from public.estimate_generator_sessions where generation_mode='quick_calculation'
  )
  select case when base.report is null then null else jsonb_set(base.report,'{summary}',(base.report->'summary')||corrections.data) end
  from base,corrections;
$$;

revoke all on function public.get_estimate_generator_admin_report(integer) from public,anon;
grant execute on function public.get_estimate_generator_admin_report(integer) to authenticated;
