create table public.retail_checkout_pilot_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  issued_by_user_id uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  revoked_by_user_id uuid null references auth.users(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '4 hours'),
  check ((revoked_at is null and revoked_by_user_id is null) or (revoked_at is not null and revoked_by_user_id is not null))
);

create index retail_checkout_pilot_sessions_active_idx
  on public.retail_checkout_pilot_sessions (token_hash, expires_at)
  where revoked_at is null;

create table public.retail_checkout_pilot_session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.retail_checkout_pilot_sessions(id) on delete restrict,
  event_type text not null check (event_type in ('issued', 'revoked')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  safe_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index retail_checkout_pilot_session_events_session_idx
  on public.retail_checkout_pilot_session_events (session_id, created_at, id);

create trigger protect_retail_checkout_pilot_session_events
before update or delete on public.retail_checkout_pilot_session_events
for each row execute function public.prevent_retail_marketplace_event_mutation();

create or replace function public.admin_issue_retail_checkout_pilot_session(
  p_token_hash text,
  p_expires_at timestamptz,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.retail_checkout_pilot_sessions;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now() + interval '5 minutes'
     or p_expires_at > now() + interval '4 hours'
     or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Invalid pilot session request.' using errcode = '22023';
  end if;

  insert into public.retail_checkout_pilot_sessions(token_hash, issued_by_user_id, expires_at, reason)
  values (p_token_hash, auth.uid(), p_expires_at, btrim(p_reason))
  returning * into target;

  insert into public.retail_checkout_pilot_session_events(session_id, event_type, actor_user_id, safe_evidence)
  values (target.id, 'issued', auth.uid(), jsonb_build_object('expiresAt', target.expires_at, 'reason', target.reason));

  return jsonb_build_object('id', target.id, 'expiresAt', target.expires_at);
end;
$$;

create or replace function public.validate_retail_checkout_pilot_session(p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_token_hash ~ '^[0-9a-f]{64}$' and exists (
    select 1
    from public.retail_checkout_pilot_sessions session
    where session.token_hash = p_token_hash
      and session.revoked_at is null
      and session.expires_at > now()
  );
$$;

create or replace function public.admin_revoke_retail_checkout_pilot_session(
  p_token_hash text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.retail_checkout_pilot_sessions;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then
    raise exception 'Forbidden.' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Invalid pilot revocation request.' using errcode = '22023';
  end if;

  select * into target
  from public.retail_checkout_pilot_sessions
  where token_hash = p_token_hash
  for update;

  if target.id is null or target.revoked_at is not null then
    return false;
  end if;

  update public.retail_checkout_pilot_sessions
  set revoked_at = now(), revoked_by_user_id = auth.uid()
  where id = target.id;

  insert into public.retail_checkout_pilot_session_events(session_id, event_type, actor_user_id, safe_evidence)
  values (target.id, 'revoked', auth.uid(), jsonb_build_object('reason', btrim(p_reason)));
  return true;
end;
$$;

alter table public.retail_checkout_pilot_sessions enable row level security;
alter table public.retail_checkout_pilot_session_events enable row level security;

revoke all on public.retail_checkout_pilot_sessions, public.retail_checkout_pilot_session_events from public, anon, authenticated;
grant select on public.retail_checkout_pilot_sessions, public.retail_checkout_pilot_session_events to authenticated;

create policy retail_checkout_pilot_sessions_admin_read
on public.retail_checkout_pilot_sessions for select to authenticated
using (public.has_internal_permission('admin.retail_marketplace.view'));

create policy retail_checkout_pilot_session_events_admin_read
on public.retail_checkout_pilot_session_events for select to authenticated
using (public.has_internal_permission('admin.retail_marketplace.view'));

revoke all on function public.admin_issue_retail_checkout_pilot_session(text,timestamptz,text),
  public.validate_retail_checkout_pilot_session(text),
  public.admin_revoke_retail_checkout_pilot_session(text,text)
from public, anon, authenticated;

grant execute on function public.admin_issue_retail_checkout_pilot_session(text,timestamptz,text),
  public.admin_revoke_retail_checkout_pilot_session(text,text)
to authenticated, service_role;

grant execute on function public.validate_retail_checkout_pilot_session(text)
to anon, authenticated, service_role;
