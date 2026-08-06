begin;

create or replace function public.create_purchasing_list(
  target_company_id uuid,
  target_name text,
  target_description text,
  target_visibility text,
  target_source_type text,
  target_source_reference_id uuid,
  target_items jsonb
)
returns public.purchasing_lists
language plpgsql security definer set search_path = public as $$
declare
  created public.purchasing_lists;
  item_count integer;
begin
  if not public.has_permission(target_company_id, 'purchasing_lists.manage') then
    raise exception 'Purchasing list access denied.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(target_name, ''))) not between 1 and 120
    or char_length(coalesce(target_description, '')) > 1000
    or target_visibility not in ('private', 'company')
    or target_source_type not in ('manual', 'catalog', 'cart', 'order', 'quick_reorder', 'duplicate') then
    raise exception 'Purchasing list input is invalid.' using errcode = '22023';
  end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) > 200 then
    raise exception 'Purchasing list items are invalid.' using errcode = '22023';
  end if;
  item_count := jsonb_array_length(target_items);
  if (select count(distinct row.product_id) from jsonb_to_recordset(target_items) row(product_id uuid, quantity integer)) <> item_count then
    raise exception 'Purchasing list contains duplicate products.' using errcode = '23505';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(target_items) row(product_id uuid, quantity integer)
    where row.quantity not between 1 and 9999
      or not exists (select 1 from public.catalog_products product where product.id = row.product_id)
  ) then raise exception 'Purchasing list item is invalid.' using errcode = '22023'; end if;

  insert into public.purchasing_lists(company_id, name, description, visibility, created_by, updated_by)
  values (target_company_id, btrim(target_name), nullif(btrim(target_description), ''), target_visibility, auth.uid(), auth.uid())
  returning * into created;

  insert into public.purchasing_list_items(
    list_id, product_id, quantity, position, note, source_type, source_reference_id, source_unit_price, source_currency_code
  )
  select created.id, row.product_id, row.quantity, row.ordinality, nullif(btrim(row.note), ''), target_source_type,
    coalesce(row.source_reference_id, target_source_reference_id), row.source_unit_price, upper(nullif(btrim(row.source_currency_code), ''))
  from (
    select parsed.*, entry.ordinality
    from jsonb_array_elements(target_items) with ordinality entry(value, ordinality)
    cross join lateral jsonb_to_record(entry.value) parsed(
      product_id uuid, quantity integer, note text, source_reference_id uuid,
      source_unit_price numeric, source_currency_code text
    )
  ) row;

  insert into public.purchasing_list_events(list_id, actor_user_id, event_type, metadata)
  values (created.id, auth.uid(), 'created', jsonb_build_object('source_type', target_source_type, 'item_count', item_count));
  return created;
end;
$$;

revoke all on function public.create_purchasing_list(uuid, text, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_purchasing_list(uuid, text, text, text, text, uuid, jsonb) to authenticated;

commit;
