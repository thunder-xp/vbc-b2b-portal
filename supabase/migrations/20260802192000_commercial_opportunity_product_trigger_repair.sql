begin;

create or replace function public.enqueue_partner_opportunity_for_relevant_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product uuid;
begin
  if tg_table_name = 'product_prices' then
    product := coalesce(new.product_id, old.product_id);
    if tg_op = 'UPDATE' and row(
      old.product_id, old.external_1c_price_type_id, old.currency,
      old.currency_status, old.price_amount, old.valid_from, old.valid_to,
      old.is_active, old.is_published
    ) is not distinct from row(
      new.product_id, new.external_1c_price_type_id, new.currency,
      new.currency_status, new.price_amount, new.valid_from, new.valid_to,
      new.is_active, new.is_published
    ) then
      return null;
    end if;
  else
    product := coalesce(new.product_id, old.product_id);
  end if;

  insert into public.partner_commercial_opportunity_dirty_companies(company_id, reason)
  select distinct relevance.company_id, tg_table_name
  from (
    select history.company_id
    from public.partner_order_history_items item
    join public.partner_order_history history on history.id = item.order_history_id
    where item.product_id = product and history.partner_visible
    union
    select list.company_id
    from public.purchasing_list_items item
    join public.purchasing_lists list on list.id = item.list_id
    where item.product_id = product and list.archived_at is null
    union
    select template.company_id
    from public.purchase_template_items item
    join public.purchase_templates template on template.id = item.template_id
    where item.product_id = product and template.status = 'active'
    union
    select cart.company_id
    from public.cart_items item
    join public.carts cart on cart.id = item.cart_id
    where item.product_id = product and cart.status = 'active'
  ) relevance
  on conflict (company_id) do update
  set reason = excluded.reason, last_dirtied_at = now(), locked_at = null;
  return null;
end;
$$;

revoke all on function public.enqueue_partner_opportunity_for_relevant_product()
from public, anon, authenticated;

commit;
