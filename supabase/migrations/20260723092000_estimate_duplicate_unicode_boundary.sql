-- Preserve the existing duplicate behavior while correcting its generated
-- Unicode suffix. No existing rows use the historical corrupted suffix.

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
    source.company_id, auth.uid(), source.name || ' (копия)', source.customer_name, source.project_name,
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

revoke all on function public.duplicate_estimate(uuid) from public, anon;
grant execute on function public.duplicate_estimate(uuid) to authenticated;
