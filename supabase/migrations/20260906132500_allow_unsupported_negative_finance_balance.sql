begin;

alter table public.partner_payment_obligations
  drop constraint partner_payment_obligations_amounts_check,
  add constraint partner_payment_obligations_amounts_check check (
    planned_amount >= 0
    and vat_amount >= 0
    and paid_amount >= 0
    and (
      remaining_amount >= 0
      or reconciliation_status in ('UNSUPPORTED', 'NON_RECONCILING')
    )
  );

commit;
