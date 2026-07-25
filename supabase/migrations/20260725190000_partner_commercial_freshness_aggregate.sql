create or replace function public.get_partner_commercial_freshness()
returns table(domain text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_select_catalog() then
    raise exception 'Catalog access is required.' using errcode = '42501';
  end if;

  return query
  select 'rates'::text, min(rate.published_at)
  from public.commercial_exchange_rates rate
  where rate.purpose in ('partner_price_usd_to_mdl', 'retail_price_mdl_to_usd')
    and rate.is_active = true and rate.is_published = true
  union all
  select 'prices'::text, state.last_successful_sync_at
  from public.price_sync_state state where state.id = 'product_prices'
  union all
  select 'stock'::text, state.last_successful_sync_at
  from public.stock_sync_state state where state.id = 'exact_stock'
  union all
  select 'arrivals'::text, max(arrival.published_at)
  from public.product_supplier_arrivals arrival where arrival.is_published = true;
end;
$$;

revoke all on function public.get_partner_commercial_freshness() from public, anon;
grant execute on function public.get_partner_commercial_freshness() to authenticated;

comment on function public.get_partner_commercial_freshness() is
  'One bounded, amount-free freshness projection for an approved partner workspace.';
