begin;

alter table public.partner_integrity_repair_events
  drop constraint if exists partner_integrity_repair_events_operation_type_check;

alter table public.partner_integrity_repair_events
  add constraint partner_integrity_repair_events_operation_type_check check (
    operation_type in (
      'move_membership', 'add_membership', 'restore_company', 'restore_membership',
      'relink_approved_request', 'suspend_membership', 'reactivate_membership',
      'change_membership_role', 'set_default_company', 'rerun_bootstrap',
      'rebind_company_identity'
    )
  );

create or replace function public.rebind_partner_company_to_canonical_counterparty(
  p_company_id uuid,
  p_duplicate_counterparty_ref text,
  p_canonical_counterparty_ref text,
  p_expected_fiscal_code text,
  p_actor_user_id uuid,
  p_reason text,
  p_operation_key uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  company public.partner_companies%rowtype;
  duplicate_counterparty public.one_c_counterparties%rowtype;
  canonical_counterparty public.one_c_counterparties%rowtype;
  membership public.company_memberships%rowtype;
  actor public.user_profiles%rowtype;
  existing_event public.partner_integrity_repair_events%rowtype;
  audit_id uuid;
  normalized_expected_fiscal text;
  preserved_counts jsonb;
  commercial_reconciliation jsonb;
begin
  if session_user <> 'postgres' and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Partner company identity rebind requires service role.' using errcode = '42501';
  end if;
  if p_company_id is null
    or p_actor_user_id is null
    or p_operation_key is null
    or p_correlation_id is null
    or nullif(btrim(p_duplicate_counterparty_ref), '') is null
    or nullif(btrim(p_canonical_counterparty_ref), '') is null
    or lower(btrim(p_duplicate_counterparty_ref)) = lower(btrim(p_canonical_counterparty_ref)) then
    raise exception 'Invalid partner company identity rebind request.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 20 and 2000 then
    raise exception 'Partner company identity rebind reason is required.' using errcode = '22023';
  end if;

  normalized_expected_fiscal := lower(regexp_replace(
    coalesce(p_expected_fiscal_code, ''), '[^[:alnum:]]+', '', 'g'
  ));
  if nullif(normalized_expected_fiscal, '') is null then
    raise exception 'A stable fiscal identity is required.' using errcode = '22023';
  end if;

  select * into actor
  from public.user_profiles profile
  where profile.id = p_actor_user_id
    and profile.status = 'active'
    and profile.user_type in ('internal', 'admin');
  if actor.id is null then
    raise exception 'An active internal actor is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_key::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_duplicate_counterparty_ref)), 0));
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_canonical_counterparty_ref)), 0));

  select * into existing_event
  from public.partner_integrity_repair_events event
  where event.operation_key = p_operation_key;
  if existing_event.id is not null then
    return jsonb_build_object(
      'code', 'ALREADY_MERGED',
      'idempotent', true,
      'companyId', existing_event.target_company_id,
      'membershipId', existing_event.target_membership_id,
      'auditEventId', existing_event.id,
      'correlationId', existing_event.correlation_id,
      'preservedReferenceCounts', existing_event.safe_metadata -> 'preservedReferenceCounts'
    );
  end if;

  select * into company
  from public.partner_companies target
  where target.id = p_company_id
  for update;
  if company.id is null or company.status <> 'active' then
    raise exception 'An active portal company is required.' using errcode = '55000';
  end if;

  select * into duplicate_counterparty
  from public.one_c_counterparties source
  where source.is_published
    and lower(source.external_1c_id) = lower(btrim(p_duplicate_counterparty_ref))
  for update;
  select * into canonical_counterparty
  from public.one_c_counterparties target
  where target.is_published
    and lower(target.external_1c_id) = lower(btrim(p_canonical_counterparty_ref))
  for update;

  if duplicate_counterparty.id is null or canonical_counterparty.id is null then
    raise exception 'Both current 1C counterparty identities are required.' using errcode = 'P0002';
  end if;
  if duplicate_counterparty.normalized_fiscal_code is distinct from normalized_expected_fiscal
    or canonical_counterparty.normalized_fiscal_code is distinct from normalized_expected_fiscal then
    raise exception 'Counterparty fiscal identity mismatch.' using errcode = '23505';
  end if;
  if not canonical_counterparty.is_active or canonical_counterparty.is_deleted then
    raise exception 'Canonical 1C counterparty must be active and not deleted.' using errcode = '55000';
  end if;
  if duplicate_counterparty.portal_company_id is distinct from company.id then
    raise exception 'Duplicate 1C counterparty is not linked to the requested portal company.' using errcode = '23505';
  end if;
  if exists (
    select 1
    from public.partner_companies other
    where other.id <> company.id
      and lower(other.external_1c_id) = lower(canonical_counterparty.external_1c_id)
  ) or (
    canonical_counterparty.portal_company_id is not null
    and canonical_counterparty.portal_company_id <> company.id
  ) then
    raise exception 'Canonical 1C counterparty is already linked to another portal company.' using errcode = '23505';
  end if;

  if lower(company.external_1c_id) = lower(canonical_counterparty.external_1c_id) then
    select * into existing_event
    from public.partner_integrity_repair_events event
    where event.operation_type = 'rebind_company_identity'
      and event.target_company_id = company.id
      and lower(event.safe_metadata ->> 'canonicalCounterpartyRef') = lower(canonical_counterparty.external_1c_id)
    order by event.occurred_at desc
    limit 1;
    if existing_event.id is null then
      raise exception 'Canonical identity is already set but governed merge evidence is missing.' using errcode = '55000';
    end if;
    return jsonb_build_object(
      'code', 'ALREADY_MERGED',
      'idempotent', true,
      'companyId', company.id,
      'membershipId', existing_event.target_membership_id,
      'auditEventId', existing_event.id,
      'correlationId', existing_event.correlation_id,
      'preservedReferenceCounts', existing_event.safe_metadata -> 'preservedReferenceCounts'
    );
  end if;
  if lower(company.external_1c_id) <> lower(duplicate_counterparty.external_1c_id) then
    raise exception 'Portal company is not bound to the expected duplicate 1C identity.' using errcode = '23505';
  end if;

  select * into membership
  from public.company_memberships target_membership
  where target_membership.company_id = company.id
    and target_membership.status = 'active'
  order by target_membership.created_at, target_membership.id
  limit 1
  for update;
  if membership.id is null then
    raise exception 'An active partner membership is required.' using errcode = '55000';
  end if;

  select jsonb_build_object(
    'companyMemberships', (select count(*) from public.company_memberships row where row.company_id = company.id),
    'activeCompanySelections', (select count(*) from public.user_company_context_preferences preference join public.company_memberships selected on selected.id = preference.active_membership_id where selected.company_id = company.id),
    'accessRequests', (select count(*) from public.access_requests row where row.company_id = company.id),
    'carts', (select count(*) from public.carts row where row.company_id = company.id),
    'estimates', (select count(*) from public.estimates row where row.company_id = company.id),
    'estimateVersions', (select count(*) from public.estimate_versions row where row.company_id = company.id),
    'partnerOrders', (select count(*) from public.partner_orders row where row.company_id = company.id),
    'orderHistory', (select count(*) from public.partner_order_history row where row.company_id = company.id),
    'finalCustomers', (select count(*) from public.partner_final_customers row where row.company_id = company.id),
    'notifications', (select count(*) from public.partner_notifications row where row.company_id = company.id),
    'purchasingLists', (select count(*) from public.purchasing_lists row where row.company_id = company.id),
    'financeSyncEvents', (select count(*) from public.partner_finance_sync_events row where row.company_id = company.id),
    'financeSyncState', (select count(*) from public.partner_finance_sync_state row where row.company_id = company.id),
    'documents', (select count(*) from public.partner_documents row where row.company_id = company.id),
    'commercialOpportunities', (select count(*) from public.partner_commercial_opportunities row where row.company_id = company.id)
  ) into preserved_counts;

  update public.one_c_counterparties
  set portal_company_id = null,
      updated_at = now()
  where id = duplicate_counterparty.id;

  update public.partner_companies
  set external_1c_id = lower(canonical_counterparty.external_1c_id),
      external_1c_code = canonical_counterparty.external_code,
      display_name = canonical_counterparty.name,
      updated_at = now()
  where id = company.id;

  update public.one_c_counterparties
  set portal_company_id = company.id,
      updated_at = now()
  where id = canonical_counterparty.id;

  commercial_reconciliation := public.reconcile_partner_company_commercial_profiles_from_directory(
    canonical_counterparty.sync_id,
    array[company.id]
  );

  insert into public.partner_integrity_repair_events(
    operation_key,
    correlation_id,
    target_user_id,
    source_company_id,
    target_company_id,
    source_membership_id,
    target_membership_id,
    actor_user_id,
    operation_type,
    reason,
    safe_metadata
  ) values (
    p_operation_key,
    p_correlation_id,
    membership.user_id,
    company.id,
    company.id,
    membership.id,
    membership.id,
    actor.id,
    'rebind_company_identity',
    btrim(p_reason),
    jsonb_build_object(
      'eventType', 'PARTNER_COMPANY_MERGED',
      'identityStrategy', 'IN_PLACE_PORTAL_COMPANY_REBIND',
      'duplicatePortalCompanyId', company.id,
      'canonicalPortalCompanyId', company.id,
      'duplicateCounterpartyRef', lower(duplicate_counterparty.external_1c_id),
      'duplicateCounterpartyCode', duplicate_counterparty.external_code,
      'canonicalCounterpartyRef', lower(canonical_counterparty.external_1c_id),
      'canonicalCounterpartyCode', canonical_counterparty.external_code,
      'fiscalCode', normalized_expected_fiscal,
      'actorUserId', actor.id,
      'migratedRowCounts', jsonb_build_object('physicalForeignKeyUpdates', 0),
      'preservedReferenceCounts', preserved_counts,
      'commercialReconciliation', commercial_reconciliation
    )
  ) returning id into audit_id;

  return jsonb_build_object(
    'code', 'PARTNER_COMPANY_MERGED',
    'idempotent', false,
    'companyId', company.id,
    'membershipId', membership.id,
    'auditEventId', audit_id,
    'correlationId', p_correlation_id,
    'duplicateCounterpartyRef', lower(duplicate_counterparty.external_1c_id),
    'canonicalCounterpartyRef', lower(canonical_counterparty.external_1c_id),
    'preservedReferenceCounts', preserved_counts,
    'commercialReconciliation', commercial_reconciliation
  );
end;
$$;

revoke all on function public.rebind_partner_company_to_canonical_counterparty(
  uuid, text, text, text, uuid, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.rebind_partner_company_to_canonical_counterparty(
  uuid, text, text, text, uuid, text, uuid, uuid
) to service_role;

comment on function public.rebind_partner_company_to_canonical_counterparty(
  uuid, text, text, text, uuid, text, uuid, uuid
) is
  'Atomically rebinds one existing portal company UUID from a duplicate current 1C counterparty to a canonical current 1C counterparty with the same governed fiscal identity. Preserves every company-owned row and immutable source identity, refreshes the local commercial profile, and emits one append-only merge event.';

commit;
