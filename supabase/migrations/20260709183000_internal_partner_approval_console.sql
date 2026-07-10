-- Internal partner approval console.
-- Partners submit review data only. Internal/admin users bind requests to 1C
-- partner, contract, and price type references during approval.

alter table public.partner_companies
add column if not exists external_1c_contract_id text null,
add column if not exists external_1c_price_type_id text null;

comment on column public.partner_companies.external_1c_contract_id is
  'Internal 1C contract reference selected during manager/admin approval. Not partner-facing.';
comment on column public.partner_companies.external_1c_price_type_id is
  'Internal 1C price type or price group reference selected during manager/admin approval. Not partner-facing.';

alter table public.access_requests
add column if not exists decision_reason text null;

comment on column public.access_requests.decision_reason is
  'Manager/admin decision reason for approved or rejected access requests.';

create or replace function public.can_review_access_requests()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles user_profile
    where user_profile.id = auth.uid()
      and user_profile.status = 'active'
      and user_profile.user_type in ('internal', 'admin')
  );
$$;

revoke all on function public.can_review_access_requests() from public;
grant execute on function public.can_review_access_requests() to authenticated;

grant select on table public.user_profiles to authenticated;
grant update (status, user_type) on table public.user_profiles to authenticated;

grant insert (
  external_1c_id,
  external_1c_contract_id,
  external_1c_price_type_id,
  display_name,
  status
) on table public.partner_companies to authenticated;

grant update (
  external_1c_contract_id,
  external_1c_price_type_id,
  display_name,
  status
) on table public.partner_companies to authenticated;

grant select, insert on table public.company_memberships to authenticated;

grant update (
  company_id,
  requested_external_1c_id,
  status,
  reviewed_by,
  reviewed_at,
  decision_reason
) on table public.access_requests to authenticated;

drop policy if exists "Users can cancel own pending review access requests"
on public.access_requests;

create policy "Users can cancel own pending review access requests"
on public.access_requests
for update
to authenticated
using (user_profile_id = auth.uid() and status = 'pending_review')
with check (
  user_profile_id = auth.uid()
  and status = 'cancelled'
  and company_id is null
  and requested_external_1c_id is null
  and reviewed_by is null
  and reviewed_at is null
  and decision_reason is null
);

drop policy if exists "Internal users can select user profiles for approval"
on public.user_profiles;

create policy "Internal users can select user profiles for approval"
on public.user_profiles
for select
to authenticated
using (public.can_review_access_requests());

drop policy if exists "Internal users can update user profile approval state"
on public.user_profiles;

create policy "Internal users can update user profile approval state"
on public.user_profiles
for update
to authenticated
using (public.can_review_access_requests())
with check (public.can_review_access_requests());

drop policy if exists "Internal users can select partner companies"
on public.partner_companies;

create policy "Internal users can select partner companies"
on public.partner_companies
for select
to authenticated
using (public.can_review_access_requests());

drop policy if exists "Internal users can insert partner companies"
on public.partner_companies;

create policy "Internal users can insert partner companies"
on public.partner_companies
for insert
to authenticated
with check (public.can_review_access_requests());

drop policy if exists "Internal users can update partner companies"
on public.partner_companies;

create policy "Internal users can update partner companies"
on public.partner_companies
for update
to authenticated
using (public.can_review_access_requests())
with check (public.can_review_access_requests());

drop policy if exists "Internal users can select company memberships"
on public.company_memberships;

create policy "Internal users can select company memberships"
on public.company_memberships
for select
to authenticated
using (public.can_review_access_requests());

drop policy if exists "Internal users can insert company memberships"
on public.company_memberships;

create policy "Internal users can insert company memberships"
on public.company_memberships
for insert
to authenticated
with check (public.can_review_access_requests());

drop policy if exists "Internal users can select access requests for review"
on public.access_requests;

create policy "Internal users can select access requests for review"
on public.access_requests
for select
to authenticated
using (public.can_review_access_requests());

drop policy if exists "Internal users can review access requests"
on public.access_requests;

create policy "Internal users can review access requests"
on public.access_requests
for update
to authenticated
using (public.can_review_access_requests() and status = 'pending_review')
with check (
  public.can_review_access_requests()
  and status in ('approved', 'rejected')
);

comment on function public.can_review_access_requests()
  is 'Allows active internal/admin users to review partner access requests without Service Role. Does not grant partner self-approval.';
