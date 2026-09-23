-- Agent commercial cabinet V1. 1C remains the accounting authority; these
-- tables are governed Portal projections and workflow records only.

insert into public.permissions (code, description)
values
  ('admin.agent_commercial.view', 'View Commercial Agent sale and reward projections.'),
  ('admin.agent_commercial.manage', 'Link 1C sales and manage commission classifications.'),
  ('admin.agent_rewards.approve', 'Review and approve Commercial Agent reward projections.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in (
  'admin.agent_commercial.view', 'admin.agent_commercial.manage', 'admin.agent_rewards.approve'
)
where role.code = 'novotech_admin'
on conflict do nothing;

create sequence public.agent_referral_code_seq start with 1 increment by 1 no cycle;

create or replace function private.next_agent_referral_code()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select 'REF-' || extract(year from current_date)::integer || '-' ||
    lpad(nextval('public.agent_referral_code_seq')::text, 6, '0');
$$;

alter table public.agent_referrals
  add column referral_code text not null default private.next_agent_referral_code();
alter table public.agent_referrals
  add constraint agent_referrals_code_unique unique (referral_code),
  add constraint agent_referrals_code_check check (referral_code ~ '^REF-[0-9]{4}-[0-9]{6,}$');
alter table public.agent_referrals drop constraint agent_referrals_contact_check;
alter table public.agent_referrals add constraint agent_referrals_contact_check check (
  phone_snapshot is not null or email_snapshot is not null or identity_resolution_reason = 'EXACT_1C_REF'
);

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in (
  'admin.agents.view', 'admin.agent_commercial.view', 'admin.agent_rewards.approve'
)
where role.code = 'novotech_finance'
on conflict do nothing;

create table public.agent_1c_bindings (
  agent_id uuid primary key references public.commercial_agents(id) on delete restrict,
  source_agent_1c_id text not null unique,
  source_external_code text not null,
  source_fiscal_code text null,
  source_name_snapshot text not null,
  linked_by uuid not null references public.user_profiles(id) on delete restrict,
  linked_at timestamptz not null default now(),
  verified_at timestamptz not null default now(),
  constraint agent_1c_bindings_ref_check check (
    source_agent_1c_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint agent_1c_bindings_code_check check (char_length(btrim(source_external_code)) between 1 and 80),
  constraint agent_1c_bindings_name_check check (char_length(btrim(source_name_snapshot)) between 1 and 240)
);

create table public.agent_commission_policies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  effective_from date not null,
  effective_until date null,
  status text not null,
  created_by uuid null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint agent_commission_policies_code_check check (code ~ '^[A-Z0-9_-]{3,80}$'),
  constraint agent_commission_policies_status_check check (status in ('DRAFT', 'ACTIVE', 'RETIRED')),
  constraint agent_commission_policies_dates_check check (effective_until is null or effective_until >= effective_from)
);

create table public.agent_commission_policy_rates (
  policy_id uuid not null references public.agent_commission_policies(id) on delete restrict,
  classification text not null,
  rate_percent numeric(7,4) not null,
  primary key (policy_id, classification),
  constraint agent_commission_policy_rates_classification_check check (
    classification in ('EQUIPMENT', 'NOVOTECH_INSTALLATION', 'EXCLUDED')
  ),
  constraint agent_commission_policy_rates_rate_check check (rate_percent between 0 and 100)
);

with policy as (
  insert into public.agent_commission_policies (code, effective_from, status)
  values ('AGENT_V1_2026', date '2026-01-01', 'ACTIVE')
  returning id
)
insert into public.agent_commission_policy_rates (policy_id, classification, rate_percent)
select policy.id, rate.classification, rate.rate_percent
from policy
cross join (values
  ('EQUIPMENT', 4.0000::numeric),
  ('NOVOTECH_INSTALLATION', 8.0000::numeric),
  ('EXCLUDED', 0.0000::numeric)
) rate(classification, rate_percent);

create unique index agent_commission_policies_active_window_idx
  on public.agent_commission_policies (effective_from)
  where status = 'ACTIVE';

create table public.agent_nomenclature_commission_classifications (
  source_nomenclature_1c_ref text primary key,
  source_name_snapshot text not null,
  classification text not null,
  classified_by uuid not null references public.user_profiles(id) on delete restrict,
  classified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_nomenclature_classifications_ref_check check (
    source_nomenclature_1c_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint agent_nomenclature_classifications_name_check check (char_length(btrim(source_name_snapshot)) between 1 and 300),
  constraint agent_nomenclature_classifications_value_check check (
    classification in ('EQUIPMENT', 'NOVOTECH_INSTALLATION', 'EXCLUDED')
  )
);

create table public.agent_sale_links (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.commercial_agents(id) on delete restrict,
  referral_id uuid not null references public.agent_referrals(id) on delete restrict,
  attribution_id uuid not null references public.agent_attributions(id) on delete restrict,
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  source_order_1c_ref text not null,
  source_order_number_snapshot text not null,
  source_order_date_snapshot date not null,
  source_customer_1c_ref text not null,
  source_customer_name_snapshot text not null,
  source_order_gross_snapshot numeric(16,2) not null,
  source_currency_snapshot text not null,
  link_status text not null default 'ACTIVE',
  linked_by uuid not null references public.user_profiles(id) on delete restrict,
  linked_at timestamptz not null default now(),
  verified_at timestamptz not null default now(),
  constraint agent_sale_links_order_ref_check check (
    source_order_1c_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint agent_sale_links_customer_ref_check check (
    source_customer_1c_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint agent_sale_links_number_check check (char_length(btrim(source_order_number_snapshot)) between 1 and 80),
  constraint agent_sale_links_customer_name_check check (char_length(btrim(source_customer_name_snapshot)) between 1 and 240),
  constraint agent_sale_links_amount_check check (source_order_gross_snapshot >= 0),
  constraint agent_sale_links_currency_check check (source_currency_snapshot ~ '^[A-Z]{3}$'),
  constraint agent_sale_links_status_check check (link_status in ('ACTIVE', 'REVOKED', 'RECONCILIATION_REQUIRED'))
);

create unique index agent_sale_links_active_order_idx
  on public.agent_sale_links (source_order_1c_ref) where link_status = 'ACTIVE';
create unique index agent_sale_links_active_referral_order_idx
  on public.agent_sale_links (referral_id, source_order_1c_ref) where link_status = 'ACTIVE';
create index agent_sale_links_agent_order_date_idx
  on public.agent_sale_links (agent_id, source_order_date_snapshot desc, id)
  where link_status = 'ACTIVE';

create table public.agent_sale_projections (
  sale_link_id uuid primary key references public.agent_sale_links(id) on delete restrict,
  state text not null,
  source_order_state text null,
  source_order_posted boolean not null,
  source_order_deletion_marked boolean not null,
  source_realization_refs text[] not null default '{}',
  realized_at timestamptz null,
  gross_realized_amount numeric(16,2) not null default 0,
  vat_amount numeric(16,2) not null default 0,
  net_realized_amount numeric(16,2) not null default 0,
  paid_gross_amount numeric(16,2) not null default 0,
  remaining_gross_amount numeric(16,2) null,
  payment_state text not null,
  fully_paid_at timestamptz null,
  source_version text not null,
  source_observed_at timestamptz not null,
  refreshed_at timestamptz not null default now(),
  constraint agent_sale_projections_state_check check (state in (
    'LINKED', 'REALIZED', 'PARTIALLY_PAID', 'FULLY_PAID', 'CANCELLED', 'RECONCILIATION_REQUIRED'
  )),
  constraint agent_sale_projections_payment_check check (payment_state in ('UNPAID', 'PARTIALLY_PAID', 'FULLY_PAID', 'RECONCILIATION_REQUIRED')),
  constraint agent_sale_projections_amounts_check check (
    gross_realized_amount >= 0 and vat_amount >= 0 and net_realized_amount >= 0 and
    paid_gross_amount >= 0 and (remaining_gross_amount is null or remaining_gross_amount >= 0) and
    gross_realized_amount = net_realized_amount + vat_amount
  ),
  constraint agent_sale_projections_fully_paid_check check (
    (payment_state = 'FULLY_PAID') = (fully_paid_at is not null)
  )
);

create table public.agent_sale_projection_lines (
  id uuid primary key default gen_random_uuid(),
  sale_link_id uuid not null references public.agent_sale_links(id) on delete restrict,
  source_line_ref text not null,
  source_realization_1c_ref text null,
  source_nomenclature_1c_ref text not null,
  source_name_snapshot text not null,
  gross_amount numeric(16,2) not null,
  vat_amount numeric(16,2) not null,
  net_amount numeric(16,2) not null,
  classification text null,
  classification_status text not null,
  unique (sale_link_id, source_line_ref),
  constraint agent_sale_projection_lines_realization_ref_check check (
    source_realization_1c_ref is null or source_realization_1c_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint agent_sale_projection_lines_nomenclature_ref_check check (
    source_nomenclature_1c_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint agent_sale_projection_lines_amounts_check check (
    gross_amount >= 0 and vat_amount >= 0 and net_amount >= 0 and gross_amount = net_amount + vat_amount
  ),
  constraint agent_sale_projection_lines_classification_check check (
    classification is null or classification in ('EQUIPMENT', 'NOVOTECH_INSTALLATION', 'EXCLUDED')
  ),
  constraint agent_sale_projection_lines_classification_status_check check (
    classification_status in ('CLASSIFIED', 'BLOCKED_FROM_CALCULATION')
  ),
  constraint agent_sale_projection_lines_classification_consistency_check check (
    (classification_status = 'CLASSIFIED') = (classification is not null)
  )
);

create index agent_sale_projection_lines_link_idx on public.agent_sale_projection_lines (sale_link_id);
create index agent_sale_projection_lines_unclassified_idx
  on public.agent_sale_projection_lines (source_nomenclature_1c_ref)
  where classification_status = 'BLOCKED_FROM_CALCULATION';

create table public.agent_reward_projections (
  sale_link_id uuid primary key references public.agent_sale_links(id) on delete restrict,
  policy_id uuid not null references public.agent_commission_policies(id) on delete restrict,
  state text not null,
  classification_complete boolean not null,
  equipment_net_amount numeric(16,2) not null default 0,
  installation_net_amount numeric(16,2) not null default 0,
  excluded_net_amount numeric(16,2) not null default 0,
  equipment_rate_percent numeric(7,4) not null,
  installation_rate_percent numeric(7,4) not null,
  forecast_reward_amount numeric(16,2) not null default 0,
  currency text not null,
  reviewed_by uuid null references public.user_profiles(id) on delete restrict,
  reviewed_at timestamptz null,
  approved_by uuid null references public.user_profiles(id) on delete restrict,
  approved_at timestamptz null,
  paid_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint agent_reward_projections_state_check check (state in (
    'FORECAST', 'ELIGIBLE', 'FINANCE_REVIEW', 'APPROVED', 'READY_FOR_PAYOUT', 'PAID', 'ADJUSTED', 'BLOCKED'
  )),
  constraint agent_reward_projections_amounts_check check (
    equipment_net_amount >= 0 and installation_net_amount >= 0 and excluded_net_amount >= 0 and forecast_reward_amount >= 0
  ),
  constraint agent_reward_projections_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint agent_reward_projections_paid_check check (state <> 'PAID' or paid_at is not null)
);

create table public.agent_reward_events (
  id uuid primary key default gen_random_uuid(),
  sale_link_id uuid not null references public.agent_sale_links(id) on delete restrict,
  from_state text null,
  to_state text not null,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  reason text null,
  created_at timestamptz not null default now(),
  constraint agent_reward_events_reason_check check (reason is null or char_length(btrim(reason)) <= 1000)
);

alter table public.agent_domain_events drop constraint agent_domain_events_type_check;
alter table public.agent_domain_events add constraint agent_domain_events_type_check check (event_type in (
  'AGENT_CREATED', 'AGENT_STATUS_CHANGED', 'AGENT_PROFILE_UPDATED',
  'AGENT_CONTRACT_CONFIRMED', 'COMPLIANCE_DECIDED', 'TOKEN_CREATED',
  'TOKEN_REVOKED', 'REFERRAL_CAPTURED', 'REFERRAL_STATUS_CHANGED',
  'ATTRIBUTION_CREATED', 'ATTRIBUTION_EXTENDED', 'ATTRIBUTION_CONFLICT',
  'ATTRIBUTION_REASSIGNED', 'ATTRIBUTION_TERMINATED', 'AGENT_1C_LINKED',
  'AGENT_SALE_LINKED', 'AGENT_SALE_REFRESHED', 'AGENT_REWARD_STATUS_CHANGED'
));

create or replace function public.link_commercial_agent_1c_record(
  p_agent_id uuid,
  p_source_agent_1c_id text,
  p_source_external_code text,
  p_source_fiscal_code text,
  p_source_name_snapshot text,
  p_actor_user_id uuid
)
returns public.agent_1c_bindings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.commercial_agents;
  binding public.agent_1c_bindings;
begin
  select * into target from public.commercial_agents where id = p_agent_id for update;
  if target.id is null then raise exception 'Commercial Agent not found.' using errcode = 'P0002'; end if;
  if target.source_agent_1c_id is not null and target.source_agent_1c_id <> lower(p_source_agent_1c_id) then
    raise exception 'Commercial Agent already has a different 1C binding.' using errcode = '23505';
  end if;

  insert into public.agent_1c_bindings (
    agent_id, source_agent_1c_id, source_external_code, source_fiscal_code,
    source_name_snapshot, linked_by
  ) values (
    p_agent_id, lower(p_source_agent_1c_id), btrim(p_source_external_code),
    nullif(btrim(p_source_fiscal_code), ''), btrim(p_source_name_snapshot), p_actor_user_id
  )
  on conflict (agent_id) do update set
    source_external_code = excluded.source_external_code,
    source_fiscal_code = excluded.source_fiscal_code,
    source_name_snapshot = excluded.source_name_snapshot,
    verified_at = now()
  where public.agent_1c_bindings.source_agent_1c_id = excluded.source_agent_1c_id
  returning * into binding;

  if binding.agent_id is null then raise exception '1C binding identity mismatch.' using errcode = '23505'; end if;
  update public.commercial_agents set source_agent_1c_id = binding.source_agent_1c_id where id = p_agent_id;
  if not exists (
    select 1 from public.agent_domain_events
    where agent_id = p_agent_id and event_type = 'AGENT_1C_LINKED'
      and safe_metadata ->> 'sourceAgent1cId' = binding.source_agent_1c_id
  ) then
    insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
    values (p_agent_id, p_actor_user_id, 'AGENT_1C_LINKED', jsonb_build_object(
      'sourceAgent1cId', binding.source_agent_1c_id,
      'sourceExternalCode', binding.source_external_code
    ));
  end if;
  return binding;
end;
$$;

create or replace function public.classify_agent_nomenclature_record(
  p_source_nomenclature_1c_ref text,
  p_source_name_snapshot text,
  p_classification text,
  p_actor_user_id uuid
)
returns public.agent_nomenclature_commission_classifications
language plpgsql
security definer
set search_path = ''
as $$
declare changed public.agent_nomenclature_commission_classifications;
begin
  insert into public.agent_nomenclature_commission_classifications (
    source_nomenclature_1c_ref, source_name_snapshot, classification, classified_by
  ) values (
    lower(p_source_nomenclature_1c_ref), btrim(p_source_name_snapshot), p_classification, p_actor_user_id
  )
  on conflict (source_nomenclature_1c_ref) do update set
    source_name_snapshot = excluded.source_name_snapshot,
    classification = excluded.classification,
    classified_by = excluded.classified_by,
    classified_at = now(),
    updated_at = now()
  returning * into changed;

  update public.agent_sale_projection_lines
  set classification = changed.classification,
      classification_status = 'CLASSIFIED'
  where source_nomenclature_1c_ref = changed.source_nomenclature_1c_ref;

  with aggregates as (
    select line.sale_link_id,
      bool_and(line.classification_status = 'CLASSIFIED') complete,
      coalesce(sum(line.net_amount) filter (where line.classification = 'EQUIPMENT'), 0) equipment_net,
      coalesce(sum(line.net_amount) filter (where line.classification = 'NOVOTECH_INSTALLATION'), 0) installation_net,
      coalesce(sum(line.net_amount) filter (where line.classification = 'EXCLUDED'), 0) excluded_net
    from public.agent_sale_projection_lines line
    where line.sale_link_id in (
      select affected.sale_link_id from public.agent_sale_projection_lines affected
      where affected.source_nomenclature_1c_ref = changed.source_nomenclature_1c_ref
    )
    group by line.sale_link_id
  )
  update public.agent_reward_projections reward
  set classification_complete = aggregate.complete,
      equipment_net_amount = aggregate.equipment_net,
      installation_net_amount = aggregate.installation_net,
      excluded_net_amount = aggregate.excluded_net,
      forecast_reward_amount = round(
        aggregate.equipment_net * reward.equipment_rate_percent / 100 +
        aggregate.installation_net * reward.installation_rate_percent / 100,
        2
      ),
      state = case
        when projection.payment_state = 'FULLY_PAID' and aggregate.complete
          and reward.state not in ('FINANCE_REVIEW', 'APPROVED', 'READY_FOR_PAYOUT', 'PAID', 'ADJUSTED') then 'ELIGIBLE'
        when projection.payment_state = 'FULLY_PAID' and not aggregate.complete then 'BLOCKED'
        when projection.payment_state <> 'FULLY_PAID' then 'FORECAST'
        else reward.state
      end,
      updated_at = now()
  from aggregates aggregate
  join public.agent_sale_projections projection on projection.sale_link_id = aggregate.sale_link_id
  where reward.sale_link_id = aggregate.sale_link_id;
  return changed;
end;
$$;

create or replace function public.create_agent_sale_link_record(
  p_agent_id uuid,
  p_referral_id uuid,
  p_attribution_id uuid,
  p_source_order_1c_ref text,
  p_source_order_number text,
  p_source_order_date date,
  p_source_customer_1c_ref text,
  p_source_customer_name text,
  p_source_order_gross numeric,
  p_source_currency text,
  p_actor_user_id uuid
)
returns public.agent_sale_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  attribution public.agent_attributions;
  referral public.agent_referrals;
  existing_link public.agent_sale_links;
  created public.agent_sale_links;
begin
  select * into attribution from public.agent_attributions where id = p_attribution_id for share;
  select * into referral from public.agent_referrals where id = p_referral_id for share;
  if attribution.id is null or referral.id is null then
    raise exception 'Referral attribution not found.' using errcode = 'P0002';
  end if;
  select * into existing_link from public.agent_sale_links
  where source_order_1c_ref = lower(p_source_order_1c_ref) and link_status = 'ACTIVE' for update;
  if existing_link.id is not null then
    if existing_link.agent_id = p_agent_id and existing_link.referral_id = p_referral_id
      and existing_link.attribution_id = p_attribution_id
      and existing_link.source_customer_1c_ref = lower(p_source_customer_1c_ref) then
      return existing_link;
    end if;
    raise exception '1C order already has a different active Agent sale link.' using errcode = '23505';
  end if;
  if attribution.agent_id <> p_agent_id or attribution.referral_id <> p_referral_id
    or referral.agent_id <> p_agent_id
    or attribution.customer_identity_id <> referral.customer_identity_id
    or attribution.status <> 'ACTIVE' then
    raise exception 'Sale link attribution mismatch.' using errcode = '23514';
  end if;

  insert into public.agent_sale_links (
    agent_id, referral_id, attribution_id, customer_identity_id,
    source_order_1c_ref, source_order_number_snapshot, source_order_date_snapshot,
    source_customer_1c_ref, source_customer_name_snapshot, source_order_gross_snapshot,
    source_currency_snapshot, linked_by
  ) values (
    p_agent_id, p_referral_id, p_attribution_id, attribution.customer_identity_id,
    lower(p_source_order_1c_ref), btrim(p_source_order_number), p_source_order_date,
    lower(p_source_customer_1c_ref), btrim(p_source_customer_name), p_source_order_gross,
    upper(p_source_currency), p_actor_user_id
  ) returning * into created;

  insert into public.agent_domain_events (agent_id, referral_id, attribution_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_referral_id, p_attribution_id, p_actor_user_id, 'AGENT_SALE_LINKED',
    jsonb_build_object('saleLinkId', created.id, 'sourceOrder1cRef', created.source_order_1c_ref,
      'sourceOrderNumber', created.source_order_number_snapshot));
  return created;
end;
$$;

create or replace function public.import_agent_order_referral_record(
  p_agent_id uuid,
  p_source_order_1c_ref text,
  p_source_order_number text,
  p_source_customer_1c_ref text,
  p_source_customer_name text,
  p_customer_kind text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  agent public.commercial_agents;
  token public.agent_referral_tokens;
  identity public.customer_identities;
  existing_attribution public.agent_attributions;
  consent_id uuid;
  referral public.agent_referrals;
  attribution public.agent_attributions;
  existing_link public.agent_sale_links;
begin
  select * into agent from public.commercial_agents where id = p_agent_id for update;
  if agent.id is null or agent.status <> 'ACTIVE' then
    raise exception 'Active Commercial Agent is required.' using errcode = '42501';
  end if;
  if p_customer_kind not in ('PERSON', 'LEGAL_ENTITY') then
    raise exception '1C customer kind is invalid.' using errcode = '22023';
  end if;
  select * into existing_link from public.agent_sale_links
  where source_order_1c_ref = lower(p_source_order_1c_ref) and link_status = 'ACTIVE' for update;
  if existing_link.id is not null then
    if existing_link.agent_id <> p_agent_id or existing_link.source_customer_1c_ref <> lower(p_source_customer_1c_ref) then
      raise exception '1C order already has a different active Agent sale link.' using errcode = '23505';
    end if;
    select * into referral from public.agent_referrals where id = existing_link.referral_id;
    return jsonb_build_object('referralId', existing_link.referral_id, 'referralCode', referral.referral_code,
      'attributionId', existing_link.attribution_id, 'customerIdentityId', existing_link.customer_identity_id,
      'created', false);
  end if;
  select * into token from public.agent_referral_tokens
  where agent_id = p_agent_id and status = 'ACTIVE' and revoked_at is null
    and token_type = 'QR' and campaign_ref is null and public_token is not null
    and (expires_at is null or expires_at > now())
  order by created_at desc limit 1 for share;
  if token.id is null then raise exception 'Fresh active primary referral token is required.' using errcode = '23514'; end if;

  select identity_row.* into identity
  from public.customer_external_refs external_ref
  join public.customer_identities identity_row on identity_row.id = external_ref.customer_identity_id
  where lower(external_ref.system) = '1c' and external_ref.entity_type = 'COUNTERPARTY'
    and lower(external_ref.external_id) = lower(p_source_customer_1c_ref)
    and external_ref.status = 'ACTIVE'
  for update of identity_row;
  if identity.id is null then
    insert into public.customer_identities (identity_kind) values (p_customer_kind) returning * into identity;
    insert into public.customer_external_refs (customer_identity_id, system, entity_type, external_id, verified_at, status)
    values (identity.id, '1C', 'COUNTERPARTY', lower(p_source_customer_1c_ref), now(), 'ACTIVE');
    insert into public.customer_identity_events (customer_identity_id, actor_user_id, event_type, source_context, safe_metadata)
    values
      (identity.id, p_actor_user_id, 'EXTERNAL_REF_ATTACHED', '1C', jsonb_build_object('system', '1C', 'entity_type', 'COUNTERPARTY')),
      (identity.id, p_actor_user_id, 'IDENTITY_CREATED', '1C', jsonb_build_object('origin', 'AGENT_ORDER_REFERRAL_IMPORT'));
  elsif identity.identity_kind <> p_customer_kind then
    raise exception '1C customer identity kind conflicts with the existing Portal identity.' using errcode = '23514';
  end if;

  select * into existing_attribution from public.agent_attributions
  where customer_identity_id = identity.id and status = 'ACTIVE' and ended_at is null for update;
  if existing_attribution.id is not null then
    if existing_attribution.agent_id <> p_agent_id then
      raise exception 'Customer already has an active protected attribution.' using errcode = '23505';
    end if;
    select * into referral from public.agent_referrals where id = existing_attribution.referral_id;
    return jsonb_build_object('referralId', referral.id, 'referralCode', referral.referral_code,
      'attributionId', existing_attribution.id, 'customerIdentityId', identity.id, 'created', false);
  end if;

  insert into public.agent_referral_consents (
    consent_type, consent_text_version, consent_given_at, consent_method, consent_source
  ) values (
    'REFERRAL_CONTACT_PROCESSING', 'agent-order-referral-import-v1', now(), 'ADMIN_RECORDED', 'ADMIN'
  ) returning id into consent_id;
  insert into public.agent_referrals (
    agent_id, customer_identity_id, referral_token_id, consent_id, submitted_at,
    customer_kind, name_snapshot, need_summary, status,
    identity_resolution_status, identity_resolution_reason, reviewed_by, reviewed_at
  ) values (
    p_agent_id, identity.id, token.id, consent_id, now(), p_customer_kind,
    btrim(p_source_customer_name), '1C order ' || btrim(p_source_order_number), 'VERIFIED',
    'MATCHED', 'EXACT_1C_REF', p_actor_user_id, now()
  ) returning * into referral;
  insert into public.agent_attributions (
    customer_identity_id, agent_id, referral_id, valid_from, protection_until, created_by
  ) values (
    identity.id, p_agent_id, referral.id, now(), now() + interval '90 days', p_actor_user_id
  ) returning * into attribution;
  update public.agent_referrals set status = 'ACTIVE' where id = referral.id;
  insert into public.agent_domain_events (agent_id, referral_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, referral.id, p_actor_user_id, 'REFERRAL_CAPTURED', jsonb_build_object(
    'consent_id', consent_id, 'source', 'AGENT_ORDER_REFERRAL_IMPORT',
    'sourceOrder1cRef', lower(p_source_order_1c_ref)
  ));
  insert into public.agent_domain_events (agent_id, referral_id, attribution_id, actor_user_id, event_type)
  values (p_agent_id, referral.id, attribution.id, p_actor_user_id, 'ATTRIBUTION_CREATED');
  return jsonb_build_object('referralId', referral.id, 'referralCode', referral.referral_code,
    'attributionId', attribution.id, 'customerIdentityId', identity.id, 'created', true);
end;
$$;

create or replace function public.upsert_agent_sale_projection_record(
  p_sale_link_id uuid,
  p_source jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.agent_sale_links;
  policy public.agent_commission_policies;
  previous_reward public.agent_reward_projections;
  line jsonb;
  realization_refs text[] := array[]::text[];
  source_state text;
  payment_state text;
  projection_state text;
  complete boolean;
  equipment_net numeric(16,2);
  installation_net numeric(16,2);
  excluded_net numeric(16,2);
  equipment_rate numeric(7,4);
  installation_rate numeric(7,4);
  reward_amount numeric(16,2);
  reward_state text;
begin
  select * into link from public.agent_sale_links where id = p_sale_link_id and link_status = 'ACTIVE' for update;
  if link.id is null then raise exception 'Active Agent sale link not found.' using errcode = 'P0002'; end if;
  if lower(p_source #>> '{order,ref}') <> link.source_order_1c_ref
    or lower(p_source #>> '{order,customerRef}') <> link.source_customer_1c_ref then
    raise exception '1C projection identity mismatch.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_source -> 'lines') <> 'array' or jsonb_array_length(p_source -> 'lines') = 0 then
    raise exception '1C projection lines are required.' using errcode = '22023';
  end if;

  select * into policy from public.agent_commission_policies
  where status = 'ACTIVE' and effective_from <= link.source_order_date_snapshot
    and (effective_until is null or effective_until >= link.source_order_date_snapshot)
  order by effective_from desc limit 1;
  if policy.id is null then raise exception 'No active Agent commission policy.' using errcode = 'P0002'; end if;
  select rate_percent into equipment_rate from public.agent_commission_policy_rates
    where policy_id = policy.id and classification = 'EQUIPMENT';
  select rate_percent into installation_rate from public.agent_commission_policy_rates
    where policy_id = policy.id and classification = 'NOVOTECH_INSTALLATION';

  delete from public.agent_sale_projection_lines where sale_link_id = link.id;
  for line in select value from jsonb_array_elements(p_source -> 'lines') loop
    if (line ->> 'gross')::numeric <> (line ->> 'net')::numeric + (line ->> 'vat')::numeric then
      raise exception '1C line amount equation failed.' using errcode = '23514';
    end if;
    insert into public.agent_sale_projection_lines (
      sale_link_id, source_line_ref, source_realization_1c_ref,
      source_nomenclature_1c_ref, source_name_snapshot,
      gross_amount, vat_amount, net_amount, classification, classification_status
    )
    select link.id, btrim(line ->> 'lineRef'), lower(line ->> 'realizationRef'),
      lower(line ->> 'nomenclatureRef'), btrim(line ->> 'name'),
      (line ->> 'gross')::numeric, (line ->> 'vat')::numeric, (line ->> 'net')::numeric,
      classification.classification,
      case when classification.classification is null then 'BLOCKED_FROM_CALCULATION' else 'CLASSIFIED' end
    from (select 1) seed
    left join public.agent_nomenclature_commission_classifications classification
      on classification.source_nomenclature_1c_ref = lower(line ->> 'nomenclatureRef');
  end loop;

  select coalesce(array_agg(distinct value), '{}') into realization_refs
  from jsonb_array_elements_text(coalesce(p_source #> '{realization,refs}', '[]'::jsonb));
  source_state := nullif(btrim(p_source #>> '{order,state}'), '');
  payment_state := case
    when (p_source #>> '{payment,reconciliationRequired}')::boolean then 'RECONCILIATION_REQUIRED'
    when nullif(p_source #>> '{payment,fullyPaidAt}', '') is not null then 'FULLY_PAID'
    when (p_source #>> '{payment,paidGross}')::numeric > 0 then 'PARTIALLY_PAID'
    else 'UNPAID'
  end;
  projection_state := case
    when (p_source #>> '{order,deletionMarked}')::boolean then 'CANCELLED'
    when payment_state = 'RECONCILIATION_REQUIRED' then 'RECONCILIATION_REQUIRED'
    when payment_state = 'FULLY_PAID' then 'FULLY_PAID'
    when payment_state = 'PARTIALLY_PAID' then 'PARTIALLY_PAID'
    when jsonb_array_length(coalesce(p_source #> '{realization,refs}', '[]'::jsonb)) > 0 then 'REALIZED'
    else 'LINKED'
  end;

  insert into public.agent_sale_projections (
    sale_link_id, state, source_order_state, source_order_posted, source_order_deletion_marked,
    source_realization_refs, realized_at, gross_realized_amount, vat_amount, net_realized_amount,
    paid_gross_amount, remaining_gross_amount, payment_state, fully_paid_at,
    source_version, source_observed_at, refreshed_at
  ) values (
    link.id, projection_state, source_state, (p_source #>> '{order,posted}')::boolean,
    (p_source #>> '{order,deletionMarked}')::boolean, realization_refs,
    nullif(p_source #>> '{realization,realizedAt}', '')::timestamptz,
    (p_source #>> '{realization,gross}')::numeric, (p_source #>> '{realization,vat}')::numeric,
    (p_source #>> '{realization,net}')::numeric, (p_source #>> '{payment,paidGross}')::numeric,
    nullif(p_source #>> '{payment,remainingGross}', '')::numeric, payment_state,
    nullif(p_source #>> '{payment,fullyPaidAt}', '')::timestamptz,
    btrim(p_source ->> 'sourceVersion'), (p_source ->> 'observedAt')::timestamptz, now()
  ) on conflict (sale_link_id) do update set
    state = excluded.state, source_order_state = excluded.source_order_state,
    source_order_posted = excluded.source_order_posted,
    source_order_deletion_marked = excluded.source_order_deletion_marked,
    source_realization_refs = excluded.source_realization_refs, realized_at = excluded.realized_at,
    gross_realized_amount = excluded.gross_realized_amount, vat_amount = excluded.vat_amount,
    net_realized_amount = excluded.net_realized_amount, paid_gross_amount = excluded.paid_gross_amount,
    remaining_gross_amount = excluded.remaining_gross_amount, payment_state = excluded.payment_state,
    fully_paid_at = excluded.fully_paid_at, source_version = excluded.source_version,
    source_observed_at = excluded.source_observed_at, refreshed_at = now();

  select bool_and(classification_status = 'CLASSIFIED'),
    coalesce(sum(net_amount) filter (where classification = 'EQUIPMENT'), 0),
    coalesce(sum(net_amount) filter (where classification = 'NOVOTECH_INSTALLATION'), 0),
    coalesce(sum(net_amount) filter (where classification = 'EXCLUDED'), 0)
  into complete, equipment_net, installation_net, excluded_net
  from public.agent_sale_projection_lines where sale_link_id = link.id;
  reward_amount := round(equipment_net * equipment_rate / 100 + installation_net * installation_rate / 100, 2);
  select * into previous_reward from public.agent_reward_projections where sale_link_id = link.id;
  reward_state := case
    when projection_state in ('CANCELLED', 'RECONCILIATION_REQUIRED') or (payment_state = 'FULLY_PAID' and not complete) then 'BLOCKED'
    when previous_reward.state in ('FINANCE_REVIEW', 'APPROVED', 'READY_FOR_PAYOUT', 'PAID', 'ADJUSTED')
      and payment_state = 'FULLY_PAID' and complete then previous_reward.state
    when payment_state = 'FULLY_PAID' and complete then 'ELIGIBLE'
    else 'FORECAST'
  end;

  insert into public.agent_reward_projections (
    sale_link_id, policy_id, state, classification_complete,
    equipment_net_amount, installation_net_amount, excluded_net_amount,
    equipment_rate_percent, installation_rate_percent, forecast_reward_amount, currency
  ) values (
    link.id, coalesce(previous_reward.policy_id, policy.id), reward_state, complete,
    equipment_net, installation_net, excluded_net, equipment_rate, installation_rate,
    reward_amount, link.source_currency_snapshot
  ) on conflict (sale_link_id) do update set
    state = excluded.state, classification_complete = excluded.classification_complete,
    equipment_net_amount = excluded.equipment_net_amount,
    installation_net_amount = excluded.installation_net_amount,
    excluded_net_amount = excluded.excluded_net_amount,
    forecast_reward_amount = excluded.forecast_reward_amount, updated_at = now();

  insert into public.agent_domain_events (agent_id, referral_id, attribution_id, actor_user_id, event_type, safe_metadata)
  values (link.agent_id, link.referral_id, link.attribution_id, p_actor_user_id, 'AGENT_SALE_REFRESHED',
    jsonb_build_object('saleLinkId', link.id, 'projectionState', projection_state, 'rewardState', reward_state));
  return jsonb_build_object('saleLinkId', link.id, 'saleState', projection_state,
    'rewardState', reward_state, 'rewardAmount', reward_amount, 'classificationComplete', complete);
end;
$$;

create or replace function public.transition_agent_reward_record(
  p_sale_link_id uuid,
  p_target_state text,
  p_actor_user_id uuid,
  p_reason text default null
)
returns public.agent_reward_projections
language plpgsql
security definer
set search_path = ''
as $$
declare current public.agent_reward_projections; changed public.agent_reward_projections; link public.agent_sale_links;
begin
  select * into current from public.agent_reward_projections where sale_link_id = p_sale_link_id for update;
  select * into link from public.agent_sale_links where id = p_sale_link_id;
  if current.sale_link_id is null then raise exception 'Agent reward projection not found.' using errcode = 'P0002'; end if;
  if not (
    (current.state = 'ELIGIBLE' and p_target_state = 'FINANCE_REVIEW') or
    (current.state = 'FINANCE_REVIEW' and p_target_state in ('APPROVED', 'BLOCKED')) or
    (current.state = 'APPROVED' and p_target_state in ('READY_FOR_PAYOUT', 'ADJUSTED')) or
    (current.state = 'READY_FOR_PAYOUT' and p_target_state in ('PAID', 'ADJUSTED')) or
    (current.state = 'PAID' and p_target_state = 'ADJUSTED')
  ) then raise exception 'Invalid Agent reward transition.' using errcode = '23514'; end if;

  update public.agent_reward_projections set state = p_target_state,
    reviewed_by = case when p_target_state = 'FINANCE_REVIEW' then p_actor_user_id else reviewed_by end,
    reviewed_at = case when p_target_state = 'FINANCE_REVIEW' then now() else reviewed_at end,
    approved_by = case when p_target_state = 'APPROVED' then p_actor_user_id else approved_by end,
    approved_at = case when p_target_state = 'APPROVED' then now() else approved_at end,
    paid_at = case when p_target_state = 'PAID' then now() else paid_at end,
    updated_at = now()
  where sale_link_id = p_sale_link_id returning * into changed;
  insert into public.agent_reward_events (sale_link_id, from_state, to_state, actor_user_id, reason)
  values (p_sale_link_id, current.state, p_target_state, p_actor_user_id, nullif(btrim(p_reason), ''));
  insert into public.agent_domain_events (agent_id, referral_id, attribution_id, actor_user_id, event_type, safe_metadata)
  values (link.agent_id, link.referral_id, link.attribution_id, p_actor_user_id, 'AGENT_REWARD_STATUS_CHANGED',
    jsonb_build_object('saleLinkId', p_sale_link_id, 'from', current.state, 'to', p_target_state));
  return changed;
end;
$$;

create or replace function public.list_agent_cabinet_deals(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with agent as (select (private.current_commercial_agent()).*),
  rows as (
    select link.id, referral.name_snapshot as client, link.source_order_number_snapshot as "orderNumber",
      link.source_order_date_snapshot as "orderDate", link.source_currency_snapshot as currency,
      projection.state, projection.source_order_state as "orderState",
      projection.gross_realized_amount as "realizedAmount", projection.payment_state as "paymentState",
      reward.state as "rewardState", reward.forecast_reward_amount as "rewardAmount"
    from public.agent_sale_links link join agent on agent.id = link.agent_id and agent.status = 'ACTIVE'
    join public.agent_referrals referral on referral.id = link.referral_id
    left join public.agent_sale_projections projection on projection.sale_link_id = link.id
    left join public.agent_reward_projections reward on reward.sale_link_id = link.id
    where link.link_status = 'ACTIVE'
    order by link.source_order_date_snapshot desc, link.id
    limit least(greatest(p_limit, 1), 20) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(row_to_json(rows)) from rows), '[]'::jsonb),
    'total', (select count(*) from public.agent_sale_links link join agent on agent.id = link.agent_id where link.link_status = 'ACTIVE')
  );
$$;

create or replace function public.get_agent_cabinet_deal(p_sale_link_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(row) from (
    select link.id, referral.name_snapshot as client, link.source_order_number_snapshot as "orderNumber",
      link.source_order_date_snapshot as "orderDate", link.source_currency_snapshot as currency,
      projection.state, projection.source_order_state as "orderState",
      projection.gross_realized_amount as "realizedAmount", projection.vat_amount as "vatAmount",
      projection.net_realized_amount as "netRealizedAmount", projection.payment_state as "paymentState",
      projection.fully_paid_at as "fullyPaidAt", reward.state as "rewardState",
      reward.equipment_net_amount as "equipmentNetAmount",
      reward.installation_net_amount as "installationNetAmount",
      reward.excluded_net_amount as "excludedNetAmount",
      reward.equipment_rate_percent as "equipmentRatePercent",
      reward.installation_rate_percent as "installationRatePercent",
      reward.forecast_reward_amount as "rewardAmount", reward.classification_complete as "classificationComplete"
    from public.agent_sale_links link
    join public.commercial_agents agent on agent.id = link.agent_id and agent.user_id = auth.uid() and agent.status = 'ACTIVE'
    join public.agent_referrals referral on referral.id = link.referral_id
    left join public.agent_sale_projections projection on projection.sale_link_id = link.id
    left join public.agent_reward_projections reward on reward.sale_link_id = link.id
    where link.id = p_sale_link_id and link.link_status = 'ACTIVE'
  ) row;
$$;

create or replace function public.get_agent_cabinet_rewards()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with agent as (select (private.current_commercial_agent()).*), own as (
    select reward.*, link.source_order_number_snapshot, link.source_order_date_snapshot
    from public.agent_reward_projections reward
    join public.agent_sale_links link on link.id = reward.sale_link_id
    join agent on agent.id = link.agent_id and agent.status = 'ACTIVE'
    where link.link_status = 'ACTIVE'
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'expected', coalesce(sum(forecast_reward_amount) filter (where state = 'FORECAST'), 0),
      'review', coalesce(sum(forecast_reward_amount) filter (where state in ('ELIGIBLE', 'FINANCE_REVIEW')), 0),
      'available', coalesce(sum(forecast_reward_amount) filter (where state in ('APPROVED', 'READY_FOR_PAYOUT')), 0),
      'paid', coalesce(sum(forecast_reward_amount) filter (where state = 'PAID'), 0)
    ),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'saleLinkId', sale_link_id, 'orderNumber', source_order_number_snapshot,
      'orderDate', source_order_date_snapshot, 'state', state,
      'amount', forecast_reward_amount, 'currency', currency
    ) order by source_order_date_snapshot desc), '[]'::jsonb)
  ) from own;
$$;

create or replace function public.get_agent_cabinet_commercial_kpis()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with agent as (select (private.current_commercial_agent()).*), own_links as (
    select link.id from public.agent_sale_links link join agent on agent.id = link.agent_id and agent.status = 'ACTIVE'
    where link.link_status = 'ACTIVE'
  )
  select jsonb_build_object(
    'clients', (select count(*) from public.agent_attributions attribution join agent on agent.id = attribution.agent_id where attribution.status = 'ACTIVE'),
    'dealsInProgress', (select count(*) from own_links link join public.agent_sale_projections projection on projection.sale_link_id = link.id where projection.state not in ('FULLY_PAID', 'CANCELLED')),
    'expectedReward', coalesce((select sum(reward.forecast_reward_amount) from own_links link join public.agent_reward_projections reward on reward.sale_link_id = link.id where reward.state in ('FORECAST', 'ELIGIBLE', 'FINANCE_REVIEW')), 0),
    'availablePayout', coalesce((select sum(reward.forecast_reward_amount) from own_links link join public.agent_reward_projections reward on reward.sale_link_id = link.id where reward.state in ('APPROVED', 'READY_FOR_PAYOUT')), 0),
    'currency', 'MDL'
  );
$$;

alter table public.agent_1c_bindings enable row level security;
alter table public.agent_commission_policies enable row level security;
alter table public.agent_commission_policy_rates enable row level security;
alter table public.agent_nomenclature_commission_classifications enable row level security;
alter table public.agent_sale_links enable row level security;
alter table public.agent_sale_projections enable row level security;
alter table public.agent_sale_projection_lines enable row level security;
alter table public.agent_reward_projections enable row level security;
alter table public.agent_reward_events enable row level security;

revoke all on table public.agent_1c_bindings, public.agent_commission_policies,
  public.agent_commission_policy_rates, public.agent_nomenclature_commission_classifications,
  public.agent_sale_links, public.agent_sale_projections, public.agent_sale_projection_lines,
  public.agent_reward_projections, public.agent_reward_events from public, anon, authenticated;
grant select, insert, update on table public.agent_1c_bindings, public.agent_commission_policies,
  public.agent_commission_policy_rates, public.agent_nomenclature_commission_classifications,
  public.agent_sale_links, public.agent_sale_projections, public.agent_sale_projection_lines,
  public.agent_reward_projections, public.agent_reward_events to service_role;
grant delete on table public.agent_sale_projection_lines to service_role;
grant usage, select on sequence public.agent_referral_code_seq to service_role;
revoke all on function private.next_agent_referral_code() from public, anon, authenticated, service_role;
grant execute on function private.next_agent_referral_code() to service_role;

revoke all on function public.link_commercial_agent_1c_record(uuid, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.classify_agent_nomenclature_record(text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_agent_sale_link_record(uuid, uuid, uuid, text, text, date, text, text, numeric, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.import_agent_order_referral_record(uuid, text, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.upsert_agent_sale_projection_record(uuid, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.transition_agent_reward_record(uuid, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.list_agent_cabinet_deals(integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.get_agent_cabinet_deal(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_agent_cabinet_rewards() from public, anon, authenticated, service_role;
revoke all on function public.get_agent_cabinet_commercial_kpis() from public, anon, authenticated, service_role;

grant execute on function public.link_commercial_agent_1c_record(uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.classify_agent_nomenclature_record(text, text, text, uuid) to service_role;
grant execute on function public.create_agent_sale_link_record(uuid, uuid, uuid, text, text, date, text, text, numeric, text, uuid) to service_role;
grant execute on function public.import_agent_order_referral_record(uuid, text, text, text, text, text, uuid) to service_role;
grant execute on function public.upsert_agent_sale_projection_record(uuid, jsonb, uuid) to service_role;
grant execute on function public.transition_agent_reward_record(uuid, text, uuid, text) to service_role;
grant execute on function public.list_agent_cabinet_deals(integer, integer) to authenticated;
grant execute on function public.get_agent_cabinet_deal(uuid) to authenticated;
grant execute on function public.get_agent_cabinet_rewards() to authenticated;
grant execute on function public.get_agent_cabinet_commercial_kpis() to authenticated;

comment on table public.agent_sale_projections is
  'Read model of 1C sale, realization, and payment evidence. It is not an accounting ledger.';
comment on table public.agent_reward_projections is
  'Portal commission projection and Finance approval workflow. It does not calculate tax or execute payout.';
