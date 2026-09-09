-- Preserve the established v2 JSON contract for in-flight application versions.
-- Popularity-aware summaries are exposed only through explicit v3 RPCs.

alter function public.list_public_retail_products_v2(
  text, text, text, text, jsonb, text, integer, integer
) rename to list_public_retail_products_current_v2;

revoke all on function public.list_public_retail_products_current_v2(
  text, text, text, text, jsonb, text, integer, integer
) from public, anon, authenticated, service_role;

create function public.list_public_retail_products_v2(
  p_locale text default 'ru',
  p_category_slug text default null,
  p_search text default null,
  p_availability text default null,
  p_facets jsonb default '{}'::jsonb,
  p_mode text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  payload jsonb;
  compatible_items jsonb;
begin
  payload := public.list_public_retail_products_current_v2(
    p_locale,
    p_category_slug,
    p_search,
    p_availability,
    p_facets,
    p_mode,
    p_limit,
    p_offset
  );

  select coalesce(
    jsonb_agg(source.item - 'isPopular' order by source.ordinal),
    '[]'::jsonb
  )
  into compatible_items
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
    with ordinality source(item, ordinal);

  return payload || jsonb_build_object('items', compatible_items);
end;
$$;

create function public.list_public_retail_products_v3(
  p_locale text default 'ru',
  p_category_slug text default null,
  p_search text default null,
  p_availability text default null,
  p_facets jsonb default '{}'::jsonb,
  p_mode text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select public.list_public_retail_products_current_v2(
    p_locale,
    p_category_slug,
    p_search,
    p_availability,
    p_facets,
    p_mode,
    p_limit,
    p_offset
  );
$$;

revoke all on function public.list_public_retail_products_v2(
  text, text, text, text, jsonb, text, integer, integer
), public.list_public_retail_products_v3(
  text, text, text, text, jsonb, text, integer, integer
) from public, anon, authenticated;

grant execute on function public.list_public_retail_products_v2(
  text, text, text, text, jsonb, text, integer, integer
), public.list_public_retail_products_v3(
  text, text, text, text, jsonb, text, integer, integer
) to anon, authenticated;

alter function public.list_public_retail_hot_products(
  text, integer, integer
) rename to list_public_retail_hot_products_current;

revoke all on function public.list_public_retail_hot_products_current(
  text, integer, integer
) from public, anon, authenticated, service_role;

create function public.list_public_retail_hot_products(
  p_locale text default 'ru',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  payload jsonb;
  compatible_items jsonb;
begin
  payload := public.list_public_retail_hot_products_current(
    p_locale,
    p_limit,
    p_offset
  );

  select coalesce(
    jsonb_agg(source.item - 'isPopular' order by source.ordinal),
    '[]'::jsonb
  )
  into compatible_items
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
    with ordinality source(item, ordinal);

  return payload || jsonb_build_object('items', compatible_items);
end;
$$;

create function public.list_public_retail_hot_products_v2(
  p_locale text default 'ru',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select public.list_public_retail_hot_products_current(
    p_locale,
    p_limit,
    p_offset
  );
$$;

revoke all on function public.list_public_retail_hot_products(
  text, integer, integer
), public.list_public_retail_hot_products_v2(
  text, integer, integer
) from public, anon, authenticated;

grant execute on function public.list_public_retail_hot_products(
  text, integer, integer
), public.list_public_retail_hot_products_v2(
  text, integer, integer
) to anon, authenticated;

create or replace function public.get_public_retail_showcase_v2(
  p_locale text default 'ru'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
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
    'popular', popular -> 'items',
    'new', new_products -> 'items',
    'hot', hot -> 'items',
    'replenishment', replenishment -> 'items',
    'totalCounts', jsonb_build_object(
      'popular', coalesce((popular ->> 'totalCount')::integer, 0),
      'new', coalesce((new_products ->> 'totalCount')::integer, 0),
      'hot', coalesce((hot ->> 'totalCount')::integer, 0),
      'replenishment', coalesce((replenishment ->> 'totalCount')::integer, 0)
    )
  );
end;
$$;

create or replace function public.get_public_retail_showcase_v3(
  p_locale text default 'ru',
  p_rotation_seed text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  popular_pool jsonb;
  popular_items jsonb;
  new_products jsonb;
  hot jsonb;
  replenishment jsonb;
begin
  if p_locale not in ('ru', 'ro')
    or p_rotation_seed is null
    or p_rotation_seed !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception 'Public Retail showcase input is invalid.' using errcode = '22023';
  end if;

  popular_pool := public.list_public_retail_products_v3(
    p_locale, null, null, null, '{}'::jsonb, 'popular', 40, 0
  );

  select coalesce(jsonb_agg(candidate.item order by candidate.session_rank), '[]'::jsonb)
  into popular_items
  from (
    select pool.item,
      pg_catalog.md5(p_rotation_seed || ':' || (pool.item ->> 'id')) as session_rank
    from jsonb_array_elements(popular_pool -> 'items') pool(item)
    order by session_rank, pool.item ->> 'id'
    limit 5
  ) candidate;

  new_products := public.list_public_retail_products_v3(
    p_locale, null, null, null, '{}'::jsonb, 'new', 5, 0
  );
  hot := public.list_public_retail_hot_products_v2(p_locale, 5, 0);
  replenishment := public.list_public_retail_products_v3(
    p_locale, null, null, null, '{}'::jsonb, 'replenishment', 5, 0
  );

  return jsonb_build_object(
    'popular', popular_items,
    'new', new_products -> 'items',
    'hot', hot -> 'items',
    'replenishment', replenishment -> 'items',
    'totalCounts', jsonb_build_object(
      'popular', coalesce((popular_pool ->> 'totalCount')::integer, 0),
      'new', coalesce((new_products ->> 'totalCount')::integer, 0),
      'hot', coalesce((hot ->> 'totalCount')::integer, 0),
      'replenishment', coalesce((replenishment ->> 'totalCount')::integer, 0)
    )
  );
end;
$$;

revoke all on function public.get_public_retail_showcase_v2(text),
  public.get_public_retail_showcase_v3(text, text)
from public, anon, authenticated;

grant execute on function public.get_public_retail_showcase_v2(text),
  public.get_public_retail_showcase_v3(text, text)
to anon, authenticated;

comment on function public.list_public_retail_products_v2(
  text, text, text, text, jsonb, text, integer, integer
) is 'Backward-compatible public retail v2 response without popularity metadata.';
comment on function public.list_public_retail_products_v3(
  text, text, text, text, jsonb, text, integer, integer
) is 'Public retail v3 response with current governed Top 40 membership as isPopular.';
