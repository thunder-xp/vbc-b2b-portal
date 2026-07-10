-- Cloud repair migration for partner onboarding access requests.
-- The existing domain table is public.access_requests.
-- Do not create public.partner_access_requests.

do $$
begin
  if to_regclass('public.access_requests') is null then
    raise exception 'Required table public.access_requests does not exist. Apply the access-control foundation migration first.';
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

update public.access_requests
set status = 'pending_review'
where status = 'pending';

alter table public.access_requests
alter column user_profile_id set not null,
alter column status set default 'pending_review';

alter table public.access_requests
drop constraint if exists access_requests_status_check;

alter table public.access_requests
add constraint access_requests_status_check
check (status in ('pending_review', 'approved', 'rejected', 'cancelled'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'access_requests_user_profile_id_fkey'
  ) then
    alter table public.access_requests
    add constraint access_requests_user_profile_id_fkey
    foreign key (user_profile_id)
    references public.user_profiles(id)
    on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'access_requests_company_id_fkey'
  ) then
    alter table public.access_requests
    add constraint access_requests_company_id_fkey
    foreign key (company_id)
    references public.partner_companies(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'access_requests_reviewed_by_fkey'
  ) then
    alter table public.access_requests
    add constraint access_requests_reviewed_by_fkey
    foreign key (reviewed_by)
    references public.user_profiles(id);
  end if;
end $$;

create index if not exists access_requests_user_profile_id_idx
on public.access_requests(user_profile_id);

create index if not exists access_requests_company_id_idx
on public.access_requests(company_id);

create index if not exists access_requests_status_idx
on public.access_requests(status);

drop trigger if exists set_access_requests_updated_at
on public.access_requests;

create trigger set_access_requests_updated_at
before update on public.access_requests
for each row execute function public.set_updated_at();

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

drop policy if exists "Users can insert own access requests"
on public.access_requests;

drop policy if exists "Users can insert own pending access requests"
on public.access_requests;

drop policy if exists "Users can insert own pending review access requests"
on public.access_requests;

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

drop policy if exists "Users can select own access requests"
on public.access_requests;

create policy "Users can select own access requests"
on public.access_requests
for select
to authenticated
using (user_profile_id = auth.uid());

drop policy if exists "Users can cancel own pending access requests"
on public.access_requests;

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

comment on table public.access_requests is
  'Portal-owned access request workflow input. Partners can submit own pending_review requests before company access exists.';
  
