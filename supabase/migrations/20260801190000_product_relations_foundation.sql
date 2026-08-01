create table if not exists public.product_relation_sync_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  lock_acquired_at timestamptz,
  analog_rows_received integer not null default 0 check (analog_rows_received >= 0),
  related_rows_received integer not null default 0 check (related_rows_received >= 0),
  rows_staged integer not null default 0 check (rows_staged >= 0),
  rows_published integer not null default 0 check (rows_published >= 0),
  source_products_with_analogs integer not null default 0 check (source_products_with_analogs >= 0),
  source_products_with_related integer not null default 0 check (source_products_with_related >= 0),
  unmapped_sources integer not null default 0 check (unmapped_sources >= 0),
  unmapped_targets integer not null default 0 check (unmapped_targets >= 0),
  inactive_targets integer not null default 0 check (inactive_targets >= 0),
  unpublished_targets integer not null default 0 check (unpublished_targets >= 0),
  outside_scope_targets integer not null default 0 check (outside_scope_targets >= 0),
  outside_scope_sources integer not null default 0 check (outside_scope_sources >= 0),
  self_relations integer not null default 0 check (self_relations >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  malformed_rows integer not null default 0 check (malformed_rows >= 0),
  characteristic_rows integer not null default 0 check (characteristic_rows >= 0),
  pages_processed integer not null default 0 check (pages_processed >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  safe_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_relation_sync_one_running_idx
  on public.product_relation_sync_runs ((status)) where status = 'running';
create index if not exists product_relation_sync_started_idx
  on public.product_relation_sync_runs (started_at desc);

create table if not exists public.product_relation_sync_stage (
  sync_id uuid not null references public.product_relation_sync_runs(id) on delete cascade,
  relation_type text not null check (relation_type in ('analog', 'related')),
  source_product_external_1c_id text not null,
  target_product_external_1c_id text not null,
  source_characteristic_external_1c_id text,
  target_characteristic_external_1c_id text,
  source_priority integer not null default 0 check (source_priority >= 0),
  source_ordinal integer not null check (source_ordinal >= 0),
  source_fingerprint text not null,
  created_at timestamptz not null default now()
);
create index if not exists product_relation_stage_sync_idx
  on public.product_relation_sync_stage (sync_id, relation_type, source_product_external_1c_id);

create table if not exists public.product_relation_sync_rejections (
  id bigint generated always as identity primary key,
  sync_id uuid not null references public.product_relation_sync_runs(id) on delete cascade,
  relation_type text check (relation_type in ('analog', 'related')),
  reason text not null check (reason in (
    'invalid_shape', 'invalid_source', 'invalid_target', 'unmapped_source',
    'unmapped_target', 'inactive_target', 'unpublished_target',
    'outside_scope_source', 'outside_scope_target', 'self_relation', 'duplicate_row',
    'invalid_characteristic'
  )),
  source_product_external_1c_id text,
  target_product_external_1c_id text,
  page_number integer,
  row_index integer,
  created_at timestamptz not null default now()
);
create index if not exists product_relation_rejections_sync_idx
  on public.product_relation_sync_rejections (sync_id, reason);

create table if not exists public.product_relations (
  id uuid primary key default gen_random_uuid(),
  source_product_id uuid not null references public.catalog_products(id) on delete cascade,
  target_product_id uuid not null references public.catalog_products(id) on delete cascade,
  relation_type text not null check (relation_type in ('analog', 'related')),
  source_product_external_1c_id text not null,
  target_product_external_1c_id text not null,
  source_characteristic_external_1c_id text,
  target_characteristic_external_1c_id text,
  source_fingerprint text not null,
  source_version text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  synchronized_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_relations_not_self check (source_product_id <> target_product_id),
  constraint product_relations_logical_unique unique (source_product_id, target_product_id, relation_type)
);
create index if not exists product_relations_source_idx
  on public.product_relations (source_product_id, relation_type, is_active, sort_order, target_product_id);

alter table public.product_relation_sync_runs enable row level security;
alter table public.product_relation_sync_stage enable row level security;
alter table public.product_relation_sync_rejections enable row level security;
alter table public.product_relations enable row level security;

revoke all on table public.product_relation_sync_runs from public, anon, authenticated;
revoke all on table public.product_relation_sync_stage from public, anon, authenticated;
revoke all on table public.product_relation_sync_rejections from public, anon, authenticated;
revoke all on table public.product_relations from public, anon, authenticated;
grant all on table public.product_relation_sync_runs to service_role;
grant all on table public.product_relation_sync_stage to service_role;
grant all on table public.product_relation_sync_rejections to service_role;
grant all on table public.product_relations to service_role;
grant usage, select on sequence public.product_relation_sync_rejections_id_seq to service_role;

create or replace function public.publish_product_relation_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  run public.product_relation_sync_runs%rowtype;
  published_count integer;
  analog_sources integer;
  related_sources integer;
  duplicate_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('product_relation_publication'));
  select * into run from public.product_relation_sync_runs where id = p_sync_id for update;
  if run.id is null or run.status <> 'running' then
    raise exception 'invalid_relation_sync_state' using errcode = '22023';
  end if;

  insert into public.product_relation_sync_rejections(
    sync_id, relation_type, reason, source_product_external_1c_id,
    target_product_external_1c_id
  )
  select p_sync_id, stage.relation_type,
    case
      when source.id is null then 'unmapped_source'
      when target.id is null then 'unmapped_target'
      when source.id = target.id then 'self_relation'
      when not source.is_active or not source.is_visible then 'outside_scope_source'
      when not target.is_active then 'inactive_target'
      when not target.is_visible then 'unpublished_target'
      else 'outside_scope_target'
    end,
    stage.source_product_external_1c_id,
    stage.target_product_external_1c_id
  from public.product_relation_sync_stage stage
  left join public.catalog_products source
    on lower(source.external_1c_id) = lower(stage.source_product_external_1c_id)
  left join public.catalog_products target
    on lower(target.external_1c_id) = lower(stage.target_product_external_1c_id)
  where stage.sync_id = p_sync_id
    and (
      source.id is null or target.id is null or source.id = target.id
      or not source.is_active or not source.is_visible
      or not target.is_active or not target.is_visible
    );

  with ranked as (
    select stage.*,
      row_number() over (
        partition by stage.relation_type, stage.source_product_external_1c_id,
          stage.target_product_external_1c_id
        order by stage.source_priority, stage.source_ordinal, stage.source_fingerprint
      ) as row_rank
    from public.product_relation_sync_stage stage
    where stage.sync_id = p_sync_id
  )
  select count(*) into duplicate_count from ranked where row_rank > 1;

  delete from public.product_relations;
  insert into public.product_relations(
    source_product_id, target_product_id, relation_type,
    source_product_external_1c_id, target_product_external_1c_id,
    source_characteristic_external_1c_id, target_characteristic_external_1c_id,
    source_fingerprint, source_version, sort_order, synchronized_at
  )
  select source.id, target.id, ranked.relation_type,
    ranked.source_product_external_1c_id, ranked.target_product_external_1c_id,
    ranked.source_characteristic_external_1c_id,
    ranked.target_characteristic_external_1c_id,
    ranked.source_fingerprint, p_sync_id::text, ranked.source_priority, now()
  from (
    select stage.*,
      row_number() over (
        partition by stage.relation_type, stage.source_product_external_1c_id,
          stage.target_product_external_1c_id
        order by stage.source_priority, stage.source_ordinal, stage.source_fingerprint
      ) as row_rank
    from public.product_relation_sync_stage stage
    where stage.sync_id = p_sync_id
  ) ranked
  join public.catalog_products source
    on lower(source.external_1c_id) = lower(ranked.source_product_external_1c_id)
    and source.is_active and source.is_visible
  join public.catalog_products target
    on lower(target.external_1c_id) = lower(ranked.target_product_external_1c_id)
    and target.is_active and target.is_visible
  where ranked.row_rank = 1 and source.id <> target.id;

  get diagnostics published_count = row_count;
  select count(distinct source_product_id) filter (where relation_type = 'analog'),
         count(distinct source_product_id) filter (where relation_type = 'related')
  into analog_sources, related_sources
  from public.product_relations;

  perform public.enqueue_all_partner_commercial_opportunity_companies();

  update public.product_relation_sync_runs sync
  set status = 'succeeded', finished_at = now(), lock_acquired_at = null,
      rows_published = published_count,
      source_products_with_analogs = coalesce(analog_sources, 0),
      source_products_with_related = coalesce(related_sources, 0),
      duplicate_rows = sync.duplicate_rows + duplicate_count,
      unmapped_sources = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'unmapped_source'),
      unmapped_targets = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'unmapped_target'),
      inactive_targets = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'inactive_target'),
      unpublished_targets = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'unpublished_target'),
      outside_scope_targets = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'outside_scope_target'),
      outside_scope_sources = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'outside_scope_source'),
      self_relations = (select count(*) from public.product_relation_sync_rejections where sync_id = p_sync_id and reason = 'self_relation'),
      duration_ms = greatest(0, floor(extract(epoch from (now() - sync.started_at)) * 1000)::integer),
      updated_at = now()
  where sync.id = p_sync_id;

  return jsonb_build_object(
    'syncId', p_sync_id, 'published', published_count,
    'sourceProductsWithAnalogs', coalesce(analog_sources, 0),
    'sourceProductsWithRelated', coalesce(related_sources, 0)
  );
end;
$$;

create or replace function public.get_partner_product_relations(
  p_source_product_id uuid,
  p_limit integer default 5
)
returns table (
  relation_type text,
  target_product_id uuid,
  source_priority integer,
  synchronized_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.company_memberships membership
    join public.partner_companies company on company.id = membership.company_id
    where membership.user_id = auth.uid()
      and membership.status = 'active' and company.status = 'active'
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.catalog_products product
    where product.id = p_source_product_id and product.is_active and product.is_visible
  ) then return; end if;

  return query
  with ranked as (
    select relation.relation_type, relation.target_product_id,
      relation.sort_order, relation.synchronized_at,
      row_number() over (
        partition by relation.relation_type
        order by relation.sort_order,
          case when coalesce(stock.available_quantity, 0) > 0 then 0 else 1 end,
          case when arrival.expected_arrival_date is not null then 0 else 1 end,
          target.sort_order, lower(target.name), target.id
      ) as rank
    from public.product_relations relation
    join public.catalog_products target on target.id = relation.target_product_id
      and target.is_active and target.is_visible
    left join public.product_stock_totals stock on stock.product_id = target.id
      and stock.is_published
    left join lateral (
      select min(expected.expected_arrival_date) as expected_arrival_date
      from public.product_supplier_arrivals expected
      where expected.product_id = target.id and expected.is_published
        and expected.expected_arrival_date >= current_date
    ) arrival on true
    where relation.source_product_id = p_source_product_id and relation.is_active
  )
  select ranked.relation_type, ranked.target_product_id, ranked.sort_order,
    ranked.synchronized_at
  from ranked where rank <= least(greatest(p_limit, 1), 5)
  order by ranked.relation_type, rank;
end;
$$;

create or replace function public.get_product_relation_sync_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'latestRun', (select to_jsonb(run) from public.product_relation_sync_runs run order by started_at desc limit 1),
    'activeLock', exists(select 1 from public.product_relation_sync_runs where status = 'running'),
    'published', (select count(*) from public.product_relations where is_active),
    'distribution', jsonb_build_object(
      'zero', (select count(*) from public.catalog_products product where product.is_active and product.is_visible and not exists (select 1 from public.product_relations relation where relation.source_product_id = product.id and relation.is_active)),
      'one', (select count(*) from (select source_product_id from public.product_relations where is_active group by source_product_id having count(*) = 1) grouped),
      'twoToFive', (select count(*) from (select source_product_id from public.product_relations where is_active group by source_product_id having count(*) between 2 and 5) grouped),
      'overFive', (select count(*) from (select source_product_id from public.product_relations where is_active group by source_product_id having count(*) > 5) grouped)
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.inspect_product_relations(
  p_search text default null,
  p_relation_type text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  source_sku text, source_name text, relation_type text,
  target_sku text, target_name text, target_active boolean,
  target_visible boolean, source_version text, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query select source.sku, source.name, relation.relation_type,
    target.sku, target.name, target.is_active, target.is_visible,
    relation.source_version, count(*) over()
  from public.product_relations relation
  join public.catalog_products source on source.id = relation.source_product_id
  join public.catalog_products target on target.id = relation.target_product_id
  where (p_relation_type is null or relation.relation_type = p_relation_type)
    and (nullif(btrim(p_search), '') is null or source.sku ilike '%' || btrim(p_search) || '%' or source.name ilike '%' || btrim(p_search) || '%')
  order by source.sku, relation.relation_type, relation.sort_order, target.sku
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.get_product_relation_quality_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare result jsonb;
begin
  if not public.has_internal_permission('admin.integrations.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'publishedProducts', count(*),
    'withoutAnalogs', count(*) filter (where analog_count = 0),
    'withoutRelated', count(*) filter (where related_count = 0),
    'fewerThanTwoAnalogs', count(*) filter (where analog_count < 2),
    'fewerThanTwoRelated', count(*) filter (where related_count < 2)
  ) into result
  from (
    select product.id,
      count(relation.id) filter (where relation.relation_type = 'analog') as analog_count,
      count(relation.id) filter (where relation.relation_type = 'related') as related_count
    from public.catalog_products product
    left join public.product_relations relation on relation.source_product_id = product.id and relation.is_active
    where product.is_active and product.is_visible
    group by product.id
  ) counts;
  return result;
end;
$$;

revoke all on function public.publish_product_relation_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.get_partner_product_relations(uuid, integer) from public, anon;
revoke all on function public.get_product_relation_sync_health() from public, anon;
revoke all on function public.inspect_product_relations(text, text, integer, integer) from public, anon;
revoke all on function public.get_product_relation_quality_report() from public, anon;
grant execute on function public.publish_product_relation_snapshot(uuid) to service_role;
grant execute on function public.get_partner_product_relations(uuid, integer) to authenticated;
grant execute on function public.get_product_relation_sync_health() to authenticated;
grant execute on function public.inspect_product_relations(text, text, integer, integer) to authenticated;
grant execute on function public.get_product_relation_quality_report() to authenticated;
