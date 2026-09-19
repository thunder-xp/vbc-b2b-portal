begin;

-- Unified Business access allows one authenticated external principal to own
-- both governed Partner membership(s) and one Commercial Agent relationship.
-- Replace the original cross-domain exclusivity trigger while retaining the
-- Agent identity eligibility check. Authorization continues to come from each
-- domain relationship and its own lifecycle state.
drop trigger if exists enforce_commercial_agent_distinct_principal on public.commercial_agents;
drop trigger if exists enforce_partner_membership_distinct_from_agent on public.company_memberships;
drop function if exists private.enforce_distinct_agent_principal();

create function private.enforce_agent_principal_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1
    from public.user_profiles profile
    where profile.id = new.user_id
      and profile.status = 'active'
      and profile.user_type = 'external'
  ) then
    raise exception 'Agent principal must be an active external user.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_commercial_agent_principal_eligibility
before insert or update of user_id on public.commercial_agents
for each row execute function private.enforce_agent_principal_eligibility();

revoke all on function private.enforce_agent_principal_eligibility() from public, anon, authenticated, service_role;

-- Extend the existing company preference instead of introducing a second
-- business-context master. The selected value is a convenience only: every
-- read and every switch revalidates the authoritative membership/agent row.
alter table public.user_company_context_preferences
  add column active_context_type text not null default 'PARTNER',
  add column active_agent_id uuid null references public.commercial_agents(id) on delete restrict;

alter table public.user_company_context_preferences
  alter column active_membership_id drop not null,
  add constraint user_company_context_preferences_type_check
    check (active_context_type in ('PARTNER', 'AGENT')),
  add constraint user_company_context_preferences_target_check
    check (
      (active_context_type = 'PARTNER' and active_membership_id is not null)
      or
      (active_context_type = 'AGENT' and active_agent_id is not null)
    );

create unique index user_company_context_active_agent_idx
  on public.user_company_context_preferences(active_agent_id)
  where active_agent_id is not null;

alter table public.user_company_context_preferences force row level security;

create or replace function public.resolve_own_business_access_contexts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select auth.uid() as user_id
  ),
  partner_contexts as (
    select
      'PARTNER'::text as context_type,
      company.id as context_id,
      membership.id as membership_id,
      company.display_name,
      case
        when profile.status = 'active'
          and membership.status = 'active'
          and company.status = 'active' then 'AVAILABLE'
        when profile.status in ('registered', 'pending_approval')
          or membership.status = 'pending_approval'
          or company.status = 'pending_approval' then 'PENDING'
        else 'BLOCKED'
      end::text as access_status,
      '/cabinet'::text as target_route
    from actor
    join public.user_profiles profile on profile.id = actor.user_id
    join public.company_memberships membership on membership.user_id = actor.user_id
    join public.partner_companies company on company.id = membership.company_id
  ),
  agent_contexts as (
    select
      'AGENT'::text as context_type,
      agent.id as context_id,
      null::uuid as membership_id,
      agent.display_name,
      case
        when agent.status = 'ACTIVE' then 'AVAILABLE'
        when agent.status in ('APPLIED', 'COMPLIANCE_REVIEW', 'CONTRACT_PENDING', 'APPROVED', 'TRAINING') then 'PENDING'
        else 'BLOCKED'
      end::text as access_status,
      '/agent'::text as target_route
    from actor
    join public.commercial_agents agent on agent.user_id = actor.user_id
  ),
  contexts as (
    select * from partner_contexts
    union all
    select * from agent_contexts
  ),
  selected as (
    select context.*
    from contexts context
    join actor on true
    join public.user_company_context_preferences preference on preference.user_id = actor.user_id
    where context.access_status = 'AVAILABLE'
      and (
        (preference.active_context_type = 'PARTNER'
          and context.context_type = 'PARTNER'
          and context.membership_id = preference.active_membership_id)
        or
        (preference.active_context_type = 'AGENT'
          and context.context_type = 'AGENT'
          and context.context_id = preference.active_agent_id)
      )
    limit 1
  )
  select jsonb_build_object(
    'contexts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', context.context_type,
        'contextId', context.context_id,
        'displayName', context.display_name,
        'status', context.access_status,
        'targetRoute', context.target_route
      ) order by context.context_type, lower(context.display_name), context.context_id)
      from contexts context
    ), '[]'::jsonb),
    'preferredContext', (
      select jsonb_build_object(
        'type', selected.context_type,
        'contextId', selected.context_id,
        'displayName', selected.display_name,
        'status', selected.access_status,
        'targetRoute', selected.target_route
      )
      from selected
    )
  );
$$;

create or replace function public.select_own_business_context(
  p_context_type text,
  p_context_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_membership_id uuid;
  selected_display_name text;
begin
  if actor_id is null or p_context_id is null or p_context_type is null or p_context_type not in ('PARTNER', 'AGENT') then
    raise exception 'business_context_not_available' using errcode = '42501';
  end if;

  if p_context_type = 'PARTNER' then
    select membership.id, company.display_name
      into selected_membership_id, selected_display_name
    from public.user_profiles profile
    join public.company_memberships membership on membership.user_id = profile.id
    join public.partner_companies company on company.id = membership.company_id
    where profile.id = actor_id
      and profile.status = 'active'
      and membership.status = 'active'
      and company.status = 'active'
      and company.id = p_context_id
    limit 1;

    if selected_membership_id is null then
      raise exception 'business_context_not_available' using errcode = '42501';
    end if;

    insert into public.user_company_context_preferences(
      user_id, active_membership_id, active_context_type, active_agent_id, changed_by
    ) values (
      actor_id, selected_membership_id, 'PARTNER', null, actor_id
    )
    on conflict (user_id) do update set
      active_membership_id = excluded.active_membership_id,
      active_context_type = excluded.active_context_type,
      active_agent_id = null,
      version = public.user_company_context_preferences.version + 1,
      changed_by = actor_id,
      changed_at = now();

    return jsonb_build_object(
      'type', 'PARTNER', 'contextId', p_context_id,
      'displayName', selected_display_name, 'status', 'AVAILABLE',
      'targetRoute', '/cabinet'
    );
  end if;

  select agent.display_name
    into selected_display_name
  from public.commercial_agents agent
  where agent.id = p_context_id
    and agent.user_id = actor_id
    and agent.status = 'ACTIVE'
  limit 1;

  if selected_display_name is null then
    raise exception 'business_context_not_available' using errcode = '42501';
  end if;

  insert into public.user_company_context_preferences(
    user_id, active_membership_id, active_context_type, active_agent_id, changed_by
  ) values (
    actor_id, null, 'AGENT', p_context_id, actor_id
  )
  on conflict (user_id) do update set
    active_membership_id = null,
    active_context_type = excluded.active_context_type,
    active_agent_id = excluded.active_agent_id,
    version = public.user_company_context_preferences.version + 1,
    changed_by = actor_id,
    changed_at = now();

  return jsonb_build_object(
    'type', 'AGENT', 'contextId', p_context_id,
    'displayName', selected_display_name, 'status', 'AVAILABLE',
    'targetRoute', '/agent'
  );
end;
$$;

revoke all on function public.resolve_own_business_access_contexts() from public, anon, authenticated, service_role;
revoke all on function public.select_own_business_context(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.resolve_own_business_access_contexts() to authenticated;
grant execute on function public.select_own_business_context(text, uuid) to authenticated;

comment on function public.resolve_own_business_access_contexts() is
  'Returns bounded Partner/Agent access contexts for auth.uid(); user_type is never authorization truth.';
comment on function public.select_own_business_context(text, uuid) is
  'Revalidates and persists a last-used Partner or Agent context for auth.uid(); preference never grants access.';

commit;
