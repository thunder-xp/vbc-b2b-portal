-- Company User Management, Slice 2.
-- Extends the existing identity, invitation, membership, role, permission, and
-- override model. Raw invitation tokens and passwords are never stored.

alter table public.invitations
  add column if not exists full_name text null,
  add column if not exists token_hash text null,
  add column if not exists token_version integer not null default 1,
  add column if not exists accepted_membership_id uuid null
    references public.company_memberships(id) on delete set null,
  add column if not exists revoked_at timestamptz null,
  add column if not exists revoked_by uuid null
    references public.user_profiles(id) on delete set null,
  add column if not exists last_sent_at timestamptz null,
  add column if not exists send_count integer not null default 0,
  add column if not exists request_key uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invitations'::regclass
      and conname = 'invitations_token_hash_check'
  ) then
    alter table public.invitations
      add constraint invitations_token_hash_check
      check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invitations'::regclass
      and conname = 'invitations_send_count_check'
  ) then
    alter table public.invitations
      add constraint invitations_send_count_check check (send_count >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invitations'::regclass
      and conname = 'invitations_request_key_unique'
  ) then
    alter table public.invitations
      add constraint invitations_request_key_unique unique (request_key);
  end if;
end;
$$;

create unique index if not exists invitations_one_pending_company_email_idx
  on public.invitations(company_id, lower(email))
  where status = 'pending';
create unique index if not exists invitations_token_hash_unique_idx
  on public.invitations(token_hash)
  where token_hash is not null;

create table if not exists public.invitation_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  effect text not null check (effect in ('allow', 'deny')),
  created_at timestamptz not null default now(),
  unique (invitation_id, permission_id)
);

comment on table public.invitation_permission_overrides is
  'Immutable intended delegable overrides copied atomically to membership overrides during invitation acceptance.';

create index if not exists invitation_permission_overrides_invitation_idx
  on public.invitation_permission_overrides(invitation_id);

create table if not exists public.company_user_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  target_user_id uuid null references public.user_profiles(id) on delete set null,
  target_invitation_id uuid null references public.invitations(id) on delete set null,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in (
    'invitation_created',
    'invitation_link_generated',
    'invitation_resent',
    'invitation_revoked',
    'invitation_expired',
    'invitation_accepted',
    'employee_suspended',
    'employee_restored',
    'role_changed',
    'price_access_changed',
    'permission_override_changed',
    'owner_appointed',
    'admin_intervention'
  )),
  safe_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(safe_payload) = 'object'),
  check (pg_column_size(safe_payload) <= 8192)
);

comment on table public.company_user_events is
  'Append-only, company-scoped access audit. Passwords, tokens, sessions, prices, and raw Auth responses are forbidden.';

create index if not exists company_user_events_company_created_idx
  on public.company_user_events(company_id, created_at desc);
create index if not exists company_user_events_target_user_idx
  on public.company_user_events(target_user_id, created_at desc)
  where target_user_id is not null;

create or replace function public.can_manage_company_users(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.has_permission(p_company_id, 'company_users.manage');
$$;

revoke all on function public.can_manage_company_users(uuid) from public;
grant execute on function public.can_manage_company_users(uuid) to authenticated;

create or replace function public.create_company_invitation(
  p_company_id uuid,
  p_full_name text,
  p_email text,
  p_role_code text,
  p_price_access text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_request_key uuid
)
returns table (
  invitation_id uuid,
  normalized_email text,
  full_name text,
  expires_at timestamptz,
  token_version integer,
  repeated boolean
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  normalized_target_email text := lower(trim(p_email));
  target_role public.roles%rowtype;
  target_invitation public.invitations%rowtype;
  permission_record record;
begin
  if actor_id is null or not public.can_manage_company_users(p_company_id) then
    raise exception 'Company user management is not allowed.' using errcode = '42501';
  end if;
  if nullif(trim(p_full_name), '') is null
     or normalized_target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now()
     or p_expires_at > now() + interval '30 days'
     or p_price_access not in ('full', 'retail_only') then
    raise exception 'Invitation input is invalid.' using errcode = '22023';
  end if;

  select *
  into target_invitation
  from public.invitations invitation
  where invitation.request_key = p_request_key;

  if found then
    if target_invitation.company_id <> p_company_id
       or lower(target_invitation.email) <> normalized_target_email then
      raise exception 'Invitation request key conflict.' using errcode = '23505';
    end if;
    return query select target_invitation.id, lower(target_invitation.email),
      target_invitation.full_name,
      target_invitation.expires_at, target_invitation.token_version, true;
    return;
  end if;

  select *
  into target_role
  from public.roles role
  where role.code = p_role_code
    and role.scope = 'partner'
    and role.code in ('partner_manager', 'partner_buyer', 'partner_accounting', 'partner_viewer');

  if not found then
    raise exception 'Partner role is not assignable.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.company_memberships membership
    join public.user_profiles profile on profile.id = membership.user_id
    where membership.company_id = p_company_id
      and lower(profile.email) = normalized_target_email
      and membership.status in ('active', 'suspended', 'pending_approval')
  ) then
    raise exception 'A company membership already exists.' using errcode = '23505';
  end if;

  for target_invitation in
    update public.invitations invitation
    set status = 'expired', token_hash = null, updated_at = now()
    where invitation.company_id = p_company_id
      and lower(invitation.email) = normalized_target_email
      and invitation.status = 'pending'
      and invitation.expires_at <= now()
    returning invitation.*
  loop
    insert into public.company_user_events (
      company_id, target_invitation_id, actor_user_id, event_type
    ) values (
      p_company_id, target_invitation.id, actor_id, 'invitation_expired'
    );
  end loop;

  if exists (
    select 1 from public.invitations invitation
    where invitation.company_id = p_company_id
      and lower(invitation.email) = normalized_target_email
      and invitation.status = 'pending'
  ) then
    raise exception 'A pending invitation already exists.' using errcode = '23505';
  end if;

  insert into public.invitations (
    company_id, email, full_name, role_id, invited_by, status, expires_at,
    token_hash, token_version, last_sent_at, send_count, request_key
  )
  values (
    p_company_id, normalized_target_email, trim(p_full_name), target_role.id,
    actor_id, 'pending', p_expires_at, p_token_hash, 1, now(), 1, p_request_key
  )
  returning * into target_invitation;

  for permission_record in
    select permission.id, permission.code
    from public.permissions permission
    where permission.code in (
      'pricing.partner_price.view',
      'pricing.retail_price.view'
    )
      and permission.delegable_by_partner_owner
      and permission.scope in ('partner', 'both')
  loop
    insert into public.invitation_permission_overrides (
      invitation_id, permission_id, effect
    )
    values (
      target_invitation.id,
      permission_record.id,
      case
        when permission_record.code = 'pricing.partner_price.view'
          and p_price_access = 'retail_only' then 'deny'
        else 'allow'
      end
    );
  end loop;

  insert into public.company_user_events (
    company_id, target_invitation_id, actor_user_id, event_type, safe_payload
  )
  values (
    p_company_id, target_invitation.id, actor_id, 'invitation_created',
    jsonb_build_object('role', target_role.code, 'priceAccess', p_price_access)
  );

  return query select target_invitation.id, normalized_target_email,
    target_invitation.full_name,
    target_invitation.expires_at, target_invitation.token_version, false;
end;
$$;

create or replace function public.reissue_company_invitation(
  p_invitation_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (
  invitation_id uuid,
  normalized_email text,
  full_name text,
  expires_at timestamptz,
  token_version integer
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target public.invitations%rowtype;
begin
  select * into target
  from public.invitations
  where id = p_invitation_id
  for update;

  if not found or not public.can_manage_company_users(target.company_id) then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;
  if target.status <> 'pending' or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'Invitation cannot be reissued.' using errcode = '55000';
  end if;

  update public.invitations
  set token_hash = p_token_hash,
      token_version = token_version + 1,
      expires_at = p_expires_at,
      last_sent_at = now(),
      send_count = send_count + 1,
      updated_at = now()
  where id = target.id
  returning * into target;

  insert into public.company_user_events (
    company_id, target_invitation_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id, target.id, actor_id, 'invitation_resent',
    jsonb_build_object('tokenVersion', target.token_version)
  );

  return query select target.id, lower(target.email), target.full_name,
    target.expires_at,
    target.token_version;
end;
$$;

create or replace function public.revoke_company_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target public.invitations%rowtype;
begin
  select * into target from public.invitations where id = p_invitation_id for update;
  if not found or not public.can_manage_company_users(target.company_id) then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;
  if target.status = 'revoked' then return target.id; end if;
  if target.status <> 'pending' then
    raise exception 'Invitation cannot be revoked.' using errcode = '55000';
  end if;

  update public.invitations
  set status = 'revoked', token_hash = null, revoked_at = now(),
      revoked_by = actor_id, updated_at = now()
  where id = target.id;

  insert into public.company_user_events (
    company_id, target_invitation_id, actor_user_id, event_type
  ) values (target.company_id, target.id, actor_id, 'invitation_revoked');
  return target.id;
end;
$$;

create or replace function public.accept_company_invitation(p_token_hash text)
returns table (
  invitation_id uuid,
  membership_id uuid,
  company_id uuid,
  repeated boolean
)
language plpgsql
security definer
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

  select lower(trim(user_record.email))
  into actor_email
  from auth.users user_record
  where user_record.id = actor_id
    and user_record.email_confirmed_at is not null;

  if actor_email is null then
    raise exception 'Verified email identity is required.' using errcode = '42501';
  end if;

  select * into target
  from public.invitations invitation
  where invitation.token_hash = p_token_hash
  for update;

  if not found or lower(target.email) <> actor_email then
    raise exception 'Invitation is unavailable.' using errcode = '42501';
  end if;

  if target.status = 'accepted' and target.accepted_by = actor_id
     and target.accepted_membership_id is not null then
    return query select target.id, target.accepted_membership_id,
      target.company_id, true;
    return;
  end if;
  if target.status <> 'pending' or target.expires_at is null
     or target.expires_at <= now() then
    raise exception 'Invitation is no longer active.' using errcode = '55000';
  end if;

  insert into public.user_profiles (
    id, email, full_name, status, user_type
  )
  values (
    actor_id, actor_email, target.full_name, 'active', 'partner'
  )
  on conflict (id) do update
  set full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
      updated_at = now()
  where public.user_profiles.user_type in ('external', 'partner');

  if not exists (
    select 1 from public.user_profiles profile
    where profile.id = actor_id
      and profile.status = 'active'
      and profile.user_type in ('external', 'partner')
  ) then
    raise exception 'Partner profile is not eligible.' using errcode = '42501';
  end if;

  select * into membership
  from public.company_memberships company_membership
  where company_membership.user_id = actor_id
    and company_membership.company_id = target.company_id
  for update;

  if found and membership.status in ('suspended', 'revoked', 'rejected') then
    raise exception 'Existing membership requires administrator review.' using errcode = '55000';
  elsif found then
    update public.company_memberships
    set role_id = target.role_id, status = 'active', approved_by = target.invited_by,
        approved_at = now(), revoked_by = null, revoked_at = null, updated_at = now()
    where id = membership.id
    returning * into membership;
  else
    insert into public.company_memberships (
      user_id, company_id, role_id, status, approved_by, approved_at
    ) values (
      actor_id, target.company_id, target.role_id, 'active',
      target.invited_by, now()
    )
    returning * into membership;
  end if;

  delete from public.membership_permission_overrides
  where membership_id = membership.id;

  insert into public.membership_permission_overrides (
    membership_id, permission_id, effect, created_by
  )
  select membership.id, intended.permission_id, intended.effect, target.invited_by
  from public.invitation_permission_overrides intended
  where intended.invitation_id = target.id;

  update public.invitations
  set status = 'accepted', accepted_by = actor_id,
      accepted_membership_id = membership.id, accepted_at = now(), updated_at = now()
  where id = target.id;

  insert into public.company_user_events (
    company_id, target_user_id, target_invitation_id, actor_user_id,
    event_type, safe_payload
  ) values (
    target.company_id, actor_id, target.id, actor_id,
    'invitation_accepted', jsonb_build_object('membershipId', membership.id)
  );

  return query select target.id, membership.id, target.company_id, false;
end;
$$;

create or replace function public.set_company_membership_state(
  p_membership_id uuid,
  p_target_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  actor_is_admin boolean;
  target public.company_memberships%rowtype;
  target_role_code text;
begin
  select * into target
  from public.company_memberships
  where id = p_membership_id
  for update;
  if not found or not public.can_manage_company_users(target.company_id) then
    raise exception 'Membership is unavailable.' using errcode = '42501';
  end if;
  if p_target_status not in ('active', 'suspended') then
    raise exception 'Membership state is invalid.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target.company_id::text, 0));

  select exists (
    select 1 from public.user_profiles profile
    where profile.id = actor_id and profile.status = 'active'
      and profile.user_type = 'admin'
  ) into actor_is_admin;
  select role.code into target_role_code from public.roles role where role.id = target.role_id;

  if p_target_status = 'suspended' and target_role_code = 'partner_owner'
     and not actor_is_admin then
    perform 1
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    where membership.company_id = target.company_id
      and membership.status = 'active'
      and role.code = 'partner_owner'
    for update of membership;
    if (
      select count(*)
      from public.company_memberships membership
      join public.roles role on role.id = membership.role_id
      where membership.company_id = target.company_id
        and membership.status = 'active'
        and role.code = 'partner_owner'
    ) <= 1 then
      raise exception 'The final active owner cannot be suspended.' using errcode = '55000';
    end if;
  end if;

  if p_target_status = 'active' and target.status = 'active' then return target.id; end if;
  if p_target_status = 'suspended' and target.status = 'suspended' then return target.id; end if;
  if (p_target_status = 'suspended' and target.status <> 'active')
     or (p_target_status = 'active' and target.status <> 'suspended') then
    raise exception 'Membership transition is invalid.' using errcode = '55000';
  end if;

  update public.company_memberships
  set status = p_target_status,
      revoked_by = case when p_target_status = 'suspended' then actor_id else null end,
      revoked_at = case when p_target_status = 'suspended' then now() else null end,
      updated_at = now()
  where id = target.id;

  insert into public.company_user_events (
    company_id, target_user_id, actor_user_id, event_type
  ) values (
    target.company_id, target.user_id, actor_id,
    case when p_target_status = 'suspended'
      then 'employee_suspended' else 'employee_restored' end
  );
  return target.id;
end;
$$;

create or replace function public.update_company_membership_access(
  p_membership_id uuid,
  p_role_code text,
  p_price_access text
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  actor_is_admin boolean;
  target public.company_memberships%rowtype;
  current_role_code text;
  next_role public.roles%rowtype;
  permission_record record;
begin
  select * into target from public.company_memberships
  where id = p_membership_id for update;
  if not found or not public.can_manage_company_users(target.company_id) then
    raise exception 'Membership is unavailable.' using errcode = '42501';
  end if;
  if p_price_access not in ('full', 'retail_only') then
    raise exception 'Price access is invalid.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target.company_id::text, 0));

  select exists (
    select 1 from public.user_profiles profile
    where profile.id = actor_id and profile.status = 'active'
      and profile.user_type = 'admin'
  ) into actor_is_admin;
  if target.user_id = actor_id and not actor_is_admin then
    raise exception 'Employees cannot change their own role or access overrides.'
      using errcode = '42501';
  end if;

  select role.code into current_role_code from public.roles role where role.id = target.role_id;
  select * into next_role from public.roles role
  where role.code = p_role_code and role.scope = 'partner'
    and (
      actor_is_admin
      or role.code in ('partner_manager', 'partner_buyer', 'partner_accounting', 'partner_viewer')
    );
  if not found then
    raise exception 'Partner role is not assignable.' using errcode = '42501';
  end if;

  if current_role_code = 'partner_owner' and next_role.code <> 'partner_owner'
     and not actor_is_admin then
    perform 1 from public.company_memberships membership
    where membership.company_id = target.company_id for update;
    if (
      select count(*)
      from public.company_memberships membership
      join public.roles role on role.id = membership.role_id
      where membership.company_id = target.company_id
        and membership.status = 'active'
        and role.code = 'partner_owner'
    ) <= 1 then
      raise exception 'The final active owner cannot be downgraded.' using errcode = '55000';
    end if;
  end if;

  update public.company_memberships set role_id = next_role.id, updated_at = now()
  where id = target.id;

  delete from public.membership_permission_overrides override
  using public.permissions permission
  where override.membership_id = target.id
    and permission.id = override.permission_id
    and permission.code in ('pricing.partner_price.view', 'pricing.retail_price.view');

  for permission_record in
    select permission.id, permission.code
    from public.permissions permission
    where permission.code in ('pricing.partner_price.view', 'pricing.retail_price.view')
      and permission.delegable_by_partner_owner
  loop
    insert into public.membership_permission_overrides (
      membership_id, permission_id, effect, created_by
    ) values (
      target.id, permission_record.id,
      case when permission_record.code = 'pricing.partner_price.view'
        and p_price_access = 'retail_only' then 'deny' else 'allow' end,
      actor_id
    );
  end loop;

  if current_role_code <> next_role.code then
    insert into public.company_user_events (
      company_id, target_user_id, actor_user_id, event_type, safe_payload
    ) values (
      target.company_id, target.user_id, actor_id, 'role_changed',
      jsonb_build_object('from', current_role_code, 'to', next_role.code)
    );
  end if;
  insert into public.company_user_events (
    company_id, target_user_id, actor_user_id, event_type, safe_payload
  ) values (
    target.company_id, target.user_id, actor_id, 'price_access_changed',
    jsonb_build_object('priceAccess', p_price_access)
  );
  return target.id;
end;
$$;

create or replace function public.appoint_company_owner(p_membership_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target public.company_memberships%rowtype;
  owner_role_id uuid;
begin
  select * into target from public.company_memberships
  where id = p_membership_id for update;
  if not found or target.status <> 'active'
     or not public.can_manage_company_users(target.company_id) then
    raise exception 'Membership is unavailable.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target.company_id::text, 0));
  select id into owner_role_id from public.roles
  where code = 'partner_owner' and scope = 'partner';
  update public.company_memberships set role_id = owner_role_id, updated_at = now()
  where id = target.id;
  insert into public.company_user_events (
    company_id, target_user_id, actor_user_id, event_type
  ) values (target.company_id, target.user_id, actor_id, 'owner_appointed');
  return target.id;
end;
$$;

create or replace function public.list_company_users(
  p_company_id uuid,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  record_type text,
  record_id uuid,
  user_id uuid,
  full_name text,
  email text,
  role_code text,
  role_name text,
  membership_status text,
  invitation_status text,
  price_access text,
  joined_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with authorized as (
    select 1
    where p_page >= 1 and p_page_size between 1 and 100
      and public.can_manage_company_users(p_company_id)
  ),
  membership_rows as (
    select
      'membership'::text as record_type,
      membership.id as record_id,
      profile.id as user_id,
      coalesce(profile.full_name, profile.email) as full_name,
      profile.email,
      role.code as role_code,
      role.name as role_name,
      membership.status as membership_status,
      null::text as invitation_status,
      case when exists (
        select 1
        from public.membership_permission_overrides override
        join public.permissions permission on permission.id = override.permission_id
        where override.membership_id = membership.id
          and permission.code = 'pricing.partner_price.view'
          and override.effect = 'deny'
      ) then 'retail_only' else 'full' end as price_access,
      membership.approved_at as joined_at,
      membership.created_at
    from public.company_memberships membership
    join public.user_profiles profile on profile.id = membership.user_id
    join public.roles role on role.id = membership.role_id
    where membership.company_id = p_company_id
  ),
  invitation_rows as (
    select
      'invitation'::text,
      invitation.id,
      null::uuid,
      coalesce(invitation.full_name, invitation.email),
      invitation.email,
      role.code,
      role.name,
      null::text,
      case when invitation.status = 'pending' and invitation.expires_at <= now()
        then 'expired' else invitation.status end,
      case when exists (
        select 1
        from public.invitation_permission_overrides override
        join public.permissions permission on permission.id = override.permission_id
        where override.invitation_id = invitation.id
          and permission.code = 'pricing.partner_price.view'
          and override.effect = 'deny'
      ) then 'retail_only' else 'full' end,
      null::timestamptz,
      invitation.created_at
    from public.invitations invitation
    join public.roles role on role.id = invitation.role_id
    where invitation.company_id = p_company_id
      and invitation.status <> 'accepted'
  ),
  combined as (
    select * from membership_rows
    union all
    select * from invitation_rows
  )
  select combined.*, count(*) over() as total_count
  from combined, authorized
  order by combined.created_at desc, combined.record_id
  limit p_page_size offset (p_page - 1) * p_page_size;
$$;

create or replace function public.list_company_user_events(
  p_company_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  target_user_id uuid,
  target_invitation_id uuid,
  actor_user_id uuid,
  event_type text,
  safe_payload jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select event.id, event.target_user_id, event.target_invitation_id,
    event.actor_user_id, event.event_type, event.safe_payload, event.created_at
  from public.company_user_events event
  where event.company_id = p_company_id
    and p_limit between 1 and 100
    and public.can_manage_company_users(p_company_id)
  order by event.created_at desc
  limit p_limit;
$$;

create or replace function public.list_admin_partner_companies(
  p_search text default null,
  p_limit integer default 100
)
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select company.id, company.display_name
  from public.partner_companies company
  where p_limit between 1 and 100
    and exists (
      select 1 from public.user_profiles profile
      where profile.id = auth.uid() and profile.status = 'active'
        and profile.user_type = 'admin'
    )
    and (nullif(trim(p_search), '') is null
      or company.display_name ilike '%' || trim(p_search) || '%')
  order by company.display_name
  limit p_limit;
$$;

alter table public.invitation_permission_overrides enable row level security;
alter table public.company_user_events enable row level security;

revoke all on table public.invitation_permission_overrides from anon, authenticated;
revoke all on table public.company_user_events from anon, authenticated;
grant select on table public.invitation_permission_overrides to authenticated;
grant select on table public.company_user_events to authenticated;

create policy "Company managers can read invitation overrides"
on public.invitation_permission_overrides
for select to authenticated
using (
  exists (
    select 1 from public.invitations invitation
    where invitation.id = invitation_id
      and public.can_manage_company_users(invitation.company_id)
  )
);

create policy "Company managers can read access events"
on public.company_user_events
for select to authenticated
using (public.can_manage_company_users(company_id));

drop policy if exists "Company managers can read invitations" on public.invitations;
create policy "Company managers can read invitations"
on public.invitations for select to authenticated
using (public.can_manage_company_users(company_id));

revoke insert, update, delete on table public.invitations from authenticated;
revoke insert, update, delete on table public.membership_permission_overrides from authenticated;

revoke all on function public.create_company_invitation(uuid, text, text, text, text, text, timestamptz, uuid) from public;
revoke all on function public.reissue_company_invitation(uuid, text, timestamptz) from public;
revoke all on function public.revoke_company_invitation(uuid) from public;
revoke all on function public.accept_company_invitation(text) from public;
revoke all on function public.set_company_membership_state(uuid, text) from public;
revoke all on function public.update_company_membership_access(uuid, text, text) from public;
revoke all on function public.appoint_company_owner(uuid) from public;
revoke all on function public.list_company_users(uuid, integer, integer) from public;
revoke all on function public.list_company_user_events(uuid, integer) from public;
revoke all on function public.list_admin_partner_companies(text, integer) from public;

grant execute on function public.create_company_invitation(uuid, text, text, text, text, text, timestamptz, uuid) to authenticated;
grant execute on function public.reissue_company_invitation(uuid, text, timestamptz) to authenticated;
grant execute on function public.revoke_company_invitation(uuid) to authenticated;
grant execute on function public.accept_company_invitation(text) to authenticated;
grant execute on function public.set_company_membership_state(uuid, text) to authenticated;
grant execute on function public.update_company_membership_access(uuid, text, text) to authenticated;
grant execute on function public.appoint_company_owner(uuid) to authenticated;
grant execute on function public.list_company_users(uuid, integer, integer) to authenticated;
grant execute on function public.list_company_user_events(uuid, integer) to authenticated;
grant execute on function public.list_admin_partner_companies(text, integer) to authenticated;
