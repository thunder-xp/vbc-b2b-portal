begin;

with valid_owners as (
  select distinct favorite.user_id, favorite.company_id
  from public.partner_product_favorites favorite
  join public.company_memberships membership
    on membership.user_id = favorite.user_id
   and membership.company_id = favorite.company_id
   and membership.status = 'active'
  join public.partner_companies company
    on company.id = favorite.company_id and company.status = 'active'
  join public.catalog_products product
    on product.id = favorite.product_id and product.is_active and product.is_visible
)
insert into public.purchasing_lists(company_id, name, description, visibility, created_by, updated_by, is_system_favorites)
select owner.company_id, 'Избранное', null, 'private', owner.user_id, owner.user_id, true
from valid_owners owner
on conflict (company_id, created_by) where is_system_favorites do nothing;

with valid_favorites as (
  select favorite.user_id, favorite.company_id, favorite.product_id, favorite.created_at
  from public.partner_product_favorites favorite
  join public.company_memberships membership
    on membership.user_id = favorite.user_id
   and membership.company_id = favorite.company_id
   and membership.status = 'active'
  join public.partner_companies company
    on company.id = favorite.company_id and company.status = 'active'
  join public.catalog_products product
    on product.id = favorite.product_id and product.is_active and product.is_visible
),
missing as (
  select list.id as list_id, favorite.product_id,
    row_number() over(partition by list.id order by favorite.created_at, favorite.product_id)::integer as offset_position
  from valid_favorites favorite
  join public.purchasing_lists list
    on list.company_id = favorite.company_id
   and list.created_by = favorite.user_id
   and list.is_system_favorites
  where not exists (
    select 1 from public.purchasing_list_items item
    where item.list_id = list.id and item.product_id = favorite.product_id
  )
),
positioned as (
  select missing.*, coalesce(existing.max_position, 0) + missing.offset_position as position
  from missing
  left join lateral (
    select max(item.position)::integer as max_position
    from public.purchasing_list_items item where item.list_id = missing.list_id
  ) existing on true
)
insert into public.purchasing_list_items(list_id, product_id, quantity, position, source_type)
select list_id, product_id, 1, position, 'legacy_favorite'
from positioned
on conflict (list_id, product_id) do nothing;

do $$
declare total_count bigint; eligible_count bigint;
begin
  select count(*) into total_count from public.partner_product_favorites;
  select count(*) into eligible_count
  from public.partner_product_favorites favorite
  join public.company_memberships membership on membership.user_id = favorite.user_id and membership.company_id = favorite.company_id and membership.status = 'active'
  join public.partner_companies company on company.id = favorite.company_id and company.status = 'active'
  join public.catalog_products product on product.id = favorite.product_id and product.is_active and product.is_visible;
  raise notice 'legacy_favorites_migration total=% eligible=% skipped=%', total_count, eligible_count, total_count - eligible_count;
end;
$$;

revoke insert, update, delete on table public.partner_product_favorites from authenticated;
grant select on table public.partner_product_favorites to authenticated;

comment on table public.partner_product_favorites is
  'Deprecated read-only rollback source. Favorites are owned by the protected purchasing_lists system aggregate.';

commit;
