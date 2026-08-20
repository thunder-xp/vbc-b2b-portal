alter table public.price_sync_state
  add column if not exists last_page_stage text,
  add column if not exists last_page_number integer,
  add column if not exists last_page_fingerprint text,
  add column if not exists last_page_first_key text,
  add column if not exists last_page_last_key text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists odata_request_count integer not null default 0,
  add column if not exists odata_request_duration_ms bigint not null default 0,
  add column if not exists staging_duration_ms bigint not null default 0,
  add column if not exists publication_duration_ms bigint not null default 0;

alter table public.price_sync_state
  add constraint price_sync_state_last_page_number_check
    check (last_page_number is null or last_page_number > 0) not valid,
  add constraint price_sync_state_retry_count_check
    check (retry_count >= 0) not valid,
  add constraint price_sync_state_request_count_check
    check (odata_request_count >= 0) not valid,
  add constraint price_sync_state_duration_checks
    check (
      odata_request_duration_ms >= 0
      and staging_duration_ms >= 0
      and publication_duration_ms >= 0
    ) not valid;

alter table public.price_sync_state
  validate constraint price_sync_state_last_page_number_check;
alter table public.price_sync_state
  validate constraint price_sync_state_retry_count_check;
alter table public.price_sync_state
  validate constraint price_sync_state_request_count_check;
alter table public.price_sync_state
  validate constraint price_sync_state_duration_checks;

comment on column public.price_sync_state.last_page_fingerprint is
  'SHA-256 identity of the last completed OData page; contains no commercial payload.';
comment on column public.price_sync_state.last_page_first_key is
  'First deterministic source key of the last completed OData page.';
comment on column public.price_sync_state.last_page_last_key is
  'Last deterministic source key of the last completed OData page.';
