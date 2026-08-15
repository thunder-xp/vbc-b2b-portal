-- Retail-only conversion offer and provider-neutral paid-order activation.
-- Technical selection, public prices, installation tariffs, provider eligibility,
-- assignment, and execution remain owned by their existing domains.

create table public.retail_commercial_offers (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.retail_carts(id) on delete restrict,
  order_id uuid null unique references public.retail_orders(id) on delete restrict,
  offer_type text not null check (offer_type = 'economy_immediate_payment_discount'),
  selected_variant text not null check (selected_variant = 'economy'),
  policy_version text not null check (policy_version = 'retail_equipment_conversion_offer_v1'),
  discount_type text not null check (discount_type = 'percentage'),
  discount_value numeric(5,2) not null check (discount_value = 10.00),
  discount_scope text not null check (discount_scope = 'equipment'),
  status text not null check (status in ('active','redeemed','expired','invalidated')),
  commercial_fingerprint text not null check (commercial_fingerprint ~ '^[0-9a-f]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  original_equipment_subtotal numeric(14,2) not null check (original_equipment_subtotal > 0),
  materials_subtotal numeric(14,2) not null check (materials_subtotal >= 0),
  installation_subtotal numeric(14,2) not null check (installation_subtotal >= 0),
  discount_amount numeric(14,2) not null check (discount_amount > 0),
  resulting_commercial_total numeric(14,2) not null check (resulting_commercial_total > 0),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz null,
  invalidated_at timestamptz null,
  check (expires_at = created_at + interval '1 hour'),
  check ((status = 'redeemed') = (redeemed_at is not null)),
  check ((status = 'invalidated') = (invalidated_at is not null))
);
create unique index retail_commercial_offers_cart_fingerprint_idx
  on public.retail_commercial_offers(cart_id, commercial_fingerprint, offer_type);
create index retail_commercial_offers_active_idx
  on public.retail_commercial_offers(cart_id, expires_at) where status = 'active';

create table public.retail_commercial_offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.retail_commercial_offers(id) on delete restrict,
  event_type text not null check (event_type in ('created','reused','expired','invalidated','redeemed')),
  safe_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_evidence) = 'object'),
  created_at timestamptz not null default now()
);
create index retail_commercial_offer_events_offer_idx
  on public.retail_commercial_offer_events(offer_id, created_at, id);

alter table public.retail_orders
  add column selected_variant text null check (selected_variant is null or selected_variant in ('recommended','economy')),
  add column commercial_offer_id uuid null unique references public.retail_commercial_offers(id) on delete restrict,
  add column commercial_policy_version text null,
  add column equipment_discount_amount numeric(14,2) not null default 0 check (equipment_discount_amount >= 0),
  add column base_commercial_total numeric(14,2) null check (base_commercial_total is null or base_commercial_total > 0),
  add column final_commercial_total numeric(14,2) null check (final_commercial_total is null or final_commercial_total > 0),
  add column installation_selection_mode text null check (installation_selection_mode is null or installation_selection_mode in ('customer_selected','automatic')),
  add column preferred_installation_provider_id uuid null references public.installation_providers(id) on delete restrict,
  add column installation_region_code text null check (installation_region_code is null or installation_region_code ~ '^MD(?:-[A-Z0-9]{1,8})?$'),
  add column orchestration_snapshot_locked boolean not null default false,
  add column paid_at timestamptz null,
  add column payment_activation_mode text null check (payment_activation_mode is null or payment_activation_mode in ('payment_verified','pilot_simulated'));

alter table public.retail_orders drop constraint retail_orders_status_check;
alter table public.retail_orders add constraint retail_orders_status_check
  check (status in ('draft','awaiting_payment','confirmed'));
alter table public.retail_order_events drop constraint retail_order_events_event_type_check;
alter table public.retail_order_events add constraint retail_order_events_event_type_check
  check (event_type in ('retail_order_created','cart_converted','awaiting_payment','commercial_offer_redeemed','payment_confirmed'));

create table public.retail_payment_activations (
  id uuid primary key default gen_random_uuid(),
  retail_order_id uuid not null unique references public.retail_orders(id) on delete restrict,
  activation_mode text not null check (activation_mode in ('payment_verified','pilot_simulated')),
  idempotency_key uuid not null unique,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  safe_reason text null check (safe_reason is null or char_length(safe_reason) between 10 and 500),
  installation_requirement_id uuid null unique references public.installation_requirements(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.retail_commercial_offers enable row level security;
alter table public.retail_commercial_offer_events enable row level security;
alter table public.retail_payment_activations enable row level security;
revoke all on public.retail_commercial_offers, public.retail_commercial_offer_events,
  public.retail_payment_activations from public, anon, authenticated;
grant all on public.retail_commercial_offers, public.retail_commercial_offer_events,
  public.retail_payment_activations to service_role;

create or replace function public.prevent_retail_commercial_offer_history_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Retail commercial offer history is immutable.' using errcode = '42501';
end;
$$;
create trigger prevent_retail_commercial_offer_event_mutation
before update or delete on public.retail_commercial_offer_events
for each row execute function public.prevent_retail_commercial_offer_history_mutation();
create trigger prevent_retail_payment_activation_mutation
before update or delete on public.retail_payment_activations
for each row execute function public.prevent_retail_commercial_offer_history_mutation();

create or replace function public.protect_retail_order_orchestration_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.orchestration_snapshot_locked then
    if new.selected_variant is distinct from old.selected_variant
      or new.commercial_offer_id is distinct from old.commercial_offer_id
      or new.commercial_policy_version is distinct from old.commercial_policy_version
      or new.equipment_discount_amount is distinct from old.equipment_discount_amount
      or new.base_commercial_total is distinct from old.base_commercial_total
      or new.final_commercial_total is distinct from old.final_commercial_total
      or new.installation_selection_mode is distinct from old.installation_selection_mode
      or new.preferred_installation_provider_id is distinct from old.preferred_installation_provider_id
      or new.installation_region_code is distinct from old.installation_region_code
      or (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
      or (old.payment_activation_mode is not null and new.payment_activation_mode is distinct from old.payment_activation_mode)
      or not new.orchestration_snapshot_locked then
      raise exception 'Retail order orchestration snapshot is immutable.' using errcode = '42501';
    end if;
  elsif new.orchestration_snapshot_locked then
    if new.base_commercial_total is null or new.final_commercial_total is null
      or (new.installation_selection_mode = 'customer_selected') <> (new.preferred_installation_provider_id is not null)
      or (new.installation_selection_mode is null) <> (new.installation_region_code is null) then
      raise exception 'Retail order orchestration snapshot is incomplete.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_retail_order_orchestration_snapshot
before update on public.retail_orders
for each row execute function public.protect_retail_order_orchestration_snapshot();

create or replace function public.expire_or_invalidate_retail_offer(p_cart_id uuid, p_fingerprint text)
returns void language plpgsql security definer set search_path = public set row_security = off as $$
declare item record;
begin
  for item in select id, status, expires_at, commercial_fingerprint
    from public.retail_commercial_offers where cart_id = p_cart_id and status = 'active' for update
  loop
    if item.commercial_fingerprint <> p_fingerprint then
      update public.retail_commercial_offers set status = 'invalidated', invalidated_at = now() where id = item.id;
      insert into public.retail_commercial_offer_events(offer_id,event_type,safe_evidence)
        values(item.id,'invalidated',jsonb_build_object('reason','commercial_fingerprint_changed'));
    elsif item.expires_at <= now() then
      update public.retail_commercial_offers set status = 'expired' where id = item.id;
      insert into public.retail_commercial_offer_events(offer_id,event_type,safe_evidence)
        values(item.id,'expired',jsonb_build_object('reason','server_ttl_elapsed'));
    end if;
  end loop;
end;
$$;

create or replace function public.retail_installation_checkout_options(p_locale text default 'ru')
returns jsonb language sql stable security definer set search_path = public set row_security = off as $$
  with eligible as (
    select region.code region_code,
      case when p_locale='ro' then region.name_ro else region.name_ru end region_name,
      provider.id provider_id,
      case when p_locale='ro' then profile.public_name_ro else profile.public_name_ru end display_name,
      case when p_locale='ro' then profile.public_description_ro else profile.public_description_ru end description,
      profile.logo_path,
      profile.availability_state availability
    from public.installation_providers provider
    join public.installation_provider_profiles profile on profile.provider_id=provider.id
    join public.installation_provider_competencies competence on competence.provider_id=provider.id
      and competence.system_type='cctv' and competence.active
    join public.installation_provider_regions coverage on coverage.provider_id=provider.id and coverage.active
    join public.installation_service_regions region on region.id=coverage.region_id and region.active
    left join public.installation_provider_workloads workload on workload.provider_id=provider.id
    where p_locale in ('ru','ro') and provider.operational_status='active'
      and provider.approval_status='approved' and provider.marketplace_enabled
      and profile.public_profile_status='published' and profile.availability_state in ('available','limited')
      and (profile.max_concurrent_jobs is null or coalesce(workload.active_jobs,0) < profile.max_concurrent_jobs)
  )
  select jsonb_build_object(
    'regions',coalesce((select jsonb_agg(distinct jsonb_build_object('code',region_code,'name',region_name)) from eligible),'[]'::jsonb),
    'providers',coalesce((select jsonb_agg(jsonb_build_object('providerId',provider_id,'regionCode',region_code,
      'displayName',display_name,'description',description,'logoPath',logo_path,'availability',availability)
      order by region_name,display_name,provider_id) from eligible),'[]'::jsonb)
  );
$$;

create or replace function public.retail_checkout_snapshot_v2(p_cart_id uuid, p_locale text)
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare
  base jsonb;
  installation_amount numeric(14,2) := 0;
  installation_currency text;
  installation_currency_count integer := 0;
  installation_required boolean := false;
  offer public.retail_commercial_offers;
  variant text;
  effective_total numeric(14,2);
begin
  base := public.retail_checkout_snapshot(p_cart_id,p_locale);
  if base is null then return null; end if;
  select exists(
    select 1 from public.retail_cart_bundles bundle,
      lateral jsonb_each(coalesce(bundle.installation_intent,'{}'::jsonb)) intent
    where bundle.cart_id=p_cart_id and jsonb_typeof(intent.value)='boolean' and (intent.value)::boolean
  ) into installation_required;
  select coalesce(sum((installation_price_snapshot->>'subtotal')::numeric),0),
    min(installation_price_snapshot->>'currency'), count(distinct installation_price_snapshot->>'currency')
    into installation_amount,installation_currency,installation_currency_count
  from public.retail_cart_bundles where cart_id=p_cart_id and installation_price_snapshot is not null;
  if not installation_required then installation_amount:=0; installation_currency_count:=0; end if;
  select case when count(distinct calculator_input->>'selectedVariant')=1
    then min(calculator_input->>'selectedVariant') else null end into variant
  from public.retail_cart_bundles where cart_id=p_cart_id;
  perform public.expire_or_invalidate_retail_offer(p_cart_id,base->>'fingerprint');
  select * into offer from public.retail_commercial_offers
    where cart_id=p_cart_id and commercial_fingerprint=base->>'fingerprint' and status='active'
    order by created_at desc limit 1;
  effective_total := (base#>>'{totals,equipment}')::numeric + (base#>>'{totals,materials}')::numeric
    + installation_amount - coalesce(offer.discount_amount,0);
  base := jsonb_set(base,'{eligible}',to_jsonb(coalesce((base->>'eligible')::boolean,false)
    and (not installation_required or installation_currency_count=1)
    and (installation_currency_count=0 or installation_currency=base#>>'{totals,currency}')));
  if installation_required and (installation_currency_count<>1 or installation_currency is distinct from base#>>'{totals,currency}') then
    base := jsonb_set(base,'{blockingReason}',to_jsonb('currency_conflict'::text));
  end if;
  return base || jsonb_build_object(
    'selectedVariant',variant,
    'installationRequired',installation_required,
    'installationOptions',case when installation_required then public.retail_installation_checkout_options(p_locale) else null end,
    'commercialOffer',case when offer.id is null then null else jsonb_build_object(
      'id',offer.id,'type',offer.offer_type,'policyVersion',offer.policy_version,'status',offer.status,
      'discountPercent',offer.discount_value,'scope',offer.discount_scope,'discountAmount',offer.discount_amount,
      'expiresAt',offer.expires_at,'currency',offer.currency,'resultingTotal',offer.resulting_commercial_total) end,
    'totals',(base->'totals') || jsonb_build_object('installation',installation_amount,
      'equipmentDiscount',coalesce(offer.discount_amount,0),'total',effective_total)
  );
end;
$$;

create or replace function public.get_public_retail_checkout_v2(p_token_hash text,p_locale text default 'ru')
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare target_cart_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_locale not in ('ru','ro') then return null; end if;
  select id into target_cart_id from public.retail_carts
    where token_hash=p_token_hash and status='active' and expires_at>now();
  if target_cart_id is null then return null; end if;
  return public.retail_checkout_snapshot_v2(target_cart_id,p_locale);
end;
$$;

create or replace function public.create_public_retail_commercial_offer(p_token_hash text,p_idempotency_key uuid,p_locale text default 'ru')
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare
  target_cart public.retail_carts;
  snapshot jsonb;
  existing public.retail_commercial_offers;
  target_id uuid;
  equipment numeric(14,2);
  materials numeric(14,2);
  installation numeric(14,2);
  discount numeric(14,2);
  currency_value text;
  bundle_count integer;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_locale not in ('ru','ro') then raise exception 'Invalid offer request.' using errcode='22023'; end if;
  select * into target_cart from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now() for update;
  if not found then raise exception 'Cart unavailable.' using errcode='28000'; end if;
  snapshot:=public.retail_checkout_snapshot_v2(target_cart.id,p_locale);
  if snapshot is null or not coalesce((snapshot->>'eligible')::boolean,false) then raise exception 'Cart is not eligible.' using errcode='P0002'; end if;
  select count(*) into bundle_count from public.retail_cart_bundles where cart_id=target_cart.id
    and calculator_input->>'selectedVariant'='economy';
  if bundle_count<>1 or exists(select 1 from public.retail_cart_items where cart_id=target_cart.id and bundle_id is null)
    or exists(select 1 from public.retail_cart_bundles where cart_id=target_cart.id and coalesce(calculator_input->>'selectedVariant','')<>'economy') then
    raise exception 'Economy configuration is required.' using errcode='P0002';
  end if;
  perform public.expire_or_invalidate_retail_offer(target_cart.id,snapshot->>'fingerprint');
  select * into existing from public.retail_commercial_offers
    where cart_id=target_cart.id and commercial_fingerprint=snapshot->>'fingerprint'
      and offer_type='economy_immediate_payment_discount' for update;
  if found then
    insert into public.retail_commercial_offer_events(offer_id,event_type,safe_evidence)
      values(existing.id,'reused',jsonb_build_object('status',existing.status));
    return jsonb_build_object('id',existing.id,'status',existing.status,'policyVersion',existing.policy_version,
      'discountPercent',existing.discount_value,'scope',existing.discount_scope,'discountAmount',existing.discount_amount,
      'expiresAt',existing.expires_at,'currency',existing.currency,'resultingTotal',existing.resulting_commercial_total,'repeated',true);
  end if;
  equipment:=(snapshot#>>'{totals,equipment}')::numeric;
  materials:=(snapshot#>>'{totals,materials}')::numeric;
  installation:=coalesce((snapshot#>>'{totals,installation}')::numeric,0);
  currency_value:=snapshot#>>'{totals,currency}';
  discount:=round(equipment*0.10,2);
  if equipment<=0 or discount<=0 then raise exception 'Equipment discount is not applicable.' using errcode='P0002'; end if;
  insert into public.retail_commercial_offers(cart_id,offer_type,selected_variant,policy_version,discount_type,
    discount_value,discount_scope,status,commercial_fingerprint,currency,original_equipment_subtotal,
    materials_subtotal,installation_subtotal,discount_amount,resulting_commercial_total,idempotency_key,expires_at)
  values(target_cart.id,'economy_immediate_payment_discount','economy','retail_equipment_conversion_offer_v1','percentage',
    10,'equipment','active',snapshot->>'fingerprint',currency_value,equipment,materials,installation,discount,
    equipment-discount+materials+installation,p_idempotency_key,now()+interval '1 hour') returning id into target_id;
  insert into public.retail_commercial_offer_events(offer_id,event_type,safe_evidence)
    values(target_id,'created',jsonb_build_object('policyVersion','retail_equipment_conversion_offer_v1','scope','equipment'));
  select * into existing from public.retail_commercial_offers where id=target_id;
  return jsonb_build_object('id',existing.id,'status',existing.status,'policyVersion',existing.policy_version,
    'discountPercent',existing.discount_value,'scope',existing.discount_scope,'discountAmount',existing.discount_amount,
    'expiresAt',existing.expires_at,'currency',existing.currency,'resultingTotal',existing.resulting_commercial_total,'repeated',false);
end;
$$;

create or replace function public.get_public_retail_commercial_offer(p_token_hash text,p_locale text default 'ru')
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare target_cart_id uuid; snapshot jsonb; offer public.retail_commercial_offers;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_locale not in ('ru','ro') then return null; end if;
  select id into target_cart_id from public.retail_carts where token_hash=p_token_hash and status='active' and expires_at>now();
  if target_cart_id is null then return null; end if;
  snapshot:=public.retail_checkout_snapshot(target_cart_id,p_locale);
  perform public.expire_or_invalidate_retail_offer(target_cart_id,snapshot->>'fingerprint');
  select * into offer from public.retail_commercial_offers where cart_id=target_cart_id
    order by created_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id',offer.id,'status',offer.status,'policyVersion',offer.policy_version,
    'discountPercent',offer.discount_value,'scope',offer.discount_scope,'discountAmount',offer.discount_amount,
    'expiresAt',offer.expires_at,'currency',offer.currency,'resultingTotal',offer.resulting_commercial_total,'repeated',false);
end;
$$;

create or replace function public.create_public_retail_order_v2(
  p_token_hash text,p_locale text,p_checkout_fingerprint text,p_submission_key uuid,p_request_fingerprint text,
  p_access_token_hash text,p_customer jsonb,p_delivery_address jsonb,p_installation_address jsonb,
  p_commercial_offer_id uuid,p_installation_selection_mode text,p_preferred_provider_id uuid,p_installation_region_code text
) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare
  target_cart public.retail_carts;
  snapshot jsonb;
  offer public.retail_commercial_offers;
  result jsonb;
  order_row public.retail_orders;
  installation_required boolean;
  selected_variant_value text;
  base_total numeric(14,2);
  final_total numeric(14,2);
begin
  select * into target_cart from public.retail_carts where token_hash=p_token_hash and expires_at>now() for update;
  if not found then raise exception 'Cart unavailable.' using errcode='28000'; end if;
  snapshot:=public.retail_checkout_snapshot_v2(target_cart.id,p_locale);
  if snapshot is null or snapshot->>'fingerprint'<>p_checkout_fingerprint then raise exception 'Checkout state changed.' using errcode='PT409'; end if;
  installation_required:=coalesce((snapshot->>'installationRequired')::boolean,false);
  if installation_required then
    if p_installation_address is null or p_installation_selection_mode not in ('customer_selected','automatic')
      or p_installation_region_code !~ '^MD(?:-[A-Z0-9]{1,8})?$'
      or (p_installation_selection_mode='customer_selected')<>(p_preferred_provider_id is not null) then
      raise exception 'Installation preference is required.' using errcode='22023';
    end if;
    if p_preferred_provider_id is not null and not exists(
      select 1 from jsonb_array_elements((snapshot#>'{installationOptions,providers}')) provider
      where (provider->>'providerId')::uuid=p_preferred_provider_id and provider->>'regionCode'=p_installation_region_code
    ) then raise exception 'Selected provider is not eligible.' using errcode='P0002'; end if;
  elsif p_installation_selection_mode is not null or p_preferred_provider_id is not null or p_installation_region_code is not null then
    raise exception 'Installation preference is not applicable.' using errcode='22023';
  end if;
  if p_commercial_offer_id is not null then
    select * into offer from public.retail_commercial_offers where id=p_commercial_offer_id and cart_id=target_cart.id for update;
    if not found or offer.status<>'active' or offer.expires_at<=now()
      or offer.commercial_fingerprint<>p_checkout_fingerprint or offer.currency<>snapshot#>>'{totals,currency}'
      or offer.selected_variant<>coalesce(snapshot->>'selectedVariant','') then
      raise exception 'Commercial offer is no longer valid.' using errcode='PT409';
    end if;
  end if;
  result:=public.create_public_retail_order(p_token_hash,p_locale,p_checkout_fingerprint,p_submission_key,
    p_request_fingerprint,p_access_token_hash,p_customer,p_delivery_address,p_installation_address);
  select * into order_row from public.retail_orders where submission_key=p_submission_key for update;
  if order_row.orchestration_snapshot_locked then return result; end if;
  selected_variant_value:=nullif(snapshot->>'selectedVariant','');
  base_total:=(snapshot#>>'{totals,equipment}')::numeric+(snapshot#>>'{totals,materials}')::numeric
    +coalesce((snapshot#>>'{totals,installation}')::numeric,0);
  final_total:=base_total-coalesce(offer.discount_amount,0);
  update public.retail_orders set selected_variant=selected_variant_value,commercial_offer_id=offer.id,
    commercial_policy_version=offer.policy_version,equipment_discount_amount=coalesce(offer.discount_amount,0),
    base_commercial_total=base_total,final_commercial_total=final_total,
    installation_selection_mode=p_installation_selection_mode,preferred_installation_provider_id=p_preferred_provider_id,
    installation_region_code=p_installation_region_code,orchestration_snapshot_locked=true
  where id=order_row.id;
  if offer.id is not null then
    update public.retail_commercial_offers set status='redeemed',order_id=order_row.id,redeemed_at=now() where id=offer.id;
    insert into public.retail_commercial_offer_events(offer_id,event_type,safe_evidence)
      values(offer.id,'redeemed',jsonb_build_object('orderNumber',order_row.public_number));
    insert into public.retail_order_events(order_id,event_type,safe_evidence)
      values(order_row.id,'commercial_offer_redeemed',jsonb_build_object('policyVersion',offer.policy_version,'scope','equipment'));
  end if;
  return result;
end;
$$;

create or replace function public.get_public_retail_order(p_access_token_hash text,p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = public set row_security = off as $$
declare result jsonb;
begin
  if p_access_token_hash !~ '^[0-9a-f]{64}$' or p_locale not in ('ru','ro') then return null; end if;
  select jsonb_build_object(
    'orderNumber',orders.public_number,'status',orders.status,'createdAt',orders.created_at,'locale',orders.locale,
    'customer',orders.customer_snapshot,'deliveryAddress',orders.delivery_address_snapshot,
    'installationAddress',orders.installation_address_snapshot,'installationIntent',orders.installation_intent_snapshot,
    'calculatorEvidence',orders.calculator_evidence_snapshot,
    'totals',jsonb_build_object('equipment',orders.equipment_subtotal,'materials',orders.materials_subtotal,
      'installation',coalesce(orders.installation_subtotal,0),'equipmentDiscount',orders.equipment_discount_amount,
      'total',coalesce(orders.final_commercial_total,orders.priced_scope_total+coalesce(orders.installation_subtotal,0)),
      'currency',orders.currency,'vatPresentation',orders.vat_presentation),
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'lineNumber',line.line_number,'publicProductId',line.public_product_id,'source',line.source,
      'commercialGroup',line.commercial_group,'sku',line.sku,'name',line.product_name,'slug',line.slug_snapshot,
      'imageUrl',line.image_url_snapshot,'quantity',line.quantity,'unitCode',line.unit_code,'unitPrice',line.unit_price,
      'lineTotal',line.line_total,'currency',line.currency,'vatPresentation',line.vat_presentation,
      'availability',line.availability_snapshot) order by line.line_number)
      from public.retail_order_lines line where line.order_id=orders.id),'[]'::jsonb)
  ) into result
  from public.retail_order_access_tokens token join public.retail_orders orders on orders.id=token.order_id
  where token.token_hash=p_access_token_hash and token.revoked_at is null and token.expires_at>now();
  return result;
end;
$$;

create or replace function public.activate_paid_retail_order(
  p_retail_order_id uuid,p_activation_mode text,p_idempotency_key uuid,p_safe_reason text default null
) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare
  orders public.retail_orders;
  existing public.retail_payment_activations;
  region_id uuid;
  requirement_id uuid;
  activation_id uuid := gen_random_uuid();
  tariff_version_value integer;
  dispatch_result jsonb;
begin
  if p_activation_mode not in ('payment_verified','pilot_simulated')
    or (p_activation_mode='pilot_simulated' and char_length(btrim(coalesce(p_safe_reason,'')))<10) then
    raise exception 'Invalid payment activation.' using errcode='22023';
  end if;
  select * into orders from public.retail_orders where id=p_retail_order_id for update;
  if not found then raise exception 'Retail order not found.' using errcode='P0002'; end if;
  select * into existing from public.retail_payment_activations where retail_order_id=orders.id;
  if found then
    return jsonb_build_object('orderId',orders.id,'orderNumber',orders.public_number,'status',orders.status,
      'installationRequirementId',existing.installation_requirement_id,'assignment',null,'repeated',true);
  end if;
  if orders.status<>'awaiting_payment' or not orders.orchestration_snapshot_locked then
    raise exception 'Retail order is not awaiting payment.' using errcode='PT409';
  end if;
  update public.retail_orders set status='confirmed',paid_at=now(),payment_activation_mode=p_activation_mode,revision=revision+1 where id=orders.id;
  insert into public.retail_order_events(order_id,event_type,safe_evidence)
    values(orders.id,'payment_confirmed',jsonb_build_object('activationMode',p_activation_mode,'simulated',p_activation_mode='pilot_simulated'));
  if orders.installation_selection_mode is null then
    insert into public.retail_payment_activations(id,retail_order_id,activation_mode,idempotency_key,actor_user_id,safe_reason)
      values(activation_id,orders.id,p_activation_mode,p_idempotency_key,auth.uid(),nullif(btrim(coalesce(p_safe_reason,'')),''));
    return jsonb_build_object('orderId',orders.id,'orderNumber',orders.public_number,'status','confirmed',
      'installationRequirementId',null,'assignment',null,'repeated',false);
  end if;
  select id into region_id from public.installation_service_regions where code=orders.installation_region_code and active;
  if region_id is null or orders.installation_address_snapshot is null or orders.installation_tariff_set_id is null
    or orders.installation_subtotal is null or jsonb_array_length(orders.installation_work_lines_snapshot)=0 then
    raise exception 'Retail installation snapshot is unavailable.' using errcode='P0002';
  end if;
  select version into tariff_version_value from public.installation_tariff_sets where id=orders.installation_tariff_set_id;
  insert into public.installation_requirements(retail_order_id,selection_mode,preferred_provider_id,service_region_id,
    locality_snapshot,exact_address_snapshot,customer_pii_snapshot,work_lines_snapshot,tariff_set_id,tariff_version,
    customer_installation_charge,currency,vat_treatment,requested_scheduling_context,activation_mode,activation_evidence)
  values(orders.id,orders.installation_selection_mode,orders.preferred_installation_provider_id,region_id,
    orders.installation_address_snapshot->>'locality',orders.installation_address_snapshot,orders.customer_snapshot,
    orders.installation_work_lines_snapshot,orders.installation_tariff_set_id,tariff_version_value,
    orders.installation_subtotal,orders.currency,orders.vat_presentation,'{}'::jsonb,p_activation_mode,
    jsonb_build_object('paymentActivationId',activation_id,'simulated',p_activation_mode='pilot_simulated'))
  returning id into requirement_id;
  insert into public.installation_requirement_lines(requirement_id,line_number,service_type,unit_code,quantity,customer_unit_price,customer_line_amount)
  select requirement_id,row_number() over(order by line->>'serviceType'),line->>'serviceType',line->>'unitCode',
    (line->>'quantity')::numeric,(line->>'unitPrice')::numeric,(line->>'amount')::numeric
  from jsonb_array_elements(orders.installation_work_lines_snapshot) line;
  insert into public.installation_assignment_events(requirement_id,event_type,actor_user_id,correlation_id,safe_evidence)
  values(requirement_id,'installation_requirement_activated',auth.uid(),p_idempotency_key,
    jsonb_build_object('activationMode',p_activation_mode,'tariffSetId',orders.installation_tariff_set_id,'tariffVersion',tariff_version_value)),
    (requirement_id,'provider_preferred',auth.uid(),p_idempotency_key,
    jsonb_build_object('selectionMode',orders.installation_selection_mode,'preferredProviderId',orders.preferred_installation_provider_id));
  insert into public.retail_payment_activations(id,retail_order_id,activation_mode,idempotency_key,actor_user_id,safe_reason,installation_requirement_id)
    values(activation_id,orders.id,p_activation_mode,p_idempotency_key,auth.uid(),nullif(btrim(coalesce(p_safe_reason,'')),''),requirement_id);
  dispatch_result:=public.dispatch_installation_requirement(requirement_id,'automatic',null,p_idempotency_key);
  return jsonb_build_object('orderId',orders.id,'orderNumber',orders.public_number,'status','confirmed',
    'installationRequirementId',requirement_id,'assignment',dispatch_result,'repeated',false);
end;
$$;

create or replace function public.simulate_retail_order_payment(
  p_retail_order_id uuid,p_idempotency_key uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Simulation reason is required.' using errcode='22023'; end if;
  return public.activate_paid_retail_order(p_retail_order_id,'pilot_simulated',p_idempotency_key,p_reason);
end;
$$;

revoke all on function public.prevent_retail_commercial_offer_history_mutation(),
  public.protect_retail_order_orchestration_snapshot(),
  public.expire_or_invalidate_retail_offer(uuid,text),
  public.retail_checkout_snapshot_v2(uuid,text),
  public.retail_installation_checkout_options(text),
  public.activate_paid_retail_order(uuid,text,uuid,text)
from public,anon,authenticated;
revoke all on function public.create_public_retail_order(text,text,text,uuid,text,text,jsonb,jsonb,jsonb)
from public,anon,authenticated,service_role;
revoke all on function public.activate_installation_requirement_pilot(uuid,text,uuid,text,jsonb,text,uuid)
from public,anon,authenticated,service_role;
revoke all on function public.create_public_retail_commercial_offer(text,uuid,text),
  public.get_public_retail_commercial_offer(text,text),
  public.get_public_retail_checkout_v2(text,text),
  public.create_public_retail_order_v2(text,text,text,uuid,text,text,jsonb,jsonb,jsonb,uuid,text,uuid,text),
  public.simulate_retail_order_payment(uuid,uuid,text)
from public,anon,authenticated;
grant execute on function public.create_public_retail_commercial_offer(text,uuid,text),
  public.get_public_retail_commercial_offer(text,text),
  public.get_public_retail_checkout_v2(text,text),
  public.create_public_retail_order_v2(text,text,text,uuid,text,text,jsonb,jsonb,jsonb,uuid,text,uuid,text)
to anon,service_role;
grant execute on function public.get_public_retail_order(text,text) to anon,service_role;
grant execute on function public.simulate_retail_order_payment(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.activate_paid_retail_order(uuid,text,uuid,text) to service_role;

revoke all on function public.prevent_retail_commercial_offer_history_mutation(),
  public.protect_retail_order_orchestration_snapshot(),
  public.expire_or_invalidate_retail_offer(uuid,text),
  public.retail_checkout_snapshot_v2(uuid,text),
  public.retail_installation_checkout_options(text)
from service_role;
