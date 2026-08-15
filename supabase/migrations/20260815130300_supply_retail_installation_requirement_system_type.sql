create or replace function public.activate_paid_retail_order(
  p_retail_order_id uuid,
  p_activation_mode text,
  p_idempotency_key uuid,
  p_safe_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  orders public.retail_orders;
  existing public.retail_payment_activations;
  region_id uuid;
  requirement_id uuid;
  activation_id uuid := gen_random_uuid();
  tariff_version_value integer;
  dispatch_result jsonb;
begin
  if p_activation_mode not in ('payment_verified', 'pilot_simulated')
    or (p_activation_mode = 'pilot_simulated' and char_length(btrim(coalesce(p_safe_reason, ''))) < 10) then
    raise exception 'Invalid payment activation.' using errcode = '22023';
  end if;

  select * into orders from public.retail_orders where id = p_retail_order_id for update;
  if not found then
    raise exception 'Retail order not found.' using errcode = 'P0002';
  end if;

  select * into existing from public.retail_payment_activations where retail_order_id = orders.id;
  if found then
    return jsonb_build_object(
      'orderId', orders.id,
      'orderNumber', orders.public_number,
      'status', orders.status,
      'installationRequirementId', existing.installation_requirement_id,
      'assignment', null,
      'repeated', true
    );
  end if;

  if orders.status <> 'awaiting_payment' or not orders.orchestration_snapshot_locked then
    raise exception 'Retail order is not awaiting payment.' using errcode = 'PT409';
  end if;

  update public.retail_orders
  set status = 'confirmed', paid_at = now(), payment_activation_mode = p_activation_mode, revision = revision + 1
  where id = orders.id;
  insert into public.retail_order_events(order_id, event_type, safe_evidence)
  values (orders.id, 'payment_confirmed', jsonb_build_object(
    'activationMode', p_activation_mode,
    'simulated', p_activation_mode = 'pilot_simulated'
  ));

  if orders.installation_selection_mode is null then
    insert into public.retail_payment_activations(
      id, retail_order_id, activation_mode, idempotency_key, actor_user_id, safe_reason
    ) values (
      activation_id, orders.id, p_activation_mode, p_idempotency_key, auth.uid(), nullif(btrim(coalesce(p_safe_reason, '')), '')
    );
    return jsonb_build_object(
      'orderId', orders.id,
      'orderNumber', orders.public_number,
      'status', 'confirmed',
      'installationRequirementId', null,
      'assignment', null,
      'repeated', false
    );
  end if;

  select id into region_id
  from public.installation_service_regions
  where code = orders.installation_region_code and active;
  if region_id is null or orders.installation_address_snapshot is null or orders.installation_tariff_set_id is null
    or orders.installation_subtotal is null or jsonb_array_length(orders.installation_work_lines_snapshot) = 0 then
    raise exception 'Retail installation snapshot is unavailable.' using errcode = 'P0002';
  end if;

  select version into tariff_version_value
  from public.installation_tariff_sets
  where id = orders.installation_tariff_set_id;

  insert into public.installation_requirements(
    retail_order_id, system_type, selection_mode, preferred_provider_id, service_region_id,
    locality_snapshot, exact_address_snapshot, customer_pii_snapshot, work_lines_snapshot,
    tariff_set_id, tariff_version, customer_installation_charge, currency, vat_treatment,
    requested_scheduling_context, activation_mode, activation_evidence
  ) values (
    orders.id, 'cctv', orders.installation_selection_mode, orders.preferred_installation_provider_id, region_id,
    orders.installation_address_snapshot->>'locality', orders.installation_address_snapshot, orders.customer_snapshot,
    orders.installation_work_lines_snapshot, orders.installation_tariff_set_id, tariff_version_value,
    orders.installation_subtotal, orders.currency, orders.vat_presentation, '{}'::jsonb, p_activation_mode,
    jsonb_build_object('paymentActivationId', activation_id, 'simulated', p_activation_mode = 'pilot_simulated')
  ) returning id into requirement_id;

  insert into public.installation_requirement_lines(
    requirement_id, line_number, service_type, unit_code, quantity, customer_unit_price, customer_line_amount
  )
  select requirement_id, row_number() over(order by line->>'serviceType'), line->>'serviceType', line->>'unitCode',
    (line->>'quantity')::numeric, (line->>'unitPrice')::numeric, (line->>'amount')::numeric
  from jsonb_array_elements(orders.installation_work_lines_snapshot) line;

  insert into public.installation_assignment_events(
    requirement_id, event_type, actor_user_id, correlation_id, safe_evidence
  ) values
    (requirement_id, 'installation_requirement_activated', auth.uid(), p_idempotency_key,
      jsonb_build_object('activationMode', p_activation_mode, 'tariffSetId', orders.installation_tariff_set_id, 'tariffVersion', tariff_version_value)),
    (requirement_id, 'provider_preferred', auth.uid(), p_idempotency_key,
      jsonb_build_object('selectionMode', orders.installation_selection_mode, 'preferredProviderId', orders.preferred_installation_provider_id));

  insert into public.retail_payment_activations(
    id, retail_order_id, activation_mode, idempotency_key, actor_user_id, safe_reason, installation_requirement_id
  ) values (
    activation_id, orders.id, p_activation_mode, p_idempotency_key, auth.uid(),
    nullif(btrim(coalesce(p_safe_reason, '')), ''), requirement_id
  );

  dispatch_result := public.dispatch_installation_requirement(requirement_id, 'automatic', null, p_idempotency_key);
  return jsonb_build_object(
    'orderId', orders.id,
    'orderNumber', orders.public_number,
    'status', 'confirmed',
    'installationRequirementId', requirement_id,
    'assignment', dispatch_result,
    'repeated', false
  );
end;
$$;

revoke all on function public.activate_paid_retail_order(uuid, text, uuid, text)
from public, anon, authenticated;
grant execute on function public.activate_paid_retail_order(uuid, text, uuid, text)
to service_role;
