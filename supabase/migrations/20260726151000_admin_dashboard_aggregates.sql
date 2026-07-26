begin;

create or replace function public.get_admin_platform_health_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('admin.dashboard.view') then
    raise exception 'Admin dashboard access is not allowed.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'catalog', (
      select jsonb_build_object(
        'status', state.status,
        'lastSuccessAt', state.last_successful_sync_at,
        'updatedAt', state.updated_at
      )
      from public.catalog_sync_state state
      where state.id = 'daily_catalog'
    ),
    'prices', (
      select jsonb_build_object(
        'status', state.status,
        'lastSuccessAt', state.last_successful_sync_at,
        'updatedAt', state.updated_at
      )
      from public.price_sync_state state
      where state.id = 'product_prices'
    ),
    'stock', (
      select jsonb_build_object(
        'status', state.status,
        'lastSuccessAt', state.last_successful_sync_at,
        'updatedAt', state.updated_at
      )
      from public.stock_sync_state state
      where state.id = 'exact_stock'
    ),
    'arrivals', jsonb_build_object(
      'status', case
        when exists (
          select 1 from public.product_supplier_arrivals arrival
          where arrival.is_published
        ) then 'succeeded'
        else 'never_run'
      end,
      'lastSuccessAt', (
        select max(arrival.published_at)
        from public.product_supplier_arrivals arrival
        where arrival.is_published
      ),
      'updatedAt', (
        select max(arrival.published_at)
        from public.product_supplier_arrivals arrival
        where arrival.is_published
      )
    ),
    'rates', jsonb_build_object(
      'status', case
        when exists (
          select 1 from public.commercial_exchange_rates rate
          where rate.is_published
        ) then 'succeeded'
        else 'never_run'
      end,
      'lastSuccessAt', (
        select max(rate.published_at)
        from public.commercial_exchange_rates rate
        where rate.is_published
      ),
      'updatedAt', (
        select max(rate.updated_at)
        from public.commercial_exchange_rates rate
        where rate.is_published
      )
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.get_admin_operational_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('admin.dashboard.view') then
    raise exception 'Admin dashboard access is not allowed.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'partnerAccess', jsonb_build_object(
      'activeCompanies', (
        select count(*) from public.partner_companies company
        where company.status = 'active'
      ),
      'activePartnerUsers', (
        select count(distinct membership.user_id)
        from public.company_memberships membership
        join public.user_profiles profile on profile.id = membership.user_id
        where membership.status = 'active'
          and profile.status = 'active'
          and profile.user_type in ('external', 'partner')
      ),
      'pendingInvitations', (
        select count(*) from public.invitations invitation
        where invitation.status = 'pending'
          and (invitation.expires_at is null or invitation.expires_at > now())
      ),
      'suspendedMemberships', (
        select count(*) from public.company_memberships membership
        where membership.status = 'suspended'
      ),
      'companiesWithoutOwner', (
        select count(*)
        from public.partner_companies company
        where company.status = 'active'
          and not exists (
            select 1
            from public.company_memberships membership
            join public.roles role
              on role.id = membership.role_id
              and role.code = 'partner_owner'
            where membership.company_id = company.id
              and membership.status = 'active'
          )
      ),
      'companiesMissingMapping', (
        select count(*) from public.partner_companies company
        where company.status = 'active'
          and nullif(btrim(company.external_1c_id), '') is null
      )
    ),
    'queues', jsonb_build_object(
      'pendingAccessRequests', (
        select count(*) from public.access_requests request
        where request.status = 'pending_review'
      ),
      'pendingDateChanges', (
        select count(*) from public.partner_order_date_change_requests request
        where request.status = 'pending'
      ),
      'specificationsAwaitingReview', (
        select count(*) from public.project_specifications specification
        where specification.status in ('submitted', 'under_review')
      ),
      'failedOrderExports', (
        select count(*) from public.partner_orders partner_order
        where partner_order.status in ('failed', 'unknown')
      )
    ),
    'finance', jsonb_build_object(
      'eligibleCompanies', (
        select count(*) from public.partner_companies company
        where company.status = 'active'
          and nullif(btrim(company.external_1c_id), '') is not null
      ),
      'successfulSnapshots', (
        select count(*) from public.partner_finance_sync_state state
        where state.status = 'succeeded'
      ),
      'staleSnapshots', (
        select count(*) from public.partner_finance_sync_state state
        where state.status = 'succeeded'
          and state.last_success_at < now() - interval '36 hours'
      ),
      'failedSyncs', (
        select count(*) from public.partner_finance_sync_state state
        where state.status = 'failed'
      ),
      'missingMappings', (
        select count(*) from public.partner_finance_sync_state state
        where state.status = 'mapping_missing'
      )
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.get_admin_recent_events(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  bounded_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
  result jsonb;
begin
  if not public.has_internal_permission('admin.dashboard.view') then
    raise exception 'Admin dashboard access is not allowed.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(event) order by event.occurred_at desc), '[]'::jsonb)
  into result
  from (
    select *
    from (
      select
        'access'::text as domain,
        company_event.event_type as event_type,
        company_event.created_at as occurred_at,
        company.display_name as subject
      from public.company_user_events company_event
      join public.partner_companies company on company.id = company_event.company_id

      union all

      select
        'access_request'::text,
        request.status,
        coalesce(request.reviewed_at, request.updated_at),
        request.requested_company_name
      from public.access_requests request
      where request.status in ('approved', 'rejected')

      union all

      select
        'finance_sync'::text,
        finance_event.event_type,
        finance_event.created_at,
        company.display_name
      from public.partner_finance_sync_events finance_event
      join public.partner_companies company on company.id = finance_event.company_id
      where finance_event.event_type in ('succeeded', 'failed', 'mapping_missing')
    ) combined
    order by combined.occurred_at desc
    limit bounded_limit
  ) event;

  return result;
end;
$$;

revoke all on function public.get_admin_platform_health_summary()
  from public, anon;
revoke all on function public.get_admin_operational_summary()
  from public, anon;
revoke all on function public.get_admin_recent_events(integer)
  from public, anon;
grant execute on function public.get_admin_platform_health_summary()
  to authenticated;
grant execute on function public.get_admin_operational_summary()
  to authenticated;
grant execute on function public.get_admin_recent_events(integer)
  to authenticated;

comment on function public.get_admin_platform_health_summary() is
  'Bounded local read-model freshness projection. It performs no external integration call.';
comment on function public.get_admin_operational_summary() is
  'Bounded aggregate for partner access, operational queues, and finance synchronization health.';
comment on function public.get_admin_recent_events(integer) is
  'Returns at most twenty safe high-value internal events without commercial values or raw payloads.';

commit;
