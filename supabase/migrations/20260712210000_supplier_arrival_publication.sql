create table public.supplier_arrival_balance_stage (
  sync_id uuid not null,
  source_page integer not null,
  external_supplier_order_ref text not null,
  external_product_ref text not null,
  external_characteristic_ref text not null,
  remaining_quantity numeric(14,3) not null,
  primary key (sync_id, source_page, external_supplier_order_ref, external_product_ref, external_characteristic_ref)
);

create table public.supplier_order_document_stage (
  sync_id uuid not null,
  external_supplier_order_ref text not null,
  is_posted boolean not null,
  is_deleted boolean not null,
  is_closed boolean not null,
  external_state_ref text,
  expected_arrival_date date,
  date_placement text,
  source_version text,
  primary key (sync_id, external_supplier_order_ref)
);

create table public.product_supplier_arrivals (
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  external_characteristic_ref text not null,
  expected_arrival_date date not null,
  expected_quantity numeric(14,3) not null check (expected_quantity > 0),
  published_at timestamptz not null,
  source_sync_id uuid not null,
  is_published boolean not null default true,
  primary key (product_id, external_characteristic_ref, expected_arrival_date)
);

create index product_supplier_arrivals_product_idx
  on public.product_supplier_arrivals (product_id, external_characteristic_ref, expected_arrival_date)
  where is_published;

alter table public.stock_sync_state
  add column supplier_balance_rows integer not null default 0,
  add column supplier_balance_groups integer not null default 0,
  add column supplier_positive_groups integer not null default 0,
  add column supplier_nonpositive_excluded integer not null default 0,
  add column supplier_orders_requested integer not null default 0,
  add column supplier_documents_resolved integer not null default 0,
  add column supplier_documents_missing integer not null default 0,
  add column supplier_unposted_excluded integer not null default 0,
  add column supplier_deleted_excluded integer not null default 0,
  add column supplier_closed_excluded integer not null default 0,
  add column supplier_state_excluded integer not null default 0,
  add column supplier_missing_date_excluded integer not null default 0,
  add column supplier_date_placement_excluded integer not null default 0,
  add column supplier_overdue_excluded integer not null default 0,
  add column supplier_valid_arrivals integer not null default 0,
  add column supplier_arrivals_published integer not null default 0;

alter table public.supplier_arrival_balance_stage enable row level security;
alter table public.supplier_order_document_stage enable row level security;
alter table public.product_supplier_arrivals enable row level security;

revoke all on public.supplier_arrival_balance_stage, public.supplier_order_document_stage,
  public.product_supplier_arrivals from anon, authenticated;
grant select, insert, update, delete on public.supplier_arrival_balance_stage,
  public.supplier_order_document_stage, public.product_supplier_arrivals to service_role;
grant select on public.product_supplier_arrivals to authenticated;

create policy "Approved users read confirmed supplier arrivals"
  on public.product_supplier_arrivals for select to authenticated
  using (
    is_published
    and public.can_select_product_commercial_data(product_id, null, 'stock.view')
  );

create function public.stage_supplier_arrival_balance_rows(
  p_sync_id uuid,
  p_source_page integer,
  p_rows jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_received integer;
  v_groups integer;
  v_positive integer;
begin
  delete from public.supplier_arrival_balance_stage
  where sync_id = p_sync_id and source_page = p_source_page;

  with source as (
    select * from jsonb_to_recordset(p_rows) as row(
      external_supplier_order_ref text,
      external_product_ref text,
      external_characteristic_ref text,
      remaining_quantity numeric
    )
  ), aggregated as (
    select external_supplier_order_ref, external_product_ref, external_characteristic_ref,
      sum(remaining_quantity) as remaining_quantity
    from source
    group by external_supplier_order_ref, external_product_ref, external_characteristic_ref
  ), inserted as (
    insert into public.supplier_arrival_balance_stage (
      sync_id, source_page, external_supplier_order_ref, external_product_ref,
      external_characteristic_ref, remaining_quantity
    )
    select p_sync_id, p_source_page, external_supplier_order_ref, external_product_ref,
      external_characteristic_ref, remaining_quantity
    from aggregated where remaining_quantity > 0
    returning 1
  )
  select jsonb_array_length(p_rows), (select count(*) from aggregated), count(*)
  into v_received, v_groups, v_positive from inserted;

  return jsonb_build_object(
    'received', v_received,
    'groups', v_groups,
    'positive', v_positive,
    'excluded', v_groups - v_positive
  );
end $$;

create function public.list_supplier_order_refs(
  p_sync_id uuid,
  p_offset integer,
  p_limit integer
) returns table(external_supplier_order_ref text)
language sql security invoker set search_path = public as $$
  select distinct stage.external_supplier_order_ref
  from public.supplier_arrival_balance_stage stage
  where stage.sync_id = p_sync_id
  order by stage.external_supplier_order_ref
  offset p_offset limit p_limit;
$$;

alter function public.publish_exact_stock_snapshot(uuid)
  rename to publish_exact_stock_snapshot_base;

create function public.publish_exact_stock_snapshot(p_sync_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_stock_result jsonb;
  v_snapshot_date date;
  v_published integer;
begin
  select snapshot_time::date into v_snapshot_date
  from public.stock_sync_state where id = 'exact_stock' and active_sync_id = p_sync_id;

  v_stock_result := public.publish_exact_stock_snapshot_base(p_sync_id);

  with balances as (
    select external_supplier_order_ref, external_product_ref, external_characteristic_ref,
      sum(remaining_quantity) remaining_quantity
    from public.supplier_arrival_balance_stage where sync_id = p_sync_id
    group by external_supplier_order_ref, external_product_ref, external_characteristic_ref
    having sum(remaining_quantity) > 0
  ), valid as (
    select b.*, d.expected_arrival_date
    from balances b join public.supplier_order_document_stage d
      on d.sync_id = p_sync_id
      and d.external_supplier_order_ref = b.external_supplier_order_ref
    where d.is_posted and not d.is_deleted and not d.is_closed
      and d.external_state_ref = '02166cc3-bf4b-11e9-a7fe-000c2988d323'
      and d.expected_arrival_date is not null
      and d.expected_arrival_date >= v_snapshot_date
      and d.date_placement = 'ВШапке'
  ), grouped as (
    select external_product_ref, external_characteristic_ref, expected_arrival_date,
      sum(remaining_quantity) expected_quantity
    from valid
    group by external_product_ref, external_characteristic_ref, expected_arrival_date
  )
  insert into public.product_supplier_arrivals as current (
    product_id, external_characteristic_ref, expected_arrival_date,
    expected_quantity, published_at, source_sync_id, is_published
  )
  select product.id, grouped.external_characteristic_ref, grouped.expected_arrival_date,
    grouped.expected_quantity, now(), p_sync_id, true
  from grouped join public.catalog_products product
    on product.external_1c_id = grouped.external_product_ref
  on conflict (product_id, external_characteristic_ref, expected_arrival_date)
  do update set expected_quantity = excluded.expected_quantity,
    published_at = excluded.published_at, source_sync_id = excluded.source_sync_id,
    is_published = true;
  get diagnostics v_published = row_count;

  update public.product_supplier_arrivals
  set is_published = false
  where source_sync_id is distinct from p_sync_id;

  update public.stock_sync_state set
    supplier_documents_resolved = (select count(*) from public.supplier_order_document_stage where sync_id = p_sync_id),
    supplier_documents_missing = (select count(*) from (select distinct b.external_supplier_order_ref from public.supplier_arrival_balance_stage b left join public.supplier_order_document_stage d on d.sync_id=p_sync_id and d.external_supplier_order_ref=b.external_supplier_order_ref where b.sync_id=p_sync_id and d.external_supplier_order_ref is null) missing),
    supplier_unposted_excluded = (select count(*) from public.supplier_order_document_stage where sync_id=p_sync_id and not is_posted),
    supplier_deleted_excluded = (select count(*) from public.supplier_order_document_stage where sync_id=p_sync_id and is_deleted),
    supplier_closed_excluded = (select count(*) from public.supplier_order_document_stage where sync_id=p_sync_id and is_closed),
    supplier_state_excluded = (select count(*) from public.supplier_order_document_stage where sync_id=p_sync_id and external_state_ref is distinct from '02166cc3-bf4b-11e9-a7fe-000c2988d323'),
    supplier_missing_date_excluded = (select count(*) from public.supplier_order_document_stage where sync_id=p_sync_id and expected_arrival_date is null),
    supplier_date_placement_excluded = (select count(*) from public.supplier_order_document_stage where sync_id=p_sync_id and date_placement is distinct from 'ВШапке'),
    supplier_overdue_excluded = (select count(*) from public.supplier_order_document_stage where sync_id=p_sync_id and expected_arrival_date < v_snapshot_date),
    supplier_valid_arrivals = v_published,
    supplier_arrivals_published = v_published
  where id = 'exact_stock';

  delete from public.supplier_arrival_balance_stage where sync_id = p_sync_id;
  delete from public.supplier_order_document_stage where sync_id = p_sync_id;

  return v_stock_result || jsonb_build_object('supplier_arrivals_published', v_published);
end $$;

revoke all on function public.stage_supplier_arrival_balance_rows(uuid, integer, jsonb),
  public.list_supplier_order_refs(uuid, integer, integer),
  public.publish_exact_stock_snapshot_base(uuid),
  public.publish_exact_stock_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.stage_supplier_arrival_balance_rows(uuid, integer, jsonb),
  public.list_supplier_order_refs(uuid, integer, integer),
  public.publish_exact_stock_snapshot_base(uuid),
  public.publish_exact_stock_snapshot(uuid) to service_role;
