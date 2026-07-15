alter table public.partner_orders
  add column if not exists integration_status text not null default 'processing',
  add column if not exists one_c_order_status text null,
  add column if not exists document_total numeric(18, 4) null,
  add column if not exists currency_code text null,
  add column if not exists contract_number text null,
  add column if not exists confirmed_at timestamptz null,
  add column if not exists last_reconciled_at timestamptz null;

update public.partner_orders
set integration_status = case status
    when 'submitted' then 'confirmed'
    when 'failed' then coalesce(reconciliation_result, 'failed')
    when 'unknown' then 'reconciliation_required'
    else 'processing'
  end,
  one_c_order_status = case when status = 'submitted' then 'unposted' else one_c_order_status end,
  confirmed_at = case when status = 'submitted' then coalesce(confirmed_at, submitted_at) else confirmed_at end
where integration_status = 'processing'
   or (status = 'submitted' and (one_c_order_status is null or confirmed_at is null));

update public.partner_orders target
set document_total = totals.document_total,
    currency_code = totals.currency_code
from (
  select order_id,
         sum(line_total) as document_total,
         case when count(distinct currency_code) = 1 then min(currency_code) else null end as currency_code
  from public.partner_order_items
  group by order_id
) totals
where target.id = totals.order_id
  and (target.document_total is null or target.currency_code is null);

alter table public.partner_orders
  drop constraint if exists partner_orders_reconciliation_result_check;

alter table public.partner_orders
  add constraint partner_orders_reconciliation_result_check
    check (reconciliation_result is null or reconciliation_result in ('confirmed_not_created', 'manual_review_required')),
  add constraint partner_orders_integration_status_check
    check (integration_status in (
      'processing', 'confirmed', 'failed', 'reconciliation_required',
      'confirmed_not_created', 'manual_review_required'
    )),
  add constraint partner_orders_document_total_check
    check (document_total is null or document_total >= 0);

create unique index if not exists partner_orders_one_live_attempt_per_cart_idx
  on public.partner_orders(cart_id)
  where cart_id is not null and status in ('processing', 'submitted', 'unknown');

create index if not exists partner_orders_company_confirmed_idx
  on public.partner_orders(company_id, confirmed_at desc)
  where status = 'submitted';

create or replace function public.fail_partner_order_submission(
  target_order_id uuid,
  target_status text,
  error_code text,
  error_message text,
  error_details text default null,
  error_hint text default null
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare target_order public.partner_orders;
begin
  if target_status not in ('failed', 'unknown') then
    raise exception 'Invalid failure status.' using errcode = '23514';
  end if;

  update public.partner_orders set
    status = target_status,
    integration_status = case when target_status = 'unknown' then 'reconciliation_required' else 'failed' end,
    safe_error_code = left(error_code, 100),
    safe_error_message = left(error_message, 500),
    safe_error_details = left(error_details, 1000),
    safe_error_hint = left(error_hint, 500)
  where id = target_order_id and submitted_by = auth.uid() and status = 'processing'
  returning * into target_order;

  if target_order.id is null then
    raise exception 'Order was not found.' using errcode = 'P0002';
  end if;
  if target_status = 'failed' then
    update public.carts set status = 'active' where id = target_order.cart_id;
  end if;
  return target_order;
end;
$$;

create or replace function public.complete_partner_order_submission_v2(
  target_order_id uuid,
  one_c_ref text,
  one_c_number text,
  one_c_date timestamptz,
  one_c_status text,
  confirmed_document_total numeric,
  confirmed_currency_code text,
  confirmed_contract_number text default null
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.partner_orders;
  target_cart public.carts;
begin
  select * into target_order
  from public.partner_orders
  where id = target_order_id
    and (submitted_by = auth.uid() or auth.role() = 'service_role' or public.can_review_partner_orders())
  for update;

  if target_order.id is null then
    raise exception 'Order was not found.' using errcode = 'P0002';
  end if;
  if target_order.status = 'submitted' then
    if target_order.external_1c_ref <> one_c_ref or target_order.external_1c_number <> one_c_number then
      raise exception 'Confirmed order identity cannot change.' using errcode = '23514';
    end if;
    return target_order;
  end if;
  if target_order.status not in ('processing', 'unknown')
    or one_c_ref is null or btrim(one_c_ref) = ''
    or one_c_number is null or btrim(one_c_number) = ''
    or confirmed_document_total < 0
    or confirmed_currency_code is null or btrim(confirmed_currency_code) = '' then
    raise exception 'Order cannot be confirmed.' using errcode = '23514';
  end if;

  update public.partner_orders set
    status = 'submitted',
    integration_status = 'confirmed',
    one_c_order_status = left(one_c_status, 100),
    external_1c_ref = one_c_ref,
    external_1c_number = one_c_number,
    external_1c_date = one_c_date,
    document_total = confirmed_document_total,
    currency_code = upper(left(confirmed_currency_code, 10)),
    contract_number = nullif(left(btrim(confirmed_contract_number), 200), ''),
    submitted_at = coalesce(submitted_at, now()),
    confirmed_at = now(),
    last_reconciled_at = case when target_order.status = 'unknown' then now() else last_reconciled_at end,
    reconciliation_result = null,
    safe_error_code = null,
    safe_error_message = null,
    safe_error_details = null,
    safe_error_hint = null
  where id = target_order.id
  returning * into target_order;

  select * into target_cart from public.carts where id = target_order.cart_id for update;
  if target_cart.id is not null then
    delete from public.cart_items where cart_id = target_cart.id;
    update public.carts set status = 'converted' where id = target_cart.id;
    insert into public.carts(company_id, created_by, status)
    select target_cart.company_id, target_cart.created_by, 'active'
    where not exists (
      select 1 from public.carts
      where company_id = target_cart.company_id
        and created_by = target_cart.created_by
        and status in ('active', 'submitting')
    )
    on conflict do nothing;
  end if;

  return target_order;
end;
$$;

create or replace function public.reconcile_partner_order_submission(
  target_order_id uuid,
  target_result text
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare target_order public.partner_orders;
begin
  if auth.role() <> 'service_role' and not public.can_review_partner_orders() then
    raise exception 'Order reconciliation is not allowed.' using errcode = '42501';
  end if;
  if target_result not in ('confirmed_not_created', 'manual_review_required') then
    raise exception 'Reconciliation result is invalid.' using errcode = '23514';
  end if;

  select * into target_order from public.partner_orders
  where id = target_order_id for update;
  if target_order.id is null then
    raise exception 'Order attempt was not found.' using errcode = 'P0002';
  end if;
  if target_order.status not in ('processing', 'unknown')
    or target_order.external_1c_ref is not null
    or target_order.external_1c_number is not null then
    raise exception 'Order attempt cannot be reconciled.' using errcode = '23514';
  end if;

  update public.partner_orders set
    status = case when target_result = 'confirmed_not_created' then 'failed' else 'unknown' end,
    integration_status = target_result,
    reconciliation_result = target_result,
    reconciliation_previous_status = target_order.status,
    reconciled_at = now(),
    last_reconciled_at = now(),
    reconciled_by = auth.uid()
  where id = target_order.id
  returning * into target_order;

  if target_result = 'confirmed_not_created' then
    update public.carts set status = 'active'
    where id = target_order.cart_id and status = 'submitting';
  end if;
  return target_order;
end;
$$;

revoke all on function public.complete_partner_order_submission_v2(uuid, text, text, timestamptz, text, numeric, text, text)
  from public, anon;
revoke all on function public.reconcile_partner_order_submission(uuid, text)
  from public, anon;

grant execute on function public.complete_partner_order_submission_v2(uuid, text, text, timestamptz, text, numeric, text, text)
  to authenticated, service_role;
grant execute on function public.reconcile_partner_order_submission(uuid, text)
  to authenticated, service_role;

comment on column public.partner_orders.integration_status is
  'Portal-to-1C integration lifecycle. Separate from portal status and the 1C business status.';
comment on column public.partner_orders.one_c_order_status is
  'Last verified 1C business status; never used as the portal workflow status.';
comment on function public.complete_partner_order_submission_v2(uuid, text, text, timestamptz, text, numeric, text, text) is
  'Atomically confirms a read-back-verified 1C order, converts its cart, and creates the next empty active cart.';
