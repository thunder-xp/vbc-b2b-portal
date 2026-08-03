begin;

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean language sql immutable set search_path = public as $$
  select value = '/cabinet'
    or value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value ~ '^/cabinet/service/[0-9a-f-]{36}$'
    or value = '/cabinet/reservation-requests'
    or value = '/cabinet/company/users'
    or value ~ '^/cabinet/catalog/[a-z0-9-]+$'
    or value = '/cabinet/cart'
    or value = '/cabinet/offers'
    or value ~ '^/cabinet/offers/[0-9a-f-]{36}$'
    or value = '/cabinet/documents';
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
  failure_sqlstate text;
  failure_message text;
  failure_stage text := 'preconditions';
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

    failure_stage := 'counterparty_validation';
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
    failure_stage := 'company_resolution';
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

    failure_stage := 'membership_activation';
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

    insert into public.user_company_context_preferences(
      user_id, active_membership_id, changed_by
    ) values (
      requester.id, membership.id, actor_id
    ) on conflict (user_id) do update
      set active_membership_id = excluded.active_membership_id,
          version = public.user_company_context_preferences.version + 1,
          changed_by = excluded.changed_by,
          changed_at = now();

    failure_stage := 'capability_projection';
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

    failure_stage := 'identity_activation';
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

    failure_stage := 'approval_audit';
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

    failure_stage := 'notification_projection';
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

    failure_stage := 'approval_result';
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
      set status = 'succeeded',
          safe_result = excluded.safe_result,
          correlation_id = excluded.correlation_id,
          updated_at = now();
    return approval_result;
  exception when others then
    failure_sqlstate := sqlstate;
    failure_message := left(sqlerrm, 300);
    failure_code := case
      when sqlerrm in (
        'stale_request_revision', 'stale_approval_draft',
        'counterparty_snapshot_stale', 'duplicate_company_conflict',
        'counterparty_already_linked', 'user_membership_conflict',
        'invalid_price_profile', 'invalid_initial_profile', 'permission_denied',
        'already_approved'
      ) then sqlerrm
      when sqlstate = '40001' then 'ONBOARDING_DRAFT_VERSION_CONFLICT'
      when sqlstate = '42501' then 'ONBOARDING_MANAGER_INVALID'
      when sqlstate = '22023' then 'ONBOARDING_COMMERCIAL_VALIDATION_FAILED'
      when sqlstate like '23%' then 'ONBOARDING_COMMERCIAL_PERSISTENCE_FAILED'
      when sqlstate like '08%' or sqlstate like '53%' or sqlstate like '57%'
        then 'ONBOARDING_INFRASTRUCTURE_FAILURE'
      else 'unknown_retryable'
    end;
  end;

  approval_result := jsonb_build_object(
    'success', false,
    'failureCode', failure_code,
    'correlationId', p_correlation_id,
    'failingStage', failure_stage,
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
    set status = 'failed',
        safe_result = excluded.safe_result,
        correlation_id = excluded.correlation_id,
        updated_at = now();
  insert into public.onboarding_events(
    access_request_id, actor_user_id, event_type, previous_status, next_status,
    safe_metadata, correlation_id
  ) values (
    request.id, actor_id, 'approval_failed', request.onboarding_status,
    request.onboarding_status, jsonb_build_object(
      'failure_code', failure_code,
      'failing_stage', failure_stage,
      'sql_state', failure_sqlstate
    ),
    p_correlation_id
  );
  return approval_result;
end;
$$;

revoke all on function public.approve_partner_access_request_v3(uuid, integer, integer, uuid, uuid)
from public, anon;
grant execute on function public.approve_partner_access_request_v3(uuid, integer, integer, uuid, uuid)
to authenticated;

commit;
