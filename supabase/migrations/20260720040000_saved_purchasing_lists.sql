begin;

insert into public.permissions (code, description)
values
  ('purchasing_lists.view', 'View reusable purchasing lists for an active partner company.'),
  ('purchasing_lists.manage', 'Create and manage reusable purchasing lists for an active partner company.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from (values
  ('partner_owner', 'purchasing_lists.view'), ('partner_owner', 'purchasing_lists.manage'),
  ('partner_manager', 'purchasing_lists.view'), ('partner_manager', 'purchasing_lists.manage'),
  ('partner_buyer', 'purchasing_lists.view'), ('partner_buyer', 'purchasing_lists.manage'),
  ('partner_accounting', 'purchasing_lists.view'), ('partner_viewer', 'purchasing_lists.view'),
  ('novotech_admin', 'purchasing_lists.view'), ('novotech_admin', 'purchasing_lists.manage')
) assignment(role_code, permission_code)
join public.roles role on role.code = assignment.role_code
join public.permissions permission on permission.code = assignment.permission_code
on conflict do nothing;

create table public.purchasing_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  name text not null,
  description text null,
  visibility text not null default 'private',
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  updated_by uuid not null references public.user_profiles(id) on delete restrict,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint purchasing_lists_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint purchasing_lists_description_check check (description is null or char_length(description) <= 1000),
  constraint purchasing_lists_visibility_check check (visibility in ('private', 'company')),
  constraint purchasing_lists_revision_check check (revision > 0)
);

comment on table public.purchasing_lists is
  'Portal-owned reusable purchasing selections. This is not an order, reservation, estimate, proposal, or ERP document.';

create table public.purchasing_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.purchasing_lists(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  quantity integer not null,
  position integer not null,
  note text null,
  source_type text not null default 'manual',
  source_reference_id uuid null,
  source_unit_price numeric(18, 4) null,
  source_currency_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchasing_list_items_quantity_check check (quantity between 1 and 9999),
  constraint purchasing_list_items_position_check check (position > 0),
  constraint purchasing_list_items_note_check check (note is null or char_length(note) <= 500),
  constraint purchasing_list_items_source_type_check check (source_type in ('manual', 'catalog', 'cart', 'order', 'quick_reorder', 'duplicate')),
  constraint purchasing_list_items_source_price_check check (source_unit_price is null or source_unit_price >= 0),
  constraint purchasing_list_items_source_currency_check check (source_currency_code is null or source_currency_code ~ '^[A-Z]{3}$'),
  constraint purchasing_list_items_product_unique unique (list_id, product_id),
  constraint purchasing_list_items_position_unique unique (list_id, position)
);

comment on table public.purchasing_list_items is
  'Desired product quantities and origin context only. Current price, stock, arrivals, and reservation state remain in 1C-owned read models.';

create table public.purchasing_list_events (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.purchasing_lists(id) on delete cascade,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint purchasing_list_events_type_check check (event_type in ('created', 'duplicated', 'archived', 'restored', 'added_to_cart', 'estimate_created')),
  constraint purchasing_list_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create table public.purchasing_list_operations (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  operation_type text not null,
  list_id uuid not null references public.purchasing_lists(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  request_fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint purchasing_list_operations_type_check check (operation_type in ('list_to_cart', 'list_to_estimate')),
  constraint purchasing_list_operations_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint purchasing_list_operations_result_check check (jsonb_typeof(result) = 'object')
);

create index purchasing_lists_company_updated_idx on public.purchasing_lists(company_id, updated_at desc, id);
create index purchasing_lists_creator_idx on public.purchasing_lists(created_by, updated_at desc);
create index purchasing_lists_active_idx on public.purchasing_lists(company_id, updated_at desc) where archived_at is null;
create index purchasing_list_items_list_position_idx on public.purchasing_list_items(list_id, position);
create index purchasing_list_items_product_idx on public.purchasing_list_items(product_id);
create index purchasing_list_events_list_created_idx on public.purchasing_list_events(list_id, created_at desc);

create trigger set_purchasing_lists_updated_at before update on public.purchasing_lists
for each row execute function public.set_updated_at();
create trigger set_purchasing_list_items_updated_at before update on public.purchasing_list_items
for each row execute function public.set_updated_at();

create or replace function public.increment_purchasing_list_revision()
returns trigger language plpgsql as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger increment_purchasing_list_revision_before_update
before update on public.purchasing_lists
for each row execute function public.increment_purchasing_list_revision();

create or replace function public.can_view_purchasing_list(target public.purchasing_lists)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission(target.company_id, 'purchasing_lists.view')
    and (target.visibility = 'company' or target.created_by = auth.uid());
$$;

create or replace function public.can_manage_purchasing_list(target public.purchasing_lists)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission(target.company_id, 'purchasing_lists.manage')
    and (target.visibility = 'company' or target.created_by = auth.uid());
$$;

revoke all on function public.can_view_purchasing_list(public.purchasing_lists) from public;
revoke all on function public.can_manage_purchasing_list(public.purchasing_lists) from public;
grant execute on function public.can_view_purchasing_list(public.purchasing_lists) to authenticated;
grant execute on function public.can_manage_purchasing_list(public.purchasing_lists) to authenticated;

alter table public.purchasing_lists enable row level security;
alter table public.purchasing_list_items enable row level security;
alter table public.purchasing_list_events enable row level security;
alter table public.purchasing_list_operations enable row level security;

revoke all on table public.purchasing_lists, public.purchasing_list_items, public.purchasing_list_events, public.purchasing_list_operations from anon, authenticated;
grant select on table public.purchasing_lists, public.purchasing_list_items, public.purchasing_list_events to authenticated;

create policy purchasing_lists_select on public.purchasing_lists for select to authenticated
using (public.can_view_purchasing_list(purchasing_lists));
create policy purchasing_list_items_select on public.purchasing_list_items for select to authenticated
using (exists (select 1 from public.purchasing_lists list where list.id = list_id and public.can_view_purchasing_list(list)));
create policy purchasing_list_events_select on public.purchasing_list_events for select to authenticated
using (exists (select 1 from public.purchasing_lists list where list.id = list_id and public.can_view_purchasing_list(list)));

create or replace function public.list_purchasing_lists_page(
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
  revision integer, created_at timestamptz, updated_at timestamptz, archived_at timestamptz, owner_name text,
  item_count integer, total_quantity bigint, product_ids uuid[], total_count bigint
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
    list.revision, list.created_at, list.updated_at, list.archived_at, coalesce(profile.full_name, 'Пользователь компании'),
    count(item.id)::integer, coalesce(sum(item.quantity), 0)::bigint,
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
  order by list.updated_at desc, list.id
  limit target_limit offset target_offset;
end;
$$;

revoke all on function public.list_purchasing_lists_page(uuid, text, text, boolean, boolean, integer, integer) from public, anon;
grant execute on function public.list_purchasing_lists_page(uuid, text, text, boolean, boolean, integer, integer) to authenticated;

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
  from jsonb_to_recordset(target_items) with ordinality row(
    product_id uuid, quantity integer, note text, source_reference_id uuid, source_unit_price numeric, source_currency_code text, ordinality bigint
  );

  insert into public.purchasing_list_events(list_id, actor_user_id, event_type, metadata)
  values (created.id, auth.uid(), 'created', jsonb_build_object('source_type', target_source_type, 'item_count', item_count));
  return created;
end;
$$;

revoke all on function public.create_purchasing_list(uuid, text, text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_purchasing_list(uuid, text, text, text, text, uuid, jsonb) to authenticated;

create or replace function public.update_purchasing_list_metadata(
  target_list_id uuid, expected_revision integer, target_name text, target_description text, target_visibility text
)
returns public.purchasing_lists language plpgsql security definer set search_path = public as $$
declare target public.purchasing_lists;
begin
  select * into target from public.purchasing_lists where id = target_list_id for update;
  if target.id is null or not public.can_manage_purchasing_list(target) then raise exception 'Purchasing list not found.' using errcode = 'P0002'; end if;
  if target.archived_at is not null then raise exception 'Archived purchasing list is immutable.' using errcode = '55000'; end if;
  if target.revision <> expected_revision then raise exception 'Purchasing list changed.' using errcode = '40001'; end if;
  update public.purchasing_lists set name = btrim(target_name), description = nullif(btrim(target_description), ''),
    visibility = target_visibility, updated_by = auth.uid() where id = target.id returning * into target;
  return target;
end;
$$;

revoke all on function public.update_purchasing_list_metadata(uuid, integer, text, text, text) from public, anon;
grant execute on function public.update_purchasing_list_metadata(uuid, integer, text, text, text) to authenticated;

create or replace function public.merge_purchasing_list_items(
  target_list_id uuid, expected_revision integer, target_merge_mode text, target_source_type text,
  target_source_reference_id uuid, target_items jsonb
)
returns public.purchasing_lists language plpgsql security definer set search_path = public as $$
declare target public.purchasing_lists; starting_position integer;
begin
  select * into target from public.purchasing_lists where id = target_list_id for update;
  if target.id is null or not public.can_manage_purchasing_list(target) then raise exception 'Purchasing list not found.' using errcode = 'P0002'; end if;
  if target.archived_at is not null then raise exception 'Archived purchasing list is immutable.' using errcode = '55000'; end if;
  if target.revision <> expected_revision then raise exception 'Purchasing list changed.' using errcode = '40001'; end if;
  if target_merge_mode not in ('increase', 'replace', 'keep') or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) not between 1 and 200 then raise exception 'Purchasing list item batch is invalid.' using errcode = '22023'; end if;
  if (select count(distinct row.product_id) from jsonb_to_recordset(target_items) row(product_id uuid, quantity integer)) <> jsonb_array_length(target_items)
    or exists (select 1 from jsonb_to_recordset(target_items) row(product_id uuid, quantity integer)
      where row.quantity not between 1 and 9999 or not exists (select 1 from public.catalog_products product where product.id = row.product_id))
  then raise exception 'Purchasing list item batch is invalid.' using errcode = '22023'; end if;
  select coalesce(max(position), 0) into starting_position from public.purchasing_list_items where list_id = target.id;
  insert into public.purchasing_list_items(list_id, product_id, quantity, position, note, source_type, source_reference_id, source_unit_price, source_currency_code)
  select target.id, row.product_id, row.quantity, starting_position + row.ordinality, nullif(btrim(row.note), ''), target_source_type,
    coalesce(row.source_reference_id, target_source_reference_id), row.source_unit_price, upper(nullif(btrim(row.source_currency_code), ''))
  from jsonb_to_recordset(target_items) with ordinality row(product_id uuid, quantity integer, note text, source_reference_id uuid, source_unit_price numeric, source_currency_code text, ordinality bigint)
  on conflict (list_id, product_id) do update set
    quantity = case target_merge_mode when 'increase' then least(9999, public.purchasing_list_items.quantity + excluded.quantity)
      when 'replace' then excluded.quantity else public.purchasing_list_items.quantity end,
    note = case when target_merge_mode = 'keep' then public.purchasing_list_items.note else coalesce(excluded.note, public.purchasing_list_items.note) end,
    updated_at = now();
  update public.purchasing_lists set updated_by = auth.uid() where id = target.id returning * into target;
  return target;
end;
$$;

revoke all on function public.merge_purchasing_list_items(uuid, integer, text, text, uuid, jsonb) from public, anon;
grant execute on function public.merge_purchasing_list_items(uuid, integer, text, text, uuid, jsonb) to authenticated;

create or replace function public.update_purchasing_list_items(target_list_id uuid, expected_revision integer, target_items jsonb)
returns public.purchasing_lists language plpgsql security definer set search_path = public as $$
declare target public.purchasing_lists; item_count integer;
begin
  select * into target from public.purchasing_lists where id = target_list_id for update;
  if target.id is null or not public.can_manage_purchasing_list(target) then raise exception 'Purchasing list not found.' using errcode = 'P0002'; end if;
  if target.archived_at is not null then raise exception 'Archived purchasing list is immutable.' using errcode = '55000'; end if;
  if target.revision <> expected_revision then raise exception 'Purchasing list changed.' using errcode = '40001'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) not between 1 and 200 then raise exception 'List update is invalid.' using errcode = '22023'; end if;
  item_count := jsonb_array_length(target_items);
  if (select count(distinct row.item_id) from jsonb_to_recordset(target_items) row(item_id uuid, quantity integer, position integer)) <> item_count
    or item_count <> (select count(*) from public.purchasing_list_items item where item.list_id = target.id)
    or (select count(*) from public.purchasing_list_items item join jsonb_to_recordset(target_items) row(item_id uuid, quantity integer, position integer) on row.item_id = item.id where item.list_id = target.id) <> item_count
    or exists (select 1 from jsonb_to_recordset(target_items) row(item_id uuid, quantity integer, position integer) where row.quantity not between 1 and 9999 or row.position not between 1 and 200)
  then raise exception 'List update is invalid.' using errcode = '22023'; end if;
  update public.purchasing_list_items item set position = item.position + 1000 where item.list_id = target.id;
  update public.purchasing_list_items item set quantity = row.quantity, position = row.position, note = nullif(btrim(row.note), ''), updated_at = now()
  from jsonb_to_recordset(target_items) row(item_id uuid, quantity integer, position integer, note text)
  where item.id = row.item_id and item.list_id = target.id;
  update public.purchasing_lists set updated_by = auth.uid() where id = target.id returning * into target;
  return target;
end;
$$;

revoke all on function public.update_purchasing_list_items(uuid, integer, jsonb) from public, anon;
grant execute on function public.update_purchasing_list_items(uuid, integer, jsonb) to authenticated;

create or replace function public.remove_purchasing_list_items(target_list_id uuid, expected_revision integer, target_item_ids uuid[])
returns public.purchasing_lists language plpgsql security definer set search_path = public as $$
declare target public.purchasing_lists;
begin
  select * into target from public.purchasing_lists where id = target_list_id for update;
  if target.id is null or not public.can_manage_purchasing_list(target) then raise exception 'Purchasing list not found.' using errcode = 'P0002'; end if;
  if target.archived_at is not null then raise exception 'Archived purchasing list is immutable.' using errcode = '55000'; end if;
  if target.revision <> expected_revision or coalesce(array_length(target_item_ids, 1), 0) not between 1 and 200 then raise exception 'List update is invalid.' using errcode = '40001'; end if;
  delete from public.purchasing_list_items where list_id = target.id and id = any(target_item_ids);
  with ordered as (select id, row_number() over(order by position, id)::integer new_position from public.purchasing_list_items where list_id = target.id)
  update public.purchasing_list_items item set position = ordered.new_position + 1000 from ordered where item.id = ordered.id;
  update public.purchasing_list_items set position = position - 1000 where list_id = target.id;
  update public.purchasing_lists set updated_by = auth.uid() where id = target.id returning * into target;
  return target;
end;
$$;

revoke all on function public.remove_purchasing_list_items(uuid, integer, uuid[]) from public, anon;
grant execute on function public.remove_purchasing_list_items(uuid, integer, uuid[]) to authenticated;

create or replace function public.set_purchasing_list_archived(target_list_id uuid, expected_revision integer, target_archived boolean)
returns public.purchasing_lists language plpgsql security definer set search_path = public as $$
declare target public.purchasing_lists;
begin
  select * into target from public.purchasing_lists where id = target_list_id for update;
  if target.id is null or not public.can_manage_purchasing_list(target) then raise exception 'Purchasing list not found.' using errcode = 'P0002'; end if;
  if target.revision <> expected_revision then raise exception 'Purchasing list changed.' using errcode = '40001'; end if;
  if (target.archived_at is not null) = target_archived then return target; end if;
  update public.purchasing_lists set archived_at = case when target_archived then now() else null end, updated_by = auth.uid()
  where id = target.id returning * into target;
  insert into public.purchasing_list_events(list_id, actor_user_id, event_type)
  values (target.id, auth.uid(), case when target_archived then 'archived' else 'restored' end);
  return target;
end;
$$;

revoke all on function public.set_purchasing_list_archived(uuid, integer, boolean) from public, anon;
grant execute on function public.set_purchasing_list_archived(uuid, integer, boolean) to authenticated;

create or replace function public.duplicate_purchasing_list(target_list_id uuid, target_name text)
returns public.purchasing_lists language plpgsql security definer set search_path = public as $$
declare source public.purchasing_lists; created public.purchasing_lists;
begin
  select * into source from public.purchasing_lists where id = target_list_id;
  if source.id is null or not public.can_view_purchasing_list(source) or not public.has_permission(source.company_id, 'purchasing_lists.manage') then
    raise exception 'Purchasing list not found.' using errcode = 'P0002';
  end if;
  insert into public.purchasing_lists(company_id, name, description, visibility, created_by, updated_by)
  values (source.company_id, btrim(target_name), source.description, 'private', auth.uid(), auth.uid()) returning * into created;
  insert into public.purchasing_list_items(list_id, product_id, quantity, position, note, source_type, source_reference_id, source_unit_price, source_currency_code)
  select created.id, product_id, quantity, position, note, 'duplicate', source.id, source_unit_price, source_currency_code
  from public.purchasing_list_items where list_id = source.id order by position;
  insert into public.purchasing_list_events(list_id, actor_user_id, event_type, metadata)
  values (created.id, auth.uid(), 'duplicated', jsonb_build_object('source_list_id', source.id));
  return created;
end;
$$;

revoke all on function public.duplicate_purchasing_list(uuid, text) from public, anon;
grant execute on function public.duplicate_purchasing_list(uuid, text) to authenticated;

create or replace function public.merge_purchasing_list_into_cart(
  target_list_id uuid, target_request_key uuid, target_request_fingerprint text, target_items jsonb, target_summary jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare source public.purchasing_lists; target_cart public.carts; prior public.purchasing_list_operations; result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));
  select * into prior from public.purchasing_list_operations where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.list_id <> target_list_id or prior.operation_type <> 'list_to_cart' or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchasing list operation key is already used.' using errcode = '23505'; end if;
    return prior.result || jsonb_build_object('repeated', true);
  end if;
  select * into source from public.purchasing_lists where id = target_list_id;
  if source.id is null or source.archived_at is not null or not public.can_view_purchasing_list(source)
    or not public.has_permission(source.company_id, 'cart.manage') then raise exception 'Purchasing list conversion denied.' using errcode = '42501'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) not between 1 and 200
    or exists (select 1 from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
      where row.quantity not between 1 and 9999 or not exists (
        select 1 from public.purchasing_list_items item join public.catalog_products product on product.id = item.product_id
        where item.id = row.item_id and item.list_id = source.id and item.product_id = row.product_id and product.is_active and product.is_visible))
  then raise exception 'Purchasing list conversion items are invalid.' using errcode = '22023'; end if;
  select * into target_cart from public.carts where company_id = source.company_id and created_by = auth.uid() and status = 'active' for update;
  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status) values (source.company_id, auth.uid(), 'active') returning * into target_cart;
  end if;
  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, row.product_id, least(9999, sum(row.quantity)::integer)
  from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
  group by row.product_id
  on conflict (cart_id, product_id) do update set quantity = least(9999, public.cart_items.quantity + excluded.quantity), updated_at = now();
  result := coalesce(target_summary, '{}'::jsonb) || jsonb_build_object('cart_id', target_cart.id, 'repeated', false);
  insert into public.purchasing_list_operations(request_key, operation_type, list_id, company_id, created_by, request_fingerprint, result)
  values (target_request_key, 'list_to_cart', source.id, source.company_id, auth.uid(), target_request_fingerprint, result);
  insert into public.purchasing_list_events(list_id, actor_user_id, event_type, metadata)
  values (source.id, auth.uid(), 'added_to_cart', jsonb_build_object('item_count', jsonb_array_length(target_items)));
  return result;
end;
$$;

revoke all on function public.merge_purchasing_list_into_cart(uuid, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.merge_purchasing_list_into_cart(uuid, uuid, text, jsonb, jsonb) to authenticated;

create or replace function public.create_estimate_from_purchasing_list(
  target_list_id uuid, target_request_key uuid, target_request_fingerprint text, target_name text, target_currency_code text,
  target_items jsonb, target_summary jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare source public.purchasing_lists; prior public.purchasing_list_operations; created public.estimates; section_id uuid; result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));
  select * into prior from public.purchasing_list_operations where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.list_id <> target_list_id or prior.operation_type <> 'list_to_estimate' or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchasing list operation key is already used.' using errcode = '23505'; end if;
    return prior.result || jsonb_build_object('repeated', true);
  end if;
  select * into source from public.purchasing_lists where id = target_list_id;
  if source.id is null or source.archived_at is not null or not public.can_view_purchasing_list(source)
    or not public.can_access_estimates(source.company_id, 'estimates.manage') or not public.can_access_estimates(source.company_id, 'estimates.pricing.manage')
  then raise exception 'Estimate creation denied.' using errcode = '42501'; end if;
  if target_currency_code !~ '^[A-Z]{3}$' or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) not between 1 and 50
    or exists (select 1 from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer, selling_unit_price numeric)
      where row.quantity not between 1 and 9999 or row.selling_unit_price is null or row.selling_unit_price < 0 or not exists (
        select 1 from public.purchasing_list_items item join public.catalog_products product on product.id = item.product_id
        where item.id = row.item_id and item.list_id = source.id and item.product_id = row.product_id and product.is_active and product.is_visible))
  then raise exception 'Estimate lines are invalid.' using errcode = '22023'; end if;
  insert into public.estimates(company_id, created_by, name, currency_code, validity_days)
  values (source.company_id, auth.uid(), btrim(target_name), target_currency_code, 14) returning * into created;
  insert into public.estimate_sections(estimate_id, name, sort_order) values (created.id, 'Оборудование', 0) returning id into section_id;
  insert into public.estimate_items(estimate_id, section_id, line_type, product_id, position, sku_snapshot, product_name_snapshot,
    source_unit_price, source_currency_code, source_snapshot_at, internal_cost_unit_price, converted_cost_unit_price,
    exchange_rate, exchange_rate_effective_date, description, quantity, unit, selling_unit_price)
  select created.id, section_id, 'product', row.product_id, row.ordinality, row.sku, row.product_name,
    row.source_unit_price, row.source_currency_code, row.source_snapshot_at, row.converted_cost_unit_price, row.converted_cost_unit_price,
    row.exchange_rate, row.exchange_rate_effective_date, row.product_name, row.quantity, 'pcs', row.selling_unit_price
  from jsonb_to_recordset(target_items) with ordinality row(item_id uuid, product_id uuid, quantity integer, sku text, product_name text,
    source_unit_price numeric, source_currency_code text, source_snapshot_at timestamptz, selling_unit_price numeric,
    converted_cost_unit_price numeric, exchange_rate numeric, exchange_rate_effective_date date, ordinality bigint);
  update public.estimates set total_amount = (select coalesce(sum(line_total), 0) from public.estimate_items where estimate_id = created.id),
    has_incomplete_pricing = false where id = created.id returning * into created;
  insert into public.estimate_events(estimate_id, actor_user_id, event_type) values (created.id, auth.uid(), 'created');
  result := coalesce(target_summary, '{}'::jsonb) || jsonb_build_object('estimate_id', created.id, 'repeated', false);
  insert into public.purchasing_list_operations(request_key, operation_type, list_id, company_id, created_by, request_fingerprint, result)
  values (target_request_key, 'list_to_estimate', source.id, source.company_id, auth.uid(), target_request_fingerprint, result);
  insert into public.purchasing_list_events(list_id, actor_user_id, event_type, metadata)
  values (source.id, auth.uid(), 'estimate_created', jsonb_build_object('estimate_id', created.id, 'item_count', jsonb_array_length(target_items)));
  return result;
end;
$$;

revoke all on function public.create_estimate_from_purchasing_list(uuid, uuid, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_estimate_from_purchasing_list(uuid, uuid, text, text, text, jsonb, jsonb) to authenticated;

commit;
