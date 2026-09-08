-- Add rolling year-over-year Sales comparisons to the existing single
-- company-scoped Dashboard aggregate. Commercial truth remains the local,
-- posted, partner-visible 1C order history projection.
create function public.get_partner_workspace_dashboard_v7(p_company_id uuid)
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
  business_date date := (now() at time zone 'Europe/Chisinau')::date;
  graph_start date;
  source_start date;
begin
  if auth.uid() is null or not public.has_active_company_membership(p_company_id) then
    raise exception 'Partner Dashboard access denied.' using errcode = '42501';
  end if;

  result := public.get_partner_workspace_dashboard_v5(p_company_id);
  graph_start := (date_trunc('month', business_date) - interval '11 months')::date;
  source_start := least(
    graph_start,
    ((business_date - 179) - interval '1 year')::date
  );

  if public.has_permission(p_company_id, 'orders.view') then
    with periods(days, current_start, current_end, previous_start, previous_end) as (
      values
        (30, business_date - 29, business_date, ((business_date - 29) - interval '1 year')::date, (business_date - interval '1 year')::date),
        (60, business_date - 59, business_date, ((business_date - 59) - interval '1 year')::date, (business_date - interval '1 year')::date),
        (90, business_date - 89, business_date, ((business_date - 89) - interval '1 year')::date, (business_date - interval '1 year')::date),
        (180, business_date - 179, business_date, ((business_date - 179) - interval '1 year')::date, (business_date - interval '1 year')::date)
    ), eligible_orders as materialized (
      select
        (history.one_c_document_date at time zone 'Europe/Chisinau')::date as order_date,
        date_trunc('month', history.one_c_document_date at time zone 'Europe/Chisinau')::date as month,
        nullif(upper(btrim(history.currency_code)), '') as currency,
        history.document_total
      from public.partner_order_history history
      where history.company_id = p_company_id
        and history.partner_visible
        and history.one_c_posted
        and not history.one_c_deletion_mark
        and history.one_c_document_date >= (source_start::timestamp at time zone 'Europe/Chisinau')
        and history.one_c_document_date < ((business_date + 1)::timestamp at time zone 'Europe/Chisinau')
    ), currencies as (
      select distinct orders.currency
      from eligible_orders orders
      where orders.currency is not null
    ), monthly as (
      select orders.month, orders.currency,
        sum(orders.document_total) as amount,
        count(*)::integer as order_count
      from eligible_orders orders
      where orders.currency is not null
        and orders.order_date between graph_start and business_date
      group by orders.month, orders.currency
    ), graph_totals as (
      select currencies.currency,
        coalesce(sum(orders.document_total) filter (
          where orders.order_date between graph_start and business_date
        ), 0) as amount,
        count(*) filter (
          where orders.order_date between graph_start and business_date
        )::integer as order_count
      from currencies
      left join eligible_orders orders on orders.currency = currencies.currency
      group by currencies.currency
    ), comparisons as (
      select currencies.currency,
        periods.days,
        periods.current_start,
        periods.current_end,
        periods.previous_start,
        periods.previous_end,
        coalesce(sum(orders.document_total) filter (
          where orders.order_date between periods.current_start and periods.current_end
        ), 0) as current_amount,
        coalesce(sum(orders.document_total) filter (
          where orders.order_date between periods.previous_start and periods.previous_end
        ), 0) as previous_amount,
        count(*) filter (
          where orders.order_date between periods.current_start and periods.current_end
        )::integer as current_order_count,
        count(*) filter (
          where orders.order_date between periods.previous_start and periods.previous_end
        )::integer as previous_order_count
      from currencies
      cross join periods
      left join eligible_orders orders
        on orders.currency = currencies.currency
       and (
         orders.order_date between periods.current_start and periods.current_end
         or orders.order_date between periods.previous_start and periods.previous_end
       )
      group by currencies.currency, periods.days, periods.current_start,
        periods.current_end, periods.previous_start, periods.previous_end
    ), sales_series as (
      select totals.currency, totals.amount, totals.order_count,
        case when totals.order_count = 0 then 0
          else totals.amount / totals.order_count end as average_order,
        (
          select jsonb_agg(jsonb_build_object(
            'month', months.month::date::text,
            'amount', coalesce(monthly.amount, 0),
            'orderCount', coalesce(monthly.order_count, 0)
          ) order by months.month)
          from generate_series(graph_start, date_trunc('month', business_date)::date, interval '1 month') months(month)
          left join monthly
            on monthly.currency = totals.currency
           and monthly.month = months.month::date
        ) as points,
        (
          select jsonb_agg(jsonb_build_object(
            'days', comparison.days,
            'currentStart', comparison.current_start::text,
            'currentEnd', comparison.current_end::text,
            'previousStart', comparison.previous_start::text,
            'previousEnd', comparison.previous_end::text,
            'currentAmount', comparison.current_amount,
            'previousAmount', comparison.previous_amount,
            'currentOrderCount', comparison.current_order_count,
            'previousOrderCount', comparison.previous_order_count
          ) order by comparison.days)
          from comparisons comparison
          where comparison.currency = totals.currency
        ) as comparisons
      from graph_totals totals
    )
    select jsonb_build_object(
      'businessDate', business_date::text,
      'periodStart', graph_start::text,
      'periodEnd', business_date::text,
      'series', coalesce(jsonb_agg(jsonb_build_object(
        'currency', sales_series.currency,
        'total', sales_series.amount,
        'orderCount', sales_series.order_count,
        'averageOrder', sales_series.average_order,
        'comparisons', sales_series.comparisons,
        'points', sales_series.points
      ) order by sales_series.currency), '[]'::jsonb)
    )
    into sales_analytics
    from sales_series;
  else
    sales_analytics := jsonb_build_object(
      'businessDate', business_date::text,
      'periodStart', graph_start::text,
      'periodEnd', business_date::text,
      'series', '[]'::jsonb
    );
  end if;

  return jsonb_set(result, '{salesAnalytics}', sales_analytics, true);
end;
$$;

revoke all on function public.get_partner_workspace_dashboard_v7(uuid)
  from public, anon, authenticated;
grant execute on function public.get_partner_workspace_dashboard_v7(uuid)
  to authenticated;

comment on function public.get_partner_workspace_dashboard_v7(uuid) is
  'Returns one governed partner Dashboard aggregate with twelve-month Sales context and precomputed 30/60/90/180-day year-over-year comparisons by currency.';
