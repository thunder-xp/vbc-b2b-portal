begin;

insert into public.permissions(code, description)
values (
  'onboarding.failed_registration.purge',
  'Permanently reset an eligible failed onboarding registration.'
)
on conflict (code) do update
set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission
  on permission.code = 'onboarding.failed_registration.purge'
where role.code = 'novotech_admin'
  and role.scope = 'internal'
on conflict do nothing;

create schema if not exists private;

create table private.failed_registration_purge_receipts (
  id uuid primary key,
  target_user_id uuid not null,
  target_request_id uuid not null,
  normalized_email_hash text not null
    check (normalized_email_hash ~ '^[0-9a-f]{64}$'),
  application_name_hash text not null
    check (application_name_hash ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid not null,
  status text not null check (
    status in ('purging', 'local_purged', 'auth_delete_failed', 'completed')
  ),
  deleted_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(deleted_counts) = 'object'),
  safe_error_code text null
    check (safe_error_code is null or safe_error_code ~ '^[A-Z0-9_]{1,80}$'),
  created_at timestamptz not null default now(),
  local_purged_at timestamptz null,
  auth_deleted_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (target_user_id, target_request_id)
);

alter table private.failed_registration_purge_receipts enable row level security;
revoke all on table private.failed_registration_purge_receipts
  from public, anon, authenticated, service_role;

comment on table private.failed_registration_purge_receipts is
  'Minimal non-PII recovery receipts for governed failed-registration purges. Raw email and application names are never retained.';

create or replace function private.failed_registration_purge_text_hash(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(lower(btrim(p_value)), 'sha256'), 'hex');
$$;

revoke all on function private.failed_registration_purge_text_hash(text)
  from public, anon, authenticated, service_role;

create or replace function private.failed_registration_purge_exact_text_hash(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(btrim(p_value), 'sha256'), 'hex');
$$;

revoke all on function private.failed_registration_purge_exact_text_hash(text)
  from public, anon, authenticated, service_role;

create or replace function private.failed_registration_purge_context_matches(
  p_user_id uuid,
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from private.failed_registration_purge_receipts receipt
    where receipt.id::text = current_setting(
      'app.failed_registration_purge_receipt_id',
      true
    )
      and receipt.target_user_id = p_user_id
      and receipt.target_request_id = p_request_id
      and receipt.status = 'purging'
  );
$$;

revoke all on function private.failed_registration_purge_context_matches(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.failed_registration_purge_reference_blockers(
  p_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  dependency record;
  referenced_rows bigint;
  revision_ids uuid[];
  blockers jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(revision.id), array[]::uuid[])
  into revision_ids
  from public.onboarding_application_revisions revision
  where revision.access_request_id = p_request_id;

  for dependency in
    select namespace.nspname as schema_name,
      relation.relname as table_name,
      attribute.attname as column_name
    from pg_catalog.pg_constraint constraint_record
    join pg_catalog.pg_class relation
      on relation.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    join unnest(constraint_record.conkey) with ordinality key_column(attnum, ordinal)
      on true
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_record.conrelid
      and attribute.attnum = key_column.attnum
    where constraint_record.contype = 'f'
      and constraint_record.confrelid in (
        'public.user_profiles'::regclass,
        'auth.users'::regclass
      )
      and pg_catalog.array_length(constraint_record.conkey, 1) = 1
  loop
    if dependency.schema_name = 'auth'
      or (dependency.schema_name = 'public'
        and dependency.table_name = 'user_profiles'
        and dependency.column_name = 'id')
      or (dependency.schema_name = 'public'
        and dependency.table_name = 'access_requests'
        and dependency.column_name = 'user_profile_id')
      or (dependency.schema_name = 'public'
        and dependency.table_name = 'onboarding_application_revisions'
        and dependency.column_name = 'submitted_by')
      or (dependency.schema_name = 'public'
        and dependency.table_name = 'onboarding_events'
        and dependency.column_name = 'actor_user_id')
      or (dependency.schema_name = 'public'
        and dependency.table_name = 'company_memberships'
        and dependency.column_name = 'user_id')
      or (dependency.schema_name = 'public'
        and dependency.table_name = 'partner_notification_preferences'
        and dependency.column_name = 'user_id')
      or (dependency.schema_name = 'public'
        and dependency.table_name = 'user_company_context_preferences'
        and dependency.column_name = 'user_id') then
      continue;
    end if;

    execute format(
      'select count(*) from %I.%I where %I = $1',
      dependency.schema_name,
      dependency.table_name,
      dependency.column_name
    )
    into referenced_rows
    using p_user_id;

    if referenced_rows > 0 then
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'PROTECTED_USER_REFERENCE',
        'relation', dependency.schema_name || '.' || dependency.table_name,
        'column', dependency.column_name,
        'count', referenced_rows
      ));
    end if;
  end loop;

  for dependency in
    select namespace.nspname as schema_name,
      relation.relname as table_name,
      attribute.attname as column_name
    from pg_catalog.pg_constraint constraint_record
    join pg_catalog.pg_class relation
      on relation.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    join unnest(constraint_record.conkey) with ordinality key_column(attnum, ordinal)
      on true
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_record.conrelid
      and attribute.attnum = key_column.attnum
    where constraint_record.contype = 'f'
      and constraint_record.confrelid = 'public.access_requests'::regclass
      and pg_catalog.array_length(constraint_record.conkey, 1) = 1
  loop
    if dependency.schema_name = 'public'
      and dependency.table_name in (
        'onboarding_application_revisions',
        'onboarding_events',
        'onboarding_approval_drafts',
        'onboarding_approval_attempts',
        'onboarding_notification_outbox'
      ) then
      continue;
    end if;

    execute format(
      'select count(*) from %I.%I where %I = $1',
      dependency.schema_name,
      dependency.table_name,
      dependency.column_name
    )
    into referenced_rows
    using p_request_id;

    if referenced_rows > 0 then
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'PROTECTED_REQUEST_REFERENCE',
        'relation', dependency.schema_name || '.' || dependency.table_name,
        'column', dependency.column_name,
        'count', referenced_rows
      ));
    end if;
  end loop;

  if pg_catalog.array_length(revision_ids, 1) is not null then
    for dependency in
      select namespace.nspname as schema_name,
        relation.relname as table_name,
        attribute.attname as column_name
      from pg_catalog.pg_constraint constraint_record
      join pg_catalog.pg_class relation
        on relation.oid = constraint_record.conrelid
      join pg_catalog.pg_namespace namespace
        on namespace.oid = relation.relnamespace
      join unnest(constraint_record.conkey) with ordinality key_column(attnum, ordinal)
        on true
      join pg_catalog.pg_attribute attribute
        on attribute.attrelid = constraint_record.conrelid
        and attribute.attnum = key_column.attnum
      where constraint_record.contype = 'f'
        and constraint_record.confrelid = 'public.onboarding_application_revisions'::regclass
        and pg_catalog.array_length(constraint_record.conkey, 1) = 1
    loop
      if dependency.schema_name = 'public'
        and dependency.table_name in (
          'access_requests',
          'onboarding_approval_drafts',
          'onboarding_approval_attempts'
        ) then
        continue;
      end if;

      execute format(
        'select count(*) from %I.%I where %I = any($1)',
        dependency.schema_name,
        dependency.table_name,
        dependency.column_name
      )
      into referenced_rows
      using revision_ids;

      if referenced_rows > 0 then
        blockers := blockers || jsonb_build_array(jsonb_build_object(
          'code', 'PROTECTED_REVISION_REFERENCE',
          'relation', dependency.schema_name || '.' || dependency.table_name,
          'column', dependency.column_name,
          'count', referenced_rows
        ));
      end if;
    end loop;
  end if;

  return blockers;
end;
$$;

revoke all on function private.failed_registration_purge_reference_blockers(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_failed_registration_purge_readiness(
  p_request_id uuid,
  p_user_id uuid default null,
  p_email text default null,
  p_application_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_request public.access_requests%rowtype;
  target_profile public.user_profiles%rowtype;
  target_receipt private.failed_registration_purge_receipts%rowtype;
  target_auth_email text;
  application_name text;
  blockers jsonb := '[]'::jsonb;
  reference_blockers jsonb := '[]'::jsonb;
  counts jsonb;
  request_count bigint := 0;
  storage_count bigint := 0;
begin
  select request.*
  into target_request
  from public.access_requests request
  where request.id = p_request_id;

  if target_request.id is null then
    if p_user_id is not null and p_email is not null and p_application_name is not null then
      select receipt.*
      into target_receipt
      from private.failed_registration_purge_receipts receipt
      where receipt.target_user_id = p_user_id
        and receipt.target_request_id = p_request_id
        and receipt.normalized_email_hash =
          private.failed_registration_purge_text_hash(p_email)
        and receipt.application_name_hash =
          private.failed_registration_purge_exact_text_hash(p_application_name);
    end if;

    if target_receipt.id is null then
      return jsonb_build_object(
        'eligible', false,
        'state', 'not_found',
        'requestId', p_request_id,
        'userId', p_user_id,
        'email', null,
        'applicationName', null,
        'receiptId', null,
        'blockers', jsonb_build_array(jsonb_build_object(
          'code', 'REGISTRATION_NOT_FOUND',
          'count', 0
        )),
        'counts', '{}'::jsonb
      );
    end if;

    return jsonb_build_object(
      'eligible', true,
      'state', target_receipt.status,
      'requestId', target_receipt.target_request_id,
      'userId', target_receipt.target_user_id,
      'email', lower(btrim(p_email)),
      'applicationName', btrim(p_application_name),
      'receiptId', target_receipt.id,
      'blockers', '[]'::jsonb,
      'counts', target_receipt.deleted_counts
    );
  end if;

  select profile.*
  into target_profile
  from public.user_profiles profile
  where profile.id = target_request.user_profile_id;

  select lower(btrim(auth_user.email))
  into target_auth_email
  from auth.users auth_user
  where auth_user.id = target_request.user_profile_id
    and auth_user.deleted_at is null;

  application_name := coalesce(
    (
      select revision.requested_company_name
      from public.onboarding_application_revisions revision
      where revision.id = target_request.current_revision_id
    ),
    target_request.requested_company_name
  );

  select count(*)
  into request_count
  from public.access_requests request
  where request.user_profile_id = target_request.user_profile_id;

  select count(*)
  into storage_count
  from storage.objects object_record
  where object_record.owner_id = target_request.user_profile_id::text;

  if target_profile.id is null then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PROFILE_NOT_FOUND', 'count', 0
    ));
  end if;
  if p_user_id is not null and p_user_id <> target_request.user_profile_id then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'USER_ID_MISMATCH', 'count', 1
    ));
  end if;
  if p_email is not null
    and lower(btrim(p_email)) <> lower(btrim(coalesce(target_profile.email, ''))) then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'EMAIL_MISMATCH', 'count', 1
    ));
  end if;
  if p_application_name is not null
    and btrim(p_application_name) <> btrim(coalesce(application_name, '')) then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'APPLICATION_NAME_MISMATCH', 'count', 1
    ));
  end if;
  if target_auth_email is null then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'AUTH_USER_NOT_FOUND', 'count', 0
    ));
  elsif target_auth_email <> lower(btrim(coalesce(target_profile.email, ''))) then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'AUTH_EMAIL_MISMATCH', 'count', 1
    ));
  end if;
  if exists (
    select 1 from auth.users auth_user
    where lower(btrim(auth_user.email)) = lower(btrim(coalesce(target_profile.email, '')))
      and auth_user.id <> target_request.user_profile_id
      and auth_user.deleted_at is null
  ) then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'EMAIL_OWNERSHIP_CONFLICT', 'count', 1
    ));
  end if;
  if target_profile.status is distinct from 'registered'
    or target_profile.user_type is distinct from 'external' then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PROFILE_NOT_FAILED_REGISTRATION', 'count', 1
    ));
  end if;
  if request_count <> 1 then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'MULTIPLE_ACCESS_REQUESTS', 'count', request_count
    ));
  end if;
  if target_request.status = 'approved'
    or target_request.onboarding_status = 'approved' then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'APPROVED_ONBOARDING', 'count', 1
    ));
  end if;
  if target_request.status not in ('pending_review', 'rejected', 'cancelled')
    or target_request.onboarding_status not in (
      'received', 'under_review', 'clarification_requested',
      'awaiting_1c_company', 'link_confirmation_required',
      'ready_for_approval', 'rejected', 'cancelled'
    ) then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'ONBOARDING_STATE_NOT_PURGEABLE', 'count', 1
    ));
  end if;
  if target_request.company_id is not null
    or target_request.confirmed_counterparty_id is not null then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'COMPANY_LINK_PRESENT', 'count', 1
    ));
  end if;
  if exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = target_request.user_profile_id
      and (
        membership.status not in ('pending_approval', 'rejected')
        or membership.approved_at is not null
      )
  ) then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'PROTECTED_MEMBERSHIP',
      'count', (
        select count(*)
        from public.company_memberships membership
        where membership.user_id = target_request.user_profile_id
          and (
            membership.status not in ('pending_approval', 'rejected')
            or membership.approved_at is not null
          )
      )
    ));
  end if;
  if storage_count > 0 then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'STORAGE_OWNERSHIP', 'count', storage_count
    ));
  end if;
  if exists (
    select 1
    from public.onboarding_application_revisions revision
    where revision.submitted_by = target_request.user_profile_id
      and revision.access_request_id <> target_request.id
  ) then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'CROSS_APPLICATION_REVISION', 'count', 1
    ));
  end if;
  if exists (
    select 1
    from public.onboarding_events event_record
    where event_record.actor_user_id = target_request.user_profile_id
      and event_record.access_request_id <> target_request.id
  ) then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'CROSS_APPLICATION_EVENT', 'count', 1
    ));
  end if;

  reference_blockers := private.failed_registration_purge_reference_blockers(
    target_request.user_profile_id,
    target_request.id
  );
  blockers := blockers || reference_blockers;

  counts := jsonb_build_object(
    'profiles', (select count(*) from public.user_profiles profile where profile.id = target_request.user_profile_id),
    'accessRequests', request_count,
    'revisions', (select count(*) from public.onboarding_application_revisions revision where revision.access_request_id = target_request.id),
    'events', (select count(*) from public.onboarding_events event_record where event_record.access_request_id = target_request.id),
    'approvalDrafts', (select count(*) from public.onboarding_approval_drafts draft where draft.request_id = target_request.id),
    'approvalAttempts', (select count(*) from public.onboarding_approval_attempts attempt where attempt.request_id = target_request.id),
    'notificationOutbox', (select count(*) from public.onboarding_notification_outbox outbox where outbox.access_request_id = target_request.id),
    'memberships', (select count(*) from public.company_memberships membership where membership.user_id = target_request.user_profile_id),
    'notificationPreferences', (select count(*) from public.partner_notification_preferences preference where preference.user_id = target_request.user_profile_id),
    'companyContextPreferences', (select count(*) from public.user_company_context_preferences preference where preference.user_id = target_request.user_profile_id),
    'storageObjects', storage_count,
    'authUsers', (select count(*) from auth.users auth_user where auth_user.id = target_request.user_profile_id and auth_user.deleted_at is null),
    'authIdentities', (select count(*) from auth.identities identity_record where identity_record.user_id = target_request.user_profile_id),
    'authSessions', (select count(*) from auth.sessions session_record where session_record.user_id = target_request.user_profile_id)
  );

  return jsonb_build_object(
    'eligible', jsonb_array_length(blockers) = 0,
    'state', case when jsonb_array_length(blockers) = 0 then 'ready' else 'blocked' end,
    'requestId', target_request.id,
    'userId', target_request.user_profile_id,
    'email', lower(btrim(target_profile.email)),
    'applicationName', application_name,
    'receiptId', null,
    'blockers', blockers,
    'counts', counts
  );
end;
$$;

revoke all on function public.get_failed_registration_purge_readiness(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.get_failed_registration_purge_readiness(uuid, uuid, text, text)
  to service_role;

create or replace function public.purge_failed_registration_local(
  p_request_id uuid,
  p_user_id uuid,
  p_email text,
  p_application_name text,
  p_actor_user_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  readiness jsonb;
  receipt private.failed_registration_purge_receipts%rowtype;
  purged_counts jsonb := '{}'::jsonb;
  affected_rows bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('failed_registration_purge'),
    pg_catalog.hashtext(p_user_id::text)
  );

  if not exists (
    select 1
    from public.user_profiles actor
    join public.internal_user_role_assignments assignment
      on assignment.user_id = actor.id
      and assignment.revoked_at is null
    join public.roles role on role.id = assignment.role_id
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where actor.id = p_actor_user_id
      and actor.status = 'active'
      and actor.user_type in ('internal', 'admin')
      and role.code = 'novotech_admin'
      and role.scope = 'internal'
      and permission.code = 'onboarding.failed_registration.purge'
  ) then
    raise exception 'failed_registration_purge_permission_denied'
      using errcode = '42501';
  end if;

  select existing.*
  into receipt
  from private.failed_registration_purge_receipts existing
  where existing.target_user_id = p_user_id
    and existing.target_request_id = p_request_id;

  if receipt.id is not null then
    if receipt.normalized_email_hash <>
        private.failed_registration_purge_text_hash(p_email)
      or receipt.application_name_hash <>
        private.failed_registration_purge_exact_text_hash(p_application_name) then
      raise exception 'failed_registration_purge_identity_mismatch'
        using errcode = '22023';
    end if;

    return jsonb_build_object(
      'receiptId', receipt.id,
      'status', receipt.status,
      'requestId', receipt.target_request_id,
      'userId', receipt.target_user_id,
      'deletedCounts', receipt.deleted_counts
    );
  end if;

  readiness := public.get_failed_registration_purge_readiness(
    p_request_id,
    p_user_id,
    p_email,
    p_application_name
  );
  if not coalesce((readiness ->> 'eligible')::boolean, false)
    or readiness ->> 'state' <> 'ready' then
    raise exception 'failed_registration_purge_blocked'
      using errcode = 'P0001', detail = left(readiness::text, 2000);
  end if;

  insert into private.failed_registration_purge_receipts(
    id,
    target_user_id,
    target_request_id,
    normalized_email_hash,
    application_name_hash,
    actor_user_id,
    status
  ) values (
    p_correlation_id,
    p_user_id,
    p_request_id,
    private.failed_registration_purge_text_hash(p_email),
    private.failed_registration_purge_exact_text_hash(p_application_name),
    p_actor_user_id,
    'purging'
  )
  returning * into receipt;

  perform pg_catalog.set_config(
    'app.failed_registration_purge_receipt_id',
    receipt.id::text,
    true
  );

  delete from public.onboarding_approval_attempts
  where request_id = p_request_id;
  get diagnostics affected_rows = row_count;
  purged_counts := purged_counts || jsonb_build_object('approvalAttempts', affected_rows);

  delete from public.onboarding_approval_drafts
  where request_id = p_request_id;
  get diagnostics affected_rows = row_count;
  purged_counts := purged_counts || jsonb_build_object('approvalDrafts', affected_rows);

  delete from public.onboarding_notification_outbox
  where access_request_id = p_request_id;
  get diagnostics affected_rows = row_count;
  purged_counts := purged_counts || jsonb_build_object('notificationOutbox', affected_rows);

  update public.access_requests
  set current_revision_id = null
  where id = p_request_id
    and user_profile_id = p_user_id;

  delete from public.onboarding_events
  where access_request_id = p_request_id;
  get diagnostics affected_rows = row_count;
  purged_counts := purged_counts || jsonb_build_object('events', affected_rows);

  delete from public.onboarding_application_revisions
  where access_request_id = p_request_id;
  get diagnostics affected_rows = row_count;
  purged_counts := purged_counts || jsonb_build_object('revisions', affected_rows);

  delete from public.access_requests
  where id = p_request_id
    and user_profile_id = p_user_id;
  get diagnostics affected_rows = row_count;
  purged_counts := purged_counts || jsonb_build_object('accessRequests', affected_rows);

  delete from public.user_company_context_preferences
  where user_id = p_user_id;
  get diagnostics affected_rows = row_count;
  purged_counts := purged_counts || jsonb_build_object('companyContextPreferences', affected_rows);

  delete from public.partner_notification_preferences
  where user_id = p_user_id;
  get diagnostics affected_rows = row_count;
  purged_counts := purged_counts || jsonb_build_object('notificationPreferences', affected_rows);

  delete from public.company_memberships
  where user_id = p_user_id
    and status in ('pending_approval', 'rejected')
    and approved_at is null;
  get diagnostics affected_rows = row_count;
  purged_counts := purged_counts || jsonb_build_object('memberships', affected_rows);

  delete from public.user_profiles
  where id = p_user_id
    and lower(btrim(email)) = lower(btrim(p_email))
    and status = 'registered'
    and user_type = 'external';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'failed_registration_profile_delete_mismatch'
      using errcode = 'P0001';
  end if;
  purged_counts := purged_counts || jsonb_build_object('profiles', affected_rows);

  update private.failed_registration_purge_receipts
  set status = 'local_purged',
    deleted_counts = purged_counts,
    local_purged_at = now(),
    updated_at = now()
  where id = receipt.id
  returning * into receipt;

  perform pg_catalog.set_config(
    'app.failed_registration_purge_receipt_id',
    '',
    true
  );

  return jsonb_build_object(
    'receiptId', receipt.id,
    'status', receipt.status,
    'requestId', receipt.target_request_id,
    'userId', receipt.target_user_id,
    'deletedCounts', receipt.deleted_counts
  );
end;
$$;

revoke all on function public.purge_failed_registration_local(uuid, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.purge_failed_registration_local(uuid, uuid, text, text, uuid, uuid)
  to service_role;

create or replace function public.mark_failed_registration_purge_auth_failure(
  p_receipt_id uuid,
  p_safe_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  receipt private.failed_registration_purge_receipts%rowtype;
  safe_code text := upper(regexp_replace(
    coalesce(p_safe_error_code, 'AUTH_DELETE_FAILED'),
    '[^A-Za-z0-9_]+',
    '_',
    'g'
  ));
begin
  safe_code := left(nullif(btrim(safe_code), ''), 80);
  update private.failed_registration_purge_receipts
  set status = 'auth_delete_failed',
    safe_error_code = coalesce(safe_code, 'AUTH_DELETE_FAILED'),
    updated_at = now()
  where id = p_receipt_id
    and status in ('local_purged', 'auth_delete_failed')
  returning * into receipt;

  if receipt.id is null then
    raise exception 'failed_registration_purge_receipt_not_recoverable'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'receiptId', receipt.id,
    'status', receipt.status,
    'safeErrorCode', receipt.safe_error_code
  );
end;
$$;

revoke all on function public.mark_failed_registration_purge_auth_failure(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_failed_registration_purge_auth_failure(uuid, text)
  to service_role;

create or replace function public.complete_failed_registration_purge(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  receipt private.failed_registration_purge_receipts%rowtype;
  remaining_counts jsonb;
begin
  select existing.*
  into receipt
  from private.failed_registration_purge_receipts existing
  where existing.id = p_receipt_id
  for update;

  if receipt.id is null then
    raise exception 'failed_registration_purge_receipt_not_found'
      using errcode = 'P0002';
  end if;

  remaining_counts := jsonb_build_object(
    'profiles', (select count(*) from public.user_profiles profile where profile.id = receipt.target_user_id),
    'accessRequests', (select count(*) from public.access_requests request where request.id = receipt.target_request_id or request.user_profile_id = receipt.target_user_id),
    'revisions', (select count(*) from public.onboarding_application_revisions revision where revision.access_request_id = receipt.target_request_id),
    'events', (select count(*) from public.onboarding_events event_record where event_record.access_request_id = receipt.target_request_id),
    'approvalDrafts', (select count(*) from public.onboarding_approval_drafts draft where draft.request_id = receipt.target_request_id),
    'approvalAttempts', (select count(*) from public.onboarding_approval_attempts attempt where attempt.request_id = receipt.target_request_id),
    'notificationOutbox', (select count(*) from public.onboarding_notification_outbox outbox where outbox.access_request_id = receipt.target_request_id),
    'memberships', (select count(*) from public.company_memberships membership where membership.user_id = receipt.target_user_id),
    'notificationPreferences', (select count(*) from public.partner_notification_preferences preference where preference.user_id = receipt.target_user_id),
    'companyContextPreferences', (select count(*) from public.user_company_context_preferences preference where preference.user_id = receipt.target_user_id),
    'storageObjects', (select count(*) from storage.objects object_record where object_record.owner_id = receipt.target_user_id::text)
  );

  if exists (
    select 1
    from jsonb_each_text(remaining_counts) count_record
    where count_record.value::bigint <> 0
  ) then
    raise exception 'failed_registration_purge_local_verification_failed'
      using errcode = 'P0001', detail = remaining_counts::text;
  end if;

  update private.failed_registration_purge_receipts
  set status = 'completed',
    safe_error_code = null,
    auth_deleted_at = coalesce(auth_deleted_at, now()),
    updated_at = now()
  where id = receipt.id
  returning * into receipt;

  return jsonb_build_object(
    'receiptId', receipt.id,
    'status', receipt.status,
    'deletedCounts', receipt.deleted_counts,
    'remainingCounts', remaining_counts
  );
end;
$$;

revoke all on function public.complete_failed_registration_purge(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_failed_registration_purge(uuid)
  to service_role;

create or replace function public.prevent_onboarding_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_request_id uuid;
begin
  if tg_op = 'DELETE' and tg_table_schema = 'public'
    and tg_table_name in ('onboarding_application_revisions', 'onboarding_events') then
    target_request_id := old.access_request_id;
    select request.user_profile_id
    into target_user_id
    from public.access_requests request
    where request.id = target_request_id;

    if private.failed_registration_purge_context_matches(
      target_user_id,
      target_request_id
    ) then
      return old;
    end if;
  end if;

  raise exception 'Onboarding history is append-only.' using errcode = '42501';
end;
$$;

create or replace function public.prevent_onboarding_notification_outbox_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if tg_op = 'DELETE' then
    select request.user_profile_id
    into target_user_id
    from public.access_requests request
    where request.id = old.access_request_id;

    if private.failed_registration_purge_context_matches(
      target_user_id,
      old.access_request_id
    ) then
      return old;
    end if;
  elsif old.delivery_status = 'pending'
    and new.delivery_status in ('delivered', 'failed', 'suppressed')
    and new.id = old.id
    and new.access_request_id = old.access_request_id
    and new.recipient_user_id = old.recipient_user_id
    and new.event_code = old.event_code
    and new.audience = old.audience
    and new.title = old.title
    and new.message = old.message
    and new.action_url = old.action_url
    and new.safe_payload = old.safe_payload
    and new.created_at = old.created_at
    and new.deduplication_key = old.deduplication_key then
    return new;
  end if;

  raise exception 'Onboarding notification content is append-only.'
    using errcode = '42501';
end;
$$;

comment on function public.get_failed_registration_purge_readiness(uuid, uuid, text, text) is
  'Service-role-only exact eligibility projection for a failed-registration purge. Includes future FK ownership blockers and never mutates data.';
comment on function public.purge_failed_registration_local(uuid, uuid, text, text, uuid, uuid) is
  'Service-role-only atomic local purge for one exact failed registration. Append-only exceptions require its transaction-local receipt context.';
comment on function public.complete_failed_registration_purge(uuid) is
  'Marks a recovery receipt complete only after the server confirms Auth Admin deletion and local zero-state verification.';

commit;
