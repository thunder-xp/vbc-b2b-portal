create or replace function public.capture_retail_installation_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  snapshot_count integer;
  snapshot_payload jsonb;
begin
  if jsonb_array_length(new.installation_intent_snapshot) = 0 then
    return new;
  end if;

  with bundles as (
    select bundle.installation_price_snapshot as bundle_snapshot
    from public.retail_cart_bundles bundle
    where bundle.cart_id = new.source_cart_id
      and bundle.installation_price_snapshot is not null
  ), rows as (
    select line
    from bundles
    cross join lateral jsonb_array_elements(bundle_snapshot->'lines') line
  ), grouped as (
    select
      line->>'serviceType' as service_type,
      line->>'unitCode' as unit_code,
      sum((line->>'quantity')::numeric) as quantity,
      min((line->>'unitPrice')::numeric) as unit_price,
      sum((line->>'amount')::numeric) as amount,
      count(distinct (line->>'unitPrice')) as price_count
    from rows
    group by 1, 2
  )
  select
    (select count(distinct bundle_snapshot->>'tariffSetId') from bundles),
    jsonb_build_object(
      'tariffSetId', (select min(bundle_snapshot->>'tariffSetId') from bundles),
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
          'serviceType', service_type,
          'unitCode', unit_code,
          'quantity', quantity,
          'unitPrice', unit_price,
          'amount', amount
        ) order by service_type)
        from grouped
        where price_count = 1
      ), '[]'::jsonb),
      'subtotal', coalesce((select sum(amount) from grouped where price_count = 1), 0),
      'validLineCount', coalesce((select count(*) from grouped where price_count = 1), 0),
      'allLineCount', coalesce((select count(*) from grouped), 0)
    )
  into snapshot_count, snapshot_payload;

  if snapshot_count <> 1 or snapshot_payload->>'tariffSetId' is null then
    raise exception 'Installation commercial snapshot is incomplete.' using errcode = 'P0002';
  end if;
  if snapshot_payload->>'validLineCount' <> snapshot_payload->>'allLineCount' then
    raise exception 'Installation tariff snapshot is inconsistent.' using errcode = 'P0002';
  end if;

  new.installation_tariff_set_id := (snapshot_payload->>'tariffSetId')::uuid;
  new.installation_work_lines_snapshot := snapshot_payload->'lines';
  new.installation_subtotal := (snapshot_payload->>'subtotal')::numeric;
  return new;
end;
$$;

revoke all on function public.capture_retail_installation_snapshot()
from public, anon, authenticated, service_role;
