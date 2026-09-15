-- Final Customer Cabinet V1 adds only a Portal-owned service intake. Orders,
-- purchases, equipment and product documents remain projections of existing
-- Retail Order and Catalog sources.

create table public.customer_service_requests (
  id uuid primary key default gen_random_uuid(),
  public_number text not null unique default ('CR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  customer_identity_id uuid not null references public.customer_identities(id) on delete restrict,
  retail_order_id uuid null references public.retail_orders(id) on delete restrict,
  retail_order_line_id uuid null references public.retail_order_lines(id) on delete restrict,
  request_type text not null check (request_type in (
    'INSTALLATION_REQUEST','DIAGNOSTICS','WARRANTY_QUESTION',
    'PRODUCT_QUESTION','ORDER_QUESTION','OTHER'
  )),
  subject text not null check (char_length(subject) between 3 and 160),
  description text not null check (char_length(description) between 10 and 2000),
  preferred_contact text not null check (preferred_contact in ('PHONE','EMAIL')),
  status text not null default 'NEW' check (status in (
    'NEW','IN_REVIEW','NEED_INFO','ACCEPTED','RESOLVED','CLOSED','CANCELLED'
  )),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null,
  check (retail_order_line_id is null or retail_order_id is not null)
);

create index customer_service_requests_identity_created_idx
  on public.customer_service_requests (customer_identity_id, created_at desc, id);
create index customer_service_requests_admin_queue_idx
  on public.customer_service_requests (status, created_at, id)
  where status not in ('CLOSED','CANCELLED');
create index customer_service_requests_order_idx
  on public.customer_service_requests (retail_order_id)
  where retail_order_id is not null;

create table public.customer_service_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.customer_service_requests(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('CUSTOMER','ADMIN','SYSTEM')),
  actor_user_id uuid null,
  event_type text not null check (event_type in ('CREATED','STATUS_CHANGED','CANCELLED')),
  from_status text null,
  to_status text null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index customer_service_request_events_request_idx
  on public.customer_service_request_events (request_id, created_at, id);

create trigger set_customer_service_requests_updated_at
before update on public.customer_service_requests
for each row execute function public.set_updated_at();

create or replace function public.prevent_customer_service_request_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Customer service request events are append-only.' using errcode = '42501';
end;
$$;

create trigger prevent_customer_service_request_event_mutation
before update or delete on public.customer_service_request_events
for each row execute function public.prevent_customer_service_request_event_mutation();

alter table public.customer_service_requests enable row level security;
alter table public.customer_service_requests force row level security;
alter table public.customer_service_request_events enable row level security;
alter table public.customer_service_request_events force row level security;

create policy customer_service_requests_select_own
on public.customer_service_requests
for select to authenticated
using (exists (
  select 1 from public.customer_accounts account
  where account.id = customer_service_requests.customer_account_id
    and account.auth_user_id = (select auth.uid())
));

create policy customer_service_request_events_select_own
on public.customer_service_request_events
for select to authenticated
using (exists (
  select 1
  from public.customer_service_requests request
  join public.customer_accounts account on account.id = request.customer_account_id
  where request.id = customer_service_request_events.request_id
    and account.auth_user_id = (select auth.uid())
));

revoke all on public.customer_service_requests, public.customer_service_request_events
  from public, anon, authenticated;
grant select on public.customer_service_requests, public.customer_service_request_events
  to authenticated;
grant all on public.customer_service_requests, public.customer_service_request_events
  to service_role;

comment on table public.customer_service_requests is
  'Portal-owned Final Customer intake. It does not replace 1C service, warranty, order or installation truth.';
comment on column public.customer_service_requests.retail_order_line_id is
  'Optional verified link to a line owned by the same customer identity; no serial or warranty entitlement is inferred.';

create or replace function public.create_customer_service_request_v1(
  p_customer_account_id uuid,
  p_customer_identity_id uuid,
  p_actor_user_id uuid,
  p_request_type text,
  p_subject text,
  p_description text,
  p_preferred_contact text,
  p_retail_order_id uuid default null,
  p_retail_order_line_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
begin
  if not exists (
    select 1 from public.customer_accounts account
    where account.id = p_customer_account_id
      and account.customer_identity_id = p_customer_identity_id
      and account.auth_user_id = p_actor_user_id
      and account.status = 'ACTIVE'
  ) then raise exception 'Invalid customer context.' using errcode = '42501'; end if;

  if p_retail_order_id is not null and not exists (
    select 1 from public.retail_orders orders
    join public.retail_customers customer on customer.id = orders.customer_id
    where orders.id = p_retail_order_id and customer.customer_identity_id = p_customer_identity_id
  ) then raise exception 'Invalid customer order reference.' using errcode = '42501'; end if;

  if p_retail_order_line_id is not null and not exists (
    select 1 from public.retail_order_lines line
    where line.id = p_retail_order_line_id and line.order_id = p_retail_order_id
  ) then raise exception 'Invalid customer order-line reference.' using errcode = '42501'; end if;

  insert into public.customer_service_requests (
    customer_account_id, customer_identity_id, retail_order_id, retail_order_line_id,
    request_type, subject, description, preferred_contact
  ) values (
    p_customer_account_id, p_customer_identity_id, p_retail_order_id, p_retail_order_line_id,
    p_request_type, p_subject, p_description, p_preferred_contact
  ) returning id into created_id;

  insert into public.customer_service_request_events (
    request_id, actor_kind, actor_user_id, event_type, to_status, safe_metadata
  ) values (created_id, 'CUSTOMER', p_actor_user_id, 'CREATED', 'NEW', jsonb_build_object('requestType', p_request_type));
  return created_id;
end;
$$;

create or replace function public.cancel_customer_service_request_v1(
  p_customer_identity_id uuid,
  p_request_id uuid,
  p_expected_version bigint,
  p_actor_user_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_status text;
begin
  select status into prior_status from public.customer_service_requests
  where id = p_request_id and customer_identity_id = p_customer_identity_id
    and version = p_expected_version and status in ('NEW','IN_REVIEW','NEED_INFO')
  for update;
  if prior_status is null then raise exception 'Customer service request conflict.' using errcode = 'PT409'; end if;
  update public.customer_service_requests set status = 'CANCELLED', version = version + 1 where id = p_request_id;
  insert into public.customer_service_request_events (request_id, actor_kind, actor_user_id, event_type, from_status, to_status)
  values (p_request_id, 'CUSTOMER', p_actor_user_id, 'CANCELLED', prior_status, 'CANCELLED');
end;
$$;

create or replace function public.update_customer_service_request_status_v1(
  p_request_id uuid,
  p_expected_version bigint,
  p_status text,
  p_actor_user_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_status text;
begin
  select status into prior_status from public.customer_service_requests
  where id = p_request_id and version = p_expected_version for update;
  if prior_status is null then raise exception 'Customer service request conflict.' using errcode = 'PT409'; end if;
  if p_status not in ('NEW','IN_REVIEW','NEED_INFO','ACCEPTED','RESOLVED','CLOSED','CANCELLED')
    then raise exception 'Invalid customer service status.' using errcode = '22023'; end if;
  update public.customer_service_requests set status = p_status, version = version + 1,
    resolved_at = case when p_status in ('RESOLVED','CLOSED') then now() else null end
  where id = p_request_id;
  insert into public.customer_service_request_events (request_id, actor_kind, actor_user_id, event_type, from_status, to_status)
  values (p_request_id, 'ADMIN', p_actor_user_id, 'STATUS_CHANGED', prior_status, p_status);
end;
$$;

revoke all on function public.create_customer_service_request_v1(uuid,uuid,uuid,text,text,text,text,uuid,uuid) from public, anon, authenticated;
revoke all on function public.cancel_customer_service_request_v1(uuid,uuid,bigint,uuid) from public, anon, authenticated;
revoke all on function public.update_customer_service_request_status_v1(uuid,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.create_customer_service_request_v1(uuid,uuid,uuid,text,text,text,text,uuid,uuid) to service_role;
grant execute on function public.cancel_customer_service_request_v1(uuid,uuid,bigint,uuid) to service_role;
grant execute on function public.update_customer_service_request_status_v1(uuid,bigint,text,uuid) to service_role;

create or replace function public.get_final_customer_cabinet_overview_v1(
  p_customer_identity_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with customer_contexts as (
    select id, name, created_at from public.retail_customers
    where customer_identity_id = p_customer_identity_id
  ), latest_order as (
    select orders.* from public.retail_orders orders
    join customer_contexts customer on customer.id = orders.customer_id
    order by orders.created_at desc, orders.id desc limit 1
  ), confirmed_lines as (
    select line.*, orders.public_number, coalesce(orders.paid_at, orders.created_at) purchased_at
    from public.retail_orders orders
    join customer_contexts customer on customer.id = orders.customer_id
    join public.retail_order_lines line on line.order_id = orders.id
    where orders.status = 'confirmed' and orders.paid_at is not null
  ), recent_purchases as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', recent.id, 'name', recent.product_name, 'sku', recent.sku
    ) order by recent.purchased_at desc, recent.id) filter (where recent.id is not null), '[]'::jsonb) value
    from (select * from confirmed_lines order by purchased_at desc, id limit 3) recent
  ), document_total as (
    select count(distinct document.id)::integer value
    from confirmed_lines line
    join public.public_retail_product_identities identity on identity.public_id = line.public_product_id
    join public.catalog_product_documents document on document.product_id = identity.source_product_id and document.is_active
  ), latest_request as (
    select request.* from public.customer_service_requests request
    where request.customer_identity_id = p_customer_identity_id
    order by request.created_at desc, request.id desc limit 1
  )
  select jsonb_build_object(
    'displayName', (select name from customer_contexts order by created_at desc, id desc limit 1),
    'latestOrder', (select jsonb_build_object(
      'id', orders.id, 'number', orders.public_number, 'status', orders.status,
      'createdAt', orders.created_at, 'total', orders.priced_scope_total,
      'currency', orders.currency, 'itemCount', (select coalesce(sum(line.quantity), 0) from public.retail_order_lines line where line.order_id = orders.id),
      'paidAt', orders.paid_at
    ) from latest_order orders),
    'recentPurchases', (select value from recent_purchases),
    'equipmentCount', (select count(*)::integer from confirmed_lines where unit_code <> 'service'),
    'documentCount', (select value from document_total),
    'latestRequest', (select jsonb_build_object(
      'id', request.id, 'number', request.public_number, 'status', request.status
    ) from latest_request request)
  );
$$;

revoke all on function public.get_final_customer_cabinet_overview_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_final_customer_cabinet_overview_v1(uuid) to service_role;
