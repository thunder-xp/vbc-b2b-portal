begin;

create or replace function public.get_partner_workspace_dashboard_v2(
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  can_view_orders boolean;
  can_manage_orders boolean;
  can_view_catalog boolean;
  can_view_finance boolean;
  can_manage_company boolean;
  can_view_estimates boolean;
  can_view_lists boolean;
  result jsonb;
begin
  if auth.uid() is null
    or p_company_id is null
    or not public.has_active_company_membership(p_company_id)
  then
    raise exception 'Partner dashboard access denied.' using errcode = '42501';
  end if;

  can_view_orders := public.has_permission(p_company_id, 'orders.view')
    or public.has_permission(p_company_id, 'orders.manage');
  can_manage_orders := public.has_permission(p_company_id, 'orders.manage');
  can_view_catalog := public.has_permission(p_company_id, 'catalog.view');
  can_view_finance := public.has_permission(p_company_id, 'finance.view_company');
  can_manage_company := public.has_permission(p_company_id, 'company_users.manage');
  can_view_estimates := public.has_permission(p_company_id, 'estimates.view');
  can_view_lists := public.has_permission(p_company_id, 'purchasing_lists.view');

  with
  visible_history as (
    select history.*
    from public.partner_order_history history
    where can_view_orders
      and history.company_id = p_company_id
      and history.partner_visible
      and not history.one_c_deletion_mark
  ),
  latest_date_change as (
    select distinct on (request.order_history_id)
      request.id,
      request.order_history_id,
      request.status,
      request.review_comment,
      request.created_at,
      request.updated_at
    from public.partner_order_date_change_requests request
    where can_view_orders
      and request.company_id = p_company_id
    order by request.order_history_id, request.created_at desc, request.id
  ),
  attention as (
    select *
    from (
      select
        portal_order.id,
        'portal_order_failure'::text as kind,
        portal_order.id as object_id,
        portal_order.external_1c_number as object_number,
        portal_order.updated_at as occurred_at,
        null::text as comment,
        10 as priority
      from public.partner_orders portal_order
      where can_manage_orders
        and portal_order.company_id = p_company_id
        and portal_order.integration_status in (
          'failed', 'reconciliation_required', 'confirmed_not_created',
          'manual_review_required'
        )

      union all

      select
        history.id,
        case
          when history.one_c_delivery_date < current_date then 'shipment_overdue'
          else 'shipment_today'
        end,
        history.id,
        history.external_1c_order_number,
        history.one_c_delivery_date::timestamptz,
        null::text,
        case when history.one_c_delivery_date < current_date then 20 else 30 end
      from visible_history history
      where history.one_c_delivery_date <= current_date
        and coalesce(history.one_c_state_code, '') <> 'completed'

      union all

      select
        request.id,
        case request.status
          when 'pending' then 'date_change_pending'
          else 'date_change_rejected'
        end,
        request.order_history_id,
        history.external_1c_order_number,
        coalesce(request.updated_at, request.created_at),
        request.review_comment,
        case when request.status = 'rejected' then 40 else 50 end
      from latest_date_change request
      join visible_history history on history.id = request.order_history_id
      where request.status in ('pending', 'rejected')

      union all

      select
        invitation.id,
        'invitation_expiring',
        invitation.id,
        null::text,
        invitation.expires_at,
        null::text,
        60
      from public.invitations invitation
      where can_manage_company
        and invitation.company_id = p_company_id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
        and invitation.expires_at <= now() + interval '7 days'
    ) candidates
    order by priority, occurred_at
    limit 8
  ),
  recent_history as (
    select
      history.id,
      history.external_1c_order_number as number,
      history.one_c_document_date as date,
      history.one_c_posted as posted,
      history.one_c_state_code as state_code,
      history.one_c_delivery_date as planned_date,
      history.position_count,
      history.document_total as total,
      history.currency_code as currency,
      '/cabinet/orders/' || history.id::text as href
    from visible_history history
  ),
  recent_portal_orders as (
    select
      portal_order.id,
      coalesce(
        nullif(portal_order.external_1c_number, ''),
        'Заказ обрабатывается'
      ) as number,
      coalesce(portal_order.external_1c_date, portal_order.created_at) as date,
      false as posted,
      null::text as state_code,
      portal_order.requested_delivery_date as planned_date,
      count(item.id)::integer as position_count,
      coalesce(sum(item.line_total), 0)::numeric as total,
      max(item.currency_code) as currency,
      '/cabinet/orders/' || portal_order.id::text as href
    from public.partner_orders portal_order
    left join public.partner_order_items item on item.order_id = portal_order.id
    where can_manage_orders
      and portal_order.company_id = p_company_id
      and not exists (
        select 1
        from visible_history history
        where history.portal_order_id = portal_order.id
      )
    group by portal_order.id
  ),
  recent_orders as (
    select * from recent_history
    union all
    select * from recent_portal_orders
    order by date desc, id
    limit 3
  ),
  shipment_counts as (
    select
      count(*) filter (where one_c_delivery_date < current_date) as overdue,
      count(*) filter (where one_c_delivery_date = current_date) as today,
      count(*) filter (
        where one_c_delivery_date > current_date
          and one_c_delivery_date <= current_date + 3
      ) as next_three_days,
      count(*) filter (where one_c_delivery_date > current_date + 3) as later
    from visible_history
    where one_c_delivery_date is not null
      and coalesce(one_c_state_code, '') <> 'completed'
  ),
  nearest_shipments as (
    select
      history.id,
      history.external_1c_order_number,
      history.one_c_delivery_date,
      history.position_count,
      history.total_unit_count,
      history.one_c_posted,
      history.one_c_state_code,
      exists (
        select 1
        from latest_date_change request
        where request.order_history_id = history.id
          and request.status = 'pending'
      ) as pending_date_change
    from visible_history history
    where history.one_c_delivery_date is not null
      and coalesce(history.one_c_state_code, '') <> 'completed'
    order by history.one_c_delivery_date, history.id
    limit 3
  ),
  active_cart as (
    select
      cart.id,
      cart.updated_at,
      count(item.id)::integer as position_count,
      coalesce(sum(item.quantity), 0)::numeric as total_units
    from public.carts cart
    left join public.cart_items item on item.cart_id = cart.id
    where can_manage_orders
      and cart.company_id = p_company_id
      and cart.created_by = auth.uid()
      and cart.status = 'active'
    group by cart.id, cart.updated_at
    having count(item.id) > 0
    order by cart.updated_at desc
    limit 1
  ),
  latest_estimate as (
    select
      estimate.id,
      estimate.name,
      estimate.updated_at,
      count(item.id)::integer as position_count
    from public.estimates estimate
    left join public.estimate_items item on item.estimate_id = estimate.id
    where can_view_estimates
      and estimate.company_id = p_company_id
      and estimate.status = 'draft'
      and estimate.archived_at is null
    group by estimate.id, estimate.name, estimate.updated_at
    order by estimate.updated_at desc, estimate.id
    limit 1
  ),
  latest_list as (
    select
      list.id,
      list.name,
      list.updated_at,
      count(item.id)::integer as position_count,
      coalesce(sum(item.quantity), 0)::numeric as total_units
    from public.purchasing_lists list
    left join public.purchasing_list_items item on item.list_id = list.id
    where can_view_lists
      and list.company_id = p_company_id
      and list.archived_at is null
      and public.can_view_purchasing_list(list)
      and not coalesce(list.is_system_favorites, false)
    group by list.id, list.name, list.updated_at
    having count(item.id) > 0
    order by list.updated_at desc, list.id
    limit 1
  ),
  continuation as (
    select id, 'cart'::text as kind, null::text as name,
      position_count, total_units, updated_at
    from active_cart
    union all
    select id, 'estimate', name, position_count, 0::numeric, updated_at
    from latest_estimate
    union all
    select id, 'purchasing_list', name, position_count, total_units, updated_at
    from latest_list
  ),
  reorder_ranked as (
    select
      item.product_id,
      count(distinct history.id)::integer as purchase_count,
      count(distinct history.id) filter (
        where history.one_c_posted or history.one_c_state_code = 'completed'
      )::integer as completed_purchase_count,
      max(history.one_c_document_date) as last_purchased_at,
      round(avg(item.quantity), 0) as typical_quantity,
      row_number() over (
        order by
          count(distinct history.id) desc,
          max(history.one_c_document_date) desc,
          count(distinct history.id) filter (
            where history.one_c_posted or history.one_c_state_code = 'completed'
          ) desc,
          item.product_id
      ) as rank
    from visible_history history
    join public.partner_order_history_items item
      on item.order_history_id = history.id
    join public.catalog_products product
      on product.id = item.product_id
      and product.is_active
      and product.is_visible
      and nullif(product.external_1c_id, '') is not null
    where can_view_catalog
    group by item.product_id
    having count(distinct history.id) >= 2
  ),
  reorder_products as (
    select
      product.id,
      product.sku,
      product.name,
      product.slug,
      coalesce(product.image_source_url, product.image_url) as image_url,
      product.category_id,
      category.name as category_name,
      ranked.purchase_count,
      ranked.completed_purchase_count,
      ranked.last_purchased_at,
      ranked.typical_quantity
    from reorder_ranked ranked
    join public.catalog_products product on product.id = ranked.product_id
    left join public.catalog_categories category on category.id = product.category_id
    where ranked.rank <= 8
    order by ranked.rank
  ),
  merchandising_ranked as (
    select
      assignment.product_id,
      assignment.label_code,
      assignment.priority,
      row_number() over (
        partition by assignment.product_id
        order by assignment.priority desc, assignment.label_code
      ) as product_label_rank,
      row_number() over (
        order by
          case assignment.label_code when 'HOT' then 1 when 'TOP' then 2 else 3 end,
          assignment.priority desc,
          assignment.updated_at desc,
          assignment.product_id
      ) as overall_rank
    from public.product_merchandising_assignments assignment
    join public.catalog_products product
      on product.id = assignment.product_id
      and product.is_active
      and product.is_visible
    where can_view_catalog
      and assignment.is_active
      and assignment.is_curated_visible
      and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
  ),
  merchandising_products as (
    select
      product.id,
      product.sku,
      product.name,
      product.slug,
      coalesce(product.image_source_url, product.image_url) as image_url,
      product.category_id,
      category.name as category_name,
      array_agg(distinct ranked.label_code order by ranked.label_code) as labels,
      min(ranked.overall_rank) as rank
    from merchandising_ranked ranked
    join public.catalog_products product on product.id = ranked.product_id
    left join public.catalog_categories category on category.id = product.category_id
    where ranked.product_label_rank <= 2
    group by product.id, category.name
    order by min(ranked.overall_rank), product.id
    limit 4
  ),
  finance_totals as (
    select
      balance.currency_code,
      sum(case when balance.signed_balance > 0 then balance.signed_balance else 0 end) as receivable,
      abs(sum(case when balance.signed_balance < 0 then balance.signed_balance else 0 end)) as advance
    from public.partner_contract_balances balance
    where can_view_finance
      and balance.company_id = p_company_id
      and balance.is_active
    group by balance.currency_code
    order by balance.currency_code
  ),
  finance_state as (
    select state.*
    from public.partner_finance_sync_state state
    where can_view_finance and state.company_id = p_company_id
  ),
  company_counts as (
    select
      count(*) filter (where membership.status = 'active')::integer as active_employees,
      count(*) filter (where membership.status = 'suspended')::integer as suspended_employees,
      count(*) filter (
        where membership.status = 'active'
          and exists (
            select 1
            from public.membership_permission_overrides override
            join public.permissions permission on permission.id = override.permission_id
            where override.membership_id = membership.id
              and permission.code = 'pricing.partner_price.view'
              and override.effect = 'deny'
          )
      )::integer as retail_only_employees
    from public.company_memberships membership
    where can_manage_company and membership.company_id = p_company_id
  ),
  invitation_counts as (
    select
      count(*) filter (
        where invitation.status = 'pending' and invitation.expires_at > now()
      )::integer as pending_invitations,
      count(*) filter (
        where invitation.status = 'pending'
          and invitation.expires_at > now()
          and invitation.expires_at <= now() + interval '7 days'
      )::integer as expiring_invitations
    from public.invitations invitation
    where can_manage_company and invitation.company_id = p_company_id
  )
  select jsonb_build_object(
    'attentionItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', item.kind,
        'objectId', item.object_id,
        'objectNumber', item.object_number,
        'occurredAt', item.occurred_at,
        'comment', item.comment
      ) order by item.priority, item.occurred_at)
      from attention item
    ), '[]'::jsonb),
    'orderSummary', jsonb_build_object(
      'active', (
        select count(*) from visible_history history
        where coalesce(history.one_c_state_code, '') <> 'completed'
      ) + (
        select count(*)
        from public.partner_orders portal_order
        where can_manage_orders
          and portal_order.company_id = p_company_id
          and portal_order.integration_status in (
            'processing', 'confirmed', 'reconciliation_required',
            'manual_review_required'
          )
          and not exists (
            select 1 from visible_history history
            where history.portal_order_id = portal_order.id
          )
      ),
      'confirmed', (
        select count(*) from visible_history history where history.one_c_posted
      ) + (
        select count(*)
        from public.partner_orders portal_order
        where can_manage_orders
          and portal_order.company_id = p_company_id
          and portal_order.integration_status = 'confirmed'
          and not exists (
            select 1 from visible_history history
            where history.portal_order_id = portal_order.id
          )
      ),
      'attention', (
        select count(*) from attention
        where kind in ('portal_order_failure', 'shipment_overdue', 'date_change_rejected')
      ),
      'portalProcessing', (
        select count(*) from public.partner_orders portal_order
        where can_manage_orders
          and portal_order.company_id = p_company_id
          and portal_order.integration_status in (
            'processing', 'reconciliation_required', 'manual_review_required'
          )
      ),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', recent.id,
          'number', recent.number,
          'date', recent.date,
          'posted', recent.posted,
          'stateCode', recent.state_code,
          'plannedDate', recent.planned_date,
          'positionCount', recent.position_count,
          'total', recent.total,
          'currency', recent.currency,
          'href', recent.href
        ) order by recent.date desc, recent.id)
        from recent_orders recent
      ), '[]'::jsonb)
    ),
    'shipmentSummary', jsonb_build_object(
      'overdue', coalesce((select overdue from shipment_counts), 0),
      'today', coalesce((select today from shipment_counts), 0),
      'nextThreeDays', coalesce((select next_three_days from shipment_counts), 0),
      'later', coalesce((select later from shipment_counts), 0),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', shipment.id,
          'orderNumber', shipment.external_1c_order_number,
          'plannedDate', shipment.one_c_delivery_date,
          'positionCount', shipment.position_count,
          'totalUnits', shipment.total_unit_count,
          'posted', shipment.one_c_posted,
          'stateCode', shipment.one_c_state_code,
          'pendingDateChange', shipment.pending_date_change
        ) order by shipment.one_c_delivery_date, shipment.id)
        from nearest_shipments shipment
      ), '[]'::jsonb)
    ),
    'continuationItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', item.kind,
        'name', item.name,
        'positionCount', item.position_count,
        'totalUnits', item.total_units,
        'updatedAt', item.updated_at
      ) order by item.updated_at desc)
      from continuation item
    ), '[]'::jsonb),
    'reorderProducts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product.id,
        'sku', product.sku,
        'name', product.name,
        'slug', product.slug,
        'imageUrl', product.image_url,
        'categoryId', product.category_id,
        'categoryName', product.category_name,
        'labelCodes', '[]'::jsonb,
        'purchaseCount', product.purchase_count,
        'completedPurchaseCount', product.completed_purchase_count,
        'lastPurchasedAt', product.last_purchased_at,
        'typicalQuantity', product.typical_quantity
      ) order by product.purchase_count desc, product.last_purchased_at desc, product.id)
      from reorder_products product
    ), '[]'::jsonb),
    'merchandisingProducts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product.id,
        'sku', product.sku,
        'name', product.name,
        'slug', product.slug,
        'imageUrl', product.image_url,
        'categoryId', product.category_id,
        'categoryName', product.category_name,
        'labelCodes', to_jsonb(product.labels)
      ) order by product.rank, product.id)
      from merchandising_products product
    ), '[]'::jsonb),
    'financeSummary', case when can_view_finance then jsonb_build_object(
      'totals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'currency', total.currency_code,
          'receivable', total.receivable,
          'advance', total.advance
        ) order by total.currency_code)
        from finance_totals total
      ), '[]'::jsonb),
      'contractCount', (
        select count(*) from public.partner_contract_balances balance
        where balance.company_id = p_company_id and balance.is_active
      ),
      'lastSuccessfulAt', (select state.last_success_at from finance_state state),
      'stale', coalesce((
        select state.last_success_at is null
          or state.last_success_at < now() - interval '3 hours'
          or state.status = 'failed'
        from finance_state state
      ), true)
    ) else null end,
    'companySummary', case when can_manage_company then jsonb_build_object(
      'activeEmployees', coalesce((select active_employees from company_counts), 0),
      'pendingInvitations', coalesce((select pending_invitations from invitation_counts), 0),
      'suspendedEmployees', coalesce((select suspended_employees from company_counts), 0),
      'retailOnlyEmployees', coalesce((select retail_only_employees from company_counts), 0),
      'expiringInvitations', coalesce((select expiring_invitations from invitation_counts), 0),
      'portalStatus', (
        select company.status
        from public.partner_companies company
        where company.id = p_company_id
      ),
      'commercialReady', coalesce((
        select nullif(company.external_1c_id, '') is not null
          and nullif(company.external_1c_price_type_id, '') is not null
        from public.partner_companies company
        where company.id = p_company_id
      ), false)
    ) else null end,
    'freshness', jsonb_build_object(
      'ordersUpdatedAt', (
        select greatest(
          state.last_successful_full_sync_at,
          state.last_incremental_sync_at
        )
        from public.partner_order_history_sync_state state
        where state.company_id = p_company_id
      ),
      'financeUpdatedAt', (select state.last_success_at from finance_state state)
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_partner_workspace_dashboard_v2(uuid)
  from public, anon;
grant execute on function public.get_partner_workspace_dashboard_v2(uuid)
  to authenticated;

comment on function public.get_partner_workspace_dashboard_v2(uuid) is
  'Read-only tenant-bound operational dashboard aggregate. Uses local read models only and returns bounded product candidates.';

commit;
