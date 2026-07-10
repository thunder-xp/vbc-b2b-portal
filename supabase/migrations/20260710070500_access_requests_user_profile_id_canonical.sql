-- Canonicalize access_requests ownership on user_profile_id.
-- This repairs cloud schemas that still have legacy user_id not null.

do $$
begin
  if to_regclass('public.access_requests') is null then
    raise exception 'Required table public.access_requests does not exist.';
  end if;
end $$;

alter table public.access_requests
add column if not exists user_profile_id uuid,
add column if not exists company_id uuid null,
add column if not exists requested_external_1c_id text null,
add column if not exists requested_company_name text null,
add column if not exists requested_fiscal_code text null,
add column if not exists contact_phone text null,
add column if not exists message text null,
add column if not exists status text not null default 'pending_review',
add column if not exists reviewed_by uuid null,
add column if not exists reviewed_at timestamptz null,
add column if not exists decision_reason text null,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

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

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'access_requests'
      and column_name = 'user_id'
  ) then
    update public.access_requests
    set user_profile_id = user_id
    where user_profile_id is null
      and user_id is not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from public.access_requests
    where user_profile_id is null
  ) then
    raise exception 'Cannot canonicalize public.access_requests: user_profile_id has null rows after legacy backfill.';
  end if;
end $$;

drop policy if exists "Users can insert own access requests"
on public.access_requests;

drop policy if exists "Users can insert own pending access requests"
on public.access_requests;

drop policy if exists "Users can insert own pending review access requests"
on public.access_requests;

drop policy if exists "Users can select own access requests"
on public.access_requests;

drop policy if exists "Users can cancel own pending access requests"
on public.access_requests;

drop policy if exists "Users can cancel own pending review access requests"
on public.access_requests;

drop policy if exists "Internal users can select access requests for review"
on public.access_requests;

drop policy if exists "Internal users can review access requests"
on public.access_requests;

drop index if exists public.access_requests_user_id_idx;

alter table public.access_requests
alter column user_profile_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'access_requests_user_profile_id_fkey'
      and conrelid = 'public.access_requests'::regclass
  ) then
    alter table public.access_requests
    add constraint access_requests_user_profile_id_fkey
    foreign key (user_profile_id)
    references public.user_profiles(id)
    on delete cascade;
  end if;
end $$;

create index if not exists access_requests_user_profile_id_idx
on public.access_requests(user_profile_id);

alter table public.access_requests
drop column if exists user_id cascade;

alter table public.access_requests enable row level security;

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

revoke all on table public.access_requests from anon, authenticated;
grant select on table public.access_requests to authenticated;
grant insert on table public.access_requests to authenticated;
grant update (
  company_id,
  requested_external_1c_id,
  status,
  reviewed_by,
  reviewed_at,
  decision_reason
) on table public.access_requests to authenticated;

create policy "Users can insert own pending review access requests"
on public.access_requests
for insert
to authenticated
with check (
  user_profile_id = auth.uid()
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

create policy "Users can select own access requests"
on public.access_requests
for select
to authenticated
using (user_profile_id = auth.uid());

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

create policy "Internal users can select access requests for review"
on public.access_requests
for select
to authenticated
using (public.can_review_access_requests());

create policy "Internal users can review access requests"
on public.access_requests
for update
to authenticated
using (public.can_review_access_requests() and status = 'pending_review')
with check (
  public.can_review_access_requests()
  and status in ('approved', 'rejected')
);

comment on column public.access_requests.user_profile_id is
  'Canonical owner profile for partner access request. Replaces legacy user_id.';
