begin;

-- A cart-labelled Purchasing List must be proven against the actor-owned cart.
-- The cart row lock matches canonical cart writers and keeps the grouped item
-- snapshot stable until list persistence completes.
create or replace function public.create_purchasing_list(
  target_company_id uuid,
  target_name text,
  target_description text,
  target_visibility text,
  target_source_type text,
  target_source_reference_id uuid,
  target_items jsonb
)
returns public.purchasing_lists
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.purchasing_lists;
  authoritative_cart public.carts;
  item_count integer;
begin
  if target_source_type = 'cart'
    and (auth.uid() is null or target_source_reference_id is null)
  then
    raise exception 'Cart purchasing list access denied.' using errcode = '42501';
  end if;

  if not public.has_permission(target_company_id, 'purchasing_lists.manage') then
    raise exception 'Purchasing list access denied.' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(target_name, ''))) not between 1 and 120
    or char_length(coalesce(target_description, '')) > 1000
    or target_visibility not in ('private', 'company')
    or target_source_type not in ('manual', 'catalog', 'cart', 'order', 'quick_reorder', 'duplicate')
  then
    raise exception 'Purchasing list input is invalid.' using errcode = '22023';
  end if;

  if jsonb_typeof(target_items) is distinct from 'array'
    or jsonb_array_length(target_items) > 200
  then
    raise exception 'Purchasing list items are invalid.' using errcode = '22023';
  end if;

  item_count := jsonb_array_length(target_items);

  if exists (
    select 1
    from jsonb_array_elements(target_items) entry(value)
    where jsonb_typeof(entry.value) is distinct from 'object'
      or jsonb_typeof(entry.value -> 'product_id') is distinct from 'string'
      or jsonb_typeof(entry.value -> 'quantity') is distinct from 'number'
      or (entry.value ->> 'quantity') !~ '^[0-9]+$'
  ) then
    raise exception 'Purchasing list item is invalid.' using errcode = '22023';
  end if;

  if (
    select count(distinct row.product_id)
    from jsonb_to_recordset(target_items) row(product_id uuid, quantity integer)
  ) <> item_count then
    raise exception 'Purchasing list contains duplicate products.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) row(product_id uuid, quantity integer)
    where row.product_id is null
      or row.quantity is null
      or row.quantity not between 1 and 9999
      or not exists (
        select 1
        from public.catalog_products product
        where product.id = row.product_id
      )
  ) then
    raise exception 'Purchasing list item is invalid.' using errcode = '22023';
  end if;

  if target_source_type = 'cart' then
    select *
    into authoritative_cart
    from public.carts
    where id = target_source_reference_id
    for update;

    if authoritative_cart.id is null
      or authoritative_cart.company_id <> target_company_id
      or authoritative_cart.created_by <> auth.uid()
      or authoritative_cart.status <> 'active'
    then
      raise exception 'Cart is not available.' using errcode = '42501';
    end if;

    if item_count not between 1 and 200 then
      raise exception 'Cart is empty or too large.' using errcode = '23514';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(target_items) row(product_id uuid)
      left join public.catalog_products product
        on product.id = row.product_id
        and product.is_active
        and product.is_visible
      where product.id is null
    ) then
      raise exception 'Cart contains an unavailable product.' using errcode = '23514';
    end if;

    if exists (
      with submitted as (
        select row.product_id, row.quantity
        from jsonb_to_recordset(target_items) row(product_id uuid, quantity integer)
      ),
      authoritative as (
        select item.product_id, sum(item.quantity)::integer as quantity
        from public.cart_items item
        where item.cart_id = authoritative_cart.id
        group by item.product_id
      )
      select 1
      from submitted
      full join authoritative using (product_id)
      where submitted.product_id is null
        or authoritative.product_id is null
        or submitted.quantity is distinct from authoritative.quantity
    ) then
      raise exception 'Cart product aggregate is invalid.' using errcode = '23514';
    end if;
  end if;

  insert into public.purchasing_lists(
    company_id,
    name,
    description,
    visibility,
    created_by,
    updated_by
  )
  values (
    target_company_id,
    btrim(target_name),
    nullif(btrim(target_description), ''),
    target_visibility,
    auth.uid(),
    auth.uid()
  )
  returning * into created;

  if target_source_type = 'cart' then
    insert into public.purchasing_list_items(
      list_id,
      product_id,
      quantity,
      position,
      note,
      source_type,
      source_reference_id,
      source_unit_price,
      source_currency_code
    )
    with submitted as (
      select parsed.*, entry.ordinality
      from jsonb_array_elements(target_items) with ordinality entry(value, ordinality)
      cross join lateral jsonb_to_record(entry.value) parsed(
        product_id uuid,
        quantity integer,
        note text
      )
    ),
    authoritative as (
      select item.product_id, sum(item.quantity)::integer as quantity
      from public.cart_items item
      where item.cart_id = authoritative_cart.id
      group by item.product_id
    ),
    governed_prices as (
      select
        candidate.product_id,
        candidate.price_amount,
        case
          when candidate.currency_status <> 'resolved' then null
          when upper(btrim(candidate.currency)) = '999' then 'USD'
          when upper(btrim(candidate.currency)) = '498' then 'MDL'
          when upper(btrim(candidate.currency)) ~ '^[A-Z]{3}$'
            and upper(btrim(candidate.currency)) <> 'XXX'
          then upper(btrim(candidate.currency))
          else null
        end as currency_code,
        row_number() over (
          partition by candidate.product_id
          order by
            (candidate.company_id = target_company_id) desc nulls last,
            candidate.valid_from desc,
            candidate.id
        ) as price_rank
      from public.product_prices candidate
      join public.partner_companies company
        on company.id = target_company_id
      join authoritative
        on authoritative.product_id = candidate.product_id
      where company.external_1c_price_type_id is not null
        and candidate.external_1c_price_type_id = company.external_1c_price_type_id
        and candidate.is_active
        and candidate.is_published
        and candidate.valid_from <= now()
        and (candidate.valid_to is null or candidate.valid_to >= now())
        and (candidate.company_id is null or candidate.company_id = target_company_id)
    )
    select
      created.id,
      submitted.product_id,
      authoritative.quantity,
      submitted.ordinality,
      nullif(btrim(submitted.note), ''),
      'cart',
      authoritative_cart.id,
      case when price.currency_code is null then null else price.price_amount end,
      price.currency_code
    from submitted
    join authoritative using (product_id)
    left join governed_prices price
      on price.product_id = submitted.product_id
      and price.price_rank = 1
    order by submitted.ordinality;
  else
    insert into public.purchasing_list_items(
      list_id,
      product_id,
      quantity,
      position,
      note,
      source_type,
      source_reference_id,
      source_unit_price,
      source_currency_code
    )
    select
      created.id,
      row.product_id,
      row.quantity,
      row.ordinality,
      nullif(btrim(row.note), ''),
      target_source_type,
      coalesce(row.source_reference_id, target_source_reference_id),
      row.source_unit_price,
      upper(nullif(btrim(row.source_currency_code), ''))
    from (
      select parsed.*, entry.ordinality
      from jsonb_array_elements(target_items) with ordinality entry(value, ordinality)
      cross join lateral jsonb_to_record(entry.value) parsed(
        product_id uuid,
        quantity integer,
        note text,
        source_reference_id uuid,
        source_unit_price numeric,
        source_currency_code text
      )
    ) row;
  end if;

  insert into public.purchasing_list_events(
    list_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    created.id,
    auth.uid(),
    'created',
    jsonb_build_object('source_type', target_source_type, 'item_count', item_count)
  );

  return created;
end;
$$;

revoke all on function public.create_purchasing_list(uuid, text, text, text, text, uuid, jsonb)
  from public, anon;
grant execute on function public.create_purchasing_list(uuid, text, text, text, text, uuid, jsonb)
  to authenticated;

comment on function public.create_purchasing_list(uuid, text, text, text, text, uuid, jsonb) is
  'Creates Purchasing Lists; cart sources are locked and validated against exact grouped cart product intent with server-derived normal Partner price metadata.';

commit;
