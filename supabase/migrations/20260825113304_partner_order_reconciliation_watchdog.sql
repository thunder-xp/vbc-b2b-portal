begin;

alter table public.partner_orders
  add column if not exists reconciliation_attempt_count integer not null default 0,
  add column if not exists reconciliation_last_attempt_at timestamptz null,
  add column if not exists reconciliation_next_attempt_at timestamptz null,
  add column if not exists reconciliation_lease_expires_at timestamptz null,
  add column if not exists reconciliation_correlation_id uuid null,
  add constraint partner_orders_reconciliation_attempt_count_check
    check (reconciliation_attempt_count >= 0);

create index if not exists partner_orders_reconciliation_claim_idx
  on public.partner_orders(reconciliation_next_attempt_at, created_at, id)
  where status = 'unknown' and integration_status = 'reconciliation_required';

create table public.partner_order_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.partner_orders(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  correlation_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  event_type text not null check (event_type in (
    'started', 'confirmed', 'confirmed_not_created', 'manual_review_required', 'retry_scheduled'
  )),
  safe_error_code text null check (
    safe_error_code is null or safe_error_code ~ '^[A-Z0-9_]{2,80}$'
  ),
  occurred_at timestamptz not null default now(),
  unique(correlation_id, event_type)
);

create index partner_order_reconciliation_events_order_idx
  on public.partner_order_reconciliation_events(order_id, occurred_at desc, id desc);

create or replace function public.prevent_partner_order_reconciliation_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Partner order reconciliation events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_partner_order_reconciliation_event_mutation
before update or delete on public.partner_order_reconciliation_events
for each row execute function public.prevent_partner_order_reconciliation_event_mutation();

alter table public.partner_order_reconciliation_events enable row level security;
revoke all on table public.partner_order_reconciliation_events from public, anon, authenticated;
grant select, insert on table public.partner_order_reconciliation_events to service_role;

create or replace function public.claim_partner_order_reconciliations(
  p_limit integer default 5,
  p_lease_seconds integer default 90
)
returns table(order_id uuid, correlation_id uuid, attempt_number integer)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  candidate record;
  claimed_correlation_id uuid;
  claimed_attempt_number integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order reconciliation claim is restricted.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 20
    or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 300 then
    raise exception 'Invalid order reconciliation claim bounds.' using errcode = '22023';
  end if;

  for candidate in
    select source.id, source.company_id
    from public.partner_orders source
    where source.status = 'unknown'
      and source.integration_status = 'reconciliation_required'
      and (source.reconciliation_next_attempt_at is null or source.reconciliation_next_attempt_at <= now())
      and (source.reconciliation_lease_expires_at is null or source.reconciliation_lease_expires_at <= now())
    order by source.created_at, source.id
    for update skip locked
    limit p_limit
  loop
    claimed_correlation_id := gen_random_uuid();
    update public.partner_orders target
    set reconciliation_attempt_count = target.reconciliation_attempt_count + 1,
        reconciliation_last_attempt_at = now(),
        reconciliation_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        reconciliation_correlation_id = claimed_correlation_id,
        reconciliation_next_attempt_at = null
    where target.id = candidate.id
    returning target.reconciliation_attempt_count into claimed_attempt_number;

    insert into public.partner_order_reconciliation_events(
      order_id, company_id, correlation_id, attempt_number, event_type
    ) values (
      candidate.id, candidate.company_id, claimed_correlation_id, claimed_attempt_number, 'started'
    );

    order_id := candidate.id;
    correlation_id := claimed_correlation_id;
    attempt_number := claimed_attempt_number;
    return next;
  end loop;
end;
$$;

create or replace function public.finish_partner_order_reconciliation_attempt(
  p_order_id uuid,
  p_correlation_id uuid,
  p_result text,
  p_safe_error_code text default null,
  p_retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_order public.partner_orders%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order reconciliation completion is restricted.' using errcode = '42501';
  end if;
  if p_result not in ('confirmed', 'confirmed_not_created', 'manual_review_required', 'retry_scheduled')
    or (p_safe_error_code is not null and p_safe_error_code !~ '^[A-Z0-9_]{2,80}$')
    or (p_result = 'retry_scheduled' and (
      p_retry_after_seconds is null or p_retry_after_seconds < 15 or p_retry_after_seconds > 3600
    )) then
    raise exception 'Invalid order reconciliation completion.' using errcode = '22023';
  end if;

  select * into target_order
  from public.partner_orders
  where id = p_order_id and reconciliation_correlation_id = p_correlation_id
  for update;
  if target_order.id is null then
    return false;
  end if;

  insert into public.partner_order_reconciliation_events(
    order_id, company_id, correlation_id, attempt_number, event_type, safe_error_code
  ) values (
    target_order.id, target_order.company_id, p_correlation_id,
    target_order.reconciliation_attempt_count, p_result, p_safe_error_code
  ) on conflict (correlation_id, event_type) do nothing;

  update public.partner_orders target
  set reconciliation_lease_expires_at = null,
      reconciliation_next_attempt_at = case
        when p_result = 'retry_scheduled'
          and target.status = 'unknown'
          and target.integration_status = 'reconciliation_required'
        then now() + make_interval(secs => p_retry_after_seconds)
        else null
      end
  where target.id = target_order.id
    and target.reconciliation_correlation_id = p_correlation_id;
  return true;
end;
$$;

create or replace function public.get_partner_order_reconciliation_watchdog()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when auth.role() <> 'service_role' then
      jsonb_build_object('authorized', false)
    else jsonb_build_object(
      'authorized', true,
      'total', count(*),
      'oldestCreatedAt', min(source.created_at),
      'stuckSubmittingCarts', count(*) filter (where cart.status = 'submitting'),
      'neverReconciled', count(*) filter (where source.reconciliation_attempt_count = 0),
      'withRetryAttempts', count(*) filter (where source.reconciliation_attempt_count > 0),
      'companies', coalesce(jsonb_agg(distinct jsonb_build_object(
        'companyId', source.company_id,
        'companyName', company.display_name
      )), '[]'::jsonb)
    )
  end
  from public.partner_orders source
  left join public.carts cart on cart.id = source.cart_id
  left join public.partner_companies company on company.id = source.company_id
  where source.status = 'unknown'
    and source.integration_status = 'reconciliation_required';
$$;

revoke all on function public.prevent_partner_order_reconciliation_event_mutation() from public, anon, authenticated;
revoke all on function public.claim_partner_order_reconciliations(integer, integer) from public, anon, authenticated;
revoke all on function public.finish_partner_order_reconciliation_attempt(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.get_partner_order_reconciliation_watchdog() from public, anon, authenticated;
grant execute on function public.claim_partner_order_reconciliations(integer, integer) to service_role;
grant execute on function public.finish_partner_order_reconciliation_attempt(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.get_partner_order_reconciliation_watchdog() to service_role;

comment on table public.partner_order_reconciliation_events is
  'Append-only evidence for bounded deterministic read-back of unknown 1C order submissions.';
comment on function public.claim_partner_order_reconciliations(integer, integer) is
  'Claims a bounded batch of unknown order submissions without creating 1C orders.';

commit;
