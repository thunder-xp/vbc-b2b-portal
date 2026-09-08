-- Archived draft estimates may be hidden from the partner workspace without
-- deleting immutable preparation/audit history. Only actual commercial
-- communication or order lifecycle protects the estimate from tombstoning.

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
     or not public.can_access_estimates(target.company_id, 'estimates.manage') then
    raise exception 'ESTIMATE_DELETE_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  if target.status <> 'archived' or target.archived_at is null then
    raise exception 'ESTIMATE_DELETE_NOT_ARCHIVED' using errcode = '22023';
  end if;

  if target.revision <> expected_revision then
    raise exception 'ESTIMATE_DELETE_STALE_REVISION' using errcode = 'PT409';
  end if;

  -- An order link or a converted lifecycle is protected independently of
  -- retained preparation and audit relations.
  if target.lifecycle_order_id is not null
     or target.lifecycle_status = 'converted_to_order'
     or exists (
       select 1
       from public.estimate_lifecycle_events event
       where event.estimate_id = target.id
         and event.to_status = 'converted_to_order'
     ) then
    raise exception 'ESTIMATE_DELETE_BLOCKED_ORDER' using errcode = '23514';
  end if;

  -- Actual customer communication/decision history remains protected.
  -- A queued, sending, failed, or unsent-revoked delivery is only an
  -- operational reference and does not by itself prove communication.
  if target.accepted_version_id is not null
     or target.lifecycle_status <> 'draft'
     or exists (
       select 1
       from public.estimate_proposal_deliveries delivery
       where delivery.estimate_id = target.id
         and (
           delivery.sent_at is not null
           or delivery.first_opened_at is not null
           or delivery.responded_at is not null
           or delivery.status in ('sent', 'delivered', 'responded')
         )
     )
     or exists (
       select 1
       from public.estimate_versions version
       where version.estimate_id = target.id
         and version.status <> 'prepared'
     )
     or exists (
       select 1
       from public.estimate_lifecycle_events event
       where event.estimate_id = target.id
         and event.to_status <> 'draft'
     ) then
    raise exception 'ESTIMATE_DELETE_BLOCKED_PROPOSAL' using errcode = '23514';
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
  'Soft-deletes an archived draft while retaining preparation/audit references; blocks communicated proposal and order history.';
