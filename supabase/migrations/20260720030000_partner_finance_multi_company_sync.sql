begin;

insert into public.permissions(code, description)
values ('finance.sync', 'Run server-side partner finance read-model synchronization.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'finance.sync'
where role.code in ('novotech_admin', 'novotech_finance')
on conflict (role_id, permission_id) do nothing;

create table if not exists public.partner_finance_sync_state (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  status text not null,
  last_attempt_at timestamptz null,
  last_success_at timestamptz null,
  last_error_code text null,
  received_count integer not null default 0,
  published_count integer not null default 0,
  excluded_deleted_count integer not null default 0,
  source_version text null,
  last_duration_ms integer null,
  updated_at timestamptz not null default now(),
  constraint partner_finance_sync_state_status_check check (status in ('running', 'succeeded', 'failed', 'mapping_missing')),
  constraint partner_finance_sync_state_counts_check check (received_count >= 0 and published_count >= 0 and excluded_deleted_count >= 0),
  constraint partner_finance_sync_state_duration_check check (last_duration_ms is null or last_duration_ms >= 0)
);

create table if not exists public.partner_finance_sync_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  event_type text not null,
  trigger_type text not null,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  received_count integer not null default 0,
  published_count integer not null default 0,
  excluded_deleted_count integer not null default 0,
  error_code text null,
  duration_ms integer null,
  created_at timestamptz not null default now(),
  constraint partner_finance_sync_events_type_check check (event_type in ('started', 'succeeded', 'failed', 'mapping_missing', 'locked')),
  constraint partner_finance_sync_events_trigger_check check (trigger_type in ('manual', 'scheduled'))
);

create index if not exists partner_finance_sync_events_company_created_idx
  on public.partner_finance_sync_events(company_id, created_at desc);

alter table public.partner_finance_sync_state enable row level security;
alter table public.partner_finance_sync_events enable row level security;
revoke all on public.partner_finance_sync_state, public.partner_finance_sync_events from public, anon, authenticated;
grant select on public.partner_finance_sync_state to authenticated;

drop policy if exists "Partners select permitted finance sync state" on public.partner_finance_sync_state;
create policy "Partners select permitted finance sync state"
on public.partner_finance_sync_state for select to authenticated
using (public.has_permission(company_id, 'finance.view_company'));

insert into public.partner_finance_sync_state(
  company_id, status, last_attempt_at, last_success_at, received_count, published_count, updated_at
)
select balance.company_id, 'succeeded', max(balance.synchronized_at), max(balance.synchronized_at),
  count(*)::integer, count(*) filter (where balance.is_active)::integer, max(balance.synchronized_at)
from public.partner_contract_balances balance
group by balance.company_id
on conflict (company_id) do nothing;

create or replace function public.record_partner_finance_sync_result(
  p_company_id uuid,
  p_status text,
  p_trigger text,
  p_actor_user_id uuid default null,
  p_error_code text default null,
  p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_event_type text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Finance synchronization is server-only.' using errcode = '42501';
  end if;
  if p_status not in ('running', 'failed', 'mapping_missing', 'locked') or p_trigger not in ('manual', 'scheduled') then
    raise exception 'Finance synchronization status is invalid.' using errcode = '22023';
  end if;
  v_event_type := case when p_status = 'running' then 'started' else p_status end;
  if p_status <> 'locked' then
    insert into public.partner_finance_sync_state(company_id, status, last_attempt_at, last_error_code, last_duration_ms, updated_at)
    values (p_company_id, p_status, now(), case when p_status in ('failed', 'mapping_missing') then left(nullif(p_error_code, ''), 80) else null end, p_duration_ms, now())
    on conflict (company_id) do update set
      status = excluded.status,
      last_attempt_at = excluded.last_attempt_at,
      last_error_code = excluded.last_error_code,
      last_duration_ms = excluded.last_duration_ms,
      updated_at = excluded.updated_at;
  end if;
  insert into public.partner_finance_sync_events(company_id, event_type, trigger_type, actor_user_id, error_code, duration_ms)
  values (p_company_id, v_event_type, p_trigger, p_actor_user_id, case when p_status in ('failed', 'mapping_missing') then left(nullif(p_error_code, ''), 80) else null end, p_duration_ms);
end;
$$;

create or replace function public.publish_partner_contract_balances_v2(
  p_company_id uuid,
  p_counterparty_ref text,
  p_synchronized_at timestamptz,
  p_rows jsonb,
  p_received_count integer,
  p_excluded_deleted_count integer,
  p_duration_ms integer,
  p_trigger text,
  p_actor_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare published_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Finance synchronization is server-only.' using errcode = '42501';
  end if;
  if p_trigger not in ('manual', 'scheduled') or p_received_count < 0 or p_excluded_deleted_count < 0 or p_duration_ms < 0 then
    raise exception 'Finance synchronization publication input is invalid.' using errcode = '22023';
  end if;

  published_count := public.publish_partner_contract_balances(p_company_id, p_counterparty_ref, p_synchronized_at, p_rows);

  insert into public.partner_finance_sync_state(
    company_id, status, last_attempt_at, last_success_at, last_error_code,
    received_count, published_count, excluded_deleted_count, source_version,
    last_duration_ms, updated_at
  ) values (
    p_company_id, 'succeeded', now(), p_synchronized_at, null,
    p_received_count, published_count, p_excluded_deleted_count, null,
    p_duration_ms, now()
  ) on conflict (company_id) do update set
    status = excluded.status,
    last_attempt_at = excluded.last_attempt_at,
    last_success_at = excluded.last_success_at,
    last_error_code = null,
    received_count = excluded.received_count,
    published_count = excluded.published_count,
    excluded_deleted_count = excluded.excluded_deleted_count,
    source_version = excluded.source_version,
    last_duration_ms = excluded.last_duration_ms,
    updated_at = excluded.updated_at;

  insert into public.partner_finance_sync_events(
    company_id, event_type, trigger_type, actor_user_id,
    received_count, published_count, excluded_deleted_count, duration_ms
  ) values (
    p_company_id, 'succeeded', p_trigger, p_actor_user_id,
    p_received_count, published_count, p_excluded_deleted_count, p_duration_ms
  );
  return published_count;
end;
$$;

create or replace function public.get_partner_finance_overview(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.has_permission(p_company_id, 'finance.view_company') then
    raise exception 'Finance access denied.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'sync_state', (select to_jsonb(state) from public.partner_finance_sync_state state where state.company_id = p_company_id),
    'balances', coalesce((
      select jsonb_agg(to_jsonb(balance) order by balance.currency_code, balance.contract_name, balance.id)
      from public.partner_contract_balances balance
      where balance.company_id = p_company_id and balance.is_active
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.can_run_partner_finance_sync()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    join public.company_memberships membership on membership.user_id = profile.id and membership.status = 'active'
    join public.roles role on role.id = membership.role_id and role.scope = 'internal'
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id and permission.code = 'finance.sync'
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
  );
$$;

revoke all on function public.record_partner_finance_sync_result(uuid, text, text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.publish_partner_contract_balances_v2(uuid, text, timestamptz, jsonb, integer, integer, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.get_partner_finance_overview(uuid) from public, anon;
revoke all on function public.can_run_partner_finance_sync() from public, anon;
grant execute on function public.record_partner_finance_sync_result(uuid, text, text, uuid, text, integer) to service_role;
grant execute on function public.publish_partner_contract_balances_v2(uuid, text, timestamptz, jsonb, integer, integer, integer, text, uuid) to service_role;
grant execute on function public.get_partner_finance_overview(uuid) to authenticated;
grant execute on function public.can_run_partner_finance_sync() to authenticated;

comment on table public.partner_finance_sync_state is 'Per-company synchronization state for the 1C-owned contract-balance read model.';
comment on table public.partner_finance_sync_events is 'Amount-free audit trail for contract-balance synchronization attempts.';

commit;
