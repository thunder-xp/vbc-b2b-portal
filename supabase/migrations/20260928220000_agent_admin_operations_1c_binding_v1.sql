alter table public.agent_1c_bindings
  add column if not exists source_agent_code_snapshot text,
  add column if not exists agent_code_state text not null default 'NOT_VERIFIED',
  add column if not exists source_observed_at timestamptz,
  add column if not exists last_verification_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.agent_1c_bindings
  drop constraint if exists agent_1c_bindings_agent_code_state_check;
alter table public.agent_1c_bindings
  add constraint agent_1c_bindings_agent_code_state_check
  check (agent_code_state in ('MATCH', 'MISSING', 'MISMATCH', 'NOT_VERIFIED'));

alter table public.agent_1c_bindings enable row level security;
alter table public.agent_1c_bindings force row level security;
revoke all on table public.agent_1c_bindings from service_role;
grant select, insert, update on table public.agent_1c_bindings to service_role;

create table public.agent_1c_contract_bindings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.commercial_agents(id) on delete restrict,
  source_contract_1c_ref text not null,
  source_counterparty_1c_ref text not null,
  source_contract_number_snapshot text,
  source_contract_name_snapshot text not null,
  source_contract_type_snapshot text not null,
  source_contract_date_snapshot date,
  source_contract_valid_until_snapshot date,
  source_contract_signed_snapshot boolean,
  source_agent_code_snapshot text,
  agent_code_state text not null,
  linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now(),
  verified_at timestamptz,
  source_observed_at timestamptz not null,
  is_current boolean not null default true,
  superseded_at timestamptz,
  superseded_by uuid references auth.users(id),
  supersession_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_1c_contract_bindings_contract_ref_check check (
    source_contract_1c_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  ),
  constraint agent_1c_contract_bindings_counterparty_ref_check check (
    source_counterparty_1c_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  ),
  constraint agent_1c_contract_bindings_code_state_check check (
    agent_code_state in ('MATCH', 'MISSING', 'MISMATCH', 'NOT_VERIFIED')
  ),
  constraint agent_1c_contract_bindings_name_check check (
    char_length(btrim(source_contract_name_snapshot)) between 1 and 300
  ),
  constraint agent_1c_contract_bindings_type_check check (
    char_length(btrim(source_contract_type_snapshot)) between 1 and 120
  ),
  constraint agent_1c_contract_bindings_supersession_check check (
    (is_current and superseded_at is null and superseded_by is null and supersession_reason is null)
    or
    (not is_current and superseded_at is not null and superseded_by is not null
      and char_length(btrim(supersession_reason)) between 3 and 1000)
  )
);

create unique index agent_1c_contract_bindings_current_agent_uidx
  on public.agent_1c_contract_bindings(agent_id) where is_current;
create unique index agent_1c_contract_bindings_current_source_uidx
  on public.agent_1c_contract_bindings(lower(source_contract_1c_ref)) where is_current;
create index agent_1c_contract_bindings_agent_history_idx
  on public.agent_1c_contract_bindings(agent_id, linked_at desc, id);

create table public.agent_1c_project_bindings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.commercial_agents(id) on delete restrict,
  source_project_1c_ref text not null,
  source_project_name_snapshot text not null,
  source_project_code_snapshot text,
  source_counterparty_1c_ref text not null,
  source_contract_1c_ref text not null,
  source_start_date_snapshot date,
  source_end_date_snapshot date,
  source_agent_code_snapshot text,
  agent_code_state text not null,
  agent_code_evidence text not null,
  linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now(),
  verified_at timestamptz,
  source_observed_at timestamptz not null,
  is_current boolean not null default true,
  superseded_at timestamptz,
  superseded_by uuid references auth.users(id),
  supersession_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_1c_project_bindings_project_ref_check check (
    source_project_1c_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  ),
  constraint agent_1c_project_bindings_counterparty_ref_check check (
    source_counterparty_1c_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  ),
  constraint agent_1c_project_bindings_contract_ref_check check (
    source_contract_1c_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  ),
  constraint agent_1c_project_bindings_code_state_check check (
    agent_code_state in ('MATCH', 'MISSING', 'MISMATCH', 'NOT_VERIFIED')
  ),
  constraint agent_1c_project_bindings_code_evidence_check check (
    agent_code_evidence in ('CUSTOM_PROPERTY', 'STRUCTURED_NAME', 'NONE')
  ),
  constraint agent_1c_project_bindings_name_check check (
    char_length(btrim(source_project_name_snapshot)) between 1 and 300
  ),
  constraint agent_1c_project_bindings_supersession_check check (
    (is_current and superseded_at is null and superseded_by is null and supersession_reason is null)
    or
    (not is_current and superseded_at is not null and superseded_by is not null
      and char_length(btrim(supersession_reason)) between 3 and 1000)
  )
);

create unique index agent_1c_project_bindings_current_agent_uidx
  on public.agent_1c_project_bindings(agent_id) where is_current;
create unique index agent_1c_project_bindings_current_source_uidx
  on public.agent_1c_project_bindings(lower(source_project_1c_ref)) where is_current;
create index agent_1c_project_bindings_agent_history_idx
  on public.agent_1c_project_bindings(agent_id, linked_at desc, id);

alter table public.agent_1c_contract_bindings enable row level security;
alter table public.agent_1c_contract_bindings force row level security;
alter table public.agent_1c_project_bindings enable row level security;
alter table public.agent_1c_project_bindings force row level security;

revoke all on table public.agent_1c_contract_bindings, public.agent_1c_project_bindings
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.agent_1c_contract_bindings, public.agent_1c_project_bindings
  to service_role;

alter table public.agent_domain_events drop constraint agent_domain_events_type_check;
alter table public.agent_domain_events add constraint agent_domain_events_type_check check (event_type in (
  'AGENT_CREATED', 'AGENT_STATUS_CHANGED', 'AGENT_PROFILE_UPDATED',
  'AGENT_CONTRACT_CONFIRMED', 'COMPLIANCE_DECIDED', 'TOKEN_CREATED',
  'TOKEN_REVOKED', 'REFERRAL_CAPTURED', 'REFERRAL_STATUS_CHANGED',
  'ATTRIBUTION_CREATED', 'ATTRIBUTION_EXTENDED', 'ATTRIBUTION_CONFLICT',
  'ATTRIBUTION_REASSIGNED', 'ATTRIBUTION_TERMINATED', 'AGENT_1C_LINKED',
  'AGENT_SALE_LINKED', 'AGENT_SALE_REFRESHED', 'AGENT_REWARD_STATUS_CHANGED',
  'AUTH_PASSWORD_RESET_REQUESTED', 'AUTH_SESSIONS_REVOKED',
  'AGENT_1C_BINDING_VERIFIED', 'AGENT_CONTRACT_LINKED',
  'AGENT_CONTRACT_SUPERSEDED', 'AGENT_PROJECT_LINKED', 'AGENT_PROJECT_SUPERSEDED'
));

create or replace function public.verify_agent_1c_binding_record(
  p_agent_id uuid,
  p_source_agent_1c_id text,
  p_source_external_code text,
  p_source_fiscal_code text,
  p_source_name_snapshot text,
  p_source_agent_code text,
  p_agent_code_state text,
  p_source_observed_at timestamptz,
  p_actor_user_id uuid,
  p_safe_error text default null
)
returns public.agent_1c_bindings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.commercial_agents;
  current_binding public.agent_1c_bindings;
begin
  if p_agent_code_state not in ('MATCH', 'MISSING', 'MISMATCH', 'NOT_VERIFIED') then
    raise exception 'Invalid Agent code state.' using errcode = '22023';
  end if;
  select * into target from public.commercial_agents where id = p_agent_id;
  if target.id is null then raise exception 'Commercial Agent not found.' using errcode = 'P0002'; end if;
  select * into current_binding from public.agent_1c_bindings where agent_id = p_agent_id for update;
  if current_binding.agent_id is null or lower(current_binding.source_agent_1c_id) <> lower(p_source_agent_1c_id) then
    raise exception '1C binding changed during verification.' using errcode = '40001';
  end if;
  update public.agent_1c_bindings set
    source_external_code = btrim(p_source_external_code),
    source_fiscal_code = nullif(btrim(p_source_fiscal_code), ''),
    source_name_snapshot = btrim(p_source_name_snapshot),
    source_agent_code_snapshot = nullif(btrim(p_source_agent_code), ''),
    agent_code_state = p_agent_code_state,
    source_observed_at = p_source_observed_at,
    verified_at = case when p_safe_error is null then now() else verified_at end,
    last_verification_error = nullif(btrim(p_safe_error), ''),
    updated_at = now()
  where agent_id = p_agent_id
  returning * into current_binding;
  insert into public.agent_domain_events(agent_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_actor_user_id, 'AGENT_1C_BINDING_VERIFIED', jsonb_build_object(
    'sourceRef', lower(p_source_agent_1c_id), 'agentCodeState', p_agent_code_state,
    'sourceObservedAt', p_source_observed_at, 'succeeded', p_safe_error is null
  ));
  return current_binding;
end;
$$;

create or replace function public.correct_agent_1c_binding_record(
  p_agent_id uuid,
  p_expected_source_agent_1c_id text,
  p_source_agent_1c_id text,
  p_source_external_code text,
  p_source_fiscal_code text,
  p_source_name_snapshot text,
  p_source_agent_code text,
  p_actor_user_id uuid,
  p_reason text
)
returns public.agent_1c_bindings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_binding public.agent_1c_bindings;
  changed public.agent_1c_bindings;
begin
  if char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Rebind reason is required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agent-1c:' || p_agent_id::text, 0));
  select * into current_binding from public.agent_1c_bindings where agent_id = p_agent_id for update;
  if current_binding.agent_id is null or lower(current_binding.source_agent_1c_id) <> lower(p_expected_source_agent_1c_id) then
    raise exception '1C binding changed during correction.' using errcode = '40001';
  end if;
  if exists (select 1 from public.agent_sale_links where agent_id = p_agent_id) then
    raise exception 'Agent has downstream sale evidence; reconciliation is required.' using errcode = '55000';
  end if;
  if exists (select 1 from public.agent_1c_contract_bindings where agent_id = p_agent_id) or
     exists (select 1 from public.agent_1c_project_bindings where agent_id = p_agent_id) then
    raise exception 'Agent has downstream 1C bindings; reconciliation is required.' using errcode = '55000';
  end if;
  update public.agent_1c_bindings set
    source_agent_1c_id = lower(p_source_agent_1c_id),
    source_external_code = btrim(p_source_external_code),
    source_fiscal_code = nullif(btrim(p_source_fiscal_code), ''),
    source_name_snapshot = btrim(p_source_name_snapshot),
    source_agent_code_snapshot = nullif(btrim(p_source_agent_code), ''),
    agent_code_state = 'MATCH', source_observed_at = now(), verified_at = now(),
    last_verification_error = null, linked_by = p_actor_user_id, linked_at = now(), updated_at = now()
  where agent_id = p_agent_id returning * into changed;
  update public.commercial_agents set source_agent_1c_id = changed.source_agent_1c_id, updated_at = now()
  where id = p_agent_id;
  insert into public.agent_domain_events(agent_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_actor_user_id, 'AGENT_1C_LINKED', jsonb_build_object(
    'correction', true, 'fromSourceRef', lower(p_expected_source_agent_1c_id),
    'toSourceRef', lower(p_source_agent_1c_id), 'reason', btrim(p_reason)
  ));
  return changed;
end;
$$;

create or replace function public.bind_agent_1c_contract_record(
  p_agent_id uuid,
  p_source_contract_1c_ref text,
  p_source_counterparty_1c_ref text,
  p_source_contract_number text,
  p_source_contract_name text,
  p_source_contract_type text,
  p_source_contract_date date,
  p_source_contract_valid_until date,
  p_source_contract_signed boolean,
  p_source_agent_code text,
  p_source_observed_at timestamptz,
  p_actor_user_id uuid,
  p_supersession_reason text default null
)
returns public.agent_1c_contract_bindings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.commercial_agents;
  identity_binding public.agent_1c_bindings;
  current_binding public.agent_1c_contract_bindings;
  changed public.agent_1c_contract_bindings;
begin
  perform pg_advisory_xact_lock(hashtextextended('agent-contract:' || p_agent_id::text, 0));
  select * into target from public.commercial_agents where id = p_agent_id;
  select * into identity_binding from public.agent_1c_bindings where agent_id = p_agent_id;
  if target.id is null or identity_binding.agent_id is null then
    raise exception 'Verified Counterparty binding is required.' using errcode = '23503';
  end if;
  if lower(identity_binding.source_agent_1c_id) <> lower(p_source_counterparty_1c_ref)
     or btrim(p_source_agent_code) <> target.agent_code then
    raise exception 'Contract does not match Agent identity.' using errcode = '23514';
  end if;
  select * into current_binding from public.agent_1c_contract_bindings where agent_id = p_agent_id and is_current for update;
  if current_binding.id is not null and lower(current_binding.source_contract_1c_ref) = lower(p_source_contract_1c_ref) then
    update public.agent_1c_contract_bindings set
      source_contract_number_snapshot = nullif(btrim(p_source_contract_number), ''),
      source_contract_name_snapshot = btrim(p_source_contract_name),
      source_contract_type_snapshot = btrim(p_source_contract_type),
      source_contract_date_snapshot = p_source_contract_date,
      source_contract_valid_until_snapshot = p_source_contract_valid_until,
      source_contract_signed_snapshot = p_source_contract_signed,
      source_agent_code_snapshot = btrim(p_source_agent_code), agent_code_state = 'MATCH',
      verified_at = now(), source_observed_at = p_source_observed_at, updated_at = now()
    where id = current_binding.id returning * into changed;
    return changed;
  end if;
  if current_binding.id is not null then
    if char_length(btrim(p_supersession_reason)) not between 3 and 1000 then
      raise exception 'Supersession reason is required.' using errcode = '22023';
    end if;
    update public.agent_1c_contract_bindings set is_current = false, superseded_at = now(),
      superseded_by = p_actor_user_id, supersession_reason = btrim(p_supersession_reason), updated_at = now()
    where id = current_binding.id;
    insert into public.agent_domain_events(agent_id, actor_user_id, event_type, safe_metadata)
    values (p_agent_id, p_actor_user_id, 'AGENT_CONTRACT_SUPERSEDED', jsonb_build_object(
      'fromContractRef', current_binding.source_contract_1c_ref,
      'toContractRef', lower(p_source_contract_1c_ref), 'reason', btrim(p_supersession_reason)
    ));
    update public.agent_1c_project_bindings set is_current = false, superseded_at = now(),
      superseded_by = p_actor_user_id,
      supersession_reason = 'Contract superseded: ' || btrim(p_supersession_reason), updated_at = now()
    where agent_id = p_agent_id and is_current;
    if found then
      insert into public.agent_domain_events(agent_id, actor_user_id, event_type, safe_metadata)
      values (p_agent_id, p_actor_user_id, 'AGENT_PROJECT_SUPERSEDED', jsonb_build_object(
        'reason', 'CONTRACT_SUPERSEDED', 'toContractRef', lower(p_source_contract_1c_ref)
      ));
    end if;
  end if;
  insert into public.agent_1c_contract_bindings(
    agent_id, source_contract_1c_ref, source_counterparty_1c_ref,
    source_contract_number_snapshot, source_contract_name_snapshot, source_contract_type_snapshot,
    source_contract_date_snapshot, source_contract_valid_until_snapshot, source_contract_signed_snapshot,
    source_agent_code_snapshot, agent_code_state, linked_by, verified_at, source_observed_at
  ) values (
    p_agent_id, lower(p_source_contract_1c_ref), lower(p_source_counterparty_1c_ref),
    nullif(btrim(p_source_contract_number), ''), btrim(p_source_contract_name), btrim(p_source_contract_type),
    p_source_contract_date, p_source_contract_valid_until, p_source_contract_signed,
    btrim(p_source_agent_code), 'MATCH', p_actor_user_id, now(), p_source_observed_at
  ) returning * into changed;
  insert into public.agent_domain_events(agent_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_actor_user_id, 'AGENT_CONTRACT_LINKED', jsonb_build_object(
    'contractRef', changed.source_contract_1c_ref,
    'counterpartyRef', changed.source_counterparty_1c_ref, 'agentCodeState', 'MATCH'
  ));
  return changed;
end;
$$;

create or replace function public.bind_agent_1c_project_record(
  p_agent_id uuid,
  p_source_project_1c_ref text,
  p_source_project_name text,
  p_source_project_code text,
  p_source_counterparty_1c_ref text,
  p_source_contract_1c_ref text,
  p_source_start_date date,
  p_source_end_date date,
  p_source_agent_code text,
  p_agent_code_evidence text,
  p_source_observed_at timestamptz,
  p_actor_user_id uuid,
  p_supersession_reason text default null
)
returns public.agent_1c_project_bindings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.commercial_agents;
  identity_binding public.agent_1c_bindings;
  contract_binding public.agent_1c_contract_bindings;
  current_binding public.agent_1c_project_bindings;
  changed public.agent_1c_project_bindings;
begin
  if p_agent_code_evidence not in ('CUSTOM_PROPERTY', 'STRUCTURED_NAME') then
    raise exception 'Project Agent-code evidence is required.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agent-project:' || p_agent_id::text, 0));
  select * into target from public.commercial_agents where id = p_agent_id;
  select * into identity_binding from public.agent_1c_bindings where agent_id = p_agent_id;
  select * into contract_binding from public.agent_1c_contract_bindings where agent_id = p_agent_id and is_current;
  if target.id is null or identity_binding.agent_id is null or contract_binding.id is null then
    raise exception 'Verified Counterparty and Contract bindings are required.' using errcode = '23503';
  end if;
  if lower(identity_binding.source_agent_1c_id) <> lower(p_source_counterparty_1c_ref)
     or lower(contract_binding.source_contract_1c_ref) <> lower(p_source_contract_1c_ref)
     or btrim(p_source_agent_code) <> target.agent_code then
    raise exception 'Project does not match Agent identity and Contract.' using errcode = '23514';
  end if;
  select * into current_binding from public.agent_1c_project_bindings where agent_id = p_agent_id and is_current for update;
  if current_binding.id is not null and lower(current_binding.source_project_1c_ref) = lower(p_source_project_1c_ref) then
    update public.agent_1c_project_bindings set
      source_project_name_snapshot = btrim(p_source_project_name),
      source_project_code_snapshot = nullif(btrim(p_source_project_code), ''),
      source_start_date_snapshot = p_source_start_date, source_end_date_snapshot = p_source_end_date,
      source_agent_code_snapshot = btrim(p_source_agent_code), agent_code_state = 'MATCH',
      agent_code_evidence = p_agent_code_evidence, verified_at = now(),
      source_observed_at = p_source_observed_at, updated_at = now()
    where id = current_binding.id returning * into changed;
    return changed;
  end if;
  if current_binding.id is not null then
    if char_length(btrim(p_supersession_reason)) not between 3 and 1000 then
      raise exception 'Supersession reason is required.' using errcode = '22023';
    end if;
    update public.agent_1c_project_bindings set is_current = false, superseded_at = now(),
      superseded_by = p_actor_user_id, supersession_reason = btrim(p_supersession_reason), updated_at = now()
    where id = current_binding.id;
    insert into public.agent_domain_events(agent_id, actor_user_id, event_type, safe_metadata)
    values (p_agent_id, p_actor_user_id, 'AGENT_PROJECT_SUPERSEDED', jsonb_build_object(
      'fromProjectRef', current_binding.source_project_1c_ref,
      'toProjectRef', lower(p_source_project_1c_ref), 'reason', btrim(p_supersession_reason)
    ));
  end if;
  insert into public.agent_1c_project_bindings(
    agent_id, source_project_1c_ref, source_project_name_snapshot, source_project_code_snapshot,
    source_counterparty_1c_ref, source_contract_1c_ref, source_start_date_snapshot,
    source_end_date_snapshot, source_agent_code_snapshot, agent_code_state, agent_code_evidence,
    linked_by, verified_at, source_observed_at
  ) values (
    p_agent_id, lower(p_source_project_1c_ref), btrim(p_source_project_name), nullif(btrim(p_source_project_code), ''),
    lower(p_source_counterparty_1c_ref), lower(p_source_contract_1c_ref), p_source_start_date,
    p_source_end_date, btrim(p_source_agent_code), 'MATCH', p_agent_code_evidence,
    p_actor_user_id, now(), p_source_observed_at
  ) returning * into changed;
  insert into public.agent_domain_events(agent_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_actor_user_id, 'AGENT_PROJECT_LINKED', jsonb_build_object(
    'projectRef', changed.source_project_1c_ref, 'contractRef', changed.source_contract_1c_ref,
    'counterpartyRef', changed.source_counterparty_1c_ref, 'agentCodeState', 'MATCH'
  ));
  return changed;
end;
$$;

create or replace function public.record_agent_auth_password_reset_requested(
  p_agent_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.commercial_agents where id = p_agent_id and user_id is not null) then
    raise exception 'Agent Auth identity is unavailable.' using errcode = 'P0002';
  end if;
  insert into public.agent_domain_events(agent_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_actor_user_id, 'AUTH_PASSWORD_RESET_REQUESTED', '{"channel":"EMAIL_RECOVERY"}'::jsonb);
end;
$$;

revoke all on function public.verify_agent_1c_binding_record(uuid, text, text, text, text, text, text, timestamptz, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.correct_agent_1c_binding_record(uuid, text, text, text, text, text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.bind_agent_1c_contract_record(uuid, text, text, text, text, text, date, date, boolean, text, timestamptz, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.bind_agent_1c_project_record(uuid, text, text, text, text, text, date, date, text, text, timestamptz, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.record_agent_auth_password_reset_requested(uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.verify_agent_1c_binding_record(uuid, text, text, text, text, text, text, timestamptz, uuid, text) to service_role;
grant execute on function public.correct_agent_1c_binding_record(uuid, text, text, text, text, text, text, uuid, text) to service_role;
grant execute on function public.bind_agent_1c_contract_record(uuid, text, text, text, text, text, date, date, boolean, text, timestamptz, uuid, text) to service_role;
grant execute on function public.bind_agent_1c_project_record(uuid, text, text, text, text, text, date, date, text, text, timestamptz, uuid, text) to service_role;
grant execute on function public.record_agent_auth_password_reset_requested(uuid, uuid) to service_role;

comment on table public.agent_1c_contract_bindings is
  'History-preserving Portal evidence binding a Commercial Agent to an existing 1C Counterparty contract.';
comment on table public.agent_1c_project_bindings is
  'History-preserving Portal evidence binding a Commercial Agent to an existing 1C project; it does not create or own the 1C project.';
