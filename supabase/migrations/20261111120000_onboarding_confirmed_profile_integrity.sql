begin;

-- Operational recovery is deliberately narrower than normal onboarding: an
-- authorized reviewer can restore a confirmed installer identity to the
-- ordinary review queue, but cannot create a company, membership, commercial
-- mapping, or approval through this boundary.
create or replace function public.recover_confirmed_installer_onboarding_v1(
  p_auth_user_id uuid,
  p_requested_company_name text,
  p_requested_fiscal_code text,
  p_counterparty_external_1c_id text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correlation_id uuid := coalesce(p_correlation_id, gen_random_uuid());
  v_auth_email text;
  v_email_confirmed_at timestamptz;
  v_registration_intent text;
  v_profile public.user_profiles%rowtype;
  v_request public.access_requests%rowtype;
  v_normalized_fiscal text;
  v_counterparty_count integer;
  v_request_count integer;
begin
  if not public.has_internal_permission('onboarding.requests.review') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_auth_user_id is null then
    raise exception 'auth_user_required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 0));

  select lower(identity.email), identity.email_confirmed_at,
         identity.raw_user_meta_data ->> 'registration_intent'
    into v_auth_email, v_email_confirmed_at, v_registration_intent
  from auth.users identity
  where identity.id = p_auth_user_id;

  if v_auth_email is null or v_email_confirmed_at is null then
    raise exception 'confirmed_auth_user_required' using errcode = '22023';
  end if;
  if v_registration_intent is distinct from 'installer' then
    raise exception 'installer_intent_required' using errcode = '22023';
  end if;

  v_normalized_fiscal := public.normalize_moldova_fiscal_code(p_requested_fiscal_code);
  if v_normalized_fiscal is null
    or nullif(btrim(p_requested_company_name), '') is null
    or nullif(btrim(p_counterparty_external_1c_id), '') is null
  then
    raise exception 'counterparty_identity_required' using errcode = '22023';
  end if;

  select count(*)
    into v_counterparty_count
  from public.one_c_counterparties counterparty
  where counterparty.is_published
    and counterparty.is_active
    and not counterparty.is_deleted
    and counterparty.normalized_fiscal_code = v_normalized_fiscal
    and lower(counterparty.external_1c_id) = lower(btrim(p_counterparty_external_1c_id));

  if v_counterparty_count <> 1 then
    raise exception 'counterparty_identity_conflict' using errcode = '23505';
  end if;

  select profile.* into v_profile
  from public.user_profiles profile
  where profile.id = p_auth_user_id
  for update;

  if found then
    if lower(v_profile.email) <> v_auth_email
      or v_profile.status in ('suspended', 'revoked', 'rejected')
      or v_profile.user_type not in ('external', 'partner')
    then
      raise exception 'onboarding_state_conflict' using errcode = '55000';
    end if;
  else
    insert into public.user_profiles(id, email, status, user_type)
    values (p_auth_user_id, v_auth_email, 'registered', 'external')
    returning * into v_profile;

    insert into public.profile_creation_events(
      auth_user_id, event_type, correlation_id, safe_metadata
    ) values (
      p_auth_user_id,
      'PROFILE_CREATE_RECOVERED',
      v_correlation_id,
      jsonb_build_object('outcome', 'RECOVERED_BY_ONBOARDING_REVIEW')
    ) on conflict (auth_user_id, correlation_id) do nothing;
  end if;

  if exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = p_auth_user_id
      and membership.status = 'active'
  ) then
    raise exception 'active_membership_already_exists' using errcode = '55000';
  end if;

  select count(*) into v_request_count
  from public.access_requests request
  where request.user_profile_id = p_auth_user_id;

  if v_request_count > 1 then
    raise exception 'multiple_access_requests_require_review' using errcode = '55000';
  end if;

  select request.* into v_request
  from public.access_requests request
  where request.user_profile_id = p_auth_user_id
  order by request.created_at desc, request.id desc
  limit 1;

  if found and (
    public.normalize_moldova_fiscal_code(v_request.requested_fiscal_code) is distinct from v_normalized_fiscal
    or v_request.requested_external_1c_id is not null
      and lower(v_request.requested_external_1c_id) <> lower(btrim(p_counterparty_external_1c_id))
  ) then
    raise exception 'existing_access_request_identity_conflict' using errcode = '55000';
  elsif not found then
    insert into public.access_requests(
      user_profile_id,
      requested_company_name,
      requested_fiscal_code,
      status,
      onboarding_status
    ) values (
      p_auth_user_id,
      btrim(p_requested_company_name),
      v_normalized_fiscal,
      'pending_review',
      'received'
    ) returning * into v_request;
  end if;

  return jsonb_build_object(
    'ok', true,
    'profileId', v_profile.id,
    'requestId', v_request.id,
    'requestStatus', v_request.status,
    'onboardingStatus', v_request.onboarding_status,
    'correlationId', v_correlation_id
  );
end;
$$;

revoke all on function public.recover_confirmed_installer_onboarding_v1(uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.recover_confirmed_installer_onboarding_v1(uuid, text, text, text, uuid)
  to authenticated;

comment on function public.recover_confirmed_installer_onboarding_v1(uuid, text, text, text, uuid) is
  'Permission-gated, idempotent recovery of a confirmed installer Auth orphan into the ordinary onboarding review queue. It never creates a company, membership, match, or approval.';

create or replace function public.get_onboarding_health()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when not public.has_internal_permission('onboarding.requests.view') then
      jsonb_build_object('allowed', false)
    else jsonb_build_object(
      'allowed', true,
      'directory', (
        select to_jsonb(sync)
        from public.one_c_counterparty_directory_syncs sync
        order by sync.started_at desc limit 1
      ),
      'queue', jsonb_build_object(
        'new', count(*) filter (where onboarding_status = 'received'),
        'unassigned', count(*) filter (
          where assigned_manager_user_id is null
            and onboarding_status not in ('approved', 'rejected', 'cancelled')
        ),
        'overdue', count(*) filter (
          where onboarding_status not in ('approved', 'rejected', 'cancelled', 'clarification_requested')
            and now() > public.onboarding_add_working_hours(created_at, 4)
        ),
        'matchConflicts', count(*) filter (where onboarding_status = 'link_confirmation_required'),
        'awaitingOneCCompany', count(*) filter (where onboarding_status = 'awaiting_1c_company')
      ),
      'integrity', jsonb_build_object(
        'confirmedAuthWithoutProfile', (
          select count(*)
          from auth.users identity
          left join public.user_profiles profile on profile.id = identity.id
          where coalesce(identity.email_confirmed_at, identity.phone_confirmed_at) is not null
            and profile.id is null
        )
      )
    )
  end
  from public.access_requests;
$$;

revoke all on function public.get_onboarding_health() from public, anon;
grant execute on function public.get_onboarding_health() to authenticated;

commit;
