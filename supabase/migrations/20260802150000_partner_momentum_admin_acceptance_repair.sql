begin;

create or replace function public.list_partner_momentum_admin(
  p_page integer default 1,
  p_page_size integer default 25,
  p_status text default null,
  p_manager uuid default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  can_all boolean;
  can_assigned boolean;
  result jsonb;
begin
  can_all := public.has_internal_permission('partner_momentum.view_all');
  can_assigned := public.has_internal_permission('partner_momentum.view_assigned');
  if actor is null or not (can_all or can_assigned) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with allowed as (
    select
      snapshot.*,
      company.display_name as company_name,
      counterparty.fiscal_code,
      company.assigned_internal_manager_user_id as manager_id,
      manager.full_name as manager_name
    from public.partner_momentum_snapshots snapshot
    join public.partner_companies company on company.id = snapshot.company_id
    left join public.one_c_counterparties counterparty
      on lower(counterparty.external_1c_id) = lower(company.external_1c_id)
    left join public.user_profiles manager
      on manager.id = company.assigned_internal_manager_user_id
    where (can_all or company.assigned_internal_manager_user_id = actor)
      and (p_status is null or snapshot.status = p_status)
      and (p_manager is null or company.assigned_internal_manager_user_id = p_manager)
      and (
        p_search is null
        or company.display_name ilike '%' || replace(p_search, '%', '\%') || '%'
        or counterparty.fiscal_code ilike '%' || replace(p_search, '%', '\%') || '%'
      )
  ), counted as (
    select count(*) as total from allowed
  ), page as (
    select allowed.*, (select total from counted) as total_count
    from allowed
    order by
      case status
        when 'high_risk' then 1
        when 'attention_required' then 2
        when 'slowing' then 3
        when 'recovered' then 4
        else 5
      end,
      score,
      company_name,
      company_id
    offset (greatest(p_page, 1) - 1) * greatest(1, least(p_page_size, 100))
    limit greatest(1, least(p_page_size, 100))
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'companyId', page.company_id,
      'companyName', page.company_name,
      'fiscalCode', page.fiscal_code,
      'managerId', page.manager_id,
      'managerName', page.manager_name,
      'status', page.status,
      'score', page.score,
      'lastOrderAt', page.last_order_at,
      'normalOrderIntervalDays', page.normal_order_interval_days,
      'cycleOverrunRatio', page.current_cycle_overrun_ratio,
      'orderCountCurrent', page.order_count_current,
      'orderCountBaseline', page.order_count_baseline,
      'skuCountCurrent', page.sku_count_current,
      'skuCountBaseline', page.sku_count_baseline,
      'reasonCodes', page.safe_reason_codes,
      'calculatedAt', page.calculated_at
    ) order by
      case page.status
        when 'high_risk' then 1
        when 'attention_required' then 2
        when 'slowing' then 3
        when 'recovered' then 4
        else 5
      end,
      page.score,
      page.company_name
    ) filter (where page.company_id is not null), '[]'::jsonb),
    'totalCount', coalesce(max(page.total_count), (select total from counted), 0)
  ) into result
  from page;

  return result;
end;
$$;

revoke all on function public.list_partner_momentum_admin(integer, integer, text, uuid, text)
  from public, anon;
grant execute on function public.list_partner_momentum_admin(integer, integer, text, uuid, text)
  to authenticated;

commit;
