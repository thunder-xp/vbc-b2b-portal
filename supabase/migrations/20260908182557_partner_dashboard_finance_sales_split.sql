-- Keep Finance and Sales on the existing single Dashboard aggregate request.
-- Sales truth comes only from posted, partner-visible local 1C order history.
create function public.get_partner_workspace_dashboard_v6(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
  sales_analytics jsonb;
  period_start date := (date_trunc('month', current_date) - interval '11 months')::date;
  period_end date := current_date;
begin
  if auth.uid() is null or not public.has_active_company_membership(p_company_id) then
    raise exception 'Partner Dashboard access denied.' using errcode = '42501';
  end if;

  result := public.get_partner_workspace_dashboard_v5(p_company_id);

  if public.has_permission(p_company_id, 'orders.view') then
    with eligible_orders as (
      select
        date_trunc('month', history.one_c_document_date)::date as month,
        nullif(upper(btrim(history.currency_code)), '') as currency,
        history.document_total
      from public.partner_order_history history
      where history.company_id = p_company_id
        and history.partner_visible
        and history.one_c_posted
        and not history.one_c_deletion_mark
        and history.one_c_document_date >= period_start::timestamptz
        and history.one_c_document_date < (period_end + 1)::timestamptz
    ), monthly as (
      select orders.month, orders.currency,
        sum(orders.document_total) as amount,
        count(*)::integer as order_count
      from eligible_orders orders
      where orders.currency is not null
      group by orders.month, orders.currency
    ), totals as (
      select orders.currency,
        sum(orders.document_total) as amount,
        count(*)::integer as order_count,
        case when count(*) = 0 then 0
          else sum(orders.document_total) / count(*) end as average_order
      from eligible_orders orders
      where orders.currency is not null
      group by orders.currency
    ), sales_series as (
      select totals.currency, totals.amount, totals.order_count, totals.average_order,
        (
          select jsonb_agg(jsonb_build_object(
            'month', months.month::date::text,
            'amount', coalesce(monthly.amount, 0),
            'orderCount', coalesce(monthly.order_count, 0)
          ) order by months.month)
          from generate_series(period_start, date_trunc('month', period_end)::date, interval '1 month') months(month)
          left join monthly
            on monthly.currency = totals.currency
           and monthly.month = months.month::date
        ) as points
      from totals
    )
    select jsonb_build_object(
      'periodStart', period_start::text,
      'periodEnd', period_end::text,
      'series', coalesce(jsonb_agg(jsonb_build_object(
        'currency', sales_series.currency,
        'total', sales_series.amount,
        'orderCount', sales_series.order_count,
        'averageOrder', sales_series.average_order,
        'points', sales_series.points
      ) order by sales_series.currency), '[]'::jsonb)
    )
    into sales_analytics
    from sales_series;
  else
    sales_analytics := jsonb_build_object(
      'periodStart', period_start::text,
      'periodEnd', period_end::text,
      'series', '[]'::jsonb
    );
  end if;

  return jsonb_set(result, '{salesAnalytics}', sales_analytics, true);
end;
$$;

revoke all on function public.get_partner_workspace_dashboard_v6(uuid)
  from public, anon, authenticated;
grant execute on function public.get_partner_workspace_dashboard_v6(uuid)
  to authenticated;

comment on function public.get_partner_workspace_dashboard_v6(uuid) is
  'Returns the existing partner Dashboard plus company-scoped, posted 1C sales totals grouped monthly and by currency for the current twelve-month window.';
