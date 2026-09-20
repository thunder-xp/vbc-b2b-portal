create or replace function public.has_business_profile_phone_operational_conflict_v2(
  p_auth_user_id uuid,
  p_phone_e164 text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_auth_user_id is null
    or p_phone_e164 is null
    or p_phone_e164 !~ '^\+373[0-9]{8}$' then
    raise exception 'business_profile_phone_state_invalid_input' using errcode = '22023';
  end if;

  if not private.has_active_business_access_v1(p_auth_user_id)
    or not exists (
      select 1
      from public.user_profiles profile
      where profile.id = p_auth_user_id
        and profile.status = 'active'
        and private.normalize_moldova_phone_e164_v1(profile.phone) = p_phone_e164
    ) then
    raise exception 'business_profile_phone_state_not_eligible' using errcode = '42501';
  end if;

  return exists (
    select 1
    from auth.users candidate
    where candidate.id <> p_auth_user_id
      and (
        (
          private.normalize_moldova_phone_e164_v1(candidate.phone) = p_phone_e164
          and candidate.phone_confirmed_at is not null
        )
        or private.normalize_moldova_phone_e164_v1(nullif(candidate.phone_change, '')) = p_phone_e164
      )
      and not private.is_non_operational_phone_orphan_v1(candidate.id, p_phone_e164)
  );
end;
$$;

revoke all on function public.has_business_profile_phone_operational_conflict_v2(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_business_profile_phone_operational_conflict_v2(uuid, text)
  to service_role;

comment on function public.has_business_profile_phone_operational_conflict_v2(uuid, text) is
  'Returns only whether the current active Business profile phone conflicts with another operational Auth identity. Service-role only; no other-user identity data is exposed.';
