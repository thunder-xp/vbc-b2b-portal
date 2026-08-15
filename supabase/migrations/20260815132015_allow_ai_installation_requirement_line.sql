alter table public.installation_requirement_lines
  drop constraint installation_requirement_lines_service_type_check;

alter table public.installation_requirement_lines
  add constraint installation_requirement_lines_service_type_check
  check (service_type in (
    'camera_installation',
    'cable_laying',
    'commissioning',
    'remote_configuration',
    'ai_scenario_programming'
  ));
