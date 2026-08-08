-- Keep the existing line-batch contract while using PostgreSQL-compatible ordinality syntax.
create or replace function public.add_estimate_items(
  target_estimate_id uuid,
  expected_revision integer,
  line_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  default_section_id uuid;
  starting_position integer;
  inserted_count integer;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft'
     or not public.can_access_estimates(target.company_id, 'estimates.manage')
     or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  if jsonb_typeof(line_items) <> 'array'
     or jsonb_array_length(line_items) < 1
     or jsonb_array_length(line_items) > 50 then
    raise exception 'Estimate line batch is invalid.' using errcode = '22023';
  end if;

  select id into default_section_id
  from public.estimate_sections
  where estimate_id = target.id
  order by sort_order, id
  limit 1;
  select coalesce(max(position), 0) into starting_position
  from public.estimate_items
  where estimate_id = target.id;

  insert into public.estimate_items (
    estimate_id, section_id, line_type, product_id, service_id, position,
    sku_snapshot, product_name_snapshot, source_unit_price, source_currency_code,
    source_snapshot_at, pricing_mode, pricing_input_value, internal_cost_unit_price,
    converted_cost_unit_price, exchange_rate, exchange_rate_effective_date,
    description, quantity, unit, selling_unit_price
  )
  select
    target.id,
    default_section_id,
    entry.value ->> 'line_type',
    nullif(entry.value ->> 'product_id', '')::uuid,
    nullif(entry.value ->> 'service_id', '')::uuid,
    starting_position + entry.ordinality,
    entry.value ->> 'sku_snapshot',
    entry.value ->> 'product_name_snapshot',
    nullif(entry.value ->> 'source_unit_price', '')::numeric,
    entry.value ->> 'source_currency_code',
    nullif(entry.value ->> 'source_snapshot_at', '')::timestamptz,
    'direct',
    nullif(entry.value ->> 'selling_unit_price', '')::numeric,
    nullif(entry.value ->> 'internal_cost_unit_price', '')::numeric,
    nullif(entry.value ->> 'converted_cost_unit_price', '')::numeric,
    nullif(entry.value ->> 'exchange_rate', '')::numeric,
    nullif(entry.value ->> 'exchange_rate_effective_date', '')::date,
    entry.value ->> 'description',
    nullif(entry.value ->> 'quantity', '')::numeric,
    entry.value ->> 'unit',
    nullif(entry.value ->> 'selling_unit_price', '')::numeric
  from jsonb_array_elements(line_items) with ordinality as entry(value, ordinality)
  where
    (entry.value ->> 'line_type' <> 'product' or exists (
      select 1 from public.catalog_products product
      where product.id = nullif(entry.value ->> 'product_id', '')::uuid
        and product.is_active and product.is_visible
    ))
    and (nullif(entry.value ->> 'service_id', '') is null or exists (
      select 1 from public.partner_services service
      where service.id = nullif(entry.value ->> 'service_id', '')::uuid
        and service.is_active
        and (service.company_id is null or service.company_id = target.company_id)
    ));

  get diagnostics inserted_count = row_count;
  if inserted_count <> jsonb_array_length(line_items) then
    raise exception 'One or more estimate lines are invalid.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.add_estimate_items(uuid, integer, jsonb) from public, anon;
grant execute on function public.add_estimate_items(uuid, integer, jsonb) to authenticated;
