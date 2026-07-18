-- Lightweight authenticated cart badge. RLS remains the security boundary.
create or replace function public.get_active_cart_unit_count(target_company_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(item.quantity), 0)::bigint
  from public.carts cart
  join public.cart_items item on item.cart_id = cart.id
  where cart.company_id = target_company_id
    and cart.created_by = auth.uid()
    and cart.status in ('active', 'submitting');
$$;

revoke all on function public.get_active_cart_unit_count(uuid) from public, anon;
grant execute on function public.get_active_cart_unit_count(uuid) to authenticated;

comment on function public.get_active_cart_unit_count(uuid) is
  'Returns only the authenticated user active-cart unit count; table RLS remains enforced.';
