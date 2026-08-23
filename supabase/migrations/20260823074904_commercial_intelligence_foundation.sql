begin;

create table public.commercial_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  company_id uuid references public.partner_companies(id) on delete restrict,
  user_id uuid references public.user_profiles(id) on delete restrict,
  domain text not null check (domain ~ '^[a-z][a-z0-9_]{1,49}$'),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]{1,49}$'),
  entity_id uuid not null,
  product_id uuid references public.catalog_products(id) on delete restrict,
  external_source_id uuid references public.external_price_sources(id) on delete restrict,
  correlation_id uuid not null,
  source text not null check (source ~ '^[a-z][a-z0-9_]{1,49}$'),
  payload_jsonb jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint commercial_events_payload_check check (
    jsonb_typeof(payload_jsonb) = 'object'
    and pg_column_size(payload_jsonb) <= 4096
    and lower(payload_jsonb::text) !~ '(password|secret|authorization|access_token|refresh_token|support_text|service_text|customer_note)'
  ),
  unique(source, entity_type, entity_id, event_type)
);

create table public.partner_product_interactions (
  id uuid primary key default gen_random_uuid(),
  source_behavior_event_id uuid not null unique references public.partner_behavior_events(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  user_id uuid references public.user_profiles(id) on delete restrict,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  event_type text not null check (event_type in (
    'product_view','search_result_click','favorite_added','favorite_removed','cart_added','cart_removed',
    'estimate_added','estimate_sent','order_submitted','repeat_purchase','product_watch_enabled',
    'competitor_comparison_viewed'
  )),
  occurred_at timestamptz not null,
  quantity numeric(18,3) check (quantity is null or quantity > 0),
  price_context jsonb,
  source_surface text,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint partner_product_interactions_price_context_check check (
    price_context is null or (jsonb_typeof(price_context)='object' and pg_column_size(price_context)<=512)
  ),
  constraint partner_product_interactions_surface_check check (
    source_surface is null or char_length(source_surface) between 1 and 50
  )
);

create table public.competitive_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null unique references public.external_price_observations(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  external_price_source_id uuid not null references public.external_price_sources(id) on delete restrict,
  observation_date date not null,
  price_level text not null check (price_level in ('partner','retail')),
  competitor_price numeric(18,4) not null check (competitor_price >= 0),
  competitor_currency text not null check (competitor_currency ~ '^[A-Z]{3}$'),
  novotech_price numeric(18,4) check (novotech_price is null or novotech_price >= 0),
  novotech_currency text check (novotech_currency is null or novotech_currency ~ '^[A-Z]{3}$'),
  normalized_comparison_price numeric(18,4),
  price_gap_amount numeric(18,4),
  price_gap_pct numeric(12,4),
  comparison_direction text not null check (comparison_direction in ('competitor_cheaper','novotech_cheaper','parity','incomparable')),
  observation_age_days integer not null check (observation_age_days >= 0),
  confidence_score numeric(5,4) not null check (confidence_score between 0 and 1),
  confidence_level text not null check (confidence_level in ('low','medium','high')),
  independent_observation_count integer not null check (independent_observation_count > 0),
  contributing_company_count integer not null check (contributing_company_count > 0),
  calculated_at timestamptz not null default now()
);

create table public.competitor_market_price_daily (
  external_price_source_id uuid not null references public.external_price_sources(id) on delete restrict,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  observation_date date not null,
  price_level text not null check (price_level in ('partner','retail')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  min_price numeric(18,4) not null,
  max_price numeric(18,4) not null,
  median_price numeric(18,4) not null,
  observation_count integer not null check (observation_count > 0),
  distinct_company_count integer not null check (distinct_company_count > 0),
  dispersion_pct numeric(12,4) not null check (dispersion_pct >= 0),
  freshness_days integer not null check (freshness_days >= 0),
  confidence_level text not null check (confidence_level in ('low','medium','high')),
  calculated_at timestamptz not null default now(),
  primary key(external_price_source_id, product_id, observation_date, price_level, currency)
);

create table public.partner_product_price_pressure (
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  current_novotech_price numeric(18,4),
  novotech_currency text,
  best_known_competitor_price numeric(18,4),
  competitor_currency text,
  competitor_source_id uuid references public.external_price_sources(id) on delete restrict,
  gap_amount numeric(18,4),
  gap_pct numeric(12,4),
  competitor_cheaper boolean not null default false,
  observation_freshness_days integer,
  confidence_score numeric(5,4) not null default 0 check (confidence_score between 0 and 1),
  confidence_level text not null default 'low' check (confidence_level in ('low','medium','high')),
  independent_source_count integer not null default 0 check (independent_source_count >= 0),
  contributing_company_count integer not null default 0 check (contributing_company_count >= 0),
  partner_purchase_frequency numeric(12,4) not null default 0,
  last_purchase_at timestamptz,
  historical_purchase_qty numeric(20,3) not null default 0,
  product_interest_score numeric(6,2) not null default 0 check (product_interest_score between 0 and 100),
  current_stock_available numeric(20,3),
  current_replenishment_member boolean not null default false,
  attention_level text not null default 'none' check (attention_level in ('none','low','medium','high')),
  calculated_at timestamptz not null default now(),
  primary key(company_id, product_id)
);

create table public.partner_commercial_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  snapshot_at timestamptz not null,
  source_fingerprint text not null,
  primary_currency text,
  multi_currency boolean not null default false,
  revenue_30d numeric(20,4),
  revenue_90d numeric(20,4),
  orders_30d integer not null default 0,
  orders_90d integer not null default 0,
  days_since_last_order integer,
  sku_breadth_90d integer not null default 0,
  active_categories integer not null default 0,
  favorite_count integer not null default 0,
  cart_intent_count integer not null default 0,
  estimates_open integer not null default 0,
  competitor_pressure_product_count integer not null default 0,
  competitor_pressure_weighted_score numeric(12,4) not null default 0,
  service_open_count integer not null default 0,
  support_open_count integer not null default 0,
  current_momentum_state text,
  campaign_engagement integer not null default 0,
  replenishment_engagement integer not null default 0,
  calculated_at timestamptz not null default now(),
  unique(company_id, source_fingerprint)
);

create table public.partner_product_features (
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  views_30d integer not null default 0,
  favorite_active boolean not null default false,
  cart_adds_30d integer not null default 0,
  estimates_90d integer not null default 0,
  purchases_90d integer not null default 0,
  purchased_qty_90d numeric(20,3) not null default 0,
  last_purchase_at timestamptz,
  avg_purchase_interval_days numeric(12,3),
  competitor_gap_pct numeric(12,4),
  competitor_confidence text check (competitor_confidence is null or competitor_confidence in ('low','medium','high')),
  replenishment_recent boolean not null default false,
  product_watch_active boolean not null default false,
  current_price numeric(18,4),
  current_currency text,
  current_stock numeric(20,3),
  calculated_at timestamptz not null default now(),
  primary key(company_id, product_id)
);

create table public.commercial_action_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  product_id uuid references public.catalog_products(id) on delete restrict,
  action_type text not null check (action_type in (
    'competitor_price_pressure','replenishment_opportunity','repeat_purchase_due','churn_risk','campaign_candidate','project_followup'
  )),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,79}$'),
  priority smallint not null check (priority between 1 and 100),
  evidence_jsonb jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open','acknowledged','acted','dismissed','expired')),
  source_fingerprint text not null,
  updated_at timestamptz not null default now(),
  constraint commercial_action_candidates_evidence_check check (
    jsonb_typeof(evidence_jsonb)='object' and pg_column_size(evidence_jsonb)<=2048
    and lower(evidence_jsonb::text) !~ '(password|secret|authorization|access_token|refresh_token|margin|procurement|partner_identity)'
  ),
  unique(company_id, product_id, action_type, source_fingerprint)
);

create unique index commercial_action_candidates_active_idx
  on public.commercial_action_candidates(company_id, coalesce(product_id,'00000000-0000-0000-0000-000000000000'::uuid), action_type)
  where status in ('open','acknowledged');

create table public.commercial_action_outcomes (
  id uuid primary key default gen_random_uuid(),
  action_candidate_id uuid not null references public.commercial_action_candidates(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  product_id uuid references public.catalog_products(id) on delete restrict,
  action_taken text not null check (char_length(action_taken) between 2 and 80),
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  action_at timestamptz not null,
  outcome_window_days integer not null check (outcome_window_days between 1 and 365),
  order_created boolean not null default false,
  revenue_recovered numeric(20,4) check (revenue_recovered is null or revenue_recovered >= 0),
  revenue_currency text check (revenue_currency is null or revenue_currency ~ '^[A-Z]{3}$'),
  quantity_purchased numeric(20,3) check (quantity_purchased is null or quantity_purchased >= 0),
  conversion_at timestamptz,
  outcome_code text not null check (outcome_code in ('pending','converted','no_conversion','not_applicable','unknown')),
  measured_at timestamptz not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique(action_candidate_id, correlation_id)
);

create table public.commercial_intelligence_dirty_products (
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  reason text not null,
  first_dirtied_at timestamptz not null default now(),
  last_dirtied_at timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz,
  last_error_code text,
  primary key(company_id, product_id)
);

create table public.commercial_intelligence_dirty_companies (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  reason text not null,
  first_dirtied_at timestamptz not null default now(),
  last_dirtied_at timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz,
  last_error_code text
);

create table public.commercial_intelligence_projection_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running','succeeded','partial','failed','locked')),
  products_processed integer not null default 0,
  companies_processed integer not null default 0,
  interactions_inserted integer not null default 0,
  snapshots_inserted integer not null default 0,
  duration_ms integer,
  safe_error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.commercial_intelligence_cursors (
  stream_name text primary key check (stream_name in ('partner_behavior_events','external_price_observations')),
  last_occurred_at timestamptz not null default 'epoch',
  last_id uuid not null default '00000000-0000-0000-0000-000000000000',
  updated_at timestamptz not null default now()
);

create index commercial_events_company_time_idx on public.commercial_events(company_id, occurred_at desc);
create index commercial_events_product_time_idx on public.commercial_events(product_id, occurred_at desc) where product_id is not null;
create index partner_product_interactions_company_product_time_idx on public.partner_product_interactions(company_id, product_id, occurred_at desc);
create index partner_product_interactions_type_time_idx on public.partner_product_interactions(event_type, occurred_at desc);
create index competitive_price_snapshots_product_date_idx on public.competitive_price_snapshots(product_id, observation_date desc);
create index competitive_price_snapshots_company_date_idx on public.competitive_price_snapshots(company_id, observation_date desc);
create index competitor_market_price_daily_product_date_idx on public.competitor_market_price_daily(product_id, observation_date desc);
create index partner_product_price_pressure_attention_idx on public.partner_product_price_pressure(attention_level, competitor_cheaper, gap_pct desc, calculated_at desc);
create index partner_product_price_pressure_company_idx on public.partner_product_price_pressure(company_id, attention_level, gap_pct desc);
create index partner_commercial_snapshots_company_time_idx on public.partner_commercial_snapshots(company_id, snapshot_at desc);
create index partner_product_features_product_idx on public.partner_product_features(product_id, calculated_at desc);
create index commercial_action_candidates_status_idx on public.commercial_action_candidates(status, priority desc, generated_at desc);
create index commercial_action_outcomes_company_time_idx on public.commercial_action_outcomes(company_id, action_at desc);
create index commercial_intelligence_dirty_products_claim_idx on public.commercial_intelligence_dirty_products(locked_at, first_dirtied_at);
create index commercial_intelligence_dirty_companies_claim_idx on public.commercial_intelligence_dirty_companies(locked_at, first_dirtied_at);

alter table public.commercial_events enable row level security;
alter table public.partner_product_interactions enable row level security;
alter table public.competitive_price_snapshots enable row level security;
alter table public.competitor_market_price_daily enable row level security;
alter table public.partner_product_price_pressure enable row level security;
alter table public.partner_commercial_snapshots enable row level security;
alter table public.partner_product_features enable row level security;
alter table public.commercial_action_candidates enable row level security;
alter table public.commercial_action_outcomes enable row level security;
alter table public.commercial_intelligence_dirty_products enable row level security;
alter table public.commercial_intelligence_dirty_companies enable row level security;
alter table public.commercial_intelligence_projection_runs enable row level security;
alter table public.commercial_intelligence_cursors enable row level security;

revoke all on public.commercial_events, public.partner_product_interactions,
  public.competitive_price_snapshots, public.competitor_market_price_daily,
  public.partner_product_price_pressure, public.partner_commercial_snapshots,
  public.partner_product_features, public.commercial_action_candidates,
  public.commercial_action_outcomes, public.commercial_intelligence_dirty_products,
  public.commercial_intelligence_dirty_companies, public.commercial_intelligence_projection_runs,
  public.commercial_intelligence_cursors
from public, anon, authenticated;

grant select, insert, update, delete on public.commercial_events, public.partner_product_interactions,
  public.competitive_price_snapshots, public.competitor_market_price_daily,
  public.partner_product_price_pressure, public.partner_commercial_snapshots,
  public.partner_product_features, public.commercial_action_candidates,
  public.commercial_action_outcomes, public.commercial_intelligence_dirty_products,
  public.commercial_intelligence_dirty_companies, public.commercial_intelligence_projection_runs,
  public.commercial_intelligence_cursors
to service_role;

create or replace function public.prevent_commercial_intelligence_history_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Commercial intelligence history is append-only.' using errcode='55000';
end; $$;
revoke all on function public.prevent_commercial_intelligence_history_mutation() from public, anon, authenticated;

create trigger immutable_commercial_events before update or delete on public.commercial_events
for each row execute function public.prevent_commercial_intelligence_history_mutation();
create trigger immutable_partner_product_interactions before update or delete on public.partner_product_interactions
for each row execute function public.prevent_commercial_intelligence_history_mutation();
create trigger immutable_competitive_price_snapshots before update or delete on public.competitive_price_snapshots
for each row execute function public.prevent_commercial_intelligence_history_mutation();
create trigger immutable_partner_commercial_snapshots before update or delete on public.partner_commercial_snapshots
for each row execute function public.prevent_commercial_intelligence_history_mutation();
create trigger immutable_commercial_action_outcomes before update or delete on public.commercial_action_outcomes
for each row execute function public.prevent_commercial_intelligence_history_mutation();

create or replace function public.enqueue_external_price_intelligence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.commercial_events(
    occurred_at,company_id,domain,event_type,entity_type,entity_id,product_id,
    external_source_id,correlation_id,source,payload_jsonb
  )
  select observation.created_at,observation.partner_company_id,'competitive_pricing','competitor_price_observed',
    'external_price_observation',observation.id,observation.catalog_product_id,
    observation.external_price_source_id,observation.upload_id,'external_price_import',
    jsonb_build_object('priceLevel',case when observation.partner_price is not null then 'partner' else 'retail' end,
      'matchMethod',observation.match_method)
  from inserted_observations observation
  on conflict do nothing;

  insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
  select distinct observation.partner_company_id,observation.catalog_product_id,'external_price_observed'
  from inserted_observations observation
  on conflict(company_id,product_id) do update set
    reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;

  insert into public.commercial_intelligence_dirty_companies(company_id,reason)
  select distinct observation.partner_company_id,'external_price_observed' from inserted_observations observation
  on conflict(company_id) do update set
    reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  return null;
end; $$;
revoke all on function public.enqueue_external_price_intelligence() from public, anon, authenticated;
create trigger enqueue_external_price_intelligence_after_insert
after insert on public.external_price_observations
referencing new table as inserted_observations
for each statement execute function public.enqueue_external_price_intelligence();

create or replace function public.enqueue_behavior_intelligence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
  select distinct event.company_id,event.product_id,'partner_behavior'
  from inserted_events event where event.product_id is not null
  on conflict(company_id,product_id) do update set
    reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;

  insert into public.commercial_intelligence_dirty_companies(company_id,reason)
  select distinct event.company_id,'partner_behavior' from inserted_events event
  on conflict(company_id) do update set
    reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  return null;
end; $$;
revoke all on function public.enqueue_behavior_intelligence() from public, anon, authenticated;
create trigger enqueue_behavior_intelligence_after_insert
after insert on public.partner_behavior_events
referencing new table as inserted_events
for each statement execute function public.enqueue_behavior_intelligence();

create or replace function public.enqueue_company_commercial_intelligence()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_company uuid;
begin
  target_company := coalesce(new.company_id,old.company_id);
  if target_company is not null then
    insert into public.commercial_intelligence_dirty_companies(company_id,reason)
    values(target_company,tg_table_name)
    on conflict(company_id) do update set
      reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  end if;
  return coalesce(new,old);
end; $$;
revoke all on function public.enqueue_company_commercial_intelligence() from public, anon, authenticated;
create trigger enqueue_order_commercial_intelligence after insert or update on public.partner_order_history
for each row execute function public.enqueue_company_commercial_intelligence();
create trigger enqueue_estimate_commercial_intelligence after insert or update on public.estimates
for each row execute function public.enqueue_company_commercial_intelligence();
create trigger enqueue_service_commercial_intelligence after insert or update on public.service_cases
for each row execute function public.enqueue_company_commercial_intelligence();
create trigger enqueue_support_commercial_intelligence after insert or update on public.partner_support_tickets
for each row execute function public.enqueue_company_commercial_intelligence();

create or replace function public.enqueue_price_commercial_intelligence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
  select distinct current.partner_company_id,changed.product_id,'novotech_price_changed'
  from changed_prices changed join public.current_external_prices current on current.catalog_product_id=changed.product_id
  on conflict(company_id,product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  return null;
end; $$;
revoke all on function public.enqueue_price_commercial_intelligence() from public, anon, authenticated;
create trigger enqueue_price_commercial_intelligence_insert after insert on public.product_prices
referencing new table as changed_prices for each statement execute function public.enqueue_price_commercial_intelligence();
create trigger enqueue_price_commercial_intelligence_update after update on public.product_prices
referencing new table as changed_prices for each statement execute function public.enqueue_price_commercial_intelligence();

create or replace function public.enqueue_stock_commercial_intelligence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
  select distinct current.partner_company_id,changed.product_id,'stock_changed'
  from changed_stock changed join public.current_external_prices current on current.catalog_product_id=changed.product_id
  on conflict(company_id,product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  return null;
end; $$;
revoke all on function public.enqueue_stock_commercial_intelligence() from public, anon, authenticated;
create trigger enqueue_stock_commercial_intelligence_insert after insert on public.product_stock_totals
referencing new table as changed_stock for each statement execute function public.enqueue_stock_commercial_intelligence();
create trigger enqueue_stock_commercial_intelligence_update after update on public.product_stock_totals
referencing new table as changed_stock for each statement execute function public.enqueue_stock_commercial_intelligence();

create or replace function public.enqueue_arrival_commercial_intelligence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
  select distinct current.partner_company_id,changed.product_id,'arrival_changed'
  from changed_arrivals changed join public.current_external_prices current on current.catalog_product_id=changed.product_id
  on conflict(company_id,product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  return null;
end; $$;
revoke all on function public.enqueue_arrival_commercial_intelligence() from public, anon, authenticated;
create trigger enqueue_arrival_commercial_intelligence_insert after insert on public.product_supplier_arrivals
referencing new table as changed_arrivals for each statement execute function public.enqueue_arrival_commercial_intelligence();
create trigger enqueue_arrival_commercial_intelligence_update after update on public.product_supplier_arrivals
referencing new table as changed_arrivals for each statement execute function public.enqueue_arrival_commercial_intelligence();

create or replace function public.enqueue_order_item_commercial_intelligence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
  select distinct history.company_id,item.product_id,'order_item_changed'
  from changed_order_items item join public.partner_order_history history on history.id=item.order_history_id
  where item.product_id is not null
  on conflict(company_id,product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  return null;
end; $$;
revoke all on function public.enqueue_order_item_commercial_intelligence() from public, anon, authenticated;
create trigger enqueue_order_item_commercial_intelligence_insert after insert on public.partner_order_history_items
referencing new table as changed_order_items for each statement execute function public.enqueue_order_item_commercial_intelligence();
create trigger enqueue_order_item_commercial_intelligence_update after update on public.partner_order_history_items
referencing new table as changed_order_items for each statement execute function public.enqueue_order_item_commercial_intelligence();

create or replace function public.refresh_commercial_intelligence(
  p_product_limit integer default 100,
  p_company_limit integer default 50
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target_run uuid;
  product_count integer:=0;
  company_count integer:=0;
  interaction_count integer:=0;
  snapshot_count integer:=0;
  projection_started_at timestamptz:=clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_product_limit not between 1 and 250 or p_company_limit not between 1 and 100 then
    raise exception 'Invalid commercial intelligence batch.' using errcode='22023';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('commercial_intelligence_projection',0)) then
    insert into public.commercial_intelligence_projection_runs(status,finished_at,duration_ms)
    values('locked',clock_timestamp(),0);
    return jsonb_build_object('status','locked','productsProcessed',0,'companiesProcessed',0);
  end if;

  insert into public.commercial_intelligence_projection_runs(status) values('running') returning id into target_run;

  drop table if exists pg_temp.ci_new_behavior;
  drop table if exists pg_temp.ci_new_observations;
  drop table if exists pg_temp.ci_products;
  drop table if exists pg_temp.ci_companies;

  insert into public.commercial_intelligence_cursors(stream_name) values
    ('partner_behavior_events'),('external_price_observations') on conflict do nothing;

  create temporary table ci_new_behavior on commit drop as
  select event.id,event.company_id,event.product_id,event.occurred_at
  from public.partner_behavior_events event
  cross join public.commercial_intelligence_cursors cursor
  where cursor.stream_name='partner_behavior_events'
    and (event.occurred_at,event.id)>(cursor.last_occurred_at,cursor.last_id)
  order by event.occurred_at,event.id limit 1000;
  insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
  select distinct event.company_id,event.product_id,'behavior_cursor_catchup' from ci_new_behavior event where event.product_id is not null
  on conflict(company_id,product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  insert into public.commercial_intelligence_dirty_companies(company_id,reason)
  select distinct event.company_id,'behavior_cursor_catchup' from ci_new_behavior event
  on conflict(company_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  update public.commercial_intelligence_cursors cursor set last_occurred_at=latest.occurred_at,last_id=latest.id,updated_at=now()
  from (select occurred_at,id from ci_new_behavior order by occurred_at desc,id desc limit 1) latest
  where cursor.stream_name='partner_behavior_events';

  create temporary table ci_new_observations on commit drop as
  select observation.id,observation.partner_company_id company_id,observation.catalog_product_id product_id,observation.created_at
  from public.external_price_observations observation
  cross join public.commercial_intelligence_cursors cursor
  where cursor.stream_name='external_price_observations'
    and (observation.created_at,observation.id)>(cursor.last_occurred_at,cursor.last_id)
  order by observation.created_at,observation.id limit 1000;
  insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
  select distinct observation.company_id,observation.product_id,'external_price_cursor_catchup' from ci_new_observations observation
  on conflict(company_id,product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  insert into public.commercial_intelligence_dirty_companies(company_id,reason)
  select distinct observation.company_id,'external_price_cursor_catchup' from ci_new_observations observation
  on conflict(company_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  update public.commercial_intelligence_cursors cursor set last_occurred_at=latest.created_at,last_id=latest.id,updated_at=now()
  from (select created_at,id from ci_new_observations order by created_at desc,id desc limit 1) latest
  where cursor.stream_name='external_price_observations';

  create temporary table ci_products(company_id uuid,product_id uuid,primary key(company_id,product_id)) on commit drop;
  insert into ci_products(company_id,product_id)
  select dirty.company_id,dirty.product_id
  from public.commercial_intelligence_dirty_products dirty
  where dirty.locked_at is null or dirty.locked_at<now()-interval '15 minutes'
  order by dirty.first_dirtied_at,dirty.company_id,dirty.product_id
  for update skip locked limit p_product_limit;
  update public.commercial_intelligence_dirty_products dirty set locked_at=now(),attempts=attempts+1
  from ci_products claimed where dirty.company_id=claimed.company_id and dirty.product_id=claimed.product_id;
  select count(*) into product_count from ci_products;

  create temporary table ci_companies(company_id uuid primary key) on commit drop;
  insert into ci_companies(company_id)
  select dirty.company_id from public.commercial_intelligence_dirty_companies dirty
  where dirty.locked_at is null or dirty.locked_at<now()-interval '15 minutes'
  order by dirty.first_dirtied_at,dirty.company_id
  for update skip locked limit p_company_limit;
  insert into ci_companies(company_id) select company_id from ci_products on conflict do nothing;
  update public.commercial_intelligence_dirty_companies dirty set locked_at=now(),attempts=attempts+1
  from ci_companies claimed where dirty.company_id=claimed.company_id;
  select count(*) into company_count from ci_companies;

  insert into public.partner_product_interactions(
    source_behavior_event_id,company_id,user_id,product_id,event_type,occurred_at,
    quantity,price_context,source_surface,correlation_id
  )
  select event.id,event.company_id,event.user_id,event.product_id,
    case event.event_name
      when 'product_viewed' then 'product_view'
      when 'merchandising_product_clicked' then 'search_result_click'
      when 'product_added_to_favorites' then 'favorite_added'
      when 'product_removed_from_favorites' then 'favorite_removed'
      when 'product_added_to_cart' then 'cart_added'
      when 'product_removed_from_cart' then 'cart_removed'
      when 'product_added_to_estimate' then 'estimate_added'
    end,
    event.occurred_at,event.quantity,null,event.source_surface,event.session_id
  from public.partner_behavior_events event
  join ci_products claimed on claimed.company_id=event.company_id and claimed.product_id=event.product_id
  where event.event_name in (
    'product_viewed','merchandising_product_clicked','product_added_to_favorites','product_removed_from_favorites',
    'product_added_to_cart','product_removed_from_cart','product_added_to_estimate'
  ) and event.occurred_at>=now()-interval '13 months'
  on conflict(source_behavior_event_id) do nothing;
  get diagnostics interaction_count=row_count;

  with source_rows as (
    select observation.*,coalesce(observation.partner_price,observation.retail_price) competitor_amount,
      case when observation.partner_price is not null then 'partner' else 'retail' end price_level
    from public.external_price_observations observation
    join ci_products claimed on claimed.company_id=observation.partner_company_id and claimed.product_id=observation.catalog_product_id
  ), enriched as (
    select source.*,
      price.price_amount novotech_price,price.currency novotech_currency,
      stats.observation_count,stats.company_count,stats.dispersion_pct,
      greatest(0,current_date-source.observed_at) age_days,
      least(
        case when stats.company_count=1 then 0.49 when stats.company_count=2 then 0.74 else 0.95 end,
        (case source.match_method when 'exact_model' then 0.40 when 'known_alias' then 0.34 else 0.28 end)
        +(case when current_date-source.observed_at<=30 then 0.22 when current_date-source.observed_at<=90 then 0.12 else 0.03 end)
        +0.12+(case when stats.dispersion_pct<=5 then 0.10 when stats.dispersion_pct<=15 then 0.05 else 0 end)
        +least(0.18,(stats.company_count-1)*0.09)
      ) confidence
    from source_rows source
    join public.partner_companies company on company.id=source.partner_company_id
    left join lateral (
      select candidate.price_amount,candidate.currency
      from public.product_prices candidate
      left join public.price_types type on type.external_ref=candidate.external_1c_price_type_id
      where candidate.product_id=source.catalog_product_id and candidate.is_active and candidate.is_published
        and candidate.valid_from<=now() and (candidate.valid_to is null or candidate.valid_to>=now())
        and ((source.price_level='partner' and candidate.external_1c_price_type_id=company.external_1c_price_type_id)
          or (source.price_level='retail' and type.external_code='UU-000020'))
      order by candidate.valid_from desc,candidate.id limit 1
    ) price on true
    cross join lateral (
      select count(*)::integer observation_count,count(distinct other.partner_company_id)::integer company_count,
        case when min(value.amount)>0 then ((max(value.amount)-min(value.amount))/min(value.amount)*100)::numeric else 0 end dispersion_pct
      from public.external_price_observations other
      cross join lateral(values
        ('partner'::text,other.partner_price),('retail'::text,other.retail_price)
      ) value(price_level,amount)
      where other.external_price_source_id=source.external_price_source_id
        and other.catalog_product_id=source.catalog_product_id
        and other.observed_at between source.observed_at-30 and source.observed_at
        and value.price_level=source.price_level and value.amount is not null
    ) stats
  )
  insert into public.competitive_price_snapshots(
    observation_id,company_id,product_id,external_price_source_id,observation_date,price_level,
    competitor_price,competitor_currency,novotech_price,novotech_currency,normalized_comparison_price,
    price_gap_amount,price_gap_pct,comparison_direction,observation_age_days,confidence_score,
    confidence_level,independent_observation_count,contributing_company_count
  )
  select enriched.id,enriched.partner_company_id,enriched.catalog_product_id,enriched.external_price_source_id,
    enriched.observed_at,enriched.price_level,enriched.competitor_amount,enriched.currency,
    enriched.novotech_price,enriched.novotech_currency,
    case when enriched.currency=enriched.novotech_currency then enriched.competitor_amount end,
    case when enriched.currency=enriched.novotech_currency then enriched.novotech_price-enriched.competitor_amount end,
    case when enriched.currency=enriched.novotech_currency then
      (enriched.novotech_price-enriched.competitor_amount)/greatest(enriched.competitor_amount,0.01)*100 end,
    case when enriched.novotech_price is null or enriched.currency<>enriched.novotech_currency then 'incomparable'
      when abs(enriched.novotech_price-enriched.competitor_amount)/greatest(enriched.competitor_amount,0.01)<0.01 then 'parity'
      when enriched.novotech_price>enriched.competitor_amount then 'competitor_cheaper' else 'novotech_cheaper' end,
    enriched.age_days,enriched.confidence,
    case when enriched.confidence>=0.75 then 'high' when enriched.confidence>=0.50 then 'medium' else 'low' end,
    enriched.observation_count,enriched.company_count
  from enriched on conflict(observation_id) do nothing;
  get diagnostics snapshot_count=row_count;

  insert into public.competitor_market_price_daily(
    external_price_source_id,product_id,observation_date,price_level,currency,min_price,max_price,
    median_price,observation_count,distinct_company_count,dispersion_pct,freshness_days,confidence_level,calculated_at
  )
  select observation.external_price_source_id,observation.catalog_product_id,observation.observed_at,price.price_level,
    observation.currency,min(price.amount),max(price.amount),
    percentile_cont(0.5) within group(order by price.amount)::numeric,count(*)::integer,
    count(distinct observation.partner_company_id)::integer,
    case when min(price.amount)>0 then ((max(price.amount)-min(price.amount))/min(price.amount)*100)::numeric else 0 end,
    greatest(0,current_date-observation.observed_at),
    case when count(distinct observation.partner_company_id)>=3 then 'high'
      when count(distinct observation.partner_company_id)=2 then 'medium' else 'low' end,now()
  from public.external_price_observations observation
  join (select distinct product_id from ci_products) claimed on claimed.product_id=observation.catalog_product_id
  cross join lateral(values('partner'::text,observation.partner_price),('retail'::text,observation.retail_price)) price(price_level,amount)
  where price.amount is not null
  group by observation.external_price_source_id,observation.catalog_product_id,observation.observed_at,price.price_level,observation.currency
  on conflict(external_price_source_id,product_id,observation_date,price_level,currency) do update set
    min_price=excluded.min_price,max_price=excluded.max_price,median_price=excluded.median_price,
    observation_count=excluded.observation_count,distinct_company_count=excluded.distinct_company_count,
    dispersion_pct=excluded.dispersion_pct,freshness_days=excluded.freshness_days,
    confidence_level=excluded.confidence_level,calculated_at=excluded.calculated_at;

  with ranked_competitor as (
    select current.*,row_number() over(partition by current.partner_company_id,current.catalog_product_id
      order by current.amount,current.observed_at desc,current.external_price_source_id) rank
    from public.current_external_prices current join ci_products claimed
      on claimed.company_id=current.partner_company_id and claimed.product_id=current.catalog_product_id
    where current.price_type='partner'
  ), selected as (
    select ranked.*,company.external_1c_price_type_id,
      price.price_amount novotech_price,price.currency novotech_currency,
      snapshot.confidence_score,snapshot.confidence_level,snapshot.contributing_company_count,source_stats.source_count
    from ranked_competitor ranked join public.partner_companies company on company.id=ranked.partner_company_id
    left join lateral (
      select candidate.price_amount,candidate.currency from public.product_prices candidate
      where candidate.product_id=ranked.catalog_product_id
        and candidate.external_1c_price_type_id=company.external_1c_price_type_id
        and candidate.is_active and candidate.is_published and candidate.valid_from<=now()
        and (candidate.valid_to is null or candidate.valid_to>=now())
      order by candidate.valid_from desc,candidate.id limit 1
    ) price on true
    left join public.competitive_price_snapshots snapshot on snapshot.observation_id=ranked.observation_id
    cross join lateral(select count(distinct other.external_price_source_id)::integer source_count
      from public.current_external_prices other where other.partner_company_id=ranked.partner_company_id
        and other.catalog_product_id=ranked.catalog_product_id and other.price_type='partner') source_stats
    where ranked.rank=1
  ), purchases as (
    select history.company_id,item.product_id,count(distinct history.id)::numeric/3 purchase_frequency,
      max(history.one_c_document_date) last_purchase_at,sum(item.quantity) historical_qty
    from public.partner_order_history history join public.partner_order_history_items item on item.order_history_id=history.id
    join ci_products claimed on claimed.company_id=history.company_id and claimed.product_id=item.product_id
    where history.partner_visible and history.one_c_posted and not history.one_c_deletion_mark
      and history.one_c_document_date>=now()-interval '90 days'
    group by history.company_id,item.product_id
  ), interest as (
    select interaction.company_id,interaction.product_id,
      least(100,count(*) filter(where interaction.event_type='product_view' and interaction.occurred_at>=now()-interval '30 days')
        +count(*) filter(where interaction.event_type='favorite_added' and interaction.occurred_at>=now()-interval '90 days')*8
        +count(*) filter(where interaction.event_type='cart_added' and interaction.occurred_at>=now()-interval '30 days')*12
        +count(*) filter(where interaction.event_type='estimate_added' and interaction.occurred_at>=now()-interval '90 days')*15)::numeric interest_score
    from public.partner_product_interactions interaction join ci_products claimed
      on claimed.company_id=interaction.company_id and claimed.product_id=interaction.product_id
    group by interaction.company_id,interaction.product_id
  )
  insert into public.partner_product_price_pressure(
    company_id,product_id,current_novotech_price,novotech_currency,best_known_competitor_price,
    competitor_currency,competitor_source_id,gap_amount,gap_pct,competitor_cheaper,
    observation_freshness_days,confidence_score,confidence_level,independent_source_count,
    contributing_company_count,partner_purchase_frequency,last_purchase_at,historical_purchase_qty,
    product_interest_score,current_stock_available,current_replenishment_member,attention_level,calculated_at
  )
  select selected.partner_company_id,selected.catalog_product_id,selected.novotech_price,selected.novotech_currency,
    selected.amount,selected.currency,selected.external_price_source_id,
    case when selected.currency=selected.novotech_currency then selected.novotech_price-selected.amount end,
    case when selected.currency=selected.novotech_currency then (selected.novotech_price-selected.amount)/greatest(selected.amount,0.01)*100 end,
    coalesce(selected.currency=selected.novotech_currency and selected.novotech_price>selected.amount,false),
    greatest(0,current_date-selected.observed_at),coalesce(selected.confidence_score,0),coalesce(selected.confidence_level,'low'),
    selected.source_count,coalesce(selected.contributing_company_count,1),coalesce(purchases.purchase_frequency,0),
    purchases.last_purchase_at,coalesce(purchases.historical_qty,0),coalesce(interest.interest_score,0),stock.available_quantity,
    exists(select 1 from public.product_supplier_arrivals arrival where arrival.product_id=selected.catalog_product_id
      and arrival.is_published and arrival.expected_arrival_date>=current_date),
    case
      when selected.currency<>selected.novotech_currency or selected.novotech_price<=selected.amount then 'none'
      when coalesce(selected.confidence_score,0)>=0.75 and (selected.novotech_price-selected.amount)/greatest(selected.amount,0.01)>=0.10 then 'high'
      when coalesce(selected.confidence_score,0)>=0.50 and (selected.novotech_price-selected.amount)/greatest(selected.amount,0.01)>=0.05 then 'medium'
      else 'low' end,now()
  from selected left join purchases on purchases.company_id=selected.partner_company_id and purchases.product_id=selected.catalog_product_id
  left join interest on interest.company_id=selected.partner_company_id and interest.product_id=selected.catalog_product_id
  left join public.product_stock_totals stock on stock.product_id=selected.catalog_product_id and stock.is_published
  on conflict(company_id,product_id) do update set
    current_novotech_price=excluded.current_novotech_price,novotech_currency=excluded.novotech_currency,
    best_known_competitor_price=excluded.best_known_competitor_price,competitor_currency=excluded.competitor_currency,
    competitor_source_id=excluded.competitor_source_id,gap_amount=excluded.gap_amount,gap_pct=excluded.gap_pct,
    competitor_cheaper=excluded.competitor_cheaper,observation_freshness_days=excluded.observation_freshness_days,
    confidence_score=excluded.confidence_score,confidence_level=excluded.confidence_level,
    independent_source_count=excluded.independent_source_count,contributing_company_count=excluded.contributing_company_count,
    partner_purchase_frequency=excluded.partner_purchase_frequency,last_purchase_at=excluded.last_purchase_at,
    historical_purchase_qty=excluded.historical_purchase_qty,product_interest_score=excluded.product_interest_score,
    current_stock_available=excluded.current_stock_available,current_replenishment_member=excluded.current_replenishment_member,
    attention_level=excluded.attention_level,calculated_at=excluded.calculated_at;

  with interaction_stats as (
    select claimed.company_id,claimed.product_id,
      count(*) filter(where interaction.event_type='product_view' and interaction.occurred_at>=now()-interval '30 days')::integer views_30d,
      count(*) filter(where interaction.event_type='cart_added' and interaction.occurred_at>=now()-interval '30 days')::integer cart_adds_30d,
      count(*) filter(where interaction.event_type='estimate_added' and interaction.occurred_at>=now()-interval '90 days')::integer estimates_90d
    from ci_products claimed left join public.partner_product_interactions interaction
      on interaction.company_id=claimed.company_id and interaction.product_id=claimed.product_id
    group by claimed.company_id,claimed.product_id
  ), purchase_rows as (
    select history.company_id,item.product_id,count(distinct history.id)::integer purchases_90d,
      sum(item.quantity) purchased_qty,max(history.one_c_document_date) last_purchase,
      case when count(distinct history.id)>1 then
        extract(epoch from (max(history.one_c_document_date)-min(history.one_c_document_date)))/86400/(count(distinct history.id)-1) end avg_interval
    from public.partner_order_history history join public.partner_order_history_items item on item.order_history_id=history.id
    join ci_products claimed on claimed.company_id=history.company_id and claimed.product_id=item.product_id
    where history.partner_visible and history.one_c_posted and not history.one_c_deletion_mark
      and history.one_c_document_date>=now()-interval '90 days'
    group by history.company_id,item.product_id
  )
  insert into public.partner_product_features(
    company_id,product_id,views_30d,favorite_active,cart_adds_30d,estimates_90d,purchases_90d,
    purchased_qty_90d,last_purchase_at,avg_purchase_interval_days,competitor_gap_pct,competitor_confidence,
    replenishment_recent,product_watch_active,current_price,current_currency,current_stock,calculated_at
  )
  select stats.company_id,stats.product_id,stats.views_30d,
    exists(select 1 from public.purchasing_lists list join public.purchasing_list_items item on item.list_id=list.id
      where list.company_id=stats.company_id and list.archived_at is null and list.is_system_favorites and item.product_id=stats.product_id),
    stats.cart_adds_30d,stats.estimates_90d,coalesce(purchase.purchases_90d,0),coalesce(purchase.purchased_qty,0),
    purchase.last_purchase,purchase.avg_interval,pressure.gap_pct,pressure.confidence_level,
    exists(select 1 from public.product_supplier_arrivals arrival where arrival.product_id=stats.product_id
      and arrival.is_published and arrival.expected_arrival_date between current_date-30 and current_date+90),
    exists(select 1 from public.purchasing_lists list join public.purchasing_list_items item on item.list_id=list.id
      where list.company_id=stats.company_id and list.archived_at is null and item.product_id=stats.product_id)
      or exists(select 1 from public.carts cart join public.cart_items item on item.cart_id=cart.id
        where cart.company_id=stats.company_id and cart.status='active' and item.product_id=stats.product_id),
    pressure.current_novotech_price,pressure.novotech_currency,stock.available_quantity,now()
  from interaction_stats stats left join purchase_rows purchase on purchase.company_id=stats.company_id and purchase.product_id=stats.product_id
  left join public.partner_product_price_pressure pressure on pressure.company_id=stats.company_id and pressure.product_id=stats.product_id
  left join public.product_stock_totals stock on stock.product_id=stats.product_id and stock.is_published
  on conflict(company_id,product_id) do update set
    views_30d=excluded.views_30d,favorite_active=excluded.favorite_active,cart_adds_30d=excluded.cart_adds_30d,
    estimates_90d=excluded.estimates_90d,purchases_90d=excluded.purchases_90d,purchased_qty_90d=excluded.purchased_qty_90d,
    last_purchase_at=excluded.last_purchase_at,avg_purchase_interval_days=excluded.avg_purchase_interval_days,
    competitor_gap_pct=excluded.competitor_gap_pct,competitor_confidence=excluded.competitor_confidence,
    replenishment_recent=excluded.replenishment_recent,product_watch_active=excluded.product_watch_active,
    current_price=excluded.current_price,current_currency=excluded.current_currency,current_stock=excluded.current_stock,
    calculated_at=excluded.calculated_at;

  insert into public.commercial_action_candidates(
    company_id,product_id,action_type,reason_code,priority,evidence_jsonb,expires_at,source_fingerprint
  )
  select pressure.company_id,pressure.product_id,'competitor_price_pressure','verified_competitor_cheaper',
    case pressure.attention_level when 'high' then 90 when 'medium' then 65 else 40 end,
    jsonb_build_object('gapPct',round(pressure.gap_pct,2),'confidence',pressure.confidence_level,
      'freshnessDays',pressure.observation_freshness_days,'contributingCompanies',pressure.contributing_company_count),
    now()+interval '30 days',md5(concat_ws(':',pressure.product_id,round(pressure.gap_pct,2),pressure.confidence_level,pressure.observation_freshness_days))
  from public.partner_product_price_pressure pressure join ci_products claimed
    on claimed.company_id=pressure.company_id and claimed.product_id=pressure.product_id
  where pressure.competitor_cheaper and pressure.confidence_level in ('medium','high')
  on conflict do nothing;

  with order_stats as (
    select company.company_id,
      count(history.id) filter(where history.one_c_document_date>=now()-interval '30 days')::integer orders_30d,
      count(history.id) filter(where history.one_c_document_date>=now()-interval '90 days')::integer orders_90d,
      max(history.one_c_document_date) last_order_at,
      count(distinct history.currency_code) filter(where history.one_c_document_date>=now()-interval '90 days')::integer currency_count,
      min(history.currency_code) filter(where history.one_c_document_date>=now()-interval '90 days') primary_currency,
      sum(history.document_total) filter(where history.one_c_document_date>=now()-interval '30 days') revenue_30d,
      sum(history.document_total) filter(where history.one_c_document_date>=now()-interval '90 days') revenue_90d
    from ci_companies company left join public.partner_order_history history on history.company_id=company.company_id
      and history.partner_visible and history.one_c_posted and not history.one_c_deletion_mark
    group by company.company_id
  ), product_stats as (
    select company.company_id,count(distinct item.product_id)::integer sku_breadth,
      count(distinct product.category_id)::integer category_count
    from ci_companies company left join public.partner_order_history history on history.company_id=company.company_id
      and history.partner_visible and history.one_c_posted and not history.one_c_deletion_mark
      and history.one_c_document_date>=now()-interval '90 days'
    left join public.partner_order_history_items item on item.order_history_id=history.id
    left join public.catalog_products product on product.id=item.product_id
    group by company.company_id
  ), snapshot_source as (
    select stats.*,product_stats.sku_breadth,product_stats.category_count,
      (select count(*) from public.purchasing_lists list join public.purchasing_list_items item on item.list_id=list.id
        where list.company_id=stats.company_id and list.is_system_favorites and list.archived_at is null) favorite_count,
      (select count(*) from public.carts cart join public.cart_items item on item.cart_id=cart.id
        where cart.company_id=stats.company_id and cart.status='active') cart_count,
      (select count(*) from public.estimates estimate where estimate.company_id=stats.company_id
        and estimate.archived_at is null and estimate.deleted_at is null and estimate.lifecycle_status in ('draft','sent','accepted')) estimate_count,
      (select count(*) from public.partner_product_price_pressure pressure where pressure.company_id=stats.company_id and pressure.competitor_cheaper) pressure_count,
      (select coalesce(sum(greatest(pressure.gap_pct,0)*greatest(pressure.product_interest_score,1)/100),0)
        from public.partner_product_price_pressure pressure where pressure.company_id=stats.company_id and pressure.competitor_cheaper) pressure_score,
      (select count(*) from public.service_cases service where service.company_id=stats.company_id and service.status not in ('closed','rejected','cancelled')) service_count,
      (select count(*) from public.partner_support_tickets support where support.company_id=stats.company_id and support.status not in ('resolved','closed','rejected')) support_count,
      momentum.status momentum_state,
      (select count(*) from public.partner_behavior_events event where event.company_id=stats.company_id
        and event.occurred_at>=now()-interval '90 days' and event.event_name in ('merchandising_section_viewed','merchandising_product_clicked')) campaign_count,
      (select count(*) from public.partner_behavior_events event where event.company_id=stats.company_id
        and event.occurred_at>=now()-interval '90 days' and event.event_name in ('arrival_interest_viewed','arrival_date_viewed')) replenishment_count
    from order_stats stats join product_stats on product_stats.company_id=stats.company_id
    left join public.partner_momentum_snapshots momentum on momentum.company_id=stats.company_id
  )
  insert into public.partner_commercial_snapshots(
    company_id,snapshot_at,source_fingerprint,primary_currency,multi_currency,revenue_30d,revenue_90d,
    orders_30d,orders_90d,days_since_last_order,sku_breadth_90d,active_categories,favorite_count,
    cart_intent_count,estimates_open,competitor_pressure_product_count,competitor_pressure_weighted_score,
    service_open_count,support_open_count,current_momentum_state,campaign_engagement,replenishment_engagement
  )
  select source.company_id,now(),md5(concat_ws(':',source.orders_30d,source.orders_90d,source.last_order_at,
    source.sku_breadth,source.favorite_count,source.cart_count,source.estimate_count,source.pressure_count,
    round(source.pressure_score,2),source.service_count,source.support_count,source.momentum_state,source.campaign_count,source.replenishment_count)),
    case when source.currency_count=1 then source.primary_currency end,source.currency_count>1,
    case when source.currency_count<=1 then source.revenue_30d end,case when source.currency_count<=1 then source.revenue_90d end,
    source.orders_30d,source.orders_90d,case when source.last_order_at is not null then greatest(0,current_date-source.last_order_at::date) end,
    source.sku_breadth,source.category_count,source.favorite_count,source.cart_count,source.estimate_count,
    source.pressure_count,source.pressure_score,source.service_count,source.support_count,source.momentum_state,
    source.campaign_count,source.replenishment_count
  from snapshot_source source on conflict(company_id,source_fingerprint) do nothing;

  delete from public.commercial_intelligence_dirty_products dirty using ci_products claimed
  where dirty.company_id=claimed.company_id and dirty.product_id=claimed.product_id;
  delete from public.commercial_intelligence_dirty_companies dirty using ci_companies claimed
  where dirty.company_id=claimed.company_id;

  update public.commercial_intelligence_projection_runs set status='succeeded',products_processed=product_count,
    companies_processed=company_count,interactions_inserted=interaction_count,snapshots_inserted=snapshot_count,
    duration_ms=greatest(0,extract(milliseconds from clock_timestamp()-projection_started_at)::integer),finished_at=clock_timestamp()
  where id=target_run;

  return jsonb_build_object('status','succeeded','productsProcessed',product_count,'companiesProcessed',company_count,
    'interactionsInserted',interaction_count,'snapshotsInserted',snapshot_count,
    'durationMs',greatest(0,extract(milliseconds from clock_timestamp()-projection_started_at)::integer));
exception when others then
  if target_run is not null then
    update public.commercial_intelligence_projection_runs set status='failed',safe_error_code=left(sqlstate,80),
      duration_ms=greatest(0,extract(milliseconds from clock_timestamp()-projection_started_at)::integer),finished_at=clock_timestamp()
    where id=target_run;
  end if;
  raise;
end; $$;
revoke all on function public.refresh_commercial_intelligence(integer,integer) from public, anon, authenticated;
grant execute on function public.refresh_commercial_intelligence(integer,integer) to service_role;

create or replace function public.get_admin_competitive_intelligence(p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') or p_limit not between 1 and 100 or p_offset not between 0 and 10000 then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'products',coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.priority desc,row_data."gapPct" desc,row_data.sku)
      from (select product.id "productId",product.sku,product.name "productName",source.display_name "sourceName",
        pressure.current_novotech_price "novotechPrice",pressure.novotech_currency "novotechCurrency",
        market.median_price "competitorMedianPrice",pressure.best_known_competitor_price "competitorBestPrice",
        pressure.competitor_currency "competitorCurrency",pressure.gap_amount "gapAmount",pressure.gap_pct "gapPct",
        pressure.contributing_company_count "contributingPartnerCount",pressure.observation_freshness_days "freshnessDays",
        pressure.confidence_level confidence,
        (select count(distinct feature.company_id) from public.partner_product_features feature
          where feature.product_id=pressure.product_id and (feature.views_30d>0 or feature.purchases_90d>0 or feature.favorite_active)) "partnerExposureCount",
        case pressure.attention_level when 'high' then 90 when 'medium' then 65 when 'low' then 40 else 0 end priority
       from public.partner_product_price_pressure pressure join public.catalog_products product on product.id=pressure.product_id
       left join public.external_price_sources source on source.id=pressure.competitor_source_id
       left join lateral(select daily.median_price from public.competitor_market_price_daily daily
         where daily.product_id=pressure.product_id and daily.external_price_source_id=pressure.competitor_source_id
           and daily.price_level='partner' and daily.currency=pressure.competitor_currency
         order by daily.observation_date desc limit 1) market on true
       where pressure.competitor_cheaper order by priority desc,pressure.gap_pct desc,product.sku
       limit p_limit offset p_offset) row_data),'[]'::jsonb),
    'partners',coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.attention_score desc,row_data."partnerName")
      from (select company.id "companyId",company.display_name "partnerName",count(*)::integer "productsUnderPressure",
        round(sum(pressure.gap_pct*greatest(pressure.product_interest_score,1))/nullif(sum(greatest(pressure.product_interest_score,1)),0),2) "averageWeightedGap",
        count(*) filter(where feature.purchases_90d>0)::integer "recentPurchasesAffected",
        case when count(distinct pressure.novotech_currency) filter(where pressure.novotech_currency is not null)<=1
          then sum(coalesce(feature.purchased_qty_90d,0)*coalesce(pressure.current_novotech_price,0)) end "estimatedExposedRevenue",
        case when count(distinct pressure.novotech_currency) filter(where pressure.novotech_currency is not null)<=1
          then max(pressure.novotech_currency) filter(where pressure.novotech_currency is not null) end currency,
        min(pressure.observation_freshness_days) "freshnessDays",
        max(case pressure.attention_level when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end) attention_score,
        case max(case pressure.attention_level when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end)
          when 3 then 'high' when 2 then 'medium' else 'low' end "attentionLevel"
       from public.partner_product_price_pressure pressure join public.partner_companies company on company.id=pressure.company_id
       left join public.partner_product_features feature on feature.company_id=pressure.company_id and feature.product_id=pressure.product_id
       where pressure.competitor_cheaper group by company.id,company.display_name
       order by attention_score desc,company.display_name limit p_limit offset p_offset) row_data),'[]'::jsonb),
    'counts',jsonb_build_object(
      'productsUnderPressure',(select count(*) from public.partner_product_price_pressure where competitor_cheaper),
      'partnersExposed',(select count(distinct company_id) from public.partner_product_price_pressure where competitor_cheaper),
      'lowConfidenceProducts',(select count(*) from public.partner_product_price_pressure where competitor_cheaper and confidence_level='low')
    )
  );
end; $$;
revoke all on function public.get_admin_competitive_intelligence(integer,integer) from public, anon;
grant execute on function public.get_admin_competitive_intelligence(integer,integer) to authenticated;

create or replace function public.get_admin_company_competitive_intelligence(p_company_id uuid,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') or p_limit not between 1 and 100 then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data."gapPct" desc,row_data.sku)
    from (select product.sku,product.name "productName",source.display_name "sourceName",pressure.current_novotech_price "novotechPrice",
      pressure.best_known_competitor_price "competitorPrice",pressure.novotech_currency currency,pressure.gap_pct "gapPct",
      feature.purchases_90d "purchases90d",feature.last_purchase_at "lastPurchaseAt",pressure.confidence_level confidence
      from public.partner_product_price_pressure pressure join public.catalog_products product on product.id=pressure.product_id
      left join public.external_price_sources source on source.id=pressure.competitor_source_id
      left join public.partner_product_features feature on feature.company_id=pressure.company_id and feature.product_id=pressure.product_id
      where pressure.company_id=p_company_id and pressure.competitor_cheaper
      order by pressure.gap_pct desc,product.sku limit p_limit) row_data),'[]'::jsonb));
end; $$;
revoke all on function public.get_admin_company_competitive_intelligence(uuid,integer) from public, anon;
grant execute on function public.get_admin_company_competitive_intelligence(uuid,integer) to authenticated;

create or replace function public.record_commercial_action_outcome(
  p_action_candidate_id uuid,p_action_taken text,p_outcome_window_days integer,p_order_created boolean,
  p_revenue_recovered numeric,p_revenue_currency text,p_quantity_purchased numeric,p_conversion_at timestamptz,
  p_outcome_code text,p_measured_at timestamptz,p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare target public.commercial_action_candidates; saved_id uuid;
begin
  if not public.has_internal_permission('partner_momentum.actions.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  select * into target from public.commercial_action_candidates where id=p_action_candidate_id for update;
  if target.id is null then raise exception 'Action candidate not found.' using errcode='P0002'; end if;
  insert into public.commercial_action_outcomes(action_candidate_id,company_id,product_id,action_taken,actor_id,action_at,
    outcome_window_days,order_created,revenue_recovered,revenue_currency,quantity_purchased,conversion_at,outcome_code,measured_at,correlation_id)
  values(target.id,target.company_id,target.product_id,left(btrim(p_action_taken),80),auth.uid(),now(),p_outcome_window_days,
    p_order_created,p_revenue_recovered,upper(p_revenue_currency),p_quantity_purchased,p_conversion_at,p_outcome_code,p_measured_at,p_correlation_id)
  on conflict(action_candidate_id,correlation_id) do nothing returning id into saved_id;
  if saved_id is null then
    select outcome.id into saved_id from public.commercial_action_outcomes outcome
    where outcome.action_candidate_id=target.id and outcome.correlation_id=p_correlation_id;
  end if;
  update public.commercial_action_candidates set status='acted',updated_at=now() where id=target.id and status in ('open','acknowledged');
  return saved_id;
end; $$;
revoke all on function public.record_commercial_action_outcome(uuid,text,integer,boolean,numeric,text,numeric,timestamptz,text,timestamptz,uuid) from public, anon;
grant execute on function public.record_commercial_action_outcome(uuid,text,integer,boolean,numeric,text,numeric,timestamptz,text,timestamptz,uuid) to authenticated;

create or replace function public.ai_partner_commercial_context_v1(p_company_id uuid,p_product_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') or p_product_limit not between 1 and 50 then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'contractVersion','v1','companyId',p_company_id,
    'partnerSnapshot',(select to_jsonb(snapshot)-'id'-'source_fingerprint' from public.partner_commercial_snapshots snapshot
      where snapshot.company_id=p_company_id order by snapshot.snapshot_at desc limit 1),
    'productFeatures',coalesce((select jsonb_agg(to_jsonb(feature)-'company_id' order by feature.calculated_at desc)
      from (select * from public.partner_product_features where company_id=p_company_id
        order by calculated_at desc limit p_product_limit) feature),'[]'::jsonb),
    'pricePressure',coalesce((select jsonb_agg(to_jsonb(pressure)-'company_id' order by pressure.gap_pct desc)
      from (select * from public.partner_product_price_pressure where company_id=p_company_id and competitor_cheaper
        order by gap_pct desc limit p_product_limit) pressure),'[]'::jsonb),
    'openActions',coalesce((select jsonb_agg(jsonb_build_object('id',candidate.id,'productId',candidate.product_id,
      'type',candidate.action_type,'reasonCode',candidate.reason_code,'priority',candidate.priority,'evidence',candidate.evidence_jsonb,
      'generatedAt',candidate.generated_at,'expiresAt',candidate.expires_at) order by candidate.priority desc)
      from public.commercial_action_candidates candidate where candidate.company_id=p_company_id and candidate.status in ('open','acknowledged')),'[]'::jsonb),
    'recentOutcomes',coalesce((select jsonb_agg(jsonb_build_object('candidateId',outcome.action_candidate_id,
      'productId',outcome.product_id,'actionTaken',outcome.action_taken,'outcomeCode',outcome.outcome_code,
      'orderCreated',outcome.order_created,'conversionAt',outcome.conversion_at,'measuredAt',outcome.measured_at)
      order by outcome.measured_at desc) from (select * from public.commercial_action_outcomes where company_id=p_company_id
        order by measured_at desc limit 25) outcome),'[]'::jsonb)
  );
end; $$;
revoke all on function public.ai_partner_commercial_context_v1(uuid,integer) from public, anon;
grant execute on function public.ai_partner_commercial_context_v1(uuid,integer) to authenticated;

insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
select distinct observation.partner_company_id,observation.catalog_product_id,'initial_external_price_backfill'
from public.external_price_observations observation
on conflict(company_id,product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null;

insert into public.commercial_intelligence_dirty_companies(company_id,reason)
select company.id,'initial_partner_snapshot' from public.partner_companies company where company.status='active'
on conflict(company_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null;

insert into public.commercial_events(
  occurred_at,company_id,domain,event_type,entity_type,entity_id,product_id,
  external_source_id,correlation_id,source,payload_jsonb
)
select observation.created_at,observation.partner_company_id,'competitive_pricing','competitor_price_observed',
  'external_price_observation',observation.id,observation.catalog_product_id,
  observation.external_price_source_id,observation.upload_id,'external_price_import',
  jsonb_build_object('priceLevel',case when observation.partner_price is not null then 'partner' else 'retail' end,
    'matchMethod',observation.match_method)
from public.external_price_observations observation
on conflict do nothing;

commit;
