create or replace function public.resolve_governed_business_auth_sms_v1(
  p_auth_user_id uuid,
  p_phone_key_hash text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_auth_user_id is null
      or p_phone_key_hash is null
      or p_phone_key_hash !~ '^[0-9a-f]{64}$'
      then null
    when exists (
      select 1
      from public.business_phone_enrollment_challenges challenge
      where challenge.auth_user_id = p_auth_user_id
        and challenge.phone_key_hash = p_phone_key_hash
        and challenge.status = 'OTP_SENT'
        and challenge.expires_at > now()
    ) then 'BUSINESS_PHONE_ENROLLMENT'
    when exists (
      select 1
      from public.quick_auth_challenges challenge
      where challenge.subject_auth_user_id = p_auth_user_id
        and challenge.phone_key_hash = p_phone_key_hash
        and challenge.status = 'OTP_SENT'
        and challenge.expires_at > now()
        and (
          exists (
            select 1
            from public.user_profiles profile
            join public.company_memberships membership
              on membership.user_id = profile.id
            join public.partner_companies company
              on company.id = membership.company_id
            where profile.id = p_auth_user_id
              and profile.status = 'active'
              and membership.status = 'active'
              and company.status = 'active'
          )
          or exists (
            select 1
            from public.commercial_agents agent
            where agent.user_id = p_auth_user_id
              and agent.status = 'ACTIVE'
          )
        )
    ) then 'BUSINESS_QUICK_AUTH'
    else null
  end;
$$;

revoke all on function public.resolve_governed_business_auth_sms_v1(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_governed_business_auth_sms_v1(uuid, text)
  to service_role;

comment on function public.resolve_governed_business_auth_sms_v1(uuid, text) is
  'Authorizes a signed Supabase Auth SMS only when an unexpired server-owned OTP_SENT Business enrollment or eligible Business Quick Auth challenge matches the Auth user and keyed phone proof. Service-role only; no raw phone or OTP input.';
