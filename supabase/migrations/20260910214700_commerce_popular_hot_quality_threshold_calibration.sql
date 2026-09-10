begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Calibrated from the production hidden-365 distributions on 2026-09-10.
-- These are qualification rules, not target counts or rank cutoffs.
create function private.commerce_popular_min_frequency()
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $$ select 3::bigint $$;

create function private.commerce_hot_min_margin_percent()
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$ select 16.67::numeric $$;

revoke all on function private.commerce_popular_min_frequency(),
  private.commerce_hot_min_margin_percent()
from public, anon, authenticated, service_role;

comment on function private.commerce_popular_min_frequency() is
  'Canonical Popular qualification threshold: distinct authoritative orders in the effective period.';
comment on function private.commerce_hot_min_margin_percent() is
  'Canonical HOT qualification threshold: current ((STOP-DDP)/STOP)*100 percent.';

-- Keep the full periodized demand evidence because HOT also uses it. Only the
-- system-managed TOP assignment and diagnostic membership counts are narrowed.
do $migration$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'refresh_b2b_product_demand_ranking';

  if definition is null then
    raise exception 'Required Popular refresh is missing.';
  end if;

  changed := replace(definition,
    E'where ranking.period_days = 365\n        and ranking.product_id = assignment.product_id',
    E'where ranking.period_days = 365\n        and ranking.product_id = assignment.product_id\n        and ranking.purchase_frequency >= private.commerce_popular_min_frequency()');
  changed := replace(changed,
    E'from public.b2b_product_demand_ranking ranking\n  where ranking.period_days = 365\n  on conflict',
    E'from public.b2b_product_demand_ranking ranking\n  where ranking.period_days = 365\n    and ranking.purchase_frequency >= private.commerce_popular_min_frequency()\n  on conflict');
  changed := replace(changed,
    E'from public.b2b_product_demand_ranking\n  where period_days = 365;',
    E'from public.b2b_product_demand_ranking\n  where period_days = 365\n    and purchase_frequency >= private.commerce_popular_min_frequency();');
  changed := replace(changed,
    E'    (select count(*) from public.b2b_product_demand_ranking ranking\n      where ranking.period_days = period.period_days),\n    (select count(*) from public.b2b_product_demand_ranking ranking\n      where ranking.period_days = period.period_days),',
    E'    (select count(*) from public.b2b_product_demand_ranking ranking\n      where ranking.period_days = period.period_days),\n    (select count(*) from public.b2b_product_demand_ranking ranking\n      where ranking.period_days = period.period_days\n        and ranking.purchase_frequency >= private.commerce_popular_min_frequency()),');

  if changed = definition
    or changed not like '%ranking.purchase_frequency >= private.commerce_popular_min_frequency()%'
    or changed like E'%where ranking.period_days = 365\n        and ranking.product_id = assignment.product_id\n    );%'
    or changed like E'%where ranking.period_days = 365\n  on conflict%'
  then
    raise exception 'Could not install canonical Popular qualification.';
  end if;

  execute changed;
end
$migration$;

-- B2B sections, B2C lists/showcase, and Dashboard all consume the same
-- score threshold. The period changes the evidence window, not label quality.
do $migration$
declare
  function_name text;
  definition text;
  changed text;
begin
  foreach function_name in array array[
    'get_published_product_merchandising_v6',
    'list_public_retail_products_v6',
    'get_public_retail_showcase_v6',
    'get_or_refresh_partner_dashboard_selections_v5'
  ]
  loop
    select pg_get_functiondef(procedure.oid) into definition
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = function_name;

    if definition is null then
      raise exception 'Required Popular reader % is missing.', function_name;
    end if;

    changed := replace(definition,
      'ranking.purchase_frequency > 0',
      'ranking.purchase_frequency >= private.commerce_popular_min_frequency()');

    if changed = definition
      or changed like '%ranking.purchase_frequency > 0%'
      or changed not like '%private.commerce_popular_min_frequency()%'
    then
      raise exception 'Could not calibrate Popular reader %.', function_name;
    end if;

    execute changed;
  end loop;
end
$migration$;

-- The catalog page and facet engines were intentionally derived from older
-- functions, so add the same threshold only to their active TOP membership
-- clauses without touching their ranking/order or other selections.
do $migration$
declare
  function_name text;
  definition text;
  changed text;
begin
  foreach function_name in array array[
    'catalog_partner_page_unified_period_base',
    'catalog_partner_page_automated_hot_base',
    'catalog_partner_facets_v7'
  ]
  loop
    select pg_get_functiondef(procedure.oid) into definition
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = function_name;

    if definition is null then
      raise exception 'Required catalog reader % is missing.', function_name;
    end if;

    changed := replace(definition,
      E'and ranking.period_days = p_period_days\n            \n        ))',
      E'and ranking.period_days = p_period_days\n            and ranking.purchase_frequency >= private.commerce_popular_min_frequency()\n        ))');

    if changed = definition
      or changed not like '%ranking.purchase_frequency >= private.commerce_popular_min_frequency()%'
    then
      raise exception 'Could not calibrate catalog Popular reader %.', function_name;
    end if;

    execute changed;
  end loop;
end
$migration$;

-- Generic B2C cards use the same threshold for the existing 30-day badge
-- adapter; no second membership rule is allowed to survive there.
do $migration$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'with_current_public_popularity';

  if definition is null then
    raise exception 'Required public Popular adapter is missing.';
  end if;

  changed := replace(definition,
    'ranking.popularity_rank <= 40',
    'ranking.purchase_frequency >= private.commerce_popular_min_frequency()');

  if changed = definition
    or changed like '%ranking.popularity_rank <= 40%'
    or changed not like '%private.commerce_popular_min_frequency()%'
  then
    raise exception 'Could not calibrate public Popular badges.';
  end if;

  execute changed;
end
$migration$;

-- HOT keeps the approved margin and tie-break ordering. Qualification happens
-- before row_number(), so no rank or target-count truncation can
-- influence membership.
do $migration$
declare
  definition text;
  changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'private'
    and procedure.proname = 'refresh_automated_hot_product_ranking';

  if definition is null then
    raise exception 'Required HOT refresh is missing.';
  end if;

  changed := replace(definition,
    E'  from eligible;\n',
    E'  from eligible\n  where eligible.hot_margin_percent >= private.commerce_hot_min_margin_percent();\n');

  if changed = definition
    or changed not like '%eligible.hot_margin_percent >= private.commerce_hot_min_margin_percent()%'
    or changed like '%hot_rank <=%'
  then
    raise exception 'Could not install canonical HOT qualification.';
  end if;

  execute changed;
end
$migration$;

-- One existing refresh path rebuilds all four periods and synchronizes the
-- system-managed TOP assignments; its attached HOT refresh then applies the
-- calibrated margin threshold without adding a scheduler or request fanout.
select public.refresh_b2b_product_demand_ranking();

comment on table private.automated_hot_product_ranking is
  'Qualified automated HOT membership for 30/60/90/365; current DDP/STOP margin must meet private.commerce_hot_min_margin_percent().';

commit;
