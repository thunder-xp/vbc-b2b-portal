begin;

-- Governed partner document metadata, private product-document storage, and secure access RPCs.

insert into public.permissions (code, description)
values
  ('documents.view_commercial', 'View permitted commercial and order documents.'),
  ('documents.view_accounting', 'View company accounting documents.'),
  ('documents.view_finance', 'View finance evidence documents.'),
  ('documents.view_product', 'View product and technical documents.'),
  ('documents.download', 'Download documents visible to the current company.'),
  ('documents.manage_product_documents', 'Publish and archive portal-owned product documents.'),
  ('admin.documents.view', 'View internal document metadata and health diagnostics.'),
  ('admin.documents.sync', 'Run governed document metadata synchronization.')
on conflict (code) do nothing;

with grants(role_code, permission_code) as (
  values
    ('partner_owner', 'documents.view_commercial'),
    ('partner_owner', 'documents.view_accounting'),
    ('partner_owner', 'documents.view_finance'),
    ('partner_owner', 'documents.view_product'),
    ('partner_owner', 'documents.download'),
    ('partner_manager', 'documents.view_commercial'),
    ('partner_manager', 'documents.view_product'),
    ('partner_manager', 'documents.download'),
    ('partner_buyer', 'documents.view_commercial'),
    ('partner_buyer', 'documents.view_product'),
    ('partner_buyer', 'documents.download'),
    ('partner_accounting', 'documents.view_commercial'),
    ('partner_accounting', 'documents.view_accounting'),
    ('partner_accounting', 'documents.view_finance'),
    ('partner_accounting', 'documents.view_product'),
    ('partner_accounting', 'documents.download'),
    ('partner_viewer', 'documents.view_product'),
    ('partner_viewer', 'documents.download'),
    ('novotech_admin', 'documents.view_commercial'),
    ('novotech_admin', 'documents.view_accounting'),
    ('novotech_admin', 'documents.view_finance'),
    ('novotech_admin', 'documents.view_product'),
    ('novotech_admin', 'documents.download'),
    ('novotech_admin', 'documents.manage_product_documents'),
    ('novotech_admin', 'admin.documents.view'),
    ('novotech_admin', 'admin.documents.sync'),
    ('novotech_sales', 'documents.view_commercial'),
    ('novotech_sales', 'documents.view_product'),
    ('novotech_sales', 'documents.download'),
    ('novotech_sales', 'admin.documents.view'),
    ('novotech_finance', 'documents.view_commercial'),
    ('novotech_finance', 'documents.view_accounting'),
    ('novotech_finance', 'documents.view_finance'),
    ('novotech_finance', 'documents.download'),
    ('novotech_finance', 'admin.documents.view'),
    ('novotech_content_manager', 'documents.view_product'),
    ('novotech_content_manager', 'documents.download'),
    ('novotech_content_manager', 'documents.manage_product_documents'),
    ('novotech_content_manager', 'admin.documents.view')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict do nothing;

create table public.partner_documents (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_document_id text not null,
  company_id uuid null references public.partner_companies(id) on delete restrict,
  document_type text not null,
  title text not null,
  description text null,
  document_number text null,
  issue_date date null,
  valid_from date null,
  valid_until date null,
  currency_code text null,
  status text not null default 'available',
  version text not null default '1',
  language_code text not null default 'ru',
  file_name text null,
  mime_type text null,
  file_size bigint null,
  retrieval_mode text not null,
  storage_bucket text null,
  storage_key text null,
  external_url text null,
  source_retrieval_reference text null,
  checksum_sha256 text null,
  is_current boolean not null default true,
  source_updated_at timestamptz null,
  synchronized_at timestamptz null,
  published_at timestamptz null,
  archived_at timestamptz null,
  created_by uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint partner_documents_source_check check (source_system in ('onec', 'portal', 'catalog_projection')),
  constraint partner_documents_type_check check (document_type in (
    'invoice','fiscal_invoice','delivery_note','order_confirmation','proforma','credit_note',
    'payment_document','reconciliation_statement','contract','contract_appendix',
    'warranty_certificate','warranty_terms','service_document','return_or_replacement_document',
    'datasheet','user_manual','installation_manual','certificate','declaration_of_conformity',
    'test_report','technical_drawing','firmware_release_note','price_list','brochure','presentation','marketing_material'
  )),
  constraint partner_documents_status_check check (status in ('available','generating','temporarily_unavailable','archived')),
  constraint partner_documents_language_check check (language_code in ('ru','ro','en','multi')),
  constraint partner_documents_retrieval_check check (retrieval_mode in ('private_storage','external_public','onec_protected','metadata_only')),
  constraint partner_documents_title_check check (char_length(btrim(title)) between 1 and 240),
  constraint partner_documents_version_check check (char_length(btrim(version)) between 1 and 50),
  constraint partner_documents_size_check check (file_size is null or file_size between 0 and 15728640),
  constraint partner_documents_checksum_check check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint partner_documents_safe_metadata_check check (jsonb_typeof(safe_metadata) = 'object'),
  constraint partner_documents_retrieval_fields_check check (
    (retrieval_mode = 'private_storage' and storage_bucket is not null and storage_key is not null and external_url is null)
    or (retrieval_mode = 'external_public' and external_url is not null and storage_bucket is null and storage_key is null)
    or (retrieval_mode = 'onec_protected' and source_retrieval_reference is not null and external_url is null)
    or (retrieval_mode = 'metadata_only' and storage_bucket is null and storage_key is null and external_url is null)
  ),
  unique(source_system, source_document_id)
);

create table public.partner_document_products (
  document_id uuid not null references public.partner_documents(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(document_id, product_id)
);

create table public.partner_document_orders (
  document_id uuid not null references public.partner_documents(id) on delete cascade,
  order_history_id uuid not null references public.partner_order_history(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(document_id, order_history_id)
);

create table public.partner_document_audit_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid null references public.partner_documents(id) on delete set null,
  company_id uuid null references public.partner_companies(id) on delete set null,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  event_type text not null,
  correlation_id uuid not null default gen_random_uuid(),
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint partner_document_audit_event_check check (event_type in ('synchronized','published','replaced','archived','accessed','downloaded','download_failed')),
  constraint partner_document_audit_metadata_check check (jsonb_typeof(safe_metadata) = 'object')
);

create table public.partner_document_sync_state (
  id boolean primary key default true check (id),
  status text not null default 'not_configured',
  provider_status text not null default 'not_implemented',
  active_sync_id uuid null,
  last_started_at timestamptz null,
  last_completed_at timestamptz null,
  last_successful_at timestamptz null,
  pages_processed integer not null default 0,
  rows_received integer not null default 0,
  rows_published integer not null default 0,
  missing_files integer not null default 0,
  failed_retrievals integer not null default 0,
  safe_error_code text null,
  updated_at timestamptz not null default now(),
  constraint partner_document_sync_status_check check (status in ('not_configured','idle','running','succeeded','failed')),
  constraint partner_document_provider_status_check check (provider_status in ('not_implemented','configured','unavailable'))
);
insert into public.partner_document_sync_state(id) values(true) on conflict do nothing;

create index partner_documents_company_date_idx on public.partner_documents(company_id, issue_date desc, created_at desc);
create index partner_documents_type_current_idx on public.partner_documents(document_type, is_current, published_at desc);
create index partner_documents_search_idx on public.partner_documents using gin ((lower(title || ' ' || coalesce(document_number,''))) extensions.gin_trgm_ops);
create index partner_document_products_product_idx on public.partner_document_products(product_id, document_id);
create index partner_document_orders_order_idx on public.partner_document_orders(order_history_id, document_id);
create index partner_document_audit_document_idx on public.partner_document_audit_events(document_id, occurred_at desc);
create unique index partner_documents_portal_checksum_idx on public.partner_documents(checksum_sha256)
  where source_system = 'portal' and checksum_sha256 is not null and archived_at is null;

alter table public.partner_documents enable row level security;
alter table public.partner_document_products enable row level security;
alter table public.partner_document_orders enable row level security;
alter table public.partner_document_audit_events enable row level security;
alter table public.partner_document_sync_state enable row level security;
revoke all on public.partner_documents, public.partner_document_products, public.partner_document_orders,
  public.partner_document_audit_events, public.partner_document_sync_state from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('partner-documents', 'partner-documents', false, 15728640, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.partner_document_permission(p_document_type text)
returns text language sql immutable as $$
  select case
    when p_document_type in ('invoice','fiscal_invoice','credit_note','payment_document','reconciliation_statement') then 'documents.view_accounting'
    when p_document_type in ('delivery_note','order_confirmation','proforma','contract','contract_appendix') then 'documents.view_commercial'
    when p_document_type in ('warranty_certificate','warranty_terms','service_document','return_or_replacement_document','datasheet','user_manual','installation_manual','certificate','declaration_of_conformity','test_report','technical_drawing','firmware_release_note','price_list','brochure','presentation','marketing_material') then 'documents.view_product'
    else null
  end
$$;

create or replace function public.can_access_partner_document(p_document_id uuid, p_company_id uuid, p_download boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partner_documents document
    where document.id = p_document_id
      and document.archived_at is null
      and document.status <> 'archived'
      and (document.company_id is null or document.company_id = p_company_id)
      and public.has_permission(p_company_id, public.partner_document_permission(document.document_type))
      and (not p_download or public.has_permission(p_company_id, 'documents.download'))
  )
$$;

create or replace function public.list_partner_documents(
  p_company_id uuid,
  p_query text default '',
  p_section text default 'all',
  p_document_type text default null,
  p_language text default null,
  p_state text default 'current',
  p_order_history_id uuid default null,
  p_product_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table(
  id uuid, document_type text, title text, document_number text, issue_date date, valid_from date,
  valid_until date, status text, version text, language_code text, file_name text, mime_type text,
  file_size bigint, is_current boolean, source_scope text, related_products jsonb, related_orders jsonb,
  total_count bigint
)
language sql stable security definer set search_path = public as $$
  with input as (
    select lower(btrim(coalesce(p_query,''))) query,
      least(greatest(coalesce(p_page,1),1),100000) page,
      least(greatest(coalesce(p_page_size,20),1),50) page_size
  ), visible as (
    select document.*,
      case when document.company_id is null then 'product_public' else 'company_specific' end source_scope
    from public.partner_documents document, input
    where public.can_access_partner_document(document.id, p_company_id, false)
      and (input.query = '' or lower(document.title || ' ' || coalesce(document.document_number,'') || ' ' || coalesce(document.file_name,'')) like '%' || input.query || '%'
        or exists (select 1 from public.partner_document_products mapping join public.catalog_products product on product.id = mapping.product_id where mapping.document_id = document.id and lower(product.sku || ' ' || product.name) like '%' || input.query || '%')
        or exists (select 1 from public.partner_document_orders mapping join public.partner_order_history history on history.id = mapping.order_history_id where mapping.document_id = document.id and lower(history.external_1c_order_number) like '%' || input.query || '%'))
      and (p_document_type is null or document.document_type = p_document_type)
      and (p_language is null or document.language_code = p_language)
      and (p_state = 'all' or (p_state = 'current' and document.is_current) or (p_state = 'expired' and document.valid_until < current_date) or (p_state = 'superseded' and not document.is_current))
      and (p_order_history_id is null or exists (select 1 from public.partner_document_orders mapping where mapping.document_id = document.id and mapping.order_history_id = p_order_history_id))
      and (p_product_id is null or exists (select 1 from public.partner_document_products mapping where mapping.document_id = document.id and mapping.product_id = p_product_id))
      and (p_section = 'all'
        or (p_section = 'orders' and document.document_type in ('delivery_note','order_confirmation','proforma','invoice','fiscal_invoice','credit_note'))
        or (p_section = 'accounting' and document.document_type in ('invoice','fiscal_invoice','credit_note','payment_document','contract','contract_appendix'))
        or (p_section = 'reconciliation' and document.document_type = 'reconciliation_statement')
        or (p_section = 'warranty' and document.document_type in ('warranty_certificate','warranty_terms','service_document','return_or_replacement_document'))
        or (p_section = 'certificates' and document.document_type in ('certificate','declaration_of_conformity','test_report'))
        or (p_section = 'instructions' and document.document_type in ('datasheet','user_manual','installation_manual','technical_drawing','firmware_release_note'))
        or (p_section = 'marketing' and document.document_type in ('price_list','brochure','presentation','marketing_material')))
  )
  select document.id, document.document_type, document.title, document.document_number, document.issue_date,
    document.valid_from, document.valid_until, document.status, document.version, document.language_code,
    document.file_name, document.mime_type, document.file_size, document.is_current, document.source_scope,
    coalesce((select jsonb_agg(jsonb_build_object('id', product.id, 'sku', product.sku, 'name', product.name, 'slug', product.slug) order by product.name)
      from public.partner_document_products mapping join public.catalog_products product on product.id = mapping.product_id where mapping.document_id = document.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', history.id, 'number', history.external_1c_order_number) order by history.one_c_document_date desc)
      from public.partner_document_orders mapping join public.partner_order_history history on history.id = mapping.order_history_id where mapping.document_id = document.id), '[]'::jsonb),
    count(*) over()
  from visible document, input
  order by document.is_current desc, coalesce(document.issue_date, document.published_at::date, document.created_at::date) desc, document.id
  offset (select (page - 1) * page_size from input) limit (select page_size from input)
$$;

create or replace function public.get_partner_document(p_company_id uuid, p_document_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.can_access_partner_document(p_document_id, p_company_id, false) then (
    select to_jsonb(document) - 'storage_bucket' - 'storage_key' - 'external_url' - 'source_retrieval_reference' - 'safe_metadata'
      || jsonb_build_object(
        'products', coalesce((select jsonb_agg(jsonb_build_object('id',product.id,'sku',product.sku,'name',product.name,'slug',product.slug) order by product.name) from public.partner_document_products mapping join public.catalog_products product on product.id=mapping.product_id where mapping.document_id=document.id),'[]'::jsonb),
        'orders', coalesce((select jsonb_agg(jsonb_build_object('id',history.id,'number',history.external_1c_order_number) order by history.one_c_document_date desc) from public.partner_document_orders mapping join public.partner_order_history history on history.id=mapping.order_history_id where mapping.document_id=document.id),'[]'::jsonb)
      )
    from public.partner_documents document where document.id = p_document_id
  ) else null end
$$;

create or replace function public.authorize_partner_document_download(p_company_id uuid, p_document_id uuid, p_correlation_id uuid)
returns table(document_id uuid, retrieval_mode text, storage_bucket text, storage_key text, external_url text, file_name text, mime_type text, file_size bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_partner_document(p_document_id, p_company_id, true) then
    raise exception 'Document is not available.' using errcode = '42501';
  end if;
  insert into public.partner_document_audit_events(document_id, company_id, actor_user_id, event_type, correlation_id)
  values(p_document_id, p_company_id, auth.uid(), 'accessed', p_correlation_id);
  return query select document.id, document.retrieval_mode, document.storage_bucket, document.storage_key,
    document.external_url, document.file_name, document.mime_type, document.file_size
  from public.partner_documents document where document.id = p_document_id;
end
$$;

create or replace function public.record_partner_document_download(p_company_id uuid, p_document_id uuid, p_correlation_id uuid, p_succeeded boolean, p_safe_error_code text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_partner_document(p_document_id, p_company_id, true) then return; end if;
  insert into public.partner_document_audit_events(document_id, company_id, actor_user_id, event_type, correlation_id, safe_metadata)
  values(p_document_id, p_company_id, auth.uid(), case when p_succeeded then 'downloaded' else 'download_failed' end,
    p_correlation_id, case when p_safe_error_code is null then '{}'::jsonb else jsonb_build_object('errorCode', left(p_safe_error_code,80)) end);
end
$$;

create or replace function public.search_partner_documents(p_company_id uuid, p_query text, p_limit integer default 10)
returns table(document_type text, document_id uuid, title text, subtitle text, safe_metadata jsonb, route text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with input as (select lower(btrim(coalesce(p_query,''))) query, least(greatest(coalesce(p_limit,10),1),20) result_limit)
  select 'document', document.id, document.title,
    concat_ws(' · ', document.document_number, document.file_name),
    jsonb_build_object('documentType',document.document_type,'language',document.language_code,'version',document.version),
    '/cabinet/documents/' || document.id::text, document.updated_at
  from public.partner_documents document, input
  where char_length(input.query) between 2 and 100
    and public.can_access_partner_document(document.id,p_company_id,false)
    and (lower(document.title || ' ' || coalesce(document.document_number,'') || ' ' || coalesce(document.file_name,'')) like '%'||input.query||'%'
      or exists(select 1 from public.partner_document_products mapping join public.catalog_products product on product.id=mapping.product_id where mapping.document_id=document.id and lower(product.sku||' '||product.name) like '%'||input.query||'%'))
  order by case when lower(document.title)=input.query then 0 when lower(document.title) like input.query||'%' then 1 else 2 end, document.updated_at desc
  limit (select result_limit from input)
$$;

create or replace function public.register_portal_product_document(
  p_document_id uuid, p_title text, p_description text, p_document_type text, p_language_code text,
  p_issue_date date, p_valid_from date, p_valid_until date, p_version text, p_file_name text,
  p_mime_type text, p_file_size bigint, p_storage_bucket text, p_storage_key text,
  p_checksum_sha256 text, p_product_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_id uuid; product_id uuid; existing_id uuid;
begin
  if not public.has_internal_permission('documents.manage_product_documents') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_document_type not in ('datasheet','user_manual','installation_manual','certificate','declaration_of_conformity','test_report','technical_drawing','firmware_release_note','warranty_terms','price_list','brochure','presentation','marketing_material') then raise exception 'Unsupported document type.' using errcode='23514'; end if;
  if coalesce(cardinality(p_product_ids),0)=0 or cardinality(p_product_ids)>100 then raise exception 'Select products.' using errcode='23514'; end if;
  if p_mime_type <> 'application/pdf' or p_storage_bucket <> 'partner-documents' or p_storage_key !~ ('^portal/'||p_document_id::text||'/[0-9a-f]{64}\\.pdf$') then raise exception 'Invalid file reference.' using errcode='23514'; end if;
  select id into existing_id from public.partner_documents where source_system='portal' and checksum_sha256=p_checksum_sha256 and archived_at is null limit 1;
  if existing_id is not null then
    insert into public.partner_document_products(document_id,product_id) select existing_id,id from public.catalog_products where id=any(p_product_ids) and is_active and is_visible on conflict do nothing;
    return existing_id;
  end if;
  if (select count(*) from public.catalog_products where id=any(p_product_ids) and is_active and is_visible) <> cardinality(p_product_ids) then raise exception 'Product selection is invalid.' using errcode='23514'; end if;
  update public.partner_documents old_document set is_current=false, updated_at=now()
  where old_document.is_current and old_document.document_type=p_document_type and old_document.language_code=p_language_code
    and exists(select 1 from public.partner_document_products mapping where mapping.document_id=old_document.id and mapping.product_id=any(p_product_ids));
  insert into public.partner_documents(id,source_system,source_document_id,document_type,title,description,issue_date,valid_from,valid_until,version,language_code,file_name,mime_type,file_size,retrieval_mode,storage_bucket,storage_key,checksum_sha256,is_current,published_at,created_by)
  values(p_document_id,'portal',p_document_id::text,p_document_type,btrim(p_title),nullif(btrim(p_description),''),p_issue_date,p_valid_from,p_valid_until,btrim(p_version),p_language_code,p_file_name,p_mime_type,p_file_size,'private_storage',p_storage_bucket,p_storage_key,p_checksum_sha256,true,now(),auth.uid()) returning id into target_id;
  insert into public.partner_document_products(document_id,product_id) select target_id,id from public.catalog_products where id=any(p_product_ids);
  foreach product_id in array p_product_ids loop
    insert into public.catalog_product_documents(product_id,title,document_type,url,sort_order,is_active)
    values(product_id,btrim(p_title),case when p_document_type in ('datasheet','certificate') then p_document_type when p_document_type in ('user_manual','installation_manual') then 'manual' when p_document_type='warranty_terms' then 'warranty' when p_document_type in ('price_list','brochure','presentation','marketing_material') then 'marketing' else 'other' end,'/api/documents/'||target_id::text||'/download',0,true);
  end loop;
  insert into public.partner_document_audit_events(document_id,actor_user_id,event_type,safe_metadata) values(target_id,auth.uid(),'published',jsonb_build_object('productCount',cardinality(p_product_ids),'documentType',p_document_type));
  return target_id;
end
$$;

create or replace function public.archive_portal_product_document(p_document_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_internal_permission('documents.manage_product_documents') then raise exception 'Forbidden' using errcode='42501'; end if;
  update public.partner_documents set status='archived',is_current=false,archived_at=now(),updated_at=now() where id=p_document_id and source_system='portal' and archived_at is null;
  if not found then raise exception 'Document not found.' using errcode='P0002'; end if;
  update public.catalog_product_documents set is_active=false where url='/api/documents/'||p_document_id::text||'/download';
  insert into public.partner_document_audit_events(document_id,actor_user_id,event_type) values(p_document_id,auth.uid(),'archived');
end
$$;

create or replace function public.list_admin_documents(p_query text default '', p_page integer default 1, p_page_size integer default 25)
returns table(id uuid, source_system text, company_name text, document_type text, title text, document_number text, status text, version text, language_code text, file_name text, file_size bigint, issue_date date, valid_until date, is_current boolean, updated_at timestamptz, total_count bigint)
language sql stable security definer set search_path=public as $$
  with input as(select lower(btrim(coalesce(p_query,''))) query,least(greatest(p_page,1),100000) page,least(greatest(p_page_size,1),50) page_size)
  select document.id,document.source_system,company.display_name,document.document_type,document.title,document.document_number,document.status,document.version,document.language_code,document.file_name,document.file_size,document.issue_date,document.valid_until,document.is_current,document.updated_at,count(*) over()
  from public.partner_documents document left join public.partner_companies company on company.id=document.company_id,input
  where public.has_internal_permission('admin.documents.view') and (input.query='' or lower(document.title||' '||coalesce(document.document_number,'')||' '||coalesce(document.file_name,'')) like '%'||input.query||'%')
  order by document.updated_at desc,document.id offset (select (page-1)*page_size from input) limit (select page_size from input)
$$;

create or replace function public.get_admin_document_health()
returns jsonb language sql stable security definer set search_path=public as $$
  select case when public.has_internal_permission('admin.documents.view') then jsonb_build_object(
    'totalMetadata',(select count(*) from public.partner_documents),
    'availableFiles',(select count(*) from public.partner_documents where status='available' and retrieval_mode<>'metadata_only'),
    'missingFiles',(select count(*) from public.partner_documents where status in ('generating','temporarily_unavailable') or retrieval_mode='metadata_only'),
    'expired',(select count(*) from public.partner_documents where valid_until<current_date and archived_at is null),
    'superseded',(select count(*) from public.partner_documents where not is_current and archived_at is null),
    'unlinkedOrderDocuments',(select count(*) from public.partner_documents document where company_id is not null and document_type in ('invoice','fiscal_invoice','delivery_note','order_confirmation','credit_note') and not exists(select 1 from public.partner_document_orders mapping where mapping.document_id=document.id)),
    'unlinkedProductDocuments',(select count(*) from public.partner_documents document where document_type in ('datasheet','user_manual','installation_manual','certificate','declaration_of_conformity','test_report','technical_drawing','firmware_release_note') and not exists(select 1 from public.partner_document_products mapping where mapping.document_id=document.id)),
    'downloadFailures',(select count(*) from public.partner_document_audit_events where event_type='download_failed' and occurred_at>now()-interval '30 days'),
    'syncState',(select to_jsonb(state) from public.partner_document_sync_state state where id=true)
  ) else null end
$$;

create or replace function public.get_document_builder_products(p_query text default '')
returns table(id uuid, sku text, name text) language sql stable security definer set search_path=public as $$
  select product.id,product.sku,product.name from public.catalog_products product
  where public.has_internal_permission('documents.manage_product_documents') and product.is_active and product.is_visible
    and (btrim(p_query)='' or product.sku ilike '%'||btrim(p_query)||'%' or product.name ilike '%'||btrim(p_query)||'%')
  order by product.name limit 100
$$;

-- Existing catalog references become searchable document metadata without moving or copying files.
insert into public.partner_documents(source_system,source_document_id,document_type,title,status,version,language_code,file_name,retrieval_mode,external_url,is_current,published_at,created_at,updated_at)
select 'catalog_projection','catalog:'||source.id::text,
  case source.document_type when 'manual' then 'user_manual' when 'warranty' then 'warranty_terms' when 'marketing' then 'marketing_material' when 'other' then 'datasheet' else source.document_type end,
  source.title,case when source.is_active then 'available' else 'archived' end,'1','multi',source.title,'external_public',source.url,source.is_active,source.created_at,source.created_at,source.created_at
from public.catalog_product_documents source
where source.url not like '/api/documents/%/download'
on conflict(source_system,source_document_id) do nothing;

insert into public.partner_document_products(document_id,product_id)
select document.id,source.product_id from public.catalog_product_documents source
join public.partner_documents document on document.source_system='catalog_projection' and document.source_document_id='catalog:'||source.id::text
where source.url not like '/api/documents/%/download'
on conflict do nothing;

create or replace function public.project_catalog_product_document()
returns trigger language plpgsql security definer set search_path=public as $$
declare target_id uuid;
begin
  if tg_op='DELETE' then
    update public.partner_documents set status='archived',is_current=false,archived_at=now(),updated_at=now() where source_system='catalog_projection' and source_document_id='catalog:'||old.id::text;
    return old;
  end if;
  if new.url like '/api/documents/%/download' then
    delete from public.partner_documents where source_system='catalog_projection' and source_document_id='catalog:'||new.id::text;
    return new;
  end if;
  insert into public.partner_documents(source_system,source_document_id,document_type,title,status,version,language_code,file_name,retrieval_mode,external_url,is_current,published_at,created_at,updated_at)
  values('catalog_projection','catalog:'||new.id::text,case new.document_type when 'manual' then 'user_manual' when 'warranty' then 'warranty_terms' when 'marketing' then 'marketing_material' when 'other' then 'datasheet' else new.document_type end,new.title,case when new.is_active then 'available' else 'archived' end,'1','multi',new.title,'external_public',new.url,new.is_active,new.created_at,new.created_at,now())
  on conflict(source_system,source_document_id) do update set title=excluded.title,document_type=excluded.document_type,status=excluded.status,external_url=excluded.external_url,is_current=excluded.is_current,updated_at=now(),archived_at=case when excluded.is_current then null else now() end
  returning id into target_id;
  insert into public.partner_document_products(document_id,product_id) values(target_id,new.product_id) on conflict do nothing;
  return new;
end
$$;

create trigger project_catalog_product_document_after_write after insert or update or delete on public.catalog_product_documents for each row execute function public.project_catalog_product_document();

revoke all on function public.partner_document_permission(text), public.can_access_partner_document(uuid,uuid,boolean), public.project_catalog_product_document() from public,anon,authenticated;
revoke all on function public.list_partner_documents(uuid,text,text,text,text,text,uuid,uuid,integer,integer), public.get_partner_document(uuid,uuid), public.authorize_partner_document_download(uuid,uuid,uuid), public.record_partner_document_download(uuid,uuid,uuid,boolean,text), public.search_partner_documents(uuid,text,integer), public.register_portal_product_document(uuid,text,text,text,text,date,date,date,text,text,text,bigint,text,text,text,uuid[]), public.archive_portal_product_document(uuid), public.list_admin_documents(text,integer,integer), public.get_admin_document_health(), public.get_document_builder_products(text) from public,anon;
grant execute on function public.list_partner_documents(uuid,text,text,text,text,text,uuid,uuid,integer,integer), public.get_partner_document(uuid,uuid), public.authorize_partner_document_download(uuid,uuid,uuid), public.record_partner_document_download(uuid,uuid,uuid,boolean,text), public.search_partner_documents(uuid,text,integer), public.register_portal_product_document(uuid,text,text,text,text,date,date,date,text,text,text,bigint,text,text,text,uuid[]), public.archive_portal_product_document(uuid), public.list_admin_documents(text,integer,integer), public.get_admin_document_health(), public.get_document_builder_products(text) to authenticated;

comment on table public.partner_documents is 'Canonical safe document metadata. 1C remains authoritative for accounting documents; retrieval references never leave protected server RPCs.';
comment on table public.partner_document_audit_events is 'Append-only document access and lifecycle audit without document contents or confidential amounts.';
comment on table public.partner_document_sync_state is 'Independent document synchronization health. It cannot block catalog, price, stock, finance, or order synchronization.';

-- Document activity is governed alongside the existing behavior and notification catalogs.
alter table public.partner_behavior_events drop constraint if exists partner_behavior_event_name_check;
alter table public.partner_behavior_events add constraint partner_behavior_event_name_check check (event_name = any(array[
  'catalog_viewed','category_viewed','search_performed','search_no_results','filters_applied','merchandising_section_viewed','merchandising_product_clicked','product_viewed','product_pricing_tab_viewed','retail_price_history_range_changed','retail_price_history_data_opened','product_document_downloaded','stock_state_viewed','arrival_date_viewed','product_added_to_favorites','product_removed_from_favorites','product_added_to_compare','product_removed_from_compare','product_added_to_cart','product_removed_from_cart','cart_quantity_changed','product_added_to_estimate','estimate_created','proposal_generated','order_submitted','reorder_started','reorder_submitted','out_of_stock_product_viewed','unavailable_product_added','arrival_interest_viewed','dashboard_viewed','dashboard_action_clicked','partner_dashboard_viewed','dashboard_attention_opened','dashboard_quick_action_clicked','dashboard_order_opened','dashboard_shipment_opened','dashboard_continue_work_clicked','dashboard_reorder_product_added','dashboard_finance_opened','dashboard_offer_opened','dashboard_company_opened','product_overview_viewed','product_description_viewed','product_characteristics_viewed','product_datasheet_viewed','order_list_viewed','order_opened','shipment_viewed','date_change_started','finance_viewed','company_users_viewed','estimates_viewed','estimate_product_added','estimate_service_added','estimate_price_check_started','estimate_price_check_applied','proposal_created','proposal_version_created','proposal_previewed','proposal_pdf_generated','proposal_sent','proposal_send_failed','proposal_converted_to_order','notifications_opened','notification_opened','notification_marked_read','notifications_marked_all_read','notification_dismissed','notification_preferences_updated','product_notification_opened','product_notification_product_opened','product_notification_cart_opened','purchase_templates_opened','purchase_template_created','purchase_template_opened','purchase_template_edited','purchase_template_copied','purchase_template_archived','purchase_template_previewed','purchase_template_added_to_cart','purchase_template_created_from_cart','purchase_template_created_from_order','purchase_template_created_from_list','opportunities_opened','opportunity_viewed','opportunity_product_opened','opportunity_template_opened','opportunity_added_to_cart','opportunity_dismissed','opportunity_repeat_started','documents_opened','document_opened','document_downloaded','document_search_submitted','document_filter_used'
]));

alter table public.partner_notification_events drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events add constraint partner_notification_events_code_check check (event_code in (
  'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring'
));
alter table public.partner_notifications drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications add constraint partner_notifications_event_code_check check (event_code in (
  'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring'
));
alter table public.partner_notification_events drop constraint if exists partner_notification_events_group_check;
alter table public.partner_notification_events add constraint partner_notification_events_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents'));
alter table public.partner_notifications drop constraint if exists partner_notifications_group_check;
alter table public.partner_notifications add constraint partner_notifications_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents'));
alter table public.partner_notification_preferences drop constraint if exists partner_notification_preferences_group_check;
alter table public.partner_notification_preferences add constraint partner_notification_preferences_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents'));
alter table public.partner_notification_preferences drop constraint if exists partner_notification_preferences_mandatory_check;
alter table public.partner_notification_preferences add constraint partner_notification_preferences_mandatory_check check(event_group in ('products','documents') or in_app_enabled);

create or replace function public.get_partner_notification_preferences(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public set row_security=off as $$
begin
  if not public.has_active_notification_membership(p_company_id,auth.uid()) then raise exception 'Notification access denied.' using errcode='42501'; end if;
  return (
    select jsonb_agg(jsonb_build_object('eventGroup',groups.event_group,'inAppEnabled',coalesce(preference.in_app_enabled,true),'emailEnabled',coalesce(preference.email_enabled,false),'deliveryMode',coalesce(preference.delivery_mode,'immediate')) order by groups.ordinality)
    from unnest(array['orders','shipments','company_access','products','documents']) with ordinality groups(event_group,ordinality)
    left join public.partner_notification_preferences preference on preference.company_id=p_company_id and preference.user_id=auth.uid() and preference.event_group=groups.event_group
  );
end
$$;

create or replace function public.set_partner_notification_preference(p_company_id uuid,p_event_group text,p_in_app_enabled boolean,p_email_enabled boolean,p_delivery_mode text)
returns public.partner_notification_preferences language plpgsql security definer set search_path=public set row_security=off as $$
declare saved public.partner_notification_preferences;
begin
  if not public.has_active_notification_membership(p_company_id,auth.uid()) then raise exception 'Notification access denied.' using errcode='42501'; end if;
  if p_event_group not in ('orders','shipments','company_access','products','documents') or p_delivery_mode not in ('immediate','daily','off') or p_email_enabled
    or (p_event_group not in ('products','documents') and (not p_in_app_enabled or p_delivery_mode='off'))
    or (p_event_group in ('products','documents') and p_in_app_enabled<>(p_delivery_mode<>'off')) then
    raise exception 'Notification preference is invalid.' using errcode='22023';
  end if;
  insert into public.partner_notification_preferences(company_id,user_id,event_group,in_app_enabled,email_enabled,delivery_mode,updated_at)
  values(p_company_id,auth.uid(),p_event_group,p_in_app_enabled,false,p_delivery_mode,now())
  on conflict(company_id,user_id,event_group) do update set in_app_enabled=excluded.in_app_enabled,email_enabled=false,delivery_mode=excluded.delivery_mode,updated_at=now()
  returning * into saved;
  return saved;
end
$$;

commit;
