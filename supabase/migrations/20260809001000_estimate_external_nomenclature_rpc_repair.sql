-- Resolve PL/pgSQL variable/column ambiguity in the external-item write path.
create or replace function public.add_estimate_external_item(
  target_estimate_id uuid, expected_revision integer, target_request_key uuid,
  target_request_fingerprint text, existing_external_item_id uuid,
  target_manufacturer text, target_model text, target_name text,
  target_category text, target_unit text, target_specification text,
  target_quantity numeric, target_selling_unit_price numeric,
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
  if target_request_key is null or target_request_fingerprint is null
    or target_request_fingerprint !~ '^[0-9a-f]{64}$' then
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
      btrim(target_manufacturer), btrim(target_model), btrim(target_name),
      nullif(btrim(target_category), ''), target_unit,
      nullif(btrim(target_specification), ''), normalized_manufacturer_value,
      normalized_model_value, normalized_name_value, auth.uid(), target.company_id
    ) returning * into external_item;
  end if;

  select id into default_section_id from public.estimate_sections
  where estimate_id = target.id order by sort_order, id limit 1;
  select coalesce(max(position), 0) + 1 into next_position
  from public.estimate_items where estimate_id = target.id;
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
