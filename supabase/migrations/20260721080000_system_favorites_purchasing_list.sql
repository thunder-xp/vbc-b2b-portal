begin;

alter table public.purchasing_lists
  add column if not exists is_system_favorites boolean not null default false;

alter table public.purchasing_lists
  drop constraint if exists purchasing_lists_system_favorites_check;
alter table public.purchasing_lists
  add constraint purchasing_lists_system_favorites_check
  check (not is_system_favorites or (name = 'Избранное' and visibility = 'private' and archived_at is null));

create unique index if not exists purchasing_lists_system_favorites_owner_idx
  on public.purchasing_lists(company_id, created_by)
  where is_system_favorites;

alter table public.purchasing_list_items
  drop constraint if exists purchasing_list_items_source_type_check;
alter table public.purchasing_list_items
  add constraint purchasing_list_items_source_type_check
  check (source_type in ('manual', 'catalog', 'cart', 'order', 'quick_reorder', 'duplicate', 'favorite', 'legacy_favorite'));

create or replace function public.list_purchasing_lists_page_v2(
  target_company_id uuid,
  target_search text,
  target_visibility text,
  target_mine boolean,
  target_archived boolean,
  target_limit integer,
  target_offset integer
)
returns table (
  id uuid, company_id uuid, name text, description text, visibility text, created_by uuid, updated_by uuid,
  revision integer, created_at timestamptz, updated_at timestamptz, archived_at timestamptz,
  is_system_favorites boolean, owner_name text, item_count integer, total_quantity bigint,
  product_ids uuid[], total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission(target_company_id, 'purchasing_lists.view')
    or target_visibility is not null and target_visibility not in ('private', 'company')
    or target_limit not between 1 and 100 or target_offset < 0 then
    raise exception 'Purchasing list query denied.' using errcode = '42501';
  end if;
  return query
  select list.id, list.company_id, list.name, list.description, list.visibility, list.created_by, list.updated_by,
    list.revision, list.created_at, list.updated_at, list.archived_at, list.is_system_favorites,
    coalesce(profile.full_name, 'Пользователь компании'), count(item.id)::integer,
    coalesce(sum(item.quantity), 0)::bigint,
    coalesce(array_agg(item.product_id order by item.position) filter (where item.id is not null), '{}'::uuid[]),
    count(*) over()::bigint
  from public.purchasing_lists list
  left join public.user_profiles profile on profile.id = list.created_by
  left join public.purchasing_list_items item on item.list_id = list.id
  where list.company_id = target_company_id
    and public.can_view_purchasing_list(list)
    and case when target_archived then list.archived_at is not null else list.archived_at is null end
    and (target_visibility is null or list.visibility = target_visibility)
    and (not target_mine or list.created_by = auth.uid())
    and (target_search is null or list.name ilike '%' || target_search || '%' or list.description ilike '%' || target_search || '%')
  group by list.id, profile.full_name
  order by list.is_system_favorites desc, list.updated_at desc, list.id
  limit target_limit offset target_offset;
end;
$$;

revoke all on function public.list_purchasing_lists_page_v2(uuid, text, text, boolean, boolean, integer, integer) from public, anon;
grant execute on function public.list_purchasing_lists_page_v2(uuid, text, text, boolean, boolean, integer, integer) to authenticated;

create or replace function public.list_system_favorite_product_ids(
  target_company_id uuid,
  target_product_ids uuid[]
)
returns table(product_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null
    or not public.has_permission(target_company_id, 'purchasing_lists.view')
    or coalesce(array_length(target_product_ids, 1), 0) not between 1 and 100 then
    raise exception 'Favorite membership query denied.' using errcode = '42501';
  end if;
  return query
  select item.product_id
  from public.purchasing_lists list
  join public.purchasing_list_items item on item.list_id = list.id
  where list.company_id = target_company_id
    and list.created_by = auth.uid()
    and list.is_system_favorites
    and list.archived_at is null
    and item.product_id = any(target_product_ids);
end;
$$;

revoke all on function public.list_system_favorite_product_ids(uuid, uuid[]) from public, anon;
grant execute on function public.list_system_favorite_product_ids(uuid, uuid[]) to authenticated;

create or replace function public.set_system_favorite(
  target_company_id uuid,
  target_product_id uuid,
  target_saved boolean
)
returns table(saved boolean, list_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  target_list_id uuid;
  next_position integer;
  changed_rows integer;
begin
  if auth.uid() is null
    or not public.has_permission(target_company_id, 'purchasing_lists.manage')
    or not exists (
      select 1 from public.catalog_products product
      where product.id = target_product_id and product.is_active and product.is_visible
    ) then
    raise exception 'Favorite update denied.' using errcode = '42501';
  end if;

  if target_saved then
    insert into public.purchasing_lists(company_id, name, description, visibility, created_by, updated_by, is_system_favorites)
    values (target_company_id, 'Избранное', null, 'private', auth.uid(), auth.uid(), true)
    on conflict (company_id, created_by) where is_system_favorites do nothing;

    select id into target_list_id
    from public.purchasing_lists
    where company_id = target_company_id and created_by = auth.uid() and is_system_favorites
    for update;

    select coalesce(max(position), 0) + 1 into next_position
    from public.purchasing_list_items where purchasing_list_items.list_id = target_list_id;

    insert into public.purchasing_list_items(list_id, product_id, quantity, position, source_type)
    values (target_list_id, target_product_id, 1, next_position, 'favorite')
    on conflict (list_id, product_id) do nothing;
    get diagnostics changed_rows = row_count;
    if changed_rows > 0 then
      update public.purchasing_lists set updated_by = auth.uid() where id = target_list_id;
    end if;
    return query select true, target_list_id;
    return;
  end if;

  select id into target_list_id
  from public.purchasing_lists
  where company_id = target_company_id and created_by = auth.uid() and is_system_favorites
  for update;
  if target_list_id is not null then
    delete from public.purchasing_list_items item
    where item.list_id = target_list_id and item.product_id = target_product_id;
    get diagnostics changed_rows = row_count;
    if changed_rows > 0 then
      update public.purchasing_lists set updated_by = auth.uid() where id = target_list_id;
    end if;
  end if;
  return query select false, target_list_id;
end;
$$;

revoke all on function public.set_system_favorite(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_system_favorite(uuid, uuid, boolean) to authenticated;

create or replace function public.update_purchasing_list_metadata(
  target_list_id uuid, expected_revision integer, target_name text, target_description text, target_visibility text
)
returns public.purchasing_lists language plpgsql security definer set search_path = public as $$
declare target public.purchasing_lists;
begin
  select * into target from public.purchasing_lists where id = target_list_id for update;
  if target.id is null or not public.can_manage_purchasing_list(target) then raise exception 'Purchasing list not found.' using errcode = 'P0002'; end if;
  if target.is_system_favorites then raise exception 'System favorites metadata is immutable.' using errcode = '55000'; end if;
  if target.archived_at is not null then raise exception 'Archived purchasing list is immutable.' using errcode = '55000'; end if;
  if target.revision <> expected_revision then raise exception 'Purchasing list changed.' using errcode = '40001'; end if;
  update public.purchasing_lists set name = btrim(target_name), description = nullif(btrim(target_description), ''),
    visibility = target_visibility, updated_by = auth.uid() where id = target.id returning * into target;
  return target;
end;
$$;

create or replace function public.set_purchasing_list_archived(target_list_id uuid, expected_revision integer, target_archived boolean)
returns public.purchasing_lists language plpgsql security definer set search_path = public as $$
declare target public.purchasing_lists;
begin
  select * into target from public.purchasing_lists where id = target_list_id for update;
  if target.id is null or not public.can_manage_purchasing_list(target) then raise exception 'Purchasing list not found.' using errcode = 'P0002'; end if;
  if target.is_system_favorites then raise exception 'System favorites cannot be archived.' using errcode = '55000'; end if;
  if target.revision <> expected_revision then raise exception 'Purchasing list changed.' using errcode = '40001'; end if;
  if (target.archived_at is not null) = target_archived then return target; end if;
  update public.purchasing_lists set archived_at = case when target_archived then now() else null end, updated_by = auth.uid()
  where id = target.id returning * into target;
  insert into public.purchasing_list_events(list_id, actor_user_id, event_type)
  values (target.id, auth.uid(), case when target_archived then 'archived' else 'restored' end);
  return target;
end;
$$;

comment on column public.purchasing_lists.is_system_favorites is
  'Marks the protected per-user, per-company Избранное list. Portal-owned preference data; not ERP truth.';
comment on function public.list_system_favorite_product_ids(uuid, uuid[]) is
  'Returns favorite membership for a bounded product set owned by the current authenticated user.';
comment on function public.set_system_favorite(uuid, uuid, boolean) is
  'Idempotently changes one product membership in the current user system favorites list.';

commit;
