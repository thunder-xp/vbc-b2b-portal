begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter function public.get_admin_governed_price_coverage() set schema private;
alter function private.get_admin_governed_price_coverage()
  rename to governed_price_coverage_base;

revoke all on function private.governed_price_coverage_base()
  from public, anon, authenticated, service_role;

create function public.get_admin_governed_price_coverage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  result jsonb;
  active_cart_count integer;
  non_empty_active_cart_count integer;
begin
  result := private.governed_price_coverage_base();

  select
    count(*)::integer,
    count(*) filter (where exists (
      select 1
      from public.cart_items item
      where item.cart_id = cart.id
        and item.quantity > 0
    ))::integer
  into active_cart_count, non_empty_active_cart_count
  from public.carts cart
  join private.governed_price_order_capable_companies() company
    on company.id = cart.company_id
  where cart.status in ('active', 'submitting');

  result := jsonb_set(
    result,
    '{summary,activeCarts}',
    to_jsonb(active_cart_count),
    false
  );
  result := jsonb_set(
    result,
    '{summary,nonEmptyActiveCarts}',
    to_jsonb(non_empty_active_cart_count),
    true
  );

  return result;
end;
$$;

revoke all on function public.get_admin_governed_price_coverage()
  from public, anon;
grant execute on function public.get_admin_governed_price_coverage()
  to authenticated, service_role;

comment on function public.get_admin_governed_price_coverage() is
  'Permission-gated governed-price coverage with all active carts and a distinct non-empty active-cart count.';
comment on function private.governed_price_coverage_base() is
  'Internal governed-price coverage payload prior to the active-cart population summary.';

commit;
