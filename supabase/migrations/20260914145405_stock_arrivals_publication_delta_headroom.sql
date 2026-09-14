begin;

alter table public.stock_sync_state
  add column if not exists stock_staged_rows integer not null default 0,
  add column if not exists arrivals_staged_rows integer not null default 0,
  add column if not exists stock_delta_unchanged integer not null default 0,
  add column if not exists stock_delta_inserted integer not null default 0,
  add column if not exists stock_delta_updated integer not null default 0,
  add column if not exists stock_delta_removed integer not null default 0,
  add column if not exists stock_total_delta_unchanged integer not null default 0,
  add column if not exists stock_total_delta_inserted integer not null default 0,
  add column if not exists stock_total_delta_updated integer not null default 0,
  add column if not exists stock_total_delta_removed integer not null default 0,
  add column if not exists arrivals_delta_unchanged integer not null default 0,
  add column if not exists arrivals_delta_inserted integer not null default 0,
  add column if not exists arrivals_delta_updated integer not null default 0,
  add column if not exists arrivals_delta_removed integer not null default 0,
  add column if not exists publication_db_ms integer,
  add column if not exists publication_application_ms integer,
  add column if not exists publication_timeout_budget_ms integer not null default 8000,
  add column if not exists publication_headroom_percent numeric(6,2),
  add column if not exists publication_lock_wait_ms integer,
  add column if not exists publication_trigger_rows integer not null default 0,
  add column if not exists publication_started_at timestamptz,
  add column if not exists last_completed_sync_id uuid;

comment on column public.stock_sync_state.stock_staged_rows is
  'Exact normalized stock stage row count captured before publication.';
comment on column public.stock_sync_state.arrivals_staged_rows is
  'Positive normalized supplier-arrival stage row count captured before publication.';
comment on column public.stock_sync_state.publication_trigger_rows is
  'Rows whose real stock/arrival projection mutation can invoke downstream triggers; unchanged rows are excluded.';

create or replace function public.prepare_exact_stock_publication(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_snapshot_date date;
  v_stock_staged integer := 0;
  v_arrivals_staged integer := 0;
  v_stock_unchanged integer := 0;
  v_stock_inserted integer := 0;
  v_stock_updated integer := 0;
  v_stock_removed integer := 0;
  v_arrivals_unchanged integer := 0;
  v_arrivals_inserted integer := 0;
  v_arrivals_updated integer := 0;
  v_arrivals_removed integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Stock publication preparation is server-only.'
      using errcode = '42501';
  end if;

  select state.snapshot_time::date
  into v_snapshot_date
  from public.stock_sync_state state
  where state.id = 'exact_stock'
    and state.active_sync_id = p_sync_id
    and state.scan_complete;

  if v_snapshot_date is null then
    raise exception 'stock sync incomplete' using errcode = '55000';
  end if;

  select count(*)::integer into v_stock_staged
  from public.stock_balance_sync_stage stage
  where stage.sync_id = p_sync_id;

  select count(*)::integer into v_arrivals_staged
  from public.supplier_arrival_balance_stage stage
  where stage.sync_id = p_sync_id and stage.remaining_quantity > 0;

  with desired as (
    select product.id as product_id, warehouse.id as warehouse_id,
      stage.external_characteristic_ref,
      coalesce(max(stage.quantity) filter (
        where stage.balance_kind = 'physical'), 0) as physical_quantity,
      coalesce(max(stage.quantity) filter (
        where stage.balance_kind = 'reserved'), 0) as reserved_quantity,
      coalesce(max(stage.quantity) filter (
        where stage.balance_kind = 'incoming'), 0) as incoming_quantity
    from public.stock_balance_sync_stage stage
    join public.catalog_products product
      on product.external_1c_id = stage.external_product_ref
    join public.stock_warehouses warehouse
      on warehouse.external_ref = stage.external_warehouse_ref
    where stage.sync_id = p_sync_id
    group by product.id, warehouse.id, stage.external_characteristic_ref
  ), classified as (
    select case
      when current.id is null then 'insert'
      when desired.product_id is null then 'remove'
      when row(
        current.physical_quantity, current.reserved_quantity,
        current.available_quantity, current.incoming_quantity,
        current.is_active, current.is_published
      ) is distinct from row(
        desired.physical_quantity, desired.reserved_quantity,
        greatest(0, desired.physical_quantity - desired.reserved_quantity),
        desired.incoming_quantity, true, true
      ) then 'update'
      else 'unchanged'
    end as delta_kind
    from desired
    full join public.product_stock_balances current
      on current.product_id = desired.product_id
     and current.warehouse_id = desired.warehouse_id
     and current.external_characteristic_ref =
       desired.external_characteristic_ref
    where desired.product_id is not null
       or (current.warehouse_id is not null
         and (current.is_active or current.is_published))
  )
  select
    count(*) filter (where delta_kind = 'unchanged')::integer,
    count(*) filter (where delta_kind = 'insert')::integer,
    count(*) filter (where delta_kind = 'update')::integer,
    count(*) filter (where delta_kind = 'remove')::integer
  into v_stock_unchanged, v_stock_inserted, v_stock_updated, v_stock_removed
  from classified;

  with balances as (
    select stage.external_supplier_order_ref,
      stage.external_product_ref, stage.external_characteristic_ref,
      sum(stage.remaining_quantity) as remaining_quantity
    from public.supplier_arrival_balance_stage stage
    where stage.sync_id = p_sync_id
    group by stage.external_supplier_order_ref,
      stage.external_product_ref, stage.external_characteristic_ref
    having sum(stage.remaining_quantity) > 0
  ), desired as (
    select product.id as product_id, balances.external_characteristic_ref,
      document.expected_arrival_date,
      sum(balances.remaining_quantity) as expected_quantity
    from balances
    join public.supplier_order_document_stage document
      on document.sync_id = p_sync_id
     and document.external_supplier_order_ref =
       balances.external_supplier_order_ref
    join public.catalog_products product
      on product.external_1c_id = balances.external_product_ref
    where document.is_posted and not document.is_deleted
      and not document.is_closed
      and document.external_state_ref =
        '02166cc3-bf4b-11e9-a7fe-000c2988d323'
      and document.expected_arrival_date is not null
      and document.expected_arrival_date >= v_snapshot_date
      and document.date_placement = 'ВШапке'
    group by product.id, balances.external_characteristic_ref,
      document.expected_arrival_date
  ), classified as (
    select case
      when current.product_id is null then 'insert'
      when desired.product_id is null then 'remove'
      when row(current.expected_quantity, current.is_published)
        is distinct from row(desired.expected_quantity, true) then 'update'
      else 'unchanged'
    end as delta_kind
    from desired
    full join public.product_supplier_arrivals current
      using (product_id, external_characteristic_ref, expected_arrival_date)
    where desired.product_id is not null or current.is_published
  )
  select
    count(*) filter (where delta_kind = 'unchanged')::integer,
    count(*) filter (where delta_kind = 'insert')::integer,
    count(*) filter (where delta_kind = 'update')::integer,
    count(*) filter (where delta_kind = 'remove')::integer
  into v_arrivals_unchanged, v_arrivals_inserted,
    v_arrivals_updated, v_arrivals_removed
  from classified;

  update public.stock_sync_state state set
    stock_staged_rows = v_stock_staged,
    arrivals_staged_rows = v_arrivals_staged,
    stock_delta_unchanged = v_stock_unchanged,
    stock_delta_inserted = v_stock_inserted,
    stock_delta_updated = v_stock_updated,
    stock_delta_removed = v_stock_removed,
    arrivals_delta_unchanged = v_arrivals_unchanged,
    arrivals_delta_inserted = v_arrivals_inserted,
    arrivals_delta_updated = v_arrivals_updated,
    arrivals_delta_removed = v_arrivals_removed,
    publication_started_at = clock_timestamp(),
    publication_db_ms = null,
    publication_application_ms = null,
    publication_headroom_percent = null,
    publication_lock_wait_ms = null,
    publication_trigger_rows = 0,
    updated_at = now()
  where state.id = 'exact_stock' and state.active_sync_id = p_sync_id;

  return jsonb_build_object(
    'stock_staged', v_stock_staged,
    'arrivals_staged', v_arrivals_staged,
    'stock', jsonb_build_object(
      'unchanged', v_stock_unchanged, 'inserted', v_stock_inserted,
      'updated', v_stock_updated, 'removed', v_stock_removed
    ),
    'arrivals', jsonb_build_object(
      'unchanged', v_arrivals_unchanged, 'inserted', v_arrivals_inserted,
      'updated', v_arrivals_updated, 'removed', v_arrivals_removed
    )
  );
end;
$$;

create or replace function public.publish_exact_stock_snapshot_warehouse_arrival_base(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_base_result jsonb;
  v_snapshot timestamptz;
  v_started_at timestamptz := clock_timestamp();
  v_total integer := 0;
  v_post_matches integer := 0;
  v_zero_positive integer := 0;
  v_positive_zero integer := 0;
  v_quantity_mismatch integer := 0;
  v_scope_version constant text := 'principal_chisinau:v1';
begin
  select state.snapshot_time into v_snapshot
  from public.stock_sync_state state
  where state.id = 'exact_stock'
    and state.active_sync_id = p_sync_id
    and state.scan_complete;
  if v_snapshot is null then
    raise exception
      'stock reconciliation requires a complete authoritative snapshot'
      using errcode = '55000';
  end if;

  create temporary table stock_publication_reconciliation
  on commit drop as
  with public_warehouses as (
    select warehouse.external_ref
    from public.stock_warehouses warehouse
    where warehouse.public_included and warehouse.is_active
    union
    select '86197770-0aac-431a-aad6-8e7099029bbb'
  ), staged as (
    select stage.external_product_ref, stage.balance_kind,
      sum(stage.quantity) as quantity
    from public.stock_balance_sync_stage stage
    join public_warehouses warehouse
      on warehouse.external_ref = stage.external_warehouse_ref
    where stage.sync_id = p_sync_id
      and stage.external_characteristic_ref =
        '00000000-0000-0000-0000-000000000000'
    group by stage.external_product_ref, stage.balance_kind
  ), source as (
    select product.id as product_id,
      coalesce(sum(staged.quantity) filter (
        where staged.balance_kind = 'physical'), 0) as source_physical,
      coalesce(sum(staged.quantity) filter (
        where staged.balance_kind = 'reserved'), 0) as source_reserved
    from public.catalog_products product
    left join staged on staged.external_product_ref =
      product.external_1c_id
    where product.is_active and product.is_visible
      and product.external_1c_id is not null
    group by product.id
  )
  select source.product_id, source.source_physical,
    source.source_reserved,
    greatest(0, source.source_physical - source.source_reserved)
      as source_available,
    case when total.is_published then total.available_quantity end
      as previous_available,
    case
      when greatest(0, source.source_physical - source.source_reserved) = 0
        and coalesce(case when total.is_published
          then total.available_quantity end, 0) > 0
        then 'source_zero_local_positive'
      when greatest(0, source.source_physical - source.source_reserved) > 0
        and coalesce(case when total.is_published
          then total.available_quantity end, 0) = 0
        then 'source_positive_local_zero'
      when greatest(0, source.source_physical - source.source_reserved)
        <> coalesce(case when total.is_published
          then total.available_quantity end, 0)
        then 'quantity_mismatch'
      else 'exact'
    end as classification
  from source
  left join public.product_stock_totals total
    on total.product_id = source.product_id;

  select count(*)::integer,
    count(*) filter (
      where classification = 'source_zero_local_positive')::integer,
    count(*) filter (
      where classification = 'source_positive_local_zero')::integer,
    count(*) filter (
      where classification = 'quantity_mismatch')::integer
  into v_total, v_zero_positive, v_positive_zero, v_quantity_mismatch
  from stock_publication_reconciliation;

  insert into public.stock_reconciliation_runs(
    sync_id, snapshot_time, warehouse_scope_version, status,
    total_products, source_zero_local_positive,
    source_positive_local_zero, quantity_mismatches,
    missing_warehouse_mappings, missing_product_mappings,
    duplicate_source_rows, characteristic_conflicts
  )
  select p_sync_id, v_snapshot, v_scope_version, 'running',
    v_total, v_zero_positive, v_positive_zero, v_quantity_mismatch,
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
      stage.external_warehouse_ref,
      stage.external_characteristic_ref)))::integer
      from public.stock_balance_sync_stage stage
      where stage.sync_id = p_sync_id),
    (select count(*)::integer from (
      select product.external_1c_id
      from public.catalog_products product
      where product.external_1c_id is not null
      group by product.external_1c_id having count(*) > 1
    ) duplicate_mapping)
  on conflict (sync_id) do nothing;

  v_base_result :=
    public.publish_exact_stock_snapshot_reconciliation_base(p_sync_id);

  insert into public.stock_reconciliation_products(
    sync_id, product_id, source_physical, source_reserved,
    source_available, previous_available, published_available,
    classification, post_publication_match
  )
  select p_sync_id, delta.product_id, delta.source_physical,
    delta.source_reserved, delta.source_available,
    delta.previous_available,
    case when total.is_published then total.available_quantity end,
    delta.classification,
    delta.source_available = coalesce(case when total.is_published
      then total.available_quantity end, 0)
  from stock_publication_reconciliation delta
  left join public.product_stock_totals total
    on total.product_id = delta.product_id
  where delta.classification <> 'exact'
  on conflict (sync_id, product_id) do nothing;

  select count(*) filter (where delta.source_available =
    coalesce(case when total.is_published
      then total.available_quantity end, 0))::integer
  into v_post_matches
  from stock_publication_reconciliation delta
  left join public.product_stock_totals total
    on total.product_id = delta.product_id;

  update public.stock_reconciliation_runs run set
    status = 'succeeded',
    exact_matches = v_post_matches,
    stale_published_rows = v_zero_positive,
    duration_ms = greatest(0, extract(milliseconds from
      clock_timestamp() - v_started_at)::integer),
    completed_at = clock_timestamp()
  where run.sync_id = p_sync_id;

  delete from public.stock_reconciliation_products item
  using public.stock_reconciliation_runs run
  where item.sync_id = run.sync_id
    and run.created_at < now() - interval '35 days';
  delete from public.stock_reconciliation_runs run
  where run.created_at < now() - interval '35 days';

  return v_base_result || jsonb_build_object(
    'reconciliation_sync_id', p_sync_id
  );
end;
$$;

-- Supplier order source lines are typically identical between runs. The
-- historical arrival wrapper nevertheless rewrites every source document and
-- line before entering the stock publisher. Keep that wrapper as the
-- correctness path for any source delta, and use a bounded fast path only when
-- the staged document/line payload is provably identical.
alter function public.publish_exact_stock_snapshot_current_replenishment_base(uuid)
  rename to publish_exact_stock_snapshot_current_replenishment_legacy_base;

create function public.publish_exact_stock_snapshot_current_replenishment_base(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_snapshot timestamptz;
  v_has_source_delta boolean := false;
  v_result jsonb;
begin
  select state.snapshot_time into v_snapshot
  from public.stock_sync_state state
  where state.id = 'exact_stock'
    and state.active_sync_id = p_sync_id
    and state.scan_complete;
  if v_snapshot is null then
    raise exception
      'Warehouse arrival detection requires a complete stock snapshot.'
      using errcode = '55000';
  end if;

  select exists (
    select 1
    from public.supplier_order_document_stage stage
    left join public.supplier_order_source_states current
      on current.source_order_ref = stage.external_supplier_order_ref
    where stage.sync_id = p_sync_id
      and (
        current.source_order_ref is null
        or row(
          current.source_order_number, current.source_document_date,
          current.current_state_ref, current.is_posted, current.is_deleted,
          current.is_closed, current.expected_arrival_date,
          current.organization_ref, current.warehouse_ref,
          current.source_version
        ) is distinct from row(
          coalesce(stage.source_order_number, ''),
          stage.source_document_date, stage.external_state_ref,
          stage.is_posted, stage.is_deleted, stage.is_closed,
          stage.expected_arrival_date, stage.organization_ref,
          stage.warehouse_ref, stage.source_version
        )
      )
  ) or exists (
    select 1
    from public.supplier_order_item_stage stage
    left join public.supplier_order_source_items current
      on current.source_order_ref = stage.external_supplier_order_ref
     and current.line_number = stage.line_number
    where stage.sync_id = p_sync_id
      and (
        current.source_order_ref is null
        or row(
          current.external_product_ref,
          current.external_characteristic_ref,
          current.ordered_quantity, current.unit,
          current.expected_arrival_date
        ) is distinct from row(
          stage.external_product_ref,
          stage.external_characteristic_ref,
          stage.ordered_quantity, stage.unit,
          stage.expected_arrival_date
        )
      )
  ) or exists (
    select 1
    from public.supplier_order_source_items current
    join public.supplier_order_document_stage document
      on document.sync_id = p_sync_id
     and document.external_supplier_order_ref = current.source_order_ref
    left join public.supplier_order_item_stage stage
      on stage.sync_id = p_sync_id
     and stage.external_supplier_order_ref = current.source_order_ref
     and stage.line_number = current.line_number
    where stage.external_supplier_order_ref is null
  ) into v_has_source_delta;

  if v_has_source_delta then
    return public.publish_exact_stock_snapshot_current_replenishment_legacy_base(
      p_sync_id
    );
  end if;

  -- Document freshness is the governed arrival recency signal. Source-line
  -- contents remain immutable when equal, so unchanged lines are not rewritten
  -- merely to rotate their sync identifier.
  update public.supplier_order_source_states current set
    last_seen_sync_id = p_sync_id,
    last_seen_at = v_snapshot
  from public.supplier_order_document_stage stage
  where stage.sync_id = p_sync_id
    and current.source_order_ref = stage.external_supplier_order_ref;

  v_result := public.publish_exact_stock_snapshot_warehouse_arrival_base(
    p_sync_id
  );
  return v_result || jsonb_build_object(
    'warehouse_arrivals_created', 0,
    'warehouse_arrival_notifications_created', 0,
    'supplier_source_delta', false
  );
end;
$$;

revoke all on function
  public.publish_exact_stock_snapshot_current_replenishment_legacy_base(uuid),
  public.publish_exact_stock_snapshot_current_replenishment_base(uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_exact_stock_snapshot_current_replenishment_legacy_base(uuid),
  public.publish_exact_stock_snapshot_current_replenishment_base(uuid)
to service_role;

comment on function
  public.publish_exact_stock_snapshot_current_replenishment_base(uuid) is
  'Uses the existing arrival-transition publisher for any source delta and bypasses no-change source-line rewrites when staged truth is identical.';

create or replace function public.publish_exact_stock_snapshot_with_supplier_base(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stock_result jsonb;
  v_snapshot_date date;
  v_active integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_removed integer := 0;
begin
  select snapshot_time::date into v_snapshot_date
  from public.stock_sync_state
  where id = 'exact_stock' and active_sync_id = p_sync_id;

  if v_snapshot_date is null then
    raise exception 'stock sync incomplete' using errcode = '55000';
  end if;

  create temporary table stock_publication_desired_arrivals
  on commit drop as
  with balances as (
    select stage.external_supplier_order_ref,
      stage.external_product_ref, stage.external_characteristic_ref,
      sum(stage.remaining_quantity) as remaining_quantity
    from public.supplier_arrival_balance_stage stage
    where stage.sync_id = p_sync_id
    group by stage.external_supplier_order_ref,
      stage.external_product_ref, stage.external_characteristic_ref
    having sum(stage.remaining_quantity) > 0
  )
  select product.id as product_id, balances.external_characteristic_ref,
    document.expected_arrival_date,
    sum(balances.remaining_quantity) as expected_quantity
  from balances
  join public.supplier_order_document_stage document
    on document.sync_id = p_sync_id
   and document.external_supplier_order_ref =
     balances.external_supplier_order_ref
  join public.catalog_products product
    on product.external_1c_id = balances.external_product_ref
  where document.is_posted and not document.is_deleted
    and not document.is_closed
    and document.external_state_ref =
      '02166cc3-bf4b-11e9-a7fe-000c2988d323'
    and document.expected_arrival_date is not null
    and document.expected_arrival_date >= v_snapshot_date
    and document.date_placement = 'ВШапке'
  group by product.id, balances.external_characteristic_ref,
    document.expected_arrival_date;

  select count(*)::integer into v_active
  from stock_publication_desired_arrivals;

  select
    count(*) filter (where current.product_id is null)::integer,
    count(*) filter (where current.product_id is not null and
      row(current.expected_quantity, current.is_published)
      is distinct from row(desired.expected_quantity, true))::integer,
    count(*) filter (where current.product_id is not null and
      row(current.expected_quantity, current.is_published)
      is not distinct from row(desired.expected_quantity, true))::integer
  into v_inserted, v_updated, v_unchanged
  from stock_publication_desired_arrivals desired
  left join public.product_supplier_arrivals current
    using (product_id, external_characteristic_ref, expected_arrival_date);

  select count(*)::integer into v_removed
  from public.product_supplier_arrivals current
  where current.is_published and not exists (
    select 1 from stock_publication_desired_arrivals desired
    where desired.product_id = current.product_id
      and desired.external_characteristic_ref =
        current.external_characteristic_ref
      and desired.expected_arrival_date = current.expected_arrival_date
  );

  v_stock_result := public.publish_exact_stock_snapshot_base(p_sync_id);

  if v_inserted + v_updated > 0 then
    insert into public.product_supplier_arrivals as current(
    product_id, external_characteristic_ref, expected_arrival_date,
    expected_quantity, published_at, source_sync_id, is_published
  )
  select desired.product_id, desired.external_characteristic_ref,
    desired.expected_arrival_date, desired.expected_quantity,
    now(), p_sync_id, true
  from stock_publication_desired_arrivals desired
  on conflict (product_id, external_characteristic_ref, expected_arrival_date)
  do update set
    expected_quantity = excluded.expected_quantity,
    published_at = excluded.published_at,
    source_sync_id = excluded.source_sync_id,
    is_published = true
    where row(current.expected_quantity, current.is_published)
      is distinct from row(excluded.expected_quantity, true);
  end if;

  if v_removed > 0 then
    update public.product_supplier_arrivals current set
      is_published = false,
      published_at = now(),
      source_sync_id = p_sync_id
    where current.is_published and not exists (
      select 1 from stock_publication_desired_arrivals desired
      where desired.product_id = current.product_id
        and desired.external_characteristic_ref =
          current.external_characteristic_ref
        and desired.expected_arrival_date = current.expected_arrival_date
    );
  end if;

  update public.stock_sync_state state set
    supplier_documents_resolved = (
      select count(*) from public.supplier_order_document_stage
      where sync_id = p_sync_id
    ),
    supplier_documents_missing = (
      select count(*) from (
        select distinct balance.external_supplier_order_ref
        from public.supplier_arrival_balance_stage balance
        left join public.supplier_order_document_stage document
          on document.sync_id = p_sync_id
         and document.external_supplier_order_ref =
           balance.external_supplier_order_ref
        where balance.sync_id = p_sync_id
          and document.external_supplier_order_ref is null
      ) missing
    ),
    supplier_unposted_excluded = (
      select count(*) from public.supplier_order_document_stage
      where sync_id = p_sync_id and not is_posted
    ),
    supplier_deleted_excluded = (
      select count(*) from public.supplier_order_document_stage
      where sync_id = p_sync_id and is_deleted
    ),
    supplier_closed_excluded = (
      select count(*) from public.supplier_order_document_stage
      where sync_id = p_sync_id and is_closed
    ),
    supplier_state_excluded = (
      select count(*) from public.supplier_order_document_stage
      where sync_id = p_sync_id and external_state_ref is distinct from
        '02166cc3-bf4b-11e9-a7fe-000c2988d323'
    ),
    supplier_missing_date_excluded = (
      select count(*) from public.supplier_order_document_stage
      where sync_id = p_sync_id and expected_arrival_date is null
    ),
    supplier_date_placement_excluded = (
      select count(*) from public.supplier_order_document_stage
      where sync_id = p_sync_id and date_placement is distinct from 'ВШапке'
    ),
    supplier_overdue_excluded = (
      select count(*) from public.supplier_order_document_stage
      where sync_id = p_sync_id and expected_arrival_date < v_snapshot_date
    ),
    supplier_valid_arrivals = v_active,
    supplier_arrivals_published = v_active,
    arrivals_delta_unchanged = v_unchanged,
    arrivals_delta_inserted = v_inserted,
    arrivals_delta_updated = v_updated,
    arrivals_delta_removed = v_removed
  where state.id = 'exact_stock';

  delete from public.supplier_arrival_balance_stage
  where sync_id = p_sync_id;
  delete from public.supplier_order_document_stage
  where sync_id = p_sync_id;

  return v_stock_result || jsonb_build_object(
    'supplier_arrivals_published', v_active,
    'arrivals_delta', jsonb_build_object(
      'unchanged', v_unchanged, 'inserted', v_inserted,
      'updated', v_updated, 'removed', v_removed
    )
  );
end;
$$;

revoke all on function public.prepare_exact_stock_publication(uuid)
from public, anon, authenticated;
grant execute on function public.prepare_exact_stock_publication(uuid)
to service_role;

create or replace function public.publish_exact_stock_snapshot_base(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_snapshot timestamptz;
  v_stock_inserted integer := 0;
  v_stock_updated integer := 0;
  v_stock_unchanged integer := 0;
  v_stock_removed integer := 0;
  v_total_inserted integer := 0;
  v_total_updated integer := 0;
  v_total_unchanged integer := 0;
  v_total_removed integer := 0;
  v_matched integer := 0;
  v_unmatched integer := 0;
begin
  select state.snapshot_time into v_snapshot
  from public.stock_sync_state state
  where state.id = 'exact_stock'
    and state.active_sync_id = p_sync_id
    and state.scan_complete;
  if v_snapshot is null then
    raise exception 'stock sync incomplete' using errcode = '55000';
  end if;

  insert into public.stock_warehouses as current(
    external_ref, code, name, organization_ref,
    public_included, is_active, updated_at
  )
  select stage.external_ref, stage.code, stage.name, stage.organization_ref,
    case when lower(stage.name) = 'depozit principal chisinau'
      then true else coalesce(current.public_included, false) end,
    stage.is_active, now()
  from public.stock_warehouse_sync_stage stage
  left join public.stock_warehouses current
    on current.external_ref = stage.external_ref
  where stage.sync_id = p_sync_id
  on conflict (external_ref) do update set
    code = excluded.code,
    name = excluded.name,
    organization_ref = excluded.organization_ref,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at
  where row(current.code, current.name, current.organization_ref,
    current.is_active) is distinct from row(excluded.code, excluded.name,
    excluded.organization_ref, excluded.is_active);

  select count(distinct stage.external_product_ref)::integer
  into v_unmatched
  from public.stock_balance_sync_stage stage
  left join public.catalog_products product
    on product.external_1c_id = stage.external_product_ref
  where stage.sync_id = p_sync_id and product.id is null;

  select count(distinct product.id)::integer
  into v_matched
  from public.stock_balance_sync_stage stage
  join public.catalog_products product
    on product.external_1c_id = stage.external_product_ref
  where stage.sync_id = p_sync_id;

  create temporary table stock_publication_desired_balances
  on commit drop as
  select product.id as product_id, warehouse.id as warehouse_id,
    warehouse.name as warehouse_name, stage.external_characteristic_ref,
    coalesce(max(stage.quantity) filter (
      where stage.balance_kind = 'physical'), 0) as physical_quantity,
    coalesce(max(stage.quantity) filter (
      where stage.balance_kind = 'reserved'), 0) as reserved_quantity,
    coalesce(max(stage.quantity) filter (
      where stage.balance_kind = 'incoming'), 0) as incoming_quantity
  from public.stock_balance_sync_stage stage
  join public.catalog_products product
    on product.external_1c_id = stage.external_product_ref
  join public.stock_warehouses warehouse
    on warehouse.external_ref = stage.external_warehouse_ref
  where stage.sync_id = p_sync_id
  group by product.id, warehouse.id, warehouse.name,
    stage.external_characteristic_ref;

  select
    count(*) filter (where current.id is null)::integer,
    count(*) filter (where current.id is not null and row(
      current.physical_quantity, current.reserved_quantity,
      current.available_quantity, current.incoming_quantity,
      current.warehouse_name, current.is_active, current.is_published
    ) is distinct from row(
      desired.physical_quantity, desired.reserved_quantity,
      greatest(0, desired.physical_quantity - desired.reserved_quantity),
      desired.incoming_quantity, desired.warehouse_name, true, true
    ))::integer,
    count(*) filter (where current.id is not null and row(
      current.physical_quantity, current.reserved_quantity,
      current.available_quantity, current.incoming_quantity,
      current.warehouse_name, current.is_active, current.is_published
    ) is not distinct from row(
      desired.physical_quantity, desired.reserved_quantity,
      greatest(0, desired.physical_quantity - desired.reserved_quantity),
      desired.incoming_quantity, desired.warehouse_name, true, true
    ))::integer
  into v_stock_inserted, v_stock_updated, v_stock_unchanged
  from stock_publication_desired_balances desired
  left join public.product_stock_balances current
    on current.product_id = desired.product_id
   and current.warehouse_id = desired.warehouse_id
   and current.external_characteristic_ref =
     desired.external_characteristic_ref;

  select count(*)::integer into v_stock_removed
  from public.product_stock_balances current
  where current.warehouse_id is not null
    and (current.is_active or current.is_published)
    and not exists (
      select 1 from stock_publication_desired_balances desired
      where desired.product_id = current.product_id
        and desired.warehouse_id = current.warehouse_id
        and desired.external_characteristic_ref =
          current.external_characteristic_ref
    );

  insert into public.product_stock_balances as current(
    product_id, warehouse_id, warehouse_name,
    external_characteristic_ref, physical_quantity, reserved_quantity,
    available_quantity, incoming_quantity, updated_from_1c_at,
    synced_at, last_seen_sync_id, is_published, is_active,
    source_fingerprint, warehouse_scope_version, published_at,
    freshness_state
  )
  select desired.product_id, desired.warehouse_id, desired.warehouse_name,
    desired.external_characteristic_ref, desired.physical_quantity,
    desired.reserved_quantity,
    greatest(0, desired.physical_quantity - desired.reserved_quantity),
    desired.incoming_quantity, v_snapshot, now(), p_sync_id, true, true,
    md5(concat_ws('|', desired.product_id::text,
      desired.warehouse_id::text, desired.external_characteristic_ref,
      desired.physical_quantity::text, desired.reserved_quantity::text,
      desired.incoming_quantity::text)),
    'principal_chisinau:v1', now(), 'authoritative'
  from stock_publication_desired_balances desired
  on conflict (product_id, warehouse_id, external_characteristic_ref)
    where warehouse_id is not null
  do update set
    warehouse_name = excluded.warehouse_name,
    physical_quantity = excluded.physical_quantity,
    reserved_quantity = excluded.reserved_quantity,
    available_quantity = excluded.available_quantity,
    incoming_quantity = excluded.incoming_quantity,
    updated_from_1c_at = excluded.updated_from_1c_at,
    synced_at = excluded.synced_at,
    last_seen_sync_id = excluded.last_seen_sync_id,
    is_published = true,
    is_active = true,
    source_fingerprint = excluded.source_fingerprint,
    warehouse_scope_version = excluded.warehouse_scope_version,
    published_at = excluded.published_at,
    freshness_state = 'authoritative'
  where row(current.physical_quantity, current.reserved_quantity,
    current.available_quantity, current.incoming_quantity,
    current.warehouse_name, current.is_active, current.is_published)
  is distinct from row(excluded.physical_quantity,
    excluded.reserved_quantity, excluded.available_quantity,
    excluded.incoming_quantity, excluded.warehouse_name, true, true);

  update public.product_stock_balances current set
    is_active = false,
    is_published = false,
    synced_at = now(),
    last_seen_sync_id = p_sync_id,
    warehouse_scope_version = 'principal_chisinau:v1',
    published_at = now(),
    freshness_state = 'authoritative'
  where current.warehouse_id is not null
    and (current.is_active or current.is_published)
    and not exists (
      select 1 from stock_publication_desired_balances desired
      where desired.product_id = current.product_id
        and desired.warehouse_id = current.warehouse_id
        and desired.external_characteristic_ref =
          current.external_characteristic_ref
    );

  create temporary table stock_publication_desired_totals
  on commit drop as
  select balance.product_id,
    coalesce(sum(balance.physical_quantity) filter (
      where balance.external_characteristic_ref =
        '00000000-0000-0000-0000-000000000000'), 0) as physical_quantity,
    coalesce(sum(balance.reserved_quantity) filter (
      where balance.external_characteristic_ref =
        '00000000-0000-0000-0000-000000000000'), 0) as reserved_quantity,
    coalesce(sum(balance.available_quantity) filter (
      where balance.external_characteristic_ref =
        '00000000-0000-0000-0000-000000000000'), 0) as available_quantity,
    coalesce(sum(balance.incoming_quantity) filter (
      where balance.external_characteristic_ref =
        '00000000-0000-0000-0000-000000000000'), 0) as incoming_quantity,
    bool_or(balance.external_characteristic_ref <>
      '00000000-0000-0000-0000-000000000000'
      and balance.available_quantity > 0) as has_variant_stock
  from public.product_stock_balances balance
  join public.stock_warehouses warehouse on warehouse.id = balance.warehouse_id
  where balance.is_published and balance.is_active
    and warehouse.public_included and warehouse.is_active
  group by balance.product_id;

  select
    count(*) filter (where current.product_id is null)::integer,
    count(*) filter (where current.product_id is not null and row(
      current.physical_quantity, current.reserved_quantity,
      current.available_quantity, current.incoming_quantity,
      current.has_variant_stock, current.is_published
    ) is distinct from row(
      desired.physical_quantity, desired.reserved_quantity,
      desired.available_quantity, desired.incoming_quantity,
      desired.has_variant_stock, true
    ))::integer,
    count(*) filter (where current.product_id is not null and row(
      current.physical_quantity, current.reserved_quantity,
      current.available_quantity, current.incoming_quantity,
      current.has_variant_stock, current.is_published
    ) is not distinct from row(
      desired.physical_quantity, desired.reserved_quantity,
      desired.available_quantity, desired.incoming_quantity,
      desired.has_variant_stock, true
    ))::integer
  into v_total_inserted, v_total_updated, v_total_unchanged
  from stock_publication_desired_totals desired
  left join public.product_stock_totals current
    on current.product_id = desired.product_id;

  select count(*)::integer into v_total_removed
  from public.product_stock_totals current
  where current.is_published and not exists (
    select 1 from stock_publication_desired_totals desired
    where desired.product_id = current.product_id
  );

  if v_total_inserted + v_total_updated > 0 then
    insert into public.product_stock_totals as current(
    product_id, physical_quantity, reserved_quantity, available_quantity,
    incoming_quantity, has_variant_stock, synced_at, last_seen_sync_id,
    is_published, source_fingerprint, warehouse_scope_version,
    published_at, freshness_state
  )
  select desired.product_id, desired.physical_quantity,
    desired.reserved_quantity, desired.available_quantity,
    desired.incoming_quantity, desired.has_variant_stock,
    now(), p_sync_id, true,
    md5(concat_ws('|', desired.product_id::text,
      desired.physical_quantity::text, desired.reserved_quantity::text,
      desired.available_quantity::text, desired.incoming_quantity::text,
      desired.has_variant_stock::text)),
    'principal_chisinau:v1', now(), 'authoritative'
  from stock_publication_desired_totals desired
  on conflict (product_id) do update set
    physical_quantity = excluded.physical_quantity,
    reserved_quantity = excluded.reserved_quantity,
    available_quantity = excluded.available_quantity,
    incoming_quantity = excluded.incoming_quantity,
    has_variant_stock = excluded.has_variant_stock,
    synced_at = excluded.synced_at,
    last_seen_sync_id = excluded.last_seen_sync_id,
    is_published = true,
    source_fingerprint = excluded.source_fingerprint,
    warehouse_scope_version = excluded.warehouse_scope_version,
    published_at = excluded.published_at,
    freshness_state = 'authoritative'
    where row(current.physical_quantity, current.reserved_quantity,
      current.available_quantity, current.incoming_quantity,
      current.has_variant_stock, current.is_published)
    is distinct from row(excluded.physical_quantity,
      excluded.reserved_quantity, excluded.available_quantity,
      excluded.incoming_quantity, excluded.has_variant_stock, true);
  end if;

  if v_total_removed > 0 then
    update public.product_stock_totals current set
      is_published = false,
      synced_at = now(),
      last_seen_sync_id = p_sync_id,
      warehouse_scope_version = 'principal_chisinau:v1',
      published_at = now(),
      freshness_state = 'authoritative'
    where current.is_published and not exists (
      select 1 from stock_publication_desired_totals desired
      where desired.product_id = current.product_id
    );
  end if;

  delete from public.stock_balance_sync_stage where sync_id = p_sync_id;
  delete from public.stock_warehouse_sync_stage where sync_id = p_sync_id;

  update public.stock_sync_state state set
    status = 'succeeded', current_stage = 'completed', finished_at = now(),
    last_successful_sync_at = now(), products_matched = v_matched,
    products_unmatched = v_unmatched,
    rows_published = v_stock_inserted + v_stock_updated,
    rows_deactivated = v_stock_removed,
    stock_delta_unchanged = v_stock_unchanged,
    stock_delta_inserted = v_stock_inserted,
    stock_delta_updated = v_stock_updated,
    stock_delta_removed = v_stock_removed,
    stock_total_delta_unchanged = v_total_unchanged,
    stock_total_delta_inserted = v_total_inserted,
    stock_total_delta_updated = v_total_updated,
    stock_total_delta_removed = v_total_removed,
    active_sync_id = null, active_chunk_token = null,
    chunk_started_at = null, updated_at = now()
  where state.id = 'exact_stock' and state.active_sync_id = p_sync_id;

  return jsonb_build_object(
    'published', v_stock_inserted + v_stock_updated,
    'deactivated', v_stock_removed,
    'matched', v_matched, 'unmatched', v_unmatched,
    'stock_delta', jsonb_build_object(
      'unchanged', v_stock_unchanged, 'inserted', v_stock_inserted,
      'updated', v_stock_updated, 'removed', v_stock_removed
    ),
    'stock_total_delta', jsonb_build_object(
      'unchanged', v_total_unchanged, 'inserted', v_total_inserted,
      'updated', v_total_updated, 'removed', v_total_removed
    )
  );
end;
$$;

create or replace function public.publish_exact_stock_snapshot(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_started_at timestamptz := clock_timestamp();
  v_lock_started_at timestamptz := clock_timestamp();
  v_lock_wait_ms integer := 0;
  v_db_ms integer := 0;
  v_timeout_ms integer := 8000;
  v_base_result jsonb;
  v_day_result jsonb;
  v_trigger_rows integer := 0;
begin
  if not pg_try_advisory_xact_lock(
    hashtextextended('exact_stock_publication', 0)
  ) then
    raise exception 'Stock publication is already owned by another worker.'
      using errcode = '55P03';
  end if;
  v_lock_wait_ms := greatest(0, extract(milliseconds from
    clock_timestamp() - v_lock_started_at)::integer);

  v_base_result :=
    public.publish_exact_stock_snapshot_replenishment_day_base(p_sync_id);
  v_day_result := public.reconcile_current_warehouse_replenishment_day(true);

  delete from public.supplier_order_item_stage where sync_id = p_sync_id;

  v_db_ms := greatest(0, extract(milliseconds from
    clock_timestamp() - v_started_at)::integer);
  v_trigger_rows :=
    coalesce((v_base_result->'stock_total_delta'->>'inserted')::integer, 0)
    + coalesce((v_base_result->'stock_total_delta'->>'updated')::integer, 0)
    + coalesce((v_base_result->'stock_total_delta'->>'removed')::integer, 0)
    + coalesce((v_base_result->'arrivals_delta'->>'inserted')::integer, 0)
    + coalesce((v_base_result->'arrivals_delta'->>'updated')::integer, 0)
    + coalesce((v_base_result->'arrivals_delta'->>'removed')::integer, 0);

  update public.stock_sync_state state set
    publication_db_ms = v_db_ms,
    publication_timeout_budget_ms = v_timeout_ms,
    publication_headroom_percent = round(
      greatest(0, v_timeout_ms - v_db_ms)::numeric / v_timeout_ms * 100,
      2
    ),
    publication_lock_wait_ms = v_lock_wait_ms,
    publication_trigger_rows = v_trigger_rows,
    last_completed_sync_id = p_sync_id,
    updated_at = now()
  where state.id = 'exact_stock';

  return v_base_result || jsonb_build_object(
    'current_warehouse_replenishment_day', v_day_result,
    'publication', jsonb_build_object(
      'db_ms', v_db_ms,
      'timeout_budget_ms', v_timeout_ms,
      'headroom_percent', round(
        greatest(0, v_timeout_ms - v_db_ms)::numeric / v_timeout_ms * 100,
        2
      ),
      'lock_wait_ms', v_lock_wait_ms,
      'trigger_rows', v_trigger_rows
    )
  );
end;
$$;

revoke all on function public.publish_exact_stock_snapshot(uuid)
from public, anon, authenticated;
grant execute on function public.publish_exact_stock_snapshot(uuid)
to service_role;

create or replace function public.start_exact_stock_sync()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state public.stock_sync_state%rowtype;
  new_sync_id uuid := gen_random_uuid();
  v_started_at timestamptz := now();
  stale_sync_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Stock synchronization is server-only.'
      using errcode = '42501';
  end if;

  select * into current_state
  from public.stock_sync_state
  where id = 'exact_stock'
  for update;

  if current_state.status in ('queued', 'running')
      and current_state.updated_at > now() - interval '10 minutes' then
    return jsonb_build_object(
      'result', 'locked', 'sync_id', current_state.active_sync_id
    );
  end if;
  if exists (
    select 1 from public.price_sync_state
    where id = 'product_prices' and status in ('queued', 'running')
  ) then
    return jsonb_build_object(
      'result', 'blocked_price', 'sync_id', null
    );
  end if;
  if exists (
    select 1 from public.catalog_sync_state
    where id = 'daily_catalog' and status = 'running'
  ) then
    return jsonb_build_object(
      'result', 'blocked_catalog', 'sync_id', null
    );
  end if;

  stale_sync_id := coalesce(
    current_state.active_sync_id, current_state.last_failed_sync_id
  );
  if stale_sync_id is not null then
    delete from public.stock_balance_sync_stage
      where sync_id = stale_sync_id;
    delete from public.stock_balance_stage_receipts
      where sync_id = stale_sync_id;
    delete from public.stock_warehouse_sync_stage
      where sync_id = stale_sync_id;
    delete from public.supplier_arrival_balance_stage
      where sync_id = stale_sync_id;
    delete from public.supplier_order_document_stage
      where sync_id = stale_sync_id;
    delete from public.supplier_order_item_stage
      where sync_id = stale_sync_id;
  end if;

  update public.stock_sync_state set
    status = 'queued', active_sync_id = new_sync_id,
    last_failed_sync_id = null, snapshot_time = v_started_at,
    current_stage = 'warehouse_scan', next_skip = 0, page_size = 500,
    pages_processed = 0, physical_rows = 0, reserved_rows = 0,
    incoming_rows = 0, warehouses_loaded = 0,
    products_matched = 0, products_unmatched = 0,
    rows_published = 0, rows_deactivated = 0,
    supplier_balance_rows = 0, supplier_balance_groups = 0,
    supplier_positive_groups = 0, supplier_nonpositive_excluded = 0,
    supplier_orders_requested = 0, supplier_documents_resolved = 0,
    supplier_documents_missing = 0, supplier_unposted_excluded = 0,
    supplier_deleted_excluded = 0, supplier_closed_excluded = 0,
    supplier_state_excluded = 0, supplier_missing_date_excluded = 0,
    supplier_date_placement_excluded = 0,
    supplier_overdue_excluded = 0, supplier_valid_arrivals = 0,
    supplier_arrivals_published = 0, stock_staged_rows = 0,
    arrivals_staged_rows = 0, stock_delta_unchanged = 0,
    stock_delta_inserted = 0, stock_delta_updated = 0,
    stock_delta_removed = 0, stock_total_delta_unchanged = 0,
    stock_total_delta_inserted = 0, stock_total_delta_updated = 0,
    stock_total_delta_removed = 0, arrivals_delta_unchanged = 0,
    arrivals_delta_inserted = 0, arrivals_delta_updated = 0,
    arrivals_delta_removed = 0, publication_db_ms = null,
    publication_application_ms = null,
    publication_timeout_budget_ms = 8000,
    publication_headroom_percent = null,
    publication_lock_wait_ms = null, publication_trigger_rows = 0,
    publication_started_at = null, last_completed_sync_id = null,
    scan_complete = false, started_at = v_started_at, finished_at = null,
    error_category = null, failed_stage = null, safe_error = null,
    database_error_code = null, failed_page = null,
    active_chunk_token = null, chunk_started_at = null,
    updated_at = v_started_at
  where id = 'exact_stock';

  return jsonb_build_object(
    'result', case when current_state.status in ('queued', 'running')
      then 'stale_lock_recovered' else 'acquired' end,
    'sync_id', new_sync_id
  );
end;
$$;

revoke all on function public.start_exact_stock_sync()
from public, anon, authenticated;
grant execute on function public.start_exact_stock_sync()
to service_role;

alter function private.get_admin_commercial_health(timestamptz)
  rename to get_admin_commercial_health_stock_arrivals_57014_base;

create function private.get_admin_commercial_health(
  p_now timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  with base as (
    select private.get_admin_commercial_health_stock_arrivals_57014_base(
      p_now
    ) as value
  ), expanded as (
    select item.value, item.ordinality
    from base,
      jsonb_array_elements(base.value) with ordinality as item(value, ordinality)
  ), state as (
    select value.* from public.stock_sync_state value
    where value.id = 'exact_stock'
  )
  select coalesce(jsonb_agg(
    case
      when expanded.value->>'key' = 'stock' then
        expanded.value || jsonb_build_object(
          'affectedScope', case when state.status = 'failed'
            then 'exact_stock,supplier_arrivals' else 'exact_stock' end,
          'affectedDomains', case when state.status = 'failed'
            then jsonb_build_array('stock', 'arrivals')
            else jsonb_build_array('stock') end,
          'rootIncident', state.status = 'failed',
          'staged', state.stock_staged_rows,
          'deltaStock', jsonb_build_object(
            'unchanged', state.stock_delta_unchanged,
            'inserted', state.stock_delta_inserted,
            'updated', state.stock_delta_updated,
            'removed', state.stock_delta_removed
          ),
          'deltaArrivals', jsonb_build_object(
            'unchanged', state.arrivals_delta_unchanged,
            'inserted', state.arrivals_delta_inserted,
            'updated', state.arrivals_delta_updated,
            'removed', state.arrivals_delta_removed
          ),
          'publication', jsonb_build_object(
            'dbMs', state.publication_db_ms,
            'applicationMs', state.publication_application_ms,
            'timeoutBudgetMs', state.publication_timeout_budget_ms,
            'headroomPercent', state.publication_headroom_percent,
            'lockWaitMs', state.publication_lock_wait_ms,
            'triggerRows', state.publication_trigger_rows,
            'triggerTimeMs', null,
            'timeoutWarning', coalesce(state.publication_db_ms, 0) >
              state.publication_timeout_budget_ms * 0.7
          ),
          'recoveryState', case when state.status = 'failed'
            then 'LAST_GOOD_ACTIVE_STAGING_RETAINED'
            else 'CONFIRMED_PUBLICATION_ACTIVE' end
        )
      when expanded.value->>'key' = 'arrivals' then
        expanded.value || jsonb_build_object(
          'staged', state.arrivals_staged_rows,
          'deltaArrivals', jsonb_build_object(
            'unchanged', state.arrivals_delta_unchanged,
            'inserted', state.arrivals_delta_inserted,
            'updated', state.arrivals_delta_updated,
            'removed', state.arrivals_delta_removed
          )
        )
      else expanded.value
    end
    order by expanded.ordinality
  ), '[]'::jsonb)
  from expanded cross join state
  where not (
    state.status = 'failed' and expanded.value->>'key' = 'arrivals'
  );
$$;

revoke all on function
  private.get_admin_commercial_health_stock_arrivals_57014_base(timestamptz),
  private.get_admin_commercial_health(timestamptz)
from public, anon, authenticated;

comment on function private.get_admin_commercial_health(timestamptz) is
  'Adds exact stock/arrivals publication deltas and presents their shared failed transaction as one root incident.';

commit;
