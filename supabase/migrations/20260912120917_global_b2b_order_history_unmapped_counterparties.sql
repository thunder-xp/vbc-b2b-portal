begin;

alter table public.partner_order_history
  add column source_counterparty_1c_id text,
  add column source_counterparty_type_code text,
  add column source_government_body_type_code text,
  add column source_operation_code text,
  add column global_history_imported boolean not null default false;

update public.partner_order_history history
set source_counterparty_1c_id = lower(company.external_1c_id)
from public.partner_companies company
where company.id = history.company_id
  and history.source_counterparty_1c_id is null
  and company.external_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.partner_order_history history
set source_counterparty_type_code = source.counterparty_type_code,
    source_government_body_type_code = source.government_body_type_code
from (
  select distinct on (lower(counterparty.external_1c_id))
    lower(counterparty.external_1c_id) as external_1c_id,
    counterparty.counterparty_type_code,
    counterparty.government_body_type_code
  from public.one_c_counterparties counterparty
  order by lower(counterparty.external_1c_id),
    counterparty.is_published desc,
    counterparty.synchronized_at desc,
    counterparty.id desc
) source
where source.external_1c_id = history.source_counterparty_1c_id;

do $$
begin
  if exists (
    select 1 from public.partner_order_history
    where source_counterparty_1c_id is null
  ) then
    raise exception 'partner_order_history_source_counterparty_backfill_incomplete'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.partner_order_history
  alter column source_counterparty_1c_id set not null,
  alter column company_id drop not null;

alter table public.partner_order_history
  add constraint partner_order_history_source_counterparty_ref_check check (
    source_counterparty_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and lower(source_counterparty_1c_id) <> '00000000-0000-0000-0000-000000000000'
  );

alter table public.partner_order_history
  drop constraint partner_order_history_hidden_check;
alter table public.partner_order_history
  add constraint partner_order_history_hidden_check check (
    (
      company_id is not null
      and partner_visible
      and hidden_reason is null
      and not one_c_deletion_mark
    )
    or (
      not partner_visible
      and hidden_reason is not null
    )
  );

alter table public.partner_order_history
  add column global_analytics_eligible boolean generated always as (
    one_c_posted
    and not one_c_deletion_mark
    and one_c_state_code = 'completed'
    and source_operation_code = 'ЗаказНаПродажу'
    and source_counterparty_type_code in (
      'ЮридическоеЛицо',
      'ИндивидуальныйПредприниматель'
    )
  ) stored;

create index partner_order_history_source_counterparty_date_idx
  on public.partner_order_history (
    source_counterparty_1c_id,
    one_c_document_date desc,
    id
  );
create index partner_order_history_global_analytics_idx
  on public.partner_order_history (one_c_document_date, id)
  where global_analytics_eligible;

create or replace function public.populate_partner_order_history_source_counterparty()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_counterparty_1c_id is null and new.company_id is not null then
    select lower(company.external_1c_id)
    into new.source_counterparty_1c_id
    from public.partner_companies company
    where company.id = new.company_id;
  end if;

  if new.source_counterparty_1c_id is null then
    raise exception 'partner_order_history_source_counterparty_required'
      using errcode = '23514';
  end if;
  new.source_counterparty_1c_id := lower(new.source_counterparty_1c_id);
  return new;
end;
$$;

drop trigger if exists populate_partner_order_history_source_counterparty
  on public.partner_order_history;
create trigger populate_partner_order_history_source_counterparty
before insert or update of company_id, source_counterparty_1c_id
on public.partner_order_history
for each row execute function public.populate_partner_order_history_source_counterparty();

revoke all on function public.populate_partner_order_history_source_counterparty()
  from public, anon, authenticated;

-- Historical facts without a portal-company mapping must not enqueue
-- company-scoped projections. Preserve the existing trigger contract for
-- mapped rows while making the newly valid NULL company case a no-op.
create or replace function public.enqueue_momentum_from_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
begin
  target_company_id := coalesce(new.company_id, old.company_id);
  if target_company_id is not null then
    perform public.enqueue_partner_momentum_company(target_company_id, tg_table_name);
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.enqueue_momentum_from_row()
  from public, anon, authenticated;

create or replace function public.enqueue_order_item_commercial_intelligence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.commercial_intelligence_dirty_products(
    company_id, product_id, reason
  )
  select distinct history.company_id, item.product_id, 'order_item_changed'
  from changed_order_items item
  join public.partner_order_history history
    on history.id = item.order_history_id
  where history.company_id is not null
    and item.product_id is not null
  on conflict(company_id, product_id) do update
  set reason = excluded.reason,
    last_dirtied_at = now(),
    locked_at = null,
    last_error_code = null;
  return null;
end;
$$;

revoke all on function public.enqueue_order_item_commercial_intelligence()
  from public, anon, authenticated;

create table public.partner_order_history_global_sync_state (
  singleton_key smallint primary key default 1 check (singleton_key = 1),
  status text not null default 'idle' check (
    status in ('idle', 'running', 'failed', 'completed')
  ),
  phase text not null default 'headers' check (
    phase in ('headers', 'items', 'completed')
  ),
  lock_token uuid,
  locked_at timestamptz,
  header_cursor text not null default '0',
  item_cursor text not null default '0',
  header_pages integer not null default 0 check (header_pages >= 0),
  item_pages integer not null default 0 check (item_pages >= 0),
  headers_scanned bigint not null default 0 check (headers_scanned >= 0),
  items_scanned bigint not null default 0 check (items_scanned >= 0),
  eligible_b2b_orders bigint not null default 0 check (eligible_b2b_orders >= 0),
  eligible_b2b_items bigint not null default 0 check (eligible_b2b_items >= 0),
  orders_inserted bigint not null default 0 check (orders_inserted >= 0),
  orders_updated bigint not null default 0 check (orders_updated >= 0),
  items_upserted bigint not null default 0 check (items_upserted >= 0),
  source_oldest_order timestamptz,
  source_newest_order timestamptz,
  counterparty_metrics jsonb not null default '{}'::jsonb check (
    jsonb_typeof(counterparty_metrics) = 'object'
  ),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_order_history_global_sync_lock_check check (
    (status = 'running' and lock_token is not null and locked_at is not null)
    or (status <> 'running' and lock_token is null)
  )
);

insert into public.partner_order_history_global_sync_state(singleton_key)
values (1);

alter table public.partner_order_history_global_sync_state enable row level security;
alter table public.partner_order_history_global_sync_state force row level security;
revoke all on table public.partner_order_history_global_sync_state
  from public, anon, authenticated;
grant select, insert, update on table public.partner_order_history_global_sync_state
  to service_role;

create or replace function public.acquire_partner_order_history_global_sync(
  p_restart boolean default false,
  p_stale_after_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  state public.partner_order_history_global_sync_state%rowtype;
  token uuid := gen_random_uuid();
begin
  select * into state
  from public.partner_order_history_global_sync_state
  where singleton_key = 1
  for update;

  if state.status = 'running'
    and state.locked_at > now() - make_interval(secs => greatest(60, p_stale_after_seconds)) then
    return jsonb_build_object('status', 'locked');
  end if;

  if state.status = 'completed' and not p_restart then
    return jsonb_build_object('status', 'completed');
  end if;

  if p_restart then
    update public.partner_order_history_global_sync_state
    set status = 'running', phase = 'headers', lock_token = token,
      locked_at = now(), header_cursor = '0', item_cursor = '0',
      header_pages = 0, item_pages = 0, headers_scanned = 0,
      items_scanned = 0, eligible_b2b_orders = 0,
      eligible_b2b_items = 0, orders_inserted = 0, orders_updated = 0,
      items_upserted = 0, source_oldest_order = null,
      source_newest_order = null, counterparty_metrics = '{}'::jsonb,
      started_at = now(), completed_at = null, last_error = null,
      updated_at = now()
    where singleton_key = 1
    returning * into state;
  else
    update public.partner_order_history_global_sync_state
    set status = 'running', lock_token = token, locked_at = now(),
      started_at = coalesce(started_at, now()), last_error = null,
      updated_at = now()
    where singleton_key = 1
    returning * into state;
  end if;

  return jsonb_build_object(
    'status', state.status,
    'phase', state.phase,
    'lockToken', state.lock_token,
    'headerCursor', state.header_cursor,
    'itemCursor', state.item_cursor
  );
end;
$$;

create or replace function public.persist_partner_order_history_global_header_page(
  p_lock_token uuid,
  p_cursor text,
  p_next_cursor text,
  p_has_more boolean,
  p_headers jsonb,
  p_counterparty_metrics jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  state public.partner_order_history_global_sync_state%rowtype;
  inserted_count bigint := 0;
  updated_count bigint := 0;
  eligible_count bigint := 0;
  page_oldest timestamptz;
  page_newest timestamptz;
begin
  if jsonb_typeof(p_headers) <> 'array'
    or jsonb_array_length(p_headers) > 1000
    or jsonb_typeof(p_counterparty_metrics) <> 'object' then
    raise exception 'invalid_global_history_header_page' using errcode = '22023';
  end if;

  select * into state
  from public.partner_order_history_global_sync_state
  where singleton_key = 1
  for update;
  if state.status <> 'running' or state.phase <> 'headers'
    or state.lock_token <> p_lock_token or state.header_cursor <> p_cursor then
    raise exception 'global_history_header_checkpoint_conflict' using errcode = '40001';
  end if;

  drop table if exists pg_temp.global_history_existing;
  drop table if exists pg_temp.global_history_headers;
  create temporary table global_history_headers on commit drop as
  select
    lower(value->>'external_1c_order_ref') as external_ref,
    value->>'external_1c_order_number' as external_number,
    (value->>'one_c_document_date')::timestamptz as document_date,
    nullif(value->>'one_c_delivery_date', '')::date as delivery_date,
    coalesce((value->>'one_c_posted')::boolean, false) as posted,
    coalesce((value->>'one_c_deletion_mark')::boolean, false) as deletion_mark,
    nullif(value->>'one_c_state_ref', '') as state_ref,
    nullif(value->>'one_c_state_raw', '') as state_raw,
    nullif(value->>'one_c_state_code', '') as state_code,
    nullif(value->>'one_c_source_version', '') as source_version,
    nullif(value->>'external_contract_ref', '') as contract_ref,
    nullif(value->>'external_currency_ref', '') as currency_ref,
    coalesce((value->>'document_total')::numeric, 0) as document_total,
    nullif(value->>'currency_code', '') as currency_code,
    lower(value->>'source_counterparty_1c_id') as counterparty_ref,
    nullif(value->>'source_counterparty_type_code', '') as counterparty_type,
    nullif(value->>'source_government_body_type_code', '') as government_type,
    nullif(value->>'source_operation_code', '') as operation_code
  from jsonb_array_elements(p_headers) value;

  if exists (
    select 1 from global_history_headers
    where external_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or counterparty_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or document_total < 0
  ) then
    raise exception 'invalid_global_history_header_identity' using errcode = '22023';
  end if;

  select count(*) filter (
    where posted and not deletion_mark and state_code = 'completed'
      and operation_code = 'ЗаказНаПродажу'
      and counterparty_type in ('ЮридическоеЛицо', 'ИндивидуальныйПредприниматель')
  ), min(document_date), max(document_date)
  into eligible_count, page_oldest, page_newest
  from global_history_headers;

  create temporary table global_history_existing on commit drop as
  select history.external_1c_order_ref
  from public.partner_order_history history
  join global_history_headers source
    on source.external_ref = history.external_1c_order_ref;

  with prepared as (
    select source.*,
      mapping.company_id,
      (
        source.posted and not source.deletion_mark
        and source.state_code = 'completed'
        and source.operation_code = 'ЗаказНаПродажу'
        and source.counterparty_type in (
          'ЮридическоеЛицо', 'ИндивидуальныйПредприниматель'
        )
      ) as eligible
    from global_history_headers source
    left join lateral (
      select counterparty.portal_company_id as company_id
      from public.one_c_counterparties counterparty
      where lower(counterparty.external_1c_id) = source.counterparty_ref
        and counterparty.portal_company_id is not null
        and counterparty.is_published
        and counterparty.is_active
        and not counterparty.is_deleted
      order by counterparty.synchronized_at desc, counterparty.id desc
      limit 1
    ) mapping on true
  ), saved as (
    insert into public.partner_order_history (
      company_id, external_1c_order_ref, external_1c_order_number,
      one_c_posted, one_c_deletion_mark, one_c_state_ref,
      one_c_state_raw, one_c_state_code, one_c_document_date,
      one_c_delivery_date, one_c_source_version, one_c_last_synced_at,
      external_contract_ref, external_currency_ref, document_total,
      currency_code, origin_type, partner_visible, hidden_reason,
      position_count, total_unit_count, source_counterparty_1c_id,
      source_counterparty_type_code, source_government_body_type_code,
      source_operation_code, global_history_imported
    )
    select
      prepared.company_id, prepared.external_ref, prepared.external_number,
      prepared.posted, prepared.deletion_mark, prepared.state_ref,
      prepared.state_raw, prepared.state_code, prepared.document_date,
      prepared.delivery_date, prepared.source_version, now(),
      prepared.contract_ref, prepared.currency_ref, prepared.document_total,
      prepared.currency_code, 'legacy_b2b',
      prepared.company_id is not null and not prepared.deletion_mark,
      case when prepared.company_id is null then 'unmapped_historical_b2b'
        when prepared.deletion_mark then 'deleted_in_1c' else null end,
      0, 0, prepared.counterparty_ref, prepared.counterparty_type,
      prepared.government_type, prepared.operation_code, true
    from prepared
    where prepared.eligible
      or exists (
        select 1 from global_history_existing existing
        where existing.external_1c_order_ref = prepared.external_ref
      )
    on conflict (external_1c_order_ref) do update
    set company_id = coalesce(excluded.company_id, partner_order_history.company_id),
      external_1c_order_number = excluded.external_1c_order_number,
      one_c_posted = excluded.one_c_posted,
      one_c_deletion_mark = excluded.one_c_deletion_mark,
      one_c_state_ref = excluded.one_c_state_ref,
      one_c_state_raw = excluded.one_c_state_raw,
      one_c_state_code = excluded.one_c_state_code,
      one_c_document_date = excluded.one_c_document_date,
      one_c_delivery_date = excluded.one_c_delivery_date,
      one_c_source_version = excluded.one_c_source_version,
      one_c_last_synced_at = excluded.one_c_last_synced_at,
      external_contract_ref = excluded.external_contract_ref,
      external_currency_ref = excluded.external_currency_ref,
      document_total = excluded.document_total,
      currency_code = coalesce(excluded.currency_code, partner_order_history.currency_code),
      partner_visible = coalesce(excluded.company_id, partner_order_history.company_id) is not null
        and not excluded.one_c_deletion_mark,
      hidden_reason = case
        when coalesce(excluded.company_id, partner_order_history.company_id) is null
          then 'unmapped_historical_b2b'
        when excluded.one_c_deletion_mark then 'deleted_in_1c'
        else null
      end,
      source_counterparty_1c_id = excluded.source_counterparty_1c_id,
      source_counterparty_type_code = coalesce(
        excluded.source_counterparty_type_code,
        partner_order_history.source_counterparty_type_code
      ),
      source_government_body_type_code = coalesce(
        excluded.source_government_body_type_code,
        partner_order_history.source_government_body_type_code
      ),
      source_operation_code = excluded.source_operation_code,
      global_history_imported = partner_order_history.global_history_imported,
      updated_at = now()
    returning id, external_1c_order_ref
  )
  select count(*) filter (where existing.external_1c_order_ref is null),
    count(*) filter (where existing.external_1c_order_ref is not null)
  into inserted_count, updated_count
  from saved
  left join global_history_existing existing
    on existing.external_1c_order_ref = saved.external_1c_order_ref;

  insert into public.partner_order_history_events(
    order_history_id, event_type, occurred_at, current_value, fingerprint
  )
  select history.id, 'imported', now(), history.one_c_state_code,
    history.id::text || '|global-history-imported'
  from public.partner_order_history history
  join global_history_headers source
    on source.external_ref = history.external_1c_order_ref
  left join global_history_existing existing
    on existing.external_1c_order_ref = history.external_1c_order_ref
  where existing.external_1c_order_ref is null
  on conflict (fingerprint) do nothing;

  update public.partner_order_history_global_sync_state
  set status = 'running',
    phase = case when p_has_more then 'headers' else 'items' end,
    lock_token = p_lock_token,
    locked_at = now(),
    header_cursor = case when p_has_more then p_next_cursor else header_cursor end,
    item_cursor = case when p_has_more then item_cursor else '0' end,
    header_pages = header_pages + 1,
    headers_scanned = headers_scanned + jsonb_array_length(p_headers),
    eligible_b2b_orders = eligible_b2b_orders + eligible_count,
    orders_inserted = orders_inserted + inserted_count,
    orders_updated = orders_updated + updated_count,
    source_oldest_order = least(source_oldest_order, page_oldest),
    source_newest_order = greatest(source_newest_order, page_newest),
    counterparty_metrics = p_counterparty_metrics,
    updated_at = now()
  where singleton_key = 1;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'eligible', eligible_count,
    'nextPhase', case when p_has_more then 'headers' else 'items' end
  );
end;
$$;

create or replace function public.release_partner_order_history_global_sync(
  p_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  update public.partner_order_history_global_sync_state
  set status = 'idle', lock_token = null, locked_at = null, updated_at = now()
  where singleton_key = 1 and status = 'running' and lock_token = p_lock_token;
  return found;
end;
$$;

create or replace function public.persist_partner_order_history_global_item_page(
  p_lock_token uuid,
  p_cursor text,
  p_next_cursor text,
  p_has_more boolean,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  state public.partner_order_history_global_sync_state%rowtype;
  upserted_count bigint := 0;
  eligible_count bigint := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 1000 then
    raise exception 'invalid_global_history_item_page' using errcode = '22023';
  end if;

  select * into state
  from public.partner_order_history_global_sync_state
  where singleton_key = 1
  for update;
  if state.status <> 'running' or state.phase <> 'items'
    or state.lock_token <> p_lock_token or state.item_cursor <> p_cursor then
    raise exception 'global_history_item_checkpoint_conflict' using errcode = '40001';
  end if;

  drop table if exists pg_temp.global_history_items;
  create temporary table global_history_items on commit drop as
  select lower(value->>'external_1c_order_ref') as order_ref,
    (value->>'line_number')::integer as line_number,
    lower(value->>'external_product_ref') as product_ref,
    nullif(lower(value->>'external_characteristic_ref'), '') as characteristic_ref,
    (value->>'quantity')::numeric as quantity,
    (value->>'unit_price')::numeric as unit_price,
    (value->>'line_total')::numeric as line_total
  from jsonb_array_elements(p_items) value;

  if exists (
    select 1 from global_history_items
    where order_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or product_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or line_number <= 0 or quantity <= 0 or unit_price < 0 or line_total < 0
  ) then
    raise exception 'invalid_global_history_item_identity' using errcode = '22023';
  end if;

  insert into public.partner_order_history_items(
    order_history_id, line_number, product_id, external_product_ref,
    external_characteristic_ref, product_name, sku, quantity,
    unit_price, line_total, currency_code
  )
  select history.id, source.line_number, product.id, source.product_ref,
    source.characteristic_ref, product.name, product.sku, source.quantity,
    source.unit_price, source.line_total, history.currency_code
  from global_history_items source
  join public.partner_order_history history
    on history.external_1c_order_ref = source.order_ref
  left join public.catalog_products product
    on lower(product.external_1c_id) = source.product_ref
  on conflict (order_history_id, line_number) do update
  set product_id = excluded.product_id,
    external_product_ref = excluded.external_product_ref,
    external_characteristic_ref = excluded.external_characteristic_ref,
    product_name = excluded.product_name,
    sku = excluded.sku,
    quantity = excluded.quantity,
    unit_price = excluded.unit_price,
    line_total = excluded.line_total,
    currency_code = excluded.currency_code,
    updated_at = now();
  get diagnostics upserted_count = row_count;

  select count(*) into eligible_count
  from global_history_items source
  join public.partner_order_history history
    on history.external_1c_order_ref = source.order_ref
  where history.global_analytics_eligible;

  update public.partner_order_history history
  set position_count = totals.position_count,
    total_unit_count = totals.total_unit_count,
    updated_at = now()
  from (
    select item.order_history_id, count(*)::integer as position_count,
      sum(item.quantity) as total_unit_count
    from public.partner_order_history_items item
    where item.order_history_id in (
      select distinct history.id
      from global_history_items source
      join public.partner_order_history history
        on history.external_1c_order_ref = source.order_ref
    )
    group by item.order_history_id
  ) totals
  where history.id = totals.order_history_id;

  if not p_has_more then
    delete from public.partner_order_history history
    where history.global_history_imported
      and not exists (
        select 1 from public.partner_order_history_items item
        where item.order_history_id = history.id
      );
  end if;

  update public.partner_order_history_global_sync_state
  set status = case when p_has_more then 'running' else 'completed' end,
    phase = case when p_has_more then 'items' else 'completed' end,
    lock_token = case when p_has_more then p_lock_token else null end,
    locked_at = case when p_has_more then now() else null end,
    item_cursor = case when p_has_more then p_next_cursor else item_cursor end,
    item_pages = item_pages + 1,
    items_scanned = items_scanned + jsonb_array_length(p_items),
    eligible_b2b_orders = case when p_has_more then eligible_b2b_orders else (
      select count(*)
      from public.partner_order_history history
      where history.global_analytics_eligible
        and exists (
          select 1 from public.partner_order_history_items item
          where item.order_history_id = history.id and item.quantity > 0
        )
    ) end,
    eligible_b2b_items = eligible_b2b_items + eligible_count,
    items_upserted = items_upserted + upserted_count,
    completed_at = case when p_has_more then null else now() end,
    updated_at = now()
  where singleton_key = 1;

  return jsonb_build_object(
    'upserted', upserted_count,
    'eligible', eligible_count,
    'completed', not p_has_more
  );
end;
$$;

create or replace function public.fail_partner_order_history_global_sync(
  p_lock_token uuid,
  p_safe_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  update public.partner_order_history_global_sync_state
  set status = 'failed', lock_token = null, locked_at = null,
    last_error = left(coalesce(p_safe_error, 'global_history_sync_failed'), 500),
    updated_at = now()
  where singleton_key = 1 and lock_token = p_lock_token;
  return found;
end;
$$;

create or replace function public.get_partner_order_history_global_sync_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select to_jsonb(state)
  from public.partner_order_history_global_sync_state state
  where state.singleton_key = 1;
$$;

create or replace function public.get_global_b2b_order_product_membership(
  p_date_from date,
  p_date_to date,
  p_after_order_date date default null,
  p_after_order_id uuid default null,
  p_limit integer default 500
)
returns table (
  order_history_id uuid,
  order_date date,
  product_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  with eligible_orders as (
    select history.id, history.one_c_document_date::date as order_date
    from public.partner_order_history history
    where history.global_analytics_eligible
      and history.one_c_document_date >= p_date_from::timestamptz
      and history.one_c_document_date < (p_date_to + 1)::timestamptz
      and (
        p_after_order_date is null
        or (history.one_c_document_date::date, history.id)
          > (p_after_order_date, p_after_order_id)
      )
    order by history.one_c_document_date::date, history.id
    limit least(greatest(p_limit, 1), 1000)
  )
  select eligible.id, eligible.order_date,
    array_agg(distinct item.product_id order by item.product_id) as product_ids
  from eligible_orders eligible
  join public.partner_order_history_items item
    on item.order_history_id = eligible.id
   and item.product_id is not null
   and item.quantity > 0
  group by eligible.id, eligible.order_date
  order by eligible.order_date, eligible.id;
$$;

revoke all on function public.acquire_partner_order_history_global_sync(boolean, integer),
  public.persist_partner_order_history_global_header_page(uuid, text, text, boolean, jsonb, jsonb),
  public.persist_partner_order_history_global_item_page(uuid, text, text, boolean, jsonb),
  public.release_partner_order_history_global_sync(uuid),
  public.fail_partner_order_history_global_sync(uuid, text),
  public.get_partner_order_history_global_sync_state(),
  public.get_global_b2b_order_product_membership(date, date, date, uuid, integer)
from public, anon, authenticated;
grant execute on function public.acquire_partner_order_history_global_sync(boolean, integer),
  public.persist_partner_order_history_global_header_page(uuid, text, text, boolean, jsonb, jsonb),
  public.persist_partner_order_history_global_item_page(uuid, text, text, boolean, jsonb),
  public.release_partner_order_history_global_sync(uuid),
  public.fail_partner_order_history_global_sync(uuid, text),
  public.get_partner_order_history_global_sync_state(),
  public.get_global_b2b_order_product_membership(date, date, date, uuid, integer)
to service_role;

comment on column public.partner_order_history.source_counterparty_1c_id is
  'Stable 1C buyer identity retained independently of optional portal-company mapping.';
comment on column public.partner_order_history.company_id is
  'Optional portal-company mapping. NULL rows are analytics-only and never partner-visible.';
comment on column public.partner_order_history.global_analytics_eligible is
  'Generated governed eligibility for anonymous global B2B aggregate analytics.';
comment on table public.partner_order_history_global_sync_state is
  'Singleton resumable checkpoint and aggregate evidence for the bounded global 1C order-history backfill.';

commit;
