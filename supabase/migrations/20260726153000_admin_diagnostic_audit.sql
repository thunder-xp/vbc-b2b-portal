begin;

create table if not exists public.internal_diagnostic_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  diagnostic_code text not null check (diagnostic_code in ('one_c_health')),
  result_status text not null check (result_status in ('passed', 'failed')),
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists internal_diagnostic_audit_created_idx
  on public.internal_diagnostic_audit_events(created_at desc);

comment on table public.internal_diagnostic_audit_events is
  'Append-only audit record for explicit bounded internal diagnostics. No credentials, query values, or provider payloads are stored.';

create or replace function public.record_internal_diagnostic_event(
  p_diagnostic_code text,
  p_result_status text,
  p_duration_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_id uuid;
begin
  if not public.has_internal_permission('admin.diagnostics.run') then
    raise exception 'Internal diagnostic execution is not allowed.'
      using errcode = '42501';
  end if;

  if p_diagnostic_code <> 'one_c_health'
    or p_result_status not in ('passed', 'failed')
    or p_duration_ms is null
    or p_duration_ms < 0 then
    raise exception 'Invalid diagnostic audit event.'
      using errcode = '22023';
  end if;

  insert into public.internal_diagnostic_audit_events(
    actor_user_id,
    diagnostic_code,
    result_status,
    duration_ms
  )
  values (
    auth.uid(),
    p_diagnostic_code,
    p_result_status,
    p_duration_ms
  )
  returning id into created_id;

  return created_id;
end;
$$;

alter table public.internal_diagnostic_audit_events enable row level security;

revoke all on table public.internal_diagnostic_audit_events
  from public, anon, authenticated;
grant select on table public.internal_diagnostic_audit_events to authenticated;

drop policy if exists "Permission administrators select diagnostic audit"
  on public.internal_diagnostic_audit_events;
create policy "Permission administrators select diagnostic audit"
on public.internal_diagnostic_audit_events
for select to authenticated
using (public.has_internal_permission('admin.audit.view'));

revoke all on function public.record_internal_diagnostic_event(text, text, integer)
  from public, anon;
grant execute on function public.record_internal_diagnostic_event(text, text, integer)
  to authenticated;

commit;
