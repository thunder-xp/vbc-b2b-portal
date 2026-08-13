-- Repair labels corrupted by the initial deployment transport without changing governed configuration.
update public.cctv_service_definitions definition
set label_ru = convert_from(decode(label.hex_ru, 'hex'), 'UTF8'),
    label_ro = convert_from(decode(label.hex_ro, 'hex'), 'UTF8')
from (values
  ('cable_routing_class_1','d09fd180d0bed0bad0bbd0b0d0b4d0bad0b020d0bad0b0d0b1d0b5d0bbd18f20c2b720d0bad0bbd0b0d181d1812049','506f7a617265206361626c7520c2b720636c6173612049'),
  ('cable_routing_class_2','d09fd180d0bed0bad0bbd0b0d0b4d0bad0b020d0bad0b0d0b1d0b5d0bbd18f20c2b720d0bad0bbd0b0d181d181204949','506f7a617265206361626c7520c2b720636c617361204949'),
  ('cable_routing_class_3','d09fd180d0bed0bad0bbd0b0d0b4d0bad0b020d0bad0b0d0b1d0b5d0bbd18f20c2b720d0bad0bbd0b0d181d18120494949','506f7a617265206361626c7520c2b720636c61736120494949'),
  ('equipment_installation_class_1','d09cd0bed0bdd182d0b0d0b620d0bed0b1d0bed180d183d0b4d0bed0b2d0b0d0bdd0b8d18f20c2b720d0bad0bbd0b0d181d1812049','496e7374616c617265206563686970616d656e7420c2b720636c6173612049'),
  ('equipment_installation_class_2','d09cd0bed0bdd182d0b0d0b620d0bed0b1d0bed180d183d0b4d0bed0b2d0b0d0bdd0b8d18f20c2b720d0bad0bbd0b0d181d181204949','496e7374616c617265206563686970616d656e7420c2b720636c617361204949'),
  ('equipment_installation_class_3','d09cd0bed0bdd182d0b0d0b620d0bed0b1d0bed180d183d0b4d0bed0b2d0b0d0bdd0b8d18f20c2b720d0bad0bbd0b0d181d18120494949','496e7374616c617265206563686970616d656e7420c2b720636c61736120494949'),
  ('commissioning','d09fd183d181d0bad0bed0bdd0b0d0bbd0b0d0b4d0bed187d0bdd18bd0b520d180d0b0d0b1d0bed182d18b','50756e65726520c3ae6e2066756e63c89b69756e65'),
  ('remote_viewing_configuration','d09dd0b0d181d182d180d0bed0b9d0bad0b020d183d0b4d0b0d0bbd191d0bdd0bdd0bed0b3d0be20d0bfd180d0bed181d0bcd0bed182d180d0b0','436f6e66696775726172652076697a75616c697a617265206c612064697374616ec89bc483'),
  ('ai_scenario_programming','d09fd180d0bed0b3d180d0b0d0bcd0bcd0b8d180d0bed0b2d0b0d0bdd0b8d0b52041492dd181d186d0b5d0bdd0b0d180d0b8d18f','50726f6772616d617265207363656e61726975204149')
) label(code, hex_ru, hex_ro)
where definition.code = label.code;

do $$
begin
  if (select count(*) from public.cctv_service_definitions
      where label_ru ~ '[РџРњРќРџ]' or label_ro like '%Р%') > 0 then
    raise exception 'CCTV service label repair is incomplete.';
  end if;
end;
$$;
