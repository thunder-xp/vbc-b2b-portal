begin;

set local lock_timeout = '5s';

alter table public.retail_payment_attempts
  add column reconciliation_attempt_count integer not null default 0 check (reconciliation_attempt_count >= 0),
  add column reconciliation_next_at timestamptz null,
  add column reconciliation_lease_token uuid null,
  add column reconciliation_lease_until timestamptz null,
  add column reconciliation_last_at timestamptz null,
  add column reconciliation_last_outcome text null check (
    reconciliation_last_outcome is null
    or reconciliation_last_outcome in ('PENDING', 'PAID', 'DUPLICATE', 'EXPIRED', 'ABANDONED', 'CANCELLED', 'FAILED', 'RETRY')
  ),
  add column reconciliation_error_code text null check (
    reconciliation_error_code is null
    or (char_length(reconciliation_error_code) between 1 and 100 and reconciliation_error_code ~ '^[A-Z0-9_:-]+$')
  ),
  add check ((reconciliation_lease_token is null) = (reconciliation_lease_until is null));

create index retail_payment_attempts_reconciliation_due_idx
  on public.retail_payment_attempts (reconciliation_next_at, created_at, id)
  where provider = 'maib' and status in ('pending', 'paid_pending_activation');

create function private.schedule_maib_retail_payment_reconciliation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider <> 'maib' or new.status not in ('pending', 'paid_pending_activation') then
    new.reconciliation_next_at := null;
    new.reconciliation_lease_token := null;
    new.reconciliation_lease_until := null;
    return new;
  end if;

  if tg_op = 'INSERT' or old.status is distinct from new.status then
    new.reconciliation_next_at := case
      when new.status = 'paid_pending_activation' then now()
      else now() + interval '5 minutes'
    end;
    new.reconciliation_lease_token := null;
    new.reconciliation_lease_until := null;
  end if;
  return new;
end;
$$;

create trigger schedule_maib_retail_payment_reconciliation_v1
before insert or update on public.retail_payment_attempts
for each row execute function private.schedule_maib_retail_payment_reconciliation_v1();

update public.retail_payment_attempts attempt
set reconciliation_next_at = case
  when attempt.status = 'paid_pending_activation' then now()
  else now() + interval '5 minutes'
end
from public.retail_orders orders
where orders.id = attempt.retail_order_id
  and orders.checkout_channel = 'public'
  and attempt.provider = 'maib'
  and attempt.status in ('pending', 'paid_pending_activation');

create function public.claim_maib_retail_payment_reconciliation_batch_v1(
  p_limit integer,
  p_lease_token uuid
)
returns table(attempt_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_limit not between 1 and 5 or p_lease_token is null then
    return;
  end if;

  return query
  with candidates as (
    select attempt.id
    from public.retail_payment_attempts attempt
    join public.retail_orders orders on orders.id = attempt.retail_order_id
    where attempt.provider = 'maib'
      and orders.checkout_channel = 'public'
      and attempt.status in ('pending', 'paid_pending_activation')
      and attempt.reconciliation_next_at <= now()
      and (attempt.reconciliation_lease_until is null or attempt.reconciliation_lease_until < now())
    order by
      case when attempt.status = 'paid_pending_activation' then 0 else 1 end,
      attempt.reconciliation_next_at,
      attempt.created_at,
      attempt.id
    for update of attempt skip locked
    limit p_limit
  )
  update public.retail_payment_attempts attempt
  set reconciliation_lease_token = p_lease_token,
      reconciliation_lease_until = now() + interval '2 minutes',
      reconciliation_attempt_count = attempt.reconciliation_attempt_count + 1
  from candidates
  where attempt.id = candidates.id
  returning attempt.id;
end;
$$;

create function public.record_maib_retail_payment_reconciliation_v1(
  p_attempt_id uuid,
  p_lease_token uuid,
  p_provider_checkout_id text,
  p_order_reference text,
  p_amount numeric,
  p_currency text,
  p_provider_status text,
  p_provider_event_at timestamptz,
  p_outcome text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  attempt public.retail_payment_attempts%rowtype;
  next_status text;
  safe_outcome text;
begin
  if p_attempt_id is null
    or p_provider_checkout_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_order_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_amount is null or p_amount <= 0
    or p_currency !~ '^[A-Z]{3}$'
    or p_provider_event_at is null
    or p_outcome not in ('PENDING', 'EXPIRED', 'ABANDONED', 'CANCELLED', 'FAILED')
    or char_length(coalesce(p_provider_status, '')) not between 1 and 100 then
    return jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  end if;

  select candidate.* into attempt
  from public.retail_payment_attempts candidate
  join public.retail_orders orders on orders.id = candidate.retail_order_id
  where candidate.id = p_attempt_id
    and candidate.provider = 'maib'
    and orders.checkout_channel = 'public'
  for update of candidate;

  if not found then return jsonb_build_object('outcome', 'INVALID_EVIDENCE'); end if;
  if attempt.status = 'paid' then
    return jsonb_build_object('outcome', 'DUPLICATE', 'attemptId', attempt.id, 'retailOrderId', attempt.retail_order_id, 'paymentStatus', 'paid');
  end if;
  if attempt.status not in ('pending', 'paid_pending_activation') then
    return jsonb_build_object(
      'outcome', case when attempt.status = 'expired' then 'EXPIRED' when attempt.status = 'cancelled' then 'CANCELLED' else 'FAILED' end,
      'attemptId', attempt.id, 'retailOrderId', attempt.retail_order_id, 'paymentStatus', attempt.status
    );
  end if;
  if (p_lease_token is not null and attempt.reconciliation_lease_token is distinct from p_lease_token)
    or (p_lease_token is null and attempt.reconciliation_lease_until >= now())
    or attempt.provider_checkout_id <> lower(p_provider_checkout_id)
    or attempt.id::text <> lower(p_order_reference)
    or attempt.amount <> round(p_amount, 2)
    or attempt.currency <> p_currency then
    return jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  end if;

  if p_outcome = 'PENDING' then
    update public.retail_payment_attempts
    set provider_status = p_provider_status,
        provider_event_at = greatest(coalesce(provider_event_at, p_provider_event_at), p_provider_event_at),
        reconciliation_last_at = now(),
        reconciliation_last_outcome = 'PENDING',
        reconciliation_error_code = null,
        reconciliation_next_at = now() + interval '10 minutes',
        reconciliation_lease_token = null,
        reconciliation_lease_until = null
    where id = attempt.id;
    return jsonb_build_object('outcome', 'PENDING', 'attemptId', attempt.id, 'retailOrderId', attempt.retail_order_id, 'paymentStatus', attempt.status);
  end if;

  next_status := case
    when p_outcome in ('EXPIRED', 'ABANDONED') then 'expired'
    when p_outcome = 'CANCELLED' then 'cancelled'
    else 'failed'
  end;
  safe_outcome := case when p_outcome = 'ABANDONED' then 'EXPIRED' else p_outcome end;

  update public.retail_payment_attempts
  set status = next_status,
      provider_status = p_provider_status,
      provider_event_at = greatest(coalesce(provider_event_at, p_provider_event_at), p_provider_event_at),
      failure_code = 'MAIB_CHECKOUT_' || p_outcome,
      reconciliation_last_at = now(),
      reconciliation_last_outcome = p_outcome,
      reconciliation_error_code = null,
      reconciliation_next_at = null,
      reconciliation_lease_token = null,
      reconciliation_lease_until = null
  where id = attempt.id;

  insert into public.retail_payment_events(payment_attempt_id, event_type, safe_evidence)
  values (attempt.id, 'reconciliation_completed', jsonb_build_object(
    'outcome', p_outcome, 'providerStatus', p_provider_status, 'source', 'scheduled_reconciliation'
  ));

  return jsonb_build_object(
    'outcome', safe_outcome,
    'attemptId', attempt.id,
    'retailOrderId', attempt.retail_order_id,
    'paymentStatus', next_status
  );
end;
$$;

create function public.record_maib_retail_payment_reconciliation_retry_v1(
  p_attempt_id uuid,
  p_lease_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  if p_attempt_id is null or p_lease_token is null
    or p_error_code !~ '^[A-Z0-9_:-]+$'
    or char_length(p_error_code) > 100 then
    return false;
  end if;

  update public.retail_payment_attempts
  set reconciliation_last_at = now(),
      reconciliation_last_outcome = 'RETRY',
      reconciliation_error_code = p_error_code,
      reconciliation_next_at = now() + case
        when reconciliation_attempt_count <= 3 then interval '5 minutes'
        when reconciliation_attempt_count <= 6 then interval '15 minutes'
        else interval '1 hour'
      end,
      reconciliation_lease_token = null,
      reconciliation_lease_until = null
  where id = p_attempt_id
    and provider = 'maib'
    and status in ('pending', 'paid_pending_activation')
    and reconciliation_lease_token = p_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

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
  end as remaining_refundable,
  attempt.reconciliation_last_at,
  attempt.reconciliation_next_at,
  attempt.reconciliation_last_outcome,
  attempt.reconciliation_error_code,
  provider_event.processing_outcome as last_provider_outcome,
  payment_event.event_type as last_payment_event_type
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
) refund on true
left join lateral (
  select candidate.processing_outcome
  from public.retail_payment_provider_events candidate
  where candidate.payment_attempt_id = attempt.id
  order by candidate.received_at desc, candidate.id desc
  limit 1
) provider_event on true
left join lateral (
  select candidate.event_type
  from public.retail_payment_events candidate
  where candidate.payment_attempt_id = attempt.id
  order by candidate.created_at desc, candidate.id desc
  limit 1
) payment_event on true;

revoke all on public.retail_payment_current_states_v1 from public, anon, authenticated, service_role;
grant select on public.retail_payment_current_states_v1 to service_role;

revoke all on function public.claim_maib_retail_payment_reconciliation_batch_v1(integer, uuid),
  public.record_maib_retail_payment_reconciliation_v1(uuid, uuid, text, text, numeric, text, text, timestamptz, text),
  public.record_maib_retail_payment_reconciliation_retry_v1(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.claim_maib_retail_payment_reconciliation_batch_v1(integer, uuid),
  public.record_maib_retail_payment_reconciliation_v1(uuid, uuid, text, text, numeric, text, text, timestamptz, text),
  public.record_maib_retail_payment_reconciliation_retry_v1(uuid, uuid, text)
to service_role;

comment on function public.claim_maib_retail_payment_reconciliation_batch_v1(integer, uuid) is
  'Claims at most five due public MAIB attempts with a recoverable two-minute lease; review/sandbox attempts are excluded.';
comment on function public.record_maib_retail_payment_reconciliation_v1(uuid, uuid, text, text, numeric, text, text, timestamptz, text) is
  'Persists validated aggregate checkout status without storing raw provider payload or card data; only explicit MAIB terminal checkout status closes an unpaid attempt.';

commit;
