begin;

create table public.partner_order_history_bootstrap_state (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.partner_companies(id) on delete cascade,
  one_c_counterparty_ref text not null,
  status text not null default 'queued',
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  requested_by_source text not null,
  requested_by_user_id uuid references public.user_profiles(id) on delete set null,
  history_from timestamptz not null default (now() - interval '24 months'),
  history_to timestamptz not null default now(),
  cursor text,
  pages_processed integer not null default 0,
  source_rows integer not null default 0,
  staged_rows integer not null default 0,
  published_rows integer not null default 0,
  rejected_rows integer not null default 0,
  earliest_order_at timestamptz,
  latest_order_at timestamptz,
  last_error_code text,
  retry_count integer not null default 0,
  source_fingerprint text,
  next_retry_at timestamptz,
  locked_at timestamptz,
  lock_token uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_order_history_bootstrap_status_check check (status in (
    'queued','running','succeeded','failed_retryable','failed_terminal','stale'
  )),
  constraint partner_order_history_bootstrap_source_check check (requested_by_source in (
    'onboarding_approval','first_access','admin_manual','migration_backfill'
  )),
  constraint partner_order_history_bootstrap_ref_check check (
    one_c_counterparty_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and lower(one_c_counterparty_ref) <> '00000000-0000-0000-0000-000000000000'
  ),
  constraint partner_order_history_bootstrap_counts_check check (
    pages_processed >= 0 and source_rows >= 0 and staged_rows >= 0
    and published_rows >= 0 and rejected_rows >= 0 and retry_count >= 0
  ),
  constraint partner_order_history_bootstrap_range_check check (history_from <= history_to)
);

create index partner_order_history_bootstrap_claim_idx
  on public.partner_order_history_bootstrap_state(status, next_retry_at, requested_at);
create index partner_order_history_bootstrap_ref_idx
  on public.partner_order_history_bootstrap_state(lower(one_c_counterparty_ref));

create table public.partner_order_history_bootstrap_events (
  id uuid primary key default gen_random_uuid(),
  bootstrap_id uuid not null references public.partner_order_history_bootstrap_state(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  event_type text not null,
  safe_reason text,
  correlation_id uuid not null default gen_random_uuid(),
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint partner_order_history_bootstrap_event_type_check check (event_type in (
    'queued','started','completed','failed_retryable','failed_terminal','stale','manual_requested'
  )),
  constraint partner_order_history_bootstrap_event_metadata_check check (jsonb_typeof(safe_metadata) = 'object')
);

create index partner_order_history_bootstrap_events_company_idx
  on public.partner_order_history_bootstrap_events(company_id, occurred_at desc);

alter table public.partner_order_history_bootstrap_state enable row level security;
alter table public.partner_order_history_bootstrap_events enable row level security;
revoke all on public.partner_order_history_bootstrap_state,
  public.partner_order_history_bootstrap_events from public, anon, authenticated;
grant select, insert, update, delete on public.partner_order_history_bootstrap_state to service_role;
grant select, insert on public.partner_order_history_bootstrap_events to service_role;

create or replace function public.prevent_order_history_bootstrap_event_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'bootstrap_event_history_is_immutable' using errcode = '55000';
end;
$$;
create trigger immutable_order_history_bootstrap_events
before update or delete on public.partner_order_history_bootstrap_events
for each row execute function public.prevent_order_history_bootstrap_event_mutation();
revoke all on function public.prevent_order_history_bootstrap_event_mutation() from public, anon, authenticated;

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
  select count(*) into mapping_count from public.one_c_counterparties counterparty
  where lower(counterparty.external_1c_id) = lower(company.external_1c_id)
    and counterparty.portal_company_id = company.id
    and counterparty.is_published and counterparty.is_active and not counterparty.is_deleted;
  if mapping_count <> 1 then
    raise exception 'bootstrap_company_mapping_conflict' using errcode = '23514';
  end if;

  select * into state from public.partner_order_history_bootstrap_state
  where company_id = company.id for update;
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

create or replace function public.claim_partner_order_history_bootstrap(p_stale_after_seconds integer default 1800)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare state public.partner_order_history_bootstrap_state%rowtype; token uuid := gen_random_uuid();
begin
  select * into state from public.partner_order_history_bootstrap_state candidate
  where candidate.status = 'queued'
    or (candidate.status = 'failed_retryable' and coalesce(candidate.next_retry_at, now()) <= now())
    or (candidate.status = 'running' and candidate.locked_at <= now() - make_interval(secs => greatest(60, p_stale_after_seconds)))
  order by candidate.requested_at, candidate.company_id
  for update skip locked limit 1;
  if state.id is null then return null; end if;
  update public.partner_order_history_bootstrap_state set
    status = 'running', started_at = coalesce(started_at, now()), locked_at = now(),
    lock_token = token, updated_at = now()
  where id = state.id;
  insert into public.partner_order_history_bootstrap_events(
    bootstrap_id, company_id, event_type, safe_reason, safe_metadata
  ) values (
    state.id, state.company_id, 'started',
    case when state.status = 'running' then 'stale_lock_recovered' else 'worker_claimed' end,
    jsonb_build_object('retryCount', state.retry_count)
  );
  return jsonb_build_object(
    'id', state.id, 'companyId', state.company_id,
    'counterpartyRef', state.one_c_counterparty_ref, 'lockToken', token,
    'historyFrom', state.history_from, 'historyTo', state.history_to
  );
end;
$$;

create or replace function public.complete_partner_order_history_bootstrap(
  p_bootstrap_id uuid, p_lock_token uuid, p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare state public.partner_order_history_bootstrap_state%rowtype; fingerprint text; earliest_at timestamptz; latest_at timestamptz;
begin
  select * into state from public.partner_order_history_bootstrap_state
  where id = p_bootstrap_id and status = 'running' and lock_token = p_lock_token for update;
  if state.id is null then raise exception 'bootstrap_lock_lost' using errcode = '40001'; end if;
  select min(one_c_document_date), max(one_c_document_date) into earliest_at, latest_at
  from public.partner_order_history where company_id = state.company_id;
  fingerprint := encode(extensions.digest(
    state.company_id::text || '|' || lower(state.one_c_counterparty_ref) || '|'
    || coalesce(p_result->>'received','0') || '|' || coalesce(latest_at::text,''), 'sha256'
  ), 'hex');
  update public.partner_order_history_bootstrap_state set
    status = 'succeeded', completed_at = now(), cursor = null,
    pages_processed = greatest(0, coalesce((p_result->>'pagesFetched')::integer, 0)),
    source_rows = greatest(0, coalesce((p_result->>'rawReceived')::integer, 0)),
    staged_rows = greatest(0, coalesce((p_result->>'received')::integer, 0)),
    published_rows = greatest(0, coalesce((p_result->>'received')::integer, 0)),
    rejected_rows = greatest(0, coalesce((p_result->>'rejected')::integer, 0)),
    earliest_order_at = earliest_at, latest_order_at = latest_at,
    last_error_code = null, next_retry_at = null, source_fingerprint = fingerprint,
    locked_at = null, lock_token = null, updated_at = now()
  where id = state.id;
  insert into public.partner_order_history_bootstrap_events(
    bootstrap_id, company_id, event_type, safe_reason, safe_metadata
  ) values (
    state.id, state.company_id, 'completed', 'full_history_import_succeeded',
    jsonb_build_object(
      'pages', greatest(0, coalesce((p_result->>'pagesFetched')::integer, 0)),
      'sourceRows', greatest(0, coalesce((p_result->>'rawReceived')::integer, 0)),
      'publishedRows', greatest(0, coalesce((p_result->>'received')::integer, 0)),
      'rejectedRows', greatest(0, coalesce((p_result->>'rejected')::integer, 0))
    )
  );
  perform public.enqueue_partner_momentum_company(state.company_id, 'order_history_bootstrap_completed');
  insert into public.partner_commercial_opportunity_dirty_companies(company_id, reason)
  values(state.company_id, 'order_history_bootstrap_completed')
  on conflict (company_id) do update set reason = excluded.reason, last_dirtied_at = now(), locked_at = null;
end;
$$;

create or replace function public.fail_partner_order_history_bootstrap(
  p_bootstrap_id uuid, p_lock_token uuid, p_error_code text, p_retryable boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare state public.partner_order_history_bootstrap_state%rowtype; next_status text;
begin
  select * into state from public.partner_order_history_bootstrap_state
  where id = p_bootstrap_id and status = 'running' and lock_token = p_lock_token for update;
  if state.id is null then return; end if;
  next_status := case when p_retryable and state.retry_count < 5 then 'failed_retryable' else 'failed_terminal' end;
  update public.partner_order_history_bootstrap_state set
    status = next_status, retry_count = retry_count + 1,
    last_error_code = left(coalesce(nullif(p_error_code,''),'unknown_error'), 80),
    next_retry_at = case when next_status = 'failed_retryable'
      then now() + make_interval(mins => least(60, (2 ^ least(state.retry_count, 5))::integer)) end,
    locked_at = null, lock_token = null, updated_at = now()
  where id = state.id;
  insert into public.partner_order_history_bootstrap_events(
    bootstrap_id, company_id, event_type, safe_reason, safe_metadata
  ) values (
    state.id, state.company_id, next_status,
    left(coalesce(nullif(p_error_code,''),'unknown_error'), 80),
    jsonb_build_object('retryCount', state.retry_count + 1)
  );
end;
$$;

create or replace function public.get_partner_order_history_bootstrap_status(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare state public.partner_order_history_bootstrap_state%rowtype;
begin
  if auth.uid() is null or not (
    public.has_permission(p_company_id, 'orders.view')
    or public.has_internal_permission('admin.integrations.view')
  ) then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into state from public.partner_order_history_bootstrap_state where company_id = p_company_id;
  if state.id is null then return jsonb_build_object('status','not_requested'); end if;
  return jsonb_build_object(
    'status', state.status, 'requestedAt', state.requested_at,
    'completedAt', state.completed_at, 'lastErrorCode', state.last_error_code
  );
end;
$$;

create or replace function public.list_admin_order_history_bootstraps(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if auth.uid() is null or not public.has_internal_permission('admin.integrations.view') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'summary', (select jsonb_build_object(
      'notRequested', (select count(*) from public.partner_companies c where c.status='active' and c.external_1c_id is not null and not exists(select 1 from public.partner_order_history_bootstrap_state s where s.company_id=c.id)),
      'queued', count(*) filter(where status='queued'), 'running', count(*) filter(where status='running'),
      'succeeded', count(*) filter(where status='succeeded'),
      'failed', count(*) filter(where status in ('failed_retryable','failed_terminal')),
      'stale', count(*) filter(where status='stale'),
      'oldestPending', min(requested_at) filter(where status in ('queued','running','failed_retryable'))
    ) from public.partner_order_history_bootstrap_state),
    'items', (select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.requested_at desc),'[]'::jsonb) from (
      select state.id, state.company_id as "companyId", company.display_name as "companyName",
        state.status, state.requested_at as "requestedAt", state.started_at as "startedAt",
        state.completed_at as "completedAt", state.pages_processed as "pagesProcessed",
        state.source_rows as "sourceRows", state.published_rows as "publishedRows",
        state.rejected_rows as "rejectedRows", state.earliest_order_at as "earliestOrderAt",
        state.latest_order_at as "latestOrderAt", state.last_error_code as "lastErrorCode",
        sync.last_successful_full_sync_at as "lastFullSyncAt", sync.last_incremental_sync_at as "lastIncrementalSyncAt"
      from public.partner_order_history_bootstrap_state state
      join public.partner_companies company on company.id=state.company_id
      left join public.partner_order_history_sync_state sync on sync.company_id=state.company_id
      order by state.requested_at desc limit greatest(1,least(p_limit,100))
    ) row_value)
  );
end;
$$;

create or replace function public.enqueue_order_history_bootstrap_after_approval()
returns trigger language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if new.status = 'approved' and new.company_id is not null
    and (old.status is distinct from new.status or old.company_id is distinct from new.company_id) then
    begin
      perform public.enqueue_partner_order_history_bootstrap(
        new.company_id, 'onboarding_approval', new.user_profile_id, false
      );
    exception when others then
      raise warning 'partner_order_history_bootstrap_enqueue_failed:%', sqlstate;
    end;
  end if;
  return new;
end;
$$;
create trigger enqueue_order_history_bootstrap_after_approval
after update of status, company_id on public.access_requests
for each row execute function public.enqueue_order_history_bootstrap_after_approval();

-- Existing complete full scans are authoritative bootstrap evidence; other mapped
-- active companies are queued without performing network work in the migration.
insert into public.partner_order_history_bootstrap_state(
  company_id, one_c_counterparty_ref, status, requested_at, started_at, completed_at,
  requested_by_source, history_from, history_to, pages_processed, source_rows,
  staged_rows, published_rows, rejected_rows, earliest_order_at, latest_order_at,
  source_fingerprint
)
select company.id, lower(company.external_1c_id),
  case when sync.last_successful_full_sync_at is not null then 'succeeded' else 'queued' end,
  coalesce(sync.started_at, now()), sync.started_at,
  case when sync.last_successful_full_sync_at is not null then sync.last_successful_full_sync_at end,
  'migration_backfill', now() - interval '24 months', now(),
  case when sync.last_successful_full_sync_at is not null then 1 else 0 end,
  coalesce(sync.records_received,0), coalesce(sync.records_received,0),
  coalesce(sync.records_received,0), 0,
  history.earliest_order_at, history.latest_order_at,
  case when sync.last_successful_full_sync_at is not null then encode(extensions.digest(
    company.id::text || '|' || lower(company.external_1c_id) || '|' || coalesce(sync.records_received,0)::text || '|' || coalesce(history.latest_order_at::text,''), 'sha256'
  ),'hex') end
from public.partner_companies company
join public.one_c_counterparties counterparty
  on counterparty.portal_company_id=company.id
  and lower(counterparty.external_1c_id)=lower(company.external_1c_id)
  and counterparty.is_published and counterparty.is_active and not counterparty.is_deleted
left join public.partner_order_history_sync_state sync on sync.company_id=company.id
left join lateral (
  select min(one_c_document_date) earliest_order_at, max(one_c_document_date) latest_order_at
  from public.partner_order_history where company_id=company.id
) history on true
where company.status='active' and company.external_1c_id is not null
on conflict (company_id) do nothing;

-- Bootstrap completeness gates partner-facing momentum. It never rewrites the
-- underlying analytical snapshot, so genuine insufficient history remains visible
-- only after a successful bootstrap.
create or replace function public.get_partner_momentum_summary(target_company_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; actor uuid:=auth.uid(); bootstrap_status text;
begin
  if actor is null or not public.has_permission(target_company_id,'partner_momentum.partner_view') then raise exception 'Forbidden' using errcode='42501'; end if;
  select coalesce(state.status,'not_requested') into bootstrap_status
  from (select 1) seed left join public.partner_order_history_bootstrap_state state on state.company_id=target_company_id;
  if bootstrap_status in ('not_requested','queued','running','stale') then
    return jsonb_build_object('status','history_sync_pending','title','История закупок синхронизируется','explanation','Некоторые рекомендации и показатели динамики появятся после загрузки истории заказов.','calculatedAt',now(),'sourceFingerprint','bootstrap:'||target_company_id::text,'actions','[]'::jsonb);
  elsif bootstrap_status in ('failed_retryable','failed_terminal') then
    return jsonb_build_object('status','history_sync_delayed','title','История закупок временно обновляется','explanation','Текущие заказы остаются доступны. Показатели динамики появятся после обновления истории.','calculatedAt',now(),'sourceFingerprint','bootstrap-delayed:'||target_company_id::text,'actions','[]'::jsonb);
  end if;
  select case when snapshot.status in ('slowing','attention_required','high_risk') and snapshot.valid_until>now()
    and not exists(select 1 from public.partner_retention_actions action where action.company_id=target_company_id and action.action_type='action_dismissed' and action.cooldown_until>now())
  then jsonb_build_object('status',snapshot.status,'title','В этом периоде закупок меньше обычного','explanation',case when snapshot.current_cycle_overrun_ratio>=1.25 then 'Ваш обычный цикл закупки стал длиннее. Мы подготовили быстрые способы продолжить работу.' else 'За последние 60 дней закупок меньше относительно обычного темпа вашей компании.' end,'calculatedAt',snapshot.calculated_at,'sourceFingerprint',snapshot.source_fingerprint,'actions',(
    select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('key','repeat','label','Повторить закупку','href','/cabinet/orders'),
      case when exists(select 1 from public.purchase_templates template where template.company_id=target_company_id and template.status='active') then jsonb_build_object('key','templates','label','Открыть шаблоны','href','/cabinet/purchase-templates') end,
      case when exists(select 1 from public.partner_commercial_opportunities opportunity where opportunity.company_id=target_company_id and opportunity.status='active') then jsonb_build_object('key','opportunities','label','Посмотреть возможности','href','/cabinet/opportunities') end,
      case when exists(select 1 from public.commercial_campaign_audience_snapshots audience join public.commercial_campaigns campaign on campaign.id=audience.campaign_id where audience.company_id=target_company_id and campaign.status='active') then jsonb_build_object('key','offers','label','Открыть специальные предложения','href','/cabinet/offers') end
    )) value where value<>'null'::jsonb limit 3) actions
  )) else null end into result from public.partner_momentum_snapshots snapshot where snapshot.company_id=target_company_id;
  return result;
end;
$$;

revoke all on function public.enqueue_partner_order_history_bootstrap(uuid,text,uuid,boolean),
  public.claim_partner_order_history_bootstrap(integer),
  public.complete_partner_order_history_bootstrap(uuid,uuid,jsonb),
  public.fail_partner_order_history_bootstrap(uuid,uuid,text,boolean),
  public.get_partner_order_history_bootstrap_status(uuid),
  public.list_admin_order_history_bootstraps(integer),
  public.enqueue_order_history_bootstrap_after_approval() from public, anon;
grant execute on function public.enqueue_partner_order_history_bootstrap(uuid,text,uuid,boolean) to authenticated, service_role;
grant execute on function public.claim_partner_order_history_bootstrap(integer),
  public.complete_partner_order_history_bootstrap(uuid,uuid,jsonb),
  public.fail_partner_order_history_bootstrap(uuid,uuid,text,boolean) to service_role;
grant execute on function public.get_partner_order_history_bootstrap_status(uuid),
  public.list_admin_order_history_bootstraps(integer) to authenticated;

comment on table public.partner_order_history_bootstrap_state is
  'Durable, idempotent lifecycle for the first authoritative 1C customer-order history import per partner company mapping.';
comment on table public.partner_order_history_bootstrap_events is
  'Append-only safe operational audit for order-history bootstrap requests and outcomes.';

commit;
