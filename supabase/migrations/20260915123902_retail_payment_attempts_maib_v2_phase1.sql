begin;

set local lock_timeout = '5s';

create table public.retail_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  retail_order_id uuid not null references public.retail_orders(id) on delete restrict,
  provider text not null check (provider in ('maib')),
  status text not null check (status in ('created', 'pending', 'paid', 'failed', 'cancelled', 'expired')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  idempotency_key uuid not null unique,
  provider_checkout_id text null check (
    provider_checkout_id is null
    or (char_length(provider_checkout_id) between 1 and 200)
  ),
  provider_checkout_url text null check (
    provider_checkout_url is null
    or (char_length(provider_checkout_url) between 1 and 2000 and provider_checkout_url ~ '^https://')
  ),
  provider_payment_id text null check (
    provider_payment_id is null
    or (char_length(provider_payment_id) between 1 and 200)
  ),
  provider_status text null check (
    provider_status is null
    or char_length(provider_status) between 1 and 100
  ),
  failure_code text null check (
    failure_code is null
    or (char_length(failure_code) between 1 and 100 and failure_code ~ '^[A-Z0-9_:-]+$')
  ),
  provider_request_started_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz null,
  check ((status = 'paid') = (confirmed_at is not null)),
  check (
    status <> 'pending'
    or (provider_checkout_id is not null and provider_checkout_url is not null)
  )
);

create index retail_payment_attempts_order_idx
  on public.retail_payment_attempts (retail_order_id, created_at desc, id);

create unique index retail_payment_attempts_provider_checkout_idx
  on public.retail_payment_attempts (provider, provider_checkout_id)
  where provider_checkout_id is not null;

create unique index retail_payment_attempts_active_order_provider_idx
  on public.retail_payment_attempts (retail_order_id, provider)
  where status in ('created', 'pending');

create trigger retail_payment_attempts_set_updated_at
before update on public.retail_payment_attempts
for each row execute function public.set_updated_at();

alter table public.retail_payment_attempts enable row level security;

revoke all on public.retail_payment_attempts from public, anon, authenticated, service_role;
grant select, insert, update on public.retail_payment_attempts to service_role;

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
    and attempt.status in ('created', 'pending')
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

create or replace function public.complete_retail_payment_attempt_checkout(
  p_attempt_id uuid,
  p_idempotency_key uuid,
  p_provider_checkout_id text,
  p_provider_checkout_url text,
  p_provider_status text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  if p_attempt_id is null
    or p_idempotency_key is null
    or p_provider_checkout_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or char_length(p_provider_checkout_id) > 200
    or p_provider_checkout_url !~ '^https://'
    or char_length(p_provider_checkout_url) > 2000
    or char_length(coalesce(p_provider_status, '')) not between 1 and 100 then
    return false;
  end if;

  update public.retail_payment_attempts
  set status = 'pending',
      provider_checkout_id = lower(p_provider_checkout_id),
      provider_checkout_url = p_provider_checkout_url,
      provider_status = p_provider_status,
      failure_code = null
  where id = p_attempt_id
    and idempotency_key = p_idempotency_key
    and provider = 'maib'
    and status = 'created';
  get diagnostics affected = row_count;

  if affected = 1 then return true; end if;

  return exists (
    select 1 from public.retail_payment_attempts attempt
    where attempt.id = p_attempt_id
      and attempt.idempotency_key = p_idempotency_key
      and attempt.provider = 'maib'
      and attempt.status = 'pending'
      and attempt.provider_checkout_id = lower(p_provider_checkout_id)
      and attempt.provider_checkout_url = p_provider_checkout_url
  );
end;
$$;

create or replace function public.record_retail_payment_attempt_failure(
  p_attempt_id uuid,
  p_idempotency_key uuid,
  p_failure_code text,
  p_terminal boolean
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  if p_attempt_id is null
    or p_idempotency_key is null
    or p_failure_code !~ '^[A-Z0-9_:-]+$'
    or char_length(p_failure_code) > 100 then
    return false;
  end if;

  update public.retail_payment_attempts
  set status = case when p_terminal then 'failed' else 'created' end,
      failure_code = p_failure_code
  where id = p_attempt_id
    and idempotency_key = p_idempotency_key
    and provider = 'maib'
    and status = 'created';
  get diagnostics affected = row_count;

  return affected = 1 or exists (
    select 1 from public.retail_payment_attempts attempt
    where attempt.id = p_attempt_id
      and attempt.idempotency_key = p_idempotency_key
      and attempt.failure_code = p_failure_code
  );
end;
$$;

revoke all on function public.claim_retail_payment_attempt(text, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_retail_payment_attempt_checkout(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_retail_payment_attempt_failure(uuid, uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.claim_retail_payment_attempt(text, text, uuid) to service_role;
grant execute on function public.complete_retail_payment_attempt_checkout(uuid, uuid, text, text, text) to service_role;
grant execute on function public.record_retail_payment_attempt_failure(uuid, uuid, text, boolean) to service_role;

comment on table public.retail_payment_attempts is
  'Provider-neutral, server-governed retail payment initiation state. Contains no card data, OAuth tokens, secrets, or raw provider payloads.';
comment on function public.claim_retail_payment_attempt(text, text, uuid) is
  'Atomically validates token-scoped immutable RetailOrder payment truth and claims/reuses one active provider attempt.';

commit;
