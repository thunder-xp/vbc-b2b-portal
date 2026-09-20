drop function if exists public.ensure_commercial_agent_application_draft(uuid, text);

alter table public.commercial_agent_applications
  drop constraint commercial_agent_applications_legal_entity_check;

alter table public.commercial_agent_applications
  add constraint commercial_agent_applications_legal_entity_check
  check (
    status in ('DRAFT', 'WITHDRAWN')
    or agent_type <> 'LEGAL_ENTITY'
    or legal_name is not null
  ) not valid;

alter table public.commercial_agent_applications
  validate constraint commercial_agent_applications_legal_entity_check;

create function public.ensure_commercial_agent_application_draft(
  p_applicant_user_id uuid,
  p_email text default null,
  p_registration_legal_form text default null,
  p_preferred_locale text default null
)
returns public.commercial_agent_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.commercial_agent_applications;
  created public.commercial_agent_applications;
  identity_email text;
  resolved_agent_type text;
  resolved_locale text;
begin
  select lower(identity.email) into identity_email
  from auth.users identity
  where identity.id = p_applicant_user_id
    and identity.email is not null;

  if identity_email is null then
    raise exception 'Applicant Auth identity is missing.' using errcode = '42501';
  end if;

  resolved_agent_type := case
    when p_registration_legal_form = 'LEGAL_ENTITY' then 'LEGAL_ENTITY'
    else 'INDIVIDUAL'
  end;
  resolved_locale := case when p_preferred_locale in ('ru', 'ro') then p_preferred_locale else null end;

  insert into public.user_profiles (id, email, status, user_type, preferred_locale)
  values (p_applicant_user_id, identity_email, 'registered', 'external', resolved_locale)
  on conflict (id) do update
    set preferred_locale = excluded.preferred_locale
    where public.user_profiles.preferred_locale is null
      and excluded.preferred_locale is not null;

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
    if existing.status = 'DRAFT'
      and existing.revision = 1
      and existing.display_name is null
      and existing.agent_type is distinct from resolved_agent_type then
      update public.commercial_agent_applications
      set agent_type = resolved_agent_type
      where id = existing.id
      returning * into existing;
    end if;
    return existing;
  end if;

  insert into public.commercial_agent_applications (applicant_user_id, email, agent_type)
  values (p_applicant_user_id, identity_email, resolved_agent_type)
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

revoke all on function public.ensure_commercial_agent_application_draft(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.ensure_commercial_agent_application_draft(uuid, text, text, text)
  to service_role;

alter table public.commercial_agent_applications
  add constraint commercial_agent_applications_submitted_phone_check
  check (
    status in ('DRAFT', 'WITHDRAWN')
    or (phone is not null and char_length(btrim(phone)) between 8 and 32)
  ) not valid;

alter table public.commercial_agent_applications
  validate constraint commercial_agent_applications_submitted_phone_check;

comment on function public.ensure_commercial_agent_application_draft(uuid, text, text, text) is
  'Creates one authenticated Commercial Agent application draft, using Auth metadata only as legal-form/locale prefill hints.';
