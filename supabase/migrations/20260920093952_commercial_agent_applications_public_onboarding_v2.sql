-- Governed Commercial Agent application intake.
-- An application is not an operational commercial_agent and never grants cabinet access.

-- Unified business identity explicitly permits an active Partner principal to
-- enter the existing Commercial Agent lifecycle without a second Auth user.
create or replace function private.enforce_agent_principal_eligibility()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1
    from public.user_profiles profile
    where profile.id = new.user_id
      and profile.status = 'active'
      and profile.user_type in ('external', 'partner')
  ) then
    raise exception 'Agent principal must be an active external or Partner user.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_agent_principal_eligibility() from public, anon, authenticated, service_role;

create table public.commercial_agent_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references public.user_profiles(id) on delete restrict,
  status text not null default 'DRAFT',
  display_name text null,
  phone text null,
  email text null,
  locality text null,
  profession text null,
  workplace text null,
  agent_type text not null default 'INDIVIDUAL',
  legal_name text null,
  applicant_visible_note text null,
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references public.user_profiles(id) on delete restrict,
  provisioned_agent_id uuid null references public.commercial_agents(id) on delete restrict,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_agent_applications_status_check check (
    status in ('DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'WITHDRAWN')
  ),
  constraint commercial_agent_applications_display_name_check check (
    display_name is null or char_length(btrim(display_name)) between 2 and 200
  ),
  constraint commercial_agent_applications_submitted_identity_check check (
    status in ('DRAFT', 'WITHDRAWN') or display_name is not null
  ),
  constraint commercial_agent_applications_phone_check check (
    phone is null or char_length(btrim(phone)) between 8 and 32
  ),
  constraint commercial_agent_applications_email_check check (
    email is null or char_length(btrim(email)) between 3 and 254
  ),
  constraint commercial_agent_applications_locality_check check (
    locality is null or char_length(btrim(locality)) <= 120
  ),
  constraint commercial_agent_applications_profession_check check (
    profession is null or char_length(btrim(profession)) <= 160
  ),
  constraint commercial_agent_applications_workplace_check check (
    workplace is null or char_length(btrim(workplace)) <= 200
  ),
  constraint commercial_agent_applications_agent_type_check check (
    agent_type in ('INDIVIDUAL', 'LEGAL_ENTITY')
  ),
  constraint commercial_agent_applications_legal_name_check check (
    legal_name is null or char_length(btrim(legal_name)) between 2 and 240
  ),
  constraint commercial_agent_applications_legal_entity_check check (
    agent_type <> 'LEGAL_ENTITY' or legal_name is not null
  ) not valid,
  constraint commercial_agent_applications_note_check check (
    applicant_visible_note is null or char_length(applicant_visible_note) <= 1000
  ),
  constraint commercial_agent_applications_revision_check check (revision > 0),
  constraint commercial_agent_applications_review_check check (
    (reviewed_at is null and reviewed_by is null)
    or (reviewed_at is not null and reviewed_by is not null)
  ),
  constraint commercial_agent_applications_provision_check check (
    (status = 'APPROVED' and provisioned_agent_id is not null)
    or (status <> 'APPROVED' and provisioned_agent_id is null)
  )
);

create unique index commercial_agent_applications_open_user_idx
  on public.commercial_agent_applications (applicant_user_id)
  where status in ('DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION', 'APPROVED');

create unique index commercial_agent_applications_agent_idx
  on public.commercial_agent_applications (provisioned_agent_id)
  where provisioned_agent_id is not null;

create index commercial_agent_applications_review_queue_idx
  on public.commercial_agent_applications (status, submitted_at, id)
  where status in ('SUBMITTED', 'NEEDS_CLARIFICATION');

create table public.commercial_agent_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.commercial_agent_applications(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null,
  from_status text null,
  to_status text not null,
  revision integer not null,
  safe_note text null,
  created_at timestamptz not null default now(),
  constraint commercial_agent_application_events_type_check check (event_type in (
    'APPLICATION_CREATED', 'APPLICATION_UPDATED', 'APPLICATION_SUBMITTED',
    'CLARIFICATION_REQUESTED', 'APPLICATION_APPROVED', 'APPLICATION_REJECTED',
    'APPLICATION_WITHDRAWN', 'AGENT_PROVISIONED'
  )),
  constraint commercial_agent_application_events_status_check check (
    (from_status is null or from_status in ('DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'WITHDRAWN'))
    and to_status in ('DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'WITHDRAWN')
  ),
  constraint commercial_agent_application_events_revision_check check (revision > 0),
  constraint commercial_agent_application_events_note_check check (
    safe_note is null or char_length(safe_note) <= 1000
  )
);

create index commercial_agent_application_events_history_idx
  on public.commercial_agent_application_events (application_id, created_at, id);

create or replace function private.touch_commercial_agent_application_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_commercial_agent_application_updated_at
before update on public.commercial_agent_applications
for each row execute function private.touch_commercial_agent_application_updated_at();

create or replace function private.prevent_commercial_agent_application_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Commercial Agent application events are append-only.' using errcode = '42501';
end;
$$;

create trigger prevent_commercial_agent_application_event_mutation
before update or delete on public.commercial_agent_application_events
for each row execute function private.prevent_commercial_agent_application_event_mutation();

create or replace function public.ensure_commercial_agent_application_draft(
  p_applicant_user_id uuid,
  p_email text default null
)
returns public.commercial_agent_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.commercial_agent_applications;
  created public.commercial_agent_applications;
begin
  insert into public.user_profiles (id, email, status, user_type)
  select identity.id, lower(identity.email), 'registered', 'external'
  from auth.users identity
  where identity.id = p_applicant_user_id
    and identity.email is not null
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.user_profiles profile
    where profile.id = p_applicant_user_id
      and profile.status not in ('suspended', 'revoked', 'rejected')
  ) then
    raise exception 'Applicant identity is not eligible.' using errcode = '42501';
  end if;

  if exists (select 1 from public.commercial_agents agent where agent.user_id = p_applicant_user_id) then
    return null;
  end if;

  select application.* into existing
  from public.commercial_agent_applications application
  where application.applicant_user_id = p_applicant_user_id
  order by application.created_at desc, application.id desc
  limit 1;

  if existing.id is not null then
    return existing;
  end if;

  insert into public.commercial_agent_applications (applicant_user_id, email)
  values (p_applicant_user_id, nullif(lower(btrim(p_email)), ''))
  on conflict (applicant_user_id)
    where status in ('DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION', 'APPROVED')
    do nothing
  returning * into created;

  if created.id is null then
    select application.* into created
    from public.commercial_agent_applications application
    where application.applicant_user_id = p_applicant_user_id
      and application.status in ('DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION', 'APPROVED')
    order by application.created_at desc, application.id desc
    limit 1;
  else
    insert into public.commercial_agent_application_events (
      application_id, actor_user_id, event_type, to_status, revision
    ) values (
      created.id, p_applicant_user_id, 'APPLICATION_CREATED', created.status, created.revision
    );
  end if;

  return created;
end;
$$;

create or replace function public.submit_commercial_agent_application(
  p_applicant_user_id uuid,
  p_display_name text,
  p_phone text,
  p_email text,
  p_locality text,
  p_profession text,
  p_workplace text,
  p_agent_type text,
  p_legal_name text
)
returns public.commercial_agent_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_application public.commercial_agent_applications;
  changed public.commercial_agent_applications;
  previous_status text;
begin
  if not exists (
    select 1 from public.user_profiles profile
    where profile.id = p_applicant_user_id
      and profile.status not in ('suspended', 'revoked', 'rejected')
  ) then
    raise exception 'Applicant identity is not eligible.' using errcode = '42501';
  end if;
  if exists (select 1 from public.commercial_agents agent where agent.user_id = p_applicant_user_id) then
    raise exception 'Commercial Agent already exists.' using errcode = '23505';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 200
    or p_agent_type not in ('INDIVIDUAL', 'LEGAL_ENTITY')
    or (p_agent_type = 'LEGAL_ENTITY' and char_length(btrim(p_legal_name)) not between 2 and 240)
    or (nullif(btrim(p_phone), '') is not null and char_length(btrim(p_phone)) not between 8 and 32)
    or (nullif(btrim(p_email), '') is not null and (
      char_length(btrim(p_email)) not between 3 and 254
      or lower(btrim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    )) then
    raise exception 'Commercial Agent application input is invalid.' using errcode = '23514';
  end if;

  select application.* into current_application
  from public.commercial_agent_applications application
  where application.applicant_user_id = p_applicant_user_id
  order by application.created_at desc, application.id desc
  limit 1
  for update;

  if current_application.id is null then
    raise exception 'Commercial Agent application draft is missing.' using errcode = 'P0002';
  end if;

  if current_application.status = 'SUBMITTED' then
    if current_application.display_name = btrim(p_display_name)
      and current_application.phone is not distinct from nullif(btrim(p_phone), '')
      and current_application.email is not distinct from nullif(lower(btrim(p_email)), '')
      and current_application.locality is not distinct from nullif(btrim(p_locality), '')
      and current_application.profession is not distinct from nullif(btrim(p_profession), '')
      and current_application.workplace is not distinct from nullif(btrim(p_workplace), '')
      and current_application.agent_type = p_agent_type
      and current_application.legal_name is not distinct from nullif(btrim(p_legal_name), '') then
      return current_application;
    end if;
    raise exception 'Submitted application cannot be changed.' using errcode = '55000';
  end if;

  if current_application.status not in ('DRAFT', 'NEEDS_CLARIFICATION') then
    raise exception 'Application cannot be submitted from its current state.' using errcode = '55000';
  end if;

  previous_status := current_application.status;
  update public.commercial_agent_applications set
    status = 'SUBMITTED',
    display_name = btrim(p_display_name),
    phone = nullif(btrim(p_phone), ''),
    email = nullif(lower(btrim(p_email)), ''),
    locality = nullif(btrim(p_locality), ''),
    profession = nullif(btrim(p_profession), ''),
    workplace = nullif(btrim(p_workplace), ''),
    agent_type = p_agent_type,
    legal_name = nullif(btrim(p_legal_name), ''),
    applicant_visible_note = null,
    submitted_at = now(),
    reviewed_at = null,
    reviewed_by = null,
    revision = revision + 1
  where id = current_application.id
  returning * into changed;

  insert into public.commercial_agent_application_events (
    application_id, actor_user_id, event_type, from_status, to_status, revision
  ) values (
    changed.id, p_applicant_user_id, 'APPLICATION_SUBMITTED', previous_status, changed.status, changed.revision
  );
  return changed;
end;
$$;

create or replace function public.withdraw_commercial_agent_application(
  p_applicant_user_id uuid
)
returns public.commercial_agent_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_application public.commercial_agent_applications;
  changed public.commercial_agent_applications;
begin
  select application.* into current_application
  from public.commercial_agent_applications application
  where application.applicant_user_id = p_applicant_user_id
  order by application.created_at desc, application.id desc
  limit 1
  for update;
  if current_application.id is null then
    raise exception 'Commercial Agent application was not found.' using errcode = 'P0002';
  end if;
  if current_application.status = 'WITHDRAWN' then
    return current_application;
  end if;
  if current_application.status not in ('DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION') then
    raise exception 'Application cannot be withdrawn from its current state.' using errcode = '55000';
  end if;

  update public.commercial_agent_applications set
    status = 'WITHDRAWN', revision = revision + 1
  where id = current_application.id
  returning * into changed;
  insert into public.commercial_agent_application_events (
    application_id, actor_user_id, event_type, from_status, to_status, revision
  ) values (
    changed.id, p_applicant_user_id, 'APPLICATION_WITHDRAWN', current_application.status, changed.status, changed.revision
  );
  return changed;
end;
$$;

create or replace function public.review_commercial_agent_application(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_safe_note text default null
)
returns public.commercial_agent_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_application public.commercial_agent_applications;
  changed public.commercial_agent_applications;
  provisioned public.commercial_agents;
  event_name text;
  target_status text;
begin
  if not exists (
    select 1 from public.user_profiles profile
    where profile.id = p_actor_user_id and profile.status = 'active'
  ) then
    raise exception 'Invalid Agent administrator.' using errcode = '42501';
  end if;
  if p_action not in ('REQUEST_CLARIFICATION', 'APPROVE', 'REJECT')
    or (
      p_action in ('REQUEST_CLARIFICATION', 'REJECT')
      and (
        p_safe_note is null
        or char_length(btrim(p_safe_note)) not between 2 and 1000
      )
    ) then
    raise exception 'Commercial Agent review input is invalid.' using errcode = '23514';
  end if;

  select application.* into current_application
  from public.commercial_agent_applications application
  where application.id = p_application_id
  for update;
  if current_application.id is null then
    raise exception 'Commercial Agent application was not found.' using errcode = 'P0002';
  end if;
  if current_application.applicant_user_id = p_actor_user_id then
    raise exception 'Applicants cannot review their own application.' using errcode = '42501';
  end if;
  if p_action = 'APPROVE' and current_application.status = 'APPROVED'
    and current_application.provisioned_agent_id is not null then
    return current_application;
  end if;
  if current_application.status <> 'SUBMITTED' then
    raise exception 'Only submitted applications can be reviewed.' using errcode = '55000';
  end if;

  if p_action = 'REQUEST_CLARIFICATION' then
    target_status := 'NEEDS_CLARIFICATION';
    event_name := 'CLARIFICATION_REQUESTED';
  elsif p_action = 'REJECT' then
    target_status := 'REJECTED';
    event_name := 'APPLICATION_REJECTED';
  else
    target_status := 'APPROVED';
    event_name := 'APPLICATION_APPROVED';
    select agent.* into provisioned
    from public.commercial_agents agent
    where agent.user_id = current_application.applicant_user_id
    limit 1;
    if provisioned.id is null then
      update public.user_profiles
      set status = 'active'
      where id = current_application.applicant_user_id
        and status in ('registered', 'pending_approval')
        and user_type = 'external';

      select * into provisioned from public.create_commercial_agent_record(
        p_actor_user_id,
        current_application.applicant_user_id,
        current_application.agent_type,
        current_application.display_name,
        current_application.legal_name,
        null,
        current_application.phone,
        current_application.email,
        current_application.locality,
        current_application.profession,
        current_application.workplace
      );
    end if;
  end if;

  update public.commercial_agent_applications set
    status = target_status,
    applicant_visible_note = case when p_action = 'APPROVE' then null else btrim(p_safe_note) end,
    reviewed_at = now(),
    reviewed_by = p_actor_user_id,
    provisioned_agent_id = case when p_action = 'APPROVE' then provisioned.id else null end,
    revision = revision + 1
  where id = current_application.id
  returning * into changed;

  insert into public.commercial_agent_application_events (
    application_id, actor_user_id, event_type, from_status, to_status, revision, safe_note
  ) values (
    changed.id, p_actor_user_id, event_name, current_application.status, changed.status,
    changed.revision, case when p_action = 'APPROVE' then null else btrim(p_safe_note) end
  );
  if p_action = 'APPROVE' then
    insert into public.commercial_agent_application_events (
      application_id, actor_user_id, event_type, from_status, to_status, revision
    ) values (
      changed.id, p_actor_user_id, 'AGENT_PROVISIONED', changed.status, changed.status, changed.revision
    );
  end if;
  return changed;
end;
$$;

alter table public.commercial_agent_applications validate constraint commercial_agent_applications_legal_entity_check;

alter table public.commercial_agent_applications enable row level security;
alter table public.commercial_agent_applications force row level security;
alter table public.commercial_agent_application_events enable row level security;
alter table public.commercial_agent_application_events force row level security;

create policy commercial_agent_applications_select_own
on public.commercial_agent_applications
for select
to authenticated
using ((select auth.uid()) = applicant_user_id);

create policy commercial_agent_application_events_select_own
on public.commercial_agent_application_events
for select
to authenticated
using (exists (
  select 1 from public.commercial_agent_applications application
  where application.id = commercial_agent_application_events.application_id
    and application.applicant_user_id = (select auth.uid())
));

revoke all on table public.commercial_agent_applications from public, anon, authenticated, service_role;
revoke all on table public.commercial_agent_application_events from public, anon, authenticated, service_role;
grant select on table public.commercial_agent_applications to authenticated;
grant select on table public.commercial_agent_application_events to authenticated;
grant select, insert, update on table public.commercial_agent_applications to service_role;
grant select, insert on table public.commercial_agent_application_events to service_role;

revoke all on function private.touch_commercial_agent_application_updated_at() from public, anon, authenticated, service_role;
revoke all on function private.prevent_commercial_agent_application_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.ensure_commercial_agent_application_draft(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.submit_commercial_agent_application(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.withdraw_commercial_agent_application(uuid) from public, anon, authenticated, service_role;
revoke all on function public.review_commercial_agent_application(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.ensure_commercial_agent_application_draft(uuid, text) to service_role;
grant execute on function public.submit_commercial_agent_application(uuid, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.withdraw_commercial_agent_application(uuid) to service_role;
grant execute on function public.review_commercial_agent_application(uuid, uuid, text, text) to service_role;

comment on table public.commercial_agent_applications is
  'Applicant-owned request to enter Commercial Agent review. It is not an operational Agent identity and grants no cabinet access.';
comment on table public.commercial_agent_application_events is
  'Append-only lifecycle evidence for Commercial Agent applications without applicant field snapshots.';
