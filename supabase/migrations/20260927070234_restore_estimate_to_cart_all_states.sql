-- Restore the direct Estimate-to-Cart path without reopening direct client
-- access to the canonical v2 mutation engine. The wrapper validates the live
-- Estimate revision and delegates the atomic cart/provenance/demand work to v2.

create or replace function public.transfer_estimate_to_cart_v4(
  target_estimate_id uuid,
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
begin
  if actor_id is null or target_estimate_id is null
    or expected_estimate_revision is null or expected_estimate_revision < 1
    or target_request_key is null or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) > 500 then
    raise exception 'Estimate transfer input is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    actor_id::text || ':' || target_request_key::text,
    0
  ));

  select * into target_estimate
  from public.estimates estimate
  where estimate.id = target_estimate_id
  for update;

  if target_estimate.id is null or target_estimate.deleted_at is not null
    or not public.can_access_estimates(target_estimate.company_id, 'estimates.convert_to_cart')
    or not public.can_manage_partner_order_company(target_estimate.company_id) then
    raise exception 'Estimate transfer is not available.' using errcode = '42501';
  end if;

  if target_estimate.revision <> expected_estimate_revision then
    raise exception 'Estimate changed before transfer.' using errcode = 'PT409';
  end if;

  return public.transfer_estimate_to_cart_v2(
    target_estimate_id,
    target_request_key,
    target_items
  );
end;
$$;

comment on function public.transfer_estimate_to_cart_v4(uuid, integer, uuid, jsonb)
  is 'Validates one live non-deleted Estimate revision before reusing the canonical cart, provenance, external-nomenclature and unmet-demand engine.';

revoke all on function public.transfer_estimate_to_cart_v4(uuid, integer, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.transfer_estimate_to_cart_v4(uuid, integer, uuid, jsonb)
  to authenticated;
