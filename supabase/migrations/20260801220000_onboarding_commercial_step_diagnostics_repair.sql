begin;

create or replace function public.save_onboarding_approval_draft(
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
  actor_id uuid := auth.uid();
  request public.access_requests%rowtype;
  revision public.onboarding_application_revisions%rowtype;
  draft public.onboarding_approval_drafts%rowtype;
  selected_counterparty public.one_c_counterparties%rowtype;
  normalized_fiscal text;
  fiscal_matches integer;
begin
  if not public.has_internal_permission('onboarding.requests.review') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_step not between 1 and 3 then
    raise exception 'invalid_approval_step' using errcode = '22023';
  end if;

  select * into request from public.access_requests where id = p_request_id for update;
  select * into revision from public.onboarding_application_revisions
    where id = request.current_revision_id;
  select * into draft from public.onboarding_approval_drafts
    where request_id = p_request_id for update;

  if request.id is null or draft.request_id is null then
    raise exception 'approval_draft_not_found' using errcode = 'P0002';
  end if;
  if request.onboarding_status in ('approved', 'rejected', 'cancelled', 'clarification_requested') then
    raise exception 'stale_request_revision' using errcode = '55000';
  end if;
  if revision.revision_number <> p_expected_request_revision
    or draft.request_revision_id <> request.current_revision_id then
    raise exception 'stale_request_revision' using errcode = '40001';
  end if;
  if draft.version <> p_expected_draft_version then
    raise exception 'stale_approval_draft' using errcode = '40001';
  end if;

  if p_step = 1 then
    select * into selected_counterparty from public.one_c_counterparties
      where id = p_counterparty_id and is_published;
    if selected_counterparty.id is null
      or not selected_counterparty.is_active
      or selected_counterparty.is_deleted then
      raise exception 'counterparty_snapshot_stale' using errcode = '22023';
    end if;
    normalized_fiscal := lower(regexp_replace(
      coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'
    ));
    select count(*) into fiscal_matches from public.one_c_counterparties candidate
      where candidate.is_published
        and candidate.normalized_fiscal_code = nullif(normalized_fiscal, '');
    if fiscal_matches > 1 then
      raise exception 'duplicate_company_conflict' using errcode = '23505';
    end if;
    if nullif(normalized_fiscal, '') is not null
      and selected_counterparty.normalized_fiscal_code is distinct from normalized_fiscal then
      raise exception 'counterparty_snapshot_stale' using errcode = '22023';
    end if;
    update public.onboarding_approval_drafts
      set confirmed_counterparty_id = selected_counterparty.id,
          current_step = 2,
          version = version + 1,
          approval_attempt_key = gen_random_uuid(),
          last_edited_by = actor_id,
          updated_at = now()
      where request_id = request.id returning * into draft;
  elsif p_step = 2 then
    if draft.confirmed_counterparty_id is null
      or p_payment_model not in ('inherited_from_1c', 'prepayment', 'credit', 'mixed') then
      raise exception 'onboarding_commercial_validation_failed' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.user_profiles manager
      where manager.id = p_assigned_manager_id
        and manager.status = 'active'
        and manager.user_type in ('internal', 'admin')
        and public.is_onboarding_manager_eligible(manager.id)
    ) then
      raise exception 'onboarding_manager_invalid' using errcode = '22023';
    end if;
    if p_price_profile_id is not null and not exists (
      select 1
      from public.one_c_counterparties profile_counterparty
      join public.one_c_counterparty_price_profiles price_profile
        on price_profile.counterparty_external_1c_id = profile_counterparty.external_1c_id
      where profile_counterparty.id = draft.confirmed_counterparty_id
        and price_profile.id = p_price_profile_id
        and price_profile.is_published and price_profile.is_active
        and not price_profile.is_deleted
    ) then
      raise exception 'onboarding_partner_status_invalid' using errcode = '22023';
    end if;
    update public.onboarding_approval_drafts
      set assigned_internal_manager_user_id = p_assigned_manager_id,
          selected_price_profile_id = p_price_profile_id,
          payment_model = p_payment_model,
          finance_access = p_finance_access,
          order_access = p_order_access,
          current_step = 3,
          version = version + 1,
          approval_attempt_key = gen_random_uuid(),
          last_edited_by = actor_id,
          updated_at = now()
      where request_id = request.id returning * into draft;
  else
    if request.onboarding_status not in (
      'under_review', 'awaiting_1c_company', 'link_confirmation_required',
      'ready_for_approval'
    ) then
      raise exception 'stale_request_revision' using errcode = '55000';
    end if;
    if public.onboarding_profile_role_code(p_initial_profile) is null then
      raise exception 'invalid_initial_profile' using errcode = '22023';
    end if;
    if p_initial_profile <> 'retail_only' and draft.selected_price_profile_id is null then
      raise exception 'invalid_price_profile' using errcode = '22023';
    end if;
    update public.onboarding_approval_drafts
      set initial_business_profile = p_initial_profile,
          finance_access = case
            when p_initial_profile in ('owner', 'accounting') then true
            when p_initial_profile = 'manager' then finance_access
            else false
          end,
          order_access = case
            when p_initial_profile = 'owner' then true
            when p_initial_profile in ('manager', 'buyer') then order_access
            else false
          end,
          current_step = 4,
          version = version + 1,
          approval_attempt_key = gen_random_uuid(),
          last_edited_by = actor_id,
          updated_at = now()
      where request_id = request.id returning * into draft;
    update public.access_requests
      set confirmed_counterparty_id = draft.confirmed_counterparty_id,
          assigned_manager_user_id = draft.assigned_internal_manager_user_id,
          initial_access_profile = draft.initial_business_profile,
          onboarding_status = 'ready_for_approval',
          last_activity_at = now()
      where id = request.id;
    if request.onboarding_status <> 'ready_for_approval' then
      insert into public.onboarding_events(
        access_request_id, actor_user_id, event_type, previous_status, next_status,
        safe_metadata
      ) values (
        request.id, actor_id, 'ready_for_approval', request.onboarding_status,
        'ready_for_approval', '{}'::jsonb
      );
    end if;
  end if;

  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata
  ) values (
    request.id, actor_id, 'approval_draft_updated', request.onboarding_status,
    request.onboarding_status, jsonb_build_object('step', p_step, 'draft_version', draft.version)
  );
  return jsonb_build_object('version', draft.version, 'currentStep', draft.current_step);
end;
$$;

revoke all on function public.save_onboarding_approval_draft(
  uuid, integer, integer, smallint, uuid, uuid, uuid, text, text, boolean, boolean
) from public, anon;
grant execute on function public.save_onboarding_approval_draft(
  uuid, integer, integer, smallint, uuid, uuid, uuid, text, text, boolean, boolean
) to authenticated;

comment on function public.save_onboarding_approval_draft(
  uuid, integer, integer, smallint, uuid, uuid, uuid, text, text, boolean, boolean
) is 'Persists one versioned onboarding wizard step with unambiguous commercial profile validation and stable domain errors.';

commit;
