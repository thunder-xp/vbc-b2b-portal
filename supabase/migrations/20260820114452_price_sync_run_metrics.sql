alter table public.price_sync_state
  add column if not exists odata_request_durations_ms integer[] not null default '{}',
  add column if not exists validation_duration_ms bigint not null default 0,
  add column if not exists continuation_count integer not null default 0;

alter table public.price_sync_state
  add constraint price_sync_state_request_duration_samples_check
    check (cardinality(odata_request_durations_ms) <= 1000 and 0 <= all(odata_request_durations_ms)) not valid,
  add constraint price_sync_state_validation_duration_check
    check (validation_duration_ms >= 0) not valid,
  add constraint price_sync_state_continuation_count_check
    check (continuation_count >= 0) not valid;

alter table public.price_sync_state validate constraint price_sync_state_request_duration_samples_check;
alter table public.price_sync_state validate constraint price_sync_state_validation_duration_check;
alter table public.price_sync_state validate constraint price_sync_state_continuation_count_check;

create table public.price_sync_run_metrics (
  sync_id uuid primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  total_remote_requests integer not null,
  successful_remote_requests integer not null,
  retry_remote_requests integer not null,
  average_remote_duration_ms integer not null,
  p50_remote_duration_ms integer not null,
  p95_remote_duration_ms integer not null,
  max_remote_duration_ms integer not null,
  staging_duration_ms bigint not null,
  validation_duration_ms bigint not null,
  publication_duration_ms bigint not null,
  total_processing_duration_ms bigint not null,
  total_wall_clock_duration_ms bigint not null,
  continuation_count integer not null,
  created_at timestamptz not null default now(),
  constraint price_sync_run_metrics_counts_check check (
    total_remote_requests >= 0 and successful_remote_requests >= 0
    and retry_remote_requests >= 0 and continuation_count >= 0
  ),
  constraint price_sync_run_metrics_durations_check check (
    average_remote_duration_ms >= 0 and p50_remote_duration_ms >= 0
    and p95_remote_duration_ms >= 0 and max_remote_duration_ms >= 0
    and staging_duration_ms >= 0 and validation_duration_ms >= 0
    and publication_duration_ms >= 0 and total_processing_duration_ms >= 0
    and total_wall_clock_duration_ms >= 0
  )
);

create index price_sync_run_metrics_finished_idx
  on public.price_sync_run_metrics(finished_at desc);

alter table public.price_sync_run_metrics enable row level security;
revoke all on table public.price_sync_run_metrics from public, anon, authenticated;
grant select, insert, update on table public.price_sync_run_metrics to service_role;

comment on table public.price_sync_run_metrics is
  'Private compact per-run price synchronization performance aggregates; contains no commercial payloads.';
comment on column public.price_sync_state.odata_request_durations_ms is
  'Transient bounded request-duration samples for the active/latest run; reset at the next governed start.';

create or replace function public.claim_price_sync_chunk(
  p_sync_id uuid,
  p_chunk_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  update public.price_sync_state
  set
    active_chunk_token = p_chunk_token,
    chunk_started_at = now(),
    continuation_count = continuation_count + 1,
    updated_at = now()
  where id = 'product_prices'
    and active_sync_id = p_sync_id
    and status in ('queued', 'running')
    and (
      active_chunk_token is null
      or chunk_started_at < now() - interval '2 minutes'
    );

  get diagnostics v_claimed = row_count;
  return v_claimed;
end;
$$;

revoke all on function public.claim_price_sync_chunk(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_price_sync_chunk(uuid, uuid)
  to service_role;
