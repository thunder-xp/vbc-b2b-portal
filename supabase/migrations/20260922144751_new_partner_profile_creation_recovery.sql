begin;

-- The canonical phone constraint introduced on 2026-09-21 called a private
-- normalizer whose EXECUTE privilege is intentionally unavailable to signed-in
-- users. PostgreSQL evaluates CHECK expressions with the caller's privileges,
-- so every self-service profile insert with a phone failed with SQLSTATE 42501.
-- Keep the private helper private and express the stored representation rule
-- directly in the constraint.
alter table public.user_profiles
  drop constraint if exists user_profiles_phone_canonical_moldova_e164,
  add constraint user_profiles_phone_canonical_moldova_e164
  check (phone is null or phone ~ '^\+373[0-9]{8}$')
  not valid;

create table if not exists public.profile_creation_events (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  safe_error_code text null,
  correlation_id uuid not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint profile_creation_events_event_type_check
    check (event_type in (
      'PROFILE_CREATE_SUCCEEDED',
      'PROFILE_CREATE_RECOVERED',
      'PROFILE_CREATE_FAILED'
    )),
  constraint profile_creation_events_safe_error_code_check
    check (safe_error_code is null or safe_error_code in (
      'PHONE_ALREADY_IN_USE',
      'ONBOARDING_STATE_CONFLICT',
      'INVALID_PHONE',
      'TEMPORARY_SERVER_ERROR'
    )),
  constraint profile_creation_events_safe_metadata_check
    check (jsonb_typeof(safe_metadata) = 'object'),
  constraint profile_creation_events_actor_correlation_key
    unique (auth_user_id, correlation_id)
);

comment on table public.profile_creation_events is
  'Append-only, PII-free diagnostic evidence for governed partner profile creation. Technical failure metadata is service/admin only.';

create index if not exists profile_creation_events_occurred_at_idx
  on public.profile_creation_events (occurred_at desc);
create index if not exists profile_creation_events_auth_user_id_idx
  on public.profile_creation_events (auth_user_id, occurred_at desc);

alter table public.profile_creation_events enable row level security;
revoke all on table public.profile_creation_events from public, anon, authenticated;

drop policy if exists "Users can create own initial external profile"
  on public.user_profiles;
revoke insert (id, email, full_name, phone, status, user_type)
  on table public.user_profiles
  from authenticated;

create or replace function public.create_own_user_profile_v1(
  p_full_name text,
  p_phone text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_correlation_id uuid := coalesce(p_correlation_id, gen_random_uuid());
  v_auth_email text;
  v_email_confirmed_at timestamptz;
  v_full_name text := nullif(btrim(p_full_name), '');
  v_phone text;
  v_profile public.user_profiles%rowtype;
  v_existing public.user_profiles%rowtype;
  v_recovered boolean := false;
  v_sqlstate text;
  v_constraint text;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTH_REQUIRED',
      'correlationId', v_correlation_id
    );
  end if;

  select lower(identity.email), identity.email_confirmed_at
  into v_auth_email, v_email_confirmed_at
  from auth.users identity
  where identity.id = v_user_id;

  if v_auth_email is null or v_email_confirmed_at is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTH_REQUIRED',
      'correlationId', v_correlation_id
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if p_phone is not null and btrim(p_phone) <> '' then
    v_phone := private.normalize_moldova_phone_e164_v1(p_phone);
    if v_phone is null then
      insert into public.profile_creation_events(
        auth_user_id, event_type, safe_error_code, correlation_id
      ) values (
        v_user_id, 'PROFILE_CREATE_FAILED', 'INVALID_PHONE', v_correlation_id
      ) on conflict (auth_user_id, correlation_id) do nothing;
      return jsonb_build_object(
        'ok', false,
        'code', 'INVALID_PHONE',
        'correlationId', v_correlation_id
      );
    end if;
  end if;

  if v_phone is not null and (
    exists (
      select 1
      from public.user_profiles profile
      where profile.id <> v_user_id
        and private.normalize_moldova_phone_e164_v1(profile.phone) = v_phone
        and profile.status not in ('revoked', 'rejected')
    )
    or exists (
      select 1
      from auth.users identity
      where identity.id <> v_user_id
        and (
          (
            private.normalize_moldova_phone_e164_v1(identity.phone) = v_phone
            and identity.phone_confirmed_at is not null
          )
          or private.normalize_moldova_phone_e164_v1(nullif(identity.phone_change, '')) = v_phone
        )
    )
  ) then
    insert into public.profile_creation_events(
      auth_user_id, event_type, safe_error_code, correlation_id
    ) values (
      v_user_id, 'PROFILE_CREATE_FAILED', 'PHONE_ALREADY_IN_USE', v_correlation_id
    ) on conflict (auth_user_id, correlation_id) do nothing;
    return jsonb_build_object(
      'ok', false,
      'code', 'PHONE_ALREADY_IN_USE',
      'correlationId', v_correlation_id
    );
  end if;

  select profile.* into v_existing
  from public.user_profiles profile
  where profile.id = v_user_id
  for update;

  if found then
    if lower(v_existing.email) <> v_auth_email
      or v_existing.status in ('suspended', 'revoked', 'rejected')
      or v_existing.user_type not in ('external', 'partner')
      or (
        v_existing.phone is not null
        and v_phone is not null
        and private.normalize_moldova_phone_e164_v1(v_existing.phone) is distinct from v_phone
      )
    then
      insert into public.profile_creation_events(
        auth_user_id, event_type, safe_error_code, correlation_id
      ) values (
        v_user_id, 'PROFILE_CREATE_FAILED', 'ONBOARDING_STATE_CONFLICT', v_correlation_id
      ) on conflict (auth_user_id, correlation_id) do nothing;
      return jsonb_build_object(
        'ok', false,
        'code', 'ONBOARDING_STATE_CONFLICT',
        'correlationId', v_correlation_id
      );
    end if;

    v_recovered := (v_existing.full_name is null and v_full_name is not null)
      or (v_existing.phone is null and v_phone is not null)
      or (
        v_existing.phone is not null
        and v_phone is not null
        and v_existing.phone <> v_phone
        and private.normalize_moldova_phone_e164_v1(v_existing.phone) = v_phone
      );

    if v_recovered then
      update public.user_profiles profile
      set full_name = coalesce(profile.full_name, v_full_name),
          phone = case
            when profile.phone is null then v_phone
            when v_phone is not null
              and private.normalize_moldova_phone_e164_v1(profile.phone) = v_phone
              then v_phone
            else profile.phone
          end
      where profile.id = v_user_id
      returning * into v_profile;
    else
      v_profile := v_existing;
    end if;

    insert into public.profile_creation_events(
      auth_user_id, event_type, correlation_id,
      safe_metadata
    ) values (
      v_user_id,
      case when v_recovered then 'PROFILE_CREATE_RECOVERED' else 'PROFILE_CREATE_SUCCEEDED' end,
      v_correlation_id,
      jsonb_build_object('outcome', case when v_recovered then 'RECOVERED' else 'PROFILE_ALREADY_EXISTS' end)
    ) on conflict (auth_user_id, correlation_id) do nothing;

    return jsonb_build_object(
      'ok', true,
      'code', case when v_recovered then 'RECOVERED' else 'PROFILE_ALREADY_EXISTS' end,
      'correlationId', v_correlation_id,
      'profile', to_jsonb(v_profile)
    );
  end if;

  begin
    insert into public.user_profiles(
      id, email, full_name, phone, status, user_type
    ) values (
      v_user_id, v_auth_email, v_full_name, v_phone, 'registered', 'external'
    )
    returning * into v_profile;
  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_constraint = constraint_name;

    insert into public.profile_creation_events(
      auth_user_id, event_type, safe_error_code, correlation_id, safe_metadata
    ) values (
      v_user_id,
      'PROFILE_CREATE_FAILED',
      'TEMPORARY_SERVER_ERROR',
      v_correlation_id,
      jsonb_strip_nulls(jsonb_build_object(
        'sqlState', v_sqlstate,
        'constraint', nullif(v_constraint, '')
      ))
    ) on conflict (auth_user_id, correlation_id) do nothing;

    return jsonb_build_object(
      'ok', false,
      'code', 'TEMPORARY_SERVER_ERROR',
      'correlationId', v_correlation_id
    );
  end;

  insert into public.profile_creation_events(
    auth_user_id, event_type, correlation_id, safe_metadata
  ) values (
    v_user_id,
    'PROFILE_CREATE_SUCCEEDED',
    v_correlation_id,
    jsonb_build_object('outcome', 'CREATED')
  ) on conflict (auth_user_id, correlation_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'code', 'CREATED',
    'correlationId', v_correlation_id,
    'profile', to_jsonb(v_profile)
  );
end;
$$;

revoke all on function public.create_own_user_profile_v1(text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_own_user_profile_v1(text, text, uuid)
  to authenticated;

comment on function public.create_own_user_profile_v1(text, text, uuid) is
  'Creates or safely recovers the confirmed caller profile atomically. It resolves identity server-side, serializes retries, rejects phone ownership conflicts, and emits PII-free diagnostics.';

commit;
