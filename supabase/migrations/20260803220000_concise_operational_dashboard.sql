begin;

create table public.partner_dashboard_attention_dismissals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  item_type text not null,
  item_id uuid not null,
  source_id uuid not null,
  source_fingerprint text not null,
  policy text not null,
  dismiss_until timestamptz,
  dismissed_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, item_type, source_id),
  check (source_fingerprint ~ '^[0-9a-f]{32}$'),
  check (policy in ('until_source_change', 'cooldown_7_days')),
  check ((policy = 'cooldown_7_days') = (dismiss_until is not null))
);

create index partner_dashboard_attention_dismissals_lookup_idx
  on public.partner_dashboard_attention_dismissals(company_id, item_type, source_id, source_fingerprint);

create table public.partner_dashboard_attention_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  item_type text not null,
  source_id uuid not null,
  source_fingerprint text not null,
  event_type text not null check (event_type = 'dismissed'),
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  policy text not null,
  dismiss_until timestamptz,
  occurred_at timestamptz not null default now()
);

create index partner_dashboard_attention_events_company_idx
  on public.partner_dashboard_attention_events(company_id, occurred_at desc);

alter table public.partner_dashboard_attention_dismissals enable row level security;
alter table public.partner_dashboard_attention_events enable row level security;
revoke all on public.partner_dashboard_attention_dismissals,
  public.partner_dashboard_attention_events from public, anon, authenticated;
grant select, insert, update, delete on public.partner_dashboard_attention_dismissals to service_role;
grant select, insert on public.partner_dashboard_attention_events to service_role;

create or replace function public.prevent_partner_dashboard_attention_event_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'dashboard_attention_event_history_is_immutable' using errcode = '55000';
end;
$$;

create trigger prevent_partner_dashboard_attention_event_mutation
before update or delete on public.partner_dashboard_attention_events
for each row execute function public.prevent_partner_dashboard_attention_event_mutation();

revoke all on function public.prevent_partner_dashboard_attention_event_mutation()
  from public, anon, authenticated;

create or replace function public.is_partner_test_order(
  p_state_code text,
  p_state_raw text,
  p_is_governed_test_contract boolean default false
)
returns boolean language sql immutable parallel safe set search_path = public as $$
  select lower(coalesce(btrim(p_state_code), '')) = 'test'
    or upper(coalesce(btrim(p_state_raw), '')) in ('ТЕСТ', 'TEST')
    or coalesce(p_is_governed_test_contract, false);
$$;

revoke all on function public.is_partner_test_order(text,text,boolean) from public, anon;
grant execute on function public.is_partner_test_order(text,text,boolean) to authenticated, service_role;

create or replace function public.get_partner_workspace_dashboard_v3(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
  attention_items jsonb;
  recent_orders jsonb;
  shipment_items jsonb;
  shipment_counts jsonb;
  attention_count integer;
begin
  if auth.uid() is null or p_company_id is null
    or not public.has_active_company_membership(p_company_id) then
    raise exception 'Partner dashboard access denied.' using errcode = '42501';
  end if;

  result := public.get_partner_workspace_dashboard_v2(p_company_id);

  with governed_test_contracts as (
    select distinct balance.company_id, balance.external_contract_ref
    from public.partner_contract_balances balance
    where balance.company_id = p_company_id
      and balance.is_active
      and lower(btrim(balance.contract_name)) = 'тестовый договор'
  ), visible_history as (
    select history.*,
      public.is_partner_test_order(
        history.one_c_state_code,
        history.one_c_state_raw,
        test_contract.external_contract_ref is not null
      ) as is_test
    from public.partner_order_history history
    left join governed_test_contracts test_contract
      on test_contract.company_id = history.company_id
      and test_contract.external_contract_ref = history.external_contract_ref
    where history.company_id = p_company_id
      and history.partner_visible
      and not history.one_c_deletion_mark
      and (public.has_permission(p_company_id, 'orders.view')
        or public.has_permission(p_company_id, 'orders.manage'))
  ), latest_date_change as (
    select distinct on (request.order_history_id) request.*
    from public.partner_order_date_change_requests request
    join visible_history history on history.id = request.order_history_id
    where request.company_id = p_company_id
    order by request.order_history_id, request.created_at desc, request.id
  ), candidates as (
    select
      history.id,
      case when history.is_test
        then case when history.one_c_delivery_date < current_date then 'test_return_overdue' else 'test_return_today' end
        else case when history.one_c_delivery_date < current_date then 'shipment_overdue' else 'shipment_today' end
      end as kind,
      history.id as source_id,
      history.external_1c_order_number as object_number,
      history.one_c_delivery_date as planned_date,
      md5(concat_ws('|', history.external_1c_order_ref, history.one_c_state_code,
        history.one_c_state_raw, history.one_c_delivery_date::text, history.updated_at::text)) as fingerprint,
      case when history.is_test
        then 'cooldown_7_days' else 'until_source_change' end as dismiss_policy,
      case when history.one_c_delivery_date < current_date then 'warning' else 'info' end as severity,
      history.one_c_delivery_date::timestamptz as occurred_at,
      null::text as comment,
      null::text as title,
      null::text as description,
      '/cabinet/orders/' || history.id::text as href,
      'Открыть заказ'::text as cta_label,
      case when history.is_test then 10 else 20 end as priority
    from visible_history history
    where history.one_c_delivery_date <= current_date
      and coalesce(history.one_c_state_code, '') <> 'completed'

    union all

    select request.id,
      case when request.status = 'pending' then 'date_change_pending' else 'date_change_rejected' end,
      history.id,
      history.external_1c_order_number,
      history.one_c_delivery_date,
      md5(concat_ws('|', request.id::text, request.status, request.updated_at::text,
        coalesce(request.review_comment, ''))),
      'until_source_change',
      case when request.status = 'rejected' then 'warning' else 'info' end,
      coalesce(request.updated_at, request.created_at),
      request.review_comment,
      null::text,
      null::text,
      '/cabinet/orders/' || history.id::text,
      'Открыть заказ',
      30
    from latest_date_change request
    join visible_history history on history.id = request.order_history_id
    where request.status in ('pending', 'rejected')

    union all

    select portal_order.id, 'portal_order_failure', history.id,
      history.external_1c_order_number, history.one_c_delivery_date,
      md5(concat_ws('|', portal_order.id::text, portal_order.integration_status,
        portal_order.updated_at::text, coalesce(portal_order.safe_error_code, ''))),
      'until_source_change', 'warning', portal_order.updated_at, null::text,
      null::text, null::text, '/cabinet/orders/' || history.id::text,
      'Открыть заказ', 5
    from public.partner_orders portal_order
    join visible_history history on history.portal_order_id = portal_order.id
    where public.has_permission(p_company_id, 'orders.manage')
      and portal_order.company_id = p_company_id
      and portal_order.integration_status in ('failed', 'reconciliation_required',
        'confirmed_not_created', 'manual_review_required')

    union all

    select notification.id,
      'notification_' || notification.event_code,
      notification.id,
      null::text,
      null::date,
      md5(concat_ws('|', notification.id::text, notification.event_code,
        notification.source_event_id::text, notification.occurred_at::text,
        notification.title, notification.message)),
      'until_source_change',
      'warning',
      notification.occurred_at,
      null::text,
      notification.title,
      notification.message,
      '/cabinet/cart',
      'Открыть корзину',
      1
    from public.partner_notifications notification
    where notification.company_id = p_company_id
      and notification.recipient_user_id = auth.uid()
      and notification.mandatory
      and notification.event_code in (
        'cart_product_price_changed', 'cart_product_availability_changed'
      )
      and notification.read_at is null
      and notification.dismissed_at is null
      and notification.archived_at is null
      and notification.expires_at > now()
  ), relevant as (
    select candidate.*
    from candidates candidate
    where not exists (
      select 1 from public.partner_dashboard_attention_dismissals dismissal
      where dismissal.company_id = p_company_id
        and dismissal.item_type = candidate.kind
        and dismissal.source_id = candidate.source_id
        and dismissal.source_fingerprint = candidate.fingerprint
        and (dismissal.policy = 'until_source_change' or dismissal.dismiss_until > now())
    )
    order by candidate.priority, candidate.occurred_at, candidate.id
    limit 8
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'kind', item.kind,
    'objectId', item.source_id,
    'objectNumber', item.object_number,
    'plannedDate', item.planned_date,
    'occurredAt', item.occurred_at,
    'comment', item.comment,
    'title', item.title,
    'description', item.description,
    'sourceFingerprint', item.fingerprint,
    'dismissPolicy', item.dismiss_policy,
    'severity', item.severity,
    'href', item.href,
    'ctaLabel', item.cta_label,
    'relevanceState', 'active'
  ) order by item.priority, item.occurred_at), '[]'::jsonb), count(*)::integer
  into attention_items, attention_count
  from relevant item;

  with items as (
    select value as item, ordinal
    from jsonb_array_elements(result #> '{orderSummary,recent}') with ordinality as entry(value, ordinal)
  )
  select coalesce(jsonb_agg(item.item || jsonb_build_object(
    'isTest', coalesce(public.is_partner_test_order(
      history.one_c_state_code,
      history.one_c_state_raw,
      exists (
        select 1 from public.partner_contract_balances balance
        where balance.company_id = p_company_id
          and balance.external_contract_ref = history.external_contract_ref
          and balance.is_active
          and lower(btrim(balance.contract_name)) = 'тестовый договор'
      )
    ), false)
  ) order by item.ordinal), '[]'::jsonb)
  into recent_orders
  from items item
  join public.partner_order_history history
    on history.company_id = p_company_id
    and history.partner_visible
    and not history.one_c_deletion_mark
    and (history.id::text = item.item->>'id' or history.portal_order_id::text = item.item->>'id');

  with governed_test_contracts as (
    select distinct balance.company_id, balance.external_contract_ref
    from public.partner_contract_balances balance
    where balance.company_id = p_company_id
      and balance.is_active
      and lower(btrim(balance.contract_name)) = 'тестовый договор'
  ), visible as (
    select history.*
    from public.partner_order_history history
    left join governed_test_contracts test_contract
      on test_contract.company_id = history.company_id
      and test_contract.external_contract_ref = history.external_contract_ref
    where history.company_id = p_company_id and history.partner_visible
      and not history.one_c_deletion_mark
      and coalesce(history.one_c_state_code, '') <> 'completed'
      and not public.is_partner_test_order(
        history.one_c_state_code,
        history.one_c_state_raw,
        test_contract.external_contract_ref is not null
      )
      and (public.has_permission(p_company_id, 'orders.view')
        or public.has_permission(p_company_id, 'orders.manage'))
  )
  select jsonb_build_object(
    'overdue', count(*) filter (where one_c_delivery_date < current_date),
    'today', count(*) filter (where one_c_delivery_date = current_date),
    'nextThreeDays', count(*) filter (where one_c_delivery_date > current_date and one_c_delivery_date <= current_date + 3),
    'later', count(*) filter (where one_c_delivery_date > current_date + 3)
  ) into shipment_counts from visible where one_c_delivery_date is not null;

  with items as (
    select value as item, ordinal
    from jsonb_array_elements(result #> '{shipmentSummary,items}') with ordinality as entry(value, ordinal)
  )
  select coalesce(jsonb_agg(item.item || jsonb_build_object(
    'isTest', coalesce(public.is_partner_test_order(
      history.one_c_state_code,
      history.one_c_state_raw,
      exists (
        select 1 from public.partner_contract_balances balance
        where balance.company_id = p_company_id
          and balance.external_contract_ref = history.external_contract_ref
          and balance.is_active
          and lower(btrim(balance.contract_name)) = 'тестовый договор'
      )
    ), false)
  ) order by item.ordinal), '[]'::jsonb)
  into shipment_items
  from items item
  join public.partner_order_history history
    on history.company_id = p_company_id and history.id::text = item.item->>'id';

  result := jsonb_set(result, '{attentionItems}', attention_items);
  result := jsonb_set(result, '{orderSummary,recent}', recent_orders);
  result := jsonb_set(result, '{orderSummary,attention}', to_jsonb(attention_count));
  result := jsonb_set(result, '{shipmentSummary,items}', shipment_items);
  result := jsonb_set(result, '{shipmentSummary,overdue}', shipment_counts->'overdue');
  result := jsonb_set(result, '{shipmentSummary,today}', shipment_counts->'today');
  result := jsonb_set(result, '{shipmentSummary,nextThreeDays}', shipment_counts->'nextThreeDays');
  result := jsonb_set(result, '{shipmentSummary,later}', shipment_counts->'later');
  return result;
end;
$$;

revoke all on function public.get_partner_workspace_dashboard_v3(uuid) from public, anon;
grant execute on function public.get_partner_workspace_dashboard_v3(uuid) to authenticated;

create or replace function public.dismiss_partner_dashboard_attention(
  p_company_id uuid,
  p_item_id uuid,
  p_source_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  item jsonb;
  target_policy text;
  target_until timestamptz;
  dismissal_id uuid;
begin
  if actor is null or not public.has_active_company_membership(p_company_id) then
    raise exception 'Dashboard attention access denied.' using errcode = '42501';
  end if;
  if p_source_fingerprint !~ '^[0-9a-f]{32}$' then
    raise exception 'Invalid attention fingerprint.' using errcode = '22023';
  end if;

  select dismissal.id, dismissal.policy, dismissal.dismiss_until
  into dismissal_id, target_policy, target_until
  from public.partner_dashboard_attention_dismissals dismissal
  where dismissal.company_id = p_company_id
    and dismissal.item_id = p_item_id
    and dismissal.source_fingerprint = p_source_fingerprint
    and (dismissal.policy = 'until_source_change' or dismissal.dismiss_until > now());
  if found then
    return jsonb_build_object('id', dismissal_id, 'dismissed', true,
      'policy', target_policy, 'dismissUntil', target_until);
  end if;

  select candidate into item
  from jsonb_array_elements(public.get_partner_workspace_dashboard_v3(p_company_id)->'attentionItems') candidate
  where candidate->>'id' = p_item_id::text
    and candidate->>'sourceFingerprint' = p_source_fingerprint;
  if item is null then
    raise exception 'Dashboard attention item is no longer active.' using errcode = 'P0002';
  end if;

  target_policy := item->>'dismissPolicy';
  target_until := case when target_policy = 'cooldown_7_days'
    then now() + interval '7 days' else null end;

  insert into public.partner_dashboard_attention_dismissals(
    company_id, item_type, item_id, source_id, source_fingerprint, policy,
    dismiss_until, dismissed_by, updated_at
  ) values (
    p_company_id, item->>'kind', p_item_id, (item->>'objectId')::uuid,
    p_source_fingerprint, target_policy, target_until, actor, now()
  ) on conflict (company_id, item_type, source_id) do update set
    item_id = excluded.item_id,
    source_fingerprint = excluded.source_fingerprint,
    policy = excluded.policy,
    dismiss_until = excluded.dismiss_until,
    dismissed_by = excluded.dismissed_by,
    updated_at = now()
  returning id into dismissal_id;

  insert into public.partner_dashboard_attention_events(
    company_id, item_type, source_id, source_fingerprint, event_type,
    actor_user_id, policy, dismiss_until
  ) values (
    p_company_id, item->>'kind', (item->>'objectId')::uuid,
    p_source_fingerprint, 'dismissed', actor, target_policy, target_until
  );

  return jsonb_build_object('id', dismissal_id, 'dismissed', true,
    'policy', target_policy, 'dismissUntil', target_until);
end;
$$;

revoke all on function public.dismiss_partner_dashboard_attention(uuid,uuid,text)
  from public, anon;
grant execute on function public.dismiss_partner_dashboard_attention(uuid,uuid,text)
  to authenticated;

comment on function public.get_partner_workspace_dashboard_v3(uuid) is
  'Canonical bounded dashboard projection with validated attention routes and shared TEST classification.';
comment on table public.partner_dashboard_attention_dismissals is
  'Company-scoped source-fingerprint-aware dashboard attention suppression.';

commit;
