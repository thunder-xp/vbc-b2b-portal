begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- The projection tables remain the one canonical ARRIVAL read model. Lineage
-- now identifies immutable completion events rather than one supplier-order
-- calendar day.
alter table public.current_warehouse_replenishment_sources
  add column source_arrival_id uuid references public.warehouse_arrivals(id) on delete restrict,
  add column actual_arrival_at timestamptz,
  add column expected_arrival_date date,
  add column window_position smallint,
  add column eligible_product_count integer,
  add column excluded_line_count integer;

alter table public.current_warehouse_replenishment_item_sources
  add column source_arrival_id uuid;

alter table public.current_warehouse_replenishment_items
  add column source_arrival_id uuid references public.warehouse_arrivals(id) on delete restrict,
  add column source_order_ref text references public.supplier_order_source_states(source_order_ref) on delete restrict,
  add column actual_arrival_at timestamptz,
  add column window_position smallint;

alter table public.current_warehouse_replenishment_item_sources
  drop constraint current_warehouse_replenishme_singleton_key_source_order_r_fkey,
  drop constraint current_warehouse_replenishment_item_sources_pkey;

alter table public.current_warehouse_replenishment_sources
  drop constraint current_warehouse_replenishment_sources_pkey;

-- Existing rows are a disposable derived projection. Reconciliation below
-- repopulates them from immutable warehouse-arrival history in this transaction.
delete from public.current_warehouse_replenishment_item_sources;
delete from public.current_warehouse_replenishment_sources;
delete from public.current_warehouse_replenishment_items;

alter table public.current_warehouse_replenishment_sources
  alter column source_arrival_id set not null,
  alter column actual_arrival_at set not null,
  alter column window_position set not null,
  alter column eligible_product_count set not null,
  alter column excluded_line_count set not null,
  add constraint current_warehouse_replenishment_sources_pkey
    primary key (singleton_key, source_arrival_id),
  add constraint current_warehouse_replenishment_sources_lineage_key
    unique (singleton_key, source_arrival_id, source_order_ref),
  add constraint current_warehouse_replenishment_sources_window_key
    unique (singleton_key, window_position),
  add constraint current_warehouse_replenishment_sources_window_check
    check (window_position between 1 and 3),
  add constraint current_warehouse_replenishment_sources_product_counts_check
    check (
      eligible_product_count > 0
      and excluded_line_count >= 0
      and eligible_product_count <= mapped_line_count
      and mapped_line_count <= source_line_count
    );

alter table public.current_warehouse_replenishment_item_sources
  alter column source_arrival_id set not null,
  add constraint current_warehouse_replenishment_item_sources_pkey
    primary key (
      singleton_key, product_id, source_arrival_id, source_line_number
    ),
  add constraint current_warehouse_replenishment_item_sources_arrival_fkey
    foreign key (singleton_key, source_arrival_id, source_order_ref)
    references public.current_warehouse_replenishment_sources(
      singleton_key, source_arrival_id, source_order_ref
    ) on delete cascade;

alter table public.current_warehouse_replenishment_items
  alter column source_arrival_id set not null,
  alter column source_order_ref set not null,
  alter column actual_arrival_at set not null,
  alter column window_position set not null,
  add constraint current_warehouse_replenishment_items_window_check
    check (window_position between 1 and 3),
  add constraint current_warehouse_replenishment_items_lineage_fkey
    foreign key (singleton_key, source_arrival_id, source_order_ref)
    references public.current_warehouse_replenishment_sources(
      singleton_key, source_arrival_id, source_order_ref
    ) on delete cascade;

drop index if exists public.current_warehouse_replenishment_sources_order_idx;
drop index if exists public.current_warehouse_replenishment_item_sources_order_idx;

create index current_warehouse_replenishment_sources_arrival_order_idx
  on public.current_warehouse_replenishment_sources(
    singleton_key, actual_arrival_at desc, source_order_number desc,
    source_order_ref desc, source_arrival_id desc
  );

create index current_warehouse_replenishment_item_sources_arrival_idx
  on public.current_warehouse_replenishment_item_sources(
    singleton_key, source_arrival_id, source_line_number, product_id
  );

create or replace function public.reconcile_current_warehouse_replenishment_day(
  p_emit_notification boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  securitypark_root_ref text;
  selected_arrival_ids uuid[];
  representative record;
  calculated_fingerprint text;
  existing_fingerprint text;
  selected_batch_id uuid;
  document_count integer;
  line_count integer;
  mapped_count integer;
  product_count integer;
  excluded_count integer;
  projection_changed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'current_warehouse_replenishment_day', 0
  ));

  select state.root_external_1c_id
  into securitypark_root_ref
  from public.catalog_sync_state state
  where state.id = 'daily_catalog'
    and state.root_name = 'SECURITYPARK DISTRIBUTION';

  if nullif(btrim(securitypark_root_ref), '') is null then
    return jsonb_build_object(
      'updated', false,
      'reason', 'securitypark_catalog_root_unavailable'
    );
  end if;

  select array_agg(candidate.arrival_id order by
    candidate.completed_at desc,
    candidate.source_order_number desc,
    candidate.source_order_ref desc,
    candidate.arrival_id desc)
  into selected_arrival_ids
  from (
    select arrival.id as arrival_id, arrival.completed_at,
      arrival.source_order_number, arrival.source_order_ref
    from public.warehouse_arrivals arrival
    join public.supplier_order_source_states state
      on state.source_order_ref = arrival.source_order_ref
    where arrival.completed_at <= statement_timestamp()
      and arrival.source_status_after = '585a9991-314b-11e9-a7dc-94de80db60f1'
      and state.current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
      and state.is_posted
      and not state.is_deleted
      and not state.is_closed
      and exists (
        select 1
        from public.warehouse_arrival_items item
        join public.catalog_products product
          on product.id = item.product_id
         and product.is_active
         and product.is_visible
         and product.source_root_1c_id = securitypark_root_ref
        where item.arrival_id = arrival.id
      )
    order by arrival.completed_at desc,
      arrival.source_order_number desc,
      arrival.source_order_ref desc,
      arrival.id desc
    limit 3
  ) candidate;

  if coalesce(cardinality(selected_arrival_ids), 0) = 0 then
    delete from public.current_warehouse_replenishment
    where singleton_key = 1;

    update public.partner_notifications notification
    set archived_at = coalesce(notification.archived_at, now()),
      archive_reason = coalesce(notification.archive_reason,
        'source_no_longer_relevant')
    where notification.event_code = 'warehouse_arrival_completed'
      and notification.archived_at is null;

    return jsonb_build_object(
      'updated', true,
      'reason', 'no_eligible_arrived_shipments',
      'active_shipment_count', 0,
      'unique_product_count', 0
    );
  end if;

  select arrival.id as source_arrival_id, arrival.source_order_ref,
    arrival.source_order_number, state.source_document_date,
    arrival.completed_at
  into representative
  from public.warehouse_arrivals arrival
  join public.supplier_order_source_states state
    on state.source_order_ref = arrival.source_order_ref
  where arrival.id = selected_arrival_ids[1];

  with selected_sources as (
    select arrival.id as arrival_id, arrival.source_order_ref,
      arrival.source_order_number, arrival.completed_at,
      state.source_document_date, state.expected_arrival_date,
      array_position(selected_arrival_ids, arrival.id) as window_position
    from public.warehouse_arrivals arrival
    join public.supplier_order_source_states state
      on state.source_order_ref = arrival.source_order_ref
    where arrival.id = any(selected_arrival_ids)
  ), all_lines as (
    select source.*, item.id as item_id, item.source_line_number,
      item.external_product_ref, item.external_characteristic_ref,
      item.source_ordered_quantity, item.product_id as mapped_product_id,
      product.id as eligible_product_id
    from selected_sources source
    left join public.warehouse_arrival_items item
      on item.arrival_id = source.arrival_id
    left join public.catalog_products product
      on product.id = item.product_id
     and product.is_active
     and product.is_visible
     and product.source_root_1c_id = securitypark_root_ref
  )
  select
    (select count(*) from selected_sources),
    count(item_id)::integer,
    count(item_id) filter (where mapped_product_id is not null)::integer,
    count(distinct eligible_product_id)
      filter (where eligible_product_id is not null)::integer,
    count(item_id) filter (where eligible_product_id is null)::integer,
    encode(digest(concat_ws('|',
      'arrival_last_3_eligible_v1', securitypark_root_ref,
      coalesce((select string_agg(concat_ws(':', arrival_id::text,
        completed_at::text, source_order_number, source_order_ref),
        '|' order by window_position) from selected_sources), ''),
      coalesce(string_agg(concat_ws(':', arrival_id::text,
        source_line_number::text, eligible_product_id::text,
        coalesce(source_ordered_quantity, 0)::text), '|' order by
        window_position, source_line_number, eligible_product_id)
        filter (where eligible_product_id is not null), '')
    ), 'sha256'), 'hex')
  into document_count, line_count, mapped_count, product_count,
    excluded_count, calculated_fingerprint
  from all_lines;

  select current.source_fingerprint, current.batch_id
  into existing_fingerprint, selected_batch_id
  from public.current_warehouse_replenishment current
  where current.singleton_key = 1
  for update;

  projection_changed := existing_fingerprint is distinct from calculated_fingerprint;
  if projection_changed or selected_batch_id is null then
    selected_batch_id := gen_random_uuid();
  end if;

  insert into public.current_warehouse_replenishment(
    singleton_key, source_kind, source_arrival_id, source_order_ref,
    source_order_number, source_document_date, detected_at,
    source_fingerprint, updated_at, batch_id, business_timezone,
    source_document_count, source_line_count, mapped_line_count,
    unique_product_count
  ) values (
    1, 'detected_transition', representative.source_arrival_id,
    representative.source_order_ref, representative.source_order_number,
    representative.source_document_date, representative.completed_at,
    calculated_fingerprint, now(), selected_batch_id, 'Europe/Chisinau',
    document_count, line_count, mapped_count, product_count
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
      singleton_key, source_arrival_id, source_order_ref,
      source_order_number, source_document_date, actual_arrival_at,
      expected_arrival_date, window_position, source_line_count,
      mapped_line_count, eligible_product_count, excluded_line_count
    )
    select 1, arrival.id, arrival.source_order_ref,
      arrival.source_order_number, state.source_document_date,
      arrival.completed_at, state.expected_arrival_date,
      array_position(selected_arrival_ids, arrival.id)::smallint,
      count(item.id)::integer,
      count(item.id) filter (where item.product_id is not null)::integer,
      count(distinct product.id)::integer,
      count(item.id) filter (where product.id is null)::integer
    from public.warehouse_arrivals arrival
    join public.supplier_order_source_states state
      on state.source_order_ref = arrival.source_order_ref
    left join public.warehouse_arrival_items item
      on item.arrival_id = arrival.id
    left join public.catalog_products product
      on product.id = item.product_id
     and product.is_active
     and product.is_visible
     and product.source_root_1c_id = securitypark_root_ref
    where arrival.id = any(selected_arrival_ids)
    group by arrival.id, state.source_document_date,
      state.expected_arrival_date;

    delete from public.current_warehouse_replenishment_items
    where singleton_key = 1;

    insert into public.current_warehouse_replenishment_items(
      singleton_key, product_id, source_line_number,
      source_arrival_id, source_order_ref, actual_arrival_at,
      window_position
    )
    with product_sources as (
      select product.id as product_id, arrival.id as source_arrival_id,
        arrival.source_order_ref, arrival.completed_at,
        array_position(selected_arrival_ids, arrival.id)::smallint
          as window_position,
        item.source_line_number,
        row_number() over (
          partition by product.id
          order by array_position(selected_arrival_ids, arrival.id),
            item.source_line_number, arrival.id
        ) as provenance_rank
      from public.warehouse_arrivals arrival
      join public.warehouse_arrival_items item
        on item.arrival_id = arrival.id
      join public.catalog_products product
        on product.id = item.product_id
       and product.is_active
       and product.is_visible
       and product.source_root_1c_id = securitypark_root_ref
      where arrival.id = any(selected_arrival_ids)
    ), newest_sources as (
      select * from product_sources where provenance_rank = 1
    )
    select 1, source.product_id,
      row_number() over (order by source.window_position,
        source.source_line_number, source.product_id)::integer,
      source.source_arrival_id, source.source_order_ref,
      source.completed_at, source.window_position
    from newest_sources source;

    insert into public.current_warehouse_replenishment_item_sources(
      singleton_key, product_id, source_arrival_id, source_order_ref,
      source_line_number, source_quantity
    )
    select 1, product.id, arrival.id, arrival.source_order_ref,
      item.source_line_number, coalesce(item.source_ordered_quantity, 0)
    from public.warehouse_arrivals arrival
    join public.warehouse_arrival_items item
      on item.arrival_id = arrival.id
    join public.catalog_products product
      on product.id = item.product_id
     and product.is_active
     and product.is_visible
     and product.source_root_1c_id = securitypark_root_ref
    where arrival.id = any(selected_arrival_ids);
  end if;

  update public.partner_notifications notification
  set archived_at = coalesce(notification.archived_at, now()),
    archive_reason = coalesce(notification.archive_reason,
      'duplicate_business_state')
  where notification.event_code = 'warehouse_arrival_completed'
    and notification.entity_id is distinct from selected_batch_id
    and notification.archived_at is null;

  if p_emit_notification and projection_changed then
    insert into public.partner_notification_events(
      company_id, event_code, event_group, domain, entity_type, entity_id,
      source_table, source_event_id, source_version, occurred_at,
      safe_payload, fingerprint
    )
    select company.id, 'warehouse_arrival_completed', 'commercial',
      'warehouse_arrivals', 'warehouse_replenishment_window',
      selected_batch_id, 'current_warehouse_replenishment', null,
      calculated_fingerprint, representative.completed_at,
      jsonb_build_object('productCount', product_count,
        'shipmentCount', document_count),
      encode(digest(concat_ws('|', 'warehouse_replenishment_window',
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
      'Новое поступление на склад',
      'В подборку добавлены товары из последних поступлений.',
      'Посмотреть поступление', '/cabinet/catalog/replenishment',
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
      and event.entity_type = 'warehouse_replenishment_window'
      and event.entity_id = selected_batch_id
      and public.notification_user_has_permission(
        membership.user_id, event.company_id, 'catalog.view'
      )
    on conflict (recipient_user_id, deduplication_key) do nothing;
  end if;

  return jsonb_build_object(
    'updated', projection_changed,
    'active_shipment_count', document_count,
    'source_line_count', line_count,
    'mapped_line_count', mapped_count,
    'excluded_line_count', excluded_count,
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

create function public.get_partner_current_warehouse_replenishment_v2(
  p_company_id uuid,
  p_limit integer default 5,
  p_offset integer default 0
)
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
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
  then
    raise exception 'Warehouse replenishment access denied.' using errcode = '42501';
  end if;

  if p_limit not between 1 and 48 or p_offset < 0 or p_offset > 10000 then
    raise exception 'Warehouse replenishment pagination is invalid.' using errcode = '22023';
  end if;

  with eligible as (
    select item.product_id, item.source_line_number
    from public.current_warehouse_replenishment_items item
    join public.catalog_products product
      on product.id = item.product_id
     and product.is_active
     and product.is_visible
    where item.singleton_key = 1
  ), page as (
    select * from eligible
    order by source_line_number, product_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'productId', page.product_id,
      'sourceLineNumber', page.source_line_number
    ) order by page.source_line_number, page.product_id), '[]'::jsonb),
    'totalCount', (select count(*) from eligible),
    'limit', p_limit,
    'offset', p_offset
  )
  into result
  from page;

  return coalesce(result, jsonb_build_object(
    'items', '[]'::jsonb,
    'totalCount', 0,
    'limit', p_limit,
    'offset', p_offset
  ));
end;
$$;

revoke all on function public.get_partner_current_warehouse_replenishment_v2(
  uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.get_partner_current_warehouse_replenishment_v2(
  uuid, integer, integer
) to authenticated;

-- Preserve canonical shipment ordering in the partner full-list RPC while
-- retaining every existing filter, commercial projection, and page boundary.
do $migration$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(
    'public.catalog_partner_page_category_set_base(uuid,uuid,uuid[],uuid,text,text,jsonb,text,text,integer,integer)'::regprocedure
  ) into definition;

  changed := replace(definition,
    $before$      case when effective_sort = 'default'
        then commercial.sort_order end,$before$,
    $after$      case when effective_sort = 'default'
          and p_merchandising_label = 'REPLENISHMENT' then (
        select replenishment.source_line_number
        from public.current_warehouse_replenishment_items replenishment
        where replenishment.singleton_key = 1
          and replenishment.product_id = commercial.id
      ) end,
      case when effective_sort = 'default'
          and p_merchandising_label is distinct from 'REPLENISHMENT'
        then commercial.sort_order end,$after$
  );

  if changed = definition
    or changed not like '%p_merchandising_label = ''REPLENISHMENT''%'
  then
    raise exception 'Partner ARRIVAL ordering patch did not match the current catalog projection.';
  end if;

  execute changed;
end
$migration$;

-- Public retail remains a separate visibility projection over the same
-- canonical membership. Remove stock-first ordering so shipment freshness is
-- not inverted on B2C pages.
do $migration$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(
    'public.list_public_retail_products_snapshot_v2(text,text,text,text,jsonb,text,integer,integer)'::regprocedure
  ) into definition;

  changed := replace(definition,
    $before$      case when p_mode = 'replenishment' and availability in ('in_stock','low_stock') then 0
           when p_mode = 'replenishment' then 1 end,
$before$,
    ''
  );
  changed := replace(changed,
    $before$      case when p_mode = 'replenishment' and page.availability in ('in_stock','low_stock') then 0
           when p_mode = 'replenishment' then 1 end,
$before$,
    ''
  );

  if changed = definition
    or changed like '%p_mode = ''replenishment'' and availability in%'
    or changed like '%p_mode = ''replenishment'' and page.availability in%'
  then
    raise exception 'Public ARRIVAL ordering patch did not match the current retail projection.';
  end if;

  execute changed;
end
$migration$;

-- Dashboard preview gets a dedicated bounded field from the canonical
-- projection inside its existing single selections RPC. Freshest shipment
-- positions are considered first; rotation is session-stable within a batch.
create function public.get_or_refresh_partner_dashboard_selections_v7(
  p_user_id uuid, p_company_id uuid, p_login_generation text,
  p_repeat_period_days integer default 365,
  p_popular_period_days integer default 365,
  p_new_period_days integer default 365,
  p_hot_period_days integer default 365
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  base jsonb;
  arrival_products jsonb := '[]'::jsonb;
  arrival_count integer := 0;
  arrival_fingerprint text := '';
begin
  base := public.get_or_refresh_partner_dashboard_selections_v6(
    p_user_id, p_company_id, p_login_generation,
    p_repeat_period_days, p_popular_period_days,
    p_new_period_days, p_hot_period_days
  );

  with candidates as (
    select replenishment.product_id, replenishment.window_position,
      replenishment.source_line_number, count(*) over ()::integer as total_count
    from public.current_warehouse_replenishment_items replenishment
    join public.catalog_products product
      on product.id = replenishment.product_id
     and product.is_active
     and product.is_visible
    where replenishment.singleton_key = 1
  ), chosen as (
    select *
    from candidates
    order by window_position,
      pg_catalog.md5(p_login_generation || ':' || product_id::text),
      source_line_number, product_id
    limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', product.id,
      'sku', product.sku,
      'name', product.name,
      'slug', product.slug,
      'imageUrl', coalesce(product.image_source_url, product.image_url, (
        select image.url
        from public.catalog_product_images image
        where image.product_id = product.id
        order by image.is_primary desc, image.sort_order, image.id
        limit 1
      )),
      'categoryId', product.category_id,
      'categoryName', category.name,
      'labelCodes', '[]'::jsonb,
      'sourceCodes', '["ARRIVAL"]'::jsonb
    ) order by chosen.window_position,
      pg_catalog.md5(p_login_generation || ':' || product.id::text),
      chosen.source_line_number, product.id), '[]'::jsonb),
    coalesce(max(chosen.total_count), 0)
  into arrival_products, arrival_count
  from chosen
  join public.catalog_products product on product.id = chosen.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  select coalesce(current.source_fingerprint, '')
  into arrival_fingerprint
  from public.current_warehouse_replenishment current
  where current.singleton_key = 1;

  return base || jsonb_build_object(
    'arrivalProducts', arrival_products,
    'arrivalCandidateCount', arrival_count,
    'arrivalSourceFingerprint', coalesce(arrival_fingerprint, '')
  );
end;
$$;

revoke all on function public.get_or_refresh_partner_dashboard_selections_v7(
  uuid, uuid, text, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.get_or_refresh_partner_dashboard_selections_v7(
  uuid, uuid, text, integer, integer, integer, integer
) to service_role;

select public.reconcile_current_warehouse_replenishment_day(false);

comment on table public.current_warehouse_replenishment is
  'Private canonical rolling window of the latest three eligible arrived shipment batches.';
comment on table public.current_warehouse_replenishment_sources is
  'Private immutable arrival-event lineage for the latest three eligible SECURITYPARK DISTRIBUTION shipments.';
comment on table public.current_warehouse_replenishment_item_sources is
  'Private source-line lineage for every eligible product membership in the active three-shipment ARRIVAL window.';
comment on table public.current_warehouse_replenishment_items is
  'Deduplicated current ARRIVAL product membership; newest active shipment provenance wins and source_line_number is the canonical display order.';
comment on function public.reconcile_current_warehouse_replenishment_day(boolean) is
  'Rebuilds ARRIVAL from the latest three actually completed eligible shipment events; zero-eligible shipments do not consume slots and no time expiry applies.';
comment on function public.get_or_refresh_partner_dashboard_selections_v7(
  uuid, uuid, text, integer, integer, integer, integer
) is 'Single Dashboard selections RPC with a bounded session-stable preview from canonical ARRIVAL membership.';
comment on function public.get_partner_current_warehouse_replenishment_v2(
  uuid, integer, integer
) is 'Authorized bounded ARRIVAL preview with the exact total distinct active product count.';

commit;
