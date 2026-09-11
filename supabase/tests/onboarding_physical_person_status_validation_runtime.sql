begin;

do $$
declare
  admin_id constant uuid := '10000000-0000-4000-8000-000000000001';
  physical_user_id constant uuid := '10000000-0000-4000-8000-000000000002';
  legal_user_id constant uuid := '10000000-0000-4000-8000-000000000003';
  stale_user_id constant uuid := '10000000-0000-4000-8000-000000000004';
  multi_user_id constant uuid := '10000000-0000-4000-8000-000000000005';
  retail_user_id constant uuid := '10000000-0000-4000-8000-000000000006';
  inactive_user_id constant uuid := '10000000-0000-4000-8000-000000000007';
  deleted_user_id constant uuid := '10000000-0000-4000-8000-000000000008';
  sync_id constant uuid := '20000000-0000-4000-8000-000000000001';
  physical_counterparty_id constant uuid := '30000000-0000-4000-8000-000000000001';
  legal_counterparty_id constant uuid := '30000000-0000-4000-8000-000000000002';
  stale_counterparty_id constant uuid := '30000000-0000-4000-8000-000000000003';
  multi_counterparty_id constant uuid := '30000000-0000-4000-8000-000000000004';
  retail_counterparty_id constant uuid := '30000000-0000-4000-8000-000000000005';
  inactive_counterparty_id constant uuid := '30000000-0000-4000-8000-000000000006';
  deleted_counterparty_id constant uuid := '30000000-0000-4000-8000-000000000007';
  physical_profile_id constant uuid := '40000000-0000-4000-8000-000000000001';
  legal_profile_id constant uuid := '40000000-0000-4000-8000-000000000002';
  stale_profile_id constant uuid := '40000000-0000-4000-8000-000000000003';
  stale_current_profile_id constant uuid := '40000000-0000-4000-8000-000000000004';
  multi_profile_one_id constant uuid := '40000000-0000-4000-8000-000000000005';
  multi_profile_two_id constant uuid := '40000000-0000-4000-8000-000000000006';
  physical_request_id constant uuid := '50000000-0000-4000-8000-000000000001';
  legal_request_id constant uuid := '50000000-0000-4000-8000-000000000002';
  stale_request_id constant uuid := '50000000-0000-4000-8000-000000000003';
  multi_request_id constant uuid := '50000000-0000-4000-8000-000000000004';
  retail_request_id constant uuid := '50000000-0000-4000-8000-000000000005';
  inactive_request_id constant uuid := '50000000-0000-4000-8000-000000000006';
  deleted_request_id constant uuid := '50000000-0000-4000-8000-000000000007';
  result jsonb;
  attempt_key uuid;
  resolved_company_id uuid;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  select id, 'authenticated', 'authenticated', email, '', now(),
         '{}'::jsonb, '{}'::jsonb, now(), now()
  from (values
    (admin_id, 'onboarding-admin@example.invalid'),
    (physical_user_id, 'physical@example.invalid'),
    (legal_user_id, 'legal@example.invalid'),
    (stale_user_id, 'stale@example.invalid'),
    (multi_user_id, 'multi@example.invalid'),
    (retail_user_id, 'retail@example.invalid'),
    (inactive_user_id, 'inactive@example.invalid'),
    (deleted_user_id, 'deleted@example.invalid')
  ) fixture(id, email);

  insert into public.user_profiles (id, email, full_name, status, user_type)
  select id, email, full_name, status, user_type
  from (values
    (admin_id, 'onboarding-admin@example.invalid', 'Onboarding Admin', 'active', 'admin'),
    (physical_user_id, 'physical@example.invalid', 'Physical Applicant', 'registered', 'external'),
    (legal_user_id, 'legal@example.invalid', 'Legal Applicant', 'registered', 'external'),
    (stale_user_id, 'stale@example.invalid', 'Stale Applicant', 'registered', 'external'),
    (multi_user_id, 'multi@example.invalid', 'Multi Applicant', 'registered', 'external'),
    (retail_user_id, 'retail@example.invalid', 'Retail Applicant', 'registered', 'external'),
    (inactive_user_id, 'inactive@example.invalid', 'Inactive Applicant', 'registered', 'external'),
    (deleted_user_id, 'deleted@example.invalid', 'Deleted Applicant', 'registered', 'external')
  ) fixture(id, email, full_name, status, user_type)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    status = excluded.status,
    user_type = excluded.user_type;

  insert into public.internal_user_role_assignments (user_id, role_id, assigned_by)
  select admin_id, role.id, admin_id
  from public.roles role
  where role.code = 'novotech_admin' and role.scope = 'internal';

  insert into public.one_c_counterparty_directory_syncs (
    sync_id, status, started_at, finished_at, source_counterparties,
    active_counterparties, inactive_counterparties, deleted_counterparties,
    with_fiscal_code, published_counterparties
  ) values (sync_id, 'succeeded', now(), now(), 7, 5, 1, 1, 7, 7);

  insert into public.one_c_counterparties (
    id, sync_id, external_1c_id, external_code, name, normalized_name,
    fiscal_code, normalized_fiscal_code, is_active, is_deleted,
    synchronization_version, synchronized_at, is_published, counterparty_type_code
  ) values
    (physical_counterparty_id, sync_id, 'physical-1c-id', 'PHYSICAL', 'Physical Person', 'physical person', '1001', '1001', true, false, 'runtime', now(), true, 'ФизическоеЛицо'),
    (legal_counterparty_id, sync_id, 'legal-1c-id', 'LEGAL', 'Legal Entity', 'legal entity', '1002', '1002', true, false, 'runtime', now(), true, 'ЮридическоеЛицо'),
    (stale_counterparty_id, sync_id, 'stale-1c-id', 'STALE', 'Stale Selection', 'stale selection', '1003', '1003', true, false, 'runtime', now(), true, 'ФизическоеЛицо'),
    (multi_counterparty_id, sync_id, 'multi-1c-id', 'MULTI', 'Multiple Profiles', 'multiple profiles', '1004', '1004', true, false, 'runtime', now(), true, 'ЮридическоеЛицо'),
    (retail_counterparty_id, sync_id, 'retail-1c-id', 'RETAIL', 'Retail Only', 'retail only', '1005', '1005', true, false, 'runtime', now(), true, 'ФизическоеЛицо'),
    (inactive_counterparty_id, sync_id, 'inactive-1c-id', 'INACTIVE', 'Inactive Counterparty', 'inactive counterparty', '1006', '1006', false, false, 'runtime', now(), true, 'ФизическоеЛицо'),
    (deleted_counterparty_id, sync_id, 'deleted-1c-id', 'DELETED', 'Deleted Counterparty', 'deleted counterparty', '1007', '1007', true, true, 'runtime', now(), true, 'ЮридическоеЛицо');

  insert into public.one_c_counterparty_price_profiles (
    id, sync_id, counterparty_external_1c_id, external_1c_id, code, name,
    is_active, is_deleted, is_published, synchronized_at
  ) values
    (physical_profile_id, sync_id, 'physical-1c-id', 'physical-price', 'P1', 'GOLD', true, false, true, now()),
    (legal_profile_id, sync_id, 'legal-1c-id', 'legal-price', 'L1', 'SILVER', true, false, true, now()),
    (stale_profile_id, sync_id, 'stale-1c-id', 'stale-old-price', 'S0', 'OLD', true, false, false, now()),
    (stale_current_profile_id, sync_id, 'stale-1c-id', 'stale-current-price', 'S1', 'CURRENT', true, false, true, now()),
    (multi_profile_one_id, sync_id, 'multi-1c-id', 'multi-price-1', 'M1', 'ONE', true, false, true, now()),
    (multi_profile_two_id, sync_id, 'multi-1c-id', 'multi-price-2', 'M2', 'TWO', true, false, true, now());

  insert into public.access_requests (
    id, user_profile_id, requested_company_name, requested_fiscal_code,
    status, onboarding_status
  )
  select request_id, user_id, company_name, fiscal_code, 'pending_review', 'under_review'
  from (values
    (physical_request_id, physical_user_id, 'Physical Person', '1001'),
    (legal_request_id, legal_user_id, 'Legal Entity', '1002'),
    (stale_request_id, stale_user_id, 'Stale Selection', '1003'),
    (multi_request_id, multi_user_id, 'Multiple Profiles', '1004'),
    (retail_request_id, retail_user_id, 'Retail Only', '1005'),
    (inactive_request_id, inactive_user_id, 'Inactive Counterparty', '1006'),
    (deleted_request_id, deleted_user_id, 'Deleted Counterparty', '1007')
  ) fixture(request_id, user_id, company_name, fiscal_code);

  insert into public.onboarding_approval_drafts (
    request_id, request_revision_id, confirmed_counterparty_id,
    assigned_internal_manager_user_id, selected_price_profile_id,
    payment_model, finance_access, order_access, current_step, version,
    last_edited_by
  ) values
    (physical_request_id, (select current_revision_id from public.access_requests where id = physical_request_id), physical_counterparty_id, admin_id, null, 'inherited_from_1c', true, true, 3, 3, admin_id),
    (legal_request_id, (select current_revision_id from public.access_requests where id = legal_request_id), legal_counterparty_id, admin_id, legal_profile_id, 'inherited_from_1c', true, true, 3, 3, admin_id),
    (stale_request_id, (select current_revision_id from public.access_requests where id = stale_request_id), stale_counterparty_id, admin_id, stale_profile_id, 'inherited_from_1c', true, true, 3, 3, admin_id),
    (multi_request_id, (select current_revision_id from public.access_requests where id = multi_request_id), multi_counterparty_id, admin_id, null, 'inherited_from_1c', true, true, 3, 3, admin_id),
    (retail_request_id, (select current_revision_id from public.access_requests where id = retail_request_id), retail_counterparty_id, admin_id, null, 'inherited_from_1c', false, false, 3, 3, admin_id),
    (inactive_request_id, (select current_revision_id from public.access_requests where id = inactive_request_id), null, admin_id, null, null, false, true, 1, 1, admin_id),
    (deleted_request_id, (select current_revision_id from public.access_requests where id = deleted_request_id), null, admin_id, null, null, false, true, 1, 1, admin_id);

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  result := public.save_onboarding_approval_draft(
    physical_request_id, 1, 3, 3::smallint, null, null, null, null, 'owner', true, true
  );
  if result->>'currentStep' <> '4' then
    raise exception 'physical_person_step_3_did_not_advance';
  end if;
  if (select selected_price_profile_id from public.onboarding_approval_drafts where request_id = physical_request_id) <> physical_profile_id then
    raise exception 'physical_person_single_profile_not_selected';
  end if;
  if (select initial_access_profile from public.access_requests where id = physical_request_id) <> 'owner' then
    raise exception 'portal_access_profile_not_preserved_independently';
  end if;

  select approval_attempt_key into attempt_key
  from public.onboarding_approval_drafts where request_id = physical_request_id;
  result := public.approve_partner_access_request_v3(
    physical_request_id, 1, 4, attempt_key, '70000000-0000-4000-8000-000000000001'
  );
  if not coalesce((result->>'success')::boolean, false) then
    raise exception 'physical_person_final_approval_failed';
  end if;
  select company_id into resolved_company_id from public.access_requests where id = physical_request_id;
  if resolved_company_id is null
    or (select external_1c_id from public.partner_companies where id = resolved_company_id) <> 'physical-1c-id'
    or (select requested_external_1c_id from public.access_requests where id = physical_request_id) <> 'physical-1c-id' then
    raise exception 'physical_person_counterparty_link_not_preserved';
  end if;
  if (select count(*) from public.partner_companies where external_1c_id = 'physical-1c-id') <> 1
    or (select count(*) from public.access_requests where id = physical_request_id) <> 1
    or (select count(*) from public.company_memberships where company_id = resolved_company_id and user_id = physical_user_id and status = 'active') <> 1
    or (select count(*) from public.partner_company_access_policies where company_id = resolved_company_id and preset_code = 'full_partner_access') <> 1 then
    raise exception 'physical_person_approval_created_duplicates_or_no_access';
  end if;

  result := public.save_onboarding_approval_draft(
    legal_request_id, 1, 3, 3::smallint, null, null, null, null, 'owner', true, true
  );
  if result->>'currentStep' <> '4' then
    raise exception 'legal_entity_step_3_regressed';
  end if;

  result := public.save_onboarding_approval_draft(
    stale_request_id, 1, 3, 3::smallint, null, null, null, null, 'owner', true, true
  );
  if (select selected_price_profile_id from public.onboarding_approval_drafts where request_id = stale_request_id) <> stale_current_profile_id then
    raise exception 'stale_profile_was_not_repaired';
  end if;

  begin
    perform public.save_onboarding_approval_draft(
      multi_request_id, 1, 3, 3::smallint, null, null, null, null, 'owner', true, true
    );
    raise exception 'multiple_profiles_should_require_selection';
  exception when sqlstate '22023' then
    if sqlerrm <> 'onboarding_partner_status_selection_required' then raise; end if;
  end;

  result := public.save_onboarding_approval_draft(
    retail_request_id, 1, 3, 3::smallint, null, null, null, null, 'retail_only', false, false
  );
  if result->>'currentStep' <> '4'
    or (select selected_price_profile_id from public.onboarding_approval_drafts where request_id = retail_request_id) is not null then
    raise exception 'retail_only_access_incorrectly_requires_commercial_profile';
  end if;

  begin
    perform public.save_onboarding_approval_draft(
      inactive_request_id, 1, 1, 1::smallint, inactive_counterparty_id, null, null, null, null, false, true
    );
    raise exception 'inactive_counterparty_should_be_blocked';
  exception when sqlstate '22023' then
    if sqlerrm <> 'counterparty_snapshot_stale' then raise; end if;
  end;

  begin
    perform public.save_onboarding_approval_draft(
      deleted_request_id, 1, 1, 1::smallint, deleted_counterparty_id, null, null, null, null, false, true
    );
    raise exception 'deleted_counterparty_should_be_blocked';
  exception when sqlstate '22023' then
    if sqlerrm <> 'counterparty_snapshot_stale' then raise; end if;
  end;
end;
$$;

rollback;
