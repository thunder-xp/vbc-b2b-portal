begin;

alter table public.invitations
  add column if not exists email_delivery_status text not null default 'pending',
  add column if not exists last_email_attempt_at timestamptz null;

alter table public.invitations drop constraint if exists invitations_email_delivery_status_check;
alter table public.invitations add constraint invitations_email_delivery_status_check
  check (email_delivery_status in ('pending', 'sent', 'failed'));

alter table public.company_user_events drop constraint if exists company_user_events_event_type_check;
alter table public.company_user_events add constraint company_user_events_event_type_check
  check (event_type in (
    'invitation_created', 'invitation_link_generated', 'invitation_resent',
    'invitation_revoked', 'invitation_expired', 'invitation_accepted',
    'invitation_email_sent', 'invitation_email_failed',
    'employee_suspended', 'employee_restored', 'employee_access_revoked',
    'role_changed', 'price_access_changed', 'permission_override_changed',
    'owner_appointed', 'owner_transferred', 'admin_intervention'
  ));

create or replace function public.get_company_invitation_preview(p_token_hash text)
returns table (
  company_name text, invited_email text, invited_full_name text,
  role_code text, expires_at timestamptz, invitation_status text,
  account_exists boolean
)
language sql stable security definer
set search_path = public, auth
set row_security = off
as $$
  select company.display_name, lower(trim(invitation.email)),
    coalesce(nullif(trim(invitation.full_name), ''), lower(trim(invitation.email))),
    role.code, invitation.expires_at,
    case when invitation.status = 'pending' and invitation.expires_at <= now()
      then 'expired' else invitation.status end,
    exists (
      select 1 from auth.users auth_user
      where lower(trim(auth_user.email)) = lower(trim(invitation.email))
        and auth_user.deleted_at is null
    )
  from public.invitations invitation
  join public.partner_companies company on company.id = invitation.company_id
  join public.roles role on role.id = invitation.role_id
  where p_token_hash ~ '^[0-9a-f]{64}$'
    and invitation.token_hash = p_token_hash
  limit 1;
$$;

create or replace function public.record_company_invitation_email_delivery(
  p_invitation_id uuid, p_status text
)
returns uuid
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target public.invitations%rowtype;
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'Invitation delivery status is invalid.' using errcode = '22023';
  end if;
  select * into target from public.invitations where id = p_invitation_id for update;
  if target.id is null or not public.can_manage_company_users(target.company_id) then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;
  update public.invitations
  set email_delivery_status = p_status, last_email_attempt_at = now(), updated_at = now()
  where id = target.id;
  insert into public.company_user_events(
    company_id, target_invitation_id, actor_user_id, event_type
  ) values (
    target.company_id, target.id, actor_id,
    case when p_status = 'sent' then 'invitation_email_sent'
      else 'invitation_email_failed' end
  );
  return target.id;
end;
$$;

create or replace function public.revoke_company_membership_access(
  p_membership_id uuid, p_reason text
)
returns uuid
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  normalized_reason text := public.require_access_change_reason(p_reason);
  target public.company_memberships%rowtype;
  target_role_code text;
  active_owner_count integer;
begin
  select * into target from public.company_memberships where id = p_membership_id for update;
  if target.id is null or not public.can_manage_company_users(target.company_id) then
    raise exception 'Membership is unavailable.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target.company_id::text, 0));
  select role.code into target_role_code from public.roles role where role.id = target.role_id;
  if target.status = 'revoked' then return target.id; end if;
  if target.status not in ('active', 'suspended') then
    raise exception 'Membership transition is invalid.' using errcode = '55000';
  end if;
  if target_role_code = 'partner_owner' and target.status = 'active' then
    select count(*) into active_owner_count
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    where membership.company_id = target.company_id
      and membership.status = 'active' and role.code = 'partner_owner';
    if active_owner_count <= 1 then
      raise exception 'The final active owner cannot be revoked.' using errcode = '55000';
    end if;
  end if;
  update public.company_memberships
  set status = 'revoked', revoked_by = actor_id, revoked_at = now(), updated_at = now()
  where id = target.id;
  delete from public.user_company_context_preferences
  where user_id = target.user_id and active_membership_id = target.id;
  insert into public.company_user_events(
    company_id, target_user_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id, target.user_id, actor_id, 'employee_access_revoked',
    jsonb_build_object('reason', normalized_reason)
  );
  return target.id;
end;
$$;

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
  delete from public.membership_permission_overrides where membership_id = membership.id;
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

revoke all on function public.get_company_invitation_preview(text) from public;
revoke all on function public.record_company_invitation_email_delivery(uuid, text) from public;
revoke all on function public.revoke_company_membership_access(uuid, text) from public;
revoke all on function public.accept_company_invitation(text) from public;
grant execute on function public.get_company_invitation_preview(text) to anon, authenticated;
grant execute on function public.record_company_invitation_email_delivery(uuid, text) to authenticated;
grant execute on function public.revoke_company_membership_access(uuid, text) to authenticated;
grant execute on function public.accept_company_invitation(text) to authenticated;

commit;
