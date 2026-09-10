begin;

create index partner_finance_reminder_delivery_receipts_recipient_user_idx
  on public.partner_finance_reminder_delivery_receipts(recipient_user_id);

commit;
