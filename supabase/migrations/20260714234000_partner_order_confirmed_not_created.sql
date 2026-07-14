alter table public.partner_orders
  add column if not exists reconciliation_result text null,
  add column if not exists reconciliation_previous_status text null,
  add column if not exists reconciled_at timestamptz null,
  add column if not exists reconciled_by uuid null references auth.users(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_orders_reconciliation_result_check'
      and conrelid = 'public.partner_orders'::regclass
  ) then
    alter table public.partner_orders
      add constraint partner_orders_reconciliation_result_check
      check (reconciliation_result is null or reconciliation_result = 'confirmed_not_created');
  end if;
end;
$$;

create or replace function public.confirm_partner_order_not_created(
  target_order_id uuid,
  target_submission_key uuid
)
returns public.partner_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.partner_orders;
begin
  if auth.role() <> 'service_role' and not public.can_review_partner_orders() then
    raise exception 'Order reconciliation is not allowed.' using errcode = '42501';
  end if;

  select * into target_order
  from public.partner_orders
  where id = target_order_id and submission_key = target_submission_key
  for update;

  if target_order.id is null then
    raise exception 'Order attempt was not found.' using errcode = 'P0002';
  end if;
  if target_order.status not in ('processing', 'unknown')
    or target_order.external_1c_ref is not null
    or target_order.external_1c_number is not null then
    raise exception 'Order attempt cannot be confirmed as not created.' using errcode = '23514';
  end if;

  update public.partner_orders
  set status = 'failed',
      reconciliation_result = 'confirmed_not_created',
      reconciliation_previous_status = target_order.status,
      reconciled_at = now(),
      reconciled_by = auth.uid()
  where id = target_order.id
  returning * into target_order;

  update public.carts
  set status = 'active'
  where id = target_order.cart_id and status = 'submitting';

  return target_order;
end;
$$;

revoke all on function public.confirm_partner_order_not_created(uuid, uuid)
  from public, anon;
grant execute on function public.confirm_partner_order_not_created(uuid, uuid)
  to authenticated, service_role;

comment on function public.confirm_partner_order_not_created(uuid, uuid) is
  'Atomically records a manually verified absent 1C order and unlocks its intact cart without altering the original failure diagnostics.';
