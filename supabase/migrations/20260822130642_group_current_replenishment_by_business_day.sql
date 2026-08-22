begin;

alter table public.current_warehouse_replenishment
  add column batch_id uuid not null default gen_random_uuid(),
  add column business_timezone text not null default 'Europe/Chisinau',
  add column source_document_count integer not null default 1,
  add column source_line_count integer not null default 0,
  add column mapped_line_count integer not null default 0,
  add column unique_product_count integer not null default 0,
  add constraint current_warehouse_replenishment_batch_id_key unique (batch_id),
  add constraint current_warehouse_replenishment_timezone_check
    check (business_timezone = 'Europe/Chisinau'),
  add constraint current_warehouse_replenishment_counts_check check (
    source_document_count > 0
    and source_line_count >= 0
    and mapped_line_count >= 0
    and unique_product_count >= 0
    and mapped_line_count <= source_line_count
    and unique_product_count <= mapped_line_count
  );

create table public.current_warehouse_replenishment_sources (
  singleton_key smallint not null
    references public.current_warehouse_replenishment(singleton_key)
    on delete cascade,
  source_order_ref text not null
    references public.supplier_order_source_states(source_order_ref)
    on delete restrict,
  source_order_number text not null,
  source_document_date date not null,
  source_line_count integer not null check (source_line_count >= 0),
  mapped_line_count integer not null check (
    mapped_line_count >= 0 and mapped_line_count <= source_line_count
  ),
  primary key (singleton_key, source_order_ref)
);

create table public.current_warehouse_replenishment_item_sources (
  singleton_key smallint not null,
  product_id uuid not null,
  source_order_ref text not null,
  source_line_number integer not null check (source_line_number > 0),
  source_quantity numeric(18,3) not null check (source_quantity >= 0),
  primary key (
    singleton_key, product_id, source_order_ref, source_line_number
  ),
  foreign key (singleton_key, product_id)
    references public.current_warehouse_replenishment_items(
      singleton_key, product_id
    ) on delete cascade,
  foreign key (singleton_key, source_order_ref)
    references public.current_warehouse_replenishment_sources(
      singleton_key, source_order_ref
    ) on delete cascade
);

create index supplier_order_source_states_replenishment_day_idx
  on public.supplier_order_source_states(
    source_document_date desc, source_order_ref
  )
  where current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
    and is_posted and not is_deleted and not is_closed
    and source_document_date is not null;

create index current_warehouse_replenishment_item_sources_product_idx
  on public.current_warehouse_replenishment_item_sources(
    product_id, singleton_key
  );

alter table public.current_warehouse_replenishment_sources
  enable row level security;
alter table public.current_warehouse_replenishment_sources
  force row level security;
alter table public.current_warehouse_replenishment_item_sources
  enable row level security;
alter table public.current_warehouse_replenishment_item_sources
  force row level security;

revoke all on table
  public.current_warehouse_replenishment_sources,
  public.current_warehouse_replenishment_item_sources
from public, anon, authenticated;

create function public.reconcile_current_warehouse_replenishment_day(
  p_emit_notification boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  selected_date date;
  representative record;
  selected_arrival_id uuid;
  selected_detected_at timestamptz;
  calculated_fingerprint text;
  existing_fingerprint text;
  existing_date date;
  existing_lineage_date date;
  selected_batch_id uuid;
  document_count integer;
  line_count integer;
  mapped_count integer;
  product_count integer;
  projection_changed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'current_warehouse_replenishment_day', 0
  ));

  -- source_document_date is the calendar date supplied by 1C. It is not
  -- converted through UTC, so the Europe/Chisinau business day is preserved.
  select max(state.source_document_date)
  into selected_date
  from public.supplier_order_source_states state
  where state.current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
    and state.is_posted and not state.is_deleted and not state.is_closed
    and state.source_document_date is not null
    and exists (
      select 1
      from public.supplier_order_source_items item
      join public.catalog_products product
        on product.external_1c_id = item.external_product_ref
       and product.is_active and product.is_visible
      where item.source_order_ref = state.source_order_ref
    );

  if selected_date is null then
    return jsonb_build_object(
      'updated', false,
      'reason', 'no_qualifying_replenishment_day'
    );
  end if;

  select state.source_order_ref, state.source_order_number
  into representative
  from public.supplier_order_source_states state
  where state.source_document_date = selected_date
    and state.current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
    and state.is_posted and not state.is_deleted and not state.is_closed
  order by state.source_order_number, state.source_order_ref
  limit 1;

  select arrival.id
  into selected_arrival_id
  from public.warehouse_arrivals arrival
  join public.supplier_order_source_states state
    on state.source_order_ref = arrival.source_order_ref
  where state.source_document_date = selected_date
  order by arrival.completed_at desc, arrival.id desc
  limit 1;

  with selected_sources as (
    select state.source_order_ref, state.source_order_number,
      state.source_version, state.last_seen_at
    from public.supplier_order_source_states state
    where state.source_document_date = selected_date
      and state.current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
      and state.is_posted and not state.is_deleted and not state.is_closed
  ), selected_lines as (
    select source.source_order_ref, item.line_number,
      item.external_product_ref, item.external_characteristic_ref,
      item.ordered_quantity, product.id as product_id
    from selected_sources source
    join public.supplier_order_source_items item
      on item.source_order_ref = source.source_order_ref
    left join public.catalog_products product
      on product.external_1c_id = item.external_product_ref
     and product.is_active and product.is_visible
  )
  select
    (select count(*) from selected_sources),
    (select count(*) from selected_lines),
    (select count(*) from selected_lines where product_id is not null),
    (select count(distinct product_id) from selected_lines
      where product_id is not null),
    (select max(last_seen_at) from selected_sources),
    encode(digest(concat_ws('|',
      'replenishment_day_v1', selected_date::text,
      coalesce((select string_agg(concat_ws(':', source_order_ref,
        source_order_number, coalesce(source_version, '')), '|' order by
        source_order_ref) from selected_sources), ''),
      coalesce((select string_agg(concat_ws(':', source_order_ref,
        line_number::text, external_product_ref,
        external_characteristic_ref, ordered_quantity::text), '|' order by
        source_order_ref, line_number) from selected_lines), '')
    ), 'sha256'), 'hex')
  into document_count, line_count, mapped_count, product_count,
    selected_detected_at, calculated_fingerprint;

  select current.source_document_date, current.source_fingerprint,
    current.batch_id
  into existing_date, existing_fingerprint, selected_batch_id
  from public.current_warehouse_replenishment current
  where current.singleton_key = 1
  for update;

  select max(source.source_document_date)
  into existing_lineage_date
  from public.current_warehouse_replenishment_sources source
  where source.singleton_key = 1;

  if coalesce(existing_lineage_date, existing_date)
      is distinct from selected_date then
    selected_batch_id := gen_random_uuid();
  end if;
  selected_batch_id := coalesce(selected_batch_id, gen_random_uuid());
  projection_changed := existing_fingerprint is distinct from calculated_fingerprint;

  insert into public.current_warehouse_replenishment(
    singleton_key, source_kind, source_arrival_id, source_order_ref,
    source_order_number, source_document_date, detected_at,
    source_fingerprint, updated_at, batch_id, business_timezone,
    source_document_count, source_line_count, mapped_line_count,
    unique_product_count
  ) values (
    1, case when selected_arrival_id is null then 'historical_bootstrap'
      else 'detected_transition' end,
    selected_arrival_id, representative.source_order_ref,
    representative.source_order_number, selected_date,
    coalesce(selected_detected_at, now()), calculated_fingerprint, now(),
    selected_batch_id, 'Europe/Chisinau', document_count, line_count,
    mapped_count, product_count
  ) on conflict (singleton_key) do update set
    source_kind = excluded.source_kind,
    source_arrival_id = excluded.source_arrival_id,
    source_order_ref = excluded.source_order_ref,
    source_order_number = excluded.source_order_number,
    source_document_date = excluded.source_document_date,
    detected_at = excluded.detected_at,
    source_fingerprint = excluded.source_fingerprint,
    updated_at = excluded.updated_at,
    batch_id = excluded.batch_id,
    business_timezone = excluded.business_timezone,
    source_document_count = excluded.source_document_count,
    source_line_count = excluded.source_line_count,
    mapped_line_count = excluded.mapped_line_count,
    unique_product_count = excluded.unique_product_count;

  if projection_changed then
    delete from public.current_warehouse_replenishment_sources
    where singleton_key = 1;

    insert into public.current_warehouse_replenishment_sources(
      singleton_key, source_order_ref, source_order_number,
      source_document_date, source_line_count, mapped_line_count
    )
    select 1, state.source_order_ref, state.source_order_number,
      state.source_document_date, count(item.line_number)::integer,
      count(product.id)::integer
    from public.supplier_order_source_states state
    left join public.supplier_order_source_items item
      on item.source_order_ref = state.source_order_ref
    left join public.catalog_products product
      on product.external_1c_id = item.external_product_ref
     and product.is_active and product.is_visible
    where state.source_document_date = selected_date
      and state.current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
      and state.is_posted and not state.is_deleted and not state.is_closed
    group by state.source_order_ref, state.source_order_number,
      state.source_document_date;

    delete from public.current_warehouse_replenishment_items
    where singleton_key = 1;

    insert into public.current_warehouse_replenishment_items(
      singleton_key, product_id, source_line_number
    )
    select 1, ranked.product_id,
      row_number() over (order by ranked.source_order_number,
        ranked.source_order_ref, ranked.line_number,
        ranked.product_id)::integer
    from (
      select distinct on (product.id) product.id as product_id,
        state.source_order_number, state.source_order_ref, item.line_number
      from public.supplier_order_source_states state
      join public.supplier_order_source_items item
        on item.source_order_ref = state.source_order_ref
      join public.catalog_products product
        on product.external_1c_id = item.external_product_ref
       and product.is_active and product.is_visible
      where state.source_document_date = selected_date
        and state.current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
        and state.is_posted and not state.is_deleted and not state.is_closed
      order by product.id, state.source_order_number,
        state.source_order_ref, item.line_number
    ) ranked;

    insert into public.current_warehouse_replenishment_item_sources(
      singleton_key, product_id, source_order_ref, source_line_number,
      source_quantity
    )
    select 1, product.id, state.source_order_ref, item.line_number,
      item.ordered_quantity
    from public.supplier_order_source_states state
    join public.supplier_order_source_items item
      on item.source_order_ref = state.source_order_ref
    join public.catalog_products product
      on product.external_1c_id = item.external_product_ref
     and product.is_active and product.is_visible
    where state.source_document_date = selected_date
      and state.current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
      and state.is_posted and not state.is_deleted and not state.is_closed;
  end if;

  update public.partner_notifications notification
  set archived_at = coalesce(notification.archived_at, now()),
    archive_reason = coalesce(notification.archive_reason,
      'duplicate_business_state')
  where notification.event_code = 'warehouse_arrival_completed'
    and notification.entity_id is distinct from selected_batch_id
    and notification.archived_at is null;

  if p_emit_notification then
    insert into public.partner_notification_events(
      company_id, event_code, event_group, domain, entity_type, entity_id,
      source_table, source_event_id, source_version, occurred_at,
      safe_payload, fingerprint
    )
    select company.id, 'warehouse_arrival_completed', 'commercial',
      'warehouse_arrivals', 'warehouse_replenishment_day',
      selected_batch_id, 'current_warehouse_replenishment', null,
      selected_date::text, coalesce(selected_detected_at, now()),
      jsonb_build_object('businessDate', selected_date,
        'productCount', product_count),
      encode(digest(concat_ws('|', 'warehouse_replenishment_day',
        company.id::text, selected_batch_id::text), 'sha256'), 'hex')
    from public.partner_companies company
    where company.status = 'active'
      and exists (
        select 1
        from public.company_memberships membership
        join public.user_profiles profile
          on profile.id = membership.user_id and profile.status = 'active'
        where membership.company_id = company.id
          and membership.status = 'active'
          and public.notification_user_has_permission(
            membership.user_id, company.id, 'catalog.view'
          )
      )
    on conflict (fingerprint) do nothing;

    insert into public.partner_notifications(
      company_id, recipient_user_id, event_code, event_group, domain,
      severity, mandatory, title, message, action_label, action_url,
      entity_type, entity_id, occurred_at, deduplication_key,
      source_event_id, expires_at, retention_until,
      email_enabled_snapshot, email_delivery_mode
    )
    select event.company_id, membership.user_id, event.event_code,
      event.event_group, event.domain, 'success', false,
      'Новое пополнение склада',
      'В витрину добавлены товары из последнего поступления.',
      'Посмотреть пополнение', '/cabinet/catalog/replenishment',
      event.entity_type, event.entity_id, event.occurred_at,
      event.fingerprint, event.id,
      event.occurred_at + interval '90 days',
      event.occurred_at + interval '13 months', false, 'off'
    from public.partner_notification_events event
    join public.company_memberships membership
      on membership.company_id = event.company_id
     and membership.status = 'active'
    join public.user_profiles profile
      on profile.id = membership.user_id and profile.status = 'active'
    where event.event_code = 'warehouse_arrival_completed'
      and event.entity_type = 'warehouse_replenishment_day'
      and event.entity_id = selected_batch_id
      and public.notification_user_has_permission(
        membership.user_id, event.company_id, 'catalog.view'
      )
    on conflict (recipient_user_id, deduplication_key) do nothing;
  end if;

  return jsonb_build_object(
    'updated', projection_changed,
    'business_date', selected_date,
    'source_document_count', document_count,
    'source_line_count', line_count,
    'mapped_line_count', mapped_count,
    'unique_product_count', product_count,
    'batch_id', selected_batch_id
  );
end;
$$;

revoke all on function
  public.reconcile_current_warehouse_replenishment_day(boolean)
from public, anon, authenticated;
grant execute on function
  public.reconcile_current_warehouse_replenishment_day(boolean)
to service_role;

alter function public.publish_exact_stock_snapshot(uuid)
  rename to publish_exact_stock_snapshot_replenishment_day_base;

create function public.publish_exact_stock_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  base_result jsonb;
  day_result jsonb;
begin
  base_result := public.publish_exact_stock_snapshot_replenishment_day_base(
    p_sync_id
  );
  day_result := public.reconcile_current_warehouse_replenishment_day(true);
  return base_result || jsonb_build_object(
    'current_warehouse_replenishment_day', day_result
  );
end;
$$;

revoke all on function
  public.publish_exact_stock_snapshot_replenishment_day_base(uuid),
  public.publish_exact_stock_snapshot(uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_exact_stock_snapshot_replenishment_day_base(uuid),
  public.publish_exact_stock_snapshot(uuid)
to service_role;

select public.reconcile_current_warehouse_replenishment_day(true);

comment on table public.current_warehouse_replenishment_sources is
  'Private source-document lineage for the current Europe/Chisinau replenishment business day.';
comment on table public.current_warehouse_replenishment_item_sources is
  'Private source-line lineage and quantities for deduplicated current replenishment catalog memberships.';
comment on function public.reconcile_current_warehouse_replenishment_day(boolean) is
  'Rebuilds one current storefront batch from all completed synchronized supplier orders on the latest business day containing an exact active catalog mapping.';

commit;
