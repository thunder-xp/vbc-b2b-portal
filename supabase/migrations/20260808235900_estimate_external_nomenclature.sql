-- Idempotent estimate creation and a shared, non-1C external nomenclature library.

alter table public.estimates
  add column if not exists creation_request_key uuid null;

create unique index if not exists estimates_creator_creation_request_unique
  on public.estimates(created_by, creation_request_key)
  where creation_request_key is not null;

create table public.external_nomenclature_items (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null,
  model text not null,
  name text not null,
  category text null,
  unit text not null default 'pcs',
  specification text null,
  normalized_manufacturer text not null,
  normalized_model text not null,
  normalized_name text not null,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_by_company_id uuid not null references public.partner_companies(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_nomenclature_manufacturer_check check (char_length(btrim(manufacturer)) between 1 and 120),
  constraint external_nomenclature_model_check check (char_length(btrim(model)) between 1 and 160),
  constraint external_nomenclature_name_check check (char_length(btrim(name)) between 1 and 300),
  constraint external_nomenclature_category_check check (category is null or char_length(category) <= 160),
  constraint external_nomenclature_specification_check check (specification is null or char_length(specification) <= 2000),
  constraint external_nomenclature_unit_check check (unit in ('pcs', 'hour', 'meter', 'set', 'visit', 'service')),
  constraint external_nomenclature_normalized_check check (
    normalized_manufacturer <> '' and normalized_model <> '' and normalized_name <> ''
  )
);

comment on table public.external_nomenclature_items is
  'Partner-entered shared nomenclature. It is not a 1C or Novotech catalog product and must never be exported as one.';

create trigger set_external_nomenclature_items_updated_at
before update on public.external_nomenclature_items
for each row execute function public.set_updated_at();

create index external_nomenclature_identity_idx
  on public.external_nomenclature_items(normalized_manufacturer, normalized_model)
  where is_active;
create index external_nomenclature_search_idx
  on public.external_nomenclature_items using gin
  ((normalized_manufacturer || ' ' || normalized_model || ' ' || normalized_name) extensions.gin_trgm_ops)
  where is_active;

alter table public.estimate_items
  add column if not exists external_nomenclature_id uuid null
    references public.external_nomenclature_items(id) on delete restrict;

alter table public.estimate_items drop constraint if exists estimate_items_line_type_check;
alter table public.estimate_items add constraint estimate_items_line_type_check
  check (line_type in ('product', 'service', 'custom', 'external'));
alter table public.estimate_items drop constraint if exists estimate_items_product_shape_check;
alter table public.estimate_items add constraint estimate_items_product_shape_check check (
  (line_type = 'product' and product_id is not null and service_id is null and external_nomenclature_id is null and sku_snapshot is not null and product_name_snapshot is not null)
  or (line_type = 'service' and product_id is null and external_nomenclature_id is null)
  or (line_type = 'custom' and product_id is null and service_id is null and external_nomenclature_id is null)
  or (line_type = 'external' and product_id is null and service_id is null and external_nomenclature_id is not null and sku_snapshot is null)
);

create index estimate_items_external_nomenclature_idx
  on public.estimate_items(external_nomenclature_id)
  where external_nomenclature_id is not null;

create table public.estimate_external_item_requests (
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  request_key uuid not null,
  request_fingerprint text not null,
  estimate_item_id uuid not null references public.estimate_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (estimate_id, request_key),
  constraint estimate_external_item_request_fingerprint_check check (char_length(request_fingerprint) = 64)
);

alter table public.external_nomenclature_items enable row level security;
alter table public.estimate_external_item_requests enable row level security;
revoke all on table public.external_nomenclature_items, public.estimate_external_item_requests from public, anon, authenticated;

create or replace function public.normalize_external_nomenclature_text(input text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select lower(regexp_replace(btrim(input), '[^[:alnum:]]+', '', 'g'));
$$;

revoke all on function public.normalize_external_nomenclature_text(text) from public, anon, authenticated;

create or replace function public.create_estimate_v2(
  target_company_id uuid,
  estimate_name text,
  target_customer_name text,
  target_project_name text,
  target_currency_code text,
  target_validity_days integer,
  target_request_key uuid
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.estimates;
begin
  if target_request_key is null then
    raise exception 'Estimate request key is required.' using errcode = '22023';
  end if;
  if not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.price_types price_type
    where price_type.is_active = true
      and price_type.currency_status = 'resolved'
      and price_type.currency_code = target_currency_code
  ) then
    raise exception 'Estimate currency is not available.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || target_request_key::text, 0)
  );

  select * into created
  from public.estimates
  where created_by = auth.uid() and creation_request_key = target_request_key;

  if created.id is not null then
    if created.company_id <> target_company_id
      or created.name <> estimate_name
      or created.currency_code <> target_currency_code
      or created.validity_days <> target_validity_days
      or coalesce(created.customer_name, '') <> coalesce(nullif(target_customer_name, ''), '')
      or coalesce(created.project_name, '') <> coalesce(nullif(target_project_name, ''), '')
    then
      raise exception 'Estimate request key was reused with different data.' using errcode = '22023';
    end if;
    return created;
  end if;

  insert into public.estimates (
    company_id, created_by, name, customer_name, project_name, currency_code,
    validity_days, creation_request_key
  ) values (
    target_company_id, auth.uid(), estimate_name, nullif(target_customer_name, ''),
    nullif(target_project_name, ''), target_currency_code, target_validity_days,
    target_request_key
  )
  returning * into created;

  insert into public.estimate_sections (estimate_id, name, sort_order)
  values (created.id, 'Оборудование и услуги', 0);
  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (created.id, auth.uid(), 'created');
  return created;
end;
$$;

revoke all on function public.create_estimate_v2(uuid, text, text, text, text, integer, uuid) from public, anon;
grant execute on function public.create_estimate_v2(uuid, text, text, text, text, integer, uuid) to authenticated;

create or replace function public.search_external_nomenclature(
  search_query text,
  result_limit integer default 8
)
returns table (
  id uuid,
  manufacturer text,
  model text,
  name text,
  category text,
  unit text,
  specification text,
  exact_identity_match boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text;
  bounded_limit integer := least(greatest(coalesce(result_limit, 8), 1), 12);
begin
  if auth.uid() is null or not exists (
    select 1 from public.company_memberships membership
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and public.can_access_estimates(membership.company_id, 'estimates.view')
  ) then
    raise exception 'External nomenclature is not available.' using errcode = '42501';
  end if;
  normalized_query := public.normalize_external_nomenclature_text(coalesce(search_query, ''));
  if char_length(normalized_query) < 2 then return; end if;

  return query
  select item.id, item.manufacturer, item.model, item.name, item.category, item.unit,
    item.specification,
    (item.normalized_manufacturer || item.normalized_model = normalized_query) as exact_identity_match
  from public.external_nomenclature_items item
  where item.is_active
    and (
      item.normalized_manufacturer like '%' || normalized_query || '%'
      or item.normalized_model like '%' || normalized_query || '%'
      or item.normalized_name like '%' || normalized_query || '%'
      or (item.normalized_manufacturer || item.normalized_model) = normalized_query
    )
  order by
    ((item.normalized_manufacturer || item.normalized_model) = normalized_query) desc,
    extensions.similarity(item.normalized_manufacturer || ' ' || item.normalized_model || ' ' || item.normalized_name, normalized_query) desc,
    item.name, item.id
  limit bounded_limit;
end;
$$;

revoke all on function public.search_external_nomenclature(text, integer) from public, anon;
grant execute on function public.search_external_nomenclature(text, integer) to authenticated;

create or replace function public.add_estimate_external_item(
  target_estimate_id uuid,
  expected_revision integer,
  target_request_key uuid,
  target_request_fingerprint text,
  existing_external_item_id uuid,
  target_manufacturer text,
  target_model text,
  target_name text,
  target_category text,
  target_unit text,
  target_specification text,
  target_quantity numeric,
  target_selling_unit_price numeric,
  force_create_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  external_item public.external_nomenclature_items;
  default_section_id uuid;
  next_position integer;
  created_line public.estimate_items;
  existing_request public.estimate_external_item_requests;
  normalized_manufacturer_value text;
  normalized_model_value text;
  normalized_name_value text;
begin
  if target_request_key is null or target_request_fingerprint is null or target_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'External item request is invalid.' using errcode = '22023';
  end if;
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft'
    or not public.can_access_estimates(target.company_id, 'estimates.manage')
    or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;

  select * into existing_request from public.estimate_external_item_requests
  where estimate_id = target.id and request_key = target_request_key;
  if existing_request.estimate_id is not null then
    if existing_request.request_fingerprint <> target_request_fingerprint then
      raise exception 'External item request key was reused with different data.' using errcode = '22023';
    end if;
    return jsonb_build_object('estimate_item_id', existing_request.estimate_item_id, 'repeated', true);
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;

  if existing_external_item_id is not null then
    select * into external_item from public.external_nomenclature_items
    where id = existing_external_item_id and is_active;
    if external_item.id is null then
      raise exception 'External nomenclature item was not found.' using errcode = 'P0002';
    end if;
  else
    if target_manufacturer is null or target_model is null or target_name is null then
      raise exception 'Manufacturer, model and name are required.' using errcode = '22023';
    end if;
    normalized_manufacturer_value := public.normalize_external_nomenclature_text(target_manufacturer);
    normalized_model_value := public.normalize_external_nomenclature_text(target_model);
    normalized_name_value := public.normalize_external_nomenclature_text(target_name);
    if normalized_manufacturer_value = '' or normalized_model_value = '' or normalized_name_value = '' then
      raise exception 'Manufacturer, model and name are required.' using errcode = '22023';
    end if;
    if not force_create_new and exists (
      select 1 from public.external_nomenclature_items item
      where item.is_active
        and item.normalized_manufacturer = normalized_manufacturer_value
        and item.normalized_model = normalized_model_value
    ) then
      raise exception 'A matching external nomenclature item already exists.' using errcode = '23505';
    end if;
    insert into public.external_nomenclature_items (
      manufacturer, model, name, category, unit, specification,
      normalized_manufacturer, normalized_model, normalized_name,
      created_by, created_by_company_id
    ) values (
      btrim(target_manufacturer), btrim(target_model), btrim(target_name), nullif(btrim(target_category), ''),
      target_unit, nullif(btrim(target_specification), ''), normalized_manufacturer_value,
      normalized_model_value, normalized_name_value, auth.uid(), target.company_id
    ) returning * into external_item;
  end if;

  select id into default_section_id from public.estimate_sections
  where estimate_id = target.id order by sort_order, id limit 1;
  select coalesce(max(position), 0) + 1 into next_position from public.estimate_items where estimate_id = target.id;
  insert into public.estimate_items (
    estimate_id, section_id, line_type, external_nomenclature_id, position,
    product_name_snapshot, description, quantity, unit, selling_unit_price
  ) values (
    target.id, default_section_id, 'external', external_item.id, next_position,
    external_item.name,
    concat_ws(' · ', external_item.manufacturer, external_item.model, external_item.name),
    target_quantity, external_item.unit, target_selling_unit_price
  ) returning * into created_line;

  insert into public.estimate_external_item_requests (
    estimate_id, request_key, request_fingerprint, estimate_item_id
  ) values (target.id, target_request_key, target_request_fingerprint, created_line.id);

  return jsonb_build_object(
    'estimate_item_id', created_line.id,
    'external_nomenclature_id', external_item.id,
    'repeated', false
  );
end;
$$;

revoke all on function public.add_estimate_external_item(uuid, integer, uuid, text, uuid, text, text, text, text, text, text, numeric, numeric, boolean) from public, anon;
grant execute on function public.add_estimate_external_item(uuid, integer, uuid, text, uuid, text, text, text, text, text, text, numeric, numeric, boolean) to authenticated;
