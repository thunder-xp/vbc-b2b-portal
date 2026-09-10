begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $migration$
declare
  current_definition text;
  corrected_definition text;
begin
  select pg_catalog.pg_get_functiondef(target_function.oid)
    into current_definition
  from pg_catalog.pg_proc target_function
  join pg_catalog.pg_namespace target_namespace on target_namespace.oid = target_function.pronamespace
  where target_namespace.nspname = 'public'
    and target_function.proname = 'get_or_refresh_partner_dashboard_selections_v5'
    and pg_catalog.pg_get_function_identity_arguments(target_function.oid) =
      'p_user_id uuid, p_company_id uuid, p_login_generation text, p_repeat_period_days integer, p_popular_period_days integer, p_new_period_days integer';

  if current_definition is null then
    raise exception 'get_or_refresh_partner_dashboard_selections_v5 was not found';
  end if;

  corrected_definition := pg_catalog.replace(
    current_definition,
    $before$  ), candidates as (
    select eligible.*, count(*) over ()::integer as total_count
    from eligible
  ), chosen as (
    select * from candidates
    order by priority desc,
      pg_catalog.md5(p_login_generation || ':' || product_id::text), product_id
    limit 5
  )$before$,
    $after$  ), candidates as (
    select eligible.*, count(*) over ()::integer as total_count
    from eligible
  ), chosen as (
    select * from candidates
    order by priority desc,
      pg_catalog.md5(p_login_generation || ':' || product_id::text), product_id
    limit 1
  )$after$
  );

  corrected_definition := pg_catalog.replace(
    corrected_definition,
    $before$  into editorial_products, editorial_count
  from chosen
  join public.catalog_products product on product.id = chosen.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  select pg_catalog.md5$before$,
    $after$  into editorial_products, editorial_count
  from chosen
  join public.catalog_products product on product.id = chosen.product_id
  left join public.catalog_categories category on category.id = product.category_id;

  editorial_count := jsonb_array_length(editorial_products);

  select pg_catalog.md5$after$
  );

  if corrected_definition = current_definition
    or pg_catalog.strpos(corrected_definition, 'limit 1') = 0
    or pg_catalog.strpos(corrected_definition, 'editorial_count := jsonb_array_length(editorial_products)') = 0
    or pg_catalog.strpos(corrected_definition, 'get_or_refresh_partner_dashboard_selections_v2') > 0 then
    raise exception 'Dashboard editorial regression guard did not match the expected v5 definition';
  end if;

  execute corrected_definition;
end
$migration$;

comment on function public.get_or_refresh_partner_dashboard_selections_v5(
  uuid, uuid, text, integer, integer, integer
) is 'Single-pass company-validated Dashboard projection: bounded Repeat/Popular/NEW previews plus one effective HOT/ARRIVAL editorial product; no legacy selection fanout.';

commit;
