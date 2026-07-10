-- Allows authenticated users with an existing profile to submit their own
-- partner access request before company access exists.
-- Partners cannot bind company/1C/contract/price-type or approve themselves.

alter table public.access_requests
add column if not exists requested_fiscal_code text null,
add column if not exists contact_phone text null,
add column if not exists decision_reason text null;

update public.access_requests
set status = 'pending_review'
where status = 'pending';

alter table public.access_requests
alter column status set default 'pending_review';

alter table public.access_requests
drop constraint if exists access_requests_status_check;

alter table public.access_requests
add constraint access_requests_status_check
check (status in ('pending_review', 'approved', 'rejected', 'cancelled'));

revoke insert (
  company_id,
  requested_external_1c_id,
  status,
  reviewed_by,
  reviewed_at,
  decision_reason
) on table public.access_requests from authenticated;

grant insert (
  user_id,
  requested_company_name,
  requested_fiscal_code,
  contact_phone,
  message
) on table public.access_requests to authenticated;

drop policy if exists "Users can insert own access requests"
on public.access_requests;

drop policy if exists "Users can insert own pending review access requests"
on public.access_requests;

create policy "Users can insert own pending review access requests"
on public.access_requests
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending_review'
  and company_id is null
  and requested_external_1c_id is null
  and reviewed_by is null
  and reviewed_at is null
  and decision_reason is null
  and exists (
    select 1
    from public.user_profiles user_profile
    where user_profile.id = auth.uid()
      and user_profile.status not in ('suspended', 'revoked', 'rejected')
  )
);
