begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table private.sduc_system_policy (
  singleton_key smallint primary key default 1 check (singleton_key = 1),
  decrease_authorization_enabled boolean not null default false,
  execution_mode text not null default 'DRY_RUN'
    check (execution_mode in ('DRY_RUN', 'ACTIVE')),
  global_decrease_ceiling_percent numeric(12, 6)
    check (global_decrease_ceiling_percent > 0 and global_decrease_ceiling_percent < 100),
  stop_price_type_ref text not null,
  stop_price_type_code text not null,
  stop_price_type_name text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.user_profiles(id) on delete set null,
  check (execution_mode = 'DRY_RUN' or decrease_authorization_enabled)
);

create table private.sduc_mechanism_policies (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('DECREASE', 'INCREASE')),
  mechanism_type text not null check (mechanism_type in (
    'REORDER_DUE', 'BACK_IN_STOCK', 'WIN_BACK', 'GAMIFICATION',
    'CAMPAIGN', 'REWARD', 'VOLUME_INCENTIVE', 'STOCK_PRESSURE'
  )),
  enabled boolean not null default false,
  execution_mode text not null default 'DRY_RUN'
    check (execution_mode in ('DRY_RUN', 'ACTIVE')),
  maximum_discount_percent numeric(12, 6)
    check (maximum_discount_percent > 0 and maximum_discount_percent < 100),
  discount_steps_percent numeric(12, 6)[] not null default '{}',
  stackable boolean not null default false,
  validity_seconds integer check (validity_seconds between 60 and 2592000),
  priority integer not null default 0,
  usage_scope text not null default 'SINGLE_TRANSACTION'
    check (usage_scope = 'SINGLE_TRANSACTION'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (direction, mechanism_type),
  check (direction <> 'DECREASE' or execution_mode = 'DRY_RUN'),
  check (not enabled or (
    maximum_discount_percent is not null
    and cardinality(discount_steps_percent) > 0
    and validity_seconds is not null
  ))
);

create table private.sduc_price_authorizations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  direction text not null check (direction in ('DECREASE', 'INCREASE')),
  mechanism_type text not null,
  mechanism_policy_id uuid not null references private.sduc_mechanism_policies(id) on delete restrict,
  policy_priority integer not null,
  mechanism_instance_id text not null check (
    char_length(mechanism_instance_id) between 1 and 160
  ),
  execution_mode text not null check (execution_mode in ('DRY_RUN', 'ACTIVE')),
  base_price numeric(20, 6) not null check (base_price > 0),
  stop_price numeric(20, 6) not null check (stop_price > 0),
  currency text not null check (char_length(currency) between 1 and 12),
  reserve_absolute numeric(20, 6) not null check (reserve_absolute > 0),
  reserve_percent numeric(20, 12) not null check (reserve_percent > 0),
  requested_discount_percent numeric(12, 6) not null check (requested_discount_percent > 0),
  approved_discount_percent numeric(12, 6) not null check (approved_discount_percent > 0),
  effective_price numeric(20, 6) not null check (effective_price >= stop_price),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  status text not null default 'ACTIVE' check (status in (
    'ACTIVE', 'CONSUMED', 'EXPIRED', 'INVALIDATED', 'REVOKED'
  )),
  invalidation_reason text,
  consumed_at timestamptz,
  consumed_order_id uuid references public.partner_orders(id) on delete restrict,
  base_price_type_ref text not null,
  base_source_version text,
  stop_source_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, direction, mechanism_type, mechanism_instance_id),
  check (valid_until > valid_from),
  check (approved_discount_percent <= requested_discount_percent),
  check (effective_price <= base_price),
  check (direction <> 'DECREASE' or execution_mode = 'DRY_RUN'),
  check ((status = 'CONSUMED') = (consumed_at is not null and consumed_order_id is not null))
);

create index sduc_price_authorizations_active_scope_idx
  on private.sduc_price_authorizations (
    company_id, product_id, direction, effective_price, valid_until, id
  ) where status = 'ACTIVE';
create index sduc_price_authorizations_expiry_idx
  on private.sduc_price_authorizations (valid_until, id)
  where status = 'ACTIVE';

create table private.sduc_authorization_events (
  id bigint generated always as identity primary key,
  authorization_id uuid not null references private.sduc_price_authorizations(id) on delete restrict,
  event_type text not null check (event_type in (
    'CREATED', 'IDEMPOTENT_REPLAY', 'REVALIDATED', 'INVALIDATED', 'EXPIRED',
    'REVOKED', 'CONSUMED'
  )),
  reason_code text not null,
  order_id uuid references public.partner_orders(id) on delete restrict,
  safe_details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index sduc_authorization_events_authorization_idx
  on private.sduc_authorization_events (authorization_id, occurred_at, id);

create table private.sduc_calibration_state (
  singleton_key smallint primary key default 1 check (singleton_key = 1),
  generated_at timestamptz,
  source_price_synced_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(summary) = 'object')
);

alter table private.sduc_system_policy enable row level security;
alter table private.sduc_system_policy force row level security;
alter table private.sduc_mechanism_policies enable row level security;
alter table private.sduc_mechanism_policies force row level security;
alter table private.sduc_price_authorizations enable row level security;
alter table private.sduc_price_authorizations force row level security;
alter table private.sduc_authorization_events enable row level security;
alter table private.sduc_authorization_events force row level security;
alter table private.sduc_calibration_state enable row level security;
alter table private.sduc_calibration_state force row level security;

revoke all on private.sduc_system_policy from public, anon, authenticated, service_role;
revoke all on private.sduc_mechanism_policies from public, anon, authenticated, service_role;
revoke all on private.sduc_price_authorizations from public, anon, authenticated, service_role;
revoke all on private.sduc_authorization_events from public, anon, authenticated, service_role;
revoke all on private.sduc_calibration_state from public, anon, authenticated, service_role;
revoke all on sequence private.sduc_authorization_events_id_seq from public, anon, authenticated, service_role;

insert into private.sduc_system_policy (
  singleton_key, decrease_authorization_enabled, execution_mode,
  global_decrease_ceiling_percent, stop_price_type_ref,
  stop_price_type_code, stop_price_type_name
) values (
  1, false, 'DRY_RUN', null,
  '5c72ff41-88d6-11e8-80dd-000c29a58b59', 'UU-000004', 'STOP'
);

insert into private.sduc_mechanism_policies (
  direction, mechanism_type, enabled, execution_mode, stackable, priority
)
select 'DECREASE', mechanism_type, false, 'DRY_RUN', false, priority
from (values
  ('REORDER_DUE', 80), ('BACK_IN_STOCK', 70), ('WIN_BACK', 60),
  ('GAMIFICATION', 50), ('CAMPAIGN', 40), ('REWARD', 30),
  ('VOLUME_INCENTIVE', 20), ('STOCK_PRESSURE', 10)
) seed(mechanism_type, priority);

create function private.sduc_current_price_context(
  p_company_id uuid,
  p_product_id uuid
)
returns table (
  company_id uuid, product_id uuid, base_price numeric, stop_price numeric,
  base_currency text, stop_currency text, base_price_type_ref text,
  base_source_version text, stop_source_version text
)
language plpgsql stable security definer
set search_path = ''
set row_security = off
as $$
declare
  target_company public.partner_companies%rowtype;
  stop_type public.price_types%rowtype;
begin
  select company.* into target_company
  from public.partner_companies company
  where company.id = p_company_id and company.status = 'active';

  if target_company.id is null or target_company.external_1c_price_type_id is null then
    return query select p_company_id, p_product_id, null::numeric, null::numeric,
      null::text, null::text, target_company.external_1c_price_type_id,
      null::text, null::text;
    return;
  end if;

  select price_type.* into stop_type
  from public.price_types price_type
  join private.sduc_system_policy policy on policy.singleton_key = 1
    and price_type.external_ref = policy.stop_price_type_ref
    and price_type.external_code = policy.stop_price_type_code
    and price_type.name = policy.stop_price_type_name
  where price_type.is_active;

  if exists (select 1 from public.price_types) and (
    stop_type.id is null or stop_type.currency_status <> 'resolved'
    or nullif(btrim(stop_type.currency_code), '') is null
  ) then
    raise exception 'SDUC_STOP_AUTHORITY_UNAVAILABLE' using errcode = '23514';
  end if;

  if (
    select count(distinct (price.price_amount, upper(price_type.currency_code))) > 1
    from public.product_prices price
    join public.price_types price_type
      on price_type.external_ref = target_company.external_1c_price_type_id
    where price.product_id = p_product_id
      and price.external_1c_price_type_id = target_company.external_1c_price_type_id
      and (price.company_id is null or price.company_id = p_company_id)
      and price.is_active and price.is_published and price.price_amount > 0
      and price.currency_status = 'resolved'
      and price.valid_from <= statement_timestamp()
      and (price.valid_to is null or price.valid_to >= statement_timestamp())
  ) then raise exception 'SDUC_BASE_PRICE_SOURCE_CONFLICT' using errcode = '23514'; end if;

  if (
    select count(distinct (price.price_amount, upper(stop_type.currency_code))) > 1
    from public.product_prices price
    where price.product_id = p_product_id and price.price_type_id = stop_type.id
      and price.is_active and price.is_published and price.price_amount > 0
      and price.currency_status = 'resolved'
      and price.valid_from <= statement_timestamp()
      and (price.valid_to is null or price.valid_to >= statement_timestamp())
  ) then raise exception 'SDUC_STOP_PRICE_SOURCE_CONFLICT' using errcode = '23514'; end if;

  return query
  select p_company_id, p_product_id,
    base.price_amount, stop.price_amount,
    upper(base_type.currency_code), upper(stop_type.currency_code),
    target_company.external_1c_price_type_id,
    coalesce(base.source_version, base.synced_at::text, base.updated_at::text),
    coalesce(stop.source_version, stop.synced_at::text, stop.updated_at::text)
  from public.catalog_products product
  left join public.price_types base_type
    on base_type.external_ref = target_company.external_1c_price_type_id
    and base_type.is_active
  left join lateral (
    select price.* from public.product_prices price
    where price.product_id = product.id
      and price.external_1c_price_type_id = target_company.external_1c_price_type_id
      and (price.company_id is null or price.company_id = p_company_id)
      and price.is_active and price.is_published and price.price_amount > 0
      and price.currency_status = 'resolved'
      and price.valid_from <= statement_timestamp()
      and (price.valid_to is null or price.valid_to >= statement_timestamp())
    order by (price.company_id = p_company_id) desc, price.valid_from desc, price.id
    limit 1
  ) base on true
  left join lateral (
    select price.* from public.product_prices price
    where price.product_id = product.id and price.price_type_id = stop_type.id
      and price.is_active and price.is_published and price.price_amount > 0
      and price.currency_status = 'resolved'
      and price.valid_from <= statement_timestamp()
      and (price.valid_to is null or price.valid_to >= statement_timestamp())
    order by price.valid_from desc, price.id
    limit 1
  ) stop on true
  where product.id = p_product_id and product.is_active and product.is_visible;
end;
$$;

revoke all on function private.sduc_current_price_context(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.get_sduc_decrease_evaluation_context(
  p_company_id uuid,
  p_product_id uuid,
  p_mechanism_type text
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
set row_security = off
as $$
declare
  current_price record;
  system_policy private.sduc_system_policy%rowtype;
  mechanism_policy private.sduc_mechanism_policies%rowtype;
begin
  if p_company_id is null or p_product_id is null or p_mechanism_type is null then
    raise exception 'SDUC_INVALID_CONTEXT' using errcode = '22023';
  end if;

  select * into system_policy from private.sduc_system_policy where singleton_key = 1;
  select * into mechanism_policy from private.sduc_mechanism_policies
  where direction = 'DECREASE' and mechanism_type = p_mechanism_type;
  if mechanism_policy.id is null then
    raise exception 'SDUC_MECHANISM_UNKNOWN' using errcode = '22023';
  end if;

  select * into current_price
  from private.sduc_current_price_context(p_company_id, p_product_id);

  return jsonb_build_object(
    'companyId', p_company_id, 'productId', p_product_id,
    'basePrice', current_price.base_price, 'stopPrice', current_price.stop_price,
    'baseCurrency', current_price.base_currency,
    'stopCurrency', current_price.stop_currency,
    'basePriceTypeRef', current_price.base_price_type_ref,
    'baseSourceVersion', current_price.base_source_version,
    'stopSourceVersion', current_price.stop_source_version,
    'policyId', mechanism_policy.id,
    'mechanismType', mechanism_policy.mechanism_type,
    'direction', mechanism_policy.direction,
    'enabled', system_policy.decrease_authorization_enabled and mechanism_policy.enabled,
    'executionMode', system_policy.execution_mode,
    'globalCeilingPercent', system_policy.global_decrease_ceiling_percent,
    'mechanismMaximumPercent', mechanism_policy.maximum_discount_percent,
    'discountStepsPercent', to_jsonb(mechanism_policy.discount_steps_percent),
    'stackable', mechanism_policy.stackable,
    'validitySeconds', mechanism_policy.validity_seconds,
    'priority', mechanism_policy.priority
  );
end;
$$;

revoke all on function public.get_sduc_decrease_evaluation_context(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_sduc_decrease_evaluation_context(uuid, uuid, text)
  to service_role;

create function public.create_sduc_decrease_authorization(
  p_company_id uuid, p_product_id uuid, p_mechanism_type text,
  p_mechanism_instance_id text, p_requested_discount_percent numeric,
  p_approved_discount_percent numeric, p_effective_price numeric,
  p_expected_base_price numeric, p_expected_stop_price numeric,
  p_expected_currency text
)
returns jsonb
language plpgsql security definer
set search_path = ''
set row_security = off
as $$
declare
  context jsonb;
  existing private.sduc_price_authorizations%rowtype;
  created private.sduc_price_authorizations%rowtype;
  reserve_absolute numeric;
  reserve_percent numeric;
  allowed_percent numeric;
  expected_effective numeric;
begin
  if nullif(btrim(p_mechanism_instance_id), '') is null
    or char_length(p_mechanism_instance_id) > 160
    or p_requested_discount_percent <= 0 or p_approved_discount_percent <= 0
  then raise exception 'SDUC_INVALID_AUTHORIZATION_INPUT' using errcode = '22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
    p_company_id::text || ':' || p_product_id::text || ':' || p_mechanism_type || ':' || p_mechanism_instance_id
  ));

  select * into existing from private.sduc_price_authorizations candidate
  where candidate.company_id = p_company_id
    and candidate.product_id = p_product_id
    and candidate.direction = 'DECREASE'
    and candidate.mechanism_type = p_mechanism_type
    and candidate.mechanism_instance_id = p_mechanism_instance_id;
  if existing.id is not null then
    insert into private.sduc_authorization_events (
      authorization_id, event_type, reason_code
    ) values (existing.id, 'IDEMPOTENT_REPLAY', 'IDEMPOTENT_REPLAY');
    return to_jsonb(existing);
  end if;

  context := public.get_sduc_decrease_evaluation_context(
    p_company_id, p_product_id, p_mechanism_type
  );
  if not coalesce((context->>'enabled')::boolean, false)
    or context->>'executionMode' <> 'DRY_RUN'
    or context->>'globalCeilingPercent' is null
    or context->>'mechanismMaximumPercent' is null
    or context->>'validitySeconds' is null
  then raise exception 'SDUC_POLICY_NOT_ENABLED' using errcode = '23514'; end if;

  if (context->>'basePrice')::numeric is distinct from p_expected_base_price
    or (context->>'stopPrice')::numeric is distinct from p_expected_stop_price
    or upper(context->>'baseCurrency') is distinct from upper(p_expected_currency)
    or upper(context->>'stopCurrency') is distinct from upper(p_expected_currency)
  then raise exception 'SDUC_SOURCE_SNAPSHOT_MOVED' using errcode = '40001'; end if;

  reserve_absolute := p_expected_base_price - p_expected_stop_price;
  if reserve_absolute <= 0 then
    raise exception 'SDUC_NO_DOWNWARD_PRICE_RESERVE' using errcode = '23514';
  end if;
  reserve_percent := reserve_absolute / p_expected_base_price * 100;
  allowed_percent := least(
    reserve_percent,
    (context->>'globalCeilingPercent')::numeric,
    (context->>'mechanismMaximumPercent')::numeric
  );
  if p_approved_discount_percent > p_requested_discount_percent
    or p_approved_discount_percent > allowed_percent
    or not exists (
      select 1 from jsonb_array_elements_text(context->'discountStepsPercent') step
      where step::numeric = p_approved_discount_percent
    )
  then raise exception 'SDUC_DISCOUNT_OUTSIDE_POLICY' using errcode = '23514'; end if;

  expected_effective := greatest(
    p_expected_stop_price,
    ceil((p_expected_base_price * (100 - p_approved_discount_percent) / 100) * 1000000) / 1000000
  );
  if p_effective_price is distinct from expected_effective then
    raise exception 'SDUC_EFFECTIVE_PRICE_MISMATCH' using errcode = '23514';
  end if;

  insert into private.sduc_price_authorizations (
    company_id, product_id, direction, mechanism_type, mechanism_policy_id,
    mechanism_instance_id, policy_priority, execution_mode, base_price, stop_price, currency,
    reserve_absolute, reserve_percent, requested_discount_percent,
    approved_discount_percent, effective_price, valid_from, valid_until,
    base_price_type_ref, base_source_version, stop_source_version
  ) values (
    p_company_id, p_product_id, 'DECREASE', p_mechanism_type,
    (context->>'policyId')::uuid, p_mechanism_instance_id,
    (context->>'priority')::integer, 'DRY_RUN',
    p_expected_base_price, p_expected_stop_price, upper(p_expected_currency),
    reserve_absolute, reserve_percent, p_requested_discount_percent,
    p_approved_discount_percent, p_effective_price, statement_timestamp(),
    statement_timestamp() + make_interval(secs => (context->>'validitySeconds')::integer),
    context->>'basePriceTypeRef', context->>'baseSourceVersion', context->>'stopSourceVersion'
  ) returning * into created;

  insert into private.sduc_authorization_events (
    authorization_id, event_type, reason_code,
    safe_details
  ) values (
    created.id, 'CREATED', 'ELIGIBLE',
    jsonb_build_object('executionMode', 'DRY_RUN', 'mechanismType', p_mechanism_type)
  );
  return to_jsonb(created);
end;
$$;

revoke all on function public.create_sduc_decrease_authorization(
  uuid, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text
) from public, anon, authenticated;
grant execute on function public.create_sduc_decrease_authorization(
  uuid, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text
) to service_role;

create function public.revalidate_sduc_decrease_authorization(p_authorization_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
set row_security = off
as $$
declare
  target_authorization private.sduc_price_authorizations%rowtype;
  context jsonb;
  reason text := 'ELIGIBLE';
begin
  select * into target_authorization from private.sduc_price_authorizations source
  where source.id = p_authorization_id for update;
  if target_authorization.id is null then
    raise exception 'SDUC_AUTHORIZATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target_authorization.status <> 'ACTIVE' then reason := 'AUTHORIZATION_NOT_ACTIVE';
  elsif target_authorization.valid_until <= statement_timestamp() then reason := 'AUTHORIZATION_EXPIRED';
  else
    context := public.get_sduc_decrease_evaluation_context(
      target_authorization.company_id, target_authorization.product_id, target_authorization.mechanism_type
    );
    if not coalesce((context->>'enabled')::boolean, false) then reason := 'MECHANISM_DISABLED';
    elsif (context->>'basePrice')::numeric is distinct from target_authorization.base_price then reason := 'BASE_PRICE_CHANGED';
    elsif upper(context->>'baseCurrency') is distinct from target_authorization.currency
      or upper(context->>'stopCurrency') is distinct from target_authorization.currency then reason := 'CURRENCY_NOT_COMPARABLE';
    elsif (context->>'stopPrice')::numeric > target_authorization.effective_price then reason := 'STOP_FLOOR_MOVED';
    elsif context->>'baseSourceVersion' is distinct from target_authorization.base_source_version
      or context->>'stopSourceVersion' is distinct from target_authorization.stop_source_version then reason := 'SOURCE_VERSION_MOVED';
    end if;
  end if;

  if reason <> 'ELIGIBLE' and target_authorization.status = 'ACTIVE' then
    update private.sduc_price_authorizations
    set status = case when reason = 'AUTHORIZATION_EXPIRED' then 'EXPIRED' else 'INVALIDATED' end,
      invalidation_reason = reason, updated_at = statement_timestamp()
    where id = target_authorization.id;
    insert into private.sduc_authorization_events (authorization_id, event_type, reason_code)
    values (target_authorization.id,
      case when reason = 'AUTHORIZATION_EXPIRED' then 'EXPIRED' else 'INVALIDATED' end,
      reason);
  elsif reason = 'ELIGIBLE' then
    insert into private.sduc_authorization_events (authorization_id, event_type, reason_code)
    values (target_authorization.id, 'REVALIDATED', reason);
  end if;
  return jsonb_build_object('valid', reason = 'ELIGIBLE', 'reasonCode', reason,
    'authorizationId', target_authorization.id);
end;
$$;

revoke all on function public.revalidate_sduc_decrease_authorization(uuid)
  from public, anon, authenticated;
grant execute on function public.revalidate_sduc_decrease_authorization(uuid)
  to service_role;

create function public.consume_sduc_decrease_authorization(
  p_authorization_id uuid, p_company_id uuid, p_product_id uuid, p_order_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = ''
set row_security = off
as $$
declare target_authorization private.sduc_price_authorizations%rowtype; validation jsonb;
begin
  validation := public.revalidate_sduc_decrease_authorization(p_authorization_id);
  if not (validation->>'valid')::boolean then
    raise exception 'SDUC_AUTHORIZATION_INVALID:%', validation->>'reasonCode' using errcode = '23514';
  end if;
  select * into target_authorization from private.sduc_price_authorizations source
  where source.id = p_authorization_id for update;
  if target_authorization.company_id <> p_company_id or target_authorization.product_id <> p_product_id
    or not exists (select 1 from public.partner_orders target
      where target.id = p_order_id and target.company_id = p_company_id)
  then raise exception 'SDUC_AUTHORIZATION_SCOPE_MISMATCH' using errcode = '42501'; end if;
  update private.sduc_price_authorizations set status = 'CONSUMED', consumed_at = statement_timestamp(),
    consumed_order_id = p_order_id, updated_at = statement_timestamp()
  where id = target_authorization.id;
  insert into private.sduc_authorization_events (authorization_id, event_type, reason_code, order_id)
  values (target_authorization.id, 'CONSUMED', 'CONSUMED', p_order_id);
  return jsonb_build_object('authorizationId', target_authorization.id, 'status', 'CONSUMED');
end;
$$;

revoke all on function public.consume_sduc_decrease_authorization(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_sduc_decrease_authorization(uuid, uuid, uuid, uuid)
  to service_role;

create function private.refresh_sduc_calibration()
returns jsonb
language plpgsql security definer
set search_path = ''
set row_security = off
as $$
declare result jsonb; generated timestamptz := statement_timestamp(); source_synced timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('private.refresh_sduc_calibration'));
  with recursive category_tree as (
    select category.id, category.id root_id, category.name root_name
    from public.catalog_categories category where category.parent_id is null
    union all
    select child.id, parent.root_id, parent.root_name
    from public.catalog_categories child
    join category_tree parent on parent.id = child.parent_id
  ), active_companies as materialized (
    select distinct company.id, company.status, company.external_1c_price_type_id
    from public.partner_companies company
    join public.company_memberships membership on membership.company_id = company.id
      and membership.status = 'active'
    where company.status = 'active' and company.external_1c_price_type_id is not null
  ), active_products as materialized (
    select product.id, product.category_id, product.brand_id from public.catalog_products product
    where product.is_active and product.is_visible
  ), stop_type as materialized (
    select price_type.* from public.price_types price_type
    join private.sduc_system_policy policy on policy.singleton_key = 1
      and price_type.external_ref = policy.stop_price_type_ref
      and price_type.external_code = policy.stop_price_type_code
      and price_type.name = policy.stop_price_type_name
    where price_type.is_active
  ), pairs as materialized (
    select company.id company_id, company.status company_status,
      company.external_1c_price_type_id price_type_ref, product.id product_id,
      product.category_id, category_tree.root_name top_category_name,
      brand.name brand_name, base.price_amount base_price, stop.price_amount stop_price,
      base_type.currency_code base_currency, stop_type.currency_code stop_currency,
      greatest(base.synced_at, stop.synced_at) source_synced_at,
      case when base.price_amount is not null and stop.price_amount is not null
        and upper(base_type.currency_code) = upper(stop_type.currency_code)
        and base.price_amount > stop.price_amount
        then ((base.price_amount - stop.price_amount) / base.price_amount * 100) end reserve_percent
    from active_companies company cross join active_products product
    left join category_tree on category_tree.id = product.category_id
    left join public.catalog_brands brand on brand.id = product.brand_id and brand.is_active
    left join public.price_types base_type on base_type.external_ref = company.external_1c_price_type_id
      and base_type.is_active
    left join stop_type on true
    left join lateral (select price.* from public.product_prices price
      where price.product_id = product.id
        and price.external_1c_price_type_id = company.external_1c_price_type_id
        and (price.company_id is null or price.company_id = company.id)
        and price.is_active and price.is_published and price.price_amount > 0
        and price.currency_status = 'resolved' and price.valid_from <= generated
        and (price.valid_to is null or price.valid_to >= generated)
      order by (price.company_id = company.id) desc, price.valid_from desc, price.id limit 1) base on true
    left join lateral (select price.* from public.product_prices price
      where price.product_id = product.id and price.price_type_id = stop_type.id
        and price.is_active and price.is_published and price.price_amount > 0
        and price.currency_status = 'resolved' and price.valid_from <= generated
        and (price.valid_to is null or price.valid_to >= generated)
      order by price.valid_from desc, price.id limit 1) stop on true
  ), overview as (
    select count(*) total_pairs, count(distinct company_id) company_count,
      count(distinct product_id) product_count,
      count(*) filter (where base_price is null) missing_base,
      count(*) filter (where stop_price is null) missing_stop,
      count(*) filter (where base_price is not null and stop_price is not null
        and upper(base_currency) <> upper(stop_currency)) currency_mismatch,
      count(*) filter (where base_price is not null and stop_price is not null
        and upper(base_currency) = upper(stop_currency) and base_price <= stop_price) no_reserve,
      count(*) filter (where reserve_percent > 0) positive_reserve,
      count(*) filter (where stop_price > base_price) stop_above_base,
      count(*) filter (where stop_price = base_price) stop_equals_base,
      max(source_synced_at) max_source_synced_at
    from pairs
  ), distribution as (
    select jsonb_build_object(
      '0To0_1', count(*) filter (where reserve_percent > 0 and reserve_percent < 0.1),
      '0_1To0_5', count(*) filter (where reserve_percent >= 0.1 and reserve_percent < 0.5),
      '0_5To1', count(*) filter (where reserve_percent >= 0.5 and reserve_percent < 1),
      '1To2', count(*) filter (where reserve_percent >= 1 and reserve_percent < 2),
      '2To3', count(*) filter (where reserve_percent >= 2 and reserve_percent < 3),
      '3To5', count(*) filter (where reserve_percent >= 3 and reserve_percent < 5),
      '5To10', count(*) filter (where reserve_percent >= 5 and reserve_percent < 10),
      'over10', count(*) filter (where reserve_percent >= 10)
    ) value from pairs
  ), percentiles as (
    select jsonb_build_object(
      'p25', percentile_cont(0.25) within group (order by reserve_percent),
      'p50', percentile_cont(0.50) within group (order by reserve_percent),
      'p75', percentile_cont(0.75) within group (order by reserve_percent),
      'p90', percentile_cont(0.90) within group (order by reserve_percent),
      'p95', percentile_cont(0.95) within group (order by reserve_percent),
      'max', max(reserve_percent)
    ) value from pairs where reserve_percent > 0
  ), support as (
    select jsonb_build_object(
      'gte0_1', count(*) filter (where reserve_percent >= 0.1),
      'gte0_25', count(*) filter (where reserve_percent >= 0.25),
      'gte0_5', count(*) filter (where reserve_percent >= 0.5),
      'gte0_8', count(*) filter (where reserve_percent >= 0.8),
      'gte1', count(*) filter (where reserve_percent >= 1),
      'gte1_5', count(*) filter (where reserve_percent >= 1.5),
      'gte2', count(*) filter (where reserve_percent >= 2),
      'gte3', count(*) filter (where reserve_percent >= 3)
    ) value from pairs where reserve_percent > 0
  ), status_breakdown as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'companyStatus', company_status, 'priceTypeRef', price_type_ref,
      'companyCount', company_count, 'totalPairs', total_pairs,
      'positiveReserve', positive_reserve,
      'medianReservePercent', median_reserve, 'p90ReservePercent', p90_reserve,
      'supportGte1Percent', support_gte1_percent,
      'supportGte2Percent', support_gte2_percent
    ) order by price_type_ref), '[]'::jsonb) value
    from (select company_status, price_type_ref, count(distinct company_id) company_count,
      count(*) total_pairs,
      count(*) filter (where reserve_percent > 0) positive_reserve,
      percentile_cont(0.5) within group (order by reserve_percent)
        filter (where reserve_percent > 0) median_reserve,
      percentile_cont(0.9) within group (order by reserve_percent)
        filter (where reserve_percent > 0) p90_reserve,
      round(100 * count(*) filter (where reserve_percent >= 1)
        / nullif(count(*) filter (where reserve_percent > 0), 0), 4) support_gte1_percent,
      round(100 * count(*) filter (where reserve_percent >= 2)
        / nullif(count(*) filter (where reserve_percent > 0), 0), 4) support_gte2_percent
      from pairs group by company_status, price_type_ref) grouped
  ), category_breakdown as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'category', category_name, 'totalPairs', total_pairs,
      'positiveReserve', positive_reserve, 'medianReservePercent', median_reserve,
      'p90ReservePercent', p90_reserve
    ) order by total_pairs desc, category_name), '[]'::jsonb) value
    from (select coalesce(top_category_name, 'UNMAPPED') category_name,
      count(*) total_pairs, count(*) filter (where reserve_percent > 0) positive_reserve,
      percentile_cont(0.5) within group (order by reserve_percent)
        filter (where reserve_percent > 0) median_reserve,
      percentile_cont(0.9) within group (order by reserve_percent)
        filter (where reserve_percent > 0) p90_reserve
      from pairs group by coalesce(top_category_name, 'UNMAPPED')) grouped
  ), brand_breakdown as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'brand', brand_name, 'totalPairs', total_pairs,
      'positiveReserve', positive_reserve
    ) order by total_pairs desc, brand_name), '[]'::jsonb) value
    from (select brand_name, count(*) total_pairs,
      count(*) filter (where reserve_percent > 0) positive_reserve
      from pairs where brand_name is not null group by brand_name) grouped
  )
  select jsonb_build_object(
    'executionMode', 'DRY_RUN', 'active', false,
    'totalPairs', overview.total_pairs, 'companyCount', overview.company_count,
    'productCount', overview.product_count, 'missingBase', overview.missing_base,
    'missingStop', overview.missing_stop, 'currencyMismatch', overview.currency_mismatch,
    'noReserve', overview.no_reserve, 'positiveReserve', overview.positive_reserve,
    'distribution', distribution.value, 'percentiles', percentiles.value,
    'support', support.value, 'statusPriceTypeBreakdown', status_breakdown.value,
    'categoryBreakdown', category_breakdown.value,
    'brandBreakdown', brand_breakdown.value,
    'brandAnalysisUseful', jsonb_array_length(brand_breakdown.value) > 0,
    'anomalies', jsonb_build_object('stopAboveBase', overview.stop_above_base,
      'stopEqualsBase', overview.stop_equals_base)
  ), overview.max_source_synced_at into result, source_synced
  from overview cross join distribution cross join percentiles cross join support
    cross join status_breakdown cross join category_breakdown cross join brand_breakdown;

  insert into private.sduc_calibration_state (singleton_key, generated_at, source_price_synced_at, summary)
  values (1, generated, source_synced, coalesce(result, '{}'::jsonb))
  on conflict (singleton_key) do update set generated_at = excluded.generated_at,
    source_price_synced_at = excluded.source_price_synced_at, summary = excluded.summary;
  return result;
end;
$$;

revoke all on function private.refresh_sduc_calibration()
  from public, anon, authenticated;
grant execute on function private.refresh_sduc_calibration() to service_role;

create function public.refresh_sduc_calibration()
returns jsonb language sql security definer
set search_path = '' set row_security = off
as $$ select private.refresh_sduc_calibration(); $$;
revoke all on function public.refresh_sduc_calibration() from public, anon, authenticated;
grant execute on function public.refresh_sduc_calibration() to service_role;

create function public.get_admin_sduc_readiness()
returns jsonb
language plpgsql stable security definer
set search_path = ''
set row_security = off
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.prices.view') then
    raise exception 'Admin SDUC readiness access denied.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'generatedAt', calibration.generated_at,
    'sourcePriceSyncedAt', calibration.source_price_synced_at,
    'mode', policy.execution_mode,
    'active', policy.decrease_authorization_enabled,
    'stopAuthorityStatus', case when exists (
      select 1 from public.price_types price_type
      where price_type.external_ref = policy.stop_price_type_ref
        and price_type.external_code = policy.stop_price_type_code
        and price_type.name = policy.stop_price_type_name
        and price_type.is_active and price_type.currency_status = 'resolved'
    ) then 'READY' else 'BLOCKED' end,
    'calibration', calibration.summary,
    'enabledMechanismCount', (select count(*) from private.sduc_mechanism_policies mechanism
      where mechanism.direction = 'DECREASE' and mechanism.enabled),
    'activeAuthorizationCount', (select count(*) from private.sduc_price_authorizations candidate
      where candidate.status = 'ACTIVE')
  ) into result
  from private.sduc_system_policy policy
  left join private.sduc_calibration_state calibration on calibration.singleton_key = policy.singleton_key
  where policy.singleton_key = 1;
  return result;
end;
$$;

revoke all on function public.get_admin_sduc_readiness() from public, anon;
grant execute on function public.get_admin_sduc_readiness() to authenticated, service_role;

comment on table private.sduc_system_policy is
  'SDUC execution gate. Seeded DRY_RUN, disabled, and without an invented commercial ceiling.';
comment on table private.sduc_price_authorizations is
  'Company/product-scoped single-transaction SDUC authorizations; never mutates authoritative base prices.';
comment on function public.get_sduc_decrease_evaluation_context(uuid, uuid, text) is
  'Service-role-only bounded SDUC base/STOP/policy context. Never callable by partner browsers.';
comment on function public.get_admin_sduc_readiness() is
  'Permission-gated aggregate SDUC readiness; excludes STOP, reserve, ceiling, and authorization detail.';

select private.refresh_sduc_calibration();

commit;
