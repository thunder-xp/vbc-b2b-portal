-- Daily 1C nomenclature sync metadata for the existing catalog read model.
-- 1C remains source of truth. No price, stock, reserve, image, document, or
-- portal visibility fields are added or owned by this sync.

alter table public.catalog_categories
  add column if not exists external_parent_1c_id text null,
  add column if not exists source_version text null,
  add column if not exists source_modified_at timestamptz null,
  add column if not exists source_root_1c_id text null,
  add column if not exists last_seen_sync_id uuid null;

alter table public.catalog_products
  add column if not exists external_parent_1c_id text null,
  add column if not exists source_version text null,
  add column if not exists source_modified_at timestamptz null,
  add column if not exists source_root_1c_id text null,
  add column if not exists last_seen_sync_id uuid null;

create index if not exists catalog_categories_external_parent_1c_id_idx
  on public.catalog_categories(external_parent_1c_id);
create index if not exists catalog_products_external_parent_1c_id_idx
  on public.catalog_products(external_parent_1c_id);
create index if not exists catalog_categories_last_seen_sync_id_idx
  on public.catalog_categories(last_seen_sync_id);
create index if not exists catalog_products_last_seen_sync_id_idx
  on public.catalog_products(last_seen_sync_id);
create index if not exists catalog_categories_source_root_1c_id_idx on public.catalog_categories(source_root_1c_id);
create index if not exists catalog_products_source_root_1c_id_idx on public.catalog_products(source_root_1c_id);

create table if not exists public.catalog_sync_state (
  id text primary key default 'daily_catalog',
  root_external_1c_id text null,
  root_name text null,
  status text not null default 'never_run',
  last_started_at timestamptz null,
  last_finished_at timestamptz null,
  last_successful_sync_at timestamptz null,
  duration_ms integer null,
  pages_processed integer not null default 0,
  folders_received integer not null default 0,
  products_received integer not null default 0,
  folders_upserted integer not null default 0,
  products_upserted integer not null default 0,
  rows_deactivated integer not null default 0,
  error_category text null,
  active_sync_id uuid null,
  lock_acquired_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint catalog_sync_state_singleton_check check (id = 'daily_catalog'),
  constraint catalog_sync_state_status_check check (status in ('never_run', 'running', 'succeeded', 'failed'))
);

alter table public.catalog_sync_state enable row level security;
revoke all on table public.catalog_sync_state from anon, authenticated;

insert into public.catalog_sync_state (id)
values ('daily_catalog')
on conflict (id) do nothing;

comment on table public.catalog_sync_state is
  'Server-only status and overlap lock for the daily SECURITYPARK DISTRIBUTION catalog sync.';

create or replace function public.finalize_catalog_sync_deactivation(
  p_root_external_1c_id text,
  p_sync_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  row_count integer := 0;
begin
  update public.catalog_products
  set is_active = false, updated_at = now()
  where source_root_1c_id = p_root_external_1c_id
    and last_seen_sync_id is distinct from p_sync_id
    and is_active = true;
  get diagnostics row_count = row_count;
  affected := affected + row_count;

  update public.catalog_categories
  set is_active = false, updated_at = now()
  where source_root_1c_id = p_root_external_1c_id
    and last_seen_sync_id is distinct from p_sync_id
    and is_active = true;
  get diagnostics row_count = row_count;
  affected := affected + row_count;
  return affected;
end;
$$;

revoke all on function public.finalize_catalog_sync_deactivation(text, uuid) from public, anon, authenticated;
grant execute on function public.finalize_catalog_sync_deactivation(text, uuid) to service_role;
