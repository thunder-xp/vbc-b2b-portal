begin;

do $$
<<fixture>>
declare
  actor uuid := 'a9300000-0000-4000-8000-000000000001';
  outsider uuid := 'a9300000-0000-4000-8000-000000000002';
  company uuid := 'b9300000-0000-4000-8000-000000000001';
  draft_estimate uuid := 'c9300000-0000-4000-8000-000000000001';
  ready_estimate uuid := 'c9300000-0000-4000-8000-000000000002';
  ready_section uuid;
  revision_before integer;
  saved public.estimates;
  version_a public.estimate_versions;
  version_b public.estimate_versions;
  version_result jsonb;
  settings_a jsonb := jsonb_build_object(
    'showProductImages', true,
    'showSku', true,
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
    'showProductImages', false,
    'showSku', false,
    'showProductName', false,
    'showDescription', false,
    'showUnitPrice', false,
    'showLineDiscount', false,
    'showSectionSubtotals', false,
    'showVatBreakdown', false,
    'showPartnerLogo', false,
    'showHeadingGreeting', false
  );
  customer_snapshot_a jsonb;
  customer_snapshot_b jsonb;
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at) values
    (actor, 'authenticated', 'authenticated', 'proposal-ready-owner@example.test', now(), now()),
    (outsider, 'authenticated', 'authenticated', 'proposal-ready-outsider@example.test', now(), now());

  insert into public.user_profiles(id, email, full_name, status, user_type) values
    (actor, 'proposal-ready-owner@example.test', 'Proposal owner', 'active', 'external'),
    (outsider, 'proposal-ready-outsider@example.test', 'Proposal outsider', 'active', 'external');

  insert into public.partner_companies(id, external_1c_id, display_name, status)
  values (company, 'PROPOSAL-READY-TEST', 'Proposal ready test', 'active');

  insert into public.company_memberships(user_id, company_id, role_id, status, approved_at)
  select actor, company, id, 'active', now()
  from public.roles
  where code = 'partner_owner';

  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);

  insert into public.estimates(
    id, company_id, created_by, estimate_number, name, currency_code,
    currency_rate, currency_rate_effective_date, status, proposal_settings
  ) values (
    draft_estimate, company, actor, 'PROPOSAL-DRAFT-TEST', 'Proposal draft test', 'MDL',
    1, current_date, 'draft', settings_a
  );

  select *
  into saved
  from public.save_estimate_proposal_settings(draft_estimate, 1, null, settings_b);

  if saved.status <> 'draft' or saved.proposal_settings <> settings_b or saved.revision <> 2 then
    raise exception 'Draft estimate settings did not persist';
  end if;

  insert into public.estimates(
    id, company_id, created_by, estimate_number, name, currency_code,
    currency_rate, currency_rate_effective_date, status, total_amount,
    has_incomplete_pricing, proposal_settings
  ) values (
    ready_estimate, company, actor, 'PROPOSAL-READY-TEST', 'Proposal ready test', 'MDL',
    1, current_date, 'ready', 100, false, settings_a
  );

  ready_section := public.initialize_canonical_estimate_sections(ready_estimate);
  insert into public.estimate_items(
    estimate_id, section_id, line_type, position, description, quantity, unit, selling_unit_price
  ) values (
    ready_estimate, ready_section, 'custom', 1, 'Immutable proposal fixture', 1, 'pcs', 100
  );

  customer_snapshot_a := jsonb_build_object(
    'estimateNumber', 'PROPOSAL-READY-TEST',
    'currencyCode', 'MDL',
    'settings', settings_a,
    'totals', jsonb_build_object('total', 100)
  );
  customer_snapshot_b := jsonb_build_object(
    'estimateNumber', 'PROPOSAL-READY-TEST',
    'currencyCode', 'MDL',
    'settings', settings_b,
    'totals', jsonb_build_object('total', 100)
  );

  select revision into revision_before from public.estimates where id = ready_estimate;
  version_result := public.create_estimate_version_v2(
    ready_estimate,
    revision_before,
    'd9300000-0000-4000-8000-000000000001',
    repeat('a', 64),
    'A',
    'A',
    customer_snapshot_a
  );
  if version_result->>'status' <> 'created' then raise exception 'Version A was not created'; end if;
  select * into version_a from public.estimate_versions where creation_request_key = 'd9300000-0000-4000-8000-000000000001';

  select *
  into saved
  from public.save_estimate_proposal_settings(ready_estimate, revision_before, null, settings_b);

  if saved.status <> 'ready' or saved.proposal_settings <> settings_b or saved.revision <> revision_before + 1 then
    raise exception 'Ready estimate settings did not persist';
  end if;

  if exists (
    select 1
    from jsonb_each(settings_b) setting
    where setting.value <> 'false'::jsonb
  ) or (select count(*) from jsonb_object_keys(settings_b)) <> 10 then
    raise exception 'Ten independent false display flags were not stored';
  end if;

  if (select customer_proposal_snapshot from public.estimate_versions where id = version_a.id) <> customer_snapshot_a then
    raise exception 'Historical proposal version changed after live settings save';
  end if;

  version_result := public.create_estimate_version_v2(
    ready_estimate,
    saved.revision,
    'd9300000-0000-4000-8000-000000000002',
    repeat('b', 64),
    'B',
    'B',
    customer_snapshot_b
  );
  if version_result->>'status' <> 'created' then raise exception 'Version B was not created'; end if;
  select * into version_b from public.estimate_versions where creation_request_key = 'd9300000-0000-4000-8000-000000000002';

  if version_b.customer_proposal_snapshot <> customer_snapshot_b
     or version_a.customer_proposal_snapshot <> customer_snapshot_a then
    raise exception 'Future/live settings did not remain separate from historical version';
  end if;

  begin
    perform public.save_estimate_proposal_settings(ready_estimate, revision_before, null, settings_a);
    raise exception 'Stale ready revision was accepted';
  exception when sqlstate 'PT409' then null;
  end;

  update public.estimates set status = 'sent' where id = ready_estimate;
  select revision into revision_before from public.estimates where id = ready_estimate;
  begin
    perform public.save_estimate_proposal_settings(ready_estimate, revision_before, null, settings_a);
    raise exception 'Sent estimate settings mutation was accepted';
  exception when insufficient_privilege then null;
  end;

  update public.estimates set status = 'ready' where id = ready_estimate;
  select revision into revision_before from public.estimates where id = ready_estimate;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  begin
    perform public.save_estimate_proposal_settings(ready_estimate, revision_before, null, settings_a);
    raise exception 'User without estimates.manage mutated proposal settings';
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

  raise notice 'PASS: draft, ready, sent rejection, PT409, permission denial, ten flags, refresh storage, immutable versions, grants';
end;
$$;

rollback;
