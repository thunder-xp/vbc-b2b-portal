-- Operational recovery for onboarding requests whose exact 1C counterparty
-- does not exist yet. Commercial activation rules remain unchanged.

alter table public.onboarding_events
  drop constraint if exists onboarding_events_event_type_check;
alter table public.onboarding_events
  add constraint onboarding_events_event_type_check check (event_type in (
    'application_migrated', 'revision_created', 'assigned', 'reassigned', 'unassigned',
    'review_started', 'match_suggested', 'match_confirmed',
    'awaiting_1c_company', 'ready_for_approval', 'status_changed',
    'approval_failed', 'approval_draft_updated', 'onboarding_approved',
    'capability_granted', 'capability_revoked', 'clarification_requested',
    'partner_revision_submitted', 'rejected', 'cancelled', 'reopened',
    'sla_paused', 'sla_resumed', 'directory_refresh_requested',
    'directory_refresh_succeeded', 'directory_refresh_failed',
    'no_1c_counterparty_declared', 'application_moved_to_1c_waiting',
    'counterparty_candidate_found'
  ));

create or replace function public.get_onboarding_company_verification_context(
  p_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('onboarding.requests.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.access_requests where id = p_request_id) then
    return null;
  end if;

  select jsonb_build_object(
    'latestStatus', latest.status,
    'latestStartedAt', latest.started_at,
    'latestFinishedAt', latest.finished_at,
    'latestSafeErrorCode', latest.safe_error_code,
    'lastSuccessfulAt', success.finished_at,
    'waitingSince', waiting.occurred_at,
    'waitingInternalNote', waiting.safe_metadata->>'internalNote'
  ) into result
  from (select 1) anchor
  left join lateral (
    select sync.status, sync.started_at, sync.finished_at, sync.safe_error_code
    from public.one_c_counterparty_directory_syncs sync
    order by sync.started_at desc
    limit 1
  ) latest on true
  left join lateral (
    select sync.finished_at
    from public.one_c_counterparty_directory_syncs sync
    where sync.status = 'succeeded'
    order by sync.finished_at desc
    limit 1
  ) success on true
  left join lateral (
    select event.occurred_at, event.safe_metadata
    from public.onboarding_events event
    where event.access_request_id = p_request_id
      and event.event_type = 'no_1c_counterparty_declared'
    order by event.occurred_at desc
    limit 1
  ) waiting on true;

  return result;
end;
$$;

create or replace function public.record_onboarding_directory_refresh_event(
  p_request_id uuid,
  p_event_type text,
  p_correlation_id uuid,
  p_safe_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  request public.access_requests%rowtype;
begin
  if not public.has_internal_permission('admin.integrations.manage') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_event_type not in (
    'directory_refresh_requested',
    'directory_refresh_succeeded',
    'directory_refresh_failed'
  ) then
    raise exception 'invalid_directory_refresh_event' using errcode = '22023';
  end if;

  select * into request from public.access_requests where id = p_request_id;
  if request.id is null then
    raise exception 'onboarding_request_not_found' using errcode = 'P0002';
  end if;

  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, auth.uid(), p_event_type, request.onboarding_status,
    request.onboarding_status,
    case when p_event_type = 'directory_refresh_failed'
      then jsonb_build_object(
        'safeErrorCode', left(regexp_replace(upper(coalesce(p_safe_error_code, 'UNKNOWN')), '[^A-Z0-9_]+', '_', 'g'), 80)
      )
      else '{}'::jsonb
    end,
    p_correlation_id
  );
end;
$$;

create or replace function public.mark_onboarding_waiting_for_1c_counterparty(
  p_request_id uuid,
  p_assignee_user_id uuid default null,
  p_internal_note text default null,
  p_correlation_id uuid default gen_random_uuid()
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  request public.access_requests%rowtype;
  normalized_note text := nullif(left(btrim(coalesce(p_internal_note, '')), 1000), '');
begin
  if not public.has_internal_permission('onboarding.requests.review') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null then
    raise exception 'onboarding_request_not_found' using errcode = 'P0002';
  end if;
  if request.onboarding_status not in ('under_review', 'link_confirmation_required', 'awaiting_1c_company') then
    raise exception 'invalid_status_transition' using errcode = '22023';
  end if;
  if p_assignee_user_id is not null
    and not public.has_internal_permission('onboarding.requests.assign') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_assignee_user_id is not null and not exists (
    select 1
    from public.user_profiles profile
    where profile.id = p_assignee_user_id
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
      and (
        exists (
          select 1 from public.internal_user_role_assignments assignment
          join public.roles role on role.id = assignment.role_id
          where assignment.user_id = profile.id
            and assignment.revoked_at is null
            and role.code = 'novotech_admin'
        )
        or exists (
          select 1 from public.internal_user_capability_assignments capability
          join public.permissions permission on permission.id = capability.permission_id
          where capability.user_id = profile.id
            and capability.revoked_at is null
            and permission.code = 'onboarding.requests.review'
        )
      )
  ) then
    raise exception 'invalid_onboarding_assignee' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.onboarding_application_revisions revision
    join public.one_c_counterparties candidate
      on candidate.is_published
     and candidate.normalized_fiscal_code is not null
     and candidate.normalized_fiscal_code = lower(regexp_replace(
       coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'
     ))
    where revision.id = request.current_revision_id
  ) then
    raise exception 'counterparty_candidate_exists' using errcode = '22023';
  end if;

  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, auth.uid(), 'no_1c_counterparty_declared',
    request.onboarding_status, 'awaiting_1c_company',
    case when normalized_note is null then '{}'::jsonb
      else jsonb_build_object('internalNote', normalized_note) end,
    p_correlation_id
  );

  if request.onboarding_status <> 'awaiting_1c_company' then
    update public.access_requests
    set onboarding_status = 'awaiting_1c_company',
        assigned_manager_user_id = coalesce(p_assignee_user_id, assigned_manager_user_id),
        assigned_at = case when p_assignee_user_id is null then assigned_at else now() end,
        assigned_by = case when p_assignee_user_id is null then assigned_by else auth.uid() end,
        last_activity_at = now()
    where id = request.id;

    insert into public.onboarding_events(
      access_request_id, actor_user_id, event_type, previous_status, next_status,
      safe_metadata, correlation_id
    ) values (
      request.id, auth.uid(), 'application_moved_to_1c_waiting',
      request.onboarding_status, 'awaiting_1c_company',
      jsonb_build_object('assignmentChanged', p_assignee_user_id is not null),
      p_correlation_id
    );
  end if;
end;
$$;

create or replace function public.resume_waiting_onboarding_requests_after_directory_sync(
  p_sync_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  request record;
  resumed_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.one_c_counterparty_directory_syncs sync
    where sync.sync_id = p_sync_id and sync.status = 'succeeded'
  ) then
    raise exception 'directory_sync_not_published' using errcode = '22023';
  end if;

  for request in
    select access.id, access.assigned_manager_user_id, access.onboarding_status
    from public.access_requests access
    join public.onboarding_application_revisions revision
      on revision.id = access.current_revision_id
    where access.onboarding_status = 'awaiting_1c_company'
      and 1 = (
        select count(*)
        from public.one_c_counterparties candidate
        where candidate.is_published
          and candidate.is_active
          and not candidate.is_deleted
          and candidate.normalized_fiscal_code is not null
          and candidate.normalized_fiscal_code = lower(regexp_replace(
            coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'
          ))
      )
    for update of access skip locked
  loop
    update public.access_requests
    set onboarding_status = 'under_review', last_activity_at = now()
    where id = request.id;
    update public.onboarding_approval_drafts
    set current_step = 1, version = version + 1, updated_at = now()
    where request_id = request.id;

    insert into public.onboarding_events(
      access_request_id, actor_user_id, event_type, previous_status, next_status,
      safe_metadata, correlation_id
    ) values
      (request.id, null, 'counterparty_candidate_found', 'awaiting_1c_company',
       'under_review', jsonb_build_object('syncPublished', true), gen_random_uuid()),
      (request.id, null, 'status_changed', 'awaiting_1c_company',
       'under_review', jsonb_build_object('reason', 'exact_idno_candidate_available'), gen_random_uuid());

    if request.assigned_manager_user_id is not null then
      insert into public.onboarding_notification_outbox(
        access_request_id, recipient_user_id, audience, event_code, title,
        message, action_url, deduplication_key
      ) values (
        request.id, request.assigned_manager_user_id, 'manager',
        'onboarding_match_available', 'Контрагент 1С найден',
        'Точное совпадение по IDNO найдено. Проверку компании можно продолжить.',
        '/admin/onboarding',
        'onboarding:match-available:' || request.id::text || ':' || p_sync_id::text
      ) on conflict (recipient_user_id, deduplication_key) do nothing;
    end if;
    resumed_count := resumed_count + 1;
  end loop;
  return resumed_count;
end;
$$;

revoke all on function public.get_onboarding_company_verification_context(uuid) from public, anon;
revoke all on function public.record_onboarding_directory_refresh_event(uuid, text, uuid, text) from public, anon;
revoke all on function public.mark_onboarding_waiting_for_1c_counterparty(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.resume_waiting_onboarding_requests_after_directory_sync(uuid) from public, anon, authenticated;

grant execute on function public.get_onboarding_company_verification_context(uuid) to authenticated;
grant execute on function public.record_onboarding_directory_refresh_event(uuid, text, uuid, text) to authenticated;
grant execute on function public.mark_onboarding_waiting_for_1c_counterparty(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.resume_waiting_onboarding_requests_after_directory_sync(uuid) to service_role;
