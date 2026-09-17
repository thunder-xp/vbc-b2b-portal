begin;

alter table public.one_c_service_history
  add column organization_ref text null,
  add column service_amount numeric(18,2) null,
  add column vat_amount numeric(18,2) null,
  add column currency_ref text null,
  add column currency_code text null,
  add column sum_includes_vat boolean null,
  add column vat_included_in_cost boolean null,
  add column repair_completed boolean not null default false,
  add column issued_to_customer boolean not null default false,
  add column repair_result boolean null,
  add column repair_completion_variant text null,
  add column repair_variant text null,
  add column taxation_mode text null,
  add column repair_completed_at timestamptz null,
  add column issued_at timestamptz null,
  add column completed_service_eligible boolean not null default false,
  add column service_financial_checked_at timestamptz null;

alter table public.one_c_service_history
  add constraint one_c_service_history_organization_ref_check
    check (organization_ref is null or organization_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
  add constraint one_c_service_history_service_amount_check
    check (service_amount is null or service_amount >= 0),
  add constraint one_c_service_history_vat_amount_check
    check (vat_amount is null or vat_amount >= 0),
  add constraint one_c_service_history_currency_ref_check
    check (currency_ref is null or currency_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
  add constraint one_c_service_history_currency_code_check
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  add constraint one_c_service_history_completed_service_check
    check (not completed_service_eligible or (repair_completed and repair_completed_at is not null));

create index one_c_service_history_company_completed_month_idx
  on public.one_c_service_history (company_id, repair_completed_at, currency_code)
  include (service_amount, vat_amount)
  where partner_visible and is_active and completed_service_eligible;

alter table public.one_c_service_history_sync_runs
  drop constraint one_c_service_history_sync_runs_mode_check;

alter table public.one_c_service_history_sync_runs
  add constraint one_c_service_history_sync_runs_mode_check
  check (mode in ('initial', 'incremental', 'historical_reconciliation', 'completed_work_backfill', 'financial_backfill'));

create or replace function public.claim_one_c_service_history_sync_v3(p_page_size integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target public.one_c_service_history_sync_runs;
  token uuid := gen_random_uuid();
  run_mode text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role access required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('one_c_service_history_sync'));
  update public.one_c_service_history_sync_runs
  set status = 'failed', safe_error_code = 'stale_lock', finished_at = now(), updated_at = now()
  where status = 'running' and locked_until < now() - interval '2 minutes';

  select * into target
  from public.one_c_service_history_sync_runs
  where status = 'running'
  limit 1
  for update;

  if found and target.locked_until > now() then
    return null;
  end if;

  if not found then
    if exists (select 1 from public.one_c_service_history where completed_work_checked_at is null) then
      run_mode := 'completed_work_backfill';
    elsif exists (select 1 from public.one_c_service_history where service_financial_checked_at is null) then
      run_mode := 'financial_backfill';
    else
      if exists (
        select 1 from public.one_c_service_history_sync_runs
        where status = 'succeeded' and finished_at > now() - interval '55 minutes'
      ) then
        return null;
      end if;
      run_mode := case
        when not exists (select 1 from public.one_c_service_history_sync_runs where status = 'succeeded') then 'initial'
        when not exists (
          select 1 from public.one_c_service_history_sync_runs
          where status = 'succeeded' and mode = 'historical_reconciliation'
            and finished_at > now() - interval '6 days'
        ) then 'historical_reconciliation'
        else 'incremental'
      end;
    end if;

    insert into public.one_c_service_history_sync_runs(mode, range_start, range_end, page_size)
    values (
      run_mode,
      case
        when run_mode in ('completed_work_backfill', 'financial_backfill') then coalesce(
          (select min(source_document_date)::date from public.one_c_service_history),
          current_date - interval '60 months'
        )
        when run_mode in ('initial', 'historical_reconciliation') then current_date - interval '60 months'
        else current_date - interval '120 days'
      end,
      current_date,
      least(greatest(p_page_size, 1), 100)
    )
    returning * into target;
  end if;

  update public.one_c_service_history_sync_runs
  set lock_token = token, locked_until = now() + interval '4 minutes', updated_at = now()
  where id = target.id
  returning * into target;

  return jsonb_build_object(
    'runId', target.id,
    'lockToken', token,
    'mode', target.mode,
    'skip', target.current_skip,
    'pageSize', target.page_size,
    'rangeStart', target.range_start,
    'rangeEnd', target.range_end,
    'baseline', target.mode = 'initial'
  );
end;
$$;

create or replace function public.publish_one_c_service_history_page_v3(
  p_run_id uuid,
  p_lock_token uuid,
  p_skip integer,
  p_rows jsonb,
  p_page_complete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
  financial_checked integer := 0;
  cost_present integer := 0;
  cost_missing integer := 0;
  vat_present integer := 0;
  status_mapped integer := 0;
  completed_eligible integer := 0;
  currency_counts jsonb := '{}'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service-role access required.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 100 then
    raise exception 'Invalid service-history page.' using errcode = '22023';
  end if;

  result := public.publish_one_c_service_history_page_v2(
    p_run_id,
    p_lock_token,
    p_skip,
    p_rows,
    p_page_complete
  );

  create temporary table service_financial_source on commit drop as
  select
    lower(row->>'source_document_ref') as source_document_ref,
    nullif(lower(row->>'organization_ref'), '') as organization_ref,
    nullif(btrim(left(coalesce(row->>'contract_snapshot', ''), 500)), '') as contract_snapshot,
    nullif(row->>'service_amount', '')::numeric(18,2) as service_amount,
    nullif(row->>'vat_amount', '')::numeric(18,2) as vat_amount,
    nullif(lower(row->>'currency_ref'), '') as currency_ref,
    nullif(upper(row->>'currency_code'), '') as currency_code,
    nullif(row->>'sum_includes_vat', '')::boolean as sum_includes_vat,
    nullif(row->>'vat_included_in_cost', '')::boolean as vat_included_in_cost,
    coalesce((row->>'repair_completed')::boolean, false) as repair_completed,
    coalesce((row->>'issued_to_customer')::boolean, false) as issued_to_customer,
    nullif(row->>'repair_result', '')::boolean as repair_result,
    nullif(btrim(left(coalesce(row->>'repair_completion_variant', ''), 200)), '') as repair_completion_variant,
    nullif(btrim(left(coalesce(row->>'repair_variant', ''), 200)), '') as repair_variant,
    nullif(btrim(left(coalesce(row->>'taxation_mode', ''), 200)), '') as taxation_mode,
    nullif(row->>'repair_completed_at', '')::timestamptz as repair_completed_at,
    nullif(row->>'issued_at', '')::timestamptz as issued_at
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) row;

  if exists (
    select 1 from service_financial_source
    where source_document_ref !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or (organization_ref is not null and organization_ref !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
      or (currency_ref is not null and currency_ref !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
      or (currency_code is not null and currency_code !~ '^[A-Z]{3}$')
      or service_amount < 0
      or vat_amount < 0
      or (repair_completed and repair_completed_at is null)
  ) then
    raise exception 'Invalid service financial source row.' using errcode = '22023';
  end if;

  with updated as (
    update public.one_c_service_history history
    set organization_ref = source.organization_ref,
        contract_snapshot = source.contract_snapshot,
        service_amount = source.service_amount,
        vat_amount = source.vat_amount,
        currency_ref = source.currency_ref,
        currency_code = source.currency_code,
        sum_includes_vat = source.sum_includes_vat,
        vat_included_in_cost = source.vat_included_in_cost,
        repair_completed = source.repair_completed,
        issued_to_customer = source.issued_to_customer,
        repair_result = source.repair_result,
        repair_completion_variant = source.repair_completion_variant,
        repair_variant = source.repair_variant,
        taxation_mode = source.taxation_mode,
        repair_completed_at = source.repair_completed_at,
        issued_at = source.issued_at,
        completed_service_eligible = source.repair_completed
          and source.repair_completed_at is not null
          and lower(history.source_status_ref) in (
            'eae23441-315b-11e9-a7dc-94de80db60f1',
            'eae23442-315b-11e9-a7dc-94de80db60f1'
          )
          and history.source_posted
          and not history.source_deletion_mark,
        service_financial_checked_at = now(),
        updated_at = now()
    from service_financial_source source
    where history.source_document_ref = source.source_document_ref
      and history.last_seen_run_id = p_run_id
    returning history.service_amount, history.vat_amount, history.currency_code,
      history.normalized_status, history.completed_service_eligible
  ), currency_groups as (
    select currency_code, count(*) as documents
    from updated
    where currency_code is not null
    group by currency_code
  )
  select
    (select count(*) from updated),
    (select count(*) from updated where service_amount is not null),
    (select count(*) from updated where service_amount is null),
    (select count(*) from updated where vat_amount is not null),
    (select count(*) from updated where normalized_status <> 'unknown'),
    (select count(*) from updated where completed_service_eligible),
    coalesce((select jsonb_object_agg(currency_code, documents) from currency_groups), '{}'::jsonb)
  into financial_checked, cost_present, cost_missing, vat_present, status_mapped,
    completed_eligible, currency_counts;

  return result || jsonb_build_object(
    'financialChecked', financial_checked,
    'costPresent', cost_present,
    'costMissing', cost_missing,
    'vatPresent', vat_present,
    'statusMapped', status_mapped,
    'completedEligible', completed_eligible,
    'currencyCounts', currency_counts
  );
end;
$$;

create or replace function public.list_partner_service_history(
  p_company_id uuid,
  p_query text default '',
  p_filter text default 'all',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
with input as (
  select lower(btrim(coalesce(p_query, ''))) q,
    case when p_filter in ('active', 'ready', 'completed', 'all') then p_filter else 'all' end filter_mode,
    greatest(p_page, 1) page,
    least(greatest(p_page_size, 1), 50) page_size
), unified as (
  select c.id, 'portal' source_type, c.case_number number, c.created_at document_date, c.status status,
    p.id product_id, p.sku, p.name product_name,
    case when p.id is not null and p.is_active and p.is_visible then coalesce(p.image_source_url, p.image_url) end image_url,
    case when p.id is not null and p.is_active and p.is_visible then '/cabinet/catalog/' || p.slug end product_href,
    case when c.entered_serial_number is null then null when char_length(c.entered_serial_number) <= 6
      then left(c.entered_serial_number, 1) || '***' || right(c.entered_serial_number, 1)
      else left(c.entered_serial_number, 3) || '***' || right(c.entered_serial_number, 3) end masked_serial,
    c.partner_description reported_fault, c.partner_description work_summary,
    null::text service_amount, null::text vat_amount, null::text currency,
    c.warranty_eligibility_state warranty_state, c.warranty_end_date, c.updated_at,
    '/cabinet/service/' || c.id href,
    c.status not in ('closed', 'rejected', 'cancelled') active,
    c.status = 'ready_for_pickup' ready,
    c.status in ('closed', 'rejected', 'cancelled') completed
  from public.service_cases c
  left join public.catalog_products p on p.id = c.product_id
  where c.company_id = p_company_id
  union all
  select h.id, 'one_c', h.source_document_number, h.source_document_date, h.normalized_status,
    p.id, p.sku, coalesce(p.name, h.product_name_snapshot),
    case when p.id is not null and p.is_active and p.is_visible then coalesce(p.image_source_url, p.image_url) end,
    case when p.id is not null and p.is_active and p.is_visible then '/cabinet/catalog/' || p.slug end,
    h.masked_serial, h.reported_fault, coalesce(h.completed_work_summary, h.reported_fault),
    h.service_amount::text, h.vat_amount::text, h.currency_code,
    h.warranty_state_snapshot, h.warranty_end_date, h.updated_at,
    '/cabinet/service/history/' || h.id,
    h.normalized_status not in ('issued_to_customer', 'closed', 'rejected'),
    h.normalized_status = 'ready_for_pickup',
    h.normalized_status in ('issued_to_customer', 'closed', 'rejected')
  from public.one_c_service_history h
  left join public.catalog_products p on p.id = h.product_id
  where h.company_id = p_company_id and h.partner_visible and h.is_active
), visible as (
  select unified.* from unified, input
  where public.has_permission(p_company_id, 'service.view')
    and (input.q = '' or lower(number || ' ' || coalesce(sku, '') || ' ' || coalesce(product_name, '') || ' ' || coalesce(masked_serial, '')) like '%' || input.q || '%')
    and (input.filter_mode = 'all' or input.filter_mode = 'active' and active or input.filter_mode = 'ready' and ready or input.filter_mode = 'completed' and completed)
), paged as (
  select visible.*, count(*) over() total_count from visible
  order by document_date desc, id desc
  offset (select (page - 1) * page_size from input)
  limit (select page_size from input)
), canonical_images as (
  select distinct on (image.product_id) image.product_id, image.url
  from public.catalog_product_images image
  join (select distinct product_id from paged where product_id is not null and image_url is null) relevant
    on relevant.product_id = image.product_id
  order by image.product_id, image.is_primary desc, image.sort_order, image.id
), enriched as (
  select paged.*, coalesce(paged.image_url, canonical_images.url) resolved_image_url
  from paged left join canonical_images on canonical_images.product_id = paged.product_id
)
select jsonb_build_object(
  'items', coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'sourceType', source_type, 'number', number, 'date', document_date, 'status', status,
    'productId', product_id, 'productSku', sku, 'productName', product_name,
    'productImageUrl', resolved_image_url, 'productHref', product_href, 'maskedSerial', masked_serial,
    'reportedFault', reported_fault, 'workSummary', work_summary, 'serviceAmount', service_amount,
    'vatAmount', vat_amount, 'currency', currency, 'warrantyState', warranty_state,
    'warrantyEndDate', warranty_end_date, 'updatedAt', updated_at, 'href', href
  ) order by document_date desc, id desc), '[]'::jsonb),
  'total', coalesce(max(total_count), 0),
  'page', (select page from input)
)
from enriched;
$$;

create or replace function public.get_partner_service_month_summary(p_company_id uuid, p_month date)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
with bounds as (
  select date_trunc('month', p_month)::date month_start,
    (date_trunc('month', p_month) + interval '1 month')::date month_end,
    date_trunc('month', current_date)::date current_month,
    (date_trunc('month', current_date) - interval '59 months')::date minimum_month
), eligible as (
  select h.currency_code, h.service_amount, h.vat_amount
  from public.one_c_service_history h, bounds
  where public.has_permission(p_company_id, 'service.view')
    and h.company_id = p_company_id
    and h.partner_visible and h.is_active and h.completed_service_eligible
    and h.repair_completed_at >= bounds.month_start
    and h.repair_completed_at < bounds.month_end
), grouped as (
  select currency_code, count(*)::integer completed_service_count,
    coalesce(sum(service_amount), 0)::numeric(18,2) total_service_amount,
    coalesce(sum(vat_amount), 0)::numeric(18,2) total_vat_amount
  from eligible
  where currency_code is not null
  group by currency_code
)
select jsonb_build_object(
  'month', to_char(bounds.month_start, 'YYYY-MM'),
  'previousMonth', case when bounds.month_start > bounds.minimum_month then to_char(bounds.month_start - interval '1 month', 'YYYY-MM') end,
  'nextMonth', case when bounds.month_start < bounds.current_month then to_char(bounds.month_start + interval '1 month', 'YYYY-MM') end,
  'currencies', coalesce((select jsonb_agg(jsonb_build_object(
    'currency', currency_code,
    'completedServiceCount', completed_service_count,
    'totalServiceAmount', total_service_amount::text,
    'totalVatAmount', total_vat_amount::text
  ) order by currency_code) from grouped), '[]'::jsonb),
  'unknownCurrencyCount', (select count(*) from eligible where currency_code is null)
)
from bounds;
$$;

create or replace function public.get_partner_service_workspace(
  p_company_id uuid,
  p_query text default '',
  p_filter text default 'all',
  p_page integer default 1,
  p_page_size integer default 20,
  p_month date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
select jsonb_build_object(
  'history', public.list_partner_service_history(p_company_id, p_query, p_filter, p_page, p_page_size),
  'monthlySummary', public.get_partner_service_month_summary(p_company_id, p_month)
);
$$;

create or replace function public.get_partner_one_c_service_history(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
select case when public.has_permission(h.company_id, 'service.view') and h.partner_visible and h.is_active then jsonb_build_object(
  'id', h.id, 'number', h.source_document_number, 'date', h.source_document_date,
  'status', h.normalized_status, 'sourceStatus', h.source_status,
  'product', case when p.id is not null and p.is_active and p.is_visible then jsonb_build_object(
    'id', p.id, 'sku', p.sku, 'name', p.name,
    'imageUrl', coalesce(p.image_source_url, p.image_url, image.url),
    'href', '/cabinet/catalog/' || p.slug
  ) else jsonb_build_object('id', null, 'sku', h.product_sku_snapshot, 'name', h.product_name_snapshot, 'imageUrl', null, 'href', null) end,
  'maskedSerial', h.masked_serial, 'reportedFault', h.reported_fault,
  'completedWorkSummary', h.completed_work_summary, 'resolution', h.partner_visible_resolution,
  'serviceAmount', h.service_amount::text, 'vatAmount', h.vat_amount::text,
  'currency', h.currency_code, 'sumIncludesVat', h.sum_includes_vat,
  'repairCompletedAt', h.repair_completed_at, 'issuedAt', h.issued_at,
  'contract', h.contract_snapshot,
  'warrantyState', h.warranty_state_snapshot, 'warrantyStartDate', h.warranty_start_date,
  'warrantyEndDate', h.warranty_end_date, 'serviceCenter', h.service_center_snapshot,
  'updatedAt', h.updated_at,
  'events', coalesce((select jsonb_agg(jsonb_build_object(
    'id', e.id, 'type', e.event_type, 'status', e.normalized_status, 'occurredAt', e.occurred_at
  ) order by e.occurred_at, e.id) from public.one_c_service_history_events e
  where e.service_history_id = h.id and e.event_type <> 'redetected'), '[]'::jsonb)
) else null end
from public.one_c_service_history h
left join public.catalog_products p on p.id = h.product_id
left join lateral (
  select product_image.url from public.catalog_product_images product_image
  where product_image.product_id = p.id
  order by product_image.is_primary desc, product_image.sort_order, product_image.id limit 1
) image on true
where h.id = p_id;
$$;

create or replace function public.get_admin_one_c_service_history(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
select case when public.has_internal_permission('admin.service.view') then jsonb_build_object(
  'id', h.id, 'number', h.source_document_number, 'date', h.source_document_date,
  'status', h.normalized_status, 'sourceStatus', h.source_status,
  'product', case when p.id is not null and p.is_active and p.is_visible then jsonb_build_object(
    'id', p.id, 'sku', p.sku, 'name', p.name, 'imageUrl', coalesce(p.image_source_url, p.image_url),
    'href', '/cabinet/catalog/' || p.slug
  ) else jsonb_build_object('id', null, 'sku', h.product_sku_snapshot, 'name', h.product_name_snapshot, 'imageUrl', null, 'href', null) end,
  'maskedSerial', h.masked_serial, 'protectedSerial', h.protected_serial,
  'reportedFault', h.reported_fault, 'completedWorkSummary', h.completed_work_summary,
  'resolution', h.partner_visible_resolution,
  'serviceAmount', h.service_amount::text, 'vatAmount', h.vat_amount::text,
  'currency', h.currency_code, 'sumIncludesVat', h.sum_includes_vat,
  'repairCompletedAt', h.repair_completed_at, 'issuedAt', h.issued_at,
  'contract', h.contract_snapshot,
  'warrantyState', h.warranty_state_snapshot, 'warrantyStartDate', h.warranty_start_date,
  'warrantyEndDate', h.warranty_end_date, 'serviceCenter', h.service_center_snapshot,
  'updatedAt', h.updated_at,
  'events', coalesce((select jsonb_agg(jsonb_build_object(
    'id', e.id, 'type', e.event_type, 'status', e.normalized_status, 'occurredAt', e.occurred_at
  ) order by e.occurred_at, e.id) from public.one_c_service_history_events e
  where e.service_history_id = h.id and e.event_type <> 'redetected'), '[]'::jsonb)
) else null end
from public.one_c_service_history h
left join public.catalog_products p on p.id = h.product_id
where h.id = p_id;
$$;

create or replace function public.get_one_c_service_history_diagnostics()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
select case when public.has_internal_permission('admin.service.view') then jsonb_build_object(
  'imported', (select count(*) from public.one_c_service_history),
  'mappedCompanies', (select count(*) from public.one_c_service_history where company_id is not null),
  'unmappedCompanies', (select count(*) from public.one_c_service_history where company_id is null),
  'mappedProducts', (select count(*) from public.one_c_service_history where product_id is not null),
  'unmappedProducts', (select count(*) from public.one_c_service_history where product_id is null),
  'serialLinked', (select count(*) from public.one_c_service_history where serial_hash is not null),
  'serialUnlinked', (select count(*) from public.one_c_service_history where serial_hash is null),
  'serialResolved', (select count(*) from public.one_c_service_history where serial_resolution_state = 'resolved'),
  'serialUnmapped', (select count(*) from public.one_c_service_history where serial_resolution_state = 'unmapped'),
  'serialConflicting', (select count(*) from public.one_c_service_history where serial_resolution_state = 'conflict' or warranty_link_state = 'conflict'),
  'warrantyStateLinked', (select count(*) from public.one_c_service_history where warranty_link_state in ('linked', 'review_required')),
  'activeRepairs', (select count(*) from public.one_c_service_history where is_active and normalized_status not in ('issued_to_customer', 'closed', 'rejected')),
  'readyForPickup', (select count(*) from public.one_c_service_history where is_active and normalized_status = 'ready_for_pickup'),
  'issued', (select count(*) from public.one_c_service_history where normalized_status = 'issued_to_customer'),
  'unknownStatuses', (select count(*) from public.one_c_service_history where normalized_status = 'unknown'),
  'inactive', (select count(*) from public.one_c_service_history where not is_active),
  'conflicts', (select count(*) from public.one_c_service_history_conflicts),
  'latestSourceDate', (select max(source_document_date) from public.one_c_service_history),
  'latestSync', (select to_jsonb(r) from public.one_c_service_history_sync_runs r order by started_at desc limit 1),
  'latestSerialEnrichment', (select to_jsonb(r) from public.one_c_service_serial_enrichment_runs r order by started_at desc limit 1),
  'serviceDocumentsRead', (select count(*) from public.one_c_service_history),
  'costPresent', (select count(*) from public.one_c_service_history where service_amount is not null),
  'costMissing', (select count(*) from public.one_c_service_history where service_amount is null),
  'vatPresent', (select count(*) from public.one_c_service_history where vat_amount is not null),
  'statusMapped', (select count(*) from public.one_c_service_history where normalized_status <> 'unknown'),
  'completedEligible', (select count(*) from public.one_c_service_history where completed_service_eligible),
  'currencyCounts', coalesce((select jsonb_object_agg(currency_code, documents) from (
    select currency_code, count(*) documents from public.one_c_service_history
    where currency_code is not null group by currency_code
  ) currencies), '{}'::jsonb)
) else null end;
$$;

revoke all on function public.claim_one_c_service_history_sync_v3(integer),
  public.publish_one_c_service_history_page_v3(uuid, uuid, integer, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_one_c_service_history_sync_v3(integer),
  public.publish_one_c_service_history_page_v3(uuid, uuid, integer, jsonb, boolean)
  to service_role;

revoke all on function public.get_partner_service_month_summary(uuid, date),
  public.get_partner_service_workspace(uuid, text, text, integer, integer, date)
  from public, anon;
grant execute on function public.get_partner_service_month_summary(uuid, date),
  public.get_partner_service_workspace(uuid, text, text, integer, integer, date)
  to authenticated;

revoke all on function public.list_partner_service_history(uuid, text, text, integer, integer),
  public.get_partner_one_c_service_history(uuid),
  public.get_admin_one_c_service_history(uuid),
  public.get_one_c_service_history_diagnostics()
  from public, anon;
grant execute on function public.list_partner_service_history(uuid, text, text, integer, integer),
  public.get_partner_one_c_service_history(uuid) to authenticated;
grant execute on function public.get_admin_one_c_service_history(uuid),
  public.get_one_c_service_history_diagnostics() to authenticated;

commit;
