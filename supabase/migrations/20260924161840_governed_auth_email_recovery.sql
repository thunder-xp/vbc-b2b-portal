-- Governed fallback for the rare case where Supabase's ordinary confirmation
-- send rejects a valid address before the configured Send Email Hook runs.
-- No token, action link, service key, or complete email address is persisted.

create table public.auth_email_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  actor_user_id uuid not null,
  masked_email text not null check (char_length(masked_email) between 5 and 254),
  email_domain text not null check (
    char_length(email_domain) between 3 and 253
    and email_domain = lower(email_domain)
    and email_domain !~ '[[:space:]@]'
  ),
  purpose text not null check (purpose = 'SIGNUP_CONFIRMATION'),
  original_error_code text not null check (original_error_code = 'email_address_invalid'),
  correlation_id uuid not null unique,
  status text not null check (status in (
    'RESERVED', 'GENERATED', 'DELIVERY_ACCEPTED', 'DELIVERY_FAILED', 'VERIFIED'
  )),
  generated_at timestamptz null,
  delivery_result text not null check (delivery_result in (
    'NOT_ATTEMPTED',
    'ACCEPTED',
    'GENERATION_FAILED',
    'PROVIDER_CONFIGURATION',
    'PROVIDER_TIMEOUT',
    'PROVIDER_AUTHENTICATION',
    'PROVIDER_REJECTED',
    'PROVIDER_UNAVAILABLE'
  )),
  verification_result text not null check (verification_result in ('PENDING', 'ACCEPTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz null
);

create unique index auth_email_recovery_attempts_open_user_idx
  on public.auth_email_recovery_attempts(auth_user_id)
  where status in ('RESERVED', 'GENERATED', 'DELIVERY_ACCEPTED');

create index auth_email_recovery_attempts_user_time_idx
  on public.auth_email_recovery_attempts(auth_user_id, created_at desc);

create table public.auth_email_recovery_audit_events (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  actor_user_id uuid not null,
  masked_email text not null,
  email_domain text not null,
  purpose text not null check (purpose = 'SIGNUP_CONFIRMATION'),
  correlation_id uuid not null,
  event_type text not null check (event_type in (
    'RECOVERY_RESERVED',
    'LINK_GENERATED',
    'DELIVERY_ACCEPTED',
    'DELIVERY_FAILED',
    'VERIFICATION_ACCEPTED'
  )),
  generated_at timestamptz null,
  delivery_result text not null,
  verification_result text not null,
  occurred_at timestamptz not null default now(),
  unique(correlation_id, event_type)
);

create index auth_email_recovery_audit_user_time_idx
  on public.auth_email_recovery_audit_events(auth_user_id, occurred_at desc);

alter table public.auth_email_recovery_attempts enable row level security;
alter table public.auth_email_recovery_audit_events enable row level security;

revoke all on table public.auth_email_recovery_attempts from public, anon, authenticated;
revoke all on table public.auth_email_recovery_audit_events from public, anon, authenticated;
grant select, insert, update on table public.auth_email_recovery_attempts to service_role;
grant select, insert on table public.auth_email_recovery_audit_events to service_role;

create or replace function public.reject_auth_email_recovery_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Auth email recovery audit events are append-only.' using errcode = '42501';
end;
$$;

create trigger auth_email_recovery_audit_events_immutable
before update or delete on public.auth_email_recovery_audit_events
for each row execute function public.reject_auth_email_recovery_audit_mutation();

revoke all on function public.reject_auth_email_recovery_audit_mutation()
  from public, anon, authenticated, service_role;

create or replace function public.reserve_auth_email_recovery_attempt(
  p_auth_user_id uuid,
  p_actor_user_id uuid,
  p_masked_email text,
  p_email_domain text,
  p_correlation_id uuid,
  p_original_error_code text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  existing public.auth_email_recovery_attempts%rowtype;
  created public.auth_email_recovery_attempts%rowtype;
  recent_attempts integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Auth email recovery is service-only.' using errcode = '42501';
  end if;
  if p_auth_user_id is null or p_actor_user_id is null or p_correlation_id is null
    or p_original_error_code <> 'email_address_invalid'
    or char_length(btrim(p_masked_email)) not between 5 and 254
    or char_length(btrim(p_email_domain)) not between 3 and 253
    or lower(btrim(p_email_domain)) <> btrim(p_email_domain)
    or btrim(p_email_domain) ~ '[[:space:]@]'
  then
    raise exception 'Auth email recovery input is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 0));

  select * into existing
  from public.auth_email_recovery_attempts attempt
  where attempt.correlation_id = p_correlation_id;
  if found then
    return jsonb_build_object(
      'attemptId', existing.id,
      'outcome', case
        when existing.status in ('DELIVERY_ACCEPTED', 'VERIFIED') then 'ALREADY_DELIVERED'
        when existing.status = 'DELIVERY_FAILED' then 'PREVIOUSLY_FAILED'
        else 'IN_PROGRESS'
      end,
      'status', existing.status
    );
  end if;

  select * into existing
  from public.auth_email_recovery_attempts attempt
  where attempt.auth_user_id = p_auth_user_id
    and attempt.status in ('RESERVED', 'GENERATED', 'DELIVERY_ACCEPTED')
  order by attempt.created_at desc
  limit 1;
  if found then
    return jsonb_build_object(
      'attemptId', existing.id,
      'outcome', case when existing.status = 'DELIVERY_ACCEPTED' then 'ALREADY_DELIVERED' else 'IN_PROGRESS' end,
      'status', existing.status
    );
  end if;

  if exists (
    select 1 from public.auth_email_recovery_attempts attempt
    where attempt.auth_user_id = p_auth_user_id
      and attempt.created_at > now() - interval '15 minutes'
  ) then
    return jsonb_build_object('attemptId', null, 'outcome', 'RATE_LIMITED', 'status', null);
  end if;

  select count(*) into recent_attempts
  from public.auth_email_recovery_attempts attempt
  where attempt.auth_user_id = p_auth_user_id
    and attempt.created_at > now() - interval '24 hours';
  if recent_attempts >= 3 then
    return jsonb_build_object('attemptId', null, 'outcome', 'RATE_LIMITED', 'status', null);
  end if;

  insert into public.auth_email_recovery_attempts(
    auth_user_id, actor_user_id, masked_email, email_domain, purpose,
    original_error_code, correlation_id, status, delivery_result, verification_result
  ) values (
    p_auth_user_id, p_actor_user_id, btrim(p_masked_email), btrim(p_email_domain),
    'SIGNUP_CONFIRMATION', p_original_error_code, p_correlation_id,
    'RESERVED', 'NOT_ATTEMPTED', 'PENDING'
  ) returning * into created;

  insert into public.auth_email_recovery_audit_events(
    auth_user_id, actor_user_id, masked_email, email_domain, purpose,
    correlation_id, event_type, generated_at, delivery_result, verification_result
  ) values (
    created.auth_user_id, created.actor_user_id, created.masked_email, created.email_domain,
    created.purpose, created.correlation_id, 'RECOVERY_RESERVED', null,
    created.delivery_result, created.verification_result
  );

  return jsonb_build_object('attemptId', created.id, 'outcome', 'RESERVED', 'status', created.status);
end;
$$;

create or replace function public.record_auth_email_recovery_outcome(
  p_attempt_id uuid,
  p_correlation_id uuid,
  p_outcome text,
  p_delivery_result text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  attempt public.auth_email_recovery_attempts%rowtype;
  next_event text;
begin
  if current_user <> 'service_role' then
    raise exception 'Auth email recovery is service-only.' using errcode = '42501';
  end if;

  select * into attempt
  from public.auth_email_recovery_attempts item
  where item.id = p_attempt_id and item.correlation_id = p_correlation_id
  for update;
  if not found then
    raise exception 'Auth email recovery attempt was not found.' using errcode = 'P0002';
  end if;

  if p_outcome = 'LINK_GENERATED' then
    if attempt.status <> 'RESERVED' then
      raise exception 'Invalid auth email recovery transition.' using errcode = '22023';
    end if;
    update public.auth_email_recovery_attempts
    set status = 'GENERATED', generated_at = now(), updated_at = now()
    where id = attempt.id returning * into attempt;
    next_event := 'LINK_GENERATED';
  elsif p_outcome = 'DELIVERY_ACCEPTED' then
    if attempt.status <> 'GENERATED' then
      raise exception 'Invalid auth email recovery transition.' using errcode = '22023';
    end if;
    update public.auth_email_recovery_attempts
    set status = 'DELIVERY_ACCEPTED', delivery_result = 'ACCEPTED', updated_at = now()
    where id = attempt.id returning * into attempt;
    next_event := 'DELIVERY_ACCEPTED';
  elsif p_outcome = 'DELIVERY_FAILED' then
    if attempt.status not in ('RESERVED', 'GENERATED')
      or p_delivery_result not in (
        'GENERATION_FAILED', 'PROVIDER_CONFIGURATION', 'PROVIDER_TIMEOUT',
        'PROVIDER_AUTHENTICATION', 'PROVIDER_REJECTED', 'PROVIDER_UNAVAILABLE'
      )
    then
      raise exception 'Invalid auth email recovery transition.' using errcode = '22023';
    end if;
    update public.auth_email_recovery_attempts
    set status = 'DELIVERY_FAILED', delivery_result = p_delivery_result, updated_at = now()
    where id = attempt.id returning * into attempt;
    next_event := 'DELIVERY_FAILED';
  elsif p_outcome = 'VERIFICATION_ACCEPTED' then
    if attempt.status not in ('DELIVERY_ACCEPTED', 'VERIFIED') then
      raise exception 'Invalid auth email recovery transition.' using errcode = '22023';
    end if;
    update public.auth_email_recovery_attempts
    set status = 'VERIFIED', verification_result = 'ACCEPTED',
        verified_at = coalesce(verified_at, now()), updated_at = now()
    where id = attempt.id returning * into attempt;
    next_event := 'VERIFICATION_ACCEPTED';
  else
    raise exception 'Invalid auth email recovery outcome.' using errcode = '22023';
  end if;

  insert into public.auth_email_recovery_audit_events(
    auth_user_id, actor_user_id, masked_email, email_domain, purpose,
    correlation_id, event_type, generated_at, delivery_result, verification_result
  ) values (
    attempt.auth_user_id, attempt.actor_user_id, attempt.masked_email, attempt.email_domain,
    attempt.purpose, attempt.correlation_id, next_event, attempt.generated_at,
    attempt.delivery_result, attempt.verification_result
  ) on conflict(correlation_id, event_type) do nothing;

  return jsonb_build_object(
    'attemptId', attempt.id,
    'status', attempt.status,
    'deliveryResult', attempt.delivery_result,
    'verificationResult', attempt.verification_result
  );
end;
$$;

revoke all on function public.reserve_auth_email_recovery_attempt(uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_auth_email_recovery_attempt(uuid, uuid, text, text, uuid, text)
  to service_role;
revoke all on function public.record_auth_email_recovery_outcome(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_auth_email_recovery_outcome(uuid, uuid, text, text)
  to service_role;

comment on table public.auth_email_recovery_attempts is
  'Service-only, token-free state for explicitly authorized Supabase Auth email recovery attempts.';
comment on table public.auth_email_recovery_audit_events is
  'Append-only redacted evidence for governed Auth email recovery. Raw links and tokens are forbidden.';
comment on function public.reserve_auth_email_recovery_attempt(uuid, uuid, text, text, uuid, text) is
  'Atomically reserves one bounded recovery attempt, with 15-minute spacing and at most three attempts per identity per day.';
