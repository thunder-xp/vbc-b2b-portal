begin;

set local lock_timeout = '5s';

alter table public.catalog_products
  add column if not exists hidden_reason text null,
  add column if not exists hidden_by uuid null references public.user_profiles(id) on delete restrict,
  add column if not exists hidden_at timestamptz null;

alter table public.catalog_products
  drop constraint if exists catalog_products_hidden_reason_length_check;
alter table public.catalog_products
  add constraint catalog_products_hidden_reason_length_check
  check (hidden_reason is null or char_length(btrim(hidden_reason)) between 3 and 500);

comment on column public.catalog_products.is_visible is
  'Portal-owned global catalog visibility. 1C activation and deletion state remain independent commercial source data.';
comment on column public.catalog_products.hidden_reason is
  'Bounded internal reason for the current portal-owned hidden state; never synchronized to 1C.';
comment on column public.catalog_products.hidden_by is
  'Internal actor who last hid the product from portal catalog surfaces.';
comment on column public.catalog_products.hidden_at is
  'Timestamp of the current portal-owned hidden state.';

create index if not exists catalog_products_admin_visibility_idx
  on public.catalog_products(is_visible, is_active, id);
create index if not exists catalog_products_admin_missing_image_idx
  on public.catalog_products(id)
  where coalesce(image_original_url, image_source_url, image_url) is null;

create table public.catalog_product_management_audit_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  product_external_1c_id text not null,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in (
    'CATALOG_IMAGE_UPLOAD_STARTED',
    'CATALOG_IMAGE_FIREBASE_STORED',
    'CATALOG_IMAGE_1C_WRITE_CONFIRMED',
    'CATALOG_IMAGE_REPLACED',
    'CATALOG_IMAGE_UPLOAD_FAILED',
    'CATALOG_PRODUCT_HIDDEN',
    'CATALOG_PRODUCT_PUBLISHED'
  )),
  correlation_id uuid not null,
  stage text not null check (char_length(stage) between 1 and 80),
  old_url text null check (old_url is null or char_length(old_url) <= 2048),
  new_url text null check (new_url is null or char_length(new_url) <= 2048),
  safe_error_code text null check (safe_error_code is null or char_length(safe_error_code) <= 80),
  cleanup_status text null check (cleanup_status is null or cleanup_status in (
    'NOT_REQUIRED', 'COMPLETED', 'PENDING', 'FAILED', 'SKIPPED_UNMANAGED'
  )),
  safe_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_metadata) = 'object'
    and not (safe_metadata ?| array['binary', 'credentials', 'password', 'secret', 'raw_payload'])
  ),
  created_at timestamptz not null default now()
);

create index catalog_product_management_audit_product_idx
  on public.catalog_product_management_audit_events(product_id, created_at desc, id);
create index catalog_product_management_audit_failure_idx
  on public.catalog_product_management_audit_events(created_at desc, id)
  where event_type = 'CATALOG_IMAGE_UPLOAD_FAILED';

create table public.catalog_product_image_mutations (
  correlation_id uuid primary key,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  product_external_1c_id text not null,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  status text not null check (status in (
    'started', 'firebase_stored', 'one_c_confirmed', 'refresh_pending',
    'succeeded', 'failed', 'recovered'
  )),
  stage text not null check (char_length(stage) between 1 and 80),
  old_url text null check (old_url is null or char_length(old_url) <= 2048),
  new_url text null check (new_url is null or char_length(new_url) <= 2048),
  firebase_object_path text null check (
    firebase_object_path is null or firebase_object_path ~ '^products/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpe?g|png|webp)$'
  ),
  safe_error_code text null check (safe_error_code is null or char_length(safe_error_code) <= 80),
  cleanup_status text not null default 'NOT_REQUIRED' check (cleanup_status in (
    'NOT_REQUIRED', 'COMPLETED', 'PENDING', 'FAILED', 'SKIPPED_UNMANAGED'
  )),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index catalog_product_image_mutations_active_failure_idx
  on public.catalog_product_image_mutations(updated_at desc, correlation_id)
  where status in ('failed', 'refresh_pending');

alter table public.catalog_product_management_audit_events enable row level security;
alter table public.catalog_product_image_mutations enable row level security;

revoke all on table public.catalog_product_management_audit_events,
  public.catalog_product_image_mutations from public, anon, authenticated;
grant select, insert on table public.catalog_product_management_audit_events to service_role;
grant select, insert, update on table public.catalog_product_image_mutations to service_role;

create or replace function public.prevent_catalog_product_management_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Catalog product management audit events are append-only.' using errcode = '55000';
end;
$$;

create trigger prevent_catalog_product_management_audit_mutation_trigger
before update or delete on public.catalog_product_management_audit_events
for each row execute function public.prevent_catalog_product_management_audit_mutation();

revoke all on function public.prevent_catalog_product_management_audit_mutation()
  from public, anon, authenticated;

create function public.manage_catalog_product_visibility_v1(
  p_product_id uuid,
  p_visible boolean,
  p_reason text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_product public.catalog_products%rowtype;
  v_actor uuid := auth.uid();
  v_event text;
begin
  if v_actor is null or not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'Catalog product management access denied.' using errcode = '42501';
  end if;
  if p_product_id is null or p_visible is null or p_correlation_id is null
    or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Invalid catalog visibility mutation.' using errcode = '22023';
  end if;

  select * into v_product
  from public.catalog_products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'Catalog product not found.' using errcode = 'P0002';
  end if;

  if v_product.is_visible is not distinct from p_visible then
    return jsonb_build_object(
      'productId', v_product.id,
      'visible', v_product.is_visible,
      'isActiveIn1C', v_product.is_active,
      'changed', false
    );
  end if;

  update public.catalog_products
  set is_visible = p_visible,
      hidden_reason = case when p_visible then null else btrim(p_reason) end,
      hidden_by = case when p_visible then null else v_actor end,
      hidden_at = case when p_visible then null else now() end
  where id = p_product_id;

  v_event := case when p_visible then 'CATALOG_PRODUCT_PUBLISHED' else 'CATALOG_PRODUCT_HIDDEN' end;
  insert into public.catalog_product_management_audit_events(
    product_id, product_external_1c_id, actor_user_id, event_type,
    correlation_id, stage, safe_metadata
  ) values (
    v_product.id, v_product.external_1c_id, v_actor, v_event,
    p_correlation_id, 'portal_visibility',
    jsonb_build_object(
      'reason', btrim(p_reason),
      'previousVisible', v_product.is_visible,
      'nextVisible', p_visible,
      'erpActiveUnchanged', true,
      'erpActive', v_product.is_active
    )
  );

  return jsonb_build_object(
    'productId', v_product.id,
    'visible', p_visible,
    'isActiveIn1C', v_product.is_active,
    'changed', true
  );
end;
$$;

revoke all on function public.manage_catalog_product_visibility_v1(uuid, boolean, text, uuid)
  from public, anon;
grant execute on function public.manage_catalog_product_visibility_v1(uuid, boolean, text, uuid)
  to authenticated;

create function public.get_admin_catalog_management_page_v1(
  p_filter text default 'ALL',
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('admin.catalog.view') then
    raise exception 'Catalog management access denied.' using errcode = '42501';
  end if;
  if p_filter not in (
      'ALL', 'PUBLISHED', 'HIDDEN', 'MISSING_IMAGE', 'MISSING_CATEGORY',
      'MISSING_BRAND', 'MISSING_PRICE', 'STOCK_UNKNOWN', 'NEEDS_ATTENTION',
      'HIDDEN_BY_PORTAL', 'INACTIVE_IN_1C'
    ) or p_limit not between 1 and 50 or p_offset < 0
    or char_length(coalesce(p_search, '')) > 100 then
    raise exception 'Invalid catalog management query.' using errcode = '22023';
  end if;

  with price_state as (
    select price.product_id,
      bool_or(price.is_active and price.is_published) has_price,
      bool_or(price.is_active and price.is_published and price.external_1c_price_type_id =
        'd9c92519-658b-11e8-80d3-000c29a58b59') has_retail_price
    from public.product_prices price
    group by price.product_id
  ), assignment_state as (
    select assignment.product_id,
      jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'labelCode', assignment.label_code,
        'startsAt', assignment.starts_at,
        'endsAt', assignment.ends_at,
        'priority', assignment.priority,
        'isActive', assignment.is_active,
        'isCuratedVisible', assignment.is_curated_visible,
        'source', assignment.source,
        'updatedAt', assignment.updated_at,
        'updatedBy', coalesce(editor.full_name, editor.email)
      ) order by assignment.priority desc, assignment.label_code) assignments
    from public.product_merchandising_assignments assignment
    left join public.user_profiles editor on editor.id = assignment.updated_by
    where assignment.revoked_at is null
    group by assignment.product_id
  ), base as (
    select product.id, product.external_1c_id, product.sku, product.name, product.slug,
      coalesce(product.image_source_url, product.image_original_url, product.image_url) image_url,
      product.image_original_url, product.category_id, product.brand_id,
      category.name category_name, brand.name brand_name,
      product.is_active, product.is_visible, product.hidden_reason,
      product.hidden_at, coalesce(hidden_actor.full_name, hidden_actor.email) hidden_by,
      coalesce(price.has_price, false) has_price,
      coalesce(price.has_retail_price, false) has_retail_price,
      stock.available_quantity,
      stock.is_published and stock.freshness_state = 'authoritative' stock_known,
      coalesce(assignment.assignments, '[]'::jsonb) assignments,
      array_remove(array[
        case when coalesce(product.image_original_url, product.image_source_url, product.image_url) is null then 'MISSING_IMAGE' end,
        case when product.category_id is null then 'MISSING_CATEGORY' end,
        case when product.brand_id is null then 'MISSING_BRAND' end,
        case when not coalesce(price.has_price, false) then 'MISSING_PRICE' end,
        case when not coalesce(stock.is_published and stock.freshness_state = 'authoritative', false) then 'STOCK_UNKNOWN' end,
        case when not product.is_visible then 'HIDDEN_BY_PORTAL' end,
        case when not product.is_active then 'INACTIVE_IN_1C' end
      ], null)::text[] issues
    from public.catalog_products product
    left join public.catalog_categories category on category.id = product.category_id
    left join public.catalog_brands brand on brand.id = product.brand_id
    left join public.user_profiles hidden_actor on hidden_actor.id = product.hidden_by
    left join price_state price on price.product_id = product.id
    left join public.product_stock_totals stock on stock.product_id = product.id
    left join assignment_state assignment on assignment.product_id = product.id
    where nullif(btrim(p_search), '') is null
      or product.sku ilike '%' || btrim(p_search) || '%'
      or product.name ilike '%' || btrim(p_search) || '%'
      or product.external_1c_id ilike '%' || btrim(p_search) || '%'
      or brand.name ilike '%' || btrim(p_search) || '%'
      or category.name ilike '%' || btrim(p_search) || '%'
  ), filtered as (
    select * from base
    where p_filter = 'ALL'
      or (p_filter = 'PUBLISHED' and is_active and is_visible)
      or (p_filter = 'HIDDEN' and not is_visible)
      or p_filter = any(issues)
      or (p_filter = 'NEEDS_ATTENTION' and cardinality(issues) > 0)
  ), page as (
    select * from filtered
    order by lower(name), id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'counters', jsonb_build_object(
      'ALL', count(*),
      'PUBLISHED', count(*) filter (where is_active and is_visible),
      'HIDDEN', count(*) filter (where not is_visible),
      'MISSING_IMAGE', count(*) filter (where 'MISSING_IMAGE' = any(issues)),
      'MISSING_CATEGORY', count(*) filter (where 'MISSING_CATEGORY' = any(issues)),
      'MISSING_BRAND', count(*) filter (where 'MISSING_BRAND' = any(issues)),
      'MISSING_PRICE', count(*) filter (where 'MISSING_PRICE' = any(issues)),
      'STOCK_UNKNOWN', count(*) filter (where 'STOCK_UNKNOWN' = any(issues)),
      'NEEDS_ATTENTION', count(*) filter (where cardinality(issues) > 0)
    ),
    'totalCount', (select count(*) from filtered),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', page.id,
      'external1cId', page.external_1c_id,
      'sku', page.sku,
      'name', page.name,
      'slug', page.slug,
      'imageUrl', page.image_url,
      'imageOriginalUrl', page.image_original_url,
      'categoryName', page.category_name,
      'brandName', page.brand_name,
      'isActiveIn1C', page.is_active,
      'isVisible', page.is_visible,
      'isPublished', page.is_active and page.is_visible,
      'hiddenReason', page.hidden_reason,
      'hiddenBy', page.hidden_by,
      'hiddenAt', page.hidden_at,
      'hasPartnerPrice', page.has_price,
      'hasRetailPrice', page.has_retail_price,
      'stockState', case
        when not page.stock_known then 'unknown'
        when page.available_quantity > 0 then 'in_stock'
        else 'zero'
      end,
      'availableQuantity', case when page.stock_known then page.available_quantity else null end,
      'issues', to_jsonb(page.issues),
      'assignments', page.assignments
    ) order by lower(page.name), page.id) from page), '[]'::jsonb),
    'recentImageFailures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'correlationId', mutation.correlation_id,
        'productId', mutation.product_id,
        'productRef', mutation.product_external_1c_id,
        'stage', mutation.stage,
        'safeErrorCode', mutation.safe_error_code,
        'cleanupStatus', mutation.cleanup_status,
        'updatedAt', mutation.updated_at
      ) order by mutation.updated_at desc)
      from (
        select * from public.catalog_product_image_mutations
        where status in ('failed', 'refresh_pending')
        order by updated_at desc
        limit 10
      ) mutation
    ), '[]'::jsonb)
  ) into v_result
  from base;

  return coalesce(v_result, jsonb_build_object(
    'counters', jsonb_build_object(
      'ALL', 0, 'PUBLISHED', 0, 'HIDDEN', 0, 'MISSING_IMAGE', 0,
      'MISSING_CATEGORY', 0, 'MISSING_BRAND', 0, 'MISSING_PRICE', 0,
      'STOCK_UNKNOWN', 0, 'NEEDS_ATTENTION', 0
    ),
    'totalCount', 0, 'items', '[]'::jsonb, 'recentImageFailures', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.get_admin_catalog_management_page_v1(text, text, integer, integer)
  from public, anon;
grant execute on function public.get_admin_catalog_management_page_v1(text, text, integer, integer)
  to authenticated;

comment on function public.get_admin_catalog_management_page_v1(text, text, integer, integer) is
  'Single bounded permission-gated admin catalog projection: parity counters, filtered rows, commercial presence and current image failures without per-row requests.';
comment on function public.manage_catalog_product_visibility_v1(uuid, boolean, text, uuid) is
  'Audited portal-owned visibility mutation. It never writes 1C activation, deletion, stock, price or identity fields.';
comment on table public.catalog_product_management_audit_events is
  'Append-only safe audit for portal visibility and governed Firebase-to-1C image operations; binary data and credentials are forbidden.';
comment on table public.catalog_product_image_mutations is
  'Bounded recovery and diagnostic state for one-product image operations. 1C image URL remains canonical truth.';

alter function public.list_admin_operational_issues(timestamptz)
  rename to list_admin_operational_issues_pre_catalog_management;

revoke all on function public.list_admin_operational_issues_pre_catalog_management(timestamptz)
  from public, anon, authenticated;

create function public.list_admin_operational_issues(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_base jsonb;
  v_image_issues jsonb;
begin
  if not (
    public.has_internal_permission('admin.dashboard.view')
    or public.has_internal_permission('admin.integrations.view')
  ) then
    raise exception 'Operational issue access is not allowed.' using errcode = '42501';
  end if;

  v_base := public.list_admin_operational_issues_pre_catalog_management(p_now);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'catalog-image:' || failure.correlation_id,
    'domain', 'catalog',
    'severity', case when failure.status = 'refresh_pending' then 'HIGH' else 'MEDIUM' end,
    'status', 'ACTIVE',
    'healthStatus', case when failure.status = 'refresh_pending' then 'FAILED' else 'DEGRADED' end,
    'startedAt', failure.started_at,
    'lastAttemptAt', failure.updated_at,
    'lastSeenAt', failure.updated_at,
    'lastSuccessAt', null,
    'operation', 'catalog_product_image_write',
    'stage', failure.stage,
    'safeErrorCode', failure.safe_error_code,
    'safeMessage', 'Загрузка изображения товара не завершила подтверждённую цепочку Firebase → 1С → локальная проекция.',
    'runId', failure.correlation_id,
    'correlationId', failure.correlation_id,
    'recoverability', 'MANUAL_AVAILABLE',
    'automaticRetryState', 'NOT_CONFIGURED',
    'affectedScope', failure.product_external_1c_id,
    'currentDataState', case
      when failure.status = 'refresh_pending' then '1С подтверждена; требуется повторить только локальное целевое обновление.'
      else 'Канонический URL 1С не был подтверждён; прежнее изображение остаётся действующим.'
    end,
    'received', 1,
    'staged', case when failure.new_url is null then 0 else 1 end,
    'published', case when failure.status = 'refresh_pending' then 1 else 0 end,
    'durationMs', greatest(0, extract(milliseconds from (failure.updated_at - failure.started_at))::integer),
    'sourceCalls', case when failure.stage like 'one_c_%' or failure.status = 'refresh_pending' then 1 else 0 end,
    'retryCount', 0,
    'technicalCode', null,
    'cleanupStatus', failure.cleanup_status,
    'historyHref', '/admin/catalog?q=' || failure.product_external_1c_id,
    'detailHref', '/admin/operations/issues/catalog-image:' || failure.correlation_id
  ) order by failure.updated_at desc), '[]'::jsonb)
  into v_image_issues
  from (
    select * from public.catalog_product_image_mutations
    where status in ('failed', 'refresh_pending')
      and updated_at >= p_now - interval '30 days'
    order by updated_at desc
    limit 20
  ) failure;

  return coalesce(v_base, '[]'::jsonb) || v_image_issues;
end;
$$;

revoke all on function public.list_admin_operational_issues(timestamptz)
  from public, anon;
grant execute on function public.list_admin_operational_issues(timestamptz)
  to authenticated;

comment on function public.list_admin_operational_issues(timestamptz) is
  'Existing bounded operational issues plus unresolved governed catalog-image failures with stage, correlation and cleanup evidence.';

commit;
