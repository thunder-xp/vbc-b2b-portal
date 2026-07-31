begin;

alter table public.partner_companies
  add column if not exists assigned_internal_manager_user_id uuid null
    references public.user_profiles(id) on delete restrict,
  add column if not exists onboarding_payment_model text null,
  add column if not exists onboarding_order_access boolean not null default true,
  add column if not exists onboarding_finance_access boolean not null default false;

alter table public.partner_companies
  drop constraint if exists partner_companies_onboarding_payment_model_check;
alter table public.partner_companies
  add constraint partner_companies_onboarding_payment_model_check check (
    onboarding_payment_model is null or onboarding_payment_model in (
      'inherited_from_1c', 'prepayment', 'credit', 'mixed'
    )
  );

create table if not exists public.onboarding_approval_drafts (
  request_id uuid primary key references public.access_requests(id) on delete restrict,
  request_revision_id uuid not null
    references public.onboarding_application_revisions(id) on delete restrict,
  confirmed_counterparty_id uuid null
    references public.one_c_counterparties(id) on delete restrict,
  assigned_internal_manager_user_id uuid null
    references public.user_profiles(id) on delete restrict,
  selected_price_profile_id uuid null
    references public.one_c_counterparty_price_profiles(id) on delete restrict,
  payment_model text null,
  initial_business_profile text null,
  finance_access boolean not null default false,
  order_access boolean not null default true,
  current_step smallint not null default 1,
  version integer not null default 1,
  approval_attempt_key uuid not null default gen_random_uuid(),
  last_edited_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_approval_drafts_payment_check check (
    payment_model is null or payment_model in (
      'inherited_from_1c', 'prepayment', 'credit', 'mixed'
    )
  ),
  constraint onboarding_approval_drafts_profile_check check (
    initial_business_profile is null or initial_business_profile in (
      'owner', 'manager', 'buyer', 'accounting', 'retail_only'
    )
  ),
  constraint onboarding_approval_drafts_step_check check (current_step between 1 and 4),
  constraint onboarding_approval_drafts_version_check check (version > 0)
);

create table if not exists public.onboarding_approval_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.access_requests(id) on delete restrict,
  attempt_key uuid not null,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  request_revision_id uuid not null
    references public.onboarding_application_revisions(id) on delete restrict,
  draft_version integer not null,
  status text not null check (status in ('failed', 'succeeded')),
  safe_result jsonb not null default '{}'::jsonb,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, attempt_key)
);

create index if not exists onboarding_approval_attempts_request_idx
  on public.onboarding_approval_attempts(request_id, created_at desc);

alter table public.onboarding_approval_drafts enable row level security;
alter table public.onboarding_approval_attempts enable row level security;
revoke all on table public.onboarding_approval_drafts from anon, authenticated;
revoke all on table public.onboarding_approval_attempts from anon, authenticated;

alter table public.onboarding_events
  drop constraint if exists onboarding_events_event_type_check;
alter table public.onboarding_events
  add constraint onboarding_events_event_type_check check (event_type in (
    'application_migrated', 'revision_created', 'assigned', 'unassigned',
    'review_started', 'match_suggested', 'match_confirmed',
    'awaiting_1c_company', 'ready_for_approval', 'status_changed',
    'approval_draft_updated', 'onboarding_approved', 'approval_failed',
    'capability_granted', 'capability_revoked'
  ));

create unique index if not exists onboarding_events_one_approval_idx
  on public.onboarding_events(access_request_id, event_type)
  where event_type = 'onboarding_approved';

alter table public.partner_notification_events
  drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events
  add constraint partner_notification_events_code_check check (event_code in (
    'order_submitted', 'order_confirmed', 'order_requires_attention',
    'order_readback_failed', 'order_reconciliation_required', 'order_posted',
    'order_cancelled', 'shipment_due_in_3_days', 'shipment_due_today',
    'shipment_overdue', 'shipment_date_changed', 'date_change_approved',
    'date_change_rejected', 'date_change_cancelled', 'invitation_expiring',
    'invitation_accepted', 'employee_suspended', 'role_changed',
    'price_access_changed', 'onboarding_approved', 'onboarding_access_opened'
  ));

alter table public.partner_notifications
  drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications
  add constraint partner_notifications_event_code_check check (event_code in (
    'order_submitted', 'order_confirmed', 'order_requires_attention',
    'order_readback_failed', 'order_reconciliation_required', 'order_posted',
    'order_cancelled', 'shipment_due_in_3_days', 'shipment_due_today',
    'shipment_overdue', 'shipment_date_changed', 'date_change_approved',
    'date_change_rejected', 'date_change_cancelled', 'invitation_expiring',
    'invitation_accepted', 'employee_suspended', 'role_changed',
    'price_access_changed', 'onboarding_approved', 'onboarding_access_opened'
  ));

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value = '/cabinet'
    or value = '/cabinet/reservation-requests'
    or value = '/cabinet/company/users';
$$;

create or replace function public.onboarding_profile_role_code(profile_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case profile_code
    when 'owner' then 'partner_owner'
    when 'manager' then 'partner_manager'
    when 'buyer' then 'partner_buyer'
    when 'accounting' then 'partner_accounting'
    when 'retail_only' then 'partner_viewer'
    else null
  end;
$$;

create or replace function public.is_onboarding_manager_eligible(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = target_user_id
      and profile.status = 'active'
      and profile.user_type in ('internal', 'admin')
      and (
        exists (
          select 1
          from public.internal_user_role_assignments assignment
          join public.roles role on role.id = assignment.role_id
          where assignment.user_id = profile.id
            and assignment.revoked_at is null
            and role.code = 'novotech_admin'
        )
        or exists (
          select 1
          from public.internal_user_capability_assignments capability
          join public.permissions permission on permission.id = capability.permission_id
          where capability.user_id = profile.id
            and capability.revoked_at is null
            and permission.code = 'onboarding.requests.review'
        )
      )
  );
$$;

create or replace function public.get_onboarding_request_detail_v2(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  base jsonb;
  request public.access_requests%rowtype;
  draft public.onboarding_approval_drafts%rowtype;
  candidates jsonb;
begin
  if not public.has_internal_permission('onboarding.requests.view') then
    raise exception 'Onboarding detail access is not allowed.' using errcode = '42501';
  end if;

  select * into request from public.access_requests where id = p_request_id;
  if request.id is null then return null; end if;

  if request.onboarding_status not in ('approved', 'rejected', 'cancelled') then
    insert into public.onboarding_approval_drafts(
      request_id, request_revision_id, confirmed_counterparty_id,
      assigned_internal_manager_user_id, initial_business_profile,
      last_edited_by
    ) values (
      request.id, request.current_revision_id, request.confirmed_counterparty_id,
      request.assigned_manager_user_id, request.initial_access_profile, actor_id
    ) on conflict (request_id) do nothing;
  end if;

  base := public.get_onboarding_request_detail(p_request_id);
  select * into draft from public.onboarding_approval_drafts where request_id = p_request_id;

  select coalesce(jsonb_agg(
    candidate || jsonb_build_object(
      'contracts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', contract.name,
          'code', contract.code
        ) order by contract.name)
        from public.one_c_counterparties counterparty
        join public.one_c_counterparty_contracts contract
          on contract.counterparty_external_1c_id = counterparty.external_1c_id
        where counterparty.id = (candidate->>'id')::uuid
          and contract.is_published and contract.is_active and not contract.is_deleted
      ), '[]'::jsonb),
      'priceProfiles', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', price_profile.id,
          'name', price_profile.name,
          'code', price_profile.code
        ) order by price_profile.name)
        from public.one_c_counterparties counterparty
        join public.one_c_counterparty_price_profiles price_profile
          on price_profile.counterparty_external_1c_id = counterparty.external_1c_id
        where counterparty.id = (candidate->>'id')::uuid
          and price_profile.is_published
          and price_profile.is_active
          and not price_profile.is_deleted
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb) into candidates
  from jsonb_array_elements(coalesce(base->'candidates', '[]'::jsonb)) candidate;

  return base
    || jsonb_build_object('candidates', candidates)
    || jsonb_build_object('draft', case when draft.request_id is null then null else
      jsonb_build_object(
        'requestRevisionNumber', (
          select revision_number from public.onboarding_application_revisions
          where id = draft.request_revision_id
        ),
        'confirmedCounterpartyId', draft.confirmed_counterparty_id,
        'assignedManagerId', draft.assigned_internal_manager_user_id,
        'selectedPriceProfileId', draft.selected_price_profile_id,
        'paymentModel', draft.payment_model,
        'initialBusinessProfile', draft.initial_business_profile,
        'financeAccess', draft.finance_access,
        'orderAccess', draft.order_access,
        'currentStep', draft.current_step,
        'version', draft.version,
        'attemptKey', draft.approval_attempt_key,
        'updatedAt', draft.updated_at,
        'stale', draft.request_revision_id is distinct from request.current_revision_id
      ) end)
    || jsonb_build_object('directoryFiscalMatchCount', (
      select count(*)
      from public.one_c_counterparties candidate
      join public.onboarding_application_revisions revision
        on revision.id = request.current_revision_id
      where candidate.is_published
        and candidate.normalized_fiscal_code is not null
        and candidate.normalized_fiscal_code = lower(regexp_replace(
          coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'
        ))
    ));
end;
$$;

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
  counterparty public.one_c_counterparties%rowtype;
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
    select * into counterparty from public.one_c_counterparties
      where id = p_counterparty_id and is_published;
    if counterparty.id is null or not counterparty.is_active or counterparty.is_deleted then
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
      and counterparty.normalized_fiscal_code is distinct from normalized_fiscal then
      raise exception 'counterparty_snapshot_stale' using errcode = '22023';
    end if;
    update public.onboarding_approval_drafts
      set confirmed_counterparty_id = counterparty.id,
          current_step = 2,
          version = version + 1,
          approval_attempt_key = gen_random_uuid(),
          last_edited_by = actor_id,
          updated_at = now()
      where request_id = request.id returning * into draft;
  elsif p_step = 2 then
    if draft.confirmed_counterparty_id is null
      or p_payment_model not in ('inherited_from_1c', 'prepayment', 'credit', 'mixed') then
      raise exception 'invalid_price_profile' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.user_profiles manager
      where manager.id = p_assigned_manager_id
        and manager.status = 'active'
        and manager.user_type in ('internal', 'admin')
        and public.is_onboarding_manager_eligible(manager.id)
    ) then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
    if p_price_profile_id is not null and not exists (
      select 1
      from public.one_c_counterparties counterparty
      join public.one_c_counterparty_price_profiles price_profile
        on price_profile.counterparty_external_1c_id = counterparty.external_1c_id
      where counterparty.id = draft.confirmed_counterparty_id
        and price_profile.id = p_price_profile_id
        and price_profile.is_published and price_profile.is_active
        and not price_profile.is_deleted
    ) then
      raise exception 'invalid_price_profile' using errcode = '22023';
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

create or replace function public.set_onboarding_approval_draft_step(
  p_request_id uuid,
  p_expected_draft_version integer,
  p_step smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare saved public.onboarding_approval_drafts%rowtype;
begin
  if not public.has_internal_permission('onboarding.requests.review') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_step not between 1 and 4 then
    raise exception 'invalid_approval_step' using errcode = '22023';
  end if;
  update public.onboarding_approval_drafts
    set current_step = p_step,
        version = version + 1,
        last_edited_by = auth.uid(),
        updated_at = now()
    where request_id = p_request_id and version = p_expected_draft_version
    returning * into saved;
  if saved.request_id is null then
    raise exception 'stale_approval_draft' using errcode = '40001';
  end if;
  return jsonb_build_object('version', saved.version, 'currentStep', saved.current_step);
end;
$$;

create or replace function public.reset_onboarding_approval_draft(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare request public.access_requests%rowtype;
declare saved public.onboarding_approval_drafts%rowtype;
begin
  if not public.has_internal_permission('onboarding.requests.review') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null or request.onboarding_status in ('approved', 'rejected', 'cancelled') then
    raise exception 'stale_request_revision' using errcode = '55000';
  end if;
  update public.onboarding_approval_drafts
    set request_revision_id = request.current_revision_id,
        confirmed_counterparty_id = null,
        assigned_internal_manager_user_id = request.assigned_manager_user_id,
        selected_price_profile_id = null,
        payment_model = null,
        initial_business_profile = null,
        finance_access = false,
        order_access = true,
        current_step = 1,
        version = version + 1,
        approval_attempt_key = gen_random_uuid(),
        last_edited_by = auth.uid(),
        updated_at = now()
    where request_id = request.id returning * into saved;
  return jsonb_build_object('version', saved.version, 'currentStep', saved.current_step);
end;
$$;

create or replace function public.approve_partner_access_request_v3(
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
  requester public.user_profiles%rowtype;
  revision public.onboarding_application_revisions%rowtype;
  draft public.onboarding_approval_drafts%rowtype;
  counterparty public.one_c_counterparties%rowtype;
  price_profile public.one_c_counterparty_price_profiles%rowtype;
  company public.partner_companies%rowtype;
  membership public.company_memberships%rowtype;
  partner_role public.roles%rowtype;
  existing_attempt public.onboarding_approval_attempts%rowtype;
  permission_record record;
  normalized_fiscal text;
  failure_code text;
  company_branch text;
  membership_outcome text;
  notification_event_id uuid;
  approval_result jsonb;
begin
  if actor_id is null or not public.has_internal_permission('onboarding.requests.approve') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_profiles actor
    where actor.id = actor_id and actor.status = 'active'
      and actor.user_type in ('internal', 'admin')
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into request from public.access_requests where id = p_request_id for update;
  if request.id is null then
    raise exception 'stale_request_revision' using errcode = 'P0002';
  end if;
  select * into existing_attempt from public.onboarding_approval_attempts
    where request_id = p_request_id and attempt_key = p_attempt_key;
  if existing_attempt.status = 'succeeded' then return existing_attempt.safe_result; end if;

  select * into revision from public.onboarding_application_revisions
    where id = request.current_revision_id;
  select * into draft from public.onboarding_approval_drafts
    where request_id = request.id for update;

  begin
    if request.onboarding_status = 'approved' then
      raise exception 'already_approved' using errcode = '55000';
    end if;
    if request.onboarding_status <> 'ready_for_approval'
      or revision.revision_number <> p_expected_request_revision
      or draft.request_revision_id <> request.current_revision_id then
      raise exception 'stale_request_revision' using errcode = '40001';
    end if;
    if draft.version <> p_expected_draft_version
      or draft.approval_attempt_key <> p_attempt_key then
      raise exception 'stale_approval_draft' using errcode = '40001';
    end if;
    if draft.confirmed_counterparty_id is null
      or draft.assigned_internal_manager_user_id is null
      or draft.payment_model is null
      or draft.initial_business_profile is null then
      raise exception 'invalid_initial_profile' using errcode = '22023';
    end if;

    select * into counterparty from public.one_c_counterparties
      where id = draft.confirmed_counterparty_id and is_published;
    if counterparty.id is null or not counterparty.is_active or counterparty.is_deleted
      or counterparty.synchronized_at < now() - interval '36 hours' then
      raise exception 'counterparty_snapshot_stale' using errcode = '55000';
    end if;
    normalized_fiscal := lower(regexp_replace(
      coalesce(revision.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'
    ));
    if nullif(normalized_fiscal, '') is null
      or counterparty.normalized_fiscal_code is distinct from normalized_fiscal
      or (select count(*) from public.one_c_counterparties candidate
          where candidate.is_published
            and candidate.normalized_fiscal_code = normalized_fiscal) <> 1 then
      raise exception 'duplicate_company_conflict' using errcode = '23505';
    end if;

    if draft.initial_business_profile <> 'retail_only' then
      select * into price_profile from public.one_c_counterparty_price_profiles
        where id = draft.selected_price_profile_id
          and counterparty_external_1c_id = counterparty.external_1c_id
          and is_published and is_active and not is_deleted;
      if price_profile.id is null then
        raise exception 'invalid_price_profile' using errcode = '22023';
      end if;
    end if;

    if not exists (
      select 1 from public.user_profiles manager
      where manager.id = draft.assigned_internal_manager_user_id
        and manager.status = 'active'
        and manager.user_type in ('internal', 'admin')
        and public.is_onboarding_manager_eligible(manager.id)
    ) then raise exception 'permission_denied' using errcode = '42501'; end if;

    select * into requester from public.user_profiles
      where id = request.user_profile_id for update;
    if requester.id is null or requester.status in ('revoked', 'rejected', 'suspended')
      or requester.user_type in ('internal', 'admin', 'system') then
      raise exception 'user_membership_conflict' using errcode = '23505';
    end if;
    select * into company from public.partner_companies existing_company
      where lower(existing_company.external_1c_id) = lower(counterparty.external_1c_id)
      for update;
    if company.id is null then
      if exists (
        select 1 from public.partner_companies conflicting_company
        join public.access_requests approved_request
          on approved_request.company_id = conflicting_company.id
        where approved_request.status = 'approved'
          and lower(regexp_replace(coalesce(approved_request.requested_fiscal_code, ''), '[^[:alnum:]]+', '', 'g')) = normalized_fiscal
          and lower(conflicting_company.external_1c_id) <> lower(counterparty.external_1c_id)
      ) then raise exception 'duplicate_company_conflict' using errcode = '23505'; end if;
      insert into public.partner_companies(
        external_1c_id, external_1c_code, external_1c_price_type_id,
        display_name, status, assigned_internal_manager_user_id,
        onboarding_payment_model, onboarding_order_access,
        onboarding_finance_access
      ) values (
        lower(counterparty.external_1c_id), counterparty.external_code,
        case when draft.initial_business_profile = 'retail_only' then null
          else price_profile.external_1c_id end,
        counterparty.name, 'active', draft.assigned_internal_manager_user_id,
        draft.payment_model, draft.order_access, draft.finance_access
      ) returning * into company;
      company_branch := 'created';
    else
      if company.status <> 'active' then
        raise exception 'duplicate_company_conflict' using errcode = '23505';
      end if;
      if draft.initial_business_profile <> 'retail_only'
        and company.external_1c_price_type_id is not null
        and lower(company.external_1c_price_type_id) <> lower(price_profile.external_1c_id) then
        raise exception 'invalid_price_profile' using errcode = '23505';
      end if;
      update public.partner_companies
        set external_1c_code = coalesce(external_1c_code, counterparty.external_code),
            external_1c_price_type_id = case
              when draft.initial_business_profile = 'retail_only' then external_1c_price_type_id
              else coalesce(external_1c_price_type_id, price_profile.external_1c_id)
            end,
            assigned_internal_manager_user_id = draft.assigned_internal_manager_user_id,
            onboarding_payment_model = draft.payment_model,
            onboarding_order_access = draft.order_access,
            onboarding_finance_access = draft.finance_access
        where id = company.id returning * into company;
      company_branch := 'reused';
    end if;

    if counterparty.portal_company_id is not null
      and counterparty.portal_company_id is distinct from company.id then
      raise exception 'counterparty_already_linked' using errcode = '23505';
    end if;
    if request.company_id is not null and request.company_id is distinct from company.id then
      raise exception 'duplicate_company_conflict' using errcode = '23505';
    end if;
    if exists (
      select 1 from public.company_memberships existing_membership
      where existing_membership.user_id = requester.id
        and existing_membership.status = 'active'
        and existing_membership.company_id is distinct from company.id
    ) then raise exception 'user_membership_conflict' using errcode = '23505'; end if;

    select * into partner_role from public.roles role
      where role.code = public.onboarding_profile_role_code(draft.initial_business_profile)
        and role.scope = 'partner';
    if partner_role.id is null then
      raise exception 'invalid_initial_profile' using errcode = '22023';
    end if;

    select * into membership from public.company_memberships existing_membership
      where existing_membership.user_id = requester.id
        and existing_membership.company_id = company.id for update;
    if membership.id is null then
      insert into public.company_memberships(
        user_id, company_id, role_id, status, approved_by, approved_at
      ) values (
        requester.id, company.id, partner_role.id, 'active', actor_id, now()
      ) returning * into membership;
      membership_outcome := 'created';
    else
      update public.company_memberships
        set role_id = partner_role.id, status = 'active', approved_by = actor_id,
            approved_at = coalesce(approved_at, now()), revoked_by = null, revoked_at = null
        where id = membership.id returning * into membership;
      membership_outcome := 'reused';
    end if;

    for permission_record in
      select id, code from public.permissions
      where code in (
        'pricing.partner_price.view', 'pricing.retail_price.view',
        'cart.manage', 'orders.create', 'orders.view_company',
        'finance.view_company'
      )
    loop
      insert into public.membership_permission_overrides(
        membership_id, permission_id, effect, created_by
      ) values (
        membership.id,
        permission_record.id,
        case permission_record.code
          when 'pricing.partner_price.view' then
            case when draft.initial_business_profile = 'retail_only' then 'deny' else 'allow' end
          when 'pricing.retail_price.view' then 'allow'
          when 'finance.view_company' then
            case when draft.finance_access then 'allow' else 'deny' end
          when 'orders.view_company' then
            case when draft.initial_business_profile = 'retail_only' then 'deny' else 'allow' end
          else case when draft.order_access then 'allow' else 'deny' end
        end,
        actor_id
      ) on conflict (membership_id, permission_id) do update
        set effect = excluded.effect, created_by = excluded.created_by, updated_at = now();
    end loop;

    update public.user_profiles set status = 'active', user_type = 'partner'
      where id = requester.id;
    update public.access_requests
      set company_id = company.id,
          requested_external_1c_id = counterparty.external_1c_id,
          assigned_manager_user_id = draft.assigned_internal_manager_user_id,
          initial_access_profile = draft.initial_business_profile,
          onboarding_status = 'approved',
          status = 'approved',
          reviewed_by = actor_id,
          reviewed_at = now(),
          last_activity_at = now()
      where id = request.id;

    insert into public.company_user_events(
      company_id, target_user_id, actor_user_id, event_type, safe_payload
    ) values (
      company.id, requester.id, actor_id, 'admin_intervention',
      jsonb_build_object(
        'operation', 'onboarding_approved',
        'business_profile', draft.initial_business_profile,
        'company_branch', company_branch,
        'membership_outcome', membership_outcome,
        'correlation_id', p_correlation_id
      )
    );
    insert into public.onboarding_events(
      access_request_id, actor_user_id, event_type, previous_status, next_status,
      safe_metadata, correlation_id
    ) values (
      request.id, actor_id, 'onboarding_approved', request.onboarding_status, 'approved',
      jsonb_build_object(
        'business_profile', draft.initial_business_profile,
        'company_branch', company_branch,
        'membership_outcome', membership_outcome
      ), p_correlation_id
    ) on conflict (access_request_id, event_type) where event_type = 'onboarding_approved' do nothing;

    insert into public.partner_notification_events(
      company_id, event_code, event_group, domain, entity_type, entity_id,
      source_table, source_event_id, source_version, occurred_at, safe_payload,
      fingerprint
    ) values (
      company.id, 'onboarding_access_opened', 'company_access', 'onboarding',
      'access_request', request.id, 'access_requests', request.id,
      draft.version::text, now(), '{}'::jsonb,
      encode(extensions.digest('onboarding_access_opened|' || request.id::text, 'sha256'), 'hex')
    ) on conflict (fingerprint) do update set fingerprint = excluded.fingerprint
    returning id into notification_event_id;

    insert into public.partner_notifications(
      company_id, recipient_user_id, event_code, event_group, domain, severity,
      mandatory, title, message, action_label, action_url, entity_type,
      entity_id, occurred_at, deduplication_key, source_event_id, expires_at,
      retention_until, email_enabled_snapshot, email_delivery_mode
    ) values (
      company.id, requester.id, 'onboarding_access_opened', 'company_access',
      'onboarding', 'success', true, 'Доступ к кабинету открыт',
      'Компания подключена к партнёрской платформе Novotech.',
      'Открыть кабинет', '/cabinet', 'access_request', request.id, now(),
      'onboarding-approved:' || request.id::text, notification_event_id,
      now() + interval '90 days', now() + interval '365 days', false, 'off'
    ) on conflict (recipient_user_id, deduplication_key) do nothing;

    approval_result := jsonb_build_object(
      'success', true,
      'idempotent', false,
      'companyBranch', company_branch,
      'membershipOutcome', membership_outcome
    );
    insert into public.onboarding_approval_attempts(
      request_id, attempt_key, actor_user_id, request_revision_id,
      draft_version, status, safe_result, correlation_id
    ) values (
      request.id, p_attempt_key, actor_id, request.current_revision_id,
      draft.version, 'succeeded', approval_result, p_correlation_id
    ) on conflict (request_id, attempt_key) do update
      set status = 'succeeded', safe_result = excluded.safe_result, updated_at = now();
    return approval_result;
  exception when others then
    failure_code := case
      when sqlerrm in (
        'stale_request_revision', 'stale_approval_draft',
        'counterparty_snapshot_stale', 'duplicate_company_conflict',
        'counterparty_already_linked', 'user_membership_conflict',
        'invalid_price_profile', 'invalid_initial_profile', 'permission_denied',
        'already_approved'
      ) then sqlerrm
      else 'unknown_retryable'
    end;
  end;

  approval_result := jsonb_build_object(
    'success', false,
    'failureCode', failure_code,
    'correlationId', p_correlation_id
  );
  insert into public.onboarding_approval_attempts(
    request_id, attempt_key, actor_user_id, request_revision_id,
    draft_version, status, safe_result, correlation_id
  ) values (
    request.id, p_attempt_key, actor_id, request.current_revision_id,
    coalesce(draft.version, p_expected_draft_version), 'failed',
    approval_result, p_correlation_id
  ) on conflict (request_id, attempt_key) do update
    set status = 'failed', safe_result = excluded.safe_result, updated_at = now();
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'approval_failed', request.onboarding_status,
    request.onboarding_status, jsonb_build_object('failure_code', failure_code),
    p_correlation_id
  );
  return approval_result;
end;
$$;

revoke all on function public.onboarding_profile_role_code(text) from public, anon, authenticated;
revoke all on function public.is_onboarding_manager_eligible(uuid) from public, anon, authenticated;
revoke all on function public.get_onboarding_request_detail_v2(uuid) from public, anon;
revoke all on function public.save_onboarding_approval_draft(uuid, integer, integer, smallint, uuid, uuid, uuid, text, text, boolean, boolean) from public, anon;
revoke all on function public.set_onboarding_approval_draft_step(uuid, integer, smallint) from public, anon;
revoke all on function public.reset_onboarding_approval_draft(uuid) from public, anon;
revoke all on function public.approve_partner_access_request_v3(uuid, integer, integer, uuid, uuid) from public, anon;
grant execute on function public.get_onboarding_request_detail_v2(uuid) to authenticated;
grant execute on function public.save_onboarding_approval_draft(uuid, integer, integer, smallint, uuid, uuid, uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.set_onboarding_approval_draft_step(uuid, integer, smallint) to authenticated;
grant execute on function public.reset_onboarding_approval_draft(uuid) to authenticated;
grant execute on function public.approve_partner_access_request_v3(uuid, integer, integer, uuid, uuid) to authenticated;

comment on function public.approve_partner_access_request_v3(uuid, integer, integer, uuid, uuid) is
  'Atomically approves one ready onboarding draft using only server-validated directory, access-profile, company, membership, notification, and audit state. V2 remains available for deployed compatibility.';

commit;
