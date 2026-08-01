begin;

create table if not exists public.order_price_refresh_leases (
  fingerprint text primary key,
  owner_token uuid not null,
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_price_refresh_fingerprint_check
    check (fingerprint ~ '^[0-9a-f]{64}$')
);

alter table public.order_price_refresh_leases enable row level security;
revoke all on public.order_price_refresh_leases from public, anon, authenticated;
grant select, insert, update, delete on public.order_price_refresh_leases to service_role;

create or replace function public.claim_order_price_refresh(
  p_fingerprint text,
  p_owner_token uuid,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'ORDER_PRICE_REFRESH_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_owner_token is null
    or p_ttl_seconds not between 5 and 30 then
    raise exception 'ORDER_PRICE_REFRESH_INVALID_LEASE' using errcode = '22023';
  end if;

  insert into public.order_price_refresh_leases(
    fingerprint, owner_token, locked_until, updated_at
  ) values (
    p_fingerprint, p_owner_token, now() + make_interval(secs => p_ttl_seconds), now()
  )
  on conflict (fingerprint) do update
  set owner_token = excluded.owner_token,
      locked_until = excluded.locked_until,
      updated_at = now()
  where public.order_price_refresh_leases.locked_until <= now();
  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;

create or replace function public.release_order_price_refresh(
  p_fingerprint text,
  p_owner_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'ORDER_PRICE_REFRESH_PERMISSION_DENIED' using errcode = '42501';
  end if;
  delete from public.order_price_refresh_leases
  where fingerprint = p_fingerprint and owner_token = p_owner_token;
end;
$$;

create or replace function public.publish_order_price_refresh(
  p_external_price_type_ref text,
  p_rows jsonb,
  p_verified_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_count integer;
  published_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'ORDER_PRICE_REFRESH_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) not between 1 and 100
    or p_verified_at < now() - interval '1 minute'
    or p_verified_at > now() + interval '1 minute' then
    raise exception 'ORDER_PRICE_REFRESH_INVALID_PAYLOAD' using errcode = '22023';
  end if;

  expected_count := jsonb_array_length(p_rows);
  if not exists (
    select 1 from public.price_types value
    where value.external_ref = p_external_price_type_ref
      and value.is_active
      and value.currency_status = 'resolved'
      and nullif(btrim(value.currency_code), '') is not null
  ) then
    raise exception 'ORDER_PRICE_REFRESH_PRICE_TYPE_MISSING' using errcode = 'P0001';
  end if;

  with parsed as (
    select btrim(value.external_product_ref) external_product_ref,
      value.amount, value.effective_at, value.is_active
    from jsonb_to_recordset(p_rows) as value(
      external_product_ref text,
      amount numeric,
      effective_at timestamptz,
      is_active boolean
    )
  ), validated as (
    select product.id product_id, product.external_1c_id external_product_ref,
      price_type.id price_type_id, price_type.currency_code,
      parsed.amount, parsed.effective_at, parsed.is_active
    from parsed
    join public.catalog_products product
      on product.external_1c_id = parsed.external_product_ref
     and product.is_active and product.is_visible
    join public.price_types price_type
      on price_type.external_ref = p_external_price_type_ref
     and price_type.is_active and price_type.currency_status = 'resolved'
    where parsed.amount > 0 and parsed.is_active
      and parsed.effective_at <= p_verified_at
  ), unique_rows as (
    select distinct on (external_product_ref) *
    from validated
    order by external_product_ref, effective_at desc, amount desc
  )
  insert into public.product_prices(
    product_id, company_id, external_1c_price_type_id, currency,
    price_amount, valid_from, valid_to, is_active, price_type_id,
    external_product_ref, effective_at, synced_at, currency_status,
    last_seen_sync_id, is_published
  )
  select product_id, null, p_external_price_type_ref, currency_code,
    amount, effective_at, null, true, price_type_id,
    external_product_ref, effective_at, p_verified_at, 'resolved',
    null, true
  from unique_rows
  on conflict (product_id, external_1c_price_type_id) do update
  set currency = excluded.currency,
      price_amount = excluded.price_amount,
      valid_from = excluded.valid_from,
      valid_to = null,
      is_active = true,
      price_type_id = excluded.price_type_id,
      external_product_ref = excluded.external_product_ref,
      effective_at = excluded.effective_at,
      synced_at = excluded.synced_at,
      currency_status = 'resolved',
      is_published = true;
  get diagnostics published_count = row_count;

  if published_count <> expected_count then
    raise exception 'ORDER_PRICE_REFRESH_INCOMPLETE' using errcode = 'P0001';
  end if;
  return published_count;
end;
$$;

create or replace function public.enqueue_partner_opportunity_for_relevant_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare product uuid := coalesce(new.product_id, old.product_id);
begin
  if tg_table_name = 'product_prices' and tg_op = 'UPDATE'
    and row(old.product_id, old.external_1c_price_type_id, old.currency,
      old.currency_status, old.price_amount, old.valid_from, old.valid_to,
      old.is_active, old.is_published)
      is not distinct from
      row(new.product_id, new.external_1c_price_type_id, new.currency,
        new.currency_status, new.price_amount, new.valid_from, new.valid_to,
        new.is_active, new.is_published) then
    return null;
  end if;

  insert into public.partner_commercial_opportunity_dirty_companies(company_id, reason)
  select distinct relevance.company_id, tg_table_name
  from (
    select history.company_id from public.partner_order_history_items item
      join public.partner_order_history history on history.id = item.order_history_id
      where item.product_id = product and history.partner_visible
    union select list.company_id from public.purchasing_list_items item
      join public.purchasing_lists list on list.id = item.list_id
      where item.product_id = product and list.archived_at is null
    union select template.company_id from public.purchase_template_items item
      join public.purchase_templates template on template.id = item.template_id
      where item.product_id = product and template.status = 'active'
    union select cart.company_id from public.cart_items item
      join public.carts cart on cart.id = item.cart_id
      where item.product_id = product and cart.status = 'active'
  ) relevance
  on conflict (company_id) do update
  set reason = excluded.reason, last_dirtied_at = now(), locked_at = null;
  return null;
end;
$$;

revoke all on function public.claim_order_price_refresh(text, uuid, integer),
  public.release_order_price_refresh(text, uuid),
  public.publish_order_price_refresh(text, jsonb, timestamptz)
from public, anon, authenticated;
grant execute on function public.claim_order_price_refresh(text, uuid, integer),
  public.release_order_price_refresh(text, uuid),
  public.publish_order_price_refresh(text, jsonb, timestamptz)
to service_role;

comment on table public.order_price_refresh_leases is
  'Private short-lived cross-instance leases for exceptional checkout price verification.';
comment on function public.publish_order_price_refresh(text, jsonb, timestamptz) is
  'Atomically publishes a bounded set of prices verified from 1C during stale checkout recovery.';

commit;
