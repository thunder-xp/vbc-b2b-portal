-- Bounded, company-scoped batch mutation for the temporary live-commerce selection.

create or replace function public.add_partner_cart_items(
  target_company_id uuid,
  target_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cart public.carts;
  item_count integer;
  added_count integer;
  updated_count integer;
begin
  if not public.can_manage_partner_order_company(target_company_id)
     or jsonb_typeof(target_items) <> 'array'
     or jsonb_array_length(target_items) < 1
     or jsonb_array_length(target_items) > 50 then
    raise exception 'Cart selection is not allowed.' using errcode = '42501';
  end if;

  with input as (
    select item.product_id, item.quantity
    from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
  )
  select count(*), count(distinct product_id)
  into item_count, added_count
  from input
  where product_id is not null and quantity between 1 and 9999;

  if item_count <> jsonb_array_length(target_items) or added_count <> item_count then
    raise exception 'Cart selection is invalid.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
    left join public.catalog_products product on product.id = item.product_id
    where product.id is null or not product.is_active or not product.is_visible
  ) then
    raise exception 'Catalog product is not available.' using errcode = 'P0002';
  end if;

  select * into target_cart
  from public.carts
  where company_id = target_company_id and created_by = auth.uid() and status = 'active'
  for update;

  if target_cart.id is null then
    insert into public.carts(company_id, created_by)
    values (target_company_id, auth.uid())
    returning * into target_cart;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
    join public.cart_items existing on existing.cart_id = target_cart.id and existing.product_id = item.product_id
    where existing.quantity + item.quantity > 9999
  ) then
    raise exception 'Cart quantity is invalid.' using errcode = '23514';
  end if;

  select count(*) into updated_count
  from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
  join public.cart_items existing on existing.cart_id = target_cart.id and existing.product_id = item.product_id;

  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, item.product_id, item.quantity
  from jsonb_to_recordset(target_items) as item(product_id uuid, quantity integer)
  on conflict (cart_id, product_id) do update
    set quantity = public.cart_items.quantity + excluded.quantity;

  return jsonb_build_object(
    'cart_id', target_cart.id,
    'added', item_count - updated_count,
    'updated', updated_count
  );
end;
$$;

revoke all on function public.add_partner_cart_items(uuid, jsonb) from public, anon;
grant execute on function public.add_partner_cart_items(uuid, jsonb) to authenticated;

create or replace function public.create_estimate_with_catalog_product(
  target_company_id uuid,
  estimate_name text,
  target_final_customer_id uuid,
  target_customer_name text,
  target_project_name text,
  target_currency_code text,
  target_validity_days integer,
  estimate_request_key uuid,
  line_request_key uuid,
  line_request_fingerprint text,
  line_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  equipment_section_id uuid;
  insertion jsonb;
begin
  if jsonb_typeof(line_items) <> 'array'
     or jsonb_array_length(line_items) < 1
     or jsonb_array_length(line_items) > 50
     or exists (
       select 1 from jsonb_array_elements(line_items) entry
       where entry->>'line_type' <> 'product'
     ) then
    raise exception 'Catalog estimate entry is invalid.' using errcode = '22023';
  end if;

  select * into target from public.create_estimate_v3(
    target_company_id, estimate_name, target_final_customer_id, target_customer_name,
    target_project_name, target_currency_code, target_validity_days, estimate_request_key
  );

  select section.id into equipment_section_id
  from public.estimate_sections section
  where section.estimate_id = target.id and section.system_key = 'equipment'
  limit 1;

  if equipment_section_id is null then
    raise exception 'Equipment section is unavailable.' using errcode = '22023';
  end if;

  insertion := public.add_estimate_items_v2(
    target.id, target.revision, equipment_section_id, line_request_key,
    line_request_fingerprint, line_items
  );

  return jsonb_build_object(
    'estimate_id', target.id,
    'repeated', coalesce((insertion->>'repeated')::boolean, false)
  );
end;
$$;

revoke all on function public.create_estimate_with_catalog_product(uuid,text,uuid,text,text,text,integer,uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.create_estimate_with_catalog_product(uuid,text,uuid,text,text,text,integer,uuid,uuid,text,jsonb) to authenticated;
