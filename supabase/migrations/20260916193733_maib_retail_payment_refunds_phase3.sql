begin;

set local lock_timeout = '5s';

insert into public.permissions(code, description, scope, delegable_by_partner_owner, sensitive, category)
values ('admin.payments.refund', 'Create and reconcile governed retail payment refunds.', 'internal', false, true, 'admin')
on conflict (code) do update set
  description = excluded.description,
  scope = excluded.scope,
  delegable_by_partner_owner = excluded.delegable_by_partner_owner,
  sensitive = excluded.sensitive,
  category = excluded.category;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'admin.payments.refund'
where role.code = 'novotech_finance'
on conflict do nothing;

create table public.retail_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.retail_payment_attempts(id) on delete restrict,
  provider text not null check (provider = 'maib'),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  status text not null check (status in ('created', 'pending', 'refunded', 'failed')),
  provider_refund_id text null check (provider_refund_id is null or char_length(provider_refund_id) between 1 and 200),
  provider_status text null check (provider_status is null or char_length(provider_status) between 1 and 100),
  idempotency_key uuid not null unique,
  provider_request_started_at timestamptz null,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reconciled_at timestamptz null,
  confirmed_at timestamptz null,
  failure_code text null check (
    failure_code is null
    or (char_length(failure_code) between 1 and 100 and failure_code ~ '^[A-Z0-9_:-]+$')
  ),
  constraint retail_payment_refunds_confirmation_check check ((status = 'refunded') = (confirmed_at is not null)),
  constraint retail_payment_refunds_provider_state_check check (
    status = 'created' or provider_request_started_at is not null
  )
);

create unique index retail_payment_refunds_provider_identity_idx
  on public.retail_payment_refunds(provider, provider_refund_id)
  where provider_refund_id is not null;

create unique index retail_payment_refunds_active_full_idx
  on public.retail_payment_refunds(payment_attempt_id)
  where status in ('created', 'pending', 'refunded');

create index retail_payment_refunds_attempt_idx
  on public.retail_payment_refunds(payment_attempt_id, requested_at desc, id);

create trigger retail_payment_refunds_set_updated_at
before update on public.retail_payment_refunds
for each row execute function public.set_updated_at();

create table public.retail_payment_refund_events (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.retail_payment_refunds(id) on delete restrict,
  event_type text not null check (event_type in (
    'refund_requested', 'provider_request_started', 'provider_refund_assigned',
    'reconciliation_pending', 'refund_confirmed', 'refund_failed'
  )),
  safe_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_evidence) = 'object'),
  created_at timestamptz not null default now()
);

create index retail_payment_refund_events_refund_idx
  on public.retail_payment_refund_events(refund_id, created_at desc, id);

create trigger prevent_retail_payment_refund_event_mutation_v1
before update or delete on public.retail_payment_refund_events
for each row execute function private.prevent_retail_payment_event_mutation_v1();

alter table public.retail_payment_refunds enable row level security;
alter table public.retail_payment_refunds force row level security;
alter table public.retail_payment_refund_events enable row level security;
alter table public.retail_payment_refund_events force row level security;

revoke all on table public.retail_payment_refunds, public.retail_payment_refund_events
from public, anon, authenticated, service_role;
grant select, insert, update on table public.retail_payment_refunds to service_role;
grant select, insert on table public.retail_payment_refund_events to service_role;

create or replace function public.claim_retail_payment_refund_v1(
  p_payment_attempt_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  attempt public.retail_payment_attempts%rowtype;
  existing_refund public.retail_payment_refunds%rowtype;
  confirmed_total numeric(14,2);
  remaining_amount numeric(14,2);
begin
  if p_payment_attempt_id is null or p_idempotency_key is null
    or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    return jsonb_build_object('outcome', 'INVALID_INPUT');
  end if;

  select candidate.* into attempt
  from public.retail_payment_attempts candidate
  where candidate.id = p_payment_attempt_id
  for update;

  if not found then return jsonb_build_object('outcome', 'NOT_FOUND'); end if;
  if attempt.provider <> 'maib' or attempt.status <> 'paid' then
    return jsonb_build_object('outcome', 'NOT_REFUNDABLE');
  end if;
  if attempt.provider_payment_id is null then
    return jsonb_build_object('outcome', 'MISSING_PROVIDER_PAYMENT_ID');
  end if;

  select refund.* into existing_refund
  from public.retail_payment_refunds refund
  where refund.idempotency_key = p_idempotency_key
     or (refund.payment_attempt_id = attempt.id and refund.status in ('created', 'pending', 'refunded'))
  order by (refund.idempotency_key = p_idempotency_key) desc, refund.requested_at desc
  limit 1;

  if found then
    if existing_refund.payment_attempt_id <> attempt.id then
      return jsonb_build_object('outcome', 'IDEMPOTENCY_CONFLICT');
    end if;
    return jsonb_build_object(
      'outcome', 'REUSE', 'refundId', existing_refund.id,
      'paymentAttemptId', attempt.id, 'providerPaymentId', attempt.provider_payment_id,
      'amount', existing_refund.amount, 'currency', existing_refund.currency,
      'reason', existing_refund.reason, 'status', existing_refund.status,
      'providerRefundId', existing_refund.provider_refund_id,
      'providerStatus', existing_refund.provider_status,
      'providerRequestStarted', existing_refund.provider_request_started_at is not null,
      'failureCode', existing_refund.failure_code
    );
  end if;

  select coalesce(sum(refund.amount), 0)::numeric(14,2) into confirmed_total
  from public.retail_payment_refunds refund
  where refund.payment_attempt_id = attempt.id and refund.status = 'refunded';
  remaining_amount := round(attempt.amount - confirmed_total, 2);

  if remaining_amount <= 0 then
    return jsonb_build_object('outcome', 'ALREADY_REFUNDED');
  end if;

  insert into public.retail_payment_refunds(
    payment_attempt_id, provider, amount, currency, reason, status, idempotency_key
  ) values (
    attempt.id, attempt.provider, remaining_amount, attempt.currency, btrim(p_reason), 'created', p_idempotency_key
  ) returning * into existing_refund;

  insert into public.retail_payment_refund_events(refund_id, event_type, safe_evidence)
  values (existing_refund.id, 'refund_requested', jsonb_build_object(
    'paymentAttemptId', attempt.id, 'amount', remaining_amount, 'currency', attempt.currency
  ));

  return jsonb_build_object(
    'outcome', 'CLAIMED', 'refundId', existing_refund.id,
    'paymentAttemptId', attempt.id, 'providerPaymentId', attempt.provider_payment_id,
    'amount', remaining_amount, 'currency', attempt.currency,
    'reason', existing_refund.reason, 'status', existing_refund.status,
    'providerRequestStarted', false
  );
end;
$$;

create or replace function public.start_retail_payment_refund_request_v1(p_refund_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed boolean;
begin
  update public.retail_payment_refunds
  set provider_request_started_at = now(), status = 'pending', failure_code = null
  where id = p_refund_id and status = 'created' and provider_request_started_at is null;
  changed := found;
  if changed then
    insert into public.retail_payment_refund_events(refund_id, event_type)
    values (p_refund_id, 'provider_request_started');
  end if;
  return changed;
end;
$$;

create or replace function public.assign_retail_payment_provider_refund_v1(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_provider_status text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed boolean;
begin
  if p_provider_refund_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or char_length(coalesce(p_provider_status, '')) not between 1 and 100 then
    return false;
  end if;
  update public.retail_payment_refunds
  set provider_refund_id = lower(p_provider_refund_id), provider_status = p_provider_status,
      status = 'pending', failure_code = null
  where id = p_refund_id and status = 'pending' and provider_request_started_at is not null
    and (provider_refund_id is null or provider_refund_id = lower(p_provider_refund_id));
  changed := found;
  if changed then
    insert into public.retail_payment_refund_events(refund_id, event_type, safe_evidence)
    values (p_refund_id, 'provider_refund_assigned', jsonb_build_object(
      'providerRefundId', lower(p_provider_refund_id), 'providerStatus', p_provider_status
    ));
  end if;
  return changed;
end;
$$;

create or replace function public.record_retail_payment_refund_failure_v1(
  p_refund_id uuid,
  p_failure_code text,
  p_terminal boolean
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed boolean;
begin
  if char_length(coalesce(p_failure_code, '')) not between 1 and 100
    or p_failure_code !~ '^[A-Z0-9_:-]+$' then return false; end if;
  update public.retail_payment_refunds
  set status = case when p_terminal then 'failed' else 'pending' end,
      failure_code = p_failure_code,
      last_reconciled_at = case when provider_refund_id is not null then now() else last_reconciled_at end
  where id = p_refund_id and status in ('created', 'pending');
  changed := found;
  if changed then
    insert into public.retail_payment_refund_events(refund_id, event_type, safe_evidence)
    values (p_refund_id, case when p_terminal then 'refund_failed' else 'reconciliation_pending' end,
      jsonb_build_object('failureCode', p_failure_code, 'terminal', p_terminal));
  end if;
  return changed;
end;
$$;

create or replace function public.get_retail_payment_refund_context_v1(p_refund_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'refundId', refund.id, 'paymentAttemptId', refund.payment_attempt_id,
    'providerPaymentId', attempt.provider_payment_id, 'providerRefundId', refund.provider_refund_id,
    'amount', refund.amount, 'currency', refund.currency, 'reason', refund.reason,
    'status', refund.status, 'providerStatus', refund.provider_status,
    'providerRequestStarted', refund.provider_request_started_at is not null,
    'failureCode', refund.failure_code
  )
  from public.retail_payment_refunds refund
  join public.retail_payment_attempts attempt on attempt.id = refund.payment_attempt_id
  where refund.id = p_refund_id;
$$;

create or replace function public.reconcile_retail_payment_refund_v1(
  p_refund_id uuid,
  p_provider_payment_id text,
  p_provider_refund_id text,
  p_refund_type text,
  p_amount numeric,
  p_currency text,
  p_provider_status text,
  p_provider_executed_at timestamptz,
  p_payment_status text,
  p_remaining_refundable numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  refund public.retail_payment_refunds%rowtype;
  attempt public.retail_payment_attempts%rowtype;
  final_success boolean;
begin
  select candidate.* into refund from public.retail_payment_refunds candidate
  where candidate.id = p_refund_id for update;
  if not found then return jsonb_build_object('outcome', 'NOT_FOUND'); end if;
  select candidate.* into attempt from public.retail_payment_attempts candidate
  where candidate.id = refund.payment_attempt_id;

  if refund.provider_refund_id is null
    or lower(coalesce(p_provider_refund_id, '')) <> refund.provider_refund_id
    or lower(coalesce(p_provider_payment_id, '')) <> attempt.provider_payment_id
    or p_refund_type <> 'Full'
    or round(coalesce(p_amount, 0), 2) <> refund.amount
    or p_currency <> refund.currency then
    update public.retail_payment_refunds set last_reconciled_at = now(), failure_code = 'PROVIDER_EVIDENCE_MISMATCH'
    where id = refund.id;
    insert into public.retail_payment_refund_events(refund_id, event_type, safe_evidence)
    values (refund.id, 'reconciliation_pending', jsonb_build_object('failureCode', 'PROVIDER_EVIDENCE_MISMATCH'));
    return jsonb_build_object('outcome', 'EVIDENCE_MISMATCH', 'refundId', refund.id);
  end if;

  if refund.status = 'refunded' then
    return jsonb_build_object('outcome', 'DUPLICATE', 'refundId', refund.id, 'status', 'refunded',
      'remainingRefundable', 0);
  end if;

  final_success := p_provider_status = 'Accepted'
    and p_payment_status = 'Refunded'
    and round(coalesce(p_remaining_refundable, -1), 2) = 0
    and p_provider_executed_at is not null;

  if final_success then
    update public.retail_payment_refunds
    set status = 'refunded', provider_status = p_provider_status, confirmed_at = p_provider_executed_at,
        last_reconciled_at = now(), failure_code = null
    where id = refund.id;
    insert into public.retail_payment_refund_events(refund_id, event_type, safe_evidence)
    values (refund.id, 'refund_confirmed', jsonb_build_object(
      'providerStatus', p_provider_status, 'paymentStatus', p_payment_status,
      'amount', refund.amount, 'currency', refund.currency, 'remainingRefundable', 0
    ));
    return jsonb_build_object('outcome', 'REFUNDED', 'refundId', refund.id, 'status', 'refunded',
      'remainingRefundable', 0, 'confirmedAt', p_provider_executed_at);
  end if;

  if p_provider_status = 'Rejected' then
    update public.retail_payment_refunds
    set status = 'failed', provider_status = p_provider_status, last_reconciled_at = now(),
        failure_code = 'PROVIDER_REJECTED'
    where id = refund.id;
    insert into public.retail_payment_refund_events(refund_id, event_type, safe_evidence)
    values (refund.id, 'refund_failed', jsonb_build_object('providerStatus', p_provider_status, 'failureCode', 'PROVIDER_REJECTED'));
    return jsonb_build_object('outcome', 'FAILED', 'refundId', refund.id, 'status', 'failed');
  end if;

  update public.retail_payment_refunds
  set status = 'pending', provider_status = p_provider_status, last_reconciled_at = now(),
      failure_code = case when p_provider_status = 'Manual' then 'PROVIDER_MANUAL_REVIEW' else null end
  where id = refund.id;
  insert into public.retail_payment_refund_events(refund_id, event_type, safe_evidence)
  values (refund.id, 'reconciliation_pending', jsonb_build_object(
    'providerStatus', p_provider_status, 'paymentStatus', p_payment_status,
    'remainingRefundable', p_remaining_refundable
  ));
  return jsonb_build_object('outcome', 'PENDING', 'refundId', refund.id, 'status', 'pending',
    'remainingRefundable', p_remaining_refundable);
end;
$$;

revoke all on function public.claim_retail_payment_refund_v1(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.start_retail_payment_refund_request_v1(uuid) from public, anon, authenticated;
revoke all on function public.assign_retail_payment_provider_refund_v1(uuid,text,text) from public, anon, authenticated;
revoke all on function public.record_retail_payment_refund_failure_v1(uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.get_retail_payment_refund_context_v1(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_retail_payment_refund_v1(uuid,text,text,text,numeric,text,text,timestamptz,text,numeric) from public, anon, authenticated;

grant execute on function public.claim_retail_payment_refund_v1(uuid,text,uuid) to service_role;
grant execute on function public.start_retail_payment_refund_request_v1(uuid) to service_role;
grant execute on function public.assign_retail_payment_provider_refund_v1(uuid,text,text) to service_role;
grant execute on function public.record_retail_payment_refund_failure_v1(uuid,text,boolean) to service_role;
grant execute on function public.get_retail_payment_refund_context_v1(uuid) to service_role;
grant execute on function public.reconcile_retail_payment_refund_v1(uuid,text,text,text,numeric,text,text,timestamptz,text,numeric) to service_role;

comment on table public.retail_payment_refunds is
  'Provider-neutral durable full-refund intents for verified retail payments; original paid history remains immutable.';
comment on table public.retail_payment_refund_events is
  'Append-only bounded, non-sensitive refund lifecycle evidence.';

commit;
