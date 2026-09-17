begin;

create or replace function public.get_partner_service_analytics(
  p_company_id uuid,
  p_month date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
with bounds as (
  select date_trunc('month', p_month)::date as month_start,
    (date_trunc('month', p_month) + interval '1 month')::date as month_end,
    (date_trunc('month', p_month) - interval '1 month')::date as previous_start,
    (date_trunc('month', p_month) - interval '11 months')::date as trend_start
), eligible as (
  select h.id, h.currency_code, h.service_amount, h.vat_amount,
    h.repair_completed_at, h.product_id, h.one_c_product_ref as product_ref,
    coalesce(p.sku, h.product_sku_snapshot) as product_sku,
    coalesce(p.name, h.product_name_snapshot) as product_name,
    nullif(btrim(h.completed_work_summary), '') as work_description
  from public.one_c_service_history h
  left join public.catalog_products p on p.id = h.product_id
  cross join bounds
  where public.has_permission(p_company_id, 'service.view')
    and h.company_id = p_company_id
    and h.partner_visible
    and h.is_active
    and h.completed_service_eligible
    and h.repair_completed_at >= bounds.trend_start
    and h.repair_completed_at < bounds.month_end
), currencies as (
  select distinct currency_code
  from eligible
  where currency_code is not null
), months as (
  select generate_series(
    (select trend_start from bounds),
    (select month_start from bounds),
    interval '1 month'
  )::date as month_start
), monthly as (
  select date_trunc('month', repair_completed_at)::date as month_start,
    currency_code,
    count(*)::integer as completed_service_count,
    coalesce(sum(service_amount), 0)::numeric(18,2) as total_service_amount,
    coalesce(sum(vat_amount), 0)::numeric(18,2) as total_vat_amount
  from eligible
  where currency_code is not null
  group by date_trunc('month', repair_completed_at)::date, currency_code
), trend_grid as (
  select months.month_start, currencies.currency_code,
    coalesce(monthly.completed_service_count, 0)::integer as completed_service_count,
    coalesce(monthly.total_service_amount, 0)::numeric(18,2) as total_service_amount,
    coalesce(monthly.total_vat_amount, 0)::numeric(18,2) as total_vat_amount
  from months cross join currencies
  left join monthly using (month_start, currency_code)
), trend_max as (
  select currency_code, max(total_service_amount) as max_amount
  from trend_grid
  group by currency_code
), selected as (
  select currency_code, completed_service_count, total_service_amount, total_vat_amount
  from monthly, bounds
  where monthly.month_start = bounds.month_start
), previous as (
  select currency_code, completed_service_count, total_service_amount, total_vat_amount
  from monthly, bounds
  where monthly.month_start = bounds.previous_start
), comparison_currencies as (
  select currency_code from selected
  union
  select currency_code from previous
), comparisons as (
  select c.currency_code,
    coalesce(s.completed_service_count, 0)::integer as completed_service_count,
    coalesce(s.total_service_amount, 0)::numeric(18,2) as total_service_amount,
    coalesce(s.total_vat_amount, 0)::numeric(18,2) as total_vat_amount,
    case when coalesce(s.completed_service_count, 0) = 0 then 0::numeric(18,2)
      else round(coalesce(s.total_service_amount, 0) / s.completed_service_count, 2)::numeric(18,2)
    end as average_service_amount,
    coalesce(p.completed_service_count, 0)::integer as previous_completed_service_count,
    coalesce(p.total_service_amount, 0)::numeric(18,2) as previous_total_service_amount,
    (coalesce(s.completed_service_count, 0) - coalesce(p.completed_service_count, 0))::integer as count_delta,
    (coalesce(s.total_service_amount, 0) - coalesce(p.total_service_amount, 0))::numeric(18,2) as amount_delta
  from comparison_currencies c
  left join selected s using (currency_code)
  left join previous p using (currency_code)
), selected_rows as (
  select eligible.*
  from eligible, bounds
  where eligible.repair_completed_at >= bounds.month_start
    and eligible.repair_completed_at < bounds.month_end
), product_grouped as (
  select currency_code,
    max(product_id::text)::uuid as product_id,
    max(product_sku) as product_sku,
    max(product_name) as product_name,
    count(*)::integer as completed_service_count,
    coalesce(sum(service_amount), 0)::numeric(18,2) as total_service_amount
  from selected_rows
  where currency_code is not null
    and (product_id is not null or product_ref is not null or product_name is not null)
  group by currency_code, coalesce(product_id::text, product_ref, lower(product_name), id::text)
), product_ranked as (
  select product_grouped.*,
    row_number() over (
      partition by currency_code
      order by completed_service_count desc, total_service_amount desc, coalesce(product_name, product_sku, product_id::text)
    ) as rank
  from product_grouped
), work_grouped as (
  select currency_code, work_description,
    count(*)::integer as completed_service_count,
    coalesce(sum(service_amount), 0)::numeric(18,2) as total_service_amount
  from selected_rows
  where currency_code is not null and work_description is not null
  group by currency_code, work_description
), work_ranked as (
  select work_grouped.*,
    row_number() over (
      partition by currency_code
      order by completed_service_count desc, total_service_amount desc, work_description
    ) as rank
  from work_grouped
)
select jsonb_build_object(
  'month', to_char(bounds.month_start, 'YYYY-MM'),
  'trendStart', to_char(bounds.trend_start, 'YYYY-MM'),
  'previousMonth', to_char(bounds.previous_start, 'YYYY-MM'),
  'summaries', coalesce((select jsonb_agg(jsonb_build_object(
    'currency', currency_code,
    'completedServiceCount', completed_service_count,
    'totalServiceAmount', total_service_amount::text,
    'totalVatAmount', total_vat_amount::text,
    'averageServiceAmount', average_service_amount::text,
    'previousCompletedServiceCount', previous_completed_service_count,
    'previousTotalServiceAmount', previous_total_service_amount::text,
    'countDelta', count_delta,
    'amountDelta', amount_delta::text
  ) order by currency_code) from comparisons), '[]'::jsonb),
  'trend', coalesce((select jsonb_agg(jsonb_build_object(
    'month', to_char(trend_grid.month_start, 'YYYY-MM'),
    'currency', trend_grid.currency_code,
    'completedServiceCount', trend_grid.completed_service_count,
    'totalServiceAmount', trend_grid.total_service_amount::text,
    'totalVatAmount', trend_grid.total_vat_amount::text,
    'relativeAmountBps', case when trend_max.max_amount > 0
      then round(trend_grid.total_service_amount / trend_max.max_amount * 10000)::integer
      else 0 end
  ) order by trend_grid.currency_code, trend_grid.month_start)
  from trend_grid join trend_max using (currency_code)), '[]'::jsonb),
  'productBreakdown', coalesce((select jsonb_agg(jsonb_build_object(
    'productId', product_id,
    'productSku', product_sku,
    'productName', product_name,
    'currency', currency_code,
    'completedServiceCount', completed_service_count,
    'totalServiceAmount', total_service_amount::text
  ) order by currency_code, rank) from product_ranked where rank <= 5), '[]'::jsonb),
  'workBreakdown', coalesce((select jsonb_agg(jsonb_build_object(
    'workDescription', work_description,
    'currency', currency_code,
    'completedServiceCount', completed_service_count,
    'totalServiceAmount', total_service_amount::text
  ) order by currency_code, rank) from work_ranked where rank <= 5), '[]'::jsonb),
  'missingProductCount', (select count(*) from selected_rows where product_id is null and product_ref is null and product_name is null),
  'missingWorkCount', (select count(*) from selected_rows where work_description is null),
  'unknownCurrencyCount', (select count(*) from selected_rows where currency_code is null)
)
from bounds;
$$;

create or replace function public.get_partner_service_month_export(
  p_company_id uuid,
  p_month date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
with bounds as (
  select date_trunc('month', p_month)::date as month_start,
    (date_trunc('month', p_month) + interval '1 month')::date as month_end
), eligible as (
  select h.id, h.source_document_number, h.repair_completed_at,
    h.product_id, coalesce(p.sku, h.product_sku_snapshot) as product_sku,
    coalesce(p.name, h.product_name_snapshot) as product_name,
    h.masked_serial, h.completed_work_summary, h.normalized_status,
    h.contract_snapshot, h.service_amount, h.vat_amount, h.currency_code
  from public.one_c_service_history h
  left join public.catalog_products p on p.id = h.product_id
  cross join bounds
  where public.has_permission(p_company_id, 'service.view')
    and h.company_id = p_company_id
    and h.partner_visible
    and h.is_active
    and h.completed_service_eligible
    and h.repair_completed_at >= bounds.month_start
    and h.repair_completed_at < bounds.month_end
), totals as (
  select currency_code,
    count(*)::integer as completed_service_count,
    coalesce(sum(service_amount), 0)::numeric(18,2) as total_service_amount,
    coalesce(sum(vat_amount), 0)::numeric(18,2) as total_vat_amount
  from eligible
  where currency_code is not null
  group by currency_code
), bounded as (
  select * from eligible
  order by repair_completed_at, source_document_number, id
  limit 5001
)
select jsonb_build_object(
  'companyName', (select display_name from public.partner_companies where id = p_company_id),
  'month', to_char(bounds.month_start, 'YYYY-MM'),
  'rows', coalesce((select jsonb_agg(jsonb_build_object(
    'id', id,
    'documentNumber', source_document_number,
    'completionDate', repair_completed_at,
    'productId', product_id,
    'productSku', product_sku,
    'productName', product_name,
    'maskedSerial', masked_serial,
    'workDescription', completed_work_summary,
    'status', normalized_status,
    'contract', contract_snapshot,
    'serviceAmount', service_amount::text,
    'vatAmount', vat_amount::text,
    'currency', currency_code
  ) order by repair_completed_at, source_document_number, id) from bounded where (select count(*) from bounded) <= 5000), '[]'::jsonb),
  'totals', coalesce((select jsonb_agg(jsonb_build_object(
    'currency', currency_code,
    'completedServiceCount', completed_service_count,
    'totalServiceAmount', total_service_amount::text,
    'totalVatAmount', total_vat_amount::text
  ) order by currency_code) from totals), '[]'::jsonb),
  'rowCount', (select count(*) from eligible),
  'truncated', (select count(*) from bounded) > 5000
)
from bounds;
$$;

create or replace function public.get_partner_service_workspace(
  p_company_id uuid,
  p_query text default '',
  p_filter text default 'all',
  p_page integer default 1,
  p_page_size integer default 20,
  p_month date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
select jsonb_build_object(
  'history', public.list_partner_service_history(p_company_id, p_query, p_filter, p_page, p_page_size),
  'monthlySummary', public.get_partner_service_month_summary(p_company_id, p_month),
  'analytics', public.get_partner_service_analytics(p_company_id, p_month)
);
$$;

revoke execute on function public.get_partner_service_analytics(uuid, date),
  public.get_partner_service_month_export(uuid, date)
  from public, anon;
grant execute on function public.get_partner_service_analytics(uuid, date),
  public.get_partner_service_month_export(uuid, date)
  to authenticated;

commit;
