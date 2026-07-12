alter table public.price_sync_state
  add column if not exists safe_error text;

comment on column public.price_sync_state.safe_error is
  'Sanitized orchestration failure shown to internal administrators; never contains secrets or upstream payloads.';
