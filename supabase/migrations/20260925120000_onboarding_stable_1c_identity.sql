begin;

-- Directory row UUIDs identify one published import only. Persist the stable
-- 1C Ref_Key beside the current row UUID, which remains a replaceable cache.
alter table public.onboarding_approval_drafts
  add column if not exists confirmed_counterparty_external_1c_id text null,
  add column if not exists selected_price_profile_external_1c_id text null;

alter table public.access_requests
  add column if not exists confirmed_counterparty_external_1c_id text null;

create index if not exists onboarding_approval_drafts_counterparty_ref_idx
  on public.onboarding_approval_drafts(lower(confirmed_counterparty_external_1c_id))
  where confirmed_counterparty_external_1c_id is not null;

create index if not exists onboarding_approval_drafts_price_profile_ref_idx
  on public.onboarding_approval_drafts(lower(selected_price_profile_external_1c_id))
  where selected_price_profile_external_1c_id is not null;

create index if not exists access_requests_counterparty_ref_idx
  on public.access_requests(lower(confirmed_counterparty_external_1c_id))
  where confirmed_counterparty_external_1c_id is not null;

comment on column public.onboarding_approval_drafts.confirmed_counterparty_external_1c_id is
  'Stable 1C counterparty Ref_Key. confirmed_counterparty_id is only the current published snapshot cache.';
comment on column public.onboarding_approval_drafts.selected_price_profile_external_1c_id is
  'Stable 1C price-type Ref_Key. selected_price_profile_id is only the current published snapshot cache.';
comment on column public.access_requests.confirmed_counterparty_external_1c_id is
  'Stable 1C counterparty Ref_Key. confirmed_counterparty_id is only the current published snapshot cache.';

-- Backfill only through the exact historical row already selected by the
-- reviewer. Names and fuzzy matches are intentionally excluded.
update public.onboarding_approval_drafts draft
set confirmed_counterparty_external_1c_id = lower(counterparty.external_1c_id)
from public.one_c_counterparties counterparty
where counterparty.id = draft.confirmed_counterparty_id
  and draft.confirmed_counterparty_external_1c_id is null;

update public.onboarding_approval_drafts draft
set selected_price_profile_external_1c_id = lower(profile.external_1c_id)
from public.one_c_counterparty_price_profiles profile
where profile.id = draft.selected_price_profile_id
  and draft.selected_price_profile_external_1c_id is null;

update public.access_requests request
set confirmed_counterparty_external_1c_id = lower(counterparty.external_1c_id)
from public.one_c_counterparties counterparty
where counterparty.id = request.confirmed_counterparty_id
  and request.confirmed_counterparty_external_1c_id is null;

update public.access_requests request
set confirmed_counterparty_external_1c_id = draft.confirmed_counterparty_external_1c_id
from public.onboarding_approval_drafts draft
where draft.request_id = request.id
  and request.confirmed_counterparty_external_1c_id is null
  and draft.confirmed_counterparty_external_1c_id is not null;

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
    'counterparty_candidate_found', 'onboarding_1c_snapshot_rebased'
  ));

create or replace function public.resolve_onboarding_counterparty_snapshot(
  p_external_1c_id text,
  p_requested_fiscal_code text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  resolved_id uuid;
  resolved_active boolean;
  resolved_deleted boolean;
  resolved_fiscal text;
  stable_matches integer;
  fiscal_matches integer;
  normalized_fiscal text := public.normalize_moldova_fiscal_code(p_requested_fiscal_code);
begin
  if nullif(btrim(p_external_1c_id), '') is null or normalized_fiscal is null then
    raise exception 'counterparty_identity_conflict' using errcode = '23505';
  end if;

  select count(*), min(candidate.id::text)::uuid,
         bool_and(candidate.is_active), bool_or(candidate.is_deleted),
         min(candidate.normalized_fiscal_code)
    into stable_matches, resolved_id, resolved_active, resolved_deleted, resolved_fiscal
  from public.one_c_counterparties candidate
  where candidate.is_published
    and lower(candidate.external_1c_id) = lower(btrim(p_external_1c_id));

  if stable_matches = 0 then
    raise exception 'counterparty_no_longer_active' using errcode = '55000';
  end if;
  if stable_matches <> 1 then
    raise exception 'counterparty_identity_conflict' using errcode = '23505';
  end if;
  if not resolved_active or resolved_deleted then
    raise exception 'counterparty_no_longer_active' using errcode = '55000';
  end if;
  if resolved_fiscal is distinct from normalized_fiscal then
    raise exception 'counterparty_identity_conflict' using errcode = '23505';
  end if;

  select count(*) into fiscal_matches
  from public.one_c_counterparties candidate
  where candidate.is_published
    and candidate.is_active
    and not candidate.is_deleted
    and candidate.normalized_fiscal_code = normalized_fiscal;

  if fiscal_matches <> 1 then
    raise exception 'counterparty_identity_conflict' using errcode = '23505';
  end if;
  return resolved_id;
end;
$$;

create or replace function public.resolve_onboarding_price_profile_snapshot(
  p_counterparty_external_1c_id text,
  p_price_profile_external_1c_id text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  resolved_id uuid;
  profile_matches integer;
begin
  if nullif(btrim(p_counterparty_external_1c_id), '') is null
    or nullif(btrim(p_price_profile_external_1c_id), '') is null then
    raise exception 'invalid_price_profile' using errcode = '22023';
  end if;

  select count(*), min(profile.id::text)::uuid
    into profile_matches, resolved_id
  from public.one_c_counterparty_price_profiles profile
  where profile.is_published
    and profile.is_active
    and not profile.is_deleted
    and lower(profile.counterparty_external_1c_id) = lower(btrim(p_counterparty_external_1c_id))
    and lower(profile.external_1c_id) = lower(btrim(p_price_profile_external_1c_id));

  if profile_matches <> 1 then
    raise exception 'invalid_price_profile' using errcode = '22023';
  end if;
  return resolved_id;
end;
$$;

revoke all on function public.resolve_onboarding_counterparty_snapshot(text, text)
  from public, anon, authenticated;
revoke all on function public.resolve_onboarding_price_profile_snapshot(text, text)
  from public, anon, authenticated;

create or replace function public.rebase_onboarding_1c_snapshot_references(
  p_request_id uuid,
  p_actor_id uuid default null,
  p_emit_event boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  request public.access_requests%rowtype;
  revision public.onboarding_application_revisions%rowtype;
  draft public.onboarding_approval_drafts%rowtype;
  old_counterparty public.one_c_counterparties%rowtype;
  new_counterparty public.one_c_counterparties%rowtype;
  old_price_profile public.one_c_counterparty_price_profiles%rowtype;
  new_price_profile public.one_c_counterparty_price_profiles%rowtype;
  counterparty_ref text;
  price_profile_ref text;
  current_counterparty_id uuid;
  current_price_profile_id uuid;
  pointer_changed boolean := false;
begin
  select * into request from public.access_requests
  where id = p_request_id for update;
  if request.id is null then return null; end if;

  select * into revision from public.onboarding_application_revisions
  where id = request.current_revision_id;
  select * into draft from public.onboarding_approval_drafts
  where request_id = p_request_id for update;
  if draft.request_id is null then return null; end if;

  if draft.confirmed_counterparty_id is not null then
    select * into old_counterparty from public.one_c_counterparties
    where id = draft.confirmed_counterparty_id;
  end if;
  counterparty_ref := lower(coalesce(
    nullif(btrim(draft.confirmed_counterparty_external_1c_id), ''),
    nullif(btrim(old_counterparty.external_1c_id), '')
  ));

  if draft.confirmed_counterparty_id is not null and counterparty_ref is null then
    raise exception 'counterparty_identity_conflict' using errcode = '23505';
  end if;

  if counterparty_ref is not null then
    current_counterparty_id := public.resolve_onboarding_counterparty_snapshot(
      counterparty_ref,
      revision.requested_fiscal_code
    );
    select * into new_counterparty from public.one_c_counterparties
    where id = current_counterparty_id;
    pointer_changed := draft.confirmed_counterparty_id is distinct from current_counterparty_id;
  end if;

  if draft.selected_price_profile_id is not null then
    select * into old_price_profile from public.one_c_counterparty_price_profiles
    where id = draft.selected_price_profile_id;
  end if;
  price_profile_ref := lower(coalesce(
    nullif(btrim(draft.selected_price_profile_external_1c_id), ''),
    nullif(btrim(old_price_profile.external_1c_id), '')
  ));

  if draft.selected_price_profile_id is not null and price_profile_ref is null then
    raise exception 'invalid_price_profile' using errcode = '22023';
  end if;

  if price_profile_ref is not null then
    if counterparty_ref is null then
      raise exception 'counterparty_identity_conflict' using errcode = '23505';
    end if;
    current_price_profile_id := public.resolve_onboarding_price_profile_snapshot(
      counterparty_ref,
      price_profile_ref
    );
    select * into new_price_profile from public.one_c_counterparty_price_profiles
    where id = current_price_profile_id;
    pointer_changed := pointer_changed
      or draft.selected_price_profile_id is distinct from current_price_profile_id;
  end if;

  update public.onboarding_approval_drafts
  set confirmed_counterparty_external_1c_id = counterparty_ref,
      confirmed_counterparty_id = coalesce(current_counterparty_id, confirmed_counterparty_id),
      selected_price_profile_external_1c_id = price_profile_ref,
      selected_price_profile_id = case
        when price_profile_ref is null then selected_price_profile_id
        else current_price_profile_id
      end
  where request_id = p_request_id
  returning * into draft;

  if counterparty_ref is not null
    and (request.confirmed_counterparty_id is not null
      or request.confirmed_counterparty_external_1c_id is not null) then
    update public.access_requests
    set confirmed_counterparty_external_1c_id = counterparty_ref,
        confirmed_counterparty_id = current_counterparty_id
    where id = p_request_id;
  end if;

  if pointer_changed and p_emit_event then
    insert into public.onboarding_events(
      access_request_id, actor_user_id, event_type, previous_status, next_status,
      safe_metadata
    ) values (
      p_request_id, p_actor_id, 'onboarding_1c_snapshot_rebased',
      request.onboarding_status, request.onboarding_status,
      jsonb_strip_nulls(jsonb_build_object(
        'operation', 'ONBOARDING_1C_SNAPSHOT_REBASED',
        'stable_id_hash', encode(extensions.digest(counterparty_ref, 'sha256'), 'hex'),
        'old_snapshot_version', old_counterparty.synchronization_version,
        'new_snapshot_version', new_counterparty.synchronization_version,
        'price_profile_stable_id_hash', case when price_profile_ref is null then null
          else encode(extensions.digest(price_profile_ref, 'sha256'), 'hex') end,
        'old_price_snapshot_at', old_price_profile.synchronized_at,
        'new_price_snapshot_at', new_price_profile.synchronized_at
      ))
    );
  end if;

  return jsonb_build_object(
    'confirmedCounterpartyId', draft.confirmed_counterparty_id,
    'confirmedCounterpartyExternal1cId', draft.confirmed_counterparty_external_1c_id,
    'selectedPriceProfileId', draft.selected_price_profile_id,
    'selectedPriceProfileExternal1cId', draft.selected_price_profile_external_1c_id,
    'rebased', pointer_changed
  );
end;
$$;

revoke all on function public.rebase_onboarding_1c_snapshot_references(uuid, uuid, boolean)
  from public, anon, authenticated;

-- Retain the proven engines behind narrow stable-identity adapters.
alter function public.get_onboarding_request_detail_v4(uuid)
  rename to get_onboarding_request_detail_v4_snapshot_row_base;
revoke all on function public.get_onboarding_request_detail_v4_snapshot_row_base(uuid)
  from public, anon, authenticated;

create function public.get_onboarding_request_detail_v4(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
  rebased jsonb;
begin
  if not public.has_internal_permission('onboarding.requests.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  result := public.get_onboarding_request_detail_v4_snapshot_row_base(p_request_id);
  if result is null or result->'draft' = 'null'::jsonb then return result; end if;

  rebased := public.rebase_onboarding_1c_snapshot_references(p_request_id, auth.uid(), true);
  if rebased is null then return result; end if;
  return jsonb_set(
    jsonb_set(result, '{draft,confirmedCounterpartyId}',
      coalesce(rebased->'confirmedCounterpartyId', 'null'::jsonb), true),
    '{draft,selectedPriceProfileId}',
    coalesce(rebased->'selectedPriceProfileId', 'null'::jsonb), true
  );
end;
$$;

revoke all on function public.get_onboarding_request_detail_v4(uuid) from public, anon;
grant execute on function public.get_onboarding_request_detail_v4(uuid) to authenticated;

alter function public.save_onboarding_approval_draft(
  uuid, integer, integer, smallint, uuid, uuid, uuid, text, text, boolean, boolean
) rename to save_onboarding_approval_draft_snapshot_row_base;
revoke all on function public.save_onboarding_approval_draft_snapshot_row_base(
  uuid, integer, integer, smallint, uuid, uuid, uuid, text, text, boolean, boolean
) from public, anon, authenticated;

create function public.save_onboarding_approval_draft(
  p_request_id uuid,
  p_expected_request_revision integer,
  p_expected_draft_version integer,
  p_step smallint,
  p_counterparty_id uuid default null,
  p_assigned_manager_id uuid default null,
  p_price_profile_id uuid default null,
  p_payment_model text default null,
  p_initial_profile text default null,
  p_finance_access boolean default false,
  p_order_access boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  input_counterparty public.one_c_counterparties%rowtype;
  input_price_profile public.one_c_counterparty_price_profiles%rowtype;
  revision public.onboarding_application_revisions%rowtype;
  draft public.onboarding_approval_drafts%rowtype;
  canonical_counterparty_id uuid := p_counterparty_id;
  canonical_price_profile_id uuid := p_price_profile_id;
  result jsonb;
begin
  if not public.has_internal_permission('onboarding.requests.review') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  perform public.rebase_onboarding_1c_snapshot_references(p_request_id, auth.uid(), true);
  select draft_row.* into draft from public.onboarding_approval_drafts draft_row
  where draft_row.request_id = p_request_id;
  select revision_row.* into revision
  from public.access_requests request
  join public.onboarding_application_revisions revision_row
    on revision_row.id = request.current_revision_id
  where request.id = p_request_id;

  if p_step = 1 and p_counterparty_id is not null then
    select * into input_counterparty from public.one_c_counterparties
    where id = p_counterparty_id;
    if input_counterparty.id is null then
      raise exception 'counterparty_identity_conflict' using errcode = '23505';
    end if;
    canonical_counterparty_id := public.resolve_onboarding_counterparty_snapshot(
      input_counterparty.external_1c_id,
      revision.requested_fiscal_code
    );
  end if;

  if p_step = 2 and p_price_profile_id is not null then
    select * into input_price_profile from public.one_c_counterparty_price_profiles
    where id = p_price_profile_id;
    if input_price_profile.id is null then
      raise exception 'invalid_price_profile' using errcode = '22023';
    end if;
    canonical_price_profile_id := public.resolve_onboarding_price_profile_snapshot(
      draft.confirmed_counterparty_external_1c_id,
      input_price_profile.external_1c_id
    );
  end if;

  result := public.save_onboarding_approval_draft_snapshot_row_base(
    p_request_id, p_expected_request_revision, p_expected_draft_version, p_step,
    canonical_counterparty_id, p_assigned_manager_id, canonical_price_profile_id,
    p_payment_model, p_initial_profile, p_finance_access, p_order_access
  );
  perform public.rebase_onboarding_1c_snapshot_references(p_request_id, auth.uid(), false);
  return result;
end;
$$;

revoke all on function public.save_onboarding_approval_draft(
  uuid, integer, integer, smallint, uuid, uuid, uuid, text, text, boolean, boolean
) from public, anon;
grant execute on function public.save_onboarding_approval_draft(
  uuid, integer, integer, smallint, uuid, uuid, uuid, text, text, boolean, boolean
) to authenticated;

alter function public.approve_partner_access_request_v3(uuid, integer, integer, uuid, uuid)
  rename to approve_partner_access_request_v3_snapshot_row_base;
revoke all on function public.approve_partner_access_request_v3_snapshot_row_base(
  uuid, integer, integer, uuid, uuid
) from public, anon, authenticated;

create function public.approve_partner_access_request_v3(
  p_request_id uuid,
  p_expected_request_revision integer,
  p_expected_draft_version integer,
  p_attempt_key uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
  draft public.onboarding_approval_drafts%rowtype;
  existing_attempt public.onboarding_approval_attempts%rowtype;
  failure_code text;
  failure_sqlstate text;
  failure_message text;
  approval_result jsonb;
begin
  if actor_id is null or not public.has_internal_permission('onboarding.requests.approve') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into existing_attempt from public.onboarding_approval_attempts
  where request_id = p_request_id and attempt_key = p_attempt_key;
  if existing_attempt.status = 'succeeded' then return existing_attempt.safe_result; end if;

  select * into request from public.access_requests where id = p_request_id;
  select * into draft from public.onboarding_approval_drafts where request_id = p_request_id;

  begin
    perform public.rebase_onboarding_1c_snapshot_references(p_request_id, actor_id, true);
  exception when others then
    failure_sqlstate := sqlstate;
    failure_message := left(sqlerrm, 300);
    failure_code := case
      when sqlerrm in ('counterparty_no_longer_active', 'counterparty_identity_conflict',
        'invalid_price_profile') then sqlerrm
      when sqlstate like '23%' then 'counterparty_identity_conflict'
      else 'unknown_retryable'
    end;
    approval_result := jsonb_build_object(
      'success', false,
      'failureCode', failure_code,
      'correlationId', p_correlation_id,
      'failingStage', 'stable_identity_resolution',
      'sqlState', failure_sqlstate,
      'safeError', failure_message
    );
    insert into public.onboarding_approval_attempts(
      request_id, attempt_key, actor_user_id, request_revision_id,
      draft_version, status, safe_result, correlation_id
    ) values (
      request.id, p_attempt_key, actor_id, request.current_revision_id,
      coalesce(draft.version, p_expected_draft_version), 'failed',
      approval_result, p_correlation_id
    ) on conflict (request_id, attempt_key) do update
      set status = 'failed', safe_result = excluded.safe_result,
          correlation_id = excluded.correlation_id, updated_at = now();
    insert into public.onboarding_events(
      access_request_id, actor_user_id, event_type, previous_status, next_status,
      safe_metadata, correlation_id
    ) values (
      request.id, actor_id, 'approval_failed', request.onboarding_status,
      request.onboarding_status, jsonb_build_object(
        'failure_code', failure_code,
        'failing_stage', 'stable_identity_resolution',
        'sql_state', failure_sqlstate
      ), p_correlation_id
    );
    return approval_result;
  end;

  return public.approve_partner_access_request_v3_snapshot_row_base(
    p_request_id, p_expected_request_revision, p_expected_draft_version,
    p_attempt_key, p_correlation_id
  );
end;
$$;

revoke all on function public.approve_partner_access_request_v3(uuid, integer, integer, uuid, uuid)
  from public, anon;
grant execute on function public.approve_partner_access_request_v3(uuid, integer, integer, uuid, uuid)
  to authenticated;

-- Automatically rebase only rows that resolve unambiguously. Every other
-- legacy draft remains unchanged and fails closed during review/approval.
do $$
declare
  candidate record;
begin
  for candidate in
    select draft.request_id, draft.last_edited_by
    from public.onboarding_approval_drafts draft
    join public.access_requests request on request.id = draft.request_id
    join public.onboarding_application_revisions revision
      on revision.id = request.current_revision_id
    where draft.confirmed_counterparty_external_1c_id is not null
      and (select count(*) from public.one_c_counterparties counterparty
        where counterparty.is_published
          and counterparty.is_active and not counterparty.is_deleted
          and lower(counterparty.external_1c_id) = lower(draft.confirmed_counterparty_external_1c_id)
          and counterparty.normalized_fiscal_code = public.normalize_moldova_fiscal_code(revision.requested_fiscal_code)) = 1
      and (select count(*) from public.one_c_counterparties counterparty
        where counterparty.is_published
          and counterparty.is_active and not counterparty.is_deleted
          and counterparty.normalized_fiscal_code = public.normalize_moldova_fiscal_code(revision.requested_fiscal_code)) = 1
      and (draft.selected_price_profile_external_1c_id is null or
        (select count(*) from public.one_c_counterparty_price_profiles profile
          where profile.is_published and profile.is_active and not profile.is_deleted
            and lower(profile.counterparty_external_1c_id) = lower(draft.confirmed_counterparty_external_1c_id)
            and lower(profile.external_1c_id) = lower(draft.selected_price_profile_external_1c_id)) = 1)
  loop
    perform public.rebase_onboarding_1c_snapshot_references(
      candidate.request_id, candidate.last_edited_by, true
    );
  end loop;
end;
$$;

comment on function public.rebase_onboarding_1c_snapshot_references(uuid, uuid, boolean) is
  'Resolves durable onboarding 1C Ref_Keys to the current published snapshot without changing draft version, attempt key, or request revision.';

commit;
