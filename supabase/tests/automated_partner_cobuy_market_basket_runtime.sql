begin;

set local search_path = public, extensions, pg_temp;

select plan(18);

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
  ('20000000-0000-4000-8000-000000000001', 'COBUY-COMPANY-1', 'Co-buy company 1', 'active'),
  ('20000000-0000-4000-8000-000000000002', 'COBUY-COMPANY-2', 'Co-buy company 2', 'active'),
  ('20000000-0000-4000-8000-000000000003', 'COBUY-COMPANY-3', 'Co-buy company 3', 'active');

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
)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'COBUY-ORDER-1', 'COBUY-1', true, false, 'completed', now() - interval '10 days', now(), 100, 6, 109),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'COBUY-ORDER-2', 'COBUY-2', true, false, 'completed', now() - interval '9 days', now(), 100, 5, 5),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'COBUY-ORDER-3', 'COBUY-3', true, false, 'completed', now() - interval '8 days', now(), 100, 4, 4),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'COBUY-ORDER-4', 'COBUY-4', true, false, 'completed', now() - interval '7 days', now(), 100, 1, 1),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'COBUY-ORDER-5', 'COBUY-5', true, false, 'completed', now() - interval '6 days', now(), 100, 1, 1),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', 'COBUY-ORDER-6', 'COBUY-6', true, false, 'completed', now() - interval '5 days', now(), 100, 1, 1);

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
  ('30000000-0000-4000-8000-000000000006', 1, '10000000-0000-4000-8000-000000000004', 'COBUY-D', 1, 1, 1);

select lives_ok(
  $$select public.refresh_partner_product_cobuy_associations()$$,
  'co-buy refresh accepts deterministic order-level fixtures'
);

select is(
  (select total_order_count from public.partner_product_cobuy_state),
  6::bigint,
  'all six governed orders form the transaction denominator'
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
  3::bigint,
  'duplicate source lines and large quantities count once per order'
);

select is(
  (select pair_company_count from public.partner_product_cobuy_associations
    where source_product_id = '10000000-0000-4000-8000-000000000001'
      and candidate_product_id = '10000000-0000-4000-8000-000000000002'),
  3,
  'pair diversity counts distinct companies'
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
  2.00000000::numeric,
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
  not exists (
    select 1
    from public.partner_product_cobuy_associations
    where candidate_product_id = '10000000-0000-4000-8000-000000000006'
  ),
  'inactive candidates are excluded from the projection'
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
  2::bigint,
  'the full qualifying source set is persisted without synthetic fill'
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
