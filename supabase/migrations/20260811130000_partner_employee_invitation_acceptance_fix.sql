begin;

create or replace function public.accept_company_invitation(p_token_hash text)
returns table (invitation_id uuid, membership_id uuid, company_id uuid, repeated boolean)
language plpgsql security definer
set search_path = public, auth
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  target public.invitations%rowtype;
  membership public.company_memberships%rowtype;
begin
  if actor_id is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;
  select lower(trim(auth_user.email)) into actor_email
  from auth.users auth_user
  where auth_user.id = actor_id and auth_user.email_confirmed_at is not null
    and auth_user.deleted_at is null;
  if actor_email is null then
    raise exception 'Verified email identity is required.' using errcode = '42501';
  end if;
  select * into target from public.invitations invitation
  where invitation.token_hash = p_token_hash for update;
  if not found or lower(trim(target.email)) <> actor_email then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;
  if target.status = 'accepted' and target.accepted_by = actor_id
     and target.accepted_membership_id is not null then
    return query select target.id, target.accepted_membership_id, target.company_id, true;
    return;
  end if;
  if target.status <> 'pending' or target.expires_at is null or target.expires_at <= now() then
    raise exception 'Invitation is no longer active.' using errcode = '55000';
  end if;
  insert into public.user_profiles(id, email, full_name, status, user_type)
  values (actor_id, actor_email, target.full_name, 'active', 'partner')
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
      status = 'active',
      user_type = 'partner',
      updated_at = now()
  where public.user_profiles.user_type in ('external', 'partner');
  if not exists (
    select 1 from public.user_profiles profile
    where profile.id = actor_id and profile.status = 'active'
      and profile.user_type in ('external', 'partner')
  ) then
    raise exception 'Partner profile is not eligible.' using errcode = '42501';
  end if;
  select * into membership from public.company_memberships company_membership
  where company_membership.user_id = actor_id
    and company_membership.company_id = target.company_id for update;
  if found and membership.status = 'rejected' then
    raise exception 'Existing membership requires administrator review.' using errcode = '55000';
  elsif found then
    update public.company_memberships
    set role_id = target.role_id, status = 'active', approved_by = target.invited_by,
        approved_at = now(), revoked_by = null, revoked_at = null, updated_at = now()
    where id = membership.id returning * into membership;
  else
    insert into public.company_memberships(user_id, company_id, role_id, status, approved_by, approved_at)
    values (actor_id, target.company_id, target.role_id, 'active', target.invited_by, now())
    returning * into membership;
  end if;
  delete from public.membership_permission_overrides membership_permission_override
  where membership_permission_override.membership_id = membership.id;
  insert into public.membership_permission_overrides(membership_id, permission_id, effect, created_by)
  select membership.id, intended.permission_id, intended.effect, target.invited_by
  from public.invitation_permission_overrides intended where intended.invitation_id = target.id;
  update public.invitations
  set status = 'accepted', accepted_by = actor_id,
      accepted_membership_id = membership.id, accepted_at = now(),
      updated_at = now()
  where id = target.id;
  insert into public.user_company_context_preferences(user_id, active_membership_id, changed_by)
  values (actor_id, membership.id, actor_id)
  on conflict (user_id) do update
  set active_membership_id = excluded.active_membership_id,
      changed_by = excluded.changed_by, changed_at = now(),
      version = public.user_company_context_preferences.version + 1;
  insert into public.company_user_events(
    company_id, target_user_id, target_invitation_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id, actor_id, target.id, actor_id, 'invitation_accepted',
    jsonb_build_object('membershipId', membership.id)
  );
  return query select target.id, membership.id, target.company_id, false;
end;
$$;

revoke all on function public.accept_company_invitation(text) from public, anon;
grant execute on function public.accept_company_invitation(text) to authenticated;

commit;
