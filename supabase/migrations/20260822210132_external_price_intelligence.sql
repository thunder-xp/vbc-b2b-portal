begin;

insert into public.permissions(code, description, scope, delegable_by_partner_owner, sensitive, category)
values
  ('external_prices.view', 'View company external price imports and comparisons.', 'partner', true, true, 'commercial'),
  ('external_prices.manage', 'Upload, review, apply, and archive company external price imports.', 'partner', true, true, 'commercial')
on conflict (code) do update set
  description = excluded.description,
  scope = excluded.scope,
  delegable_by_partner_owner = excluded.delegable_by_partner_owner,
  sensitive = excluded.sensitive,
  category = excluded.category;

with grants(role_code, permission_code) as (
  values
    ('partner_owner', 'external_prices.view'),
    ('partner_owner', 'external_prices.manage'),
    ('partner_manager', 'external_prices.view'),
    ('partner_manager', 'external_prices.manage'),
    ('partner_buyer', 'external_prices.view'),
    ('partner_buyer', 'external_prices.manage')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict do nothing;

insert into public.partner_access_preset_capabilities(preset_code, permission_id)
select 'full_partner_access', permission.id
from public.permissions permission
where permission.code in ('external_prices.view', 'external_prices.manage')
on conflict do nothing;

insert into public.partner_company_capabilities(company_id, permission_id, enabled_by)
select policy.company_id, permission.id, policy.changed_by
from public.partner_company_access_policies policy
cross join public.permissions permission
where policy.preset_code = 'full_partner_access'
  and permission.code in ('external_prices.view', 'external_prices.manage')
on conflict do nothing;

create table public.external_price_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  source_type text not null default 'supplier' check (source_type in ('supplier', 'distributor', 'marketplace', 'other')),
  active boolean not null default true,
  supported_brand_scope text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z0-9_]+$'),
  check (cardinality(supported_brand_scope) <= 50)
);

insert into public.external_price_sources(code, display_name, source_type, supported_brand_scope)
values ('exterior', 'Exterior', 'distributor', array['DAHUA'])
on conflict (code) do update set
  display_name = excluded.display_name,
  source_type = excluded.source_type,
  supported_brand_scope = excluded.supported_brand_scope,
  active = true,
  updated_at = now();

create table public.external_price_mapping_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  external_price_source_id uuid not null references public.external_price_sources(id) on delete restrict,
  name text not null,
  file_format text not null check (file_format in ('xlsx', 'csv')),
  signature text not null,
  column_mapping jsonb not null,
  active boolean not null default true,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, external_price_source_id, signature),
  check (jsonb_typeof(column_mapping) = 'object')
);

create table public.external_price_uploads (
  id uuid primary key default gen_random_uuid(),
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  external_price_source_id uuid not null references public.external_price_sources(id) on delete restrict,
  uploaded_by uuid not null references public.user_profiles(id) on delete restrict,
  original_filename text not null,
  storage_bucket text not null default 'external-price-imports',
  storage_key text not null unique,
  source_file_hash text not null,
  file_format text not null check (file_format in ('xlsx', 'csv')),
  file_size bigint not null check (file_size between 1 and 10485760),
  effective_date date,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price_schema text not null check (price_schema in ('partner', 'retail', 'both', 'detect')),
  snapshot_scope text not null check (snapshot_scope in ('full', 'partial')),
  parser_version text not null default 'external-price-v1',
  mapping_template_id uuid references public.external_price_mapping_templates(id) on delete restrict,
  detected_mapping jsonb,
  confirmed_mapping jsonb,
  sheet_names text[] not null default '{}',
  status text not null default 'uploaded' check (status in ('uploaded', 'analyzing', 'mapping_required', 'ready_for_review', 'applied', 'failed', 'archived')),
  total_rows integer not null default 0 check (total_rows >= 0),
  candidate_rows integer not null default 0 check (candidate_rows >= 0),
  matched_rows integer not null default 0 check (matched_rows >= 0),
  review_rows integer not null default 0 check (review_rows >= 0),
  unmatched_rows integer not null default 0 check (unmatched_rows >= 0),
  ignored_rows integer not null default 0 check (ignored_rows >= 0),
  marker_rows integer not null default 0 check (marker_rows >= 0),
  safe_error_code text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(partner_company_id, external_price_source_id, source_file_hash),
  check (detected_mapping is null or jsonb_typeof(detected_mapping) = 'object'),
  check (confirmed_mapping is null or jsonb_typeof(confirmed_mapping) = 'object'),
  check (safe_error_code is null or char_length(safe_error_code) <= 80)
);

create table public.external_price_import_rows (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.external_price_uploads(id) on delete cascade,
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  source_product_code text,
  source_product_name text,
  normalized_model text,
  source_description text,
  partner_price numeric(18,4),
  retail_price numeric(18,4),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  source_marker text,
  catalog_product_id uuid references public.catalog_products(id) on delete restrict,
  match_method text not null check (match_method in ('exact_model', 'known_alias', 'suggested', 'manual', 'none', 'not_in_scope')),
  match_status text not null check (match_status in ('matched', 'matched_alias', 'needs_review', 'unmatched', 'ignored', 'skipped')),
  suggested_products jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(upload_id, source_sheet, source_row),
  check (partner_price is null or partner_price >= 0),
  check (retail_price is null or retail_price >= 0),
  check (jsonb_typeof(suggested_products) = 'array')
);

create table public.catalog_product_model_aliases (
  id uuid primary key default gen_random_uuid(),
  catalog_product_id uuid not null references public.catalog_products(id) on delete cascade,
  normalized_alias text not null,
  alias_display text not null,
  active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(normalized_alias)
);

create table public.external_price_observations (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.external_price_uploads(id) on delete restrict,
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  external_price_source_id uuid not null references public.external_price_sources(id) on delete restrict,
  catalog_product_id uuid not null references public.catalog_products(id) on delete restrict,
  source_product_code text,
  source_product_name text not null,
  normalized_model text not null,
  source_description text,
  partner_price numeric(18,4),
  retail_price numeric(18,4),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  source_sheet text not null,
  source_row integer not null,
  source_marker text,
  match_method text not null check (match_method in ('exact_model', 'known_alias', 'manual')),
  observed_at date not null,
  created_at timestamptz not null default now(),
  unique(upload_id, source_sheet, source_row),
  check (partner_price is not null or retail_price is not null),
  check (partner_price is null or partner_price >= 0),
  check (retail_price is null or retail_price >= 0)
);

create table public.current_external_prices (
  partner_company_id uuid not null references public.partner_companies(id) on delete cascade,
  external_price_source_id uuid not null references public.external_price_sources(id) on delete cascade,
  catalog_product_id uuid not null references public.catalog_products(id) on delete cascade,
  price_type text not null check (price_type in ('partner', 'retail')),
  observation_id uuid not null references public.external_price_observations(id) on delete restrict,
  amount numeric(18,4) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  observed_at date not null,
  upload_id uuid not null references public.external_price_uploads(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key(partner_company_id, external_price_source_id, catalog_product_id, price_type)
);

create table public.external_price_events (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.external_price_uploads(id) on delete restrict,
  partner_company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('uploaded', 'mapping_confirmed', 'manual_match', 'row_skipped', 'applied', 'archived', 'analysis_failed')),
  safe_metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  check (jsonb_typeof(safe_metadata) = 'object')
);

create index external_price_uploads_company_created_idx on public.external_price_uploads(partner_company_id, created_at desc);
create index external_price_uploads_status_created_idx on public.external_price_uploads(status, created_at) where status in ('uploaded', 'analyzing');
create index external_price_import_rows_upload_status_idx on public.external_price_import_rows(upload_id, match_status, source_row);
create index external_price_import_rows_product_idx on public.external_price_import_rows(catalog_product_id) where catalog_product_id is not null;
create index external_price_observations_product_date_idx on public.external_price_observations(catalog_product_id, observed_at desc);
create index external_price_observations_company_source_date_idx on public.external_price_observations(partner_company_id, external_price_source_id, observed_at desc);
create index current_external_prices_product_company_idx on public.current_external_prices(catalog_product_id, partner_company_id);
create index external_price_events_upload_idx on public.external_price_events(upload_id, occurred_at);

alter table public.external_price_sources enable row level security;
alter table public.external_price_mapping_templates enable row level security;
alter table public.external_price_uploads enable row level security;
alter table public.external_price_import_rows enable row level security;
alter table public.catalog_product_model_aliases enable row level security;
alter table public.external_price_observations enable row level security;
alter table public.current_external_prices enable row level security;
alter table public.external_price_events enable row level security;

revoke all on public.external_price_sources, public.external_price_mapping_templates,
  public.external_price_uploads, public.external_price_import_rows,
  public.catalog_product_model_aliases, public.external_price_observations,
  public.current_external_prices, public.external_price_events
from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'external-price-imports', 'external-price-imports', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/csv']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_external_prices(p_company_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.has_active_company_membership(p_company_id)
    and public.has_permission(p_company_id, p_permission)
$$;
revoke all on function public.can_access_external_prices(uuid, text) from public, anon;
grant execute on function public.can_access_external_prices(uuid, text) to authenticated;

create or replace function public.list_external_price_sources()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.id, 'code', source.code, 'displayName', source.display_name,
    'sourceType', source.source_type, 'supportedBrandScope', source.supported_brand_scope
  ) order by source.display_name), '[]'::jsonb)
  from public.external_price_sources source where source.active
    and auth.uid() is not null
$$;
revoke all on function public.list_external_price_sources() from public, anon;
grant execute on function public.list_external_price_sources() to authenticated;

create or replace function public.create_external_price_upload(
  p_company_id uuid, p_source_id uuid,
  p_upload_id uuid, p_original_filename text, p_storage_key text,
  p_source_file_hash text, p_file_format text, p_file_size bigint,
  p_effective_date date, p_currency text, p_price_schema text, p_snapshot_scope text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.external_price_uploads; created public.external_price_uploads;
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.manage') then
    raise exception 'External price upload denied.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.external_price_sources source where source.id=p_source_id and source.active) then
    raise exception 'External price source is unavailable.' using errcode='22023';
  end if;
  select * into existing from public.external_price_uploads
  where partner_company_id = p_company_id and external_price_source_id = p_source_id
    and source_file_hash = lower(p_source_file_hash);
  if existing.id is not null then
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'duplicate', true, 'storageKey', existing.storage_key);
  end if;
  insert into public.external_price_uploads(
    id, partner_company_id, external_price_source_id, uploaded_by, original_filename,
    storage_key, source_file_hash, file_format, file_size, effective_date, currency,
    price_schema, snapshot_scope
  ) values (
    p_upload_id, p_company_id, p_source_id, auth.uid(), left(btrim(p_original_filename), 180),
    p_storage_key, lower(p_source_file_hash), p_file_format, p_file_size, p_effective_date,
    upper(p_currency), p_price_schema, p_snapshot_scope
  ) returning * into created;
  insert into public.external_price_events(upload_id, partner_company_id, actor_user_id, event_type, safe_metadata)
  values (created.id, p_company_id, auth.uid(), 'uploaded', jsonb_build_object('format', p_file_format, 'size', p_file_size));
  return jsonb_build_object('id', created.id, 'status', created.status, 'duplicate', false, 'storageKey', created.storage_key);
end; $$;
revoke all on function public.create_external_price_upload(uuid,uuid,uuid,text,text,text,text,bigint,date,text,text,text) from public, anon;
grant execute on function public.create_external_price_upload(uuid,uuid,uuid,text,text,text,text,bigint,date,text,text,text) to authenticated;

create or replace function public.list_external_price_uploads(p_company_id uuid, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.view') then raise exception 'Access denied.' using errcode='42501'; end if;
  return (
    select coalesce(jsonb_agg(row_to_json(item) order by item.created_at desc), '[]'::jsonb)
    from (
      select upload.id, source.display_name as source_name, upload.original_filename,
        upload.effective_date, upload.currency, upload.price_schema, upload.snapshot_scope,
        upload.status, upload.total_rows, upload.candidate_rows, upload.matched_rows,
        upload.review_rows, upload.unmatched_rows, upload.ignored_rows, upload.marker_rows,
        upload.safe_error_code, upload.created_at, upload.applied_at
      from public.external_price_uploads upload
      join public.external_price_sources source on source.id = upload.external_price_source_id
      where upload.partner_company_id = p_company_id and upload.archived_at is null
      order by upload.created_at desc limit least(greatest(p_limit,1),100)
    ) item
  );
end; $$;
revoke all on function public.list_external_price_uploads(uuid, integer) from public, anon;
grant execute on function public.list_external_price_uploads(uuid, integer) to authenticated;

create or replace function public.get_external_price_upload(p_company_id uuid, p_upload_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.view') then raise exception 'Access denied.' using errcode='42501'; end if;
  select jsonb_build_object(
    'id', upload.id, 'sourceId', upload.external_price_source_id, 'sourceName', source.display_name,
    'originalFilename', upload.original_filename, 'effectiveDate', upload.effective_date,
    'currency', upload.currency, 'priceSchema', upload.price_schema, 'snapshotScope', upload.snapshot_scope,
    'status', upload.status, 'detectedMapping', upload.detected_mapping,
    'confirmedMapping', upload.confirmed_mapping, 'sheetNames', upload.sheet_names,
    'totalRows', upload.total_rows, 'candidateRows', upload.candidate_rows,
    'matchedRows', upload.matched_rows, 'reviewRows', upload.review_rows,
    'unmatchedRows', upload.unmatched_rows, 'ignoredRows', upload.ignored_rows,
    'markerRows', upload.marker_rows, 'safeErrorCode', upload.safe_error_code,
    'createdAt', upload.created_at, 'appliedAt', upload.applied_at,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row.id, 'sheet', row.source_sheet, 'row', row.source_row,
      'sourceCode', row.source_product_code, 'sourceName', row.source_product_name,
      'normalizedModel', row.normalized_model, 'description', row.source_description,
      'partnerPrice', row.partner_price, 'retailPrice', row.retail_price,
      'currency', row.currency, 'marker', row.source_marker,
      'catalogProductId', row.catalog_product_id, 'matchMethod', row.match_method,
      'matchStatus', row.match_status, 'suggestedProducts', row.suggested_products
    ) order by row.source_sheet, row.source_row) from public.external_price_import_rows row where row.upload_id = upload.id), '[]'::jsonb)
  ) into result
  from public.external_price_uploads upload
  join public.external_price_sources source on source.id = upload.external_price_source_id
  where upload.id = p_upload_id and upload.partner_company_id = p_company_id and upload.archived_at is null;
  return result;
end; $$;
revoke all on function public.get_external_price_upload(uuid, uuid) from public, anon;
grant execute on function public.get_external_price_upload(uuid, uuid) to authenticated;

create or replace function public.confirm_external_price_mapping(
  p_company_id uuid, p_upload_id uuid, p_mapping jsonb, p_save_template boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.external_price_uploads; template_id uuid; signature text;
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  if jsonb_typeof(p_mapping) <> 'object' then raise exception 'Invalid mapping.' using errcode='22023'; end if;
  select * into target from public.external_price_uploads where id=p_upload_id and partner_company_id=p_company_id for update;
  if target.id is null or target.status <> 'mapping_required' then raise exception 'Import state changed.' using errcode='PT409'; end if;
  signature := coalesce(target.detected_mapping->>'signature', target.source_file_hash);
  if p_save_template then
    insert into public.external_price_mapping_templates(company_id, external_price_source_id, name, file_format, signature, column_mapping, created_by)
    values(p_company_id, target.external_price_source_id, (select display_name from public.external_price_sources where id=target.external_price_source_id)||' '||upper(target.file_format)||' template', target.file_format, signature, p_mapping, auth.uid())
    on conflict(company_id, external_price_source_id, signature) do update set column_mapping=excluded.column_mapping, active=true, updated_at=now()
    returning id into template_id;
  end if;
  delete from public.external_price_import_rows where upload_id=target.id;
  update public.external_price_uploads set confirmed_mapping=p_mapping, mapping_template_id=coalesce(template_id,mapping_template_id), status='uploaded', safe_error_code=null, updated_at=now() where id=target.id;
  insert into public.external_price_events(upload_id,partner_company_id,actor_user_id,event_type,safe_metadata)
  values(target.id,p_company_id,auth.uid(),'mapping_confirmed',jsonb_build_object('templateSaved',p_save_template));
  return jsonb_build_object('id',target.id,'status','uploaded');
end; $$;
revoke all on function public.confirm_external_price_mapping(uuid,uuid,jsonb,boolean) from public, anon;
grant execute on function public.confirm_external_price_mapping(uuid,uuid,jsonb,boolean) to authenticated;

create or replace function public.review_external_price_row(
  p_company_id uuid, p_upload_id uuid, p_row_id uuid, p_catalog_product_id uuid default null, p_skip boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.external_price_uploads; target_row public.external_price_import_rows;
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  select * into target from public.external_price_uploads where id=p_upload_id and partner_company_id=p_company_id for update;
  if target.id is null or target.status <> 'ready_for_review' then raise exception 'Import state changed.' using errcode='PT409'; end if;
  select * into target_row from public.external_price_import_rows where id=p_row_id and upload_id=target.id for update;
  if target_row.id is null or target_row.match_status not in ('needs_review','unmatched') then raise exception 'Row cannot be reviewed.' using errcode='PT409'; end if;
  if p_skip then
    update public.external_price_import_rows set catalog_product_id=null,match_method='none',match_status='skipped',updated_at=now() where id=target_row.id;
  else
    if p_catalog_product_id is null or not exists(select 1 from public.catalog_products p where p.id=p_catalog_product_id and p.is_active and p.is_visible) then raise exception 'Product is unavailable.' using errcode='22023'; end if;
    update public.external_price_import_rows set catalog_product_id=p_catalog_product_id,match_method='manual',match_status='matched',updated_at=now() where id=target_row.id;
  end if;
  update public.external_price_uploads set
    matched_rows=(select count(*) from public.external_price_import_rows where upload_id=target.id and match_status in ('matched','matched_alias')),
    review_rows=(select count(*) from public.external_price_import_rows where upload_id=target.id and match_status='needs_review'),
    unmatched_rows=(select count(*) from public.external_price_import_rows where upload_id=target.id and match_status='unmatched'), updated_at=now()
  where id=target.id;
  insert into public.external_price_events(upload_id,partner_company_id,actor_user_id,event_type,safe_metadata)
  values(target.id,p_company_id,auth.uid(),case when p_skip then 'row_skipped' else 'manual_match' end,jsonb_build_object('rowId',target_row.id));
  return jsonb_build_object('id',target_row.id,'status',case when p_skip then 'skipped' else 'matched' end);
end; $$;
revoke all on function public.review_external_price_row(uuid,uuid,uuid,uuid,boolean) from public, anon;
grant execute on function public.review_external_price_row(uuid,uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.apply_external_price_upload(p_company_id uuid, p_upload_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.external_price_uploads; inserted_count integer; current_count integer;
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  select * into target from public.external_price_uploads where id=p_upload_id and partner_company_id=p_company_id for update;
  if target.id is null then raise exception 'Import not found.' using errcode='P0002'; end if;
  if target.status = 'applied' then return jsonb_build_object('id',target.id,'status','applied','idempotent',true); end if;
  if target.status <> 'ready_for_review' then raise exception 'Import state changed.' using errcode='PT409'; end if;
  if exists(select 1 from public.external_price_import_rows row where row.upload_id=target.id and row.match_status='needs_review') then
    raise exception 'Review all ambiguous rows before applying.' using errcode='PT409';
  end if;
  insert into public.external_price_observations(
    upload_id,partner_company_id,external_price_source_id,catalog_product_id,
    source_product_code,source_product_name,normalized_model,source_description,
    partner_price,retail_price,currency,source_sheet,source_row,source_marker,match_method,observed_at
  ) select target.id,target.partner_company_id,target.external_price_source_id,row.catalog_product_id,
    row.source_product_code,row.source_product_name,row.normalized_model,row.source_description,
    row.partner_price,row.retail_price,row.currency,row.source_sheet,row.source_row,row.source_marker,row.match_method,
    coalesce(target.effective_date,target.created_at::date)
  from public.external_price_import_rows row
  where row.upload_id=target.id and row.match_status in ('matched','matched_alias') and row.catalog_product_id is not null
    and (row.partner_price is not null or row.retail_price is not null)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if target.snapshot_scope = 'full' then
    delete from public.current_external_prices current
    where current.partner_company_id=target.partner_company_id and current.external_price_source_id=target.external_price_source_id;
  end if;
  insert into public.current_external_prices(partner_company_id,external_price_source_id,catalog_product_id,price_type,observation_id,amount,currency,observed_at,upload_id)
  select observation.partner_company_id,observation.external_price_source_id,observation.catalog_product_id,price.price_type,observation.id,price.amount,observation.currency,observation.observed_at,observation.upload_id
  from public.external_price_observations observation
  cross join lateral (values ('partner'::text,observation.partner_price),('retail'::text,observation.retail_price)) price(price_type,amount)
  where observation.upload_id=target.id and price.amount is not null
  on conflict(partner_company_id,external_price_source_id,catalog_product_id,price_type) do update set
    observation_id=excluded.observation_id,amount=excluded.amount,currency=excluded.currency,observed_at=excluded.observed_at,upload_id=excluded.upload_id,updated_at=now();
  get diagnostics current_count = row_count;
  update public.external_price_uploads set status='applied',applied_at=now(),updated_at=now() where id=target.id;
  insert into public.external_price_events(upload_id,partner_company_id,actor_user_id,event_type,safe_metadata)
  values(target.id,p_company_id,auth.uid(),'applied',jsonb_build_object('observations',inserted_count,'currentPrices',current_count,'snapshotScope',target.snapshot_scope));
  return jsonb_build_object('id',target.id,'status','applied','observations',inserted_count,'currentPrices',current_count,'idempotent',false);
end; $$;
revoke all on function public.apply_external_price_upload(uuid,uuid) from public, anon;
grant execute on function public.apply_external_price_upload(uuid,uuid) to authenticated;

create or replace function public.archive_external_price_upload(p_company_id uuid,p_upload_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare target public.external_price_uploads;
begin
  if not public.can_access_external_prices(p_company_id,'external_prices.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  select * into target from public.external_price_uploads where id=p_upload_id and partner_company_id=p_company_id for update;
  if target.id is null then raise exception 'Import not found.' using errcode='P0002'; end if;
  update public.external_price_uploads set status='archived',archived_at=now(),updated_at=now() where id=target.id;
  delete from public.current_external_prices current where current.upload_id=target.id;
  insert into public.current_external_prices(partner_company_id,external_price_source_id,catalog_product_id,price_type,observation_id,amount,currency,observed_at,upload_id)
  select distinct on(observation.partner_company_id,observation.external_price_source_id,observation.catalog_product_id,price.price_type)
    observation.partner_company_id,observation.external_price_source_id,observation.catalog_product_id,price.price_type,
    observation.id,price.amount,observation.currency,observation.observed_at,observation.upload_id
  from public.external_price_observations observation
  join public.external_price_uploads upload on upload.id=observation.upload_id and upload.status='applied' and upload.archived_at is null
  cross join lateral(values('partner'::text,observation.partner_price),('retail'::text,observation.retail_price)) price(price_type,amount)
  where observation.partner_company_id=target.partner_company_id and observation.external_price_source_id=target.external_price_source_id
    and price.amount is not null
  order by observation.partner_company_id,observation.external_price_source_id,observation.catalog_product_id,price.price_type,observation.observed_at desc,observation.created_at desc
  on conflict(partner_company_id,external_price_source_id,catalog_product_id,price_type) do nothing;
  insert into public.external_price_events(upload_id,partner_company_id,actor_user_id,event_type) values(target.id,p_company_id,auth.uid(),'archived');
end; $$;
revoke all on function public.archive_external_price_upload(uuid,uuid) from public, anon;
grant execute on function public.archive_external_price_upload(uuid,uuid) to authenticated;

create or replace function public.claim_external_price_upload_job()
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.external_price_uploads;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  select * into target from public.external_price_uploads
  where status='uploaded' or (status='analyzing' and updated_at<now()-interval '10 minutes')
  order by created_at for update skip locked limit 1;
  if target.id is null then return null; end if;
  update public.external_price_uploads set status='analyzing',updated_at=now() where id=target.id;
  return jsonb_build_object('id',target.id,'companyId',target.partner_company_id,'sourceId',target.external_price_source_id,'uploadedBy',target.uploaded_by,'storageBucket',target.storage_bucket,'storageKey',target.storage_key,'fileFormat',target.file_format,'currency',target.currency,'priceSchema',target.price_schema,'effectiveDate',target.effective_date,'confirmedMapping',target.confirmed_mapping);
end; $$;
revoke all on function public.claim_external_price_upload_job() from public, anon, authenticated;
grant execute on function public.claim_external_price_upload_job() to service_role;

create or replace function public.list_dahua_catalog_match_candidates()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',product.id,'sku',product.sku,'name',product.name,'normalizedModel',upper(regexp_replace(btrim(product.name),'\s+',' ','g')),
    'aliases',coalesce((select jsonb_agg(alias.normalized_alias) from public.catalog_product_model_aliases alias where alias.catalog_product_id=product.id and alias.active),'[]'::jsonb)
  ) order by product.name), '[]'::jsonb)
  from public.catalog_products product
  where product.is_active and product.is_visible
    and (upper(btrim(product.name)) like 'DH-%' or upper(btrim(product.name)) like 'DHI-%')
$$;
revoke all on function public.list_dahua_catalog_match_candidates() from public, anon, authenticated;
grant execute on function public.list_dahua_catalog_match_candidates() to service_role;

create or replace function public.get_current_external_prices(p_company_id uuid,p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.can_access_external_prices(p_company_id,'external_prices.view') then raise exception 'Access denied.' using errcode='42501'; end if;
  if not exists(select 1 from public.catalog_products product where product.id=p_product_id and product.is_active and product.is_visible) then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('sourceId',source.id,'sourceName',source.display_name,'priceType',current.price_type,'amount',current.amount,'currency',current.currency,'observedAt',current.observed_at) order by source.display_name,current.price_type),'[]'::jsonb)
    from public.current_external_prices current join public.external_price_sources source on source.id=current.external_price_source_id
    where current.partner_company_id=p_company_id and current.catalog_product_id=p_product_id);
end; $$;
revoke all on function public.get_current_external_prices(uuid,uuid) from public, anon;
grant execute on function public.get_current_external_prices(uuid,uuid) to authenticated;

create or replace function public.get_admin_competitive_pricing_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') then raise exception 'Access denied.' using errcode='42501'; end if;
  return jsonb_build_object(
    'sources',coalesce((select jsonb_agg(jsonb_build_object(
      'sourceId',source.id,'sourceName',source.display_name,
      'latestObservationDate',summary.latest_date,'contributingCompanies',summary.company_count,
      'matchedProducts',summary.product_count,'observationCount',summary.observation_count
    ) order by source.display_name) from public.external_price_sources source left join lateral (
      select max(observation.observed_at) latest_date,count(distinct observation.partner_company_id) company_count,
        count(distinct observation.catalog_product_id) product_count,count(*) observation_count
      from public.external_price_observations observation where observation.external_price_source_id=source.id
    ) summary on true where source.active),'[]'::jsonb),
    'currentPriceCount',(select count(*) from public.current_external_prices),
    'parityCount',(select count(*) from public.current_external_prices current
      join public.partner_companies company on company.id=current.partner_company_id
      join public.product_prices novotech on novotech.product_id=current.catalog_product_id
        and novotech.external_1c_price_type_id=company.external_1c_price_type_id
        and novotech.is_active and novotech.is_published and novotech.valid_from<=now()
        and (novotech.valid_to is null or novotech.valid_to>=now()) and novotech.currency=current.currency
      where current.price_type='partner' and abs(novotech.price_amount-current.amount)/greatest(current.amount,0.01)<0.01),
    'competitorCheaperCount',(select count(*) from public.current_external_prices current
      join public.partner_companies company on company.id=current.partner_company_id
      join public.product_prices novotech on novotech.product_id=current.catalog_product_id
        and novotech.external_1c_price_type_id=company.external_1c_price_type_id
        and novotech.is_active and novotech.is_published and novotech.valid_from<=now()
        and (novotech.valid_to is null or novotech.valid_to>=now()) and novotech.currency=current.currency
      where current.price_type='partner' and novotech.price_amount>current.amount and (novotech.price_amount-current.amount)/greatest(current.amount,0.01)>=0.01),
    'novotechCheaperCount',(select count(*) from public.current_external_prices current
      join public.partner_companies company on company.id=current.partner_company_id
      join public.product_prices novotech on novotech.product_id=current.catalog_product_id
        and novotech.external_1c_price_type_id=company.external_1c_price_type_id
        and novotech.is_active and novotech.is_published and novotech.valid_from<=now()
        and (novotech.valid_to is null or novotech.valid_to>=now()) and novotech.currency=current.currency
      where current.price_type='partner' and novotech.price_amount<current.amount and (current.amount-novotech.price_amount)/greatest(current.amount,0.01)>=0.01)
  );
end; $$;
revoke all on function public.get_admin_competitive_pricing_summary() from public, anon;
grant execute on function public.get_admin_competitive_pricing_summary() to authenticated;

create or replace function public.prevent_external_price_immutable_mutation()
returns trigger language plpgsql set search_path='' as $$ begin raise exception 'External price history is append-only.' using errcode='55000'; end; $$;
create trigger prevent_external_price_observation_mutation before update or delete on public.external_price_observations for each row execute function public.prevent_external_price_immutable_mutation();
create trigger prevent_external_price_event_mutation before update or delete on public.external_price_events for each row execute function public.prevent_external_price_immutable_mutation();
revoke all on function public.prevent_external_price_immutable_mutation() from public, anon, authenticated;

commit;
