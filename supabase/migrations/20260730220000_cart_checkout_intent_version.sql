begin;

alter table public.carts
  add column if not exists intent_version bigint not null default 1;

alter table public.carts
  drop constraint if exists carts_intent_version_positive;
alter table public.carts
  add constraint carts_intent_version_positive check (intent_version > 0);

create or replace function public.bump_cart_intent_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cart_id uuid;
begin
  if tg_op = 'UPDATE' and old.quantity is not distinct from new.quantity then
    return new;
  end if;
  target_cart_id := case when tg_op = 'DELETE' then old.cart_id else new.cart_id end;
  update public.carts
  set intent_version = intent_version + 1
  where id = target_cart_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists bump_cart_intent_version_on_item_change on public.cart_items;
create trigger bump_cart_intent_version_on_item_change
after insert or delete or update of quantity on public.cart_items
for each row
execute function public.bump_cart_intent_version();

create or replace function public.begin_partner_order_submission_v2(
  target_cart_id uuid,
  target_expected_intent_version bigint,
  target_submission_key uuid,
  target_attempt_id uuid,
  target_delivery_date date,
  target_payload jsonb,
  target_items jsonb
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cart public.carts;
  target_order public.partner_orders;
  business_date date := (now() at time zone 'Europe/Chisinau')::date;
begin
  select *
  into target_order
  from public.partner_orders
  where submission_key = target_submission_key;

  if target_order.id is not null then
    if target_order.submitted_by <> auth.uid() then
      raise exception 'Order submission key is not available.' using errcode = '42501';
    end if;
    return target_order;
  end if;

  select *
  into target_cart
  from public.carts
  where id = target_cart_id
    and created_by = auth.uid()
  for update;

  if target_cart.id is null
    or target_cart.status <> 'active'
    or not public.can_manage_partner_order_company(target_cart.company_id) then
    raise exception 'Cart is not available for submission.' using errcode = '42501';
  end if;

  if target_expected_intent_version is null
    or target_cart.intent_version <> target_expected_intent_version then
    raise exception 'CART_INTENT_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if target_delivery_date < business_date
    or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) = 0 then
    raise exception 'Order submission is invalid.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
    group by item.product_id
    having count(*) > 1
  ) then
    raise exception 'Order submission contains duplicate products.' using errcode = '23514';
  end if;

  if exists (
    (
      select item.product_id, item.quantity
      from public.cart_items item
      where item.cart_id = target_cart.id
      except
      select submitted.product_id, submitted.quantity
      from jsonb_to_recordset(target_items) as submitted(product_id uuid, quantity integer)
    )
    union all
    (
      select submitted.product_id, submitted.quantity
      from jsonb_to_recordset(target_items) as submitted(product_id uuid, quantity integer)
      except
      select item.product_id, item.quantity
      from public.cart_items item
      where item.cart_id = target_cart.id
    )
  ) then
    raise exception 'CART_INTENT_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.partner_orders(
    company_id,
    submitted_by,
    cart_id,
    submission_key,
    submission_attempt_id,
    requested_delivery_date,
    payload_snapshot
  )
  values (
    target_cart.company_id,
    auth.uid(),
    target_cart.id,
    target_submission_key,
    target_attempt_id,
    target_delivery_date,
    target_payload
  )
  returning * into target_order;

  insert into public.partner_order_items(
    order_id,
    product_id,
    external_product_ref,
    external_characteristic_ref,
    external_unit_ref,
    external_vat_rate_ref,
    product_name,
    sku,
    quantity,
    partner_unit_price,
    currency_code,
    line_total,
    available_stock,
    nearest_arrival_date,
    nearest_arrival_quantity
  )
  select
    target_order.id,
    item.product_id,
    item.external_product_ref,
    item.external_characteristic_ref,
    item.external_unit_ref,
    item.external_vat_rate_ref,
    item.product_name,
    item.sku,
    item.quantity,
    item.partner_unit_price,
    item.currency_code,
    item.line_total,
    item.available_stock,
    item.nearest_arrival_date,
    item.nearest_arrival_quantity
  from jsonb_to_recordset(target_items) as item(
    product_id uuid,
    external_product_ref text,
    external_characteristic_ref text,
    external_unit_ref text,
    external_vat_rate_ref text,
    product_name text,
    sku text,
    quantity integer,
    partner_unit_price numeric,
    currency_code text,
    line_total numeric,
    available_stock numeric,
    nearest_arrival_date date,
    nearest_arrival_quantity numeric
  );

  update public.carts
  set status = 'submitting'
  where id = target_cart.id;

  return target_order;
end;
$$;

revoke all on function public.bump_cart_intent_version() from public, anon, authenticated;
revoke all on function public.begin_partner_order_submission_v2(
  uuid, bigint, uuid, uuid, date, jsonb, jsonb
) from public, anon;
grant execute on function public.begin_partner_order_submission_v2(
  uuid, bigint, uuid, uuid, date, jsonb, jsonb
) to authenticated;

comment on column public.carts.intent_version is
  'Monotonic user-intent version. Changes only when cart lines or quantities change.';
comment on function public.begin_partner_order_submission_v2(
  uuid, bigint, uuid, uuid, date, jsonb, jsonb
) is
  'Acquires checkout ownership only when the submitted cart intent version and canonical line set still match.';

create or replace function public.set_partner_cart_item_quantity(
  target_item_id uuid,
  target_quantity integer
)
returns public.cart_items
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cart public.carts;
  target_item public.cart_items;
begin
  if target_quantity < 1 or target_quantity > 9999 then
    raise exception 'Cart quantity is invalid.' using errcode = '23514';
  end if;

  select cart.*
  into target_cart
  from public.carts cart
  join public.cart_items item on item.cart_id = cart.id
  where item.id = target_item_id
    and cart.status = 'active'
    and cart.created_by = auth.uid()
    and public.can_manage_partner_order_company(cart.company_id)
  for update of cart;

  if target_cart.id is null then
    raise exception 'Cart item was not found.' using errcode = 'P0002';
  end if;

  update public.cart_items
  set quantity = target_quantity
  where id = target_item_id
    and cart_id = target_cart.id
  returning * into target_item;

  if target_item.id is null then
    raise exception 'Cart item was not found.' using errcode = 'P0002';
  end if;
  return target_item;
end;
$$;

create or replace function public.remove_partner_cart_item(target_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cart public.carts;
begin
  select cart.*
  into target_cart
  from public.carts cart
  join public.cart_items item on item.cart_id = cart.id
  where item.id = target_item_id
    and cart.status = 'active'
    and cart.created_by = auth.uid()
    and public.can_manage_partner_order_company(cart.company_id)
  for update of cart;

  if target_cart.id is null then
    raise exception 'Cart item was not found.' using errcode = 'P0002';
  end if;

  delete from public.cart_items
  where id = target_item_id
    and cart_id = target_cart.id;

  if not found then
    raise exception 'Cart item was not found.' using errcode = 'P0002';
  end if;
end;
$$;

commit;
