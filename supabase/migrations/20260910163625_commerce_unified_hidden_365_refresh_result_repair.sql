begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- The source function used by the preceding migration carried one unqualified
-- legacy Top-40 predicate in its JSON refresh summary. Membership was already
-- all-product; make the reported default pool match the hidden 365 contract.
do $$
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
    raise exception 'Required popularity refresh is missing.';
  end if;

  changed := replace(
    definition,
    'where period_days = 30 and popularity_rank <= 40;',
    'where period_days = 365;'
  );

  if changed = definition
    or changed like '%popularity_rank <= 40%'
    or changed like '%popularity_rank = 40%'
    or changed like '%top40ThresholdFrequency%'
  then
    raise exception 'Could not remove final legacy Top-40 refresh statistic.';
  end if;

  execute changed;
end;
$$;

comment on function public.refresh_b2b_product_demand_ranking() is
  'AUTOMATION_FIRST: refreshes the all-product 30/60/90/365 purchase-frequency projection; hidden default is 365.';

select public.refresh_b2b_product_demand_ranking();

commit;
