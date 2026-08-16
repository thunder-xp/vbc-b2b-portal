-- Preserve controlled employee-access acceptance records while excluding them
-- from the partner-facing current/history projection.

alter table public.invitations
  add column if not exists acceptance_artifact_at timestamptz null,
  add column if not exists acceptance_artifact_reason text null;

alter table public.company_memberships
  add column if not exists acceptance_artifact_at timestamptz null,
  add column if not exists acceptance_artifact_reason text null;

alter table public.invitations
  drop constraint if exists invitations_acceptance_artifact_check;
alter table public.invitations
  add constraint invitations_acceptance_artifact_check check (
    (acceptance_artifact_at is null and acceptance_artifact_reason is null)
    or (
      acceptance_artifact_at is not null
      and nullif(btrim(acceptance_artifact_reason), '') is not null
    )
  );

alter table public.company_memberships
  drop constraint if exists company_memberships_acceptance_artifact_check;
alter table public.company_memberships
  add constraint company_memberships_acceptance_artifact_check check (
    (acceptance_artifact_at is null and acceptance_artifact_reason is null)
    or (
      acceptance_artifact_at is not null
      and nullif(btrim(acceptance_artifact_reason), '') is not null
    )
  );

comment on column public.invitations.acceptance_artifact_at is
  'Internal classification marker. The preserved invitation remains available to audit and security review.';
comment on column public.company_memberships.acceptance_artifact_at is
  'Internal classification marker. The preserved membership remains available to audit and security review.';

do $$
declare
  target_company constant uuid := '8a6c8a9f-1dd4-46f6-b7fc-0436fe99a0cd';
  cleanup_reason constant text :=
    'Controlled employee invitation, SMTP, DNS, access-management, and retail-order acceptance fixture.';
  affected_count integer;
begin
  if not exists (
    select 1
    from public.partner_companies company
    where company.id = target_company
      and company.display_name = 'ISECURITY COMPANY S.R.L.'
  ) then
    return;
  end if;

  if (
    select count(*)
    from public.invitations invitation
    join (
      values
        ('ee5b775c-c7cf-47cf-af89-e15b9a8c9c3b'::uuid, 'vasili.culacov@gmail.com', 'Vasili Culacov'),
        ('c7eace52-041f-4c84-9c71-5496df2ad249'::uuid, 'ceo+partner-invite-20260811-1012@nsd.md', 'Acceptance Employee'),
        ('a1cbbe3d-30be-4164-90da-43ad0df8fa79'::uuid, 'sapphiraorange@emalupe.com', 'Acceptance Employee'),
        ('f3afc9d7-5151-43b6-82b7-2acf17a6f7b1'::uuid, 'sapphiraorange@emalupe.com', 'Acceptance Employee'),
        ('ddb704f0-8b16-4a14-8a64-30f9be2127ea'::uuid, 'sapphiraorange@emalupe.com', 'Acceptance Employee'),
        ('cac95d8b-3168-4c5e-8a6c-1dbd10e391c2'::uuid, 'sapphiraorange@emalupe.com', 'Acceptance Employee'),
        ('55f500a5-6323-4fe1-9fcb-625c48f7009c'::uuid, 'ceo@nsd.md', 'SMTP Acceptance'),
        ('e2497f2c-cc62-4589-a1d0-3f7fdb772a24'::uuid, 'ceo@nsd.md', 'DNS Authentication Acceptance')
    ) expected(id, email, full_name) on expected.id = invitation.id
      and expected.email = lower(btrim(invitation.email))
      and expected.full_name = invitation.full_name
    where invitation.company_id = target_company
  ) <> 8 then
    raise exception 'The verified invitation acceptance fixture set changed.' using errcode = '55000';
  end if;

  if (
    select count(*)
    from public.company_memberships membership
    join public.user_profiles profile on profile.id = membership.user_id
    join (
      values
        ('443d9821-8807-4ec5-9a57-1495039e443a'::uuid, 'sapphiraorange@emalupe.com'),
        ('1aa74f5c-9cca-4fd0-bf4e-77e44d2a6c03'::uuid, 'vasili.culacov@gmail.com')
    ) expected(id, email) on expected.id = membership.id
      and expected.email = lower(btrim(profile.email))
    where membership.company_id = target_company
      and membership.status = 'revoked'
  ) <> 2 then
    raise exception 'Acceptance memberships must be revoked before classification.' using errcode = '55000';
  end if;

  update public.invitations
  set acceptance_artifact_at = coalesce(acceptance_artifact_at, statement_timestamp()),
      acceptance_artifact_reason = cleanup_reason
  where company_id = target_company
    and id = any(array[
      'ee5b775c-c7cf-47cf-af89-e15b9a8c9c3b'::uuid,
      'c7eace52-041f-4c84-9c71-5496df2ad249'::uuid,
      'a1cbbe3d-30be-4164-90da-43ad0df8fa79'::uuid,
      'f3afc9d7-5151-43b6-82b7-2acf17a6f7b1'::uuid,
      'ddb704f0-8b16-4a14-8a64-30f9be2127ea'::uuid,
      'cac95d8b-3168-4c5e-8a6c-1dbd10e391c2'::uuid,
      '55f500a5-6323-4fe1-9fcb-625c48f7009c'::uuid,
      'e2497f2c-cc62-4589-a1d0-3f7fdb772a24'::uuid
    ]);
  get diagnostics affected_count = row_count;
  if affected_count <> 8 then
    raise exception 'Invitation acceptance fixture classification was incomplete.' using errcode = '55000';
  end if;

  update public.company_memberships
  set acceptance_artifact_at = coalesce(acceptance_artifact_at, statement_timestamp()),
      acceptance_artifact_reason = cleanup_reason
  where company_id = target_company
    and id = any(array[
      '443d9821-8807-4ec5-9a57-1495039e443a'::uuid,
      '1aa74f5c-9cca-4fd0-bf4e-77e44d2a6c03'::uuid
    ]);
  get diagnostics affected_count = row_count;
  if affected_count <> 2 then
    raise exception 'Membership acceptance fixture classification was incomplete.' using errcode = '55000';
  end if;
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
      and membership.acceptance_artifact_at is null
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
      and invitation.acceptance_artifact_at is null
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
