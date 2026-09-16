begin;

set local lock_timeout = '5s';

alter table public.retail_payment_attempts
  drop constraint retail_payment_attempts_status_check,
  drop constraint retail_payment_attempts_check,
  drop constraint retail_payment_attempts_check1,
  add column provider_rrn text null check (
    provider_rrn is null or (char_length(provider_rrn) between 1 and 100)
  ),
  add column provider_event_at timestamptz null,
  add constraint retail_payment_attempts_status_check check (
    status in ('created', 'pending', 'paid_pending_activation', 'paid', 'failed', 'cancelled', 'expired')
  ),
  add constraint retail_payment_attempts_confirmation_check check (
    (status in ('paid_pending_activation', 'paid')) = (confirmed_at is not null)
  ),
  add constraint retail_payment_attempts_checkout_state_check check (
    status not in ('pending', 'paid_pending_activation', 'paid')
    or (provider_checkout_id is not null and provider_checkout_url is not null)
  );

create unique index retail_payment_attempts_provider_payment_idx
  on public.retail_payment_attempts (provider, provider_payment_id)
  where provider_payment_id is not null;

drop index public.retail_payment_attempts_active_order_provider_idx;
create unique index retail_payment_attempts_active_order_provider_idx
  on public.retail_payment_attempts (retail_order_id, provider)
  where status in ('created', 'pending', 'paid_pending_activation');

create or replace function public.claim_retail_payment_attempt(
  p_access_token_hash text,
  p_provider text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_order public.retail_orders%rowtype;
  existing_attempt public.retail_payment_attempts%rowtype;
  authoritative_amount numeric(14,2);
  calculated_amount numeric(14,2);
begin
  if p_access_token_hash !~ '^[0-9a-f]{64}$'
    or p_provider <> 'maib'
    or p_idempotency_key is null then
    return jsonb_build_object('outcome', 'NOT_ELIGIBLE');
  end if;

  select orders.* into target_order
  from public.retail_order_access_tokens token
  join public.retail_orders orders on orders.id = token.order_id
  where token.token_hash = p_access_token_hash
    and token.revoked_at is null
    and token.expires_at > now()
  for update of orders;

  if not found then
    return jsonb_build_object('outcome', 'NOT_ELIGIBLE');
  end if;

  if target_order.status <> 'awaiting_payment' then
    return jsonb_build_object('outcome', 'INVALID_ORDER_STATE');
  end if;

  if not target_order.orchestration_snapshot_locked
    or target_order.currency <> 'MDL'
    or target_order.final_commercial_total is null
    or target_order.final_commercial_total <= 0 then
    return jsonb_build_object('outcome', 'NOT_ELIGIBLE');
  end if;

  calculated_amount := target_order.equipment_subtotal
    + target_order.materials_subtotal
    + coalesce(target_order.installation_subtotal, 0)
    - target_order.equipment_discount_amount;
  authoritative_amount := target_order.final_commercial_total;

  if calculated_amount <> authoritative_amount
    or not exists (
      select 1 from public.retail_order_lines line where line.order_id = target_order.id
    )
    or exists (
      select 1 from public.retail_order_lines line
      where line.order_id = target_order.id
        and (line.unit_price <= 0 or line.line_total <= 0 or line.currency <> target_order.currency)
    )
    or (
      target_order.installation_selection_mode is not null
      and (
        target_order.installation_tariff_set_id is null
        or target_order.installation_subtotal is null
        or target_order.installation_subtotal <= 0
        or jsonb_array_length(target_order.installation_work_lines_snapshot) = 0
      )
    ) then
    return jsonb_build_object('outcome', 'UNPRICED_ORDER');
  end if;

  select attempt.* into existing_attempt
  from public.retail_payment_attempts attempt
  where attempt.idempotency_key = p_idempotency_key
  for update;

  if found then
    if existing_attempt.retail_order_id <> target_order.id
      or existing_attempt.provider <> p_provider then
      return jsonb_build_object('outcome', 'PAYMENT_ATTEMPT_EXISTS');
    end if;
    if existing_attempt.status = 'pending'
      and existing_attempt.provider_checkout_id is not null
      and existing_attempt.provider_checkout_url is not null then
      return jsonb_build_object(
        'outcome', 'REUSE_PENDING',
        'attemptId', existing_attempt.id,
        'amount', existing_attempt.amount,
        'currency', existing_attempt.currency,
        'orderNumber', target_order.public_number,
        'orderCreatedAt', target_order.created_at,
        'locale', target_order.locale,
        'checkoutUrl', existing_attempt.provider_checkout_url
      );
    end if;
    return jsonb_build_object('outcome', 'PAYMENT_ATTEMPT_EXISTS', 'attemptId', existing_attempt.id);
  end if;

  select attempt.* into existing_attempt
  from public.retail_payment_attempts attempt
  where attempt.retail_order_id = target_order.id
    and attempt.provider = p_provider
    and attempt.status in ('created', 'pending', 'paid_pending_activation')
  for update;

  if found then
    if existing_attempt.status = 'pending'
      and existing_attempt.provider_checkout_id is not null
      and existing_attempt.provider_checkout_url is not null then
      return jsonb_build_object(
        'outcome', 'REUSE_PENDING',
        'attemptId', existing_attempt.id,
        'amount', existing_attempt.amount,
        'currency', existing_attempt.currency,
        'orderNumber', target_order.public_number,
        'orderCreatedAt', target_order.created_at,
        'locale', target_order.locale,
        'checkoutUrl', existing_attempt.provider_checkout_url
      );
    end if;
    return jsonb_build_object('outcome', 'PAYMENT_ATTEMPT_EXISTS', 'attemptId', existing_attempt.id);
  end if;

  insert into public.retail_payment_attempts (
    retail_order_id,
    provider,
    status,
    amount,
    currency,
    idempotency_key,
    provider_request_started_at
  ) values (
    target_order.id,
    p_provider,
    'created',
    authoritative_amount,
    target_order.currency,
    p_idempotency_key,
    now()
  )
  returning * into existing_attempt;

  return jsonb_build_object(
    'outcome', 'CLAIMED',
    'attemptId', existing_attempt.id,
    'amount', existing_attempt.amount,
    'currency', existing_attempt.currency,
    'orderNumber', target_order.public_number,
    'orderCreatedAt', target_order.created_at,
    'locale', target_order.locale,
    'checkoutUrl', null
  );
end;
$$;

create table public.retail_payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.retail_payment_attempts(id) on delete restrict,
  provider text not null check (provider = 'maib'),
  provider_payment_id text not null check (char_length(provider_payment_id) between 1 and 200),
  provider_checkout_id text not null check (char_length(provider_checkout_id) between 1 and 200),
  provider_status text not null check (char_length(provider_status) between 1 and 100),
  provider_event_at timestamptz not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  provider_rrn text null check (provider_rrn is null or char_length(provider_rrn) between 1 and 100),
  processing_outcome text not null check (processing_outcome in (
    'VERIFIED', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'ORDER_MISMATCH', 'PAYMENT_MISMATCH', 'NON_PAID'
  )),
  received_at timestamptz not null default now(),
  unique (provider, provider_payment_id, provider_status)
);

create index retail_payment_provider_events_attempt_idx
  on public.retail_payment_provider_events (payment_attempt_id, received_at desc, id);

create table public.retail_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.retail_payment_attempts(id) on delete restrict,
  provider_event_id uuid null references public.retail_payment_provider_events(id) on delete restrict,
  event_type text not null check (event_type in (
    'callback_rejected', 'callback_non_paid', 'payment_confirmed',
    'activation_pending', 'activation_completed', 'reconciliation_completed'
  )),
  safe_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_evidence) = 'object'),
  created_at timestamptz not null default now()
);

create index retail_payment_events_attempt_idx
  on public.retail_payment_events (payment_attempt_id, created_at desc, id);

create or replace function private.prevent_retail_payment_event_mutation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Retail payment events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_retail_payment_provider_event_mutation_v1
before update or delete on public.retail_payment_provider_events
for each row execute function private.prevent_retail_payment_event_mutation_v1();

create trigger prevent_retail_payment_event_mutation_v1
before update or delete on public.retail_payment_events
for each row execute function private.prevent_retail_payment_event_mutation_v1();

create or replace function public.confirm_maib_retail_payment_callback_v1(
  p_provider_checkout_id text,
  p_provider_payment_id text,
  p_order_reference text,
  p_checkout_amount numeric,
  p_checkout_currency text,
  p_payment_amount numeric,
  p_payment_currency text,
  p_provider_status text,
  p_provider_event_at timestamptz,
  p_provider_rrn text default null,
  p_source text default 'callback'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  attempt public.retail_payment_attempts%rowtype;
  provider_event public.retail_payment_provider_events%rowtype;
  processing_outcome text;
  inserted_event boolean := false;
  activation_result jsonb;
  activation_was_repeated boolean := false;
begin
  if p_provider_checkout_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_provider_payment_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_order_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_checkout_amount is null or p_checkout_amount <= 0
    or p_payment_amount is null or p_payment_amount <= 0
    or p_checkout_currency !~ '^[A-Z]{3}$'
    or p_payment_currency !~ '^[A-Z]{3}$'
    or char_length(coalesce(p_provider_status, '')) not between 1 and 100
    or p_provider_event_at is null
    or p_source not in ('callback', 'reconciliation')
    or char_length(coalesce(p_provider_rrn, '')) > 100 then
    return jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  end if;

  select candidate.* into attempt
  from public.retail_payment_attempts candidate
  where candidate.provider = 'maib'
    and candidate.provider_checkout_id = lower(p_provider_checkout_id)
  for update;

  if not found then
    return jsonb_build_object('outcome', 'UNKNOWN_CHECKOUT');
  end if;

  processing_outcome := case
    when p_order_reference <> attempt.id::text then 'ORDER_MISMATCH'
    when attempt.provider_payment_id is not null and attempt.provider_payment_id <> lower(p_provider_payment_id) then 'PAYMENT_MISMATCH'
    when round(p_checkout_amount, 2) <> attempt.amount or round(p_payment_amount, 2) <> attempt.amount then 'AMOUNT_MISMATCH'
    when p_checkout_currency <> attempt.currency or p_payment_currency <> attempt.currency or p_payment_currency <> 'MDL' then 'CURRENCY_MISMATCH'
    when p_provider_status <> 'Executed' then 'NON_PAID'
    else 'VERIFIED'
  end;

  insert into public.retail_payment_provider_events (
    payment_attempt_id, provider, provider_payment_id, provider_checkout_id,
    provider_status, provider_event_at, amount, currency, provider_rrn, processing_outcome
  ) values (
    attempt.id, 'maib', lower(p_provider_payment_id), lower(p_provider_checkout_id),
    p_provider_status, p_provider_event_at, round(p_payment_amount, 2), p_payment_currency,
    nullif(btrim(coalesce(p_provider_rrn, '')), ''), processing_outcome
  )
  on conflict (provider, provider_payment_id, provider_status) do nothing
  returning * into provider_event;
  inserted_event := found;

  if not inserted_event then
    select event.* into provider_event
    from public.retail_payment_provider_events event
    where event.provider = 'maib'
      and event.provider_payment_id = lower(p_provider_payment_id)
      and event.provider_status = p_provider_status;
    if provider_event.payment_attempt_id <> attempt.id
      or provider_event.provider_checkout_id <> lower(p_provider_checkout_id)
      or provider_event.processing_outcome <> processing_outcome then
      return jsonb_build_object('outcome', 'PAYMENT_MISMATCH');
    end if;
  end if;

  if processing_outcome <> 'VERIFIED' then
    if inserted_event then
      insert into public.retail_payment_events(payment_attempt_id, provider_event_id, event_type, safe_evidence)
      values (
        attempt.id, provider_event.id,
        case when processing_outcome = 'NON_PAID' then 'callback_non_paid' else 'callback_rejected' end,
        jsonb_build_object('outcome', processing_outcome, 'providerStatus', p_provider_status, 'source', p_source)
      );
    end if;
    if processing_outcome = 'NON_PAID' and attempt.status not in ('paid_pending_activation', 'paid') then
      update public.retail_payment_attempts
      set provider_status = p_provider_status,
          provider_payment_id = coalesce(provider_payment_id, lower(p_provider_payment_id)),
          provider_event_at = greatest(coalesce(provider_event_at, p_provider_event_at), p_provider_event_at)
      where id = attempt.id;
    end if;
    return jsonb_build_object('outcome', processing_outcome, 'attemptId', attempt.id);
  end if;

  if attempt.status = 'paid' then
    return jsonb_build_object(
      'outcome', 'DUPLICATE', 'attemptId', attempt.id, 'retailOrderId', attempt.retail_order_id,
      'paymentStatus', 'paid', 'activationRepeated', true
    );
  end if;

  update public.retail_payment_attempts
  set status = 'paid_pending_activation',
      provider_payment_id = lower(p_provider_payment_id),
      provider_status = p_provider_status,
      provider_rrn = nullif(btrim(coalesce(p_provider_rrn, '')), ''),
      provider_event_at = p_provider_event_at,
      confirmed_at = coalesce(confirmed_at, now()),
      failure_code = null
  where id = attempt.id;

  if attempt.status <> 'paid_pending_activation' then
    insert into public.retail_payment_events(payment_attempt_id, provider_event_id, event_type, safe_evidence)
    values (attempt.id, provider_event.id, 'payment_confirmed', jsonb_build_object(
      'providerStatus', p_provider_status, 'currency', p_payment_currency, 'source', p_source
    ));
  end if;

  begin
    activation_result := public.activate_paid_retail_order(
      attempt.retail_order_id, 'payment_verified', provider_event.id, 'MAIB verified payment'
    );
    activation_was_repeated := coalesce((activation_result->>'repeated')::boolean, false);

    update public.retail_payment_attempts
    set status = 'paid'
    where id = attempt.id and status = 'paid_pending_activation';

    insert into public.retail_payment_events(payment_attempt_id, provider_event_id, event_type, safe_evidence)
    values (
      attempt.id, provider_event.id,
      case when p_source = 'reconciliation' then 'reconciliation_completed' else 'activation_completed' end,
      jsonb_build_object(
        'activationRepeated', activation_was_repeated,
        'installationRequirementId', activation_result->>'installationRequirementId',
        'source', p_source
      )
    );
  exception when others then
    insert into public.retail_payment_events(payment_attempt_id, provider_event_id, event_type, safe_evidence)
    values (attempt.id, provider_event.id, 'activation_pending', jsonb_build_object(
      'sqlstate', sqlstate, 'source', p_source
    ));
    return jsonb_build_object(
      'outcome', 'PAID_PENDING_ACTIVATION', 'attemptId', attempt.id,
      'retailOrderId', attempt.retail_order_id, 'paymentStatus', 'paid_pending_activation'
    );
  end;

  return jsonb_build_object(
    'outcome', case when inserted_event then 'PAID' else 'DUPLICATE' end,
    'attemptId', attempt.id,
    'retailOrderId', attempt.retail_order_id,
    'paymentStatus', 'paid',
    'activationRepeated', activation_was_repeated,
    'installationRequirementId', activation_result->>'installationRequirementId'
  );
end;
$$;

create or replace function public.get_maib_retail_payment_reconciliation_context_v1(p_attempt_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'attemptId', attempt.id,
    'checkoutId', attempt.provider_checkout_id,
    'paymentId', attempt.provider_payment_id,
    'status', attempt.status,
    'amount', attempt.amount,
    'currency', attempt.currency
  )
  from public.retail_payment_attempts attempt
  where attempt.id = p_attempt_id and attempt.provider = 'maib';
$$;

create or replace function public.retry_maib_retail_payment_activation_v1(p_attempt_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  attempt public.retail_payment_attempts%rowtype;
  provider_event public.retail_payment_provider_events%rowtype;
  activation_result jsonb;
begin
  select candidate.* into attempt
  from public.retail_payment_attempts candidate
  where candidate.id = p_attempt_id and candidate.provider = 'maib'
  for update;
  if not found then return jsonb_build_object('outcome', 'INVALID_EVIDENCE'); end if;
  if attempt.status = 'paid' then
    return jsonb_build_object(
      'outcome', 'DUPLICATE', 'attemptId', attempt.id, 'retailOrderId', attempt.retail_order_id,
      'paymentStatus', 'paid', 'activationRepeated', true
    );
  end if;
  if attempt.status <> 'paid_pending_activation' then
    return jsonb_build_object('outcome', 'INVALID_EVIDENCE', 'attemptId', attempt.id);
  end if;

  select event.* into provider_event
  from public.retail_payment_provider_events event
  where event.payment_attempt_id = attempt.id
    and event.processing_outcome = 'VERIFIED'
    and event.provider_status = 'Executed'
  order by event.received_at desc, event.id desc
  limit 1;
  if not found then return jsonb_build_object('outcome', 'INVALID_EVIDENCE', 'attemptId', attempt.id); end if;

  begin
    activation_result := public.activate_paid_retail_order(
      attempt.retail_order_id, 'payment_verified', provider_event.id, 'MAIB verified payment recovery'
    );
    update public.retail_payment_attempts set status = 'paid'
    where id = attempt.id and status = 'paid_pending_activation';
    insert into public.retail_payment_events(payment_attempt_id, provider_event_id, event_type, safe_evidence)
    values (attempt.id, provider_event.id, 'reconciliation_completed', jsonb_build_object(
      'activationRepeated', coalesce((activation_result->>'repeated')::boolean, false),
      'installationRequirementId', activation_result->>'installationRequirementId',
      'source', 'local_recovery'
    ));
  exception when others then
    insert into public.retail_payment_events(payment_attempt_id, provider_event_id, event_type, safe_evidence)
    values (attempt.id, provider_event.id, 'activation_pending', jsonb_build_object(
      'sqlstate', sqlstate, 'source', 'local_recovery'
    ));
    return jsonb_build_object(
      'outcome', 'PAID_PENDING_ACTIVATION', 'attemptId', attempt.id,
      'retailOrderId', attempt.retail_order_id, 'paymentStatus', 'paid_pending_activation'
    );
  end;

  return jsonb_build_object(
    'outcome', 'PAID', 'attemptId', attempt.id, 'retailOrderId', attempt.retail_order_id,
    'paymentStatus', 'paid',
    'activationRepeated', coalesce((activation_result->>'repeated')::boolean, false),
    'installationRequirementId', activation_result->>'installationRequirementId'
  );
end;
$$;

create or replace function public.get_retail_payment_return_state_v1(p_payment_attempt_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'status', case
      when attempt.status = 'paid' then 'PAID'
      when attempt.status in ('failed', 'expired') then 'FAILED'
      when attempt.status = 'cancelled' then 'CANCELLED'
      else 'PROCESSING'
    end,
    'locale', orders.locale
  )
  from public.retail_payment_attempts attempt
  join public.retail_orders orders on orders.id = attempt.retail_order_id
  where attempt.provider = 'maib'
    and attempt.id = p_payment_attempt_id;
$$;

alter table public.retail_payment_provider_events enable row level security;
alter table public.retail_payment_provider_events force row level security;
alter table public.retail_payment_events enable row level security;
alter table public.retail_payment_events force row level security;

revoke all on table public.retail_payment_provider_events, public.retail_payment_events
from public, anon, authenticated, service_role;
grant select, insert on table public.retail_payment_provider_events, public.retail_payment_events
to service_role;

revoke all on function private.prevent_retail_payment_event_mutation_v1()
from public, anon, authenticated, service_role;
revoke all on function public.confirm_maib_retail_payment_callback_v1(text,text,text,numeric,text,numeric,text,text,timestamptz,text,text)
from public, anon, authenticated;
revoke all on function public.get_maib_retail_payment_reconciliation_context_v1(uuid)
from public, anon, authenticated;
revoke all on function public.retry_maib_retail_payment_activation_v1(uuid)
from public, anon, authenticated;
revoke all on function public.get_retail_payment_return_state_v1(uuid)
from public, anon, authenticated;

grant execute on function public.confirm_maib_retail_payment_callback_v1(text,text,text,numeric,text,numeric,text,text,timestamptz,text,text)
to service_role;
grant execute on function public.get_maib_retail_payment_reconciliation_context_v1(uuid)
to service_role;
grant execute on function public.retry_maib_retail_payment_activation_v1(uuid)
to service_role;
grant execute on function public.get_retail_payment_return_state_v1(uuid)
to service_role;

comment on table public.retail_payment_provider_events is
  'Immutable, PII-free MAIB provider event identity used for durable callback/reconciliation deduplication.';
comment on table public.retail_payment_events is
  'Append-only safe lifecycle evidence for local retail payment confirmation and activation.';

commit;
