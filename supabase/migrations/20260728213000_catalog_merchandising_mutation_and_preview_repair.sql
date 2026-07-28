begin;

alter table public.product_merchandising_audit_events
  add column if not exists request_id uuid null;

create unique index if not exists product_merchandising_audit_request_idx
on public.product_merchandising_audit_events(
  request_id, product_id, label_code
)
where request_id is not null;

create or replace function public.manage_product_merchandising_v2(
  p_request_id uuid,
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
  target_product_id uuid;
  assignment public.product_merchandising_assignments%rowtype;
  affected integer := 0;
  normalized_reason text := btrim(p_reason);
  assignment_created boolean;
  result jsonb;
begin
  if actor_id is null
    or not public.has_internal_permission('admin.catalog.manage') then
    raise exception 'MERCHANDISING_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if p_request_id is null
    or p_request_id = '00000000-0000-0000-0000-000000000000'::uuid
    or p_operation not in ('assign', 'revoke', 'hide', 'show')
    or p_label_code not in ('NEW', 'TOP', 'HOT')
    or coalesce(array_length(p_product_ids, 1), 0) not between 1 and 100
    or p_priority not between 0 and 1000
    or char_length(normalized_reason) not between 3 and 500
    or (p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, now()))
    or (
      p_operation in ('assign', 'show')
      and p_label_code in ('NEW', 'HOT')
      and p_ends_at is null
    )
  then
    raise exception 'MERCHANDISING_INVALID_PERIOD' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('merchandising-request:' || p_request_id::text, 0)
  );

  if exists (
    select 1
    from public.product_merchandising_audit_events event
    where event.request_id = p_request_id
  ) then
    select jsonb_build_object(
      'affected', count(distinct event.product_id),
      'assignments', coalesce(jsonb_agg(jsonb_build_object(
        'productId', event.product_id,
        'productName', product.name,
        'sku', product.sku,
        'labelCode', event.label_code
      ) order by product.name, event.product_id), '[]'::jsonb)
    )
    into result
    from public.product_merchandising_audit_events event
    join public.catalog_products product on product.id = event.product_id
    where event.request_id = p_request_id;

    return result;
  end if;

  foreach target_product_id in array p_product_ids loop
    if not exists (
      select 1
      from public.catalog_products product
      where product.id = target_product_id
    ) then
      raise exception 'MERCHANDISING_PRODUCT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if p_operation in ('assign', 'show') and not exists (
      select 1
      from public.catalog_products product
      where product.id = target_product_id
        and product.is_active
        and product.is_visible
    ) then
      raise exception 'MERCHANDISING_PRODUCT_INACTIVE' using errcode = '23514';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        target_product_id::text || ':' || p_label_code || ':manual',
        0
      )
    );

    assignment := null;
    select existing.*
    into assignment
    from public.product_merchandising_assignments existing
    where existing.product_id = target_product_id
      and existing.label_code = p_label_code
      and existing.source = 'manual'
      and existing.is_active
      and existing.revoked_at is null
    for update;

    assignment_created := assignment.id is null;

    if p_operation in ('assign', 'show') then
      if assignment_created then
        insert into public.product_merchandising_assignments (
          product_id, label_code, starts_at, ends_at, priority,
          is_active, is_curated_visible, source, reason,
          created_by, updated_by
        ) values (
          target_product_id,
          p_label_code,
          coalesce(p_starts_at, now()),
          p_ends_at,
          p_priority,
          true,
          true,
          'manual',
          normalized_reason,
          actor_id,
          actor_id
        )
        returning * into assignment;
      else
        update public.product_merchandising_assignments current_assignment
        set starts_at = coalesce(p_starts_at, current_assignment.starts_at),
            ends_at = p_ends_at,
            priority = p_priority,
            is_curated_visible = true,
            reason = normalized_reason,
            updated_by = actor_id
        where current_assignment.id = assignment.id
        returning * into assignment;
      end if;
    elsif assignment.id is null then
      raise exception 'MERCHANDISING_DUPLICATE_ASSIGNMENT'
        using errcode = 'P0002';
    elsif p_operation = 'revoke' then
      update public.product_merchandising_assignments current_assignment
      set is_active = false,
          is_curated_visible = false,
          reason = normalized_reason,
          updated_by = actor_id,
          revoked_at = now()
      where current_assignment.id = assignment.id
      returning * into assignment;
    else
      update public.product_merchandising_assignments current_assignment
      set is_curated_visible = false,
          reason = normalized_reason,
          updated_by = actor_id
      where current_assignment.id = assignment.id
      returning * into assignment;
    end if;

    begin
      insert into public.product_merchandising_audit_events (
        request_id, assignment_id, product_id, actor_user_id, event_type,
        label_code, reason, safe_payload
      ) values (
        p_request_id,
        assignment.id,
        target_product_id,
        actor_id,
        case
          when assignment_created then 'assigned'
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
    exception when others then
      raise exception 'MERCHANDISING_AUDIT_FAILURE' using errcode = 'P0001';
    end;

    affected := affected + 1;
  end loop;

  select jsonb_build_object(
    'affected', affected,
    'assignments', coalesce(jsonb_agg(jsonb_build_object(
      'productId', product.id,
      'productName', product.name,
      'sku', product.sku,
      'labelCode', p_label_code
    ) order by product.name, product.id), '[]'::jsonb)
  )
  into result
  from public.catalog_products product
  where product.id = any(p_product_ids);

  return result;
end;
$$;

create or replace function public.get_admin_merchandising_preview(
  p_limit_per_label integer default 8
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
    raise exception 'MERCHANDISING_PERMISSION_DENIED' using errcode = '42501';
  end if;

  if p_limit_per_label not between 1 and 24 then
    raise exception 'MERCHANDISING_DATABASE_CONSTRAINT' using errcode = '22023';
  end if;

  with eligible as (
    select
      assignment.product_id,
      assignment.label_code,
      assignment.priority,
      product.sku,
      product.name,
      product.slug,
      coalesce(product.image_source_url, product.image_url) as image_url,
      brand.name as brand_name,
      category.name as category_name,
      case
        when stock.available_quantity > 0 then 'in_stock'
        when arrival.product_id is not null then 'expected'
        else 'unavailable'
      end as stock_state,
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
    left join public.catalog_brands brand on brand.id = product.brand_id
    left join public.catalog_categories category on category.id = product.category_id
    left join public.product_stock_totals stock
      on stock.product_id = product.id and stock.is_published
    left join lateral (
      select candidate.product_id
      from public.product_supplier_arrivals candidate
      where candidate.product_id = product.id
        and candidate.is_published
        and candidate.expected_quantity > 0
        and candidate.expected_arrival_date >= current_date
      limit 1
    ) arrival on true
    where assignment.is_active
      and assignment.is_curated_visible
      and assignment.revoked_at is null
      and assignment.source in ('manual', 'one_c')
      and assignment.starts_at <= now()
      and (assignment.ends_at is null or assignment.ends_at > now())
  ),
  bounded as (
    select *
    from eligible
    where label_rank <= p_limit_per_label
  )
  select jsonb_build_object(
    'sections',
    coalesce(jsonb_agg(section order by section_order), '[]'::jsonb)
  )
  into result
  from (
    select
      case label_code when 'TOP' then 1 when 'NEW' then 2 else 3 end
        as section_order,
      jsonb_build_object(
        'labelCode', label_code,
        'products', jsonb_agg(jsonb_build_object(
          'id', product_id,
          'sku', sku,
          'name', name,
          'slug', slug,
          'imageUrl', image_url,
          'brandName', brand_name,
          'categoryName', category_name,
          'stockState', stock_state,
          'priority', priority
        ) order by label_rank)
      ) as section
    from bounded
    group by label_code
  ) sections;

  return coalesce(result, jsonb_build_object('sections', '[]'::jsonb));
end;
$$;

revoke all on function public.manage_product_merchandising_v2(
  uuid, text, uuid[], text, timestamptz, timestamptz, integer, text
) from public, anon;
grant execute on function public.manage_product_merchandising_v2(
  uuid, text, uuid[], text, timestamptz, timestamptz, integer, text
) to authenticated;

revoke all on function public.get_admin_merchandising_preview(integer)
  from public, anon;
grant execute on function public.get_admin_merchandising_preview(integer)
  to authenticated;

comment on function public.manage_product_merchandising_v2(
  uuid, text, uuid[], text, timestamptz, timestamptz, integer, text
) is
  'Atomically mutates audited merchandising with request-level idempotency.';

comment on function public.get_admin_merchandising_preview(integer) is
  'Returns a bounded editorial preview without partner-specific commercial values.';

commit;
