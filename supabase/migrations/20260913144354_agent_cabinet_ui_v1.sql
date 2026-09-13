-- Agent Cabinet V1: bounded self-service projections over the existing Agent
-- foundation. Commercial and accounting truth remains in 1C; this migration
-- exposes no partner, price, finance or order data.

alter table public.agent_referral_tokens
  add column public_token text null;

alter table public.agent_referral_tokens
  add constraint agent_referral_tokens_public_token_check
  check (public_token is null or public_token ~ '^[A-Za-z0-9_-]{43}$'),
  add constraint agent_referral_tokens_public_token_unique unique (public_token);

create unique index agent_referral_tokens_one_primary_qr_idx
  on public.agent_referral_tokens (agent_id)
  where token_type = 'QR'
    and campaign_ref is null
    and status = 'ACTIVE'
    and revoked_at is null
    and public_token is not null;

create or replace function private.current_commercial_agent()
returns public.commercial_agents
language sql
stable
security definer
set search_path = ''
as $$
  select agent
  from public.commercial_agents agent
  where agent.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.get_agent_cabinet_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when agent.id is null then null else jsonb_build_object(
    'id', agent.id,
    'agentCode', agent.agent_code,
    'agentType', agent.agent_type,
    'displayName', agent.display_name,
    'legalName', agent.legal_name,
    'phone', agent.phone,
    'email', agent.email,
    'locality', agent.locality,
    'profession', agent.profession,
    'workplace', agent.workplace,
    'status', agent.status,
    'complianceStatus', agent.compliance_status,
    'level', agent.level,
    'contractReady', agent.contract_ready,
    'accessMode', case
      when agent.status = 'ACTIVE' then 'OPERATIONAL'
      when agent.status = 'SUSPENDED' then 'RESTRICTED'
      else 'STATUS_ONLY'
    end
  ) end
  from (select (private.current_commercial_agent()).*) agent;
$$;

create or replace function public.get_agent_cabinet_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with agent as (select (private.current_commercial_agent()).*),
  own_referrals as (
    select referral.* from public.agent_referrals referral join agent on agent.id = referral.agent_id
  ),
  own_attributions as (
    select attribution.* from public.agent_attributions attribution join agent on agent.id = attribution.agent_id
  )
  select case when not exists(select 1 from agent) then null else jsonb_build_object(
    'kpis', jsonb_build_object(
      'myClients', (select count(*) from own_attributions where status = 'ACTIVE'),
      'activeReferrals', (select count(*) from own_referrals where status in ('VERIFIED', 'ACTIVE')),
      'newReferrals', (select count(*) from own_referrals where status in ('CAPTURED', 'PENDING_REVIEW')),
      'attributedToMe', (select count(*) from own_attributions)
    ),
    'needsAttention', coalesce((select jsonb_agg(row_to_json(item)) from (
      select id, name_snapshot as name, status, submitted_at as "submittedAt"
      from own_referrals where status in ('CONFLICT', 'REJECTED', 'EXISTING_CUSTOMER')
      order by submitted_at desc, id limit 5
    ) item), '[]'::jsonb),
    'latestReferrals', coalesce((select jsonb_agg(row_to_json(item)) from (
      select id, name_snapshot as name, status, submitted_at as "submittedAt"
      from own_referrals order by submitted_at desc, id limit 5
    ) item), '[]'::jsonb),
    'latestClients', coalesce((select jsonb_agg(row_to_json(item)) from (
      select attribution.id, referral.name_snapshot as name, attribution.status,
        attribution.valid_from as "attributedAt", attribution.protection_until as "protectionUntil"
      from own_attributions attribution
      join public.agent_referrals referral on referral.id = attribution.referral_id
      order by attribution.valid_from desc, attribution.id limit 5
    ) item), '[]'::jsonb)
  ) end;
$$;

create or replace function public.list_agent_cabinet_referrals(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with agent as (select (private.current_commercial_agent()).*),
  rows as (
    select referral.id, referral.submitted_at as "submittedAt", referral.customer_kind as "customerKind",
      referral.name_snapshot as name, referral.phone_snapshot as phone, referral.email_snapshot as email,
      referral.locality, referral.object_type as "objectType", referral.need_summary as "needSummary",
      referral.short_description as "shortDescription", referral.project_timing as "projectTiming",
      referral.status, referral.duplicate_reason as "duplicateReason",
      referral.existing_customer_reason as "existingCustomerReason", referral.reviewed_at as "reviewedAt"
    from public.agent_referrals referral join agent on agent.id = referral.agent_id
    order by referral.submitted_at desc, referral.id
    limit least(greatest(p_limit, 1), 20) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(row_to_json(rows)) from rows), '[]'::jsonb),
    'total', (select count(*) from public.agent_referrals referral join agent on agent.id = referral.agent_id)
  );
$$;

create or replace function public.get_agent_cabinet_referral(p_referral_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(item) from (
    select referral.id, referral.submitted_at as "submittedAt", referral.customer_kind as "customerKind",
      referral.name_snapshot as name, referral.phone_snapshot as phone, referral.email_snapshot as email,
      referral.locality, referral.object_type as "objectType", referral.need_summary as "needSummary",
      referral.short_description as "shortDescription", referral.project_timing as "projectTiming",
      referral.status, referral.duplicate_reason as "duplicateReason",
      referral.existing_customer_reason as "existingCustomerReason", referral.reviewed_at as "reviewedAt"
    from public.agent_referrals referral
    join public.commercial_agents agent on agent.id = referral.agent_id and agent.user_id = auth.uid()
    where referral.id = p_referral_id
  ) item;
$$;

create or replace function public.list_agent_cabinet_clients(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with agent as (select (private.current_commercial_agent()).*),
  rows as (
    select attribution.id, referral.name_snapshot as name, referral.customer_kind as "customerKind",
      referral.phone_snapshot as phone, referral.email_snapshot as email, referral.locality,
      referral.object_type as "objectType", referral.need_summary as "needSummary",
      referral.id as "referralId", attribution.status, attribution.valid_from as "attributedAt",
      attribution.protection_until as "protectionUntil", attribution.extended_until as "extendedUntil"
    from public.agent_attributions attribution
    join agent on agent.id = attribution.agent_id
    join public.agent_referrals referral on referral.id = attribution.referral_id
    order by attribution.valid_from desc, attribution.id
    limit least(greatest(p_limit, 1), 20) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(row_to_json(rows)) from rows), '[]'::jsonb),
    'total', (select count(*) from public.agent_attributions attribution join agent on agent.id = attribution.agent_id)
  );
$$;

create or replace function public.get_agent_cabinet_client(p_attribution_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(item) from (
    select attribution.id, referral.name_snapshot as name, referral.customer_kind as "customerKind",
      referral.phone_snapshot as phone, referral.email_snapshot as email, referral.locality,
      referral.object_type as "objectType", referral.need_summary as "needSummary",
      referral.id as "referralId", attribution.status, attribution.valid_from as "attributedAt",
      attribution.protection_until as "protectionUntil", attribution.extended_until as "extendedUntil"
    from public.agent_attributions attribution
    join public.commercial_agents agent on agent.id = attribution.agent_id and agent.user_id = auth.uid()
    join public.agent_referrals referral on referral.id = attribution.referral_id
    where attribution.id = p_attribution_id
  ) item;
$$;

create or replace function public.ensure_agent_cabinet_primary_token(p_public_token text, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  agent public.commercial_agents;
  token public.agent_referral_tokens;
begin
  select * into agent from private.current_commercial_agent();
  if agent.id is null or agent.status <> 'ACTIVE' then
    raise exception 'AGENT_OPERATIONAL_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  if p_public_token !~ '^[A-Za-z0-9_-]{43}$' or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REFERRAL_TOKEN' using errcode = '22023';
  end if;
  select * into token from public.agent_referral_tokens
  where agent_id = agent.id and token_type = 'QR' and campaign_ref is null
    and status = 'ACTIVE' and revoked_at is null and public_token is not null
    and (expires_at is null or expires_at > now())
  order by created_at desc limit 1;
  if token.id is null then
    insert into public.agent_referral_tokens (agent_id, token_hash, public_token, token_type)
    values (agent.id, p_token_hash, p_public_token, 'QR') returning * into token;
    insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
    values (agent.id, auth.uid(), 'TOKEN_CREATED', jsonb_build_object('tokenId', token.id, 'source', 'AGENT_CABINET_PRIMARY'));
  end if;
  return jsonb_build_object('id', token.id, 'publicToken', token.public_token, 'createdAt', token.created_at);
end;
$$;

create or replace function public.update_agent_cabinet_profile(
  p_phone text, p_email text, p_locality text, p_profession text, p_workplace text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare changed public.commercial_agents;
begin
  update public.commercial_agents set
    phone = nullif(btrim(p_phone), ''), email = nullif(lower(btrim(p_email)), ''),
    locality = nullif(btrim(p_locality), ''), profession = nullif(btrim(p_profession), ''),
    workplace = nullif(btrim(p_workplace), '')
  where user_id = auth.uid() and status not in ('TERMINATED', 'REJECTED')
  returning * into changed;
  if changed.id is null then raise exception 'AGENT_PROFILE_ACCESS_DENIED' using errcode = '42501'; end if;
  return public.get_agent_cabinet_context();
end;
$$;

revoke all on function private.current_commercial_agent() from public, anon, authenticated, service_role;
revoke all on function public.get_agent_cabinet_context() from public, anon, authenticated, service_role;
revoke all on function public.get_agent_cabinet_overview() from public, anon, authenticated, service_role;
revoke all on function public.list_agent_cabinet_referrals(integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.get_agent_cabinet_referral(uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_agent_cabinet_clients(integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.get_agent_cabinet_client(uuid) from public, anon, authenticated, service_role;
revoke all on function public.ensure_agent_cabinet_primary_token(text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_agent_cabinet_profile(text, text, text, text, text) from public, anon, authenticated, service_role;

grant execute on function public.get_agent_cabinet_context() to authenticated;
grant execute on function public.get_agent_cabinet_overview() to authenticated;
grant execute on function public.list_agent_cabinet_referrals(integer, integer) to authenticated;
grant execute on function public.get_agent_cabinet_referral(uuid) to authenticated;
grant execute on function public.list_agent_cabinet_clients(integer, integer) to authenticated;
grant execute on function public.get_agent_cabinet_client(uuid) to authenticated;
grant execute on function public.ensure_agent_cabinet_primary_token(text, text) to authenticated;
grant execute on function public.update_agent_cabinet_profile(text, text, text, text, text) to authenticated;

comment on column public.agent_referral_tokens.public_token is
  'Opaque public referral URL token. It is not an authorization credential; validation continues through token_hash.';
