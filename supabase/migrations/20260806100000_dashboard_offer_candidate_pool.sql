begin;

alter table public.partner_dashboard_selection_snapshots
  drop constraint if exists partner_dashboard_selection_snapshots_offer_product_ids_check;
alter table public.partner_dashboard_selection_snapshots
  drop constraint if exists partner_dashboard_selection_snapshots_offer_count_check;
alter table public.partner_dashboard_selection_snapshots
  add constraint partner_dashboard_selection_snapshots_offer_count_check
  check (cardinality(offer_product_ids) <= 12);

do $$
declare
  current_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(procedure.oid)
  into current_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'get_or_refresh_partner_dashboard_selections'
    and pg_get_function_identity_arguments(procedure.oid) = 'p_user_id uuid, p_company_id uuid, p_login_generation text';

  if current_definition is null then
    raise exception 'Dashboard selection function is unavailable.';
  end if;

  updated_definition := replace(
    current_definition,
    'from (select * from combined order by rank limit 5) selected;',
    'from (select * from combined order by rank limit 12) selected;'
  );
  if updated_definition = current_definition then
    raise exception 'Expected bounded offer selection clause was not found.';
  end if;

  execute updated_definition;
end;
$$;

comment on constraint partner_dashboard_selection_snapshots_offer_count_check
  on public.partner_dashboard_selection_snapshots is
  'Allows a bounded candidate pool before cross-dashboard deduplication; the partner dashboard still renders at most five offers.';

commit;
