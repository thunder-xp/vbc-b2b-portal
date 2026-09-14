-- Reconstruct an Estimate in the active cart while retaining source provenance
-- and bounded, deduplicated evidence for catalog stock demand.

create table public.cart_item_sources (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  cart_item_id uuid not null references public.cart_items(id) on delete cascade,
  source_type text not null default 'estimate' check (source_type = 'estimate'),
  source_estimate_id uuid not null references public.estimates(id) on delete restrict,
  source_estimate_line_id uuid not null,
  governed_quantity integer not null check (governed_quantity between 1 and 9999),
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_item_sources_cart_line_unique
    unique (cart_id, source_type, source_estimate_id, source_estimate_line_id)
);

create index cart_item_sources_cart_item_idx
  on public.cart_item_sources(cart_item_id);
create index cart_item_sources_estimate_idx
  on public.cart_item_sources(source_estimate_id, source_estimate_line_id);

create trigger set_cart_item_sources_updated_at
before update on public.cart_item_sources
for each row execute function public.set_updated_at();

comment on table public.cart_item_sources is
  'Normalized cart-line provenance. A product cart line may preserve manual quantity and contributions from multiple Estimate lines.';

create table public.unmet_assortment_demand_events (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  partner_user_id uuid not null references public.user_profiles(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  estimate_line_id uuid not null,
  final_customer_id uuid null references public.partner_final_customers(id) on delete set null,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  sku text not null,
  product_name text not null,
  category_id uuid null references public.catalog_categories(id) on delete set null,
  category_name text null,
  brand_id uuid null references public.catalog_brands(id) on delete set null,
  brand_name text null,
  requested_quantity numeric(14,3) not null check (requested_quantity > 0),
  available_quantity numeric(14,3) not null check (available_quantity >= 0),
  shortage_quantity numeric(14,3) not null check (
    shortage_quantity > 0
    and shortage_quantity = greatest(requested_quantity - available_quantity, 0)
  ),
  price_at_demand numeric(18,4) null check (price_at_demand is null or price_at_demand >= 0),
  currency_code text null check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  demand_reason text not null check (demand_reason in ('PARTIAL_STOCK', 'OUT_OF_STOCK', 'NOT_STOCKED', 'DISCONTINUED')),
  state_fingerprint text not null check (state_fingerprint ~ '^[a-f0-9]{64}$'),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  constraint unmet_assortment_demand_event_state_unique
    unique (partner_company_id, estimate_id, estimate_line_id, state_fingerprint)
);

create index unmet_assortment_demand_events_product_time_idx
  on public.unmet_assortment_demand_events(product_id, occurred_at desc, id);
create index unmet_assortment_demand_events_company_time_idx
  on public.unmet_assortment_demand_events(partner_company_id, occurred_at desc, id);
create index unmet_assortment_demand_events_manager_time_idx
  on public.unmet_assortment_demand_events(partner_user_id, occurred_at desc, id);
create index unmet_assortment_demand_events_category_time_idx
  on public.unmet_assortment_demand_events(category_id, occurred_at desc)
  where category_id is not null;
create index unmet_assortment_demand_events_brand_time_idx
  on public.unmet_assortment_demand_events(brand_id, occurred_at desc)
  where brand_id is not null;

comment on table public.unmet_assortment_demand_events is
  'Append-only catalog stock-shortage evidence. External nomenclature remains owned by estimate_external_item_requests.';

create table public.unmet_assortment_demand_daily (
  bucket_date date not null,
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  partner_user_id uuid not null references public.user_profiles(id) on delete restrict,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  sku text not null,
  product_name text not null,
  category_id uuid null references public.catalog_categories(id) on delete set null,
  category_name text null,
  brand_id uuid null references public.catalog_brands(id) on delete set null,
  brand_name text null,
  dimension_key text not null,
  currency_code text null,
  currency_key text not null,
  request_count integer not null check (request_count > 0),
  requested_quantity numeric(18,3) not null check (requested_quantity > 0),
  available_quantity numeric(18,3) not null check (available_quantity >= 0),
  shortage_quantity numeric(18,3) not null check (shortage_quantity > 0),
  potential_value numeric(20,4) not null check (potential_value >= 0),
  last_demand_at timestamptz not null,
  primary key (
    bucket_date, partner_company_id, partner_user_id, product_id,
    dimension_key, currency_key
  )
);

create index unmet_assortment_demand_daily_window_product_idx
  on public.unmet_assortment_demand_daily(bucket_date desc, product_id);
create index unmet_assortment_demand_daily_window_company_idx
  on public.unmet_assortment_demand_daily(bucket_date desc, partner_company_id);

comment on table public.unmet_assortment_demand_daily is
  'Transactionally maintained bounded analytics read model; admin renders never aggregate the raw evidence table.';

alter table public.cart_item_sources enable row level security;
alter table public.unmet_assortment_demand_events enable row level security;
alter table public.unmet_assortment_demand_daily enable row level security;

revoke all on table public.cart_item_sources,
  public.unmet_assortment_demand_events,
  public.unmet_assortment_demand_daily from public, anon, authenticated;
grant select on table public.cart_item_sources to authenticated;

create policy "Partners view own cart estimate sources"
on public.cart_item_sources for select to authenticated
using (exists (
  select 1
  from public.carts cart
  where cart.id = cart_item_sources.cart_id
    and cart.created_by = (select auth.uid())
    and public.can_manage_partner_order_company(cart.company_id)
));

create or replace function public.prevent_unmet_demand_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Unmet assortment demand history is immutable.' using errcode = '42501';
end;
$$;

create trigger prevent_unmet_demand_event_mutation
before update or delete on public.unmet_assortment_demand_events
for each row execute function public.prevent_unmet_demand_history_mutation();

create or replace function public.transfer_estimate_to_cart_v2(
  target_estimate_id uuid,
  target_request_key uuid,
  target_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_estimate public.estimates;
  target_cart public.carts;
  prior public.estimate_cart_conversions;
  correlation_id uuid := gen_random_uuid();
  input_count integer;
  expected_count integer;
  distinct_line_count integer;
  external_count integer;
  inserted_demand_count integer := 0;
  result_summary jsonb;
begin
  if actor_id is null or target_request_key is null
    or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) > 500 then
    raise exception 'Estimate transfer input is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || target_request_key::text, 0));

  select * into target_estimate
  from public.estimates estimate
  where estimate.id = target_estimate_id
  for update;

  if target_estimate.id is null or target_estimate.deleted_at is not null
    or not public.can_access_estimates(target_estimate.company_id, 'estimates.convert_to_cart')
    or not public.can_manage_partner_order_company(target_estimate.company_id) then
    raise exception 'Estimate transfer is not available.' using errcode = '42501';
  end if;

  select * into prior
  from public.estimate_cart_conversions conversion
  where conversion.company_id = target_estimate.company_id
    and conversion.request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> actor_id or prior.estimate_id <> target_estimate_id
      or prior.direction <> 'estimate_to_cart' then
      raise exception 'Request key is already used.' using errcode = '23505';
    end if;
    return prior.summary || jsonb_build_object('cartId', prior.cart_id, 'repeated', true);
  end if;

  with input_lines as (
    select row.line_id, row.product_id, row.requested_quantity
    from jsonb_to_recordset(target_items) as row(
      line_id uuid,
      product_id uuid,
      requested_quantity integer,
      current_price numeric,
      currency_code text,
      available_quantity numeric,
      stock_status text
    )
  )
  select count(*), count(distinct line_id)
  into input_count, distinct_line_count
  from input_lines;

  select count(*) into expected_count
  from public.estimate_items line
  where line.estimate_id = target_estimate.id and line.line_type = 'product';

  if input_count <> expected_count or distinct_line_count <> input_count
    or exists (
      select 1
      from jsonb_to_recordset(target_items) as row(
        line_id uuid,
        product_id uuid,
        requested_quantity integer,
        current_price numeric,
        currency_code text,
        available_quantity numeric,
        stock_status text
      )
      left join public.estimate_items line
        on line.id = row.line_id
       and line.estimate_id = target_estimate.id
       and line.line_type = 'product'
       and line.product_id = row.product_id
      where line.id is null
        or line.quantity <> trunc(line.quantity)
        or row.requested_quantity <> line.quantity::integer
        or row.requested_quantity not between 1 and 9999
        or (row.available_quantity is not null and row.available_quantity < 0)
        or (row.currency_code is not null and upper(row.currency_code) !~ '^[A-Z]{3}$')
        or row.stock_status not in ('FULLY_AVAILABLE', 'PARTIAL_STOCK', 'OUT_OF_STOCK', 'STOCK_UNKNOWN', 'NOT_STOCKED')
    ) then
    raise exception 'Estimate transfer lines do not match the persisted estimate.' using errcode = '22023';
  end if;

  select * into target_cart
  from public.carts cart
  where cart.company_id = target_estimate.company_id
    and cart.created_by = actor_id
    and cart.status = 'active'
  for update;

  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status)
    values (target_estimate.company_id, actor_id, 'active')
    returning * into target_cart;
  end if;

  -- Existing product lines receive only the delta from this Estimate source.
  with input_lines as (
    select row.line_id, row.product_id, row.requested_quantity
    from jsonb_to_recordset(target_items) as row(line_id uuid, product_id uuid, requested_quantity integer)
  ), desired as (
    select input.product_id,
      sum(input.requested_quantity)::integer desired_quantity,
      sum(input.requested_quantity - coalesce(source.governed_quantity, 0))::integer delta_quantity
    from input_lines input
    left join public.cart_item_sources source
      on source.cart_id = target_cart.id
     and source.source_type = 'estimate'
     and source.source_estimate_id = target_estimate.id
     and source.source_estimate_line_id = input.line_id
    group by input.product_id
  )
  update public.cart_items item
  set quantity = least(9999, greatest(1, item.quantity + desired.delta_quantity)),
      updated_at = now()
  from desired
  where item.cart_id = target_cart.id
    and item.product_id = desired.product_id;

  with input_lines as (
    select row.product_id, row.requested_quantity
    from jsonb_to_recordset(target_items) as row(product_id uuid, requested_quantity integer)
  )
  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, input.product_id, least(9999, sum(input.requested_quantity)::integer)
  from input_lines input
  group by input.product_id
  on conflict (cart_id, product_id) do nothing;

  with input_lines as (
    select row.line_id, row.product_id, row.requested_quantity
    from jsonb_to_recordset(target_items) as row(line_id uuid, product_id uuid, requested_quantity integer)
  )
  insert into public.cart_item_sources(
    cart_id, cart_item_id, source_type, source_estimate_id,
    source_estimate_line_id, governed_quantity, created_by
  )
  select target_cart.id, item.id, 'estimate', target_estimate.id,
    input.line_id, input.requested_quantity, actor_id
  from input_lines input
  join public.cart_items item
    on item.cart_id = target_cart.id and item.product_id = input.product_id
  on conflict (cart_id, source_type, source_estimate_id, source_estimate_line_id)
  do update set
    cart_item_id = excluded.cart_item_id,
    governed_quantity = excluded.governed_quantity,
    updated_at = now();

  -- A transfer is also the explicit request boundary for existing external
  -- nomenclature. It reuses that workflow and never creates catalog demand.
  with external_lines as (
    select line.id, line.quantity, line.unit, line.external_nomenclature_id
    from public.estimate_items line
    where line.estimate_id = target_estimate.id and line.line_type = 'external'
  ), candidates as (
    select request.id, request.status old_status, external_lines.quantity,
      external_lines.unit
    from public.estimate_external_item_requests request
    join external_lines on external_lines.id = request.estimate_item_id
    where request.status is null or request.status = 'cancelled'
    for update of request
  ), changed as (
    update public.estimate_external_item_requests request
    set status = 'new',
        version = request.version + 1,
        requested_by = coalesce(request.requested_by, actor_id),
        requested_at = coalesce(request.requested_at, now()),
        cancelled_by = null,
        cancelled_at = null,
        final_customer_id = target_estimate.final_customer_id,
        final_customer_industry_code = customer.industry_code,
        final_customer_locality = customer.locality,
        project_name = target_estimate.project_name,
        estimate_lifecycle_status = target_estimate.lifecycle_status,
        requested_quantity = candidates.quantity,
        requested_unit = candidates.unit,
        updated_at = now()
    from candidates
    left join public.partner_final_customers customer
      on customer.id = target_estimate.final_customer_id
     and customer.company_id = target_estimate.company_id
    where request.id = candidates.id
    returning request.id, request.company_id, request.status,
      request.estimate_item_id, request.external_nomenclature_id,
      request.requested_quantity, request.requested_unit,
      candidates.old_status
  )
  insert into public.estimate_external_item_request_events(
    request_id, company_id, actor_user_id, event_type, from_status, to_status, context
  )
  select changed.id, changed.company_id, actor_id,
    case when changed.old_status = 'cancelled' then 'reopened' else 'requested' end,
    changed.old_status, 'new',
    jsonb_build_object(
      'estimateId', target_estimate.id,
      'estimateItemId', changed.estimate_item_id,
      'externalNomenclatureId', changed.external_nomenclature_id,
      'quantity', changed.requested_quantity,
      'unit', changed.requested_unit,
      'source', 'estimate_transfer',
      'correlationId', correlation_id
    )
  from changed;

  select count(*) into external_count
  from public.estimate_items line
  where line.estimate_id = target_estimate.id and line.line_type = 'external';

  with input_lines as (
    select row.line_id, row.product_id, row.requested_quantity,
      row.current_price, upper(row.currency_code) currency_code,
      row.available_quantity, row.stock_status
    from jsonb_to_recordset(target_items) as row(
      line_id uuid,
      product_id uuid,
      requested_quantity integer,
      current_price numeric,
      currency_code text,
      available_quantity numeric,
      stock_status text
    )
  ), demand_rows as (
    select input.*, product.sku, product.name product_name,
      product.category_id, category.name category_name,
      product.brand_id, brand.name brand_name,
      greatest(input.requested_quantity - input.available_quantity, 0)::numeric shortage_quantity,
      case
        when input.stock_status = 'NOT_STOCKED' then 'NOT_STOCKED'
        when input.available_quantity = 0 then 'OUT_OF_STOCK'
        else 'PARTIAL_STOCK'
      end demand_reason,
      encode(extensions.digest(concat_ws('|',
        target_estimate.company_id::text, target_estimate.id::text, input.line_id::text,
        input.requested_quantity::text, input.available_quantity::text,
        greatest(input.requested_quantity - input.available_quantity, 0)::text,
        input.stock_status
      ), 'sha256'), 'hex') state_fingerprint
    from input_lines input
    join public.catalog_products product on product.id = input.product_id
    left join public.catalog_categories category on category.id = product.category_id
    left join public.catalog_brands brand on brand.id = product.brand_id
    where input.available_quantity is not null
      and input.available_quantity < input.requested_quantity
  ), inserted as (
    insert into public.unmet_assortment_demand_events(
      partner_company_id, partner_user_id, estimate_id, estimate_line_id,
      final_customer_id, product_id, sku, product_name,
      category_id, category_name, brand_id, brand_name,
      requested_quantity, available_quantity, shortage_quantity,
      price_at_demand, currency_code, demand_reason,
      state_fingerprint, correlation_id
    )
    select target_estimate.company_id, actor_id, target_estimate.id, demand.line_id,
      target_estimate.final_customer_id, demand.product_id, demand.sku, demand.product_name,
      demand.category_id, demand.category_name, demand.brand_id, demand.brand_name,
      demand.requested_quantity, demand.available_quantity, demand.shortage_quantity,
      demand.current_price, demand.currency_code, demand.demand_reason,
      demand.state_fingerprint, correlation_id
    from demand_rows demand
    on conflict (partner_company_id, estimate_id, estimate_line_id, state_fingerprint) do nothing
    returning *
  ), rollup as (
    select occurred_at::date bucket_date, partner_company_id, partner_user_id,
      product_id, sku, product_name, category_id, category_name, brand_id, brand_name,
      coalesce(brand_id::text, '-') || ':' || coalesce(category_id::text, '-') dimension_key,
      currency_code, coalesce(currency_code, '-') currency_key,
      count(*)::integer request_count,
      sum(requested_quantity) requested_quantity,
      sum(available_quantity) available_quantity,
      sum(shortage_quantity) shortage_quantity,
      sum(coalesce(price_at_demand, 0) * shortage_quantity) potential_value,
      max(occurred_at) last_demand_at
    from inserted
    group by occurred_at::date, partner_company_id, partner_user_id,
      product_id, sku, product_name, category_id, category_name, brand_id, brand_name,
      currency_code
  ), rolled_up as (
    insert into public.unmet_assortment_demand_daily(
      bucket_date, partner_company_id, partner_user_id, product_id,
      sku, product_name, category_id, category_name, brand_id, brand_name,
      dimension_key, currency_code, currency_key, request_count,
      requested_quantity, available_quantity, shortage_quantity,
      potential_value, last_demand_at
    )
    select bucket_date, partner_company_id, partner_user_id, product_id,
      sku, product_name, category_id, category_name, brand_id, brand_name,
      dimension_key, currency_code, currency_key, request_count,
      requested_quantity, available_quantity, shortage_quantity,
      potential_value, last_demand_at
    from rollup
    on conflict (
      bucket_date, partner_company_id, partner_user_id, product_id,
      dimension_key, currency_key
    ) do update set
      request_count = public.unmet_assortment_demand_daily.request_count + excluded.request_count,
      requested_quantity = public.unmet_assortment_demand_daily.requested_quantity + excluded.requested_quantity,
      available_quantity = public.unmet_assortment_demand_daily.available_quantity + excluded.available_quantity,
      shortage_quantity = public.unmet_assortment_demand_daily.shortage_quantity + excluded.shortage_quantity,
      potential_value = public.unmet_assortment_demand_daily.potential_value + excluded.potential_value,
      last_demand_at = greatest(public.unmet_assortment_demand_daily.last_demand_at, excluded.last_demand_at)
    returning request_count
  )
  select coalesce(sum(request_count), 0)::integer into inserted_demand_count
  from rolled_up;

  select jsonb_build_object(
    'totalLines', input_count + external_count,
    'catalogLines', input_count,
    'fullyAvailable', count(*) filter (where state = 'FULLY_AVAILABLE'),
    'partiallyAvailable', count(*) filter (where state = 'PARTIAL_STOCK'),
    'unavailable', count(*) filter (where state in ('OUT_OF_STOCK', 'NOT_STOCKED')),
    'stockUnknown', count(*) filter (where state = 'STOCK_UNKNOWN'),
    'externalLines', external_count,
    'changedPrice', count(*) filter (where price_changed),
    'demandCaptured', inserted_demand_count,
    'correlationId', correlation_id,
    'repeated', false
  ) into result_summary
  from (
    select row.stock_status state,
      line.source_unit_price is not null and row.current_price is distinct from line.source_unit_price price_changed
    from jsonb_to_recordset(target_items) as row(
      line_id uuid,
      current_price numeric,
      stock_status text
    )
    join public.estimate_items line on line.id = row.line_id
  ) classified;

  insert into public.estimate_cart_conversions(
    company_id, estimate_id, cart_id, direction, request_key, summary, created_by
  ) values (
    target_estimate.company_id, target_estimate.id, target_cart.id,
    'estimate_to_cart', target_request_key, result_summary, actor_id
  );

  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (target_estimate.id, actor_id, 'estimate_transferred_to_cart');
  if inserted_demand_count > 0 then
    insert into public.estimate_events(estimate_id, actor_user_id, event_type)
    values (target_estimate.id, actor_id, 'unmet_assortment_demand_captured');
  end if;

  return result_summary || jsonb_build_object('cartId', target_cart.id);
end;
$$;

create or replace function public.list_admin_unmet_assortment_demand(
  window_days integer default 30,
  search_query text default null,
  result_limit integer default 25,
  result_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bounded_window integer;
  bounded_limit integer := least(greatest(coalesce(result_limit, 25), 1), 50);
  bounded_offset integer := greatest(coalesce(result_offset, 0), 0);
  normalized_query text := lower(btrim(coalesce(search_query, '')));
begin
  if not public.has_internal_permission('admin.external_demand.view') then
    raise exception 'Unmet assortment demand is not available.' using errcode = '42501';
  end if;
  bounded_window := case when window_days in (30, 90, 180) then window_days else 30 end;

  return (
    with bounded as (
      select *
      from public.unmet_assortment_demand_daily daily
      where daily.bucket_date >= current_date - (bounded_window - 1)
    ), product_totals as (
      select product_id, max(sku) sku, max(product_name) product_name,
        max(brand_name) brand_name, max(category_name) category_name,
        count(distinct partner_company_id) partner_count,
        sum(request_count) request_count,
        sum(requested_quantity) requested_quantity,
        sum(shortage_quantity) shortage_quantity,
        max(last_demand_at) last_demand_at,
        sum(request_count) filter (
          where bucket_date >= current_date - greatest((bounded_window / 2) - 1, 0)
        ) recent_requests,
        sum(request_count) filter (
          where bucket_date < current_date - greatest((bounded_window / 2) - 1, 0)
        ) previous_requests
      from bounded
      group by product_id
    ), product_values as (
      select product_id, jsonb_object_agg(currency_key, amount) potential_value_by_currency
      from (
        select product_id, currency_key, sum(potential_value) amount
        from bounded
        group by product_id, currency_key
      ) values_by_currency
      group by product_id
    ), visible as (
      select totals.*, values.potential_value_by_currency, count(*) over() total_count
      from product_totals totals
      join product_values values on values.product_id = totals.product_id
      where normalized_query = ''
        or lower(totals.sku || ' ' || totals.product_name || ' '
          || coalesce(totals.brand_name, '') || ' ' || coalesce(totals.category_name, ''))
          like '%' || normalized_query || '%'
    ), page as (
      select * from visible
      order by shortage_quantity desc, last_demand_at desc, product_id
      offset bounded_offset limit bounded_limit
    ), summary as (
      select coalesce(sum(request_count), 0) requests,
        count(distinct product_id) unique_sku,
        count(distinct partner_company_id) unique_partners,
        coalesce(sum(shortage_quantity), 0) shortage_units
      from bounded
    ), value_summary as (
      select coalesce(jsonb_object_agg(currency_key, amount), '{}'::jsonb) values
      from (
        select currency_key, sum(potential_value) amount
        from bounded group by currency_key
      ) value_rows
    )
    select jsonb_build_object(
      'windowDays', bounded_window,
      'summary', jsonb_build_object(
        'requests', summary.requests,
        'uniqueSku', summary.unique_sku,
        'uniquePartners', summary.unique_partners,
        'shortageUnits', summary.shortage_units,
        'potentialValueByCurrency', value_summary.values
      ),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'productId', page.product_id,
        'sku', page.sku,
        'productName', page.product_name,
        'brandName', page.brand_name,
        'categoryName', page.category_name,
        'partnerCount', page.partner_count,
        'requests', page.request_count,
        'requestedQuantity', page.requested_quantity,
        'shortageQuantity', page.shortage_quantity,
        'potentialValueByCurrency', page.potential_value_by_currency,
        'lastDemandAt', page.last_demand_at,
        'trend', case
          when coalesce(page.recent_requests, 0) > coalesce(page.previous_requests, 0) then 'up'
          when coalesce(page.recent_requests, 0) < coalesce(page.previous_requests, 0) then 'down'
          else 'stable'
        end
      ) order by page.shortage_quantity desc, page.last_demand_at desc, page.product_id) from page), '[]'::jsonb),
      'total', coalesce((select max(total_count) from visible), 0)
    )
    from summary cross join value_summary
  );
end;
$$;

create or replace function public.aggregate_admin_unmet_assortment_demand(
  group_dimension text,
  window_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bounded_window integer := case when window_days in (30, 90, 180) then window_days else 30 end;
begin
  if not public.has_internal_permission('admin.external_demand.view') then
    raise exception 'Unmet assortment demand is not available.' using errcode = '42501';
  end if;
  if group_dimension not in ('sku', 'product', 'brand', 'category', 'partner', 'manager', 'time') then
    raise exception 'Unmet demand grouping is invalid.' using errcode = '22023';
  end if;
  return (
    with dimensional as (
      select
        case group_dimension
          when 'sku' then daily.sku
          when 'product' then daily.product_id::text
          when 'brand' then coalesce(daily.brand_id::text, 'unassigned')
          when 'category' then coalesce(daily.category_id::text, 'unassigned')
          when 'partner' then daily.partner_company_id::text
          when 'manager' then daily.partner_user_id::text
          else daily.bucket_date::text
        end group_key,
        case group_dimension
          when 'sku' then daily.sku
          when 'product' then daily.product_name
          when 'brand' then coalesce(daily.brand_name, 'Без бренда')
          when 'category' then coalesce(daily.category_name, 'Без категории')
          when 'partner' then company.display_name
          when 'manager' then coalesce(profile.full_name, profile.email, daily.partner_user_id::text)
          else daily.bucket_date::text
        end group_label,
        daily.currency_key,
        daily.partner_company_id,
        daily.request_count,
        daily.requested_quantity,
        daily.available_quantity,
        daily.shortage_quantity,
        daily.potential_value,
        daily.last_demand_at
      from public.unmet_assortment_demand_daily daily
      join public.partner_companies company on company.id = daily.partner_company_id
      join public.user_profiles profile on profile.id = daily.partner_user_id
      where daily.bucket_date >= current_date - (bounded_window - 1)
    ), currency_totals as (
      select group_key, max(group_label) group_label, currency_key,
        count(distinct partner_company_id) unique_partners,
        sum(request_count) requests,
        sum(requested_quantity) requested_quantity,
        sum(available_quantity) available_quantity,
        sum(shortage_quantity) shortage_quantity,
        sum(potential_value) potential_value,
        max(last_demand_at) last_demand_at
      from dimensional
      group by group_key, currency_key
    ), totals as (
      select group_key, max(group_label) group_label,
        max(unique_partners) unique_partners,
        sum(requests) requests,
        sum(requested_quantity) requested_quantity,
        sum(available_quantity) available_quantity,
        sum(shortage_quantity) shortage_quantity,
        jsonb_object_agg(currency_key, potential_value) potential_value_by_currency,
        max(last_demand_at) last_demand_at
      from currency_totals
      group by group_key
      order by sum(shortage_quantity) desc, max(last_demand_at) desc
      limit 500
    )
    select jsonb_build_object(
      'grouping', group_dimension,
      'windowDays', bounded_window,
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'key', group_key, 'label', group_label,
        'uniquePartners', unique_partners, 'requests', requests,
        'requestedQuantity', requested_quantity,
        'availableQuantity', available_quantity,
        'shortageQuantity', shortage_quantity,
        'potentialValueByCurrency', potential_value_by_currency,
        'lastDemandAt', last_demand_at
      ) order by shortage_quantity desc, last_demand_at desc), '[]'::jsonb)
    )
    from totals
  );
end;
$$;

create or replace function public.get_admin_unmet_assortment_demand_detail(
  target_product_id uuid,
  window_days integer default 30,
  result_limit integer default 50,
  result_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bounded_window integer := case when window_days in (30, 90, 180) then window_days else 30 end;
  bounded_limit integer := least(greatest(coalesce(result_limit, 50), 1), 100);
  bounded_offset integer := greatest(coalesce(result_offset, 0), 0);
begin
  if not public.has_internal_permission('admin.external_demand.view') then
    raise exception 'Unmet assortment demand is not available.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'product', jsonb_build_object(
        'productId', product.id, 'sku', product.sku, 'productName', product.name,
        'brandName', brand.name, 'categoryName', category.name
      ),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', event.id,
          'companyName', company.display_name,
          'partnerUserId', event.partner_user_id,
          'estimateId', estimate.id,
          'estimateNumber', estimate.estimate_number,
          'finalCustomerId', event.final_customer_id,
          'requestedQuantity', event.requested_quantity,
          'availableQuantity', event.available_quantity,
          'shortageQuantity', event.shortage_quantity,
          'priceAtDemand', event.price_at_demand,
          'currencyCode', event.currency_code,
          'reason', event.demand_reason,
          'occurredAt', event.occurred_at,
          'correlationId', event.correlation_id
        ) order by event.occurred_at desc, event.id desc)
        from (
          select source.*
          from public.unmet_assortment_demand_events source
          where source.product_id = target_product_id
            and source.occurred_at >= now() - make_interval(days => bounded_window)
          order by source.occurred_at desc, source.id desc
          offset bounded_offset limit bounded_limit
        ) event
        join public.partner_companies company on company.id = event.partner_company_id
        join public.estimates estimate on estimate.id = event.estimate_id
      ), '[]'::jsonb)
    )
    from public.catalog_products product
    left join public.catalog_brands brand on brand.id = product.brand_id
    left join public.catalog_categories category on category.id = product.category_id
    where product.id = target_product_id
  );
end;
$$;

alter table public.estimate_events drop constraint if exists estimate_events_type_check;
alter table public.estimate_events add constraint estimate_events_type_check check (event_type in (
  'created', 'saved', 'line_added', 'line_updated', 'line_removed', 'archived',
  'commercial_updated', 'currency_changed', 'section_created', 'section_reordered',
  'line_moved', 'discount_changed', 'charge_added', 'totals_recalculated',
  'ready', 'version_created', 'version_sent', 'version_accepted', 'version_rejected',
  'draft_restored', 'duplicated', 'template_created', 'created_from_cart', 'added_to_cart',
  'generator_created', 'estimate_transferred_to_cart', 'unmet_assortment_demand_captured'
));

revoke all on function public.prevent_unmet_demand_history_mutation(),
  public.transfer_estimate_to_cart_v2(uuid, uuid, jsonb),
  public.list_admin_unmet_assortment_demand(integer, text, integer, integer),
  public.aggregate_admin_unmet_assortment_demand(text, integer),
  public.get_admin_unmet_assortment_demand_detail(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.transfer_estimate_to_cart_v2(uuid, uuid, jsonb),
  public.list_admin_unmet_assortment_demand(integer, text, integer, integer),
  public.aggregate_admin_unmet_assortment_demand(text, integer),
  public.get_admin_unmet_assortment_demand_detail(uuid, integer, integer, integer)
  to authenticated;
