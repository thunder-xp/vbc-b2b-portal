begin;

create or replace function public.list_admin_companies(
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_filter text default 'all'
)
returns table (
  company_id uuid,
  display_name text,
  fiscal_code text,
  company_status text,
  counterparty_mapping_state text,
  organization_mapping_state text,
  active_membership_count bigint,
  active_owner_count bigint,
  pending_invitation_count bigint,
  partner_price_type text,
  finance_sync_state text,
  commercial_state text,
  last_commercial_at timestamptz,
  warning_codes text[],
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  normalized_page integer := greatest(coalesce(p_page, 1), 1);
  normalized_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  normalized_search text := nullif(left(btrim(coalesce(p_search, '')), 100), '');
  normalized_filter text := coalesce(nullif(btrim(p_filter), ''), 'all');
begin
  if not public.has_internal_permission('admin.companies.view') then
    raise exception 'Company administration access is not allowed.'
      using errcode = '42501';
  end if;
  if normalized_filter not in (
    'all', 'active', 'pending_access', 'missing_1c_mapping',
    'no_active_owner', 'suspended', 'finance_sync_failed',
    'commercial_data_stale'
  ) then
    raise exception 'Unsupported company filter.' using errcode = '22023';
  end if;

  return query
  with membership_counts as (
    select
      membership.company_id,
      count(*) filter (where membership.status = 'active') as active_memberships,
      count(*) filter (
        where membership.status = 'active' and role.code = 'partner_owner'
      ) as active_owners
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    group by membership.company_id
  ),
  invitation_counts as (
    select
      invitation.company_id,
      count(*) filter (
        where invitation.status = 'pending'
          and (invitation.expires_at is null or invitation.expires_at > now())
      ) as pending_invitations
    from public.invitations invitation
    group by invitation.company_id
  ),
  price_freshness as (
    select
      price.external_1c_price_type_id,
      max(coalesce(price.synced_at, price.updated_at)) as last_price_at
    from public.product_prices price
    where price.is_active
      and price.is_published
      and price.external_1c_price_type_id is not null
    group by price.external_1c_price_type_id
  ),
  company_projection as (
    select
      company.id,
      company.external_1c_id,
      company.display_name,
      fiscal.requested_fiscal_code,
      company.status,
      case
        when nullif(btrim(company.external_1c_id), '') is null
          or company.external_1c_id = '00000000-0000-0000-0000-000000000000'
          then 'missing'
        else 'mapped'
      end as counterparty_state,
      'platform_managed'::text as organization_state,
      coalesce(members.active_memberships, 0) as active_memberships,
      coalesce(members.active_owners, 0) as active_owners,
      coalesce(invites.pending_invitations, 0) as pending_invitations,
      price_type.name as price_type_name,
      coalesce(finance.status, 'never_run') as finance_state,
      case
        when company.external_1c_price_type_id is null then 'unavailable'
        when prices.last_price_at is null then 'unavailable'
        when prices.last_price_at < now() - interval '36 hours' then 'stale'
        else 'current'
      end as commercial_status,
      greatest(finance.last_success_at, prices.last_price_at) as last_commercial,
      array_remove(array[
        case
          when nullif(btrim(company.external_1c_id), '') is null
            or company.external_1c_id = '00000000-0000-0000-0000-000000000000'
            then 'missing_1c_mapping'
        end,
        case when coalesce(members.active_owners, 0) = 0 then 'no_active_owner' end,
        case when finance.status in ('failed', 'mapping_missing') then 'finance_sync_failed' end,
        case
          when company.external_1c_price_type_id is null
            or prices.last_price_at is null
            or prices.last_price_at < now() - interval '36 hours'
            then 'commercial_data_stale'
        end
      ], null)::text[] as warnings
    from public.partner_companies company
    left join membership_counts members on members.company_id = company.id
    left join invitation_counts invites on invites.company_id = company.id
    left join public.partner_finance_sync_state finance
      on finance.company_id = company.id
    left join public.price_types price_type
      on price_type.external_ref = company.external_1c_price_type_id
    left join price_freshness prices
      on prices.external_1c_price_type_id = company.external_1c_price_type_id
    left join lateral (
      select request.requested_fiscal_code
      from public.access_requests request
      where request.company_id = company.id
        and request.status = 'approved'
        and nullif(btrim(request.requested_fiscal_code), '') is not null
      order by request.reviewed_at desc nulls last, request.created_at desc
      limit 1
    ) fiscal on true
  ),
  filtered as (
    select *
    from company_projection company
    where (
      normalized_search is null
      or company.display_name ilike '%' || normalized_search || '%'
      or coalesce(company.requested_fiscal_code, '') ilike '%' || normalized_search || '%'
      or company.external_1c_id ilike '%' || normalized_search || '%'
    )
    and (
      normalized_filter = 'all'
      or (normalized_filter = 'active' and company.status = 'active')
      or (normalized_filter = 'pending_access' and company.status = 'pending_approval')
      or (normalized_filter = 'missing_1c_mapping' and company.counterparty_state = 'missing')
      or (normalized_filter = 'no_active_owner' and company.active_owners = 0)
      or (normalized_filter = 'suspended' and company.status = 'suspended')
      or (
        normalized_filter = 'finance_sync_failed'
        and company.finance_state in ('failed', 'mapping_missing')
      )
      or (
        normalized_filter = 'commercial_data_stale'
        and company.commercial_status in ('stale', 'unavailable')
      )
    )
  )
  select
    company.id,
    company.display_name,
    company.requested_fiscal_code,
    company.status,
    company.counterparty_state,
    company.organization_state,
    company.active_memberships,
    company.active_owners,
    company.pending_invitations,
    company.price_type_name,
    company.finance_state,
    company.commercial_status,
    company.last_commercial,
    company.warnings,
    count(*) over()
  from filtered company
  order by lower(company.display_name), company.id
  limit normalized_page_size
  offset (normalized_page - 1) * normalized_page_size;
end;
$$;

comment on function public.list_admin_companies(integer, integer, text, text) is
  'Permission-gated paginated company aggregate without confidential finance amounts or per-row follow-up reads.';

revoke all on function public.list_admin_companies(integer, integer, text, text)
  from public, anon;
grant execute on function public.list_admin_companies(integer, integer, text, text)
  to authenticated;

create or replace function public.get_admin_company_overview(p_company_id uuid)
returns table (
  company_id uuid,
  display_name text,
  fiscal_code text,
  company_status text,
  external_1c_id text,
  external_1c_code text,
  external_1c_contract_id text,
  external_1c_price_type_id text,
  partner_price_type text,
  organization_mapping_state text,
  active_membership_count bigint,
  active_owner_count bigint,
  pending_invitation_count bigint,
  active_owner_name text,
  finance_sync_state text,
  finance_last_success_at timestamptz,
  latest_access_event_type text,
  latest_access_event_at timestamptz,
  warning_codes text[]
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_internal_permission('admin.companies.view') then
    raise exception 'Company administration access is not allowed.'
      using errcode = '42501';
  end if;

  return query
  select
    company.id,
    company.display_name,
    fiscal.requested_fiscal_code,
    company.status,
    company.external_1c_id,
    company.external_1c_code,
    company.external_1c_contract_id,
    company.external_1c_price_type_id,
    price_type.name,
    'platform_managed'::text,
    coalesce(members.active_memberships, 0),
    coalesce(members.active_owners, 0),
    coalesce(invites.pending_invitations, 0),
    owner_profile.full_name,
    coalesce(finance.status, 'never_run'),
    finance.last_success_at,
    latest_event.event_type,
    latest_event.created_at,
    array_remove(array[
      case
        when nullif(btrim(company.external_1c_id), '') is null
          or company.external_1c_id = '00000000-0000-0000-0000-000000000000'
          then 'missing_1c_mapping'
      end,
      case when coalesce(members.active_owners, 0) = 0 then 'no_active_owner' end,
      case when finance.status in ('failed', 'mapping_missing') then 'finance_sync_failed' end,
      case when company.external_1c_price_type_id is null then 'missing_price_type' end
    ], null)::text[]
  from public.partner_companies company
  left join lateral (
    select
      count(*) filter (where membership.status = 'active') as active_memberships,
      count(*) filter (
        where membership.status = 'active' and role.code = 'partner_owner'
      ) as active_owners
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    where membership.company_id = company.id
  ) members on true
  left join lateral (
    select count(*) as pending_invitations
    from public.invitations invitation
    where invitation.company_id = company.id
      and invitation.status = 'pending'
      and (invitation.expires_at is null or invitation.expires_at > now())
  ) invites on true
  left join lateral (
    select profile.full_name
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    join public.user_profiles profile on profile.id = membership.user_id
    where membership.company_id = company.id
      and membership.status = 'active'
      and role.code = 'partner_owner'
    order by membership.approved_at nulls last, membership.created_at
    limit 1
  ) owner_profile on true
  left join lateral (
    select request.requested_fiscal_code
    from public.access_requests request
    where request.company_id = company.id
      and request.status = 'approved'
      and nullif(btrim(request.requested_fiscal_code), '') is not null
    order by request.reviewed_at desc nulls last, request.created_at desc
    limit 1
  ) fiscal on true
  left join lateral (
    select event.event_type, event.created_at
    from public.company_user_events event
    where event.company_id = company.id
    order by event.created_at desc
    limit 1
  ) latest_event on true
  left join public.partner_finance_sync_state finance
    on finance.company_id = company.id
  left join public.price_types price_type
    on price_type.external_ref = company.external_1c_price_type_id
  where company.id = p_company_id;
end;
$$;

comment on function public.get_admin_company_overview(uuid) is
  'Permission-gated company identity/status projection with no live 1C request or confidential finance amounts.';

revoke all on function public.get_admin_company_overview(uuid)
  from public, anon;
grant execute on function public.get_admin_company_overview(uuid)
  to authenticated;

commit;
