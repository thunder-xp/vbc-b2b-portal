-- Customer Object V2 keeps the aggregate Portal-owned while adding an
-- append-only organization audit and one bounded workspace read. Purchased
-- equipment is never treated as installed, serialized or covered by warranty.

create table public.customer_object_events (
  id uuid primary key default gen_random_uuid(),
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  customer_object_id uuid not null references public.customer_objects(id) on delete restrict,
  previous_customer_object_id uuid null references public.customer_objects(id) on delete restrict,
  retail_order_id uuid null references public.retail_orders(id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in (
    'OBJECT_CREATED','OBJECT_UPDATED','OBJECT_ARCHIVED',
    'PURCHASE_LINKED','PURCHASE_REASSIGNED'
  )),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (
    (event_type = 'PURCHASE_REASSIGNED' and retail_order_id is not null and previous_customer_object_id is not null and previous_customer_object_id <> customer_object_id)
    or (event_type = 'PURCHASE_LINKED' and retail_order_id is not null and previous_customer_object_id is null)
    or (event_type in ('OBJECT_CREATED','OBJECT_UPDATED','OBJECT_ARCHIVED') and retail_order_id is null and previous_customer_object_id is null)
  )
);

comment on table public.customer_object_events is
  'Append-only customer-visible organization audit. It contains no installation, warranty, serial or accounting truth.';

create index customer_object_events_object_created_idx
  on public.customer_object_events (customer_object_id, created_at desc, id);
create index customer_object_events_previous_object_idx
  on public.customer_object_events (previous_customer_object_id, created_at desc, id)
  where previous_customer_object_id is not null;
create index customer_object_events_identity_created_idx
  on public.customer_object_events (customer_identity_id, created_at desc, id);

create or replace function private.prevent_customer_object_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Customer object events are append-only.' using errcode = '42501';
end;
$$;

create trigger customer_object_events_immutable
before update or delete on public.customer_object_events
for each row execute function private.prevent_customer_object_event_mutation();

alter table public.customer_object_events enable row level security;
alter table public.customer_object_events force row level security;

create policy customer_object_events_select_own
on public.customer_object_events
for select to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.customer_accounts account
    where account.customer_identity_id = customer_object_events.customer_identity_id
      and account.auth_user_id = (select auth.uid())
      and account.status = 'ACTIVE'
  )
);

revoke all on public.customer_object_events from public, anon, authenticated, service_role;
grant select on public.customer_object_events to authenticated;
grant select, insert on public.customer_object_events to service_role;

-- Existing V1 state becomes a factual starting timeline without modifying any
-- existing customer-owned row.
insert into public.customer_object_events (
  customer_identity_id, customer_object_id, actor_auth_user_id, event_type, created_at
)
select object_row.customer_identity_id, object_row.id, account.auth_user_id, 'OBJECT_CREATED', object_row.created_at
from public.customer_objects object_row
join lateral (
  select candidate.auth_user_id
  from public.customer_accounts candidate
  where candidate.customer_identity_id = object_row.customer_identity_id
  order by (candidate.status = 'ACTIVE') desc, candidate.created_at, candidate.id
  limit 1
) account on true;

insert into public.customer_object_events (
  customer_identity_id, customer_object_id, retail_order_id,
  actor_auth_user_id, event_type, created_at
)
select object_row.customer_identity_id, link.customer_object_id, link.retail_order_id,
  link.linked_by_auth_user_id, 'PURCHASE_LINKED', link.created_at
from public.customer_object_purchase_links link
join public.customer_objects object_row on object_row.id = link.customer_object_id;

create or replace function public.create_customer_object_v2(
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

  insert into public.customer_object_events (
    customer_identity_id, customer_object_id, actor_auth_user_id, event_type
  ) values (p_customer_identity_id, v_object_id, p_actor_user_id, 'OBJECT_CREATED');

  if p_retail_order_id is not null then
    insert into public.customer_object_purchase_links (
      customer_object_id, retail_order_id, linked_by_auth_user_id
    ) values (v_object_id, p_retail_order_id, p_actor_user_id);
    insert into public.customer_object_events (
      customer_identity_id, customer_object_id, retail_order_id,
      actor_auth_user_id, event_type
    ) values (
      p_customer_identity_id, v_object_id, p_retail_order_id,
      p_actor_user_id, 'PURCHASE_LINKED'
    );
  end if;

  return v_object_id;
end;
$$;

create or replace function public.update_customer_object_v2(
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

  insert into public.customer_object_events (
    customer_identity_id, customer_object_id, actor_auth_user_id, event_type
  ) values (p_customer_identity_id, p_customer_object_id, p_actor_user_id, 'OBJECT_UPDATED');
  return v_version;
end;
$$;

create or replace function public.archive_customer_object_v2(
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

  insert into public.customer_object_events (
    customer_identity_id, customer_object_id, actor_auth_user_id, event_type
  ) values (p_customer_identity_id, p_customer_object_id, p_actor_user_id, 'OBJECT_ARCHIVED');
  return v_version;
end;
$$;

create or replace function public.assign_customer_object_purchase_v2(
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
declare
  v_link public.customer_object_purchase_links%rowtype;
  v_previous_object public.customer_objects%rowtype;
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

  select link.* into v_link
  from public.customer_object_purchase_links link
  where link.retail_order_id = p_retail_order_id
  for update;

  if v_link.id is not null and v_link.customer_object_id = p_customer_object_id then
    return v_link.id;
  end if;

  if v_link.id is not null then
    select object_row.* into v_previous_object
    from public.customer_objects object_row
    where object_row.id = v_link.customer_object_id
      and object_row.customer_identity_id = p_customer_identity_id;

    if v_previous_object.id is null then
      raise exception 'Invalid existing purchase assignment.' using errcode = '42501';
    end if;
    if v_previous_object.status = 'ARCHIVED' then
      raise exception 'Archived object purchase history cannot be reassigned.' using errcode = 'PT409';
    end if;
    if exists (
      select 1 from public.customer_service_requests request
      where request.customer_identity_id = p_customer_identity_id
        and request.retail_order_id = p_retail_order_id
        and request.customer_object_id = v_previous_object.id
    ) then
      raise exception 'Purchase has customer service context.' using errcode = 'PT409';
    end if;

    update public.customer_object_purchase_links
    set customer_object_id = p_customer_object_id,
        linked_by_auth_user_id = p_actor_user_id
    where id = v_link.id
    returning * into v_link;

    insert into public.customer_object_events (
      customer_identity_id, customer_object_id, previous_customer_object_id,
      retail_order_id, actor_auth_user_id, event_type
    ) values (
      p_customer_identity_id, p_customer_object_id, v_previous_object.id,
      p_retail_order_id, p_actor_user_id, 'PURCHASE_REASSIGNED'
    );
    return v_link.id;
  end if;

  insert into public.customer_object_purchase_links (
    customer_object_id, retail_order_id, linked_by_auth_user_id
  ) values (p_customer_object_id, p_retail_order_id, p_actor_user_id)
  returning * into v_link;

  insert into public.customer_object_events (
    customer_identity_id, customer_object_id, retail_order_id,
    actor_auth_user_id, event_type
  ) values (
    p_customer_identity_id, p_customer_object_id, p_retail_order_id,
    p_actor_user_id, 'PURCHASE_LINKED'
  );
  return v_link.id;
end;
$$;

create or replace function public.get_customer_object_workspace_v2(
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
    from public.customer_objects scoped_object
    join public.customer_object_purchase_links link on link.customer_object_id = scoped_object.id
    left join public.retail_order_lines line on line.order_id = link.retail_order_id
    where scoped_object.customer_identity_id = p_customer_identity_id
    group by link.customer_object_id
  ), service_summary as (
    select request.customer_object_id,
      count(*) filter (where request.status not in ('RESOLVED','CLOSED','CANCELLED'))::integer as open_count,
      max(request.updated_at) as last_service_at
    from public.customer_objects scoped_object
    join public.customer_service_requests request on request.customer_object_id = scoped_object.id
    where scoped_object.customer_identity_id = p_customer_identity_id
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
  ), unlinked_all as (
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
  ), unlinked as (
    select * from unlinked_all
    order by paid_at desc, id
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
    'unlinkedPurchaseCount', (select count(*)::integer from unlinked_all),
    'unlinkedPurchases', coalesce((select jsonb_agg(jsonb_build_object(
      'orderId', row.id,
      'orderNumber', row.public_number,
      'purchasedAt', coalesce(row.paid_at, row.created_at),
      'productCount', row.product_count
    ) order by row.paid_at desc, row.id) from unlinked row), '[]'::jsonb),
    'purchaseLinks', coalesce((select jsonb_agg(jsonb_build_object(
      'orderId', link.retail_order_id,
      'objectId', link.customer_object_id,
      'objectName', object_row.name,
      'objectStatus', object_row.status
    ) order by link.updated_at desc, link.id)
      from public.customer_object_purchase_links link
      join public.customer_objects object_row on object_row.id = link.customer_object_id
      where object_row.customer_identity_id = p_customer_identity_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_customer_object_detail_v2(
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

  with current_publication as (
    select publication.id
    from public.public_retail_publications publication
    where publication.status = 'published'
    order by publication.published_at desc nulls last, publication.created_at desc, publication.id
    limit 1
  ), linked_orders as (
    select orders.*
    from public.customer_object_purchase_links link
    join public.retail_orders orders on orders.id = link.retail_order_id
    where link.customer_object_id = p_customer_object_id
    order by orders.paid_at desc nulls last, orders.created_at desc, orders.id
    limit 20
  ), linked_lines as (
    select line.*
    from public.retail_order_lines line
    join linked_orders orders on orders.id = line.order_id
  ), current_products as (
    select line.id as line_id,
      product.public_id, identity.source_product_id, product.slug,
      product.name_ru, product.name_ro, product.retail_price_amount,
      product.retail_price_currency, product.availability,
      product.primary_image_url, product.category_path
    from linked_lines line
    left join current_publication publication on true
    left join public.public_retail_products product
      on product.publication_id = publication.id
      and product.public_id = line.public_product_id
    left join public.public_retail_product_identities identity
      on identity.public_id = product.public_id
  ), document_payloads as (
    select product.line_id,
      jsonb_agg(jsonb_build_object(
        'id', document.id,
        'productId', document.product_id,
        'title', document.title,
        'type', document.document_type,
        'url', document.url
      ) order by document.sort_order, document.id) as documents
    from current_products product
    join public.catalog_product_documents document
      on document.product_id = product.source_product_id
      and document.is_active
    group by product.line_id
  ), line_payloads as (
    select line.order_id, line.line_number,
      jsonb_build_object(
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
        'currency', line.currency,
        'currentProduct', case when product.public_id is null or product.source_product_id is null then null else jsonb_build_object(
          'publicProductId', product.public_id,
          'sourceProductId', product.source_product_id,
          'slug', product.slug,
          'nameRu', product.name_ru,
          'nameRo', product.name_ro,
          'price', product.retail_price_amount,
          'currency', product.retail_price_currency,
          'availability', product.availability,
          'imageUrl', product.primary_image_url,
          'categoryPath', coalesce(product.category_path, '[]'::jsonb)
        ) end,
        'documents', coalesce(documents.documents, '[]'::jsonb)
      ) as payload
    from linked_lines line
    left join current_products product on product.line_id = line.id
    left join document_payloads documents on documents.line_id = line.id
  ), purchase_payloads as (
    select orders.id, orders.paid_at, orders.created_at,
      jsonb_build_object(
        'id', orders.id,
        'number', orders.public_number,
        'purchasedAt', coalesce(orders.paid_at, orders.created_at),
        'total', orders.priced_scope_total,
        'currency', orders.currency,
        'status', orders.status,
        'lines', coalesce((select jsonb_agg(line.payload order by line.line_number)
          from line_payloads line where line.order_id = orders.id), '[]'::jsonb)
      ) as payload
    from linked_orders orders
  ), latest_visible_message as (
    select distinct on (message.request_id)
      message.request_id, message.body, message.author_type, message.created_at
    from public.customer_service_messages message
    join public.customer_service_requests request on request.id = message.request_id
    where request.customer_object_id = p_customer_object_id
      and message.visibility = 'CUSTOMER_VISIBLE'
    order by message.request_id, message.created_at desc, message.id desc
  ), service_payloads as (
    select request.created_at, request.updated_at, request.id,
      jsonb_build_object(
        'id', request.id,
        'number', request.public_number,
        'subject', request.subject,
        'status', request.status,
        'orderId', request.retail_order_id,
        'orderLineId', request.retail_order_line_id,
        'createdAt', request.created_at,
        'updatedAt', request.updated_at,
        'latestCustomerVisibleUpdate', case when message.request_id is null then null else jsonb_build_object(
          'body', message.body,
          'authorType', message.author_type,
          'createdAt', message.created_at
        ) end
      ) as payload
    from public.customer_service_requests request
    left join latest_visible_message message on message.request_id = request.id
    where request.customer_object_id = p_customer_object_id
    order by request.updated_at desc, request.id
    limit 20
  ), activity_rows as (
    select event.created_at, event.id,
      event.event_type as event_type,
      event.retail_order_id,
      null::uuid as service_request_id,
      event.previous_customer_object_id,
      null::text as from_status,
      null::text as to_status
    from public.customer_object_events event
    where event.customer_identity_id = p_customer_identity_id
      and (event.customer_object_id = p_customer_object_id
        or event.previous_customer_object_id = p_customer_object_id)
    union all
    select service_event.created_at, service_event.id,
      case service_event.event_type
        when 'CREATED' then 'SERVICE_REQUEST_OPENED'
        when 'CUSTOMER_SERVICE_CREATED' then 'SERVICE_REQUEST_OPENED'
        else 'SERVICE_STATUS_CHANGED'
      end,
      request.retail_order_id,
      request.id,
      null::uuid,
      service_event.from_status,
      service_event.to_status
    from public.customer_service_request_events service_event
    join public.customer_service_requests request on request.id = service_event.request_id
    where request.customer_object_id = p_customer_object_id
      and service_event.event_type in (
        'CREATED','CUSTOMER_SERVICE_CREATED','STATUS_CHANGED','CANCELLED',
        'CUSTOMER_SERVICE_STATUS_CHANGED','CUSTOMER_SERVICE_NEED_INFO','CUSTOMER_SERVICE_RESOLVED'
      )
  ), activity_limited as (
    select * from activity_rows order by created_at desc, id desc limit 10
  ), unlinked_all as (
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
  ), unlinked as (
    select * from unlinked_all order by paid_at desc, id limit 5
  )
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
    'purchases', coalesce((select jsonb_agg(payload order by paid_at desc nulls last, created_at desc, id)
      from purchase_payloads), '[]'::jsonb),
    'serviceRequests', coalesce((select jsonb_agg(payload order by updated_at desc, id)
      from service_payloads), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
      'id', activity.id,
      'eventType', activity.event_type,
      'createdAt', activity.created_at,
      'orderId', activity.retail_order_id,
      'serviceRequestId', activity.service_request_id,
      'previousObjectId', activity.previous_customer_object_id,
      'fromStatus', activity.from_status,
      'toStatus', activity.to_status
    ) order by activity.created_at desc, activity.id desc) from activity_limited activity), '[]'::jsonb),
    'unlinkedPurchaseCount', (select count(*)::integer from unlinked_all),
    'unlinkedPurchases', coalesce((select jsonb_agg(jsonb_build_object(
      'orderId', row.id,
      'orderNumber', row.public_number,
      'purchasedAt', coalesce(row.paid_at, row.created_at),
      'productCount', row.product_count
    ) order by row.paid_at desc, row.id) from unlinked row), '[]'::jsonb)
  ) into v_result
  from public.customer_objects object_row
  where object_row.id = p_customer_object_id
    and object_row.customer_identity_id = p_customer_identity_id;
  return v_result;
end;
$$;

revoke all on function private.prevent_customer_object_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.create_customer_object_v2(uuid,uuid,uuid,text,text,text,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_customer_object_v2(uuid,uuid,uuid,uuid,bigint,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.archive_customer_object_v2(uuid,uuid,uuid,uuid,bigint) from public, anon, authenticated, service_role;
revoke all on function public.assign_customer_object_purchase_v2(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_customer_object_workspace_v2(uuid,uuid,uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function public.get_customer_object_detail_v2(uuid,uuid,uuid,uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_customer_object_v2(uuid,uuid,uuid,text,text,text,text,uuid) to service_role;
grant execute on function public.update_customer_object_v2(uuid,uuid,uuid,uuid,bigint,text,text,text,text) to service_role;
grant execute on function public.archive_customer_object_v2(uuid,uuid,uuid,uuid,bigint) to service_role;
grant execute on function public.assign_customer_object_purchase_v2(uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.get_customer_object_workspace_v2(uuid,uuid,uuid,boolean) to service_role;
grant execute on function public.get_customer_object_detail_v2(uuid,uuid,uuid,uuid) to service_role;

comment on function public.assign_customer_object_purchase_v2(uuid,uuid,uuid,uuid,uuid) is
  'Assigns or safely reassigns one owned confirmed paid purchase. Reassignment is blocked for archived history or existing service context.';
comment on function public.get_customer_object_detail_v2(uuid,uuid,uuid,uuid) is
  'One bounded customer-object workspace read: purchases, current product projection, documents, service context, activity and unassigned purchases.';
