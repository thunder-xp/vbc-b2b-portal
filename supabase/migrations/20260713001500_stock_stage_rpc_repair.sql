create table public.stock_balance_stage_receipts (
  sync_id uuid not null,
  balance_kind text not null check (balance_kind in ('physical', 'reserved', 'incoming')),
  source_page integer not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  primary key (sync_id, balance_kind, source_page)
);

alter table public.stock_balance_stage_receipts enable row level security;
revoke all on public.stock_balance_stage_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.stock_balance_stage_receipts to service_role;

create function public.stage_stock_balance_rows(
  p_sync_id uuid,
  p_kind text,
  p_source_page integer,
  p_rows jsonb
) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_hash text := md5(p_rows::text);
  v_existing_hash text;
  v_claimed boolean := false;
  v_count integer;
begin
  insert into public.stock_balance_stage_receipts (
    sync_id, balance_kind, source_page, payload_hash
  ) values (p_sync_id, p_kind, p_source_page, v_hash)
  on conflict (sync_id, balance_kind, source_page) do nothing
  returning true into v_claimed;

  if not coalesce(v_claimed, false) then
    select payload_hash into v_existing_hash
    from public.stock_balance_stage_receipts
    where sync_id = p_sync_id
      and balance_kind = p_kind
      and source_page = p_source_page;

    if v_existing_hash is distinct from v_hash then
      raise exception 'stock stage page payload changed after acceptance';
    end if;

    return 0;
  end if;

  with source as (
    select row.external_product_ref,
      row.external_warehouse_ref,
      row.external_characteristic_ref,
      row.quantity
    from jsonb_to_recordset(p_rows) row(
      external_product_ref text,
      external_warehouse_ref text,
      external_characteristic_ref text,
      quantity numeric
    )
  ), aggregated as (
    select external_product_ref,
      external_warehouse_ref,
      external_characteristic_ref,
      sum(quantity) quantity
    from source
    group by external_product_ref,
      external_warehouse_ref,
      external_characteristic_ref
  )
  insert into public.stock_balance_sync_stage as current (
    sync_id, balance_kind, external_product_ref,
    external_warehouse_ref, external_characteristic_ref, quantity
  )
  select p_sync_id, p_kind, external_product_ref,
    external_warehouse_ref, external_characteristic_ref, quantity
  from aggregated
  on conflict (
    sync_id, balance_kind, external_product_ref,
    external_warehouse_ref, external_characteristic_ref
  ) do update set quantity = current.quantity + excluded.quantity;

  get diagnostics v_count = row_count;
  return v_count;
exception when others then
  delete from public.stock_balance_stage_receipts
  where sync_id = p_sync_id
    and balance_kind = p_kind
    and source_page = p_source_page
    and payload_hash = v_hash;
  raise;
end $$;

alter function public.publish_exact_stock_snapshot(uuid)
  rename to publish_exact_stock_snapshot_with_supplier_base;

create function public.publish_exact_stock_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_result jsonb;
begin
  v_result := public.publish_exact_stock_snapshot_with_supplier_base(p_sync_id);
  delete from public.stock_balance_stage_receipts where sync_id = p_sync_id;
  return v_result;
end $$;

revoke all on function public.stage_stock_balance_rows(uuid, text, integer, jsonb),
  public.publish_exact_stock_snapshot_with_supplier_base(uuid),
  public.publish_exact_stock_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.stage_stock_balance_rows(uuid, text, integer, jsonb),
  public.publish_exact_stock_snapshot_with_supplier_base(uuid),
  public.publish_exact_stock_snapshot(uuid) to service_role;
