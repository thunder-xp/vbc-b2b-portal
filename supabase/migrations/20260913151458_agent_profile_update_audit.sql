-- Audit the bounded self-edit operation without recording personal field values.
alter table public.agent_domain_events drop constraint agent_domain_events_type_check;
alter table public.agent_domain_events add constraint agent_domain_events_type_check check (event_type in (
  'AGENT_CREATED', 'AGENT_STATUS_CHANGED', 'AGENT_PROFILE_UPDATED', 'COMPLIANCE_DECIDED',
  'TOKEN_CREATED', 'TOKEN_REVOKED', 'REFERRAL_CAPTURED', 'REFERRAL_STATUS_CHANGED',
  'ATTRIBUTION_CREATED', 'ATTRIBUTION_EXTENDED', 'ATTRIBUTION_CONFLICT',
  'ATTRIBUTION_REASSIGNED', 'ATTRIBUTION_TERMINATED'
));

create or replace function public.update_agent_cabinet_profile(
  p_phone text, p_email text, p_locality text, p_profession text, p_workplace text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.commercial_agents;
  changed public.commercial_agents;
  changed_fields text[] := array[]::text[];
begin
  select * into previous from public.commercial_agents
  where user_id = auth.uid() and status not in ('TERMINATED', 'REJECTED') for update;
  if previous.id is null then raise exception 'AGENT_PROFILE_ACCESS_DENIED' using errcode = '42501'; end if;

  update public.commercial_agents set
    phone = nullif(btrim(p_phone), ''), email = nullif(lower(btrim(p_email)), ''),
    locality = nullif(btrim(p_locality), ''), profession = nullif(btrim(p_profession), ''),
    workplace = nullif(btrim(p_workplace), '')
  where id = previous.id returning * into changed;

  if previous.phone is distinct from changed.phone then changed_fields := array_append(changed_fields, 'phone'); end if;
  if previous.email is distinct from changed.email then changed_fields := array_append(changed_fields, 'email'); end if;
  if previous.locality is distinct from changed.locality then changed_fields := array_append(changed_fields, 'locality'); end if;
  if previous.profession is distinct from changed.profession then changed_fields := array_append(changed_fields, 'profession'); end if;
  if previous.workplace is distinct from changed.workplace then changed_fields := array_append(changed_fields, 'workplace'); end if;

  if cardinality(changed_fields) > 0 then
    insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
    values (changed.id, auth.uid(), 'AGENT_PROFILE_UPDATED', jsonb_build_object('fields', changed_fields));
  end if;
  return public.get_agent_cabinet_context();
end;
$$;

revoke all on function public.update_agent_cabinet_profile(text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.update_agent_cabinet_profile(text, text, text, text, text) to authenticated;
