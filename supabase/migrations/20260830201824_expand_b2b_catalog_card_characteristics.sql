begin;

create or replace function public.catalog_card_characteristic_priority(p_label text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_label ~* '(resolution|разрешение|rezolu)' then 0
    when p_label ~* '(data.?transmission|network.?transmission|передач.*данн|transmitere.?date)' then 1
    when p_label ~* '(light.?sensitiv|светочувств|sensibilitate.?lum)' then 2
    when p_label ~* '(analytics|ivs|smd|аналитик|analitic)' then 3
    when p_label ~* '(micro.?sd|memory.?card|card.?capacity|карта.?памят|объем.?памят|volum.?memorie)' then 4
    when p_label ~* '(ir.?distance|infrared.?distance|дальност.*ик|distan.*ir)' then 5
    when p_label ~* '(lens|focal|объектив|фокус|obiectiv|focal)' then 6
    when p_label ~* '(technology|технолог|tehnolog)' then 7
    when p_label ~* '(ingress.?protection|protection.?class|ip.?rating|степен.?защит|класс.?защит|grad.?protect)' then 8
    when p_label ~* '(form.?factor|форм.?фактор)' then 9
    else 10
  end;
$$;

revoke all on function public.catalog_card_characteristic_priority(text)
  from public, anon, authenticated;

create or replace function public.catalog_partner_page_v5(
  p_company_id uuid,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_search text default null,
  p_availability text default 'all',
  p_filters jsonb default '{}'::jsonb,
  p_merchandising_label text default null,
  p_sort text default 'default',
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_result jsonb;
  enriched_items jsonb;
begin
  base_result := public.catalog_partner_page_v3(
    p_company_id,
    p_category_id,
    p_brand_id,
    p_search,
    p_availability,
    p_filters,
    p_merchandising_label,
    p_sort,
    p_limit,
    p_offset
  );

  with page_items as (
    select
      page.item,
      (page.item ->> 'id')::uuid as product_id,
      page.ordinal
    from jsonb_array_elements(coalesce(base_result -> 'items', '[]'::jsonb))
      with ordinality page(item, ordinal)
  ),
  ranked_characteristics as (
    select
      attribute.product_id,
      attribute.attribute_key,
      attribute.label,
      public.catalog_public_attribute_value(
        attribute.resolution_status,
        attribute.display_value,
        attribute.resolved_display_value
      ) as display_value,
      btrim(attribute.display_value) as filter_value,
      attribute.value_type,
      row_number() over (
        partition by attribute.product_id
        order by
          public.catalog_card_characteristic_priority(attribute.label),
          attribute.label,
          attribute.attribute_key
      ) as characteristic_rank
    from page_items page
    join public.catalog_product_attributes attribute
      on attribute.product_id = page.product_id
    where attribute.is_visible
      and attribute.is_filterable
      and attribute.resolution_status in ('not_required', 'resolved')
      and attribute.attribute_key ~ '^property_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and nullif(btrim(attribute.display_value), '') is not null
      and char_length(btrim(attribute.display_value)) <= 160
      and btrim(attribute.display_value) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.catalog_public_attribute_value(
        attribute.resolution_status,
        attribute.display_value,
        attribute.resolved_display_value
      ) is not null
  ),
  characteristics_by_product as (
    select
      characteristic.product_id,
      jsonb_agg(
        jsonb_build_object(
          'key', characteristic.attribute_key,
          'label', characteristic.label,
          'value', characteristic.display_value,
          'filterValue', characteristic.filter_value,
          'isFilterable', true,
          'valueType', characteristic.value_type
        ) order by characteristic.characteristic_rank
      ) as characteristics
    from ranked_characteristics characteristic
    where characteristic.characteristic_rank <= 5
    group by characteristic.product_id
  )
  select coalesce(
    jsonb_agg(
      page.item || jsonb_build_object(
        'key_characteristics',
        coalesce(characteristics.characteristics, '[]'::jsonb)
      ) order by page.ordinal
    ),
    '[]'::jsonb
  )
  into enriched_items
  from page_items page
  left join characteristics_by_product characteristics
    on characteristics.product_id = page.product_id;

  return base_result || jsonb_build_object('items', enriched_items);
end;
$$;

revoke all on function public.catalog_partner_page_v5(
  uuid, uuid, uuid, text, text, jsonb, text, text, integer, integer
) from public, anon;
grant execute on function public.catalog_partner_page_v5(
  uuid, uuid, uuid, text, text, jsonb, text, text, integer, integer
) to authenticated;

comment on function public.catalog_partner_page_v5(
  uuid, uuid, uuid, text, text, jsonb, text, text, integer, integer
) is
  'Returns the canonical permission-aware partner catalog page plus at most five governed filterable characteristics for each bounded page item.';

commit;
