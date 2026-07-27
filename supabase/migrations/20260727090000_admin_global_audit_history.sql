begin;

create or replace function public.list_admin_context_history(
  p_company_id uuid default null,
  p_user_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  event_key text,
  source_type text,
  company_id uuid,
  company_name text,
  target_user_id uuid,
  target_name text,
  target_email text,
  actor_name text,
  event_type text,
  reason text,
  safe_detail text,
  created_at timestamptz,
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
  normalized_page_size integer :=
    least(greatest(coalesce(p_page_size, 25), 1), 50);
begin
  if not public.has_internal_permission('admin.audit.view') then
    raise exception 'Audit history access is not allowed.'
      using errcode = '42501';
  end if;
  if p_company_id is not null and p_user_id is not null then
    raise exception 'Only one audit context may be provided.'
      using errcode = '22023';
  end if;
  if p_company_id is not null and not exists (
    select 1 from public.partner_companies company
    where company.id = p_company_id
  ) then
    raise exception 'Company audit context is unavailable.'
      using errcode = 'P0002';
  end if;
  if p_user_id is not null and not exists (
    select 1 from public.user_profiles profile
    where profile.id = p_user_id
  ) then
    raise exception 'User audit context is unavailable.'
      using errcode = 'P0002';
  end if;

  return query
  with audit_rows as (
    select
      'company:' || event.id::text as event_key,
      'company_access'::text as source_type,
      event.company_id,
      company.display_name as company_name,
      event.target_user_id,
      coalesce(nullif(target.full_name, ''), target.email) as target_name,
      target.email as target_email,
      coalesce(nullif(actor.full_name, ''), actor.email) as actor_name,
      event.event_type,
      nullif(left(event.safe_payload ->> 'reason', 500), '') as reason,
      case event.event_type
        when 'role_changed' then concat_ws(
          ' → ',
          event.safe_payload ->> 'from',
          event.safe_payload ->> 'to'
        )
        when 'price_access_changed'
          then event.safe_payload ->> 'priceAccess'
        when 'permission_override_changed' then concat_ws(
          ': ',
          event.safe_payload ->> 'permissionCode',
          event.safe_payload ->> 'effect'
        )
        else null
      end as safe_detail,
      event.created_at
    from public.company_user_events event
    join public.partner_companies company on company.id = event.company_id
    left join public.user_profiles target on target.id = event.target_user_id
    join public.user_profiles actor on actor.id = event.actor_user_id
    where (p_company_id is null and p_user_id is null)
      or (p_company_id is not null and event.company_id = p_company_id)
      or (p_user_id is not null and event.target_user_id = p_user_id)

    union all

    select
      'internal-role:' || event.id::text,
      'internal_role'::text,
      null::uuid,
      null::text,
      event.target_user_id,
      coalesce(nullif(target.full_name, ''), target.email),
      target.email,
      coalesce(nullif(actor.full_name, ''), actor.email),
      'internal_role_' || event.event_type,
      event.reason,
      role.code,
      event.created_at
    from public.internal_role_assignment_audit_events event
    join public.user_profiles target on target.id = event.target_user_id
    left join public.user_profiles actor on actor.id = event.actor_user_id
    join public.roles role on role.id = event.role_id
    where p_company_id is null
      and (p_user_id is null or event.target_user_id = p_user_id)

    union all

    select
      'access-request:' || request.id::text,
      'access_request'::text,
      request.company_id,
      company.display_name,
      request.user_profile_id,
      coalesce(nullif(target.full_name, ''), target.email),
      target.email,
      coalesce(nullif(actor.full_name, ''), actor.email),
      'access_request_' || request.status,
      nullif(left(request.decision_reason, 500), ''),
      null,
      coalesce(request.reviewed_at, request.created_at)
    from public.access_requests request
    join public.user_profiles target on target.id = request.user_profile_id
    left join public.user_profiles actor on actor.id = request.reviewed_by
    left join public.partner_companies company on company.id = request.company_id
    where (p_company_id is null or request.company_id = p_company_id)
      and (p_user_id is null or request.user_profile_id = p_user_id)
  ),
  counted as (
    select row.*, count(*) over() as total_count
    from audit_rows row
  )
  select
    row.event_key,
    row.source_type,
    row.company_id,
    row.company_name,
    row.target_user_id,
    row.target_name,
    row.target_email,
    row.actor_name,
    row.event_type,
    row.reason,
    row.safe_detail,
    row.created_at,
    row.total_count
  from counted row
  order by row.created_at desc, row.event_key desc
  limit normalized_page_size
  offset (normalized_page - 1) * normalized_page_size;
end;
$$;

comment on function public.list_admin_context_history(uuid, uuid, integer, integer)
is 'Bounded global or context audit projection. Excludes invitation tokens, sessions, credentials, confidential prices, and raw payloads.';

revoke all on function public.list_admin_context_history(uuid, uuid, integer, integer)
  from public, anon;
grant execute on function public.list_admin_context_history(uuid, uuid, integer, integer)
  to authenticated;

commit;
