-- Resolve Recommended and Economy service classes together so public calculation
-- stays bounded to one database operation.
create function public.resolve_cctv_object_service_variants(
  target_object_type text,
  target_service_types text[]
) returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  result jsonb;
  tariff public.installation_tariff_sets;
begin
  if target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or coalesce(cardinality(target_service_types),0)<1
    or cardinality(target_service_types)>5
    or exists(
      select 1 from unnest(target_service_types) value
      where value not in ('camera_installation','cable_laying','commissioning','remote_configuration','ai_scenario_programming')
    ) then
    raise exception 'Invalid CCTV service request.' using errcode='22023';
  end if;

  select * into tariff
  from public.installation_tariff_sets
  where system_type='cctv'
    and status in ('published','superseded')
    and effective_from<=now()
    and (effective_to is null or effective_to>now())
  order by case when status='published' then 0 else 1 end,version desc
  limit 1;

  with requested as (
    select service_type,ordinality,
      case service_type
        when 'camera_installation' then 'equipment_installation'
        when 'cable_laying' then 'cable_routing'
        when 'commissioning' then 'commissioning'
        when 'ai_scenario_programming' then 'ai_scenario_programming'
        else 'remote_viewing_configuration'
      end as family
    from unnest(target_service_types) with ordinality value(service_type,ordinality)
  ), defaults as (
    select requested.*,chosen.code,chosen.label_ru,chosen.unit_code,chosen.tariff_service_type,
      chosen.complexity_class
    from requested
    left join lateral (
      select definition.*
      from public.cctv_object_service_bindings binding
      join public.cctv_service_definitions definition
        on definition.code=binding.service_code and definition.active
      where binding.object_type=target_object_type
        and binding.enabled
        and binding.calculator_default
        and definition.family=requested.family
      order by binding.display_order,definition.sort_order
      limit 1
    ) chosen on true
  ), variants as (
    select 'recommended'::text as variant,defaults.service_type,defaults.ordinality,
      defaults.code,defaults.label_ru,defaults.unit_code,defaults.tariff_service_type,
      defaults.complexity_class
    from defaults
    union all
    select 'economy'::text,defaults.service_type,defaults.ordinality,
      coalesce(lower.code,defaults.code),coalesce(lower.label_ru,defaults.label_ru),
      coalesce(lower.unit_code,defaults.unit_code),
      coalesce(lower.tariff_service_type,defaults.tariff_service_type),
      coalesce(lower.complexity_class,defaults.complexity_class)
    from defaults
    left join lateral (
      select definition.*
      from public.cctv_object_service_bindings binding
      join public.cctv_service_definitions definition
        on definition.code=binding.service_code and definition.active
      join public.installation_tariffs lower_tariff
        on lower_tariff.tariff_set_id=tariff.id
       and lower_tariff.service_type=definition.tariff_service_type
      where defaults.complexity_class>1
        and binding.object_type=target_object_type
        and binding.enabled
        and definition.family=defaults.family
        and definition.complexity_class=defaults.complexity_class-1
      order by binding.display_order,definition.sort_order
      limit 1
    ) lower on true
  ), rows as (
    select variants.variant,variants.ordinality,jsonb_build_object(
      'requestServiceType',variants.service_type,
      'serviceCode',variants.code,
      'serviceLabel',variants.label_ru,
      'complexityClass',variants.complexity_class,
      'unitCode',variants.unit_code,
      'unitPrice',line.customer_unit_price,
      'currency',tariff.currency,
      'vatTreatment',tariff.vat_treatment,
      'tariffSetId',tariff.id,
      'tariffVersion',tariff.version
    ) as value
    from variants
    left join public.installation_tariffs line
      on line.tariff_set_id=tariff.id
     and line.service_type=variants.tariff_service_type
  )
  select jsonb_build_object(
    'recommended',coalesce(jsonb_agg(value order by ordinality) filter(where variant='recommended'),'[]'::jsonb),
    'economy',coalesce(jsonb_agg(value order by ordinality) filter(where variant='economy'),'[]'::jsonb)
  ) into result
  from rows;

  return result;
end;
$$;

revoke all on function public.resolve_cctv_object_service_variants(text,text[]) from public,anon,authenticated;
grant execute on function public.resolve_cctv_object_service_variants(text,text[]) to service_role;

-- Revalidate the selected governed variant before persisting a calculator bundle.
create or replace function public.add_public_retail_cart_cctv_bundle_v3(
  p_token_hash text,p_items jsonb,p_installation_intent jsonb,p_calculator_input jsonb,
  p_work_scope jsonb,p_installation_pricing jsonb,p_request_id uuid,p_fingerprint text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare tariff_set public.installation_tariff_sets; canonical_pricing jsonb; response jsonb;
  previous_response jsonb; previous_fingerprint text; resolved_services jsonb; resolved_variants jsonb;
  scope_count integer; priced_count integer; calculated_subtotal numeric(14,2);
  target_object_type text; selected_variant text;
begin
  select request.response,request.fingerprint into previous_response,previous_fingerprint
    from public.retail_carts cart join public.retail_cart_requests request on request.cart_id=cart.id and request.request_id=p_request_id
    where cart.token_hash=p_token_hash and cart.status='active' and cart.expires_at>now();
  if previous_response is not null then
    if previous_fingerprint<>p_fingerprint then raise exception 'Idempotency conflict.' using errcode='23505'; end if;
    return previous_response;
  end if;
  if p_work_scope is null or jsonb_typeof(p_work_scope)<>'array' then raise exception 'Invalid work scope.' using errcode='22023'; end if;
  selected_variant:=coalesce(p_calculator_input->>'selectedVariant','recommended');
  if selected_variant not in ('recommended','economy') then raise exception 'Invalid calculator variant.' using errcode='22023'; end if;
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
    select public.resolve_cctv_object_service_variants(
      target_object_type,
      array(select item->>'kind' from jsonb_array_elements(p_work_scope) item)
    ) into resolved_variants;
    resolved_services:=resolved_variants->selected_variant;

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

revoke all on function public.add_public_retail_cart_cctv_bundle_v3(text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,text)
  from public,authenticated;
grant execute on function public.add_public_retail_cart_cctv_bundle_v3(text,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,text)
  to anon,service_role;
