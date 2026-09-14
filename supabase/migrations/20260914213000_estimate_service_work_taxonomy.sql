-- Stable estimate placement for governed work services. Unclassified legacy
-- services intentionally remain null and therefore fail closed in work pickers.
alter table public.partner_services
  add column if not exists estimate_work_section_key text null;

alter table public.partner_services
  drop constraint if exists partner_services_estimate_work_section_key_check;
alter table public.partner_services
  add constraint partner_services_estimate_work_section_key_check
  check (estimate_work_section_key is null or estimate_work_section_key in ('installation_works', 'commissioning_works'));

update public.partner_services service
set estimate_work_section_key = case
  when exists (
    select 1 from public.cctv_service_definitions definition
    where definition.partner_service_id = service.id
      and definition.active
      and definition.family in ('commissioning', 'remote_viewing_configuration', 'ai_scenario_programming')
  ) or exists (
    select 1 from public.estimate_generator_calculator_profiles profile
    where profile.partner_service_id = service.id
      and profile.is_active
      and profile.section_key = 'commissioning_works'
  ) then 'commissioning_works'
  when exists (
    select 1 from public.cctv_service_definitions definition
    where definition.partner_service_id = service.id
      and definition.active
      and definition.family in ('equipment_installation', 'cable_routing')
  ) or exists (
    select 1 from public.estimate_generator_calculator_profiles profile
    where profile.partner_service_id = service.id
      and profile.is_active
      and profile.section_key = 'installation_works'
  ) then 'installation_works'
  else null
end;

comment on column public.partner_services.estimate_work_section_key is
  'Governed estimate work-section placement. Null means unsupported/unclassified and fails closed.';
