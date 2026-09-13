-- Final Customer Cabinet account boundary. Supabase Auth remains the sole
-- owner of OTP generation, verification and sessions; this migration stores
-- no OTP, phone plaintext, provider payload or delivery receipt.

create table public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  customer_identity_id uuid null unique references public.customer_identities(id) on delete restrict,
  status text not null default 'ACTIVE',
  identity_resolution_status text not null,
  display_name text null,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  constraint customer_accounts_status_check
    check (status in ('ACTIVE', 'IDENTITY_REVIEW_REQUIRED', 'SUSPENDED')),
  constraint customer_accounts_resolution_check
    check (identity_resolution_status in ('MATCHED', 'NEW', 'AMBIGUOUS', 'CONFLICT')),
  constraint customer_accounts_resolution_link_check check (
    (identity_resolution_status in ('MATCHED', 'NEW') and customer_identity_id is not null and status = 'ACTIVE')
    or
    (identity_resolution_status in ('AMBIGUOUS', 'CONFLICT') and customer_identity_id is null and status = 'IDENTITY_REVIEW_REQUIRED')
  ),
  constraint customer_accounts_display_name_check
    check (display_name is null or char_length(btrim(display_name)) between 2 and 160),
  constraint customer_accounts_email_check
    check (email is null or (char_length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
);

comment on table public.customer_accounts is
  'Final Customer access principal linking one Supabase auth user to the canonical Shared Customer Identity root. It owns only cabinet profile/access state.';
comment on column public.customer_accounts.customer_identity_id is
  'Null while deterministic identity resolution requires review; candidate identity IDs are never exposed to the customer.';

create table public.customer_account_events (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  event_type text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint customer_account_events_type_check check (event_type in (
    'CUSTOMER_ACCOUNT_CREATED', 'CUSTOMER_IDENTITY_LINKED',
    'IDENTITY_REVIEW_REQUIRED', 'PROFILE_UPDATED'
  )),
  constraint customer_account_events_metadata_check
    check (jsonb_typeof(safe_metadata) = 'object')
);

comment on table public.customer_account_events is
  'Low-volume Final Customer security/account lifecycle audit. Never contains phone plaintext, OTPs, SMS bodies or provider receipts.';

-- Privacy-preserving, bounded defense in depth in addition to Supabase Auth's
-- native per-IP/per-user limits and the relay limiter. The key is the existing
-- versioned customer-identity HMAC, never a raw or reversibly hashed phone.
create table public.customer_auth_sms_rate_buckets (
  phone_key_hash text not null check (phone_key_hash ~ '^[0-9a-f]{64}$'),
  window_minute timestamptz not null,
  request_count integer not null check (request_count between 1 and 100),
  expires_at timestamptz not null,
  primary key (phone_key_hash, window_minute),
  constraint customer_auth_sms_rate_window_check
    check (window_minute = date_trunc('minute', window_minute)),
  constraint customer_auth_sms_rate_expiry_check
    check (expires_at > window_minute)
);

create index customer_accounts_identity_idx
  on public.customer_accounts (customer_identity_id)
  where customer_identity_id is not null;
create index customer_accounts_status_idx
  on public.customer_accounts (status, updated_at desc, id);
create index customer_account_events_account_idx
  on public.customer_account_events (customer_account_id, created_at desc, id);
create index customer_auth_sms_rate_expiry_idx
  on public.customer_auth_sms_rate_buckets (expires_at);

create trigger touch_customer_accounts_updated_at
before update on public.customer_accounts
for each row execute function private.touch_customer_identity_updated_at();

create or replace function private.prevent_customer_account_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Customer account audit events are append-only.' using errcode = '42501';
end;
$$;

create trigger prevent_customer_account_event_mutation
before update or delete on public.customer_account_events
for each row execute function private.prevent_customer_account_event_mutation();

create or replace function public.reserve_customer_auth_sms_delivery(
  p_phone_key_hash text,
  p_limit integer default 5,
  p_window_minutes integer default 10
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_minute timestamptz := date_trunc('minute', now());
  recent_count integer;
begin
  if p_phone_key_hash !~ '^[0-9a-f]{64}$'
    or p_limit not between 1 and 20
    or p_window_minutes not between 1 and 60 then
    raise exception 'Invalid Final Customer Auth SMS rate-limit input.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone_key_hash, 7919));

  delete from public.customer_auth_sms_rate_buckets
  where phone_key_hash = p_phone_key_hash and expires_at <= now();

  select coalesce(sum(request_count), 0)::integer
  into recent_count
  from public.customer_auth_sms_rate_buckets
  where phone_key_hash = p_phone_key_hash
    and window_minute >= current_minute - make_interval(mins => p_window_minutes - 1);

  if recent_count >= p_limit then
    return false;
  end if;

  insert into public.customer_auth_sms_rate_buckets (
    phone_key_hash, window_minute, request_count, expires_at
  ) values (
    p_phone_key_hash, current_minute, 1, current_minute + interval '24 hours'
  )
  on conflict (phone_key_hash, window_minute) do update
  set request_count = public.customer_auth_sms_rate_buckets.request_count + 1,
      expires_at = excluded.expires_at;

  return true;
end;
$$;

alter table public.customer_accounts enable row level security;
alter table public.customer_accounts force row level security;
alter table public.customer_account_events enable row level security;
alter table public.customer_account_events force row level security;
alter table public.customer_auth_sms_rate_buckets enable row level security;
alter table public.customer_auth_sms_rate_buckets force row level security;

create policy customer_accounts_select_own
on public.customer_accounts
for select
to authenticated
using ((select auth.uid()) = auth_user_id);

revoke all on table public.customer_accounts from public, anon, authenticated, service_role;
revoke all on table public.customer_account_events from public, anon, authenticated, service_role;
revoke all on table public.customer_auth_sms_rate_buckets from public, anon, authenticated, service_role;

grant select on table public.customer_accounts to authenticated;
grant select, insert, update on table public.customer_accounts to service_role;
grant select, insert on table public.customer_account_events to service_role;
grant select, insert, update, delete on table public.customer_auth_sms_rate_buckets to service_role;

revoke all on function private.prevent_customer_account_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.reserve_customer_auth_sms_delivery(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.reserve_customer_auth_sms_delivery(text, integer, integer) to service_role;
