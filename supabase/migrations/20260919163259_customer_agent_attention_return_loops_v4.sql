-- Presentation-only read state for authoritative Customer payment/refund facts.
-- Business state stays in Retail Order / Payment / Refund domains.
create table public.customer_account_attention_reads (
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  source_kind text not null check (source_kind in ('PAYMENT_PAID', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED')),
  source_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (customer_account_id, source_kind, source_id)
);

create index customer_account_attention_reads_account_idx
  on public.customer_account_attention_reads (customer_account_id, read_at desc);

alter table public.customer_account_attention_reads enable row level security;
alter table public.customer_account_attention_reads force row level security;
revoke all on table public.customer_account_attention_reads from public, anon, authenticated;
grant all on table public.customer_account_attention_reads to service_role;

comment on table public.customer_account_attention_reads is
  'Presentation-only read receipts for authoritative Final Customer payment/refund facts; never changes commercial state.';

-- Presentation-only read state for append-only Agent domain events.
create table public.agent_cabinet_attention_reads (
  agent_id uuid not null references public.commercial_agents(id) on delete cascade,
  event_id uuid not null references public.agent_domain_events(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (agent_id, event_id)
);

create index agent_cabinet_attention_reads_agent_idx
  on public.agent_cabinet_attention_reads (agent_id, read_at desc);

alter table public.agent_cabinet_attention_reads enable row level security;
alter table public.agent_cabinet_attention_reads force row level security;
revoke all on table public.agent_cabinet_attention_reads from public, anon, authenticated;
grant all on table public.agent_cabinet_attention_reads to service_role;

comment on table public.agent_cabinet_attention_reads is
  'Presentation-only read receipts for append-only Agent domain events; never changes referral or attribution state.';

-- One bounded Customer Home read. It reuses the existing service notification
-- projection and reads append-only payment/refund facts directly.
create or replace function public.get_final_customer_cabinet_overview_v2(
  p_customer_account_id uuid,
  p_customer_identity_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with account as (
    select id
    from public.customer_accounts
    where id = p_customer_account_id
      and customer_identity_id = p_customer_identity_id
      and status = 'ACTIVE'
  ), customer_contexts as (
    select customer.id, customer.name, customer.created_at
    from public.retail_customers customer
    where customer.customer_identity_id = p_customer_identity_id
      and exists (select 1 from account)
  ), latest_order as (
    select orders.*
    from public.retail_orders orders
    join customer_contexts customer on customer.id = orders.customer_id
    order by orders.created_at desc, orders.id desc
    limit 1
  ), confirmed_lines as (
    select line.*, orders.public_number, coalesce(orders.paid_at, orders.created_at) purchased_at
    from public.retail_orders orders
    join customer_contexts customer on customer.id = orders.customer_id
    join public.retail_order_lines line on line.order_id = orders.id
    where orders.status = 'confirmed' and orders.paid_at is not null
  ), recent_purchases as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', recent.id, 'name', recent.product_name, 'sku', recent.sku
    ) order by recent.purchased_at desc, recent.id) filter (where recent.id is not null), '[]'::jsonb) value
    from (select * from confirmed_lines order by purchased_at desc, id limit 3) recent
  ), document_total as (
    select count(distinct document.id)::integer value
    from confirmed_lines line
    join public.public_retail_product_identities identity on identity.public_id = line.public_product_id
    join public.catalog_product_documents document
      on document.product_id = identity.source_product_id and document.is_active
  ), latest_request as (
    select request.*
    from public.customer_service_requests request
    where request.customer_identity_id = p_customer_identity_id
    order by request.created_at desc, request.id desc
    limit 1
  ), service_counts as (
    select count(*) filter (where status = 'NEED_INFO')::integer needs_info,
      count(*) filter (where status in ('NEW', 'IN_REVIEW', 'NEED_INFO', 'ACCEPTED'))::integer active
    from public.customer_service_requests
    where customer_identity_id = p_customer_identity_id
  ), paid_orders as (
    select distinct on (orders.id)
      orders.id source_id, orders.id order_id, orders.public_number context_label,
      event.created_at
    from public.retail_payment_events event
    join public.retail_payment_attempts attempt on attempt.id = event.payment_attempt_id
    join public.retail_orders orders on orders.id = attempt.retail_order_id
    join customer_contexts customer on customer.id = orders.customer_id
    left join public.customer_account_attention_reads receipt
      on receipt.customer_account_id = p_customer_account_id
      and receipt.source_kind = 'PAYMENT_PAID'
      and receipt.source_id = orders.id
    where event.event_type in ('activation_completed', 'reconciliation_completed')
      and orders.status = 'confirmed'
      and orders.paid_at is not null
      and receipt.source_id is null
    order by orders.id, event.created_at desc, event.id desc
  ), failed_payments as (
    select attempt.id source_id, orders.id order_id, orders.public_number context_label,
      attempt.updated_at created_at
    from public.retail_payment_attempts attempt
    join public.retail_orders orders on orders.id = attempt.retail_order_id
    join customer_contexts customer on customer.id = orders.customer_id
    left join public.customer_account_attention_reads receipt
      on receipt.customer_account_id = p_customer_account_id
      and receipt.source_kind = 'PAYMENT_FAILED'
      and receipt.source_id = attempt.id
    where attempt.status = 'failed'
      and receipt.source_id is null
  ), refunded_orders as (
    select distinct on (refund.id)
      refund.id source_id, orders.id order_id, orders.public_number context_label,
      event.created_at
    from public.retail_payment_refund_events event
    join public.retail_payment_refunds refund on refund.id = event.refund_id
    join public.retail_payment_attempts attempt on attempt.id = refund.payment_attempt_id
    join public.retail_orders orders on orders.id = attempt.retail_order_id
    join customer_contexts customer on customer.id = orders.customer_id
    left join public.customer_account_attention_reads receipt
      on receipt.customer_account_id = p_customer_account_id
      and receipt.source_kind = 'PAYMENT_REFUNDED'
      and receipt.source_id = refund.id
    where event.event_type = 'refund_confirmed'
      and refund.status = 'refunded'
      and receipt.source_id is null
    order by refund.id, event.created_at desc, event.id desc
  ), attention_candidates as (
    select 1 priority, 'ACTION_REQUIRED'::text priority_code,
      'SERVICE_REQUEST'::text source_kind, request.id source_id,
      'CUSTOMER_SERVICE_NEED_INFO'::text event_code,
      request.public_number context_label, request.updated_at created_at,
      concat('/account/service/', request.id::text) action_path
    from public.customer_service_requests request
    where request.customer_account_id = p_customer_account_id and request.status = 'NEED_INFO'
    union all
    select 2, 'IMPORTANT_UPDATE', 'SERVICE_NOTIFICATION', notification.id,
      notification.event_code, request.public_number, notification.created_at,
      notification.action_path
    from public.customer_service_notifications notification
    join public.customer_service_requests request on request.id = notification.request_id
    where notification.customer_account_id = p_customer_account_id
      and notification.read_at is null
      and notification.event_code <> 'CUSTOMER_SERVICE_NEED_INFO'
    union all
    select 2, 'IMPORTANT_UPDATE', 'PAYMENT_PAID', source_id,
      'CUSTOMER_PAYMENT_PAID', context_label, created_at,
      concat('/account/orders/', order_id::text)
    from paid_orders
    union all
    select 2, 'IMPORTANT_UPDATE', 'PAYMENT_FAILED', source_id,
      'CUSTOMER_PAYMENT_FAILED', context_label, created_at,
      concat('/account/orders/', order_id::text)
    from failed_payments
    union all
    select 2, 'IMPORTANT_UPDATE', 'PAYMENT_REFUNDED', source_id,
      'CUSTOMER_PAYMENT_REFUNDED', context_label, created_at,
      concat('/account/orders/', order_id::text)
    from refunded_orders
  ), attention as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'priority', candidate.priority_code,
      'sourceKind', candidate.source_kind,
      'sourceId', candidate.source_id,
      'eventCode', candidate.event_code,
      'contextLabel', candidate.context_label,
      'createdAt', candidate.created_at,
      'actionPath', candidate.action_path
    ) order by candidate.priority, candidate.created_at desc, candidate.source_id desc), '[]'::jsonb) value
    from (
      select * from attention_candidates
      order by priority, created_at desc, source_id desc
      limit 3
    ) candidate
  )
  select jsonb_build_object(
    'displayName', (select name from customer_contexts order by created_at desc, id desc limit 1),
    'latestOrder', (select jsonb_build_object(
      'id', orders.id, 'number', orders.public_number, 'status', orders.status,
      'createdAt', orders.created_at, 'total', orders.priced_scope_total,
      'currency', orders.currency,
      'itemCount', (select coalesce(sum(line.quantity), 0) from public.retail_order_lines line where line.order_id = orders.id),
      'paidAt', orders.paid_at
    ) from latest_order orders),
    'recentPurchases', (select value from recent_purchases),
    'equipmentCount', (select count(*)::integer from confirmed_lines where unit_code <> 'service'),
    'documentCount', (select value from document_total),
    'latestRequest', (select jsonb_build_object(
      'id', request.id, 'number', request.public_number, 'status', request.status
    ) from latest_request request),
    'serviceNeedsInfoCount', (select needs_info from service_counts),
    'activeServiceRequestCount', (select active from service_counts),
    'attentionItems', (select value from attention)
  );
$$;

create or replace function public.open_final_customer_attention_v1(
  p_customer_account_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_actor_user_id uuid
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_path text;
begin
  if not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) then
    raise exception 'Customer account not found.' using errcode = '42501';
  end if;

  if p_source_kind = 'SERVICE_NOTIFICATION' then
    update public.customer_service_notifications notification
    set read_at = coalesce(notification.read_at, now())
    where notification.id = p_source_id
      and notification.customer_account_id = p_customer_account_id
    returning notification.action_path into target_path;
  elsif p_source_kind = 'PAYMENT_PAID' then
    select concat('/account/orders/', orders.id::text) into target_path
    from public.customer_accounts account
    join public.retail_customers customer on customer.customer_identity_id = account.customer_identity_id
    join public.retail_orders orders on orders.customer_id = customer.id
    where account.id = p_customer_account_id
      and orders.id = p_source_id
      and orders.status = 'confirmed'
      and orders.paid_at is not null
      and exists (
        select 1 from public.retail_payment_attempts attempt
        join public.retail_payment_events event on event.payment_attempt_id = attempt.id
        where attempt.retail_order_id = orders.id
          and event.event_type in ('activation_completed', 'reconciliation_completed')
      );
    if target_path is not null then
      insert into public.customer_account_attention_reads(customer_account_id, source_kind, source_id)
      values (p_customer_account_id, p_source_kind, p_source_id)
      on conflict do nothing;
    end if;
  elsif p_source_kind = 'PAYMENT_FAILED' then
    select concat('/account/orders/', orders.id::text) into target_path
    from public.customer_accounts account
    join public.retail_customers customer on customer.customer_identity_id = account.customer_identity_id
    join public.retail_orders orders on orders.customer_id = customer.id
    join public.retail_payment_attempts attempt on attempt.retail_order_id = orders.id
    where account.id = p_customer_account_id
      and attempt.id = p_source_id
      and attempt.status = 'failed';
    if target_path is not null then
      insert into public.customer_account_attention_reads(customer_account_id, source_kind, source_id)
      values (p_customer_account_id, p_source_kind, p_source_id)
      on conflict do nothing;
    end if;
  elsif p_source_kind = 'PAYMENT_REFUNDED' then
    select concat('/account/orders/', orders.id::text) into target_path
    from public.customer_accounts account
    join public.retail_customers customer on customer.customer_identity_id = account.customer_identity_id
    join public.retail_orders orders on orders.customer_id = customer.id
    join public.retail_payment_attempts attempt on attempt.retail_order_id = orders.id
    join public.retail_payment_refunds refund on refund.payment_attempt_id = attempt.id
    where account.id = p_customer_account_id
      and refund.id = p_source_id
      and refund.status = 'refunded'
      and exists (
        select 1 from public.retail_payment_refund_events event
        where event.refund_id = refund.id and event.event_type = 'refund_confirmed'
      );
    if target_path is not null then
      insert into public.customer_account_attention_reads(customer_account_id, source_kind, source_id)
      values (p_customer_account_id, p_source_kind, p_source_id)
      on conflict do nothing;
    end if;
  else
    raise exception 'Unsupported attention source.' using errcode = '22023';
  end if;

  if target_path is null then
    raise exception 'Attention item not found.' using errcode = '42501';
  end if;
  return target_path;
end;
$$;

-- One bounded Agent Home read. Attention contains only unread meaningful facts;
-- the same event is excluded from Activity while it is visible in Attention.
create or replace function public.get_agent_cabinet_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with agent as (select (private.current_commercial_agent()).*),
  own_referrals as (
    select referral.* from public.agent_referrals referral join agent on agent.id = referral.agent_id
  ),
  own_attributions as (
    select attribution.* from public.agent_attributions attribution join agent on agent.id = attribution.agent_id
  ),
  own_events as (
    select event.id, event.event_type, event.created_at, event.referral_id,
      event.attribution_id, referral.name_snapshot as referral_name
    from public.agent_domain_events event
    join agent on agent.id = event.agent_id
    left join public.agent_referrals referral on referral.id = event.referral_id
    where event.event_type in (
      'REFERRAL_CAPTURED', 'REFERRAL_STATUS_CHANGED', 'ATTRIBUTION_CREATED',
      'ATTRIBUTION_EXTENDED', 'ATTRIBUTION_CONFLICT',
      'ATTRIBUTION_REASSIGNED', 'ATTRIBUTION_TERMINATED'
    )
  ), attention_rows as (
    select event.*
    from own_events event
    left join public.agent_cabinet_attention_reads receipt
      on receipt.agent_id = (select id from agent) and receipt.event_id = event.id
    where receipt.event_id is null
      and event.event_type <> 'REFERRAL_CAPTURED'
    order by event.created_at desc, event.id desc
    limit 3
  ), activity_rows as (
    select event.*
    from own_events event
    where not exists (select 1 from attention_rows attention where attention.id = event.id)
    order by event.created_at desc, event.id desc
    limit 6
  )
  select case when not exists (select 1 from agent) then null else jsonb_build_object(
    'kpis', jsonb_build_object(
      'myClients', (select count(*) from own_attributions where status = 'ACTIVE'),
      'activeReferrals', (select count(*) from own_referrals where status in ('VERIFIED', 'ACTIVE')),
      'newReferrals', (select count(*) from own_referrals where status in ('CAPTURED', 'PENDING_REVIEW')),
      'attributedToMe', (select count(*) from own_attributions)
    ),
    'attentionItems', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id,
      'priority', 'IMPORTANT_UPDATE',
      'eventCode', item.event_type,
      'createdAt', item.created_at,
      'referralId', item.referral_id,
      'attributionId', item.attribution_id,
      'referralName', item.referral_name
    ) order by item.created_at desc, item.id desc) from attention_rows item), '[]'::jsonb),
    'latestReferrals', coalesce((select jsonb_agg(row_to_json(item)) from (
      select id, name_snapshot as name, status, submitted_at as "submittedAt", updated_at as "updatedAt"
      from own_referrals where status in ('CAPTURED', 'PENDING_REVIEW', 'VERIFIED', 'ACTIVE')
      order by updated_at desc, id desc limit 5
    ) item), '[]'::jsonb),
    'latestClients', coalesce((select jsonb_agg(row_to_json(item)) from (
      select attribution.id, referral.name_snapshot as name, attribution.status,
        attribution.valid_from as "attributedAt", attribution.protection_until as "protectionUntil"
      from own_attributions attribution
      join public.agent_referrals referral on referral.id = attribution.referral_id
      order by attribution.valid_from desc, attribution.id desc limit 5
    ) item), '[]'::jsonb),
    'latestActivity', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'eventType', item.event_type, 'createdAt', item.created_at,
      'referralId', item.referral_id, 'referralName', item.referral_name
    ) order by item.created_at desc, item.id desc) from activity_rows item), '[]'::jsonb)
  ) end;
$$;

create or replace function public.open_agent_cabinet_attention_v1(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_agent public.commercial_agents%rowtype;
  event_row public.agent_domain_events%rowtype;
  target_path text;
begin
  select * into current_agent from private.current_commercial_agent();
  if current_agent.id is null then
    raise exception 'Commercial Agent authentication required.' using errcode = '42501';
  end if;

  select event.* into event_row
  from public.agent_domain_events event
  where event.id = p_event_id and event.agent_id = current_agent.id
    and event.event_type in (
      'REFERRAL_STATUS_CHANGED', 'ATTRIBUTION_CREATED', 'ATTRIBUTION_EXTENDED',
      'ATTRIBUTION_CONFLICT', 'ATTRIBUTION_REASSIGNED', 'ATTRIBUTION_TERMINATED'
    );
  if not found then
    raise exception 'Attention item not found.' using errcode = '42501';
  end if;

  insert into public.agent_cabinet_attention_reads(agent_id, event_id)
  values (current_agent.id, event_row.id)
  on conflict do nothing;

  if event_row.attribution_id is not null then
    target_path := concat('/agent/clients/', event_row.attribution_id::text);
  elsif event_row.referral_id is not null then
    target_path := concat('/agent/referrals/', event_row.referral_id::text);
  else
    raise exception 'Attention item has no supported target.' using errcode = '22023';
  end if;
  return target_path;
end;
$$;

revoke all on function public.get_final_customer_cabinet_overview_v2(uuid, uuid),
  public.open_final_customer_attention_v1(uuid, text, uuid, uuid),
  public.open_agent_cabinet_attention_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_final_customer_cabinet_overview_v2(uuid, uuid),
  public.open_final_customer_attention_v1(uuid, text, uuid, uuid)
  to service_role;
grant execute on function public.open_agent_cabinet_attention_v1(uuid) to authenticated;

revoke all on function public.get_agent_cabinet_overview() from public, anon;
grant execute on function public.get_agent_cabinet_overview() to authenticated;
