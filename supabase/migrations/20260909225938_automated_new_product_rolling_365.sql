begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.catalog_product_new_facts (
  product_id uuid primary key references public.catalog_products(id) on delete cascade,
  source_created_at timestamp without time zone,
  market_entry_at timestamp without time zone,
  market_entry_source_ref uuid,
  eligible_receipt_count integer not null default 0 check (eligible_receipt_count >= 0),
  source_status text not null check (source_status in (
    'ready', 'missing_creation', 'invalid_creation', 'missing_market_entry',
    'market_entry_before_creation', 'future_market_entry'
  )),
  calculated_at timestamptz not null default now()
);

create index catalog_product_new_facts_market_entry_idx
  on public.catalog_product_new_facts(market_entry_at desc, source_created_at desc, product_id)
  where market_entry_at is not null;

create table public.catalog_product_new_sync_stage (
  sync_id uuid not null,
  product_external_1c_id uuid not null,
  source_created_at timestamp without time zone,
  market_entry_at timestamp without time zone,
  market_entry_source_ref uuid,
  eligible_receipt_count integer not null check (eligible_receipt_count >= 0),
  source_status text not null check (source_status in (
    'ready', 'missing_creation', 'invalid_creation', 'missing_market_entry',
    'market_entry_before_creation', 'future_market_entry'
  )),
  primary key (sync_id, product_external_1c_id)
);

create table public.catalog_product_new_state (
  singleton_key smallint primary key default 1 check (singleton_key = 1),
  status text not null default 'idle' check (status in ('idle', 'succeeded')),
  refresh_id uuid,
  business_date date,
  total_catalog_products integer not null default 0,
  total_creation_requisite_rows integer not null default 0,
  total_eligible_receipts integer not null default 0,
  total_eligible_receipt_lines integer not null default 0,
  catalog_page_count integer not null default 0,
  creation_requisite_page_count integer not null default 0,
  receipt_header_page_count integer not null default 0,
  receipt_line_page_count integer not null default 0,
  automated_new_activated boolean not null default false,
  activated_at timestamptz,
  refreshed_at timestamptz
);

insert into public.catalog_product_new_state(singleton_key) values (1)
on conflict (singleton_key) do nothing;

alter table public.catalog_product_new_facts enable row level security;
alter table public.catalog_product_new_sync_stage enable row level security;
alter table public.catalog_product_new_state enable row level security;

revoke all on table public.catalog_product_new_facts,
  public.catalog_product_new_sync_stage,
  public.catalog_product_new_state from public, anon, authenticated;
grant select, insert, update, delete on table public.catalog_product_new_facts,
  public.catalog_product_new_sync_stage,
  public.catalog_product_new_state to service_role;

create function public.refresh_current_automated_new_assignments()
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  governed_business_date date :=
    (statement_timestamp() at time zone 'Europe/Chisinau')::date;
  affected integer := 0;
begin
  if not coalesce((select state.automated_new_activated
    from public.catalog_product_new_state state where state.singleton_key = 1), false)
  then return 0;
  end if;

  update public.product_merchandising_assignments assignment
  set is_active = false, is_curated_visible = false,
    reason = 'Outside current automated rolling-365 first-import window',
    revoked_at = now(), updated_at = now()
  where assignment.label_code = 'NEW' and assignment.source = 'one_c'
    and assignment.is_active and assignment.revoked_at is null
    and not exists (
      select 1 from public.catalog_product_new_facts fact
      join public.catalog_products product on product.id = fact.product_id
        and product.is_active and product.is_visible
      where fact.product_id = assignment.product_id
        and fact.market_entry_at is not null
        and fact.source_status <> 'market_entry_before_creation'
        and fact.market_entry_at::date between governed_business_date - 364 and governed_business_date
    );

  insert into public.product_merchandising_assignments (
    product_id, label_code, starts_at, ends_at, priority, is_active,
    is_curated_visible, source, reason, created_by, updated_by,
    updated_at, revoked_at
  )
  select fact.product_id, 'NEW',
    fact.market_entry_at at time zone 'Europe/Chisinau',
    ((fact.market_entry_at::date + 365)::timestamp at time zone 'Europe/Chisinau'),
    greatest(0, 1000 - (governed_business_date - fact.market_entry_at::date)),
    true, true, 'one_c',
    'Automated first eligible imported stock receipt',
    null, null, now(), null
  from public.catalog_product_new_facts fact
  join public.catalog_products product on product.id = fact.product_id
    and product.is_active and product.is_visible
  where fact.market_entry_at is not null
    and fact.source_status <> 'market_entry_before_creation'
    and fact.market_entry_at::date between governed_business_date - 364 and governed_business_date
  on conflict (product_id, label_code, source)
    where is_active and revoked_at is null
  do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    priority = excluded.priority, is_curated_visible = true,
    reason = excluded.reason, updated_at = excluded.updated_at, revoked_at = null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_current_automated_new_assignments()
  from public, anon, authenticated, service_role;

create function public.publish_catalog_product_new_facts(
  p_sync_id uuid,
  p_business_date date,
  p_total_catalog_products integer,
  p_total_creation_requisite_rows integer,
  p_total_eligible_receipts integer,
  p_total_eligible_receipt_lines integer,
  p_catalog_page_count integer,
  p_creation_requisite_page_count integer,
  p_receipt_header_page_count integer,
  p_receipt_line_page_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  staged_count integer;
  resolved_count integer;
  activated boolean;
  result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Automated NEW publication access denied.' using errcode = '42501';
  end if;
  if p_sync_id is null or p_business_date is null
    or p_total_catalog_products < 0 or p_total_creation_requisite_rows < 0
    or p_total_eligible_receipts < 0 or p_total_eligible_receipt_lines < 0
    or p_catalog_page_count < 1 or p_creation_requisite_page_count < 1
    or p_receipt_header_page_count < 1 or p_receipt_line_page_count < 0
  then raise exception 'Invalid automated NEW publication input.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog-product-new-publication', 0));
  select count(*)::integer into staged_count
  from public.catalog_product_new_sync_stage stage where stage.sync_id = p_sync_id;
  if staged_count <> p_total_catalog_products then
    raise exception 'Automated NEW staging is incomplete.' using errcode = '23514';
  end if;
  select count(*)::integer into resolved_count
  from public.catalog_product_new_sync_stage stage
  join public.catalog_products product
    on product.external_1c_id = stage.product_external_1c_id::text
  where stage.sync_id = p_sync_id;
  if resolved_count <> staged_count then
    raise exception 'Automated NEW product identity resolution is incomplete.' using errcode = '23514';
  end if;

  insert into public.catalog_product_new_facts (
    product_id, source_created_at, market_entry_at, market_entry_source_ref,
    eligible_receipt_count, source_status, calculated_at
  )
  select product.id, stage.source_created_at, stage.market_entry_at,
    stage.market_entry_source_ref, stage.eligible_receipt_count,
    stage.source_status, now()
  from public.catalog_product_new_sync_stage stage
  join public.catalog_products product
    on product.external_1c_id = stage.product_external_1c_id::text
  where stage.sync_id = p_sync_id
  on conflict (product_id) do update
  set source_created_at = excluded.source_created_at,
    market_entry_at = excluded.market_entry_at,
    market_entry_source_ref = excluded.market_entry_source_ref,
    eligible_receipt_count = excluded.eligible_receipt_count,
    source_status = excluded.source_status,
    calculated_at = excluded.calculated_at;

  delete from public.catalog_product_new_facts fact
  where not exists (
    select 1 from public.catalog_product_new_sync_stage stage
    join public.catalog_products product
      on product.external_1c_id = stage.product_external_1c_id::text
    where stage.sync_id = p_sync_id and product.id = fact.product_id
  );

  update public.catalog_product_new_state state
  set status = 'succeeded', refresh_id = p_sync_id,
    business_date = p_business_date,
    total_catalog_products = p_total_catalog_products,
    total_creation_requisite_rows = p_total_creation_requisite_rows,
    total_eligible_receipts = p_total_eligible_receipts,
    total_eligible_receipt_lines = p_total_eligible_receipt_lines,
    catalog_page_count = p_catalog_page_count,
    creation_requisite_page_count = p_creation_requisite_page_count,
    receipt_header_page_count = p_receipt_header_page_count,
    receipt_line_page_count = p_receipt_line_page_count,
    refreshed_at = now()
  where state.singleton_key = 1
  returning state.automated_new_activated into activated;

  if activated then perform public.refresh_current_automated_new_assignments(); end if;

  select jsonb_build_object(
    'businessDate', p_business_date,
    'totalProducts', count(*),
    'withSourceCreatedAt', count(*) filter (where fact.source_created_at is not null),
    'withoutSourceCreatedAt', count(*) filter (where fact.source_status = 'missing_creation'),
    'invalidSourceCreatedAt', count(*) filter (where fact.source_status = 'invalid_creation'),
    'withMarketEntryAt', count(*) filter (where fact.market_entry_at is not null),
    'withoutMarketEntryAt', count(*) filter (where fact.market_entry_at is null),
    'marketEntryBeforeCreationAnomalies', count(*) filter (where fact.market_entry_at < fact.source_created_at),
    'futureMarketEntryCount', count(*) filter (where fact.market_entry_at::date > p_business_date),
    'new30', count(*) filter (where fact.source_status <> 'market_entry_before_creation' and fact.market_entry_at::date between p_business_date - 29 and p_business_date),
    'new60', count(*) filter (where fact.source_status <> 'market_entry_before_creation' and fact.market_entry_at::date between p_business_date - 59 and p_business_date),
    'new90', count(*) filter (where fact.source_status <> 'market_entry_before_creation' and fact.market_entry_at::date between p_business_date - 89 and p_business_date),
    'new365', count(*) filter (where fact.source_status <> 'market_entry_before_creation' and fact.market_entry_at::date between p_business_date - 364 and p_business_date),
    'automatedNewActivated', activated
  ) into result from public.catalog_product_new_facts fact;
  return result;
end;
$$;

revoke all on function public.publish_catalog_product_new_facts(
  uuid, date, integer, integer, integer, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.publish_catalog_product_new_facts(
  uuid, date, integer, integer, integer, integer, integer, integer, integer, integer
) to service_role;

create function public.prevent_manual_new_management()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.label_code = 'NEW' and new.source = 'manual'
    and current_setting('novotech.automated_new_activation', true) is distinct from 'true'
    and coalesce((select state.automated_new_activated
      from public.catalog_product_new_state state where state.singleton_key = 1), false)
  then raise exception 'MERCHANDISING_NEW_SYSTEM_MANAGED' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger prevent_manual_new_management
before insert or update on public.product_merchandising_assignments
for each row execute function public.prevent_manual_new_management();

create function public.activate_automated_new()
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  dhi_product_id uuid;
  state_row public.catalog_product_new_state%rowtype;
  disabled_manual integer;
  refreshed_assignments integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Automated NEW activation access denied.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog-product-new-publication', 0));
  select * into state_row from public.catalog_product_new_state where singleton_key = 1 for update;
  if state_row.status <> 'succeeded' or state_row.refresh_id is null
    or state_row.business_date <> (statement_timestamp() at time zone 'Europe/Chisinau')::date
  then raise exception 'Automated NEW projection is not current.' using errcode = '23514';
  end if;
  select product.id into dhi_product_id from public.catalog_products product
  where product.external_1c_id = '4b7d580e-02a3-11ed-6a9e-7239d3b7bd5c';
  if dhi_product_id is null or not exists (
    select 1 from public.catalog_product_new_facts fact
    where fact.product_id = dhi_product_id
      and fact.source_created_at = timestamp '2022-07-13 00:00:00'
      and fact.market_entry_at = timestamp '2022-11-14 09:00:00'
      and fact.eligible_receipt_count = 6
      and fact.source_status = 'ready'
  ) then raise exception 'Automated NEW DHI control mismatch.' using errcode = '23514';
  end if;

  perform set_config('novotech.automated_new_activation', 'true', true);
  update public.product_merchandising_assignments assignment
  set is_active = false, is_curated_visible = false,
    reason = 'Superseded by automated first-import NEW projection',
    revoked_at = now(), updated_at = now()
  where assignment.label_code = 'NEW' and assignment.source = 'manual'
    and assignment.is_active and assignment.revoked_at is null;
  get diagnostics disabled_manual = row_count;
  update public.catalog_product_new_state
  set automated_new_activated = true, activated_at = coalesce(activated_at, now())
  where singleton_key = 1;
  refreshed_assignments := public.refresh_current_automated_new_assignments();
  return jsonb_build_object(
    'activated', true, 'refreshId', state_row.refresh_id,
    'disabledManualAssignments', disabled_manual,
    'refreshedAutomatedAssignments', refreshed_assignments,
    'dhiProductId', dhi_product_id
  );
end;
$$;

revoke all on function public.activate_automated_new()
  from public, anon, authenticated;
grant execute on function public.activate_automated_new() to service_role;

create function public.manage_product_merchandising_v3(
  p_request_id uuid, p_operation text, p_product_ids uuid[], p_label_code text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_priority integer, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null or not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'MERCHANDISING_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_label_code = 'NEW' and coalesce((
    select state.automated_new_activated from public.catalog_product_new_state state
    where state.singleton_key = 1
  ), false) then
    raise exception 'MERCHANDISING_NEW_SYSTEM_MANAGED' using errcode = '23514';
  end if;
  return public.manage_product_merchandising_v2(
    p_request_id, p_operation, p_product_ids, p_label_code,
    p_starts_at, p_ends_at, p_priority, p_reason
  );
end;
$$;

revoke all on function public.manage_product_merchandising_v3(
  uuid, text, uuid[], text, timestamptz, timestamptz, integer, text
) from public, anon;
grant execute on function public.manage_product_merchandising_v3(
  uuid, text, uuid[], text, timestamptz, timestamptz, integer, text
) to authenticated;

create function public.get_admin_merchandising_page_v2(
  p_search text default null, p_limit integer default 25, p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select public.get_admin_merchandising_page(p_search, p_limit, p_offset)
    || jsonb_build_object('newSystemManaged', coalesce((
      select state.automated_new_activated
      from public.catalog_product_new_state state where state.singleton_key = 1
    ), false));
$$;

revoke all on function public.get_admin_merchandising_page_v2(text, integer, integer)
  from public, anon;
grant execute on function public.get_admin_merchandising_page_v2(text, integer, integer)
  to authenticated;

create function public.get_published_product_merchandising_v5(
  p_company_id uuid,
  p_label_code text default null,
  p_limit_per_label integer default 5,
  p_rotation_seed text default null,
  p_period_days integer default 30
)
returns table(
  product_id uuid, label_code text, priority integer,
  starts_at timestamptz, ends_at timestamptz, source text,
  matching_product_count integer
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  new_activated boolean := coalesce((select state.automated_new_activated
    from public.catalog_product_new_state state where state.singleton_key = 1), false);
  business_date date := (statement_timestamp() at time zone 'Europe/Chisinau')::date;
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
  then raise exception 'Catalog merchandising access denied.' using errcode = '42501';
  end if;
  if (p_label_code is not null and p_label_code not in ('NEW', 'TOP', 'HOT'))
    or p_limit_per_label not between 1 and 24
    or p_period_days not in (30, 60, 90, 365)
    or (p_label_code is distinct from 'NEW' and p_period_days = 365)
    or (p_rotation_seed is not null and char_length(p_rotation_seed) > 128)
  then raise exception 'Invalid merchandising projection input.' using errcode = '22023';
  end if;

  return query
  with sources as (
    select ranking.product_id, 'TOP'::text as label_code,
      (1001 - ranking.popularity_rank)::integer as priority,
      ranking.refreshed_at as starts_at, null::timestamptz as ends_at,
      'one_c'::text as source,
      null::timestamp without time zone as market_entry_at,
      null::timestamp without time zone as source_created_at
    from public.b2b_product_demand_ranking ranking
    join public.catalog_products product
      on product.id = ranking.product_id and product.is_active and product.is_visible
    where ranking.period_days = p_period_days and ranking.popularity_rank <= 40
      and (p_label_code is null or p_label_code = 'TOP')
    union all
    select fact.product_id, 'NEW',
      greatest(0, 1000 - (business_date - fact.market_entry_at::date)),
      fact.market_entry_at at time zone 'Europe/Chisinau',
      ((fact.market_entry_at::date + case when p_label_code = 'NEW' then p_period_days else 365 end)::timestamp at time zone 'Europe/Chisinau'),
      'one_c', fact.market_entry_at, fact.source_created_at
    from public.catalog_product_new_facts fact
    join public.catalog_products product
      on product.id = fact.product_id and product.is_active and product.is_visible
    where new_activated and fact.market_entry_at is not null
      and fact.source_status <> 'market_entry_before_creation'
      and fact.market_entry_at::date between business_date - (
        case when p_label_code = 'NEW' then p_period_days else 365 end - 1
      ) and business_date
      and (p_label_code is null or p_label_code = 'NEW')
    union all
    select assignment.product_id, assignment.label_code::text,
      assignment.priority, assignment.starts_at, assignment.ends_at,
      assignment.source::text, null::timestamp without time zone,
      null::timestamp without time zone
    from public.product_merchandising_assignments assignment
    join public.catalog_products product
      on product.id = assignment.product_id and product.is_active and product.is_visible
    where assignment.label_code in ('NEW', 'HOT')
      and (assignment.label_code <> 'NEW' or not new_activated)
      and assignment.is_active and assignment.is_curated_visible
      and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
      and (p_label_code is null or assignment.label_code = p_label_code)
  ), ranked as (
    select sources.*,
      row_number() over (partition by sources.label_code order by
        case when sources.label_code in ('TOP', 'NEW') and p_rotation_seed is not null
          then pg_catalog.md5(p_rotation_seed || ':' || sources.product_id::text) end,
        case when sources.label_code = 'NEW' and p_rotation_seed is null
          then sources.market_entry_at end desc nulls last,
        case when sources.label_code = 'NEW' and p_rotation_seed is null
          then sources.source_created_at end desc nulls last,
        sources.priority desc, sources.product_id) as label_rank,
      count(*) over (partition by sources.label_code)::integer as total_count
    from sources
  )
  select ranked.product_id, ranked.label_code, ranked.priority,
    ranked.starts_at, ranked.ends_at, ranked.source, ranked.total_count
  from ranked where ranked.label_rank <= p_limit_per_label
  order by case ranked.label_code when 'TOP' then 1 when 'NEW' then 2 else 3 end,
    ranked.label_rank;
end;
$$;

revoke all on function public.get_published_product_merchandising_v5(
  uuid, text, integer, text, integer
) from public, anon;
grant execute on function public.get_published_product_merchandising_v5(
  uuid, text, integer, text, integer
) to authenticated;

-- Derive the NEW-aware partner catalog from the current complete commerce
-- projection so pricing, stock, filters and permission semantics remain shared.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_page_period_base';
  if definition is null then raise exception 'Required partner catalog period base is missing.'; end if;
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_period_base(',
    'FUNCTION public.catalog_partner_page_new_period_base(');
  changed := replace(changed, 'or p_period_days not in (30, 60, 90)',
    'or p_period_days not in (30, 60, 90, 365)');
  changed := replace(changed,
    'or (p_merchandising_label not in (''REPLENISHMENT'', ''TOP'') and exists (',
    E'or (p_merchandising_label = ''NEW'' and coalesce((select state.automated_new_activated from public.catalog_product_new_state state where state.singleton_key = 1), false) and exists (\n          select 1 from public.catalog_product_new_facts new_fact\n          where new_fact.product_id = product.id\n            and new_fact.market_entry_at is not null\n            and new_fact.source_status <> ''market_entry_before_creation''\n            and new_fact.market_entry_at::date between (statement_timestamp() at time zone ''Europe/Chisinau'')::date - (p_period_days - 1) and (statement_timestamp() at time zone ''Europe/Chisinau'')::date\n        ))\n        or (p_merchandising_label not in (''REPLENISHMENT'', ''TOP'', ''NEW'') and exists (');
  changed := replace(changed,
    E'case when p_merchandising_label = ''TOP'' and effective_sort = ''default''',
    E'case when p_merchandising_label = ''NEW'' and effective_sort = ''default''\n        then (select new_fact.market_entry_at from public.catalog_product_new_facts new_fact where new_fact.product_id = commercial.id) end desc nulls last,\n      case when p_merchandising_label = ''NEW'' and effective_sort = ''default''\n        then (select new_fact.source_created_at from public.catalog_product_new_facts new_fact where new_fact.product_id = commercial.id) end desc nulls last,\n      case when p_merchandising_label = ''TOP'' and effective_sort = ''default''');
  if changed = definition
    or changed not like '%catalog_partner_page_new_period_base%'
    or changed not like '%catalog_product_new_facts new_fact%'
    or changed not like '%p_merchandising_label not in (''REPLENISHMENT'', ''TOP'', ''NEW'')%'
  then raise exception 'Could not derive NEW-aware partner catalog base.';
  end if;
  execute changed;

  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_page_period_v6';
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_period_v6(',
    'FUNCTION public.catalog_partner_page_new_period_v6(');
  changed := replace(changed, 'public.catalog_partner_page_period_base(',
    'public.catalog_partner_page_new_period_base(');
  if changed = definition or changed not like '%catalog_partner_page_new_period_base%' then
    raise exception 'Could not derive NEW-aware partner characteristics projection.';
  end if;
  execute changed;

  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_page_period_v7';
  changed := replace(definition, 'FUNCTION public.catalog_partner_page_period_v7(',
    'FUNCTION public.catalog_partner_page_new_period_v7(');
  changed := replace(changed, 'public.catalog_partner_page_period_v6(',
    'public.catalog_partner_page_new_period_v6(');
  if changed = definition or changed not like '%catalog_partner_page_new_period_v6%' then
    raise exception 'Could not derive NEW-aware partner retail projection.';
  end if;
  execute changed;
end;
$$;

revoke all on function public.catalog_partner_page_new_period_base(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
), public.catalog_partner_page_new_period_v6(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
), public.catalog_partner_page_new_period_v7(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;

create function public.catalog_partner_page_v10(
  p_company_id uuid, p_category_id uuid default null,
  p_category_ids uuid[] default null, p_brand_id uuid default null,
  p_search text default null, p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_merchandising_label text default null, p_sort text default 'default',
  p_limit integer default 12, p_offset integer default 0,
  p_period_days integer default 30
)
returns jsonb
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare payload jsonb; items jsonb;
begin
  if (p_merchandising_label = 'NEW' and p_period_days not in (30, 60, 90, 365))
    or (p_merchandising_label is distinct from 'NEW' and p_period_days not in (30, 60, 90))
  then raise exception 'Invalid merchandising period.' using errcode = '22023';
  end if;
  if p_merchandising_label is distinct from 'NEW' then
    return public.catalog_partner_page_v9(
      p_company_id, p_category_id, p_category_ids, p_brand_id, p_search,
      p_availability, p_filters, p_merchandising_label, p_sort,
      p_limit, p_offset, p_period_days
    );
  end if;
  if not coalesce((select state.automated_new_activated
    from public.catalog_product_new_state state where state.singleton_key = 1), false)
  then
    return public.catalog_partner_page_v8(
      p_company_id, p_category_id, p_category_ids, p_brand_id, p_search,
      p_availability, p_filters, p_merchandising_label, p_sort,
      p_limit, p_offset
    );
  end if;
  payload := public.catalog_partner_page_new_period_v7(
    p_company_id, p_category_id, p_category_ids, p_brand_id, p_search,
    p_availability, p_filters, p_merchandising_label, p_sort,
    p_limit, p_offset, p_period_days
  );
  select coalesce(jsonb_agg(
    case when coalesce(source.item -> 'merchandising_labels', '[]'::jsonb) ? 'NEW'
      then source.item
      else jsonb_set(source.item, '{merchandising_labels}',
        coalesce(source.item -> 'merchandising_labels', '[]'::jsonb) || '"NEW"'::jsonb)
    end order by source.ordinal), '[]'::jsonb)
  into items
  from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
    with ordinality source(item, ordinal);
  return payload || jsonb_build_object('items', items);
end;
$$;

revoke all on function public.catalog_partner_page_v10(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_page_v10(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, text, integer, integer, integer
) to authenticated;

do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'catalog_partner_facets_v4';
  if definition is null then raise exception 'Required partner catalog facets are missing.'; end if;
  changed := replace(definition, 'FUNCTION public.catalog_partner_facets_v4(',
    'FUNCTION public.catalog_partner_facets_v5(');
  changed := replace(changed, 'or p_period_days not in (30, 60, 90)',
    'or p_period_days not in (30, 60, 90, 365)');
  changed := replace(changed,
    'or (p_selection not in (''REPLENISHMENT'', ''TOP'') and exists (',
    E'or (p_selection = ''NEW'' and coalesce((select state.automated_new_activated from public.catalog_product_new_state state where state.singleton_key = 1), false) and exists (\n          select 1 from public.catalog_product_new_facts new_fact\n          where new_fact.product_id = p.id\n            and new_fact.market_entry_at is not null\n            and new_fact.source_status <> ''market_entry_before_creation''\n            and new_fact.market_entry_at::date between (statement_timestamp() at time zone ''Europe/Chisinau'')::date - (p_period_days - 1) and (statement_timestamp() at time zone ''Europe/Chisinau'')::date\n        ))\n        or (p_selection not in (''REPLENISHMENT'', ''TOP'')\n          and (p_selection <> ''NEW'' or not coalesce((select state.automated_new_activated from public.catalog_product_new_state state where state.singleton_key = 1), false))\n          and exists (');
  if changed = definition or changed not like '%catalog_product_new_facts new_fact%'
    or changed not like '%p_selection <> ''NEW'' or not coalesce%'
  then raise exception 'Could not derive NEW-aware partner facets.';
  end if;
  execute changed;
end;
$$;

revoke all on function public.catalog_partner_facets_v5(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_facets_v5(
  uuid, uuid, uuid[], uuid, text, text, jsonb, text, integer, integer
) to authenticated;

create function public.list_public_retail_products_v5(
  p_locale text default 'ru', p_category_slug text default null,
  p_search text default null, p_availability text default null,
  p_facets jsonb default '{}'::jsonb, p_mode text default null,
  p_limit integer default 24, p_offset integer default 0,
  p_period_days integer default 30
)
returns jsonb
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare result jsonb;
begin
  if p_locale not in ('ru', 'ro')
    or p_period_days not in (30, 60, 90, 365)
    or (p_mode is distinct from 'new' and p_period_days = 365)
    or p_limit not between 1 and 48 or p_offset < 0 or p_offset > 10000
    or (p_mode is not null and p_mode not in (
      'popular', 'new', 'special', 'replenishment', 'price_asc', 'price_desc'))
    or (p_availability is not null and p_availability not in (
      'in_stock', 'low_stock', 'available_to_order', 'unavailable', 'unknown'))
    or (p_search is not null and char_length(btrim(p_search)) > 100)
    or jsonb_typeof(p_facets) <> 'object'
    or (select count(*) from jsonb_object_keys(p_facets)) > 8
    or exists (
      select 1 from jsonb_each(p_facets) selected(key, values)
      where char_length(selected.key) > 160
        or jsonb_typeof(selected.values) <> 'array'
        or jsonb_array_length(selected.values) not between 1 and 10
        or exists (select 1 from jsonb_array_elements(selected.values) value
          where jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 1000)
    )
  then raise exception 'Public Retail merchandising period is invalid.' using errcode = '22023';
  end if;
  if p_mode is distinct from 'new' or not coalesce((
    select state.automated_new_activated from public.catalog_product_new_state state
    where state.singleton_key = 1
  ), false) then
    return public.list_public_retail_products_v4(
      p_locale, p_category_slug, p_search, p_availability, p_facets,
      p_mode, p_limit, p_offset,
      case when p_period_days = 365 then 30 else p_period_days end
    );
  end if;

  with current_products as (
    select product as product_row, fact.market_entry_at, fact.source_created_at
    from public.public_retail_products product
    join public.public_retail_publications publication
      on publication.id = product.publication_id and publication.status = 'published'
    join public.public_retail_product_identities identity
      on identity.public_id = product.public_id
    join public.catalog_product_new_facts fact
      on fact.product_id = identity.source_product_id
     and fact.market_entry_at is not null
     and fact.source_status <> 'market_entry_before_creation'
     and fact.market_entry_at::date between
       (statement_timestamp() at time zone 'Europe/Chisinau')::date - (p_period_days - 1)
       and (statement_timestamp() at time zone 'Europe/Chisinau')::date
    where (p_category_slug is null or exists (
      select 1 from jsonb_array_elements(product.category_path) path
      where path ->> 'slug' = p_category_slug))
      and (nullif(btrim(p_search), '') is null
        or lower(product.sku) = lower(btrim(p_search))
        or lower(product.sku) like lower(btrim(p_search)) || '%'
        or product.name_ru ilike '%' || btrim(p_search) || '%'
        or product.name_ro ilike '%' || btrim(p_search) || '%')
      and (p_availability is null or product.availability = p_availability)
      and not exists (
        select 1 from jsonb_each(p_facets) selected(key, values)
        where not exists (
          select 1 from jsonb_array_elements(product.specifications) specification
          where specification ->> 'key' = selected.key
            and specification ->> 'value' in (
              select jsonb_array_elements_text(selected.values))))
  ), page as (
    select * from current_products
    order by market_entry_at desc, source_created_at desc,
      (product_row).sku, (product_row).public_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(
      public.build_public_retail_product_summary(page.product_row, p_locale)
      order by page.market_entry_at desc, page.source_created_at desc,
        (page.product_row).sku, (page.product_row).public_id), '[]'::jsonb),
    'totalCount', (select count(*) from current_products),
    'limit', p_limit, 'offset', p_offset)
  into result from page;
  return coalesce(result, jsonb_build_object(
    'items', '[]'::jsonb, 'totalCount', 0, 'limit', p_limit, 'offset', p_offset));
end;
$$;

revoke all on function public.list_public_retail_products_v5(
  text, text, text, text, jsonb, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_public_retail_products_v5(
  text, text, text, text, jsonb, text, integer, integer, integer
) to anon, authenticated;

create function public.get_public_retail_showcase_v5(
  p_locale text default 'ru', p_rotation_seed text default null,
  p_period_days integer default 30
)
returns jsonb
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
declare
  base jsonb;
  new_items jsonb;
  new_total integer;
  new_activated boolean := coalesce((select state.automated_new_activated
    from public.catalog_product_new_state state where state.singleton_key = 1), false);
begin
  if p_locale not in ('ru', 'ro') or p_period_days not in (30, 60, 90)
    or p_rotation_seed is null
    or p_rotation_seed !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then raise exception 'Public Retail showcase input is invalid.' using errcode = '22023';
  end if;
  base := public.get_public_retail_showcase_v4(p_locale, p_rotation_seed, p_period_days);
  if not new_activated then return base; end if;

  with candidates as (
    select product,
      pg_catalog.md5(p_rotation_seed || ':' || product.public_id::text) as session_rank,
      count(*) over ()::integer as total_count
    from public.public_retail_products product
    join public.public_retail_publications publication
      on publication.id = product.publication_id and publication.status = 'published'
    join public.public_retail_product_identities identity
      on identity.public_id = product.public_id
    join public.catalog_product_new_facts fact
      on fact.product_id = identity.source_product_id
     and fact.market_entry_at is not null
     and fact.source_status <> 'market_entry_before_creation'
     and fact.market_entry_at::date between
       (statement_timestamp() at time zone 'Europe/Chisinau')::date - 364
       and (statement_timestamp() at time zone 'Europe/Chisinau')::date
  ), selected as (
    select * from candidates order by session_rank, (product).public_id limit 5
  )
  select coalesce(jsonb_agg(
      public.build_public_retail_product_summary(selected.product, p_locale)
      order by selected.session_rank, (selected.product).public_id), '[]'::jsonb),
    coalesce(max(selected.total_count), 0)
  into new_items, new_total from selected;
  return base || jsonb_build_object(
    'new', new_items,
    'totalCounts', (base -> 'totalCounts') || jsonb_build_object(
      'new', new_total));
end;
$$;

revoke all on function public.get_public_retail_showcase_v5(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_retail_showcase_v5(text, text, integer)
  to anon, authenticated;

create function public.get_automated_new_diagnostics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare business_date date := (statement_timestamp() at time zone 'Europe/Chisinau')::date;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Automated NEW diagnostics access denied.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'state', (select to_jsonb(state) from public.catalog_product_new_state state where singleton_key = 1),
    'quality', (select jsonb_build_object(
      'totalProducts', count(*),
      'withSourceCreatedAt', count(*) filter (where fact.source_created_at is not null),
      'withoutSourceCreatedAt', count(*) filter (where fact.source_status = 'missing_creation'),
      'invalidSourceCreatedAt', count(*) filter (where fact.source_status = 'invalid_creation'),
      'withMarketEntryAt', count(*) filter (where fact.market_entry_at is not null),
      'withoutMarketEntryAt', count(*) filter (where fact.market_entry_at is null),
      'marketEntryBeforeCreationAnomalies', count(*) filter (where fact.market_entry_at < fact.source_created_at),
      'futureMarketEntryCount', count(*) filter (where fact.market_entry_at::date > business_date),
      'new30', count(*) filter (where fact.source_status <> 'market_entry_before_creation' and fact.market_entry_at::date between business_date - 29 and business_date),
      'new60', count(*) filter (where fact.source_status <> 'market_entry_before_creation' and fact.market_entry_at::date between business_date - 59 and business_date),
      'new90', count(*) filter (where fact.source_status <> 'market_entry_before_creation' and fact.market_entry_at::date between business_date - 89 and business_date),
      'new365', count(*) filter (where fact.source_status <> 'market_entry_before_creation' and fact.market_entry_at::date between business_date - 364 and business_date)
    ) from public.catalog_product_new_facts fact),
    'newest', (select coalesce(jsonb_agg(jsonb_build_object(
        'marketEntryAt', sample.market_entry_at, 'sourceCreatedAt', sample.source_created_at,
        'sku', sample.sku, 'model', sample.model
      ) order by sample.market_entry_at desc, sample.sku, sample.product_id), '[]'::jsonb)
      from (select fact.product_id, fact.market_entry_at, fact.source_created_at, product.sku, product.name as model
        from public.catalog_product_new_facts fact join public.catalog_products product on product.id = fact.product_id
        where fact.market_entry_at is not null order by fact.market_entry_at desc, product.sku, fact.product_id limit 20) sample),
    'boundary365', (select coalesce(jsonb_agg(jsonb_build_object(
        'marketEntryAt', sample.market_entry_at, 'sku', sample.sku, 'model', sample.model,
        'wouldBeNew365', sample.would_be_new_365
      ) order by sample.boundary_distance, sample.market_entry_at desc, sample.sku, sample.product_id), '[]'::jsonb)
      from (select fact.product_id, fact.market_entry_at, product.sku, product.name as model,
          fact.market_entry_at::date between business_date - 364 and business_date as would_be_new_365,
          abs((business_date - fact.market_entry_at::date) - 364) as boundary_distance
        from public.catalog_product_new_facts fact join public.catalog_products product on product.id = fact.product_id
        where fact.market_entry_at is not null
        order by boundary_distance, fact.market_entry_at desc, product.sku, fact.product_id limit 20) sample),
    'dhi', (select jsonb_build_object(
      'sourceCreatedAt', fact.source_created_at, 'marketEntryAt', fact.market_entry_at,
      'eligibleReceiptCount', fact.eligible_receipt_count,
      'new30', fact.market_entry_at::date between business_date - 29 and business_date,
      'new60', fact.market_entry_at::date between business_date - 59 and business_date,
      'new90', fact.market_entry_at::date between business_date - 89 and business_date,
      'new365', fact.market_entry_at::date between business_date - 364 and business_date)
      from public.catalog_product_new_facts fact join public.catalog_products product on product.id = fact.product_id
      where product.external_1c_id = '4b7d580e-02a3-11ed-6a9e-7239d3b7bd5c')
  );
end;
$$;

revoke all on function public.get_automated_new_diagnostics()
  from public, anon, authenticated;
grant execute on function public.get_automated_new_diagnostics() to service_role;

comment on table public.catalog_product_new_facts is
  'Company-neutral private first-import facts. Receipt identities and timestamps never enter public DTOs.';
comment on function public.publish_catalog_product_new_facts(
  uuid, date, integer, integer, integer, integer, integer, integer, integer, integer
) is 'Atomically replaces the complete paginated first-import projection before Public Retail publication.';
comment on function public.activate_automated_new() is
  'Service-role activation gate: requires a current complete projection and exact DHI control evidence before disabling manual NEW.';

commit;
