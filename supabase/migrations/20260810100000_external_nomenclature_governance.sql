-- Governed shared external nomenclature and private bounded cover media.

insert into public.permissions (code, description, scope, delegable_by_partner_owner, sensitive, category)
values
  ('admin.external_nomenclature.view', 'View governed partner-created nomenclature.', 'internal', false, true, 'admin'),
  ('admin.external_nomenclature.manage', 'Curate partner-created nomenclature and canonical covers.', 'internal', false, true, 'admin')
on conflict (code) do update set description = excluded.description, scope = excluded.scope,
  delegable_by_partner_owner = excluded.delegable_by_partner_owner, sensitive = excluded.sensitive, category = excluded.category;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in ('admin.external_nomenclature.view', 'admin.external_nomenclature.manage')
where role.code = 'novotech_admin'
on conflict do nothing;

alter table public.external_nomenclature_items
  add column if not exists curation_status text not null default 'review_required',
  add column if not exists version integer not null default 0,
  add column if not exists canonical_cover_storage_key text null,
  add column if not exists canonical_cover_size_bytes integer null,
  add column if not exists canonical_cover_width integer null,
  add column if not exists canonical_cover_height integer null,
  add column if not exists canonical_cover_updated_at timestamptz null,
  add column if not exists canonical_cover_updated_by uuid null references public.user_profiles(id) on delete restrict;

update public.external_nomenclature_items
set curation_status = case
  when canonical_item_id is not null then 'duplicate'
  when not is_active then 'archived'
  else 'review_required'
end;

alter table public.external_nomenclature_items
  drop constraint if exists external_nomenclature_curation_status_check,
  add constraint external_nomenclature_curation_status_check check (curation_status in ('active', 'review_required', 'duplicate', 'archived')),
  drop constraint if exists external_nomenclature_version_check,
  add constraint external_nomenclature_version_check check (version >= 0),
  drop constraint if exists external_nomenclature_canonical_cover_shape_check,
  add constraint external_nomenclature_canonical_cover_shape_check check (
    (canonical_cover_storage_key is null and canonical_cover_size_bytes is null and canonical_cover_width is null and canonical_cover_height is null and canonical_cover_updated_at is null and canonical_cover_updated_by is null)
    or (canonical_cover_storage_key ~ '^canonical/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$'
      and canonical_cover_size_bytes between 1 and 262144
      and canonical_cover_width between 1 and 512 and canonical_cover_height between 1 and 512
      and canonical_cover_updated_at is not null and canonical_cover_updated_by is not null)
  );

alter table public.partner_external_nomenclature_library
  add column if not exists cover_storage_key text null,
  add column if not exists cover_size_bytes integer null,
  add column if not exists cover_width integer null,
  add column if not exists cover_height integer null,
  add column if not exists cover_updated_at timestamptz null,
  add column if not exists cover_updated_by uuid null references public.user_profiles(id) on delete restrict;

alter table public.partner_external_nomenclature_library
  drop constraint if exists partner_external_nomenclature_cover_shape_check,
  add constraint partner_external_nomenclature_cover_shape_check check (
    (cover_storage_key is null and cover_size_bytes is null and cover_width is null and cover_height is null and cover_updated_at is null and cover_updated_by is null)
    or (cover_storage_key ~ '^partner/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$'
      and cover_size_bytes between 1 and 262144
      and cover_width between 1 and 512 and cover_height between 1 and 512
      and cover_updated_at is not null and cover_updated_by is not null)
  );

create index if not exists external_nomenclature_admin_list_idx
  on public.external_nomenclature_items(curation_status, item_type, updated_at desc, id);
create index if not exists external_nomenclature_admin_category_idx
  on public.external_nomenclature_items(category, id) where canonical_item_id is null;
create index if not exists external_nomenclature_admin_manufacturer_idx
  on public.external_nomenclature_items(manufacturer, id) where canonical_item_id is null;

create table if not exists public.external_nomenclature_governance_events (
  id uuid primary key default gen_random_uuid(),
  external_nomenclature_id uuid not null references public.external_nomenclature_items(id) on delete restrict,
  canonical_item_id uuid null references public.external_nomenclature_items(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('canonical_edited', 'canonicalized', 'duplicate_redirected', 'archived', 'restored', 'canonical_cover_uploaded', 'canonical_cover_replaced', 'canonical_cover_removed')),
  reason text null check (reason is null or char_length(btrim(reason)) between 10 and 1000),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists external_nomenclature_governance_events_item_idx
  on public.external_nomenclature_governance_events(external_nomenclature_id, created_at desc, id);
alter table public.external_nomenclature_governance_events enable row level security;
revoke all on table public.external_nomenclature_governance_events from public, anon, authenticated;

create or replace function public.prevent_external_nomenclature_governance_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'External nomenclature governance events are immutable.' using errcode = '42501'; end;
$$;
drop trigger if exists external_nomenclature_governance_events_immutable on public.external_nomenclature_governance_events;
create trigger external_nomenclature_governance_events_immutable before update or delete on public.external_nomenclature_governance_events
for each row execute function public.prevent_external_nomenclature_governance_event_mutation();

alter table public.partner_external_nomenclature_events drop constraint if exists partner_external_nomenclature_event_type_check;
alter table public.partner_external_nomenclature_events add constraint partner_external_nomenclature_event_type_check check (
  event_type in ('created', 'adopted', 'reactivated', 'updated', 'archived', 'used', 'cover_uploaded', 'cover_replaced', 'cover_removed')
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('partner-nomenclature-covers', 'partner-nomenclature-covers', false, 262144, array['image/webp'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.list_partner_external_nomenclature_v2(
  target_company_id uuid, search_query text default null, target_item_type text default null,
  result_limit integer default 25, result_offset integer default 0
) returns table (
  id uuid, item_type text, manufacturer text, model text, name text, category text, unit text, specification text,
  curation_status text, has_cover boolean, cover_scope text, last_used_at timestamptz, created_at timestamptz, version integer, total_count bigint
) language plpgsql stable security definer set search_path = public as $$
declare normalized_query text := public.normalize_external_nomenclature_text(coalesce(search_query, ''));
  bounded_limit integer := least(greatest(coalesce(result_limit, 25), 1), 50);
  bounded_offset integer := least(greatest(coalesce(result_offset, 0), 0), 10000);
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.view') then raise exception 'Nomenclature library is not available.' using errcode = '42501'; end if;
  if target_item_type is not null and target_item_type not in ('equipment', 'material', 'service') then raise exception 'Nomenclature type is invalid.' using errcode = '22023'; end if;
  return query select item.id, item.item_type, item.manufacturer, item.model,
    coalesce(library.display_name_override, item.name), coalesce(library.category_override, item.category),
    coalesce(library.unit_override, item.unit), coalesce(library.specification_override, item.specification),
    item.curation_status,
    (item.canonical_cover_storage_key is not null or (item.curation_status = 'review_required' and library.cover_storage_key is not null)),
    case when item.canonical_cover_storage_key is not null then 'canonical' when item.curation_status = 'review_required' and library.cover_storage_key is not null then 'partner' else null end,
    library.last_used_at, library.created_at, library.version, count(*) over()
  from public.partner_external_nomenclature_library library join public.external_nomenclature_items item on item.id = library.external_nomenclature_id
  where library.company_id = target_company_id and library.status = 'active' and item.is_active and item.canonical_item_id is null
    and (target_item_type is null or item.item_type = target_item_type)
    and (normalized_query = '' or item.normalized_manufacturer like '%' || normalized_query || '%' or item.normalized_model like '%' || normalized_query || '%'
      or item.normalized_name like '%' || normalized_query || '%' or public.normalize_external_nomenclature_text(coalesce(library.display_name_override, '')) like '%' || normalized_query || '%')
  order by library.last_used_at desc nulls last, coalesce(library.display_name_override, item.name), item.id
  limit bounded_limit offset bounded_offset;
end; $$;

create or replace function public.search_external_nomenclature_v2(
  target_company_id uuid, search_query text, target_item_type text, search_scope text default 'own', result_limit integer default 8
) returns table (
  id uuid, item_type text, manufacturer text, model text, name text, category text, unit text, specification text,
  curation_status text, has_cover boolean, cover_scope text, exact_identity_match boolean
) language plpgsql stable security definer set search_path = public as $$
declare normalized_query text := public.normalize_external_nomenclature_text(coalesce(search_query, ''));
  bounded_limit integer := least(greatest(coalesce(result_limit, 8), 1), 12);
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.view') then raise exception 'Nomenclature library is not available.' using errcode = '42501'; end if;
  if target_item_type not in ('equipment', 'material', 'service') or search_scope not in ('own', 'shared') then raise exception 'Nomenclature search is invalid.' using errcode = '22023'; end if;
  if char_length(normalized_query) < 2 then return; end if;
  return query
  select item.id, item.item_type, item.manufacturer, item.model,
    case when search_scope = 'own' then coalesce(library.display_name_override, item.name) else item.name end,
    case when search_scope = 'own' then coalesce(library.category_override, item.category) else item.category end,
    case when search_scope = 'own' then coalesce(library.unit_override, item.unit) else item.unit end,
    case when search_scope = 'own' then coalesce(library.specification_override, item.specification) else item.specification end,
    item.curation_status,
    (item.canonical_cover_storage_key is not null or (search_scope = 'own' and item.curation_status = 'review_required' and library.cover_storage_key is not null)),
    case when item.canonical_cover_storage_key is not null then 'canonical' when search_scope = 'own' and item.curation_status = 'review_required' and library.cover_storage_key is not null then 'partner' else null end,
    case when item.item_type = 'service' then item.normalized_name = normalized_query else item.normalized_manufacturer || item.normalized_model = normalized_query end
  from public.external_nomenclature_items item
  left join public.partner_external_nomenclature_library library on library.company_id = target_company_id and library.external_nomenclature_id = item.id and library.status = 'active'
  where item.is_active and item.canonical_item_id is null and item.item_type = target_item_type
    and ((search_scope = 'own' and library.company_id is not null) or (search_scope = 'shared' and item.curation_status = 'active' and library.company_id is null))
    and (item.normalized_manufacturer like '%' || normalized_query || '%' or item.normalized_model like '%' || normalized_query || '%'
      or item.normalized_name like '%' || normalized_query || '%' or item.normalized_manufacturer || item.normalized_model || item.normalized_name like '%' || normalized_query || '%')
  order by (case when item.item_type = 'service' then item.normalized_name = normalized_query else item.normalized_manufacturer || item.normalized_model = normalized_query end) desc,
    extensions.similarity(item.normalized_manufacturer || ' ' || item.normalized_model || ' ' || item.normalized_name, normalized_query) desc, item.name, item.id
  limit bounded_limit;
end; $$;

create or replace function public.set_partner_external_nomenclature_cover(
  target_company_id uuid, target_external_nomenclature_id uuid, expected_version integer,
  target_storage_key text, target_size_bytes integer, target_width integer, target_height integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare library public.partner_external_nomenclature_library; item public.external_nomenclature_items; next_version integer; event_name text;
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.manage') then raise exception 'Nomenclature library is not available.' using errcode = '42501'; end if;
  select * into item from public.external_nomenclature_items where id = target_external_nomenclature_id and is_active and canonical_item_id is null for share;
  if item.id is null or item.item_type = 'service' or item.curation_status <> 'review_required' or item.canonical_cover_storage_key is not null then raise exception 'Partner cover cannot be changed for this identity.' using errcode = '42501'; end if;
  if target_storage_key is not null and (target_storage_key !~ ('^partner/' || target_company_id::text || '/' || target_external_nomenclature_id::text || '/[0-9a-f-]{36}\\.webp$')
    or target_size_bytes not between 1 and 262144 or target_width not between 1 and 512 or target_height not between 1 and 512) then raise exception 'Cover metadata is invalid.' using errcode = '22023'; end if;
  select * into library from public.partner_external_nomenclature_library where company_id = target_company_id and external_nomenclature_id = target_external_nomenclature_id and status = 'active' for update;
  if library.company_id is null then raise exception 'Nomenclature item was not found.' using errcode = 'P0002'; end if;
  if library.version <> expected_version then raise exception 'Nomenclature item was changed by another session.' using errcode = '40001'; end if;
  event_name := case when target_storage_key is null then 'cover_removed' when library.cover_storage_key is null then 'cover_uploaded' else 'cover_replaced' end;
  update public.partner_external_nomenclature_library set cover_storage_key = target_storage_key, cover_size_bytes = target_size_bytes,
    cover_width = target_width, cover_height = target_height, cover_updated_at = case when target_storage_key is null then null else now() end,
    cover_updated_by = case when target_storage_key is null then null else auth.uid() end, version = version + 1
  where company_id = target_company_id and external_nomenclature_id = target_external_nomenclature_id returning version into next_version;
  insert into public.partner_external_nomenclature_events(company_id, external_nomenclature_id, actor_user_id, event_type, context)
  values(target_company_id, target_external_nomenclature_id, auth.uid(), event_name, jsonb_build_object('version', next_version));
  return jsonb_build_object('version', next_version, 'previous_storage_key', library.cover_storage_key);
end; $$;

create or replace function public.adopt_partner_external_nomenclature(target_company_id uuid, target_external_nomenclature_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare prior_status text;
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.manage') then raise exception 'Nomenclature library is not available.' using errcode='42501'; end if;
  if not exists(select 1 from public.external_nomenclature_items where id=target_external_nomenclature_id and is_active and canonical_item_id is null and curation_status='active') then raise exception 'Nomenclature item was not found.' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text||':'||target_external_nomenclature_id::text,0));
  select status into prior_status from public.partner_external_nomenclature_library where company_id=target_company_id and external_nomenclature_id=target_external_nomenclature_id;
  insert into public.partner_external_nomenclature_library(company_id,external_nomenclature_id,status,created_by)
  values(target_company_id,target_external_nomenclature_id,'active',auth.uid())
  on conflict(company_id,external_nomenclature_id) do update set status='active',archived_at=null,archived_by=null,version=public.partner_external_nomenclature_library.version+1;
  if prior_status is distinct from 'active' then
    insert into public.partner_external_nomenclature_events(company_id,external_nomenclature_id,actor_user_id,event_type)
    values(target_company_id,target_external_nomenclature_id,auth.uid(),case when prior_status='archived' then 'reactivated' else 'adopted' end);
  end if;
end; $$;

create or replace function public.resolve_external_nomenclature_cover(target_external_nomenclature_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare item public.external_nomenclature_items; active_company_id uuid; object_key text;
begin
  if auth.uid() is null then return null; end if;
  select * into item from public.external_nomenclature_items where id = target_external_nomenclature_id and is_active and canonical_item_id is null;
  if item.id is null then return null; end if;
  if public.has_internal_permission('admin.external_nomenclature.view') then return item.canonical_cover_storage_key; end if;
  select membership.company_id into active_company_id from public.company_memberships membership join public.partner_companies company on company.id = membership.company_id
  where membership.user_id = auth.uid() and membership.status = 'active' and company.status = 'active'
    and public.can_access_estimates(membership.company_id, 'estimates.view') order by membership.created_at, membership.id limit 1;
  if active_company_id is null then return null; end if;
  if item.canonical_cover_storage_key is not null then return item.canonical_cover_storage_key; end if;
  if item.curation_status = 'review_required' then select library.cover_storage_key into object_key from public.partner_external_nomenclature_library library
    where library.company_id = active_company_id and library.external_nomenclature_id = item.id and library.status = 'active'; end if;
  return object_key;
end; $$;

create or replace function public.list_admin_external_nomenclature(
  search_query text default null, item_type_filter text default null, status_filter text default null,
  category_filter text default null, manufacturer_filter text default null, result_limit integer default 25, result_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.external_nomenclature.view') then raise exception 'Nomenclature governance is not available.' using errcode = '42501'; end if;
  if item_type_filter is not null and item_type_filter not in ('equipment','material','service') then raise exception 'Invalid type.' using errcode = '22023'; end if;
  if status_filter is not null and status_filter not in ('active','review_required','duplicate','archived') then raise exception 'Invalid status.' using errcode = '22023'; end if;
  with filtered as (
    select item.* from public.external_nomenclature_items item where
      (btrim(coalesce(search_query,'')) = '' or item.name ilike '%' || btrim(search_query) || '%' or coalesce(item.manufacturer,'') ilike '%' || btrim(search_query) || '%' or coalesce(item.model,'') ilike '%' || btrim(search_query) || '%')
      and (item_type_filter is null or item.item_type = item_type_filter) and (status_filter is null or item.curation_status = status_filter)
      and (category_filter is null or item.category = category_filter) and (manufacturer_filter is null or item.manufacturer = manufacturer_filter)
  ), usage as (
    select filtered.id, count(distinct library.company_id) as company_count, count(distinct estimate_item.id) as estimate_count,
      count(distinct request.id) filter (where request.status <> 'cancelled') as request_count,
      least(filtered.created_at, min(estimate_item.created_at)) as first_observed,
      greatest(filtered.updated_at, max(estimate_item.updated_at), max(library.last_used_at)) as last_observed
    from filtered left join public.partner_external_nomenclature_library library on library.external_nomenclature_id = filtered.id
    left join public.estimate_items estimate_item on estimate_item.external_nomenclature_id = filtered.id
    left join public.estimate_external_item_requests request on request.estimate_item_id = estimate_item.id
    group by filtered.id, filtered.created_at, filtered.updated_at
  ), page as (
    select filtered.*, usage.company_count, usage.estimate_count, usage.request_count, usage.first_observed, usage.last_observed
    from filtered join usage on usage.id = filtered.id order by filtered.updated_at desc, filtered.id
    limit least(greatest(coalesce(result_limit,25),1),50) offset least(greatest(coalesce(result_offset,0),0),10000)
  ) select jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb), 'total', (select count(*) from filtered)) into result from page;
  return result;
end; $$;

create or replace function public.get_admin_external_nomenclature_detail(target_external_nomenclature_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.external_nomenclature.view') then raise exception 'Nomenclature governance is not available.' using errcode = '42501'; end if;
  select to_jsonb(item) || jsonb_build_object('company_count',(select count(distinct company_id) from public.partner_external_nomenclature_library where external_nomenclature_id=item.id),
    'estimate_count',(select count(*) from public.estimate_items where external_nomenclature_id=item.id),
    'events',coalesce((select jsonb_agg(to_jsonb(event) order by event.created_at desc) from (select id,event_type,reason,context,created_at from public.external_nomenclature_governance_events where external_nomenclature_id=item.id order by created_at desc limit 30) event),'[]'::jsonb))
  into result from public.external_nomenclature_items item where item.id = target_external_nomenclature_id;
  return result;
end; $$;

create or replace function public.update_admin_external_nomenclature(
  target_external_nomenclature_id uuid, expected_version integer, target_item_type text, target_manufacturer text, target_model text,
  target_name text, target_category text, target_unit text, target_specification text, target_status text, change_reason text
) returns integer language plpgsql security definer set search_path = public as $$
declare next_version integer; old_status text;
begin
  if not public.has_internal_permission('admin.external_nomenclature.manage') then raise exception 'Nomenclature governance is not available.' using errcode = '42501'; end if;
  if target_item_type not in ('equipment','material','service') or target_status not in ('active','review_required','archived')
    or char_length(btrim(target_name)) not between 1 and 300 or char_length(btrim(change_reason)) not between 10 and 1000 then raise exception 'Curation data is invalid.' using errcode='22023'; end if;
  select curation_status into old_status from public.external_nomenclature_items where id=target_external_nomenclature_id and canonical_item_id is null for update;
  update public.external_nomenclature_items set item_type=target_item_type, manufacturer=nullif(btrim(target_manufacturer),''), model=nullif(btrim(target_model),''),
    name=btrim(target_name), category=nullif(btrim(target_category),''), unit=target_unit, specification=nullif(btrim(target_specification),''),
    normalized_manufacturer=public.normalize_external_nomenclature_text(coalesce(target_manufacturer,'')), normalized_model=public.normalize_external_nomenclature_text(coalesce(target_model,'')),
    normalized_name=public.normalize_external_nomenclature_text(target_name), curation_status=target_status, is_active=(target_status<>'archived'), version=version+1, updated_at=now()
  where id=target_external_nomenclature_id and canonical_item_id is null and version=expected_version returning version into next_version;
  if next_version is null then raise exception 'Nomenclature item was changed by another session.' using errcode='40001'; end if;
  insert into public.external_nomenclature_governance_events(external_nomenclature_id,actor_user_id,event_type,reason,context)
  values(target_external_nomenclature_id,auth.uid(),case when target_status='active' and old_status='review_required' then 'canonicalized' when target_status='archived' then 'archived' when old_status='archived' then 'restored' else 'canonical_edited' end,
    btrim(change_reason),jsonb_build_object('version',next_version,'status',target_status));
  return next_version;
end; $$;

create or replace function public.set_admin_external_nomenclature_cover(
  target_external_nomenclature_id uuid, expected_version integer, target_storage_key text,
  target_size_bytes integer, target_width integer, target_height integer, change_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare item public.external_nomenclature_items; next_version integer; event_name text;
begin
  if not public.has_internal_permission('admin.external_nomenclature.manage') then raise exception 'Nomenclature governance is not available.' using errcode='42501'; end if;
  if char_length(btrim(change_reason)) not between 10 and 1000 then raise exception 'A curation reason is required.' using errcode='22023'; end if;
  select * into item from public.external_nomenclature_items where id=target_external_nomenclature_id and canonical_item_id is null for update;
  if item.id is null or item.item_type='service' then raise exception 'Nomenclature item was not found.' using errcode='P0002'; end if;
  if item.version<>expected_version then raise exception 'Nomenclature item was changed by another session.' using errcode='40001'; end if;
  if target_storage_key is not null and (target_storage_key !~ ('^canonical/'||target_external_nomenclature_id::text||'/[0-9a-f-]{36}\\.webp$')
    or target_size_bytes not between 1 and 262144 or target_width not between 1 and 512 or target_height not between 1 and 512) then raise exception 'Cover metadata is invalid.' using errcode='22023'; end if;
  event_name:=case when target_storage_key is null then 'canonical_cover_removed' when item.canonical_cover_storage_key is null then 'canonical_cover_uploaded' else 'canonical_cover_replaced' end;
  update public.external_nomenclature_items set canonical_cover_storage_key=target_storage_key,canonical_cover_size_bytes=target_size_bytes,
    canonical_cover_width=target_width,canonical_cover_height=target_height,canonical_cover_updated_at=case when target_storage_key is null then null else now() end,
    canonical_cover_updated_by=case when target_storage_key is null then null else auth.uid() end,version=version+1,updated_at=now()
  where id=target_external_nomenclature_id returning version into next_version;
  insert into public.external_nomenclature_governance_events(external_nomenclature_id,actor_user_id,event_type,reason,context)
  values(target_external_nomenclature_id,auth.uid(),event_name,btrim(change_reason),jsonb_build_object('version',next_version));
  return jsonb_build_object('version',next_version,'previous_storage_key',item.canonical_cover_storage_key);
end; $$;

create or replace function public.curate_external_nomenclature_duplicate(source_item_id uuid,target_canonical_item_id uuid,curation_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare source public.external_nomenclature_items; canonical public.external_nomenclature_items;
begin
  if not public.has_internal_permission('admin.external_nomenclature.manage') then raise exception 'External nomenclature curation is not available.' using errcode='42501'; end if;
  if source_item_id=target_canonical_item_id or char_length(btrim(coalesce(curation_reason,'')))<10 then raise exception 'Curation input is invalid.' using errcode='22023'; end if;
  select * into canonical from public.external_nomenclature_items where id=target_canonical_item_id and canonical_item_id is null and is_active and curation_status='active' for update;
  select * into source from public.external_nomenclature_items where id=source_item_id and canonical_item_id is null and is_active for update;
  if canonical.id is null or source.id is null or canonical.item_type<>source.item_type then raise exception 'External nomenclature item was not found.' using errcode='P0002'; end if;
  insert into public.partner_external_nomenclature_library(company_id,external_nomenclature_id,status,created_by,last_used_at)
  select library.company_id,canonical.id,'active',library.created_by,library.last_used_at from public.partner_external_nomenclature_library library
  where library.external_nomenclature_id=source.id and library.status='active'
  on conflict(company_id,external_nomenclature_id) do update set status='active',archived_at=null,archived_by=null,last_used_at=greatest(public.partner_external_nomenclature_library.last_used_at,excluded.last_used_at),version=public.partner_external_nomenclature_library.version+1;
  update public.partner_external_nomenclature_library set status='archived',archived_at=now(),archived_by=auth.uid(),version=version+1
  where external_nomenclature_id=source.id and status='active';
  update public.external_nomenclature_items set canonical_item_id=canonical.id,curation_status='duplicate',is_active=false,version=version+1,updated_at=now() where id=source.id;
  insert into public.external_nomenclature_curation_events(source_item_id,canonical_item_id,actor_user_id,reason) values(source.id,canonical.id,auth.uid(),btrim(curation_reason));
  insert into public.external_nomenclature_governance_events(external_nomenclature_id,canonical_item_id,actor_user_id,event_type,reason)
  values(source.id,canonical.id,auth.uid(),'duplicate_redirected',btrim(curation_reason));
  return canonical.id;
end; $$;

revoke all on function public.prevent_external_nomenclature_governance_event_mutation(),
  public.list_partner_external_nomenclature_v2(uuid,text,text,integer,integer),
  public.search_external_nomenclature_v2(uuid,text,text,text,integer),
  public.set_partner_external_nomenclature_cover(uuid,uuid,integer,text,integer,integer,integer),
  public.adopt_partner_external_nomenclature(uuid,uuid),
  public.resolve_external_nomenclature_cover(uuid),
  public.list_admin_external_nomenclature(text,text,text,text,text,integer,integer),
  public.get_admin_external_nomenclature_detail(uuid),
  public.update_admin_external_nomenclature(uuid,integer,text,text,text,text,text,text,text,text,text),
  public.set_admin_external_nomenclature_cover(uuid,integer,text,integer,integer,integer,text),
  public.curate_external_nomenclature_duplicate(uuid,uuid,text)
from public,anon;
revoke execute on function public.prevent_external_nomenclature_governance_event_mutation() from authenticated;
grant execute on function public.list_partner_external_nomenclature_v2(uuid,text,text,integer,integer),
  public.search_external_nomenclature_v2(uuid,text,text,text,integer),
  public.set_partner_external_nomenclature_cover(uuid,uuid,integer,text,integer,integer,integer),
  public.adopt_partner_external_nomenclature(uuid,uuid),
  public.resolve_external_nomenclature_cover(uuid),
  public.list_admin_external_nomenclature(text,text,text,text,text,integer,integer),
  public.get_admin_external_nomenclature_detail(uuid),
  public.update_admin_external_nomenclature(uuid,integer,text,text,text,text,text,text,text,text,text),
  public.set_admin_external_nomenclature_cover(uuid,integer,text,integer,integer,integer,text),
  public.curate_external_nomenclature_duplicate(uuid,uuid,text)
to authenticated;
