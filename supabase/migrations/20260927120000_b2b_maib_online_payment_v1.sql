begin;

create table public.b2b_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  partner_order_id uuid not null references public.partner_orders(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  initiated_by uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider = 'maib'),
  status text not null default 'created'
    check (status in ('created', 'pending', 'paid', 'failed', 'cancelled', 'expired')),
  idempotency_key uuid not null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null check (currency = 'MDL'),
  locale text not null check (locale in ('ru', 'ro')),
  return_access_token_hash text not null check (return_access_token_hash ~ '^[0-9a-f]{64}$'),
  provider_checkout_id uuid null,
  provider_checkout_url text null,
  provider_payment_id uuid null,
  provider_status text null,
  provider_rrn text null,
  failure_code text null,
  payment_confirmed_at timestamptz null,
  provider_event_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint b2b_payment_attempt_order_idempotency_unique
    unique (partner_order_id, provider, idempotency_key),
  constraint b2b_payment_attempt_checkout_unique unique (provider, provider_checkout_id),
  constraint b2b_payment_attempt_payment_unique unique (provider, provider_payment_id)
);

create index b2b_payment_attempts_order_created_idx
  on public.b2b_payment_attempts(partner_order_id, created_at desc);
create unique index b2b_payment_attempts_one_open_idx
  on public.b2b_payment_attempts(partner_order_id, provider)
  where status in ('created', 'pending', 'paid');

create trigger set_b2b_payment_attempts_updated_at
before update on public.b2b_payment_attempts
for each row execute function public.set_updated_at();

alter table public.b2b_payment_attempts enable row level security;
revoke all on table public.b2b_payment_attempts from public, anon, authenticated;
grant select, insert, update on table public.b2b_payment_attempts to service_role;

create table public.b2b_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.b2b_payment_attempts(id) on delete restrict,
  event_type text not null,
  provider_payment_id uuid null,
  provider_status text null,
  provider_event_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index b2b_payment_events_paid_once_idx
  on public.b2b_payment_events(payment_attempt_id)
  where event_type = 'payment_verified';

alter table public.b2b_payment_events enable row level security;
revoke all on table public.b2b_payment_events from public, anon, authenticated;
grant select, insert on table public.b2b_payment_events to service_role;

create function public.claim_b2b_payment_attempt_v1(
  p_partner_order_id uuid,
  p_provider text,
  p_idempotency_key uuid,
  p_return_access_token_hash text,
  p_locale text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.partner_orders%rowtype;
  diagnostic public.partner_order_export_diagnostics%rowtype;
  existing public.b2b_payment_attempts%rowtype;
  attempt public.b2b_payment_attempts%rowtype;
begin
  if auth.uid() is null or p_provider <> 'maib' or p_idempotency_key is null
    or p_return_access_token_hash !~ '^[0-9a-f]{64}$' or p_locale not in ('ru', 'ro') then
    return jsonb_build_object('outcome', 'NOT_ELIGIBLE');
  end if;

  select * into target_order from public.partner_orders
  where id = p_partner_order_id for update;
  if target_order.id is null or not public.has_permission(target_order.company_id, 'orders.manage') then
    return jsonb_build_object('outcome', 'NOT_ELIGIBLE');
  end if;
  if target_order.status <> 'submitted' or target_order.external_1c_ref is null
    or target_order.external_1c_number is null or target_order.submitted_at is null then
    return jsonb_build_object('outcome', 'INVALID_ORDER_STATE');
  end if;
  if target_order.document_total is null or target_order.document_total <= 0 then
    return jsonb_build_object('outcome', 'UNPRICED_ORDER');
  end if;
  if upper(coalesce(target_order.currency_code, '')) <> 'MDL' then
    return jsonb_build_object('outcome', 'NOT_ELIGIBLE');
  end if;

  select * into diagnostic from public.partner_order_export_diagnostics
  where order_id = target_order.id;
  if diagnostic.order_id is null or diagnostic.payment_method <> 'cashless'
    or diagnostic.planned_payment_date <> (now() at time zone 'Europe/Chisinau')::date
    or not diagnostic.read_back_verified then
    return jsonb_build_object('outcome', 'NOT_ELIGIBLE');
  end if;

  select * into existing from public.b2b_payment_attempts
  where partner_order_id = target_order.id and provider = p_provider
    and idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if existing.status = 'pending' and existing.provider_checkout_url is not null then
      update public.b2b_payment_attempts
      set return_access_token_hash = p_return_access_token_hash
      where id = existing.id;
      return jsonb_build_object(
        'outcome', 'REUSE_PENDING', 'attemptId', existing.id,
        'amount', existing.amount, 'currency', existing.currency,
        'orderNumber', target_order.external_1c_number,
        'orderCreatedAt', target_order.submitted_at, 'locale', existing.locale,
        'checkoutUrl', existing.provider_checkout_url
      );
    end if;
    return jsonb_build_object('outcome', 'PAYMENT_ATTEMPT_EXISTS');
  end if;
  if exists (select 1 from public.b2b_payment_attempts candidate
    where candidate.partner_order_id = target_order.id and candidate.provider = p_provider
      and candidate.status in ('created', 'pending', 'paid')) then
    return jsonb_build_object('outcome', 'PAYMENT_ATTEMPT_EXISTS');
  end if;

  insert into public.b2b_payment_attempts(
    partner_order_id, company_id, initiated_by, provider, idempotency_key,
    amount, currency, locale, return_access_token_hash
  ) values (
    target_order.id, target_order.company_id, auth.uid(), p_provider,
    p_idempotency_key, round(target_order.document_total, 2), 'MDL', p_locale,
    p_return_access_token_hash
  ) returning * into attempt;

  return jsonb_build_object(
    'outcome', 'CLAIMED', 'attemptId', attempt.id, 'amount', attempt.amount,
    'currency', attempt.currency, 'orderNumber', target_order.external_1c_number,
    'orderCreatedAt', target_order.submitted_at, 'locale', attempt.locale,
    'checkoutUrl', null
  );
end;
$$;

create function public.complete_b2b_payment_attempt_checkout_v1(
  p_attempt_id uuid,
  p_idempotency_key uuid,
  p_provider_checkout_id uuid,
  p_provider_checkout_url text,
  p_provider_status text
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_provider_checkout_url !~ '^https://checkout\.maib\.md/'
    and p_provider_checkout_url !~ '^https://checkout-sandbox\.maib\.md/' then
    return false;
  end if;
  update public.b2b_payment_attempts
  set status = 'pending', provider_checkout_id = p_provider_checkout_id,
      provider_checkout_url = p_provider_checkout_url,
      provider_status = left(p_provider_status, 100), failure_code = null
  where id = p_attempt_id and idempotency_key = p_idempotency_key
    and status = 'created' and provider_checkout_id is null;
  return found;
end;
$$;

create function public.record_b2b_payment_attempt_failure_v1(
  p_attempt_id uuid,
  p_idempotency_key uuid,
  p_failure_code text,
  p_terminal boolean
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.b2b_payment_attempts
  set status = case when p_terminal then 'failed' else status end,
      failure_code = left(coalesce(p_failure_code, 'UNKNOWN'), 100)
  where id = p_attempt_id and idempotency_key = p_idempotency_key
    and status in ('created', 'pending');
  return found;
end;
$$;

create function public.confirm_maib_b2b_payment_callback_v1(
  p_provider_checkout_id uuid,
  p_provider_payment_id uuid,
  p_order_reference uuid,
  p_checkout_amount numeric,
  p_checkout_currency text,
  p_payment_amount numeric,
  p_payment_currency text,
  p_provider_status text,
  p_provider_event_at timestamptz,
  p_provider_rrn text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  attempt public.b2b_payment_attempts%rowtype;
begin
  select * into attempt from public.b2b_payment_attempts
  where provider = 'maib' and provider_checkout_id = p_provider_checkout_id
  for update;
  if attempt.id is null then return jsonb_build_object('outcome', 'UNKNOWN_CHECKOUT'); end if;
  if p_order_reference is distinct from attempt.id then
    return jsonb_build_object('outcome', 'ORDER_MISMATCH');
  end if;
  if p_provider_payment_id is null then return jsonb_build_object('outcome', 'INVALID_EVIDENCE'); end if;
  if p_checkout_amount is null or p_payment_amount is null then
    return jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  end if;
  if round(p_checkout_amount, 2) <> attempt.amount or round(p_payment_amount, 2) <> attempt.amount then
    return jsonb_build_object('outcome', 'AMOUNT_MISMATCH');
  end if;
  if p_checkout_currency is null or p_payment_currency is null then
    return jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  end if;
  if upper(p_checkout_currency) <> attempt.currency or upper(p_payment_currency) <> attempt.currency then
    return jsonb_build_object('outcome', 'CURRENCY_MISMATCH');
  end if;
  if attempt.status = 'paid' then
    if attempt.provider_payment_id = p_provider_payment_id then
      return jsonb_build_object('outcome', 'DUPLICATE', 'attemptId', attempt.id,
        'paymentStatus', attempt.status, 'activationRepeated', true);
    end if;
    return jsonb_build_object('outcome', 'PAYMENT_MISMATCH');
  end if;
  if p_provider_status is null then
    return jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  end if;
  if p_provider_status <> 'Executed' then
    update public.b2b_payment_attempts set provider_status = left(p_provider_status, 100),
      provider_event_at = p_provider_event_at
    where id = attempt.id;
    return jsonb_build_object('outcome', 'NON_PAID', 'attemptId', attempt.id,
      'paymentStatus', attempt.status, 'activationRepeated', false);
  end if;

  begin
    update public.b2b_payment_attempts
    set status = 'paid', provider_payment_id = p_provider_payment_id,
      provider_status = p_provider_status, provider_rrn = left(p_provider_rrn, 100),
      provider_event_at = p_provider_event_at, payment_confirmed_at = now(),
      failure_code = null
    where id = attempt.id and status = 'pending';
  exception when unique_violation then
    return jsonb_build_object('outcome', 'PAYMENT_MISMATCH');
  end;
  if not found then return jsonb_build_object('outcome', 'INVALID_EVIDENCE'); end if;
  insert into public.b2b_payment_events(
    payment_attempt_id, event_type, provider_payment_id, provider_status, provider_event_at
  ) values (attempt.id, 'payment_verified', p_provider_payment_id, p_provider_status, p_provider_event_at)
  on conflict do nothing;
  return jsonb_build_object('outcome', 'PAID', 'attemptId', attempt.id,
    'paymentStatus', 'paid', 'activationRepeated', false);
end;
$$;

create function public.get_b2b_payment_return_state_v1(
  p_payment_attempt_id uuid,
  p_return_access_token_hash text
)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', case attempt.status when 'paid' then 'PAID' when 'failed' then 'FAILED'
      when 'cancelled' then 'CANCELLED' else 'PROCESSING' end,
    'locale', attempt.locale,
    'orderNumber', partner_order.external_1c_number,
    'amount', attempt.amount,
    'currency', attempt.currency,
    'confirmedAt', attempt.payment_confirmed_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'name', item.product_name, 'sku', item.sku, 'quantity', item.quantity
    ) order by item.id) from public.partner_order_items item
      where item.order_id = partner_order.id), '[]'::jsonb)
  )
  from public.b2b_payment_attempts attempt
  join public.partner_orders partner_order on partner_order.id = attempt.partner_order_id
  where attempt.id = p_payment_attempt_id
    and attempt.return_access_token_hash = p_return_access_token_hash;
$$;

create function public.get_maib_b2b_payment_reconciliation_context_v1(
  p_payment_attempt_id uuid
)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'attemptId', attempt.id,
    'checkoutId', attempt.provider_checkout_id,
    'status', attempt.status
  )
  from public.b2b_payment_attempts attempt
  where attempt.id = p_payment_attempt_id
    and attempt.provider = 'maib'
    and attempt.provider_checkout_id is not null
    and attempt.status in ('pending', 'paid');
$$;

revoke all on function public.claim_b2b_payment_attempt_v1(uuid,text,uuid,text,text),
  public.complete_b2b_payment_attempt_checkout_v1(uuid,uuid,uuid,text,text),
  public.record_b2b_payment_attempt_failure_v1(uuid,uuid,text,boolean),
  public.confirm_maib_b2b_payment_callback_v1(uuid,uuid,uuid,numeric,text,numeric,text,text,timestamptz,text),
  public.get_b2b_payment_return_state_v1(uuid,text),
  public.get_maib_b2b_payment_reconciliation_context_v1(uuid)
from public, anon, authenticated;
grant execute on function public.claim_b2b_payment_attempt_v1(uuid,text,uuid,text,text) to authenticated;
grant execute on function public.complete_b2b_payment_attempt_checkout_v1(uuid,uuid,uuid,text,text),
  public.record_b2b_payment_attempt_failure_v1(uuid,uuid,text,boolean),
  public.confirm_maib_b2b_payment_callback_v1(uuid,uuid,uuid,numeric,text,numeric,text,text,timestamptz,text),
  public.get_b2b_payment_return_state_v1(uuid,text),
  public.get_maib_b2b_payment_reconciliation_context_v1(uuid)
to service_role;

comment on table public.b2b_payment_attempts is
  'B2B-only MAIB attempts bound to submitted 1C-backed partner orders; RetailOrder is never used.';
comment on function public.claim_b2b_payment_attempt_v1(uuid,text,uuid,text,text) is
  'Claims an authoritative same-day MDL B2B payment attempt after permission, order and 1C read-back checks.';

commit;
