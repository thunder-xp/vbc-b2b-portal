-- 1C-owned customer-order history read model. Portal submission workflow and
-- immutable partner_order_items remain separate from current 1C document state.

insert into public.permissions (code, description)
values ('orders.view', 'View the active company customer-order history.')
on conflict (code) do update set description = excluded.description;

with grants(role_code, permission_code) as (
  values
    ('partner_owner', 'orders.view'),
    ('partner_manager', 'orders.view'),
    ('partner_buyer', 'orders.view')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict (role_id, permission_id) do nothing;

create table if not exists public.partner_order_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  portal_order_id uuid null unique references public.partner_orders(id) on delete set null,
  external_1c_order_ref text not null unique,
  external_1c_order_number text not null,
  one_c_posted boolean not null,
  one_c_deletion_mark boolean not null,
  one_c_state_raw text null,
  one_c_state_code text null,
  one_c_document_date timestamptz not null,
  one_c_delivery_date date null,
  one_c_source_version text null,
  one_c_last_synced_at timestamptz not null,
  external_contract_ref text null,
  external_currency_ref text null,
  document_total numeric(18, 4) not null,
  currency_code text null,
  origin_type text not null default 'unknown_1c_source',
  partner_visible boolean not null default true,
  hidden_reason text null,
  position_count integer not null default 0,
  total_unit_count numeric(18, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_order_history_state_check check (
    one_c_state_code is null or one_c_state_code in ('open', 'preorder', 'test', 'completed')
  ),
  constraint partner_order_history_origin_check check (
    origin_type in ('partner_platform', 'legacy_b2b', 'internal_1c', 'unknown_1c_source')
  ),
  constraint partner_order_history_hidden_check check (
    (partner_visible and hidden_reason is null and not one_c_deletion_mark)
    or (not partner_visible and hidden_reason is not null)
  ),
  constraint partner_order_history_total_check check (document_total >= 0),
  constraint partner_order_history_counts_check check (position_count >= 0 and total_unit_count >= 0)
);

create index if not exists partner_order_history_company_date_idx
  on public.partner_order_history(company_id, one_c_document_date desc, id);
create index if not exists partner_order_history_company_state_idx
  on public.partner_order_history(company_id, one_c_posted, one_c_state_code)
  where partner_visible;
create index if not exists partner_order_history_visible_number_idx
  on public.partner_order_history(company_id, external_1c_order_number)
  where partner_visible and one_c_posted;

drop trigger if exists set_partner_order_history_updated_at on public.partner_order_history;
create trigger set_partner_order_history_updated_at before update on public.partner_order_history
for each row execute function public.set_updated_at();

create table if not exists public.partner_order_history_items (
  id uuid primary key default gen_random_uuid(),
  order_history_id uuid not null references public.partner_order_history(id) on delete cascade,
  line_number integer not null,
  product_id uuid null references public.catalog_products(id) on delete set null,
  external_product_ref text not null,
  external_characteristic_ref text null,
  product_name text null,
  sku text null,
  quantity numeric(18, 3) not null,
  unit_price numeric(18, 4) not null,
  line_total numeric(18, 4) not null,
  currency_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_order_history_items_line_unique unique(order_history_id, line_number),
  constraint partner_order_history_items_values_check check (
    line_number > 0 and quantity > 0 and unit_price >= 0 and line_total >= 0
  )
);

create index if not exists partner_order_history_items_order_idx
  on public.partner_order_history_items(order_history_id, line_number);

create table if not exists public.partner_order_history_events (
  id uuid primary key default gen_random_uuid(),
  order_history_id uuid not null references public.partner_order_history(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null,
  previous_value text null,
  current_value text null,
  internal_only boolean not null default false,
  fingerprint text not null unique,
  created_at timestamptz not null default now(),
  constraint partner_order_history_events_type_check check (event_type in (
    'imported', 'received_by_one_c', 'posted', 'became_unposted',
    'state_changed', 'delivery_date_changed', 'marked_for_deletion', 'sync_restored'
  ))
);

create index if not exists partner_order_history_events_order_idx
  on public.partner_order_history_events(order_history_id, occurred_at, id);

create table if not exists public.partner_order_history_sync_state (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  counterparty_ref text not null,
  status text not null default 'idle',
  sync_mode text null,
  active_sync_id uuid null,
  last_successful_full_sync_at timestamptz null,
  last_incremental_sync_at timestamptz null,
  last_source_version text null,
  safe_error text null,
  records_received integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_hidden integer not null default 0,
  started_at timestamptz null,
  finished_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint partner_order_history_sync_status_check check (status in ('idle', 'running', 'succeeded', 'failed')),
  constraint partner_order_history_sync_mode_check check (sync_mode is null or sync_mode in ('full', 'incremental'))
);

create or replace function public.can_view_partner_order_history(
  target_company_id uuid,
  target_partner_visible boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (target_partner_visible and public.has_permission(target_company_id, 'orders.view'))
    or public.can_review_partner_orders();
$$;

alter table public.partner_order_history enable row level security;
alter table public.partner_order_history_items enable row level security;
alter table public.partner_order_history_events enable row level security;
alter table public.partner_order_history_sync_state enable row level security;

revoke all on table public.partner_order_history, public.partner_order_history_items,
  public.partner_order_history_events, public.partner_order_history_sync_state from anon, authenticated;
grant select on table public.partner_order_history, public.partner_order_history_items,
  public.partner_order_history_events, public.partner_order_history_sync_state to authenticated;

drop policy if exists "Partners select visible order history" on public.partner_order_history;
create policy "Partners select visible order history" on public.partner_order_history for select to authenticated
using (public.can_view_partner_order_history(company_id, partner_visible));

drop policy if exists "Partners select visible order history items" on public.partner_order_history_items;
create policy "Partners select visible order history items" on public.partner_order_history_items for select to authenticated
using (exists (
  select 1 from public.partner_order_history history
  where history.id = order_history_id
    and public.can_view_partner_order_history(history.company_id, history.partner_visible)
));

drop policy if exists "Partners select visible order history events" on public.partner_order_history_events;
create policy "Partners select visible order history events" on public.partner_order_history_events for select to authenticated
using ((not internal_only and exists (
  select 1 from public.partner_order_history history
  where history.id = order_history_id
    and public.can_view_partner_order_history(history.company_id, history.partner_visible)
)) or public.can_review_partner_orders());

drop policy if exists "Partners select own order sync state" on public.partner_order_history_sync_state;
create policy "Partners select own order sync state" on public.partner_order_history_sync_state for select to authenticated
using (public.has_permission(company_id, 'orders.view') or public.can_review_partner_orders());

create or replace function public.upsert_partner_order_history_batch(
  target_company_id uuid,
  target_sync_id uuid,
  target_synced_at timestamptz,
  target_orders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_order jsonb;
  existing_order public.partner_order_history;
  saved_order public.partner_order_history;
  linked_portal_order_id uuid;
  item jsonb;
  inserted_count integer := 0;
  updated_count integer := 0;
  hidden_count integer := 0;
  event_time timestamptz;
  event_value text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history synchronization is server-only.' using errcode = '42501';
  end if;
  if jsonb_typeof(target_orders) <> 'array' then
    raise exception 'Order history batch is invalid.' using errcode = '22023';
  end if;

  for source_order in select value from jsonb_array_elements(target_orders)
  loop
    select * into existing_order from public.partner_order_history
    where external_1c_order_ref = source_order->>'external_1c_order_ref'
    for update;

    select id into linked_portal_order_id from public.partner_orders
    where external_1c_ref = source_order->>'external_1c_order_ref'
    order by confirmed_at desc nulls last limit 1;

    insert into public.partner_order_history(
      company_id, portal_order_id, external_1c_order_ref, external_1c_order_number,
      one_c_posted, one_c_deletion_mark, one_c_state_raw, one_c_state_code,
      one_c_document_date, one_c_delivery_date, one_c_source_version, one_c_last_synced_at,
      external_contract_ref, external_currency_ref, document_total, currency_code,
      origin_type, partner_visible, hidden_reason, position_count, total_unit_count
    ) values (
      target_company_id, linked_portal_order_id, source_order->>'external_1c_order_ref',
      coalesce(source_order->>'external_1c_order_number', ''),
      coalesce((source_order->>'one_c_posted')::boolean, false),
      coalesce((source_order->>'one_c_deletion_mark')::boolean, false),
      nullif(source_order->>'one_c_state_raw', ''), nullif(source_order->>'one_c_state_code', ''),
      (source_order->>'one_c_document_date')::timestamptz,
      nullif(source_order->>'one_c_delivery_date', '')::date,
      nullif(source_order->>'one_c_source_version', ''), target_synced_at,
      nullif(source_order->>'external_contract_ref', ''), nullif(source_order->>'external_currency_ref', ''),
      coalesce((source_order->>'document_total')::numeric, 0), nullif(source_order->>'currency_code', ''),
      case when linked_portal_order_id is not null then 'partner_platform' else 'unknown_1c_source' end,
      not coalesce((source_order->>'one_c_deletion_mark')::boolean, false),
      case when coalesce((source_order->>'one_c_deletion_mark')::boolean, false) then 'deleted_in_1c' else null end,
      coalesce((source_order->>'position_count')::integer, 0),
      coalesce((source_order->>'total_unit_count')::numeric, 0)
    )
    on conflict (external_1c_order_ref) do update set
      company_id = excluded.company_id,
      portal_order_id = coalesce(partner_order_history.portal_order_id, excluded.portal_order_id),
      external_1c_order_number = excluded.external_1c_order_number,
      one_c_posted = excluded.one_c_posted,
      one_c_deletion_mark = excluded.one_c_deletion_mark,
      one_c_state_raw = excluded.one_c_state_raw,
      one_c_state_code = excluded.one_c_state_code,
      one_c_document_date = excluded.one_c_document_date,
      one_c_delivery_date = excluded.one_c_delivery_date,
      one_c_source_version = excluded.one_c_source_version,
      one_c_last_synced_at = excluded.one_c_last_synced_at,
      external_contract_ref = excluded.external_contract_ref,
      external_currency_ref = excluded.external_currency_ref,
      document_total = excluded.document_total,
      currency_code = excluded.currency_code,
      partner_visible = excluded.partner_visible,
      hidden_reason = excluded.hidden_reason,
      position_count = excluded.position_count,
      total_unit_count = excluded.total_unit_count
    returning * into saved_order;

    event_time := saved_order.one_c_last_synced_at;
    if existing_order.id is null then
      inserted_count := inserted_count + 1;
      insert into public.partner_order_history_events(
        order_history_id, event_type, occurred_at, current_value, fingerprint
      ) values (
        saved_order.id, 'imported', event_time, saved_order.external_1c_order_ref,
        md5(saved_order.id::text || ':imported')
      ) on conflict (fingerprint) do nothing;
      if saved_order.portal_order_id is not null then
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, current_value, fingerprint
        ) values (
          saved_order.id, 'received_by_one_c', saved_order.one_c_document_date,
          saved_order.external_1c_order_ref, md5(saved_order.id::text || ':received_by_one_c')
        ) on conflict (fingerprint) do nothing;
      end if;
    else
      updated_count := updated_count + 1;
      if existing_order.one_c_posted is distinct from saved_order.one_c_posted then
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint
        ) values (
          saved_order.id, case when saved_order.one_c_posted then 'posted' else 'became_unposted' end,
          event_time, existing_order.one_c_posted::text, saved_order.one_c_posted::text,
          md5(saved_order.id::text || ':posted:' || saved_order.one_c_posted::text || ':' || event_time::text)
        ) on conflict (fingerprint) do nothing;
      end if;
      if existing_order.one_c_state_raw is distinct from saved_order.one_c_state_raw then
        event_value := coalesce(saved_order.one_c_state_code, saved_order.one_c_state_raw, 'unknown');
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint
        ) values (
          saved_order.id, 'state_changed', event_time,
          coalesce(existing_order.one_c_state_code, existing_order.one_c_state_raw), event_value,
          md5(saved_order.id::text || ':state:' || event_value || ':' || event_time::text)
        ) on conflict (fingerprint) do nothing;
      end if;
      if existing_order.one_c_delivery_date is distinct from saved_order.one_c_delivery_date then
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint
        ) values (
          saved_order.id, 'delivery_date_changed', event_time,
          existing_order.one_c_delivery_date::text, saved_order.one_c_delivery_date::text,
          md5(saved_order.id::text || ':delivery:' || coalesce(saved_order.one_c_delivery_date::text, 'none') || ':' || event_time::text)
        ) on conflict (fingerprint) do nothing;
      end if;
      if not existing_order.one_c_deletion_mark and saved_order.one_c_deletion_mark then
        hidden_count := hidden_count + 1;
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, current_value, internal_only, fingerprint
        ) values (
          saved_order.id, 'marked_for_deletion', event_time, 'deleted_in_1c', true,
          md5(saved_order.id::text || ':deleted')
        ) on conflict (fingerprint) do nothing;
      end if;
    end if;

    delete from public.partner_order_history_items where order_history_id = saved_order.id;
    for item in select value from jsonb_array_elements(coalesce(source_order->'items', '[]'::jsonb))
    loop
      insert into public.partner_order_history_items(
        order_history_id, line_number, product_id, external_product_ref,
        external_characteristic_ref, product_name, sku, quantity, unit_price,
        line_total, currency_code
      ) values (
        saved_order.id, (item->>'line_number')::integer,
        (select id from public.catalog_products where external_1c_id = item->>'external_product_ref' limit 1),
        item->>'external_product_ref', nullif(item->>'external_characteristic_ref', ''),
        (select name from public.catalog_products where external_1c_id = item->>'external_product_ref' limit 1),
        (select sku from public.catalog_products where external_1c_id = item->>'external_product_ref' limit 1),
        (item->>'quantity')::numeric, (item->>'unit_price')::numeric,
        (item->>'line_total')::numeric, saved_order.currency_code
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'hidden', hidden_count
  );
end;
$$;

revoke all on function public.can_view_partner_order_history(uuid, boolean) from public, anon;
grant execute on function public.can_view_partner_order_history(uuid, boolean) to authenticated;
revoke all on function public.upsert_partner_order_history_batch(uuid, uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_partner_order_history_batch(uuid, uuid, timestamptz, jsonb)
  to service_role;

comment on table public.partner_order_history is
  'Current 1C-owned customer-order read model. Ref_Key is the stable identity; deleted documents remain for audit.';
comment on table public.partner_order_history_items is
  'Current 1C order lines. Portal submission snapshots remain immutable in partner_order_items.';
comment on table public.partner_order_history_sync_state is
  'Per-company full and incremental 1C order-history synchronization state.';
