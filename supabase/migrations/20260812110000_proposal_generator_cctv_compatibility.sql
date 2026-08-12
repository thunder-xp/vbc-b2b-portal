-- Governed CCTV recorder compatibility and approved default mappings.

alter table public.estimate_generator_calculator_profiles
  add column max_drive_capacity_tb numeric(6,2) null,
  add column compatibility_verified boolean not null default false,
  add column compatibility_evidence_source text null,
  add column compatibility_verified_at timestamptz null;

alter table public.estimate_generator_calculator_profiles
  add constraint estimate_generator_profile_max_drive_capacity_check
    check (max_drive_capacity_tb is null or max_drive_capacity_tb between 1 and 100),
  add constraint estimate_generator_profile_verified_compatibility_check check (
    not compatibility_verified or (
      recorder_channels is not null and integrated_poe_ports is not null and drive_bay_count is not null
      and max_drive_capacity_tb is not null and compatibility_evidence_source is not null and compatibility_verified_at is not null
    )
  );

alter table public.estimate_generator_calculator_profiles
  drop constraint estimate_generator_profile_storage_capacity_check;
alter table public.estimate_generator_calculator_profiles
  add constraint estimate_generator_profile_storage_capacity_check
    check (storage_capacity_tb is null or storage_capacity_tb in (1,2,4,6,8,12));

insert into public.estimate_generator_calculator_profiles(profile_key,section_key,label,unit,is_active,storage_capacity_tb)
values ('cctv.storage.12tb','equipment','Накопитель для архива 12 ТБ','pcs',false,12)
on conflict(profile_key) do update set is_active=false, catalog_product_id=null, storage_capacity_tb=12;

create table public.estimate_generator_calculator_profile_compatibility_events (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null references public.estimate_generator_calculator_profiles(profile_key) on delete restrict,
  profile_version integer not null check (profile_version > 0),
  event_type text not null check (event_type in ('mapping_activated','compatibility_verified')),
  governed_snapshot jsonb not null,
  evidence_source text not null,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index estimate_generator_profile_compatibility_events_profile_idx
  on public.estimate_generator_calculator_profile_compatibility_events(profile_key,created_at desc,id);
alter table public.estimate_generator_calculator_profile_compatibility_events enable row level security;
revoke all on public.estimate_generator_calculator_profile_compatibility_events from public,anon,authenticated;
grant select on public.estimate_generator_calculator_profile_compatibility_events to service_role;

create function public.prevent_estimate_generator_compatibility_event_mutation()
returns trigger language plpgsql set search_path=public as $$ begin
  raise exception 'Generator compatibility events are immutable.' using errcode='55000';
end; $$;
create trigger prevent_estimate_generator_compatibility_event_update_delete
before update or delete on public.estimate_generator_calculator_profile_compatibility_events
for each row execute function public.prevent_estimate_generator_compatibility_event_mutation();
revoke all on function public.prevent_estimate_generator_compatibility_event_mutation() from public,anon,authenticated;

do $$
declare item record; profile public.estimate_generator_calculator_profiles; product public.catalog_products; new_version integer;
begin
  for item in select * from (values
    ('cctv.nvr.4','130146','DHI-NVR1104HS-P-S3-H',4,4,1,8,'https://material.dahuasecurity.com/uploads/soft/20231227/DHI-NVR1104HS-P-S3H_datasheet_20210112_RU.pdf'),
    ('cctv.nvr.8','130236','DHI-NVR2108HS-8P-4KS3',8,8,1,20,'https://materialfile.dahuasecurity.com/uploads/cpq/prm-os-srv-res/smart/datasheetzipfiles/NVR2108HS-8P-4KS3_S0_datasheet_20241119.pdf'),
    ('cctv.nvr.16','130251','DHI-NVR2116HS-4KS3',16,0,1,20,'https://www.dahuasecurity.com/in/products/network-products/network-recorders/Lite-Series/NVR2-4KS3-Series/1HDD/NVR2116HS-4KS3'),
    ('cctv.nvr.32','130263','DHI-NVR4232-EI',32,0,2,16,'https://material.dahuasecurity.com/uploads/soft/20240104/NVR4232-EI_S0_datasheet_20230628.en.pt.pdf')
  ) value(profile_key,sku,model,channels,poe_ports,bays,max_drive_tb,evidence) loop
    select * into strict product from public.catalog_products
      where sku=item.sku and name=item.model and is_active and is_visible;
    select * into strict profile from public.estimate_generator_calculator_profiles where profile_key=item.profile_key for update;
    new_version:=profile.version+1;
    update public.estimate_generator_calculator_profiles set catalog_product_id=product.id, external_nomenclature_id=null,
      partner_service_id=null, recorder_channels=item.channels, integrated_poe_ports=item.poe_ports,
      drive_bay_count=item.bays, max_drive_capacity_tb=item.max_drive_tb, compatibility_verified=true,
      compatibility_evidence_source=item.evidence, compatibility_verified_at=now(), is_active=true,
      version=new_version, updated_at=now()
    where profile_key=item.profile_key;
    insert into public.estimate_generator_calculator_profile_compatibility_events(
      profile_key,profile_version,event_type,governed_snapshot,evidence_source
    ) values (item.profile_key,new_version,'compatibility_verified',jsonb_build_object(
      'catalogProductId',product.id,'sku',product.sku,'model',product.name,'channels',item.channels,
      'integratedPoePorts',item.poe_ports,'driveBayCount',item.bays,'maxDriveCapacityTb',item.max_drive_tb
    ),item.evidence);
  end loop;

  for item in select * from (values
    ('cctv.poe.4','500144','DH-CS4006-4ET2GT-36'),
    ('cctv.poe.8','500145','DH-CHS4110-8ET-90-F'),
    ('cctv.poe.16','500107','DH-S3218-16ET-135'),
    ('cctv.poe.24','500097','DH-CS4226-24ET-375'),
    ('cctv.storage.2tb','800105','ST2000VX016'),
    ('cctv.storage.4tb','800068','ST4000VX005'),
    ('cctv.storage.6tb','800008','ST6000VX0003'),
    ('cctv.storage.8tb','800039','WD82PURX')
  ) value(profile_key,sku,model) loop
    select * into strict product from public.catalog_products
      where sku=item.sku and name=item.model and is_active and is_visible;
    select * into strict profile from public.estimate_generator_calculator_profiles where profile_key=item.profile_key for update;
    new_version:=profile.version+1;
    update public.estimate_generator_calculator_profiles set catalog_product_id=product.id,
      external_nomenclature_id=null,partner_service_id=null,is_active=true,version=new_version,updated_at=now()
    where profile_key=item.profile_key;
    insert into public.estimate_generator_calculator_profile_compatibility_events(
      profile_key,profile_version,event_type,governed_snapshot,evidence_source
    ) values (item.profile_key,new_version,'mapping_activated',jsonb_build_object(
      'catalogProductId',product.id,'sku',product.sku,'model',product.name
    ),'business_approval_2026-08-12');
  end loop;

  update public.estimate_generator_calculator_profiles set is_active=false,catalog_product_id=null,version=version+1,updated_at=now()
  where profile_key in ('cctv.poe.32','cctv.storage.1tb','cctv.storage.12tb');
end $$;

drop function public.resolve_estimate_generator_calculator_profiles(uuid,text[]);
create function public.resolve_estimate_generator_calculator_profiles(target_company_id uuid,target_profile_keys text[])
returns table(
  profile_key text,label text,section_key text,unit text,version integer,resolution text,resolved_id uuid,resolved_label text,
  default_selling_unit_price numeric,default_selling_currency_code text,default_selling_vat_mode text,
  recorder_channels smallint,integrated_poe_ports smallint,drive_bay_count smallint,poe_port_count smallint,storage_capacity_tb numeric,
  max_drive_capacity_tb numeric,compatibility_verified boolean,compatibility_evidence_source text
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
    profile.recorder_channels,profile.integrated_poe_ports,profile.drive_bay_count,profile.poe_port_count,profile.storage_capacity_tb,
    profile.max_drive_capacity_tb,profile.compatibility_verified,profile.compatibility_evidence_source
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
  recorder_channels smallint,integrated_poe_ports smallint,drive_bay_count smallint,poe_port_count smallint,storage_capacity_tb numeric,
  max_drive_capacity_tb numeric,compatibility_verified boolean,compatibility_evidence_source text
)
language sql security definer set search_path=public stable as $$
  select profile.profile_key,profile.system_type,profile.label,profile.section_key,profile.unit,profile.version,profile.is_active,
    case when product.id is not null then 'catalog' when service.id is not null then 'service' when external_item.id is not null then 'shared_nomenclature' else 'unresolved' end,
    coalesce(product.id,service.id,external_item.id),
    case when product.id is not null then product.sku||' · '||product.name when service.id is not null then service.name when external_item.id is not null then external_item.name end,
    case when service.id is not null then profile.default_selling_unit_price end,
    case when service.id is not null then profile.default_selling_currency_code end,
    case when service.id is not null then profile.default_selling_vat_mode end,
    profile.recorder_channels,profile.integrated_poe_ports,profile.drive_bay_count,profile.poe_port_count,profile.storage_capacity_tb,
    profile.max_drive_capacity_tb,profile.compatibility_verified,profile.compatibility_evidence_source
  from public.estimate_generator_calculator_profiles profile
  left join public.catalog_products product on product.id=profile.catalog_product_id and product.is_active and product.is_visible
  left join public.partner_services service on service.id=profile.partner_service_id and service.is_active and service.company_id is null and service.default_unit=profile.unit
  left join public.external_nomenclature_items external_item on external_item.id=profile.external_nomenclature_id and external_item.is_active and external_item.canonical_item_id is null
  where profile.is_active and public.has_internal_permission('admin.estimates.view') order by profile.section_key,profile.profile_key;
$$;

alter table public.estimate_generator_sessions
  add column storage_incompatibility_detected boolean not null default false,
  add column insufficient_poe_warning boolean not null default false,
  add column automatic_recorder_profile text null,
  add column compatible_configuration_found boolean null;

create function public.record_estimate_generator_session_v5(
  target_company_id uuid,target_request_key uuid,target_request_fingerprint text,target_requirement_count integer,target_duration_ms integer,
  target_failed boolean,target_generation_mode text,target_structured_facts jsonb,target_resolved_catalog_count integer,target_resolved_service_count integer,
  target_own_nomenclature_count integer,target_shared_nomenclature_count integer,target_unresolved_count integer
) returns uuid language plpgsql security definer set search_path=public as $$
declare session_id uuid; facts jsonb:=coalesce(target_structured_facts,'{}'::jsonb);
begin
  session_id:=public.record_estimate_generator_session_v4(target_company_id,target_request_key,target_request_fingerprint,
    target_requirement_count,target_duration_ms,target_failed,target_generation_mode,target_structured_facts,target_resolved_catalog_count,
    target_resolved_service_count,target_own_nomenclature_count,target_shared_nomenclature_count,target_unresolved_count);
  if target_generation_mode='quick_calculation' and not target_failed then
    if coalesce(facts->>'automaticRecorderProfile','') !~ '^(|cctv\.nvr\.(4|8|16|32))$'
      or coalesce(facts->>'storageIncompatibilityDetected','false') not in ('true','false')
      or coalesce(facts->>'insufficientPoeWarning','false') not in ('true','false')
      or coalesce(facts->>'compatibleConfigurationFound','false') not in ('true','false') then
      raise exception 'Generator compatibility facts are invalid.' using errcode='22023';
    end if;
    update public.estimate_generator_sessions set
      storage_incompatibility_detected=coalesce((facts->>'storageIncompatibilityDetected')::boolean,false),
      insufficient_poe_warning=coalesce((facts->>'insufficientPoeWarning')::boolean,false),
      automatic_recorder_profile=nullif(facts->>'automaticRecorderProfile',''),
      compatible_configuration_found=(facts->>'compatibleConfigurationFound')::boolean
    where id=session_id and estimate_id is null;
  end if;
  return session_id;
end $$;

alter function public.get_estimate_generator_admin_report(integer) rename to get_estimate_generator_admin_report_before_cctv_compatibility;
revoke all on function public.get_estimate_generator_admin_report_before_cctv_compatibility(integer) from public,anon,authenticated;
create function public.get_estimate_generator_admin_report(result_limit integer default 20)
returns jsonb language sql security definer set search_path=public stable as $$
  with base as (select public.get_estimate_generator_admin_report_before_cctv_compatibility(result_limit) report),
  compatibility as (select jsonb_build_object(
    'storageIncompatibilityCount',count(*) filter(where storage_incompatibility_detected),
    'insufficientPoeWarningCount',count(*) filter(where insufficient_poe_warning),
    'compatibleConfigurationCount',count(*) filter(where compatible_configuration_found is true)
  ) data from public.estimate_generator_sessions where generation_mode='quick_calculation')
  select case when base.report is null then null else jsonb_set(base.report,'{summary}',(base.report->'summary')||compatibility.data) end from base,compatibility;
$$;

revoke all on function public.resolve_estimate_generator_calculator_profiles(uuid,text[]),
  public.list_estimate_generator_calculator_profiles(),
  public.record_estimate_generator_session_v5(uuid,uuid,text,integer,integer,boolean,text,jsonb,integer,integer,integer,integer,integer),
  public.get_estimate_generator_admin_report(integer) from public,anon;
grant execute on function public.resolve_estimate_generator_calculator_profiles(uuid,text[]),
  public.record_estimate_generator_session_v5(uuid,uuid,text,integer,integer,boolean,text,jsonb,integer,integer,integer,integer,integer) to authenticated;
grant execute on function public.list_estimate_generator_calculator_profiles(),public.get_estimate_generator_admin_report(integer) to authenticated;
