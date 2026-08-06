begin;

alter table public.product_stock_totals
  add column if not exists source_fingerprint text,
  add column if not exists warehouse_scope_version text,
  add column if not exists published_at timestamptz,
  add column if not exists freshness_state text not null default 'unknown'
    check (freshness_state in ('authoritative', 'unknown', 'failed'));

alter table public.product_stock_balances
  add column if not exists source_fingerprint text,
  add column if not exists warehouse_scope_version text,
  add column if not exists published_at timestamptz,
  add column if not exists freshness_state text not null default 'unknown'
    check (freshness_state in ('authoritative', 'unknown', 'failed'));

create table public.stock_reconciliation_runs (
  sync_id uuid primary key,
  snapshot_time timestamptz not null,
  warehouse_scope_version text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  total_products integer not null default 0,
  exact_matches integer not null default 0,
  source_zero_local_positive integer not null default 0,
  source_positive_local_zero integer not null default 0,
  quantity_mismatches integer not null default 0,
  missing_warehouse_mappings integer not null default 0,
  missing_product_mappings integer not null default 0,
  duplicate_source_rows integer not null default 0,
  stale_published_rows integer not null default 0,
  characteristic_conflicts integer not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.stock_reconciliation_products (
  sync_id uuid not null references public.stock_reconciliation_runs(sync_id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  source_physical numeric(14,3) not null,
  source_reserved numeric(14,3) not null,
  source_available numeric(14,3) not null,
  previous_available numeric(14,3),
  published_available numeric(14,3),
  classification text not null check (classification in (
    'exact', 'source_zero_local_positive', 'source_positive_local_zero', 'quantity_mismatch'
  )),
  post_publication_match boolean,
  primary key (sync_id, product_id)
);

create index stock_reconciliation_runs_completed_idx
  on public.stock_reconciliation_runs(completed_at desc)
  where status = 'succeeded';
create index stock_reconciliation_products_mismatch_idx
  on public.stock_reconciliation_products(sync_id, classification, product_id)
  where classification <> 'exact';

alter table public.stock_reconciliation_runs enable row level security;
alter table public.stock_reconciliation_products enable row level security;
revoke all on public.stock_reconciliation_runs, public.stock_reconciliation_products
  from public, anon, authenticated;
grant select, insert, update, delete on public.stock_reconciliation_runs,
  public.stock_reconciliation_products to service_role;

alter function public.publish_exact_stock_snapshot(uuid)
  rename to publish_exact_stock_snapshot_reconciliation_base;

create function public.publish_exact_stock_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  base_result jsonb;
  snapshot timestamptz;
  started_at timestamptz := clock_timestamp();
  scope_version constant text := 'principal_chisinau:v1';
begin
  select state.snapshot_time into snapshot
  from public.stock_sync_state state
  where state.id = 'exact_stock'
    and state.active_sync_id = p_sync_id
    and state.scan_complete;

  if snapshot is null then
    raise exception 'stock reconciliation requires a complete authoritative snapshot';
  end if;

  insert into public.stock_reconciliation_runs(
    sync_id, snapshot_time, warehouse_scope_version, status,
    missing_warehouse_mappings, missing_product_mappings,
    duplicate_source_rows, characteristic_conflicts
  )
  select p_sync_id, snapshot, scope_version, 'running',
    (select count(distinct stage.external_warehouse_ref)::integer
     from public.stock_balance_sync_stage stage
     left join public.stock_warehouse_sync_stage warehouse
       on warehouse.sync_id = p_sync_id
      and warehouse.external_ref = stage.external_warehouse_ref
     where stage.sync_id = p_sync_id and warehouse.external_ref is null),
    (select count(distinct stage.external_product_ref)::integer
     from public.stock_balance_sync_stage stage
     left join public.catalog_products product
       on product.external_1c_id = stage.external_product_ref
     where stage.sync_id = p_sync_id and product.id is null),
    (select greatest(0, count(*) - count(distinct concat_ws('|',
       stage.balance_kind, stage.external_product_ref,
       stage.external_warehouse_ref, stage.external_characteristic_ref
     )))::integer from public.stock_balance_sync_stage stage
     where stage.sync_id = p_sync_id),
    (select count(*)::integer from (
       select product.external_1c_id
       from public.catalog_products product
       where product.external_1c_id is not null
       group by product.external_1c_id having count(*) > 1
     ) duplicate_mapping)
  on conflict (sync_id) do nothing;

  with public_warehouses as (
    select warehouse.external_ref
    from public.stock_warehouses warehouse
    where warehouse.public_included and warehouse.is_active
    union
    select '86197770-0aac-431a-aad6-8e7099029bbb'
  ), staged as (
    select stage.external_product_ref, stage.balance_kind, sum(stage.quantity) as quantity
    from public.stock_balance_sync_stage stage
    join public_warehouses warehouse
      on warehouse.external_ref = stage.external_warehouse_ref
    where stage.sync_id = p_sync_id
      and stage.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
    group by stage.external_product_ref, stage.balance_kind
  ), source as (
    select product.id as product_id,
      coalesce(sum(staged.quantity) filter (where staged.balance_kind = 'physical'), 0) as physical,
      coalesce(sum(staged.quantity) filter (where staged.balance_kind = 'reserved'), 0) as reserved
    from public.catalog_products product
    left join staged on staged.external_product_ref = product.external_1c_id
    where product.is_active and product.is_visible and product.external_1c_id is not null
    group by product.id
  ), compared as (
    select source.product_id, source.physical, source.reserved,
      greatest(0, source.physical - source.reserved) as available,
      case when total.is_published then total.available_quantity end as previous_available
    from source
    left join public.product_stock_totals total on total.product_id = source.product_id
  )
  insert into public.stock_reconciliation_products(
    sync_id, product_id, source_physical, source_reserved, source_available,
    previous_available, classification
  )
  select p_sync_id, compared.product_id, compared.physical, compared.reserved,
    compared.available, compared.previous_available,
    case
      when compared.available = 0 and coalesce(compared.previous_available, 0) > 0
        then 'source_zero_local_positive'
      when compared.available > 0 and coalesce(compared.previous_available, 0) = 0
        then 'source_positive_local_zero'
      when compared.available <> coalesce(compared.previous_available, 0)
        then 'quantity_mismatch'
      else 'exact'
    end
  from compared
  on conflict (sync_id, product_id) do nothing;

  base_result := public.publish_exact_stock_snapshot_reconciliation_base(p_sync_id);

  update public.product_stock_totals total set
    source_fingerprint = md5(concat_ws('|', p_sync_id::text, total.product_id::text,
      total.physical_quantity::text, total.reserved_quantity::text,
      total.available_quantity::text, total.incoming_quantity::text)),
    warehouse_scope_version = scope_version,
    published_at = total.synced_at,
    freshness_state = 'authoritative'
  where total.last_seen_sync_id = p_sync_id and total.is_published;

  update public.product_stock_balances balance set
    source_fingerprint = md5(concat_ws('|', p_sync_id::text, balance.product_id::text,
      balance.warehouse_id::text, balance.external_characteristic_ref,
      balance.physical_quantity::text, balance.reserved_quantity::text,
      balance.available_quantity::text, balance.incoming_quantity::text)),
    warehouse_scope_version = scope_version,
    published_at = balance.synced_at,
    freshness_state = 'authoritative'
  where balance.last_seen_sync_id = p_sync_id and balance.is_published;

  update public.stock_reconciliation_products item set
    published_available = case when total.is_published then total.available_quantity end,
    post_publication_match = item.source_available = coalesce(
      case when total.is_published then total.available_quantity end, 0
    )
  from public.product_stock_totals total
  where item.sync_id = p_sync_id and total.product_id = item.product_id;

  update public.stock_reconciliation_products item set
    published_available = null,
    post_publication_match = item.source_available = 0
  where item.sync_id = p_sync_id and item.post_publication_match is null;

  update public.stock_reconciliation_runs run set
    status = 'succeeded',
    total_products = summary.total,
    exact_matches = summary.post_matches,
    source_zero_local_positive = summary.zero_positive,
    source_positive_local_zero = summary.positive_zero,
    quantity_mismatches = summary.quantity_mismatch,
    stale_published_rows = summary.zero_positive,
    duration_ms = greatest(0, extract(milliseconds from clock_timestamp() - started_at)::integer),
    completed_at = clock_timestamp()
  from (
    select count(*)::integer as total,
      count(*) filter (where post_publication_match)::integer as post_matches,
      count(*) filter (where classification = 'source_zero_local_positive')::integer as zero_positive,
      count(*) filter (where classification = 'source_positive_local_zero')::integer as positive_zero,
      count(*) filter (where classification = 'quantity_mismatch')::integer as quantity_mismatch
    from public.stock_reconciliation_products
    where sync_id = p_sync_id
  ) summary
  where run.sync_id = p_sync_id;

  delete from public.stock_reconciliation_products item
  using public.stock_reconciliation_runs run
  where item.sync_id = run.sync_id and run.created_at < now() - interval '35 days';
  delete from public.stock_reconciliation_runs run
  where run.created_at < now() - interval '35 days';

  return base_result || jsonb_build_object('reconciliation_sync_id', p_sync_id);
end;
$$;

revoke all on function public.publish_exact_stock_snapshot_reconciliation_base(uuid),
  public.publish_exact_stock_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.publish_exact_stock_snapshot_reconciliation_base(uuid),
  public.publish_exact_stock_snapshot(uuid) to service_role;

create function public.get_admin_stock_reconciliation(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('admin.stock.view') then
    raise exception 'Stock reconciliation diagnostics are not allowed.' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid reconciliation limit.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'latest', case when run.sync_id is null then null else jsonb_build_object(
      'syncId', run.sync_id, 'snapshotTime', run.snapshot_time,
      'warehouseScopeVersion', run.warehouse_scope_version, 'status', run.status,
      'totalProducts', run.total_products, 'exactMatches', run.exact_matches,
      'sourceZeroLocalPositive', run.source_zero_local_positive,
      'sourcePositiveLocalZero', run.source_positive_local_zero,
      'quantityMismatches', run.quantity_mismatches,
      'missingWarehouseMappings', run.missing_warehouse_mappings,
      'missingProductMappings', run.missing_product_mappings,
      'duplicateSourceRows', run.duplicate_source_rows,
      'stalePublishedRows', run.stale_published_rows,
      'characteristicConflicts', run.characteristic_conflicts,
      'durationMs', run.duration_ms, 'completedAt', run.completed_at
    ) end,
    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', item.product_id, 'sku', product.sku, 'name', product.name,
        'previousAvailable', item.previous_available,
        'sourceAvailable', item.source_available,
        'publishedAvailable', item.published_available,
        'classification', item.classification,
        'postPublicationMatch', item.post_publication_match
      ) order by abs(item.source_available - coalesce(item.previous_available, 0)) desc, product.sku)
      from (
        select value.* from public.stock_reconciliation_products value
        where value.sync_id = run.sync_id and value.classification <> 'exact'
        order by abs(value.source_available - coalesce(value.previous_available, 0)) desc
        limit p_limit
      ) item
      join public.catalog_products product on product.id = item.product_id
    ), '[]'::jsonb)
  ) into result
  from (
    select value.* from public.stock_reconciliation_runs value
    where value.status = 'succeeded'
    order by value.completed_at desc limit 1
  ) run;

  return coalesce(result, jsonb_build_object('latest', null, 'changes', '[]'::jsonb));
end;
$$;

revoke all on function public.get_admin_stock_reconciliation(integer)
  from public, anon;
grant execute on function public.get_admin_stock_reconciliation(integer)
  to authenticated;

comment on function public.publish_exact_stock_snapshot(uuid) is
  'Publishes the complete authoritative 1C stock snapshot and atomically records bounded reconciliation evidence.';
comment on function public.get_admin_stock_reconciliation(integer) is
  'Returns bounded internal stock reconciliation diagnostics without live 1C access.';

commit;
