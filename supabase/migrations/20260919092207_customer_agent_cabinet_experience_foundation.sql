-- Keep the Agent home on its existing single bounded overview read while
-- exposing factual referral updates and append-only domain activity.
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
  ),
  own_activity as (
    select event.id, event.event_type, event.created_at, event.referral_id,
      referral.name_snapshot as referral_name
    from public.agent_domain_events event
    join agent on agent.id = event.agent_id
    left join public.agent_referrals referral on referral.id = event.referral_id
    where event.event_type in (
      'REFERRAL_CAPTURED', 'REFERRAL_STATUS_CHANGED', 'ATTRIBUTION_CREATED',
      'ATTRIBUTION_EXTENDED', 'ATTRIBUTION_CONFLICT',
      'ATTRIBUTION_REASSIGNED', 'ATTRIBUTION_TERMINATED'
    )
    order by event.created_at desc, event.id desc
    limit 6
  )
  select case when not exists(select 1 from agent) then null else jsonb_build_object(
    'kpis', jsonb_build_object(
      'myClients', (select count(*) from own_attributions where status = 'ACTIVE'),
      'activeReferrals', (select count(*) from own_referrals where status in ('VERIFIED', 'ACTIVE')),
      'newReferrals', (select count(*) from own_referrals where status in ('CAPTURED', 'PENDING_REVIEW')),
      'attributedToMe', (select count(*) from own_attributions)
    ),
    'needsAttention', coalesce((select jsonb_agg(row_to_json(item)) from (
      select id, name_snapshot as name, status, submitted_at as "submittedAt", updated_at as "updatedAt"
      from own_referrals where status in ('CONFLICT', 'REJECTED', 'EXISTING_CUSTOMER')
      order by updated_at desc, id desc limit 3
    ) item), '[]'::jsonb),
    'latestReferrals', coalesce((select jsonb_agg(row_to_json(item)) from (
      select id, name_snapshot as name, status, submitted_at as "submittedAt", updated_at as "updatedAt"
      from own_referrals where status in ('CAPTURED', 'PENDING_REVIEW', 'VERIFIED', 'ACTIVE')
      order by updated_at desc, id desc limit 5
    ) item), '[]'::jsonb),
    'latestClients', coalesce((select jsonb_agg(row_to_json(item)) from (
      select attribution.id, referral.name_snapshot as name, attribution.status,
        attribution.valid_from as "attributedAt", attribution.protection_until as "protectionUntil"
      from own_attributions attribution
      join public.agent_referrals referral on referral.id = attribution.referral_id
      order by attribution.valid_from desc, attribution.id desc limit 5
    ) item), '[]'::jsonb),
    'latestActivity', coalesce((select jsonb_agg(row_to_json(item)) from (
      select id, event_type as "eventType", created_at as "createdAt",
        referral_id as "referralId", referral_name as "referralName"
      from own_activity
    ) item), '[]'::jsonb)
  ) end;
$$;

comment on function public.get_agent_cabinet_overview() is
  'Single bounded self-scoped Agent cabinet overview with factual referral activity; no commission or financial data.';
