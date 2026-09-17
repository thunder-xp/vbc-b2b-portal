begin;

set local lock_timeout = '5s';

alter table public.retail_payment_attempts force row level security;

create or replace view public.retail_payment_current_states_v1
with (security_invoker = true)
as
select
  attempt.retail_order_id,
  orders.public_number as order_number,
  attempt.id as payment_attempt_id,
  attempt.provider,
  attempt.status as attempt_status,
  case
    when refund.status = 'refunded' then 'REFUNDED'
    when refund.status in ('created', 'pending') then 'REFUND_PENDING'
    when attempt.status = 'paid' then 'PAID'
    when attempt.status in ('created', 'pending', 'paid_pending_activation') then 'PAYMENT_PENDING'
    when attempt.status = 'cancelled' then 'CANCELLED'
    when attempt.status in ('failed', 'expired') then 'FAILED'
    else 'UNPAID'
  end as payment_state,
  attempt.amount,
  attempt.currency,
  attempt.provider_status,
  attempt.provider_checkout_id,
  attempt.provider_payment_id,
  attempt.provider_rrn,
  attempt.failure_code,
  attempt.created_at as payment_created_at,
  attempt.confirmed_at as payment_confirmed_at,
  refund.id as refund_id,
  refund.status as refund_status,
  refund.provider_status as refund_provider_status,
  refund.provider_refund_id,
  refund.failure_code as refund_failure_code,
  refund.requested_at as refund_requested_at,
  refund.confirmed_at as refund_confirmed_at,
  case
    when refund.status = 'refunded' then 0::numeric(14,2)
    when attempt.status = 'paid' then attempt.amount
    else null::numeric(14,2)
  end as remaining_refundable
from (
  select distinct on (candidate.retail_order_id) candidate.*
  from public.retail_payment_attempts candidate
  order by candidate.retail_order_id, candidate.created_at desc, candidate.id desc
) attempt
join public.retail_orders orders on orders.id = attempt.retail_order_id
left join lateral (
  select candidate.*
  from public.retail_payment_refunds candidate
  where candidate.payment_attempt_id = attempt.id
  order by candidate.requested_at desc, candidate.id desc
  limit 1
) refund on true;

revoke all on public.retail_payment_current_states_v1
from public, anon, authenticated, service_role;
grant select on public.retail_payment_current_states_v1 to service_role;

create or replace function public.get_retail_payment_return_state_v1(p_payment_attempt_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'status', case
      when current_state.payment_state = 'REFUNDED' then 'REFUNDED'
      when current_state.payment_state = 'REFUND_PENDING' then 'REFUND_PENDING'
      when attempt.status = 'paid' then 'PAID'
      when attempt.status in ('failed', 'expired') then 'FAILED'
      when attempt.status = 'cancelled' then 'CANCELLED'
      else 'PROCESSING'
    end,
    'locale', orders.locale
  )
  from public.retail_payment_attempts attempt
  join public.retail_orders orders on orders.id = attempt.retail_order_id
  left join public.retail_payment_current_states_v1 current_state
    on current_state.payment_attempt_id = attempt.id
  where attempt.provider = 'maib'
    and attempt.id = p_payment_attempt_id;
$$;

revoke all on function public.get_retail_payment_return_state_v1(uuid)
from public, anon, authenticated;
grant execute on function public.get_retail_payment_return_state_v1(uuid)
to service_role;

comment on view public.retail_payment_current_states_v1 is
  'Service-role-only effective payment/refund projection. Historical paid attempts remain immutable while a confirmed full refund projects REFUNDED with zero remaining refundable amount.';

commit;
