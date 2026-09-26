-- Correct the accepted Estimate revision guard after lifecycle transitions.
-- The existing v2 transfer remains the sole cart/unmet-demand mutation engine.
-- Historical conversion rows are append-only audit evidence and can contain
-- multiple entries for a version. The transaction-scoped advisory lock below
-- serializes new attempts before the existing-version check, so retries and
-- concurrent submissions reuse the first canonical conversion without
-- rewriting that evidence.

create or replace function public.transfer_accepted_estimate_to_cart_v3(
  target_estimate_id uuid,
  target_version_id uuid,
  expected_estimate_revision integer,
  target_request_key uuid,
  target_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_estimate public.estimates;
  target_version public.estimate_versions;
  prior public.estimate_cart_conversions;
  result_summary jsonb;
  input_count integer;
  expected_count integer;
begin
  if actor_id is null or target_estimate_id is null or target_version_id is null
    or expected_estimate_revision is null or target_request_key is null
    or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) > 500 then
    raise exception 'Estimate transfer input is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_estimate_id::text || ':' || target_version_id::text, 0));

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
      or prior.version_id is distinct from target_version_id
      or prior.direction <> 'estimate_to_cart' then
      raise exception 'Request key is already used.' using errcode = '23505';
    end if;
    return prior.summary || jsonb_build_object('cartId', prior.cart_id, 'repeated', true);
  end if;

  select * into target_version
  from public.estimate_versions version
  where version.id = target_version_id
    and version.estimate_id = target_estimate.id
    and version.company_id = target_estimate.company_id
  for update;

  if target_version.id is null
    or target_estimate.lifecycle_status <> 'accepted'
    or target_estimate.accepted_version_id is distinct from target_version.id
    or target_version.status <> 'accepted'
    or target_estimate.revision <> expected_estimate_revision then
    raise exception 'Accepted Estimate version changed before transfer.' using errcode = 'PT409';
  end if;

  select * into prior
  from public.estimate_cart_conversions conversion
  where conversion.company_id = target_estimate.company_id
    and conversion.estimate_id = target_estimate.id
    and conversion.version_id = target_version.id
    and conversion.direction = 'estimate_to_cart'
  order by conversion.created_at, conversion.id
  limit 1;
  if prior.id is not null then
    if prior.created_by <> actor_id then
      raise exception 'Estimate transfer is not available.' using errcode = '42501';
    end if;
    return prior.summary || jsonb_build_object('cartId', prior.cart_id, 'repeated', true);
  end if;

  select count(*) into input_count
  from jsonb_to_recordset(target_items) as row(
    line_id uuid,
    product_id uuid,
    requested_quantity integer,
    current_price numeric,
    currency_code text,
    available_quantity numeric,
    stock_status text
  );

  select count(*) into expected_count
  from jsonb_array_elements(target_version.snapshot -> 'items') item
  where item ->> 'line_type' = 'product';

  if input_count <> expected_count
    or input_count <> (
      select count(distinct row.line_id)
      from jsonb_to_recordset(target_items) as row(line_id uuid)
    )
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
      left join lateral (
        select item
        from jsonb_array_elements(target_version.snapshot -> 'items') item
        where item ->> 'line_type' = 'product'
          and item ->> 'id' = row.line_id::text
          and item ->> 'product_id' = row.product_id::text
      ) accepted on true
      where accepted.item is null
        or row.requested_quantity <> (accepted.item ->> 'quantity')::numeric
        or row.requested_quantity not between 1 and 9999
        or (row.available_quantity is not null and row.available_quantity < 0)
        or (row.currency_code is not null and upper(row.currency_code) !~ '^[A-Z]{3}$')
        or row.stock_status not in ('FULLY_AVAILABLE', 'PARTIAL_STOCK', 'OUT_OF_STOCK', 'STOCK_UNKNOWN', 'NOT_STOCKED')
    ) then
    raise exception 'Estimate transfer lines do not match the accepted version.' using errcode = 'PT409';
  end if;

  select public.transfer_estimate_to_cart_v2(
    target_estimate_id,
    target_request_key,
    target_items
  ) into result_summary;

  update public.estimate_cart_conversions conversion
  set version_id = target_version.id
  where conversion.company_id = target_estimate.company_id
    and conversion.estimate_id = target_estimate.id
    and conversion.request_key = target_request_key
    and conversion.direction = 'estimate_to_cart'
    and conversion.created_by = actor_id;

  return result_summary;
end;
$$;

comment on function public.transfer_accepted_estimate_to_cart_v3(uuid, uuid, integer, uuid, jsonb)
  is 'Atomically validates an immutable accepted Estimate version before reusing the canonical cart and unmet-demand transfer engine.';

revoke all on function public.transfer_accepted_estimate_to_cart_v3(uuid, uuid, integer, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.transfer_accepted_estimate_to_cart_v3(uuid, uuid, integer, uuid, jsonb)
  to authenticated;
