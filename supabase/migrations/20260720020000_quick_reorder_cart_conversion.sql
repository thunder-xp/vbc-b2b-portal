create table if not exists public.order_reorder_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  source_order_history_id uuid not null references public.partner_order_history(id) on delete restrict,
  cart_id uuid not null references public.carts(id) on delete restrict,
  request_key uuid not null unique,
  request_fingerprint text not null,
  event_type text not null default 'order_reordered_to_cart',
  selected_line_count integer not null,
  summary jsonb not null,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint order_reorder_attempts_event_check check (event_type = 'order_reordered_to_cart'),
  constraint order_reorder_attempts_selected_check check (selected_line_count between 1 and 200),
  constraint order_reorder_attempts_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$')
);

create index if not exists order_reorder_attempts_company_created_idx
  on public.order_reorder_attempts(company_id, created_at desc);

alter table public.order_reorder_attempts enable row level security;
revoke all on table public.order_reorder_attempts from public, anon, authenticated;
grant select on table public.order_reorder_attempts to authenticated;

drop policy if exists "Partners view own reorder attempts" on public.order_reorder_attempts;
create policy "Partners view own reorder attempts" on public.order_reorder_attempts for select to authenticated
using (created_by = auth.uid() and public.has_permission(company_id, 'orders.view'));

create or replace function public.merge_order_reorder_items_into_cart(
  target_order_id uuid,
  target_request_key uuid,
  target_request_fingerprint text,
  target_items jsonb,
  target_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_order public.partner_order_history;
  target_cart public.carts;
  prior public.order_reorder_attempts;
  item_count integer;
  valid_count integer;
  added_ids uuid[] := '{}';
  updated_ids uuid[] := '{}';
  stored_summary jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));

  select * into prior from public.order_reorder_attempts where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.source_order_history_id <> target_order_id
      or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Reorder request key is already used.' using errcode = '23505';
    end if;
    return prior.summary || jsonb_build_object('cart_id', prior.cart_id, 'repeated', true);
  end if;

  select * into source_order from public.partner_order_history
  where id = target_order_id and partner_visible and not one_c_deletion_mark for update;
  if source_order.id is null
    or not public.has_permission(source_order.company_id, 'orders.view')
    or not public.has_permission(source_order.company_id, 'cart.manage')
    or not public.can_manage_partner_order_company(source_order.company_id) then
    raise exception 'Order reorder is not available.' using errcode = '42501';
  end if;
  if jsonb_typeof(target_items) <> 'array' then raise exception 'Reorder lines are invalid.' using errcode = '22023'; end if;

  item_count := jsonb_array_length(target_items);
  if item_count < 1 or item_count > 200 then raise exception 'Reorder line count is invalid.' using errcode = '23514'; end if;
  if (select count(distinct row.line_id) from jsonb_to_recordset(target_items) as row(line_id uuid, quantity integer)) <> item_count then
    raise exception 'Duplicate reorder line.' using errcode = '23514';
  end if;
  select count(*) into valid_count
  from jsonb_to_recordset(target_items) as row(line_id uuid, quantity integer)
  join public.partner_order_history_items item on item.id = row.line_id and item.order_history_id = source_order.id
  join public.catalog_products product on product.id = item.product_id and product.is_active and product.is_visible
  where row.quantity between 1 and 9999 and product.external_1c_id is not null and btrim(product.external_1c_id) <> '';
  if valid_count <> item_count then raise exception 'A selected reorder line is unavailable.' using errcode = '23514'; end if;

  select * into target_cart from public.carts
  where company_id = source_order.company_id and created_by = auth.uid() and status = 'active' for update;
  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status)
    values (source_order.company_id, auth.uid(), 'active') returning * into target_cart;
  end if;

  with requested as (
    select item.product_id, least(9999, sum(row.quantity)::integer) as quantity
    from jsonb_to_recordset(target_items) as row(line_id uuid, quantity integer)
    join public.partner_order_history_items item on item.id = row.line_id and item.order_history_id = source_order.id
    group by item.product_id
  )
  select
    coalesce(array_agg(requested.product_id) filter (where current_item.id is null), '{}'),
    coalesce(array_agg(requested.product_id) filter (where current_item.id is not null), '{}')
  into added_ids, updated_ids
  from requested
  left join public.cart_items current_item on current_item.cart_id = target_cart.id and current_item.product_id = requested.product_id;

  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, item.product_id, least(9999, sum(row.quantity)::integer)
  from jsonb_to_recordset(target_items) as row(line_id uuid, quantity integer)
  join public.partner_order_history_items item on item.id = row.line_id and item.order_history_id = source_order.id
  group by item.product_id
  on conflict (cart_id, product_id) do update
    set quantity = least(9999, public.cart_items.quantity + excluded.quantity), updated_at = now();

  stored_summary := jsonb_build_object(
    'added_product_ids', to_jsonb(added_ids),
    'updated_product_ids', to_jsonb(updated_ids),
    'added', cardinality(added_ids),
    'updated', cardinality(updated_ids),
    'changed_price', greatest(0, coalesce((target_summary->>'changedPrice')::integer, 0)),
    'missing_price', greatest(0, coalesce((target_summary->>'missingPrice')::integer, 0)),
    'unavailable', greatest(0, coalesce((target_summary->>'unavailable')::integer, 0)),
    'inactive', greatest(0, coalesce((target_summary->>'inactive')::integer, 0)),
    'skipped', greatest(0, coalesce((target_summary->>'skipped')::integer, 0))
  );
  insert into public.order_reorder_attempts(
    company_id, source_order_history_id, cart_id, request_key, request_fingerprint,
    selected_line_count, summary, created_by
  ) values (
    source_order.company_id, source_order.id, target_cart.id, target_request_key, target_request_fingerprint,
    item_count, stored_summary, auth.uid()
  );
  return stored_summary || jsonb_build_object('cart_id', target_cart.id, 'repeated', false);
end;
$$;

revoke all on function public.merge_order_reorder_items_into_cart(uuid, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.merge_order_reorder_items_into_cart(uuid, uuid, text, jsonb, jsonb) to authenticated;

comment on table public.order_reorder_attempts is
  'One immutable idempotency and audit record per order-to-cart conversion attempt; contains counters, never commercial amounts.';
