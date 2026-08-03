begin;

-- The root partner route is accepted by both behavior RPCs, but the original
-- table constraint only accepted descendants such as /cabinet/catalog.
alter table public.partner_behavior_events
  drop constraint if exists partner_behavior_route_check;
alter table public.partner_behavior_events
  add constraint partner_behavior_route_check check (
    char_length(route) between 1 and 200
    and (route = '/cabinet' or route like '/cabinet/%')
    and position('?' in route) = 0
  );

create table public.partner_behavior_event_idempotency (
  idempotency_key text primary key,
  event_id uuid not null references public.partner_behavior_events(id) on delete restrict,
  user_id uuid not null references public.user_profiles(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  event_name text not null,
  session_id uuid not null,
  navigation_id uuid not null,
  route text not null,
  created_at timestamptz not null default now(),
  constraint partner_behavior_event_idempotency_key_check
    check (idempotency_key ~ '^[0-9a-f]{64}$')
);

create index partner_behavior_event_idempotency_company_time_idx
  on public.partner_behavior_event_idempotency(company_id, created_at desc);

alter table public.partner_behavior_event_idempotency enable row level security;
revoke all on public.partner_behavior_event_idempotency
  from public, anon, authenticated;
grant select, insert on public.partner_behavior_event_idempotency to service_role;

create or replace function public.record_partner_behavior_events_batch(
  p_company_id uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  source_event jsonb;
  event_name text;
  event_route text;
  session_id uuid;
  navigation_id uuid;
  event_id uuid;
  existing_event_id uuid;
  target_idempotency_key text;
  event_ids jsonb := '[]'::jsonb;
  duplicate_count integer := 0;
begin
  if actor is null or not public.has_active_company_membership(p_company_id) then
    raise exception 'Behavior event access denied.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) not between 1 and 5 then
    raise exception 'Invalid behavior event batch.' using errcode = '22023';
  end if;

  for source_event in select value from jsonb_array_elements(p_events)
  loop
    begin
      event_name := source_event->>'eventName';
      event_route := split_part(left(btrim(source_event->>'route'), 200), '?', 1);
      session_id := (source_event->>'sessionId')::uuid;
      navigation_id := (source_event->>'navigationId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid behavior event identity.' using errcode = '22023';
    end;
    if event_name is null or event_route is null
      or session_id is null or navigation_id is null then
      raise exception 'Invalid behavior event identity.' using errcode = '22023';
    end if;

    target_idempotency_key := encode(extensions.digest(
      actor::text || '|' || p_company_id::text || '|' || event_name || '|'
      || session_id::text || '|' || event_route || '|' || navigation_id::text,
      'sha256'
    ), 'hex');
    perform pg_advisory_xact_lock(hashtextextended(target_idempotency_key, 0));
    select saved.event_id into existing_event_id
    from public.partner_behavior_event_idempotency saved
    where saved.idempotency_key = target_idempotency_key;

    if existing_event_id is not null then
      event_id := existing_event_id;
      duplicate_count := duplicate_count + 1;
    elsif event_name = 'purchasing_dynamics_opened' or event_name like 'momentum_%' then
      event_id := public.record_partner_momentum_behavior_event(
        p_company_id,
        event_name,
        session_id,
        event_route,
        nullif(source_event->>'sourceSurface', ''),
        coalesce(source_event->'metadataSafe', '{}'::jsonb)
      );
    else
      begin
        event_id := public.record_partner_behavior_event(
          p_company_id,
          event_name,
          session_id,
          nullif(source_event->>'productId', '')::uuid,
          nullif(source_event->>'categoryId', '')::uuid,
          nullif(source_event->>'brandId', '')::uuid,
          event_route,
          nullif(source_event->>'searchQuery', ''),
          nullif(source_event->>'resultCount', '')::integer,
          nullif(source_event->>'quantity', '')::numeric,
          nullif(source_event->>'sourceSurface', ''),
          coalesce(source_event->'metadataSafe', '{}'::jsonb)
        );
      exception when invalid_text_representation then
        raise exception 'Invalid behavior event payload.' using errcode = '22023';
      end;
    end if;

    if existing_event_id is null then
      insert into public.partner_behavior_event_idempotency(
        idempotency_key, event_id, user_id, company_id,
        event_name, session_id, navigation_id, route
      ) values (
        target_idempotency_key, event_id, actor, p_company_id,
        event_name, session_id, navigation_id, event_route
      );
    end if;
    event_ids := event_ids || jsonb_build_array(event_id);
    existing_event_id := null;
  end loop;

  return jsonb_build_object(
    'recorded', true,
    'eventIds', event_ids,
    'duplicates', duplicate_count
  );
end;
$$;

revoke all on function public.record_partner_behavior_events_batch(uuid,jsonb)
  from public, anon;
grant execute on function public.record_partner_behavior_events_batch(uuid,jsonb)
  to authenticated;

-- A current published directory row is authoritative by external reference.
-- The portal link is useful enrichment, but older onboarding did not populate it.
create or replace function public.enqueue_partner_order_history_bootstrap(
  p_company_id uuid,
  p_requested_by_source text,
  p_requested_by_user_id uuid default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  company public.partner_companies%rowtype;
  state public.partner_order_history_bootstrap_state%rowtype;
  mapping_count integer;
  conflicting_mapping_count integer;
  correlation uuid := gen_random_uuid();
begin
  if p_requested_by_source not in ('onboarding_approval','first_access','admin_manual','migration_backfill') then
    raise exception 'invalid_bootstrap_source' using errcode = '22023';
  end if;
  if p_requested_by_source = 'first_access' and (
    actor is null or actor is distinct from p_requested_by_user_id
    or not public.has_permission(p_company_id, 'orders.view')
  ) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_requested_by_source = 'admin_manual' and (
    actor is null or not public.has_internal_permission('admin.integrations.manage')
  ) then raise exception 'Forbidden' using errcode = '42501'; end if;

  select * into company from public.partner_companies
  where id = p_company_id and status = 'active' for update;
  if company.id is null or company.external_1c_id is null then
    raise exception 'bootstrap_company_mapping_missing' using errcode = '23514';
  end if;
  if company.external_1c_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or lower(company.external_1c_id) = '00000000-0000-0000-0000-000000000000' then
    raise exception 'bootstrap_company_mapping_invalid' using errcode = '23514';
  end if;
  select count(*) into mapping_count
  from public.one_c_counterparties counterparty
  where lower(counterparty.external_1c_id) = lower(company.external_1c_id)
    and counterparty.is_published and counterparty.is_active and not counterparty.is_deleted;
  select count(*) into conflicting_mapping_count
  from public.one_c_counterparties counterparty
  where lower(counterparty.external_1c_id) = lower(company.external_1c_id)
    and counterparty.is_published and counterparty.is_active and not counterparty.is_deleted
    and counterparty.portal_company_id is not null
    and counterparty.portal_company_id <> company.id;
  if mapping_count <> 1 or conflicting_mapping_count > 0 then
    raise exception 'bootstrap_company_mapping_conflict' using errcode = '23514';
  end if;

  select * into state from public.partner_order_history_bootstrap_state
  where company_id = company.id for update;
  if state.id is not null and state.status = 'failed_terminal' and not p_force then
    return jsonb_build_object('id', state.id, 'status', state.status, 'enqueued', false);
  end if;
  if state.id is not null and state.status = 'running' then
    return jsonb_build_object('id', state.id, 'status', state.status, 'enqueued', false);
  end if;
  if state.id is not null
    and lower(state.one_c_counterparty_ref) = lower(company.external_1c_id)
    and not p_force
    and (
      state.status in ('queued','running','succeeded')
      or (state.status = 'failed_retryable' and coalesce(state.next_retry_at, now()) > now())
    ) then
    return jsonb_build_object('id', state.id, 'status', state.status, 'enqueued', false);
  end if;

  insert into public.partner_order_history_bootstrap_state(
    company_id, one_c_counterparty_ref, status, requested_at,
    requested_by_source, requested_by_user_id, history_from, history_to,
    cursor, pages_processed, source_rows, staged_rows, published_rows,
    rejected_rows, earliest_order_at, latest_order_at, last_error_code,
    retry_count, source_fingerprint, next_retry_at, locked_at, lock_token
  ) values (
    company.id, lower(company.external_1c_id), 'queued', now(),
    p_requested_by_source, coalesce(p_requested_by_user_id, actor), now() - interval '24 months', now(),
    null, 0, 0, 0, 0, 0, null, null, null,
    case when state.id is null then 0 else state.retry_count end, null, null, null, null
  ) on conflict (company_id) do update set
    one_c_counterparty_ref = excluded.one_c_counterparty_ref,
    status = 'queued', requested_at = now(), started_at = null, completed_at = null,
    requested_by_source = excluded.requested_by_source,
    requested_by_user_id = excluded.requested_by_user_id,
    history_from = excluded.history_from, history_to = excluded.history_to,
    cursor = null, pages_processed = 0, source_rows = 0, staged_rows = 0,
    published_rows = 0, rejected_rows = 0, earliest_order_at = null,
    latest_order_at = null, last_error_code = null, source_fingerprint = null,
    next_retry_at = null, locked_at = null, lock_token = null,
    version = public.partner_order_history_bootstrap_state.version + 1, updated_at = now()
  returning * into state;

  insert into public.partner_order_history_bootstrap_events(
    bootstrap_id, company_id, actor_user_id, event_type, safe_reason,
    correlation_id, safe_metadata
  ) values (
    state.id, company.id, coalesce(p_requested_by_user_id, actor),
    case when p_requested_by_source = 'admin_manual' then 'manual_requested' else 'queued' end,
    p_requested_by_source, correlation,
    jsonb_build_object('historyMonths', 24, 'mappingValidated', true)
  );
  return jsonb_build_object('id', state.id, 'status', state.status, 'enqueued', true);
end;
$$;

-- Companies activated after the original migration may already have a verified
-- complete full scan. Reuse that durable evidence instead of repeating 1C work.
with inserted as (
  insert into public.partner_order_history_bootstrap_state(
    company_id, one_c_counterparty_ref, status, requested_at, started_at,
    completed_at, requested_by_source, history_from, history_to,
    pages_processed, source_rows, staged_rows, published_rows, rejected_rows,
    earliest_order_at, latest_order_at, source_fingerprint
  )
  select company.id, lower(company.external_1c_id), 'succeeded',
    sync.started_at, sync.started_at, sync.last_successful_full_sync_at,
    'migration_backfill', sync.started_at - interval '24 months', sync.started_at,
    1, sync.records_received, sync.records_received, sync.records_received, 0,
    history.earliest_order_at, history.latest_order_at,
    encode(extensions.digest(
      company.id::text || '|' || lower(company.external_1c_id) || '|'
      || sync.records_received::text || '|' || coalesce(history.latest_order_at::text,''),
      'sha256'
    ), 'hex')
  from public.partner_companies company
  join public.partner_order_history_sync_state sync
    on sync.company_id = company.id
    and sync.last_successful_full_sync_at is not null
  join lateral (
    select min(one_c_document_date) earliest_order_at,
      max(one_c_document_date) latest_order_at
    from public.partner_order_history
    where company_id = company.id
  ) history on true
  where company.status = 'active'
    and company.external_1c_id is not null
    and not exists (
      select 1 from public.partner_order_history_bootstrap_state state
      where state.company_id = company.id
    )
  on conflict (company_id) do nothing
  returning id, company_id, published_rows
)
insert into public.partner_order_history_bootstrap_events(
  bootstrap_id, company_id, event_type, safe_reason, safe_metadata
)
select id, company_id, 'completed', 'verified_full_history_backfilled',
  jsonb_build_object('publishedRows', published_rows)
from inserted;

revoke all on function public.enqueue_partner_order_history_bootstrap(uuid,text,uuid,boolean)
  from public, anon;
grant execute on function public.enqueue_partner_order_history_bootstrap(uuid,text,uuid,boolean)
  to authenticated, service_role;

comment on table public.partner_behavior_event_idempotency is
  'Server-only navigation identity ledger preventing duplicate partner behavior events.';
comment on function public.record_partner_behavior_events_batch(uuid,jsonb) is
  'Atomically records one bounded behavior-event batch with navigation-scoped idempotency.';

commit;
