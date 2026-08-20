begin;

alter table public.supplier_order_document_stage
  add column source_order_number text,
  add column source_document_date date,
  add column organization_ref text,
  add column warehouse_ref text;

create table public.supplier_order_item_stage (
  sync_id uuid not null,
  external_supplier_order_ref text not null,
  line_number integer not null,
  external_product_ref text not null,
  external_characteristic_ref text not null,
  ordered_quantity numeric(18,3) not null,
  unit text,
  expected_arrival_date date,
  primary key (sync_id, external_supplier_order_ref, line_number),
  foreign key (sync_id, external_supplier_order_ref)
    references public.supplier_order_document_stage(sync_id, external_supplier_order_ref)
    on delete cascade,
  check (external_supplier_order_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and external_supplier_order_ref <> '00000000-0000-0000-0000-000000000000'),
  check (external_product_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and external_product_ref <> '00000000-0000-0000-0000-000000000000'),
  check (external_characteristic_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  check (ordered_quantity >= 0)
);

create table public.supplier_order_source_states (
  source_order_ref text primary key,
  source_order_number text not null default '',
  source_document_date date,
  current_state_ref text,
  is_posted boolean not null,
  is_deleted boolean not null,
  is_closed boolean not null,
  expected_arrival_date date,
  organization_ref text,
  warehouse_ref text,
  source_version text,
  last_seen_sync_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (source_order_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and source_order_ref <> '00000000-0000-0000-0000-000000000000'),
  check (current_state_ref is null or (
    current_state_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and current_state_ref <> '00000000-0000-0000-0000-000000000000')),
  check (organization_ref is null or (
    organization_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and organization_ref <> '00000000-0000-0000-0000-000000000000')),
  check (warehouse_ref is null or (
    warehouse_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and warehouse_ref <> '00000000-0000-0000-0000-000000000000'))
);

create table public.supplier_order_source_items (
  source_order_ref text not null references public.supplier_order_source_states(source_order_ref) on delete restrict,
  line_number integer not null,
  external_product_ref text not null,
  external_characteristic_ref text not null,
  ordered_quantity numeric(18,3) not null,
  unit text,
  expected_arrival_date date,
  last_seen_sync_id uuid not null,
  last_seen_at timestamptz not null default now(),
  primary key (source_order_ref, line_number),
  check (external_product_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and external_product_ref <> '00000000-0000-0000-0000-000000000000'),
  check (external_characteristic_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  check (ordered_quantity >= 0)
);

create table public.warehouse_arrivals (
  id uuid primary key default gen_random_uuid(),
  source_order_ref text not null,
  source_order_number text not null default '',
  source_status_before text not null,
  source_status_after text not null,
  completed_at timestamptz not null,
  warehouse_ref text,
  organization_ref text,
  detected_at timestamptz not null default now(),
  source_updated_at timestamptz not null,
  source_version text,
  source_sync_id uuid not null,
  fingerprint text not null unique,
  source_line_count integer not null default 0,
  mapped_product_count integer not null default 0,
  unmapped_line_count integer not null default 0,
  silent_bootstrap boolean not null default false,
  created_at timestamptz not null default now(),
  check (source_status_before = '02166cc3-bf4b-11e9-a7fe-000c2988d323'),
  check (source_status_after = '585a9991-314b-11e9-a7dc-94de80db60f1'),
  check (source_order_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and source_order_ref <> '00000000-0000-0000-0000-000000000000'),
  check (organization_ref is null or (
    organization_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and organization_ref <> '00000000-0000-0000-0000-000000000000')),
  check (warehouse_ref is null or (
    warehouse_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and warehouse_ref <> '00000000-0000-0000-0000-000000000000')),
  check (fingerprint ~ '^[0-9a-f]{64}$')
);

create table public.warehouse_arrival_items (
  id uuid primary key default gen_random_uuid(),
  arrival_id uuid not null references public.warehouse_arrivals(id) on delete restrict,
  source_line_number integer not null,
  external_product_ref text not null,
  external_characteristic_ref text not null,
  product_id uuid references public.catalog_products(id) on delete restrict,
  source_ordered_quantity numeric(18,3),
  source_unit text,
  source_expected_arrival_date date,
  created_at timestamptz not null default now(),
  unique (arrival_id, source_line_number),
  check (external_product_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and external_product_ref <> '00000000-0000-0000-0000-000000000000'),
  check (external_characteristic_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  check (source_ordered_quantity is null or source_ordered_quantity >= 0)
);

create table public.warehouse_arrival_company_visibility (
  arrival_id uuid not null references public.warehouse_arrivals(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  eligible_product_count integer not null,
  created_at timestamptz not null default now(),
  primary key (arrival_id, company_id),
  check (eligible_product_count > 0)
);

create table public.warehouse_arrival_user_state (
  arrival_id uuid not null references public.warehouse_arrivals(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  user_id uuid not null references public.user_profiles(id) on delete restrict,
  seen_at timestamptz not null default now(),
  primary key (arrival_id, company_id, user_id)
);

create index supplier_order_source_states_status_idx
  on public.supplier_order_source_states(current_state_ref, source_document_date desc);
create index supplier_order_source_items_product_idx
  on public.supplier_order_source_items(external_product_ref);
create index warehouse_arrivals_completed_idx
  on public.warehouse_arrivals(completed_at desc, id desc);
create index warehouse_arrival_items_product_idx
  on public.warehouse_arrival_items(product_id, arrival_id) where product_id is not null;
create index warehouse_arrival_visibility_company_idx
  on public.warehouse_arrival_company_visibility(company_id, arrival_id);
create index warehouse_arrival_user_state_user_idx
  on public.warehouse_arrival_user_state(user_id, company_id, seen_at desc);
create index warehouse_arrival_user_state_company_idx
  on public.warehouse_arrival_user_state(company_id, user_id, arrival_id);

alter table public.supplier_order_item_stage enable row level security;
alter table public.supplier_order_source_states enable row level security;
alter table public.supplier_order_source_items enable row level security;
alter table public.warehouse_arrivals enable row level security;
alter table public.warehouse_arrival_items enable row level security;
alter table public.warehouse_arrival_company_visibility enable row level security;
alter table public.warehouse_arrival_user_state enable row level security;

revoke all on public.supplier_order_item_stage, public.supplier_order_source_states,
  public.supplier_order_source_items, public.warehouse_arrivals,
  public.warehouse_arrival_items, public.warehouse_arrival_company_visibility,
  public.warehouse_arrival_user_state from public, anon, authenticated;
grant select, insert, update, delete on public.supplier_order_item_stage,
  public.supplier_order_source_states, public.supplier_order_source_items to service_role;
grant select, insert on public.warehouse_arrivals, public.warehouse_arrival_items,
  public.warehouse_arrival_company_visibility to service_role;
grant select, insert, update on public.warehouse_arrival_user_state to service_role;

create function public.prevent_warehouse_arrival_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Warehouse arrival history is immutable.' using errcode = 'PT409';
end;
$$;

create trigger warehouse_arrivals_immutable
before update or delete on public.warehouse_arrivals
for each row execute function public.prevent_warehouse_arrival_mutation();
create trigger warehouse_arrival_items_immutable
before update or delete on public.warehouse_arrival_items
for each row execute function public.prevent_warehouse_arrival_mutation();

revoke all on function public.prevent_warehouse_arrival_mutation()
  from public, anon, authenticated;

create function public.list_partner_warehouse_arrivals(
  p_company_id uuid,
  p_from date default null,
  p_to date default null,
  p_brand_id uuid default null,
  p_category_id uuid default null,
  p_availability text default 'all',
  p_unseen_only boolean default false,
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path = public
set row_security = off
as $$
declare result jsonb;
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view') then
    raise exception 'Warehouse arrival access denied.' using errcode = '42501';
  end if;
  if p_availability not in ('all', 'in_stock', 'out_of_stock')
    or p_limit < 1 or p_limit > 50 or p_offset < 0 then
    raise exception 'Warehouse arrival filters are invalid.' using errcode = '22023';
  end if;

  with filtered as (
    select arrival.id, arrival.completed_at,
      count(distinct item.product_id)::integer as product_count,
      count(distinct item.product_id) filter (
        where stock.is_published and stock.available_quantity > 0
      )::integer as available_product_count,
      coalesce((
        select sum(current_stock.available_quantity)
        from (
          select distinct mapped.product_id
          from public.warehouse_arrival_items mapped
          where mapped.arrival_id = arrival.id and mapped.product_id is not null
        ) product_ids
        join public.product_stock_totals current_stock
          on current_stock.product_id = product_ids.product_id
         and current_stock.is_published
         and current_stock.available_quantity > 0
      ), 0)::numeric as available_units,
      exists (
        select 1 from public.warehouse_arrival_user_state state
        where state.arrival_id = arrival.id
          and state.company_id = p_company_id
          and state.user_id = auth.uid()
      ) as seen
    from public.warehouse_arrivals arrival
    join public.warehouse_arrival_company_visibility visibility
      on visibility.arrival_id = arrival.id and visibility.company_id = p_company_id
    join public.warehouse_arrival_items item on item.arrival_id = arrival.id
    join public.catalog_products product
      on product.id = item.product_id and product.is_active and product.is_visible
    left join public.product_stock_totals stock on stock.product_id = product.id
    where not arrival.silent_bootstrap
      and (p_from is null or arrival.completed_at::date >= p_from)
      and (p_to is null or arrival.completed_at::date <= p_to)
      and exists (
        select 1
        from public.warehouse_arrival_items filter_item
        join public.catalog_products filter_product
          on filter_product.id = filter_item.product_id
         and filter_product.is_active and filter_product.is_visible
        left join public.product_stock_totals filter_stock
          on filter_stock.product_id = filter_product.id
        where filter_item.arrival_id = arrival.id
          and (p_brand_id is null or filter_product.brand_id = p_brand_id)
          and (p_category_id is null or filter_product.category_id = p_category_id)
          and (
            p_availability = 'all'
            or p_availability = 'in_stock'
              and filter_stock.is_published and filter_stock.available_quantity > 0
            or p_availability = 'out_of_stock'
              and not coalesce(filter_stock.is_published and filter_stock.available_quantity > 0, false)
          )
      )
      and (not p_unseen_only or not exists (
        select 1 from public.warehouse_arrival_user_state state
        where state.arrival_id = arrival.id
          and state.company_id = p_company_id
          and state.user_id = auth.uid()
      ))
    group by arrival.id, arrival.completed_at
  ), paged as (
    select * from filtered
    order by completed_at desc, id desc
    offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', page.id,
      'completedAt', page.completed_at,
      'productCount', page.product_count,
      'availableProductCount', page.available_product_count,
      'availableUnits', page.available_units,
      'seen', page.seen
    ) order by page.completed_at desc, page.id desc) from paged page), '[]'::jsonb),
    'totalCount', (select count(*) from filtered)
  ) into result;
  return result;
end;
$$;

create function public.get_partner_warehouse_arrival(
  p_company_id uuid,
  p_arrival_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path = public
set row_security = off
as $$
declare result jsonb;
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
    or not exists (
      select 1 from public.warehouse_arrival_company_visibility visibility
      where visibility.arrival_id = p_arrival_id and visibility.company_id = p_company_id
    ) then
    raise exception 'Warehouse arrival access denied.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', arrival.id,
    'completedAt', arrival.completed_at,
    'productCount', count(distinct item.product_id),
    'seen', exists (
      select 1 from public.warehouse_arrival_user_state state
      where state.arrival_id = arrival.id
        and state.company_id = p_company_id
        and state.user_id = auth.uid()
    ),
    'productIds', coalesce(jsonb_agg(distinct item.product_id)
      filter (where item.product_id is not null), '[]'::jsonb)
  ) into result
  from public.warehouse_arrivals arrival
  join public.warehouse_arrival_items item on item.arrival_id = arrival.id
  join public.catalog_products product
    on product.id = item.product_id and product.is_active and product.is_visible
  where arrival.id = p_arrival_id and not arrival.silent_bootstrap
  group by arrival.id;

  return result;
end;
$$;

create function public.mark_partner_warehouse_arrival_seen(
  p_company_id uuid,
  p_arrival_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare actor uuid := auth.uid();
begin
  if actor is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
    or not exists (
      select 1 from public.warehouse_arrival_company_visibility visibility
      where visibility.arrival_id = p_arrival_id and visibility.company_id = p_company_id
    ) then
    raise exception 'Warehouse arrival access denied.' using errcode = '42501';
  end if;

  insert into public.warehouse_arrival_user_state(arrival_id, company_id, user_id)
  values (p_arrival_id, p_company_id, actor)
  on conflict (arrival_id, company_id, user_id) do nothing;

  update public.partner_notifications
  set read_at = coalesce(read_at, now())
  where company_id = p_company_id
    and recipient_user_id = actor
    and entity_type = 'warehouse_arrival'
    and entity_id = p_arrival_id
    and event_code = 'warehouse_arrival_completed';

  return jsonb_build_object('seen', true);
end;
$$;

revoke all on function
  public.list_partner_warehouse_arrivals(uuid,date,date,uuid,uuid,text,boolean,integer,integer),
  public.get_partner_warehouse_arrival(uuid,uuid),
  public.mark_partner_warehouse_arrival_seen(uuid,uuid)
from public, anon, authenticated;
grant execute on function
  public.list_partner_warehouse_arrivals(uuid,date,date,uuid,uuid,text,boolean,integer,integer),
  public.get_partner_warehouse_arrival(uuid,uuid),
  public.mark_partner_warehouse_arrival_seen(uuid,uuid)
to authenticated;

alter table public.partner_notification_events
  drop constraint partner_notification_events_code_check,
  add constraint partner_notification_events_code_check
    check (event_code in ('order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected','service_history_accepted','service_history_ready_for_pickup','service_history_issued','installation_offer','warehouse_arrival_completed'));
alter table public.partner_notifications
  drop constraint partner_notifications_event_code_check,
  add constraint partner_notifications_event_code_check
    check (event_code in ('order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected','service_history_accepted','service_history_ready_for_pickup','service_history_issued','installation_offer','warehouse_arrival_completed'));

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean language sql immutable set search_path = public as $$
  select value = '/cabinet' or value = '/cabinet/installation-orders'
    or value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value ~ '^/cabinet/service/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/service/history/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/support/[0-9a-f-]{36}$'
    or value = '/cabinet/reservation-requests'
    or value = '/cabinet/company/users'
    or value ~ '^/cabinet/catalog/[a-z0-9-]+$'
    or value = '/cabinet/cart'
    or value = '/cabinet/offers'
    or value ~ '^/cabinet/offers/[0-9a-f-]{36}$'
    or value = '/cabinet/documents'
    or value ~ '^/cabinet/documents/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/arrivals/[0-9a-f-]{36}$'
$$;

alter function public.publish_exact_stock_snapshot(uuid)
  rename to publish_exact_stock_snapshot_warehouse_arrival_base;

create function public.publish_exact_stock_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql security invoker
set search_path = public, extensions
as $$
declare
  base_result jsonb;
  snapshot_time timestamptz;
  arrival_count integer := 0;
  notification_count integer := 0;
begin
  select state.snapshot_time into snapshot_time
  from public.stock_sync_state state
  where state.id = 'exact_stock'
    and state.active_sync_id = p_sync_id
    and state.scan_complete;
  if snapshot_time is null then
    raise exception 'Warehouse arrival detection requires a complete stock snapshot.';
  end if;

  insert into public.warehouse_arrivals(
    source_order_ref, source_order_number, source_status_before,
    source_status_after, completed_at, warehouse_ref, organization_ref,
    source_updated_at, source_version, source_sync_id, fingerprint,
    source_line_count, mapped_product_count, unmapped_line_count
  )
  select stage.external_supplier_order_ref,
    coalesce(stage.source_order_number, ''),
    previous.current_state_ref, stage.external_state_ref,
    snapshot_time, stage.warehouse_ref, stage.organization_ref,
    snapshot_time, stage.source_version, p_sync_id,
    encode(digest(concat_ws('|', stage.external_supplier_order_ref,
      previous.current_state_ref, stage.external_state_ref,
      coalesce(previous.source_version, ''), coalesce(stage.source_version, '')),
      'sha256'), 'hex'),
    (select count(*) from public.supplier_order_item_stage item
      where item.sync_id = p_sync_id
        and item.external_supplier_order_ref = stage.external_supplier_order_ref),
    (select count(distinct product.id)
      from public.supplier_order_item_stage item
      join public.catalog_products product
        on product.external_1c_id = item.external_product_ref
       and product.is_active and product.is_visible
      where item.sync_id = p_sync_id
        and item.external_supplier_order_ref = stage.external_supplier_order_ref),
    (select count(*)
      from public.supplier_order_item_stage item
      left join public.catalog_products product
        on product.external_1c_id = item.external_product_ref
       and product.is_active and product.is_visible
      where item.sync_id = p_sync_id
        and item.external_supplier_order_ref = stage.external_supplier_order_ref
        and product.id is null)
  from public.supplier_order_document_stage stage
  join public.supplier_order_source_states previous
    on previous.source_order_ref = stage.external_supplier_order_ref
  where stage.sync_id = p_sync_id
    and previous.current_state_ref = '02166cc3-bf4b-11e9-a7fe-000c2988d323'
    and stage.external_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
    and stage.is_posted and not stage.is_deleted and not stage.is_closed
  on conflict (fingerprint) do nothing;
  get diagnostics arrival_count = row_count;

  insert into public.warehouse_arrival_items(
    arrival_id, source_line_number, external_product_ref,
    external_characteristic_ref, product_id, source_ordered_quantity,
    source_unit, source_expected_arrival_date
  )
  select arrival.id, item.line_number, item.external_product_ref,
    item.external_characteristic_ref, product.id, item.ordered_quantity,
    item.unit, item.expected_arrival_date
  from public.warehouse_arrivals arrival
  join public.supplier_order_item_stage item
    on item.sync_id = p_sync_id
   and item.external_supplier_order_ref = arrival.source_order_ref
  left join public.catalog_products product
    on product.external_1c_id = item.external_product_ref
   and product.is_active and product.is_visible
  where arrival.source_sync_id = p_sync_id
  on conflict (arrival_id, source_line_number) do nothing;

  insert into public.warehouse_arrival_company_visibility(
    arrival_id, company_id, eligible_product_count
  )
  select arrival.id, company.id, arrival.mapped_product_count
  from public.warehouse_arrivals arrival
  cross join public.partner_companies company
  where arrival.source_sync_id = p_sync_id
    and not arrival.silent_bootstrap
    and arrival.mapped_product_count > 0
    and company.status = 'active'
    and exists (
      select 1
      from public.company_memberships membership
      join public.user_profiles profile on profile.id = membership.user_id
      where membership.company_id = company.id
        and membership.status = 'active'
        and profile.status = 'active'
        and public.notification_user_has_permission(
          membership.user_id, company.id, 'catalog.view'
        )
    )
  on conflict (arrival_id, company_id) do nothing;

  insert into public.partner_notification_events(
    company_id, event_code, event_group, domain, entity_type, entity_id,
    source_table, source_event_id, source_version, occurred_at,
    safe_payload, fingerprint
  )
  select visibility.company_id, 'warehouse_arrival_completed', 'commercial',
    'warehouse_arrivals', 'warehouse_arrival', arrival.id,
    'warehouse_arrivals', null, arrival.fingerprint, arrival.completed_at,
    jsonb_build_object('productCount', visibility.eligible_product_count),
    encode(digest(concat_ws('|', 'warehouse_arrival_completed',
      visibility.company_id::text, arrival.id::text, arrival.fingerprint),
      'sha256'), 'hex')
  from public.warehouse_arrivals arrival
  join public.warehouse_arrival_company_visibility visibility
    on visibility.arrival_id = arrival.id
  where arrival.source_sync_id = p_sync_id
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
    'На склад поступили товары из новой поставки.',
    'Посмотреть поступление',
    '/cabinet/arrivals/' || event.entity_id::text,
    event.entity_type, event.entity_id, event.occurred_at,
    event.fingerprint, event.id,
    event.occurred_at + interval '90 days',
    event.occurred_at + interval '13 months',
    false, 'off'
  from public.partner_notification_events event
  join public.company_memberships membership
    on membership.company_id = event.company_id and membership.status = 'active'
  join public.user_profiles profile
    on profile.id = membership.user_id and profile.status = 'active'
  where event.event_code = 'warehouse_arrival_completed'
    and event.source_version in (
      select arrival.fingerprint from public.warehouse_arrivals arrival
      where arrival.source_sync_id = p_sync_id
    )
    and public.notification_user_has_permission(
      membership.user_id, event.company_id, 'catalog.view'
    )
  on conflict (recipient_user_id, deduplication_key) do nothing;
  get diagnostics notification_count = row_count;

  insert into public.supplier_order_source_states(
    source_order_ref, source_order_number, source_document_date,
    current_state_ref, is_posted, is_deleted, is_closed,
    expected_arrival_date, organization_ref, warehouse_ref, source_version,
    last_seen_sync_id, last_seen_at
  )
  select stage.external_supplier_order_ref,
    coalesce(stage.source_order_number, ''), stage.source_document_date,
    stage.external_state_ref, stage.is_posted, stage.is_deleted, stage.is_closed,
    stage.expected_arrival_date, stage.organization_ref, stage.warehouse_ref,
    stage.source_version, p_sync_id, snapshot_time
  from public.supplier_order_document_stage stage
  where stage.sync_id = p_sync_id
  on conflict (source_order_ref) do update set
    source_order_number = excluded.source_order_number,
    source_document_date = excluded.source_document_date,
    current_state_ref = excluded.current_state_ref,
    is_posted = excluded.is_posted,
    is_deleted = excluded.is_deleted,
    is_closed = excluded.is_closed,
    expected_arrival_date = excluded.expected_arrival_date,
    organization_ref = excluded.organization_ref,
    warehouse_ref = excluded.warehouse_ref,
    source_version = excluded.source_version,
    last_seen_sync_id = excluded.last_seen_sync_id,
    last_seen_at = excluded.last_seen_at;

  delete from public.supplier_order_source_items existing
  where exists (
    select 1 from public.supplier_order_document_stage document
    where document.sync_id = p_sync_id
      and document.external_supplier_order_ref = existing.source_order_ref
  )
  and not exists (
    select 1 from public.supplier_order_item_stage staged
    where staged.sync_id = p_sync_id
      and staged.external_supplier_order_ref = existing.source_order_ref
      and staged.line_number = existing.line_number
  );

  insert into public.supplier_order_source_items(
    source_order_ref, line_number, external_product_ref,
    external_characteristic_ref, ordered_quantity, unit,
    expected_arrival_date, last_seen_sync_id, last_seen_at
  )
  select item.external_supplier_order_ref, item.line_number,
    item.external_product_ref, item.external_characteristic_ref,
    item.ordered_quantity, item.unit, item.expected_arrival_date,
    p_sync_id, snapshot_time
  from public.supplier_order_item_stage item
  where item.sync_id = p_sync_id
  on conflict (source_order_ref, line_number) do update set
    external_product_ref = excluded.external_product_ref,
    external_characteristic_ref = excluded.external_characteristic_ref,
    ordered_quantity = excluded.ordered_quantity,
    unit = excluded.unit,
    expected_arrival_date = excluded.expected_arrival_date,
    last_seen_sync_id = excluded.last_seen_sync_id,
    last_seen_at = excluded.last_seen_at;

  base_result := public.publish_exact_stock_snapshot_warehouse_arrival_base(p_sync_id);
  return base_result || jsonb_build_object(
    'warehouse_arrivals_created', arrival_count,
    'warehouse_arrival_notifications_created', notification_count
  );
end;
$$;

revoke all on function
  public.publish_exact_stock_snapshot_warehouse_arrival_base(uuid),
  public.publish_exact_stock_snapshot(uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_exact_stock_snapshot_warehouse_arrival_base(uuid),
  public.publish_exact_stock_snapshot(uuid)
to service_role;

create function public.get_partner_workspace_dashboard_v4(p_company_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
  arrival_item jsonb;
  current_attention jsonb;
  attention_count integer;
begin
  result := public.get_partner_workspace_dashboard_v3(p_company_id);

  with unseen as (
    select notification.*, arrival.mapped_product_count,
      row_number() over (order by notification.occurred_at desc, notification.id desc) as ordinal,
      count(*) over ()::integer as arrival_count
    from public.partner_notifications notification
    join public.warehouse_arrivals arrival on arrival.id = notification.entity_id
    where notification.company_id = p_company_id
      and notification.recipient_user_id = auth.uid()
      and notification.event_code = 'warehouse_arrival_completed'
      and notification.read_at is null
      and notification.dismissed_at is null
      and notification.archived_at is null
      and notification.expires_at > now()
  ), grouped as (
    select (array_agg(id order by ordinal))[1] as id,
      (array_agg(entity_id order by ordinal))[1] as arrival_id,
      max(occurred_at) as occurred_at,
      max(arrival_count) as arrival_count,
      sum(mapped_product_count)::integer as product_count,
      md5(string_agg(entity_id::text || ':' || source_event_id::text, '|' order by occurred_at, id)) as fingerprint
    from unseen
  )
  select case when grouped.id is null then null else jsonb_build_object(
    'id', grouped.id,
    'kind', 'notification_warehouse_arrival_completed',
    'objectId', grouped.arrival_id,
    'objectNumber', null,
    'plannedDate', null,
    'occurredAt', grouped.occurred_at,
    'comment', null,
    'title', case when grouped.arrival_count = 1
      then 'Новое пополнение склада'
      else grouped.arrival_count::text || ' новых пополнения склада' end,
    'description', case when grouped.arrival_count = 1
      then 'Поставка завершена. Товары поступили на склад и доступны для отгрузки.'
      else 'Откройте список последних поступлений и проверьте доступные товары.' end,
    'sourceFingerprint', grouped.fingerprint,
    'dismissPolicy', 'until_source_change',
    'severity', 'info',
    'href', case when grouped.arrival_count = 1
      then '/cabinet/arrivals/' || grouped.arrival_id::text
      else '/cabinet/arrivals?unseen=1' end,
    'ctaLabel', 'Посмотреть поступление',
    'relevanceState', 'active'
  ) end into arrival_item
  from grouped
  where grouped.id is not null
    and not exists (
      select 1 from public.partner_dashboard_attention_dismissals dismissal
      where dismissal.company_id = p_company_id
        and dismissal.item_type = 'notification_warehouse_arrival_completed'
        and dismissal.source_id = grouped.arrival_id
        and dismissal.source_fingerprint = grouped.fingerprint
        and (dismissal.policy = 'until_source_change' or dismissal.dismiss_until > now())
    );

  current_attention := coalesce(result->'attentionItems', '[]'::jsonb);
  if arrival_item is not null then
    current_attention := jsonb_build_array(arrival_item) || current_attention;
  end if;
  select coalesce(jsonb_agg(value), '[]'::jsonb)
  into current_attention
  from (
    select value, ordinal
    from jsonb_array_elements(current_attention) with ordinality as entries(value, ordinal)
    order by ordinal limit 8
  ) limited;
  attention_count := jsonb_array_length(current_attention);
  result := jsonb_set(result, '{attentionItems}', current_attention);
  result := jsonb_set(result, '{orderSummary,attention}', to_jsonb(attention_count));
  return result;
end;
$$;

create or replace function public.dismiss_partner_dashboard_attention(
  p_company_id uuid,
  p_item_id uuid,
  p_source_fingerprint text
) returns jsonb
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  item jsonb;
  target_policy text;
  target_until timestamptz;
  dismissal_id uuid;
begin
  if actor is null or not public.has_active_company_membership(p_company_id) then
    raise exception 'Dashboard attention access denied.' using errcode = '42501';
  end if;
  if p_source_fingerprint !~ '^[0-9a-f]{32}$' then
    raise exception 'Invalid attention fingerprint.' using errcode = '22023';
  end if;

  select dismissal.id, dismissal.policy, dismissal.dismiss_until
  into dismissal_id, target_policy, target_until
  from public.partner_dashboard_attention_dismissals dismissal
  where dismissal.company_id = p_company_id
    and dismissal.item_id = p_item_id
    and dismissal.source_fingerprint = p_source_fingerprint
    and (dismissal.policy = 'until_source_change' or dismissal.dismiss_until > now());
  if found then
    return jsonb_build_object('id', dismissal_id, 'dismissed', true,
      'policy', target_policy, 'dismissUntil', target_until);
  end if;

  select candidate into item
  from jsonb_array_elements(
    public.get_partner_workspace_dashboard_v4(p_company_id)->'attentionItems'
  ) candidate
  where candidate->>'id' = p_item_id::text
    and candidate->>'sourceFingerprint' = p_source_fingerprint;
  if item is null then
    raise exception 'Dashboard attention item is no longer active.' using errcode = 'P0002';
  end if;

  target_policy := item->>'dismissPolicy';
  target_until := case when target_policy = 'cooldown_7_days'
    then now() + interval '7 days' else null end;
  insert into public.partner_dashboard_attention_dismissals(
    company_id, item_type, item_id, source_id, source_fingerprint, policy,
    dismiss_until, dismissed_by, updated_at
  ) values (
    p_company_id, item->>'kind', p_item_id, (item->>'objectId')::uuid,
    p_source_fingerprint, target_policy, target_until, actor, now()
  ) on conflict (company_id, item_type, source_id) do update set
    item_id = excluded.item_id,
    source_fingerprint = excluded.source_fingerprint,
    policy = excluded.policy,
    dismiss_until = excluded.dismiss_until,
    dismissed_by = excluded.dismissed_by,
    updated_at = now()
  returning id into dismissal_id;

  insert into public.partner_dashboard_attention_events(
    company_id, item_type, source_id, source_fingerprint, event_type,
    actor_user_id, policy, dismiss_until
  ) values (
    p_company_id, item->>'kind', (item->>'objectId')::uuid,
    p_source_fingerprint, 'dismissed', actor, target_policy, target_until
  );
  return jsonb_build_object('id', dismissal_id, 'dismissed', true,
    'policy', target_policy, 'dismissUntil', target_until);
end;
$$;

revoke all on function public.get_partner_workspace_dashboard_v4(uuid)
  from public, anon, authenticated;
grant execute on function public.get_partner_workspace_dashboard_v4(uuid)
  to authenticated;

comment on table public.warehouse_arrivals is
  'Immutable detection of exact supplier-order Поставка -> Завершен transitions. Procurement fields are private.';
comment on table public.warehouse_arrival_items is
  'Immutable source-line projection; partner RPCs expose only exact active catalog mappings.';
comment on function public.publish_exact_stock_snapshot(uuid) is
  'Publishes exact stock, detects supplier-order completion transitions before staging cleanup, and projects deduplicated partner arrivals.';

commit;
