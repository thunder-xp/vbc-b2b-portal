begin;

create or replace function public.list_admin_users(
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_filter text default 'all'
)
returns table (
  record_key text, user_id uuid, full_name text, email text, identity_type text,
  company_names text[], role_summary text, membership_status text, price_access text,
  invitation_status text, last_access_event text, last_access_event_at timestamptz,
  created_at timestamptz, total_count bigint
)
language plpgsql stable security definer
set search_path = public set row_security = off
as $$
declare
  normalized_page integer := greatest(coalesce(p_page, 1), 1);
  normalized_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  normalized_search text := nullif(left(btrim(coalesce(p_search, '')), 100), '');
  normalized_filter text := coalesce(nullif(btrim(p_filter), ''), 'all');
begin
  if not public.has_internal_permission('admin.users.view') then
    raise exception 'User administration access is not allowed.' using errcode = '42501';
  end if;
  if normalized_filter not in (
    'all', 'internal', 'partner', 'active', 'suspended', 'invited',
    'retail_only', 'owner', 'no_role_assignment'
  ) then
    raise exception 'Unsupported user filter.' using errcode = '22023';
  end if;

  return query
  with membership_rows as (
    select membership.id, membership.user_id, company.display_name as company_name,
      membership.status, role.name as role_name,
      role.code = 'partner_owner' as is_owner,
      exists (
        select 1
        from public.membership_permission_overrides permission_override
        join public.permissions permission on permission.id = permission_override.permission_id
        where permission_override.membership_id = membership.id
          and permission.code = 'pricing.partner_price.view'
          and permission_override.effect = 'deny'
      ) as is_retail_only
    from public.company_memberships membership
    join public.partner_companies company on company.id = membership.company_id
    join public.roles role on role.id = membership.role_id
  ),
  active_memberships as (
    select row.user_id,
      array_agg(distinct row.company_name order by row.company_name) as companies,
      string_agg(distinct row.role_name, ', ' order by row.role_name) as roles,
      bool_or(row.is_owner) as is_owner,
      bool_or(row.is_retail_only) as is_retail_only
    from membership_rows row
    where row.status = 'active'
    group by row.user_id
  ),
  membership_flags as (
    select row.user_id, bool_or(row.status = 'suspended') as has_suspended_membership
    from membership_rows row group by row.user_id
  ),
  internal_assignments as (
    select assignment.user_id, role.name as role_name
    from public.internal_user_role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.revoked_at is null
  ),
  latest_invitations as (
    select distinct on (lower(invitation.email)) lower(invitation.email) as normalized_email,
      invitation.id, invitation.company_id, invitation.full_name, invitation.email,
      invitation.role_id,
      case when invitation.status = 'pending' and invitation.expires_at is not null
        and invitation.expires_at <= now() then 'expired' else invitation.status end as status,
      invitation.created_at
    from public.invitations invitation
    order by lower(invitation.email), invitation.created_at desc, invitation.id
  ),
  profile_rows as (
    select 'profile:' || profile.id::text as record_key, profile.id as user_id,
      coalesce(nullif(profile.full_name, ''), profile.email) as full_name, profile.email,
      case when profile.user_type in ('internal', 'admin') then 'internal' else 'partner' end as identity_type,
      coalesce(active_membership.companies, '{}'::text[]) as company_names,
      case when profile.user_type in ('internal', 'admin') then internal_assignment.role_name
        else active_membership.roles end as role_summary,
      case when profile.user_type in ('internal', 'admin') then profile.status
        when active_membership.user_id is not null then 'active' else null end as membership_status,
      case when profile.user_type in ('internal', 'admin') then null
        when active_membership.is_retail_only then 'retail_only'
        when active_membership.user_id is not null then 'full' else null end as price_access,
      latest_invitation.status as invitation_status,
      latest_event.event_type as last_access_event,
      latest_event.created_at as last_access_event_at,
      profile.created_at,
      coalesce(active_membership.is_owner, false) as is_owner,
      case when profile.user_type in ('internal', 'admin') then internal_assignment.user_id is null
        else active_membership.user_id is null end as has_no_role,
      coalesce(membership_flag.has_suspended_membership, false) as has_suspended_membership
    from public.user_profiles profile
    left join active_memberships active_membership on active_membership.user_id = profile.id
    left join membership_flags membership_flag on membership_flag.user_id = profile.id
    left join internal_assignments internal_assignment on internal_assignment.user_id = profile.id
    left join latest_invitations latest_invitation on latest_invitation.normalized_email = lower(profile.email)
    left join lateral (
      select event.event_type, event.created_at from public.company_user_events event
      where event.target_user_id = profile.id order by event.created_at desc limit 1
    ) latest_event on true
  ),
  invitation_only_rows as (
    select 'invitation:' || invitation.id::text, null::uuid,
      coalesce(nullif(invitation.full_name, ''), invitation.email), invitation.email,
      'invited'::text, array[company.display_name]::text[], role.name, null::text,
      case when exists (
        select 1 from public.invitation_permission_overrides permission_override
        join public.permissions permission on permission.id = permission_override.permission_id
        where permission_override.invitation_id = invitation.id
          and permission.code = 'pricing.partner_price.view'
          and permission_override.effect = 'deny'
      ) then 'retail_only' else 'full' end,
      invitation.status, latest_event.event_type, latest_event.created_at,
      invitation.created_at, false, false, false
    from latest_invitations invitation
    join public.partner_companies company on company.id = invitation.company_id
    join public.roles role on role.id = invitation.role_id
    left join lateral (
      select event.event_type, event.created_at from public.company_user_events event
      where event.target_invitation_id = invitation.id order by event.created_at desc limit 1
    ) latest_event on true
    where not exists (
      select 1 from public.user_profiles profile where lower(profile.email) = invitation.normalized_email
    )
  ),
  combined as (
    select * from profile_rows union all select * from invitation_only_rows
  ),
  filtered as (
    select * from combined identity
    where (
      normalized_search is null
      or identity.full_name ilike '%' || normalized_search || '%'
      or identity.email ilike '%' || normalized_search || '%'
      or exists (
        select 1 from unnest(identity.company_names) company_name
        where company_name ilike '%' || normalized_search || '%'
      )
    ) and (
      normalized_filter = 'all'
      or (normalized_filter = 'internal' and identity.identity_type = 'internal')
      or (normalized_filter = 'partner' and identity.identity_type = 'partner')
      or (normalized_filter = 'active' and identity.membership_status = 'active')
      or (normalized_filter = 'suspended' and identity.has_suspended_membership)
      or (normalized_filter = 'invited' and identity.invitation_status = 'pending')
      or (normalized_filter = 'retail_only' and identity.price_access = 'retail_only')
      or (normalized_filter = 'owner' and identity.is_owner)
      or (normalized_filter = 'no_role_assignment' and identity.has_no_role)
    )
  )
  select identity.record_key, identity.user_id, identity.full_name, identity.email,
    identity.identity_type, identity.company_names, identity.role_summary,
    identity.membership_status, identity.price_access, identity.invitation_status,
    identity.last_access_event, identity.last_access_event_at, identity.created_at,
    count(*) over()
  from filtered identity
  order by lower(identity.full_name), lower(identity.email), identity.record_key
  limit normalized_page_size offset (normalized_page - 1) * normalized_page_size;
end;
$$;

revoke all on function public.list_admin_users(integer, integer, text, text) from public, anon;
grant execute on function public.list_admin_users(integer, integer, text, text) to authenticated;

create or replace function public.list_admin_access_subjects(p_search text default null, p_limit integer default 50)
returns table(user_id uuid, full_name text, email text, identity_type text, company_contexts jsonb)
language plpgsql stable security definer set search_path = public set row_security = off
as $$
declare
  normalized_search text := nullif(left(btrim(coalesce(p_search, '')), 100), '');
  normalized_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
begin
  if not public.has_internal_permission('admin.security.view') then
    raise exception 'Access inspection is not allowed.' using errcode = '42501';
  end if;
  return query
  select profile.id, coalesce(nullif(profile.full_name, ''), profile.email), profile.email,
    case when profile.user_type in ('internal', 'admin') then 'internal' else 'partner' end,
    case when profile.user_type in ('internal', 'admin') then '[]'::jsonb
      else coalesce(contexts.items, '[]'::jsonb) end
  from public.user_profiles profile
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'companyId', company.id, 'companyName', company.display_name,
      'membershipStatus', membership.status
    ) order by company.display_name, company.id) as items
    from public.company_memberships membership
    join public.partner_companies company on company.id = membership.company_id
    where membership.user_id = profile.id and membership.status = 'active'
  ) contexts on true
  where normalized_search is null
    or profile.full_name ilike '%' || normalized_search || '%'
    or profile.email ilike '%' || normalized_search || '%'
    or exists (
      select 1 from public.company_memberships membership
      join public.partner_companies company on company.id = membership.company_id
      where membership.user_id = profile.id and membership.status = 'active'
        and company.display_name ilike '%' || normalized_search || '%'
    )
  order by lower(coalesce(nullif(profile.full_name, ''), profile.email)), profile.id
  limit normalized_limit;
end;
$$;

revoke all on function public.list_admin_access_subjects(text, integer) from public, anon;
grant execute on function public.list_admin_access_subjects(text, integer) to authenticated;

create or replace function public.get_admin_partner_user_integrity(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public set row_security = off
as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.users.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'identity', jsonb_build_object(
      'id', profile.id, 'email', profile.email, 'fullName', profile.full_name,
      'status', profile.status, 'userType', profile.user_type
    ),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', membership.id, 'companyId', company.id, 'companyName', company.display_name,
        'companyStatus', company.status, 'roleCode', role.code, 'status', membership.status,
        'version', membership.version, 'createdAt', membership.created_at,
        'approvedAt', membership.approved_at,
        'endedAt', case when membership.status = 'active' then null
          else coalesce(membership.revoked_at, membership.updated_at) end,
        'isDefault', preference.active_membership_id = membership.id,
        'historyReason', membership_event.reason,
        'relatedAuditEvent', case when membership_event.id is null then null else jsonb_build_object(
          'id', membership_event.id, 'operationType', membership_event.operation_type,
          'correlationId', membership_event.correlation_id, 'occurredAt', membership_event.occurred_at
        ) end
      ) order by (membership.status = 'active') desc, membership.created_at, membership.id)
      from public.company_memberships membership
      join public.partner_companies company on company.id = membership.company_id
      join public.roles role on role.id = membership.role_id
      left join public.user_company_context_preferences preference on preference.user_id = membership.user_id
      left join lateral (
        select event.id, event.operation_type, event.reason, event.correlation_id, event.occurred_at
        from public.partner_integrity_repair_events event
        where event.target_user_id = membership.user_id
          and (event.source_membership_id = membership.id or event.target_membership_id = membership.id)
        order by (event.source_membership_id = membership.id) desc, event.occurred_at desc limit 1
      ) membership_event on true
      where membership.user_id = profile.id
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.id, 'status', request.status, 'companyId', request.company_id,
        'requestedCompanyName', request.requested_company_name,
        'requestedFiscalCode', request.requested_fiscal_code,
        'integrity', public.get_approved_onboarding_integrity(request.id)
      ) order by request.created_at desc)
      from public.access_requests request where request.user_profile_id = profile.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id, 'operationType', event.operation_type, 'reason', event.reason,
        'correlationId', event.correlation_id, 'occurredAt', event.occurred_at
      ) order by event.occurred_at desc)
      from public.partner_integrity_repair_events event where event.target_user_id = profile.id
    ), '[]'::jsonb)
  ) into result from public.user_profiles profile where profile.id = p_profile_id;
  return result;
end;
$$;

revoke all on function public.get_admin_partner_user_integrity(uuid) from public, anon;
grant execute on function public.get_admin_partner_user_integrity(uuid) to authenticated;

commit;
