create table if not exists public.catalog_product_attribute_sync_stage (
  sync_id uuid not null,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  property_ref text not null,
  attribute_key text not null,
  label text not null,
  raw_value jsonb,
  display_value text not null,
  resolved_display_value text,
  resolution_status text not null,
  resolved_value_ref text,
  value_type text,
  is_filterable boolean not null,
  is_visible boolean not null,
  source_updated_at timestamptz,
  updated_at timestamptz not null,
  primary key (sync_id, product_id, property_ref),
  constraint catalog_attribute_stage_resolution_status_check
    check (resolution_status in ('not_required', 'resolved', 'unresolved', 'invalid'))
);

alter table public.catalog_product_attribute_sync_stage enable row level security;
revoke all on public.catalog_product_attribute_sync_stage from anon, authenticated;
grant select, insert, update, delete on public.catalog_product_attribute_sync_stage to service_role;

create or replace function public.publish_catalog_product_attributes(
  p_sync_id uuid,
  p_product_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_published integer := 0;
  v_removed integer := 0;
begin
  insert into public.catalog_product_attributes (
    product_id, property_ref, attribute_key, label, raw_value, display_value,
    resolved_display_value, resolution_status, resolved_value_ref, value_type,
    is_filterable, is_visible, source_updated_at, last_seen_sync_id, updated_at
  )
  select
    product_id, property_ref, attribute_key, label, raw_value, display_value,
    resolved_display_value, resolution_status, resolved_value_ref, value_type,
    is_filterable, is_visible, source_updated_at, p_sync_id, updated_at
  from public.catalog_product_attribute_sync_stage
  where sync_id = p_sync_id
  on conflict (product_id, property_ref) do update set
    attribute_key = excluded.attribute_key,
    label = excluded.label,
    raw_value = excluded.raw_value,
    display_value = excluded.display_value,
    resolved_display_value = excluded.resolved_display_value,
    resolution_status = excluded.resolution_status,
    resolved_value_ref = excluded.resolved_value_ref,
    value_type = excluded.value_type,
    is_filterable = excluded.is_filterable,
    is_visible = excluded.is_visible,
    source_updated_at = excluded.source_updated_at,
    last_seen_sync_id = excluded.last_seen_sync_id,
    updated_at = excluded.updated_at;

  get diagnostics v_published = row_count;

  delete from public.catalog_product_attributes
  where product_id = any(p_product_ids)
    and last_seen_sync_id is distinct from p_sync_id;
  get diagnostics v_removed = row_count;

  delete from public.catalog_product_attribute_sync_stage where sync_id = p_sync_id;

  return jsonb_build_object('published', v_published, 'removed', v_removed);
end;
$$;

revoke all on function public.publish_catalog_product_attributes(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.publish_catalog_product_attributes(uuid, uuid[]) to service_role;

alter table public.catalog_sync_state
  add column if not exists attribute_unique_pairs integer not null default 0,
  add column if not exists attribute_duplicate_pairs integer not null default 0,
  add column if not exists attribute_multivalue_merges integer not null default 0,
  add column if not exists attribute_batches_staged integer not null default 0,
  add column if not exists attribute_rows_published integer not null default 0,
  add column if not exists attribute_publication_transaction_succeeded boolean not null default false,
  add column if not exists database_error_code text,
  add column if not exists database_constraint text,
  add column if not exists failed_batch integer;

comment on table public.catalog_product_attribute_sync_stage is
  'Private transient staging for atomic publication of the 1C-owned catalog attribute read model.';
comment on function public.publish_catalog_product_attributes(uuid, uuid[]) is
  'Publishes one complete staged attribute snapshot and removes stale rows in one transaction.';
