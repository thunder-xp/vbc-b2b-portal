-- Cart -> Estimate is a product-intent boundary. Cart commercial contexts stay
-- on the source rows; an estimate receives one governed line per product.

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
declare
  target_cart public.carts;
  created public.estimates;
  section_id uuid;
  prior public.estimate_cart_conversions;
  submitted_line_count integer;
  authoritative_line_count integer;
  expected_currency_code text;
begin
  select * into target_cart
  from public.carts
  where id = target_cart_id
  for update;

  if target_cart.id is null
    or target_cart.created_by <> auth.uid()
    or target_cart.status <> 'active'
    or not public.can_access_estimates(target_cart.company_id, 'estimates.manage')
  then
    raise exception 'Cart is not available.' using errcode = '42501';
  end if;

  if jsonb_typeof(target_lines) is distinct from 'array' then
    raise exception 'Cart lines are invalid.' using errcode = '23514';
  end if;

  submitted_line_count := jsonb_array_length(target_lines);
  if submitted_line_count not between 1 and 500 then
    raise exception 'Cart is empty or too large.' using errcode = '23514';
  end if;

  select * into prior
  from public.estimate_cart_conversions
  where company_id = target_cart.company_id
    and request_key = target_request_key;

  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.direction <> 'cart_to_estimate' then
      raise exception 'Request key is already used.' using errcode = '23505';
    end if;
    select * into created from public.estimates where id = prior.estimate_id;
    perform public.initialize_canonical_estimate_sections(created.id);
    return created;
  end if;

  select count(distinct item.product_id)
  into authoritative_line_count
  from public.cart_items item
  where item.cart_id = target_cart.id;

  if authoritative_line_count = 0 or authoritative_line_count <> submitted_line_count then
    raise exception 'Cart product aggregate is invalid.' using errcode = '23514';
  end if;

  if exists (
    with submitted as (
      select row.*
      from jsonb_to_recordset(target_lines) as row(
        product_id uuid,
        position integer,
        sku text,
        product_name text,
        quantity numeric,
        partner_price numeric,
        currency_code text,
        snapshot_at timestamptz,
        converted_price numeric,
        exchange_rate numeric,
        exchange_rate_date date
      )
    )
    select 1
    from submitted
    where product_id is null
      or position is null
      or position not between 1 and submitted_line_count
      or quantity is null
      or quantity <= 0
      or quantity <> trunc(quantity)
  ) or (
    select count(distinct row.product_id) <> submitted_line_count
      or count(distinct row.position) <> submitted_line_count
    from jsonb_to_recordset(target_lines) as row(product_id uuid, position integer)
  ) then
    raise exception 'Cart product aggregate is invalid.' using errcode = '23514';
  end if;

  if exists (
    with submitted as (
      select row.product_id, row.quantity
      from jsonb_to_recordset(target_lines) as row(product_id uuid, quantity numeric)
    ), authoritative as (
      select item.product_id, sum(item.quantity)::numeric as quantity
      from public.cart_items item
      where item.cart_id = target_cart.id
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

  if exists (
    select 1
    from jsonb_to_recordset(target_lines) as row(product_id uuid)
    left join public.catalog_products product
      on product.id = row.product_id
      and product.is_active
      and product.is_visible
    where product.id is null
  ) then
    raise exception 'Cart contains an unavailable product.' using errcode = '23514';
  end if;

  select coalesce(upper(nullif(btrim(row.currency_code), '')), 'USD')
  into expected_currency_code
  from jsonb_to_recordset(target_lines) as row(position integer, currency_code text)
  where row.position = 1;

  if expected_currency_code is null
    or expected_currency_code !~ '^[A-Z]{3}$'
    or upper(nullif(btrim(target_currency_code), '')) is distinct from expected_currency_code
  then
    raise exception 'Estimate currency is invalid.' using errcode = '23514';
  end if;

  if exists (
    with submitted as (
      select row.*
      from jsonb_to_recordset(target_lines) as row(
        product_id uuid,
        position integer,
        partner_price numeric,
        currency_code text,
        snapshot_at timestamptz,
        converted_price numeric,
        exchange_rate numeric,
        exchange_rate_date date
      )
    ), governed as (
      select
        submitted.*,
        price.price_amount as expected_partner_price,
        case
          when price.currency_status <> 'resolved' then null
          when upper(btrim(price.currency)) = '999' then 'USD'
          when upper(btrim(price.currency)) = '498' then 'MDL'
          when upper(btrim(price.currency)) ~ '^[A-Z]{3}$' and upper(btrim(price.currency)) <> 'XXX'
            then upper(btrim(price.currency))
          else null
        end as expected_source_currency,
        price.updated_at as expected_snapshot_at,
        rate.rate as governed_rate,
        rate.effective_at::date as governed_rate_date
      from submitted
      join public.partner_companies company on company.id = target_cart.company_id
      left join lateral (
        select candidate.*
        from public.product_prices candidate
        where candidate.product_id = submitted.product_id
          and company.external_1c_price_type_id is not null
          and candidate.external_1c_price_type_id = company.external_1c_price_type_id
          and candidate.is_active
          and candidate.is_published
          and candidate.valid_from <= now()
          and (candidate.valid_to is null or candidate.valid_to >= now())
          and (candidate.company_id is null or candidate.company_id = target_cart.company_id)
        order by (candidate.company_id = target_cart.company_id) desc,
          candidate.valid_from desc,
          candidate.id
        limit 1
      ) price on true
      left join lateral (
        select current_rate.rate, current_rate.effective_at
        from public.commercial_exchange_rates current_rate
        where current_rate.purpose = 'partner_price_usd_to_mdl'
          and current_rate.is_active
          and current_rate.is_published
          and current_rate.rate > 0
        order by current_rate.effective_at desc, current_rate.published_at desc, current_rate.id
        limit 1
      ) rate on true
    ), expected as (
      select governed.*,
        case
          when expected_partner_price is null or expected_partner_price = 0 or expected_source_currency is null then null
          when expected_source_currency = expected_currency_code then 1::numeric
          when expected_source_currency = 'USD' and expected_currency_code = 'MDL' then governed_rate
          when expected_source_currency = 'MDL' and expected_currency_code = 'USD' then round(1::numeric / governed_rate, 8)
          else null
        end as expected_exchange_rate
      from governed
    ), final_expected as (
      select expected.*,
        case when expected_exchange_rate is null then null
          else round(expected_partner_price * expected_exchange_rate, 2)
        end as expected_converted_price,
        case
          when expected_exchange_rate is null then null
          when expected_exchange_rate = 1 then expected_snapshot_at::date
          else governed_rate_date
        end as expected_exchange_rate_date
      from expected
    )
    select 1
    from final_expected
    where (
        expected_partner_price is not null
        and expected_partner_price <> 0
        and expected_source_currency is not null
        and expected_source_currency <> expected_currency_code
        and expected_exchange_rate is null
      )
      or partner_price is distinct from expected_partner_price
      or nullif(upper(btrim(currency_code)), '') is distinct from expected_source_currency
      or snapshot_at is distinct from expected_snapshot_at
      or exchange_rate is distinct from expected_exchange_rate
      or converted_price is distinct from expected_converted_price
      or exchange_rate_date is distinct from expected_exchange_rate_date
  ) then
    raise exception 'Estimate price snapshot is invalid.' using errcode = '23514';
  end if;

  perform set_config('app.estimate_bulk_operation', 'true', true);

  insert into public.estimates(company_id, created_by, name, currency_code, validity_days)
  values (
    target_cart.company_id,
    auth.uid(),
    btrim(target_name),
    expected_currency_code,
    14
  )
  returning * into created;

  section_id := public.initialize_canonical_estimate_sections(created.id);

  insert into public.estimate_items(
    estimate_id,
    section_id,
    line_type,
    product_id,
    position,
    sku_snapshot,
    product_name_snapshot,
    source_unit_price,
    source_currency_code,
    source_snapshot_at,
    pricing_mode,
    pricing_input_value,
    converted_cost_unit_price,
    exchange_rate,
    exchange_rate_effective_date,
    description,
    quantity,
    unit,
    selling_unit_price
  )
  with submitted as (
    select row.*
    from jsonb_to_recordset(target_lines) as row(
      product_id uuid,
      position integer,
      quantity numeric,
      partner_price numeric,
      currency_code text,
      snapshot_at timestamptz,
      converted_price numeric,
      exchange_rate numeric,
      exchange_rate_date date
    )
  ), authoritative as (
    select item.product_id, sum(item.quantity)::numeric as quantity
    from public.cart_items item
    where item.cart_id = target_cart.id
    group by item.product_id
  )
  select
    created.id,
    section_id,
    'product',
    product.id,
    submitted.position,
    product.sku,
    product.name,
    submitted.partner_price,
    nullif(upper(btrim(submitted.currency_code)), ''),
    submitted.snapshot_at,
    'direct',
    submitted.converted_price,
    submitted.converted_price,
    submitted.exchange_rate,
    submitted.exchange_rate_date,
    product.name,
    authoritative.quantity,
    'pcs',
    submitted.converted_price
  from submitted
  join authoritative using (product_id)
  join public.catalog_products product
    on product.id = submitted.product_id
    and product.is_active
    and product.is_visible
  order by submitted.position;

  if not found then
    raise exception 'Cart product aggregate is invalid.' using errcode = '23514';
  end if;

  perform public.recalculate_estimate_totals(created.id);

  insert into public.estimate_cart_conversions(
    company_id,
    estimate_id,
    cart_id,
    direction,
    request_key,
    summary,
    created_by
  )
  values (
    created.company_id,
    created.id,
    target_cart.id,
    'cart_to_estimate',
    target_request_key,
    jsonb_build_object('lineCount', authoritative_line_count),
    auth.uid()
  );

  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (created.id, auth.uid(), 'created_from_cart');

  select * into created from public.estimates where id = created.id;
  return created;
end;
$$;

revoke all on function public.create_estimate_from_cart(uuid, text, text, jsonb, uuid)
  from public, anon;
grant execute on function public.create_estimate_from_cart(uuid, text, text, jsonb, uuid)
  to authenticated;

comment on function public.create_estimate_from_cart(uuid, text, text, jsonb, uuid) is
  'Creates one governed estimate line per cart product after validating exact aggregate quantity and current commercial price; source cart contexts remain unchanged.';
