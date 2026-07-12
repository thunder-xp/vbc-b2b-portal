-- Count-only integrity diagnostics for deterministic 1C nomenclature scans.
alter table public.catalog_sync_state
  add column if not exists configured_ordering text not null default 'Ref_Key asc',
  add column if not exists unique_rows_scanned integer not null default 0,
  add column if not exists duplicate_reference_count integer not null default 0,
  add column if not exists eligible_products integer not null default 0,
  add column if not exists excluded_inactive integer not null default 0;

comment on column public.catalog_sync_state.configured_ordering is
  'Non-sensitive ordering used to make paginated 1C scans deterministic.';
