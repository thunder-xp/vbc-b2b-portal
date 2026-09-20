-- Portal-owned Final Customer object foundation. A linked purchase is factual
-- commercial context only; it never means installed, commissioned or covered
-- by a personal warranty.

create table public.customer_objects (
  id uuid primary key default gen_random_uuid(),
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120 and name = btrim(name)),
  object_type text not null check (object_type in ('HOME','APARTMENT','OFFICE','SHOP','WAREHOUSE','OTHER')),
  locality text null check (locality is null or (char_length(locality) between 2 and 120 and locality = btrim(locality))),
  address_label text null check (address_label is null or (char_length(address_label) between 2 and 200 and address_label = btrim(address_label))),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  check ((status = 'ACTIVE' and archived_at is null) or (status = 'ARCHIVED' and archived_at is not null))
);

comment on table public.customer_objects is
  'Portal-owned customer organization. It is not a 1C site, installed asset, warranty record or Marketplace project.';
comment on column public.customer_objects.address_label is
  'Optional customer-owned bounded label. A full postal address is not required.';

create index customer_objects_identity_status_idx
  on public.customer_objects (customer_identity_id, status, updated_at desc, id);

create table public.customer_object_purchase_links (
  id uuid primary key default gen_random_uuid(),
  customer_object_id uuid not null references public.customer_objects(id) on delete restrict,
  retail_order_id uuid not null unique references public.retail_orders(id) on delete restrict,
  linked_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customer_object_purchase_links is
  'Portal-owned relation meaning only that a confirmed purchase relates to a customer object.';

create index customer_object_purchase_links_object_idx
  on public.customer_object_purchase_links (customer_object_id, updated_at desc, id);

alter table public.customer_service_requests
  add column customer_object_id uuid null references public.customer_objects(id) on delete restrict;

comment on column public.customer_service_requests.customer_object_id is
  'Optional customer-owned context only. It does not establish installation, warranty or 1C service truth.';

create index customer_service_requests_object_idx
  on public.customer_service_requests (customer_object_id, created_at desc, id)
  where customer_object_id is not null;

create trigger set_customer_objects_updated_at
before update on public.customer_objects
for each row execute function public.set_updated_at();

create trigger set_customer_object_purchase_links_updated_at
before update on public.customer_object_purchase_links
for each row execute function public.set_updated_at();

alter table public.customer_objects enable row level security;
alter table public.customer_objects force row level security;
alter table public.customer_object_purchase_links enable row level security;
alter table public.customer_object_purchase_links force row level security;

create policy customer_objects_select_own
on public.customer_objects
for select to authenticated
using (exists (
  select 1
  from public.customer_accounts account
  where account.customer_identity_id = customer_objects.customer_identity_id
    and account.auth_user_id = (select auth.uid())
    and account.status = 'ACTIVE'
));

create policy customer_object_purchase_links_select_own
on public.customer_object_purchase_links
for select to authenticated
using (exists (
  select 1
  from public.customer_objects object_row
  join public.customer_accounts account
    on account.customer_identity_id = object_row.customer_identity_id
  where object_row.id = customer_object_purchase_links.customer_object_id
    and account.auth_user_id = (select auth.uid())
    and account.status = 'ACTIVE'
));

revoke all on public.customer_objects, public.customer_object_purchase_links
  from public, anon, authenticated, service_role;
grant select on public.customer_objects, public.customer_object_purchase_links to authenticated;
grant select, insert, update on public.customer_objects, public.customer_object_purchase_links to service_role;

create or replace function public.create_customer_object_v1(
  p_customer_account_id uuid,
  p_customer_identity_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_object_type text,
  p_locality text default null,
  p_address_label text default null,
  p_retail_order_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_object_id uuid;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_locality text := nullif(regexp_replace(btrim(coalesce(p_locality, '')), '\s+', ' ', 'g'), '');
  v_address_label text := nullif(regexp_replace(btrim(coalesce(p_address_label, '')), '\s+', ' ', 'g'), '');
begin
  if not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.customer_identity_id = p_customer_identity_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) then raise exception 'Invalid customer context.' using errcode = '42501'; end if;

  if char_length(v_name) not between 2 and 120
    or p_object_type not in ('HOME','APARTMENT','OFFICE','SHOP','WAREHOUSE','OTHER')
    or (v_locality is not null and char_length(v_locality) not between 2 and 120)
    or (v_address_label is not null and char_length(v_address_label) not between 2 and 200)
  then raise exception 'Invalid customer object.' using errcode = '22023'; end if;

  if p_retail_order_id is not null and not exists (
    select 1
    from public.retail_orders orders
    join public.retail_customers customer on customer.id = orders.customer_id
    where orders.id = p_retail_order_id
      and customer.customer_identity_id = p_customer_identity_id
      and orders.status = 'confirmed'
      and orders.paid_at is not null
  ) then raise exception 'Invalid confirmed purchase.' using errcode = '42501'; end if;

  insert into public.customer_objects (
    customer_identity_id, name, object_type, locality, address_label
  ) values (
    p_customer_identity_id, v_name, p_object_type, v_locality, v_address_label
  ) returning id into v_object_id;

  if p_retail_order_id is not null then
    insert into public.customer_object_purchase_links (
      customer_object_id, retail_order_id, linked_by_auth_user_id
    ) values (v_object_id, p_retail_order_id, p_actor_user_id);
  end if;

  return v_object_id;
end;
$$;

create or replace function public.update_customer_object_v1(
  p_customer_account_id uuid,
  p_customer_identity_id uuid,
  p_actor_user_id uuid,
  p_customer_object_id uuid,
  p_expected_version bigint,
  p_name text,
  p_object_type text,
  p_locality text default null,
  p_address_label text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_locality text := nullif(regexp_replace(btrim(coalesce(p_locality, '')), '\s+', ' ', 'g'), '');
  v_address_label text := nullif(regexp_replace(btrim(coalesce(p_address_label, '')), '\s+', ' ', 'g'), '');
begin
  if not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.customer_identity_id = p_customer_identity_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) then raise exception 'Invalid customer context.' using errcode = '42501'; end if;

  if char_length(v_name) not between 2 and 120
    or p_object_type not in ('HOME','APARTMENT','OFFICE','SHOP','WAREHOUSE','OTHER')
    or (v_locality is not null and char_length(v_locality) not between 2 and 120)
    or (v_address_label is not null and char_length(v_address_label) not between 2 and 200)
  then raise exception 'Invalid customer object.' using errcode = '22023'; end if;

  update public.customer_objects
  set name = v_name,
      object_type = p_object_type,
      locality = v_locality,
      address_label = v_address_label,
      version = version + 1
  where id = p_customer_object_id
    and customer_identity_id = p_customer_identity_id
    and status = 'ACTIVE'
    and version = p_expected_version
  returning version into v_version;

  if v_version is null then
    raise exception 'Customer object conflict.' using errcode = 'PT409';
  end if;
  return v_version;
end;
$$;

create or replace function public.archive_customer_object_v1(
  p_customer_account_id uuid,
  p_customer_identity_id uuid,
  p_actor_user_id uuid,
  p_customer_object_id uuid,
  p_expected_version bigint
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_version bigint;
begin
  if not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.customer_identity_id = p_customer_identity_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) then raise exception 'Invalid customer context.' using errcode = '42501'; end if;

  update public.customer_objects
  set status = 'ARCHIVED', archived_at = now(), version = version + 1
  where id = p_customer_object_id
    and customer_identity_id = p_customer_identity_id
    and status = 'ACTIVE'
    and version = p_expected_version
  returning version into v_version;

  if v_version is null then
    raise exception 'Customer object conflict.' using errcode = 'PT409';
  end if;
  return v_version;
end;
$$;

create or replace function public.link_customer_object_purchase_v1(
  p_customer_account_id uuid,
  p_customer_identity_id uuid,
  p_actor_user_id uuid,
  p_customer_object_id uuid,
  p_retail_order_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_link_id uuid;
begin
  if not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.customer_identity_id = p_customer_identity_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) or not exists (
    select 1 from public.customer_objects object_row
    where object_row.id = p_customer_object_id
      and object_row.customer_identity_id = p_customer_identity_id
      and object_row.status = 'ACTIVE'
  ) then raise exception 'Invalid customer object context.' using errcode = '42501'; end if;

  if not exists (
    select 1
    from public.retail_orders orders
    join public.retail_customers customer on customer.id = orders.customer_id
    where orders.id = p_retail_order_id
      and customer.customer_identity_id = p_customer_identity_id
      and orders.status = 'confirmed'
      and orders.paid_at is not null
  ) then raise exception 'Invalid confirmed purchase.' using errcode = '42501'; end if;

  insert into public.customer_object_purchase_links (
    customer_object_id, retail_order_id, linked_by_auth_user_id
  ) values (p_customer_object_id, p_retail_order_id, p_actor_user_id)
  on conflict (retail_order_id) do update
    set customer_object_id = excluded.customer_object_id,
        linked_by_auth_user_id = excluded.linked_by_auth_user_id
  returning id into v_link_id;
  return v_link_id;
end;
$$;

create or replace function public.get_customer_object_workspace_v1(
  p_customer_account_id uuid,
  p_customer_identity_id uuid,
  p_actor_user_id uuid,
  p_include_archived boolean default false
) returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.customer_identity_id = p_customer_identity_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) then raise exception 'Invalid customer context.' using errcode = '42501'; end if;

  with purchase_summary as (
    select link.customer_object_id,
      count(distinct link.retail_order_id)::integer as purchase_count,
      count(line.id)::integer as product_count,
      max(link.updated_at) as last_link_at
    from public.customer_object_purchase_links link
    left join public.retail_order_lines line on line.order_id = link.retail_order_id
    group by link.customer_object_id
  ), service_summary as (
    select request.customer_object_id,
      count(*) filter (where request.status not in ('RESOLVED','CLOSED','CANCELLED'))::integer as open_count,
      max(request.updated_at) as last_service_at
    from public.customer_service_requests request
    where request.customer_object_id is not null
    group by request.customer_object_id
  ), object_rows as (
    select object_row.*,
      coalesce(purchase.purchase_count, 0) as purchase_count,
      coalesce(purchase.product_count, 0) as product_count,
      coalesce(service.open_count, 0) as open_service_count,
      greatest(object_row.created_at, object_row.updated_at, purchase.last_link_at, service.last_service_at) as last_activity_at
    from public.customer_objects object_row
    left join purchase_summary purchase on purchase.customer_object_id = object_row.id
    left join service_summary service on service.customer_object_id = object_row.id
    where object_row.customer_identity_id = p_customer_identity_id
      and (p_include_archived or object_row.status = 'ACTIVE')
  ), unlinked as (
    select orders.id, orders.public_number, orders.paid_at, orders.created_at,
      count(line.id)::integer as product_count
    from public.retail_orders orders
    join public.retail_customers customer on customer.id = orders.customer_id
    left join public.retail_order_lines line on line.order_id = orders.id
    where customer.customer_identity_id = p_customer_identity_id
      and orders.status = 'confirmed'
      and orders.paid_at is not null
      and not exists (
        select 1 from public.customer_object_purchase_links link where link.retail_order_id = orders.id
      )
    group by orders.id
    order by orders.paid_at desc, orders.id
    limit 20
  )
  select jsonb_build_object(
    'objects', coalesce((select jsonb_agg(jsonb_build_object(
      'id', row.id,
      'name', row.name,
      'objectType', row.object_type,
      'locality', row.locality,
      'addressLabel', row.address_label,
      'status', row.status,
      'version', row.version,
      'purchaseCount', row.purchase_count,
      'productCount', row.product_count,
      'openServiceCount', row.open_service_count,
      'lastActivityAt', row.last_activity_at,
      'createdAt', row.created_at,
      'updatedAt', row.updated_at
    ) order by row.status, row.last_activity_at desc, row.id) from object_rows row), '[]'::jsonb),
    'unlinkedPurchases', coalesce((select jsonb_agg(jsonb_build_object(
      'orderId', row.id,
      'orderNumber', row.public_number,
      'purchasedAt', coalesce(row.paid_at, row.created_at),
      'productCount', row.product_count
    ) order by row.paid_at desc, row.id) from unlinked row), '[]'::jsonb),
    'purchaseLinks', coalesce((select jsonb_agg(jsonb_build_object(
      'orderId', link.retail_order_id,
      'objectId', link.customer_object_id
    ) order by link.updated_at desc, link.id)
      from public.customer_object_purchase_links link
      join public.customer_objects object_row on object_row.id = link.customer_object_id
      where object_row.customer_identity_id = p_customer_identity_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_customer_object_detail_v1(
  p_customer_account_id uuid,
  p_customer_identity_id uuid,
  p_actor_user_id uuid,
  p_customer_object_id uuid
) returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.customer_identity_id = p_customer_identity_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) then raise exception 'Invalid customer context.' using errcode = '42501'; end if;

  select jsonb_build_object(
    'object', jsonb_build_object(
      'id', object_row.id,
      'name', object_row.name,
      'objectType', object_row.object_type,
      'locality', object_row.locality,
      'addressLabel', object_row.address_label,
      'status', object_row.status,
      'version', object_row.version,
      'createdAt', object_row.created_at,
      'updatedAt', object_row.updated_at
    ),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object(
      'id', orders.id,
      'number', orders.public_number,
      'purchasedAt', coalesce(orders.paid_at, orders.created_at),
      'total', orders.priced_scope_total,
      'currency', orders.currency,
      'status', orders.status,
      'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'id', line.id,
        'lineNumber', line.line_number,
        'publicProductId', line.public_product_id,
        'sku', line.sku,
        'name', line.product_name,
        'slug', line.slug_snapshot,
        'imageUrl', line.image_url_snapshot,
        'quantity', line.quantity,
        'unitCode', line.unit_code,
        'unitPrice', line.unit_price,
        'lineTotal', line.line_total,
        'currency', line.currency
      ) order by line.line_number) from public.retail_order_lines line where line.order_id = orders.id), '[]'::jsonb)
    ) order by orders.paid_at desc, orders.id)
      from public.customer_object_purchase_links link
      join public.retail_orders orders on orders.id = link.retail_order_id
      where link.customer_object_id = object_row.id), '[]'::jsonb),
    'serviceRequests', coalesce((select jsonb_agg(jsonb_build_object(
      'id', request.id,
      'number', request.public_number,
      'subject', request.subject,
      'status', request.status,
      'createdAt', request.created_at
    ) order by request.created_at desc, request.id)
      from public.customer_service_requests request
      where request.customer_object_id = object_row.id), '[]'::jsonb)
  ) into v_result
  from public.customer_objects object_row
  where object_row.id = p_customer_object_id
    and object_row.customer_identity_id = p_customer_identity_id;
  return v_result;
end;
$$;

create or replace function public.create_customer_service_request_v3(
  p_customer_account_id uuid, p_customer_identity_id uuid, p_actor_user_id uuid,
  p_request_type text, p_subject text, p_description text, p_preferred_contact text,
  p_customer_locale text, p_customer_object_id uuid default null,
  p_retail_order_id uuid default null, p_retail_order_line_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_created_id uuid;
begin
  if p_customer_locale not in ('ru','ro') then
    raise exception 'Invalid customer locale.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.customer_identity_id = p_customer_identity_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) then raise exception 'Invalid customer context.' using errcode = '42501'; end if;
  if p_customer_object_id is not null and not exists (
    select 1 from public.customer_objects object_row
    where object_row.id = p_customer_object_id
      and object_row.customer_identity_id = p_customer_identity_id
      and object_row.status = 'ACTIVE'
  ) then raise exception 'Invalid customer object reference.' using errcode = '42501'; end if;
  if p_retail_order_id is not null and not exists (
    select 1
    from public.retail_orders orders
    join public.retail_customers customer on customer.id = orders.customer_id
    where orders.id = p_retail_order_id
      and customer.customer_identity_id = p_customer_identity_id
      and orders.status = 'confirmed'
      and orders.paid_at is not null
  ) then raise exception 'Invalid confirmed customer order reference.' using errcode = '42501'; end if;
  if p_retail_order_line_id is not null and not exists (
    select 1 from public.retail_order_lines line
    where line.id = p_retail_order_line_id and line.order_id = p_retail_order_id
  ) then raise exception 'Invalid customer order-line reference.' using errcode = '42501'; end if;
  if p_customer_object_id is not null and p_retail_order_id is not null and not exists (
    select 1 from public.customer_object_purchase_links link
    where link.customer_object_id = p_customer_object_id
      and link.retail_order_id = p_retail_order_id
  ) then raise exception 'Purchase is not linked to customer object.' using errcode = '42501'; end if;

  insert into public.customer_service_requests (
    customer_account_id, customer_identity_id, customer_object_id, retail_order_id,
    retail_order_line_id, request_type, subject, description, preferred_contact, customer_locale
  ) values (
    p_customer_account_id, p_customer_identity_id, p_customer_object_id, p_retail_order_id,
    p_retail_order_line_id, p_request_type, p_subject, p_description, p_preferred_contact, p_customer_locale
  ) returning id into v_created_id;
  insert into public.customer_service_request_events (
    request_id, actor_kind, actor_user_id, event_type, to_status, safe_metadata
  ) values (
    v_created_id, 'CUSTOMER', p_actor_user_id, 'CUSTOMER_SERVICE_CREATED', 'NEW',
    jsonb_strip_nulls(jsonb_build_object('requestType', p_request_type, 'customerObjectId', p_customer_object_id))
  );
  return v_created_id;
end;
$$;

revoke all on function public.create_customer_object_v1(uuid,uuid,uuid,text,text,text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.update_customer_object_v1(uuid,uuid,uuid,uuid,bigint,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.archive_customer_object_v1(uuid,uuid,uuid,uuid,bigint)
  from public, anon, authenticated;
revoke all on function public.link_customer_object_purchase_v1(uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.get_customer_object_workspace_v1(uuid,uuid,uuid,boolean)
  from public, anon, authenticated;
revoke all on function public.get_customer_object_detail_v1(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.create_customer_service_request_v3(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.create_customer_object_v1(uuid,uuid,uuid,text,text,text,text,uuid) to service_role;
grant execute on function public.update_customer_object_v1(uuid,uuid,uuid,uuid,bigint,text,text,text,text) to service_role;
grant execute on function public.archive_customer_object_v1(uuid,uuid,uuid,uuid,bigint) to service_role;
grant execute on function public.link_customer_object_purchase_v1(uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.get_customer_object_workspace_v1(uuid,uuid,uuid,boolean) to service_role;
grant execute on function public.get_customer_object_detail_v1(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.create_customer_service_request_v3(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,uuid) to service_role;
