-- Immutable estimate versions, controlled workflow, reuse, and bulk cart bridges.
-- The portal owns drafts and snapshots. Current catalog prices remain read-model truth.

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code in ('partner_owner', 'partner_manager', 'partner_buyer', 'novotech_admin', 'novotech_sales')
  and permission.code = 'estimates.convert_to_cart'
on conflict (role_id, permission_id) do nothing;

create table if not exists public.estimate_versions (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  version_number integer not null,
  estimate_revision integer not null,
  status text not null default 'prepared',
  estimate_number text not null,
  currency_code text not null,
  total_amount numeric(18, 2) not null,
  snapshot jsonb not null,
  customer_proposal_snapshot jsonb not null,
  proposal_template_id uuid null references public.proposal_templates(id) on delete set null,
  note text null,
  change_reason text null,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  sent_by uuid null references public.user_profiles(id) on delete restrict,
  sent_channel text null,
  recipient_note text null,
  accepted_at timestamptz null,
  accepted_by uuid null references public.user_profiles(id) on delete restrict,
  acceptance_note text null,
  rejected_at timestamptz null,
  rejected_by uuid null references public.user_profiles(id) on delete restrict,
  rejection_reason text null,
  archived_at timestamptz null,
  constraint estimate_versions_number_check check (version_number > 0),
  constraint estimate_versions_revision_check check (estimate_revision > 0),
  constraint estimate_versions_status_check check (status in ('prepared', 'sent', 'accepted', 'rejected', 'archived')),
  constraint estimate_versions_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint estimate_versions_total_check check (total_amount >= 0),
  constraint estimate_versions_snapshot_check check (jsonb_typeof(snapshot) = 'object'),
  constraint estimate_versions_customer_snapshot_check check (jsonb_typeof(customer_proposal_snapshot) = 'object'),
  constraint estimate_versions_note_check check (note is null or char_length(note) <= 1000),
  constraint estimate_versions_reason_check check (change_reason is null or char_length(change_reason) <= 1000),
  constraint estimate_versions_channel_check check (sent_channel is null or sent_channel in ('email', 'messenger', 'printed', 'other')),
  constraint estimate_versions_estimate_number_unique unique (estimate_id, version_number)
);

alter table public.estimates
  add column if not exists source_estimate_id uuid null references public.estimates(id) on delete set null,
  add column if not exists source_version_id uuid null references public.estimate_versions(id) on delete set null,
  add column if not exists accepted_version_id uuid null references public.estimate_versions(id) on delete set null;

alter table public.generated_estimate_documents
  add column if not exists version_id uuid null references public.estimate_versions(id) on delete restrict;

alter table public.proposal_templates
  add column if not exists estimate_structure jsonb null;

alter table public.proposal_templates
  drop constraint if exists proposal_templates_estimate_structure_check;

alter table public.proposal_templates
  add constraint proposal_templates_estimate_structure_check
  check (estimate_structure is null or jsonb_typeof(estimate_structure) = 'object');

create table if not exists public.estimate_cart_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  version_id uuid null references public.estimate_versions(id) on delete restrict,
  cart_id uuid not null references public.carts(id) on delete restrict,
  direction text not null,
  request_key uuid not null,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint estimate_cart_conversions_direction_check check (direction in ('cart_to_estimate', 'estimate_to_cart')),
  constraint estimate_cart_conversions_summary_check check (jsonb_typeof(summary) = 'object'),
  constraint estimate_cart_conversions_request_unique unique (company_id, request_key)
);

create index if not exists estimate_versions_estimate_created_idx
  on public.estimate_versions(estimate_id, version_number desc);
create index if not exists estimate_versions_company_status_idx
  on public.estimate_versions(company_id, status, created_at desc);
create index if not exists generated_estimate_documents_version_idx
  on public.generated_estimate_documents(version_id, created_at desc) where version_id is not null;
create index if not exists estimate_cart_conversions_estimate_idx
  on public.estimate_cart_conversions(estimate_id, created_at desc);

alter table public.estimate_events drop constraint if exists estimate_events_type_check;
alter table public.estimate_events add constraint estimate_events_type_check check (event_type in (
  'created', 'saved', 'line_added', 'line_updated', 'line_removed', 'archived',
  'ready', 'version_created', 'version_sent', 'version_accepted', 'version_rejected',
  'draft_restored', 'duplicated', 'template_created', 'created_from_cart', 'added_to_cart'
));

create or replace function public.refresh_estimate_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare target_id uuid := coalesce(new.estimate_id, old.estimate_id);
begin
  if current_setting('app.estimate_bulk_operation', true) = 'true' then return null; end if;
  perform public.recalculate_estimate_totals(target_id);
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
  if current_setting('app.estimate_bulk_operation', true) = 'true' then return null; end if;
  insert into public.estimate_events (estimate_id, actor_user_id, event_type)
  values (coalesce(new.estimate_id, old.estimate_id), auth.uid(),
    case tg_op when 'INSERT' then 'line_added' when 'UPDATE' then 'line_updated' else 'line_removed' end);
  return null;
end;
$$;

create or replace function public.capture_estimate_snapshot(target_estimate_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'estimate', to_jsonb(e),
    'sections', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.estimate_sections s where s.estimate_id = e.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.estimate_items i where i.estimate_id = e.id), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order) from public.estimate_charges c where c.estimate_id = e.id), '[]'::jsonb)
  )
  from public.estimates e where e.id = target_estimate_id;
$$;

revoke all on function public.capture_estimate_snapshot(uuid) from public, anon, authenticated;

create or replace function public.create_estimate_version(
  target_estimate_id uuid,
  expected_revision integer,
  target_note text,
  target_change_reason text,
  target_customer_snapshot jsonb
)
returns public.estimate_versions
language plpgsql
security definer
set search_path = public
as $$
declare target public.estimates; created public.estimate_versions; next_version integer;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;
  if target.status not in ('draft', 'ready') or target.revision <> expected_revision then
    raise exception 'Estimate changed before version creation.' using errcode = '40001';
  end if;
  if target.has_incomplete_pricing or target.total_amount < 0
     or not exists (select 1 from public.estimate_items where estimate_id = target.id) then
    raise exception 'Estimate is not ready for a version.' using errcode = '23514';
  end if;
  if jsonb_typeof(target_customer_snapshot) <> 'object'
     or coalesce((target_customer_snapshot #>> '{totals,total}')::numeric, -1) <> target.total_amount then
    raise exception 'Customer proposal snapshot does not match estimate total.' using errcode = '23514';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.estimate_versions where estimate_id = target.id;
  insert into public.estimate_versions (
    estimate_id, company_id, version_number, estimate_revision, estimate_number, currency_code,
    total_amount, snapshot, customer_proposal_snapshot, proposal_template_id, note, change_reason, created_by
  ) values (
    target.id, target.company_id, next_version, target.revision, target.estimate_number, target.currency_code,
    target.total_amount, public.capture_estimate_snapshot(target.id), target_customer_snapshot,
    target.proposal_template_id, nullif(btrim(target_note), ''), nullif(btrim(target_change_reason), ''), auth.uid()
  ) returning * into created;
  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (target.id, auth.uid(), 'version_created');
  return created;
end;
$$;

create or replace function public.mark_estimate_ready(target_estimate_id uuid, expected_revision integer)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare target public.estimates;
begin
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;
  if target.status = 'ready' then return target; end if;
  if target.status <> 'draft' or target.revision <> expected_revision or target.has_incomplete_pricing
     or not exists (select 1 from public.estimate_items where estimate_id = target.id) then
    raise exception 'Estimate is not ready.' using errcode = '23514';
  end if;
  update public.estimates set status = 'ready' where id = target.id returning * into target;
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (target.id, auth.uid(), 'ready');
  return target;
end;
$$;

create or replace function public.transition_estimate_version(
  target_version_id uuid,
  target_status text,
  target_channel text default null,
  target_note text default null
)
returns public.estimate_versions
language plpgsql
security definer
set search_path = public
as $$
declare current_version public.estimate_versions; event_name text;
begin
  select * into current_version from public.estimate_versions where id = target_version_id for update;
  if current_version.id is null or not public.can_access_estimates(current_version.company_id, 'estimates.manage') then
    raise exception 'Estimate version is not available.' using errcode = '42501';
  end if;
  if current_version.status = target_status then return current_version; end if;
  if not ((current_version.status = 'prepared' and target_status = 'sent')
      or (current_version.status = 'sent' and target_status in ('accepted', 'rejected'))) then
    raise exception 'Estimate version transition is not allowed.' using errcode = '23514';
  end if;
  if target_status = 'sent' and not exists (
    select 1 from public.generated_estimate_documents d
    where d.version_id = current_version.id and d.status = 'ready'
  ) then
    raise exception 'Generate the version PDF before marking it sent.' using errcode = '23514';
  end if;
  update public.estimate_versions set
    status = target_status,
    sent_at = case when target_status = 'sent' then now() else sent_at end,
    sent_by = case when target_status = 'sent' then auth.uid() else sent_by end,
    sent_channel = case when target_status = 'sent' then target_channel else sent_channel end,
    recipient_note = case when target_status = 'sent' then nullif(btrim(target_note), '') else recipient_note end,
    accepted_at = case when target_status = 'accepted' then now() else accepted_at end,
    accepted_by = case when target_status = 'accepted' then auth.uid() else accepted_by end,
    acceptance_note = case when target_status = 'accepted' then nullif(btrim(target_note), '') else acceptance_note end,
    rejected_at = case when target_status = 'rejected' then now() else rejected_at end,
    rejected_by = case when target_status = 'rejected' then auth.uid() else rejected_by end,
    rejection_reason = case when target_status = 'rejected' then nullif(btrim(target_note), '') else rejection_reason end
  where id = current_version.id returning * into current_version;
  if target_status = 'accepted' then
    update public.estimates set accepted_version_id = current_version.id, status = 'ready'
    where id = current_version.estimate_id;
  end if;
  event_name := case target_status when 'sent' then 'version_sent' when 'accepted' then 'version_accepted' else 'version_rejected' end;
  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (current_version.estimate_id, auth.uid(), event_name);
  return current_version;
end;
$$;

create or replace function public.restore_estimate_draft_from_version(
  target_version_id uuid,
  target_product_prices jsonb default '[]'::jsonb
)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare source public.estimate_versions; target public.estimates; source_estimate jsonb;
begin
  select * into source from public.estimate_versions where id = target_version_id for update;
  if source.id is null or not public.can_access_estimates(source.company_id, 'estimates.manage') then
    raise exception 'Estimate version is not available.' using errcode = '42501';
  end if;
  select * into target from public.estimates where id = source.estimate_id for update;
  if target.status = 'archived' then raise exception 'Archived estimate cannot be restored.' using errcode = '23514'; end if;
  perform set_config('app.estimate_bulk_operation', 'true', true);
  delete from public.estimate_charges where estimate_id = target.id;
  delete from public.estimate_items where estimate_id = target.id;
  delete from public.estimate_sections where estimate_id = target.id;
  source_estimate := source.snapshot->'estimate';
  update public.estimates set
    name = source_estimate->>'name', customer_name = source_estimate->>'customer_name', project_name = source_estimate->>'project_name',
    currency_code = source_estimate->>'currency_code', currency_rate = (source_estimate->>'currency_rate')::numeric,
    currency_rate_effective_date = (source_estimate->>'currency_rate_effective_date')::date,
    validity_days = (source_estimate->>'validity_days')::integer,
    global_discount_percent = (source_estimate->>'global_discount_percent')::numeric,
    vat_mode = source_estimate->>'vat_mode', vat_rate_percent = (source_estimate->>'vat_rate_percent')::numeric,
    proposal_template_id = source.proposal_template_id, proposal_settings = source_estimate->'proposal_settings',
    source_version_id = source.id, status = 'draft', archived_at = null
  where id = target.id;
  insert into public.estimate_sections(estimate_id, name, sort_order, show_subtotal, discount_percent)
  select target.id, row.name, row.sort_order, row.show_subtotal, row.discount_percent
  from jsonb_to_recordset(source.snapshot->'sections') as row(name text, sort_order integer, show_subtotal boolean, discount_percent numeric);
  insert into public.estimate_items(
    estimate_id, section_id, line_type, product_id, service_id, position, sku_snapshot, product_name_snapshot,
    source_unit_price, source_currency_code, source_snapshot_at, pricing_mode, pricing_input_value,
    internal_cost_unit_price, converted_cost_unit_price, exchange_rate, exchange_rate_effective_date,
    line_discount_percent, description, quantity, unit, selling_unit_price
  )
  select target.id, new_section.id, row.line_type, row.product_id, row.service_id, row.position, row.sku_snapshot, row.product_name_snapshot,
    case when row.line_type = 'product' then price.amount else row.source_unit_price end,
    case when row.line_type = 'product' then price.currency_code else row.source_currency_code end,
    case when row.line_type = 'product' then price.snapshot_at else row.source_snapshot_at end,
    row.pricing_mode,
    case when row.line_type = 'product' then price.converted_price else row.pricing_input_value end,
    row.internal_cost_unit_price,
    case when row.line_type = 'product' then price.converted_price else row.converted_cost_unit_price end,
    case when row.line_type = 'product' then price.exchange_rate else row.exchange_rate end,
    case when row.line_type = 'product' then price.exchange_rate_date else row.exchange_rate_effective_date end,
    row.line_discount_percent, row.description, row.quantity, row.unit,
    case when row.line_type = 'product' then price.converted_price else row.selling_unit_price end
  from jsonb_to_recordset(source.snapshot->'items') as row(
    section_id uuid, line_type text, product_id uuid, service_id uuid, position integer, sku_snapshot text,
    product_name_snapshot text, source_unit_price numeric, source_currency_code text, source_snapshot_at timestamptz,
    pricing_mode text, pricing_input_value numeric, internal_cost_unit_price numeric, converted_cost_unit_price numeric,
    exchange_rate numeric, exchange_rate_effective_date date, line_discount_percent numeric, description text,
    quantity numeric, unit text, selling_unit_price numeric
  )
  join lateral jsonb_to_recordset(source.snapshot->'sections') as source_section(id uuid, sort_order integer)
    on source_section.id = row.section_id
  join public.estimate_sections new_section on new_section.estimate_id = target.id and new_section.sort_order = source_section.sort_order
  left join lateral (
    select p.amount, p.currency_code, p.snapshot_at, p.converted_price, p.exchange_rate, p.exchange_rate_date
    from jsonb_to_recordset(target_product_prices) as p(product_id uuid, amount numeric, currency_code text, snapshot_at timestamptz, converted_price numeric, exchange_rate numeric, exchange_rate_date date)
    where p.product_id = row.product_id limit 1
  ) price on true;
  insert into public.estimate_charges(estimate_id, charge_type, description, amount, vat_applicable, customer_visible, sort_order)
  select target.id, row.charge_type, row.description, row.amount, row.vat_applicable, row.customer_visible, row.sort_order
  from jsonb_to_recordset(source.snapshot->'charges') as row(charge_type text, description text, amount numeric, vat_applicable boolean, customer_visible boolean, sort_order integer);
  perform public.recalculate_estimate_totals(target.id);
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (target.id, auth.uid(), 'draft_restored');
  select * into target from public.estimates where id = target.id;
  return target;
end;
$$;

create or replace function public.duplicate_estimate(target_estimate_id uuid)
returns public.estimates
language plpgsql
security definer
set search_path = public
as $$
declare source public.estimates; created public.estimates;
begin
  select * into source from public.estimates where id = target_estimate_id for update;
  if source.id is null or not public.can_access_estimates(source.company_id, 'estimates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;
  perform set_config('app.estimate_bulk_operation', 'true', true);
  insert into public.estimates(
    company_id, created_by, name, customer_name, project_name, currency_code, currency_rate,
    currency_rate_effective_date, validity_days, global_discount_percent, vat_mode, vat_rate_percent,
    proposal_template_id, proposal_settings, source_estimate_id
  ) values (
    source.company_id, auth.uid(), source.name || ' (РєРѕРїРёСЏ)', source.customer_name, source.project_name,
    source.currency_code, source.currency_rate, source.currency_rate_effective_date, source.validity_days,
    source.global_discount_percent, source.vat_mode, source.vat_rate_percent,
    source.proposal_template_id, source.proposal_settings, source.id
  ) returning * into created;
  insert into public.estimate_sections(estimate_id, name, sort_order, show_subtotal, discount_percent)
  select created.id, name, sort_order, show_subtotal, discount_percent from public.estimate_sections where estimate_id = source.id;
  insert into public.estimate_items(
    estimate_id, section_id, line_type, product_id, service_id, position, sku_snapshot, product_name_snapshot,
    source_unit_price, source_currency_code, source_snapshot_at, pricing_mode, pricing_input_value,
    internal_cost_unit_price, converted_cost_unit_price, exchange_rate, exchange_rate_effective_date,
    line_discount_percent, description, quantity, unit, selling_unit_price
  )
  select created.id, target_section.id, item.line_type, item.product_id, item.service_id, item.position,
    item.sku_snapshot, item.product_name_snapshot, item.source_unit_price, item.source_currency_code,
    item.source_snapshot_at, item.pricing_mode, item.pricing_input_value, item.internal_cost_unit_price,
    item.converted_cost_unit_price, item.exchange_rate, item.exchange_rate_effective_date,
    item.line_discount_percent, item.description, item.quantity, item.unit, item.selling_unit_price
  from public.estimate_items item
  join public.estimate_sections source_section on source_section.id = item.section_id
  join public.estimate_sections target_section on target_section.estimate_id = created.id and target_section.sort_order = source_section.sort_order
  where item.estimate_id = source.id;
  insert into public.estimate_charges(estimate_id, charge_type, description, amount, vat_applicable, customer_visible, sort_order)
  select created.id, charge_type, description, amount, vat_applicable, customer_visible, sort_order
  from public.estimate_charges where estimate_id = source.id;
  perform public.recalculate_estimate_totals(created.id);
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (created.id, auth.uid(), 'duplicated');
  select * into created from public.estimates where id = created.id;
  return created;
end;
$$;

create or replace function public.create_proposal_template_from_estimate(
  target_estimate_id uuid,
  target_name text,
  include_service_lines boolean default false
)
returns public.proposal_templates
language plpgsql
security definer
set search_path = public
as $$
declare target public.estimates; created public.proposal_templates; structure jsonb;
begin
  select * into target from public.estimates where id = target_estimate_id;
  if target.id is null or not public.can_access_estimates(target.company_id, 'proposal_templates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;
  structure := jsonb_build_object(
    'sections', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'sortOrder', s.sort_order, 'showSubtotal', s.show_subtotal) order by s.sort_order) from public.estimate_sections s where s.estimate_id = target.id), '[]'::jsonb),
    'reusableLines', case when include_service_lines then coalesce((select jsonb_agg(jsonb_build_object('sectionSortOrder', s.sort_order, 'lineType', i.line_type, 'description', i.description, 'unit', i.unit) order by i.position) from public.estimate_items i join public.estimate_sections s on s.id = i.section_id where i.estimate_id = target.id and i.line_type in ('service', 'custom')), '[]'::jsonb) else '[]'::jsonb end
  );
  insert into public.proposal_templates(company_id, template_key, name, configuration, estimate_structure, is_system, created_by)
  values (target.company_id, 'estimate-' || gen_random_uuid()::text, btrim(target_name), coalesce(target.proposal_settings, '{}'::jsonb), structure, false, auth.uid())
  returning * into created;
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (target.id, auth.uid(), 'template_created');
  return created;
end;
$$;

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
    return created;
  end if;
  perform set_config('app.estimate_bulk_operation', 'true', true);
  insert into public.estimates(company_id, created_by, name, currency_code, validity_days)
  values (target_cart.company_id, auth.uid(), btrim(target_name), upper(target_currency_code), 14)
  returning * into created;
  insert into public.estimate_sections(estimate_id, name, sort_order) values (created.id, 'РћР±РѕСЂСѓРґРѕРІР°РЅРёРµ', 0) returning id into section_id;
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

create or replace function public.merge_estimate_products_into_cart(
  target_company_id uuid,
  target_estimate_id uuid,
  target_version_id uuid,
  target_items jsonb,
  target_request_key uuid,
  target_summary jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare target_cart public.carts; prior public.estimate_cart_conversions;
begin
  select * into prior from public.estimate_cart_conversions where company_id = target_company_id and request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.direction <> 'estimate_to_cart'
       or prior.estimate_id <> target_estimate_id or prior.version_id is distinct from target_version_id then
      raise exception 'Request key is already used.' using errcode = '23505';
    end if;
    return prior.cart_id;
  end if;
  if not public.can_access_estimates(target_company_id, 'estimates.convert_to_cart')
     or not public.can_manage_partner_order_company(target_company_id)
     or not exists (select 1 from public.estimates e where e.id = target_estimate_id and e.company_id = target_company_id)
     or (target_version_id is not null and not exists (select 1 from public.estimate_versions v where v.id = target_version_id and v.estimate_id = target_estimate_id and v.company_id = target_company_id)) then
    raise exception 'Estimate conversion is not available.' using errcode = '42501';
  end if;
  select * into target_cart from public.carts where company_id = target_company_id and created_by = auth.uid() and status = 'active' for update;
  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status) values (target_company_id, auth.uid(), 'active') returning * into target_cart;
  end if;
  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, row.product_id, least(9999, sum(row.quantity)::integer)
  from jsonb_to_recordset(target_items) as row(product_id uuid, quantity integer)
  join public.catalog_products product on product.id = row.product_id and product.is_active and product.is_visible
  where row.quantity between 1 and 9999
    and ((target_version_id is null and exists (
      select 1
      from public.estimate_items estimate_item
      where estimate_item.estimate_id = target_estimate_id
        and estimate_item.line_type = 'product'
        and estimate_item.product_id = row.product_id
    ))
    or (target_version_id is not null and exists (
      select 1
      from public.estimate_versions source_version,
        jsonb_array_elements(source_version.snapshot -> 'items') snapshot_item
      where source_version.id = target_version_id
        and snapshot_item ->> 'line_type' = 'product'
        and snapshot_item ->> 'product_id' = row.product_id::text
    )))
  group by row.product_id
  on conflict (cart_id, product_id) do update
    set quantity = least(9999, public.cart_items.quantity + excluded.quantity), updated_at = now();
  insert into public.estimate_cart_conversions(company_id, estimate_id, version_id, cart_id, direction, request_key, summary, created_by)
  values (target_company_id, target_estimate_id, target_version_id, target_cart.id, 'estimate_to_cart', target_request_key, target_summary, auth.uid());
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (target_estimate_id, auth.uid(), 'added_to_cart');
  return target_cart.id;
end;
$$;

create or replace function public.claim_estimate_version_document_generation(
  target_version_id uuid,
  target_fingerprint text
)
returns public.generated_estimate_documents
language plpgsql
security definer
set search_path = public
as $$
declare version public.estimate_versions; claimed public.generated_estimate_documents;
begin
  select * into version from public.estimate_versions where id = target_version_id;
  if version.id is null or not public.can_access_estimates(version.company_id, 'estimates.generate_pdf') then
    raise exception 'Estimate version is not available.' using errcode = '42501';
  end if;
  insert into public.generated_estimate_documents(
    company_id, estimate_id, estimate_revision, version_id, template_id, generation_fingerprint, prepared_dto, generated_by
  ) values (
    version.company_id, version.estimate_id, version.estimate_revision, version.id, version.proposal_template_id,
    target_fingerprint, version.customer_proposal_snapshot, auth.uid()
  ) on conflict (company_id, generation_fingerprint) do update set updated_at = public.generated_estimate_documents.updated_at
  returning * into claimed;
  return claimed;
end;
$$;

alter table public.estimate_versions enable row level security;
alter table public.estimate_cart_conversions enable row level security;
revoke all on table public.estimate_versions, public.estimate_cart_conversions from anon, authenticated;
grant select on table public.estimate_versions, public.estimate_cart_conversions to authenticated;

create policy "Company members view estimate versions" on public.estimate_versions for select to authenticated
using (public.can_access_estimates(company_id, 'estimates.view'));
create policy "Company members view estimate conversions" on public.estimate_cart_conversions for select to authenticated
using (public.can_access_estimates(company_id, 'estimates.view'));

revoke all on function public.create_estimate_version(uuid, integer, text, text, jsonb) from public, anon;
revoke all on function public.mark_estimate_ready(uuid, integer) from public, anon;
revoke all on function public.transition_estimate_version(uuid, text, text, text) from public, anon;
revoke all on function public.restore_estimate_draft_from_version(uuid, jsonb) from public, anon;
revoke all on function public.duplicate_estimate(uuid) from public, anon;
revoke all on function public.create_proposal_template_from_estimate(uuid, text, boolean) from public, anon;
revoke all on function public.create_estimate_from_cart(uuid, text, text, jsonb, uuid) from public, anon;
revoke all on function public.merge_estimate_products_into_cart(uuid, uuid, uuid, jsonb, uuid, jsonb) from public, anon;
revoke all on function public.claim_estimate_version_document_generation(uuid, text) from public, anon;

grant execute on function public.create_estimate_version(uuid, integer, text, text, jsonb) to authenticated;
grant execute on function public.mark_estimate_ready(uuid, integer) to authenticated;
grant execute on function public.transition_estimate_version(uuid, text, text, text) to authenticated;
grant execute on function public.restore_estimate_draft_from_version(uuid, jsonb) to authenticated;
grant execute on function public.duplicate_estimate(uuid) to authenticated;
grant execute on function public.create_proposal_template_from_estimate(uuid, text, boolean) to authenticated;
grant execute on function public.create_estimate_from_cart(uuid, text, text, jsonb, uuid) to authenticated;
grant execute on function public.merge_estimate_products_into_cart(uuid, uuid, uuid, jsonb, uuid, jsonb) to authenticated;
grant execute on function public.claim_estimate_version_document_generation(uuid, text) to authenticated;

comment on table public.estimate_versions is 'Immutable commercial snapshots. Content is insert-only; workflow changes use guarded RPCs.';
comment on column public.estimate_versions.snapshot is 'Full portal-owned commercial snapshot for exact revision reuse; never customer-facing directly.';
comment on column public.estimate_versions.customer_proposal_snapshot is 'Allowlisted immutable customer-facing DTO used by preview and PDF.';
