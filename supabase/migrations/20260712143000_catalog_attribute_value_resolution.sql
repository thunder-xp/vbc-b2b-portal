alter table public.catalog_product_attributes
  add column if not exists resolved_display_value text,
  add column if not exists resolution_status text not null default 'not_required',
  add column if not exists resolved_value_ref text;

do $$ begin
  alter table public.catalog_product_attributes add constraint catalog_product_attributes_resolution_status_check
    check (resolution_status in ('not_required', 'resolved', 'unresolved', 'invalid'));
exception when duplicate_object then null; end $$;

create index if not exists catalog_product_attributes_resolved_value_idx
  on public.catalog_product_attributes(attribute_key, resolved_display_value)
  where is_filterable and is_visible;

alter table public.catalog_sync_state
  add column if not exists reference_values_detected integer not null default 0,
  add column if not exists reference_values_resolved integer not null default 0,
  add column if not exists reference_values_unresolved integer not null default 0,
  add column if not exists attributes_hidden_unresolved integer not null default 0;

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
          and a.resolution_status in ('not_required', 'resolved')
          and coalesce(a.resolved_display_value, a.display_value) in (select jsonb_array_elements_text(f.value))
      )
    );
$$;

create or replace function public.catalog_attribute_facets(p_category_ids uuid[], p_filters jsonb)
returns table(attribute_key text, label text, display_value text, product_count bigint, product_coverage bigint)
language sql stable security invoker as $$
  select a.attribute_key, min(a.label), coalesce(a.resolved_display_value, a.display_value), count(distinct p.id), count(distinct p.id)
  from public.catalog_products p join public.catalog_product_attributes a on a.product_id = p.id
  where p.is_active and p.is_visible and (p_category_ids is null or p.category_id = any(p_category_ids))
    and a.is_filterable and a.is_visible and a.resolution_status in ('not_required', 'resolved')
    and coalesce(a.resolved_display_value, a.display_value) <> ''
    and not exists (
      select 1 from jsonb_each(coalesce(p_filters, '{}'::jsonb)) f
      where f.key <> a.attribute_key and not exists (
        select 1 from public.catalog_product_attributes selected
        where selected.product_id = p.id and selected.attribute_key = f.key and selected.is_filterable and selected.is_visible
          and selected.resolution_status in ('not_required', 'resolved')
          and coalesce(selected.resolved_display_value, selected.display_value) in (select jsonb_array_elements_text(f.value))
      )
    )
  group by a.attribute_key, coalesce(a.resolved_display_value, a.display_value);
$$;

grant execute on function public.catalog_matching_product_ids(uuid[], jsonb) to authenticated;
grant execute on function public.catalog_attribute_facets(uuid[], jsonb) to authenticated;
