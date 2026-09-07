begin;

revoke all on table public.partner_finance_reminder_delivery_receipts from service_role;
grant select, insert on table public.partner_finance_reminder_delivery_receipts to service_role;

commit;
