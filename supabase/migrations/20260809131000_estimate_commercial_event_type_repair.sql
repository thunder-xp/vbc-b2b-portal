-- The workflow migration replaced, rather than extended, the commercial event allowlist.
-- Restore the complete union so governed commercial saves can append their audit event.
alter table public.estimate_events
  drop constraint if exists estimate_events_type_check;

alter table public.estimate_events
  add constraint estimate_events_type_check check (event_type in (
    'created', 'saved', 'line_added', 'line_updated', 'line_removed', 'archived',
    'commercial_updated', 'currency_changed', 'section_created', 'section_reordered',
    'line_moved', 'discount_changed', 'charge_added', 'totals_recalculated',
    'ready', 'version_created', 'version_sent', 'version_accepted', 'version_rejected',
    'draft_restored', 'duplicated', 'template_created', 'created_from_cart', 'added_to_cart'
  ));
