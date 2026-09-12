begin;

set local search_path = public, extensions, pg_temp;

select plan(23);

insert into public.catalog_products (
  id, external_1c_id, sku, name, slug, is_active, is_visible
) values (
  '10000000-0000-4000-8000-000000000091',
  '90000000-0000-4000-8000-000000000001',
  'GLOBAL-HISTORY-1', 'Global history product', 'global-history-product', true, true
);

insert into public.partner_companies (id, external_1c_id, display_name, status)
values
  ('20000000-0000-4000-8000-000000000091', '91000000-0000-4000-8000-000000000001', 'Mapped A', 'active'),
  ('20000000-0000-4000-8000-000000000092', '91000000-0000-4000-8000-000000000002', 'Mapped B', 'active');

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '70000000-0000-4000-8000-000000000091', 'authenticated', 'authenticated',
  'global-history-a@example.test', now(), now()
);

insert into public.user_profiles (id, email, full_name, status, user_type)
values (
  '70000000-0000-4000-8000-000000000091', 'global-history-a@example.test',
  'Global history A', 'active', 'external'
);

insert into public.company_memberships (
  user_id, company_id, role_id, status, approved_by, approved_at
)
select
  '70000000-0000-4000-8000-000000000091',
  '20000000-0000-4000-8000-000000000091',
  role.id, 'active', '70000000-0000-4000-8000-000000000091', now()
from public.roles role
where role.code = 'partner_owner';

insert into public.one_c_counterparty_directory_syncs (
  sync_id, status, started_at, finished_at
) values (
  '80000000-0000-4000-8000-000000000091', 'succeeded', now(), now()
);

insert into public.one_c_counterparties (
  sync_id, external_1c_id, name, normalized_name, is_active, is_deleted,
  portal_company_id, synchronization_version, synchronized_at, is_published,
  counterparty_type_code
) values
  (
    '80000000-0000-4000-8000-000000000091',
    '91000000-0000-4000-8000-000000000001', 'Mapped A', 'mapped a', true, false,
    '20000000-0000-4000-8000-000000000091', 'test', now(), true, 'ЮридическоеЛицо'
  ),
  (
    '80000000-0000-4000-8000-000000000091',
    '91000000-0000-4000-8000-000000000002', 'Mapped B', 'mapped b', true, false,
    '20000000-0000-4000-8000-000000000092', 'test', now(), true, 'ЮридическоеЛицо'
  );

create temporary table global_history_test_context as
select (result->>'lockToken')::uuid as lock_token
from (
  select public.acquire_partner_order_history_global_sync(true, 600) result
) acquired;

create temporary table global_history_header_result as
select public.persist_partner_order_history_global_header_page(
  (select lock_token from global_history_test_context),
  '0', '0', false,
  jsonb_build_array(
    jsonb_build_object(
      'external_1c_order_ref', '92000000-0000-4000-8000-000000000001',
      'external_1c_order_number', 'MAPPED-A', 'one_c_document_date', '2018-06-01T10:00:00Z',
      'one_c_posted', true, 'one_c_deletion_mark', false, 'one_c_state_code', 'completed',
      'document_total', 100, 'currency_code', 'MDL',
      'source_counterparty_1c_id', '91000000-0000-4000-8000-000000000001',
      'source_counterparty_type_code', 'ЮридическоеЛицо',
      'source_operation_code', 'ЗаказНаПродажу'
    ),
    jsonb_build_object(
      'external_1c_order_ref', '92000000-0000-4000-8000-000000000002',
      'external_1c_order_number', 'MAPPED-B', 'one_c_document_date', '2019-06-01T10:00:00Z',
      'one_c_posted', true, 'one_c_deletion_mark', false, 'one_c_state_code', 'completed',
      'document_total', 200, 'currency_code', 'MDL',
      'source_counterparty_1c_id', '91000000-0000-4000-8000-000000000002',
      'source_counterparty_type_code', 'ЮридическоеЛицо',
      'source_operation_code', 'ЗаказНаПродажу'
    ),
    jsonb_build_object(
      'external_1c_order_ref', '92000000-0000-4000-8000-000000000003',
      'external_1c_order_number', 'UNMAPPED-LEGAL', 'one_c_document_date', '2020-06-01T10:00:00Z',
      'one_c_posted', true, 'one_c_deletion_mark', false, 'one_c_state_code', 'completed',
      'document_total', 300, 'currency_code', 'MDL',
      'source_counterparty_1c_id', '91000000-0000-4000-8000-000000000003',
      'source_counterparty_type_code', 'ЮридическоеЛицо',
      'source_operation_code', 'ЗаказНаПродажу'
    ),
    jsonb_build_object(
      'external_1c_order_ref', '92000000-0000-4000-8000-000000000004',
      'external_1c_order_number', 'PHYSICAL', 'one_c_document_date', '2021-06-01T10:00:00Z',
      'one_c_posted', true, 'one_c_deletion_mark', false, 'one_c_state_code', 'completed',
      'document_total', 400, 'currency_code', 'MDL',
      'source_counterparty_1c_id', '91000000-0000-4000-8000-000000000004',
      'source_counterparty_type_code', 'ФизическоеЛицо',
      'source_operation_code', 'ЗаказНаПродажу'
    ),
    jsonb_build_object(
      'external_1c_order_ref', '92000000-0000-4000-8000-000000000005',
      'external_1c_order_number', 'UNMAPPED-IP', 'one_c_document_date', '2022-06-01T10:00:00Z',
      'one_c_posted', true, 'one_c_deletion_mark', false, 'one_c_state_code', 'completed',
      'document_total', 500, 'currency_code', 'MDL',
      'source_counterparty_1c_id', '91000000-0000-4000-8000-000000000005',
      'source_counterparty_type_code', 'ИндивидуальныйПредприниматель',
      'source_operation_code', 'ЗаказНаПродажу'
    )
  ),
  '{"scanned":5}'::jsonb
) result;

select is(
  ((select result from global_history_header_result)->>'inserted')::integer,
  4,
  'eligible mapped and unmapped B2B headers are inserted'
);
select is(
  (select count(*) from public.partner_order_history), 4::bigint,
  'physical-person order is excluded'
);
select is(
  (select company_id from public.partner_order_history where external_1c_order_number = 'MAPPED-A'),
  '20000000-0000-4000-8000-000000000091'::uuid,
  'mapped buyer receives its governed company identity'
);
select is(
  (select company_id from public.partner_order_history where external_1c_order_number = 'UNMAPPED-LEGAL'),
  null::uuid,
  'unmapped legal buyer remains without a portal company'
);
select is(
  (select source_counterparty_1c_id from public.partner_order_history where external_1c_order_number = 'UNMAPPED-LEGAL'),
  '91000000-0000-4000-8000-000000000003',
  'unmapped order retains canonical 1C counterparty identity'
);
select ok(
  (select not partner_visible and hidden_reason = 'unmapped_historical_b2b'
   from public.partner_order_history where external_1c_order_number = 'UNMAPPED-LEGAL'),
  'unmapped order is forced analytics-only'
);
select is(
  (select count(*) from public.partner_order_history where global_analytics_eligible),
  4::bigint,
  'all governed B2B orders are globally analytics eligible'
);
select is(
  (select count(*) from public.partner_order_history where external_1c_order_number = 'PHYSICAL'),
  0::bigint,
  'physical-person history is not canonical B2B history'
);

create temporary table global_history_item_result as
select public.persist_partner_order_history_global_item_page(
  (select lock_token from global_history_test_context),
  '0', '0', false,
  (
    select jsonb_agg(jsonb_build_object(
      'external_1c_order_ref', '92000000-0000-4000-8000-' || lpad(line::text, 12, '0'),
      'line_number', 1,
      'external_product_ref', '90000000-0000-4000-8000-000000000001',
      'quantity', 1, 'unit_price', 10, 'line_total', 10
    ))
    from generate_series(1, 5) line
  )
) result;

select is(
  ((select result from global_history_item_result)->>'upserted')::integer,
  4,
  'global item page attaches only to canonical eligible orders'
);
select is(
  (select count(*) from public.partner_order_history_items), 4::bigint,
  'global item scan does not store an ineligible physical-person line'
);
select is(
  (select position_count from public.partner_order_history where external_1c_order_number = 'UNMAPPED-LEGAL'),
  1,
  'unmapped order totals are derived from canonical items'
);
select is(
  (select count(*) from public.get_global_b2b_order_product_membership(
    '2018-01-01', '2026-12-31', null, null, 500
  )),
  4::bigint,
  'bounded global analytics path includes mapped and unmapped B2B orders'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_global_b2b_order_product_membership(date,date,date,uuid,integer)',
    'execute'
  ),
  'partner role cannot execute the global analytics path'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_global_b2b_order_product_membership(date,date,date,uuid,integer)',
    'execute'
  ),
  'service role receives the bounded aggregate-only analytics path'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000091', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000091","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.partner_order_history), 1::bigint,
  'partner RLS exposes only the active membership company order'
);
select is(
  (select count(*) from public.partner_order_history where company_id is null), 0::bigint,
  'partner RLS never exposes unmapped history'
);
select is(
  (select count(*) from public.partner_order_history where external_1c_order_number = 'MAPPED-B'),
  0::bigint,
  'partner RLS never exposes another company order'
);

reset role;

truncate global_history_test_context;
insert into global_history_test_context
select (result->>'lockToken')::uuid
from (select public.acquire_partner_order_history_global_sync(true, 600) result) acquired;

select is(
  (public.persist_partner_order_history_global_header_page(
    (select lock_token from global_history_test_context), '0', '0', false,
    (
      select jsonb_agg(jsonb_build_object(
        'external_1c_order_ref', history.external_1c_order_ref,
        'external_1c_order_number', history.external_1c_order_number,
        'one_c_document_date', history.one_c_document_date,
        'one_c_posted', true, 'one_c_deletion_mark', false,
        'one_c_state_code', 'completed', 'document_total', history.document_total,
        'currency_code', history.currency_code,
        'source_counterparty_1c_id', history.source_counterparty_1c_id,
        'source_counterparty_type_code', history.source_counterparty_type_code,
        'source_operation_code', 'ЗаказНаПродажу'
      ) order by history.external_1c_order_ref)
      from public.partner_order_history history
    ), '{}'::jsonb
  )->>'inserted')::integer,
  0,
  'second header import updates instead of duplicating orders'
);

select lives_ok(
  format(
    'select public.persist_partner_order_history_global_item_page(%L, %L, %L, false, %L::jsonb)',
    (select lock_token from global_history_test_context), '0', '0',
    (
      select jsonb_agg(jsonb_build_object(
        'external_1c_order_ref', history.external_1c_order_ref,
        'line_number', 1,
        'external_product_ref', '90000000-0000-4000-8000-000000000001',
        'quantity', 1, 'unit_price', 10, 'line_total', 10
      ) order by history.external_1c_order_ref)::text
      from public.partner_order_history history
    )
  ),
  'second item import is idempotent'
);
select is(
  (select count(*) from public.partner_order_history), 4::bigint,
  'second import keeps one canonical row per 1C order'
);
select is(
  (select count(*) from public.partner_order_history_items), 4::bigint,
  'second import keeps one canonical row per order line'
);
select is(
  (select count(*) from public.partner_order_history_events where event_type = 'imported'),
  4::bigint,
  'second import does not duplicate import events'
);
select is(
  (select status from public.partner_order_history_global_sync_state where singleton_key = 1),
  'completed',
  'checkpoint reaches a resumable terminal state'
);

select * from finish();

rollback;
