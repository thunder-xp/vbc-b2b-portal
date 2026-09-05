begin;

create or replace function public.get_public_retail_showcase_v2(p_locale text default 'ru')
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  popular jsonb;
  new_products jsonb;
  hot jsonb;
  replenishment jsonb;
begin
  if p_locale not in ('ru', 'ro') then
    raise exception 'Public Retail showcase input is invalid.' using errcode = '22023';
  end if;

  popular := public.list_public_retail_products_v2(
    p_locale, null, null, null, '{}'::jsonb, 'popular', 5, 0
  );
  new_products := public.list_public_retail_products_v2(
    p_locale, null, null, null, '{}'::jsonb, 'new', 5, 0
  );
  hot := public.list_public_retail_hot_products(p_locale, 5, 0);
  replenishment := public.list_public_retail_products_v2(
    p_locale, null, null, null, '{}'::jsonb, 'replenishment', 5, 0
  );

  return jsonb_build_object(
    'popular', popular->'items',
    'new', new_products->'items',
    'hot', hot->'items',
    'replenishment', replenishment->'items',
    'totalCounts', jsonb_build_object(
      'popular', coalesce((popular->>'totalCount')::integer, 0),
      'new', coalesce((new_products->>'totalCount')::integer, 0),
      'hot', coalesce((hot->>'totalCount')::integer, 0),
      'replenishment', coalesce((replenishment->>'totalCount')::integer, 0)
    )
  );
end;
$$;

revoke all on function public.get_public_retail_showcase_v2(text)
  from public, anon, authenticated;
grant execute on function public.get_public_retail_showcase_v2(text)
  to anon, authenticated;

comment on function public.get_public_retail_showcase_v2(text) is
  'One bounded anonymous TOP/NEW/HOT/replenishment storefront aggregate that preserves each existing list total without additional reads.';

commit;
