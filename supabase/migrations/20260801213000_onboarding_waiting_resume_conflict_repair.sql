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
    select 1
    from public.one_c_counterparty_directory_syncs sync
    where sync.sync_id = p_sync_id
      and sync.status = 'succeeded'
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
          and candidate.normalized_fiscal_code =
            public.normalize_moldova_fiscal_code(revision.requested_fiscal_code)
      )
    for update of access skip locked
  loop
    update public.access_requests
    set onboarding_status = 'under_review',
        last_activity_at = now()
    where id = request.id;

    update public.onboarding_approval_drafts
    set current_step = 1,
        version = version + 1,
        updated_at = now()
    where request_id = request.id;

    insert into public.onboarding_events(
      access_request_id,
      actor_user_id,
      event_type,
      previous_status,
      next_status,
      safe_metadata,
      correlation_id
    ) values
      (
        request.id,
        null,
        'counterparty_candidate_found',
        'awaiting_1c_company',
        'under_review',
        jsonb_build_object('syncPublished', true),
        gen_random_uuid()
      ),
      (
        request.id,
        null,
        'status_changed',
        'awaiting_1c_company',
        'under_review',
        jsonb_build_object('reason', 'exact_idno_candidate_available'),
        gen_random_uuid()
      );

    if request.assigned_manager_user_id is not null then
      insert into public.onboarding_notification_outbox(
        access_request_id,
        recipient_user_id,
        audience,
        event_code,
        title,
        message,
        action_url,
        deduplication_key
      ) values (
        request.id,
        request.assigned_manager_user_id,
        'manager',
        'onboarding_match_available',
        'Контрагент 1С найден',
        'Точное совпадение по IDNO найдено. Проверку компании можно продолжить.',
        '/admin/onboarding',
        'onboarding:match-available:' || request.id::text || ':' || p_sync_id::text
      ) on conflict (deduplication_key) do nothing;
    end if;

    resumed_count := resumed_count + 1;
  end loop;

  return resumed_count;
end;
$$;

revoke all on function public.resume_waiting_onboarding_requests_after_directory_sync(uuid)
  from public, anon, authenticated;
grant execute on function public.resume_waiting_onboarding_requests_after_directory_sync(uuid)
  to service_role;
