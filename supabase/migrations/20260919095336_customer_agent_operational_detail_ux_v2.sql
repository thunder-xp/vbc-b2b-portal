-- Bounded operational read projections only. Domain ownership and write paths are unchanged.

create or replace function public.list_agent_cabinet_referrals(p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  with agent as (select (private.current_commercial_agent()).*), rows as (
    select referral.id, referral.submitted_at as "submittedAt", referral.updated_at as "updatedAt",
      referral.customer_kind as "customerKind", referral.name_snapshot as name,
      referral.phone_snapshot as phone, referral.email_snapshot as email, referral.locality,
      referral.object_type as "objectType", referral.need_summary as "needSummary",
      referral.short_description as "shortDescription", referral.project_timing as "projectTiming",
      referral.status, referral.duplicate_reason as "duplicateReason",
      referral.existing_customer_reason as "existingCustomerReason", referral.reviewed_at as "reviewedAt",
      attribution.id as "attributionId", attribution.status as "attributionStatus",
      attribution.protection_until as "protectionUntil", event.event_type as "lastEventType",
      event.created_at as "lastEventAt"
    from public.agent_referrals referral join agent on agent.id = referral.agent_id
    left join lateral (
      select a.id, a.status, a.protection_until from public.agent_attributions a
      where a.referral_id = referral.id order by a.created_at desc, a.id desc limit 1
    ) attribution on true
    left join lateral (
      select e.event_type, e.created_at from public.agent_domain_events e
      where e.referral_id = referral.id order by e.created_at desc, e.id desc limit 1
    ) event on true
    order by referral.submitted_at desc, referral.id
    limit least(greatest(p_limit, 1), 20) offset greatest(p_offset, 0)
  ) select jsonb_build_object(
    'items', coalesce((select jsonb_agg(row_to_json(rows)) from rows), '[]'::jsonb),
    'total', (select count(*) from public.agent_referrals referral join agent on agent.id = referral.agent_id)
  );
$$;

create or replace function public.get_agent_cabinet_referral(p_referral_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(item) from (
    select referral.id, referral.submitted_at as "submittedAt", referral.updated_at as "updatedAt",
      referral.customer_kind as "customerKind", referral.name_snapshot as name,
      referral.phone_snapshot as phone, referral.email_snapshot as email, referral.locality,
      referral.object_type as "objectType", referral.need_summary as "needSummary",
      referral.short_description as "shortDescription", referral.project_timing as "projectTiming",
      referral.status, referral.duplicate_reason as "duplicateReason",
      referral.existing_customer_reason as "existingCustomerReason", referral.reviewed_at as "reviewedAt",
      attribution.id as "attributionId", attribution.status as "attributionStatus",
      attribution.protection_until as "protectionUntil",
      coalesce((select jsonb_agg(jsonb_build_object('id', event.id, 'type', event.event_type, 'createdAt', event.created_at)
        order by event.created_at, event.id) from public.agent_domain_events event
        where event.referral_id = referral.id), '[]'::jsonb) as events
    from public.agent_referrals referral
    join public.commercial_agents agent on agent.id = referral.agent_id and agent.user_id = auth.uid()
    left join lateral (
      select a.id, a.status, a.protection_until from public.agent_attributions a
      where a.referral_id = referral.id order by a.created_at desc, a.id desc limit 1
    ) attribution on true
    where referral.id = p_referral_id
  ) item;
$$;

create or replace function public.list_agent_cabinet_clients(p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  with agent as (select (private.current_commercial_agent()).*), rows as (
    select attribution.id, referral.name_snapshot as name, referral.customer_kind as "customerKind",
      referral.phone_snapshot as phone, referral.email_snapshot as email, referral.locality,
      referral.object_type as "objectType", referral.need_summary as "needSummary",
      referral.id as "referralId", attribution.status, attribution.valid_from as "attributedAt",
      attribution.protection_until as "protectionUntil", attribution.extended_until as "extendedUntil",
      event.event_type as "lastEventType", event.created_at as "lastEventAt"
    from public.agent_attributions attribution join agent on agent.id = attribution.agent_id
    join public.agent_referrals referral on referral.id = attribution.referral_id
    left join lateral (
      select e.event_type, e.created_at from public.agent_domain_events e
      where e.attribution_id = attribution.id order by e.created_at desc, e.id desc limit 1
    ) event on true
    order by attribution.valid_from desc, attribution.id
    limit least(greatest(p_limit, 1), 20) offset greatest(p_offset, 0)
  ) select jsonb_build_object(
    'items', coalesce((select jsonb_agg(row_to_json(rows)) from rows), '[]'::jsonb),
    'total', (select count(*) from public.agent_attributions attribution join agent on agent.id = attribution.agent_id)
  );
$$;

create or replace function public.get_agent_cabinet_client(p_attribution_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(item) from (
    select attribution.id, referral.name_snapshot as name, referral.customer_kind as "customerKind",
      referral.phone_snapshot as phone, referral.email_snapshot as email, referral.locality,
      referral.object_type as "objectType", referral.need_summary as "needSummary",
      referral.id as "referralId", attribution.status, attribution.valid_from as "attributedAt",
      attribution.protection_until as "protectionUntil", attribution.extended_until as "extendedUntil",
      coalesce((select jsonb_agg(jsonb_build_object('id', event.id, 'type', event.event_type, 'createdAt', event.created_at)
        order by event.created_at, event.id) from public.agent_domain_events event
        where event.attribution_id = attribution.id or event.referral_id = referral.id), '[]'::jsonb) as events
    from public.agent_attributions attribution
    join public.commercial_agents agent on agent.id = attribution.agent_id and agent.user_id = auth.uid()
    join public.agent_referrals referral on referral.id = attribution.referral_id
    where attribution.id = p_attribution_id
  ) item;
$$;

create or replace function public.list_customer_service_requests_summary_v1(
  p_customer_identity_id uuid, p_limit integer default 20, p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(row_to_json(item) order by item."createdAt" desc), '[]'::jsonb)
  from (
    select request.id, request.public_number as number, request.request_type as type,
      request.subject, request.description, request.preferred_contact as "preferredContact",
      request.status, request.retail_order_id as "orderId", request.retail_order_line_id as "orderLineId",
      request.created_at as "createdAt", request.updated_at as "updatedAt", request.version,
      message.body as "latestMessage", message.author_type as "latestMessageAuthor",
      message.created_at as "latestMessageAt"
    from public.customer_service_requests request
    left join lateral (
      select body, author_type, created_at from public.customer_service_messages
      where request_id = request.id and visibility = 'CUSTOMER_VISIBLE'
      order by created_at desc, id desc limit 1
    ) message on true
    where request.customer_identity_id = p_customer_identity_id
    order by request.created_at desc, request.id
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
  ) item;
$$;

revoke all on function public.list_customer_service_requests_summary_v1(uuid, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.list_customer_service_requests_summary_v1(uuid, integer, integer) to service_role;

revoke all on function public.list_agent_cabinet_referrals(integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.get_agent_cabinet_referral(uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_agent_cabinet_clients(integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.get_agent_cabinet_client(uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_agent_cabinet_referrals(integer, integer) to authenticated;
grant execute on function public.get_agent_cabinet_referral(uuid) to authenticated;
grant execute on function public.list_agent_cabinet_clients(integer, integer) to authenticated;
grant execute on function public.get_agent_cabinet_client(uuid) to authenticated;
