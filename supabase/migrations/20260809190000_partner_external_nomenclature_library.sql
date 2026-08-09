-- Company-scoped reusable external nomenclature over the existing anonymous shared identity.

alter table public.external_nomenclature_items
  add column if not exists item_type text not null default 'equipment';

with inferred as (
  select
    item.external_nomenclature_id,
    case
      when bool_or(section.system_key in ('installation_works', 'commissioning_works')) then 'service'
      when bool_or(section.system_key = 'installation_materials') then 'material'
      else 'equipment'
    end as item_type
  from public.estimate_items item
  join public.estimate_sections section on section.id = item.section_id
  where item.external_nomenclature_id is not null
  group by item.external_nomenclature_id
)
update public.external_nomenclature_items item
set item_type = inferred.item_type
from inferred
where inferred.external_nomenclature_id = item.id;

alter table public.external_nomenclature_items
  drop constraint if exists external_nomenclature_item_type_check,
  add constraint external_nomenclature_item_type_check
    check (item_type in ('equipment', 'material', 'service'));

alter table public.external_nomenclature_items
  alter column manufacturer drop not null,
  alter column model drop not null;

alter table public.external_nomenclature_items
  drop constraint if exists external_nomenclature_manufacturer_check,
  drop constraint if exists external_nomenclature_model_check,
  drop constraint if exists external_nomenclature_normalized_check;

alter table public.external_nomenclature_items
  add constraint external_nomenclature_manufacturer_check check (
    (item_type = 'service' and (manufacturer is null or char_length(btrim(manufacturer)) <= 120))
    or (item_type in ('equipment', 'material') and char_length(btrim(manufacturer)) between 1 and 120)
  ),
  add constraint external_nomenclature_model_check check (
    (item_type = 'service' and (model is null or char_length(btrim(model)) <= 160))
    or (item_type in ('equipment', 'material') and char_length(btrim(model)) between 1 and 160)
  ),
  add constraint external_nomenclature_normalized_check check (
    normalized_name <> ''
    and (
      item_type = 'service'
      or (normalized_manufacturer <> '' and normalized_model <> '')
    )
  );

drop index if exists public.external_nomenclature_search_idx;
create index external_nomenclature_search_idx
  on public.external_nomenclature_items using gin
  ((normalized_manufacturer || ' ' || normalized_model || ' ' || normalized_name) extensions.gin_trgm_ops)
  where is_active and canonical_item_id is null;
create index external_nomenclature_type_search_idx
  on public.external_nomenclature_items(item_type, normalized_name, id)
  where is_active and canonical_item_id is null;
create index external_nomenclature_compound_search_idx
  on public.external_nomenclature_items using gin
  ((normalized_manufacturer || normalized_model || normalized_name) extensions.gin_trgm_ops)
  where is_active and canonical_item_id is null;

create table public.partner_external_nomenclature_library (
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  external_nomenclature_id uuid not null references public.external_nomenclature_items(id) on delete restrict,
  status text not null default 'active',
  display_name_override text null,
  category_override text null,
  unit_override text null,
  specification_override text null,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  archived_by uuid null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz null,
  archived_at timestamptz null,
  version integer not null default 0,
  primary key (company_id, external_nomenclature_id),
  constraint partner_external_nomenclature_status_check check (status in ('active', 'archived')),
  constraint partner_external_nomenclature_display_name_check check (
    display_name_override is null or char_length(btrim(display_name_override)) between 1 and 300
  ),
  constraint partner_external_nomenclature_category_check check (
    category_override is null or char_length(btrim(category_override)) <= 160
  ),
  constraint partner_external_nomenclature_unit_check check (
    unit_override is null or unit_override in ('pcs', 'hour', 'meter', 'set', 'visit', 'service')
  ),
  constraint partner_external_nomenclature_specification_check check (
    specification_override is null or char_length(specification_override) <= 2000
  ),
  constraint partner_external_nomenclature_version_check check (version >= 0),
  constraint partner_external_nomenclature_archive_shape_check check (
    (status = 'active' and archived_at is null and archived_by is null)
    or (status = 'archived' and archived_at is not null and archived_by is not null)
  )
);

comment on table public.partner_external_nomenclature_library is
  'Private company adoption and presentation state for anonymous shared external nomenclature identities.';

create index partner_external_nomenclature_active_list_idx
  on public.partner_external_nomenclature_library(company_id, last_used_at desc nulls last, created_at desc, external_nomenclature_id)
  where status = 'active';
create index partner_external_nomenclature_active_type_idx
  on public.partner_external_nomenclature_library(company_id, external_nomenclature_id)
  where status = 'active';

create table public.partner_external_nomenclature_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  external_nomenclature_id uuid not null references public.external_nomenclature_items(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint partner_external_nomenclature_event_type_check check (
    event_type in ('created', 'adopted', 'reactivated', 'updated', 'archived', 'used')
  ),
  constraint partner_external_nomenclature_event_context_check check (jsonb_typeof(context) = 'object')
);

create index partner_external_nomenclature_events_company_idx
  on public.partner_external_nomenclature_events(company_id, created_at desc, id);
create index partner_external_nomenclature_events_item_idx
  on public.partner_external_nomenclature_events(external_nomenclature_id, created_at, id);

create table public.partner_external_nomenclature_requests (
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  request_key uuid not null,
  request_fingerprint text not null,
  external_nomenclature_id uuid not null references public.external_nomenclature_items(id) on delete restrict,
  operation text not null,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (company_id, request_key),
  constraint partner_external_nomenclature_request_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint partner_external_nomenclature_request_operation_check check (operation in ('create', 'adopt'))
);

alter table public.partner_external_nomenclature_library enable row level security;
alter table public.partner_external_nomenclature_events enable row level security;
alter table public.partner_external_nomenclature_requests enable row level security;
revoke all on table public.partner_external_nomenclature_library,
  public.partner_external_nomenclature_events,
  public.partner_external_nomenclature_requests from public, anon, authenticated;

create trigger set_partner_external_nomenclature_library_updated_at
before update on public.partner_external_nomenclature_library
for each row execute function public.set_updated_at();

create or replace function public.prevent_partner_external_nomenclature_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'External nomenclature history is immutable.' using errcode = '42501';
end;
$$;

revoke all on function public.prevent_partner_external_nomenclature_event_mutation() from public, anon, authenticated;
create trigger prevent_partner_external_nomenclature_event_mutation
before update or delete on public.partner_external_nomenclature_events
for each row execute function public.prevent_partner_external_nomenclature_event_mutation();

insert into public.partner_external_nomenclature_library(
  company_id, external_nomenclature_id, status, created_by, created_at, updated_at, last_used_at
)
select
  item.created_by_company_id,
  item.id,
  'active',
  item.created_by,
  item.created_at,
  item.updated_at,
  usage.last_used_at
from public.external_nomenclature_items item
left join lateral (
  select max(estimate_item.created_at) as last_used_at
  from public.estimate_items estimate_item
  join public.estimates estimate on estimate.id = estimate_item.estimate_id
  where estimate_item.external_nomenclature_id = item.id
    and estimate.company_id = item.created_by_company_id
) usage on true
on conflict (company_id, external_nomenclature_id) do nothing;

insert into public.partner_external_nomenclature_library(
  company_id, external_nomenclature_id, status, created_by, created_at, updated_at, last_used_at
)
select
  estimate.company_id,
  estimate_item.external_nomenclature_id,
  'active',
  min(estimate.created_by::text)::uuid,
  min(estimate_item.created_at),
  max(estimate_item.created_at),
  max(estimate_item.created_at)
from public.estimate_items estimate_item
join public.estimates estimate on estimate.id = estimate_item.estimate_id
where estimate_item.external_nomenclature_id is not null
group by estimate.company_id, estimate_item.external_nomenclature_id
on conflict (company_id, external_nomenclature_id) do update
set last_used_at = greatest(
  coalesce(partner_external_nomenclature_library.last_used_at, '-infinity'::timestamptz),
  excluded.last_used_at
);

create or replace function public.list_partner_external_nomenclature(
  target_company_id uuid,
  search_query text default null,
  target_item_type text default null,
  result_limit integer default 25,
  result_offset integer default 0
)
returns table (
  id uuid,
  item_type text,
  manufacturer text,
  model text,
  name text,
  category text,
  unit text,
  specification text,
  last_used_at timestamptz,
  created_at timestamptz,
  version integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := public.normalize_external_nomenclature_text(coalesce(search_query, ''));
  bounded_limit integer := least(greatest(coalesce(result_limit, 25), 1), 50);
  bounded_offset integer := least(greatest(coalesce(result_offset, 0), 0), 10000);
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.view') then
    raise exception 'Nomenclature library is not available.' using errcode = '42501';
  end if;
  if target_item_type is not null and target_item_type not in ('equipment', 'material', 'service') then
    raise exception 'Nomenclature type is invalid.' using errcode = '22023';
  end if;

  return query
  select
    item.id,
    item.item_type,
    item.manufacturer,
    item.model,
    coalesce(library.display_name_override, item.name),
    coalesce(library.category_override, item.category),
    coalesce(library.unit_override, item.unit),
    coalesce(library.specification_override, item.specification),
    library.last_used_at,
    library.created_at,
    library.version,
    count(*) over()
  from public.partner_external_nomenclature_library library
  join public.external_nomenclature_items item on item.id = library.external_nomenclature_id
  where library.company_id = target_company_id
    and library.status = 'active'
    and item.is_active
    and item.canonical_item_id is null
    and (target_item_type is null or item.item_type = target_item_type)
    and (
      normalized_query = ''
      or item.normalized_manufacturer like '%' || normalized_query || '%'
      or item.normalized_model like '%' || normalized_query || '%'
      or item.normalized_name like '%' || normalized_query || '%'
      or item.normalized_manufacturer || item.normalized_model || item.normalized_name like '%' || normalized_query || '%'
      or public.normalize_external_nomenclature_text(coalesce(library.display_name_override, '')) like '%' || normalized_query || '%'
    )
  order by library.last_used_at desc nulls last, coalesce(library.display_name_override, item.name), item.id
  limit bounded_limit offset bounded_offset;
end;
$$;

create or replace function public.search_partner_external_nomenclature(
  target_company_id uuid,
  search_query text,
  target_item_type text,
  result_limit integer default 8
)
returns table (
  id uuid,
  item_type text,
  manufacturer text,
  model text,
  name text,
  category text,
  unit text,
  specification text,
  exact_identity_match boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := public.normalize_external_nomenclature_text(coalesce(search_query, ''));
  bounded_limit integer := least(greatest(coalesce(result_limit, 8), 1), 12);
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.view') then
    raise exception 'Nomenclature library is not available.' using errcode = '42501';
  end if;
  if target_item_type not in ('equipment', 'material', 'service') then
    raise exception 'Nomenclature type is invalid.' using errcode = '22023';
  end if;
  if char_length(normalized_query) < 2 then return; end if;

  return query
  select
    item.id,
    item.item_type,
    item.manufacturer,
    item.model,
    coalesce(library.display_name_override, item.name),
    coalesce(library.category_override, item.category),
    coalesce(library.unit_override, item.unit),
    coalesce(library.specification_override, item.specification),
    case
      when item.item_type = 'service' then item.normalized_name = normalized_query
      else item.normalized_manufacturer || item.normalized_model = normalized_query
    end
  from public.partner_external_nomenclature_library library
  join public.external_nomenclature_items item on item.id = library.external_nomenclature_id
  where library.company_id = target_company_id
    and library.status = 'active'
    and item.is_active
    and item.canonical_item_id is null
    and item.item_type = target_item_type
    and (
      item.normalized_manufacturer like '%' || normalized_query || '%'
      or item.normalized_model like '%' || normalized_query || '%'
      or item.normalized_name like '%' || normalized_query || '%'
      or item.normalized_manufacturer || item.normalized_model || item.normalized_name like '%' || normalized_query || '%'
      or public.normalize_external_nomenclature_text(coalesce(library.display_name_override, '')) like '%' || normalized_query || '%'
    )
  order by
    case when item.item_type = 'service'
      then item.normalized_name = normalized_query
      else item.normalized_manufacturer || item.normalized_model = normalized_query
    end desc,
    library.last_used_at desc nulls last,
    coalesce(library.display_name_override, item.name), item.id
  limit bounded_limit;
end;
$$;

create or replace function public.search_shared_external_nomenclature(
  target_company_id uuid,
  search_query text,
  target_item_type text,
  result_limit integer default 8
)
returns table (
  id uuid,
  item_type text,
  manufacturer text,
  model text,
  name text,
  category text,
  unit text,
  specification text,
  exact_identity_match boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := public.normalize_external_nomenclature_text(coalesce(search_query, ''));
  bounded_limit integer := least(greatest(coalesce(result_limit, 8), 1), 12);
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.view') then
    raise exception 'Nomenclature library is not available.' using errcode = '42501';
  end if;
  if target_item_type not in ('equipment', 'material', 'service') then
    raise exception 'Nomenclature type is invalid.' using errcode = '22023';
  end if;
  if char_length(normalized_query) < 2 then return; end if;

  return query
  select
    item.id,
    item.item_type,
    item.manufacturer,
    item.model,
    item.name,
    item.category,
    item.unit,
    item.specification,
    case
      when item.item_type = 'service' then item.normalized_name = normalized_query
      else item.normalized_manufacturer || item.normalized_model = normalized_query
    end
  from public.external_nomenclature_items item
  where item.is_active
    and item.canonical_item_id is null
    and item.item_type = target_item_type
    and not exists (
      select 1
      from public.partner_external_nomenclature_library own_library
      where own_library.company_id = target_company_id
        and own_library.external_nomenclature_id = item.id
        and own_library.status = 'active'
    )
    and (
      item.normalized_manufacturer like '%' || normalized_query || '%'
      or item.normalized_model like '%' || normalized_query || '%'
      or item.normalized_name like '%' || normalized_query || '%'
      or item.normalized_manufacturer || item.normalized_model || item.normalized_name like '%' || normalized_query || '%'
    )
  order by
    case when item.item_type = 'service'
      then item.normalized_name = normalized_query
      else item.normalized_manufacturer || item.normalized_model = normalized_query
    end desc,
    extensions.similarity(item.normalized_manufacturer || ' ' || item.normalized_model || ' ' || item.normalized_name, normalized_query) desc,
    item.name, item.id
  limit bounded_limit;
end;
$$;

create or replace function public.create_partner_external_nomenclature(
  target_company_id uuid,
  target_request_key uuid,
  target_request_fingerprint text,
  target_item_type text,
  target_manufacturer text,
  target_model text,
  target_name text,
  target_category text,
  target_unit text,
  target_specification text,
  force_create_new boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  prior public.partner_external_nomenclature_requests;
  created_item public.external_nomenclature_items;
  normalized_manufacturer_value text := public.normalize_external_nomenclature_text(coalesce(target_manufacturer, ''));
  normalized_model_value text := public.normalize_external_nomenclature_text(coalesce(target_model, ''));
  normalized_name_value text := public.normalize_external_nomenclature_text(coalesce(target_name, ''));
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Nomenclature library is not available.' using errcode = '42501';
  end if;
  if target_request_key is null or target_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Nomenclature request is invalid.' using errcode = '22023';
  end if;
  if target_item_type not in ('equipment', 'material', 'service')
     or normalized_name_value = ''
     or (target_item_type <> 'service' and (normalized_manufacturer_value = '' or normalized_model_value = ''))
     or target_unit not in ('pcs', 'hour', 'meter', 'set', 'visit', 'service') then
    raise exception 'Nomenclature data is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':' || target_request_key::text, 0));
  select * into prior from public.partner_external_nomenclature_requests
  where company_id = target_company_id and request_key = target_request_key;
  if prior.company_id is not null then
    if prior.created_by <> auth.uid() or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Nomenclature request key was reused with different data.' using errcode = '22023';
    end if;
    return prior.external_nomenclature_id;
  end if;

  if not force_create_new and exists (
    select 1 from public.external_nomenclature_items item
    where item.is_active and item.canonical_item_id is null and item.item_type = target_item_type
      and (
        (target_item_type = 'service' and item.normalized_name = normalized_name_value)
        or (target_item_type <> 'service'
          and item.normalized_manufacturer = normalized_manufacturer_value
          and item.normalized_model = normalized_model_value)
      )
  ) then
    raise exception 'A matching external nomenclature item already exists.' using errcode = '23505';
  end if;

  insert into public.external_nomenclature_items(
    item_type, manufacturer, model, name, category, unit, specification,
    normalized_manufacturer, normalized_model, normalized_name,
    created_by, created_by_company_id
  ) values (
    target_item_type,
    nullif(btrim(target_manufacturer), ''),
    nullif(btrim(target_model), ''),
    btrim(target_name),
    nullif(btrim(target_category), ''),
    target_unit,
    nullif(btrim(target_specification), ''),
    normalized_manufacturer_value,
    normalized_model_value,
    normalized_name_value,
    auth.uid(),
    target_company_id
  ) returning * into created_item;

  insert into public.partner_external_nomenclature_library(
    company_id, external_nomenclature_id, status, created_by
  ) values (target_company_id, created_item.id, 'active', auth.uid());
  insert into public.partner_external_nomenclature_requests(
    company_id, request_key, request_fingerprint, external_nomenclature_id, operation, created_by
  ) values (target_company_id, target_request_key, target_request_fingerprint, created_item.id, 'create', auth.uid());
  insert into public.partner_external_nomenclature_events(
    company_id, external_nomenclature_id, actor_user_id, event_type
  ) values (target_company_id, created_item.id, auth.uid(), 'created');
  return created_item.id;
end;
$$;

create or replace function public.update_partner_external_nomenclature(
  target_company_id uuid,
  target_external_nomenclature_id uuid,
  expected_version integer,
  target_name text,
  target_category text,
  target_unit text,
  target_specification text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Nomenclature library is not available.' using errcode = '42501';
  end if;
  if char_length(btrim(target_name)) not between 1 and 300
     or target_unit not in ('pcs', 'hour', 'meter', 'set', 'visit', 'service') then
    raise exception 'Nomenclature data is invalid.' using errcode = '22023';
  end if;

  update public.partner_external_nomenclature_library library
  set display_name_override = nullif(btrim(target_name), (select item.name from public.external_nomenclature_items item where item.id = target_external_nomenclature_id)),
      category_override = nullif(btrim(target_category), ''),
      unit_override = target_unit,
      specification_override = nullif(btrim(target_specification), ''),
      version = version + 1
  where library.company_id = target_company_id
    and library.external_nomenclature_id = target_external_nomenclature_id
    and library.status = 'active'
    and library.version = expected_version
  returning version into next_version;
  if next_version is null then
    if exists (
      select 1 from public.partner_external_nomenclature_library
      where company_id = target_company_id and external_nomenclature_id = target_external_nomenclature_id and status = 'active'
    ) then
      raise exception 'Nomenclature item was changed by another session.' using errcode = '40001';
    end if;
    raise exception 'Nomenclature item was not found.' using errcode = 'P0002';
  end if;
  insert into public.partner_external_nomenclature_events(
    company_id, external_nomenclature_id, actor_user_id, event_type, context
  ) values (target_company_id, target_external_nomenclature_id, auth.uid(), 'updated', jsonb_build_object('version', next_version));
  return next_version;
end;
$$;

create or replace function public.archive_partner_external_nomenclature(
  target_company_id uuid,
  target_external_nomenclature_id uuid,
  expected_version integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.manage') then
    raise exception 'Nomenclature library is not available.' using errcode = '42501';
  end if;
  update public.partner_external_nomenclature_library
  set status = 'archived', archived_at = now(), archived_by = auth.uid(), version = version + 1
  where company_id = target_company_id
    and external_nomenclature_id = target_external_nomenclature_id
    and status = 'active'
    and version = expected_version;
  if not found then
    if exists (
      select 1 from public.partner_external_nomenclature_library
      where company_id = target_company_id and external_nomenclature_id = target_external_nomenclature_id and status = 'active'
    ) then
      raise exception 'Nomenclature item was changed by another session.' using errcode = '40001';
    end if;
    raise exception 'Nomenclature item was not found.' using errcode = 'P0002';
  end if;
  insert into public.partner_external_nomenclature_events(
    company_id, external_nomenclature_id, actor_user_id, event_type
  ) values (target_company_id, target_external_nomenclature_id, auth.uid(), 'archived');
end;
$$;

create or replace function public.add_estimate_external_item_v3(
  target_estimate_id uuid,
  expected_revision integer,
  target_section_id uuid,
  target_request_key uuid,
  target_request_fingerprint text,
  existing_external_item_id uuid,
  target_manufacturer text,
  target_model text,
  target_name text,
  target_category text,
  target_unit text,
  target_specification text,
  target_quantity numeric,
  target_selling_unit_price numeric,
  force_create_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.estimates;
  target_section public.estimate_sections;
  external_item public.external_nomenclature_items;
  existing_request public.estimate_external_item_requests;
  created_line public.estimate_items;
  next_position integer;
  target_item_type text;
  normalized_manufacturer_value text := public.normalize_external_nomenclature_text(coalesce(target_manufacturer, ''));
  normalized_model_value text := public.normalize_external_nomenclature_text(coalesce(target_model, ''));
  normalized_name_value text := public.normalize_external_nomenclature_text(coalesce(target_name, ''));
  prior_library_status text;
  repeated_external_item_id uuid;
begin
  if target_request_key is null or target_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'External item request is invalid.' using errcode = '22023';
  end if;
  select * into target from public.estimates where id = target_estimate_id for update;
  if target.id is null or target.status <> 'draft'
     or not public.can_access_estimates(target.company_id, 'estimates.manage')
     or not public.can_access_estimates(target.company_id, 'estimates.pricing.manage') then
    raise exception 'Estimate draft is not available.' using errcode = '42501';
  end if;
  select * into target_section from public.estimate_sections
  where id = target_section_id and estimate_id = target.id;
  if target_section.id is null or target_section.system_key is null then
    raise exception 'Estimate section is invalid.' using errcode = '22023';
  end if;
  target_item_type := case target_section.system_key
    when 'equipment' then 'equipment'
    when 'installation_materials' then 'material'
    when 'installation_works' then 'service'
    when 'commissioning_works' then 'service'
    else null
  end;
  if target_item_type is null then
    raise exception 'Estimate section is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || target.id::text || ':' || target_request_key::text, 0));
  select * into existing_request from public.estimate_external_item_requests
  where estimate_id = target.id and request_key = target_request_key;
  if existing_request.estimate_id is not null then
    if existing_request.request_fingerprint <> target_request_fingerprint then
      raise exception 'External item request key was reused with different data.' using errcode = '22023';
    end if;
    select external_nomenclature_id into repeated_external_item_id
    from public.estimate_items
    where id = existing_request.estimate_item_id and estimate_id = target.id;
    if repeated_external_item_id is null then
      raise exception 'External item request target was not found.' using errcode = 'P0002';
    end if;
    return jsonb_build_object(
      'estimate_item_id', existing_request.estimate_item_id,
      'external_nomenclature_id', repeated_external_item_id,
      'repeated', true
    );
  end if;
  if target.revision <> expected_revision then
    raise exception 'Estimate was changed by another session.' using errcode = '40001';
  end if;

  if existing_external_item_id is not null then
    select * into external_item from public.external_nomenclature_items
    where id = existing_external_item_id and is_active and canonical_item_id is null and item_type = target_item_type;
    if external_item.id is null then
      raise exception 'External nomenclature item was not found.' using errcode = 'P0002';
    end if;
  else
    if normalized_name_value = ''
       or (target_item_type <> 'service' and (normalized_manufacturer_value = '' or normalized_model_value = ''))
       or target_unit not in ('pcs', 'hour', 'meter', 'set', 'visit', 'service') then
      raise exception 'External nomenclature data is invalid.' using errcode = '22023';
    end if;
    if not force_create_new and exists (
      select 1 from public.external_nomenclature_items item
      where item.is_active and item.canonical_item_id is null and item.item_type = target_item_type
        and (
          (target_item_type = 'service' and item.normalized_name = normalized_name_value)
          or (target_item_type <> 'service'
            and item.normalized_manufacturer = normalized_manufacturer_value
            and item.normalized_model = normalized_model_value)
        )
    ) then
      raise exception 'A matching external nomenclature item already exists.' using errcode = '23505';
    end if;
    insert into public.external_nomenclature_items(
      item_type, manufacturer, model, name, category, unit, specification,
      normalized_manufacturer, normalized_model, normalized_name, created_by, created_by_company_id
    ) values (
      target_item_type, nullif(btrim(target_manufacturer), ''), nullif(btrim(target_model), ''), btrim(target_name),
      nullif(btrim(target_category), ''), target_unit, nullif(btrim(target_specification), ''),
      normalized_manufacturer_value, normalized_model_value, normalized_name_value, auth.uid(), target.company_id
    ) returning * into external_item;
  end if;

  select status into prior_library_status
  from public.partner_external_nomenclature_library
  where company_id = target.company_id and external_nomenclature_id = external_item.id
  for update;
  insert into public.partner_external_nomenclature_library(
    company_id, external_nomenclature_id, status, created_by, last_used_at
  ) values (target.company_id, external_item.id, 'active', auth.uid(), now())
  on conflict (company_id, external_nomenclature_id) do update
  set status = 'active', archived_at = null, archived_by = null,
      last_used_at = now(), version = partner_external_nomenclature_library.version + 1;

  insert into public.partner_external_nomenclature_events(
    company_id, external_nomenclature_id, actor_user_id, event_type,
    context
  ) values (
    target.company_id,
    external_item.id,
    auth.uid(),
    case
      when prior_library_status = 'archived' then 'reactivated'
      when prior_library_status = 'active' then 'used'
      when external_item.created_by = auth.uid() and external_item.created_by_company_id = target.company_id then 'created'
      else 'adopted'
    end,
    jsonb_build_object('estimateId', target.id, 'sectionKey', target_section.system_key)
  );

  select coalesce(max(position), 0) + 1 into next_position from public.estimate_items where estimate_id = target.id;
  insert into public.estimate_items(
    estimate_id, section_id, line_type, external_nomenclature_id, position,
    product_name_snapshot, description, quantity, unit, pricing_mode,
    pricing_input_value, selling_unit_price
  ) values (
    target.id, target_section.id, 'external', external_item.id, next_position,
    external_item.name,
    case when external_item.item_type = 'service'
      then concat_ws(' · ', external_item.name, external_item.specification)
      else concat_ws(' · ', external_item.manufacturer, external_item.model, external_item.name)
    end,
    target_quantity,
    external_item.unit,
    'direct',
    target_selling_unit_price,
    target_selling_unit_price
  ) returning * into created_line;
  insert into public.estimate_external_item_requests(
    estimate_id, request_key, request_fingerprint, estimate_item_id
  ) values (target.id, target_request_key, target_request_fingerprint, created_line.id);
  return jsonb_build_object(
    'estimate_item_id', created_line.id,
    'external_nomenclature_id', external_item.id,
    'repeated', false
  );
end;
$$;

revoke all on function public.list_partner_external_nomenclature(uuid, text, text, integer, integer),
  public.search_partner_external_nomenclature(uuid, text, text, integer),
  public.search_shared_external_nomenclature(uuid, text, text, integer),
  public.create_partner_external_nomenclature(uuid, uuid, text, text, text, text, text, text, text, text, boolean),
  public.update_partner_external_nomenclature(uuid, uuid, integer, text, text, text, text),
  public.archive_partner_external_nomenclature(uuid, uuid, integer),
  public.add_estimate_external_item_v3(uuid, integer, uuid, uuid, text, uuid, text, text, text, text, text, text, numeric, numeric, boolean)
from public, anon;

grant execute on function public.list_partner_external_nomenclature(uuid, text, text, integer, integer),
  public.search_partner_external_nomenclature(uuid, text, text, integer),
  public.search_shared_external_nomenclature(uuid, text, text, integer),
  public.create_partner_external_nomenclature(uuid, uuid, text, text, text, text, text, text, text, text, boolean),
  public.update_partner_external_nomenclature(uuid, uuid, integer, text, text, text, text),
  public.archive_partner_external_nomenclature(uuid, uuid, integer),
  public.add_estimate_external_item_v3(uuid, integer, uuid, uuid, text, uuid, text, text, text, text, text, text, numeric, numeric, boolean)
to authenticated;

revoke all on function public.search_external_nomenclature(text, integer) from authenticated;
