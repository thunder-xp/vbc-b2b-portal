begin;

-- Preserve the full event catalog introduced after the notification foundation
-- while adding onboarding delivery events.
alter table public.partner_notification_events
  drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events
  add constraint partner_notification_events_code_check check (event_code in (
    'order_submitted', 'order_confirmed', 'order_requires_attention',
    'order_readback_failed', 'order_reconciliation_required', 'order_posted',
    'order_cancelled', 'shipment_due_in_3_days', 'shipment_due_today',
    'shipment_overdue', 'shipment_date_changed', 'date_change_approved',
    'date_change_rejected', 'date_change_cancelled', 'invitation_expiring',
    'invitation_accepted', 'employee_suspended', 'role_changed',
    'price_access_changed', 'watched_product_back_in_stock',
    'watched_product_expected_arrival_added', 'watched_product_arrived',
    'watched_product_price_changed', 'cart_product_price_changed',
    'cart_product_availability_changed', 'onboarding_approved',
    'onboarding_access_opened'
  ));

alter table public.partner_notifications
  drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications
  add constraint partner_notifications_event_code_check check (event_code in (
    'order_submitted', 'order_confirmed', 'order_requires_attention',
    'order_readback_failed', 'order_reconciliation_required', 'order_posted',
    'order_cancelled', 'shipment_due_in_3_days', 'shipment_due_today',
    'shipment_overdue', 'shipment_date_changed', 'date_change_approved',
    'date_change_rejected', 'date_change_cancelled', 'invitation_expiring',
    'invitation_accepted', 'employee_suspended', 'role_changed',
    'price_access_changed', 'watched_product_back_in_stock',
    'watched_product_expected_arrival_added', 'watched_product_arrived',
    'watched_product_price_changed', 'cart_product_price_changed',
    'cart_product_availability_changed', 'onboarding_approved',
    'onboarding_access_opened'
  ));

commit;
