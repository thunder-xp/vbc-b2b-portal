-- Section labels are partner-editable; commercial structure and stable identity remain governed.
create or replace function public.protect_canonical_estimate_section()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Preserve the existing commercial-save RPC's bounded temporary position swap.
  if tg_op = 'UPDATE' and old.system_key is not null
    and current_setting('app.estimate_batch_update', true) = 'on'
    and new.system_key is not distinct from old.system_key
    and new.name is not distinct from old.name
    and new.sort_order = old.sort_order + 100000
    and new.show_subtotal is not distinct from old.show_subtotal
    and new.discount_percent is not distinct from old.discount_percent then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.system_key is not null and (
    new.system_key is distinct from old.system_key
    or new.sort_order is distinct from public.canonical_estimate_section_order(old.system_key)
    or new.show_subtotal is distinct from true
    or new.discount_percent is distinct from 0
  ) then
    raise exception 'Canonical estimate section structure is immutable.' using errcode = '23514';
  end if;
  if new.system_key is not null then
    if new.name is null or char_length(btrim(new.name)) not between 1 and 120 then
      raise exception 'Estimate section name is invalid.' using errcode = '23514';
    end if;
    new.name := btrim(new.name);
    new.sort_order := public.canonical_estimate_section_order(new.system_key);
    new.show_subtotal := true;
    new.discount_percent := 0;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_canonical_estimate_section() from public, anon, authenticated;

-- Explicit Quick Add command. Reuse the existing insertion/idempotency ledger and
-- revision lock; add quantity to the first governed same-context line, preserving
-- its commercial terms. Existing batch insertion semantics stay unchanged.
create or replace function public.quick_add_estimate_item(
  target_estimate_id uuid, expected_revision integer, target_section_id uuid,
  target_request_key uuid, target_request_fingerprint text, line_items jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target public.estimates;
  prior public.estimate_line_insertions;
  existing public.estimate_items;
  entry jsonb;
  quantity_to_add numeric;
begin
  if target_request_key is null or target_request_fingerprint is null
    or target_request_fingerprint !~ '^[a-f0-9]{64}$'
    or line_items is null or jsonb_typeof(line_items) <> 'array'
    or jsonb_array_length(line_items) <> 1 then
    raise exception 'Quick add input is invalid.' using errcode = '22023';
  end if;
  select * into target from public.estimates where id = target_estimate_id for update;
  if auth.uid() is null or target.id is null or target.status <> 'draft' or target.deleted_at is not null
    or not public.can_access_estimates(target.company_id, 'estimates.manage')
    or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  select * into prior from public.estimate_line_insertions
    where estimate_id = target.id and request_key = target_request_key;
  if prior.estimate_id is not null then
    if prior.created_by <> auth.uid() or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Estimate request key reused with different data.' using errcode = '22023';
    end if;
    return jsonb_build_object('estimate_item_ids', to_jsonb(prior.estimate_item_ids), 'repeated', true);
  end if;
  if target.revision is distinct from expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.estimate_sections where id = target_section_id and estimate_id = target.id) then
    raise exception 'Estimate section is invalid.' using errcode = '22023';
  end if;
  entry := line_items -> 0;
  quantity_to_add := (entry ->> 'quantity')::numeric;
  if quantity_to_add is null or quantity_to_add <= 0 or quantity_to_add > 999999
    or quantity_to_add <> round(quantity_to_add, 3) then
    raise exception 'Quantity is invalid.' using errcode = '22023';
  end if;
  -- Catalog repeat handling is explicit. Services retain their existing per-line pricing semantics.
  if entry ->> 'line_type' = 'product' then
    if not exists (select 1 from public.catalog_products where id = (entry ->> 'product_id')::uuid and is_active and is_visible) then
      raise exception 'Catalog product is unavailable.' using errcode = '22023';
    end if;
    select * into existing from public.estimate_items
      where estimate_id = target.id and section_id = target_section_id
        and line_type = 'product' and product_id = (entry ->> 'product_id')::uuid
      order by position, id limit 1;
  end if;
  if existing.id is null then
    return public.add_estimate_items_v2(target_estimate_id, expected_revision, target_section_id,
      target_request_key, target_request_fingerprint, line_items);
  end if;
  if existing.quantity + quantity_to_add > 999999 then
    raise exception 'Quantity is invalid.' using errcode = '22023';
  end if;
  update public.estimate_items set quantity = existing.quantity + quantity_to_add where id = existing.id;
  insert into public.estimate_line_insertions(estimate_id, request_key, request_fingerprint, estimate_item_ids, created_by)
    values (target.id, target_request_key, target_request_fingerprint, array[existing.id], auth.uid());
  return jsonb_build_object('estimate_item_ids', jsonb_build_array(existing.id), 'repeated', false);
end;
$$;
revoke all on function public.quick_add_estimate_item(uuid, integer, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.quick_add_estimate_item(uuid, integer, uuid, uuid, text, jsonb) to authenticated;
