alter table public.catalog_sync_state
  add column if not exists guid_like_values_detected integer not null default 0,
  add column if not exists reference_dictionary_values_loaded integer not null default 0;

create or replace function public.catalog_public_attribute_value(
  p_status text, p_display_value text, p_resolved_display_value text
) returns text language sql immutable parallel safe as $$
  select case
    when p_status = 'resolved' and nullif(btrim(p_resolved_display_value), '') is not null then btrim(p_resolved_display_value)
    when p_status = 'not_required'
      and nullif(btrim(p_display_value), '') is not null
      and lower(btrim(p_display_value)) <> '00000000-0000-0000-0000-000000000000'
      and btrim(p_display_value) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then btrim(p_display_value)
    else null
  end;
$$;

create or replace function public.catalog_matching_product_ids(p_category_ids uuid[], p_filters jsonb)
returns table(product_id uuid) language sql stable security invoker as $$
  select p.id from public.catalog_products p
  where p.is_active and p.is_visible
    and (p_category_ids is null or p.category_id = any(p_category_ids))
    and not exists (
      select 1 from jsonb_each(coalesce(p_filters, '{}'::jsonb)) f
      where not exists (
        select 1 from public.catalog_product_attributes a
        where a.product_id = p.id and a.attribute_key = f.key and a.is_filterable and a.is_visible
          and public.catalog_public_attribute_value(a.resolution_status, a.display_value, a.resolved_display_value)
            in (select jsonb_array_elements_text(f.value))
      )
    );
$$;

create or replace function public.catalog_attribute_facets(p_category_ids uuid[], p_filters jsonb)
returns table(attribute_key text, label text, display_value text, product_count bigint, product_coverage bigint)
language sql stable security invoker as $$
  select a.attribute_key, min(a.label),
    public.catalog_public_attribute_value(a.resolution_status, a.display_value, a.resolved_display_value),
    count(distinct p.id), count(distinct p.id)
  from public.catalog_products p join public.catalog_product_attributes a on a.product_id = p.id
  where p.is_active and p.is_visible and (p_category_ids is null or p.category_id = any(p_category_ids))
    and a.is_filterable and a.is_visible
    and public.catalog_public_attribute_value(a.resolution_status, a.display_value, a.resolved_display_value) is not null
    and not exists (
      select 1 from jsonb_each(coalesce(p_filters, '{}'::jsonb)) f
      where f.key <> a.attribute_key and not exists (
        select 1 from public.catalog_product_attributes selected
        where selected.product_id = p.id and selected.attribute_key = f.key and selected.is_filterable and selected.is_visible
          and public.catalog_public_attribute_value(selected.resolution_status, selected.display_value, selected.resolved_display_value)
            in (select jsonb_array_elements_text(f.value))
      )
    )
  group by a.attribute_key,
    public.catalog_public_attribute_value(a.resolution_status, a.display_value, a.resolved_display_value);
$$;

grant execute on function public.catalog_public_attribute_value(text, text, text) to authenticated;
grant execute on function public.catalog_matching_product_ids(uuid[], jsonb) to authenticated;
grant execute on function public.catalog_attribute_facets(uuid[], jsonb) to authenticated;
