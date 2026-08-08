-- Governed unmet-demand workflow for estimate external nomenclature.

insert into public.permissions (code, description, scope, delegable_by_partner_owner, sensitive, category)
values
  ('admin.external_demand.view', 'View aggregated external nomenclature demand.', 'internal', false, true, 'admin'),
  ('admin.external_demand.manage', 'Review and resolve external nomenclature demand.', 'internal', false, true, 'admin')
on conflict (code) do update set description = excluded.description, scope = excluded.scope,
  delegable_by_partner_owner = excluded.delegable_by_partner_owner, sensitive = excluded.sensitive, category = excluded.category;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'admin.external_demand.view'
where role.code in ('novotech_admin', 'novotech_sales')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'admin.external_demand.manage'
where role.code in ('novotech_admin', 'novotech_sales')
on conflict do nothing;

alter table public.external_nomenclature_items
  add column if not exists canonical_item_id uuid null references public.external_nomenclature_items(id) on delete restrict;

alter table public.external_nomenclature_items
  add constraint external_nomenclature_not_self_canonical
  check (canonical_item_id is null or canonical_item_id <> id);

create index if not exists external_nomenclature_canonical_idx
  on public.external_nomenclature_items(canonical_item_id)
  where canonical_item_id is not null;

alter table public.estimate_external_item_requests
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists company_id uuid null references public.partner_companies(id) on delete restrict,
  add column if not exists external_nomenclature_id uuid null references public.external_nomenclature_items(id) on delete restrict,
  add column if not exists status text null,
  add column if not exists version integer not null default 0,
  add column if not exists requested_by uuid null references public.user_profiles(id) on delete restrict,
  add column if not exists requested_at timestamptz null,
  add column if not exists cancelled_by uuid null references public.user_profiles(id) on delete restrict,
  add column if not exists cancelled_at timestamptz null,
  add column if not exists final_customer_id uuid null references public.partner_final_customers(id) on delete set null,
  add column if not exists final_customer_industry_code text null,
  add column if not exists final_customer_locality text null,
  add column if not exists project_name text null,
  add column if not exists estimate_lifecycle_status text null,
  add column if not exists requested_quantity numeric(14,3) null,
  add column if not exists requested_unit text null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.estimate_external_item_requests
  drop constraint if exists estimate_external_item_requests_estimate_item_id_fkey,
  alter column estimate_item_id drop not null;
alter table public.estimate_external_item_requests
  add constraint estimate_external_item_requests_estimate_item_id_fkey
  foreign key (estimate_item_id) references public.estimate_items(id) on delete set null;

update public.estimate_external_item_requests request
set company_id = estimate.company_id,
    external_nomenclature_id = item.external_nomenclature_id,
    requested_quantity = item.quantity,
    requested_unit = item.unit
from public.estimates estimate, public.estimate_items item
where estimate.id = request.estimate_id
  and item.id = request.estimate_item_id
  and (request.company_id is null or request.external_nomenclature_id is null);

alter table public.estimate_external_item_requests
  alter column id set not null,
  alter column company_id set not null,
  alter column external_nomenclature_id set not null;

alter table public.estimate_external_item_requests
  add constraint estimate_external_item_request_id_unique unique (id),
  add constraint estimate_external_item_request_item_unique unique (estimate_item_id),
  add constraint estimate_external_item_request_status_check
    check (status is null or status in ('new', 'reviewing', 'solution_proposed', 'closed', 'cancelled')),
  add constraint estimate_external_item_request_version_check check (version >= 0),
  add constraint estimate_external_item_request_context_check check (
    (status is null and requested_at is null and requested_by is null)
    or (status is not null and requested_at is not null and requested_by is not null)
  );

create index if not exists estimate_external_item_requests_company_status_idx
  on public.estimate_external_item_requests(company_id, status, requested_at desc)
  where status is not null;
create index if not exists estimate_external_item_requests_external_status_idx
  on public.estimate_external_item_requests(external_nomenclature_id, status, requested_at desc)
  where status is not null;

grant select on table public.estimate_external_item_requests to authenticated;
create policy "Company members read external demand state"
on public.estimate_external_item_requests for select to authenticated
using (public.can_access_estimates(company_id, 'estimates.view'));

create or replace function public.populate_external_item_request_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  select estimate.company_id, item.external_nomenclature_id, item.quantity, item.unit
  into new.company_id, new.external_nomenclature_id, new.requested_quantity, new.requested_unit
  from public.estimates estimate
  join public.estimate_items item on item.estimate_id = estimate.id
  where estimate.id = new.estimate_id and item.id = new.estimate_item_id and item.line_type = 'external';
  if new.company_id is null or new.external_nomenclature_id is null then
    raise exception 'External estimate item identity is invalid.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger populate_external_item_request_identity
before insert on public.estimate_external_item_requests
for each row execute function public.populate_external_item_request_identity();

create table public.estimate_external_item_request_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.estimate_external_item_requests(id) on delete restrict,
  response_type text not null check (response_type in ('catalog_product', 'governed_alternative', 'sourcing_review', 'cannot_supply')),
  catalog_product_id uuid null references public.catalog_products(id) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint external_demand_response_shape check (
    (response_type in ('catalog_product', 'governed_alternative') and catalog_product_id is not null)
    or (response_type in ('sourcing_review', 'cannot_supply') and catalog_product_id is null)
  )
);

create index estimate_external_item_request_responses_request_idx
  on public.estimate_external_item_request_responses(request_id, created_at desc);

create table public.estimate_external_item_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.estimate_external_item_requests(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('requested', 'cancelled', 'reviewing', 'solution_proposed', 'closed', 'reopened')),
  from_status text null,
  to_status text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index estimate_external_item_request_events_request_idx
  on public.estimate_external_item_request_events(request_id, created_at, id);
create index estimate_external_item_request_events_company_idx
  on public.estimate_external_item_request_events(company_id, created_at desc);

create table public.external_nomenclature_curation_events (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references public.external_nomenclature_items(id) on delete restrict,
  canonical_item_id uuid not null references public.external_nomenclature_items(id) on delete restrict,
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  created_at timestamptz not null default now(),
  constraint external_nomenclature_curation_not_self check (source_item_id <> canonical_item_id)
);

create unique index external_nomenclature_active_canonicalization_idx
  on public.external_nomenclature_curation_events(source_item_id, canonical_item_id);

alter table public.estimate_external_item_request_responses enable row level security;
alter table public.estimate_external_item_request_events enable row level security;
alter table public.external_nomenclature_curation_events enable row level security;
revoke all on table public.estimate_external_item_request_responses,
  public.estimate_external_item_request_events,
  public.external_nomenclature_curation_events from public, anon, authenticated;

create or replace function public.prevent_external_demand_history_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'External demand history is immutable.' using errcode = '42501';
end;
$$;

create trigger prevent_external_demand_event_mutation
before update or delete on public.estimate_external_item_request_events
for each row execute function public.prevent_external_demand_history_mutation();
create trigger prevent_external_demand_response_mutation
before update or delete on public.estimate_external_item_request_responses
for each row execute function public.prevent_external_demand_history_mutation();
create trigger prevent_external_nomenclature_curation_event_mutation
before update or delete on public.external_nomenclature_curation_events
for each row execute function public.prevent_external_demand_history_mutation();

create or replace function public.set_partner_external_item_request(
  target_estimate_id uuid,
  target_estimate_item_id uuid,
  target_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_estimate public.estimates;
  target_item public.estimate_items;
  target_request public.estimate_external_item_requests;
  target_customer public.partner_final_customers;
  next_status text;
  event_name text;
begin
  if target_action not in ('request', 'cancel') then
    raise exception 'External demand action is invalid.' using errcode = '22023';
  end if;

  select * into target_estimate from public.estimates
  where id = target_estimate_id for update;
  if target_estimate.id is null or target_estimate.archived_at is not null
    or target_estimate.lifecycle_status not in ('draft', 'sent', 'accepted')
    or not public.can_access_estimates(target_estimate.company_id, 'estimates.manage') then
    raise exception 'Estimate is not available.' using errcode = '42501';
  end if;

  select * into target_item from public.estimate_items
  where id = target_estimate_item_id and estimate_id = target_estimate.id and line_type = 'external';
  if target_item.id is null then
    raise exception 'External estimate item was not found.' using errcode = 'P0002';
  end if;

  select * into target_request from public.estimate_external_item_requests
  where estimate_item_id = target_item.id for update;
  if target_request.id is null then
    raise exception 'External estimate request ledger was not found.' using errcode = 'P0002';
  end if;

  if target_action = 'request' then
    if target_request.status in ('new', 'reviewing', 'solution_proposed', 'closed') then
      return jsonb_build_object('id', target_request.id, 'status', target_request.status, 'version', target_request.version, 'repeated', true);
    end if;
    next_status := 'new';
    event_name := case when target_request.status = 'cancelled' then 'reopened' else 'requested' end;
    if target_estimate.final_customer_id is not null then
      select * into target_customer from public.partner_final_customers
      where id = target_estimate.final_customer_id and company_id = target_estimate.company_id;
    end if;
    update public.estimate_external_item_requests
    set status = next_status,
        version = version + 1,
        requested_by = auth.uid(),
        requested_at = now(),
        cancelled_by = null,
        cancelled_at = null,
        final_customer_id = target_estimate.final_customer_id,
        final_customer_industry_code = target_customer.industry_code,
        final_customer_locality = target_customer.locality,
        project_name = target_estimate.project_name,
        estimate_lifecycle_status = target_estimate.lifecycle_status,
        requested_quantity = target_item.quantity,
        requested_unit = target_item.unit,
        updated_at = now()
    where id = target_request.id
    returning * into target_request;
  else
    if target_request.status = 'cancelled' then
      return jsonb_build_object('id', target_request.id, 'status', target_request.status, 'version', target_request.version, 'repeated', true);
    end if;
    if target_request.status <> 'new' then
      raise exception 'This request can no longer be cancelled.' using errcode = '22023';
    end if;
    next_status := 'cancelled';
    event_name := 'cancelled';
    update public.estimate_external_item_requests
    set status = next_status, version = version + 1, cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
    where id = target_request.id
    returning * into target_request;
  end if;

  insert into public.estimate_external_item_request_events(
    request_id, company_id, actor_user_id, event_type, from_status, to_status, context
  ) values (
    target_request.id, target_estimate.company_id, auth.uid(), event_name,
    case when event_name = 'requested' then null when event_name = 'reopened' then 'cancelled' else 'new' end,
    next_status,
    jsonb_build_object(
      'estimateId', target_estimate.id,
      'estimateItemId', target_item.id,
      'externalNomenclatureId', target_item.external_nomenclature_id,
      'finalCustomerId', target_estimate.final_customer_id,
      'industryCode', target_customer.industry_code,
      'locality', target_customer.locality,
      'projectName', target_estimate.project_name,
      'estimateLifecycle', target_estimate.lifecycle_status,
      'quantity', target_item.quantity,
      'unit', target_item.unit
    )
  );

  return jsonb_build_object('id', target_request.id, 'status', target_request.status, 'version', target_request.version, 'repeated', false);
end;
$$;

create or replace function public.transition_external_item_request(
  target_request_id uuid,
  expected_version integer,
  target_status text,
  target_response_type text default null,
  target_catalog_product_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.estimate_external_item_requests;
  old_status text;
  created_response_id uuid;
begin
  if not public.has_internal_permission('admin.external_demand.manage') then
    raise exception 'External demand management is not available.' using errcode = '42501';
  end if;
  select * into target_request from public.estimate_external_item_requests where id = target_request_id for update;
  if target_request.id is null or target_request.status is null then
    raise exception 'External demand request was not found.' using errcode = 'P0002';
  end if;
  if target_request.version <> expected_version then
    raise exception 'External demand request was changed by another session.' using errcode = '40001';
  end if;
  if not (
    (target_request.status = 'new' and target_status in ('reviewing', 'closed'))
    or (target_request.status = 'reviewing' and target_status in ('solution_proposed', 'closed'))
    or (target_request.status = 'solution_proposed' and target_status in ('reviewing', 'closed'))
  ) then
    raise exception 'External demand transition is invalid.' using errcode = '22023';
  end if;
  if target_status = 'solution_proposed' and target_response_type is null then
    raise exception 'A governed response is required.' using errcode = '22023';
  end if;
  if target_response_type is not null then
    if target_response_type not in ('catalog_product', 'governed_alternative', 'sourcing_review', 'cannot_supply') then
      raise exception 'External demand response is invalid.' using errcode = '22023';
    end if;
    if target_response_type in ('catalog_product', 'governed_alternative') then
      if target_catalog_product_id is null or not exists (
        select 1 from public.catalog_products product
        where product.id = target_catalog_product_id and product.is_active and product.is_visible
      ) then
        raise exception 'Catalog solution is not available.' using errcode = '22023';
      end if;
    elsif target_catalog_product_id is not null then
      raise exception 'Catalog product is not valid for this response.' using errcode = '22023';
    end if;
    insert into public.estimate_external_item_request_responses(request_id, response_type, catalog_product_id, created_by)
    values (target_request.id, target_response_type, target_catalog_product_id, auth.uid()) returning id into created_response_id;
  end if;
  old_status := target_request.status;
  update public.estimate_external_item_requests
  set status = target_status, version = version + 1, updated_at = now()
  where id = target_request.id returning * into target_request;
  insert into public.estimate_external_item_request_events(request_id, company_id, actor_user_id, event_type, from_status, to_status, context)
  values (target_request.id, target_request.company_id, auth.uid(), target_status, old_status, target_status,
    jsonb_build_object('responseId', created_response_id, 'responseType', target_response_type, 'catalogProductId', target_catalog_product_id));
  return jsonb_build_object('id', target_request.id, 'status', target_request.status, 'version', target_request.version);
end;
$$;

create or replace function public.list_admin_external_demand(
  search_query text default null,
  status_filter text default null,
  result_limit integer default 25,
  result_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text := lower(btrim(coalesce(search_query, '')));
  bounded_limit integer := least(greatest(coalesce(result_limit, 25), 1), 50);
  bounded_offset integer := greatest(coalesce(result_offset, 0), 0);
begin
  if not public.has_internal_permission('admin.external_demand.view') then
    raise exception 'External demand is not available.' using errcode = '42501';
  end if;
  return (
    with demand as (
      select coalesce(item.canonical_item_id, item.id) canonical_id,
        count(distinct estimate.id) estimate_count,
        count(distinct estimate.company_id) partner_count,
        count(distinct estimate.final_customer_id) filter (where estimate.final_customer_id is not null) customer_count,
        sum(line.quantity) requested_quantity,
        min(estimate.created_at) first_observed,
        max(estimate.updated_at) last_observed,
        count(distinct request.id) filter (where request.status is not null and request.status <> 'cancelled') explicit_request_count
      from public.estimate_items line
      join public.estimates estimate on estimate.id = line.estimate_id
      join public.external_nomenclature_items item on item.id = line.external_nomenclature_id
      left join public.estimate_external_item_requests request on request.estimate_item_id = line.id
      where line.line_type = 'external' and estimate.archived_at is null and estimate.status <> 'archived'
        and (status_filter is null or request.status = status_filter)
      group by coalesce(item.canonical_item_id, item.id)
    ), visible as (
      select demand.*, item.manufacturer, item.model, item.name, item.category, item.unit,
        count(*) over() total_count
      from demand join public.external_nomenclature_items item on item.id = demand.canonical_id
      where normalized_query = '' or lower(item.manufacturer || ' ' || item.model || ' ' || item.name || ' ' || coalesce(item.category, '')) like '%' || normalized_query || '%'
    ), page as (
      select * from visible order by explicit_request_count desc, last_observed desc, canonical_id
      offset bounded_offset limit bounded_limit
    )
    select jsonb_build_object(
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'externalItemId', canonical_id, 'manufacturer', manufacturer, 'model', model, 'name', name,
        'category', category, 'unit', unit, 'estimateCount', estimate_count, 'partnerCount', partner_count,
        'customerCount', customer_count, 'requestedQuantity', requested_quantity, 'firstObserved', first_observed,
        'lastObserved', last_observed, 'explicitRequestCount', explicit_request_count
      ) order by explicit_request_count desc, last_observed desc, canonical_id), '[]'::jsonb),
      'total', coalesce(max(total_count), 0)
    ) from page
  );
end;
$$;

create or replace function public.get_admin_external_demand_detail(target_external_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_internal_permission('admin.external_demand.view') then
    raise exception 'External demand is not available.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'item', jsonb_build_object('externalItemId', item.id, 'manufacturer', item.manufacturer, 'model', item.model, 'name', item.name, 'category', item.category, 'unit', item.unit),
      'requests', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', request.id, 'status', request.status, 'version', request.version,
          'companyName', company.display_name, 'estimateId', estimate.id, 'estimateNumber', estimate.estimate_number,
          'estimateLifecycle', estimate.lifecycle_status, 'customerName', estimate.customer_name,
          'industryCode', request.final_customer_industry_code, 'locality', request.final_customer_locality,
          'projectName', request.project_name, 'quantity', request.requested_quantity, 'unit', request.requested_unit,
          'requestedAt', request.requested_at,
          'responses', coalesce((select jsonb_agg(jsonb_build_object('id', response.id, 'type', response.response_type, 'catalogProductId', response.catalog_product_id, 'createdAt', response.created_at) order by response.created_at) from public.estimate_external_item_request_responses response where response.request_id = request.id), '[]'::jsonb)
        ) order by request.requested_at desc)
        from public.estimate_external_item_requests request
        join public.estimates estimate on estimate.id = request.estimate_id
        join public.partner_companies company on company.id = request.company_id
        where exists (
          select 1 from public.external_nomenclature_items request_item
          where request_item.id = request.external_nomenclature_id
            and coalesce(request_item.canonical_item_id, request_item.id) = item.id
        )
          and request.status is not null and estimate.archived_at is null
      ), '[]'::jsonb),
      'possibleDuplicates', coalesce((
        select jsonb_agg(jsonb_build_object('id', candidate.id, 'manufacturer', candidate.manufacturer, 'model', candidate.model, 'name', candidate.name))
        from public.external_nomenclature_items candidate
        where candidate.id <> item.id and candidate.canonical_item_id is null and candidate.is_active
          and candidate.normalized_manufacturer = item.normalized_manufacturer
          and (candidate.normalized_model = item.normalized_model or candidate.normalized_name = item.normalized_name)
      ), '[]'::jsonb)
    )
    from public.external_nomenclature_items item
    where item.id = target_external_item_id and item.canonical_item_id is null
  );
end;
$$;

create or replace function public.search_admin_external_demand_products(search_query text, result_limit integer default 10)
returns table (id uuid, sku text, name text)
language plpgsql stable security definer set search_path = public as $$
declare normalized_query text := btrim(coalesce(search_query, '')); bounded_limit integer := least(greatest(coalesce(result_limit, 10), 1), 20);
begin
  if not public.has_internal_permission('admin.external_demand.manage') then raise exception 'Catalog solution search is not available.' using errcode = '42501'; end if;
  if char_length(normalized_query) < 2 then return; end if;
  return query select product.id, product.sku, product.name from public.catalog_products product
  where product.is_active and product.is_visible and (product.sku ilike '%' || normalized_query || '%' or product.name ilike '%' || normalized_query || '%')
  order by (lower(product.sku) = lower(normalized_query)) desc, product.name, product.id limit bounded_limit;
end;
$$;

create or replace function public.curate_external_nomenclature_duplicate(
  source_item_id uuid,
  target_canonical_item_id uuid,
  curation_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare canonical_id uuid;
begin
  if not public.has_internal_permission('admin.external_demand.manage') then raise exception 'External nomenclature curation is not available.' using errcode = '42501'; end if;
  if source_item_id = target_canonical_item_id or char_length(btrim(coalesce(curation_reason, ''))) < 10 then raise exception 'Curation input is invalid.' using errcode = '22023'; end if;
  select id into canonical_id from public.external_nomenclature_items where id = target_canonical_item_id and canonical_item_id is null and is_active for update;
  if canonical_id is null or not exists (select 1 from public.external_nomenclature_items where id = source_item_id and canonical_item_id is null and is_active for update) then raise exception 'External nomenclature item was not found.' using errcode = 'P0002'; end if;
  update public.external_nomenclature_items set canonical_item_id = canonical_id, updated_at = now() where id = source_item_id;
  insert into public.external_nomenclature_curation_events(source_item_id, canonical_item_id, actor_user_id, reason)
  values (source_item_id, canonical_id, auth.uid(), btrim(curation_reason));
  return canonical_id;
end;
$$;

create or replace function public.search_external_nomenclature(search_query text, result_limit integer default 8)
returns table (id uuid, manufacturer text, model text, name text, category text, unit text, specification text, exact_identity_match boolean)
language plpgsql stable security definer set search_path = public as $$
declare normalized_query text; bounded_limit integer := least(greatest(coalesce(result_limit, 8), 1), 12);
begin
  if auth.uid() is null or not exists (select 1 from public.company_memberships membership where membership.user_id = auth.uid() and membership.status = 'active' and public.can_access_estimates(membership.company_id, 'estimates.view')) then raise exception 'External nomenclature is not available.' using errcode = '42501'; end if;
  normalized_query := public.normalize_external_nomenclature_text(coalesce(search_query, ''));
  if char_length(normalized_query) < 2 then return; end if;
  return query select item.id, item.manufacturer, item.model, item.name, item.category, item.unit, item.specification,
    (item.normalized_manufacturer || item.normalized_model = normalized_query)
  from public.external_nomenclature_items item
  where item.is_active and item.canonical_item_id is null and (
    item.normalized_manufacturer like '%' || normalized_query || '%' or item.normalized_model like '%' || normalized_query || '%'
    or item.normalized_name like '%' || normalized_query || '%' or item.normalized_manufacturer || item.normalized_model = normalized_query)
  order by (item.normalized_manufacturer || item.normalized_model = normalized_query) desc,
    extensions.similarity(item.normalized_manufacturer || ' ' || item.normalized_model || ' ' || item.normalized_name, normalized_query) desc, item.name, item.id
  limit bounded_limit;
end;
$$;

revoke all on function public.prevent_external_demand_history_mutation(),
  public.populate_external_item_request_identity(),
  public.set_partner_external_item_request(uuid, uuid, text),
  public.transition_external_item_request(uuid, integer, text, text, uuid),
  public.list_admin_external_demand(text, text, integer, integer),
  public.get_admin_external_demand_detail(uuid),
  public.search_admin_external_demand_products(text, integer),
  public.curate_external_nomenclature_duplicate(uuid, uuid, text) from public, anon;
revoke execute on function public.prevent_external_demand_history_mutation() from authenticated;
revoke execute on function public.populate_external_item_request_identity() from authenticated;
grant execute on function public.set_partner_external_item_request(uuid, uuid, text),
  public.transition_external_item_request(uuid, integer, text, text, uuid),
  public.list_admin_external_demand(text, text, integer, integer),
  public.get_admin_external_demand_detail(uuid),
  public.search_admin_external_demand_products(text, integer),
  public.curate_external_nomenclature_duplicate(uuid, uuid, text) to authenticated;
