begin;

do $$
declare
  owner_one constant uuid := 'a0000000-0000-4000-8000-000000000001';
  creator constant uuid := 'a0000000-0000-4000-8000-000000000002';
  manager constant uuid := 'a0000000-0000-4000-8000-000000000003';
  inactive_creator constant uuid := 'a0000000-0000-4000-8000-000000000004';
  owner_two constant uuid := 'a0000000-0000-4000-8000-000000000005';
  buyer constant uuid := 'a0000000-0000-4000-8000-000000000006';
  viewer constant uuid := 'a0000000-0000-4000-8000-000000000007';
  company_one constant uuid := 'b0000000-0000-4000-8000-000000000001';
  company_two constant uuid := 'b0000000-0000-4000-8000-000000000002';
  archive_draft constant uuid := 'c0000000-0000-4000-8000-000000000001';
  archive_ready constant uuid := 'c0000000-0000-4000-8000-000000000002';
  archive_sent constant uuid := 'c0000000-0000-4000-8000-000000000003';
  archive_accepted constant uuid := 'c0000000-0000-4000-8000-000000000004';
  archive_rejected constant uuid := 'c0000000-0000-4000-8000-000000000005';
  archive_deleted constant uuid := 'c0000000-0000-4000-8000-000000000006';
  archive_cross_company constant uuid := 'c0000000-0000-4000-8000-000000000007';
  creator_delete constant uuid := 'c0000000-0000-4000-8000-000000000008';
  owner_history_delete constant uuid := 'c0000000-0000-4000-8000-000000000009';
  unauthorized_delete constant uuid := 'c0000000-0000-4000-8000-000000000010';
  inactive_delete constant uuid := 'c0000000-0000-4000-8000-000000000011';
  cross_company_delete constant uuid := 'c0000000-0000-4000-8000-000000000012';
  archive_creator constant uuid := 'c0000000-0000-4000-8000-000000000013';
  version_id constant uuid := 'd0000000-0000-4000-8000-000000000009';
  document_id constant uuid := 'e0000000-0000-4000-8000-000000000009';
  order_id constant uuid := 'f0000000-0000-4000-8000-000000000009';
  cart_id constant uuid := '11000000-0000-4000-8000-000000000009';
  external_id constant uuid := '13000000-0000-4000-8000-000000000009';
  section_id constant uuid := '14000000-0000-4000-8000-000000000009';
  item_id constant uuid := '18000000-0000-4000-8000-000000000009';
  first_result jsonb;
  repeated_result jsonb;
  target_revision integer;
  owner_role_id uuid;
  manager_role_id uuid;
  buyer_role_id uuid;
  viewer_role_id uuid;
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at)
  values
    (owner_one, 'authenticated', 'authenticated', 'estimate-owner-one@example.test', now(), now()),
    (creator, 'authenticated', 'authenticated', 'estimate-creator@example.test', now(), now()),
    (manager, 'authenticated', 'authenticated', 'estimate-manager@example.test', now(), now()),
    (inactive_creator, 'authenticated', 'authenticated', 'estimate-inactive@example.test', now(), now()),
    (owner_two, 'authenticated', 'authenticated', 'estimate-owner-two@example.test', now(), now()),
    (buyer, 'authenticated', 'authenticated', 'estimate-buyer@example.test', now(), now()),
    (viewer, 'authenticated', 'authenticated', 'estimate-viewer@example.test', now(), now());

  insert into public.user_profiles(id, email, full_name, status, user_type)
  values
    (owner_one, 'estimate-owner-one@example.test', 'Owner one', 'active', 'external'),
    (creator, 'estimate-creator@example.test', 'Estimate creator', 'active', 'external'),
    (manager, 'estimate-manager@example.test', 'Estimate manager', 'active', 'external'),
    (inactive_creator, 'estimate-inactive@example.test', 'Inactive creator', 'active', 'external'),
    (owner_two, 'estimate-owner-two@example.test', 'Owner two', 'active', 'external'),
    (buyer, 'estimate-buyer@example.test', 'Estimate buyer', 'active', 'external'),
    (viewer, 'estimate-viewer@example.test', 'Estimate viewer', 'active', 'external');

  insert into public.partner_companies(id, external_1c_id, display_name, status)
  values
    (company_one, 'UNIFIED-LIFECYCLE-ONE', 'Unified lifecycle one', 'active'),
    (company_two, 'UNIFIED-LIFECYCLE-TWO', 'Unified lifecycle two', 'active');

  insert into public.partner_company_access_policies(company_id, preset_code, changed_by, change_note)
  values
    (company_one, 'full_partner_access', owner_one, 'Unified estimate lifecycle runtime acceptance.'),
    (company_two, 'full_partner_access', owner_two, 'Unified estimate lifecycle runtime acceptance.')
  on conflict (company_id) do update
  set preset_code = excluded.preset_code,
      changed_by = excluded.changed_by,
      change_note = excluded.change_note;

  select id into owner_role_id from public.roles where code = 'partner_owner';
  select id into manager_role_id from public.roles where code = 'partner_manager';
  select id into buyer_role_id from public.roles where code = 'partner_buyer';
  select id into viewer_role_id from public.roles where code = 'partner_viewer';

  insert into public.company_memberships(user_id, company_id, role_id, status, approved_by, approved_at)
  values
    (owner_one, company_one, owner_role_id, 'active', owner_one, now()),
    (creator, company_one, manager_role_id, 'active', owner_one, now()),
    (manager, company_one, manager_role_id, 'active', owner_one, now()),
    (inactive_creator, company_one, manager_role_id, 'suspended', owner_one, now()),
    (owner_two, company_two, owner_role_id, 'active', owner_two, now()),
    (buyer, company_one, buyer_role_id, 'active', owner_one, now()),
    (viewer, company_one, viewer_role_id, 'active', owner_one, now());

  insert into public.estimates(id, company_id, created_by, estimate_number, name, currency_code, status, archived_at, deleted_at)
  values
    (archive_draft, company_one, owner_one, 'TEST-ARCHIVE-01', 'Draft', 'USD', 'draft', null, null),
    (archive_ready, company_one, owner_one, 'TEST-ARCHIVE-02', 'Ready', 'USD', 'ready', null, null),
    (archive_sent, company_one, owner_one, 'TEST-ARCHIVE-03', 'Sent', 'USD', 'sent', null, null),
    (archive_accepted, company_one, owner_one, 'TEST-ARCHIVE-04', 'Accepted', 'USD', 'accepted', null, null),
    (archive_rejected, company_one, owner_one, 'TEST-ARCHIVE-05', 'Rejected', 'USD', 'rejected', null, null),
    (archive_deleted, company_one, owner_one, 'TEST-ARCHIVE-06', 'Deleted', 'USD', 'draft', null, null),
    (archive_cross_company, company_two, owner_two, 'TEST-ARCHIVE-07', 'Cross company', 'USD', 'draft', null, null),
    (creator_delete, company_one, creator, 'TEST-DELETE-08', 'Creator delete', 'USD', 'archived', now(), null),
    (owner_history_delete, company_one, creator, 'TEST-DELETE-09', 'Owner history delete', 'USD', 'accepted', null, null),
    (unauthorized_delete, company_one, creator, 'TEST-DELETE-10', 'Unauthorized delete', 'USD', 'archived', now(), null),
    (inactive_delete, company_one, inactive_creator, 'TEST-DELETE-11', 'Inactive creator delete', 'USD', 'archived', now(), null),
    (cross_company_delete, company_two, owner_two, 'TEST-DELETE-12', 'Cross company delete', 'USD', 'archived', now(), null),
    (archive_creator, company_one, owner_one, 'TEST-ARCHIVE-13', 'Creator archive', 'USD', 'draft', null, null);

  update public.estimates
  set deleted_at = now(), deleted_by = owner_one, deletion_reason = 'Runtime deleted fixture.'
  where id = archive_deleted;

  perform set_config('request.jwt.claim.sub', owner_one::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_one::text, 'role', 'authenticated')::text, true);
  perform public.archive_estimate(archive_creator, (select revision from public.estimates where id = archive_creator));

  perform set_config('request.jwt.claim.sub', manager::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager::text, 'role', 'authenticated')::text, true);

  perform public.archive_estimate(archive_draft, (select revision from public.estimates where id = archive_draft));
  perform public.archive_estimate(archive_ready, (select revision from public.estimates where id = archive_ready));
  perform public.archive_estimate(archive_sent, (select revision from public.estimates where id = archive_sent));
  perform public.archive_estimate(archive_accepted, (select revision from public.estimates where id = archive_accepted));
  perform public.archive_estimate(archive_rejected, (select revision from public.estimates where id = archive_rejected));

  perform public.archive_estimate(archive_draft, 1);
  if (select count(*) from public.estimate_events where estimate_id = archive_draft and event_type = 'archived') <> 1 then
    raise exception 'Repeated archive appended another event.';
  end if;
  if exists (select 1 from public.estimates where id in (archive_draft, archive_ready, archive_sent, archive_accepted, archive_rejected) and (status <> 'archived' or archived_at is null)) then
    raise exception 'A legitimate estimate state was not archived.';
  end if;

  begin
    perform public.archive_estimate(archive_deleted, 1);
    raise exception 'Deleted estimate was available for archive.';
  exception when no_data_found then
    if sqlerrm <> 'ESTIMATE_ARCHIVE_NOT_AVAILABLE' then raise; end if;
  end;

  begin
    perform public.archive_estimate(archive_cross_company, 1);
    raise exception 'Cross-company estimate was available for archive.';
  exception when no_data_found then
    if sqlerrm <> 'ESTIMATE_ARCHIVE_NOT_AVAILABLE' then raise; end if;
  end;

  insert into public.estimate_versions(id, estimate_id, company_id, version_number, estimate_revision, status, estimate_number, currency_code, total_amount, snapshot, customer_proposal_snapshot, created_by)
  values (version_id, owner_history_delete, company_one, 1, 1, 'accepted', 'TEST-DELETE-09', 'USD', 0, '{}', '{}', creator);

  insert into public.generated_estimate_documents(id, company_id, estimate_id, estimate_revision, generation_fingerprint, status, prepared_dto, generated_by, version_id)
  values (document_id, company_one, owner_history_delete, 1, repeat('9', 64), 'ready', '{}', creator, version_id);

  insert into public.estimate_proposal_deliveries(company_id, estimate_id, version_id, generated_document_id, recipient_email, email_subject, status, idempotency_key, token_hash, token_expires_at, created_by, sent_at)
  values (company_one, owner_history_delete, version_id, document_id, 'history@example.test', 'Sent', 'sent', '15000000-0000-4000-8000-000000000009', repeat('a', 64), now() + interval '1 day', creator, now());

  insert into public.carts(id, company_id, created_by)
  values (cart_id, company_one, creator);
  insert into public.estimate_cart_conversions(company_id, estimate_id, cart_id, direction, request_key, summary, created_by)
  values (company_one, owner_history_delete, cart_id, 'estimate_to_cart', '12000000-0000-4000-8000-000000000009', '{}', creator);

  insert into public.partner_orders(id, company_id, submitted_by, submission_key, submission_attempt_id, requested_delivery_date, payload_snapshot)
  values (order_id, company_one, creator, '16000000-0000-4000-8000-000000000009', '17000000-0000-4000-8000-000000000009', current_date, '{}');

  insert into public.estimate_lifecycle_events(estimate_id, company_id, actor_user_id, from_status, to_status, event_source)
  values (owner_history_delete, company_one, creator, 'draft', 'sent', 'partner_action');

  insert into public.external_nomenclature_items(
    id, manufacturer, model, name, unit, normalized_manufacturer,
    normalized_model, normalized_name, created_by, created_by_company_id
  ) values (
    external_id, 'Runtime', 'History', 'External history', 'pcs',
    'runtime', 'history', 'externalhistory', creator, company_one
  );
  insert into public.estimate_sections(id, estimate_id, name, sort_order)
  values (section_id, owner_history_delete, 'External', 0);
  insert into public.estimate_items(
    id, estimate_id, section_id, line_type, external_nomenclature_id,
    position, description, quantity, unit
  ) values (
    item_id, owner_history_delete, section_id, 'external', external_id,
    1, 'External history', 1, 'pcs'
  );
  insert into public.estimate_external_item_requests(
    estimate_id, request_key, request_fingerprint, estimate_item_id,
    company_id, external_nomenclature_id, status, requested_by,
    requested_at, requested_quantity, requested_unit
  ) values (
    owner_history_delete, '19000000-0000-4000-8000-000000000009', repeat('b', 64), item_id,
    company_one, external_id, 'new', creator, now(), 1, 'pcs'
  );

  update public.estimates
  set lifecycle_status = 'converted_to_order', accepted_version_id = version_id, lifecycle_order_id = order_id
  where id = owner_history_delete;

  select revision into target_revision from public.estimates where id = owner_history_delete;
  perform public.archive_estimate(owner_history_delete, target_revision);
  if not exists (
    select 1 from public.estimates
    where id = owner_history_delete and status = 'archived'
      and lifecycle_status = 'converted_to_order'
      and accepted_version_id = version_id and lifecycle_order_id = order_id
  ) then
    raise exception 'Archive changed commercial lifecycle truth.';
  end if;

  perform set_config('request.jwt.claim.sub', creator::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', creator::text, 'role', 'authenticated')::text, true);
  select revision into target_revision from public.estimates where id = creator_delete;
  select public.delete_archived_estimate(creator_delete, target_revision, '20000000-0000-4000-8000-000000000008', 'Runtime acceptance deletion.') into first_result;
  select public.delete_archived_estimate(creator_delete, 1, '20000000-0000-4000-8000-000000000008', 'Runtime acceptance deletion.') into repeated_result;
  if first_result->>'eventId' is distinct from repeated_result->>'eventId'
     or (select count(*) from public.estimate_deletion_events where estimate_id = creator_delete) <> 1 then
    raise exception 'Creator deletion was not idempotent.';
  end if;

  perform set_config('request.jwt.claim.sub', manager::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager::text, 'role', 'authenticated')::text, true);
  begin
    perform public.delete_archived_estimate(unauthorized_delete, (select revision from public.estimates where id = unauthorized_delete), '20000000-0000-4000-8000-000000000010', 'Runtime acceptance deletion.');
    raise exception 'Non-creator manager deleted an estimate.';
  exception when insufficient_privilege then
    if sqlerrm <> 'ESTIMATE_DELETE_NOT_ALLOWED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', buyer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', buyer::text, 'role', 'authenticated')::text, true);
  begin
    perform public.delete_archived_estimate(unauthorized_delete, (select revision from public.estimates where id = unauthorized_delete), '20000000-0000-4000-8000-000000000013', 'Runtime acceptance deletion.');
    raise exception 'Non-creator buyer deleted an estimate.';
  exception when insufficient_privilege then
    if sqlerrm <> 'ESTIMATE_DELETE_NOT_ALLOWED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', viewer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', viewer::text, 'role', 'authenticated')::text, true);
  begin
    perform public.delete_archived_estimate(unauthorized_delete, (select revision from public.estimates where id = unauthorized_delete), '20000000-0000-4000-8000-000000000014', 'Runtime acceptance deletion.');
    raise exception 'Non-creator viewer deleted an estimate.';
  exception when no_data_found then
    if sqlerrm <> 'ESTIMATE_DELETE_NOT_AVAILABLE' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', owner_one::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_one::text, 'role', 'authenticated')::text, true);
  select revision into target_revision from public.estimates where id = owner_history_delete;
  perform public.delete_archived_estimate(owner_history_delete, target_revision, '20000000-0000-4000-8000-000000000009', 'Runtime acceptance deletion.');

  if not exists (select 1 from public.estimate_versions where estimate_id = owner_history_delete)
     or not exists (select 1 from public.generated_estimate_documents where estimate_id = owner_history_delete)
     or not exists (select 1 from public.estimate_proposal_deliveries where estimate_id = owner_history_delete)
     or not exists (select 1 from public.estimate_cart_conversions where estimate_id = owner_history_delete)
     or not exists (select 1 from public.estimate_lifecycle_events where estimate_id = owner_history_delete)
     or not exists (select 1 from public.estimate_external_item_requests where estimate_id = owner_history_delete)
     or not exists (select 1 from public.estimate_events where estimate_id = owner_history_delete and event_type = 'archived')
     or not exists (select 1 from public.partner_orders where id = order_id) then
    raise exception 'Authorized deletion removed historical relations.';
  end if;

  perform set_config('request.jwt.claim.sub', inactive_creator::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', inactive_creator::text, 'role', 'authenticated')::text, true);
  begin
    perform public.delete_archived_estimate(inactive_delete, (select revision from public.estimates where id = inactive_delete), '20000000-0000-4000-8000-000000000011', 'Runtime acceptance deletion.');
    raise exception 'Inactive creator deleted an estimate.';
  exception when no_data_found then
    if sqlerrm <> 'ESTIMATE_DELETE_NOT_AVAILABLE' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', owner_one::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_one::text, 'role', 'authenticated')::text, true);
  begin
    perform public.delete_archived_estimate(cross_company_delete, (select revision from public.estimates where id = cross_company_delete), '20000000-0000-4000-8000-000000000012', 'Runtime acceptance deletion.');
    raise exception 'Cross-company owner deleted an estimate.';
  exception when no_data_found then
    if sqlerrm <> 'ESTIMATE_DELETE_NOT_AVAILABLE' then raise; end if;
  end;

  if exists (select 1 from public.estimates where id in (creator_delete, owner_history_delete) and deleted_at is null) then
    raise exception 'An authorized delete did not write the tombstone.';
  end if;
  if exists (select 1 from public.estimates where id in (unauthorized_delete, inactive_delete, cross_company_delete) and deleted_at is not null) then
    raise exception 'An unauthorized delete wrote a tombstone.';
  end if;
end;
$$;

rollback;
