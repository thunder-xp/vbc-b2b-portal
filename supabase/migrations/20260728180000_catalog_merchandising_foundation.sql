begin;

insert into public.permissions (
  code, description, scope, delegable_by_partner_owner, sensitive, category
)
values
  (
    'admin.catalog.manage',
    'Manage audited portal-owned catalog merchandising.',
    'internal',
    false,
    true,
    'admin'
  ),
  (
    'admin.analytics.view',
    'View privacy-bounded commercial analytics aggregates.',
    'internal',
    false,
    true,
    'admin'
  )
on conflict (code) do update
set description = excluded.description,
    scope = excluded.scope,
    delegable_by_partner_owner = excluded.delegable_by_partner_owner,
    sensitive = excluded.sensitive,
    category = excluded.category;

with grants(role_code, permission_code) as (
  values
    ('novotech_content_manager', 'admin.catalog.manage'),
    ('novotech_content_manager', 'admin.analytics.view'),
    ('novotech_admin', 'admin.catalog.manage'),
    ('novotech_admin', 'admin.analytics.view')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role
  on role.code = grants.role_code and role.scope = 'internal'
join public.permissions permission
  on permission.code = grants.permission_code
on conflict (role_id, permission_id) do nothing;

create table if not exists public.product_merchandising_assignments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.catalog_products(id) on delete restrict,
  label_code text not null
    check (label_code in ('NEW', 'TOP', 'HOT')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz null,
  priority integer not null default 100
    check (priority between 0 and 1000),
  is_active boolean not null default true,
  is_curated_visible boolean not null default true,
  source text not null default 'manual'
    check (source in ('manual', 'one_c', 'analytics_recommendation')),
  reason text not null
    check (char_length(btrim(reason)) between 3 and 500),
  created_by uuid not null
    references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null
    references public.user_profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null,
  check (ends_at is null or ends_at > starts_at),
  check (label_code <> 'HOT' or ends_at is not null),
  check (source <> 'analytics_recommendation' or is_curated_visible = false)
);

create unique index if not exists
  product_merchandising_active_source_idx
on public.product_merchandising_assignments(product_id, label_code, source)
where is_active and revoked_at is null;

create index if not exists product_merchandising_publication_idx
on public.product_merchandising_assignments(
  label_code, priority desc, starts_at, ends_at, product_id
)
where is_active and is_curated_visible and revoked_at is null;

create index if not exists product_merchandising_product_idx
on public.product_merchandising_assignments(product_id, updated_at desc);

create table if not exists public.product_merchandising_audit_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid null
    references public.product_merchandising_assignments(id) on delete restrict,
  product_id uuid not null
    references public.catalog_products(id) on delete restrict,
  actor_user_id uuid not null
    references public.user_profiles(id) on delete restrict,
  event_type text not null
    check (event_type in ('assigned', 'updated', 'revoked', 'hidden', 'shown')),
  label_code text not null
    check (label_code in ('NEW', 'TOP', 'HOT')),
  reason text not null
    check (char_length(btrim(reason)) between 3 and 500),
  safe_payload jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(safe_payload) = 'object'
      and not (safe_payload ?| array[
        'price', 'amount', 'email', 'token', 'external_1c_id', 'raw'
      ])
    ),
  created_at timestamptz not null default now()
);

create index if not exists product_merchandising_audit_product_idx
on public.product_merchandising_audit_events(product_id, created_at desc);

create or replace function public.validate_product_merchandising_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.catalog_products product
    where product.id = new.product_id
      and product.is_active
      and product.is_visible
  ) and new.is_active and new.is_curated_visible then
    raise exception 'MERCHANDISING_PRODUCT_INACTIVE' using errcode = '23514';
  end if;

  if new.label_code = 'NEW'
    and new.source = 'manual'
    and new.ends_at is null then
    raise exception 'MERCHANDISING_NEW_EXPIRY_REQUIRED' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.product_id is distinct from old.product_id
      or new.label_code is distinct from old.label_code
      or new.source is distinct from old.source
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'MERCHANDISING_IDENTITY_IMMUTABLE' using errcode = '23514';
    end if;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists validate_product_merchandising_assignment
  on public.product_merchandising_assignments;
create trigger validate_product_merchandising_assignment
before insert or update on public.product_merchandising_assignments
for each row execute function public.validate_product_merchandising_assignment();

create or replace function public.prevent_merchandising_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Merchandising audit events are append-only.'
    using errcode = '42501';
end;
$$;

drop trigger if exists prevent_merchandising_audit_mutation
  on public.product_merchandising_audit_events;
create trigger prevent_merchandising_audit_mutation
before update or delete on public.product_merchandising_audit_events
for each row execute function public.prevent_merchandising_audit_mutation();

create or replace function public.manage_product_merchandising(
  p_operation text,
  p_product_ids uuid[],
  p_label_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_priority integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  product_id uuid;
  assignment public.product_merchandising_assignments%rowtype;
  affected integer := 0;
  normalized_reason text := btrim(p_reason);
begin
  if actor_id is null
    or not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'MERCHANDISING_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if p_operation not in ('assign', 'revoke', 'hide', 'show')
    or p_label_code not in ('NEW', 'TOP', 'HOT')
    or coalesce(array_length(p_product_ids, 1), 0) not between 1 and 100
    or p_priority not between 0 and 1000
    or char_length(normalized_reason) not between 3 and 500
    or (p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, now()))
    or (p_operation = 'assign' and p_label_code in ('NEW', 'HOT') and p_ends_at is null)
  then
    raise exception 'MERCHANDISING_INPUT_INVALID' using errcode = '22023';
  end if;

  foreach product_id in array p_product_ids loop
    if p_operation in ('assign', 'show') and not exists (
      select 1
      from public.catalog_products product
      where product.id = product_id
        and product.is_active
        and product.is_visible
    ) then
      raise exception 'MERCHANDISING_PRODUCT_INACTIVE' using errcode = '23514';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(product_id::text || ':' || p_label_code || ':manual', 0)
    );

    select *
    into assignment
    from public.product_merchandising_assignments existing
    where existing.product_id = product_id
      and existing.label_code = p_label_code
      and existing.source = 'manual'
      and existing.is_active
      and existing.revoked_at is null
    for update;

    if p_operation = 'assign' then
      if assignment.id is null then
        insert into public.product_merchandising_assignments (
          product_id, label_code, starts_at, ends_at, priority,
          is_active, is_curated_visible, source, reason,
          created_by, updated_by
        ) values (
          product_id, p_label_code, coalesce(p_starts_at, now()), p_ends_at,
          p_priority, true, true, 'manual', normalized_reason,
          actor_id, actor_id
        )
        returning * into assignment;
      else
        update public.product_merchandising_assignments
        set starts_at = coalesce(p_starts_at, starts_at),
            ends_at = p_ends_at,
            priority = p_priority,
            is_curated_visible = true,
            reason = normalized_reason,
            updated_by = actor_id
        where id = assignment.id
        returning * into assignment;
      end if;
    elsif assignment.id is null then
      raise exception 'MERCHANDISING_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
    elsif p_operation = 'revoke' then
      update public.product_merchandising_assignments
      set is_active = false,
          is_curated_visible = false,
          reason = normalized_reason,
          updated_by = actor_id,
          revoked_at = now()
      where id = assignment.id
      returning * into assignment;
    else
      update public.product_merchandising_assignments
      set is_curated_visible = p_operation = 'show',
          reason = normalized_reason,
          updated_by = actor_id
      where id = assignment.id
      returning * into assignment;
    end if;

    insert into public.product_merchandising_audit_events (
      assignment_id, product_id, actor_user_id, event_type,
      label_code, reason, safe_payload
    ) values (
      assignment.id,
      product_id,
      actor_id,
      case
        when p_operation = 'assign' and assignment.created_at = assignment.updated_at
          then 'assigned'
        when p_operation = 'assign' then 'updated'
        when p_operation = 'revoke' then 'revoked'
        when p_operation = 'hide' then 'hidden'
        else 'shown'
      end,
      p_label_code,
      normalized_reason,
      jsonb_build_object(
        'operation', p_operation,
        'priority', assignment.priority,
        'starts_at', assignment.starts_at,
        'ends_at', assignment.ends_at,
        'source', assignment.source,
        'batch_size', array_length(p_product_ids, 1)
      )
    );

    affected := affected + 1;
  end loop;

  return jsonb_build_object('affected', affected);
end;
$$;

create or replace function public.get_published_product_merchandising(
  p_company_id uuid,
  p_label_code text default null,
  p_limit_per_label integer default 8
)
returns table (
  product_id uuid,
  label_code text,
  priority integer,
  starts_at timestamptz,
  ends_at timestamptz,
  source text
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view') then
    raise exception 'Catalog merchandising access denied.' using errcode = '42501';
  end if;

  if (p_label_code is not null and p_label_code not in ('NEW', 'TOP', 'HOT'))
    or p_limit_per_label not between 1 and 24 then
    raise exception 'Invalid merchandising projection input.' using errcode = '22023';
  end if;

  return query
  with eligible as (
    select
      assignment.product_id,
      assignment.label_code,
      assignment.priority,
      assignment.starts_at,
      assignment.ends_at,
      assignment.source,
      row_number() over (
        partition by assignment.label_code
        order by assignment.priority desc, assignment.updated_at desc,
          product.sort_order, lower(product.name), product.id
      ) as label_rank
    from public.product_merchandising_assignments assignment
    join public.catalog_products product
      on product.id = assignment.product_id
      and product.is_active
      and product.is_visible
    where assignment.is_active
      and assignment.is_curated_visible
      and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
      and (p_label_code is null or assignment.label_code = p_label_code)
  )
  select
    eligible.product_id,
    eligible.label_code,
    eligible.priority,
    eligible.starts_at,
    eligible.ends_at,
    eligible.source
  from eligible
  where eligible.label_rank <= p_limit_per_label
  order by
    case eligible.label_code when 'TOP' then 1 when 'NEW' then 2 else 3 end,
    eligible.label_rank;
end;
$$;

create or replace function public.get_admin_merchandising_page(
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('admin.catalog.view') then
    raise exception 'Merchandising administration access denied.'
      using errcode = '42501';
  end if;

  if p_limit not between 1 and 50 or p_offset < 0
    or char_length(coalesce(p_search, '')) > 100 then
    raise exception 'Invalid merchandising page input.' using errcode = '22023';
  end if;

  with filtered as (
    select
      product.id,
      product.sku,
      product.name,
      product.slug,
      coalesce(product.image_source_url, product.image_url) as image_url,
      product.is_active and product.is_visible as is_published,
      brand.name as brand_name,
      category.name as category_name
    from public.catalog_products product
    left join public.catalog_brands brand on brand.id = product.brand_id
    left join public.catalog_categories category on category.id = product.category_id
    where nullif(btrim(p_search), '') is null
      or product.sku ilike '%' || btrim(p_search) || '%'
      or product.name ilike '%' || btrim(p_search) || '%'
      or brand.name ilike '%' || btrim(p_search) || '%'
      or category.name ilike '%' || btrim(p_search) || '%'
  ),
  page as (
    select *
    from filtered
    order by lower(name), id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'totalCount', (select count(*) from filtered),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'sku', page.sku,
      'name', page.name,
      'slug', page.slug,
      'imageUrl', page.image_url,
      'brandName', page.brand_name,
      'categoryName', page.category_name,
      'isPublished', page.is_published,
      'hasPartnerPrice', exists (
        select 1 from public.product_prices price
        where price.product_id = page.id and price.is_active and price.is_published
      ),
      'hasRetailPrice', exists (
        select 1 from public.product_prices price
        where price.product_id = page.id
          and price.external_1c_price_type_id =
            'd9c92519-658b-11e8-80d3-000c29a58b59'
          and price.is_active and price.is_published
      ),
      'stockState', case
        when stock.available_quantity > 0 then 'in_stock'
        when arrival.product_id is not null then 'expected'
        else 'unavailable'
      end,
      'hasExpectedArrival', arrival.product_id is not null,
      'assignments', coalesce(assignments.items, '[]'::jsonb)
    ) order by lower(page.name), page.id), '[]'::jsonb)
  )
  into result
  from page
  left join public.product_stock_totals stock
    on stock.product_id = page.id and stock.is_published
  left join lateral (
    select candidate.product_id
    from public.product_supplier_arrivals candidate
    where candidate.product_id = page.id
      and candidate.is_published
      and candidate.expected_quantity > 0
      and candidate.expected_arrival_date >= current_date
    limit 1
  ) arrival on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', assignment.id,
      'labelCode', assignment.label_code,
      'startsAt', assignment.starts_at,
      'endsAt', assignment.ends_at,
      'priority', assignment.priority,
      'isActive', assignment.is_active,
      'isCuratedVisible', assignment.is_curated_visible,
      'source', assignment.source,
      'updatedAt', assignment.updated_at,
      'updatedBy', coalesce(editor.full_name, editor.email)
    ) order by assignment.priority desc, assignment.label_code) as items
    from public.product_merchandising_assignments assignment
    left join public.user_profiles editor on editor.id = assignment.updated_by
    where assignment.product_id = page.id
      and assignment.revoked_at is null
  ) assignments on true;

  return coalesce(result, jsonb_build_object(
    'totalCount', 0,
    'items', '[]'::jsonb
  ));
end;
$$;

alter table public.product_merchandising_assignments enable row level security;
alter table public.product_merchandising_audit_events enable row level security;

revoke all on table public.product_merchandising_assignments
  from public, anon, authenticated;
revoke all on table public.product_merchandising_audit_events
  from public, anon, authenticated;

revoke all on function public.manage_product_merchandising(
  text, uuid[], text, timestamptz, timestamptz, integer, text
) from public, anon;
grant execute on function public.manage_product_merchandising(
  text, uuid[], text, timestamptz, timestamptz, integer, text
) to authenticated;

revoke all on function public.get_published_product_merchandising(
  uuid, text, integer
) from public, anon;
grant execute on function public.get_published_product_merchandising(
  uuid, text, integer
) to authenticated;

revoke all on function public.get_admin_merchandising_page(
  text, integer, integer
) from public, anon;
grant execute on function public.get_admin_merchandising_page(
  text, integer, integer
) to authenticated;

comment on table public.product_merchandising_assignments is
  'Portal-owned, audited product discovery labels. Contains no price or stock truth.';
comment on function public.get_published_product_merchandising(uuid, text, integer) is
  'Returns one bounded partner-authorized projection of currently publishable merchandising assignments.';

commit;
