begin;

alter table public.commercial_exchange_rates
  add column if not exists source_currency_ref text,
  add column if not exists source_symbolic_code text,
  add column if not exists source_raw_rate numeric(18, 8),
  add column if not exists source_multiplicity numeric(18, 8),
  add column if not exists source_data_version text,
  add column if not exists source_checked_at timestamptz;

alter table public.commercial_exchange_rates
  drop constraint if exists commercial_exchange_rates_source_type_check,
  drop constraint if exists commercial_exchange_rates_manual_fields_check,
  add constraint commercial_exchange_rates_source_type_check check (
    source_type is null or source_type in ('manual_from_1c', 'one_c_automatic')
  ),
  add constraint commercial_exchange_rates_source_fields_check check (
    source_type <> 'one_c_automatic' or (
      purpose in ('partner_price_usd_to_mdl', 'retail_price_usd_to_mdl')
      and source_currency_ref is not null
      and source_symbolic_code is not null
      and source_raw_rate > 0
      and source_multiplicity > 0
      and source_data_version is not null
      and source_checked_at is not null
      and effective_at is not null
      and published_by is null
    )
  ),
  add constraint commercial_exchange_rates_manual_fields_check check (
    purpose is null
    or source_type = 'one_c_automatic'
    or (
      effective_at is not null
      and published_by is not null
      and source_type = 'manual_from_1c'
      and source_note is not null
    )
  );

create table public.commercial_rate_sync_state (
  id text primary key check (id = 'authoritative_1c'),
  status text not null check (status in ('FRESH', 'STALE', 'FAILED', 'NEVER_SYNCED', 'RUNNING')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_source_checked_at timestamptz,
  last_source_effective_at jsonb not null default '{}'::jsonb,
  last_published_at timestamptz,
  last_result text check (last_result in ('PUBLISHED', 'NO_OP', 'FAILED', 'RUNNING')),
  last_error_code text,
  last_correlation_id uuid,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  updated_at timestamptz not null default now()
);

insert into public.commercial_rate_sync_state(id, status)
values ('authoritative_1c', 'NEVER_SYNCED')
on conflict (id) do nothing;

alter table public.commercial_rate_sync_state enable row level security;
revoke all on table public.commercial_rate_sync_state from public, anon, authenticated;
grant select, insert, update on table public.commercial_rate_sync_state to service_role;

create or replace function public.prevent_automatic_commercial_rate_evidence_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.source_type = 'one_c_automatic' and (
    new.purpose is distinct from old.purpose
    or new.rate is distinct from old.rate
    or new.effective_at is distinct from old.effective_at
    or new.source_currency_ref is distinct from old.source_currency_ref
    or new.source_code is distinct from old.source_code
    or new.source_symbolic_code is distinct from old.source_symbolic_code
    or new.source_raw_rate is distinct from old.source_raw_rate
    or new.source_multiplicity is distinct from old.source_multiplicity
    or new.source_data_version is distinct from old.source_data_version
    or new.source_checked_at is distinct from old.source_checked_at
    or new.previous_rate_id is distinct from old.previous_rate_id
  ) then
    raise exception 'Automatic commercial-rate evidence is immutable.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_automatic_commercial_rate_evidence_mutation
  on public.commercial_exchange_rates;
create trigger prevent_automatic_commercial_rate_evidence_mutation
before update on public.commercial_exchange_rates
for each row execute function public.prevent_automatic_commercial_rate_evidence_mutation();

create or replace function public.start_automatic_commercial_rate_sync(
  p_correlation_id uuid,
  p_attempted_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Commercial-rate synchronization is server-only.' using errcode = '42501';
  end if;
  update public.commercial_rate_sync_state
  set status = 'RUNNING', last_attempt_at = p_attempted_at, last_result = 'RUNNING',
      last_error_code = null, last_correlation_id = p_correlation_id, updated_at = now()
  where id = 'authoritative_1c';
end;
$$;

create or replace function public.fail_automatic_commercial_rate_sync(
  p_correlation_id uuid,
  p_error_code text,
  p_failed_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Commercial-rate synchronization is server-only.' using errcode = '42501';
  end if;
  if nullif(btrim(p_error_code), '') is null or char_length(p_error_code) > 128 then
    raise exception 'Invalid commercial-rate error code.' using errcode = '22023';
  end if;
  update public.commercial_rate_sync_state
  set status = 'FAILED', last_attempt_at = coalesce(last_attempt_at, p_failed_at),
      last_result = 'FAILED', last_error_code = btrim(p_error_code),
      last_correlation_id = p_correlation_id,
      consecutive_failures = consecutive_failures + 1, updated_at = p_failed_at
  where id = 'authoritative_1c';
end;
$$;

create or replace function public.publish_automatic_commercial_rates(
  p_rates jsonb,
  p_checked_at timestamptz,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  current_rate public.commercial_exchange_rates%rowtype;
  published_count integer := 0;
  latest_published_at timestamptz;
  effective_map jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Commercial-rate synchronization is server-only.' using errcode = '42501';
  end if;
  if p_checked_at is null or p_checked_at > now() + interval '5 minutes'
    or jsonb_typeof(p_rates) <> 'array' or jsonb_array_length(p_rates) <> 2 then
    raise exception 'Invalid automatic commercial-rate payload.' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_to_recordset(p_rates) as rate(purpose text, code text)
      where (purpose = 'partner_price_usd_to_mdl' and code = '113')
         or (purpose = 'retail_price_usd_to_mdl' and code = '999')) <> 2
    or (select count(distinct purpose) from jsonb_to_recordset(p_rates) as rate(purpose text)) <> 2 then
    raise exception 'Automatic commercial-rate payload must contain exact 113 and 999 mappings.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('automatic_commercial_rates'));

  for candidate in
    select * from jsonb_to_recordset(p_rates) as rate(
      purpose text,
      currency_ref text,
      code text,
      symbolic_code text,
      raw_rate numeric,
      multiplicity numeric,
      normalized_rate numeric,
      effective_at timestamptz,
      data_version text
    ) order by purpose
  loop
    if nullif(btrim(candidate.currency_ref), '') is null
      or nullif(btrim(candidate.symbolic_code), '') is null
      or candidate.raw_rate is null or candidate.raw_rate <= 0
      or candidate.multiplicity is null or candidate.multiplicity <= 0
      or candidate.normalized_rate is null or candidate.normalized_rate <= 0
      or candidate.normalized_rate is distinct from round(candidate.raw_rate / candidate.multiplicity, 8)
      or candidate.effective_at is null or candidate.effective_at > now() + interval '5 minutes'
      or nullif(btrim(candidate.data_version), '') is null
      or char_length(candidate.data_version) > 256
    then
      raise exception 'Invalid automatic commercial-rate source evidence.' using errcode = '22023';
    end if;

    select * into current_rate
    from public.commercial_exchange_rates
    where purpose = candidate.purpose and is_active and is_published
    for update;

    if current_rate.id is not null
      and current_rate.source_type = 'one_c_automatic'
      and current_rate.source_data_version = candidate.data_version
      and current_rate.source_ref = candidate.currency_ref
      and current_rate.source_symbolic_code = candidate.symbolic_code
      and current_rate.source_raw_rate = candidate.raw_rate
      and current_rate.source_multiplicity = candidate.multiplicity
      and current_rate.rate = candidate.normalized_rate
      and current_rate.effective_at = candidate.effective_at
    then
      continue;
    end if;

    if current_rate.id is not null and candidate.effective_at < current_rate.effective_at then
      raise exception 'An older commercial rate cannot replace the active rate.' using errcode = '22023';
    end if;

    if current_rate.id is not null then
      update public.commercial_exchange_rates
      set is_active = false, is_published = false, updated_at = now()
      where id = current_rate.id;
    end if;

    insert into public.commercial_exchange_rates(
      source_code, source_ref, base_currency, quote_currency, rate_direction,
      rate, effective_date, purpose, effective_at, source_updated_at,
      published_at, published_by, source_type, source_note, previous_rate_id,
      is_active, is_published, source_currency_ref, source_symbolic_code,
      source_raw_rate, source_multiplicity, source_data_version, source_checked_at
    ) values (
      candidate.code || ':' || left(md5(candidate.data_version), 20) || ':' ||
        floor(extract(epoch from clock_timestamp()) * 1000000)::bigint::text,
      candidate.currency_ref, 'USD', 'MDL', 'quote_per_base',
      candidate.normalized_rate, candidate.effective_at::date, candidate.purpose,
      candidate.effective_at, candidate.effective_at, now(), null,
      'one_c_automatic', 'РегистрСведений.КурсыВалют', current_rate.id,
      true, true, candidate.currency_ref, candidate.symbolic_code,
      candidate.raw_rate, candidate.multiplicity, candidate.data_version, p_checked_at
    ) returning published_at into latest_published_at;
    published_count := published_count + 1;
  end loop;

  select jsonb_object_agg(rate.purpose, rate.effective_at)
  into effective_map
  from jsonb_to_recordset(p_rates) as rate(purpose text, effective_at timestamptz);

  update public.commercial_rate_sync_state
  set status = 'FRESH', last_attempt_at = coalesce(last_attempt_at, p_checked_at),
      last_success_at = p_checked_at, last_source_checked_at = p_checked_at,
      last_source_effective_at = coalesce(effective_map, '{}'::jsonb),
      last_published_at = case when published_count > 0 then latest_published_at else last_published_at end,
      last_result = case when published_count > 0 then 'PUBLISHED' else 'NO_OP' end,
      last_error_code = null, last_correlation_id = p_correlation_id,
      consecutive_failures = 0, updated_at = now()
  where id = 'authoritative_1c';

  return jsonb_build_object(
    'outcome', case when published_count > 0 then 'published' else 'no_op' end,
    'publishedCount', published_count,
    'checkedAt', p_checked_at,
    'rates', (
      select jsonb_agg(to_jsonb(active_rate) order by active_rate.purpose)
      from public.commercial_exchange_rates active_rate
      where active_rate.purpose in ('partner_price_usd_to_mdl', 'retail_price_usd_to_mdl')
        and active_rate.is_active and active_rate.is_published
    )
  );
end;
$$;

create or replace function public.get_commercial_rate_sync_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  state public.commercial_rate_sync_state%rowtype;
begin
  if auth.uid() is null or not public.can_manage_commercial_rates() then
    raise exception 'Commercial-rate diagnostics are forbidden.' using errcode = '42501';
  end if;
  select * into state from public.commercial_rate_sync_state where id = 'authoritative_1c';
  return to_jsonb(state) || jsonb_build_object(
    'freshnessStatus', case
      when state.last_success_at is null then 'NEVER_SYNCED'
      when state.last_result = 'FAILED' then 'FAILED'
      when state.last_source_checked_at < now() - interval '30 minutes' then 'FAILED'
      when state.last_source_checked_at < now() - interval '10 minutes' then 'STALE'
      else 'FRESH'
    end
  );
end;
$$;

create or replace function public.get_partner_commercial_freshness()
returns table(domain text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_select_catalog() then
    raise exception 'Catalog access is required.' using errcode = '42501';
  end if;
  return query
  select 'rates'::text, state.last_source_checked_at
  from public.commercial_rate_sync_state state where state.id = 'authoritative_1c'
  union all
  select 'prices'::text, state.last_successful_sync_at
  from public.price_sync_state state where state.id = 'product_prices'
  union all
  select 'stock'::text, state.last_successful_sync_at
  from public.stock_sync_state state where state.id = 'exact_stock'
  union all
  select 'arrivals'::text, max(arrival.published_at)
  from public.product_supplier_arrivals arrival where arrival.is_published = true;
end;
$$;

revoke all on function public.prevent_automatic_commercial_rate_evidence_mutation() from public, anon, authenticated;
revoke all on function public.start_automatic_commercial_rate_sync(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.fail_automatic_commercial_rate_sync(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.publish_automatic_commercial_rates(jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.get_commercial_rate_sync_status() from public, anon, authenticated;
grant execute on function public.start_automatic_commercial_rate_sync(uuid, timestamptz) to service_role;
grant execute on function public.fail_automatic_commercial_rate_sync(uuid, text, timestamptz) to service_role;
grant execute on function public.publish_automatic_commercial_rates(jsonb, timestamptz, uuid) to service_role;
grant execute on function public.get_commercial_rate_sync_status() to authenticated;

comment on table public.commercial_rate_sync_state is
  'Durable watchdog state for the authoritative two-purpose 1C commercial-rate poll.';
comment on function public.publish_automatic_commercial_rates(jsonb, timestamptz, uuid) is
  'Atomically validates both authoritative 1C purposes, appends changed history only, and records a fresh source check.';

alter function private.get_admin_commercial_health(timestamptz)
  rename to get_admin_commercial_health_before_automatic_rates;

create function private.get_admin_commercial_health(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  with existing as (
    select item, ordinality
    from jsonb_array_elements(private.get_admin_commercial_health_before_automatic_rates(p_now))
      with ordinality as source(item, ordinality)
  ), state as (
    select sync.*,
      case
        when sync.last_success_at is null then 'NEVER_SYNCED'
        when sync.last_result = 'FAILED' then 'FAILED'
        when sync.last_source_checked_at < p_now - interval '30 minutes' then 'FAILED'
        when sync.last_source_checked_at < p_now - interval '10 minutes' then 'STALE'
        else 'HEALTHY'
      end as derived_status,
      (select count(*) from public.commercial_exchange_rates rate
       where rate.purpose in ('partner_price_usd_to_mdl', 'retail_price_usd_to_mdl')
         and rate.source_type = 'one_c_automatic' and rate.is_active and rate.is_published) as active_count
    from public.commercial_rate_sync_state sync where sync.id = 'authoritative_1c'
  ), rate_health as (
    select jsonb_build_object(
      'key', 'rates', 'status', state.derived_status,
      'lastAttemptAt', state.last_attempt_at, 'lastSuccessAt', state.last_success_at,
      'lastSeenAt', state.last_source_checked_at, 'operation', 'commercial_rate_sync',
      'stage', case when state.last_result = 'FAILED' then 'source_check' else 'completed' end,
      'safeErrorCode', state.last_error_code,
      'safeMessage', case
        when state.derived_status = 'FAILED' then 'Автоматическая проверка коммерческих курсов 1С не подтверждена.'
        when state.derived_status = 'STALE' then 'Источник коммерческих курсов 1С не проверялся более 10 минут.'
        when state.derived_status = 'NEVER_SYNCED' then 'Автоматическая синхронизация коммерческих курсов ещё не выполнялась.'
        else null end,
      'runId', state.last_correlation_id, 'correlationId', state.last_correlation_id,
      'recoverability', 'AUTOMATIC',
      'automaticRetryState', case when state.last_result = 'RUNNING' then 'RUNNING' else 'SCHEDULED' end,
      'affectedScope', 'commercial_rate',
      'currentDataState', 'Последняя успешная пара ставок остаётся активной до атомарной замены.',
      'received', state.active_count, 'staged', state.active_count,
      'published', state.active_count, 'durationMs', null, 'sourceCalls', 1,
      'retryCount', state.consecutive_failures, 'technicalCode', state.last_error_code,
      'historyHref', '/admin/commercial/rates'
    ) as item from state
  )
  select jsonb_agg(
    case when existing.item->>'key' = 'rates'
      then coalesce(rate_health.item, existing.item) else existing.item end
    order by existing.ordinality
  )
  from existing cross join rate_health;
$$;

revoke all on function private.get_admin_commercial_health_before_automatic_rates(timestamptz)
  from public, anon, authenticated;
revoke all on function private.get_admin_commercial_health(timestamptz)
  from public, anon, authenticated;

commit;
