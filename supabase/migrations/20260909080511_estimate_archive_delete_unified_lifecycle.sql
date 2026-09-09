-- Unify estimate workspace lifecycle controls without changing commercial
-- lifecycle truth. Archive is available to every active same-company estimate
-- viewer; permanent workspace hiding remains limited to the creator or the
-- active partner owner. Both operations preserve all historical relations.

create or replace function public.archive_estimate(target_estimate_id uuid, expected_revision integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
begin
  select * into target
  from public.estimates
  where id = target_estimate_id
  for update;

  if target.id is null
     or target.deleted_at is not null
     or not public.can_access_estimates(target.company_id, 'estimates.view') then
    raise exception 'ESTIMATE_ARCHIVE_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  -- A repeated archive request is a safe no-op. Do not require the original
  -- revision after the first successful transition.
  if target.status = 'archived' then
    return;
  end if;

  if target.revision <> expected_revision then
    raise exception 'ESTIMATE_ARCHIVE_STALE_REVISION' using errcode = 'PT409';
  end if;

  update public.estimates
  set status = 'archived',
      archived_at = statement_timestamp()
  where id = target.id;

  insert into public.estimate_events(estimate_id, actor_user_id, event_type)
  values (target.id, auth.uid(), 'archived');
end;
$$;

revoke all on function public.archive_estimate(uuid, integer) from public, anon;
grant execute on function public.archive_estimate(uuid, integer) to authenticated;

comment on function public.archive_estimate(uuid, integer) is
  'Idempotently archives any non-deleted estimate visible in the active company while preserving commercial lifecycle truth.';

create or replace function public.delete_archived_estimate(
  target_estimate_id uuid,
  expected_revision integer,
  target_request_key uuid,
  target_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  existing_event public.estimate_deletion_events;
  created_event public.estimate_deletion_events;
  normalized_reason text := nullif(btrim(target_reason), '');
  actor_is_owner boolean := false;
begin
  select * into existing_event
  from public.estimate_deletion_events
  where request_key = target_request_key and actor_user_id = auth.uid();

  if existing_event.id is not null then
    if existing_event.estimate_id <> target_estimate_id then
      raise exception 'Estimate deletion request was already used.' using errcode = '23505';
    end if;

    return jsonb_build_object(
      'estimateId', existing_event.estimate_id,
      'eventId', existing_event.id,
      'deletedAt', existing_event.occurred_at
    );
  end if;

  if target_request_key is null
     or normalized_reason is null
     or char_length(normalized_reason) not between 10 and 500 then
    raise exception 'Estimate deletion request is invalid.' using errcode = '22023';
  end if;

  select * into target
  from public.estimates
  where id = target_estimate_id
  for update;

  if target.id is null
     or target.deleted_at is not null
     or not public.can_access_estimates(target.company_id, 'estimates.view') then
    raise exception 'ESTIMATE_DELETE_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  if target.status <> 'archived' or target.archived_at is null then
    raise exception 'ESTIMATE_DELETE_NOT_ARCHIVED' using errcode = '22023';
  end if;

  if target.revision <> expected_revision then
    raise exception 'ESTIMATE_DELETE_STALE_REVISION' using errcode = 'PT409';
  end if;

  select exists (
    select 1
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    where membership.user_id = auth.uid()
      and membership.company_id = target.company_id
      and membership.status = 'active'
      and role.code = 'partner_owner'
  ) into actor_is_owner;

  if target.created_by <> auth.uid() and not actor_is_owner then
    raise exception 'ESTIMATE_DELETE_NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.estimates
  set deleted_at = statement_timestamp(),
      deleted_by = auth.uid(),
      deletion_reason = normalized_reason
  where id = target.id;

  insert into public.estimate_deletion_events(
    estimate_id,
    company_id,
    actor_user_id,
    request_key,
    estimate_revision,
    reason
  ) values (
    target.id,
    target.company_id,
    auth.uid(),
    target_request_key,
    target.revision,
    normalized_reason
  ) returning * into created_event;

  return jsonb_build_object(
    'estimateId', target.id,
    'eventId', created_event.id,
    'deletedAt', created_event.occurred_at
  );
end;
$$;

revoke all on function public.delete_archived_estimate(uuid, integer, uuid, text) from public, anon;
grant execute on function public.delete_archived_estimate(uuid, integer, uuid, text) to authenticated;

comment on function public.delete_archived_estimate(uuid, integer, uuid, text) is
  'Soft-deletes an archived estimate for its active same-company creator or partner owner while preserving every historical relation.';
