begin;

insert into public.permissions (code, description) values
  ('purchase_templates.view', 'View reusable purchase templates for an active partner company.'),
  ('purchase_templates.create', 'Create reusable purchase templates.'),
  ('purchase_templates.edit_own', 'Edit purchase templates owned by the current user.'),
  ('purchase_templates.edit_company', 'Edit company-visible purchase templates.'),
  ('purchase_templates.archive', 'Archive permitted purchase templates.'),
  ('purchase_templates.use', 'Validate and add purchase-template lines to the active cart.')
on conflict (code) do update set description = excluded.description;

with grants(role_code, permission_code) as (
  values
    ('partner_owner', 'purchase_templates.view'),
    ('partner_owner', 'purchase_templates.create'),
    ('partner_owner', 'purchase_templates.edit_own'),
    ('partner_owner', 'purchase_templates.edit_company'),
    ('partner_owner', 'purchase_templates.archive'),
    ('partner_owner', 'purchase_templates.use'),
    ('partner_manager', 'purchase_templates.view'),
    ('partner_manager', 'purchase_templates.create'),
    ('partner_manager', 'purchase_templates.edit_own'),
    ('partner_manager', 'purchase_templates.use'),
    ('partner_buyer', 'purchase_templates.view'),
    ('partner_buyer', 'purchase_templates.create'),
    ('partner_buyer', 'purchase_templates.edit_own'),
    ('partner_buyer', 'purchase_templates.use'),
    ('partner_accounting', 'purchase_templates.view'),
    ('partner_accounting', 'purchase_templates.use'),
    ('novotech_admin', 'purchase_templates.view'),
    ('novotech_admin', 'purchase_templates.create'),
    ('novotech_admin', 'purchase_templates.edit_own'),
    ('novotech_admin', 'purchase_templates.edit_company'),
    ('novotech_admin', 'purchase_templates.archive'),
    ('novotech_admin', 'purchase_templates.use')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict (role_id, permission_id) do nothing;

create table public.purchase_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  owner_user_id uuid not null references public.user_profiles(id) on delete restrict,
  name text not null,
  description text null,
  visibility text not null default 'private',
  status text not null default 'active',
  source_type text not null default 'manual',
  source_id uuid null,
  usage_count integer not null default 0,
  last_used_at timestamptz null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint purchase_templates_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint purchase_templates_description_check check (description is null or char_length(description) <= 1000),
  constraint purchase_templates_visibility_check check (visibility in ('private', 'company')),
  constraint purchase_templates_status_check check (status in ('active', 'archived')),
  constraint purchase_templates_source_check check (source_type in ('manual', 'cart', 'order', 'purchasing_list', 'dashboard_reorder')),
  constraint purchase_templates_usage_check check (usage_count >= 0),
  constraint purchase_templates_archive_consistency_check check (
    (status = 'active' and archived_at is null) or (status = 'archived' and archived_at is not null)
  )
);

create table public.purchase_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.purchase_templates(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  preferred_quantity numeric(12,3) not null,
  line_note text null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_template_items_product_unique unique (template_id, product_id),
  constraint purchase_template_items_quantity_check check (preferred_quantity > 0 and preferred_quantity <= 9999),
  constraint purchase_template_items_note_check check (line_note is null or char_length(line_note) <= 500),
  constraint purchase_template_items_sort_check check (sort_order between 1 and 200)
);

create table public.purchase_template_operations (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  operation_type text not null,
  template_id uuid null references public.purchase_templates(id) on delete cascade,
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  request_fingerprint text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint purchase_template_operations_type_check check (operation_type in ('create', 'template_to_cart')),
  constraint purchase_template_operations_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint purchase_template_operations_result_check check (jsonb_typeof(result) = 'object')
);

create index purchase_templates_company_status_updated_idx
  on public.purchase_templates(company_id, status, updated_at desc);
create index purchase_templates_owner_updated_idx
  on public.purchase_templates(owner_user_id, updated_at desc);
create index purchase_template_items_template_order_idx
  on public.purchase_template_items(template_id, sort_order, id);
create index purchase_template_items_product_idx
  on public.purchase_template_items(product_id);

create trigger set_purchase_templates_updated_at before update on public.purchase_templates
for each row execute function public.set_updated_at();
create trigger set_purchase_template_items_updated_at before update on public.purchase_template_items
for each row execute function public.set_updated_at();

create or replace function public.increment_purchase_template_revision()
returns trigger language plpgsql as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger increment_purchase_template_revision_before_update
before update on public.purchase_templates
for each row execute function public.increment_purchase_template_revision();

create or replace function public.can_view_purchase_template(target public.purchase_templates)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission(target.company_id, 'purchase_templates.view')
    and (target.visibility = 'company' or target.owner_user_id = auth.uid());
$$;

create or replace function public.can_edit_purchase_template(target public.purchase_templates)
returns boolean language sql stable security definer set search_path = public as $$
  select target.status = 'active' and (
    (target.owner_user_id = auth.uid() and public.has_permission(target.company_id, 'purchase_templates.edit_own'))
    or (target.visibility = 'company' and public.has_permission(target.company_id, 'purchase_templates.edit_company'))
  );
$$;

revoke all on function public.can_view_purchase_template(public.purchase_templates) from public;
revoke all on function public.can_edit_purchase_template(public.purchase_templates) from public;
grant execute on function public.can_view_purchase_template(public.purchase_templates) to authenticated;
grant execute on function public.can_edit_purchase_template(public.purchase_templates) to authenticated;

alter table public.purchase_templates enable row level security;
alter table public.purchase_template_items enable row level security;
alter table public.purchase_template_operations enable row level security;
revoke all on public.purchase_templates, public.purchase_template_items, public.purchase_template_operations from public, anon, authenticated;
grant select on public.purchase_templates, public.purchase_template_items to authenticated;

create policy purchase_templates_select on public.purchase_templates for select to authenticated
using (public.can_view_purchase_template(purchase_templates));
create policy purchase_template_items_select on public.purchase_template_items for select to authenticated
using (exists (
  select 1 from public.purchase_templates template
  where template.id = template_id and public.can_view_purchase_template(template)
));

create or replace function public.list_purchase_templates_page(
  target_company_id uuid,
  target_search text,
  target_filter text,
  target_limit integer,
  target_offset integer
)
returns table (
  id uuid, company_id uuid, owner_user_id uuid, name text, description text,
  visibility text, status text, source_type text, source_id uuid, usage_count integer,
  last_used_at timestamptz, revision integer, created_at timestamptz,
  updated_at timestamptz, archived_at timestamptz, owner_name text,
  item_count integer, total_quantity numeric, product_ids uuid[], item_intents jsonb, total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission(target_company_id, 'purchase_templates.view') then
    raise exception 'Purchase template access denied.' using errcode = '42501';
  end if;
  if target_filter not in ('all', 'mine', 'company', 'active', 'archived')
    or target_limit not between 1 and 50 or target_offset < 0 then
    raise exception 'Purchase template query is invalid.' using errcode = '22023';
  end if;
  return query
  with visible as (
    select template.*
    from public.purchase_templates template
    where template.company_id = target_company_id
      and public.can_view_purchase_template(template)
      and case target_filter
        when 'mine' then template.owner_user_id = auth.uid()
        when 'company' then template.visibility = 'company'
        when 'archived' then template.status = 'archived'
        else template.status = 'active'
      end
      and (
        nullif(btrim(target_search), '') is null
        or template.name ilike '%' || replace(replace(btrim(target_search), '%', ''), '_', '') || '%'
        or coalesce(template.description, '') ilike '%' || replace(replace(btrim(target_search), '%', ''), '_', '') || '%'
        or exists (
          select 1 from public.purchase_template_items item
          join public.catalog_products product on product.id = item.product_id
          where item.template_id = template.id
            and (product.sku ilike '%' || btrim(target_search) || '%' or product.name ilike '%' || btrim(target_search) || '%')
        )
      )
  ), counted as (select count(*)::bigint as count from visible)
  select template.id, template.company_id, template.owner_user_id, template.name,
    template.description, template.visibility, template.status, template.source_type,
    template.source_id, template.usage_count, template.last_used_at, template.revision,
    template.created_at, template.updated_at, template.archived_at,
    coalesce(profile.full_name, 'Пользователь компании'),
    count(item.id)::integer, coalesce(sum(item.preferred_quantity), 0),
    coalesce(array_agg(item.product_id order by item.sort_order) filter (where item.id is not null), '{}'::uuid[]),
    coalesce(jsonb_agg(jsonb_build_object('productId', item.product_id, 'quantity', item.preferred_quantity)
      order by item.sort_order) filter (where item.id is not null), '[]'::jsonb),
    counted.count
  from visible template cross join counted
  left join public.user_profiles profile on profile.id = template.owner_user_id
  left join public.purchase_template_items item on item.template_id = template.id
  group by template.id, profile.full_name, counted.count
  order by template.updated_at desc, template.id
  limit target_limit offset target_offset;
end;
$$;

create or replace function public.create_purchase_template(
  target_company_id uuid, target_name text, target_description text,
  target_visibility text, target_source_type text, target_source_id uuid,
  target_request_key uuid, target_request_fingerprint text, target_items jsonb
)
returns public.purchase_templates language plpgsql security definer set search_path = public as $$
declare created public.purchase_templates; prior public.purchase_template_operations;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));
  select * into prior from public.purchase_template_operations where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.company_id <> target_company_id
      or prior.operation_type <> 'create' or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchase template operation key is already used.' using errcode = '23505';
    end if;
    select * into created from public.purchase_templates where id = prior.template_id;
    return created;
  end if;
  if auth.uid() is null or not public.has_permission(target_company_id, 'purchase_templates.create')
    or char_length(btrim(target_name)) not between 1 and 120
    or char_length(coalesce(target_description, '')) > 1000
    or target_visibility not in ('private', 'company')
    or target_source_type not in ('manual', 'cart', 'order', 'purchasing_list', 'dashboard_reorder')
    or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) > 200
    or exists (
      select 1 from jsonb_to_recordset(target_items) row(product_id uuid, preferred_quantity numeric, line_note text)
      where row.preferred_quantity <= 0 or row.preferred_quantity > 9999
        or char_length(coalesce(row.line_note, '')) > 500
        or not exists (select 1 from public.catalog_products product where product.id = row.product_id)
    ) then raise exception 'Purchase template input is invalid.' using errcode = '22023';
  end if;
  insert into public.purchase_templates(company_id, owner_user_id, name, description, visibility, source_type, source_id)
  values (target_company_id, auth.uid(), btrim(target_name), nullif(btrim(target_description), ''), target_visibility, target_source_type, target_source_id)
  returning * into created;
  insert into public.purchase_template_items(template_id, product_id, preferred_quantity, line_note, sort_order)
  select created.id, row.product_id, least(9999, sum(row.preferred_quantity)),
    nullif(max(nullif(btrim(row.line_note), '')), ''), row_number() over (order by min(row.ordinality))
  from jsonb_to_recordset(target_items) with ordinality row(product_id uuid, preferred_quantity numeric, line_note text, ordinality bigint)
  group by row.product_id;
  insert into public.purchase_template_operations(request_key, operation_type, template_id, company_id, created_by, request_fingerprint, result)
  values (target_request_key, 'create', created.id, created.company_id, auth.uid(), target_request_fingerprint, jsonb_build_object('template_id', created.id));
  return created;
end;
$$;

create or replace function public.update_purchase_template(
  target_template_id uuid, expected_revision integer, target_name text,
  target_description text, target_visibility text, target_items jsonb
)
returns public.purchase_templates language plpgsql security definer set search_path = public as $$
declare target public.purchase_templates;
begin
  select * into target from public.purchase_templates where id = target_template_id for update;
  if target.id is null or not public.can_edit_purchase_template(target) then
    raise exception 'Purchase template edit denied.' using errcode = '42501';
  end if;
  if target.revision <> expected_revision then
    raise exception 'Purchase template changed.' using errcode = '40001';
  end if;
  if char_length(btrim(target_name)) not between 1 and 120
    or char_length(coalesce(target_description, '')) > 1000
    or target_visibility not in ('private', 'company')
    or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) > 200
    or exists (
      select 1 from jsonb_to_recordset(target_items) row(product_id uuid, preferred_quantity numeric, line_note text, sort_order integer)
      where row.preferred_quantity <= 0 or row.preferred_quantity > 9999
        or row.sort_order not between 1 and 200 or char_length(coalesce(row.line_note, '')) > 500
        or not exists (select 1 from public.catalog_products product where product.id = row.product_id)
    ) then raise exception 'Purchase template input is invalid.' using errcode = '22023';
  end if;
  update public.purchase_templates set name = btrim(target_name), description = nullif(btrim(target_description), ''), visibility = target_visibility
  where id = target.id returning * into target;
  delete from public.purchase_template_items where template_id = target.id;
  insert into public.purchase_template_items(template_id, product_id, preferred_quantity, line_note, sort_order)
  select target.id, row.product_id, least(9999, sum(row.preferred_quantity)),
    nullif(max(nullif(btrim(row.line_note), '')), ''), min(row.sort_order)
  from jsonb_to_recordset(target_items) row(product_id uuid, preferred_quantity numeric, line_note text, sort_order integer)
  group by row.product_id;
  return target;
end;
$$;

create or replace function public.archive_purchase_template(target_template_id uuid, expected_revision integer)
returns public.purchase_templates language plpgsql security definer set search_path = public as $$
declare target public.purchase_templates;
begin
  select * into target from public.purchase_templates where id = target_template_id for update;
  if target.id is null or target.revision <> expected_revision
    or not public.has_permission(target.company_id, 'purchase_templates.archive')
    or not (target.owner_user_id = auth.uid() or public.has_permission(target.company_id, 'purchase_templates.edit_company')) then
    raise exception 'Purchase template archive denied.' using errcode = '42501';
  end if;
  update public.purchase_templates set status = 'archived', archived_at = now()
  where id = target.id returning * into target;
  return target;
end;
$$;

create or replace function public.copy_purchase_template(target_template_id uuid, target_name text, target_request_key uuid, target_request_fingerprint text)
returns public.purchase_templates language plpgsql security definer set search_path = public as $$
declare source public.purchase_templates; created public.purchase_templates; prior public.purchase_template_operations;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));
  select * into prior from public.purchase_template_operations where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.operation_type <> 'create' or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchase template operation key is already used.' using errcode = '23505'; end if;
    select * into created from public.purchase_templates where id = prior.template_id; return created;
  end if;
  select * into source from public.purchase_templates where id = target_template_id;
  if source.id is null or not public.can_view_purchase_template(source)
    or not public.has_permission(source.company_id, 'purchase_templates.create') then
    raise exception 'Purchase template copy denied.' using errcode = '42501'; end if;
  insert into public.purchase_templates(company_id, owner_user_id, name, description, visibility, source_type, source_id)
  values (source.company_id, auth.uid(), btrim(target_name), source.description, 'private', 'manual', source.id)
  returning * into created;
  insert into public.purchase_template_items(template_id, product_id, preferred_quantity, line_note, sort_order)
  select created.id, product_id, preferred_quantity, line_note, sort_order from public.purchase_template_items where template_id = source.id;
  insert into public.purchase_template_operations(request_key, operation_type, template_id, company_id, created_by, request_fingerprint, result)
  values (target_request_key, 'create', created.id, created.company_id, auth.uid(), target_request_fingerprint, jsonb_build_object('template_id', created.id));
  return created;
end;
$$;

create or replace function public.merge_purchase_template_into_cart(
  target_template_id uuid, target_request_key uuid, target_request_fingerprint text,
  target_items jsonb, target_summary jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare source public.purchase_templates; target_cart public.carts; prior public.purchase_template_operations; result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_request_key::text, 0));
  select * into prior from public.purchase_template_operations where request_key = target_request_key;
  if prior.id is not null then
    if prior.created_by <> auth.uid() or prior.template_id <> target_template_id
      or prior.operation_type <> 'template_to_cart' or prior.request_fingerprint <> target_request_fingerprint then
      raise exception 'Purchase template operation key is already used.' using errcode = '23505'; end if;
    return prior.result || jsonb_build_object('repeated', true);
  end if;
  select * into source from public.purchase_templates where id = target_template_id;
  if source.id is null or source.status <> 'active' or not public.can_view_purchase_template(source)
    or not public.has_permission(source.company_id, 'purchase_templates.use')
    or not public.has_permission(source.company_id, 'orders.manage') then
    raise exception 'Purchase template execution denied.' using errcode = '42501'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) not between 1 and 200
    or exists (
      select 1 from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
      where row.quantity not between 1 and 9999 or not exists (
        select 1 from public.purchase_template_items item
        join public.catalog_products product on product.id = item.product_id
        where item.id = row.item_id and item.template_id = source.id and item.product_id = row.product_id
          and product.is_active and product.is_visible
      )
    ) then raise exception 'Purchase template execution items are invalid.' using errcode = '22023'; end if;
  select * into target_cart from public.carts
  where company_id = source.company_id and created_by = auth.uid() and status = 'active' for update;
  if target_cart.id is null then
    insert into public.carts(company_id, created_by, status) values (source.company_id, auth.uid(), 'active') returning * into target_cart;
  end if;
  insert into public.cart_items(cart_id, product_id, quantity)
  select target_cart.id, row.product_id, least(9999, sum(row.quantity)::integer)
  from jsonb_to_recordset(target_items) row(item_id uuid, product_id uuid, quantity integer)
  group by row.product_id
  on conflict (cart_id, product_id) do update
    set quantity = least(9999, public.cart_items.quantity + excluded.quantity), updated_at = now();
  update public.purchase_templates set usage_count = usage_count + 1, last_used_at = now() where id = source.id;
  result := coalesce(target_summary, '{}'::jsonb) || jsonb_build_object('cart_id', target_cart.id, 'repeated', false);
  insert into public.purchase_template_operations(request_key, operation_type, template_id, company_id, created_by, request_fingerprint, result)
  values (target_request_key, 'template_to_cart', source.id, source.company_id, auth.uid(), target_request_fingerprint, result);
  return result;
end;
$$;

revoke all on function public.list_purchase_templates_page(uuid, text, text, integer, integer) from public, anon;
revoke all on function public.create_purchase_template(uuid, text, text, text, text, uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.update_purchase_template(uuid, integer, text, text, text, jsonb) from public, anon;
revoke all on function public.archive_purchase_template(uuid, integer) from public, anon;
revoke all on function public.copy_purchase_template(uuid, text, uuid, text) from public, anon;
revoke all on function public.merge_purchase_template_into_cart(uuid, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.list_purchase_templates_page(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.create_purchase_template(uuid, text, text, text, text, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.update_purchase_template(uuid, integer, text, text, text, jsonb) to authenticated;
grant execute on function public.archive_purchase_template(uuid, integer) to authenticated;
grant execute on function public.copy_purchase_template(uuid, text, uuid, text) to authenticated;
grant execute on function public.merge_purchase_template_into_cart(uuid, uuid, text, jsonb, jsonb) to authenticated;

alter table public.partner_search_documents drop constraint partner_search_documents_type_check;
alter table public.partner_search_documents add constraint partner_search_documents_type_check check (
  document_type in ('product', 'purchasing_list', 'estimate', 'proposal', 'manual_line', 'template', 'purchase_template')
);

create or replace function public.project_partner_search_purchase_template()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_id uuid; keywords text;
begin
  target_id := case when tg_op = 'DELETE' then old.id else new.id end;
  if tg_op = 'DELETE' then
    delete from public.partner_search_documents where document_key = 'purchase_template:' || target_id::text;
    return old;
  end if;
  if new.status = 'archived' then
    delete from public.partner_search_documents where document_key = 'purchase_template:' || target_id::text;
    return new;
  end if;
  select string_agg(concat_ws(' ', product.sku, product.name), ' ' order by item.sort_order)
  into keywords from public.purchase_template_items item join public.catalog_products product on product.id = item.product_id
  where item.template_id = new.id;
  insert into public.partner_search_documents(document_key, document_type, document_id, company_id, owner_user_id, title, subtitle, search_text, safe_metadata, route, updated_at)
  values ('purchase_template:' || new.id::text, 'purchase_template', new.id, new.company_id, new.owner_user_id,
    new.name, 'Шаблон закупок', concat_ws(' ', new.name, new.description, keywords), jsonb_build_object('visibility', new.visibility),
    '/cabinet/purchase-templates/' || new.id::text, new.updated_at)
  on conflict (document_key) do update set company_id = excluded.company_id, owner_user_id = excluded.owner_user_id,
    title = excluded.title, subtitle = excluded.subtitle, search_text = excluded.search_text,
    safe_metadata = excluded.safe_metadata, route = excluded.route, updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function public.refresh_partner_search_purchase_template_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare target public.purchase_templates; target_id uuid; keywords text;
begin
  target_id := case when tg_op = 'DELETE' then old.template_id else new.template_id end;
  select * into target from public.purchase_templates where id = target_id;
  if target.id is null or target.status = 'archived' then
    delete from public.partner_search_documents where document_key = 'purchase_template:' || target_id::text;
    return coalesce(new, old);
  end if;
  select string_agg(concat_ws(' ', product.sku, product.name), ' ' order by item.sort_order)
  into keywords from public.purchase_template_items item join public.catalog_products product on product.id = item.product_id
  where item.template_id = target.id;
  insert into public.partner_search_documents(document_key, document_type, document_id, company_id, owner_user_id, title, subtitle, search_text, safe_metadata, route, updated_at)
  values ('purchase_template:' || target.id::text, 'purchase_template', target.id, target.company_id, target.owner_user_id,
    target.name, 'Шаблон закупок', concat_ws(' ', target.name, target.description, keywords), jsonb_build_object('visibility', target.visibility),
    '/cabinet/purchase-templates/' || target.id::text, target.updated_at)
  on conflict (document_key) do update set title = excluded.title, subtitle = excluded.subtitle,
    search_text = excluded.search_text, safe_metadata = excluded.safe_metadata, updated_at = excluded.updated_at;
  return coalesce(new, old);
end;
$$;

create trigger project_partner_search_purchase_template_after_write
after insert or update or delete on public.purchase_templates
for each row execute function public.project_partner_search_purchase_template();

create trigger project_partner_search_purchase_template_item_after_write
after insert or update or delete on public.purchase_template_items
for each row execute function public.refresh_partner_search_purchase_template_item();

revoke all on function public.increment_purchase_template_revision() from public, anon, authenticated;
revoke all on function public.project_partner_search_purchase_template() from public, anon, authenticated;
revoke all on function public.refresh_partner_search_purchase_template_item() from public, anon, authenticated;

insert into public.partner_search_documents(document_key, document_type, document_id, company_id, owner_user_id, title, subtitle, search_text, safe_metadata, route, updated_at)
select 'purchase_template:' || template.id::text, 'purchase_template', template.id, template.company_id,
  template.owner_user_id, template.name, 'Шаблон закупок', concat_ws(' ', template.name, template.description,
    string_agg(concat_ws(' ', product.sku, product.name), ' ' order by item.sort_order)),
  jsonb_build_object('visibility', template.visibility), '/cabinet/purchase-templates/' || template.id::text, template.updated_at
from public.purchase_templates template
left join public.purchase_template_items item on item.template_id = template.id
left join public.catalog_products product on product.id = item.product_id
where template.status = 'active'
group by template.id
on conflict (document_key) do nothing;

create or replace function public.search_partner_workspace(p_company_id uuid, p_query text, p_limit integer default 40)
returns table(document_type text, document_id uuid, title text, subtitle text, safe_metadata jsonb, route text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with input as (select lower(btrim(coalesce(p_query, ''))) query, least(greatest(coalesce(p_limit, 40), 1), 50) result_limit)
  select document.document_type, document.document_id, document.title, document.subtitle,
    document.safe_metadata, document.route, document.updated_at
  from public.partner_search_documents document cross join input
  where char_length(input.query) between 2 and 100 and position(input.query in lower(document.search_text)) > 0
    and (
      (document.document_type = 'product' and document.company_id is null and public.has_permission(p_company_id, 'catalog.view'))
      or (document.document_type = 'purchasing_list' and document.company_id = p_company_id and public.has_permission(p_company_id, 'purchasing_lists.view') and (document.safe_metadata->>'visibility' = 'company' or document.owner_user_id = auth.uid()))
      or (document.document_type = 'purchase_template' and document.company_id = p_company_id and public.has_permission(p_company_id, 'purchase_templates.view') and (document.safe_metadata->>'visibility' = 'company' or document.owner_user_id = auth.uid()))
      or (document.document_type in ('estimate', 'proposal', 'manual_line', 'template') and document.company_id = p_company_id and public.can_access_estimates(p_company_id, 'estimates.view'))
    )
  order by case when lower(document.title) = input.query then 0 when lower(document.title) like input.query || '%' then 1 else 2 end,
    document.updated_at desc, document.document_key
  limit (select result_limit from input);
$$;

revoke all on function public.search_partner_workspace(uuid, text, integer) from public, anon;
grant execute on function public.search_partner_workspace(uuid, text, integer) to authenticated;

commit;
