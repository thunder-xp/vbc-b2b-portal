-- Universal B2B cart admission records customer demand independently of stock,
-- price, FX, and workflow state. Known shortages remain summary evidence only.
create or replace function public.merge_purchasing_list_into_cart(
  target_list_id uuid,
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
  source public.purchasing_lists;
  target_cart public.carts;
  prior public.purchasing_list_operations;
  result jsonb;
  input_count integer;
  eligible_count integer := 0;
  insufficient_stock_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));

  select * into prior
  from public.purchasing_list_operations
  where request_key = target_request_key;

  if prior.id is not null then
    if prior.created_by <> auth.uid()
      or prior.list_id <> target_list_id
      or prior.operation_type <> 'list_to_cart'
      or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchasing list operation key is already used.' using errcode = '23505';
    end if;
    return prior.result || jsonb_build_object('repeated', true);
  end if;

  select * into source
  from public.purchasing_lists
  where id = target_list_id;

  if source.id is null
    or not public.can_view_purchasing_list(source)
    or not public.has_permission(source.company_id, 'cart.manage') then
    raise exception 'Purchasing list conversion denied.' using errcode = '42501';
  end if;

  if jsonb_typeof(target_items) <> 'array' then
    raise exception 'Purchasing list conversion items are invalid.' using errcode = '22023';
  end if;

  input_count := jsonb_array_length(target_items);
  if input_count not between 1 and 200
    or (select count(distinct row.item_id) from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)) <> input_count
    or exists (
      select 1
      from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
      where row.quantity not between 1 and 9999
        or not exists (
          select 1
          from public.purchasing_list_items item
          join public.catalog_products product on product.id = item.product_id
          where item.id = row.item_id
            and item.list_id = source.id
            and item.product_id = row.product_id
            and product.is_active
            and product.is_visible
        )
    ) then
    raise exception 'Purchasing list conversion items are invalid.' using errcode = '22023';
  end if;

  select * into target_cart
  from public.carts
  where company_id = source.company_id
    and created_by = auth.uid()
    and status = 'active'
  for update;

  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status)
    values (source.company_id, auth.uid(), 'active')
    returning * into target_cart;
  end if;

  select count(distinct row.product_id)::integer
  into eligible_count
  from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer);

  -- Preserve known shortage evidence without making it an admission decision.
  with requested as (
    select row.product_id, sum(row.quantity)::integer as quantity
    from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
    group by row.product_id
  ), existing as (
    select item.product_id, sum(item.quantity)::integer as quantity
    from public.cart_items item
    where item.cart_id = target_cart.id
    group by item.product_id
  )
  select count(*)::integer into insufficient_stock_count
  from requested
  left join existing on existing.product_id = requested.product_id
  join public.product_stock_totals stock on stock.product_id = requested.product_id
  where stock.is_published
    and stock.freshness_state = 'authoritative'
    and coalesce(existing.quantity, 0) + requested.quantity > stock.available_quantity;

  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, row.product_id, sum(row.quantity)::integer
  from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
  group by row.product_id
  on conflict (cart_id, product_id) where commercial_source = 'STANDARD' do update
    set quantity = public.cart_items.quantity + excluded.quantity,
        updated_at = now();

  result := coalesce(target_summary, '{}'::jsonb) || jsonb_build_object(
    'cart_id', target_cart.id,
    'repeated', false,
    'added', eligible_count,
    'skipped', 0,
    'insufficient_stock', insufficient_stock_count
  );

  insert into public.purchasing_list_operations(
    request_key, operation_type, list_id, company_id, created_by, request_fingerprint, result
  ) values (
    target_request_key, 'list_to_cart', source.id, source.company_id, auth.uid(), target_request_fingerprint, result
  );

  insert into public.purchasing_list_events(list_id, actor_user_id, event_type, metadata)
  values (source.id, auth.uid(), 'added_to_cart', jsonb_build_object(
    'item_count', eligible_count,
    'skipped_count', 0,
    'insufficient_stock_count', insufficient_stock_count
  ));

  return result;
end;
$$;

revoke all on function public.merge_purchasing_list_into_cart(uuid, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.merge_purchasing_list_into_cart(uuid, uuid, text, jsonb, jsonb) to authenticated;
