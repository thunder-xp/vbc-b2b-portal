begin;

set local search_path = public, extensions, pg_temp;

select plan(21);

insert into public.catalog_products (
  id,
  external_1c_id,
  sku,
  name,
  slug,
  is_active,
  is_visible
)
values
  ('10000000-0000-4000-8000-000000000001', 'COBUY-A', 'COBUY-A', 'Source A', 'cobuy-source-a', true, true),
  ('10000000-0000-4000-8000-000000000002', 'COBUY-B', 'COBUY-B', 'Candidate B', 'cobuy-candidate-b', true, true),
  ('10000000-0000-4000-8000-000000000003', 'COBUY-C', 'COBUY-C', 'Candidate C', 'cobuy-candidate-c', true, true),
  ('10000000-0000-4000-8000-000000000004', 'COBUY-D', 'COBUY-D', 'Unrelated D', 'cobuy-unrelated-d', true, true),
  ('10000000-0000-4000-8000-000000000005', 'COBUY-E', 'COBUY-E', 'Candidate E', 'cobuy-candidate-e', true, true),
  ('10000000-0000-4000-8000-000000000006', 'COBUY-F', 'COBUY-F', 'Inactive F', 'cobuy-inactive-f', false, true);

insert into public.partner_companies (
  id,
  external_1c_id,
  display_name,
  status
)
values
  ('20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Co-buy company 1', 'active'),
  ('20000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'Co-buy company 2', 'active'),
  ('20000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000003', 'Co-buy historical company 3', 'suspended');

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('70000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'cobuy-authorized@example.test', now(), now()),
  ('70000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'cobuy-no-membership@example.test', now(), now());

insert into public.user_profiles (id, email, full_name, status, user_type)
values
  ('70000000-0000-4000-8000-000000000001', 'cobuy-authorized@example.test', 'Co-buy authorized', 'active', 'external'),
  ('70000000-0000-4000-8000-000000000002', 'cobuy-no-membership@example.test', 'Co-buy no membership', 'active', 'external');

insert into public.company_memberships (
  user_id,
  company_id,
  role_id,
  status,
  approved_by,
  approved_at
)
select
  '70000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  role.id,
  'active',
  '70000000-0000-4000-8000-000000000001',
  now()
from public.roles role
where role.code = 'partner_owner';

insert into public.partner_order_history (
  id,
  company_id,
  external_1c_order_ref,
  external_1c_order_number,
  one_c_posted,
  one_c_deletion_mark,
  one_c_state_code,
  one_c_document_date,
  one_c_last_synced_at,
  document_total,
  position_count,
  total_unit_count
  ,source_counterparty_1c_id
  ,source_counterparty_type_code
  ,source_operation_code
  ,partner_visible
  ,hidden_reason
)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'COBUY-ORDER-1', 'COBUY-1', true, false, 'completed', now() - interval '10 days', now(), 100, 6, 109, '21000000-0000-4000-8000-000000000001', 'ЮридическоеЛицо', 'ЗаказНаПродажу', true, null),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'COBUY-ORDER-2', 'COBUY-2', true, false, 'completed', now() - interval '9 days', now(), 100, 5, 5, '21000000-0000-4000-8000-000000000002', 'ЮридическоеЛицо', 'ЗаказНаПродажу', true, null),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'COBUY-ORDER-3', 'COBUY-3', true, false, 'completed', now() - interval '8 days', now(), 100, 4, 4, '21000000-0000-4000-8000-000000000003', 'ЮридическоеЛицо', 'ЗаказНаПродажу', true, null),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'COBUY-ORDER-4', 'COBUY-4', true, false, 'completed', now() - interval '7 days', now(), 100, 1, 1, '21000000-0000-4000-8000-000000000001', 'ЮридическоеЛицо', 'ЗаказНаПродажу', true, null),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'COBUY-ORDER-5', 'COBUY-5', true, false, 'completed', now() - interval '6 days', now(), 100, 1, 1, '21000000-0000-4000-8000-000000000002', 'ЮридическоеЛицо', 'ЗаказНаПродажу', true, null),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', 'COBUY-ORDER-6', 'COBUY-6', true, false, 'completed', now() - interval '5 days', now(), 100, 1, 1, '21000000-0000-4000-8000-000000000003', 'ЮридическоеЛицо', 'ЗаказНаПродажу', true, null),
  ('30000000-0000-4000-8000-000000000007', null, 'COBUY-ORDER-7', 'COBUY-7', true, false, 'completed', now() - interval '900 days', now(), 100, 4, 4, '22000000-0000-4000-8000-000000000001', 'ЮридическоеЛицо', 'ЗаказНаПродажу', false, 'unmapped_counterparty'),
  ('30000000-0000-4000-8000-000000000008', null, 'COBUY-ORDER-8', 'COBUY-8', true, false, 'completed', now() - interval '1200 days', now(), 100, 4, 4, '22000000-0000-4000-8000-000000000002', 'ИндивидуальныйПредприниматель', 'ЗаказНаПродажу', false, 'unmapped_counterparty'),
  ('30000000-0000-4000-8000-000000000009', null, 'COBUY-ORDER-9', 'COBUY-9', true, false, 'completed', now() - interval '4 days', now(), 100, 2, 2, '22000000-0000-4000-8000-000000000003', 'ФизическоеЛицо', 'ЗаказНаПродажу', false, 'physical_person');

insert into public.partner_order_history_items (
  order_history_id,
  line_number,
  product_id,
  external_product_ref,
  quantity,
  unit_price,
  line_total
)
values
  ('30000000-0000-4000-8000-000000000001', 1, '10000000-0000-4000-8000-000000000001', 'COBUY-A', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000001', 2, '10000000-0000-4000-8000-000000000001', 'COBUY-A', 7, 1, 7),
  ('30000000-0000-4000-8000-000000000001', 3, '10000000-0000-4000-8000-000000000002', 'COBUY-B', 99, 1, 99),
  ('30000000-0000-4000-8000-000000000001', 4, '10000000-0000-4000-8000-000000000003', 'COBUY-C', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000001', 5, '10000000-0000-4000-8000-000000000005', 'COBUY-E', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000001', 6, '10000000-0000-4000-8000-000000000006', 'COBUY-F', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000002', 1, '10000000-0000-4000-8000-000000000001', 'COBUY-A', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000002', 2, '10000000-0000-4000-8000-000000000002', 'COBUY-B', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000002', 3, '10000000-0000-4000-8000-000000000003', 'COBUY-C', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000002', 4, '10000000-0000-4000-8000-000000000005', 'COBUY-E', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000002', 5, '10000000-0000-4000-8000-000000000006', 'COBUY-F', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000003', 1, '10000000-0000-4000-8000-000000000001', 'COBUY-A', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000003', 2, '10000000-0000-4000-8000-000000000002', 'COBUY-B', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000003', 3, '10000000-0000-4000-8000-000000000005', 'COBUY-E', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000003', 4, '10000000-0000-4000-8000-000000000006', 'COBUY-F', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000004', 1, '10000000-0000-4000-8000-000000000004', 'COBUY-D', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000005', 1, '10000000-0000-4000-8000-000000000004', 'COBUY-D', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000006', 1, '10000000-0000-4000-8000-000000000004', 'COBUY-D', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000007', 1, '10000000-0000-4000-8000-000000000001', 'COBUY-A', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000007', 2, '10000000-0000-4000-8000-000000000002', 'COBUY-B', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000007', 3, '10000000-0000-4000-8000-000000000005', 'COBUY-E', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000007', 4, '10000000-0000-4000-8000-000000000006', 'COBUY-F', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000008', 1, '10000000-0000-4000-8000-000000000001', 'COBUY-A', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000008', 2, '10000000-0000-4000-8000-000000000002', 'COBUY-B', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000008', 3, '10000000-0000-4000-8000-000000000005', 'COBUY-E', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000008', 4, '10000000-0000-4000-8000-000000000006', 'COBUY-F', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000009', 1, '10000000-0000-4000-8000-000000000001', 'COBUY-A', 1, 1, 1),
  ('30000000-0000-4000-8000-000000000009', 2, '10000000-0000-4000-8000-000000000002', 'COBUY-B', 1, 1, 1);

select lives_ok(
  $$select public.refresh_partner_product_cobuy_associations()$$,
  'co-buy refresh accepts deterministic order-level fixtures'
);

select is(
  (select total_order_count from public.partner_product_cobuy_state),
  8::bigint,
  'all eight governed B2B orders form the all-time transaction denominator'
);

select is(
  (select history_mode from public.partner_product_cobuy_state),
  'all_time_authoritative_history',
  'the active projection is explicitly all-time'
);

select ok(
  exists (
    select 1
    from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'
      and candidate_product_id = '10000000-0000-4000-8000-000000000002'
  ),
  'a candidate bought in the same order by three companies qualifies'
);

select is(
  (select pair_order_count from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'
      and candidate_product_id = '10000000-0000-4000-8000-000000000002'),
  5::bigint,
  'duplicate source lines and large quantities count once per order'
);

select is(
  (select pair_company_count from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'
      and candidate_product_id = '10000000-0000-4000-8000-000000000002'),
  5,
  'pair diversity counts mapped and unmapped source counterparties'
);

select is(
  (select confidence from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'
      and candidate_product_id = '10000000-0000-4000-8000-000000000002'),
  1.00000000::numeric,
  'directional confidence uses source-order prevalence'
);

select is(
  (select lift from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'
      and candidate_product_id = '10000000-0000-4000-8000-000000000002'),
  1.60000000::numeric,
  'lift discounts global candidate prevalence'
);

select ok(
  not exists (
    select 1
    from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'
      and candidate_product_id = '10000000-0000-4000-8000-000000000003'
  ),
  'one or two companies never satisfy the privacy floor'
);

select ok(
  not exists (
    select 1
    from public.partner_product_cobuy_associations
    where source_product_id = candidate_product_id
  ),
  'self-product associations are impossible'
);

select ok(
  exists (
    select 1
    from public.partner_product_cobuy_associations
    where candidate_product_id = '10000000-0000-4000-8000-000000000006'
  ),
  'inactive historical candidates remain in private analytical evidence'
);

select is(
  (select association_rank from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'
      and candidate_product_id = '10000000-0000-4000-8000-000000000002'),
  1,
  'candidate SKU is the deterministic tie-breaker after association metrics'
);

select is(
  (select association_rank from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'
      and candidate_product_id = '10000000-0000-4000-8000-000000000005'),
  2,
  'the second tied candidate keeps deterministic rank two'
);

select is(
  (select count(*) from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'),
  3::bigint,
  'the full qualifying source set is persisted without synthetic fill'
);

select is(
  (select count(distinct source_counterparty_1c_id)
   from public.partner_order_history
   where id in (
     '30000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000002',
     '30000000-0000-4000-8000-000000000003',
     '30000000-0000-4000-8000-000000000007',
     '30000000-0000-4000-8000-000000000008'
   )),
  5::bigint,
  'nullable company mapping does not collapse independent historical buyers'
);

select ok(
  not (select global_analytics_eligible from public.partner_order_history
       where id = '30000000-0000-4000-8000-000000000009'),
  'physical-person orders remain excluded from global co-buy analytics'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.partner_product_cobuy_associations',
    'select'
  ),
  'authenticated clients cannot read private association metrics directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_partner_product_cobuy_candidates(uuid,integer)',
    'execute'
  ),
  'anonymous users cannot execute the partner recommendation read'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_partner_product_cobuy_candidates(uuid,integer)',
    'execute'
  ),
  'authenticated role receives only the bounded partner RPC'
);

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  $$select * from public.get_partner_product_cobuy_candidates(
    '10000000-0000-4000-8000-000000000001',
    5
  )$$,
  '42501',
  'Product co-buy access denied.',
  'an authenticated user without active catalog membership is denied'
);

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)
   from public.get_partner_product_cobuy_candidates(
     '10000000-0000-4000-8000-000000000001',
     5
   )),
  2::bigint,
  'an authorized partner receives only the qualified current candidate IDs'
);

select * from finish();

rollback;
