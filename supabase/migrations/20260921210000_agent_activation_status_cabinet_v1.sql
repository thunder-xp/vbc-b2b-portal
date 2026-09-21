-- Govern contract confirmation and enforce Agent activation prerequisites.

alter table public.commercial_agents
  add column if not exists contract_confirmed_at timestamptz null,
  add column if not exists contract_confirmed_by uuid null
    references public.user_profiles(id) on delete restrict;

comment on column public.commercial_agents.contract_confirmed_at is
  'Timestamp written only by the governed commercial Agent contract confirmation RPC.';
comment on column public.commercial_agents.contract_confirmed_by is
  'Internal actor who confirmed that contractual formalities are complete.';

alter table public.agent_domain_events drop constraint agent_domain_events_type_check;
alter table public.agent_domain_events add constraint agent_domain_events_type_check check (event_type in (
  'AGENT_CREATED', 'AGENT_STATUS_CHANGED', 'AGENT_PROFILE_UPDATED',
  'AGENT_CONTRACT_CONFIRMED', 'COMPLIANCE_DECIDED', 'TOKEN_CREATED',
  'TOKEN_REVOKED', 'REFERRAL_CAPTURED', 'REFERRAL_STATUS_CHANGED',
  'ATTRIBUTION_CREATED', 'ATTRIBUTION_EXTENDED', 'ATTRIBUTION_CONFLICT',
  'ATTRIBUTION_REASSIGNED', 'ATTRIBUTION_TERMINATED'
));

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
  if new.status <> old.status and new.status in ('APPROVED', 'ACTIVE')
    and (new.compliance_status <> 'APPROVED' or not new.contract_ready) then
    raise exception 'Approved compliance and confirmed contract are required for this Agent status.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.confirm_commercial_agent_contract(
  p_agent_id uuid,
  p_actor_user_id uuid
)
returns public.commercial_agents
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.commercial_agents;
begin
  select * into target
  from public.commercial_agents
  where id = p_agent_id
  for update;

  if target.id is null then
    raise exception 'Commercial Agent not found.' using errcode = 'P0002';
  end if;
  if target.compliance_status <> 'APPROVED' then
    raise exception 'Commercial Agent compliance must be approved before contract confirmation.' using errcode = '23514';
  end if;
  if target.contract_ready then
    return target;
  end if;

  update public.commercial_agents
  set contract_ready = true,
      contract_confirmed_at = now(),
      contract_confirmed_by = p_actor_user_id
  where id = p_agent_id
  returning * into target;

  insert into public.agent_domain_events (agent_id, actor_user_id, event_type)
  values (p_agent_id, p_actor_user_id, 'AGENT_CONTRACT_CONFIRMED');

  return target;
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
  previous public.commercial_agents;
  changed public.commercial_agents;
begin
  select * into previous
  from public.commercial_agents
  where id = p_agent_id
  for update;

  if previous.id is null then
    raise exception 'Commercial Agent not found.' using errcode = 'P0002';
  end if;
  if not (
    (previous.status = 'APPLIED' and p_target_status in ('COMPLIANCE_REVIEW', 'REJECTED')) or
    (previous.status = 'COMPLIANCE_REVIEW' and p_target_status in ('CONTRACT_PENDING', 'REJECTED')) or
    (previous.status = 'CONTRACT_PENDING' and p_target_status in ('APPROVED', 'REJECTED')) or
    (previous.status = 'APPROVED' and p_target_status in ('TRAINING', 'ACTIVE', 'SUSPENDED')) or
    (previous.status = 'TRAINING' and p_target_status in ('ACTIVE', 'SUSPENDED')) or
    (previous.status = 'ACTIVE' and p_target_status in ('SUSPENDED', 'TERMINATED')) or
    (previous.status = 'SUSPENDED' and p_target_status in ('ACTIVE', 'TERMINATED'))
  ) then
    raise exception 'Invalid Commercial Agent status transition.' using errcode = '23514';
  end if;
  if p_target_status in ('APPROVED', 'ACTIVE')
    and (previous.compliance_status <> 'APPROVED' or not previous.contract_ready) then
    raise exception 'Approved compliance and confirmed contract are required for this Agent status.' using errcode = '23514';
  end if;

  update public.commercial_agents
  set status = p_target_status
  where id = p_agent_id
  returning * into changed;

  insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
  values (p_agent_id, p_actor_user_id, 'AGENT_STATUS_CHANGED', jsonb_build_object('from', previous.status, 'to', p_target_status));
  return changed;
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
declare
  target_status text;
  created_id uuid;
begin
  select status into target_status
  from public.commercial_agents
  where id = p_agent_id
  for update;

  if target_status is null then
    raise exception 'Commercial Agent not found.' using errcode = 'P0002';
  end if;
  if target_status <> 'ACTIVE' then
    raise exception 'Referral tokens require an active Commercial Agent.' using errcode = '42501';
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

revoke all on function public.confirm_commercial_agent_contract(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.confirm_commercial_agent_contract(uuid, uuid) to service_role;

revoke all on function public.transition_commercial_agent_record(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.transition_commercial_agent_record(uuid, text, uuid) to service_role;

revoke all on function public.create_agent_referral_token_record(uuid, text, text, text, timestamptz, uuid) from public, anon, authenticated, service_role;
grant execute on function public.create_agent_referral_token_record(uuid, text, text, text, timestamptz, uuid) to service_role;
