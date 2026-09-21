begin;

set local lock_timeout = '5s';

create function public.confirm_maib_retail_payment_callback_v2(
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
  p_source text default 'callback',
  p_checkout_channel text default 'public'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_channel text;
begin
  if p_checkout_channel not in ('public', 'maib_review') then
    return jsonb_build_object('outcome', 'INVALID_EVIDENCE');
  end if;

  select orders.checkout_channel into target_channel
  from public.retail_payment_attempts attempt
  join public.retail_orders orders on orders.id = attempt.retail_order_id
  where attempt.provider = 'maib'
    and attempt.provider_checkout_id = lower(p_provider_checkout_id);

  if target_channel is distinct from p_checkout_channel then
    return jsonb_build_object('outcome', 'UNKNOWN_CHECKOUT');
  end if;

  return public.confirm_maib_retail_payment_callback_v1(
    p_provider_checkout_id,
    p_provider_payment_id,
    p_order_reference,
    p_checkout_amount,
    p_checkout_currency,
    p_payment_amount,
    p_payment_currency,
    p_provider_status,
    p_provider_event_at,
    p_provider_rrn,
    p_source
  );
end;
$$;

revoke all on function public.confirm_maib_retail_payment_callback_v2(
  text,text,text,numeric,text,numeric,text,text,timestamptz,text,text,text
) from public, anon, authenticated;
grant execute on function public.confirm_maib_retail_payment_callback_v2(
  text,text,text,numeric,text,numeric,text,text,timestamptz,text,text,text
) to service_role;

commit;
