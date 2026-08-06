begin;

alter table public.partner_dashboard_selection_snapshots
  drop constraint if exists partner_dashboard_selection_snapshots_offer_product_ids_check;
alter table public.partner_dashboard_selection_snapshots
  drop constraint if exists partner_dashboard_selection_snapshots_offer_count_check;
alter table public.partner_dashboard_selection_snapshots
  add constraint partner_dashboard_selection_snapshots_offer_count_check
  check (cardinality(offer_product_ids) <= 12);

commit;
