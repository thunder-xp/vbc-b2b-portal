begin;

-- One source policy for the current business identity. Contact intent is never
-- proof of Auth phone verification. Service callers derive the identity from getUser().
create or replace function public.resolve_business_profile_phone_v1(p_auth_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_profile_phone text;
  v_agent_phone text;
  v_agent_count integer;
  v_partner boolean;
begin
  if p_auth_user_id is null or not private.has_active_business_access_v1(p_auth_user_id) then
    return jsonb_build_object('source', 'NONE', 'phoneE164', null);
  end if;

  select private.normalize_moldova_phone_e164_v1(profile.phone)
    into v_profile_phone from public.user_profiles profile
    where profile.id = p_auth_user_id and profile.status = 'active';
  select count(*), min(private.normalize_moldova_phone_e164_v1(agent.phone))
    into v_agent_count, v_agent_phone from public.commercial_agents agent
    where agent.user_id = p_auth_user_id and agent.status = 'ACTIVE';
  select exists (
    select 1 from public.company_memberships membership
    join public.partner_companies company on company.id = membership.company_id
    join public.user_profiles profile on profile.id = membership.user_id
    where membership.user_id = p_auth_user_id and membership.status = 'active'
      and company.status = 'active' and profile.status = 'active'
  ) into v_partner;

  if v_agent_count > 1 then
    return jsonb_build_object('source', 'CONFLICT', 'phoneE164', null);
  end if;
  -- For Agent-only users user_profiles.phone is the verified projection, not a
  -- competing Partner contact intent. It must not hide a subsequent Agent edit.
  if v_agent_count = 1 and not v_partner then
    return jsonb_build_object('source', case when v_agent_phone is null then 'NONE' else 'COMMERCIAL_AGENT' end,
      'phoneE164', v_agent_phone);
  end if;
  if v_agent_phone is not null and v_profile_phone is not null then
    if v_agent_phone <> v_profile_phone then
      return jsonb_build_object('source', 'CONFLICT', 'phoneE164', null);
    end if;
    return jsonb_build_object('source', 'MATCHING_MULTI_CONTEXT', 'phoneE164', v_agent_phone);
  end if;
  return jsonb_build_object('source', case
      when v_agent_phone is not null then 'COMMERCIAL_AGENT'
      when v_profile_phone is not null then 'USER_PROFILE'
      else 'NONE' end,
    'phoneE164', coalesce(v_agent_phone, v_profile_phone));
end;
$$;

create or replace function public.has_business_profile_phone_operational_conflict_v3(
  p_auth_user_id uuid, p_phone_e164 text
)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare v_resolution jsonb;
begin
  if p_phone_e164 is null or p_phone_e164 !~ '^\+373[0-9]{8}$' then
    raise exception 'business_profile_phone_state_invalid_input' using errcode = '22023';
  end if;
  v_resolution := public.resolve_business_profile_phone_v1(p_auth_user_id);
  if v_resolution->>'source' = 'CONFLICT' then return true; end if;
  if not coalesce(v_resolution->>'phoneE164' = p_phone_e164, false) then
    raise exception 'business_profile_phone_state_not_eligible' using errcode = '42501';
  end if;
  return exists (
    select 1 from auth.users candidate
    where candidate.id <> p_auth_user_id
      and ((private.normalize_moldova_phone_e164_v1(candidate.phone) = p_phone_e164
        and candidate.phone_confirmed_at is not null)
        or private.normalize_moldova_phone_e164_v1(nullif(candidate.phone_change, '')) = p_phone_e164)
      and not private.is_non_operational_phone_orphan_v1(candidate.id, p_phone_e164)
  );
end;
$$;

-- Reuse the governed phone-change state machine, adding the same source gate
-- at preparation, send reservation and completion (including mid-flow edits).
create or replace function public.prepare_business_phone_enrollment_v3(
  p_auth_user_id uuid, p_phone_e164 text, p_phone_key_hash text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_resolution jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 20260925));
  v_resolution := public.resolve_business_profile_phone_v1(p_auth_user_id);
  if v_resolution->>'source' = 'CONFLICT' then
    return jsonb_build_object('result', 'CONFLICT');
  end if;
  if not coalesce(v_resolution->>'phoneE164' = p_phone_e164, false) then
    raise exception 'business_phone_enrollment_not_eligible' using errcode = '42501';
  end if;
  return public.prepare_business_phone_enrollment_v2(p_auth_user_id, p_phone_e164, p_phone_key_hash);
end;
$$;

create or replace function public.reserve_business_phone_enrollment_send_v4(
  p_challenge_id uuid, p_auth_user_id uuid, p_phone_e164 text, p_phone_key_hash text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_resolution jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 20260925));
  v_resolution := public.resolve_business_profile_phone_v1(p_auth_user_id);
  if not coalesce(v_resolution->>'phoneE164' = p_phone_e164, false) then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 0, 'reason', 'TARGET_MISMATCH');
  end if;
  return public.reserve_business_phone_enrollment_send_v3(p_challenge_id, p_auth_user_id, p_phone_e164, p_phone_key_hash);
end;
$$;

create or replace function public.complete_business_phone_enrollment_v3(
  p_challenge_id uuid, p_auth_user_id uuid, p_phone_e164 text, p_phone_key_hash text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_resolution jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 20260925));
  v_resolution := public.resolve_business_profile_phone_v1(p_auth_user_id);
  if not coalesce(v_resolution->>'phoneE164' = p_phone_e164, false) then return false; end if;
  return public.complete_business_phone_enrollment_v2(p_challenge_id, p_auth_user_id, p_phone_e164, p_phone_key_hash);
end;
$$;

revoke all on function public.resolve_business_profile_phone_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.has_business_profile_phone_operational_conflict_v3(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.prepare_business_phone_enrollment_v3(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.reserve_business_phone_enrollment_send_v4(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.complete_business_phone_enrollment_v3(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.resolve_business_profile_phone_v1(uuid) to service_role;
grant execute on function public.has_business_profile_phone_operational_conflict_v3(uuid, text) to service_role;
grant execute on function public.prepare_business_phone_enrollment_v3(uuid, text, text) to service_role;
grant execute on function public.reserve_business_phone_enrollment_send_v4(uuid, uuid, text, text) to service_role;
grant execute on function public.complete_business_phone_enrollment_v3(uuid, uuid, text, text) to service_role;

commit;
