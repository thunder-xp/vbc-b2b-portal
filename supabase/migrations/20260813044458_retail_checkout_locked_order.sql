-- Public Retail checkout boundary. The mutable anonymous cart is converted into
-- an immutable, token-scoped commercial snapshot. No payment or 1C work occurs.

alter table public.retail_cart_bundles
  add column calculator_input jsonb null
    check (calculator_input is null or jsonb_typeof(calculator_input) = 'object'),
  add column work_scope jsonb null
    check (work_scope is null or jsonb_typeof(work_scope) = 'array');

alter table public.retail_cart_items
  add column unit_code text not null default 'piece'
    check (unit_code in ('piece', 'meter', 'service'));

create sequence public.retail_order_number_seq;
revoke all on sequence public.retail_order_number_seq from public, anon, authenticated;
grant usage, select on sequence public.retail_order_number_seq to service_role;

create table public.retail_customers (
  id uuid primary key default gen_random_uuid(),
  normalized_phone_hash text not null check (normalized_phone_hash ~ '^[0-9a-f]{64}$'),
  normalized_email_hash text null check (normalized_email_hash is null or normalized_email_hash ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(name) between 2 and 160),
  phone text not null check (phone ~ '^\+373[0-9]{8}$'),
  email text null check (email is null or char_length(email) <= 254),
  processing_acknowledged_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index retail_customers_phone_hash_idx on public.retail_customers (normalized_phone_hash, created_at desc);
create index retail_customers_email_hash_idx on public.retail_customers (normalized_email_hash, created_at desc)
  where normalized_email_hash is not null;

create table public.retail_orders (
  id uuid primary key default gen_random_uuid(),
  public_number text not null unique check (public_number ~ '^R-[0-9]{4}-[0-9]{6}$'),
  source_cart_id uuid not null unique references public.retail_carts(id) on delete restrict,
  customer_id uuid not null references public.retail_customers(id) on delete restrict,
  submission_key uuid not null unique,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  checkout_fingerprint text not null check (checkout_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('draft', 'awaiting_payment')),
  locale text not null check (locale in ('ru', 'ro')),
  publication_id uuid not null references public.public_retail_publications(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  equipment_subtotal numeric(14,2) not null check (equipment_subtotal >= 0),
  materials_subtotal numeric(14,2) not null check (materials_subtotal >= 0),
  priced_scope_total numeric(14,2) not null check (priced_scope_total > 0),
  vat_presentation text not null check (vat_presentation in ('included', 'excluded', 'not_specified', 'mixed')),
  customer_snapshot jsonb not null check (jsonb_typeof(customer_snapshot) = 'object'),
  delivery_address_snapshot jsonb not null check (jsonb_typeof(delivery_address_snapshot) = 'object'),
  installation_address_snapshot jsonb null check (installation_address_snapshot is null or jsonb_typeof(installation_address_snapshot) = 'object'),
  installation_intent_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(installation_intent_snapshot) = 'array'),
  calculator_evidence_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(calculator_evidence_snapshot) = 'array'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now()
);
create index retail_orders_customer_idx on public.retail_orders (customer_id, created_at desc, id);
create index retail_orders_status_idx on public.retail_orders (status, created_at, id);

create table public.retail_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.retail_orders(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  public_product_id uuid not null,
  bundle_id uuid null,
  source text not null check (source in ('catalog', 'product_detail', 'cctv_calculator')),
  commercial_group text not null check (commercial_group in ('equipment', 'materials')),
  sku text not null,
  product_name text not null,
  slug_snapshot text not null,
  image_url_snapshot text null,
  quantity integer not null check (quantity between 1 and 20000),
  unit_code text not null check (unit_code in ('piece', 'meter', 'service')),
  unit_price numeric(14,2) not null check (unit_price > 0),
  line_total numeric(14,2) not null check (line_total > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  vat_presentation text not null check (vat_presentation in ('included', 'excluded', 'not_specified')),
  availability_snapshot text not null check (availability_snapshot in ('in_stock', 'low_stock', 'available_to_order', 'unknown')),
  created_at timestamptz not null default now(),
  unique (order_id, line_number)
);
create index retail_order_lines_order_idx on public.retail_order_lines (order_id, line_number);

create table public.retail_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.retail_orders(id) on delete restrict,
  event_type text not null check (event_type in ('retail_order_created', 'cart_converted', 'awaiting_payment')),
  safe_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_evidence) = 'object'),
  created_at timestamptz not null default now()
);
create index retail_order_events_order_idx on public.retail_order_events (order_id, created_at, id);

create table public.retail_order_access_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.retail_orders(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index retail_order_access_tokens_order_idx on public.retail_order_access_tokens (order_id, created_at desc);

alter table public.retail_customers enable row level security;
alter table public.retail_orders enable row level security;
alter table public.retail_order_lines enable row level security;
alter table public.retail_order_events enable row level security;
alter table public.retail_order_access_tokens enable row level security;

revoke all on public.retail_customers, public.retail_orders, public.retail_order_lines,
  public.retail_order_events, public.retail_order_access_tokens from public, anon, authenticated;
grant select, insert, update on public.retail_customers, public.retail_orders,
  public.retail_order_access_tokens to service_role;
grant select, insert on public.retail_order_lines, public.retail_order_events to service_role;

create or replace function public.prevent_retail_order_line_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Retail order lines are immutable.' using errcode = '42501';
end;
$$;
create trigger prevent_retail_order_line_mutation
before update or delete on public.retail_order_lines
for each row execute function public.prevent_retail_order_line_mutation();

create or replace function public.prevent_retail_order_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Retail order events are append-only.' using errcode = '42501';
end;
$$;
create trigger prevent_retail_order_event_mutation
before update or delete on public.retail_order_events
for each row execute function public.prevent_retail_order_event_mutation();

create or replace function public.prevent_retail_order_commercial_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.public_number <> old.public_number
    or new.source_cart_id <> old.source_cart_id
    or new.customer_id <> old.customer_id
    or new.submission_key <> old.submission_key
    or new.request_fingerprint <> old.request_fingerprint
    or new.checkout_fingerprint <> old.checkout_fingerprint
    or new.locale <> old.locale
    or new.publication_id <> old.publication_id
    or new.currency <> old.currency
    or new.equipment_subtotal <> old.equipment_subtotal
    or new.materials_subtotal <> old.materials_subtotal
    or new.priced_scope_total <> old.priced_scope_total
    or new.vat_presentation <> old.vat_presentation
    or new.customer_snapshot <> old.customer_snapshot
    or new.delivery_address_snapshot <> old.delivery_address_snapshot
    or new.installation_address_snapshot is distinct from old.installation_address_snapshot
    or new.installation_intent_snapshot <> old.installation_intent_snapshot
    or new.calculator_evidence_snapshot <> old.calculator_evidence_snapshot
    or new.created_at <> old.created_at then
    raise exception 'Retail order commercial snapshot is immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger prevent_retail_order_commercial_mutation
before update on public.retail_orders
for each row execute function public.prevent_retail_order_commercial_mutation();

create or replace function public.retail_checkout_snapshot(p_cart_id uuid, p_locale text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_locale not in ('ru', 'ro') then
    raise exception 'Invalid checkout locale.' using errcode = '22023';
  end if;

  with publication as (
    select id from public.public_retail_publications where status = 'published'
  ), cart as (
    select * from public.retail_carts where id = p_cart_id
  ), enriched as (
    select item.*, product.slug, product.sku,
      product.name_ru, product.name_ro, product.primary_image_url,
      product.retail_price_amount, product.retail_price_currency,
      product.vat_presentation, product.availability,
      product.public_id is null as missing
    from public.retail_cart_items item
    left join publication on true
    left join public.public_retail_products product
      on product.publication_id = publication.id and product.public_id = item.public_product_id
    where item.cart_id = p_cart_id
  ), state as (
    select count(*) line_count,
      count(*) filter (where missing) missing_count,
      count(*) filter (where availability = 'unavailable') unavailable_count,
      count(distinct retail_price_currency) filter (where not missing) currency_count,
      bool_or(retail_price_amount <> observed_price_amount or retail_price_currency <> observed_currency)
        filter (where not missing) as price_changed
    from enriched
  ), lines as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'publicProductId', public_product_id,
      'bundleId', bundle_id,
      'source', source,
      'commercialGroup', commercial_group,
      'slug', slug,
      'sku', sku,
      'name', case when p_locale = 'ro' then coalesce(name_ro, name_ru) else name_ru end,
      'imageUrl', primary_image_url,
      'quantity', quantity,
      'unitCode', unit_code,
      'unitPrice', retail_price_amount,
      'lineTotal', retail_price_amount * quantity,
      'currency', retail_price_currency,
      'vatPresentation', vat_presentation,
      'availability', availability,
      'priceChanged', not missing and (retail_price_amount <> observed_price_amount or retail_price_currency <> observed_currency),
      'missing', missing
    ) order by created_at, id) filter (where not missing), '[]'::jsonb) value from enriched
  ), bundles as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'source', source, 'calculatorVersion', calculator_version,
      'installationIntent', installation_intent, 'calculatorInput', calculator_input,
      'workScope', work_scope
    ) order by created_at, id), '[]'::jsonb) value
    from public.retail_cart_bundles where cart_id = p_cart_id
  ), commercial as (
    select coalesce(sum(retail_price_amount * quantity) filter (where commercial_group = 'equipment' and not missing), 0) equipment,
      coalesce(sum(retail_price_amount * quantity) filter (where commercial_group = 'materials' and not missing), 0) materials,
      min(retail_price_currency) filter (where not missing) currency,
      case when count(distinct vat_presentation) filter (where not missing) = 1
        then min(vat_presentation) filter (where not missing) else 'mixed' end vat
    from enriched
  ), fingerprint_source as (
    select jsonb_build_object(
      'cartRevision', (select revision from cart),
      'publicationId', (select id from publication),
      'lines', (select coalesce(jsonb_agg(jsonb_build_object(
        'publicProductId', public_product_id, 'bundleId', bundle_id,
        'commercialGroup', commercial_group, 'quantity', quantity, 'unitCode', unit_code,
        'price', retail_price_amount, 'currency', retail_price_currency,
        'vat', vat_presentation, 'availability', availability
      ) order by created_at, id), '[]'::jsonb) from enriched),
      'bundles', (select value from bundles)
    ) value
  )
  select jsonb_build_object(
    'cartRevision', cart.revision,
    'publicationId', publication.id,
    'eligible', state.line_count > 0 and state.missing_count = 0
      and state.unavailable_count = 0 and state.currency_count = 1,
    'blockingReason', case
      when state.line_count = 0 then 'empty_cart'
      when state.missing_count > 0 then 'unpublished_product'
      when state.unavailable_count > 0 then 'unavailable_product'
      when state.currency_count <> 1 then 'currency_conflict'
      else null end,
    'priceChanged', coalesce(state.price_changed, false),
    'fingerprint', encode(extensions.digest(convert_to(fingerprint_source.value::text, 'UTF8'), 'sha256'), 'hex'),
    'lines', lines.value,
    'bundles', bundles.value,
    'totals', jsonb_build_object('equipment', commercial.equipment, 'materials', commercial.materials,
      'total', commercial.equipment + commercial.materials, 'currency', commercial.currency,
      'vatPresentation', commercial.vat)
  ) into result
  from cart cross join publication cross join state cross join lines cross join bundles cross join commercial cross join fingerprint_source;
  return result;
end;
$$;

create or replace function public.get_public_retail_checkout(p_token_hash text, p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare target_cart_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_locale not in ('ru', 'ro') then return null; end if;
  select id into target_cart_id from public.retail_carts
    where token_hash = p_token_hash and status = 'active' and expires_at > now();
  if target_cart_id is null then return null; end if;
  return public.retail_checkout_snapshot(target_cart_id, p_locale);
end;
$$;

create or replace function public.create_public_retail_order(
  p_token_hash text,
  p_locale text,
  p_checkout_fingerprint text,
  p_submission_key uuid,
  p_request_fingerprint text,
  p_access_token_hash text,
  p_customer jsonb,
  p_delivery_address jsonb,
  p_installation_address jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_cart public.retail_carts;
  existing_order public.retail_orders;
  snapshot jsonb;
  target_customer_id uuid;
  target_order_id uuid;
  target_public_number text;
  target_access_expires_at timestamptz := now() + interval '180 days';
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_access_token_hash !~ '^[0-9a-f]{64}$'
    or p_checkout_fingerprint !~ '^[0-9a-f]{64}$' or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_locale not in ('ru', 'ro')
    or jsonb_typeof(p_customer) <> 'object' or jsonb_typeof(p_delivery_address) <> 'object'
    or (p_installation_address is not null and jsonb_typeof(p_installation_address) <> 'object') then
    raise exception 'Invalid retail checkout command.' using errcode = '22023';
  end if;
  if trim(coalesce(p_customer->>'name', '')) = '' or char_length(trim(p_customer->>'name')) > 160
    or not p_customer ?& array['name','phone','email','processingAcknowledged']
    or (select count(*) from jsonb_object_keys(p_customer)) <> 4
    or coalesce(p_customer->>'phone', '') !~ '^\+373[0-9]{8}$'
    or (nullif(trim(coalesce(p_customer->>'email', '')), '') is not null
      and (char_length(trim(p_customer->>'email')) > 254 or trim(p_customer->>'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    or coalesce((p_customer->>'processingAcknowledged')::boolean, false) is not true
    or not p_delivery_address ?& array['locality','street','building','unit','postalCode','instructions']
    or (select count(*) from jsonb_object_keys(p_delivery_address)) <> 6
    or trim(coalesce(p_delivery_address->>'locality', '')) = ''
    or char_length(trim(p_delivery_address->>'locality')) > 120
    or trim(coalesce(p_delivery_address->>'street', '')) = ''
    or char_length(trim(p_delivery_address->>'street')) > 160
    or trim(coalesce(p_delivery_address->>'building', '')) = ''
    or char_length(trim(p_delivery_address->>'building')) > 40
    or char_length(coalesce(p_delivery_address->>'unit', '')) > 80
    or char_length(coalesce(p_delivery_address->>'postalCode', '')) > 20
    or char_length(coalesce(p_delivery_address->>'instructions', '')) > 500
    or (p_installation_address is not null and (
      not p_installation_address ?& array['locality','street','building','unit','postalCode','instructions']
      or (select count(*) from jsonb_object_keys(p_installation_address)) <> 6
      or trim(coalesce(p_installation_address->>'locality', '')) = ''
      or char_length(trim(p_installation_address->>'locality')) > 120
      or trim(coalesce(p_installation_address->>'street', '')) = ''
      or char_length(trim(p_installation_address->>'street')) > 160
      or trim(coalesce(p_installation_address->>'building', '')) = ''
      or char_length(trim(p_installation_address->>'building')) > 40
      or char_length(coalesce(p_installation_address->>'unit', '')) > 80
      or char_length(coalesce(p_installation_address->>'postalCode', '')) > 20
      or char_length(coalesce(p_installation_address->>'instructions', '')) > 500
    )) then
    raise exception 'Invalid retail customer data.' using errcode = '22023';
  end if;

  select * into existing_order from public.retail_orders where submission_key = p_submission_key;
  if existing_order.id is not null then
    if existing_order.request_fingerprint <> p_request_fingerprint
      or not exists(select 1 from public.retail_order_access_tokens token
        where token.order_id = existing_order.id and token.token_hash = p_access_token_hash) then
      raise exception 'Idempotency conflict.' using errcode = '23505';
    end if;
    return jsonb_build_object('orderNumber', existing_order.public_number, 'status', existing_order.status,
      'repeated', true, 'accessExpiresAt', (select expires_at from public.retail_order_access_tokens where order_id = existing_order.id order by created_at desc limit 1));
  end if;

  select * into target_cart from public.retail_carts
    where token_hash = p_token_hash and expires_at > now() for update;
  if target_cart.id is null then raise exception 'Cart unavailable.' using errcode = '28000'; end if;

  select * into existing_order from public.retail_orders where source_cart_id = target_cart.id;
  if existing_order.id is not null then
    if existing_order.request_fingerprint <> p_request_fingerprint
      or not exists(select 1 from public.retail_order_access_tokens token
        where token.order_id = existing_order.id and token.token_hash = p_access_token_hash) then
      raise exception 'Cart already converted.' using errcode = '40001';
    end if;
    return jsonb_build_object('orderNumber', existing_order.public_number, 'status', existing_order.status,
      'repeated', true, 'accessExpiresAt', (select expires_at from public.retail_order_access_tokens where order_id = existing_order.id order by created_at desc limit 1));
  end if;
  if target_cart.status <> 'active' then raise exception 'Cart unavailable.' using errcode = '28000'; end if;

  snapshot := public.retail_checkout_snapshot(target_cart.id, p_locale);
  if snapshot is null or not coalesce((snapshot->>'eligible')::boolean, false) then
    raise exception 'Cart is not eligible for checkout.' using errcode = 'P0002', detail = coalesce(snapshot->>'blockingReason', 'unknown');
  end if;
  if snapshot->>'fingerprint' <> p_checkout_fingerprint then
    raise exception 'Checkout state changed.' using errcode = '40001';
  end if;
  if p_installation_address is not null and not exists (
    select 1 from jsonb_array_elements(snapshot->'bundles') bundle,
      lateral jsonb_each(coalesce(bundle->'installationIntent', '{}'::jsonb)) intent
    where jsonb_typeof(intent.value) = 'boolean' and (intent.value)::boolean
  ) then
    raise exception 'Installation address is not applicable.' using errcode = '22023';
  end if;

  insert into public.retail_customers(normalized_phone_hash, normalized_email_hash, name, phone, email, processing_acknowledged_at)
  values (
    encode(extensions.digest(convert_to(lower(p_customer->>'phone'), 'UTF8'), 'sha256'), 'hex'),
    case when nullif(trim(coalesce(p_customer->>'email', '')), '') is null then null
      else encode(extensions.digest(convert_to(lower(trim(p_customer->>'email')), 'UTF8'), 'sha256'), 'hex') end,
    trim(p_customer->>'name'), p_customer->>'phone', nullif(lower(trim(coalesce(p_customer->>'email', ''))), ''), now()
  ) returning id into target_customer_id;

  target_public_number := 'R-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.retail_order_number_seq')::text, 6, '0');
  insert into public.retail_orders(
    public_number, source_cart_id, customer_id, submission_key, request_fingerprint, checkout_fingerprint,
    status, locale, publication_id, currency, equipment_subtotal, materials_subtotal, priced_scope_total,
    vat_presentation, customer_snapshot, delivery_address_snapshot, installation_address_snapshot,
    installation_intent_snapshot, calculator_evidence_snapshot
  ) values (
    target_public_number, target_cart.id, target_customer_id, p_submission_key, p_request_fingerprint, p_checkout_fingerprint,
    'awaiting_payment', p_locale, (snapshot->>'publicationId')::uuid, snapshot#>>'{totals,currency}',
    (snapshot#>>'{totals,equipment}')::numeric, (snapshot#>>'{totals,materials}')::numeric,
    (snapshot#>>'{totals,total}')::numeric, snapshot#>>'{totals,vatPresentation}',
    p_customer - 'processingAcknowledged', p_delivery_address, p_installation_address,
    coalesce((select jsonb_agg(jsonb_build_object('bundleId', bundle->>'id', 'intent', bundle->'installationIntent', 'workScope', bundle->'workScope'))
      from jsonb_array_elements(snapshot->'bundles') bundle where bundle->'installationIntent' is not null), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('bundleId', bundle->>'id', 'source', bundle->>'source',
      'calculatorVersion', bundle->>'calculatorVersion', 'calculatorInput', bundle->'calculatorInput'))
      from jsonb_array_elements(snapshot->'bundles') bundle), '[]'::jsonb)
  ) returning id into target_order_id;

  insert into public.retail_order_lines(order_id, line_number, public_product_id, bundle_id, source,
    commercial_group, sku, product_name, slug_snapshot, image_url_snapshot, quantity, unit_code,
    unit_price, line_total, currency, vat_presentation, availability_snapshot)
  select target_order_id, row_number() over (order by position), (line->>'publicProductId')::uuid,
    nullif(line->>'bundleId', '')::uuid, line->>'source', line->>'commercialGroup', line->>'sku',
    line->>'name', line->>'slug', nullif(line->>'imageUrl', ''), (line->>'quantity')::integer,
    line->>'unitCode', (line->>'unitPrice')::numeric, (line->>'lineTotal')::numeric,
    line->>'currency', line->>'vatPresentation', line->>'availability'
  from jsonb_array_elements(snapshot->'lines') with ordinality as source(line, position)
  order by position;

  insert into public.retail_order_access_tokens(order_id, token_hash, expires_at)
    values (target_order_id, p_access_token_hash, target_access_expires_at);
  insert into public.retail_order_events(order_id, event_type, safe_evidence) values
    (target_order_id, 'retail_order_created', jsonb_build_object('lineCount', jsonb_array_length(snapshot->'lines'), 'locale', p_locale)),
    (target_order_id, 'cart_converted', jsonb_build_object('cartRevision', target_cart.revision)),
    (target_order_id, 'awaiting_payment', jsonb_build_object('paymentInitiated', false));
  update public.retail_carts set status = 'converted', revision = revision + 1,
    last_activity_at = now(), updated_at = now() where id = target_cart.id;

  return jsonb_build_object('orderNumber', target_public_number, 'status', 'awaiting_payment',
    'repeated', false, 'accessExpiresAt', target_access_expires_at);
end;
$$;

create or replace function public.get_public_retail_order(p_access_token_hash text, p_locale text default 'ru')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_access_token_hash !~ '^[0-9a-f]{64}$' or p_locale not in ('ru', 'ro') then return null; end if;
  select jsonb_build_object(
    'orderNumber', orders.public_number, 'status', orders.status, 'createdAt', orders.created_at,
    'locale', orders.locale, 'customer', orders.customer_snapshot,
    'deliveryAddress', orders.delivery_address_snapshot,
    'installationAddress', orders.installation_address_snapshot,
    'installationIntent', orders.installation_intent_snapshot,
    'calculatorEvidence', orders.calculator_evidence_snapshot,
    'totals', jsonb_build_object('equipment', orders.equipment_subtotal, 'materials', orders.materials_subtotal,
      'total', orders.priced_scope_total, 'currency', orders.currency, 'vatPresentation', orders.vat_presentation),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
      'lineNumber', line.line_number, 'publicProductId', line.public_product_id, 'source', line.source,
      'commercialGroup', line.commercial_group, 'sku', line.sku, 'name', line.product_name,
      'slug', line.slug_snapshot, 'imageUrl', line.image_url_snapshot, 'quantity', line.quantity,
      'unitCode', line.unit_code, 'unitPrice', line.unit_price, 'lineTotal', line.line_total,
      'currency', line.currency, 'vatPresentation', line.vat_presentation,
      'availability', line.availability_snapshot
    ) order by line.line_number) from public.retail_order_lines line where line.order_id = orders.id), '[]'::jsonb)
  ) into result
  from public.retail_order_access_tokens token
  join public.retail_orders orders on orders.id = token.order_id
  where token.token_hash = p_access_token_hash and token.revoked_at is null and token.expires_at > now();
  return result;
end;
$$;

-- V2 preserves calculator evidence and units while the existing RPC remains
-- available for carts created by the already deployed calculator client.
create or replace function public.add_public_retail_cart_cctv_bundle_v2(
  p_token_hash text, p_items jsonb, p_installation_intent jsonb, p_calculator_input jsonb,
  p_work_scope jsonb, p_request_id uuid, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare target_cart_id uuid; target_bundle_id uuid; previous public.retail_cart_requests;
  response jsonb; requested_count integer; resolved_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_installation_intent is not null and jsonb_typeof(p_installation_intent) <> 'object')
    or (p_calculator_input is not null and jsonb_typeof(p_calculator_input) <> 'object')
    or (p_work_scope is not null and (jsonb_typeof(p_work_scope) <> 'array' or jsonb_array_length(p_work_scope) > 20)) then
    raise exception 'Invalid bundle command.' using errcode = '22023';
  end if;
  if p_installation_intent is not null and (
    not p_installation_intent ?& array['cameraInstallation','cableLaying','commissioning','remoteViewing']
    or (select count(*) from jsonb_object_keys(p_installation_intent)) <> 4
    or jsonb_typeof(p_installation_intent->'cameraInstallation') <> 'boolean'
    or jsonb_typeof(p_installation_intent->'cableLaying') <> 'boolean'
    or jsonb_typeof(p_installation_intent->'commissioning') <> 'boolean'
    or jsonb_typeof(p_installation_intent->'remoteViewing') <> 'boolean') then
    raise exception 'Invalid installation intent.' using errcode = '22023';
  end if;
  target_cart_id := public.ensure_active_retail_cart(p_token_hash);
  select * into previous from public.retail_cart_requests request
    where request.cart_id = target_cart_id and request.request_id = p_request_id;
  if previous.cart_id is not null then
    if previous.fingerprint <> p_fingerprint then raise exception 'Idempotency conflict.' using errcode = '23505'; end if;
    return previous.response;
  end if;
  with requested as (
    select public_product_id, commercial_group, unit_code, sum(quantity)::integer quantity
    from jsonb_to_recordset(p_items) as x(public_product_id uuid, quantity integer, commercial_group text, unit_code text)
    group by 1,2,3
  ) select count(*) into requested_count from requested
    where quantity between 1 and 20000 and commercial_group in ('equipment','materials')
      and unit_code in ('piece','meter','service');
  if requested_count = 0 or requested_count <> jsonb_array_length(p_items) then
    raise exception 'Invalid bundle items.' using errcode = '22023';
  end if;
  with requested as (select distinct public_product_id from jsonb_to_recordset(p_items) as x(public_product_id uuid))
  select count(*) into resolved_count from requested
  join public.public_retail_products product on product.public_id = requested.public_product_id
  join public.public_retail_publications publication on publication.id = product.publication_id and publication.status = 'published';
  if resolved_count <> (select count(distinct public_product_id) from jsonb_to_recordset(p_items) as x(public_product_id uuid)) then
    raise exception 'Calculator configuration changed.' using errcode = 'P0002';
  end if;
  insert into public.retail_cart_bundles(cart_id, source, installation_intent, calculator_input, work_scope)
    values(target_cart_id, 'cctv_calculator', p_installation_intent, p_calculator_input, p_work_scope)
    returning id into target_bundle_id;
  with requested as (
    select public_product_id, commercial_group, unit_code, sum(quantity)::integer quantity
    from jsonb_to_recordset(p_items) as x(public_product_id uuid, quantity integer, commercial_group text, unit_code text)
    group by 1,2,3
  ), current_products as (
    select product.* from public.public_retail_products product
    join public.public_retail_publications publication on publication.id = product.publication_id and publication.status = 'published'
  ) insert into public.retail_cart_items(cart_id, bundle_id, public_product_id, source, commercial_group,
      quantity, unit_code, observed_price_amount, observed_currency, snapshot_slug, snapshot_sku,
      snapshot_name_ru, snapshot_name_ro, snapshot_image_url)
    select target_cart_id, target_bundle_id, product.public_id, 'cctv_calculator', requested.commercial_group,
      requested.quantity, requested.unit_code, product.retail_price_amount, product.retail_price_currency,
      product.slug, product.sku, product.name_ru, product.name_ro, product.primary_image_url
    from requested join current_products product on product.public_id = requested.public_product_id;
  update public.retail_carts set revision = revision + 1, last_activity_at = now(), updated_at = now()
    where id = target_cart_id;
  response := public.retail_cart_mutation_result(target_cart_id, false, target_bundle_id);
  insert into public.retail_cart_requests values(target_cart_id, p_request_id, 'add_cctv_bundle', p_fingerprint, response, now());
  return response;
end;
$$;

revoke all on function public.prevent_retail_order_line_mutation(),
  public.prevent_retail_order_event_mutation(), public.prevent_retail_order_commercial_mutation(),
  public.retail_checkout_snapshot(uuid,text) from public, anon, authenticated;
revoke all on function public.get_public_retail_checkout(text,text),
  public.create_public_retail_order(text,text,text,uuid,text,text,jsonb,jsonb,jsonb),
  public.get_public_retail_order(text,text),
  public.add_public_retail_cart_cctv_bundle_v2(text,jsonb,jsonb,jsonb,jsonb,uuid,text)
  from public, authenticated;
grant execute on function public.get_public_retail_checkout(text,text),
  public.create_public_retail_order(text,text,text,uuid,text,text,jsonb,jsonb,jsonb),
  public.get_public_retail_order(text,text),
  public.add_public_retail_cart_cctv_bundle_v2(text,jsonb,jsonb,jsonb,jsonb,uuid,text)
  to anon, service_role;
