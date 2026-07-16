-- Slice 2: portal-owned estimate commercial controls.
-- Product prices and exchange rates remain snapshots of 1C-owned read models.

alter table public.estimates
  add column global_discount_percent numeric(7, 4) not null default 0,
  add column vat_mode text not null default 'none',
  add column vat_rate_percent numeric(7, 4) not null default 0,
  add column currency_rate numeric(18, 8) null,
  add column currency_rate_effective_date date null,
  add column subtotal_amount numeric(18, 2) not null default 0,
  add column line_discount_total numeric(18, 2) not null default 0,
  add column section_discount_total numeric(18, 2) not null default 0,
  add column global_discount_amount numeric(18, 2) not null default 0,
  add column charges_total numeric(18, 2) not null default 0,
  add column vat_amount numeric(18, 2) not null default 0,
  add column total_excluding_vat numeric(18, 2) not null default 0,
  add column gross_profit_amount numeric(18, 2) null,
  add column overall_margin_percent numeric(9, 4) null,
  add constraint estimates_global_discount_check check (global_discount_percent >= 0 and global_discount_percent < 100),
  add constraint estimates_vat_mode_check check (vat_mode in ('included', 'separate', 'excluded', 'none')),
  add constraint estimates_vat_rate_check check (vat_rate_percent >= 0 and vat_rate_percent < 100),
  add constraint estimates_currency_rate_check check (currency_rate is null or currency_rate > 0);

alter table public.estimate_sections
  add column discount_percent numeric(7, 4) not null default 0,
  add constraint estimate_sections_discount_check check (discount_percent >= 0 and discount_percent < 100);

alter table public.estimate_items
  add column pricing_mode text not null default 'direct',
  add column pricing_input_value numeric(18, 6) null,
  add column internal_cost_unit_price numeric(18, 2) null,
  add column converted_cost_unit_price numeric(18, 2) null,
  add column exchange_rate numeric(18, 8) null,
  add column exchange_rate_effective_date date null,
  add column line_discount_percent numeric(7, 4) not null default 0,
  add column line_subtotal numeric(18, 2) generated always as (
    case when selling_unit_price is null then null else round(selling_unit_price * quantity, 2) end
  ) stored,
  add column line_discount_amount numeric(18, 2) generated always as (
    case when selling_unit_price is null then null else round(round(selling_unit_price * quantity, 2) * line_discount_percent / 100, 2) end
  ) stored,
  add column net_line_total numeric(18, 2) generated always as (
    case when selling_unit_price is null then null else round(round(selling_unit_price * quantity, 2) * (1 - line_discount_percent / 100), 2) end
  ) stored,
  add constraint estimate_items_pricing_mode_check check (pricing_mode in ('direct', 'markup', 'margin')),
  add constraint estimate_items_pricing_input_check check (pricing_input_value is null or pricing_input_value >= 0),
  add constraint estimate_items_internal_cost_check check (internal_cost_unit_price is null or internal_cost_unit_price >= 0),
  add constraint estimate_items_converted_cost_check check (converted_cost_unit_price is null or converted_cost_unit_price >= 0),
  add constraint estimate_items_exchange_rate_check check (exchange_rate is null or exchange_rate > 0),
  add constraint estimate_items_discount_check check (line_discount_percent >= 0 and line_discount_percent < 100),
  add constraint estimate_items_margin_input_check check (pricing_mode <> 'margin' or pricing_input_value < 100),
  add constraint estimate_items_cost_mode_check check (pricing_mode = 'direct' or converted_cost_unit_price is not null);

update public.estimate_items
set pricing_input_value = selling_unit_price,
    converted_cost_unit_price = source_unit_price,
    exchange_rate = case when source_unit_price is not null then 1 else null end,
    exchange_rate_effective_date = case when source_unit_price is not null then source_snapshot_at::date else null end;

create table public.estimate_charges (
  id uuid primary key,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  charge_type text not null,
  description text not null,
  amount numeric(18, 2) not null,
  vat_applicable boolean not null default true,
  customer_visible boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_charges_type_check check (charge_type in ('delivery', 'installation', 'commissioning', 'transport', 'other')),
  constraint estimate_charges_description_check check (char_length(btrim(description)) between 1 and 500),
  constraint estimate_charges_amount_check check (amount >= 0),
  constraint estimate_charges_sort_order_check check (sort_order >= 0),
  constraint estimate_charges_order_unique unique (estimate_id, sort_order)
);

create index estimate_charges_estimate_order_idx on public.estimate_charges(estimate_id, sort_order);
create trigger set_estimate_charges_updated_at
before update on public.estimate_charges
for each row execute function public.set_updated_at();

alter table public.partner_services
  add column default_cost numeric(18, 2) null,
  add column default_selling_price numeric(18, 2) null,
  add column vat_applicable boolean not null default true,
  add column category text not null default 'service',
  add constraint partner_services_default_cost_check check (default_cost is null or default_cost >= 0),
  add constraint partner_services_default_selling_check check (default_selling_price is null or default_selling_price >= 0),
  add constraint partner_services_category_check check (category in ('installation', 'commissioning', 'design', 'support', 'transport', 'service'));

alter table public.estimate_charges enable row level security;
revoke all on table public.estimate_charges from anon, authenticated;
grant select on table public.estimate_charges to authenticated;

create policy "Company members can view estimate charges"
on public.estimate_charges for select to authenticated
using (exists (
  select 1 from public.estimates estimate
  where estimate.id = estimate_id
    and public.can_access_estimates(estimate.company_id, 'estimates.view')
));

alter table public.estimate_events drop constraint estimate_events_type_check;
alter table public.estimate_events add constraint estimate_events_type_check check (event_type in (
  'created', 'saved', 'line_added', 'line_updated', 'line_removed', 'archived',
  'commercial_updated', 'currency_changed', 'section_created', 'section_reordered',
  'line_moved', 'discount_changed', 'charge_added', 'totals_recalculated'
));

create or replace function public.recalculate_estimate_totals(target_estimate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  raw_subtotal numeric(18, 2);
  line_discounts numeric(18, 2);
  section_discounts numeric(18, 2);
  after_section_discounts numeric(18, 2);
  global_discount numeric(18, 2);
  charge_sum numeric(18, 2);
  taxable_charge_sum numeric(18, 2);
  vat_base numeric(18, 2);
  vat_value numeric(18, 2);
  excluding_vat numeric(18, 2);
  final_total numeric(18, 2);
  total_cost numeric(18, 2);
  gross_profit numeric(18, 2);
begin
  select * into target from public.estimates where id = target_estimate_id;
  if target.id is null then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  select
    coalesce(sum(item.line_subtotal), 0),
    coalesce(sum(item.line_discount_amount), 0),
    coalesce(sum(coalesce(item.converted_cost_unit_price, 0) * item.quantity), 0)
  into raw_subtotal, line_discounts, total_cost
  from public.estimate_items item where item.estimate_id = target.id;

  select
    coalesce(sum(section_value.net_subtotal), 0),
    coalesce(sum(round(section_value.net_subtotal * section_value.discount_percent / 100, 2)), 0)
  into after_section_discounts, section_discounts
  from (
    select section.id, section.discount_percent, coalesce(sum(item.net_line_total), 0) as net_subtotal
    from public.estimate_sections section
    left join public.estimate_items item on item.section_id = section.id
    where section.estimate_id = target.id
    group by section.id, section.discount_percent
  ) section_value;

  after_section_discounts := round(after_section_discounts - section_discounts, 2);
  global_discount := round(after_section_discounts * target.global_discount_percent / 100, 2);

  select
    coalesce(sum(charge.amount), 0),
    coalesce(sum(charge.amount) filter (where charge.vat_applicable), 0)
  into charge_sum, taxable_charge_sum
  from public.estimate_charges charge where charge.estimate_id = target.id;

  vat_base := round(after_section_discounts - global_discount + taxable_charge_sum, 2);
  if target.vat_mode = 'included' and target.vat_rate_percent > 0 then
    vat_value := round(vat_base - (vat_base / (1 + target.vat_rate_percent / 100)), 2);
    excluding_vat := round(after_section_discounts - global_discount + charge_sum - vat_value, 2);
    final_total := round(after_section_discounts - global_discount + charge_sum, 2);
  elsif target.vat_mode = 'separate' and target.vat_rate_percent > 0 then
    vat_value := round(vat_base * target.vat_rate_percent / 100, 2);
    excluding_vat := round(after_section_discounts - global_discount + charge_sum, 2);
    final_total := round(excluding_vat + vat_value, 2);
  else
    vat_value := 0;
    excluding_vat := round(after_section_discounts - global_discount + charge_sum, 2);
    final_total := excluding_vat;
  end if;

  gross_profit := round(excluding_vat - total_cost, 2);
  update public.estimates
  set subtotal_amount = raw_subtotal,
      line_discount_total = line_discounts,
      section_discount_total = section_discounts,
      global_discount_amount = global_discount,
      charges_total = charge_sum,
      vat_amount = vat_value,
      total_excluding_vat = excluding_vat,
      total_amount = final_total,
      gross_profit_amount = gross_profit,
      overall_margin_percent = case when excluding_vat > 0 then round(gross_profit / excluding_vat * 100, 4) else null end,
      has_incomplete_pricing = exists (
        select 1 from public.estimate_items item
        where item.estimate_id = target.id
          and (item.selling_unit_price is null or (item.pricing_mode <> 'direct' and item.converted_cost_unit_price is null))
      ),
      updated_at = now()
  where id = target.id;
end;
$$;

revoke all on function public.recalculate_estimate_totals(uuid) from public, anon, authenticated;

create or replace function public.refresh_estimate_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.estimate_batch_update', true) = 'on' then
    return null;
  end if;
  perform public.recalculate_estimate_totals(coalesce(new.estimate_id, old.estimate_id));
  return null;
end;
$$;

create or replace function public.record_estimate_item_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.estimate_batch_update', true) = 'on' then
    return null;
  end if;
  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (
    coalesce(new.estimate_id, old.estimate_id), auth.uid(),
    case tg_op when 'INSERT' then 'line_added' when 'UPDATE' then 'line_updated' else 'line_removed' end
  );
  return null;
end;
$$;

create trigger refresh_estimate_totals_after_charge_change
after insert or update or delete on public.estimate_charges
for each row execute function public.refresh_estimate_totals();

create or replace function public.save_estimate_commercial_draft(
  target_estimate_id uuid,
  expected_revision integer,
  estimate_settings jsonb,
  section_payload jsonb,
  line_payload jsonb,
  charge_payload jsonb
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  result public.estimates;
  target_currency text := upper(btrim(estimate_settings->>'currency_code'));
  target_vat_mode text := estimate_settings->>'vat_mode';
  target_vat_rate numeric := (estimate_settings->>'vat_rate_percent')::numeric;
  target_global_discount numeric := (estimate_settings->>'global_discount_percent')::numeric;
  section_count integer;
  line_count integer;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft'
     or not public.can_access_estimates(target.company_id, 'estimates.manage')
     or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  if jsonb_typeof(section_payload) <> 'array' or jsonb_array_length(section_payload) < 1 or jsonb_array_length(section_payload) > 100
     or jsonb_typeof(line_payload) <> 'array' or jsonb_array_length(line_payload) > 500
     or jsonb_typeof(charge_payload) <> 'array' or jsonb_array_length(charge_payload) > 50 then
    raise exception 'Estimate commercial payload is invalid.' using errcode = '22023';
  end if;
  if target_vat_mode not in ('included', 'separate', 'excluded', 'none')
     or target_vat_rate < 0 or target_vat_rate >= 100
     or target_global_discount < 0 or target_global_discount >= 100 then
    raise exception 'Estimate commercial settings are invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.price_types price_type
    where price_type.is_active and price_type.currency_status = 'resolved' and price_type.currency_code = target_currency
  ) then
    raise exception 'Estimate currency is not available.' using errcode = '22023';
  end if;

  select count(*) into section_count from public.estimate_sections where estimate_id = target.id;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(section_payload)) <> jsonb_array_length(section_payload)
     or exists (
       select 1 from jsonb_array_elements(section_payload) value
       where exists (select 1 from public.estimate_sections section where section.id = (value->>'id')::uuid and section.estimate_id <> target.id)
     ) then
    raise exception 'Estimate sections are invalid.' using errcode = '22023';
  end if;

  select count(*) into line_count from public.estimate_items where estimate_id = target.id;
  if line_count <> jsonb_array_length(line_payload)
     or (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(line_payload)) <> line_count
     or exists (
       select 1 from jsonb_array_elements(line_payload) value
       where not exists (select 1 from public.estimate_items item where item.id = (value->>'id')::uuid and item.estimate_id = target.id)
     ) then
    raise exception 'Estimate lines are invalid.' using errcode = '22023';
  end if;

  perform set_config('app.estimate_batch_update', 'on', true);

  update public.estimate_sections set sort_order = sort_order + 100000 where estimate_id = target.id;
  insert into public.estimate_sections (id, estimate_id, name, sort_order, show_subtotal, discount_percent)
  select
    (value->>'id')::uuid, target.id, btrim(value->>'name'), (value->>'sort_order')::integer,
    coalesce((value->>'show_subtotal')::boolean, true), (value->>'discount_percent')::numeric
  from jsonb_array_elements(section_payload)
  on conflict (id) do update set
    name = excluded.name,
    sort_order = excluded.sort_order,
    show_subtotal = excluded.show_subtotal,
    discount_percent = excluded.discount_percent;

  if exists (
    select 1 from jsonb_array_elements(line_payload) value
    where not exists (select 1 from public.estimate_sections section where section.id = (value->>'section_id')::uuid and section.estimate_id = target.id)
       or (value->>'pricing_mode') not in ('direct', 'markup', 'margin')
       or (value->>'quantity')::numeric <= 0
       or (value->>'line_discount_percent')::numeric < 0
       or (value->>'line_discount_percent')::numeric >= 100
       or ((value->>'pricing_mode') = 'margin' and (value->>'pricing_input_value')::numeric >= 100)
       or ((value->>'pricing_mode') <> 'direct' and nullif(value->>'converted_cost_unit_price', '') is null)
  ) then
    raise exception 'Estimate line commercial values are invalid.' using errcode = '22023';
  end if;

  update public.estimate_items set position = position + 100000 where estimate_id = target.id;
  update public.estimate_items item
  set section_id = value.section_id,
      position = value.position,
      description = value.description,
      quantity = value.quantity,
      unit = value.unit,
      pricing_mode = value.pricing_mode,
      pricing_input_value = value.pricing_input_value,
      internal_cost_unit_price = value.internal_cost_unit_price,
      converted_cost_unit_price = value.converted_cost_unit_price,
      exchange_rate = value.exchange_rate,
      exchange_rate_effective_date = value.exchange_rate_effective_date,
      line_discount_percent = value.line_discount_percent,
      selling_unit_price = case value.pricing_mode
        when 'direct' then round(value.pricing_input_value, 2)
        when 'markup' then round(value.converted_cost_unit_price * (1 + value.pricing_input_value / 100), 2)
        when 'margin' then round(value.converted_cost_unit_price / (1 - value.pricing_input_value / 100), 2)
      end
  from jsonb_to_recordset(line_payload) as value(
    id uuid, section_id uuid, position integer, description text, quantity numeric, unit text,
    pricing_mode text, pricing_input_value numeric, internal_cost_unit_price numeric,
    converted_cost_unit_price numeric, exchange_rate numeric, exchange_rate_effective_date date,
    line_discount_percent numeric
  )
  where item.id = value.id and item.estimate_id = target.id;

  delete from public.estimate_charges where estimate_id = target.id;
  insert into public.estimate_charges (
    id, estimate_id, charge_type, description, amount, vat_applicable, customer_visible, sort_order
  )
  select id, target.id, charge_type, btrim(description), round(amount, 2), vat_applicable, customer_visible, sort_order
  from jsonb_to_recordset(charge_payload) as value(
    id uuid, charge_type text, description text, amount numeric,
    vat_applicable boolean, customer_visible boolean, sort_order integer
  );

  update public.estimates
  set name = btrim(estimate_settings->>'name'),
      customer_name = nullif(btrim(estimate_settings->>'customer_name'), ''),
      project_name = nullif(btrim(estimate_settings->>'project_name'), ''),
      validity_days = (estimate_settings->>'validity_days')::integer,
      currency_code = target_currency,
      currency_rate = nullif(estimate_settings->>'currency_rate', '')::numeric,
      currency_rate_effective_date = nullif(estimate_settings->>'currency_rate_effective_date', '')::date,
      vat_mode = target_vat_mode,
      vat_rate_percent = target_vat_rate,
      global_discount_percent = target_global_discount
  where id = target.id;

  perform set_config('app.estimate_batch_update', 'off', true);
  perform public.recalculate_estimate_totals(target.id);
  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (target.id, auth.uid(), 'commercial_updated');
  select * into result from public.estimates where id = target.id;
  return result;
end;
$$;

revoke all on function public.save_estimate_commercial_draft(uuid, integer, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_estimate_commercial_draft(uuid, integer, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- Keep newly added Slice 1 lines immediately compatible with the commercial model.
create or replace function public.add_estimate_items(target_estimate_id uuid, expected_revision integer, line_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  default_section_id uuid;
  starting_position integer;
  inserted_count integer;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft'
     or not public.can_access_estimates(target.company_id, 'estimates.manage')
     or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  if jsonb_typeof(line_items) <> 'array' or jsonb_array_length(line_items) < 1 or jsonb_array_length(line_items) > 50 then
    raise exception 'Estimate line batch is invalid.' using errcode = '22023';
  end if;

  select id into default_section_id from public.estimate_sections where estimate_id = target.id order by sort_order, id limit 1;
  select coalesce(max(position), 0) into starting_position from public.estimate_items where estimate_id = target.id;

  insert into public.estimate_items (
    estimate_id, section_id, line_type, product_id, service_id, position,
    sku_snapshot, product_name_snapshot, source_unit_price, source_currency_code,
    source_snapshot_at, pricing_mode, pricing_input_value, internal_cost_unit_price,
    converted_cost_unit_price, exchange_rate, exchange_rate_effective_date,
    description, quantity, unit, selling_unit_price
  )
  select
    target.id, default_section_id, payload.line_type, payload.product_id, payload.service_id,
    starting_position + payload.ordinality, payload.sku_snapshot, payload.product_name_snapshot,
    payload.source_unit_price, payload.source_currency_code, payload.source_snapshot_at,
    'direct', payload.selling_unit_price,
    payload.internal_cost_unit_price,
    payload.converted_cost_unit_price,
    payload.exchange_rate,
    payload.exchange_rate_effective_date,
    payload.description, payload.quantity, payload.unit, payload.selling_unit_price
  from jsonb_to_recordset(line_items) with ordinality as payload(
    line_type text, product_id uuid, service_id uuid, sku_snapshot text,
    product_name_snapshot text, source_unit_price numeric, source_currency_code text,
    source_snapshot_at timestamptz, internal_cost_unit_price numeric,
    converted_cost_unit_price numeric, exchange_rate numeric, exchange_rate_effective_date date,
    description text, quantity numeric, unit text,
    selling_unit_price numeric, ordinality bigint
  )
  where
    (payload.line_type <> 'product' or exists (select 1 from public.catalog_products product where product.id = payload.product_id and product.is_active and product.is_visible))
    and (payload.service_id is null or exists (select 1 from public.partner_services service where service.id = payload.service_id and service.is_active and (service.company_id is null or service.company_id = target.company_id)));

  get diagnostics inserted_count = row_count;
  if inserted_count <> jsonb_array_length(line_items) then
    raise exception 'One or more estimate lines are invalid.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.add_estimate_items(uuid, integer, jsonb) from public;
grant execute on function public.add_estimate_items(uuid, integer, jsonb) to authenticated;

-- Keep the Slice 1 line editor compatible while making direct mode explicit.
create or replace function public.update_estimate_item(
  target_estimate_id uuid,
  target_item_id uuid,
  expected_revision integer,
  target_description text,
  target_quantity numeric,
  target_unit text,
  target_selling_unit_price numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft'
     or not public.can_access_estimates(target.company_id, 'estimates.manage')
     or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;
  update public.estimate_items
  set description = target_description,
      quantity = target_quantity,
      unit = target_unit,
      pricing_mode = 'direct',
      pricing_input_value = target_selling_unit_price,
      selling_unit_price = target_selling_unit_price
  where id = target_item_id and estimate_id = target.id;
  if not found then raise exception 'Estimate line was not found.' using errcode = 'P0002'; end if;
end;
$$;

comment on table public.estimate_charges is
  'Portal-owned compact estimate adjustments. Recurring or itemized work belongs in estimate service lines.';
