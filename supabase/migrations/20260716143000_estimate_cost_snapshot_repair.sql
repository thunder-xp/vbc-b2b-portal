-- Repair legacy Slice 1 product costs that were not in the estimate currency.
update public.estimate_items item
set converted_cost_unit_price = null,
    exchange_rate = null,
    exchange_rate_effective_date = null
from public.estimates estimate
where estimate.id = item.estimate_id
  and item.source_currency_code is not null
  and item.source_currency_code <> estimate.currency_code;

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
  has_missing_cost boolean;
  gross_profit numeric(18, 2);
begin
  select * into target from public.estimates where id = target_estimate_id;
  if target.id is null then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  select
    coalesce(sum(item.line_subtotal), 0),
    coalesce(sum(item.line_discount_amount), 0),
    coalesce(sum(coalesce(item.converted_cost_unit_price, 0) * item.quantity), 0),
    coalesce(bool_or(item.converted_cost_unit_price is null), false)
  into raw_subtotal, line_discounts, total_cost, has_missing_cost
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

  gross_profit := case when has_missing_cost then null else round(excluding_vat - total_cost, 2) end;
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
      overall_margin_percent = case when gross_profit is not null and excluding_vat > 0 then round(gross_profit / excluding_vat * 100, 4) else null end,
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

do $$
declare target_id uuid;
begin
  for target_id in select id from public.estimates loop
    perform public.recalculate_estimate_totals(target_id);
  end loop;
end;
$$;
