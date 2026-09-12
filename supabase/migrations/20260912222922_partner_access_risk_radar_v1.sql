-- Partner Access Risk Radar V1.
-- NORMAL mode stores aggregate counters and irreversible bit masks only.
-- ENHANCED mode adds bounded pseudonymous detail for at most 30 days.

insert into public.permissions(code, description)
values ('admin.security.manage', 'Activate and stop bounded enhanced partner access monitoring.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'admin.security.manage'
where role.code = 'novotech_admin'
on conflict do nothing;

create table public.access_risk_monitoring_profiles (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  mode text not null default 'NORMAL' check (mode in ('NORMAL', 'ENHANCED')),
  activated_at timestamptz null,
  activated_by uuid null references public.user_profiles(id) on delete set null,
  expires_at timestamptz null,
  reason text null check (reason is null or char_length(reason) between 3 and 500),
  updated_at timestamptz not null default now(),
  check (
    (mode = 'NORMAL' and expires_at is null)
    or (mode = 'ENHANCED' and activated_at is not null and expires_at is not null
      and expires_at > activated_at and expires_at <= activated_at + interval '30 days')
  )
);

create table public.access_risk_monitoring_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  event_type text not null check (event_type in ('ENHANCED_ACTIVATED', 'ENHANCED_STOPPED', 'ENHANCED_EXPIRED')),
  previous_mode text not null check (previous_mode in ('NORMAL', 'ENHANCED')),
  next_mode text not null check (next_mode in ('NORMAL', 'ENHANCED')),
  reason text null check (reason is null or char_length(reason) between 3 and 500),
  enhanced_until timestamptz null,
  occurred_at timestamptz not null default now()
);

create index access_risk_monitoring_events_company_time_idx
  on public.access_risk_monitoring_events(company_id, occurred_at desc);

create table public.access_risk_ingestion_receipts (
  batch_id uuid primary key,
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create index access_risk_ingestion_receipts_expiry_idx
  on public.access_risk_ingestion_receipts(expires_at);

create table public.access_risk_hourly_aggregates (
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  hour_bucket timestamptz not null,
  canonical_event_count integer not null default 0 check (canonical_event_count >= 0),
  client_signal_count integer not null default 0 check (client_signal_count >= 0),
  browse_event_count integer not null default 0 check (browse_event_count >= 0),
  product_view_count integer not null default 0 check (product_view_count >= 0),
  search_count integer not null default 0 check (search_count >= 0),
  cart_intent_count integer not null default 0 check (cart_intent_count >= 0),
  estimate_intent_count integer not null default 0 check (estimate_intent_count >= 0),
  order_intent_count integer not null default 0 check (order_intent_count >= 0),
  session_mask bit(256) not null default B'0'::bit(256),
  device_mask bit(256) not null default B'0'::bit(256),
  network_mask bit(256) not null default B'0'::bit(256),
  product_mask bit(256) not null default B'0'::bit(256),
  category_mask bit(256) not null default B'0'::bit(256),
  first_activity_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(company_id, user_id, hour_bucket),
  check (hour_bucket = date_trunc('hour', hour_bucket))
);

create index access_risk_hourly_company_time_idx
  on public.access_risk_hourly_aggregates(company_id, hour_bucket desc);
create index access_risk_hourly_user_time_idx
  on public.access_risk_hourly_aggregates(user_id, hour_bucket desc);

create table public.access_risk_enhanced_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  batch_offset smallint not null check (batch_offset between 0 and 19),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  occurred_at timestamptz not null,
  event_name text not null check (char_length(event_name) between 3 and 80),
  route_family text not null check (char_length(route_family) between 1 and 80),
  session_hash text not null check (session_hash ~ '^v[0-9]+:[0-9a-f]{64}$'),
  device_hash text not null check (device_hash ~ '^v[0-9]+:[0-9a-f]{64}$'),
  network_hash text null check (network_hash is null or network_hash ~ '^v[0-9]+:[0-9a-f]{64}$'),
  country_code text null check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  region_code text null check (region_code is null or char_length(region_code) between 1 and 20),
  product_id uuid null references public.catalog_products(id) on delete set null,
  category_id uuid null references public.catalog_categories(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(batch_id, batch_offset),
  check (expires_at > occurred_at and expires_at <= occurred_at + interval '30 days')
);

create index access_risk_enhanced_company_time_idx
  on public.access_risk_enhanced_events(company_id, occurred_at desc);
create index access_risk_enhanced_expiry_idx
  on public.access_risk_enhanced_events(expires_at);

create table public.access_risk_user_snapshots (
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  risk_state text not null default 'LEARNING' check (risk_state in ('LEARNING', 'LOW', 'ELEVATED', 'HIGH')),
  risk_score integer not null default 0 check (risk_score between 0 and 20),
  reason_codes text[] not null default '{}',
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  observed_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(observed_metrics) = 'object'),
  baseline_days integer not null default 0 check (baseline_days between 0 and 365),
  evaluated_at timestamptz not null default now(),
  primary key(company_id, user_id)
);

create index access_risk_user_snapshots_state_idx
  on public.access_risk_user_snapshots(risk_state, evaluated_at desc);

create table public.access_risk_company_snapshots (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  risk_state text not null default 'LEARNING' check (risk_state in ('LEARNING', 'LOW', 'ELEVATED', 'HIGH')),
  risk_score integer not null default 0 check (risk_score between 0 and 20),
  affected_user_count integer not null default 0 check (affected_user_count >= 0),
  active_user_count integer not null default 0 check (active_user_count >= 0),
  reason_codes text[] not null default '{}',
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  last_activity_at timestamptz null,
  evaluated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index access_risk_company_snapshots_state_idx
  on public.access_risk_company_snapshots(risk_state, risk_score desc, evaluated_at desc);

create table public.access_risk_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  status text not null check (status in ('COMPLETED', 'FAILED')),
  companies_evaluated integer not null default 0 check (companies_evaluated >= 0),
  users_evaluated integer not null default 0 check (users_evaluated >= 0),
  enhanced_profiles_expired integer not null default 0 check (enhanced_profiles_expired >= 0),
  enhanced_events_deleted integer not null default 0 check (enhanced_events_deleted >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  safe_error_code text null
);

create index access_risk_evaluation_runs_completed_idx
  on public.access_risk_evaluation_runs(completed_at desc);

alter table public.access_risk_monitoring_profiles enable row level security;
alter table public.access_risk_monitoring_profiles force row level security;
alter table public.access_risk_monitoring_events enable row level security;
alter table public.access_risk_monitoring_events force row level security;
alter table public.access_risk_ingestion_receipts enable row level security;
alter table public.access_risk_ingestion_receipts force row level security;
alter table public.access_risk_hourly_aggregates enable row level security;
alter table public.access_risk_hourly_aggregates force row level security;
alter table public.access_risk_enhanced_events enable row level security;
alter table public.access_risk_enhanced_events force row level security;
alter table public.access_risk_user_snapshots enable row level security;
alter table public.access_risk_user_snapshots force row level security;
alter table public.access_risk_company_snapshots enable row level security;
alter table public.access_risk_company_snapshots force row level security;
alter table public.access_risk_evaluation_runs enable row level security;
alter table public.access_risk_evaluation_runs force row level security;

revoke all on table public.access_risk_monitoring_profiles from public, anon, authenticated;
revoke all on table public.access_risk_monitoring_events from public, anon, authenticated;
revoke all on table public.access_risk_ingestion_receipts from public, anon, authenticated;
revoke all on table public.access_risk_hourly_aggregates from public, anon, authenticated;
revoke all on table public.access_risk_enhanced_events from public, anon, authenticated;
revoke all on table public.access_risk_user_snapshots from public, anon, authenticated;
revoke all on table public.access_risk_company_snapshots from public, anon, authenticated;
revoke all on table public.access_risk_evaluation_runs from public, anon, authenticated;

create or replace function public.access_risk_mask_for_bucket(p_bucket integer)
returns bit(256)
language sql
immutable
strict
set search_path = public
as $$
  select set_bit(B'0'::bit(256), p_bucket, 1)
  where p_bucket between 0 and 255;
$$;

create or replace function public.access_risk_merge_masks(p_masks bit(256)[])
returns bit(256)
language plpgsql
immutable
set search_path = public
as $$
declare
  result bit(256) := B'0'::bit(256);
  item bit(256);
begin
  foreach item in array coalesce(p_masks, array[]::bit(256)[]) loop
    result := result | item;
  end loop;
  return result;
end;
$$;

create or replace function public.access_risk_mask_from_buckets(p_buckets integer[])
returns bit(256)
language plpgsql
immutable
set search_path = public
as $$
declare
  result bit(256) := B'0'::bit(256);
  bucket integer;
begin
  foreach bucket in array coalesce(p_buckets, array[]::integer[]) loop
    if bucket between 0 and 255 then
      result := set_bit(result, bucket, 1);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.access_risk_mask_count(p_mask bit(256))
returns integer
language sql
immutable
strict
set search_path = public
as $$
  select char_length(replace(p_mask::text, '0', ''));
$$;

create or replace function public.record_partner_access_risk_batch(
  p_batch_id uuid,
  p_company_id uuid,
  p_user_id uuid,
  p_session_buckets integer[],
  p_device_buckets integer[],
  p_network_buckets integer[],
  p_session_hash text,
  p_device_hash text,
  p_network_hash text,
  p_country_code text,
  p_region_code text,
  p_product_buckets integer[],
  p_category_buckets integer[],
  p_events jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  event_count integer;
  monitoring_until timestamptz;
  receipt_inserted integer;
  event_row jsonb;
  event_index integer := 0;
  event_time timestamptz;
  safe_name text;
  safe_route text;
  safe_product uuid;
  safe_category uuid;
begin
  if current_user not in ('postgres', 'service_role')
    or p_batch_id is null or p_company_id is null or p_user_id is null
    or not exists (
      select 1 from public.company_memberships membership
      join public.partner_companies company on company.id = membership.company_id
      join public.user_profiles profile on profile.id = membership.user_id
      where membership.company_id = p_company_id and membership.user_id = p_user_id
        and membership.status = 'active' and company.status = 'active' and profile.status = 'active'
    )
    or cardinality(coalesce(p_session_buckets, '{}')) not between 1 and 2
    or cardinality(coalesce(p_device_buckets, '{}')) not between 1 and 2
    or cardinality(coalesce(p_network_buckets, '{}')) > 2
    or exists(select 1 from unnest(coalesce(p_session_buckets, '{}')) bucket where bucket not between 0 and 255)
    or exists(select 1 from unnest(coalesce(p_device_buckets, '{}')) bucket where bucket not between 0 and 255)
    or exists(select 1 from unnest(coalesce(p_network_buckets, '{}')) bucket where bucket not between 0 and 255)
    or p_session_hash !~ '^v[0-9]+:[0-9a-f]{64}$'
    or p_device_hash !~ '^v[0-9]+:[0-9a-f]{64}$'
    or (p_network_hash is not null and p_network_hash !~ '^v[0-9]+:[0-9a-f]{64}$')
    or (p_country_code is not null and p_country_code !~ '^[A-Z]{2}$')
    or (p_region_code is not null and char_length(p_region_code) not between 1 and 20)
    or jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) not between 1 and 20
    or cardinality(coalesce(p_product_buckets, '{}')) > 20
    or cardinality(coalesce(p_category_buckets, '{}')) > 20
  then
    raise exception 'Invalid access risk telemetry batch.' using errcode = '22023';
  end if;

  insert into public.access_risk_ingestion_receipts(batch_id, company_id, user_id)
  values (p_batch_id, p_company_id, p_user_id)
  on conflict do nothing;
  get diagnostics receipt_inserted = row_count;
  if receipt_inserted = 0 then
    return jsonb_build_object('accepted', true, 'duplicate', true, 'enhanced', false);
  end if;

  event_count := jsonb_array_length(p_events);
  insert into public.access_risk_hourly_aggregates(
    company_id, user_id, hour_bucket, client_signal_count,
    session_mask, device_mask, network_mask, product_mask, category_mask,
    first_activity_at, last_activity_at
  ) values (
    p_company_id, p_user_id, date_trunc('hour', now()), event_count,
    public.access_risk_mask_from_buckets(p_session_buckets),
    public.access_risk_mask_from_buckets(p_device_buckets),
    public.access_risk_mask_from_buckets(p_network_buckets),
    public.access_risk_mask_from_buckets(p_product_buckets),
    public.access_risk_mask_from_buckets(p_category_buckets), now(), now()
  )
  on conflict(company_id, user_id, hour_bucket) do update set
    client_signal_count = access_risk_hourly_aggregates.client_signal_count + excluded.client_signal_count,
    session_mask = access_risk_hourly_aggregates.session_mask | excluded.session_mask,
    device_mask = access_risk_hourly_aggregates.device_mask | excluded.device_mask,
    network_mask = access_risk_hourly_aggregates.network_mask | excluded.network_mask,
    product_mask = access_risk_hourly_aggregates.product_mask | excluded.product_mask,
    category_mask = access_risk_hourly_aggregates.category_mask | excluded.category_mask,
    first_activity_at = least(access_risk_hourly_aggregates.first_activity_at, excluded.first_activity_at),
    last_activity_at = greatest(access_risk_hourly_aggregates.last_activity_at, excluded.last_activity_at),
    updated_at = now();

  select profile.expires_at into monitoring_until
  from public.access_risk_monitoring_profiles profile
  where profile.company_id = p_company_id
    and profile.mode = 'ENHANCED' and profile.expires_at > now();

  if monitoring_until is not null then
    for event_row in select value from jsonb_array_elements(p_events) loop
      safe_name := left(coalesce(event_row->>'eventName', ''), 80);
      safe_route := left(coalesce(event_row->>'routeFamily', ''), 80);
      if safe_name !~ '^[a-z][a-z0-9_]{2,79}$'
        or safe_route !~ '^/cabinet(/[a-z0-9_-]+){0,4}$'
      then
        raise exception 'Invalid enhanced access risk event.' using errcode = '22023';
      end if;
      event_time := greatest(now() - interval '5 minutes', least(now(), coalesce((event_row->>'occurredAt')::timestamptz, now())));
      safe_product := case when coalesce(event_row->>'productId', '') ~* '^[0-9a-f-]{36}$' then (event_row->>'productId')::uuid else null end;
      safe_category := case when coalesce(event_row->>'categoryId', '') ~* '^[0-9a-f-]{36}$' then (event_row->>'categoryId')::uuid else null end;
      if safe_product is not null and not exists (select 1 from public.catalog_products where id = safe_product) then safe_product := null; end if;
      if safe_category is not null and not exists (select 1 from public.catalog_categories where id = safe_category) then safe_category := null; end if;

      insert into public.access_risk_enhanced_events(
        batch_id, batch_offset, company_id, user_id, occurred_at, event_name, route_family,
        session_hash, device_hash, network_hash, country_code, region_code,
        product_id, category_id, expires_at
      ) values (
        p_batch_id, event_index, p_company_id, p_user_id, event_time, safe_name, safe_route,
        p_session_hash, p_device_hash, p_network_hash, p_country_code, p_region_code,
        safe_product, safe_category, least(monitoring_until, event_time + interval '30 days')
      );
      event_index := event_index + 1;
    end loop;
  end if;

  return jsonb_build_object('accepted', true, 'duplicate', false, 'enhanced', monitoring_until is not null);
end;
$$;

create or replace function public.set_admin_access_risk_monitoring(
  p_company_id uuid,
  p_mode text,
  p_duration_days integer default 14,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  previous_mode text := 'NORMAL';
  next_expires_at timestamptz;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.security.manage')
    or p_mode not in ('NORMAL', 'ENHANCED')
    or (p_mode = 'ENHANCED' and p_duration_days not in (7, 14, 30))
    or (p_reason is not null and char_length(btrim(p_reason)) not between 3 and 500)
    or not exists (select 1 from public.partner_companies where id = p_company_id)
  then
    raise exception 'Access risk monitoring management denied.' using errcode = '42501';
  end if;

  select case when profile.mode = 'ENHANCED' and profile.expires_at > now() then 'ENHANCED' else 'NORMAL' end
  into previous_mode
  from public.access_risk_monitoring_profiles profile where profile.company_id = p_company_id;
  previous_mode := coalesce(previous_mode, 'NORMAL');
  next_expires_at := case when p_mode = 'ENHANCED' then now() + make_interval(days => p_duration_days) else null end;

  insert into public.access_risk_monitoring_profiles(
    company_id, mode, activated_at, activated_by, expires_at, reason, updated_at
  ) values (
    p_company_id, p_mode, case when p_mode = 'ENHANCED' then now() else null end,
    case when p_mode = 'ENHANCED' then auth.uid() else null end,
    next_expires_at, nullif(btrim(p_reason), ''), now()
  )
  on conflict(company_id) do update set
    mode = excluded.mode, activated_at = excluded.activated_at,
    activated_by = excluded.activated_by, expires_at = excluded.expires_at,
    reason = excluded.reason, updated_at = now();

  insert into public.access_risk_monitoring_events(
    company_id, actor_user_id, event_type, previous_mode, next_mode, reason, enhanced_until
  ) values (
    p_company_id, auth.uid(),
    case when p_mode = 'ENHANCED' then 'ENHANCED_ACTIVATED' else 'ENHANCED_STOPPED' end,
    previous_mode, p_mode, nullif(btrim(p_reason), ''), next_expires_at
  );

  return jsonb_build_object('companyId', p_company_id, 'mode', p_mode, 'expiresAt', next_expires_at);
end;
$$;

create or replace function public.evaluate_partner_access_risk(p_company_limit integer default 1000)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  run_started timestamptz := clock_timestamp();
  expired_count integer := 0;
  deleted_count integer := 0;
  company_count integer := 0;
  user_count integer := 0;
  canonical_since timestamptz;
begin
  if current_user not in ('postgres', 'service_role') or p_company_limit not between 1 and 1000 then
    raise exception 'Access risk evaluation denied.' using errcode = '42501';
  end if;

  with expired as (
    update public.access_risk_monitoring_profiles profile
    set mode = 'NORMAL', activated_at = null, activated_by = null, expires_at = null,
      reason = null, updated_at = now()
    where profile.mode = 'ENHANCED' and profile.expires_at <= now()
    returning profile.company_id
  ), audited as (
    insert into public.access_risk_monitoring_events(
      company_id, actor_user_id, event_type, previous_mode, next_mode, reason
    ) select company_id, null, 'ENHANCED_EXPIRED', 'ENHANCED', 'NORMAL', 'Automatic expiry'
      from expired returning 1
  ) select count(*) into expired_count from audited;

  delete from public.access_risk_enhanced_events where expires_at <= now();
  get diagnostics deleted_count = row_count;
  delete from public.access_risk_ingestion_receipts where expires_at <= now();
  delete from public.access_risk_hourly_aggregates where hour_bucket < now() - interval '32 days';
  delete from public.access_risk_evaluation_runs where completed_at < now() - interval '90 days';
  delete from public.access_risk_monitoring_events where occurred_at < now() - interval '13 months';
  canonical_since := case
    when exists(select 1 from public.access_risk_evaluation_runs where status = 'COMPLETED')
      then now() - interval '3 hours'
    else now() - interval '32 days'
  end;

  -- Canonical behavior records own browse and commercial counters. The Risk Radar
  -- only projects them into hourly aggregates and never creates a second NORMAL raw stream.
  insert into public.access_risk_hourly_aggregates(
    company_id, user_id, hour_bucket, canonical_event_count, browse_event_count,
    product_view_count, search_count, cart_intent_count, estimate_intent_count,
    order_intent_count, session_mask, product_mask, category_mask,
    first_activity_at, last_activity_at
  )
  select event.company_id, event.user_id, date_trunc('hour', event.occurred_at), count(*)::integer,
    count(*) filter (where event.event_name in ('catalog_viewed','category_viewed','search_performed','search_no_results','filters_applied','product_viewed','merchandising_product_clicked'))::integer,
    count(*) filter (where event.event_name in ('product_viewed','merchandising_product_clicked'))::integer,
    count(*) filter (where event.event_name in ('search_performed','search_no_results'))::integer,
    count(*) filter (where event.event_name in ('product_added_to_cart','reorder_started','reorder_submitted'))::integer,
    count(*) filter (where event.event_name in ('product_added_to_estimate','estimate_created','proposal_generated','proposal_created','proposal_version_created'))::integer,
    count(*) filter (where event.event_name in ('order_submitted','proposal_converted_to_order','reorder_submitted'))::integer,
    public.access_risk_merge_masks(array_agg(distinct public.access_risk_mask_for_bucket(get_byte(extensions.digest('aggregate:session:'||event.session_id::text, 'sha256'), 31)))),
    public.access_risk_merge_masks(array_agg(distinct public.access_risk_mask_for_bucket(get_byte(extensions.digest('aggregate:product:'||event.product_id::text, 'sha256'), 31))) filter (where event.product_id is not null)),
    public.access_risk_merge_masks(array_agg(distinct public.access_risk_mask_for_bucket(get_byte(extensions.digest('aggregate:category:'||event.category_id::text, 'sha256'), 31))) filter (where event.category_id is not null)),
    min(event.occurred_at), max(event.occurred_at)
  from public.partner_behavior_events event
  where event.occurred_at >= canonical_since
  group by event.company_id, event.user_id, date_trunc('hour', event.occurred_at)
  on conflict(company_id, user_id, hour_bucket) do update set
    canonical_event_count = excluded.canonical_event_count,
    browse_event_count = excluded.browse_event_count,
    product_view_count = excluded.product_view_count,
    search_count = excluded.search_count,
    cart_intent_count = excluded.cart_intent_count,
    estimate_intent_count = excluded.estimate_intent_count,
    order_intent_count = excluded.order_intent_count,
    session_mask = access_risk_hourly_aggregates.session_mask | excluded.session_mask,
    product_mask = access_risk_hourly_aggregates.product_mask | excluded.product_mask,
    category_mask = access_risk_hourly_aggregates.category_mask | excluded.category_mask,
    first_activity_at = least(access_risk_hourly_aggregates.first_activity_at, excluded.first_activity_at),
    last_activity_at = greatest(access_risk_hourly_aggregates.last_activity_at, excluded.last_activity_at),
    updated_at = now();

  with eligible_companies as (
    select id from public.partner_companies where status = 'active' order by id limit p_company_limit
  ), eligible_members as (
    select membership.company_id, membership.user_id
    from public.company_memberships membership
    join eligible_companies company on company.id = membership.company_id
    join public.user_profiles profile on profile.id = membership.user_id and profile.status = 'active'
    where membership.status = 'active'
  ), current_stats as (
    select member.company_id, member.user_id,
      coalesce(sum(a.browse_event_count),0)::integer browse_events,
      coalesce(sum(a.product_view_count),0)::integer product_views,
      coalesce(sum(a.cart_intent_count+a.estimate_intent_count+a.order_intent_count),0)::integer commercial_intents,
      public.access_risk_merge_masks(array_agg(a.session_mask) filter(where a.hour_bucket is not null)) session_mask,
      public.access_risk_merge_masks(array_agg(a.device_mask) filter(where a.hour_bucket is not null)) device_mask,
      public.access_risk_merge_masks(array_agg(a.network_mask) filter(where a.hour_bucket is not null)) network_mask,
      public.access_risk_merge_masks(array_agg(a.product_mask) filter(where a.hour_bucket is not null)) product_mask,
      public.access_risk_merge_masks(array_agg(a.category_mask) filter(where a.hour_bucket is not null)) category_mask,
      coalesce(max(public.access_risk_mask_count(a.session_mask)),0)::integer peak_session_count
    from eligible_members member
    left join public.access_risk_hourly_aggregates a
      on a.company_id=member.company_id and a.user_id=member.user_id
      and a.hour_bucket>=now()-interval '24 hours'
    group by member.company_id,member.user_id
  ), baseline_stats as (
    select member.company_id, member.user_id,
      count(distinct date_trunc('day',a.hour_bucket))::integer active_days,
      coalesce(avg(a.browse_event_count),0)::numeric avg_hourly_browse,
      public.access_risk_merge_masks(array_agg(a.device_mask) filter(where a.hour_bucket is not null)) known_device_mask
    from eligible_members member
    left join public.access_risk_hourly_aggregates a
      on a.company_id=member.company_id and a.user_id=member.user_id
      and a.hour_bucket>=now()-interval '31 days' and a.hour_bucket<now()-interval '24 hours'
    group by member.company_id,member.user_id
  ), metrics as (
    select current.*,
      baseline.active_days,baseline.avg_hourly_browse,
      public.access_risk_mask_count(current.session_mask) session_count,
      public.access_risk_mask_count(current.device_mask) device_count,
      public.access_risk_mask_count(current.network_mask) network_count,
      public.access_risk_mask_count(current.product_mask) product_count,
      public.access_risk_mask_count(current.category_mask) category_count,
      public.access_risk_mask_count(current.device_mask & ~baseline.known_device_mask) new_device_count
    from current_stats current join baseline_stats baseline using(company_id,user_id)
  ), flags as (
    select metrics.*,
      new_device_count>=3 has_new_device,
      peak_session_count>=5 has_concurrent,
      network_count>=4 has_network_churn,
      (browse_events>=150 or browse_events>=greatest(80,ceil(avg_hourly_browse*24*3))) has_velocity,
      greatest(80,ceil(avg_hourly_browse*24*3))::integer velocity_threshold
    from metrics
  ), scored as (
    select flags.*,
      ((case when has_new_device then 2 else 0 end)
       +(case when has_concurrent then 4 else 0 end)
       +(case when has_network_churn then 3 else 0 end)
       +(case when has_velocity then 2 else 0 end)
       +(case when browse_events>=100 then 2 else 0 end)
       +(case when product_count>=30 then 2 else 0 end)
       +(case when category_count>=15 then 1 else 0 end)
       +(case when product_views>=30 and commercial_intents=0 then 1 else 0 end))::integer score
    from flags
  ), classified as (
    select scored.*,
      case when score>=7 and has_concurrent and (has_new_device or has_network_churn or has_velocity) then 'HIGH'
        when score>=4 then 'ELEVATED' when active_days<7 then 'LEARNING' else 'LOW' end risk_state,
      array[]::text[]
        ||case when has_new_device then array['NEW_DEVICE_SURGE'] else array[]::text[] end
        ||case when has_concurrent then array['CONCURRENT_SESSION_ANOMALY'] else array[]::text[] end
        ||case when has_network_churn then array['NETWORK_CHURN'] else array[]::text[] end
        ||case when has_velocity then array['HIGH_VELOCITY_BROWSING'] else array[]::text[] end
        ||case when browse_events>=100 then array['BROWSE_VOLUME_ANOMALY'] else array[]::text[] end
        ||case when product_count>=30 then array['UNIQUE_SKU_SURGE'] else array[]::text[] end
        ||case when category_count>=15 then array['CATEGORY_BREADTH_ANOMALY'] else array[]::text[] end
        ||case when product_views>=30 and commercial_intents=0 then array['COMMERCIAL_DEAD_END'] else array[]::text[] end reason_codes,
      '[]'::jsonb
        ||case when has_new_device then jsonb_build_array(jsonb_build_object('code','NEW_DEVICE_SURGE','observed',new_device_count,'threshold',3)) else '[]'::jsonb end
        ||case when has_concurrent then jsonb_build_array(jsonb_build_object('code','CONCURRENT_SESSION_ANOMALY','observed',peak_session_count,'threshold',5)) else '[]'::jsonb end
        ||case when has_network_churn then jsonb_build_array(jsonb_build_object('code','NETWORK_CHURN','observed',network_count,'threshold',4)) else '[]'::jsonb end
        ||case when has_velocity then jsonb_build_array(jsonb_build_object('code','HIGH_VELOCITY_BROWSING','observed',browse_events,'threshold',velocity_threshold)) else '[]'::jsonb end
        ||case when browse_events>=100 then jsonb_build_array(jsonb_build_object('code','BROWSE_VOLUME_ANOMALY','observed',browse_events,'threshold',100)) else '[]'::jsonb end
        ||case when product_count>=30 then jsonb_build_array(jsonb_build_object('code','UNIQUE_SKU_SURGE','observed',product_count,'threshold',30)) else '[]'::jsonb end
        ||case when category_count>=15 then jsonb_build_array(jsonb_build_object('code','CATEGORY_BREADTH_ANOMALY','observed',category_count,'threshold',15)) else '[]'::jsonb end
        ||case when product_views>=30 and commercial_intents=0 then jsonb_build_array(jsonb_build_object('code','COMMERCIAL_DEAD_END','observed',product_views,'threshold',30)) else '[]'::jsonb end reasons
    from scored
  )
  insert into public.access_risk_user_snapshots(
    company_id,user_id,risk_state,risk_score,reason_codes,reasons,observed_metrics,baseline_days,evaluated_at
  )
  select company_id,user_id,risk_state,least(score,20),reason_codes,reasons,
    jsonb_build_object(
      'browseEvents24h',browse_events,'productViews24h',product_views,
      'commercialIntents24h',commercial_intents,'sessions24h',session_count,
      'devices24h',device_count,'peakSessionsHour',peak_session_count,
      'networks24h',network_count,'uniqueSkus24h',product_count,
      'categories24h',category_count,'newDevices24h',new_device_count
    ),active_days,now()
  from classified
  on conflict(company_id,user_id) do update set
    risk_state=excluded.risk_state,risk_score=excluded.risk_score,
    reason_codes=excluded.reason_codes,reasons=excluded.reasons,
    observed_metrics=excluded.observed_metrics,baseline_days=excluded.baseline_days,
    evaluated_at=excluded.evaluated_at;
  get diagnostics user_count = row_count;

  insert into public.access_risk_company_snapshots(
    company_id, risk_state, risk_score, affected_user_count, active_user_count,
    reason_codes, reasons, last_activity_at, evaluated_at, updated_at
  )
  select company.id,
    coalesce((array_agg(snapshot.risk_state order by
      case snapshot.risk_state when 'HIGH' then 4 when 'ELEVATED' then 3 when 'LOW' then 2 else 1 end desc))[1], 'LEARNING'),
    coalesce(max(snapshot.risk_score), 0),
    count(distinct snapshot.user_id) filter (where snapshot.risk_state in ('ELEVATED','HIGH'))::integer,
    count(distinct snapshot.user_id)::integer,
    coalesce(array_agg(distinct reason_code) filter (where reason_code is not null), '{}'),
    coalesce(jsonb_agg(distinct reason) filter (where reason is not null), '[]'::jsonb),
    (select max(aggregate.last_activity_at) from public.access_risk_hourly_aggregates aggregate where aggregate.company_id = company.id),
    now(), now()
  from public.partner_companies company
  left join public.access_risk_user_snapshots snapshot on snapshot.company_id = company.id
  left join lateral unnest(snapshot.reason_codes) reason_code on true
  left join lateral jsonb_array_elements(snapshot.reasons) reason on true
  where company.status = 'active'
    and company.id in (select id from public.partner_companies where status = 'active' order by id limit p_company_limit)
  group by company.id
  on conflict(company_id) do update set
    risk_state = excluded.risk_state, risk_score = excluded.risk_score,
    affected_user_count = excluded.affected_user_count, active_user_count = excluded.active_user_count,
    reason_codes = excluded.reason_codes, reasons = excluded.reasons,
    last_activity_at = excluded.last_activity_at, evaluated_at = excluded.evaluated_at,
    updated_at = excluded.updated_at;
  get diagnostics company_count = row_count;

  insert into public.access_risk_evaluation_runs(
    started_at, completed_at, status, companies_evaluated, users_evaluated,
    enhanced_profiles_expired, enhanced_events_deleted, duration_ms
  ) values (
    run_started, clock_timestamp(), 'COMPLETED', company_count, user_count,
    expired_count, deleted_count,
    greatest(0, extract(milliseconds from clock_timestamp() - run_started)::integer)
  );

  return jsonb_build_object(
    'status','COMPLETED','companiesEvaluated',company_count,'usersEvaluated',user_count,
    'enhancedProfilesExpired',expired_count,'enhancedEventsDeleted',deleted_count,
    'durationMs',greatest(0,extract(milliseconds from clock_timestamp()-run_started)::integer)
  );
exception when others then
  insert into public.access_risk_evaluation_runs(
    started_at, completed_at, status, duration_ms, safe_error_code
  ) values (
    run_started, clock_timestamp(), 'FAILED',
    greatest(0, extract(milliseconds from clock_timestamp() - run_started)::integer), sqlstate
  );
  return jsonb_build_object(
    'status','FAILED','safeErrorCode',sqlstate,
    'durationMs',greatest(0,extract(milliseconds from clock_timestamp()-run_started)::integer)
  );
end;
$$;

create or replace function public.get_admin_access_risk_overview(
  p_query text default null,
  p_risk_state text default null,
  p_mode text default null,
  p_sort text default 'risk_desc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.security.view')
    or (p_risk_state is not null and p_risk_state not in ('LEARNING','LOW','ELEVATED','HIGH'))
    or (p_mode is not null and p_mode not in ('NORMAL','ENHANCED'))
    or p_sort not in ('risk_desc','activity_desc','company_asc')
    or p_page not between 1 and 10000 or p_page_size not between 1 and 100
  then raise exception 'Access risk overview denied.' using errcode='42501'; end if;

  with rows as (
    select company.id, company.display_name,
      coalesce(snapshot.risk_state, 'LEARNING') risk_state,
      coalesce(snapshot.risk_score, 0) risk_score,
      coalesce(snapshot.affected_user_count, 0) affected_user_count,
      coalesce(snapshot.active_user_count, 0) active_user_count,
      coalesce(snapshot.reason_codes, '{}') reason_codes,
      snapshot.last_activity_at, snapshot.evaluated_at,
      case when profile.mode='ENHANCED' and profile.expires_at>now() then 'ENHANCED' else 'NORMAL' end mode,
      case when profile.mode='ENHANCED' and profile.expires_at>now() then profile.expires_at else null end enhanced_until
    from public.partner_companies company
    left join public.access_risk_company_snapshots snapshot on snapshot.company_id=company.id
    left join public.access_risk_monitoring_profiles profile on profile.company_id=company.id
    where company.status='active'
      and (p_query is null or btrim(p_query)='' or company.display_name ilike '%'||left(btrim(p_query),100)||'%')
  ), filtered as (
    select * from rows where (p_risk_state is null or risk_state=p_risk_state) and (p_mode is null or mode=p_mode)
  ), paged as (
    select * from filtered order by
      case when p_sort='risk_desc' then case risk_state when 'HIGH' then 4 when 'ELEVATED' then 3 when 'LOW' then 2 else 1 end end desc,
      case when p_sort='risk_desc' then risk_score end desc,
      case when p_sort='activity_desc' then last_activity_at end desc nulls last,
      case when p_sort='company_asc' then display_name end asc,
      display_name asc, id
    offset (p_page-1)*p_page_size limit p_page_size
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'high',count(*) filter(where risk_state='HIGH'),
      'elevated',count(*) filter(where risk_state='ELEVATED'),
      'learning',count(*) filter(where risk_state='LEARNING'),
      'enhanced',count(*) filter(where mode='ENHANCED'),
      'total',count(*)
    ),
    'items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
    'total',count(*),'page',p_page,'pageSize',p_page_size,
    'diagnostics',(select to_jsonb(run) || jsonb_build_object('is_stale', run.completed_at < now() - interval '2 hours') from public.access_risk_evaluation_runs run order by completed_at desc limit 1)
  ) into result from filtered;
  return result;
end;
$$;

create or replace function public.get_admin_access_risk_company(
  p_company_id uuid,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb; enhanced boolean;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.security.view')
    or p_limit not between 1 and 100
  then raise exception 'Access risk company detail denied.' using errcode='42501'; end if;
  enhanced := exists(select 1 from public.access_risk_monitoring_profiles where company_id=p_company_id and mode='ENHANCED' and expires_at>now());
  select jsonb_build_object(
    'company',jsonb_build_object('id',company.id,'name',company.display_name,'status',company.status),
    'snapshot',coalesce(to_jsonb(snapshot),'{}'::jsonb),
    'monitoring',jsonb_build_object(
      'mode',case when enhanced then 'ENHANCED' else 'NORMAL' end,
      'expiresAt',case when enhanced then profile.expires_at else null end,
      'reason',case when enhanced then profile.reason else null end
    ),
    'users',coalesce((select jsonb_agg(jsonb_build_object(
      'id',user_snapshot.user_id,'name',user_profile.full_name,'email',user_profile.email,
      'riskState',user_snapshot.risk_state,'riskScore',user_snapshot.risk_score,
      'reasonCodes',user_snapshot.reason_codes,'reasons',user_snapshot.reasons,
      'metrics',user_snapshot.observed_metrics,'baselineDays',user_snapshot.baseline_days,
      'evaluatedAt',user_snapshot.evaluated_at
    ) order by case user_snapshot.risk_state when 'HIGH' then 4 when 'ELEVATED' then 3 when 'LOW' then 2 else 1 end desc,user_snapshot.risk_score desc)
      from public.access_risk_user_snapshots user_snapshot
      join public.user_profiles user_profile on user_profile.id=user_snapshot.user_id
      where user_snapshot.company_id=p_company_id),'[]'::jsonb),
    'timeline',case when enhanced then coalesce((select jsonb_agg(to_jsonb(event) order by event.occurred_at desc)
      from (select id,occurred_at,event_name,route_family,user_id,session_hash,device_hash,network_hash,
        country_code,region_code,product_id,category_id
        from public.access_risk_enhanced_events
        where company_id=p_company_id and (p_before is null or occurred_at<p_before)
        order by occurred_at desc,id desc limit p_limit) event),'[]'::jsonb) else '[]'::jsonb end,
    'monitoringEvents',coalesce((select jsonb_agg(to_jsonb(event) order by event.occurred_at desc)
      from (select id,event_type,previous_mode,next_mode,reason,enhanced_until,occurred_at
        from public.access_risk_monitoring_events where company_id=p_company_id
        order by occurred_at desc limit 20) event),'[]'::jsonb),
    'hasMoreTimeline',case when enhanced then (select count(*)>p_limit from public.access_risk_enhanced_events where company_id=p_company_id and (p_before is null or occurred_at<p_before)) else false end
  ) into result
  from public.partner_companies company
  left join public.access_risk_company_snapshots snapshot on snapshot.company_id=company.id
  left join public.access_risk_monitoring_profiles profile on profile.company_id=company.id
  where company.id=p_company_id;
  if result is null then raise exception 'Access risk company not found.' using errcode='P0002'; end if;
  return result;
end;
$$;

revoke all on function public.access_risk_mask_for_bucket(integer) from public, anon, authenticated;
revoke all on function public.access_risk_merge_masks(bit(256)[]) from public, anon, authenticated;
revoke all on function public.access_risk_mask_from_buckets(integer[]) from public, anon, authenticated;
revoke all on function public.access_risk_mask_count(bit(256)) from public, anon, authenticated;
revoke all on function public.record_partner_access_risk_batch(uuid,uuid,uuid,integer[],integer[],integer[],text,text,text,text,text,integer[],integer[],jsonb) from public, anon, authenticated;
revoke all on function public.set_admin_access_risk_monitoring(uuid,text,integer,text) from public, anon;
revoke all on function public.evaluate_partner_access_risk(integer) from public, anon, authenticated;
revoke all on function public.get_admin_access_risk_overview(text,text,text,text,integer,integer) from public, anon;
revoke all on function public.get_admin_access_risk_company(uuid,timestamptz,integer) from public, anon;

grant execute on function public.record_partner_access_risk_batch(uuid,uuid,uuid,integer[],integer[],integer[],text,text,text,text,text,integer[],integer[],jsonb) to service_role;
grant execute on function public.evaluate_partner_access_risk(integer) to service_role;
grant execute on function public.set_admin_access_risk_monitoring(uuid,text,integer,text) to authenticated;
grant execute on function public.get_admin_access_risk_overview(text,text,text,text,integer,integer) to authenticated;
grant execute on function public.get_admin_access_risk_company(uuid,timestamptz,integer) to authenticated;

comment on table public.access_risk_hourly_aggregates is
  'Aggregate-only NORMAL telemetry. Bit masks support approximate cardinality and cannot be reversed to sessions, devices, products, categories, or networks.';
comment on table public.access_risk_enhanced_events is
  'Bounded ENHANCED telemetry. Pseudonymous device/network/session hashes expire in at most 30 days; raw IP addresses are prohibited.';
comment on function public.evaluate_partner_access_risk(integer) is
  'Hourly deterministic access risk projection. It never blocks or mutates partner access.';
