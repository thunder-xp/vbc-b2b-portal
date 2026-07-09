-- Partner access requests must collect partner-known business identifiers only.
-- 1C references are internal-only and must be assigned later by manager/admin
-- approval workflow, not by the partner-facing onboarding form.

alter table public.access_requests
add column if not exists requested_fiscal_code text null,
add column if not exists contact_phone text null;

comment on column public.access_requests.requested_external_1c_id is
  'Internal 1C partner reference assigned by manager/admin approval workflow. Partners must never submit this value.';
comment on column public.access_requests.requested_fiscal_code is
  'Partner-submitted fiscal code, VAT number, or IDNO for manager review. Not verified commercial truth.';
comment on column public.access_requests.contact_phone is
  'Partner-submitted contact phone for manager review.';

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

revoke insert (requested_external_1c_id)
on table public.access_requests
from authenticated;

grant insert (
  requested_fiscal_code,
  contact_phone
) on table public.access_requests to authenticated;

drop policy if exists "Users can cancel own pending access requests"
on public.access_requests;

create policy "Users can cancel own pending review access requests"
on public.access_requests
for update
to authenticated
using (user_id = auth.uid() and status = 'pending_review')
with check (user_id = auth.uid() and status = 'cancelled');
