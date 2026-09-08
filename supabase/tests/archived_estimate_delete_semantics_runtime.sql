begin;

do $$
declare
  actor_one constant uuid := 'a0000000-0000-4000-8000-000000000001';
  actor_two constant uuid := 'a0000000-0000-4000-8000-000000000002';
  company_one constant uuid := 'b0000000-0000-4000-8000-000000000001';
  company_two constant uuid := 'b0000000-0000-4000-8000-000000000002';
  no_relation constant uuid := 'c0000000-0000-4000-8000-000000000001';
  cart_only constant uuid := 'c0000000-0000-4000-8000-000000000002';
  prepared_only constant uuid := 'c0000000-0000-4000-8000-000000000003';
  audit_only constant uuid := 'c0000000-0000-4000-8000-000000000004';
  sent_proposal constant uuid := 'c0000000-0000-4000-8000-000000000005';
  accepted_version constant uuid := 'c0000000-0000-4000-8000-000000000006';
  order_link constant uuid := 'c0000000-0000-4000-8000-000000000007';
  lifecycle_event constant uuid := 'c0000000-0000-4000-8000-000000000008';
  unsent_delivery constant uuid := 'c0000000-0000-4000-8000-000000000009';
  stale_revision constant uuid := 'c0000000-0000-4000-8000-000000000010';
  wrong_company constant uuid := 'c0000000-0000-4000-8000-000000000011';
  prepared_version_id constant uuid := 'd0000000-0000-4000-8000-000000000003';
  sent_version_id constant uuid := 'd0000000-0000-4000-8000-000000000005';
  accepted_version_row_id constant uuid := 'd0000000-0000-4000-8000-000000000006';
  unsent_version_id constant uuid := 'd0000000-0000-4000-8000-000000000009';
  sent_document_id constant uuid := 'e0000000-0000-4000-8000-000000000005';
  unsent_document_id constant uuid := 'e0000000-0000-4000-8000-000000000009';
  order_id constant uuid := 'f0000000-0000-4000-8000-000000000007';
  first_result jsonb;
  repeated_result jsonb;
  target_revision integer;
  role_id uuid;
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at)
  values
    (actor_one, 'authenticated', 'authenticated', 'estimate-delete-one@example.test', now(), now()),
    (actor_two, 'authenticated', 'authenticated', 'estimate-delete-two@example.test', now(), now());

  insert into public.user_profiles(id, email, full_name, status, user_type)
  values
    (actor_one, 'estimate-delete-one@example.test', 'Delete owner one', 'active', 'external'),
    (actor_two, 'estimate-delete-two@example.test', 'Delete owner two', 'active', 'external')
  on conflict (id) do update set status = 'active', user_type = 'external';

  insert into public.partner_companies(id, external_1c_id, display_name, status)
  values
    (company_one, 'DELETE-SEMANTICS-ONE', 'Delete semantics one', 'active'),
    (company_two, 'DELETE-SEMANTICS-TWO', 'Delete semantics two', 'active');

  insert into public.partner_company_access_policies(company_id, preset_code, changed_by, change_note)
  values
    (company_one, 'full_partner_access', actor_one, 'Archived estimate deletion runtime acceptance.'),
    (company_two, 'full_partner_access', actor_two, 'Archived estimate deletion runtime acceptance.')
  on conflict (company_id) do update
  set preset_code = excluded.preset_code,
      changed_by = excluded.changed_by,
      change_note = excluded.change_note;

  select id into role_id from public.roles where code = 'partner_owner';
  insert into public.company_memberships(user_id, company_id, role_id, status, approved_by, approved_at)
  values
    (actor_one, company_one, role_id, 'active', actor_one, now()),
    (actor_two, company_two, role_id, 'active', actor_two, now());

  perform set_config('request.jwt.claim.sub', actor_one::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', actor_one::text, 'role', 'authenticated')::text, true);

  insert into public.estimates(id, company_id, created_by, estimate_number, name, currency_code, status, archived_at)
  values
    (no_relation, company_one, actor_one, 'TEST-DELETE-01', 'No relation', 'USD', 'archived', now()),
    (cart_only, company_one, actor_one, 'TEST-DELETE-02', 'Cart only', 'USD', 'archived', now()),
    (prepared_only, company_one, actor_one, 'TEST-DELETE-03', 'Prepared only', 'USD', 'archived', now()),
    (audit_only, company_one, actor_one, 'TEST-DELETE-04', 'Audit only', 'USD', 'archived', now()),
    (sent_proposal, company_one, actor_one, 'TEST-DELETE-05', 'Sent proposal', 'USD', 'archived', now()),
    (accepted_version, company_one, actor_one, 'TEST-DELETE-06', 'Accepted version', 'USD', 'archived', now()),
    (order_link, company_one, actor_one, 'TEST-DELETE-07', 'Order link', 'USD', 'archived', now()),
    (lifecycle_event, company_one, actor_one, 'TEST-DELETE-08', 'Lifecycle event', 'USD', 'archived', now()),
    (unsent_delivery, company_one, actor_one, 'TEST-DELETE-09', 'Unsent delivery', 'USD', 'archived', now()),
    (stale_revision, company_one, actor_one, 'TEST-DELETE-10', 'Stale revision', 'USD', 'archived', now()),
    (wrong_company, company_two, actor_two, 'TEST-DELETE-11', 'Wrong company', 'USD', 'archived', now());

  insert into public.carts(id, company_id, created_by)
  values ('11000000-0000-4000-8000-000000000002', company_one, actor_one);
  insert into public.estimate_cart_conversions(company_id, estimate_id, cart_id, direction, request_key, summary, created_by)
  values (company_one, cart_only, '11000000-0000-4000-8000-000000000002', 'estimate_to_cart', '12000000-0000-4000-8000-000000000002', '{}', actor_one);

  insert into public.estimate_versions(id, estimate_id, company_id, version_number, estimate_revision, status, estimate_number, currency_code, total_amount, snapshot, customer_proposal_snapshot, created_by)
  values
    (prepared_version_id, prepared_only, company_one, 1, 1, 'prepared', 'TEST-DELETE-03', 'USD', 0, '{}', '{}', actor_one),
    (sent_version_id, sent_proposal, company_one, 1, 1, 'prepared', 'TEST-DELETE-05', 'USD', 0, '{}', '{}', actor_one),
    (accepted_version_row_id, accepted_version, company_one, 1, 1, 'prepared', 'TEST-DELETE-06', 'USD', 0, '{}', '{}', actor_one),
    (unsent_version_id, unsent_delivery, company_one, 1, 1, 'prepared', 'TEST-DELETE-09', 'USD', 0, '{}', '{}', actor_one);

  insert into public.generated_estimate_documents(id, company_id, estimate_id, estimate_revision, generation_fingerprint, status, prepared_dto, generated_by, version_id)
  values
    (sent_document_id, company_one, sent_proposal, 1, repeat('5', 64), 'ready', '{}', actor_one, sent_version_id),
    (unsent_document_id, company_one, unsent_delivery, 1, repeat('9', 64), 'queued', '{}', actor_one, unsent_version_id);

  insert into public.estimate_proposal_deliveries(company_id, estimate_id, version_id, generated_document_id, recipient_email, email_subject, status, idempotency_key, token_hash, token_expires_at, created_by, sent_at)
  values
    (company_one, sent_proposal, sent_version_id, sent_document_id, 'sent@example.test', 'Sent', 'sent', '15000000-0000-4000-8000-000000000005', repeat('a', 64), now() + interval '1 day', actor_one, now()),
    (company_one, unsent_delivery, unsent_version_id, unsent_document_id, 'queued@example.test', 'Queued', 'queued', '15000000-0000-4000-8000-000000000009', repeat('b', 64), now() + interval '1 day', actor_one, null);

  insert into public.estimate_lifecycle_events(estimate_id, company_id, actor_user_id, from_status, to_status, event_source)
  values
    (audit_only, company_one, actor_one, 'draft', 'draft', 'partner_action'),
    (lifecycle_event, company_one, actor_one, 'draft', 'sent', 'partner_action');

  update public.estimates set accepted_version_id = accepted_version_row_id where id = accepted_version;

  insert into public.partner_orders(id, company_id, submitted_by, submission_key, submission_attempt_id, requested_delivery_date, payload_snapshot)
  values (order_id, company_one, actor_one, '16000000-0000-4000-8000-000000000007', '17000000-0000-4000-8000-000000000007', current_date, '{}');
  update public.estimates set lifecycle_status = 'converted_to_order', lifecycle_order_id = order_id where id = order_link;

  select revision into target_revision from public.estimates where id = no_relation;
  select public.delete_archived_estimate(no_relation, target_revision, '20000000-0000-4000-8000-000000000001', 'Runtime acceptance deletion.') into first_result;

  select revision into target_revision from public.estimates where id = cart_only;
  perform public.delete_archived_estimate(cart_only, target_revision, '20000000-0000-4000-8000-000000000002', 'Runtime acceptance deletion.');

  select revision into target_revision from public.estimates where id = prepared_only;
  perform public.delete_archived_estimate(prepared_only, target_revision, '20000000-0000-4000-8000-000000000003', 'Runtime acceptance deletion.');

  select revision into target_revision from public.estimates where id = audit_only;
  perform public.delete_archived_estimate(audit_only, target_revision, '20000000-0000-4000-8000-000000000004', 'Runtime acceptance deletion.');

  select revision into target_revision from public.estimates where id = unsent_delivery;
  perform public.delete_archived_estimate(unsent_delivery, target_revision, '20000000-0000-4000-8000-000000000009', 'Runtime acceptance deletion.');

  select public.delete_archived_estimate(no_relation, 1, '20000000-0000-4000-8000-000000000001', 'Runtime acceptance deletion.') into repeated_result;
  if first_result->>'eventId' is distinct from repeated_result->>'eventId' then
    raise exception 'Repeated request was not idempotent.';
  end if;
  if (select count(*) from public.estimate_deletion_events where estimate_id = no_relation) <> 1 then
    raise exception 'Repeated request appended another deletion event.';
  end if;

  begin
    perform public.delete_archived_estimate(sent_proposal, (select revision from public.estimates where id = sent_proposal), '20000000-0000-4000-8000-000000000005', 'Runtime acceptance deletion.');
    raise exception 'Sent proposal was not protected.';
  exception when check_violation then
    if sqlerrm <> 'ESTIMATE_DELETE_BLOCKED_PROPOSAL' then raise; end if;
  end;

  begin
    perform public.delete_archived_estimate(accepted_version, (select revision from public.estimates where id = accepted_version), '20000000-0000-4000-8000-000000000006', 'Runtime acceptance deletion.');
    raise exception 'Accepted version was not protected.';
  exception when check_violation then
    if sqlerrm <> 'ESTIMATE_DELETE_BLOCKED_PROPOSAL' then raise; end if;
  end;

  begin
    perform public.delete_archived_estimate(order_link, (select revision from public.estimates where id = order_link), '20000000-0000-4000-8000-000000000007', 'Runtime acceptance deletion.');
    raise exception 'Order link was not protected.';
  exception when check_violation then
    if sqlerrm <> 'ESTIMATE_DELETE_BLOCKED_ORDER' then raise; end if;
  end;

  begin
    perform public.delete_archived_estimate(lifecycle_event, (select revision from public.estimates where id = lifecycle_event), '20000000-0000-4000-8000-000000000008', 'Runtime acceptance deletion.');
    raise exception 'Non-draft lifecycle event was not protected.';
  exception when check_violation then
    if sqlerrm <> 'ESTIMATE_DELETE_BLOCKED_PROPOSAL' then raise; end if;
  end;

  begin
    perform public.delete_archived_estimate(stale_revision, (select revision - 1 from public.estimates where id = stale_revision), '20000000-0000-4000-8000-000000000010', 'Runtime acceptance deletion.');
    raise exception 'Stale revision was accepted.';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'ESTIMATE_DELETE_STALE_REVISION' then raise; end if;
  end;

  begin
    perform public.delete_archived_estimate(wrong_company, (select revision from public.estimates where id = wrong_company), '20000000-0000-4000-8000-000000000011', 'Runtime acceptance deletion.');
    raise exception 'Cross-company deletion was accepted.';
  exception when no_data_found then
    if sqlerrm <> 'ESTIMATE_DELETE_NOT_AVAILABLE' then raise; end if;
  end;

  begin
    perform public.delete_archived_estimate(no_relation, (select revision from public.estimates where id = no_relation), '20000000-0000-4000-8000-000000000012', 'Runtime acceptance deletion.');
    raise exception 'Deleted estimate was available under a new request key.';
  exception when no_data_found then
    if sqlerrm <> 'ESTIMATE_DELETE_NOT_AVAILABLE' then raise; end if;
  end;

  if exists (select 1 from public.estimates where id in (no_relation, cart_only, prepared_only, audit_only, unsent_delivery) and deleted_at is null) then
    raise exception 'An eligible archived draft was not tombstoned.';
  end if;
  if (select count(*) from public.estimate_cart_conversions where estimate_id = cart_only) <> 1 then
    raise exception 'Cart conversion history was deleted.';
  end if;
  if (select count(*) from public.estimate_versions where estimate_id in (prepared_only, unsent_delivery)) <> 2 then
    raise exception 'Prepared version history was deleted.';
  end if;
  if (select count(*) from public.estimate_proposal_deliveries where estimate_id = unsent_delivery) <> 1 then
    raise exception 'Unsent delivery history was deleted.';
  end if;
  if (select count(*) from public.estimate_lifecycle_events where estimate_id = audit_only) < 2 then
    raise exception 'Immutable lifecycle audit history was deleted.';
  end if;
  if exists (select 1 from public.estimates where id = no_relation and deleted_at is null) then
    raise exception 'Deleted estimate remains in the canonical not-deleted list.';
  end if;
  if exists (select 1 from public.estimates where id in (sent_proposal, accepted_version, order_link, lifecycle_event) and deleted_at is not null) then
    raise exception 'Protected estimate was tombstoned.';
  end if;
end;
$$;

rollback;
