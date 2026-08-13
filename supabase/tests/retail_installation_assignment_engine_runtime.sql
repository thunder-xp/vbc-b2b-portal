begin;

create temp table sprint9_timings(
  operation text primary key,
  duration_ms numeric not null
) on commit drop;

create temp table sprint9_context on commit drop as
with candidates as (
  select company.id company_id, membership.user_id,
    row_number() over (order by company.id) ordinal
  from public.partner_companies company
  join public.company_memberships membership
    on membership.company_id = company.id and membership.status = 'active'
  join public.roles role on role.id = membership.role_id
  where company.status = 'active' and role.code = 'partner_owner'
)
select max(company_id::text) filter (where ordinal = 1)::uuid company_a,
  max(company_id::text) filter (where ordinal = 2)::uuid company_b,
  max(user_id::text) filter (where ordinal = 2)::uuid user_b
from candidates where ordinal <= 2;

do $$
begin
  if (select company_b is null or user_b is null from sprint9_context)
  then raise exception 'two active partner-owner fixtures are required'; end if;
end;
$$;

insert into public.public_retail_publications(id, status)
values ('90000000-0000-4000-8000-000000000001', 'building');

insert into public.retail_customers(
  id, normalized_phone_hash, name, phone, processing_acknowledged_at
) values (
  '90000000-0000-4000-8000-000000000002', repeat('a', 64),
  'Runtime Smoke', '+37300000000', now()
);

insert into public.retail_carts(id, token_hash, status) values
  ('90000000-0000-4000-8000-000000000003', repeat('b', 64), 'converted'),
  ('90000000-0000-4000-8000-000000000004', repeat('c', 64), 'converted');

insert into public.retail_orders(
  id, public_number, source_cart_id, customer_id, submission_key,
  request_fingerprint, checkout_fingerprint, status, locale, publication_id,
  currency, equipment_subtotal, materials_subtotal, priced_scope_total,
  vat_presentation, customer_snapshot, delivery_address_snapshot,
  installation_address_snapshot, installation_intent_snapshot,
  calculator_evidence_snapshot, installation_tariff_set_id,
  installation_work_lines_snapshot, installation_subtotal
)
select fixture.id, fixture.public_number, fixture.cart_id,
  '90000000-0000-4000-8000-000000000002', fixture.submission_key,
  fixture.request_fingerprint, fixture.checkout_fingerprint,
  'awaiting_payment', 'ru', '90000000-0000-4000-8000-000000000001',
  'MDL', 1000, 0, 1000, 'included',
  '{"name":"Runtime Smoke","phone":"+37300000000"}',
  '{"locality":"Chisinau"}',
  jsonb_build_object('locality', 'Chisinau', 'address', fixture.public_number),
  '[]', '[]', tariff.id,
  '[{"serviceType":"camera_installation","unitCode":"piece","quantity":2,"unitPrice":600,"amount":1200}]',
  1200
from (values
  ('90000000-0000-4000-8000-000000000010'::uuid, 'R-2026-999991',
   '90000000-0000-4000-8000-000000000003'::uuid,
   '90000000-0000-4000-8000-000000000011'::uuid, repeat('d', 64), repeat('e', 64)),
  ('90000000-0000-4000-8000-000000000020'::uuid, 'R-2026-999992',
   '90000000-0000-4000-8000-000000000004'::uuid,
   '90000000-0000-4000-8000-000000000021'::uuid, repeat('f', 64), repeat('1', 64))
) fixture(id, public_number, cart_id, submission_key, request_fingerprint, checkout_fingerprint)
cross join lateral (
  select id from public.installation_tariff_sets where status = 'published' limit 1
) tariff;

insert into public.installation_providers(
  id, provider_type, partner_company_id, operational_status,
  approval_status, marketplace_enabled
)
select '91000000-0000-4000-8000-000000000001'::uuid, 'partner_company',
  company_a, 'active', 'approved', true from sprint9_context
union all
select '91000000-0000-4000-8000-000000000002'::uuid, 'partner_company',
  company_b, 'active', 'approved', true from sprint9_context;

insert into public.installation_provider_profiles(
  provider_id, public_name_ru, public_name_ro, public_profile_status,
  availability_state, max_concurrent_jobs, acceptance_sla_minutes
) values
  ('91000000-0000-4000-8000-000000000001', 'Runtime A', 'Runtime A',
   'published', 'available', 2, 5),
  ('91000000-0000-4000-8000-000000000002', 'Runtime B', 'Runtime B',
   'published', 'available', 2, 5);

insert into public.installation_provider_competencies(
  provider_id, system_type, active, approved_at
) values
  ('91000000-0000-4000-8000-000000000001', 'cctv', true, now()),
  ('91000000-0000-4000-8000-000000000002', 'cctv', true, now());

insert into public.installation_provider_regions(provider_id, region_id, active)
select provider.id, region.id, true
from (values
  ('91000000-0000-4000-8000-000000000001'::uuid),
  ('91000000-0000-4000-8000-000000000002'::uuid)
) provider(id)
cross join lateral (
  select id from public.installation_service_regions where code = 'MD-CU'
) region;

insert into public.installation_provider_workloads(provider_id, active_jobs, last_offered_at)
values
  ('91000000-0000-4000-8000-000000000001', 1, now() - interval '2 days'),
  ('91000000-0000-4000-8000-000000000002', 0, now() - interval '1 day');

insert into public.installation_requirements(
  id, retail_order_id, system_type, selection_mode, service_region_id,
  locality_snapshot, exact_address_snapshot, customer_pii_snapshot,
  work_lines_snapshot, tariff_set_id, tariff_version,
  customer_installation_charge, currency, vat_treatment, activation_mode,
  activation_evidence
)
select fixture.requirement_id, fixture.order_id, 'cctv', 'automatic', region.id,
  'Chisinau', jsonb_build_object('locality', 'Chisinau', 'address', fixture.requirement_id),
  '{"name":"Runtime Smoke","phone":"+37300000000"}',
  '[{"serviceType":"camera_installation","unitCode":"piece","quantity":2,"unitPrice":600,"amount":1200}]',
  tariff.id, tariff.version, 1200, 'MDL', 'included', 'pilot_simulated',
  '{"reason":"runtime rollback smoke"}'
from (values
  ('92000000-0000-4000-8000-000000000001'::uuid,
   '90000000-0000-4000-8000-000000000010'::uuid),
  ('92000000-0000-4000-8000-000000000002'::uuid,
   '90000000-0000-4000-8000-000000000020'::uuid)
) fixture(requirement_id, order_id)
cross join lateral (
  select id from public.installation_service_regions where code = 'MD-CU'
) region
cross join lateral (
  select id, version from public.installation_tariff_sets where status = 'published' limit 1
) tariff;

insert into public.installation_requirement_lines(
  requirement_id, line_number, service_type, unit_code, quantity,
  customer_unit_price, customer_line_amount
) values
  ('92000000-0000-4000-8000-000000000001', 1,
   'camera_installation', 'piece', 2, 600, 1200),
  ('92000000-0000-4000-8000-000000000002', 1,
   'camera_installation', 'piece', 2, 600, 1200);

do $$
declare started_at timestamptz;
begin
  started_at := clock_timestamp();
  perform public.dispatch_installation_requirement(
    '92000000-0000-4000-8000-000000000001', 'automatic', null,
    '93000000-0000-4000-8000-000000000001'
  );
  insert into sprint9_timings values (
    'dispatch', extract(epoch from clock_timestamp() - started_at) * 1000
  );
  started_at := clock_timestamp();
  perform public.dispatch_installation_requirement(
    '92000000-0000-4000-8000-000000000001', 'automatic', null,
    '93000000-0000-4000-8000-000000000002'
  );
  insert into sprint9_timings values (
    'dispatch_repeat', extract(epoch from clock_timestamp() - started_at) * 1000
  );
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.installation_assignment_attempts
    where requirement_id = '92000000-0000-4000-8000-000000000001'
      and provider_id = '91000000-0000-4000-8000-000000000002'
  ) then raise exception 'deterministic workload ranking failed'; end if;
  if (select count(*) from public.installation_assignment_attempts
      where requirement_id = '92000000-0000-4000-8000-000000000001') <> 1
  then raise exception 'repeated dispatch created a duplicate'; end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub', (select user_b::text from sprint9_context), true
);

do $$
declare offer jsonb;
begin
  select item into offer
  from jsonb_array_elements(public.partner_list_installation_assignments(
    (select company_b from sprint9_context), 'offers'
  )) item limit 1;
  if offer->>'customer' is not null
    or offer->>'customerInstallationCharge' is not null
    or (offer->'scope'->0) ? 'unitPrice'
  then raise exception 'offer projection leaked protected data'; end if;
end;
$$;

do $$
declare started_at timestamptz; company_id uuid; attempt_id uuid;
begin
  select company_b into company_id from sprint9_context;
  select id into attempt_id from public.installation_assignment_attempts
  where requirement_id = '92000000-0000-4000-8000-000000000001';
  started_at := clock_timestamp();
  perform public.partner_respond_installation_assignment(
    company_id, attempt_id, 'accept', null, null,
    '93000000-0000-4000-8000-000000000003'
  );
  insert into sprint9_timings values (
    'accept', extract(epoch from clock_timestamp() - started_at) * 1000
  );
  started_at := clock_timestamp();
  perform public.partner_respond_installation_assignment(
    company_id, attempt_id, 'accept', null, null,
    '93000000-0000-4000-8000-000000000003'
  );
  insert into sprint9_timings values (
    'accept_repeat', extract(epoch from clock_timestamp() - started_at) * 1000
  );
end;
$$;
select set_config('request.jwt.claim.sub', '', true);

insert into public.installation_assignment_attempts(
  id, requirement_id, ordinal, provider_id, source, offered_at, deadline_at,
  eligibility_evidence, idempotency_key, correlation_id
) values (
  '94000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002', 1,
  '91000000-0000-4000-8000-000000000001', 'automatic',
  now() - interval '10 minutes', now() - interval '5 minutes',
  '{"eligible":true}', '94000000-0000-4000-8000-000000000002',
  '94000000-0000-4000-8000-000000000003'
);
update public.installation_requirements
set status = 'offered', current_attempt_id = '94000000-0000-4000-8000-000000000001'
where id = '92000000-0000-4000-8000-000000000002';

do $$
declare started_at timestamptz;
begin
  started_at := clock_timestamp();
  perform public.run_installation_assignment_worker(10);
  insert into sprint9_timings values (
    'timeout_worker', extract(epoch from clock_timestamp() - started_at) * 1000
  );
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.installation_requirements requirement
    join public.installation_executions execution
      on execution.requirement_id = requirement.id
    where requirement.id = '92000000-0000-4000-8000-000000000001'
      and requirement.status = 'assigned' and execution.state = 'scheduling'
  ) then raise exception 'atomic acceptance failed'; end if;
  if not exists (
    select 1 from public.installation_assignment_attempts
    where id = '94000000-0000-4000-8000-000000000001'
      and status = 'timed_out'
  ) then raise exception 'timeout transition failed'; end if;
  if not exists (
    select 1 from public.installation_assignment_attempts
    where requirement_id = '92000000-0000-4000-8000-000000000002'
      and ordinal = 2 and status = 'offered'
  ) then raise exception 'timeout reassignment failed'; end if;
  if (select count(*) from public.installation_executions
      where requirement_id = '92000000-0000-4000-8000-000000000001') <> 1
  then raise exception 'idempotent acceptance created a duplicate execution'; end if;
end;
$$;

select jsonb_build_object(
  'status', 'passed',
  'requirements', count(distinct requirement.id),
  'attempts', count(distinct attempt.id),
  'events', count(distinct event.id),
  'timingsMs', (select jsonb_object_agg(operation, duration_ms order by operation)
                from sprint9_timings)
) as runtime_result
from public.installation_requirements requirement
join public.installation_assignment_attempts attempt
  on attempt.requirement_id = requirement.id
join public.installation_assignment_events event
  on event.requirement_id = requirement.id
where requirement.id in (
  '92000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000002'
);

rollback;
