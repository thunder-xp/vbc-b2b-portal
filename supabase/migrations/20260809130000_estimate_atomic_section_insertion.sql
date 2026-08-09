create table public.estimate_line_insertions (
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  request_key uuid not null,
  request_fingerprint text not null,
  estimate_item_ids uuid[] not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (estimate_id, request_key),
  constraint estimate_line_insertions_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$')
);

comment on table public.estimate_line_insertions is
  'Private idempotency ledger for atomic section-aware catalog and service line insertion.';

alter table public.estimate_line_insertions enable row level security;
revoke all on table public.estimate_line_insertions from public, anon, authenticated;

create or replace function public.add_estimate_items_v2(
  target_estimate_id uuid,
  expected_revision integer,
  target_section_id uuid,
  target_request_key uuid,
  target_request_fingerprint text,
  line_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  prior public.estimate_line_insertions;
  starting_position integer;
  inserted_ids uuid[];
  inserted_count integer;
begin
  if target_request_key is null
     or target_request_fingerprint is null
     or target_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Estimate line request is invalid.' using errcode = '22023';
  end if;

  select * into target
  from public.estimates
  where id = target_estimate_id
  for update;

  if target.id is null or target.status <> 'draft'
     or not public.can_access_estimates(target.company_id, 'estimates.manage')
     or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || target.id::text || ':' || target_request_key::text, 0)
  );

  select * into prior
  from public.estimate_line_insertions
  where estimate_id = target.id and request_key = target_request_key;

  if prior.estimate_id is not null then
    if prior.created_by <> auth.uid()
       or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Estimate line request key was reused with different data.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'estimate_item_ids', to_jsonb(prior.estimate_item_ids),
      'repeated', true
    );
  end if;

  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.estimate_sections section
    where section.id = target_section_id and section.estimate_id = target.id
  ) then
    raise exception 'Estimate section is invalid.' using errcode = '22023';
  end if;
  if jsonb_typeof(line_items) <> 'array'
     or jsonb_array_length(line_items) < 1
     or jsonb_array_length(line_items) > 50 then
    raise exception 'Estimate line batch is invalid.' using errcode = '22023';
  end if;

  select coalesce(max(position), 0) into starting_position
  from public.estimate_items
  where estimate_id = target.id;

  with inserted as (
    insert into public.estimate_items (
      estimate_id, section_id, line_type, product_id, service_id, position,
      sku_snapshot, product_name_snapshot, source_unit_price, source_currency_code,
      source_snapshot_at, pricing_mode, pricing_input_value, internal_cost_unit_price,
      converted_cost_unit_price, exchange_rate, exchange_rate_effective_date,
      description, quantity, unit, selling_unit_price
    )
    select
      target.id,
      target_section_id,
      entry.value ->> 'line_type',
      nullif(entry.value ->> 'product_id', '')::uuid,
      nullif(entry.value ->> 'service_id', '')::uuid,
      starting_position + entry.ordinality,
      entry.value ->> 'sku_snapshot',
      entry.value ->> 'product_name_snapshot',
      nullif(entry.value ->> 'source_unit_price', '')::numeric,
      entry.value ->> 'source_currency_code',
      nullif(entry.value ->> 'source_snapshot_at', '')::timestamptz,
      'direct',
      nullif(entry.value ->> 'selling_unit_price', '')::numeric,
      nullif(entry.value ->> 'internal_cost_unit_price', '')::numeric,
      nullif(entry.value ->> 'converted_cost_unit_price', '')::numeric,
      nullif(entry.value ->> 'exchange_rate', '')::numeric,
      nullif(entry.value ->> 'exchange_rate_effective_date', '')::date,
      entry.value ->> 'description',
      nullif(entry.value ->> 'quantity', '')::numeric,
      entry.value ->> 'unit',
      nullif(entry.value ->> 'selling_unit_price', '')::numeric
    from jsonb_array_elements(line_items) with ordinality as entry(value, ordinality)
    where
      (entry.value ->> 'line_type' <> 'product' or exists (
        select 1 from public.catalog_products product
        where product.id = nullif(entry.value ->> 'product_id', '')::uuid
          and product.is_active and product.is_visible
      ))
      and (nullif(entry.value ->> 'service_id', '') is null or exists (
        select 1 from public.partner_services service
        where service.id = nullif(entry.value ->> 'service_id', '')::uuid
          and service.is_active
          and (service.company_id is null or service.company_id = target.company_id)
      ))
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]), count(*)
  into inserted_ids, inserted_count
  from inserted;

  if inserted_count <> jsonb_array_length(line_items) then
    raise exception 'One or more estimate lines are invalid.' using errcode = '22023';
  end if;

  insert into public.estimate_line_insertions (
    estimate_id, request_key, request_fingerprint, estimate_item_ids, created_by
  ) values (
    target.id, target_request_key, target_request_fingerprint, inserted_ids, auth.uid()
  );

  return jsonb_build_object(
    'estimate_item_ids', to_jsonb(inserted_ids),
    'repeated', false
  );
end;
$$;

revoke all on function public.add_estimate_items_v2(uuid, integer, uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.add_estimate_items_v2(uuid, integer, uuid, uuid, text, jsonb)
  to authenticated;

create or replace function public.add_estimate_external_item_v2(
  target_estimate_id uuid,
  expected_revision integer,
  target_section_id uuid,
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
  created_line public.estimate_items;
  existing_request public.estimate_external_item_requests;
  next_position integer;
  normalized_manufacturer_value text;
  normalized_model_value text;
  normalized_name_value text;
begin
  if target_request_key is null
     or target_request_fingerprint is null
     or target_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'External item request is invalid.' using errcode = '22023';
  end if;

  select * into target
  from public.estimates
  where id = target_estimate_id
  for update;

  if target.id is null or target.status <> 'draft'
     or not public.can_access_estimates(target.company_id, 'estimates.manage')
     or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || target.id::text || ':' || target_request_key::text, 0)
  );

  select * into existing_request
  from public.estimate_external_item_requests
  where estimate_id = target.id and request_key = target_request_key;

  if existing_request.estimate_id is not null then
    if existing_request.request_fingerprint <> target_request_fingerprint then
      raise exception 'External item request key was reused with different data.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'estimate_item_id', existing_request.estimate_item_id,
      'external_nomenclature_id', existing_request.external_nomenclature_id,
      'repeated', true
    );
  end if;

  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.estimate_sections section
    where section.id = target_section_id and section.estimate_id = target.id
  ) then
    raise exception 'Estimate section is invalid.' using errcode = '22023';
  end if;

  if existing_external_item_id is not null then
    select * into external_item
    from public.external_nomenclature_items
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
      btrim(target_manufacturer), btrim(target_model), btrim(target_name),
      nullif(btrim(target_category), ''), target_unit,
      nullif(btrim(target_specification), ''), normalized_manufacturer_value,
      normalized_model_value, normalized_name_value, auth.uid(), target.company_id
    ) returning * into external_item;
  end if;

  select coalesce(max(position), 0) + 1 into next_position
  from public.estimate_items
  where estimate_id = target.id;

  insert into public.estimate_items (
    estimate_id, section_id, line_type, external_nomenclature_id, position,
    product_name_snapshot, description, quantity, unit, selling_unit_price
  ) values (
    target.id, target_section_id, 'external', external_item.id, next_position,
    external_item.name,
    concat_ws(' · ', external_item.manufacturer, external_item.model, external_item.name),
    target_quantity, external_item.unit, target_selling_unit_price
  ) returning * into created_line;

  insert into public.estimate_external_item_requests (
    estimate_id, request_key, request_fingerprint, estimate_item_id
  ) values (
    target.id, target_request_key, target_request_fingerprint, created_line.id
  );

  return jsonb_build_object(
    'estimate_item_id', created_line.id,
    'external_nomenclature_id', external_item.id,
    'repeated', false
  );
end;
$$;

revoke all on function public.add_estimate_external_item_v2(uuid, integer, uuid, uuid, text, uuid, text, text, text, text, text, text, numeric, numeric, boolean)
  from public, anon;
grant execute on function public.add_estimate_external_item_v2(uuid, integer, uuid, uuid, text, uuid, text, text, text, text, text, text, numeric, numeric, boolean)
  to authenticated;
