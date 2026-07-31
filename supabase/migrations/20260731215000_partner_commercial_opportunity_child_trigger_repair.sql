-- Generic row triggers cannot dereference a column that is absent from one of
-- their source tables. JSON record access safely returns null for child rows.
create or replace function public.enqueue_partner_opportunity_from_company_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  old_row jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  company uuid := nullif(coalesce(new_row->>'company_id', old_row->>'company_id'), '')::uuid;
  parent_id uuid;
begin
  if company is null and tg_table_name = 'cart_items' then
    parent_id := nullif(coalesce(new_row->>'cart_id', old_row->>'cart_id'), '')::uuid;
    select value.company_id into company from public.carts value where value.id = parent_id;
  elsif company is null and tg_table_name = 'purchasing_list_items' then
    parent_id := nullif(coalesce(new_row->>'list_id', old_row->>'list_id'), '')::uuid;
    select value.company_id into company from public.purchasing_lists value where value.id = parent_id;
  elsif company is null and tg_table_name = 'purchase_template_items' then
    parent_id := nullif(coalesce(new_row->>'template_id', old_row->>'template_id'), '')::uuid;
    select value.company_id into company from public.purchase_templates value where value.id = parent_id;
  elsif company is null and tg_table_name = 'partner_order_history_items' then
    parent_id := nullif(coalesce(new_row->>'order_history_id', old_row->>'order_history_id'), '')::uuid;
    select value.company_id into company from public.partner_order_history value where value.id = parent_id;
  end if;

  if company is not null then
    perform public.enqueue_partner_commercial_opportunity_company(company, tg_table_name);
  end if;
  return null;
end;
$$;

revoke all on function public.enqueue_partner_opportunity_from_company_source()
  from public, anon, authenticated;
