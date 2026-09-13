-- Commercial Agent Portal domain foundation.
-- Portal owns identity/onboarding/referral/attribution workflow only. 1C owns
-- sale, payment, return, financial recognition, settlement and payout truth.

insert into public.permissions (code, description)
values
  ('admin.agents.view', 'View Commercial Agent applications, referrals and attribution conflicts.'),
  ('admin.agents.manage', 'Govern Commercial Agent lifecycle, compliance, referrals and attribution.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in ('admin.agents.view', 'admin.agents.manage')
where role.code = 'novotech_admin'
on conflict do nothing;

create sequence public.commercial_agent_code_seq start with 1 increment by 1 no cycle;

create or replace function private.next_commercial_agent_code()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select 'MD-P-' || lpad(nextval('public.commercial_agent_code_seq')::text, 3, '0');
$$;

create table public.commercial_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.user_profiles(id) on delete restrict,
  source_agent_1c_id text null,
  agent_code text not null default private.next_commercial_agent_code(),
  agent_type text not null,
  display_name text not null,
  legal_name text null,
  idno_idnp text null,
  phone text null,
  email text null,
  locality text null,
  profession text null,
  workplace text null,
  status text not null default 'APPLIED',
  compliance_status text not null default 'UNREVIEWED',
  level text not null default 'START',
  contract_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_agents_code_unique unique (agent_code),
  constraint commercial_agents_code_check check (agent_code ~ '^MD-P-[0-9]{3,}$'),
  constraint commercial_agents_type_check check (agent_type in ('INDIVIDUAL', 'LEGAL_ENTITY')),
  constraint commercial_agents_name_check check (char_length(btrim(display_name)) between 2 and 200),
  constraint commercial_agents_legal_name_check check (legal_name is null or char_length(btrim(legal_name)) between 2 and 240),
  constraint commercial_agents_id_check check (idno_idnp is null or char_length(btrim(idno_idnp)) between 2 and 32),
  constraint commercial_agents_phone_check check (phone is null or char_length(btrim(phone)) between 8 and 32),
  constraint commercial_agents_email_check check (email is null or char_length(btrim(email)) between 3 and 254),
  constraint commercial_agents_locality_check check (locality is null or char_length(btrim(locality)) <= 120),
  constraint commercial_agents_profession_check check (profession is null or char_length(btrim(profession)) <= 160),
  constraint commercial_agents_workplace_check check (workplace is null or char_length(btrim(workplace)) <= 200),
  constraint commercial_agents_status_check check (status in (
    'APPLIED', 'COMPLIANCE_REVIEW', 'CONTRACT_PENDING', 'APPROVED', 'TRAINING',
    'ACTIVE', 'SUSPENDED', 'TERMINATED', 'REJECTED'
  )),
  constraint commercial_agents_compliance_status_check check (compliance_status in (
    'UNREVIEWED', 'PENDING', 'APPROVED', 'REVIEW_REQUIRED', 'BLOCKED', 'REJECTED'
  )),
  constraint commercial_agents_level_check check (level in ('START', 'ACTIVE', 'PROFESSIONAL', 'STRATEGIC'))
);

create unique index commercial_agents_user_unique_idx
  on public.commercial_agents (user_id) where user_id is not null;
create unique index commercial_agents_1c_unique_idx
  on public.commercial_agents (source_agent_1c_id) where source_agent_1c_id is not null;
create index commercial_agents_status_created_idx
  on public.commercial_agents (status, created_at desc, id);

create table public.agent_compliance (
  agent_id uuid primary key references public.commercial_agents(id) on delete restrict,
  public_sector_flag boolean null,
  external_paid_activity_status text not null default 'UNKNOWN',
  procurement_participation_flag boolean null,
  conflict_of_interest_status text not null default 'UNREVIEWED',
  compliance_review_status text not null default 'UNREVIEWED',
  reviewed_by uuid null references public.user_profiles(id) on delete restrict,
  reviewed_at timestamptz null,
  safe_review_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_compliance_external_activity_check check (external_paid_activity_status in (
    'UNKNOWN', 'ALLOWED', 'REQUIRES_REVIEW', 'PROHIBITED'
  )),
  constraint agent_compliance_conflict_check check (conflict_of_interest_status in (
    'UNREVIEWED', 'NONE_DECLARED', 'REVIEW_REQUIRED', 'CONFIRMED'
  )),
  constraint agent_compliance_review_check check (compliance_review_status in (
    'UNREVIEWED', 'PENDING', 'APPROVED', 'REVIEW_REQUIRED', 'BLOCKED', 'REJECTED'
  )),
  constraint agent_compliance_reviewer_check check (
    (reviewed_at is null and reviewed_by is null) or (reviewed_at is not null and reviewed_by is not null)
  ),
  constraint agent_compliance_note_check check (safe_review_note is null or char_length(safe_review_note) <= 1000)
);

create table public.agent_referral_tokens (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.commercial_agents(id) on delete restrict,
  token_hash text not null,
  token_type text not null default 'QR',
  status text not null default 'ACTIVE',
  campaign_ref text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  constraint agent_referral_tokens_hash_unique unique (token_hash),
  constraint agent_referral_tokens_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint agent_referral_tokens_type_check check (token_type in ('QR', 'LINK')),
  constraint agent_referral_tokens_status_check check (status in ('ACTIVE', 'REVOKED', 'EXPIRED')),
  constraint agent_referral_tokens_campaign_check check (campaign_ref is null or char_length(btrim(campaign_ref)) <= 120),
  constraint agent_referral_tokens_expiry_check check (expires_at is null or expires_at > created_at),
  constraint agent_referral_tokens_revocation_check check ((status = 'REVOKED') = (revoked_at is not null))
);

create index agent_referral_tokens_agent_created_idx
  on public.agent_referral_tokens (agent_id, created_at desc);
create index agent_referral_tokens_active_idx
  on public.agent_referral_tokens (token_hash, expires_at)
  where status = 'ACTIVE' and revoked_at is null;

create table public.agent_referral_consents (
  id uuid primary key default gen_random_uuid(),
  consent_type text not null,
  consent_text_version text not null,
  consent_given_at timestamptz not null,
  consent_method text not null,
  consent_source text not null,
  created_at timestamptz not null default now(),
  constraint agent_referral_consents_type_check check (consent_type in ('REFERRAL_CONTACT_PROCESSING')),
  constraint agent_referral_consents_version_check check (char_length(btrim(consent_text_version)) between 1 and 40),
  constraint agent_referral_consents_method_check check (consent_method in ('CHECKBOX', 'ADMIN_RECORDED')),
  constraint agent_referral_consents_source_check check (consent_source in ('PUBLIC_REFERRAL', 'ADMIN'))
);

create table public.agent_referrals (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.commercial_agents(id) on delete restrict,
  customer_identity_id uuid null references public.customer_identities(id) on delete restrict,
  referral_token_id uuid not null references public.agent_referral_tokens(id) on delete restrict,
  consent_id uuid not null references public.agent_referral_consents(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  customer_kind text not null,
  name_snapshot text not null,
  phone_snapshot text null,
  email_snapshot text null,
  locality text null,
  object_type text null,
  need_summary text not null,
  short_description text null,
  project_timing text null,
  status text not null default 'CAPTURED',
  identity_resolution_status text not null,
  identity_resolution_reason text not null,
  duplicate_reason text null,
  existing_customer_reason text null,
  reviewed_by uuid null references public.user_profiles(id) on delete restrict,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_referrals_customer_kind_check check (customer_kind in ('PERSON', 'LEGAL_ENTITY')),
  constraint agent_referrals_name_check check (char_length(btrim(name_snapshot)) between 2 and 200),
  constraint agent_referrals_contact_check check (phone_snapshot is not null or email_snapshot is not null),
  constraint agent_referrals_locality_check check (locality is null or char_length(btrim(locality)) <= 120),
  constraint agent_referrals_object_check check (object_type is null or char_length(btrim(object_type)) <= 120),
  constraint agent_referrals_need_check check (char_length(btrim(need_summary)) between 2 and 500),
  constraint agent_referrals_description_check check (short_description is null or char_length(btrim(short_description)) <= 1500),
  constraint agent_referrals_timing_check check (project_timing is null or char_length(btrim(project_timing)) <= 160),
  constraint agent_referrals_status_check check (status in (
    'CAPTURED', 'PENDING_REVIEW', 'VERIFIED', 'ACTIVE', 'DUPLICATE',
    'EXISTING_CUSTOMER', 'CONFLICT', 'REJECTED', 'EXPIRED', 'REASSIGNED', 'TERMINATED'
  )),
  constraint agent_referrals_resolution_status_check check (identity_resolution_status in ('MATCHED', 'NEW', 'AMBIGUOUS', 'CONFLICT')),
  constraint agent_referrals_resolution_reason_check check (identity_resolution_reason in (
    'EXACT_1C_REF', 'EXACT_LEGAL_IDENTIFIER', 'EXACT_VERIFIED_PHONE',
    'EXACT_VERIFIED_EMAIL', 'MULTIPLE_MATCHES', 'IDENTIFIER_CONFLICT',
    'INSUFFICIENT_IDENTITY', 'NEW_IDENTITY'
  )),
  constraint agent_referrals_review_check check (
    (reviewed_at is null and reviewed_by is null) or (reviewed_at is not null and reviewed_by is not null)
  )
);

create index agent_referrals_agent_status_idx
  on public.agent_referrals (agent_id, status, submitted_at desc, id);
create index agent_referrals_identity_idx
  on public.agent_referrals (customer_identity_id, submitted_at desc)
  where customer_identity_id is not null;
create index agent_referrals_review_queue_idx
  on public.agent_referrals (status, submitted_at, id)
  where status in ('CAPTURED', 'PENDING_REVIEW', 'CONFLICT');

create table public.agent_attributions (
  id uuid primary key default gen_random_uuid(),
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  agent_id uuid not null references public.commercial_agents(id) on delete restrict,
  referral_id uuid not null references public.agent_referrals(id) on delete restrict,
  valid_from timestamptz not null,
  valid_until timestamptz null,
  status text not null default 'ACTIVE',
  protection_until timestamptz not null,
  extended_until timestamptz null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  ended_at timestamptz null,
  end_reason text null,
  supersedes_attribution_id uuid null references public.agent_attributions(id) on delete restrict,
  constraint agent_attributions_status_check check (status in ('ACTIVE', 'EXPIRED', 'REASSIGNED', 'TERMINATED')),
  constraint agent_attributions_window_check check (valid_until is null or valid_until >= valid_from),
  constraint agent_attributions_protection_check check (protection_until = valid_from + interval '90 days'),
  constraint agent_attributions_extension_check check (extended_until is null or extended_until >= protection_until),
  constraint agent_attributions_end_check check (
    (status = 'ACTIVE' and ended_at is null and end_reason is null)
    or (status <> 'ACTIVE' and ended_at is not null and end_reason is not null)
  )
);

create unique index agent_attributions_one_active_identity_idx
  on public.agent_attributions (customer_identity_id)
  where status = 'ACTIVE' and ended_at is null;
create index agent_attributions_agent_history_idx
  on public.agent_attributions (agent_id, valid_from desc, id);
create index agent_attributions_referral_idx
  on public.agent_attributions (referral_id, created_at desc);
create index agent_attributions_protection_idx
  on public.agent_attributions (protection_until, customer_identity_id)
  where status = 'ACTIVE';

create table public.agent_domain_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid null references public.commercial_agents(id) on delete restrict,
  referral_id uuid null references public.agent_referrals(id) on delete restrict,
  attribution_id uuid null references public.agent_attributions(id) on delete restrict,
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  event_type text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agent_domain_events_subject_check check (num_nonnulls(agent_id, referral_id, attribution_id) >= 1),
  constraint agent_domain_events_type_check check (event_type in (
    'AGENT_CREATED', 'AGENT_STATUS_CHANGED', 'COMPLIANCE_DECIDED',
    'TOKEN_CREATED', 'TOKEN_REVOKED', 'REFERRAL_CAPTURED',
    'REFERRAL_STATUS_CHANGED', 'ATTRIBUTION_CREATED', 'ATTRIBUTION_EXTENDED',
    'ATTRIBUTION_CONFLICT', 'ATTRIBUTION_REASSIGNED', 'ATTRIBUTION_TERMINATED'
  )),
  constraint agent_domain_events_metadata_check check (jsonb_typeof(safe_metadata) = 'object')
);

create index agent_domain_events_agent_created_idx
  on public.agent_domain_events (agent_id, created_at desc, id)
  where agent_id is not null;
create index agent_domain_events_referral_created_idx
  on public.agent_domain_events (referral_id, created_at desc, id)
  where referral_id is not null;
create index agent_domain_events_attribution_created_idx
  on public.agent_domain_events (attribution_id, created_at desc, id)
  where attribution_id is not null;
create index agent_domain_events_actor_idx
  on public.agent_domain_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

create or replace function private.touch_agent_domain_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_commercial_agents_updated_at
before update on public.commercial_agents
for each row execute function private.touch_agent_domain_updated_at();
create trigger touch_agent_compliance_updated_at
before update on public.agent_compliance
for each row execute function private.touch_agent_domain_updated_at();
create trigger touch_agent_referrals_updated_at
before update on public.agent_referrals
for each row execute function private.touch_agent_domain_updated_at();

create or replace function private.validate_commercial_agent_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.agent_code <> old.agent_code then
    raise exception 'Commercial Agent code is immutable.' using errcode = '42501';
  end if;
  if new.status <> old.status and not (
    (old.status = 'APPLIED' and new.status in ('COMPLIANCE_REVIEW', 'REJECTED')) or
    (old.status = 'COMPLIANCE_REVIEW' and new.status in ('CONTRACT_PENDING', 'REJECTED')) or
    (old.status = 'CONTRACT_PENDING' and new.status in ('APPROVED', 'REJECTED')) or
    (old.status = 'APPROVED' and new.status in ('TRAINING', 'ACTIVE', 'SUSPENDED')) or
    (old.status = 'TRAINING' and new.status in ('ACTIVE', 'SUSPENDED')) or
    (old.status = 'ACTIVE' and new.status in ('SUSPENDED', 'TERMINATED')) or
    (old.status = 'SUSPENDED' and new.status in ('ACTIVE', 'TERMINATED'))
  ) then
    raise exception 'Invalid Commercial Agent status transition.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_commercial_agent_update
before update on public.commercial_agents
for each row execute function private.validate_commercial_agent_update();

create or replace function private.enforce_distinct_agent_principal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  target_user_id := case
    when tg_table_name = 'commercial_agents' then new.user_id
    else new.user_id
  end;

  if target_user_id is null then
    return new;
  end if;

  if tg_table_name = 'commercial_agents' then
    if not exists (
      select 1
      from public.user_profiles profile
      where profile.id = target_user_id
        and profile.status = 'active'
        and profile.user_type = 'external'
    ) or exists (
      select 1
      from public.company_memberships membership
      where membership.user_id = target_user_id
        and membership.status in ('pending_approval', 'active', 'suspended')
    ) then
      raise exception 'Agent principal must be an active external user without Partner membership.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'company_memberships' and new.status in ('pending_approval', 'active', 'suspended') then
    if exists (
      select 1 from public.commercial_agents agent
      where agent.user_id = target_user_id
        and agent.status not in ('TERMINATED', 'REJECTED')
    ) then
      raise exception 'Commercial Agent principal cannot receive Partner membership.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_commercial_agent_distinct_principal
before insert or update of user_id on public.commercial_agents
for each row execute function private.enforce_distinct_agent_principal();

create trigger enforce_partner_membership_distinct_from_agent
before insert or update of user_id, status on public.company_memberships
for each row execute function private.enforce_distinct_agent_principal();

create or replace function private.validate_agent_referral_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.agent_id <> old.agent_id or new.referral_token_id <> old.referral_token_id
    or new.consent_id <> old.consent_id or new.submitted_at <> old.submitted_at then
    raise exception 'Referral source identity is immutable.' using errcode = '42501';
  end if;
  if new.status <> old.status and not (
    (old.status = 'CAPTURED' and new.status in ('PENDING_REVIEW', 'REJECTED', 'EXPIRED')) or
    (old.status = 'PENDING_REVIEW' and new.status in ('VERIFIED', 'DUPLICATE', 'EXISTING_CUSTOMER', 'CONFLICT', 'REJECTED', 'EXPIRED')) or
    (old.status = 'VERIFIED' and new.status in ('ACTIVE', 'DUPLICATE', 'EXISTING_CUSTOMER', 'CONFLICT', 'REASSIGNED', 'TERMINATED')) or
    (old.status = 'ACTIVE' and new.status in ('EXPIRED', 'CONFLICT', 'REASSIGNED', 'TERMINATED'))
  ) then
    raise exception 'Invalid Agent referral status transition.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_agent_referral_update
before update on public.agent_referrals
for each row execute function private.validate_agent_referral_update();

create or replace function private.protect_agent_attribution_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Agent attribution history cannot be deleted.' using errcode = '42501';
  end if;
  if new.customer_identity_id <> old.customer_identity_id
    or new.agent_id <> old.agent_id
    or new.referral_id <> old.referral_id
    or new.valid_from <> old.valid_from
    or new.protection_until <> old.protection_until
    or new.created_at <> old.created_at
    or new.created_by <> old.created_by
    or new.supersedes_attribution_id is distinct from old.supersedes_attribution_id then
    raise exception 'Historical Agent attribution identity is immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_agent_attribution_history
before update or delete on public.agent_attributions
for each row execute function private.protect_agent_attribution_history();

create or replace function private.prevent_agent_domain_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Agent domain events are append-only.' using errcode = '42501';
end;
$$;

create trigger prevent_agent_domain_event_mutation
before update or delete on public.agent_domain_events
for each row execute function private.prevent_agent_domain_event_mutation();

create or replace function public.create_commercial_agent_record(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_agent_type text,
  p_display_name text,
  p_legal_name text default null,
  p_idno_idnp text default null,
  p_phone text default null,
  p_email text default null,
  p_locality text default null,
  p_profession text default null,
  p_workplace text default null
)
returns public.commercial_agents
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.commercial_agents;
begin
  if not exists (select 1 from public.user_profiles where id = p_actor_user_id and status = 'active') then
    raise exception 'Invalid Agent administrator.' using errcode = '42501';
  end if;

  insert into public.commercial_agents (
    user_id, agent_type, display_name, legal_name, idno_idnp, phone, email,
    locality, profession, workplace
  ) values (
    p_user_id, p_agent_type, btrim(p_display_name), nullif(btrim(p_legal_name), ''),
    nullif(btrim(p_idno_idnp), ''), nullif(btrim(p_phone), ''),
    nullif(lower(btrim(p_email)), ''), nullif(btrim(p_locality), ''),
    nullif(btrim(p_profession), ''), nullif(btrim(p_workplace), '')
  ) returning * into created;

  insert into public.agent_compliance (agent_id) values (created.id);
  insert into public.agent_domain_events (agent_id, actor_user_id, event_type)
  values (created.id, p_actor_user_id, 'AGENT_CREATED');
  return created;
end;
$$;

create or replace function public.transition_commercial_agent_record(
  p_agent_id uuid,
  p_target_status text,
  p_actor_user_id uuid
)
returns public.commercial_agents
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
  changed public.commercial_agents;
begin
  select status into previous_status from public.commercial_agents where id = p_agent_id for update;
  if previous_status is null then raise exception 'Commercial Agent not found.' using errcode = 'P0002'; end if;
  update public.commercial_agents set status = p_target_status where id = p_agent_id returning * into changed;
  insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_actor_user_id, 'AGENT_STATUS_CHANGED', jsonb_build_object('from', previous_status, 'to', p_target_status));
  return changed;
end;
$$;

create or replace function public.review_commercial_agent_compliance(
  p_agent_id uuid,
  p_actor_user_id uuid,
  p_public_sector_flag boolean,
  p_external_paid_activity_status text,
  p_procurement_participation_flag boolean,
  p_conflict_of_interest_status text,
  p_review_status text,
  p_safe_review_note text default null
)
returns public.agent_compliance
language plpgsql
security definer
set search_path = ''
as $$
declare reviewed public.agent_compliance;
begin
  update public.agent_compliance set
    public_sector_flag = p_public_sector_flag,
    external_paid_activity_status = p_external_paid_activity_status,
    procurement_participation_flag = p_procurement_participation_flag,
    conflict_of_interest_status = p_conflict_of_interest_status,
    compliance_review_status = p_review_status,
    reviewed_by = p_actor_user_id,
    reviewed_at = now(),
    safe_review_note = nullif(btrim(p_safe_review_note), '')
  where agent_id = p_agent_id
  returning * into reviewed;
  if reviewed.agent_id is null then raise exception 'Commercial Agent not found.' using errcode = 'P0002'; end if;

  update public.commercial_agents set compliance_status = p_review_status where id = p_agent_id;
  insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_actor_user_id, 'COMPLIANCE_DECIDED', jsonb_build_object('status', p_review_status));
  return reviewed;
end;
$$;

create or replace function public.create_agent_referral_token_record(
  p_agent_id uuid,
  p_token_hash text,
  p_token_type text,
  p_campaign_ref text,
  p_expires_at timestamptz,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  if not exists (select 1 from public.commercial_agents where id = p_agent_id) then
    raise exception 'Commercial Agent not found.' using errcode = 'P0002';
  end if;
  insert into public.agent_referral_tokens (
    agent_id, token_hash, token_type, campaign_ref, expires_at
  ) values (
    p_agent_id, p_token_hash, p_token_type, nullif(btrim(p_campaign_ref), ''), p_expires_at
  ) returning id into created_id;
  insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_actor_user_id, 'TOKEN_CREATED', jsonb_build_object('token_id', created_id));
  return created_id;
end;
$$;

create or replace function public.revoke_agent_referral_token_record(
  p_token_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_agent_id uuid;
begin
  update public.agent_referral_tokens
  set status = 'REVOKED', revoked_at = now()
  where id = p_token_id and status = 'ACTIVE'
  returning agent_id into target_agent_id;
  if target_agent_id is null then return; end if;
  insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
  values (target_agent_id, p_actor_user_id, 'TOKEN_REVOKED', jsonb_build_object('token_id', p_token_id));
end;
$$;

create or replace function public.create_agent_referral_record(
  p_token_hash text,
  p_customer_identity_id uuid,
  p_customer_kind text,
  p_name text,
  p_phone text,
  p_email text,
  p_locality text,
  p_object_type text,
  p_need_summary text,
  p_short_description text,
  p_project_timing text,
  p_resolution_status text,
  p_resolution_reason text,
  p_consent_text_version text,
  p_consent_given_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_token public.agent_referral_tokens;
  consent_id uuid;
  referral_id uuid;
begin
  select token.* into target_token
  from public.agent_referral_tokens token
  join public.commercial_agents agent on agent.id = token.agent_id
  where token.token_hash = p_token_hash
    and token.status = 'ACTIVE'
    and token.revoked_at is null
    and (token.expires_at is null or token.expires_at > now())
    and agent.status = 'ACTIVE';
  if target_token.id is null then raise exception 'Referral link is unavailable.' using errcode = 'P0002'; end if;

  insert into public.agent_referral_consents (
    consent_type, consent_text_version, consent_given_at, consent_method, consent_source
  ) values (
    'REFERRAL_CONTACT_PROCESSING', p_consent_text_version, p_consent_given_at,
    'CHECKBOX', 'PUBLIC_REFERRAL'
  ) returning id into consent_id;

  insert into public.agent_referrals (
    agent_id, customer_identity_id, referral_token_id, consent_id,
    customer_kind, name_snapshot, phone_snapshot, email_snapshot, locality,
    object_type, need_summary, short_description, project_timing,
    identity_resolution_status, identity_resolution_reason
  ) values (
    target_token.agent_id, p_customer_identity_id, target_token.id, consent_id,
    p_customer_kind, btrim(p_name), nullif(btrim(p_phone), ''),
    nullif(lower(btrim(p_email)), ''), nullif(btrim(p_locality), ''),
    nullif(btrim(p_object_type), ''), btrim(p_need_summary),
    nullif(btrim(p_short_description), ''), nullif(btrim(p_project_timing), ''),
    p_resolution_status, p_resolution_reason
  ) returning id into referral_id;

  insert into public.agent_domain_events (agent_id, referral_id, event_type, safe_metadata)
  values (target_token.agent_id, referral_id, 'REFERRAL_CAPTURED', jsonb_build_object('consent_id', consent_id));
  return referral_id;
end;
$$;

create or replace function public.transition_agent_referral_record(
  p_referral_id uuid,
  p_target_status text,
  p_actor_user_id uuid,
  p_customer_identity_id uuid default null,
  p_duplicate_reason text default null,
  p_existing_customer_reason text default null
)
returns public.agent_referrals
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
  changed public.agent_referrals;
begin
  select status into previous_status from public.agent_referrals where id = p_referral_id for update;
  if previous_status is null then raise exception 'Agent referral not found.' using errcode = 'P0002'; end if;

  update public.agent_referrals set
    status = p_target_status,
    customer_identity_id = coalesce(p_customer_identity_id, customer_identity_id),
    duplicate_reason = nullif(btrim(p_duplicate_reason), ''),
    existing_customer_reason = nullif(btrim(p_existing_customer_reason), ''),
    reviewed_by = p_actor_user_id,
    reviewed_at = now()
  where id = p_referral_id
  returning * into changed;

  insert into public.agent_domain_events (agent_id, referral_id, actor_user_id, event_type, safe_metadata)
  values (changed.agent_id, changed.id, p_actor_user_id, 'REFERRAL_STATUS_CHANGED', jsonb_build_object('from', previous_status, 'to', p_target_status));
  return changed;
end;
$$;

create or replace function public.create_agent_attribution_record(
  p_referral_id uuid,
  p_actor_user_id uuid,
  p_valid_from timestamptz default now()
)
returns public.agent_attributions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_referral public.agent_referrals;
  existing public.agent_attributions;
  created public.agent_attributions;
begin
  select * into target_referral from public.agent_referrals where id = p_referral_id for update;
  if target_referral.id is null or target_referral.status <> 'VERIFIED' or target_referral.customer_identity_id is null then
    raise exception 'Verified referral with resolved customer identity is required.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.agent_referral_consents where id = target_referral.consent_id) then
    raise exception 'Governed consent evidence is required.' using errcode = '23514';
  end if;

  select * into existing
  from public.agent_attributions
  where customer_identity_id = target_referral.customer_identity_id
    and status = 'ACTIVE' and ended_at is null
  for update;
  if existing.id is not null then
    raise exception 'Customer already has an active protected attribution.' using errcode = '23505';
  end if;

  insert into public.agent_attributions (
    customer_identity_id, agent_id, referral_id, valid_from,
    protection_until, created_by
  ) values (
    target_referral.customer_identity_id, target_referral.agent_id,
    target_referral.id, p_valid_from, p_valid_from + interval '90 days', p_actor_user_id
  ) returning * into created;

  update public.agent_referrals set status = 'ACTIVE', reviewed_by = p_actor_user_id, reviewed_at = now()
  where id = target_referral.id;
  insert into public.agent_domain_events (agent_id, referral_id, attribution_id, actor_user_id, event_type)
  values (created.agent_id, created.referral_id, created.id, p_actor_user_id, 'ATTRIBUTION_CREATED');
  return created;
end;
$$;

create or replace function public.extend_agent_attribution_record(
  p_attribution_id uuid,
  p_extended_until timestamptz,
  p_actor_user_id uuid,
  p_reason text
)
returns public.agent_attributions
language plpgsql
security definer
set search_path = ''
as $$
declare changed public.agent_attributions;
begin
  update public.agent_attributions set extended_until = p_extended_until
  where id = p_attribution_id and status = 'ACTIVE'
    and p_extended_until >= protection_until
    and char_length(btrim(p_reason)) between 2 and 500
  returning * into changed;
  if changed.id is null then raise exception 'Active attribution extension is invalid.' using errcode = '23514'; end if;
  insert into public.agent_domain_events (agent_id, referral_id, attribution_id, actor_user_id, event_type, safe_metadata)
  values (changed.agent_id, changed.referral_id, changed.id, p_actor_user_id, 'ATTRIBUTION_EXTENDED', jsonb_build_object('reason', btrim(p_reason), 'extended_until', p_extended_until));
  return changed;
end;
$$;

create or replace function public.reassign_agent_attribution_record(
  p_existing_attribution_id uuid,
  p_new_referral_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_valid_from timestamptz default now()
)
returns public.agent_attributions
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.agent_attributions;
  target_referral public.agent_referrals;
  created public.agent_attributions;
begin
  select * into previous from public.agent_attributions
  where id = p_existing_attribution_id and status = 'ACTIVE' for update;
  select * into target_referral from public.agent_referrals where id = p_new_referral_id for update;
  if previous.id is null or target_referral.id is null or target_referral.status <> 'VERIFIED'
    or target_referral.customer_identity_id <> previous.customer_identity_id
    or char_length(btrim(p_reason)) not between 2 and 500 then
    raise exception 'Attribution reassignment is invalid.' using errcode = '23514';
  end if;

  update public.agent_attributions set
    status = 'REASSIGNED', valid_until = p_valid_from, ended_at = p_valid_from,
    end_reason = btrim(p_reason)
  where id = previous.id;

  insert into public.agent_attributions (
    customer_identity_id, agent_id, referral_id, valid_from,
    protection_until, created_by, supersedes_attribution_id
  ) values (
    target_referral.customer_identity_id, target_referral.agent_id,
    target_referral.id, p_valid_from, p_valid_from + interval '90 days',
    p_actor_user_id, previous.id
  ) returning * into created;

  update public.agent_referrals set status = 'REASSIGNED', reviewed_by = p_actor_user_id, reviewed_at = now()
  where id = previous.referral_id and status = 'ACTIVE';
  update public.agent_referrals set status = 'ACTIVE', reviewed_by = p_actor_user_id, reviewed_at = now()
  where id = target_referral.id;
  insert into public.agent_domain_events (agent_id, referral_id, attribution_id, actor_user_id, event_type, safe_metadata)
  values (created.agent_id, created.referral_id, created.id, p_actor_user_id, 'ATTRIBUTION_REASSIGNED', jsonb_build_object('previous_attribution_id', previous.id, 'reason', btrim(p_reason)));
  return created;
end;
$$;

create or replace function public.terminate_agent_attribution_record(
  p_attribution_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_ended_at timestamptz default now()
)
returns public.agent_attributions
language plpgsql
security definer
set search_path = ''
as $$
declare changed public.agent_attributions;
begin
  update public.agent_attributions set
    status = 'TERMINATED', valid_until = p_ended_at,
    ended_at = p_ended_at, end_reason = btrim(p_reason)
  where id = p_attribution_id
    and status = 'ACTIVE'
    and p_ended_at >= valid_from
    and char_length(btrim(p_reason)) between 2 and 500
  returning * into changed;
  if changed.id is null then
    raise exception 'Active attribution termination is invalid.' using errcode = '23514';
  end if;

  update public.agent_referrals set
    status = 'TERMINATED', reviewed_by = p_actor_user_id, reviewed_at = now()
  where id = changed.referral_id and status = 'ACTIVE';
  insert into public.agent_domain_events (
    agent_id, referral_id, attribution_id, actor_user_id, event_type, safe_metadata
  ) values (
    changed.agent_id, changed.referral_id, changed.id, p_actor_user_id,
    'ATTRIBUTION_TERMINATED', jsonb_build_object('reason', btrim(p_reason))
  );
  return changed;
end;
$$;

alter table public.commercial_agents enable row level security;
alter table public.commercial_agents force row level security;
alter table public.agent_compliance enable row level security;
alter table public.agent_compliance force row level security;
alter table public.agent_referral_tokens enable row level security;
alter table public.agent_referral_tokens force row level security;
alter table public.agent_referral_consents enable row level security;
alter table public.agent_referral_consents force row level security;
alter table public.agent_referrals enable row level security;
alter table public.agent_referrals force row level security;
alter table public.agent_attributions enable row level security;
alter table public.agent_attributions force row level security;
alter table public.agent_domain_events enable row level security;
alter table public.agent_domain_events force row level security;

revoke all on sequence public.commercial_agent_code_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.commercial_agent_code_seq to service_role;

revoke all on table public.commercial_agents from public, anon, authenticated, service_role;
revoke all on table public.agent_compliance from public, anon, authenticated, service_role;
revoke all on table public.agent_referral_tokens from public, anon, authenticated, service_role;
revoke all on table public.agent_referral_consents from public, anon, authenticated, service_role;
revoke all on table public.agent_referrals from public, anon, authenticated, service_role;
revoke all on table public.agent_attributions from public, anon, authenticated, service_role;
revoke all on table public.agent_domain_events from public, anon, authenticated, service_role;

grant select, insert, update on table public.commercial_agents to service_role;
grant select, insert, update on table public.agent_compliance to service_role;
grant select, insert, update on table public.agent_referral_tokens to service_role;
grant select, insert on table public.agent_referral_consents to service_role;
grant select, insert, update on table public.agent_referrals to service_role;
grant select, insert, update on table public.agent_attributions to service_role;
grant select, insert on table public.agent_domain_events to service_role;

revoke all on function private.next_commercial_agent_code() from public, anon, authenticated;
grant execute on function private.next_commercial_agent_code() to service_role;
revoke all on function private.touch_agent_domain_updated_at() from public, anon, authenticated, service_role;
revoke all on function private.validate_commercial_agent_update() from public, anon, authenticated, service_role;
revoke all on function private.enforce_distinct_agent_principal() from public, anon, authenticated, service_role;
revoke all on function private.validate_agent_referral_update() from public, anon, authenticated, service_role;
revoke all on function private.protect_agent_attribution_history() from public, anon, authenticated, service_role;
revoke all on function private.prevent_agent_domain_event_mutation() from public, anon, authenticated, service_role;

revoke all on function public.create_commercial_agent_record(uuid, uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.transition_commercial_agent_record(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.review_commercial_agent_compliance(uuid, uuid, boolean, text, boolean, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.create_agent_referral_token_record(uuid, text, text, text, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.revoke_agent_referral_token_record(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_agent_referral_record(text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.transition_agent_referral_record(uuid, text, uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.create_agent_attribution_record(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.extend_agent_attribution_record(uuid, timestamptz, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.reassign_agent_attribution_record(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.terminate_agent_attribution_record(uuid, uuid, text, timestamptz) from public, anon, authenticated, service_role;

grant execute on function public.create_commercial_agent_record(uuid, uuid, text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.transition_commercial_agent_record(uuid, text, uuid) to service_role;
grant execute on function public.review_commercial_agent_compliance(uuid, uuid, boolean, text, boolean, text, text, text) to service_role;
grant execute on function public.create_agent_referral_token_record(uuid, text, text, text, timestamptz, uuid) to service_role;
grant execute on function public.revoke_agent_referral_token_record(uuid, uuid) to service_role;
grant execute on function public.create_agent_referral_record(text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.transition_agent_referral_record(uuid, text, uuid, uuid, text, text) to service_role;
grant execute on function public.create_agent_attribution_record(uuid, uuid, timestamptz) to service_role;
grant execute on function public.extend_agent_attribution_record(uuid, timestamptz, uuid, text) to service_role;
grant execute on function public.reassign_agent_attribution_record(uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.terminate_agent_attribution_record(uuid, uuid, text, timestamptz) to service_role;

comment on table public.commercial_agents is
  'Portal-owned Commercial Agent identity and onboarding classification. Distinct from Partner company membership.';
comment on table public.agent_referrals is
  'Portal-owned referral workflow. Financial commission is deliberately absent.';
comment on table public.agent_attributions is
  'Durable customer-to-agent attribution history using the Shared Customer Identity root.';
