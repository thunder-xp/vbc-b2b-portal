begin;

do $$
declare
  actor uuid := 'aa310000-0000-4000-8000-000000000001';
  company uuid := 'ba310000-0000-4000-8000-000000000001';
  draft_estimate uuid := 'ca310000-0000-4000-8000-000000000001';
  ready_estimate uuid := 'ca310000-0000-4000-8000-000000000002';
  ready_section uuid;
  ready_item uuid;
  revision_before integer;
  saved public.estimates;
  version_a public.estimate_versions;
  version_result jsonb;
  commercial_before jsonb;
  commercial_after jsonb;
  settings_a jsonb := jsonb_build_object(
    'showProductImages', false,
    'showSku', false,
    'showProductName', true,
    'showDescription', true,
    'showUnitPrice', true,
    'showLineDiscount', true,
    'showSectionSubtotals', true,
    'showVatBreakdown', true,
    'showPartnerLogo', true,
    'showHeadingGreeting', true
  );
  settings_b jsonb := jsonb_build_object(
    'showProductImages', true,
    'showSku', false,
    'showProductName', false,
    'showDescription', true,
    'showUnitPrice', true,
    'showLineDiscount', false,
    'showSectionSubtotals', true,
    'showVatBreakdown', true,
    'showPartnerLogo', true,
    'showHeadingGreeting', true
  );
  version_snapshot jsonb := jsonb_build_object(
    'estimateNumber', 'PROPOSAL-ARCHIVED-DRAFT-TEST',
    'currencyCode', 'MDL',
    'settings', settings_a,
    'totals', jsonb_build_object('total', 100)
  );
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at)
  values (actor, 'authenticated', 'authenticated', 'proposal-archived-owner@example.test', now(), now());

  insert into public.user_profiles(id, email, full_name, status, user_type)
  values (actor, 'proposal-archived-owner@example.test', 'Proposal archived owner', 'active', 'external');

  insert into public.partner_companies(id, external_1c_id, display_name, status)
  values (company, 'PROPOSAL-ARCHIVED-TEST', 'Proposal archived test', 'active');

  insert into public.company_memberships(user_id, company_id, role_id, status, approved_at)
  select actor, company, id, 'active', now()
  from public.roles
  where code = 'partner_owner';

  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);

  insert into public.estimates(
    id, company_id, created_by, estimate_number, name, customer_name,
    currency_code, currency_rate, currency_rate_effective_date, status,
    lifecycle_status, proposal_settings
  ) values (
    draft_estimate, company, actor, 'PROPOSAL-DRAFT-CONTROL', 'Proposal draft control', 'Draft customer',
    'MDL', 1, current_date, 'draft', 'draft', settings_a
  );

  select * into saved
  from public.save_estimate_proposal_settings(draft_estimate, 1, null, settings_b);
  if saved.status <> 'draft' or saved.proposal_settings <> settings_b or saved.revision <> 2 then
    raise exception 'Draft estimate settings did not persist';
  end if;

  insert into public.estimates(
    id, company_id, created_by, estimate_number, name, customer_name,
    currency_code, currency_rate, currency_rate_effective_date, status,
    lifecycle_status, total_amount, has_incomplete_pricing, proposal_settings
  ) values (
    ready_estimate, company, actor, 'PROPOSAL-ARCHIVED-DRAFT-TEST', 'Proposal archived draft test', 'Original customer',
    'MDL', 1, current_date, 'ready', 'draft', 100, false, settings_a
  );

  ready_section := public.initialize_canonical_estimate_sections(ready_estimate);
  insert into public.estimate_items(
    estimate_id, section_id, line_type, position, description, quantity, unit, selling_unit_price
  ) values (
    ready_estimate, ready_section, 'custom', 1, 'Immutable commercial fixture', 1, 'pcs', 100
  ) returning id into ready_item;

  select revision into revision_before from public.estimates where id = ready_estimate;
  version_result := public.create_estimate_version_v2(
    ready_estimate,
    revision_before,
    'da310000-0000-4000-8000-000000000001',
    repeat('a', 64),
    'A',
    'A',
    version_snapshot
  );
  if version_result->>'status' <> 'created' then raise exception 'Version A was not created'; end if;
  select * into version_a
  from public.estimate_versions
  where creation_request_key = 'da310000-0000-4000-8000-000000000001';

  select * into saved
  from public.save_estimate_proposal_settings(ready_estimate, revision_before, null, settings_b);
  if saved.status <> 'ready' or saved.proposal_settings <> settings_b then
    raise exception 'Ready estimate settings did not persist';
  end if;

  update public.estimates
  set status = 'archived', lifecycle_status = 'draft', archived_at = now()
  where id = ready_estimate;

  select jsonb_build_object(
    'customer_name', estimate.customer_name,
    'status', estimate.status,
    'lifecycle_status', estimate.lifecycle_status,
    'archived_at', estimate.archived_at,
    'section_name', section.name,
    'line_description', item.description,
    'quantity', item.quantity,
    'selling_unit_price', item.selling_unit_price
  ) into commercial_before
  from public.estimates estimate
  join public.estimate_sections section on section.id = ready_section
  join public.estimate_items item on item.id = ready_item
  where estimate.id = ready_estimate;

  select revision into revision_before from public.estimates where id = ready_estimate;
  select * into saved
  from public.save_estimate_proposal_settings(ready_estimate, revision_before, null, settings_a);
  if saved.status <> 'archived'
     or saved.lifecycle_status <> 'draft'
     or saved.archived_at is null
     or saved.proposal_settings <> settings_a
     or saved.revision <> revision_before + 1 then
    raise exception 'Archived draft settings did not persist';
  end if;

  select jsonb_build_object(
    'customer_name', estimate.customer_name,
    'status', estimate.status,
    'lifecycle_status', estimate.lifecycle_status,
    'archived_at', estimate.archived_at,
    'section_name', section.name,
    'line_description', item.description,
    'quantity', item.quantity,
    'selling_unit_price', item.selling_unit_price
  ) into commercial_after
  from public.estimates estimate
  join public.estimate_sections section on section.id = ready_section
  join public.estimate_items item on item.id = ready_item
  where estimate.id = ready_estimate;

  if commercial_after <> commercial_before then
    raise exception 'Archived presentation save changed commercial estimate state';
  end if;
  if (select customer_proposal_snapshot from public.estimate_versions where id = version_a.id) <> version_snapshot then
    raise exception 'Historical proposal version changed after archived settings save';
  end if;

  begin
    perform public.save_estimate_proposal_settings(ready_estimate, revision_before, null, settings_b);
    raise exception 'Stale archived draft revision was accepted';
  exception when sqlstate 'PT409' then null;
  end;

  begin
    perform public.update_estimate_item(ready_estimate, ready_item, saved.revision, 'Changed', 2, 'pcs', 200);
    raise exception 'Archived commercial line mutation was accepted';
  exception when insufficient_privilege then null;
  end;

  update public.estimates set lifecycle_status = 'sent' where id = ready_estimate;
  begin
    perform public.save_estimate_proposal_settings(ready_estimate, saved.revision, null, settings_b);
    raise exception 'Archived sent settings mutation was accepted';
  exception when insufficient_privilege then null;
  end;

  update public.estimates set lifecycle_status = 'accepted' where id = ready_estimate;
  begin
    perform public.save_estimate_proposal_settings(ready_estimate, saved.revision, null, settings_b);
    raise exception 'Archived accepted settings mutation was accepted';
  exception when insufficient_privilege then null;
  end;

  update public.estimates set lifecycle_status = 'rejected' where id = ready_estimate;
  begin
    perform public.save_estimate_proposal_settings(ready_estimate, saved.revision, null, settings_b);
    raise exception 'Archived rejected settings mutation was accepted';
  exception when insufficient_privilege then null;
  end;

  update public.estimates set lifecycle_status = 'expired' where id = ready_estimate;
  begin
    perform public.save_estimate_proposal_settings(ready_estimate, saved.revision, null, settings_b);
    raise exception 'Archived expired settings mutation was accepted';
  exception when insufficient_privilege then null;
  end;

  update public.estimates set status = 'sent', lifecycle_status = 'sent', archived_at = null where id = ready_estimate;
  begin
    perform public.save_estimate_proposal_settings(ready_estimate, saved.revision, null, settings_b);
    raise exception 'Active sent settings mutation was accepted';
  exception when insufficient_privilege then null;
  end;

  if has_function_privilege('anon', 'public.save_estimate_proposal_settings(uuid,integer,uuid,jsonb)', 'execute') then
    raise exception 'Anonymous execution grant exposed';
  end if;
  if not has_function_privilege('authenticated', 'public.save_estimate_proposal_settings(uuid,integer,uuid,jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.save_estimate_proposal_settings(uuid,integer,uuid,jsonb)', 'execute') then
    raise exception 'Required execution grants are missing';
  end if;
  if (select prosecdef is not true or not (coalesce(proconfig, '{}'::text[]) @> array['search_path=""'])
      from pg_proc where oid = 'public.save_estimate_proposal_settings(uuid,integer,uuid,jsonb)'::regprocedure) then
    raise exception 'Function security configuration is invalid';
  end if;

  raise notice 'PASS: draft, ready, archived draft, immutable states, commercial immutability, PT409, immutable versions, grants';
end;
$$;

rollback;
