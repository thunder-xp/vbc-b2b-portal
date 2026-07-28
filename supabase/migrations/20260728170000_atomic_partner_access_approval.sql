begin;

create or replace function public.approve_partner_access_request_v2(
  p_request_id uuid,
  p_external_1c_id text,
  p_external_1c_code text,
  p_external_1c_contract_id text,
  p_external_1c_price_type_id text,
  p_decision_reason text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target_request public.access_requests%rowtype;
  target_profile public.user_profiles%rowtype;
  target_company public.partner_companies%rowtype;
  target_membership public.company_memberships%rowtype;
  owner_role public.roles%rowtype;
  manager_role public.roles%rowtype;
  assigned_role public.roles%rowtype;
  audit_event_id uuid;
  company_branch text;
  membership_outcome text;
  normalized_partner_ref text := lower(trim(p_external_1c_id));
  normalized_partner_code text := nullif(trim(p_external_1c_code), '');
  normalized_contract_ref text := nullif(lower(trim(p_external_1c_contract_id)), '');
  normalized_price_type_ref text := lower(trim(p_external_1c_price_type_id));
  normalized_reason text := nullif(trim(p_decision_reason), '');
  guid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  zero_guid constant text := '00000000-0000-0000-0000-000000000000';
begin
  if actor_id is null or not public.has_internal_permission('access_requests.approve') then
    raise exception 'APPROVAL_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_profiles profile
    where profile.id = actor_id
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
  ) then
    raise exception 'APPROVAL_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if normalized_partner_ref is null
    or normalized_partner_ref !~ guid_pattern
    or normalized_partner_ref = zero_guid
    or normalized_price_type_ref is null
    or normalized_price_type_ref !~ guid_pattern
    or normalized_price_type_ref = zero_guid
    or p_correlation_id is null
    or (
      normalized_contract_ref is not null
      and (
        normalized_contract_ref !~ guid_pattern
        or normalized_contract_ref = zero_guid
      )
    ) then
    raise exception 'APPROVAL_1C_BINDING_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select *
  into target_request
  from public.access_requests request
  where request.id = p_request_id
  for update;

  if target_request.id is null then
    raise exception 'APPROVAL_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if target_request.status not in ('pending_review', 'approved') then
    raise exception 'APPROVAL_REQUEST_NOT_PENDING' using errcode = '55000';
  end if;

  if nullif(trim(target_request.requested_fiscal_code), '') is null then
    raise exception 'APPROVAL_FISCAL_CODE_REQUIRED' using errcode = '22023';
  end if;

  select *
  into target_profile
  from public.user_profiles profile
  where profile.id = target_request.user_profile_id
  for update;

  if target_profile.id is null
    or target_profile.user_type not in ('external', 'partner')
    or target_profile.status not in ('registered', 'pending_approval', 'active') then
    raise exception 'APPROVAL_REQUESTER_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(normalized_partner_ref, 0));

  if target_request.company_id is not null then
    select *
    into target_company
    from public.partner_companies company
    where company.id = target_request.company_id
    for update;

    if target_company.id is null
      or lower(target_company.external_1c_id) <> normalized_partner_ref then
      raise exception 'APPROVAL_COMPANY_CONFLICT' using errcode = '23505';
    end if;

    company_branch := 'existing_company';
  else
    select *
    into target_company
    from public.partner_companies company
    where lower(company.external_1c_id) = normalized_partner_ref
    for update;

    if target_company.id is null then
      insert into public.partner_companies (
        external_1c_id,
        external_1c_code,
        external_1c_contract_id,
        external_1c_price_type_id,
        display_name,
        status
      ) values (
        normalized_partner_ref,
        normalized_partner_code,
        normalized_contract_ref,
        normalized_price_type_ref,
        coalesce(nullif(trim(target_request.requested_company_name), ''), normalized_partner_ref),
        'active'
      )
      returning * into target_company;
      company_branch := 'new_company';
    else
      company_branch := 'existing_company';
    end if;
  end if;

  if target_company.status <> 'active'
    or (
      target_company.external_1c_code is not null
      and normalized_partner_code is not null
      and target_company.external_1c_code <> normalized_partner_code
    )
    or (
      target_company.external_1c_contract_id is not null
      and normalized_contract_ref is not null
      and lower(target_company.external_1c_contract_id) <> normalized_contract_ref
    )
    or (
      target_company.external_1c_price_type_id is not null
      and lower(target_company.external_1c_price_type_id) <> normalized_price_type_ref
    ) then
    raise exception 'APPROVAL_COMPANY_CONFLICT' using errcode = '23505';
  end if;

  update public.partner_companies
  set
    external_1c_code = coalesce(external_1c_code, normalized_partner_code),
    external_1c_contract_id =
      coalesce(external_1c_contract_id, normalized_contract_ref),
    external_1c_price_type_id =
      coalesce(external_1c_price_type_id, normalized_price_type_ref)
  where id = target_company.id
  returning * into target_company;

  select *
  into owner_role
  from public.roles role
  where role.code = 'partner_owner'
    and role.scope = 'partner';

  select *
  into manager_role
  from public.roles role
  where role.code = 'partner_manager'
    and role.scope = 'partner';

  if owner_role.id is null or manager_role.id is null then
    raise exception 'APPROVAL_ROLE_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = target_company.id
      and membership.status = 'active'
      and membership.role_id = owner_role.id
      and membership.user_id <> target_profile.id
  ) then
    assigned_role := manager_role;
  else
    assigned_role := owner_role;
  end if;

  update public.user_profiles
  set status = 'active', user_type = 'partner'
  where id = target_profile.id
  returning * into target_profile;

  select *
  into target_membership
  from public.company_memberships membership
  where membership.user_id = target_profile.id
    and membership.company_id = target_company.id
  for update;

  if target_membership.id is null then
    insert into public.company_memberships (
      user_id,
      company_id,
      role_id,
      status,
      approved_by,
      approved_at,
      revoked_by,
      revoked_at
    ) values (
      target_profile.id,
      target_company.id,
      assigned_role.id,
      'active',
      actor_id,
      now(),
      null,
      null
    )
    returning * into target_membership;
    membership_outcome := 'created';
  elsif target_membership.status <> 'active' then
    update public.company_memberships
    set
      role_id = assigned_role.id,
      status = 'active',
      approved_by = actor_id,
      approved_at = now(),
      revoked_by = null,
      revoked_at = null
    where id = target_membership.id
    returning * into target_membership;
    membership_outcome := 'restored';
  else
    membership_outcome := 'existing';
  end if;

  if target_request.status = 'approved'
    and target_request.company_id = target_company.id
    and target_membership.status = 'active'
    and membership_outcome = 'existing'
    and target_profile.status = 'active'
    and target_profile.user_type = 'partner' then
    return jsonb_build_object(
      'request', to_jsonb(target_request),
      'company', to_jsonb(target_company),
      'membership', to_jsonb(target_membership),
      'requester', to_jsonb(target_profile),
      'company_branch', company_branch,
      'membership_outcome', membership_outcome,
      'audit_event_id', null,
      'idempotent', true
    );
  end if;

  begin
    insert into public.company_user_events (
      company_id,
      target_user_id,
      actor_user_id,
      event_type,
      safe_payload
    ) values (
      target_company.id,
      target_profile.id,
      actor_id,
      'admin_intervention',
      jsonb_build_object(
        'operation', 'partner_access_approved',
        'request_id', target_request.id,
        'company_branch', company_branch,
        'membership_outcome', membership_outcome,
        'assigned_role', assigned_role.code,
        'correlation_id', p_correlation_id
      )
    )
    returning id into audit_event_id;
  exception
    when others then
      raise exception 'APPROVAL_AUDIT_FAILURE' using errcode = sqlstate;
  end;

  update public.access_requests
  set
    company_id = target_company.id,
    requested_external_1c_id = normalized_partner_ref,
    status = 'approved',
    reviewed_by = coalesce(reviewed_by, actor_id),
    reviewed_at = coalesce(reviewed_at, now()),
    decision_reason = coalesce(normalized_reason, decision_reason)
  where id = target_request.id
  returning * into target_request;

  return jsonb_build_object(
    'request', to_jsonb(target_request),
    'company', to_jsonb(target_company),
    'membership', to_jsonb(target_membership),
    'requester', to_jsonb(target_profile),
    'company_branch', company_branch,
    'membership_outcome', membership_outcome,
    'audit_event_id', audit_event_id,
    'idempotent', false
  );
exception
  when others then
    if sqlerrm like 'APPROVAL_%' then
      raise;
    end if;
    raise exception 'APPROVAL_DATABASE_CONSTRAINT'
      using errcode = sqlstate,
        detail = 'Partner access approval transaction rolled back.';
end;
$$;

revoke all on function public.approve_partner_access_request_v2(
  uuid, text, text, text, text, text, uuid
) from public, anon;

grant execute on function public.approve_partner_access_request_v2(
  uuid, text, text, text, text, text, uuid
) to authenticated;

comment on function public.approve_partner_access_request_v2(
  uuid, text, text, text, text, text, uuid
) is
  'Atomically approves or idempotently repairs one partner access request. Requires the authenticated internal access-review permission.';

commit;
