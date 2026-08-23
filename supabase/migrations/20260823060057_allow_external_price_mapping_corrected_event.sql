alter table public.external_price_events
  drop constraint external_price_events_event_type_check;

alter table public.external_price_events
  add constraint external_price_events_event_type_check
  check (event_type in (
    'uploaded',
    'mapping_confirmed',
    'mapping_corrected',
    'manual_match',
    'row_skipped',
    'applied',
    'archived',
    'analysis_failed'
  ));
