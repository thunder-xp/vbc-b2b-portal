begin;

create table public.competitor_products (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitive_intelligence_competitors(id) on delete restrict,
  identity_key text not null,
  competitor_sku text,
  competitor_model text,
  competitor_name text not null,
  mapped_novotech_product_id uuid references public.catalog_products(id) on delete restrict,
  mapping_status text not null default 'unmapped' check (mapping_status in ('mapped','unmapped','ambiguous','ignored')),
  mapped_by uuid references public.user_profiles(id) on delete restrict,
  mapped_at timestamptz,
  mapping_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(competitor_id, identity_key),
  check (char_length(identity_key) between 3 and 768),
  check (char_length(competitor_name) between 1 and 500),
  check (competitor_sku is null or char_length(competitor_sku) <= 160),
  check (competitor_model is null or char_length(competitor_model) <= 300),
  check ((mapping_status = 'mapped') = (mapped_novotech_product_id is not null)),
  check (mapping_reason is null or char_length(mapping_reason) <= 500)
);

create table public.competitor_retail_price_imports (
  id uuid primary key,
  competitor_id uuid not null references public.competitive_intelligence_competitors(id) on delete restrict,
  uploaded_by uuid not null references public.user_profiles(id) on delete restrict,
  original_filename text not null,
  storage_bucket text not null default 'external-price-imports',
  storage_key text not null unique,
  source_file_hash text not null check (source_file_hash ~ '^[a-f0-9]{64}$'),
  file_format text not null check (file_format in ('xlsx','csv')),
  file_size bigint not null check (file_size between 1 and 67108864),
  effective_date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  snapshot_scope text not null check (snapshot_scope in ('full','partial')),
  parser_version text not null default 'competitor-retail-v1',
  detected_mapping jsonb,
  confirmed_mapping jsonb,
  sheet_names text[] not null default '{}',
  status text not null default 'uploaded' check (status in ('uploaded','analyzing','mapping_required','ready_for_review','applied','failed','archived')),
  total_rows integer not null default 0 check (total_rows >= 0),
  candidate_rows integer not null default 0 check (candidate_rows >= 0),
  matched_rows integer not null default 0 check (matched_rows >= 0),
  review_rows integer not null default 0 check (review_rows >= 0),
  unmapped_rows integer not null default 0 check (unmapped_rows >= 0),
  ignored_rows integer not null default 0 check (ignored_rows >= 0),
  marker_rows integer not null default 0 check (marker_rows >= 0),
  changed_price_rows integer not null default 0 check (changed_price_rows >= 0),
  unchanged_price_rows integer not null default 0 check (unchanged_price_rows >= 0),
  safe_error_code text,
  correlation_id uuid not null default gen_random_uuid(),
  legacy_external_price_upload_id uuid unique references public.external_price_uploads(id) on delete restrict,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  applied_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(competitor_id, source_file_hash),
  check (char_length(original_filename) between 1 and 240),
  check (detected_mapping is null or jsonb_typeof(detected_mapping) = 'object'),
  check (confirmed_mapping is null or jsonb_typeof(confirmed_mapping) = 'object'),
  check (safe_error_code is null or char_length(safe_error_code) <= 80),
  check (
    (legacy_external_price_upload_id is null and storage_key = 'admin-competitor-retail/' || uploaded_by::text || '/' || id::text || '/' || source_file_hash || '.' || file_format)
    or legacy_external_price_upload_id is not null
  )
);

create table public.competitor_retail_price_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.competitor_retail_price_imports(id) on delete cascade,
  competitor_product_id uuid not null references public.competitor_products(id) on delete restrict,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  competitor_sku text,
  competitor_model text,
  competitor_name text not null,
  source_description text,
  retail_price numeric(18,4) not null check (retail_price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  mapped_novotech_product_id uuid references public.catalog_products(id) on delete restrict,
  match_method text not null check (match_method in ('exact_model','known_alias','suggested','manual','none')),
  match_status text not null check (match_status in ('mapped','needs_review','unmapped','ignored')),
  suggested_products jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(import_id, source_sheet, source_row),
  check (jsonb_typeof(suggested_products) = 'array' and pg_column_size(suggested_products) <= 16384),
  check ((match_status = 'mapped') = (mapped_novotech_product_id is not null))
);

create table public.competitor_retail_price_observations (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.competitor_retail_price_imports(id) on delete restrict,
  competitor_product_id uuid not null references public.competitor_products(id) on delete restrict,
  competitor_id uuid not null references public.competitive_intelligence_competitors(id) on delete restrict,
  mapped_novotech_product_id uuid not null references public.catalog_products(id) on delete restrict,
  retail_price numeric(18,4) not null check (retail_price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  effective_date date not null,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  legacy_external_price_observation_id uuid unique references public.external_price_observations(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(import_id, source_sheet, source_row)
);

create table public.current_competitor_retail_prices (
  competitor_id uuid not null references public.competitive_intelligence_competitors(id) on delete cascade,
  mapped_novotech_product_id uuid not null references public.catalog_products(id) on delete cascade,
  competitor_product_id uuid not null references public.competitor_products(id) on delete restrict,
  observation_id uuid not null references public.competitor_retail_price_observations(id) on delete restrict,
  retail_price numeric(18,4) not null check (retail_price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  effective_date date not null,
  import_id uuid not null references public.competitor_retail_price_imports(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key(competitor_id, mapped_novotech_product_id)
);

create index competitor_products_mapping_idx on public.competitor_products(competitor_id, mapping_status, mapped_novotech_product_id);
create index competitor_products_product_idx on public.competitor_products(mapped_novotech_product_id) where mapped_novotech_product_id is not null;
create index competitor_retail_imports_status_created_idx on public.competitor_retail_price_imports(status, created_at) where status in ('uploaded','analyzing');
create index competitor_retail_imports_competitor_created_idx on public.competitor_retail_price_imports(competitor_id, created_at desc);
create index competitor_retail_rows_import_status_idx on public.competitor_retail_price_import_rows(import_id, match_status, source_row);
create index competitor_retail_rows_product_idx on public.competitor_retail_price_import_rows(mapped_novotech_product_id) where mapped_novotech_product_id is not null;
create index competitor_retail_observations_product_date_idx on public.competitor_retail_price_observations(mapped_novotech_product_id, competitor_id, effective_date desc, created_at desc);
create index competitor_retail_observations_competitor_date_idx on public.competitor_retail_price_observations(competitor_id, effective_date desc);
create index competitor_retail_observations_import_idx on public.competitor_retail_price_observations(import_id);
create index current_competitor_retail_product_idx on public.current_competitor_retail_prices(mapped_novotech_product_id, competitor_id);
create index current_competitor_retail_observation_idx on public.current_competitor_retail_prices(observation_id);
create index current_competitor_retail_import_idx on public.current_competitor_retail_prices(import_id);

create trigger competitor_products_set_updated_at
before update on public.competitor_products
for each row execute function public.set_updated_at();

create trigger competitor_retail_imports_set_updated_at
before update on public.competitor_retail_price_imports
for each row execute function public.set_updated_at();

create trigger immutable_competitor_retail_observations
before update or delete on public.competitor_retail_price_observations
for each row execute function public.prevent_competitive_intelligence_history_mutation();

alter table public.competitor_products enable row level security;
alter table public.competitor_retail_price_imports enable row level security;
alter table public.competitor_retail_price_import_rows enable row level security;
alter table public.competitor_retail_price_observations enable row level security;
alter table public.current_competitor_retail_prices enable row level security;

revoke all on public.competitor_products,
  public.competitor_retail_price_imports,
  public.competitor_retail_price_import_rows,
  public.competitor_retail_price_observations,
  public.current_competitor_retail_prices
from public, anon, authenticated;

grant select, insert, update, delete on public.competitor_products,
  public.competitor_retail_price_imports,
  public.competitor_retail_price_import_rows,
  public.competitor_retail_price_observations,
  public.current_competitor_retail_prices
to service_role;

alter table public.competitive_intelligence_events
  drop constraint competitive_intelligence_events_event_type_check;
alter table public.competitive_intelligence_events
  add constraint competitive_intelligence_events_event_type_check check (event_type in (
    'observation_created','observation_superseded','evidence_attached','competitor_reconciled',
    'outlier_reviewed','evidence_reviewed','recommendation_generated','recommendation_acknowledged',
    'signal_suppressed','signal_restored','retail_price_list_uploaded','retail_price_mapping_changed',
    'retail_prices_imported','retail_price_import_failed','competitor_product_reconciled',
    'retail_price_history_migrated'
  ));

create or replace function public.competitor_product_identity_key(p_sku text,p_model text,p_name text)
returns text language sql immutable set search_path='' as $$
  select public.normalize_competitive_intelligence_name(coalesce(p_sku,'')) || '|' ||
    public.normalize_competitive_intelligence_name(coalesce(p_model,'')) || '|' ||
    public.normalize_competitive_intelligence_name(coalesce(p_name,''));
$$;
revoke all on function public.competitor_product_identity_key(text,text,text) from public, anon, authenticated;
grant execute on function public.competitor_product_identity_key(text,text,text) to service_role;

create or replace function public.list_admin_competitor_retail_imports(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') or p_limit not between 1 and 100 then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'competitors',(select coalesce(jsonb_agg(jsonb_build_object('id',competitor.id,'name',competitor.display_name)
      order by competitor.display_name),'[]'::jsonb) from public.competitive_intelligence_competitors competitor where competitor.status='active'),
    'imports',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',item.id,'competitorId',item.competitor_id,'competitorName',item.competitor_name,
      'fileName',item.original_filename,'effectiveDate',item.effective_date,'currency',item.currency,
      'status',item.status,'rows',item.candidate_rows,'mapped',item.matched_rows,'unmapped',item.unmapped_rows,
      'changed',item.changed_price_rows,'unchanged',item.unchanged_price_rows,'errors',item.review_rows,
      'createdAt',item.created_at,'appliedAt',item.applied_at,'safeErrorCode',item.safe_error_code
    ) order by item.created_at desc),'[]'::jsonb) from (
      select import.*,competitor.display_name competitor_name
      from public.competitor_retail_price_imports import
      join public.competitive_intelligence_competitors competitor on competitor.id=import.competitor_id
      order by import.created_at desc limit p_limit
    ) item)
  );
end; $$;
revoke all on function public.list_admin_competitor_retail_imports(integer) from public, anon;
grant execute on function public.list_admin_competitor_retail_imports(integer) to authenticated;

create or replace function public.get_admin_competitor_retail_import(p_import_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target public.competitor_retail_price_imports;
begin
  if not public.has_internal_permission('admin.analytics.view') then raise exception 'Access denied.' using errcode='42501'; end if;
  select * into target from public.competitor_retail_price_imports where id=p_import_id;
  if target.id is null then return null; end if;
  return jsonb_build_object(
    'id',target.id,'competitorId',target.competitor_id,
    'competitorName',(select display_name from public.competitive_intelligence_competitors where id=target.competitor_id),
    'fileName',target.original_filename,'effectiveDate',target.effective_date,'currency',target.currency,
    'snapshotScope',target.snapshot_scope,'status',target.status,'detectedMapping',target.detected_mapping,
    'confirmedMapping',target.confirmed_mapping,'totalRows',target.total_rows,'candidateRows',target.candidate_rows,
    'matchedRows',target.matched_rows,'reviewRows',target.review_rows,'unmappedRows',target.unmapped_rows,
    'ignoredRows',target.ignored_rows,'markerRows',target.marker_rows,'changedRows',target.changed_price_rows,
    'unchangedRows',target.unchanged_price_rows,'safeErrorCode',target.safe_error_code,
    'createdAt',target.created_at,'appliedAt',target.applied_at,'correlationId',target.correlation_id,
    'rows',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',row.id,'competitorProductId',row.competitor_product_id,'sku',row.competitor_sku,
      'model',row.competitor_model,'name',row.competitor_name,'description',row.source_description,
      'price',row.retail_price,'currency',row.currency,'sheet',row.source_sheet,'row',row.source_row,
      'productId',row.mapped_novotech_product_id,'matchMethod',row.match_method,'status',row.match_status,
      'suggestions',row.suggested_products
    ) order by row.source_sheet,row.source_row),'[]'::jsonb)
      from public.competitor_retail_price_import_rows row where row.import_id=target.id)
  );
end; $$;
revoke all on function public.get_admin_competitor_retail_import(uuid) from public, anon;
grant execute on function public.get_admin_competitor_retail_import(uuid) to authenticated;

create or replace function public.create_admin_competitor_retail_import(
  p_import_id uuid,p_competitor_id uuid,p_original_filename text,p_storage_key text,p_source_file_hash text,
  p_file_format text,p_file_size bigint,p_effective_date date,p_currency text,p_snapshot_scope text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.competitor_retail_price_imports;
begin
  if actor is null or not public.has_internal_permission('admin.market_intelligence.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  if p_file_format not in ('xlsx','csv') or p_file_size not between 1 and 67108864 or p_source_file_hash !~ '^[a-f0-9]{64}$'
    or p_currency !~ '^[A-Z]{3}$' or p_snapshot_scope not in ('full','partial') or p_effective_date is null
    or char_length(btrim(p_original_filename)) not between 1 and 240 then raise exception 'Invalid import.' using errcode='22023'; end if;
  if not exists(select 1 from public.competitive_intelligence_competitors where id=p_competitor_id and status='active') then
    raise exception 'Competitor is unavailable.' using errcode='22023';
  end if;
  if p_storage_key <> 'admin-competitor-retail/' || actor::text || '/' || p_import_id::text || '/' || p_source_file_hash || '.' || p_file_format then
    raise exception 'Invalid storage key.' using errcode='22023';
  end if;
  select * into existing from public.competitor_retail_price_imports where competitor_id=p_competitor_id and source_file_hash=p_source_file_hash;
  if existing.id is not null then return jsonb_build_object('id',existing.id,'duplicate',true,'status',existing.status); end if;
  insert into public.competitor_retail_price_imports(id,competitor_id,uploaded_by,original_filename,storage_key,source_file_hash,
    file_format,file_size,effective_date,currency,snapshot_scope)
  values(p_import_id,p_competitor_id,actor,btrim(p_original_filename),p_storage_key,p_source_file_hash,p_file_format,p_file_size,
    p_effective_date,upper(p_currency),p_snapshot_scope) returning * into existing;
  insert into public.competitive_intelligence_events(event_type,competitor_id,actor_user_id,correlation_id,safe_metadata)
  values('retail_price_list_uploaded',p_competitor_id,actor,existing.correlation_id,jsonb_build_object('importId',existing.id,'format',p_file_format,'size',p_file_size));
  return jsonb_build_object('id',existing.id,'duplicate',false,'status',existing.status);
end; $$;
revoke all on function public.create_admin_competitor_retail_import(uuid,uuid,text,text,text,text,bigint,date,text,text) from public, anon;
grant execute on function public.create_admin_competitor_retail_import(uuid,uuid,text,text,text,text,bigint,date,text,text) to authenticated;

create or replace function public.confirm_admin_competitor_retail_mapping(p_import_id uuid,p_mapping jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.competitor_retail_price_imports;
begin
  if actor is null or not public.has_internal_permission('admin.market_intelligence.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  select * into target from public.competitor_retail_price_imports where id=p_import_id for update;
  if target.id is null or target.status not in ('mapping_required','ready_for_review') then raise exception 'Import state changed.' using errcode='PT409'; end if;
  if jsonb_typeof(p_mapping)<>'object' or coalesce(p_mapping->>'productName','') !~ '^[A-Z]{1,3}$'
    or coalesce(p_mapping->>'retailPrice','') !~ '^[A-Z]{1,3}$' or nullif(p_mapping->>'partnerPrice','') is not null then
    raise exception 'Invalid mapping.' using errcode='22023';
  end if;
  delete from public.competitor_retail_price_import_rows where import_id=target.id;
  update public.competitor_retail_price_imports set confirmed_mapping=p_mapping,status='uploaded',matched_rows=0,review_rows=0,
    unmapped_rows=0,ignored_rows=0,safe_error_code=null,analyzed_at=null where id=target.id;
  insert into public.competitive_intelligence_events(event_type,competitor_id,actor_user_id,correlation_id,safe_metadata)
  values('retail_price_mapping_changed',target.competitor_id,actor,target.correlation_id,jsonb_build_object('importId',target.id));
  return jsonb_build_object('id',target.id,'status','uploaded');
end; $$;
revoke all on function public.confirm_admin_competitor_retail_mapping(uuid,jsonb) from public, anon;
grant execute on function public.confirm_admin_competitor_retail_mapping(uuid,jsonb) to authenticated;

create or replace function public.review_admin_competitor_retail_row(
  p_import_id uuid,p_row_id uuid,p_product_id uuid,p_ignore boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.competitor_retail_price_imports; row_target public.competitor_retail_price_import_rows;
begin
  if actor is null or not public.has_internal_permission('admin.market_intelligence.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  select * into target from public.competitor_retail_price_imports where id=p_import_id for update;
  if target.id is null or target.status<>'ready_for_review' then raise exception 'Import state changed.' using errcode='PT409'; end if;
  select * into row_target from public.competitor_retail_price_import_rows where id=p_row_id and import_id=target.id for update;
  if row_target.id is null then raise exception 'Row unavailable.' using errcode='22023'; end if;
  if not p_ignore and not exists(select 1 from public.catalog_products where id=p_product_id and is_active and is_visible) then
    raise exception 'Product unavailable.' using errcode='22023';
  end if;
  if not p_ignore and exists(
    select 1 from public.competitor_retail_price_import_rows other
    where other.import_id=target.id and other.id<>row_target.id and other.match_status='mapped'
      and other.mapped_novotech_product_id=p_product_id
      and (other.retail_price<>row_target.retail_price or other.currency<>row_target.currency)
  ) then
    raise exception 'Conflicting duplicate retail prices require review.' using errcode='PT409';
  end if;
  update public.competitor_retail_price_import_rows set mapped_novotech_product_id=case when p_ignore then null else p_product_id end,
    match_status=case when p_ignore then 'ignored' else 'mapped' end,match_method=case when p_ignore then match_method else 'manual' end,
    updated_at=now() where id=row_target.id;
  if not p_ignore then
    update public.competitor_products set mapped_novotech_product_id=p_product_id,mapping_status='mapped',mapped_by=actor,mapped_at=now(),
      mapping_reason='Admin-confirmed retail price import mapping.' where id=row_target.competitor_product_id;
  end if;
  update public.competitor_retail_price_imports set
    matched_rows=(select count(*) from public.competitor_retail_price_import_rows where import_id=target.id and match_status='mapped'),
    review_rows=(select count(*) from public.competitor_retail_price_import_rows where import_id=target.id and match_status='needs_review'),
    unmapped_rows=(select count(*) from public.competitor_retail_price_import_rows where import_id=target.id and match_status='unmapped'),
    ignored_rows=(select count(*) from public.competitor_retail_price_import_rows where import_id=target.id and match_status='ignored')
  where id=target.id;
  insert into public.competitive_intelligence_events(event_type,competitor_id,product_id,actor_user_id,correlation_id,safe_metadata)
  values('competitor_product_reconciled',target.competitor_id,case when p_ignore then null else p_product_id end,actor,target.correlation_id,
    jsonb_build_object('importId',target.id,'competitorProductId',row_target.competitor_product_id,'decision',case when p_ignore then 'ignored' else 'mapped' end));
  return jsonb_build_object('id',row_target.id,'status',case when p_ignore then 'ignored' else 'mapped' end);
end; $$;
revoke all on function public.review_admin_competitor_retail_row(uuid,uuid,uuid,boolean) from public, anon;
grant execute on function public.review_admin_competitor_retail_row(uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.apply_admin_competitor_retail_import(p_import_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.competitor_retail_price_imports; inserted_count integer; changed_count integer; unchanged_count integer;
begin
  if actor is null or not public.has_internal_permission('admin.market_intelligence.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  select * into target from public.competitor_retail_price_imports where id=p_import_id for update;
  if target.id is null then raise exception 'Import unavailable.' using errcode='22023'; end if;
  if target.status='applied' then return jsonb_build_object('id',target.id,'duplicate',true,'observations',(select count(*) from public.competitor_retail_price_observations where import_id=target.id)); end if;
  if target.status<>'ready_for_review' then raise exception 'Import is not ready.' using errcode='PT409'; end if;
  if exists(select 1 from public.competitor_retail_price_import_rows where import_id=target.id and match_status='needs_review') then
    raise exception 'Resolve ambiguous rows before applying.' using errcode='PT409';
  end if;
  if not exists(select 1 from public.competitor_retail_price_import_rows where import_id=target.id and match_status='mapped') then
    raise exception 'At least one mapped row is required.' using errcode='22023';
  end if;
  if exists(
    select 1 from public.competitor_retail_price_import_rows row
    where row.import_id=target.id and row.match_status='mapped'
    group by row.mapped_novotech_product_id
    having count(distinct row.retail_price)>1 or count(distinct row.currency)>1
  ) then
    raise exception 'Conflicting duplicate retail prices require review.' using errcode='PT409';
  end if;

  select count(*) filter(where current.retail_price is distinct from row.retail_price or current.currency is distinct from row.currency),
    count(*) filter(where current.retail_price=row.retail_price and current.currency=row.currency)
  into changed_count,unchanged_count
  from public.competitor_retail_price_import_rows row
  left join public.current_competitor_retail_prices current on current.competitor_id=target.competitor_id
    and current.mapped_novotech_product_id=row.mapped_novotech_product_id
  where row.import_id=target.id and row.match_status='mapped';

  insert into public.competitor_retail_price_observations(import_id,competitor_product_id,competitor_id,mapped_novotech_product_id,
    retail_price,currency,effective_date,source_sheet,source_row)
  select target.id,row.competitor_product_id,target.competitor_id,row.mapped_novotech_product_id,row.retail_price,row.currency,
    target.effective_date,row.source_sheet,row.source_row
  from public.competitor_retail_price_import_rows row where row.import_id=target.id and row.match_status='mapped'
  on conflict(import_id,source_sheet,source_row) do nothing;
  get diagnostics inserted_count=row_count;

  if target.snapshot_scope='full' then delete from public.current_competitor_retail_prices where competitor_id=target.competitor_id; end if;
  insert into public.current_competitor_retail_prices(competitor_id,mapped_novotech_product_id,competitor_product_id,observation_id,
    retail_price,currency,effective_date,import_id)
  select distinct on (observation.competitor_id,observation.mapped_novotech_product_id)
    observation.competitor_id,observation.mapped_novotech_product_id,observation.competitor_product_id,observation.id,
    observation.retail_price,observation.currency,observation.effective_date,observation.import_id
  from public.competitor_retail_price_observations observation where observation.import_id=target.id
  order by observation.competitor_id,observation.mapped_novotech_product_id,observation.effective_date desc,observation.source_row desc,observation.id desc
  on conflict(competitor_id,mapped_novotech_product_id) do update set competitor_product_id=excluded.competitor_product_id,
    observation_id=excluded.observation_id,retail_price=excluded.retail_price,currency=excluded.currency,
    effective_date=excluded.effective_date,import_id=excluded.import_id,updated_at=now();

  update public.competitor_retail_price_imports set status='applied',applied_at=now(),changed_price_rows=changed_count,
    unchanged_price_rows=unchanged_count,safe_error_code=null where id=target.id;
  insert into public.competitive_intelligence_events(event_type,competitor_id,actor_user_id,correlation_id,safe_metadata)
  values('retail_prices_imported',target.competitor_id,actor,target.correlation_id,
    jsonb_build_object('importId',target.id,'observations',inserted_count,'changed',changed_count,'unchanged',unchanged_count));
  return jsonb_build_object('id',target.id,'duplicate',false,'observations',inserted_count,'changed',changed_count,'unchanged',unchanged_count);
end; $$;
revoke all on function public.apply_admin_competitor_retail_import(uuid) from public, anon;
grant execute on function public.apply_admin_competitor_retail_import(uuid) to authenticated;

create or replace function public.archive_admin_competitor_retail_import(p_import_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_internal_permission('admin.market_intelligence.manage') then raise exception 'Access denied.' using errcode='42501'; end if;
  update public.competitor_retail_price_imports set status='archived',archived_at=now()
  where id=p_import_id and status not in ('applied','archived');
end; $$;
revoke all on function public.archive_admin_competitor_retail_import(uuid) from public, anon;
grant execute on function public.archive_admin_competitor_retail_import(uuid) to authenticated;

create or replace function public.claim_competitor_retail_price_import_job()
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.competitor_retail_price_imports;
begin
  select * into target from public.competitor_retail_price_imports where status='uploaded' order by created_at for update skip locked limit 1;
  if target.id is null then return null; end if;
  update public.competitor_retail_price_imports set status='analyzing',safe_error_code=null where id=target.id;
  return jsonb_build_object('id',target.id,'competitorId',target.competitor_id,'storageBucket',target.storage_bucket,
    'storageKey',target.storage_key,'sourceFileHash',target.source_file_hash,'fileFormat',target.file_format,
    'currency',target.currency,'confirmedMapping',target.confirmed_mapping,'effectiveDate',target.effective_date,
    'correlationId',target.correlation_id);
end; $$;
revoke all on function public.claim_competitor_retail_price_import_job() from public, anon, authenticated;
grant execute on function public.claim_competitor_retail_price_import_job() to service_role;

create or replace function public.list_competitor_catalog_match_candidates()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',product.id,'sku',product.sku,'name',product.name,
    'normalizedModel',upper(regexp_replace(btrim(product.name),'\s+',' ','g')),'aliases',coalesce(alias.items,'[]'::jsonb)) order by product.sku),'[]'::jsonb)
  from public.catalog_products product
  left join lateral (select jsonb_agg(model.alias_display order by model.alias_display) items
    from public.catalog_product_model_aliases model where model.catalog_product_id=product.id and model.active) alias on true
  where product.is_active and product.is_visible;
$$;
revoke all on function public.list_competitor_catalog_match_candidates() from public, anon, authenticated;
grant execute on function public.list_competitor_catalog_match_candidates() to service_role;

create or replace function public.search_admin_competitor_mapping_products(p_query text,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare normalized text:=btrim(p_query);
begin
  if not public.has_internal_permission('admin.market_intelligence.manage') or char_length(normalized) not between 2 and 100
    or p_limit not between 1 and 20 then raise exception 'Access denied.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',item.id,'sku',item.sku,'name',item.name)
    order by item.rank,item.sku),'[]'::jsonb) from (
      select product.id,product.sku,product.name,
        case when lower(product.sku)=lower(normalized) then 0
          when left(lower(product.sku),char_length(normalized))=lower(normalized) then 1 else 2 end rank
      from public.catalog_products product
      where product.is_active and product.is_visible
        and (lower(product.sku)=lower(normalized)
          or left(lower(product.sku),char_length(normalized))=lower(normalized)
          or strpos(lower(product.name),lower(normalized))>0)
      order by rank,product.sku limit p_limit
    ) item);
end; $$;
revoke all on function public.search_admin_competitor_mapping_products(text,integer) from public, anon;
grant execute on function public.search_admin_competitor_mapping_products(text,integer) to authenticated;

create or replace function public.get_partner_product_competitor_pricing(p_company_id uuid,p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.can_access_competitive_intelligence(p_company_id,'competitive_intelligence.view') then
    raise exception 'Competitive intelligence access denied.' using errcode='42501';
  end if;
  if not exists(select 1 from public.catalog_products where id=p_product_id and is_active and is_visible) then
    raise exception 'Product unavailable.' using errcode='22023';
  end if;
  return jsonb_build_object(
    'items',(select coalesce(jsonb_agg(jsonb_build_object(
      'competitorId',current.competitor_id,'competitorName',competitor.display_name,
      'retailPrice',current.retail_price,'retailCurrency',current.currency,'retailEffectiveDate',current.effective_date,
      'ownPrice',own.observed_price,'ownCurrency',own.currency,'ownObservationDate',own.observation_date,'ownQuantity',own.quantity
    ) order by competitor.display_name),'[]'::jsonb)
      from public.current_competitor_retail_prices current
      join public.competitive_intelligence_competitors competitor on competitor.id=current.competitor_id and competitor.status='active'
      left join lateral (
        select observation.observed_price,observation.currency,observation.observation_date,observation.quantity
        from public.competitor_price_observations observation
        left join public.competitive_intelligence_reconciliation_queue queue
          on queue.normalized_name=observation.normalized_submitted_competitor_name
        where observation.partner_company_id=p_company_id and observation.product_id=p_product_id
          and coalesce(observation.competitor_id,queue.resolved_competitor_id)=current.competitor_id
          and observation.status='active' and not observation.is_test_data
          and not exists(select 1 from public.competitor_price_observations newer where newer.supersedes_observation_id=observation.id)
          and not exists(select 1 from public.competitive_intelligence_observation_reviews review
            where review.observation_id=observation.id and review.decision='exclude')
        order by observation.observation_date desc,observation.created_at desc,observation.id desc limit 1
      ) own on true
      where current.mapped_novotech_product_id=p_product_id),
    'rates',jsonb_build_object(
      'partnerUsdMdl',(select rate from public.commercial_exchange_rates where purpose='partner_price_usd_to_mdl' and is_active and is_published order by effective_at desc limit 1),
      'retailUsdMdl',(select rate from public.commercial_exchange_rates where purpose='retail_price_usd_to_mdl' and is_active and is_published order by effective_at desc limit 1),
      'effectiveDate',(select effective_at::date from public.commercial_exchange_rates where purpose='partner_price_usd_to_mdl' and is_active and is_published order by effective_at desc limit 1)
    )
  );
end; $$;
revoke all on function public.get_partner_product_competitor_pricing(uuid,uuid) from public, anon;
grant execute on function public.get_partner_product_competitor_pricing(uuid,uuid) to authenticated;

create or replace function public.get_admin_product_market_intelligence(p_product_id uuid,p_window_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') or p_window_days not in (7,30,90,36500) then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  return (select jsonb_build_object(
    'id',product.id,'sku',product.sku,'name',product.name,
    'retailReferences',(select coalesce(jsonb_agg(jsonb_build_object(
      'competitorId',current.competitor_id,'competitorName',competitor.display_name,
      'price',current.retail_price,'currency',current.currency,'effectiveDate',current.effective_date,
      'previousPrice',previous.retail_price,
      'changePercent',case when previous.retail_price is null or previous.retail_price=0 or previous.currency<>current.currency then null
        else round((current.retail_price-previous.retail_price)/previous.retail_price*100,2) end
    ) order by competitor.display_name),'[]'::jsonb)
      from public.current_competitor_retail_prices current
      join public.competitive_intelligence_competitors competitor on competitor.id=current.competitor_id
      left join lateral (
        select observation.retail_price,observation.currency
        from public.competitor_retail_price_observations observation
        where observation.mapped_novotech_product_id=current.mapped_novotech_product_id
          and observation.competitor_id=current.competitor_id and observation.id<>current.observation_id
        order by observation.effective_date desc,observation.created_at desc,observation.id desc limit 1
      ) previous on true
      where current.mapped_novotech_product_id=product.id),
    'cohorts',(select coalesce(jsonb_agg(jsonb_build_object(
      'competitorId',aggregate.competitor_id,'competitorName',competitor.display_name,
      'currency',aggregate.currency,'vatMode',aggregate.vat_mode,'quantityCohort',aggregate.quantity_cohort,
      'median',aggregate.median_price,'novotechComparison',aggregate.novotech_comparison_median,
      'min',aggregate.min_price,'max',aggregate.max_price,'trendPercent',aggregate.trend_percent,
      'observations',aggregate.observation_count,'uniqueCompanies',aggregate.unique_company_count,
      'confidence',aggregate.confidence_level
    ) order by competitor.display_name),'[]'::jsonb)
      from public.competitive_market_price_aggregates aggregate
      join public.competitive_intelligence_competitors competitor on competitor.id=aggregate.competitor_id
      where aggregate.product_id=product.id and aggregate.window_days=p_window_days),
    'signals',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',signal.id,'type',signal.signal_type,'severity',signal.severity,'evidence',signal.evidence,
      'generatedAt',signal.generated_at,'reviewAction',review.action
    ) order by signal.generated_at desc),'[]'::jsonb)
      from public.competitive_signals signal
      left join lateral(select candidate.action from public.competitive_signal_reviews candidate
        where candidate.source_fingerprint=signal.source_fingerprint order by candidate.created_at desc limit 1) review on true
      where signal.product_id=product.id and signal.window_days=p_window_days),
    'timeline',(select coalesce(jsonb_agg(jsonb_build_object(
      'observationId',observation.id,'date',observation.observation_date,
      'competitorName',coalesce(competitor.display_name,resolved.display_name,observation.submitted_competitor_name),
      'price',observation.observed_price,'currency',observation.currency,'vatMode',observation.vat_mode,
      'quantity',observation.quantity,'confidence',observation.confidence_level,
      'possibleOutlier',observation.possible_outlier,'hasEvidence',evidence.id is not null,
      'evidenceId',evidence.id,'reviewDecision',review.decision
    ) order by observation.observation_date desc,observation.created_at desc),'[]'::jsonb)
      from (select * from public.competitor_price_observations candidate
        where candidate.product_id=product.id and not candidate.is_test_data
          and candidate.observation_date>=current_date-p_window_days
        order by candidate.observation_date desc,candidate.created_at desc limit 100) observation
      left join public.competitive_intelligence_competitors competitor on competitor.id=observation.competitor_id
      left join public.competitive_intelligence_reconciliation_queue queue
        on queue.normalized_name=observation.normalized_submitted_competitor_name
      left join public.competitive_intelligence_competitors resolved on resolved.id=queue.resolved_competitor_id
      left join public.competitive_intelligence_observation_evidence evidence on evidence.observation_id=observation.id
      left join lateral(select candidate.decision from public.competitive_intelligence_observation_reviews candidate
        where candidate.observation_id=observation.id order by candidate.created_at desc limit 1) review on true)
  )
    from public.catalog_products product where product.id=p_product_id);
end; $$;
revoke all on function public.get_admin_product_market_intelligence(uuid,integer) from public, anon;
grant execute on function public.get_admin_product_market_intelligence(uuid,integer) to authenticated;

-- The former partner-owned supplier-price console is retained as immutable history only.
revoke execute on function public.list_external_price_sources(uuid) from authenticated;
revoke execute on function public.create_external_price_upload(uuid,uuid,uuid,text,text,text,text,bigint,date,text,text,text) from authenticated;
revoke execute on function public.list_external_price_uploads(uuid,integer) from authenticated;
revoke execute on function public.get_external_price_upload(uuid,uuid) from authenticated;
revoke execute on function public.confirm_external_price_mapping(uuid,uuid,jsonb,boolean) from authenticated;
revoke execute on function public.review_external_price_row(uuid,uuid,uuid,uuid,boolean) from authenticated;
revoke execute on function public.apply_external_price_upload(uuid,uuid) from authenticated;
revoke execute on function public.archive_external_price_upload(uuid,uuid) from authenticated;
revoke execute on function public.get_current_external_prices(uuid,uuid) from authenticated;
revoke execute on function public.start_external_price_upload_correction(uuid,uuid,jsonb,text,text,text,uuid) from authenticated;

-- Migrate only the explicitly business-confirmed Exterior retail revision. Partner-price legacy rows remain isolated.
do $$
declare source_row record; central_import_id uuid; migrated_rows integer:=0;
begin
  select upload.*,source.display_name,competitor.id canonical_competitor_id
  into source_row
  from public.external_price_uploads upload
  join public.external_price_sources source on source.id=upload.external_price_source_id
  join public.competitive_intelligence_competitors competitor
    on competitor.normalized_name=public.normalize_competitive_intelligence_name(source.display_name)
  where source.code='exterior' and upload.original_filename='Price_Exterior 08.08.2026_edit.xlsx'
    and upload.price_schema='retail' and upload.status='applied' and upload.superseded_at is null
  order by upload.applied_at desc limit 1;
  if source_row.id is null then return; end if;
  central_import_id:=gen_random_uuid();
  insert into public.competitor_retail_price_imports(id,competitor_id,uploaded_by,original_filename,storage_key,source_file_hash,
    file_format,file_size,effective_date,currency,snapshot_scope,detected_mapping,confirmed_mapping,sheet_names,status,total_rows,
    candidate_rows,matched_rows,review_rows,unmapped_rows,ignored_rows,marker_rows,changed_price_rows,applied_at,analyzed_at,
    legacy_external_price_upload_id)
  values(central_import_id,source_row.canonical_competitor_id,source_row.uploaded_by,source_row.original_filename,
    source_row.storage_key,
    source_row.source_file_hash,source_row.file_format,source_row.file_size,source_row.effective_date,source_row.currency,source_row.snapshot_scope,
    source_row.detected_mapping,source_row.confirmed_mapping,source_row.sheet_names,'applied',source_row.total_rows,source_row.candidate_rows,
    source_row.matched_rows,0,source_row.unmatched_rows,source_row.ignored_rows,source_row.marker_rows,source_row.matched_rows,now(),source_row.analyzed_at,source_row.id)
  on conflict(legacy_external_price_upload_id) do nothing;
  if not found then return; end if;

  insert into public.competitor_products(competitor_id,identity_key,competitor_sku,competitor_model,competitor_name,
    mapped_novotech_product_id,mapping_status,mapped_by,mapped_at,mapping_reason)
  select distinct source_row.canonical_competitor_id,
    public.competitor_product_identity_key(observation.source_product_code,observation.normalized_model,observation.source_product_name),
    nullif(observation.source_product_code,''),nullif(observation.normalized_model,''),observation.source_product_name,
    observation.catalog_product_id,'mapped',source_row.uploaded_by,now(),'Migrated from business-confirmed Exterior retail revision.'
  from public.external_price_observations observation where observation.upload_id=source_row.id and observation.retail_price is not null
  on conflict(competitor_id,identity_key) do nothing;

  insert into public.competitor_retail_price_observations(import_id,competitor_product_id,competitor_id,mapped_novotech_product_id,
    retail_price,currency,effective_date,source_sheet,source_row,legacy_external_price_observation_id)
  select central_import_id,product.id,source_row.canonical_competitor_id,observation.catalog_product_id,observation.retail_price,
    observation.currency,observation.observed_at,observation.source_sheet,observation.source_row,observation.id
  from public.external_price_observations observation
  join public.competitor_products product on product.competitor_id=source_row.canonical_competitor_id
    and product.identity_key=public.competitor_product_identity_key(observation.source_product_code,observation.normalized_model,observation.source_product_name)
  where observation.upload_id=source_row.id and observation.retail_price is not null
  on conflict(legacy_external_price_observation_id) do nothing;
  get diagnostics migrated_rows=row_count;

  insert into public.current_competitor_retail_prices(competitor_id,mapped_novotech_product_id,competitor_product_id,observation_id,
    retail_price,currency,effective_date,import_id)
  select distinct on (observation.competitor_id,observation.mapped_novotech_product_id)
    observation.competitor_id,observation.mapped_novotech_product_id,observation.competitor_product_id,observation.id,
    observation.retail_price,observation.currency,observation.effective_date,observation.import_id
  from public.competitor_retail_price_observations observation where observation.import_id=central_import_id
  order by observation.competitor_id,observation.mapped_novotech_product_id,observation.effective_date desc,observation.source_row desc
  on conflict(competitor_id,mapped_novotech_product_id) do nothing;

  insert into public.competitive_intelligence_events(event_type,competitor_id,actor_user_id,safe_metadata)
  values('retail_price_history_migrated',source_row.canonical_competitor_id,source_row.uploaded_by,
    jsonb_build_object('importId',central_import_id,'legacyUploadId',source_row.id,'rows',migrated_rows,'basis','business_confirmed_retail_revision'));
end $$;

comment on table public.competitor_products is 'Admin-governed competitor nomenclature identities and explicit Novotech catalog mappings. No SKU equality is implied.';
comment on table public.competitor_retail_price_observations is 'Admin-owned append-only competitor public/list retail price history. VAT is included by contract.';
comment on table public.current_competitor_retail_prices is 'Bounded latest competitor retail-price projection for authorized B2B reads; never exposed to public retail.';
comment on table public.competitor_price_observations is 'Company-scoped actual negotiated/received competitor prices. Never shared across partner companies.';

commit;
