-- Safe, count-only diagnostics for daily nomenclature subtree resolution.
alter table public.catalog_sync_state
  add column if not exists total_rows_scanned integer not null default 0,
  add column if not exists folder_rows_scanned integer not null default 0,
  add column if not exists product_rows_scanned integer not null default 0,
  add column if not exists valid_parent_references integer not null default 0,
  add column if not exists rows_with_parent_equal_root integer not null default 0,
  add column if not exists direct_child_folders integer not null default 0,
  add column if not exists direct_child_products integer not null default 0,
  add column if not exists descendant_folders_resolved integer not null default 0,
  add column if not exists descendant_products_resolved integer not null default 0,
  add column if not exists excluded_deleted integer not null default 0,
  add column if not exists excluded_invalid_guid integer not null default 0,
  add column if not exists excluded_service integer not null default 0,
  add column if not exists excluded_set integer not null default 0,
  add column if not exists excluded_empty_name integer not null default 0,
  add column if not exists excluded_outside_subtree integer not null default 0,
  add column if not exists accounting_type_counts jsonb not null default '{}'::jsonb,
  add column if not exists set_value_counts jsonb not null default '{"true":0,"false":0,"missing":0}'::jsonb,
  add column if not exists scan_page_size integer not null default 0,
  add column if not exists last_page_row_count integer not null default 0,
  add column if not exists scan_complete boolean not null default false;

comment on column public.catalog_sync_state.accounting_type_counts is
  'Count-only safe enum diagnostics. Must not contain product names or references.';
