create table public.catalog_synchronization_runs (
  id uuid primary key default gen_random_uuid(),
  source_sync_id uuid not null,
  source_domain text not null check (source_domain in ('catalog', 'prices', 'stock')),
  trigger_kind text not null check (trigger_kind in ('manual', 'scheduled')),
  source_status text not null default 'running' check (source_status in ('running', 'succeeded', 'failed')),
  b2b_projection_status text not null default 'pending' check (b2b_projection_status in ('pending', 'succeeded', 'failed')),
  public_retail_projection_status text not null default 'pending' check (public_retail_projection_status in ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  public_retail_publication_status text not null default 'pending' check (public_retail_publication_status in ('pending', 'succeeded', 'failed', 'skipped')),
  overall_status text not null default 'running' check (overall_status in ('running', 'succeeded', 'partial_success', 'failed')),
  source_started_at timestamptz not null default now(),
  source_completed_at timestamptz,
  projection_started_at timestamptz,
  finished_at timestamptz,
  source_duration_ms integer check (source_duration_ms is null or source_duration_ms >= 0),
  public_retail_duration_ms integer check (public_retail_duration_ms is null or public_retail_duration_ms >= 0),
  projection_attempt_count integer not null default 0 check (projection_attempt_count between 0 and 3),
  next_projection_attempt_at timestamptz,
  changed_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(changed_counts) = 'object'),
  public_retail_publication_id uuid references public.public_retail_publications(id) on delete restrict,
  public_retail_checksum text check (public_retail_checksum is null or public_retail_checksum ~ '^[0-9a-f]{64}$'),
  safe_error_code text check (safe_error_code is null or length(safe_error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_domain, source_sync_id)
);

create index catalog_synchronization_runs_pending_idx
  on public.catalog_synchronization_runs (next_projection_attempt_at, source_completed_at, created_at, id)
  where source_status = 'succeeded' and public_retail_projection_status in ('pending', 'failed') and projection_attempt_count < 3;
create index catalog_synchronization_runs_publication_idx
  on public.catalog_synchronization_runs (public_retail_publication_id)
  where public_retail_publication_id is not null;

create table public.catalog_synchronization_events (
  id uuid primary key default gen_random_uuid(),
  synchronization_run_id uuid not null references public.catalog_synchronization_runs(id) on delete restrict,
  event_type text not null check (event_type in (
    'source_started', 'source_succeeded', 'source_failed',
    'public_projection_started', 'public_projection_queued',
    'public_projection_succeeded', 'public_projection_failed'
  )),
  safe_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_evidence) = 'object'),
  occurred_at timestamptz not null default now()
);

create index catalog_synchronization_events_run_idx
  on public.catalog_synchronization_events (synchronization_run_id, occurred_at, id);

alter table public.catalog_synchronization_runs enable row level security;
alter table public.catalog_synchronization_events enable row level security;
revoke all on table public.catalog_synchronization_runs, public.catalog_synchronization_events
  from public, anon, authenticated;
grant select, insert, update on table public.catalog_synchronization_runs to service_role;
grant select, insert on table public.catalog_synchronization_events to service_role;

create or replace function public.prevent_catalog_synchronization_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Catalog synchronization events are append-only.' using errcode = '42501';
end;
$$;

create trigger prevent_catalog_synchronization_event_mutation
before update or delete on public.catalog_synchronization_events
for each row execute function public.prevent_catalog_synchronization_event_mutation();

create or replace function public.register_catalog_synchronization_run(
  p_source_sync_id uuid,
  p_source_domain text,
  p_trigger_kind text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.catalog_synchronization_runs;
  inserted_id uuid;
begin
  if p_source_sync_id is null or p_source_domain not in ('catalog', 'prices', 'stock')
    or p_trigger_kind not in ('manual', 'scheduled') then
    raise exception 'Invalid catalog synchronization registration.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog_sync:' || p_source_domain || ':' || p_source_sync_id::text, 0));
  insert into public.catalog_synchronization_runs(source_sync_id, source_domain, trigger_kind)
  values(p_source_sync_id, p_source_domain, p_trigger_kind)
  on conflict(source_domain, source_sync_id) do nothing
  returning id into inserted_id;
  select * into target from public.catalog_synchronization_runs
  where source_domain = p_source_domain and source_sync_id = p_source_sync_id;
  if inserted_id is not null then
    insert into public.catalog_synchronization_events(synchronization_run_id, event_type, safe_evidence)
    values(target.id, 'source_started', jsonb_build_object('sourceDomain', p_source_domain, 'trigger', p_trigger_kind));
  end if;
  return jsonb_build_object('runId', target.id, 'sourceSyncId', target.source_sync_id,
    'sourceDomain', target.source_domain, 'trigger', target.trigger_kind,
    'sourceStatus', target.source_status, 'overallStatus', target.overall_status,
    'idempotent', inserted_id is null);
end;
$$;

create or replace function public.complete_catalog_synchronization_source(
  p_source_sync_id uuid,
  p_source_domain text,
  p_changed_counts jsonb default '{}'::jsonb,
  p_source_duration_ms integer default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.catalog_synchronization_runs;
  changed boolean := false;
begin
  if jsonb_typeof(coalesce(p_changed_counts, '{}'::jsonb)) <> 'object'
    or (p_source_duration_ms is not null and p_source_duration_ms < 0) then
    raise exception 'Invalid catalog synchronization completion.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog_sync:' || p_source_domain || ':' || p_source_sync_id::text, 0));
  update public.catalog_synchronization_runs set
    source_status = 'succeeded', b2b_projection_status = 'succeeded',
    source_completed_at = coalesce(source_completed_at, now()),
    source_duration_ms = coalesce(p_source_duration_ms, source_duration_ms),
    changed_counts = coalesce(p_changed_counts, '{}'::jsonb), updated_at = now()
  where source_domain = p_source_domain and source_sync_id = p_source_sync_id
    and source_status = 'running'
  returning * into target;
  changed := found;
  if not changed then
    select * into target from public.catalog_synchronization_runs
    where source_domain = p_source_domain and source_sync_id = p_source_sync_id;
  end if;
  if target.id is null then raise exception 'Catalog synchronization run is not registered.' using errcode = '22023'; end if;
  if changed then
    insert into public.catalog_synchronization_events(synchronization_run_id, event_type, safe_evidence)
    values(target.id, 'source_succeeded', jsonb_build_object('changedCounts', target.changed_counts));
  end if;
  return jsonb_build_object('runId', target.id, 'trigger', target.trigger_kind,
    'sourceStatus', target.source_status, 'overallStatus', target.overall_status,
    'idempotent', not changed);
end;
$$;

create or replace function public.fail_catalog_synchronization_source(
  p_source_sync_id uuid,
  p_source_domain text,
  p_safe_error_code text
)
returns void language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  update public.catalog_synchronization_runs set
    source_status = 'failed', b2b_projection_status = 'failed',
    public_retail_projection_status = 'skipped', public_retail_publication_status = 'skipped',
    overall_status = 'failed', source_completed_at = coalesce(source_completed_at, now()), finished_at = now(),
    safe_error_code = left(coalesce(nullif(btrim(p_safe_error_code), ''), 'SOURCE_SYNC_FAILED'), 120), updated_at = now()
  where source_domain = p_source_domain and source_sync_id = p_source_sync_id and source_status = 'running'
  returning id into target_id;
  if target_id is not null then
    insert into public.catalog_synchronization_events(synchronization_run_id, event_type, safe_evidence)
    values(target_id, 'source_failed', jsonb_build_object('errorCode', left(coalesce(p_safe_error_code, 'SOURCE_SYNC_FAILED'), 120)));
  end if;
end;
$$;

create or replace function public.claim_catalog_projection_run(
  p_source_sync_id uuid default null,
  p_source_domain text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.catalog_synchronization_runs;
  running_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('catalog_projection_orchestration', 0));
  with expired as (
    update public.catalog_synchronization_runs set
      public_retail_projection_status = 'failed', public_retail_publication_status = 'failed',
      overall_status = 'partial_success', safe_error_code = 'PUBLIC_RETAIL_PROJECTION_LEASE_EXPIRED',
      next_projection_attempt_at = now(), finished_at = now(), updated_at = now()
    where public_retail_projection_status = 'running'
      and projection_started_at < now() - interval '30 minutes'
    returning id
  )
  insert into public.catalog_synchronization_events(synchronization_run_id, event_type, safe_evidence)
  select id, 'public_projection_failed', jsonb_build_object('errorCode', 'PUBLIC_RETAIL_PROJECTION_LEASE_EXPIRED')
  from expired;
  select id into running_id from public.catalog_synchronization_runs
  where public_retail_projection_status = 'running' order by projection_started_at limit 1;
  if running_id is not null then
    if p_source_sync_id is not null and p_source_domain is not null then
      select * into target from public.catalog_synchronization_runs
      where source_domain = p_source_domain and source_sync_id = p_source_sync_id;
      if target.id is not null and target.public_retail_projection_status in ('pending', 'failed') then
        insert into public.catalog_synchronization_events(synchronization_run_id, event_type, safe_evidence)
        select target.id, 'public_projection_queued', jsonb_build_object('activeRunId', running_id)
        where not exists (
          select 1 from public.catalog_synchronization_events event
          where event.synchronization_run_id = target.id and event.event_type = 'public_projection_queued'
        );
      end if;
    end if;
    return jsonb_build_object('claimed', false, 'status', 'queued', 'activeRunId', running_id);
  end if;

  if p_source_sync_id is not null and p_source_domain is not null then
    select * into target from public.catalog_synchronization_runs
    where source_domain = p_source_domain and source_sync_id = p_source_sync_id;
  else
    select * into target from public.catalog_synchronization_runs
    where source_status = 'succeeded'
      and public_retail_projection_status in ('pending', 'failed')
      and projection_attempt_count < 3
      and (next_projection_attempt_at is null or next_projection_attempt_at <= now())
    order by source_completed_at, created_at, id limit 1;
  end if;

  if target.id is null then return jsonb_build_object('claimed', false, 'status', 'none'); end if;
  if target.public_retail_projection_status = 'succeeded' then
    return jsonb_build_object('claimed', false, 'status', 'already_completed',
      'runId', target.id, 'trigger', target.trigger_kind,
      'publicationId', target.public_retail_publication_id);
  end if;
  if target.source_status <> 'succeeded'
    or target.public_retail_projection_status not in ('pending', 'failed')
    or target.projection_attempt_count >= 3
    or (target.next_projection_attempt_at is not null and target.next_projection_attempt_at > now()) then
    return jsonb_build_object('claimed', false, 'status', target.public_retail_projection_status, 'runId', target.id);
  end if;

  update public.catalog_synchronization_runs set
    public_retail_projection_status = 'running', public_retail_publication_status = 'pending',
    projection_started_at = now(), projection_attempt_count = projection_attempt_count + 1,
    next_projection_attempt_at = null, updated_at = now()
  where id = target.id;
  insert into public.catalog_synchronization_events(synchronization_run_id, event_type, safe_evidence)
  values(target.id, 'public_projection_started', jsonb_build_object('sourceDomain', target.source_domain));
  return jsonb_build_object('claimed', true, 'status', 'running', 'runId', target.id,
    'sourceSyncId', target.source_sync_id, 'sourceDomain', target.source_domain, 'trigger', target.trigger_kind);
end;
$$;

create or replace function public.complete_catalog_projection_run(
  p_run_id uuid,
  p_publication_id uuid,
  p_checksum text,
  p_duration_ms integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare changed_id uuid;
begin
  if p_checksum !~ '^[0-9a-f]{64}$' or p_duration_ms < 0 then
    raise exception 'Invalid catalog projection completion.' using errcode = '22023';
  end if;
  update public.catalog_synchronization_runs set
    public_retail_projection_status = 'succeeded', public_retail_publication_status = 'succeeded',
    overall_status = 'succeeded', public_retail_publication_id = p_publication_id,
    public_retail_checksum = p_checksum, public_retail_duration_ms = p_duration_ms,
    next_projection_attempt_at = null, finished_at = now(), safe_error_code = null, updated_at = now()
  where id = p_run_id and public_retail_projection_status = 'running'
  returning id into changed_id;
  if changed_id is not null then
    insert into public.catalog_synchronization_events(synchronization_run_id, event_type, safe_evidence)
    values(changed_id, 'public_projection_succeeded', jsonb_build_object(
      'publicationId', p_publication_id, 'checksum', p_checksum, 'durationMs', p_duration_ms));
  end if;
end;
$$;

create or replace function public.fail_catalog_projection_run(
  p_run_id uuid,
  p_safe_error_code text,
  p_duration_ms integer default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare changed_id uuid;
begin
  update public.catalog_synchronization_runs set
    public_retail_projection_status = 'failed', public_retail_publication_status = 'failed',
    overall_status = 'partial_success', public_retail_duration_ms = greatest(coalesce(p_duration_ms, 0), 0),
    next_projection_attempt_at = case when projection_attempt_count < 3 then now() + make_interval(mins => projection_attempt_count * 5) else null end,
    safe_error_code = left(coalesce(nullif(btrim(p_safe_error_code), ''), 'PUBLIC_RETAIL_PUBLICATION_FAILED'), 120),
    finished_at = now(), updated_at = now()
  where id = p_run_id and public_retail_projection_status = 'running'
  returning id into changed_id;
  if changed_id is not null then
    insert into public.catalog_synchronization_events(synchronization_run_id, event_type, safe_evidence)
    values(changed_id, 'public_projection_failed', jsonb_build_object(
      'errorCode', left(coalesce(p_safe_error_code, 'PUBLIC_RETAIL_PUBLICATION_FAILED'), 120)));
  end if;
end;
$$;

revoke all on function public.prevent_catalog_synchronization_event_mutation(),
  public.register_catalog_synchronization_run(uuid,text,text),
  public.complete_catalog_synchronization_source(uuid,text,jsonb,integer),
  public.fail_catalog_synchronization_source(uuid,text,text),
  public.claim_catalog_projection_run(uuid,text),
  public.complete_catalog_projection_run(uuid,uuid,text,integer),
  public.fail_catalog_projection_run(uuid,text,integer)
from public, anon, authenticated;

grant execute on function public.register_catalog_synchronization_run(uuid,text,text),
  public.complete_catalog_synchronization_source(uuid,text,jsonb,integer),
  public.fail_catalog_synchronization_source(uuid,text,text),
  public.claim_catalog_projection_run(uuid,text),
  public.complete_catalog_projection_run(uuid,uuid,text,integer),
  public.fail_catalog_projection_run(uuid,text,integer)
to service_role;

comment on table public.catalog_synchronization_runs is
  'Server-only orchestration ledger linking one 1C/local source synchronization generation to B2B projection and atomic Public Retail publication outcomes.';
comment on table public.catalog_synchronization_events is
  'Append-only safe audit events for unified catalog synchronization; commercial payloads and credentials are forbidden.';
