alter table public.external_nomenclature_items
  drop constraint if exists external_nomenclature_canonical_cover_shape_check,
  add constraint external_nomenclature_canonical_cover_shape_check check (
    canonical_cover_storage_key is null
    or (canonical_cover_storage_key ~ '^canonical/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
      and canonical_cover_size_bytes between 1 and 262144
      and canonical_cover_width between 1 and 512
      and canonical_cover_height between 1 and 512)
  );

alter table public.partner_external_nomenclature_library
  drop constraint if exists partner_external_nomenclature_cover_shape_check,
  add constraint partner_external_nomenclature_cover_shape_check check (
    cover_storage_key is null
    or (cover_storage_key ~ '^partner/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
      and cover_size_bytes between 1 and 262144
      and cover_width between 1 and 512
      and cover_height between 1 and 512)
  );
