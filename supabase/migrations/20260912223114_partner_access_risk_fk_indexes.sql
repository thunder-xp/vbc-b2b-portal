-- Cover every non-primary-key foreign key introduced by the Risk Radar.
create index access_risk_profiles_activated_by_idx
  on public.access_risk_monitoring_profiles(activated_by)
  where activated_by is not null;

create index access_risk_monitoring_events_actor_idx
  on public.access_risk_monitoring_events(actor_user_id)
  where actor_user_id is not null;

create index access_risk_receipts_company_idx
  on public.access_risk_ingestion_receipts(company_id);
create index access_risk_receipts_user_idx
  on public.access_risk_ingestion_receipts(user_id);

create index access_risk_enhanced_user_time_idx
  on public.access_risk_enhanced_events(user_id, occurred_at desc);
create index access_risk_enhanced_product_idx
  on public.access_risk_enhanced_events(product_id)
  where product_id is not null;
create index access_risk_enhanced_category_idx
  on public.access_risk_enhanced_events(category_id)
  where category_id is not null;

create index access_risk_user_snapshots_user_idx
  on public.access_risk_user_snapshots(user_id);
