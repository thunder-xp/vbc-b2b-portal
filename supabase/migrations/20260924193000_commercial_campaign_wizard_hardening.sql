begin;

set local lock_timeout = '5s';

-- PostgreSQL's ARE engine rejects repetition bounds above RE_DUP_MAX (255).
-- The historical {1,500} expression therefore raised an execution error for
-- every non-null image path instead of validating the path.
alter table public.commercial_campaigns
  drop constraint if exists commercial_campaigns_image_asset_path_check;
alter table public.commercial_campaigns
  drop constraint if exists commercial_campaign_image_asset_path_check;
alter table public.commercial_campaigns
  add constraint commercial_campaign_image_asset_path_check check (
    image_asset_path is null
    or (
      char_length(image_asset_path) between 1 and 500
      and image_asset_path ~ '^/[A-Za-z0-9_./-]+$'
    )
  );

alter table public.commercial_campaigns
  add column if not exists creation_request_id uuid null;

alter table public.commercial_campaigns
  drop constraint if exists commercial_campaign_creation_request_key;
alter table public.commercial_campaigns
  add constraint commercial_campaign_creation_request_key
  unique(created_by, creation_request_id);

comment on column public.commercial_campaigns.creation_request_id is
  'Client-stable UUID used to make draft creation idempotent for one authenticated internal actor.';

create table public.commercial_campaign_creation_failures (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null unique,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  stage text not null check (stage = 'create_draft_rpc'),
  safe_error_code text not null check (safe_error_code ~ '^[A-Z0-9_]{3,80}$'),
  server_rpc_code text null check (server_rpc_code is null or server_rpc_code ~ '^[A-Z0-9]{1,10}$'),
  has_draft_data boolean not null,
  item_count integer not null check (item_count between 0 and 50),
  has_audience boolean not null,
  created_at timestamptz not null default now()
);

create index commercial_campaign_creation_failures_created_idx
  on public.commercial_campaign_creation_failures(created_at desc);

alter table public.commercial_campaign_creation_failures enable row level security;
revoke all on table public.commercial_campaign_creation_failures
  from public, anon, authenticated;
grant all on table public.commercial_campaign_creation_failures to service_role;

comment on table public.commercial_campaign_creation_failures is
  'Bounded safe metadata for failed internal campaign creation. No campaign content or database error text is stored.';

create or replace function public.record_commercial_campaign_creation_failure(
  p_correlation_id uuid,
  p_stage text,
  p_safe_error_code text,
  p_server_rpc_code text,
  p_has_draft_data boolean,
  p_item_count integer,
  p_has_audience boolean
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.has_internal_permission('campaigns.create') then
    raise exception 'Campaign diagnostic access denied.' using errcode = '42501';
  end if;
  if p_correlation_id is null
    or p_stage <> 'create_draft_rpc'
    or p_safe_error_code !~ '^[A-Z0-9_]{3,80}$'
    or (p_server_rpc_code is not null and p_server_rpc_code !~ '^[A-Z0-9]{1,10}$')
    or p_item_count not between 0 and 50
  then
    raise exception 'Invalid campaign diagnostic.' using errcode = '22023';
  end if;

  insert into public.commercial_campaign_creation_failures(
    correlation_id, actor_user_id, stage, safe_error_code, server_rpc_code,
    has_draft_data, item_count, has_audience
  ) values (
    p_correlation_id, v_actor, p_stage, p_safe_error_code, p_server_rpc_code,
    p_has_draft_data, p_item_count, p_has_audience
  ) on conflict(correlation_id) do nothing;
end;
$$;

revoke all on function public.record_commercial_campaign_creation_failure(uuid, text, text, text, boolean, integer, boolean)
  from public, anon;
grant execute on function public.record_commercial_campaign_creation_failure(uuid, text, text, text, boolean, integer, boolean)
  to authenticated;

create or replace function public.search_commercial_campaign_products_v1(
  p_search text default '',
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_in_stock_only boolean default false,
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
  if auth.uid() is null or not public.has_internal_permission('campaigns.create') then
    raise exception 'Campaign product search access denied.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_search, '')) > 100
    or p_limit not between 1 and 30
    or p_offset < 0
  then
    raise exception 'Invalid campaign product search.' using errcode = '22023';
  end if;

  with recursive category_scope as (
    select category.id
    from public.catalog_categories category
    where p_category_id is not null
      and category.id = p_category_id
      and category.is_active
    union all
    select child.id
    from public.catalog_categories child
    join category_scope parent on parent.id = child.parent_id
    where child.is_active
  ), base as (
    select product.id, product.sku, product.name,
      coalesce(product.image_source_url, product.image_original_url, product.image_url) image_url,
      product.category_id, category.name category_name,
      product.brand_id, brand.name brand_name,
      model.display_value model,
      case when stock.is_published and stock.freshness_state = 'authoritative'
        then stock.available_quantity else null end available_quantity,
      case when price.price_amount is null then null else jsonb_build_object(
        'amount', price.price_amount,
        'currency', price.currency
      ) end current_price
    from public.catalog_products product
    left join public.catalog_categories category
      on category.id = product.category_id and category.is_active
    left join public.catalog_brands brand
      on brand.id = product.brand_id and brand.is_active
    left join public.product_stock_totals stock
      on stock.product_id = product.id
    left join lateral (
      select attribute.display_value
      from public.catalog_product_attributes attribute
      where attribute.product_id = product.id
        and attribute.is_visible
        and (
          lower(attribute.attribute_key) in ('model', 'model_name')
          or lower(attribute.label) in ('model', 'модель')
        )
      order by attribute.is_filterable desc, attribute.id
      limit 1
    ) model on true
    left join lateral (
      select product_price.price_amount, product_price.currency
      from public.product_prices product_price
      join public.price_types price_type on price_type.id = product_price.price_type_id
      where product_price.product_id = product.id
        and price_type.external_code = 'UU-000020'
        and product_price.is_active
        and product_price.is_published
        and product_price.currency_status = 'resolved'
      order by product_price.effective_at desc, product_price.id desc
      limit 1
    ) price on true
    where product.is_active
      and product.is_visible
      and (p_category_id is null or product.category_id in (select scoped.id from category_scope scoped))
      and (p_brand_id is null or product.brand_id = p_brand_id)
      and (not p_in_stock_only or stock.is_published and stock.freshness_state = 'authoritative' and stock.available_quantity > 0)
      and (
        nullif(btrim(p_search), '') is null
        or product.sku ilike '%' || btrim(p_search) || '%'
        or product.name ilike '%' || btrim(p_search) || '%'
        or coalesce(model.display_value, '') ilike '%' || btrim(p_search) || '%'
      )
  ), page as (
    select * from base
    order by lower(name), id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'totalCount', (select count(*) from base),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'sku', page.sku,
      'model', page.model,
      'name', page.name,
      'imageUrl', page.image_url,
      'categoryId', page.category_id,
      'categoryName', page.category_name,
      'brandId', page.brand_id,
      'brandName', page.brand_name,
      'availableQuantity', page.available_quantity,
      'currentPrice', page.current_price
    ) order by lower(page.name), page.id), '[]'::jsonb)
  ) into v_result
  from page;

  return coalesce(v_result, jsonb_build_object('totalCount', 0, 'items', '[]'::jsonb));
end;
$$;

revoke all on function public.search_commercial_campaign_products_v1(text, uuid, uuid, boolean, integer, integer)
  from public, anon;
grant execute on function public.search_commercial_campaign_products_v1(text, uuid, uuid, boolean, integer, integer)
  to authenticated;

create or replace function public.get_commercial_campaign_builder_options(p_search text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_initial jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.create') then
    raise exception 'Campaign builder access denied.' using errcode = '42501';
  end if;

  v_initial := public.search_commercial_campaign_products_v1(
    coalesce(p_search, ''), null, null, false, 25, 0
  );

  return jsonb_build_object(
    'products', coalesce(v_initial->'items', '[]'::jsonb),
    'productTotalCount', coalesce((v_initial->>'totalCount')::integer, 0),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', category.id,
        'parentId', category.parent_id,
        'name', category.name
      ) order by category.sort_order, lower(category.name), category.id), '[]'::jsonb)
      from public.catalog_categories category
      where category.is_active
    ),
    'brands', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', brand.id,
        'name', brand.name
      ) order by brand.sort_order, lower(brand.name), brand.id), '[]'::jsonb)
      from public.catalog_brands brand
      where brand.is_active
    ),
    'companies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', company.id,
        'name', company.display_name,
        'status', company.status
      ) order by lower(company.display_name), company.id), '[]'::jsonb)
      from (
        select id, display_name, status
        from public.partner_companies
        where status = 'active'
        order by lower(display_name), id
        limit 100
      ) company
    )
  );
end;
$$;

revoke all on function public.get_commercial_campaign_builder_options(text) from public, anon;
grant execute on function public.get_commercial_campaign_builder_options(text) to authenticated;

create or replace function public.create_commercial_campaign_draft(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_actor uuid := auth.uid();
  v_target_id uuid;
  v_request_id uuid;
  v_item jsonb;
  v_company_value jsonb;
  v_audience_mode text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if v_actor is null or not public.has_internal_permission('campaigns.create') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if coalesce(jsonb_typeof(p_input), '') <> 'object'
    or p_input->>'contractVersion' <> '1'
    or coalesce(p_input->>'requestId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode = 'P0001';
  end if;
  v_request_id := (p_input->>'requestId')::uuid;

  select campaign.id into v_target_id
  from public.commercial_campaigns campaign
  where campaign.created_by = v_actor
    and campaign.creation_request_id = v_request_id;
  if found then return v_target_id; end if;

  if coalesce(p_input->>'code', '') !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then
    raise exception 'CAMPAIGN_CODE_INVALID' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_input->>'name', ''))) not between 3 and 160 then
    raise exception 'CAMPAIGN_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_input->>'partnerTitle', ''))) not between 3 and 160 then
    raise exception 'CAMPAIGN_TITLE_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_input->>'partnerDescription', ''))) not between 10 and 2000 then
    raise exception 'CAMPAIGN_DESCRIPTION_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_input->>'termsSummary', ''))) not between 3 and 1000 then
    raise exception 'CAMPAIGN_TERMS_REQUIRED' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_input->>'internalNote', '')) > 2000 then
    raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode = 'P0001';
  end if;
  if coalesce(p_input->>'priority', '') !~ '^[0-9]{1,4}$' then
    raise exception 'CAMPAIGN_PRIORITY_INVALID' using errcode = 'P0001';
  end if;
  if (p_input->>'priority')::integer not between 0 and 1000 then
    raise exception 'CAMPAIGN_PRIORITY_INVALID' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_input->>'imageAssetPath', '')), '') is not null
    and (
      char_length(btrim(p_input->>'imageAssetPath')) > 500
      or btrim(p_input->>'imageAssetPath') !~ '^/[A-Za-z0-9_./-]+$'
    )
  then
    raise exception 'CAMPAIGN_IMAGE_PATH_INVALID' using errcode = 'P0001';
  end if;
  if coalesce(p_input->>'campaignType', '') not in (
    'product_offer', 'stock_clearance', 'arrival_promotion',
    'reorder_campaign', 'category_campaign', 'partner_segment_offer'
  ) then
    raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode = 'P0001';
  end if;
  if nullif(p_input->>'startsAt', '') is null or nullif(p_input->>'endsAt', '') is null then
    raise exception 'CAMPAIGN_PERIOD_INVALID' using errcode = 'P0001';
  end if;
  begin
    v_starts_at := (p_input->>'startsAt')::timestamptz;
    v_ends_at := (p_input->>'endsAt')::timestamptz;
  exception when others then
    raise exception 'CAMPAIGN_PERIOD_INVALID' using errcode = 'P0001';
  end;
  if v_ends_at <= v_starts_at then
    raise exception 'CAMPAIGN_PERIOD_INVALID' using errcode = 'P0001';
  end if;
  if coalesce(jsonb_typeof(p_input->'items'), '') <> 'array' then
    raise exception 'CAMPAIGN_PRODUCTS_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_input->'items') = 0 then
    raise exception 'CAMPAIGN_PRODUCTS_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_input->'items') > 50 then
    raise exception 'CAMPAIGN_PRODUCTS_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_input->'items') <> (
    select count(distinct item->>'productId')
    from jsonb_array_elements(p_input->'items') item
  ) then
    raise exception 'CAMPAIGN_PRODUCT_LIMIT_INVALID' using errcode = 'P0001';
  end if;

  v_audience_mode := coalesce(p_input->>'audienceMode', '');
  if v_audience_mode not in (
    'explicit_company', 'all_active_partners', 'commercial_mode_full',
    'commercial_mode_retail_only', 'momentum_slowing', 'momentum_attention'
  ) then
    raise exception 'CAMPAIGN_AUDIENCE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_audience_mode = 'explicit_company'
    and coalesce(jsonb_typeof(p_input->'companyIds'), '') <> 'array'
  then
    raise exception 'CAMPAIGN_AUDIENCE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_audience_mode = 'explicit_company'
    and jsonb_array_length(p_input->'companyIds') not between 1 and 100
  then
    raise exception 'CAMPAIGN_AUDIENCE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_audience_mode = 'explicit_company'
    and jsonb_array_length(p_input->'companyIds') <> (
      select count(distinct value::text)
      from jsonb_array_elements(p_input->'companyIds')
    )
  then
    raise exception 'CAMPAIGN_AUDIENCE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_input ? 'finalPrice' or p_input ? 'discountAmount' then
    raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  begin
    insert into public.commercial_campaigns(
      code, name, partner_title, partner_description, internal_note,
      campaign_type, starts_at, ends_at, priority, image_asset_path,
      terms_summary, created_by, creation_request_id
    ) values (
      upper(btrim(p_input->>'code')), btrim(p_input->>'name'),
      btrim(p_input->>'partnerTitle'), btrim(p_input->>'partnerDescription'),
      nullif(btrim(p_input->>'internalNote'), ''), p_input->>'campaignType',
      v_starts_at, v_ends_at, (p_input->>'priority')::integer,
      nullif(btrim(p_input->>'imageAssetPath'), ''),
      btrim(p_input->>'termsSummary'), v_actor, v_request_id
    ) on conflict(created_by, creation_request_id) do nothing
    returning id into v_target_id;
  exception when unique_violation then
    raise exception 'CAMPAIGN_CODE_CONFLICT' using errcode = 'P0001';
  end;

  if v_target_id is null then
    select campaign.id into v_target_id
    from public.commercial_campaigns campaign
    where campaign.created_by = v_actor
      and campaign.creation_request_id = v_request_id;
    return v_target_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_input->'items') loop
    if coalesce(v_item->>'productId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_item->>'minimumQuantity', '') !~ '^[0-9]{1,4}$'
      or (
        nullif(v_item->>'maximumQuantityPerCompany', '') is not null
        and v_item->>'maximumQuantityPerCompany' !~ '^[0-9]{1,6}$'
      )
      or coalesce(v_item->>'benefitType', '') <> 'informational_only'
      or coalesce(v_item->>'sortOrder', '') !~ '^[0-9]{1,5}$'
      or nullif(btrim(coalesce(v_item->>'governedBenefitReference', '')), '') is not null
      or char_length(coalesce(v_item->>'partnerMessage', '')) > 500
      or v_item ? 'finalPrice'
      or v_item ? 'discountAmount'
    then
      raise exception 'CAMPAIGN_PRODUCT_LIMIT_INVALID' using errcode = 'P0001';
    end if;
    if (v_item->>'minimumQuantity')::integer not between 1 and 9999
      or (v_item->>'sortOrder')::integer not between 0 and 10000
      or (
        nullif(v_item->>'maximumQuantityPerCompany', '') is not null
        and (
          (v_item->>'maximumQuantityPerCompany')::integer < (v_item->>'minimumQuantity')::integer
          or (v_item->>'maximumQuantityPerCompany')::integer > 999999
        )
      )
    then
      raise exception 'CAMPAIGN_PRODUCT_LIMIT_INVALID' using errcode = 'P0001';
    end if;

    insert into public.commercial_campaign_items(
      campaign_id, product_id, sort_order, minimum_quantity,
      maximum_quantity_per_company, benefit_type,
      governed_benefit_reference, partner_message
    )
    select v_target_id, (v_item->>'productId')::uuid,
      coalesce((v_item->>'sortOrder')::integer, 0),
      (v_item->>'minimumQuantity')::integer,
      nullif(v_item->>'maximumQuantityPerCompany', '')::integer,
      'informational_only', null, nullif(btrim(v_item->>'partnerMessage'), '')
    from public.catalog_products product
    where product.id = (v_item->>'productId')::uuid
      and product.is_active
      and product.is_visible;
    if not found then
      raise exception 'CAMPAIGN_PRODUCT_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end loop;

  if v_audience_mode = 'explicit_company' then
    for v_company_value in select value from jsonb_array_elements(p_input->'companyIds') loop
      if trim(both '"' from v_company_value::text) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or not exists (
          select 1 from public.partner_companies company
          where company.id = trim(both '"' from v_company_value::text)::uuid
            and company.status = 'active'
        )
      then
        raise exception 'CAMPAIGN_AUDIENCE_REQUIRED' using errcode = 'P0001';
      end if;
      insert into public.commercial_campaign_audience_rules(campaign_id, rule_type, criterion)
      values(v_target_id, 'explicit_company', jsonb_build_object('companyId', trim(both '"' from v_company_value::text)))
      on conflict do nothing;
    end loop;
  elsif v_audience_mode = 'all_active_partners' then
    insert into public.commercial_campaign_audience_rules(campaign_id, rule_type)
    values(v_target_id, 'all_active_partners');
  elsif v_audience_mode like 'momentum_%' then
    insert into public.commercial_campaign_audience_rules(campaign_id, rule_type, criterion)
    values(v_target_id, 'momentum_status', case when v_audience_mode = 'momentum_slowing'
      then jsonb_build_object('statuses', jsonb_build_array('slowing'), 'maxScore', 59)
      else jsonb_build_object('statuses', jsonb_build_array('attention_required', 'high_risk'), 'maxScore', 39)
    end);
  else
    insert into public.commercial_campaign_audience_rules(campaign_id, rule_type, criterion)
    values(v_target_id, 'commercial_mode', jsonb_build_object(
      'mode', case when v_audience_mode = 'commercial_mode_full' then 'full' else 'retail_only' end
    ));
  end if;

  insert into public.commercial_campaign_audit_events(
    campaign_id, event_type, actor_user_id, reason, safe_metadata
  ) values (
    v_target_id, 'draft_created', v_actor, 'Campaign draft created',
    jsonb_build_object('requestId', v_request_id, 'contractVersion', 1)
  );
  return v_target_id;
end;
$$;

revoke all on function public.create_commercial_campaign_draft(jsonb) from public, anon;
grant execute on function public.create_commercial_campaign_draft(jsonb) to authenticated;

comment on function public.search_commercial_campaign_products_v1(text, uuid, uuid, boolean, integer, integer) is
  'Bounded local catalog projection for the campaign wizard. No live 1C calls and no campaign-owned price truth.';
comment on function public.create_commercial_campaign_draft(jsonb) is
  'Creates one atomic, idempotent campaign draft using contract version 1 and governed local catalog identities.';

alter function public.list_admin_operational_issues(timestamptz)
  rename to list_admin_operational_issues_pre_campaign_creation;
revoke all on function public.list_admin_operational_issues_pre_campaign_creation(timestamptz)
  from public, anon, authenticated;

create function public.list_admin_operational_issues(p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_base jsonb;
  v_campaign_issues jsonb;
begin
  if not (
    public.has_internal_permission('admin.dashboard.view')
    or public.has_internal_permission('admin.integrations.view')
  ) then
    raise exception 'Operational issue access is not allowed.' using errcode = '42501';
  end if;

  v_base := public.list_admin_operational_issues_pre_campaign_creation(p_now);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'campaigns:create:' || failure.correlation_id::text,
    'domain', 'campaigns',
    'severity', 'HIGH',
    'status', 'ACTIVE',
    'healthStatus', 'FAILED',
    'startedAt', failure.created_at,
    'lastAttemptAt', failure.created_at,
    'lastSeenAt', failure.created_at,
    'lastSuccessAt', null,
    'operation', 'commercial_campaign_create',
    'stage', failure.stage,
    'safeErrorCode', failure.safe_error_code,
    'safeMessage', 'Создание черновика кампании не завершилось. Проверьте безопасный код и повторите после исправления причины.',
    'runId', null,
    'correlationId', failure.correlation_id,
    'recoverability', 'MANUAL_AVAILABLE',
    'automaticRetryState', 'NOT_CONFIGURED',
    'affectedScope', failure.item_count::text || ' selected products',
    'currentDataState', 'Черновик не создан; существующие кампании не изменены.',
    'received', failure.item_count,
    'staged', 0,
    'published', 0,
    'durationMs', null,
    'sourceCalls', 0,
    'retryCount', 0,
    'technicalCode', failure.server_rpc_code,
    'actorUserId', failure.actor_user_id,
    'hasDraftData', failure.has_draft_data,
    'hasAudience', failure.has_audience,
    'historyHref', '/admin/commercial/campaigns',
    'detailHref', '/admin/operations/issues/campaigns:create:' || failure.correlation_id::text
  ) order by failure.created_at desc), '[]'::jsonb)
  into v_campaign_issues
  from (
    select *
    from public.commercial_campaign_creation_failures
    where created_at >= p_now - interval '24 hours'
    order by created_at desc
    limit 20
  ) failure;

  return coalesce(v_base, '[]'::jsonb) || v_campaign_issues;
end;
$$;

revoke all on function public.list_admin_operational_issues(timestamptz)
  from public, anon;
grant execute on function public.list_admin_operational_issues(timestamptz)
  to authenticated;

comment on function public.record_commercial_campaign_creation_failure(uuid, text, text, text, boolean, integer, boolean) is
  'Persists bounded safe campaign-creation failure metadata for Admin Operations without campaign content or raw DB errors.';

commit;
