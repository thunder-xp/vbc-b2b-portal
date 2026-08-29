create index if not exists partner_order_history_full_audits_requested_by_idx
  on public.partner_order_history_full_audits(requested_by)
  where requested_by is not null;
