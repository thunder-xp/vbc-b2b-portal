begin;

alter table public.partner_companies
  add column if not exists logo_asset_path text null;

comment on column public.partner_companies.logo_asset_path is
  'Portal-owned company logo object path. Company master data remains in 1C.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.set_partner_company_logo(
  p_company_id uuid,
  p_logo_asset_path text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_path text := nullif(btrim(p_logo_asset_path), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if target_path is not null and target_path !~ ('^' || p_company_id::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$') then
    raise exception 'Company logo path is invalid.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.company_memberships membership
    join public.roles role on role.id = membership.role_id
    join public.user_profiles profile on profile.id = membership.user_id
    join public.partner_companies company on company.id = membership.company_id
    where membership.user_id = auth.uid()
      and membership.company_id = p_company_id
      and membership.status = 'active'
      and role.code = 'partner_owner'
      and profile.status = 'active'
      and company.status = 'active'
  ) then
    raise exception 'Company logo management denied.' using errcode = '42501';
  end if;

  update public.partner_companies
  set logo_asset_path = target_path
  where id = p_company_id;

  if not found then
    raise exception 'Company not found.' using errcode = 'P0002';
  end if;

  return target_path;
end;
$$;

revoke all on function public.set_partner_company_logo(uuid, text) from public, anon;
grant execute on function public.set_partner_company_logo(uuid, text) to authenticated;

create extension if not exists pg_trgm with schema extensions;

create table public.partner_search_documents (
  document_key text primary key,
  document_type text not null,
  document_id uuid not null,
  company_id uuid null references public.partner_companies(id) on delete cascade,
  owner_user_id uuid null references public.user_profiles(id) on delete cascade,
  title text not null,
  subtitle text null,
  search_text text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  route text not null,
  updated_at timestamptz not null default now(),
  constraint partner_search_documents_type_check check (
    document_type in ('product', 'purchasing_list', 'estimate', 'proposal', 'manual_line', 'template')
  ),
  constraint partner_search_documents_scope_check check (
    (document_type = 'product' and company_id is null)
    or (document_type <> 'product' and company_id is not null)
  ),
  constraint partner_search_documents_metadata_check check (jsonb_typeof(safe_metadata) = 'object'),
  constraint partner_search_documents_route_check check (route like '/cabinet/%')
);

comment on table public.partner_search_documents is
  'Permission-aware local partner workspace search projection. Contains no prices, margins, customer contact details, or 1C references.';

create index partner_search_documents_company_type_updated_idx
  on public.partner_search_documents(company_id, document_type, updated_at desc);
create index partner_search_documents_owner_idx
  on public.partner_search_documents(owner_user_id)
  where owner_user_id is not null;
create index partner_search_documents_text_trgm_idx
  on public.partner_search_documents using gin ((lower(search_text)) extensions.gin_trgm_ops);

alter table public.partner_search_documents enable row level security;
revoke all on public.partner_search_documents from public, anon, authenticated;

create or replace function public.project_partner_search_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or not new.is_active or not new.is_visible then
    delete from public.partner_search_documents
    where document_key = 'product:' || coalesce(new.id, old.id)::text;
    return coalesce(new, old);
  end if;

  insert into public.partner_search_documents (
    document_key, document_type, document_id, title, subtitle, search_text,
    safe_metadata, route, updated_at
  ) values (
    'product:' || new.id::text, 'product', new.id, new.name, 'SKU ' || new.sku,
    concat_ws(' ', new.sku, new.name, new.short_description),
    jsonb_build_object('sku', new.sku), '/cabinet/catalog/' || new.slug, new.updated_at
  )
  on conflict (document_key) do update set
    title = excluded.title,
    subtitle = excluded.subtitle,
    search_text = excluded.search_text,
    safe_metadata = excluded.safe_metadata,
    route = excluded.route,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function public.project_partner_search_purchasing_list()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or new.archived_at is not null then
    delete from public.partner_search_documents
    where document_key = 'purchasing_list:' || coalesce(new.id, old.id)::text;
    return coalesce(new, old);
  end if;

  insert into public.partner_search_documents (
    document_key, document_type, document_id, company_id, owner_user_id,
    title, subtitle, search_text, safe_metadata, route, updated_at
  ) values (
    'purchasing_list:' || new.id::text, 'purchasing_list', new.id, new.company_id,
    new.created_by, new.name, 'Список закупок', concat_ws(' ', new.name, new.description),
    jsonb_build_object('visibility', new.visibility),
    '/cabinet/purchasing-lists/' || new.id::text, new.updated_at
  )
  on conflict (document_key) do update set
    company_id = excluded.company_id,
    owner_user_id = excluded.owner_user_id,
    title = excluded.title,
    subtitle = excluded.subtitle,
    search_text = excluded.search_text,
    safe_metadata = excluded.safe_metadata,
    route = excluded.route,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function public.project_partner_search_estimate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or new.archived_at is not null then
    delete from public.partner_search_documents
    where document_key = 'estimate:' || coalesce(new.id, old.id)::text;
    return coalesce(new, old);
  end if;

  insert into public.partner_search_documents (
    document_key, document_type, document_id, company_id, owner_user_id,
    title, subtitle, search_text, safe_metadata, route, updated_at
  ) values (
    'estimate:' || new.id::text, 'estimate', new.id, new.company_id, new.created_by,
    new.name, new.estimate_number,
    concat_ws(' ', new.estimate_number, new.name, new.customer_name, new.project_name),
    jsonb_build_object('status', new.status), '/cabinet/estimates/' || new.id::text, new.updated_at
  )
  on conflict (document_key) do update set
    company_id = excluded.company_id,
    owner_user_id = excluded.owner_user_id,
    title = excluded.title,
    subtitle = excluded.subtitle,
    search_text = excluded.search_text,
    safe_metadata = excluded.safe_metadata,
    route = excluded.route,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function public.project_partner_search_estimate_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_estimate public.estimates;
  target_id uuid := coalesce(new.id, old.id);
begin
  if tg_op = 'DELETE' or new.line_type not in ('service', 'custom') then
    delete from public.partner_search_documents where document_key = 'manual_line:' || target_id::text;
    return coalesce(new, old);
  end if;

  select * into target_estimate from public.estimates where id = new.estimate_id;
  if target_estimate.id is null or target_estimate.archived_at is not null then
    delete from public.partner_search_documents where document_key = 'manual_line:' || target_id::text;
    return new;
  end if;

  insert into public.partner_search_documents (
    document_key, document_type, document_id, company_id, owner_user_id,
    title, subtitle, search_text, safe_metadata, route, updated_at
  ) values (
    'manual_line:' || new.id::text, 'manual_line', new.id, target_estimate.company_id,
    target_estimate.created_by, new.description,
    'Строка сметы · ' || target_estimate.estimate_number,
    concat_ws(' ', new.description, target_estimate.estimate_number, target_estimate.name),
    jsonb_build_object('estimateId', target_estimate.id),
    '/cabinet/estimates/' || target_estimate.id::text, new.updated_at
  )
  on conflict (document_key) do update set
    title = excluded.title,
    subtitle = excluded.subtitle,
    search_text = excluded.search_text,
    safe_metadata = excluded.safe_metadata,
    route = excluded.route,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function public.project_partner_search_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or new.archived_at is not null then
    delete from public.partner_search_documents
    where document_key = 'proposal:' || coalesce(new.id, old.id)::text;
    return coalesce(new, old);
  end if;

  insert into public.partner_search_documents (
    document_key, document_type, document_id, company_id, owner_user_id,
    title, subtitle, search_text, safe_metadata, route, updated_at
  ) values (
    'proposal:' || new.id::text, 'proposal', new.id, new.company_id, new.created_by,
    new.estimate_number || ' · версия ' || new.version_number::text,
    'Коммерческое предложение',
    concat_ws(' ', new.estimate_number, 'версия ' || new.version_number::text),
    jsonb_build_object('status', new.status, 'versionNumber', new.version_number),
    '/cabinet/estimates/' || new.estimate_id::text, new.created_at
  )
  on conflict (document_key) do update set
    title = excluded.title,
    subtitle = excluded.subtitle,
    search_text = excluded.search_text,
    safe_metadata = excluded.safe_metadata,
    route = excluded.route,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create trigger project_partner_search_product_after_write
after insert or update or delete on public.catalog_products
for each row execute function public.project_partner_search_product();
create trigger project_partner_search_list_after_write
after insert or update or delete on public.purchasing_lists
for each row execute function public.project_partner_search_purchasing_list();
create trigger project_partner_search_estimate_after_write
after insert or update or delete on public.estimates
for each row execute function public.project_partner_search_estimate();
create trigger project_partner_search_estimate_item_after_write
after insert or update or delete on public.estimate_items
for each row execute function public.project_partner_search_estimate_item();
create trigger project_partner_search_proposal_after_write
after insert or update or delete on public.estimate_versions
for each row execute function public.project_partner_search_proposal();

insert into public.partner_search_documents (
  document_key, document_type, document_id, title, subtitle, search_text,
  safe_metadata, route, updated_at
)
select 'product:' || product.id::text, 'product', product.id, product.name,
  'SKU ' || product.sku, concat_ws(' ', product.sku, product.name, product.short_description),
  jsonb_build_object('sku', product.sku), '/cabinet/catalog/' || product.slug, product.updated_at
from public.catalog_products product
where product.is_active and product.is_visible
on conflict (document_key) do nothing;

insert into public.partner_search_documents (
  document_key, document_type, document_id, company_id, owner_user_id,
  title, subtitle, search_text, safe_metadata, route, updated_at
)
select 'purchasing_list:' || list.id::text, 'purchasing_list', list.id, list.company_id,
  list.created_by, list.name, 'Список закупок', concat_ws(' ', list.name, list.description),
  jsonb_build_object('visibility', list.visibility), '/cabinet/purchasing-lists/' || list.id::text, list.updated_at
from public.purchasing_lists list where list.archived_at is null
on conflict (document_key) do nothing;

insert into public.partner_search_documents (
  document_key, document_type, document_id, company_id, owner_user_id,
  title, subtitle, search_text, safe_metadata, route, updated_at
)
select 'estimate:' || estimate.id::text, 'estimate', estimate.id, estimate.company_id,
  estimate.created_by, estimate.name, estimate.estimate_number,
  concat_ws(' ', estimate.estimate_number, estimate.name, estimate.customer_name, estimate.project_name),
  jsonb_build_object('status', estimate.status), '/cabinet/estimates/' || estimate.id::text, estimate.updated_at
from public.estimates estimate where estimate.archived_at is null
on conflict (document_key) do nothing;

insert into public.partner_search_documents (
  document_key, document_type, document_id, company_id, owner_user_id,
  title, subtitle, search_text, safe_metadata, route, updated_at
)
select 'manual_line:' || item.id::text, 'manual_line', item.id, estimate.company_id,
  estimate.created_by, item.description, 'Строка сметы · ' || estimate.estimate_number,
  concat_ws(' ', item.description, estimate.estimate_number, estimate.name),
  jsonb_build_object('estimateId', estimate.id), '/cabinet/estimates/' || estimate.id::text, item.updated_at
from public.estimate_items item
join public.estimates estimate on estimate.id = item.estimate_id
where item.line_type in ('service', 'custom') and estimate.archived_at is null
on conflict (document_key) do nothing;

insert into public.partner_search_documents (
  document_key, document_type, document_id, company_id, owner_user_id,
  title, subtitle, search_text, safe_metadata, route, updated_at
)
select 'proposal:' || version.id::text, 'proposal', version.id, version.company_id,
  version.created_by, version.estimate_number || ' · версия ' || version.version_number::text,
  'Коммерческое предложение', concat_ws(' ', version.estimate_number, 'версия ' || version.version_number::text),
  jsonb_build_object('status', version.status, 'versionNumber', version.version_number),
  '/cabinet/estimates/' || version.estimate_id::text, version.created_at
from public.estimate_versions version where version.archived_at is null
on conflict (document_key) do nothing;

create or replace function public.search_partner_workspace(
  p_company_id uuid,
  p_query text,
  p_limit integer default 40
)
returns table (
  document_type text,
  document_id uuid,
  title text,
  subtitle text,
  safe_metadata jsonb,
  route text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select lower(btrim(coalesce(p_query, ''))) as query,
      least(greatest(coalesce(p_limit, 40), 1), 50) as result_limit
  )
  select document.document_type, document.document_id, document.title,
    document.subtitle, document.safe_metadata, document.route, document.updated_at
  from public.partner_search_documents document
  cross join input
  where char_length(input.query) between 2 and 100
    and position(input.query in lower(document.search_text)) > 0
    and (
      (document.document_type = 'product'
        and document.company_id is null
        and public.has_permission(p_company_id, 'catalog.view'))
      or
      (document.document_type = 'purchasing_list'
        and document.company_id = p_company_id
        and public.has_permission(p_company_id, 'purchasing_lists.view')
        and (document.safe_metadata->>'visibility' = 'company' or document.owner_user_id = auth.uid()))
      or
      (document.document_type in ('estimate', 'proposal', 'manual_line', 'template')
        and document.company_id = p_company_id
        and public.can_access_estimates(p_company_id, 'estimates.view'))
    )
  order by
    case when lower(document.title) = input.query then 0
      when lower(document.title) like input.query || '%' then 1 else 2 end,
    document.updated_at desc,
    document.document_key
  limit (select result_limit from input);
$$;

revoke all on function public.search_partner_workspace(uuid, text, integer) from public, anon;
grant execute on function public.search_partner_workspace(uuid, text, integer) to authenticated;

commit;
