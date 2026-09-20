create or replace function public.ensure_commercial_agent_application_draft(
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
  profile_name text;
  profile_phone text;
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

  select nullif(btrim(profile.full_name), ''), nullif(btrim(profile.phone), '')
  into profile_name, profile_phone
  from public.user_profiles profile
  where profile.id = p_applicant_user_id
    and profile.status not in ('suspended', 'revoked', 'rejected');

  if not found then
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
    if existing.status = 'DRAFT' then
      update public.commercial_agent_applications
      set
        display_name = coalesce(nullif(btrim(existing.display_name), ''), profile_name),
        phone = coalesce(nullif(btrim(existing.phone), ''), profile_phone),
        agent_type = case
          when existing.revision = 1
            and nullif(btrim(existing.display_name), '') is null
            then resolved_agent_type
          else existing.agent_type
        end
      where id = existing.id
        and (
          (nullif(btrim(existing.display_name), '') is null and profile_name is not null)
          or (nullif(btrim(existing.phone), '') is null and profile_phone is not null)
          or (
            existing.revision = 1
            and nullif(btrim(existing.display_name), '') is null
            and existing.agent_type is distinct from resolved_agent_type
          )
        )
      returning * into existing;
    end if;
    return existing;
  end if;

  insert into public.commercial_agent_applications (
    applicant_user_id,
    email,
    agent_type,
    display_name,
    phone
  )
  values (
    p_applicant_user_id,
    identity_email,
    resolved_agent_type,
    profile_name,
    profile_phone
  )
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

comment on function public.ensure_commercial_agent_application_draft(uuid, text, text, text) is
  'Creates one authenticated Commercial Agent application draft and prefills missing display name/phone from the governed user profile.';
