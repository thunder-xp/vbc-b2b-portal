begin;

create table public.current_warehouse_replenishment (
  singleton_key smallint primary key default 1 check (singleton_key = 1),
  source_kind text not null check (source_kind in ('historical_bootstrap', 'detected_transition')),
  source_arrival_id uuid null references public.warehouse_arrivals(id) on delete restrict,
  source_order_ref text not null check (source_order_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  source_order_number text not null,
  source_document_date date not null,
  detected_at timestamptz not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create table public.current_warehouse_replenishment_items (
  singleton_key smallint not null references public.current_warehouse_replenishment(singleton_key) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  source_line_number integer not null check (source_line_number > 0),
  primary key (singleton_key, product_id),
  unique (singleton_key, source_line_number, product_id)
);

create index current_warehouse_replenishment_items_order_idx
  on public.current_warehouse_replenishment_items(singleton_key, source_line_number, product_id);

alter table public.current_warehouse_replenishment enable row level security;
alter table public.current_warehouse_replenishment force row level security;
alter table public.current_warehouse_replenishment_items enable row level security;
alter table public.current_warehouse_replenishment_items force row level security;
revoke all on table
  public.current_warehouse_replenishment,
  public.current_warehouse_replenishment_items
from public, anon, authenticated;

with candidate as (
  select state.source_order_ref, state.source_order_number,
    state.source_document_date, state.last_seen_at
  from public.supplier_order_source_states state
  where state.current_state_ref = '585a9991-314b-11e9-a7dc-94de80db60f1'
    and state.is_posted and not state.is_deleted and not state.is_closed
    and state.source_document_date is not null
    and exists (
      select 1
      from public.supplier_order_source_items item
      join public.catalog_products product
        on product.external_1c_id = item.external_product_ref
       and product.is_active and product.is_visible
      where item.source_order_ref = state.source_order_ref
    )
  order by state.source_document_date desc,
    state.source_order_number desc, state.source_order_ref desc
  limit 1
)
insert into public.current_warehouse_replenishment(
  singleton_key, source_kind, source_order_ref, source_order_number,
  source_document_date, detected_at, source_fingerprint
)
select 1, 'historical_bootstrap', candidate.source_order_ref,
  candidate.source_order_number, candidate.source_document_date,
  candidate.last_seen_at,
  encode(digest(concat_ws('|', 'historical_bootstrap',
    candidate.source_order_ref, candidate.source_document_date::text), 'sha256'), 'hex')
from candidate;

insert into public.current_warehouse_replenishment_items(
  singleton_key, product_id, source_line_number
)
select 1, mapped.product_id, min(mapped.line_number)
from public.current_warehouse_replenishment current
join (
  select item.source_order_ref, item.line_number, product.id product_id
  from public.supplier_order_source_items item
  join public.catalog_products product
    on product.external_1c_id = item.external_product_ref
   and product.is_active and product.is_visible
) mapped on mapped.source_order_ref = current.source_order_ref
where current.singleton_key = 1
group by mapped.product_id;

create function public.get_partner_current_warehouse_replenishment(p_company_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
set row_security = off
as $$
declare result jsonb;
begin
  if auth.uid() is null
    or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id, 'catalog.view') then
    raise exception 'Warehouse replenishment access denied.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'productId', item.product_id,
      'sourceLineNumber', item.source_line_number
    ) order by item.source_line_number, item.product_id), '[]'::jsonb)
  ) into result
  from public.current_warehouse_replenishment_items item
  join public.catalog_products product
    on product.id = item.product_id
   and product.is_active and product.is_visible
  where item.singleton_key = 1;

  return coalesce(result, jsonb_build_object('items', '[]'::jsonb));
end;
$$;

revoke all on function public.get_partner_current_warehouse_replenishment(uuid)
  from public, anon, authenticated;
grant execute on function public.get_partner_current_warehouse_replenishment(uuid)
  to authenticated;

create or replace function public.list_public_retail_products_v2(
  p_locale text default 'ru', p_category_slug text default null,
  p_search text default null, p_availability text default null,
  p_facets jsonb default '{}'::jsonb, p_mode text default null,
  p_limit integer default 24, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if p_locale not in ('ru', 'ro') or p_limit not between 1 and 48
    or p_offset < 0 or p_offset > 10000
    or (p_mode is not null and p_mode not in ('popular','new','special','replenishment','price_asc','price_desc'))
    or (p_availability is not null and p_availability not in ('in_stock','low_stock','available_to_order','unavailable','unknown'))
    or (p_search is not null and char_length(btrim(p_search)) > 100)
    or jsonb_typeof(p_facets) <> 'object'
    or (select count(*) from jsonb_object_keys(p_facets)) > 8
    or exists (
      select 1 from jsonb_each(p_facets) selected(key, values)
      where char_length(selected.key) > 160 or jsonb_typeof(selected.values) <> 'array'
        or jsonb_array_length(selected.values) not between 1 and 10
        or exists (select 1 from jsonb_array_elements(selected.values) value
          where jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') > 1000)
    ) then raise exception 'Public Retail list input is invalid.' using errcode = '22023'; end if;

  with current_products as (
    select product.* from public.public_retail_products product
    join public.public_retail_publications publication
      on publication.id = product.publication_id and publication.status = 'published'
    where (p_category_slug is null or exists (
        select 1 from jsonb_array_elements(product.category_path) path
        where path->>'slug' = p_category_slug))
      and (p_availability is null or product.availability = p_availability)
      and (p_search is null or lower(product.search_document) like '%' || lower(btrim(p_search)) || '%')
      and (nullif(btrim(p_search), '') is not null or p_mode is null
        or p_mode not in ('popular','new','special')
        or (p_mode = 'popular' and 'TOP' = any(product.merchandising_labels))
        or (p_mode = 'new' and 'NEW' = any(product.merchandising_labels))
        or (p_mode = 'special' and 'SPECIAL_OFFER' = any(product.merchandising_labels)))
      and (p_mode is distinct from 'replenishment' or exists (
        select 1
        from public.public_retail_product_identities identity
        join public.current_warehouse_replenishment_items replenishment
          on replenishment.product_id = identity.source_product_id
         and replenishment.singleton_key = 1
        where identity.public_id = product.public_id
      ))
      and not exists (
        select 1 from jsonb_each(p_facets) selected(key, values)
        where not exists (
          select 1 from jsonb_array_elements(product.specifications) specification
          where specification->>'key' = selected.key
            and specification->>'value' in (select jsonb_array_elements_text(selected.values))))
  ), page as (
    select * from current_products order by
      case when p_mode = 'replenishment' and availability in ('in_stock','low_stock') then 0
           when p_mode = 'replenishment' then 1 end,
      case when p_mode = 'replenishment' then (
        select min(replenishment.source_line_number)
        from public.public_retail_product_identities identity
        join public.current_warehouse_replenishment_items replenishment
          on replenishment.product_id = identity.source_product_id
         and replenishment.singleton_key = 1
        where identity.public_id = current_products.public_id
      ) end,
      case when p_mode = 'popular' then popular_priority end desc nulls last,
      case when p_mode = 'new' then new_started_at end desc nulls last,
      case when p_mode = 'new' then new_priority end desc nulls last,
      case when p_mode = 'special' then special_offer_priority end desc nulls last,
      case when p_mode = 'price_asc' then retail_price_amount end asc,
      case when p_mode = 'price_desc' then retail_price_amount end desc,
      sort_order, name_ru, public_id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(public.build_public_retail_product_summary(page::public.public_retail_products, p_locale) order by
      case when p_mode = 'replenishment' and page.availability in ('in_stock','low_stock') then 0
           when p_mode = 'replenishment' then 1 end,
      case when p_mode = 'replenishment' then (
        select min(replenishment.source_line_number)
        from public.public_retail_product_identities identity
        join public.current_warehouse_replenishment_items replenishment
          on replenishment.product_id = identity.source_product_id
         and replenishment.singleton_key = 1
        where identity.public_id = page.public_id
      ) end,
      case when p_mode = 'popular' then page.popular_priority end desc nulls last,
      case when p_mode = 'new' then page.new_started_at end desc nulls last,
      case when p_mode = 'new' then page.new_priority end desc nulls last,
      case when p_mode = 'special' then page.special_offer_priority end desc nulls last,
      case when p_mode = 'price_asc' then page.retail_price_amount end asc,
      case when p_mode = 'price_desc' then page.retail_price_amount end desc,
      page.sort_order, page.name_ru, page.public_id), '[]'::jsonb),
    'totalCount', (select count(*) from current_products),
    'limit', p_limit, 'offset', p_offset
  ) into result from page;
  return coalesce(result, jsonb_build_object(
    'items','[]'::jsonb,'totalCount',0,'limit',p_limit,'offset',p_offset));
end;
$$;

create function public.get_public_retail_showcase_v2(p_locale text default 'ru')
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare base_showcase jsonb; replenishment jsonb;
begin
  if p_locale not in ('ru', 'ro') then
    raise exception 'Public Retail showcase input is invalid.' using errcode = '22023';
  end if;
  base_showcase := public.get_public_retail_showcase(p_locale);
  replenishment := public.list_public_retail_products_v2(p_locale, null, null, null, '{}'::jsonb, 'replenishment', 5, 0);
  return base_showcase || jsonb_build_object('replenishment', replenishment->'items');
end;
$$;

revoke all on function public.get_public_retail_showcase_v2(text)
  from public, anon, authenticated;
grant execute on function public.get_public_retail_showcase_v2(text)
  to anon, authenticated;

alter function public.publish_exact_stock_snapshot(uuid)
  rename to publish_exact_stock_snapshot_current_replenishment_base;

create function public.publish_exact_stock_snapshot(p_sync_id uuid)
returns jsonb
language plpgsql security invoker
set search_path = public, extensions
as $$
declare
  base_result jsonb;
  selected_arrival record;
begin
  base_result := public.publish_exact_stock_snapshot_current_replenishment_base(p_sync_id);

  select arrival.id, arrival.source_order_ref, arrival.source_order_number,
    state.source_document_date, arrival.completed_at, arrival.fingerprint
  into selected_arrival
  from public.warehouse_arrivals arrival
  join public.supplier_order_source_states state
    on state.source_order_ref = arrival.source_order_ref
  where arrival.source_sync_id = p_sync_id
    and arrival.mapped_product_count > 0
    and state.source_document_date is not null
  order by arrival.completed_at desc, state.source_document_date desc,
    arrival.source_order_number desc, arrival.source_order_ref desc
  limit 1;

  if selected_arrival.id is not null then
    insert into public.current_warehouse_replenishment(
      singleton_key, source_kind, source_arrival_id, source_order_ref,
      source_order_number, source_document_date, detected_at,
      source_fingerprint, updated_at
    ) values (
      1, 'detected_transition', selected_arrival.id,
      selected_arrival.source_order_ref, selected_arrival.source_order_number,
      selected_arrival.source_document_date, selected_arrival.completed_at,
      selected_arrival.fingerprint, now()
    ) on conflict (singleton_key) do update set
      source_kind = excluded.source_kind,
      source_arrival_id = excluded.source_arrival_id,
      source_order_ref = excluded.source_order_ref,
      source_order_number = excluded.source_order_number,
      source_document_date = excluded.source_document_date,
      detected_at = excluded.detected_at,
      source_fingerprint = excluded.source_fingerprint,
      updated_at = excluded.updated_at;

    delete from public.current_warehouse_replenishment_items
    where singleton_key = 1;
    insert into public.current_warehouse_replenishment_items(
      singleton_key, product_id, source_line_number
    )
    select 1, item.product_id, min(item.source_line_number)
    from public.warehouse_arrival_items item
    join public.catalog_products product
      on product.id = item.product_id
     and product.is_active and product.is_visible
    where item.arrival_id = selected_arrival.id and item.product_id is not null
    group by item.product_id;

    update public.partner_notifications notification
    set action_url = '/cabinet/catalog/replenishment',
      action_label = 'Посмотреть пополнение'
    where notification.event_code = 'warehouse_arrival_completed'
      and notification.entity_id = selected_arrival.id;

    update public.partner_notifications notification
    set archived_at = coalesce(notification.archived_at, now())
    where notification.event_code = 'warehouse_arrival_completed'
      and notification.entity_id is distinct from selected_arrival.id
      and notification.archived_at is null;
  end if;

  return base_result || jsonb_build_object(
    'current_warehouse_replenishment_updated', selected_arrival.id is not null
  );
end;
$$;

revoke all on function
  public.publish_exact_stock_snapshot_current_replenishment_base(uuid),
  public.publish_exact_stock_snapshot(uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_exact_stock_snapshot_current_replenishment_base(uuid),
  public.publish_exact_stock_snapshot(uuid)
to service_role;

update public.partner_notifications
set action_url = '/cabinet/catalog/replenishment',
  action_label = 'Посмотреть пополнение'
where event_code = 'warehouse_arrival_completed'
  and entity_id = (
    select source_arrival_id
    from public.current_warehouse_replenishment
    where singleton_key = 1
  );

update public.partner_notifications
set archived_at = coalesce(archived_at, now())
where event_code = 'warehouse_arrival_completed'
  and entity_id is distinct from (
    select source_arrival_id
    from public.current_warehouse_replenishment
    where singleton_key = 1
  )
  and archived_at is null;

create function public.get_partner_workspace_dashboard_v5(p_company_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
set row_security = off
as $$
declare result jsonb; adjusted jsonb;
begin
  result := public.get_partner_workspace_dashboard_v4(p_company_id);
  select coalesce(jsonb_agg(
    case when item->>'kind' = 'notification_warehouse_arrival_completed'
      then item || jsonb_build_object(
        'href', '/cabinet/catalog/replenishment',
        'ctaLabel', 'Посмотреть пополнение'
      ) else item end order by ordinal
  ), '[]'::jsonb)
  into adjusted
  from jsonb_array_elements(coalesce(result->'attentionItems', '[]'::jsonb))
    with ordinality as entries(item, ordinal);
  return jsonb_set(result, '{attentionItems}', adjusted);
end;
$$;

revoke all on function public.get_partner_workspace_dashboard_v5(uuid)
  from public, anon, authenticated;
grant execute on function public.get_partner_workspace_dashboard_v5(uuid)
  to authenticated;

comment on table public.current_warehouse_replenishment is
  'Private singleton pointer to the latest qualifying replenishment; supplier identity never leaves governed projections.';
comment on table public.current_warehouse_replenishment_items is
  'Exact active catalog mappings for the current replenishment, ordered by source line without procurement quantities.';
comment on function public.get_partner_current_warehouse_replenishment(uuid) is
  'Returns only current exact catalog product IDs to an authorized active partner company.';

commit;
