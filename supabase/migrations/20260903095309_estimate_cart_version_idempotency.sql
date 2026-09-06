-- Enforce immutable Estimate-version idempotency at the database boundary.
-- Existing conversion rows are authoritative; no new commercial state is added.

create or replace function public.merge_estimate_products_into_cart(
  target_company_id uuid,
  target_estimate_id uuid,
  target_version_id uuid,
  target_items jsonb,
  target_request_key uuid,
  target_summary jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare target_cart public.carts; prior public.estimate_cart_conversions;
begin
  select * into prior
  from public.estimate_cart_conversions
  where company_id = target_company_id and request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.direction <> 'estimate_to_cart'
       or prior.estimate_id <> target_estimate_id or prior.version_id is distinct from target_version_id then
      raise exception 'Request key is already used.' using errcode = '23505';
    end if;
    return prior.cart_id;
  end if;

  if not public.can_access_estimates(target_company_id, 'estimates.convert_to_cart')
     or not public.can_manage_partner_order_company(target_company_id)
     or not exists (
       select 1 from public.estimates estimate
       where estimate.id = target_estimate_id and estimate.company_id = target_company_id
     ) then
    raise exception 'Estimate conversion is not available.' using errcode = '42501';
  end if;

  if target_version_id is not null then
    perform 1
    from public.estimate_versions version
    where version.id = target_version_id
      and version.estimate_id = target_estimate_id
      and version.company_id = target_company_id
    for update;
    if not found then
      raise exception 'Estimate conversion is not available.' using errcode = '42501';
    end if;

    select * into prior
    from public.estimate_cart_conversions conversion
    where conversion.company_id = target_company_id
      and conversion.estimate_id = target_estimate_id
      and conversion.version_id = target_version_id
      and conversion.direction = 'estimate_to_cart'
    order by conversion.created_at, conversion.id
    limit 1;
    if prior.id is not null then
      if prior.created_by <> auth.uid() then
        raise exception 'Estimate conversion is not available.' using errcode = '42501';
      end if;
      return prior.cart_id;
    end if;
  end if;

  select * into target_cart
  from public.carts
  where company_id = target_company_id and created_by = auth.uid() and status = 'active'
  for update;
  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status)
    values (target_company_id, auth.uid(), 'active')
    returning * into target_cart;
  end if;

  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, row.product_id, least(9999, sum(row.quantity)::integer)
  from jsonb_to_recordset(target_items) as row(product_id uuid, quantity integer)
  join public.catalog_products product on product.id = row.product_id and product.is_active and product.is_visible
  where row.quantity between 1 and 9999
    and ((target_version_id is null and exists (
      select 1
      from public.estimate_items estimate_item
      where estimate_item.estimate_id = target_estimate_id
        and estimate_item.line_type = 'product'
        and estimate_item.product_id = row.product_id
    ))
    or (target_version_id is not null and exists (
      select 1
      from public.estimate_versions source_version,
        jsonb_array_elements(source_version.snapshot -> 'items') snapshot_item
      where source_version.id = target_version_id
        and snapshot_item ->> 'line_type' = 'product'
        and snapshot_item ->> 'product_id' = row.product_id::text
    )))
  group by row.product_id
  on conflict (cart_id, product_id) do update
    set quantity = least(9999, public.cart_items.quantity + excluded.quantity), updated_at = now();

  insert into public.estimate_cart_conversions(
    company_id, estimate_id, version_id, cart_id, direction, request_key, summary, created_by
  ) values (
    target_company_id, target_estimate_id, target_version_id, target_cart.id,
    'estimate_to_cart', target_request_key, target_summary, auth.uid()
  );
  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (target_estimate_id, auth.uid(), 'added_to_cart');
  return target_cart.id;
end;
$$;

comment on function public.merge_estimate_products_into_cart(uuid, uuid, uuid, jsonb, uuid, jsonb)
  is 'Merges an Estimate into the actor active cart once per immutable version, preserving request-key idempotency for legacy callers.';
