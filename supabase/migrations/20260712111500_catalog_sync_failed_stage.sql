-- Adds safe failed-stage diagnostics to an already deployed daily catalog sync state.
alter table public.catalog_sync_state
  add column if not exists failed_stage text null;

comment on column public.catalog_sync_state.failed_stage is
  'Safe synchronization stage name only. Must not contain URLs, credentials, GUIDs, or payload data.';
