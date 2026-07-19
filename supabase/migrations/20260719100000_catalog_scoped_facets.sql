-- One bounded facet query for the current catalog scope. The current facet's
-- own selection is excluded while all other active filters remain applied.
create or replace function public.catalog_partner_facets(
  p_company_id uuid,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_search text default null,
  p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_max_values integer default 30
)
returns table(
  attribute_key text,
  label text,
  display_value text,
  product_count bigint,
  product_coverage bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view')
    or (p_availability <> 'all' and not public.has_permission(p_company_id, 'stock.view'))
  then
    raise exception 'Catalog facet access denied.' using errcode = '42501';
  end if;

  if p_availability not in ('all', 'in_stock', 'expected')
    or p_max_values not between 1 and 50
    or jsonb_typeof(coalesce(p_filters, '{}'::jsonb)) <> 'object'
  then
    raise exception 'Invalid catalog facet input.' using errcode = '22023';
  end if;

  return query
  with recursive category_scope as (
    select c.id
    from public.catalog_categories c
    where p_category_id is not null and c.id = p_category_id and c.is_active
    union all
    select child.id
    from public.catalog_categories child
    join category_scope parent on child.parent_id = parent.id
    where child.is_active
  ),
  scoped_products as (
    select p.id
    from public.catalog_products p
    left join public.catalog_brands b on b.id = p.brand_id and b.is_active
    where p.is_active and p.is_visible
      and (p_category_id is null or p.category_id in (select id from category_scope))
      and (p_brand_id is null or p.brand_id = p_brand_id)
      and (
        nullif(btrim(p_search), '') is null
        or lower(p.sku) = lower(btrim(p_search))
        or lower(p.sku) like lower(btrim(p_search)) || '%'
        or p.name ilike '%' || btrim(p_search) || '%'
        or b.name ilike '%' || btrim(p_search) || '%'
        or (char_length(btrim(p_search)) >= 3 and p.short_description ilike '%' || btrim(p_search) || '%')
      )
      and (
        p_availability = 'all'
        or (p_availability = 'in_stock' and exists (
          select 1 from public.product_stock_totals stock
          where stock.product_id = p.id and stock.is_published and stock.available_quantity > 0
        ))
        or (p_availability = 'expected' and exists (
          select 1 from public.product_supplier_arrivals arrival
          where arrival.product_id = p.id and arrival.is_published
            and arrival.expected_quantity > 0 and arrival.expected_arrival_date >= current_date
        ))
      )
  ),
  counted as (
    select
      candidate.attribute_key,
      min(candidate.label) as label,
      public.catalog_public_attribute_value(
        candidate.resolution_status,
        candidate.display_value,
        candidate.resolved_display_value
      ) as display_value,
      count(distinct product.id) as product_count
    from scoped_products product
    join public.catalog_product_attributes candidate on candidate.product_id = product.id
    where candidate.is_filterable and candidate.is_visible
      and public.catalog_public_attribute_value(
        candidate.resolution_status,
        candidate.display_value,
        candidate.resolved_display_value
      ) is not null
      and not exists (
        select 1
        from jsonb_each(coalesce(p_filters, '{}'::jsonb)) selected_filter
        where selected_filter.key <> candidate.attribute_key
          and not exists (
            select 1
            from public.catalog_product_attributes selected
            where selected.product_id = product.id
              and selected.attribute_key = selected_filter.key
              and selected.is_filterable and selected.is_visible
              and public.catalog_public_attribute_value(
                selected.resolution_status,
                selected.display_value,
                selected.resolved_display_value
              ) in (select jsonb_array_elements_text(selected_filter.value))
          )
      )
    group by
      candidate.attribute_key,
      public.catalog_public_attribute_value(
        candidate.resolution_status,
        candidate.display_value,
        candidate.resolved_display_value
      )
  ),
  ranked as (
    select
      counted.*,
      sum(counted.product_count) over (partition by counted.attribute_key) as product_coverage,
      row_number() over (
        partition by counted.attribute_key
        order by counted.product_count desc, counted.display_value
      ) as value_rank
    from counted
  )
  select
    ranked.attribute_key,
    ranked.label,
    ranked.display_value,
    ranked.product_count,
    ranked.product_coverage
  from ranked
  where ranked.value_rank <= p_max_values
    or coalesce(p_filters -> ranked.attribute_key, '[]'::jsonb) ? ranked.display_value
  order by ranked.attribute_key, ranked.product_count desc, ranked.display_value;
end;
$$;

revoke all on function public.catalog_partner_facets(uuid, uuid, uuid, text, text, jsonb, integer)
  from public, anon;
grant execute on function public.catalog_partner_facets(uuid, uuid, uuid, text, text, jsonb, integer)
  to authenticated;

comment on function public.catalog_partner_facets(uuid, uuid, uuid, text, text, jsonb, integer) is
  'Returns bounded attribute facets for the current partner catalog scope in one query.';
