begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('da500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dashboard-active@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('da500000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dashboard-outsider@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('da500000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'dashboard-suspended@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('da500000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dashboard-no-orders@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('da500000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'dashboard-revoked@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.user_profiles (id, email, full_name, status, user_type)
values
  ('da500000-0000-4000-8000-000000000001', 'dashboard-active@example.test', 'Dashboard Active', 'active', 'partner'),
  ('da500000-0000-4000-8000-000000000002', 'dashboard-outsider@example.test', 'Dashboard Outsider', 'active', 'partner'),
  ('da500000-0000-4000-8000-000000000003', 'dashboard-suspended@example.test', 'Dashboard Suspended', 'active', 'partner'),
  ('da500000-0000-4000-8000-000000000004', 'dashboard-no-orders@example.test', 'Dashboard No Orders', 'active', 'partner'),
  ('da500000-0000-4000-8000-000000000005', 'dashboard-revoked@example.test', 'Dashboard Revoked', 'active', 'partner')
on conflict (id) do update
set status = excluded.status, user_type = excluded.user_type;

insert into public.roles (id, code, name, scope)
values ('da500000-0000-4000-8000-000000000010', 'dashboard_no_orders_test', 'Dashboard no orders test', 'partner');

insert into public.partner_companies (id, external_1c_id, display_name, status)
values
  ('da500000-0000-4000-8000-000000000101', 'DASHBOARD-RUNTIME-A', 'Dashboard Runtime A', 'active'),
  ('da500000-0000-4000-8000-000000000102', 'DASHBOARD-RUNTIME-B', 'Dashboard Runtime B', 'active');

insert into public.company_memberships (user_id, company_id, role_id, status)
select 'da500000-0000-4000-8000-000000000001', 'da500000-0000-4000-8000-000000000101', role.id, 'active'
from public.roles role where role.code = 'partner_owner';
insert into public.company_memberships (user_id, company_id, role_id, status)
select 'da500000-0000-4000-8000-000000000003', 'da500000-0000-4000-8000-000000000101', role.id, 'suspended'
from public.roles role where role.code = 'partner_owner';
insert into public.company_memberships (user_id, company_id, role_id, status)
select 'da500000-0000-4000-8000-000000000005', 'da500000-0000-4000-8000-000000000101', role.id, 'revoked'
from public.roles role where role.code = 'partner_owner';
insert into public.company_memberships (user_id, company_id, role_id, status)
values (
  'da500000-0000-4000-8000-000000000004',
  'da500000-0000-4000-8000-000000000101',
  'da500000-0000-4000-8000-000000000010',
  'active'
);

insert into public.partner_order_history (
  company_id, external_1c_order_ref, external_1c_order_number,
  one_c_posted, one_c_deletion_mark, one_c_document_date,
  one_c_last_synced_at, document_total, currency_code,
  source_counterparty_1c_id
)
values
  (
    'da500000-0000-4000-8000-000000000101', 'DASHBOARD-CURRENT', 'DASHBOARD-CURRENT',
    true, false,
    ((now() at time zone 'Europe/Chisinau')::date + time '12:00') at time zone 'Europe/Chisinau',
    now(), 125.50, 'USD', 'da500000-0000-4000-8000-000000000101'
  ),
  (
    'da500000-0000-4000-8000-000000000101', 'DASHBOARD-PREVIOUS', 'DASHBOARD-PREVIOUS',
    true, false,
    ((((now() at time zone 'Europe/Chisinau')::date - interval '1 year')::date + time '12:00') at time zone 'Europe/Chisinau'),
    now(), 100.00, 'USD', 'da500000-0000-4000-8000-000000000101'
  );

set local role authenticated;

do $$
declare
  company_id constant uuid := 'da500000-0000-4000-8000-000000000101';
  wrong_company_id constant uuid := 'da500000-0000-4000-8000-000000000102';
  dashboard jsonb;
  repeated jsonb;
  comparison_days integer[];
  business_date date := (now() at time zone 'Europe/Chisinau')::date;
begin
  perform set_config('request.jwt.claim.sub', 'da500000-0000-4000-8000-000000000001', true);
  dashboard := public.get_partner_workspace_dashboard_v7(company_id);
  repeated := public.get_partner_workspace_dashboard_v7(company_id);

  if dashboard <> repeated then
    raise exception 'Dashboard aggregate is not deterministic for unchanged source state.';
  end if;
  if not dashboard ?& array[
    'attentionItems', 'orderSummary', 'shipmentSummary', 'continuationItems',
    'reorderProducts', 'merchandisingProducts', 'financeSummary',
    'salesAnalytics', 'companySummary', 'freshness'
  ] then
    raise exception 'Dashboard aggregate field contract changed: %', dashboard;
  end if;
  if dashboard #>> '{salesAnalytics,businessDate}' <> business_date::text then
    raise exception 'Europe/Chisinau business date changed: %', dashboard #> '{salesAnalytics,businessDate}';
  end if;
  if jsonb_array_length(dashboard #> '{salesAnalytics,series,0,points}') <> 12 then
    raise exception 'Dashboard Sales chart no longer has twelve monthly points.';
  end if;
  select array_agg((item->>'days')::integer order by (item->>'days')::integer)
  into comparison_days
  from jsonb_array_elements(dashboard #> '{salesAnalytics,series,0,comparisons}') item;
  if comparison_days <> array[30, 60, 90, 180] then
    raise exception 'Dashboard Sales periods changed: %', comparison_days;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(dashboard #> '{salesAnalytics,series,0,comparisons}') item
    where item->>'currentEnd' <> business_date::text
      or item->>'previousEnd' <> (business_date - interval '1 year')::date::text
  ) then
    raise exception 'Dashboard current/YoY period boundaries changed.';
  end if;

  perform set_config('request.jwt.claim.sub', 'da500000-0000-4000-8000-000000000004', true);
  dashboard := public.get_partner_workspace_dashboard_v7(company_id);
  if dashboard #> '{salesAnalytics,series}' <> '[]'::jsonb then
    raise exception 'User without orders.view received Sales analytics.';
  end if;

  perform set_config('request.jwt.claim.sub', 'da500000-0000-4000-8000-000000000002', true);
  begin
    perform public.get_partner_workspace_dashboard_v7(company_id);
    raise exception 'User without membership read the Dashboard.';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub', 'da500000-0000-4000-8000-000000000003', true);
  begin
    perform public.get_partner_workspace_dashboard_v7(company_id);
    raise exception 'Suspended member read the Dashboard.';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub', 'da500000-0000-4000-8000-000000000005', true);
  begin
    perform public.get_partner_workspace_dashboard_v7(company_id);
    raise exception 'Revoked member read the Dashboard.';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub', 'da500000-0000-4000-8000-000000000001', true);
  begin
    perform public.get_partner_workspace_dashboard_v7(wrong_company_id);
    raise exception 'Active member read another company Dashboard.';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

reset role;
rollback;

select 'dashboard_aggregate_permission_optimization_runtime_passed' as result;
