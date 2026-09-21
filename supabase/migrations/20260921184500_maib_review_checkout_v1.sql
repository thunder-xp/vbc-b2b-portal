begin;

set local lock_timeout = '5s';

alter table public.retail_orders
  add column checkout_channel text not null default
    coalesce(nullif(current_setting('novotech.retail_checkout_channel', true), ''), 'public')
    check (checkout_channel in ('public', 'maib_review'));

comment on column public.retail_orders.checkout_channel is
  'Immutable checkout origin. maib_review orders are sandbox certification artifacts and never enter customer provisioning or installation dispatch.';

create function public.protect_retail_order_checkout_channel_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.checkout_channel <> old.checkout_channel then
    raise exception 'Retail checkout channel is immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_retail_order_checkout_channel_v1
before update on public.retail_orders
for each row execute function public.protect_retail_order_checkout_channel_v1();

create function public.create_public_retail_order_v4(
  p_token_hash text,
  p_locale text,
  p_checkout_fingerprint text,
  p_submission_key uuid,
  p_request_fingerprint text,
  p_access_token_hash text,
  p_customer jsonb,
  p_delivery_address jsonb,
  p_installation_address jsonb,
  p_commercial_offer_id uuid,
  p_installation_selection_mode text,
  p_preferred_provider_id uuid,
  p_installation_region_code text,
  p_terms_version text,
  p_privacy_version text,
  p_legal_locale text,
  p_checkout_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
  target_order public.retail_orders%rowtype;
begin
  if p_checkout_channel not in ('public', 'maib_review') then
    raise exception 'Invalid retail checkout channel.' using errcode = '22023';
  end if;

  perform set_config('novotech.retail_checkout_channel', p_checkout_channel, true);
  result := public.create_public_retail_order_v3(
    p_token_hash,
    p_locale,
    p_checkout_fingerprint,
    p_submission_key,
    p_request_fingerprint,
    p_access_token_hash,
    p_customer,
    p_delivery_address,
    p_installation_address,
    p_commercial_offer_id,
    p_installation_selection_mode,
    p_preferred_provider_id,
    p_installation_region_code,
    p_terms_version,
    p_privacy_version,
    p_legal_locale
  );

  select * into target_order
  from public.retail_orders
  where submission_key = p_submission_key;

  if target_order.id is null or target_order.checkout_channel <> p_checkout_channel then
    raise exception 'Retail checkout channel conflict.' using errcode = 'PT409';
  end if;
  return result;
end;
$$;

revoke all on function public.create_public_retail_order_v4(
  text,text,text,uuid,text,text,jsonb,jsonb,jsonb,uuid,text,uuid,text,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.create_public_retail_order_v4(
  text,text,text,uuid,text,text,jsonb,jsonb,jsonb,uuid,text,uuid,text,text,text,text,text
) to anon, service_role;

create function public.claim_retail_payment_attempt_v3(
  p_access_token_hash text,
  p_provider text,
  p_idempotency_key uuid,
  p_return_access_token_hash text,
  p_checkout_channel text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_channel text;
begin
  if p_checkout_channel not in ('public', 'maib_review') then
    return jsonb_build_object('outcome', 'NOT_ELIGIBLE');
  end if;

  select orders.checkout_channel into target_channel
  from public.retail_order_access_tokens token
  join public.retail_orders orders on orders.id = token.order_id
  where token.token_hash = p_access_token_hash
    and token.revoked_at is null
    and token.expires_at > now();

  if target_channel is distinct from p_checkout_channel then
    return jsonb_build_object('outcome', 'NOT_ELIGIBLE');
  end if;

  return public.claim_retail_payment_attempt_v2(
    p_access_token_hash,
    p_provider,
    p_idempotency_key,
    p_return_access_token_hash
  );
end;
$$;

revoke all on function public.claim_retail_payment_attempt_v3(text,text,uuid,text,text)
from public, anon, authenticated;
grant execute on function public.claim_retail_payment_attempt_v3(text,text,uuid,text,text)
to service_role;

create or replace function private.enqueue_first_purchase_confirmed(
  p_retail_order_id uuid,
  p_retail_payment_activation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if exists (
    select 1 from public.retail_orders orders
    where orders.id = p_retail_order_id
      and orders.checkout_channel = 'maib_review'
  ) then
    return;
  end if;

  insert into public.customer_provisioning_outbox (
    retail_order_id, retail_payment_activation_id, status
  ) values (
    p_retail_order_id,
    p_retail_payment_activation_id,
    case when exists (
      select 1 from public.retail_order_auth_bindings binding
      where binding.retail_order_id = p_retail_order_id
    ) then 'PENDING' else 'AWAITING_OWNER' end
  ) on conflict (retail_order_id) do nothing;
end;
$$;

revoke all on function private.enqueue_first_purchase_confirmed(uuid, uuid)
from public, anon, authenticated, service_role;

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
    if orders.checkout_channel <> 'maib_review' then
      perform private.enqueue_first_purchase_confirmed(orders.id, existing.id);
    end if;
    return jsonb_build_object(
      'orderId', orders.id,
      'orderNumber', orders.public_number,
      'status', orders.status,
      'installationRequirementId', existing.installation_requirement_id,
      'assignment', null,
      'reviewIsolated', orders.checkout_channel = 'maib_review',
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
    'simulated', p_activation_mode = 'pilot_simulated',
    'reviewIsolated', orders.checkout_channel = 'maib_review'
  ));

  if orders.checkout_channel = 'maib_review' then
    if p_activation_mode <> 'payment_verified' then
      raise exception 'MAIB review orders require verified sandbox payment.' using errcode = '22023';
    end if;
    insert into public.retail_payment_activations(
      id, retail_order_id, activation_mode, idempotency_key, actor_user_id, safe_reason
    ) values (
      activation_id, orders.id, p_activation_mode, p_idempotency_key, auth.uid(),
      coalesce(nullif(btrim(coalesce(p_safe_reason, '')), ''), 'MAIB sandbox review payment')
    );
    return jsonb_build_object(
      'orderId', orders.id,
      'orderNumber', orders.public_number,
      'status', 'confirmed',
      'installationRequirementId', null,
      'assignment', null,
      'reviewIsolated', true,
      'repeated', false
    );
  end if;

  if orders.installation_selection_mode is null then
    insert into public.retail_payment_activations(
      id, retail_order_id, activation_mode, idempotency_key, actor_user_id, safe_reason
    ) values (
      activation_id, orders.id, p_activation_mode, p_idempotency_key, auth.uid(), nullif(btrim(coalesce(p_safe_reason, '')), '')
    );
    perform private.enqueue_first_purchase_confirmed(orders.id, activation_id);
    return jsonb_build_object(
      'orderId', orders.id,
      'orderNumber', orders.public_number,
      'status', 'confirmed',
      'installationRequirementId', null,
      'assignment', null,
      'reviewIsolated', false,
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

  perform private.enqueue_first_purchase_confirmed(orders.id, activation_id);
  dispatch_result := public.dispatch_installation_requirement(requirement_id, 'automatic', null, p_idempotency_key);
  return jsonb_build_object(
    'orderId', orders.id,
    'orderNumber', orders.public_number,
    'status', 'confirmed',
    'installationRequirementId', requirement_id,
    'assignment', dispatch_result,
    'reviewIsolated', false,
    'repeated', false
  );
end;
$$;

revoke all on function public.activate_paid_retail_order(uuid, text, uuid, text)
from public, anon, authenticated;
grant execute on function public.activate_paid_retail_order(uuid, text, uuid, text)
to service_role;

commit;
