begin;

create or replace function public.create_approved_company_membership(
  p_user_id uuid,
  p_company_id uuid,
  p_role_id uuid,
  p_status text,
  p_approved_by uuid,
  p_approved_at timestamptz
)
returns public.company_memberships
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  existing_membership public.company_memberships%rowtype;
  created_membership public.company_memberships%rowtype;
begin
  if actor_id is null
    or actor_id <> p_approved_by
    or not public.can_review_access_requests() then
    raise exception 'Approved membership creation is not allowed.'
      using errcode = '42501';
  end if;
  if p_status <> 'active' or p_approved_at is null then
    raise exception 'Approved membership state is invalid.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.user_profiles profile
    where profile.id = p_user_id
      and profile.user_type = 'partner'
  ) or not exists (
    select 1
    from public.partner_companies company
    where company.id = p_company_id
      and company.status = 'active'
  ) or not exists (
    select 1
    from public.roles role
    where role.id = p_role_id
      and role.scope = 'partner'
  ) then
    raise exception 'Approved membership references are invalid.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_company_id::text, 0)
  );
  select * into existing_membership
  from public.company_memberships membership
  where membership.user_id = p_user_id
    and membership.company_id = p_company_id
  for update;
  if existing_membership.id is not null then
    if existing_membership.status = 'active' then
      return existing_membership;
    end if;
    raise exception 'An inactive membership already exists.'
      using errcode = '55000';
  end if;

  insert into public.company_memberships(
    user_id,
    company_id,
    role_id,
    status,
    approved_by,
    approved_at
  ) values (
    p_user_id,
    p_company_id,
    p_role_id,
    'active',
    actor_id,
    p_approved_at
  )
  returning * into created_membership;

  insert into public.company_user_events(
    company_id,
    target_user_id,
    actor_user_id,
    event_type,
    safe_payload
  ) values (
    p_company_id,
    p_user_id,
    actor_id,
    'admin_intervention',
    jsonb_build_object('operation', 'approved_membership_created')
  );
  return created_membership;
end;
$$;

revoke all on function public.create_approved_company_membership(
  uuid, uuid, uuid, text, uuid, timestamptz
) from public, anon;
grant execute on function public.create_approved_company_membership(
  uuid, uuid, uuid, text, uuid, timestamptz
) to authenticated;

drop policy if exists "Internal users can insert company memberships"
  on public.company_memberships;
revoke insert on table public.company_memberships from authenticated;

commit;
