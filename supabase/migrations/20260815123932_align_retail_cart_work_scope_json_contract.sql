-- The server DTO uses camelCase inside JSON; keep database revalidation on that exact contract.
create or replace function public.add_public_retail_cart_cctv_bundle_v3(
  p_token_hash text,p_items jsonb,p_installation_intent jsonb,p_calculator_input jsonb,
  p_work_scope jsonb,p_installation_pricing jsonb,p_request_id uuid,p_fingerprint text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare tariff_set public.installation_tariff_sets; canonical_pricing jsonb; response jsonb;
  previous_response jsonb; previous_fingerprint text; resolved_services jsonb;
  scope_count integer; priced_count integer; calculated_subtotal numeric(14,2);
  target_object_type text;
begin
  select request.response,request.fingerprint into previous_response,previous_fingerprint
    from public.retail_carts cart join public.retail_cart_requests request on request.cart_id=cart.id and request.request_id=p_request_id
    where cart.token_hash=p_token_hash and cart.status='active' and cart.expires_at>now();
  if previous_response is not null then
    if previous_fingerprint<>p_fingerprint then raise exception 'Idempotency conflict.' using errcode='23505'; end if;
    return previous_response;
  end if;
  if p_work_scope is null or jsonb_typeof(p_work_scope)<>'array' then raise exception 'Invalid work scope.' using errcode='22023'; end if;
  scope_count:=jsonb_array_length(p_work_scope);
  if scope_count=0 then
    if p_installation_pricing is not null then raise exception 'Unexpected installation pricing.' using errcode='22023'; end if;
  else
    if jsonb_typeof(p_installation_pricing)<>'object' then raise exception 'Installation tariff unavailable.' using errcode='P0002'; end if;
    select * into tariff_set from public.installation_tariff_sets s
      where s.id=(p_installation_pricing->>'tariffSetId')::uuid and s.system_type='cctv' and s.status in ('published','superseded')
        and s.effective_from<=now() and (s.effective_to is null or s.effective_to>now());
    if tariff_set.id is null or (p_installation_pricing->>'tariffVersion')::integer<>tariff_set.version then
      raise exception 'Installation tariff changed.' using errcode='P0002';
    end if;

    target_object_type:=case p_calculator_input->>'objectType'
      when 'production' then 'industrial' else p_calculator_input->>'objectType' end;
    select public.resolve_cctv_object_services(
      target_object_type,
      array(select item->>'kind' from jsonb_array_elements(p_work_scope) item)
    ) into resolved_services;

    with scope as (
      select item.value->>'kind' kind,
        (item.value->>'quantity')::numeric quantity,
        item.value->>'unitCode' unit_code,
        item.ordinality
      from jsonb_array_elements(p_work_scope) with ordinality item(value,ordinality)
    ), resolved as (
      select item.value->>'requestServiceType' service_type,
        item.value->>'unitCode' unit_code,
        (item.value->>'unitPrice')::numeric customer_unit_price,
        item.ordinality
      from jsonb_array_elements(resolved_services) with ordinality item(value,ordinality)
      where item.value->>'tariffSetId'=tariff_set.id::text
        and (item.value->>'tariffVersion')::integer=tariff_set.version
        and item.value->>'currency'=tariff_set.currency
    ), priced as (
      select scope.kind service_type,scope.quantity,scope.unit_code,resolved.customer_unit_price,
        round(scope.quantity*resolved.customer_unit_price,2) amount,scope.ordinality
      from scope join resolved on resolved.ordinality=scope.ordinality
        and resolved.service_type=scope.kind and resolved.unit_code=scope.unit_code
      where scope.kind in ('camera_installation','cable_laying','commissioning','remote_configuration','ai_scenario_programming')
        and scope.quantity>0 and scope.quantity<=20000
    ) select count(*),coalesce(sum(amount),0),jsonb_build_object(
      'tariffSetId',tariff_set.id,'tariffVersion',tariff_set.version,'currency',tariff_set.currency,
      'vatTreatment',tariff_set.vat_treatment,'lines',coalesce(jsonb_agg(jsonb_build_object(
        'serviceType',service_type,'quantity',quantity,'unitCode',unit_code,
        'unitPrice',customer_unit_price,'amount',amount) order by ordinality),'[]'::jsonb),
      'subtotal',coalesce(sum(amount),0))
      into priced_count,calculated_subtotal,canonical_pricing from priced;
    if priced_count<>scope_count or calculated_subtotal<>(p_installation_pricing->>'subtotal')::numeric then
      raise exception 'Installation pricing changed.' using errcode='P0002';
    end if;
  end if;
  response:=public.add_public_retail_cart_cctv_bundle_v2(p_token_hash,p_items,p_installation_intent,
    p_calculator_input,p_work_scope,p_request_id,p_fingerprint);
  if scope_count>0 then
    update public.retail_cart_bundles set installation_tariff_set_id=tariff_set.id,
      installation_price_snapshot=canonical_pricing where id=(response->>'bundleId')::uuid;
  end if;
  return response;
end; $$;
