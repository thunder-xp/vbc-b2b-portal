-- Canonical four-section structure for newly created partner estimates.
-- Legacy sections remain unchanged and readable.

alter table public.estimate_sections
  add column if not exists system_key text null;

alter table public.estimate_sections
  drop constraint if exists estimate_sections_system_key_check;
alter table public.estimate_sections
  add constraint estimate_sections_system_key_check check (
    system_key is null or system_key in (
      'equipment', 'installation_materials', 'installation_works', 'commissioning_works'
    )
  );

create unique index if not exists estimate_sections_estimate_system_key_unique
  on public.estimate_sections(estimate_id, system_key)
  where system_key is not null;

create or replace function public.canonical_estimate_section_name(target_key text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select case target_key
    when 'equipment' then 'Оборудование'
    when 'installation_materials' then 'Монтажные материалы'
    when 'installation_works' then 'Монтажные работы'
    when 'commissioning_works' then 'Пусконаладочные работы'
  end
$$;

create or replace function public.canonical_estimate_section_order(target_key text)
returns integer
language sql
immutable
strict
set search_path = public
as $$
  select case target_key
    when 'equipment' then 0
    when 'installation_materials' then 1
    when 'installation_works' then 2
    when 'commissioning_works' then 3
  end
$$;

create or replace function public.protect_canonical_estimate_section()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.system_key is not null and (
    new.system_key is distinct from old.system_key
    or new.name is distinct from public.canonical_estimate_section_name(old.system_key)
    or new.sort_order is distinct from public.canonical_estimate_section_order(old.system_key)
    or new.show_subtotal is distinct from true
    or new.discount_percent is distinct from 0
  ) then
    raise exception 'Canonical estimate section structure is immutable.' using errcode = '23514';
  end if;
  if new.system_key is not null then
    new.name := public.canonical_estimate_section_name(new.system_key);
    new.sort_order := public.canonical_estimate_section_order(new.system_key);
    new.show_subtotal := true;
    new.discount_percent := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_canonical_estimate_section on public.estimate_sections;
create trigger protect_canonical_estimate_section
before insert or update on public.estimate_sections
for each row execute function public.protect_canonical_estimate_section();

create or replace function public.initialize_canonical_estimate_sections(target_estimate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare equipment_section_id uuid;
begin
  if not exists (select 1 from public.estimates where id = target_estimate_id) then
    raise exception 'Estimate is not available.' using errcode = 'P0002';
  end if;
  insert into public.estimate_sections(estimate_id, name, system_key, sort_order, show_subtotal, discount_percent)
  select target_estimate_id, public.canonical_estimate_section_name(section_key), section_key,
    public.canonical_estimate_section_order(section_key), true, 0
  from unnest(array['equipment', 'installation_materials', 'installation_works', 'commissioning_works']) section_key
  on conflict (estimate_id, system_key) where system_key is not null do nothing;

  select id into equipment_section_id
  from public.estimate_sections
  where estimate_id = target_estimate_id and system_key = 'equipment';
  return equipment_section_id;
end;
$$;

revoke all on function public.canonical_estimate_section_name(text) from public, anon, authenticated;
revoke all on function public.canonical_estimate_section_order(text) from public, anon, authenticated;
revoke all on function public.protect_canonical_estimate_section() from public, anon, authenticated;
revoke all on function public.initialize_canonical_estimate_sections(uuid) from public, anon, authenticated;

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
declare created public.estimates;
begin
  if target_request_key is null then raise exception 'Estimate request key is required.' using errcode = '22023'; end if;
  if not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.price_types price_type
    where price_type.is_active = true and price_type.currency_status = 'resolved'
      and price_type.currency_code = target_currency_code
  ) then raise exception 'Estimate currency is not available.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || target_request_key::text, 0));
  select * into created from public.estimates
  where created_by = auth.uid() and creation_request_key = target_request_key;
  if created.id is not null then
    if created.company_id <> target_company_id or created.name <> estimate_name
      or created.currency_code <> target_currency_code or created.validity_days <> target_validity_days
      or coalesce(created.customer_name, '') <> coalesce(nullif(target_customer_name, ''), '')
      or coalesce(created.project_name, '') <> coalesce(nullif(target_project_name, ''), '')
    then raise exception 'Estimate request key was reused with different data.' using errcode = '22023'; end if;
    perform public.initialize_canonical_estimate_sections(created.id);
    return created;
  end if;

  insert into public.estimates(
    company_id, created_by, name, customer_name, project_name, currency_code, validity_days, creation_request_key
  ) values (
    target_company_id, auth.uid(), estimate_name, nullif(target_customer_name, ''), nullif(target_project_name, ''),
    target_currency_code, target_validity_days, target_request_key
  ) returning * into created;
  perform public.initialize_canonical_estimate_sections(created.id);
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (created.id, auth.uid(), 'created');
  return created;
end;
$$;

revoke all on function public.create_estimate_v2(uuid, text, text, text, text, integer, uuid) from public, anon;
grant execute on function public.create_estimate_v2(uuid, text, text, text, text, integer, uuid) to authenticated;

create or replace function public.create_estimate_from_cart(
  target_cart_id uuid,
  target_name text,
  target_currency_code text,
  target_lines jsonb,
  target_request_key uuid
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare target_cart public.carts; created public.estimates; section_id uuid; prior public.estimate_cart_conversions;
begin
  select * into target_cart from public.carts where id = target_cart_id for update;
  if target_cart.id is null or target_cart.created_by <> auth.uid() or target_cart.status <> 'active'
     or not public.can_access_estimates(target_cart.company_id, 'estimates.manage') then
    raise exception 'Cart is not available.' using errcode = '42501';
  end if;
  if jsonb_array_length(target_lines) = 0 then raise exception 'Cart is empty.' using errcode = '23514'; end if;
  select * into prior from public.estimate_cart_conversions
  where company_id = target_cart.company_id and request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.direction <> 'cart_to_estimate' then
      raise exception 'Request key is already used.' using errcode = '23505';
    end if;
    select * into created from public.estimates where id = prior.estimate_id;
    perform public.initialize_canonical_estimate_sections(created.id);
    return created;
  end if;
  perform set_config('app.estimate_bulk_operation', 'true', true);
  insert into public.estimates(company_id, created_by, name, currency_code, validity_days)
  values (target_cart.company_id, auth.uid(), btrim(target_name), upper(target_currency_code), 14)
  returning * into created;
  section_id := public.initialize_canonical_estimate_sections(created.id);
  insert into public.estimate_items(
    estimate_id, section_id, line_type, product_id, position, sku_snapshot, product_name_snapshot,
    source_unit_price, source_currency_code, source_snapshot_at, pricing_mode, pricing_input_value,
    converted_cost_unit_price, exchange_rate, exchange_rate_effective_date, description, quantity, unit, selling_unit_price
  )
  select created.id, section_id, 'product', row.product_id, row.position, row.sku, row.product_name,
    row.partner_price, row.currency_code, row.snapshot_at, 'direct', row.converted_price,
    row.converted_price, row.exchange_rate, row.exchange_rate_date, row.product_name, cart_item.quantity, 'pcs', row.converted_price
  from jsonb_to_recordset(target_lines) as row(
    product_id uuid, position integer, sku text, product_name text, quantity numeric, partner_price numeric,
    currency_code text, snapshot_at timestamptz, converted_price numeric, exchange_rate numeric, exchange_rate_date date
  )
  join public.cart_items cart_item on cart_item.cart_id = target_cart.id and cart_item.product_id = row.product_id
  join public.catalog_products product on product.id = row.product_id and product.is_active and product.is_visible;
  perform public.recalculate_estimate_totals(created.id);
  insert into public.estimate_cart_conversions(company_id, estimate_id, cart_id, direction, request_key, summary, created_by)
  values (created.company_id, created.id, target_cart.id, 'cart_to_estimate', target_request_key,
    jsonb_build_object('lineCount', jsonb_array_length(target_lines)), auth.uid());
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (created.id, auth.uid(), 'created_from_cart');
  select * into created from public.estimates where id = created.id;
  return created;
end;
$$;

revoke all on function public.create_estimate_from_cart(uuid, text, text, jsonb, uuid) from public, anon;
grant execute on function public.create_estimate_from_cart(uuid, text, text, jsonb, uuid) to authenticated;

create or replace function public.create_estimate_from_purchasing_list(
  target_list_id uuid, target_request_key uuid, target_request_fingerprint text, target_name text,
  target_currency_code text, target_items jsonb, target_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare source public.purchasing_lists; prior public.purchasing_list_operations; created public.estimates; section_id uuid; result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));
  select * into prior from public.purchasing_list_operations where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.list_id <> target_list_id or prior.operation_type <> 'list_to_estimate'
      or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchasing list operation key is already used.' using errcode = '23505';
    end if;
    return prior.result || jsonb_build_object('repeated', true);
  end if;
  select * into source from public.purchasing_lists where id = target_list_id;
  if source.id is null or source.archived_at is not null or not public.can_view_purchasing_list(source)
    or not public.can_access_estimates(source.company_id, 'estimates.manage')
    or not public.can_access_estimates(source.company_id, 'estimates.pricing.manage')
  then raise exception 'Estimate creation denied.' using errcode = '42501'; end if;
  if target_currency_code !~ '^[A-Z]{3}$' or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) not between 1 and 50
    or exists (
      select 1 from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer, selling_unit_price numeric)
      where row.quantity not between 1 and 9999 or row.selling_unit_price is null or row.selling_unit_price < 0
        or not exists (
          select 1 from public.purchasing_list_items item join public.catalog_products product on product.id = item.product_id
          where item.id = row.item_id and item.list_id = source.id and item.product_id = row.product_id
            and product.is_active and product.is_visible
        )
    ) then raise exception 'Estimate lines are invalid.' using errcode = '22023'; end if;
  insert into public.estimates(company_id, created_by, name, currency_code, validity_days)
  values (source.company_id, auth.uid(), btrim(target_name), target_currency_code, 14) returning * into created;
  section_id := public.initialize_canonical_estimate_sections(created.id);
  insert into public.estimate_items(
    estimate_id, section_id, line_type, product_id, position, sku_snapshot, product_name_snapshot,
    source_unit_price, source_currency_code, source_snapshot_at, internal_cost_unit_price, converted_cost_unit_price,
    exchange_rate, exchange_rate_effective_date, description, quantity, unit, selling_unit_price
  )
  select created.id, section_id, 'product', row.product_id, row.ordinality, row.sku, row.product_name,
    row.source_unit_price, row.source_currency_code, row.source_snapshot_at, row.converted_cost_unit_price,
    row.converted_cost_unit_price, row.exchange_rate, row.exchange_rate_effective_date, row.product_name,
    row.quantity, 'pcs', row.selling_unit_price
  from jsonb_to_recordset(target_items) with ordinality row(
    item_id uuid, product_id uuid, quantity integer, sku text, product_name text, source_unit_price numeric,
    source_currency_code text, source_snapshot_at timestamptz, selling_unit_price numeric,
    converted_cost_unit_price numeric, exchange_rate numeric, exchange_rate_effective_date date, ordinality bigint
  );
  update public.estimates set
    total_amount = (select coalesce(sum(line_total), 0) from public.estimate_items where estimate_id = created.id),
    has_incomplete_pricing = false
  where id = created.id returning * into created;
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (created.id, auth.uid(), 'created');
  result := coalesce(target_summary, '{}'::jsonb) || jsonb_build_object('estimate_id', created.id, 'repeated', false);
  insert into public.purchasing_list_operations(request_key, operation_type, list_id, company_id, created_by, request_fingerprint, result)
  values (target_request_key, 'list_to_estimate', source.id, source.company_id, auth.uid(), target_request_fingerprint, result);
  insert into public.purchasing_list_events(list_id, actor_user_id, event_type, metadata)
  values (source.id, auth.uid(), 'estimate_created', jsonb_build_object('estimate_id', created.id, 'item_count', jsonb_array_length(target_items)));
  return result;
end;
$$;

revoke all on function public.create_estimate_from_purchasing_list(uuid, uuid, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_estimate_from_purchasing_list(uuid, uuid, text, text, text, jsonb, jsonb) to authenticated;
