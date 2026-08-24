begin;

insert into public.permissions(code, description, scope, delegable_by_partner_owner, sensitive, category)
values
  ('competitive_intelligence.view', 'View company-owned competitive price observations.', 'partner', true, true, 'commercial'),
  ('competitive_intelligence.manage', 'Create governed company-owned competitive price observations.', 'partner', true, true, 'commercial'),
  ('admin.market_intelligence.manage', 'Reconcile competitors and govern competitive intelligence evidence and recommendations.', 'internal', false, true, 'administration')
on conflict (code) do update set
  description = excluded.description,
  scope = excluded.scope,
  delegable_by_partner_owner = excluded.delegable_by_partner_owner,
  sensitive = excluded.sensitive,
  category = excluded.category;

with grants(role_code, permission_code) as (
  values
    ('partner_owner', 'competitive_intelligence.view'),
    ('partner_owner', 'competitive_intelligence.manage'),
    ('partner_manager', 'competitive_intelligence.view'),
    ('partner_manager', 'competitive_intelligence.manage'),
    ('partner_buyer', 'competitive_intelligence.view'),
    ('partner_buyer', 'competitive_intelligence.manage')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role cross join public.permissions permission
where role.code = 'novotech_admin' and permission.code = 'admin.market_intelligence.manage'
on conflict do nothing;

insert into public.partner_access_preset_capabilities(preset_code, permission_id)
select 'full_partner_access', permission.id
from public.permissions permission
where permission.code in ('competitive_intelligence.view', 'competitive_intelligence.manage')
on conflict do nothing;

insert into public.partner_company_capabilities(company_id, permission_id, enabled_by)
select policy.company_id, permission.id, policy.changed_by
from public.partner_company_access_policies policy
cross join public.permissions permission
where policy.preset_code = 'full_partner_access'
  and permission.code in ('competitive_intelligence.view', 'competitive_intelligence.manage')
on conflict do nothing;

create table public.competitive_intelligence_competitors (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  display_name text not null,
  normalized_name text not null unique,
  status text not null default 'active' check (status in ('active','pending_review','inactive','merged')),
  merged_into_id uuid references public.competitive_intelligence_competitors(id) on delete restrict,
  created_by uuid references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(canonical_name) between 2 and 120),
  check (char_length(display_name) between 2 and 120),
  check ((status = 'merged') = (merged_into_id is not null)),
  check (merged_into_id is null or merged_into_id <> id)
);

create table public.competitive_intelligence_competitor_aliases (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitive_intelligence_competitors(id) on delete restrict,
  alias text not null,
  normalized_alias text not null unique,
  created_by uuid references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (char_length(alias) between 2 and 120)
);

create table public.competitor_price_observations (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  competitor_id uuid references public.competitive_intelligence_competitors(id) on delete restrict,
  submitted_competitor_name text,
  normalized_submitted_competitor_name text,
  observed_price numeric(18,4) not null check (observed_price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  vat_mode text not null check (vat_mode in ('included','excluded','not_applicable','not_specified')),
  quantity numeric(20,3) not null default 1 check (quantity > 0 and quantity <= 1000000),
  quantity_cohort text generated always as (
    case when quantity = 1 then 'single' when quantity <= 10 then 'small' else 'large' end
  ) stored,
  observation_date date not null,
  source_type text not null check (source_type in ('verbal','message','quotation','order','invoice','other')),
  valid_until date,
  payment_terms text,
  delivery_terms text,
  comment text,
  confidence_level text not null check (confidence_level in ('low','medium','high')),
  possible_outlier boolean not null default false,
  status text not null default 'active' check (status in ('active','excluded')),
  is_test_data boolean not null default false,
  novotech_partner_price numeric(18,4),
  novotech_partner_currency text,
  novotech_partner_price_effective_at timestamptz,
  novotech_retail_price numeric(18,4),
  novotech_retail_currency text,
  novotech_retail_price_effective_at timestamptz,
  comparison_price numeric(18,4),
  comparison_currency text,
  comparison_basis text check (comparison_basis is null or comparison_basis in ('partner_price','retail_price')),
  comparison_vat_mode text,
  delta_amount numeric(18,4),
  delta_percent numeric(12,4),
  comparison_status text not null check (comparison_status in ('comparable','currency_mismatch','vat_not_comparable','price_unavailable')),
  supersedes_observation_id uuid references public.competitor_price_observations(id) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  check ((competitor_id is not null) <> (submitted_competitor_name is not null)),
  check (submitted_competitor_name is null or char_length(submitted_competitor_name) between 2 and 120),
  check (payment_terms is null or char_length(payment_terms) <= 500),
  check (delivery_terms is null or char_length(delivery_terms) <= 500),
  check (comment is null or char_length(comment) <= 1000),
  check (valid_until is null or valid_until >= observation_date),
  check (novotech_partner_currency is null or novotech_partner_currency ~ '^[A-Z]{3}$'),
  check (novotech_retail_currency is null or novotech_retail_currency ~ '^[A-Z]{3}$'),
  check (comparison_currency is null or comparison_currency ~ '^[A-Z]{3}$'),
  check (comparison_vat_mode is null or comparison_vat_mode in ('included','excluded','not_applicable','not_specified')),
  unique(partner_company_id, created_by, idempotency_key)
);

create table public.competitive_intelligence_observation_evidence (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null unique references public.competitor_price_observations(id) on delete restrict,
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  storage_bucket text not null default 'competitive-intelligence-evidence',
  storage_key text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  file_size bigint not null check (file_size between 1 and 10485760),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.competitive_intelligence_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,
  submitted_name text not null,
  status text not null default 'pending' check (status in ('pending','resolved','ignored')),
  resolved_competitor_id uuid references public.competitive_intelligence_competitors(id) on delete restrict,
  observation_count integer not null default 1 check (observation_count > 0),
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  resolved_by uuid references public.user_profiles(id) on delete restrict,
  resolved_at timestamptz,
  check ((status = 'resolved') = (resolved_competitor_id is not null))
);

create table public.competitive_intelligence_observation_reviews (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.competitor_price_observations(id) on delete restrict,
  decision text not null check (decision in ('include','exclude','evidence_verified','evidence_rejected')),
  reason text not null check (char_length(reason) between 5 and 500),
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.competitive_intelligence_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'observation_created','observation_superseded','evidence_attached','competitor_reconciled',
    'outlier_reviewed','evidence_reviewed','recommendation_generated','recommendation_acknowledged','signal_suppressed','signal_restored'
  )),
  observation_id uuid references public.competitor_price_observations(id) on delete restrict,
  competitor_id uuid references public.competitive_intelligence_competitors(id) on delete restrict,
  product_id uuid references public.catalog_products(id) on delete restrict,
  partner_company_id uuid references public.partner_companies(id) on delete restrict,
  actor_user_id uuid references public.user_profiles(id) on delete restrict,
  correlation_id uuid not null default gen_random_uuid(),
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check (jsonb_typeof(safe_metadata) = 'object' and pg_column_size(safe_metadata) <= 4096),
  check (lower(safe_metadata::text) !~ '(password|secret|authorization|access_token|refresh_token|comment|payment_terms|delivery_terms)')
);

create table public.competitive_market_price_aggregates (
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  competitor_id uuid not null references public.competitive_intelligence_competitors(id) on delete cascade,
  window_days integer not null check (window_days in (7,30,90,36500)),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  vat_mode text not null check (vat_mode in ('included','excluded','not_applicable','not_specified')),
  quantity_cohort text not null check (quantity_cohort in ('single','small','large')),
  min_price numeric(18,4) not null,
  p25_price numeric(18,4) not null,
  median_price numeric(18,4) not null,
  p75_price numeric(18,4) not null,
  max_price numeric(18,4) not null,
  latest_price numeric(18,4) not null,
  novotech_comparison_median numeric(18,4),
  previous_period_median numeric(18,4),
  trend_percent numeric(12,4),
  observation_count integer not null check (observation_count > 0),
  unique_company_count integer not null check (unique_company_count > 0),
  confidence_level text not null check (confidence_level in ('low','medium','high')),
  latest_observation_date date not null,
  updated_at timestamptz not null default now(),
  primary key(product_id, competitor_id, window_days, currency, vat_mode, quantity_cohort)
);

create table public.competitive_signals (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  competitor_id uuid references public.competitive_intelligence_competitors(id) on delete cascade,
  signal_type text not null check (signal_type in ('PRICING_REVIEW','COMPETITOR_PRICE_DROP','COMPETITIVE_ADVANTAGE','DEMAND_SIGNAL')),
  window_days integer not null default 30 check (window_days in (7,30,90)),
  severity text not null check (severity in ('low','medium','high')),
  evidence jsonb not null,
  source_fingerprint text not null unique,
  generated_at timestamptz not null default now(),
  check (jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 4096)
);

create table public.competitive_signal_reviews (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null,
  source_fingerprint text not null,
  action text not null check (action in ('suppress','restore')),
  reason text not null check (char_length(reason) between 5 and 500),
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.competitive_recommendations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  recommendation_type text not null check (recommendation_type in ('PRICING_REVIEW')),
  window_days integer not null default 30,
  status text not null default 'open' check (status in ('open','acknowledged','suppressed','expired')),
  evidence jsonb not null,
  source_fingerprint text not null,
  generated_at timestamptz not null default now(),
  acknowledged_by uuid references public.user_profiles(id) on delete restrict,
  acknowledged_at timestamptz,
  unique(product_id, recommendation_type, source_fingerprint),
  check (jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 4096)
);

create table public.competitive_intelligence_dirty_products (
  product_id uuid primary key references public.catalog_products(id) on delete cascade,
  reason text not null,
  first_dirtied_at timestamptz not null default now(),
  last_dirtied_at timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz,
  last_error_code text
);

create index competitive_competitor_status_name_idx on public.competitive_intelligence_competitors(status, display_name);
create index competitive_alias_competitor_idx on public.competitive_intelligence_competitor_aliases(competitor_id);
create index competitive_observation_company_product_date_idx on public.competitor_price_observations(partner_company_id, product_id, observation_date desc, created_at desc);
create index competitive_observation_product_competitor_date_idx on public.competitor_price_observations(product_id, competitor_id, observation_date desc);
create index competitive_observation_competitor_date_idx on public.competitor_price_observations(competitor_id, observation_date desc) where competitor_id is not null;
create index competitive_observation_status_date_idx on public.competitor_price_observations(status, observation_date desc);
create index competitive_observation_supersedes_idx on public.competitor_price_observations(supersedes_observation_id) where supersedes_observation_id is not null;
create index competitive_evidence_company_idx on public.competitive_intelligence_observation_evidence(partner_company_id, created_at desc);
create index competitive_reviews_observation_idx on public.competitive_intelligence_observation_reviews(observation_id, created_at desc);
create index competitive_events_product_time_idx on public.competitive_intelligence_events(product_id, occurred_at desc) where product_id is not null;
create index competitive_events_company_time_idx on public.competitive_intelligence_events(partner_company_id, occurred_at desc) where partner_company_id is not null;
create index competitive_aggregate_window_product_idx on public.competitive_market_price_aggregates(window_days, product_id, confidence_level, updated_at desc);
create index competitive_aggregate_competitor_idx on public.competitive_market_price_aggregates(competitor_id, window_days, product_id);
create index competitive_signals_product_idx on public.competitive_signals(product_id, generated_at desc);
create index competitive_signal_reviews_fingerprint_idx on public.competitive_signal_reviews(source_fingerprint, created_at desc);
create index competitive_recommendations_status_idx on public.competitive_recommendations(status, generated_at desc);
create index competitive_dirty_claim_idx on public.competitive_intelligence_dirty_products(locked_at, first_dirtied_at);

create trigger competitive_competitors_set_updated_at
before update on public.competitive_intelligence_competitors
for each row execute function public.set_updated_at();

alter table public.competitive_intelligence_competitors enable row level security;
alter table public.competitive_intelligence_competitor_aliases enable row level security;
alter table public.competitor_price_observations enable row level security;
alter table public.competitive_intelligence_observation_evidence enable row level security;
alter table public.competitive_intelligence_reconciliation_queue enable row level security;
alter table public.competitive_intelligence_observation_reviews enable row level security;
alter table public.competitive_intelligence_events enable row level security;
alter table public.competitive_market_price_aggregates enable row level security;
alter table public.competitive_signals enable row level security;
alter table public.competitive_signal_reviews enable row level security;
alter table public.competitive_recommendations enable row level security;
alter table public.competitive_intelligence_dirty_products enable row level security;

revoke all on public.competitive_intelligence_competitors,
  public.competitive_intelligence_competitor_aliases,
  public.competitor_price_observations,
  public.competitive_intelligence_observation_evidence,
  public.competitive_intelligence_reconciliation_queue,
  public.competitive_intelligence_observation_reviews,
  public.competitive_intelligence_events,
  public.competitive_market_price_aggregates,
  public.competitive_signals,
  public.competitive_signal_reviews,
  public.competitive_recommendations,
  public.competitive_intelligence_dirty_products
from public, anon, authenticated;

grant select, insert, update, delete on public.competitive_intelligence_competitors,
  public.competitive_intelligence_competitor_aliases,
  public.competitor_price_observations,
  public.competitive_intelligence_observation_evidence,
  public.competitive_intelligence_reconciliation_queue,
  public.competitive_intelligence_observation_reviews,
  public.competitive_intelligence_events,
  public.competitive_market_price_aggregates,
  public.competitive_signals,
  public.competitive_signal_reviews,
  public.competitive_recommendations,
  public.competitive_intelligence_dirty_products
to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('competitive-intelligence-evidence', 'competitive-intelligence-evidence', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.normalize_competitive_intelligence_name(value text)
returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(value,'')), '[[:space:][:punct:]]+', '', 'g'))
$$;
revoke all on function public.normalize_competitive_intelligence_name(text) from public, anon;
revoke all on function public.normalize_competitive_intelligence_name(text) from authenticated;
grant execute on function public.normalize_competitive_intelligence_name(text) to service_role;

insert into public.competitive_intelligence_competitors(canonical_name, display_name, normalized_name)
values ('Exterior', 'Exterior', public.normalize_competitive_intelligence_name('Exterior'))
on conflict (normalized_name) do update set display_name = excluded.display_name, status = 'active', updated_at = now();

insert into public.competitive_intelligence_competitor_aliases(competitor_id, alias, normalized_alias)
select competitor.id, alias.value, public.normalize_competitive_intelligence_name(alias.value)
from public.competitive_intelligence_competitors competitor
cross join (values ('EXTERIOR'),('Exterior Security'),('Exterior SRL')) alias(value)
where competitor.normalized_name = public.normalize_competitive_intelligence_name('Exterior')
on conflict (normalized_alias) do nothing;

create or replace function public.prevent_competitive_intelligence_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Competitive intelligence history is append-only.' using errcode = '55000';
end; $$;
revoke all on function public.prevent_competitive_intelligence_history_mutation() from public, anon, authenticated;

create trigger immutable_competitor_price_observations before update or delete on public.competitor_price_observations
for each row execute function public.prevent_competitive_intelligence_history_mutation();
create trigger immutable_competitive_evidence before update or delete on public.competitive_intelligence_observation_evidence
for each row execute function public.prevent_competitive_intelligence_history_mutation();
create trigger immutable_competitive_reviews before update or delete on public.competitive_intelligence_observation_reviews
for each row execute function public.prevent_competitive_intelligence_history_mutation();
create trigger immutable_competitive_signal_reviews before update or delete on public.competitive_signal_reviews
for each row execute function public.prevent_competitive_intelligence_history_mutation();
create trigger immutable_competitive_events before update or delete on public.competitive_intelligence_events
for each row execute function public.prevent_competitive_intelligence_history_mutation();

create or replace function public.can_access_competitive_intelligence(p_company_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.has_active_company_membership(p_company_id)
    and public.has_permission(p_company_id, p_permission)
$$;
revoke all on function public.can_access_competitive_intelligence(uuid,text) from public, anon;
grant execute on function public.can_access_competitive_intelligence(uuid,text) to authenticated;

create or replace function public.get_partner_product_competitive_intelligence(
  p_company_id uuid, p_product_id uuid, p_window_days integer default 30, p_limit integer default 30
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_window_days not in (7,30,90,36500) or p_limit not between 1 and 50
    or not public.can_access_competitive_intelligence(p_company_id, 'competitive_intelligence.view') then
    raise exception 'Competitive intelligence access denied.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.catalog_products product where product.id = p_product_id and product.is_active and product.is_visible) then
    raise exception 'Product is unavailable.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'canManage', public.has_permission(p_company_id, 'competitive_intelligence.manage'),
    'windowDays', p_window_days,
    'competitors', (
      select coalesce(jsonb_agg(jsonb_build_object('id',competitor.id,'name',competitor.display_name) order by competitor.display_name), '[]'::jsonb)
      from public.competitive_intelligence_competitors competitor where competitor.status = 'active'
    ),
    'observations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', item.id, 'date', item.observation_date, 'competitorName', item.competitor_name,
        'price', item.observed_price, 'currency', item.currency, 'vatMode', item.vat_mode,
        'quantity', item.quantity, 'quantityCohort', item.quantity_cohort, 'sourceType', item.source_type,
        'confidence', item.confidence_level, 'possibleOutlier', item.possible_outlier,
        'novotechPrice', item.comparison_price, 'novotechCurrency', item.comparison_currency,
        'comparisonBasis', item.comparison_basis, 'comparisonStatus', item.comparison_status,
        'deltaAmount', item.delta_amount, 'deltaPercent', item.delta_percent,
        'hasEvidence', item.has_evidence, 'evidenceId', item.evidence_id, 'supersedesObservationId', item.supersedes_observation_id,
        'isSuperseded', item.is_superseded, 'createdAt', item.created_at
      ) order by item.observation_date desc, item.created_at desc), '[]'::jsonb)
      from (
        select observation.*,
          coalesce(competitor.display_name, resolved.display_name, observation.submitted_competitor_name) competitor_name,
          (evidence.id is not null) has_evidence, evidence.id evidence_id,
          exists(select 1 from public.competitor_price_observations newer where newer.supersedes_observation_id = observation.id) is_superseded
        from public.competitor_price_observations observation
        left join public.competitive_intelligence_competitors competitor on competitor.id = observation.competitor_id
        left join public.competitive_intelligence_reconciliation_queue queue on queue.normalized_name = observation.normalized_submitted_competitor_name
        left join public.competitive_intelligence_competitors resolved on resolved.id = queue.resolved_competitor_id
        left join public.competitive_intelligence_observation_evidence evidence on evidence.observation_id = observation.id
        where observation.partner_company_id = p_company_id and observation.product_id = p_product_id
          and observation.observation_date >= current_date - p_window_days
        order by observation.observation_date desc, observation.created_at desc limit p_limit
      ) item
    ),
    'summary', (
      select jsonb_build_object(
        'observationCount', count(*), 'latestDate', max(observation.observation_date),
        'latestCompetitorPrice', (array_agg(observation.observed_price order by observation.observation_date desc,observation.created_at desc))[1],
        'latestCurrency', (array_agg(observation.currency order by observation.observation_date desc,observation.created_at desc))[1],
        'latestNovotechPrice', (array_agg(observation.comparison_price order by observation.observation_date desc,observation.created_at desc))[1],
        'latestNovotechCurrency', (array_agg(observation.comparison_currency order by observation.observation_date desc,observation.created_at desc))[1],
        'latestDeltaAmount', (array_agg(observation.delta_amount order by observation.observation_date desc,observation.created_at desc))[1],
        'latestDeltaPercent', (array_agg(observation.delta_percent order by observation.observation_date desc,observation.created_at desc))[1]
      )
      from public.competitor_price_observations observation
      where observation.partner_company_id = p_company_id and observation.product_id = p_product_id
        and observation.observation_date >= current_date - p_window_days and observation.status = 'active'
        and not exists(select 1 from public.competitor_price_observations newer where newer.supersedes_observation_id = observation.id)
    )
  );
end; $$;
revoke all on function public.get_partner_product_competitive_intelligence(uuid,uuid,integer,integer) from public, anon;
grant execute on function public.get_partner_product_competitive_intelligence(uuid,uuid,integer,integer) to authenticated;

create or replace function public.create_competitor_price_observation(
  p_company_id uuid, p_product_id uuid, p_competitor_id uuid, p_submitted_competitor_name text,
  p_observed_price numeric, p_currency text, p_vat_mode text, p_quantity numeric,
  p_observation_date date, p_source_type text, p_valid_until date,
  p_payment_terms text, p_delivery_terms text, p_comment text,
  p_idempotency_key uuid, p_supersedes_observation_id uuid default null,
  p_evidence jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  normalized_submitted_name text;
  resolved_competitor uuid;
  existing public.competitor_price_observations;
  created public.competitor_price_observations;
  company public.partner_companies;
  partner_price record;
  retail_price record;
  comparison_amount numeric;
  comparison_currency text;
  comparison_basis text;
  comparison_status text;
  confidence text;
  recent_median numeric;
  outlier boolean := false;
  fingerprint text;
  evidence_file_size bigint;
begin
  if actor is null or not public.can_access_competitive_intelligence(p_company_id, 'competitive_intelligence.manage') then
    raise exception 'Competitive intelligence mutation denied.' using errcode = '42501';
  end if;
  if p_observed_price <= 0 or upper(btrim(p_currency)) !~ '^[A-Z]{3}$'
    or p_vat_mode not in ('included','excluded','not_applicable','not_specified')
    or p_quantity <= 0 or p_quantity > 1000000
    or p_observation_date > current_date or p_observation_date < current_date - 1825
    or p_source_type not in ('verbal','message','quotation','order','invoice','other')
    or (p_valid_until is not null and p_valid_until < p_observation_date)
    or char_length(coalesce(p_payment_terms,'')) > 500
    or char_length(coalesce(p_delivery_terms,'')) > 500
    or char_length(coalesce(p_comment,'')) > 1000 then
    raise exception 'Competitive price input is invalid.' using errcode = '22023';
  end if;
  if (p_competitor_id is null) = (nullif(btrim(p_submitted_competitor_name),'') is null) then
    raise exception 'Select a competitor or submit another name.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.catalog_products product where product.id = p_product_id and product.is_active and product.is_visible) then
    raise exception 'Product is unavailable.' using errcode = 'P0002';
  end if;
  select * into company from public.partner_companies candidate where candidate.id = p_company_id and candidate.status = 'active';
  if company.id is null then raise exception 'Company is unavailable.' using errcode = '42501'; end if;

  if p_competitor_id is not null then
    select competitor.id into resolved_competitor from public.competitive_intelligence_competitors competitor
    where competitor.id = p_competitor_id and competitor.status = 'active';
    if resolved_competitor is null then raise exception 'Competitor is unavailable.' using errcode = '22023'; end if;
  else
    normalized_submitted_name := public.normalize_competitive_intelligence_name(p_submitted_competitor_name);
    if char_length(normalized_submitted_name) < 2 then raise exception 'Competitor name is invalid.' using errcode = '22023'; end if;
    select coalesce(alias.competitor_id, competitor.id) into resolved_competitor
    from (select 1) seed
    left join public.competitive_intelligence_competitor_aliases alias on alias.normalized_alias = normalized_submitted_name
    left join public.competitive_intelligence_competitors competitor on competitor.normalized_name = normalized_submitted_name and competitor.status = 'active'
    where alias.competitor_id is not null or competitor.id is not null limit 1;
  end if;

  fingerprint := md5(concat_ws('|',p_company_id,p_product_id,coalesce(resolved_competitor::text,normalized_submitted_name),p_observed_price,upper(btrim(p_currency)),p_vat_mode,p_quantity,p_observation_date,p_source_type));
  select * into existing from public.competitor_price_observations observation
  where observation.partner_company_id = p_company_id and observation.created_by = actor and observation.idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if existing.request_fingerprint <> fingerprint then raise exception 'Idempotency key conflict.' using errcode = 'PT409'; end if;
    return jsonb_build_object('id',existing.id,'duplicate',false,'idempotent',true,'comparisonStatus',existing.comparison_status,'deltaAmount',existing.delta_amount,'deltaPercent',existing.delta_percent);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_company_id,p_product_id,coalesce(resolved_competitor::text,normalized_submitted_name),p_observed_price,upper(btrim(p_currency)),p_quantity,p_observation_date), 0));
  select * into existing from public.competitor_price_observations observation
  where observation.partner_company_id = p_company_id and observation.product_id = p_product_id
    and coalesce(observation.competitor_id::text,observation.normalized_submitted_competitor_name) = coalesce(resolved_competitor::text,normalized_submitted_name)
    and observation.observed_price = p_observed_price and observation.currency = upper(btrim(p_currency))
    and observation.quantity = p_quantity and observation.observation_date between p_observation_date - 1 and p_observation_date + 1
    and observation.status = 'active' and not observation.is_test_data
  order by observation.created_at desc limit 1;
  if existing.id is not null then
    return jsonb_build_object('id',existing.id,'duplicate',true,'idempotent',false,'comparisonStatus',existing.comparison_status,'deltaAmount',existing.delta_amount,'deltaPercent',existing.delta_percent);
  end if;

  if p_supersedes_observation_id is not null and not exists(
    select 1 from public.competitor_price_observations previous
    where previous.id = p_supersedes_observation_id and previous.partner_company_id = p_company_id and previous.product_id = p_product_id
      and not exists(select 1 from public.competitor_price_observations newer where newer.supersedes_observation_id = previous.id)
  ) then raise exception 'Observation correction conflict.' using errcode = 'PT409'; end if;

  select price.price_amount amount, upper(price.currency) currency, price.effective_at
  into partner_price from public.product_prices price
  where price.product_id = p_product_id and company.external_1c_price_type_id is not null
    and price.external_1c_price_type_id = company.external_1c_price_type_id
    and price.is_active and price.is_published and price.currency_status = 'resolved'
    and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
  order by price.effective_at desc, price.updated_at desc limit 1;
  select price.price_amount amount, upper(price.currency) currency, price.effective_at
  into retail_price from public.product_prices price join public.price_types type on type.id = price.price_type_id
  where price.product_id = p_product_id and type.external_code = 'UU-000020'
    and price.is_active and price.is_published and price.currency_status = 'resolved'
    and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
  order by price.effective_at desc, price.updated_at desc limit 1;

  comparison_amount := coalesce(partner_price.amount, retail_price.amount);
  comparison_currency := coalesce(partner_price.currency, retail_price.currency);
  comparison_basis := case when partner_price.amount is not null then 'partner_price' when retail_price.amount is not null then 'retail_price' end;
  comparison_status := case
    when comparison_amount is null then 'price_unavailable'
    when comparison_currency <> upper(btrim(p_currency)) then 'currency_mismatch'
    when p_vat_mode <> 'not_specified' then 'vat_not_comparable'
    else 'comparable' end;
  confidence := case
    when p_source_type in ('quotation','order','invoice') and p_evidence is not null then 'high'
    when p_source_type in ('message','quotation','order','invoice') then 'medium'
    else 'low' end;

  select percentile_cont(0.5) within group(order by observation.observed_price)::numeric into recent_median
  from public.competitor_price_observations observation
  left join public.competitive_intelligence_reconciliation_queue queue on queue.normalized_name = observation.normalized_submitted_competitor_name
  where observation.product_id = p_product_id and coalesce(observation.competitor_id,queue.resolved_competitor_id) = resolved_competitor
    and observation.currency = upper(btrim(p_currency)) and observation.vat_mode = p_vat_mode
    and observation.quantity_cohort = case when p_quantity = 1 then 'single' when p_quantity <= 10 then 'small' else 'large' end
    and observation.observation_date >= current_date - 90 and observation.status = 'active' and not observation.is_test_data
  having count(*) >= 3;
  outlier := (recent_median is not null and (p_observed_price > recent_median * 10 or p_observed_price < recent_median / 10))
    or (comparison_status = 'comparable' and (p_observed_price > comparison_amount * 10 or p_observed_price < comparison_amount / 10));

  insert into public.competitor_price_observations(
    partner_company_id,product_id,competitor_id,submitted_competitor_name,normalized_submitted_competitor_name,
    observed_price,currency,vat_mode,quantity,observation_date,source_type,valid_until,payment_terms,delivery_terms,comment,
    confidence_level,possible_outlier,novotech_partner_price,novotech_partner_currency,novotech_partner_price_effective_at,
    novotech_retail_price,novotech_retail_currency,novotech_retail_price_effective_at,
    comparison_price,comparison_currency,comparison_basis,comparison_vat_mode,delta_amount,delta_percent,comparison_status,
    supersedes_observation_id,created_by,idempotency_key,request_fingerprint
  ) values (
    p_company_id,p_product_id,resolved_competitor,
    case when resolved_competitor is null then btrim(p_submitted_competitor_name) end,
    case when resolved_competitor is null then normalized_submitted_name end,
    p_observed_price,upper(btrim(p_currency)),p_vat_mode,p_quantity,p_observation_date,p_source_type,p_valid_until,
    nullif(btrim(p_payment_terms),''),nullif(btrim(p_delivery_terms),''),nullif(btrim(p_comment),''),
    confidence,outlier,partner_price.amount,partner_price.currency,partner_price.effective_at,
    retail_price.amount,retail_price.currency,retail_price.effective_at,
    comparison_amount,comparison_currency,comparison_basis,'not_specified',
    case when comparison_status = 'comparable' then comparison_amount - p_observed_price end,
    case when comparison_status = 'comparable' and p_observed_price > 0 then round((comparison_amount - p_observed_price) / p_observed_price * 100,4) end,
    comparison_status,p_supersedes_observation_id,actor,p_idempotency_key,fingerprint
  ) returning * into created;

  if resolved_competitor is null then
    insert into public.competitive_intelligence_reconciliation_queue(normalized_name,submitted_name)
    values(normalized_submitted_name,btrim(p_submitted_competitor_name))
    on conflict(normalized_name) do update set observation_count = public.competitive_intelligence_reconciliation_queue.observation_count + 1,
      last_observed_at = now();
  end if;
  if p_evidence is not null then
    if jsonb_typeof(p_evidence) <> 'object'
      or coalesce(p_evidence->>'fileSize','') !~ '^[0-9]+$' then
      raise exception 'Evidence metadata is invalid.' using errcode = '22023';
    end if;
    evidence_file_size := (p_evidence->>'fileSize')::bigint;
    if coalesce(p_evidence->>'storageKey','') = ''
      or coalesce(p_evidence->>'fileName','') = ''
      or coalesce(p_evidence->>'mimeType','') not in ('image/jpeg','image/png','image/webp','application/pdf')
      or evidence_file_size not between 1 and 10485760
      or coalesce(p_evidence->>'checksumSha256','') !~ '^[a-f0-9]{64}$'
      or p_evidence->>'storageKey' not like p_company_id::text || '/' || p_product_id::text || '/%'
      or not exists(select 1 from storage.objects object
        where object.bucket_id = 'competitive-intelligence-evidence' and object.name = p_evidence->>'storageKey') then
      raise exception 'Evidence metadata is invalid.' using errcode = '22023';
    end if;
    insert into public.competitive_intelligence_observation_evidence(
      observation_id,partner_company_id,storage_key,file_name,mime_type,file_size,checksum_sha256,uploaded_by
    ) values(created.id,p_company_id,p_evidence->>'storageKey',left(p_evidence->>'fileName',240),p_evidence->>'mimeType',evidence_file_size,p_evidence->>'checksumSha256',actor);
  end if;
  insert into public.competitive_intelligence_events(event_type,observation_id,competitor_id,product_id,partner_company_id,actor_user_id,correlation_id,safe_metadata)
  values('observation_created',created.id,resolved_competitor,p_product_id,p_company_id,actor,p_idempotency_key,
    jsonb_build_object('sourceType',p_source_type,'confidence',confidence,'possibleOutlier',outlier,'comparisonStatus',comparison_status));
  if p_supersedes_observation_id is not null then
    insert into public.competitive_intelligence_events(event_type,observation_id,competitor_id,product_id,partner_company_id,actor_user_id,correlation_id,safe_metadata)
    values('observation_superseded',created.id,resolved_competitor,p_product_id,p_company_id,actor,p_idempotency_key,jsonb_build_object('supersededObservationId',p_supersedes_observation_id));
  end if;
  if p_evidence is not null then
    insert into public.competitive_intelligence_events(event_type,observation_id,competitor_id,product_id,partner_company_id,actor_user_id,correlation_id,safe_metadata)
    values('evidence_attached',created.id,resolved_competitor,p_product_id,p_company_id,actor,p_idempotency_key,jsonb_build_object('mimeType',p_evidence->>'mimeType','fileSize',evidence_file_size));
  end if;
  insert into public.competitive_intelligence_dirty_products(product_id,reason)
  values(p_product_id,'observation_created') on conflict(product_id) do update set reason = excluded.reason,last_dirtied_at = now(),locked_at = null,last_error_code = null;
  return jsonb_build_object('id',created.id,'duplicate',false,'idempotent',false,'comparisonStatus',created.comparison_status,
    'deltaAmount',created.delta_amount,'deltaPercent',created.delta_percent,'confidence',created.confidence_level,'possibleOutlier',created.possible_outlier);
end; $$;
revoke all on function public.create_competitor_price_observation(uuid,uuid,uuid,text,numeric,text,text,numeric,date,text,date,text,text,text,uuid,uuid,jsonb) from public, anon;
grant execute on function public.create_competitor_price_observation(uuid,uuid,uuid,text,numeric,text,text,numeric,date,text,date,text,text,text,uuid,uuid,jsonb) to authenticated;

create or replace function public.get_competitive_intelligence_evidence_descriptor(p_company_id uuid,p_evidence_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare evidence public.competitive_intelligence_observation_evidence;
begin
  select * into evidence from public.competitive_intelligence_observation_evidence item where item.id = p_evidence_id;
  if evidence.id is null then return null; end if;
  if not ((public.can_access_competitive_intelligence(p_company_id,'competitive_intelligence.view') and evidence.partner_company_id = p_company_id)
    or public.has_internal_permission('admin.analytics.view')) then raise exception 'Evidence access denied.' using errcode = '42501'; end if;
  return jsonb_build_object('bucket',evidence.storage_bucket,'key',evidence.storage_key,'fileName',evidence.file_name,'mimeType',evidence.mime_type,'size',evidence.file_size);
end; $$;
revoke all on function public.get_competitive_intelligence_evidence_descriptor(uuid,uuid) from public, anon;
grant execute on function public.get_competitive_intelligence_evidence_descriptor(uuid,uuid) to authenticated;

create or replace function public.refresh_competitive_price_intelligence(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target record; processed integer := 0; generated integer := 0; generated_for_product integer := 0;
begin
  if p_limit not between 1 and 100 or (auth.uid() is not null and not public.has_internal_permission('admin.analytics.view')) then
    raise exception 'Competitive intelligence refresh denied.' using errcode = '42501';
  end if;
  for target in
    select dirty.product_id from public.competitive_intelligence_dirty_products dirty
    where dirty.locked_at is null or dirty.locked_at < now() - interval '10 minutes'
    order by dirty.first_dirtied_at for update skip locked limit p_limit
  loop
    update public.competitive_intelligence_dirty_products set locked_at = now(), attempts = attempts + 1 where product_id = target.product_id;
    delete from public.competitive_market_price_aggregates aggregate where aggregate.product_id = target.product_id;
    with effective as (
      select observation.*,coalesce(observation.competitor_id,queue.resolved_competitor_id) effective_competitor_id,
        coalesce(review.decision,'unreviewed') review_decision
      from public.competitor_price_observations observation
      left join public.competitive_intelligence_reconciliation_queue queue on queue.normalized_name = observation.normalized_submitted_competitor_name
      left join lateral (
        select candidate.decision from public.competitive_intelligence_observation_reviews candidate
        where candidate.observation_id = observation.id and candidate.decision in ('include','exclude') order by candidate.created_at desc limit 1
      ) review on true
      where observation.product_id = target.product_id and observation.status = 'active' and not observation.is_test_data
        and not exists(select 1 from public.competitor_price_observations newer where newer.supersedes_observation_id = observation.id)
    ), windows as (select unnest(array[7,30,90,36500]) window_days),
    current_group as (
      select effective.product_id,effective.effective_competitor_id competitor_id,windows.window_days,effective.currency,effective.vat_mode,effective.quantity_cohort,
        min(effective.observed_price) min_price,
        percentile_cont(0.25) within group(order by effective.observed_price)::numeric p25_price,
        percentile_cont(0.5) within group(order by effective.observed_price)::numeric median_price,
        percentile_cont(0.75) within group(order by effective.observed_price)::numeric p75_price,
        max(effective.observed_price) max_price,
        (array_agg(effective.observed_price order by effective.observation_date desc,effective.created_at desc))[1] latest_price,
        (percentile_cont(0.5) within group(order by effective.comparison_price)
          filter (where effective.comparison_status = 'comparable'))::numeric novotech_comparison_median,
        count(*)::integer observation_count,count(distinct effective.partner_company_id)::integer unique_company_count,
        max(effective.observation_date) latest_observation_date
      from effective cross join windows
      where effective.effective_competitor_id is not null and effective.review_decision <> 'exclude'
        and effective.observation_date >= current_date - windows.window_days
        and not (effective.possible_outlier and effective.confidence_level = 'low' and effective.review_decision <> 'include')
      group by effective.product_id,effective.effective_competitor_id,windows.window_days,effective.currency,effective.vat_mode,effective.quantity_cohort
    ), previous_group as (
      select effective.product_id,effective.effective_competitor_id competitor_id,windows.window_days,effective.currency,effective.vat_mode,effective.quantity_cohort,
        percentile_cont(0.5) within group(order by effective.observed_price)::numeric previous_median
      from effective cross join windows
      where effective.effective_competitor_id is not null and effective.review_decision <> 'exclude'
        and effective.observation_date < current_date - windows.window_days
        and effective.observation_date >= current_date - windows.window_days * 2
        and not (effective.possible_outlier and effective.confidence_level = 'low' and effective.review_decision <> 'include')
      group by effective.product_id,effective.effective_competitor_id,windows.window_days,effective.currency,effective.vat_mode,effective.quantity_cohort
    )
    insert into public.competitive_market_price_aggregates(
      product_id,competitor_id,window_days,currency,vat_mode,quantity_cohort,min_price,p25_price,median_price,p75_price,max_price,
      latest_price,novotech_comparison_median,previous_period_median,trend_percent,observation_count,unique_company_count,confidence_level,latest_observation_date,updated_at
    )
    select current.product_id,current.competitor_id,current.window_days,current.currency,current.vat_mode,current.quantity_cohort,
      current.min_price,current.p25_price,current.median_price,current.p75_price,current.max_price,current.latest_price,current.novotech_comparison_median,previous.previous_median,
      case when previous.previous_median > 0 then round((current.median_price-previous.previous_median)/previous.previous_median*100,4) end,
      current.observation_count,current.unique_company_count,
      case when current.unique_company_count >= 3 and current.observation_count >= 5 then 'high'
        when current.unique_company_count >= 2 and current.observation_count >= 3 then 'medium' else 'low' end,
      current.latest_observation_date,now()
    from current_group current left join previous_group previous using(product_id,competitor_id,window_days,currency,vat_mode,quantity_cohort);

    delete from public.competitive_signals signal where signal.product_id = target.product_id;
    with cohorts as (
      select aggregate.*, aggregate.novotech_comparison_median novotech_median
      from public.competitive_market_price_aggregates aggregate
      where aggregate.product_id = target.product_id and aggregate.window_days = 30
    ), proposed as (
      select cohort.*,
        case
          when cohort.confidence_level = 'high' and cohort.novotech_median > 0 and cohort.median_price <= cohort.novotech_median * 0.95 then 'PRICING_REVIEW'
          when cohort.confidence_level in ('medium','high') and cohort.previous_period_median > 0 and cohort.median_price <= cohort.previous_period_median * 0.90 then 'COMPETITOR_PRICE_DROP'
          when cohort.confidence_level = 'high' and cohort.novotech_median > 0 and cohort.novotech_median <= cohort.median_price * 0.95 then 'COMPETITIVE_ADVANTAGE'
          when cohort.unique_company_count >= 3 and cohort.observation_count >= 5 then 'DEMAND_SIGNAL'
        end signal_type
      from cohorts cohort
    )
    insert into public.competitive_signals(product_id,competitor_id,signal_type,window_days,severity,evidence,source_fingerprint)
    select proposed.product_id,proposed.competitor_id,proposed.signal_type,30,
      case when proposed.confidence_level = 'high' then 'high' else 'medium' end,
      jsonb_build_object('marketMedian',proposed.median_price,'novotechComparison',proposed.novotech_median,'currency',proposed.currency,
        'vatMode',proposed.vat_mode,'quantityCohort',proposed.quantity_cohort,'observations',proposed.observation_count,
        'uniqueCompanies',proposed.unique_company_count,'trendPercent',proposed.trend_percent,'confidence',proposed.confidence_level),
      md5(concat_ws('|',proposed.product_id,proposed.competitor_id,proposed.signal_type,proposed.currency,proposed.vat_mode,
        proposed.quantity_cohort,proposed.median_price,proposed.novotech_median,proposed.observation_count,proposed.unique_company_count))
    from proposed where proposed.signal_type is not null;

    insert into public.competitive_recommendations(product_id,recommendation_type,window_days,evidence,source_fingerprint)
    select signal.product_id,'PRICING_REVIEW',30,signal.evidence,
      signal.source_fingerprint
    from public.competitive_signals signal
    where signal.product_id = target.product_id and signal.signal_type = 'PRICING_REVIEW'
    on conflict(product_id,recommendation_type,source_fingerprint) do nothing;
    get diagnostics generated_for_product = row_count;
    update public.competitive_recommendations recommendation set status='open',generated_at=now()
    where recommendation.product_id=target.product_id and recommendation.status='expired'
      and exists(select 1 from public.competitive_signals signal where signal.product_id=target.product_id
        and signal.signal_type='PRICING_REVIEW' and signal.source_fingerprint=recommendation.source_fingerprint);
    update public.competitive_recommendations recommendation set status='expired'
    where recommendation.product_id=target.product_id and recommendation.status in ('open','acknowledged')
      and not exists(select 1 from public.competitive_signals signal where signal.product_id=target.product_id
        and signal.signal_type='PRICING_REVIEW' and signal.source_fingerprint=recommendation.source_fingerprint);
    if generated_for_product > 0 then
      insert into public.competitive_intelligence_events(event_type,product_id,safe_metadata)
      values('recommendation_generated',target.product_id,jsonb_build_object('recommendationCount',generated_for_product,'windowDays',30));
    end if;
    generated := generated + generated_for_product;
    delete from public.competitive_intelligence_dirty_products dirty where dirty.product_id = target.product_id;
    processed := processed + 1;
  end loop;
  return jsonb_build_object('processedProducts',processed,'generatedRecommendations',generated);
end; $$;
revoke all on function public.refresh_competitive_price_intelligence(integer) from public, anon, authenticated;
grant execute on function public.refresh_competitive_price_intelligence(integer) to service_role;

create or replace function public.get_admin_market_intelligence(p_window_days integer default 30,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') or p_window_days not in (7,30,90,36500)
    or p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'Market intelligence access denied.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'summary',jsonb_build_object(
      'observations',(select count(*) from public.competitor_price_observations where not is_test_data),
      'companies',(select count(distinct partner_company_id) from public.competitor_price_observations where not is_test_data),
      'products',(select count(distinct product_id) from public.competitor_price_observations where not is_test_data),
      'competitors',(select count(*) from public.competitive_intelligence_competitors where status = 'active'),
      'pendingCompetitors',(select count(*) from public.competitive_intelligence_reconciliation_queue where status = 'pending'),
      'freshestObservation',(select max(observation_date) from public.competitor_price_observations where not is_test_data)
    ),
    'products',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'productId',item.product_id,'sku',item.sku,'productName',item.product_name,'competitorId',item.competitor_id,
        'competitorName',item.competitor_name,'currency',item.currency,'vatMode',item.vat_mode,'quantityCohort',item.quantity_cohort,
        'marketMedian',item.median_price,'min',item.min_price,'p25',item.p25_price,'p75',item.p75_price,'max',item.max_price,
        'latest',item.latest_price,'novotechComparison',item.novotech_comparison_median,'trendPercent',item.trend_percent,'observations',item.observation_count,
        'uniqueCompanies',item.unique_company_count,'confidence',item.confidence_level,'latestDate',item.latest_observation_date,
        'recommendation',item.recommendation_type
      ) order by item.observation_count desc,item.product_name), '[]'::jsonb)
      from (
        select aggregate.*,product.sku,product.name product_name,competitor.display_name competitor_name,recommendation.recommendation_type
        from public.competitive_market_price_aggregates aggregate
        join public.catalog_products product on product.id = aggregate.product_id
        join public.competitive_intelligence_competitors competitor on competitor.id = aggregate.competitor_id
        left join lateral(select current.recommendation_type from public.competitive_recommendations current
          where current.product_id = aggregate.product_id and current.status = 'open' order by current.generated_at desc limit 1) recommendation on true
        where aggregate.window_days = p_window_days
        order by aggregate.observation_count desc,product.name limit p_limit offset p_offset
      ) item
    ),
    'pendingCompetitors',(
      select coalesce(jsonb_agg(jsonb_build_object('id',queue.id,'name',queue.submitted_name,'observationCount',queue.observation_count,'lastObservedAt',queue.last_observed_at) order by queue.last_observed_at desc),'[]'::jsonb)
      from public.competitive_intelligence_reconciliation_queue queue where queue.status = 'pending'
    ),
    'competitors',(
      select coalesce(jsonb_agg(jsonb_build_object('id',competitor.id,'name',competitor.display_name)
        order by competitor.display_name),'[]'::jsonb)
      from public.competitive_intelligence_competitors competitor where competitor.status = 'active'
    ),
    'recommendations',(
      select coalesce(jsonb_agg(jsonb_build_object('id',recommendation.id,'productId',recommendation.product_id,'sku',product.sku,
        'productName',product.name,'type',recommendation.recommendation_type,'status',recommendation.status,'evidence',recommendation.evidence,
        'generatedAt',recommendation.generated_at) order by recommendation.generated_at desc),'[]'::jsonb)
      from public.competitive_recommendations recommendation join public.catalog_products product on product.id = recommendation.product_id
      where recommendation.status in ('open','acknowledged')
    )
  );
end; $$;
revoke all on function public.get_admin_market_intelligence(integer,integer,integer) from public, anon;
grant execute on function public.get_admin_market_intelligence(integer,integer,integer) to authenticated;

create or replace function public.get_admin_competitor_intelligence(p_competitor_id uuid,p_window_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') or p_window_days not in (7,30,90,36500) then raise exception 'Access denied.' using errcode='42501'; end if;
  return (select jsonb_build_object('id',competitor.id,'name',competitor.display_name,'status',competitor.status,
    'aliases',(select coalesce(jsonb_agg(alias.alias order by alias.alias),'[]'::jsonb) from public.competitive_intelligence_competitor_aliases alias where alias.competitor_id=competitor.id),
    'categories',(select coalesce(jsonb_agg(category_name order by category_name),'[]'::jsonb) from (
      select distinct category.name category_name from public.competitive_market_price_aggregates aggregate
      join public.catalog_products product on product.id=aggregate.product_id
      join public.catalog_categories category on category.id=product.category_id
      where aggregate.competitor_id=competitor.id and aggregate.window_days=p_window_days
    ) categories),
    'lowerThanNovotechProducts',(select count(distinct aggregate.product_id) from public.competitive_market_price_aggregates aggregate
      where aggregate.competitor_id=competitor.id and aggregate.window_days=p_window_days
        and aggregate.novotech_comparison_median is not null and aggregate.median_price < aggregate.novotech_comparison_median),
    'higherThanNovotechProducts',(select count(distinct aggregate.product_id) from public.competitive_market_price_aggregates aggregate
      where aggregate.competitor_id=competitor.id and aggregate.window_days=p_window_days
        and aggregate.novotech_comparison_median is not null and aggregate.median_price > aggregate.novotech_comparison_median),
    'medianPriceChangeIntervalDays',(select round(percentile_cont(0.5) within group(order by change_days)::numeric,1) from (
      select observation_date-previous_date change_days from (
        select observation.observation_date,observation.observed_price,
          lag(observation.observation_date) over(partition by observation.product_id order by observation.observation_date,observation.created_at) previous_date,
          lag(observation.observed_price) over(partition by observation.product_id order by observation.observation_date,observation.created_at) previous_price
        from public.competitor_price_observations observation
        left join public.competitive_intelligence_reconciliation_queue queue on queue.normalized_name=observation.normalized_submitted_competitor_name
        where coalesce(observation.competitor_id,queue.resolved_competitor_id)=competitor.id and not observation.is_test_data
          and observation.status='active' and observation.observation_date>=current_date-p_window_days
      ) ordered where previous_date is not null and observed_price is distinct from previous_price
    ) changes),
    'products',(select coalesce(jsonb_agg(jsonb_build_object('productId',aggregate.product_id,'sku',product.sku,'name',product.name,
      'median',aggregate.median_price,'novotechComparison',aggregate.novotech_comparison_median,'currency',aggregate.currency,
      'relativePosition',case when aggregate.novotech_comparison_median is null then 'unknown'
        when aggregate.median_price < aggregate.novotech_comparison_median then 'competitor_lower'
        when aggregate.median_price > aggregate.novotech_comparison_median then 'novotech_lower' else 'parity' end,
      'trendPercent',aggregate.trend_percent,'observations',aggregate.observation_count,
      'uniqueCompanies',aggregate.unique_company_count,'confidence',aggregate.confidence_level) order by aggregate.observation_count desc),'[]'::jsonb)
      from public.competitive_market_price_aggregates aggregate join public.catalog_products product on product.id=aggregate.product_id
      where aggregate.competitor_id=competitor.id and aggregate.window_days=p_window_days))
    from public.competitive_intelligence_competitors competitor where competitor.id=p_competitor_id);
end; $$;
revoke all on function public.get_admin_competitor_intelligence(uuid,integer) from public, anon;
grant execute on function public.get_admin_competitor_intelligence(uuid,integer) to authenticated;

create or replace function public.get_admin_product_market_intelligence(p_product_id uuid,p_window_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') or p_window_days not in (7,30,90,36500) then raise exception 'Access denied.' using errcode='42501'; end if;
  return (select jsonb_build_object('id',product.id,'sku',product.sku,'name',product.name,
    'cohorts',(select coalesce(jsonb_agg(jsonb_build_object('competitorId',aggregate.competitor_id,'competitorName',competitor.display_name,
      'currency',aggregate.currency,'vatMode',aggregate.vat_mode,'quantityCohort',aggregate.quantity_cohort,'median',aggregate.median_price,
      'novotechComparison',aggregate.novotech_comparison_median,
      'min',aggregate.min_price,'max',aggregate.max_price,'trendPercent',aggregate.trend_percent,'observations',aggregate.observation_count,
      'uniqueCompanies',aggregate.unique_company_count,'confidence',aggregate.confidence_level) order by competitor.display_name),'[]'::jsonb)
      from public.competitive_market_price_aggregates aggregate join public.competitive_intelligence_competitors competitor on competitor.id=aggregate.competitor_id
      where aggregate.product_id=product.id and aggregate.window_days=p_window_days),
    'signals',(select coalesce(jsonb_agg(jsonb_build_object('id',signal.id,'type',signal.signal_type,'severity',signal.severity,
      'evidence',signal.evidence,'generatedAt',signal.generated_at,'reviewAction',review.action) order by signal.generated_at desc),'[]'::jsonb)
      from public.competitive_signals signal
      left join lateral(select candidate.action from public.competitive_signal_reviews candidate where candidate.source_fingerprint=signal.source_fingerprint
        order by candidate.created_at desc limit 1) review on true
      where signal.product_id=product.id and signal.window_days=p_window_days),
    'timeline',(select coalesce(jsonb_agg(jsonb_build_object('observationId',observation.id,'date',observation.observation_date,
      'competitorName',coalesce(competitor.display_name,resolved.display_name,observation.submitted_competitor_name),
      'price',observation.observed_price,'currency',observation.currency,'vatMode',observation.vat_mode,'quantity',observation.quantity,
      'confidence',observation.confidence_level,'possibleOutlier',observation.possible_outlier,'hasEvidence',evidence.id is not null,'evidenceId',evidence.id,
      'reviewDecision',review.decision) order by observation.observation_date desc,observation.created_at desc) ,'[]'::jsonb)
      from (select * from public.competitor_price_observations candidate where candidate.product_id=product.id and not candidate.is_test_data
        and candidate.observation_date>=current_date-p_window_days order by candidate.observation_date desc,candidate.created_at desc limit 100) observation
      left join public.competitive_intelligence_competitors competitor on competitor.id=observation.competitor_id
      left join public.competitive_intelligence_reconciliation_queue queue on queue.normalized_name=observation.normalized_submitted_competitor_name
      left join public.competitive_intelligence_competitors resolved on resolved.id=queue.resolved_competitor_id
      left join public.competitive_intelligence_observation_evidence evidence on evidence.observation_id=observation.id
      left join lateral(select candidate.decision from public.competitive_intelligence_observation_reviews candidate
        where candidate.observation_id=observation.id order by candidate.created_at desc limit 1) review on true))
    from public.catalog_products product where product.id=p_product_id);
end; $$;
revoke all on function public.get_admin_product_market_intelligence(uuid,integer) from public, anon;
grant execute on function public.get_admin_product_market_intelligence(uuid,integer) to authenticated;

create or replace function public.admin_reconcile_competitive_intelligence_competitor(
  p_queue_id uuid,p_competitor_id uuid,p_canonical_name text,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); queue public.competitive_intelligence_reconciliation_queue; target uuid; normalized text;
begin
  if actor is null or not public.has_internal_permission('admin.market_intelligence.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  if char_length(btrim(p_reason)) < 5 or ((p_competitor_id is null) = (nullif(btrim(p_canonical_name),'') is null)) then raise exception 'Reconciliation input is invalid.' using errcode='22023'; end if;
  select * into queue from public.competitive_intelligence_reconciliation_queue candidate where candidate.id=p_queue_id for update;
  if queue.id is null or queue.status<>'pending' then raise exception 'Reconciliation state changed.' using errcode='PT409'; end if;
  if p_competitor_id is not null then
    select id into target from public.competitive_intelligence_competitors where id=p_competitor_id and status='active';
  else
    normalized:=public.normalize_competitive_intelligence_name(p_canonical_name);
    insert into public.competitive_intelligence_competitors(canonical_name,display_name,normalized_name,created_by)
    values(btrim(p_canonical_name),btrim(p_canonical_name),normalized,actor)
    on conflict(normalized_name) do update set updated_at=now() returning id into target;
  end if;
  if target is null then raise exception 'Competitor is unavailable.' using errcode='22023'; end if;
  if exists(select 1 from public.competitive_intelligence_competitor_aliases alias
    where alias.normalized_alias=queue.normalized_name and alias.competitor_id<>target) then
    raise exception 'Competitor alias belongs to another canonical identity.' using errcode='PT409';
  end if;
  insert into public.competitive_intelligence_competitor_aliases(competitor_id,alias,normalized_alias,created_by)
  values(target,queue.submitted_name,queue.normalized_name,actor) on conflict(normalized_alias) do nothing;
  update public.competitive_intelligence_reconciliation_queue set status='resolved',resolved_competitor_id=target,resolved_by=actor,resolved_at=now() where id=queue.id;
  insert into public.competitive_intelligence_events(event_type,competitor_id,actor_user_id,safe_metadata)
  values('competitor_reconciled',target,actor,jsonb_build_object('queueId',queue.id,'reason',left(btrim(p_reason),200)));
  insert into public.competitive_intelligence_dirty_products(product_id,reason)
  select distinct observation.product_id,'competitor_reconciled' from public.competitor_price_observations observation where observation.normalized_submitted_competitor_name=queue.normalized_name
  on conflict(product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  return jsonb_build_object('competitorId',target,'queueId',queue.id);
end; $$;
revoke all on function public.admin_reconcile_competitive_intelligence_competitor(uuid,uuid,text,text) from public, anon;
grant execute on function public.admin_reconcile_competitive_intelligence_competitor(uuid,uuid,text,text) to authenticated;

create or replace function public.admin_review_competitive_price_observation(p_observation_id uuid,p_decision text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); review_id uuid; target public.competitor_price_observations;
begin
  if actor is null or not public.has_internal_permission('admin.market_intelligence.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  if p_decision not in ('include','exclude','evidence_verified','evidence_rejected') or char_length(btrim(p_reason))<5 then raise exception 'Review input is invalid.' using errcode='22023'; end if;
  select * into target from public.competitor_price_observations where id=p_observation_id;
  if target.id is null then raise exception 'Observation not found.' using errcode='P0002'; end if;
  insert into public.competitive_intelligence_observation_reviews(observation_id,decision,reason,actor_user_id)
  values(target.id,p_decision,btrim(p_reason),actor) returning id into review_id;
  insert into public.competitive_intelligence_events(event_type,observation_id,competitor_id,product_id,partner_company_id,actor_user_id,safe_metadata)
  values(case when p_decision in ('evidence_verified','evidence_rejected') then 'evidence_reviewed' else 'outlier_reviewed' end,
    target.id,target.competitor_id,target.product_id,target.partner_company_id,actor,jsonb_build_object('decision',p_decision,'reviewId',review_id));
  insert into public.competitive_intelligence_dirty_products(product_id,reason) values(target.product_id,'observation_reviewed')
  on conflict(product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  return review_id;
end; $$;
revoke all on function public.admin_review_competitive_price_observation(uuid,text,text) from public, anon;
grant execute on function public.admin_review_competitive_price_observation(uuid,text,text) to authenticated;

create or replace function public.admin_review_competitive_signal(p_signal_id uuid,p_action text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.competitive_signals; review_id uuid;
begin
  if actor is null or not public.has_internal_permission('admin.market_intelligence.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  if p_action not in ('suppress','restore') or char_length(btrim(p_reason))<5 then raise exception 'Signal review input is invalid.' using errcode='22023'; end if;
  select * into target from public.competitive_signals where id=p_signal_id;
  if target.id is null then raise exception 'Signal not found.' using errcode='P0002'; end if;
  insert into public.competitive_signal_reviews(signal_id,source_fingerprint,action,reason,actor_user_id)
  values(target.id,target.source_fingerprint,p_action,btrim(p_reason),actor) returning id into review_id;
  update public.competitive_recommendations set
    status=case when p_action='suppress' then 'suppressed' else 'open' end,
    acknowledged_by=actor,acknowledged_at=now()
  where source_fingerprint=target.source_fingerprint and status in ('open','acknowledged','suppressed');
  insert into public.competitive_intelligence_events(event_type,competitor_id,product_id,actor_user_id,safe_metadata)
  values(case when p_action='suppress' then 'signal_suppressed' else 'signal_restored' end,target.competitor_id,target.product_id,actor,
    jsonb_build_object('signalId',target.id,'signalReviewId',review_id,'reason',left(btrim(p_reason),200)));
  return review_id;
end; $$;
revoke all on function public.admin_review_competitive_signal(uuid,text,text) from public, anon;
grant execute on function public.admin_review_competitive_signal(uuid,text,text) to authenticated;

create or replace function public.admin_acknowledge_competitive_recommendation(p_recommendation_id uuid,p_action text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.competitive_recommendations;
begin
  if actor is null or not public.has_internal_permission('admin.market_intelligence.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  if p_action not in ('acknowledge','suppress') or char_length(btrim(p_reason))<5 then raise exception 'Recommendation action is invalid.' using errcode='22023'; end if;
  select * into target from public.competitive_recommendations where id=p_recommendation_id for update;
  if target.id is null or target.status not in ('open','acknowledged') then raise exception 'Recommendation state changed.' using errcode='PT409'; end if;
  update public.competitive_recommendations set status=case when p_action='acknowledge' then 'acknowledged' else 'suppressed' end,
    acknowledged_by=actor,acknowledged_at=now() where id=target.id;
  insert into public.competitive_intelligence_events(event_type,product_id,actor_user_id,safe_metadata)
  values(case when p_action='acknowledge' then 'recommendation_acknowledged' else 'signal_suppressed' end,target.product_id,actor,
    jsonb_build_object('recommendationId',target.id,'reason',left(btrim(p_reason),200)));
end; $$;
revoke all on function public.admin_acknowledge_competitive_recommendation(uuid,text,text) from public, anon;
grant execute on function public.admin_acknowledge_competitive_recommendation(uuid,text,text) to authenticated;

comment on table public.competitor_price_observations is 'Portal-owned, append-only competitor price observations. Novotech/RETAIL fields are immutable comparison snapshots only; 1C remains commercial truth.';
comment on table public.competitive_market_price_aggregates is 'Local asynchronous market-price read model, cohort-separated by currency, VAT mode, and quantity.';
comment on table public.competitive_recommendations is 'Advisory internal recommendations only. Never changes Novotech or 1C prices.';

commit;
