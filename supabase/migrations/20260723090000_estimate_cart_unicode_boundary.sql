-- Preserve Unicode text at the cart-to-estimate boundary.
-- The replaced function is identical to the applied version except for the
-- corrected UTF-8 default section literal.

create or replace function public.create_estimate_from_cart(
  target_cart_id uuid,
  target_name text,
  target_currency_code text,
  target_lines jsonb,
  target_request_key uuid
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare target_cart public.carts; created public.estimates; section_id uuid; prior public.estimate_cart_conversions;
begin
  select * into target_cart from public.carts where id = target_cart_id for update;
  if target_cart.id is null or target_cart.created_by <> auth.uid() or target_cart.status <> 'active'
     or not public.can_access_estimates(target_cart.company_id, 'estimates.manage') then
    raise exception 'Cart is not available.' using errcode = '42501';
  end if;
  if jsonb_array_length(target_lines) = 0 then raise exception 'Cart is empty.' using errcode = '23514'; end if;
  select * into prior from public.estimate_cart_conversions
  where company_id = target_cart.company_id and request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.direction <> 'cart_to_estimate' then
      raise exception 'Request key is already used.' using errcode = '23505';
    end if;
    select * into created from public.estimates where id = prior.estimate_id;
    return created;
  end if;
  perform set_config('app.estimate_bulk_operation', 'true', true);
  insert into public.estimates(company_id, created_by, name, currency_code, validity_days)
  values (target_cart.company_id, auth.uid(), btrim(target_name), upper(target_currency_code), 14)
  returning * into created;
  insert into public.estimate_sections(estimate_id, name, sort_order)
  values (created.id, 'Оборудование', 0)
  returning id into section_id;
  insert into public.estimate_items(
    estimate_id, section_id, line_type, product_id, position, sku_snapshot, product_name_snapshot,
    source_unit_price, source_currency_code, source_snapshot_at, pricing_mode, pricing_input_value,
    converted_cost_unit_price, exchange_rate, exchange_rate_effective_date, description, quantity, unit, selling_unit_price
  )
  select created.id, section_id, 'product', row.product_id, row.position, row.sku, row.product_name,
    row.partner_price, row.currency_code, row.snapshot_at, 'direct', row.converted_price,
    row.converted_price, row.exchange_rate, row.exchange_rate_date, row.product_name, cart_item.quantity, 'pcs', row.converted_price
  from jsonb_to_recordset(target_lines) as row(
    product_id uuid, position integer, sku text, product_name text, quantity numeric, partner_price numeric,
    currency_code text, snapshot_at timestamptz, converted_price numeric, exchange_rate numeric, exchange_rate_date date
  )
  join public.cart_items cart_item on cart_item.cart_id = target_cart.id and cart_item.product_id = row.product_id
  join public.catalog_products product on product.id = row.product_id and product.is_active and product.is_visible;
  perform public.recalculate_estimate_totals(created.id);
  insert into public.estimate_cart_conversions(company_id, estimate_id, cart_id, direction, request_key, summary, created_by)
  values (created.company_id, created.id, target_cart.id, 'cart_to_estimate', target_request_key,
    jsonb_build_object('lineCount', jsonb_array_length(target_lines)), auth.uid());
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (created.id, auth.uid(), 'created_from_cart');
  select * into created from public.estimates where id = created.id;
  return created;
end;
$$;

revoke all on function public.create_estimate_from_cart(uuid, text, text, jsonb, uuid) from public, anon;
grant execute on function public.create_estimate_from_cart(uuid, text, text, jsonb, uuid) to authenticated;
