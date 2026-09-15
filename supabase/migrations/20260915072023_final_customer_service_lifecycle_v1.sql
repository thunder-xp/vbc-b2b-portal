-- Final Customer Service Lifecycle V1. Portal-owned intake, conversation and
-- notification projection only; no 1C repair/accounting ownership is created.

-- Retire the original arbitrary status writer; V2 below is the only Admin
-- transition boundary and validates the complete state machine atomically.
revoke execute on function public.update_customer_service_request_status_v1(uuid,bigint,text,uuid) from service_role;

alter table public.customer_service_request_events
  drop constraint customer_service_request_events_event_type_check;
alter table public.customer_service_request_events
  add constraint customer_service_request_events_event_type_check check (event_type in (
    'CREATED','STATUS_CHANGED','CANCELLED','CUSTOMER_REPLIED','NOVOTECH_REPLIED',
    'INTERNAL_NOTE_ADDED','ATTACHMENT_ADDED','INTERNAL_ATTACHMENT_ADDED','CUSTOMER_SERVICE_CREATED',
    'CUSTOMER_SERVICE_STATUS_CHANGED','CUSTOMER_SERVICE_NEED_INFO',
    'CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH','CUSTOMER_SERVICE_CUSTOMER_REPLIED',
    'CUSTOMER_SERVICE_RESOLVED'
  ));

drop policy if exists customer_service_request_events_select_own on public.customer_service_request_events;
create policy customer_service_request_events_select_own
on public.customer_service_request_events for select to authenticated using (
  event_type not in ('INTERNAL_NOTE_ADDED','INTERNAL_ATTACHMENT_ADDED') and exists (
    select 1 from public.customer_service_requests request
    join public.customer_accounts account on account.id = request.customer_account_id
    where request.id = customer_service_request_events.request_id
      and account.auth_user_id = (select auth.uid())
  )
);

create table public.customer_service_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.customer_service_requests(id) on delete restrict,
  author_type text not null check (author_type in ('CUSTOMER','NOVOTECH')),
  author_user_id uuid null,
  visibility text not null check (visibility in ('CUSTOMER_VISIBLE','INTERNAL')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  check (author_type = 'NOVOTECH' or visibility = 'CUSTOMER_VISIBLE')
);

create index customer_service_messages_request_created_idx
  on public.customer_service_messages (request_id, created_at, id);
create index if not exists customer_service_requests_account_idx
  on public.customer_service_requests (customer_account_id, created_at desc, id);

create table public.customer_service_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.customer_service_requests(id) on delete restrict,
  message_id uuid null references public.customer_service_messages(id) on delete restrict,
  uploaded_by_kind text not null check (uploaded_by_kind in ('CUSTOMER','ADMIN')),
  uploaded_by_user_id uuid null,
  visibility text not null check (visibility in ('CUSTOMER_VISIBLE','INTERNAL')),
  bucket_name text not null default 'service-evidence' check (bucket_name = 'service-evidence'),
  storage_path text not null unique check (storage_path like 'customer-service/%'),
  file_name text not null check (char_length(file_name) between 1 and 180),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (uploaded_by_kind = 'ADMIN' or visibility = 'CUSTOMER_VISIBLE')
);

create index customer_service_attachments_request_created_idx
  on public.customer_service_attachments (request_id, created_at, id);
create index customer_service_attachments_message_idx
  on public.customer_service_attachments (message_id) where message_id is not null;

create table public.customer_service_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  request_id uuid not null references public.customer_service_requests(id) on delete restrict,
  source_event_id uuid not null references public.customer_service_request_events(id) on delete restrict,
  event_code text not null check (event_code in (
    'CUSTOMER_SERVICE_NEED_INFO','CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH','CUSTOMER_SERVICE_RESOLVED'
  )),
  semantic_identity text not null unique check (char_length(semantic_identity) between 16 and 200),
  action_path text not null check (action_path ~ '^/account/service/[0-9a-f-]{36}$'),
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index customer_service_notifications_account_created_idx
  on public.customer_service_notifications (customer_account_id, created_at desc, id desc);
create index customer_service_notifications_request_idx
  on public.customer_service_notifications (request_id, created_at desc, id desc);
create index customer_service_notifications_source_event_idx
  on public.customer_service_notifications (source_event_id);
create index customer_service_notifications_account_unread_idx
  on public.customer_service_notifications (customer_account_id, created_at desc, id desc)
  where read_at is null;

create or replace function public.prevent_customer_service_immutable_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Customer service communication history is append-only.' using errcode = '42501';
end;
$$;

create trigger customer_service_messages_immutable
before update or delete on public.customer_service_messages
for each row execute function public.prevent_customer_service_immutable_mutation();
create trigger customer_service_attachments_immutable
before update or delete on public.customer_service_attachments
for each row execute function public.prevent_customer_service_immutable_mutation();

alter table public.customer_service_messages enable row level security;
alter table public.customer_service_messages force row level security;
alter table public.customer_service_attachments enable row level security;
alter table public.customer_service_attachments force row level security;
alter table public.customer_service_notifications enable row level security;
alter table public.customer_service_notifications force row level security;

create policy customer_service_messages_select_own_visible
on public.customer_service_messages for select to authenticated using (
  visibility = 'CUSTOMER_VISIBLE' and exists (
    select 1 from public.customer_service_requests request
    join public.customer_accounts account on account.id = request.customer_account_id
    where request.id = customer_service_messages.request_id
      and account.auth_user_id = (select auth.uid())
  )
);
create policy customer_service_attachments_select_own_visible
on public.customer_service_attachments for select to authenticated using (
  visibility = 'CUSTOMER_VISIBLE' and exists (
    select 1 from public.customer_service_requests request
    join public.customer_accounts account on account.id = request.customer_account_id
    where request.id = customer_service_attachments.request_id
      and account.auth_user_id = (select auth.uid())
  )
);
create policy customer_service_notifications_select_own
on public.customer_service_notifications for select to authenticated using (
  exists (select 1 from public.customer_accounts account
    where account.id = customer_service_notifications.customer_account_id
      and account.auth_user_id = (select auth.uid()))
);

revoke all on public.customer_service_messages, public.customer_service_attachments,
  public.customer_service_notifications from public, anon, authenticated;
grant select on public.customer_service_messages, public.customer_service_attachments,
  public.customer_service_notifications to authenticated;
grant all on public.customer_service_messages, public.customer_service_attachments,
  public.customer_service_notifications to service_role;

create or replace function public.create_customer_service_request_v1(
  p_customer_account_id uuid, p_customer_identity_id uuid, p_actor_user_id uuid,
  p_request_type text, p_subject text, p_description text, p_preferred_contact text,
  p_retail_order_id uuid default null, p_retail_order_line_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if not exists (select 1 from public.customer_accounts account where account.id=p_customer_account_id
    and account.customer_identity_id=p_customer_identity_id and account.auth_user_id=p_actor_user_id and account.status='ACTIVE')
    then raise exception 'Invalid customer context.' using errcode='42501'; end if;
  if p_retail_order_id is not null and not exists (select 1 from public.retail_orders orders
    join public.retail_customers customer on customer.id=orders.customer_id
    where orders.id=p_retail_order_id and customer.customer_identity_id=p_customer_identity_id)
    then raise exception 'Invalid customer order reference.' using errcode='42501'; end if;
  if p_retail_order_line_id is not null and not exists (select 1 from public.retail_order_lines line
    where line.id=p_retail_order_line_id and line.order_id=p_retail_order_id)
    then raise exception 'Invalid customer order-line reference.' using errcode='42501'; end if;
  insert into public.customer_service_requests(customer_account_id,customer_identity_id,retail_order_id,
    retail_order_line_id,request_type,subject,description,preferred_contact)
  values(p_customer_account_id,p_customer_identity_id,p_retail_order_id,p_retail_order_line_id,
    p_request_type,p_subject,p_description,p_preferred_contact) returning id into created_id;
  insert into public.customer_service_request_events(request_id,actor_kind,actor_user_id,event_type,to_status,safe_metadata)
  values(created_id,'CUSTOMER',p_actor_user_id,'CUSTOMER_SERVICE_CREATED','NEW',jsonb_build_object('requestType',p_request_type));
  return created_id;
end;
$$;

create or replace function public.add_customer_service_reply_v1(
  p_customer_identity_id uuid, p_request_id uuid, p_expected_version bigint,
  p_actor_user_id uuid, p_body text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  request_row public.customer_service_requests%rowtype;
  created_message_id uuid;
begin
  select * into request_row from public.customer_service_requests
  where id = p_request_id and customer_identity_id = p_customer_identity_id
    and version = p_expected_version for update;
  if request_row.id is null then raise exception 'Customer service request conflict.' using errcode = 'PT409'; end if;
  if not exists (select 1 from public.customer_accounts account
    where account.id = request_row.customer_account_id and account.auth_user_id = p_actor_user_id
      and account.customer_identity_id = p_customer_identity_id and account.status = 'ACTIVE')
    then raise exception 'Invalid customer context.' using errcode = '42501'; end if;
  if request_row.status not in ('NEW','IN_REVIEW','NEED_INFO','ACCEPTED')
    then raise exception 'Create a new request for further help.' using errcode = '22023'; end if;
  if char_length(btrim(p_body)) not between 1 and 4000
    then raise exception 'Invalid message.' using errcode = '22023'; end if;

  insert into public.customer_service_messages(request_id,author_type,author_user_id,visibility,body)
  values (p_request_id,'CUSTOMER',p_actor_user_id,'CUSTOMER_VISIBLE',btrim(p_body)) returning id into created_message_id;
  update public.customer_service_requests set
    status = case when status = 'NEED_INFO' then 'IN_REVIEW' else status end,
    version = version + 1
  where id = p_request_id;
  insert into public.customer_service_request_events(request_id,actor_kind,actor_user_id,event_type,from_status,to_status,safe_metadata)
  values (p_request_id,'CUSTOMER',p_actor_user_id,'CUSTOMER_SERVICE_CUSTOMER_REPLIED',request_row.status,
    case when request_row.status = 'NEED_INFO' then 'IN_REVIEW' else request_row.status end,
    jsonb_build_object('messageId',created_message_id));
  return created_message_id;
end;
$$;

create or replace function public.admin_update_customer_service_request_v2(
  p_request_id uuid, p_expected_version bigint, p_status text,
  p_customer_reply text, p_internal_note text, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  request_row public.customer_service_requests%rowtype;
  created_event_id uuid;
  reply_event_id uuid;
  visible_message_id uuid;
  internal_message_id uuid;
  next_status text;
  event_code text;
begin
  select * into request_row from public.customer_service_requests where id = p_request_id
    and version = p_expected_version for update;
  if request_row.id is null then raise exception 'Customer service request conflict.' using errcode = 'PT409'; end if;
  if request_row.status in ('CLOSED','CANCELLED') then
    raise exception 'Customer service lifecycle is complete.' using errcode = '22023';
  end if;
  next_status := nullif(p_status,'');
  if next_status is not null and next_status = request_row.status then next_status := null; end if;
  if next_status is not null and not (
    (request_row.status = 'NEW' and next_status in ('IN_REVIEW','CANCELLED')) or
    (request_row.status = 'IN_REVIEW' and next_status in ('NEED_INFO','ACCEPTED','CANCELLED')) or
    (request_row.status = 'NEED_INFO' and next_status in ('IN_REVIEW','CANCELLED')) or
    (request_row.status = 'ACCEPTED' and next_status in ('RESOLVED','CANCELLED')) or
    (request_row.status = 'RESOLVED' and next_status = 'CLOSED')
  ) then raise exception 'Invalid customer service transition.' using errcode = '22023'; end if;
  if next_status = 'NEED_INFO' and char_length(btrim(coalesce(p_customer_reply,''))) = 0
    then raise exception 'NEED_INFO requires a customer-visible explanation.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_customer_reply,''))) > 4000 or char_length(btrim(coalesce(p_internal_note,''))) > 4000
    then raise exception 'Invalid message.' using errcode = '22023'; end if;
  if next_status is null and char_length(btrim(coalesce(p_customer_reply,''))) = 0
    and char_length(btrim(coalesce(p_internal_note,''))) = 0
    then raise exception 'No service change supplied.' using errcode = '22023'; end if;

  if char_length(btrim(coalesce(p_customer_reply,''))) > 0 then
    insert into public.customer_service_messages(request_id,author_type,author_user_id,visibility,body)
    values (p_request_id,'NOVOTECH',p_actor_user_id,'CUSTOMER_VISIBLE',btrim(p_customer_reply)) returning id into visible_message_id;
    insert into public.customer_service_request_events(request_id,actor_kind,actor_user_id,event_type,safe_metadata)
    values (p_request_id,'ADMIN',p_actor_user_id,'CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH',jsonb_build_object('messageId',visible_message_id))
    returning id into reply_event_id;
  end if;
  if char_length(btrim(coalesce(p_internal_note,''))) > 0 then
    insert into public.customer_service_messages(request_id,author_type,author_user_id,visibility,body)
    values (p_request_id,'NOVOTECH',p_actor_user_id,'INTERNAL',btrim(p_internal_note)) returning id into internal_message_id;
    insert into public.customer_service_request_events(request_id,actor_kind,actor_user_id,event_type,safe_metadata)
    values (p_request_id,'ADMIN',p_actor_user_id,'INTERNAL_NOTE_ADDED',jsonb_build_object('messageId',internal_message_id));
  end if;
  if next_status is not null then
    update public.customer_service_requests set status = next_status, version = version + 1,
      resolved_at = case when next_status in ('RESOLVED','CLOSED') then coalesce(resolved_at,now()) else resolved_at end
    where id = p_request_id;
    insert into public.customer_service_request_events(request_id,actor_kind,actor_user_id,event_type,from_status,to_status,safe_metadata)
    values (p_request_id,'ADMIN',p_actor_user_id,
      case when next_status='NEED_INFO' then 'CUSTOMER_SERVICE_NEED_INFO'
        when next_status='RESOLVED' then 'CUSTOMER_SERVICE_RESOLVED' else 'CUSTOMER_SERVICE_STATUS_CHANGED' end,
      request_row.status,next_status,
      case when visible_message_id is null then '{}'::jsonb else jsonb_build_object('messageId',visible_message_id) end)
    returning id into created_event_id;
  elsif visible_message_id is not null then
    update public.customer_service_requests set version = version + 1 where id = p_request_id;
    created_event_id := reply_event_id;
  else
    update public.customer_service_requests set version = version + 1 where id = p_request_id;
  end if;

  event_code := case when next_status = 'NEED_INFO' then 'CUSTOMER_SERVICE_NEED_INFO'
    when next_status = 'RESOLVED' then 'CUSTOMER_SERVICE_RESOLVED'
    when visible_message_id is not null then 'CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH' else null end;
  if event_code is not null then
    insert into public.customer_service_notifications(customer_account_id,request_id,source_event_id,event_code,semantic_identity,action_path)
    values (request_row.customer_account_id,p_request_id,coalesce(created_event_id,reply_event_id),event_code,
      concat(event_code,':',coalesce(created_event_id,reply_event_id)::text),concat('/account/service/',p_request_id::text))
    on conflict (semantic_identity) do nothing;
  end if;
  return jsonb_build_object('messageId',visible_message_id,'eventId',coalesce(created_event_id,reply_event_id),'status',coalesce(next_status,request_row.status));
end;
$$;

create or replace function public.add_customer_service_attachment_v1(
  p_request_id uuid, p_message_id uuid, p_actor_kind text, p_actor_user_id uuid,
  p_customer_identity_id uuid, p_visibility text, p_storage_path text,
  p_file_name text, p_content_type text, p_size_bytes bigint, p_checksum_sha256 text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid; request_row public.customer_service_requests%rowtype;
begin
  select * into request_row from public.customer_service_requests where id = p_request_id for update;
  if request_row.id is null then raise exception 'Invalid request.' using errcode = '22023'; end if;
  if p_actor_kind = 'CUSTOMER' and not (p_visibility = 'CUSTOMER_VISIBLE'
    and request_row.customer_identity_id = p_customer_identity_id
    and exists (select 1 from public.customer_accounts account where account.id = request_row.customer_account_id
      and account.auth_user_id = p_actor_user_id and account.status = 'ACTIVE'))
    then raise exception 'Invalid customer attachment context.' using errcode = '42501'; end if;
  if p_actor_kind not in ('CUSTOMER','ADMIN') then raise exception 'Invalid attachment actor.' using errcode = '22023'; end if;
  if p_message_id is not null and not exists (select 1 from public.customer_service_messages message
    where message.id = p_message_id and message.request_id = p_request_id and message.visibility = p_visibility)
    then raise exception 'Invalid attachment message.' using errcode = '22023'; end if;
  if (select count(*) from public.customer_service_attachments where request_id = p_request_id) >= 5
    then raise exception 'Attachment limit reached.' using errcode = '22023'; end if;
  insert into public.customer_service_attachments(request_id,message_id,uploaded_by_kind,uploaded_by_user_id,
    visibility,storage_path,file_name,content_type,size_bytes,checksum_sha256)
  values (p_request_id,p_message_id,p_actor_kind,p_actor_user_id,p_visibility,p_storage_path,
    p_file_name,p_content_type,p_size_bytes,p_checksum_sha256) returning id into created_id;
  insert into public.customer_service_request_events(request_id,actor_kind,actor_user_id,event_type,safe_metadata)
  values (p_request_id,p_actor_kind,p_actor_user_id,
    case when p_visibility='INTERNAL' then 'INTERNAL_ATTACHMENT_ADDED' else 'ATTACHMENT_ADDED' end,
    jsonb_build_object('attachmentId',created_id));
  return created_id;
end;
$$;

create or replace function public.mark_customer_service_notification_read_v1(
  p_notification_id uuid, p_actor_user_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.customer_service_notifications notification set read_at = coalesce(read_at,now())
  where notification.id = p_notification_id and exists (select 1 from public.customer_accounts account
    where account.id = notification.customer_account_id and account.auth_user_id = p_actor_user_id);
  if not found then raise exception 'Notification not found.' using errcode = '42501'; end if;
end;
$$;

-- Preserve the one-read command-center contract while adding bounded service attention.
create or replace function public.get_final_customer_cabinet_overview_v1(p_customer_identity_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with customer_contexts as (
    select id,name,created_at from public.retail_customers where customer_identity_id=p_customer_identity_id
  ), latest_order as (
    select orders.* from public.retail_orders orders join customer_contexts customer on customer.id=orders.customer_id
    order by orders.created_at desc,orders.id desc limit 1
  ), confirmed_lines as (
    select line.*,orders.public_number,coalesce(orders.paid_at,orders.created_at) purchased_at
    from public.retail_orders orders join customer_contexts customer on customer.id=orders.customer_id
    join public.retail_order_lines line on line.order_id=orders.id
    where orders.status='confirmed' and orders.paid_at is not null
  ), recent_purchases as (
    select coalesce(jsonb_agg(jsonb_build_object('id',recent.id,'name',recent.product_name,'sku',recent.sku)
      order by recent.purchased_at desc,recent.id) filter(where recent.id is not null),'[]'::jsonb) value
    from (select * from confirmed_lines order by purchased_at desc,id limit 3) recent
  ), document_total as (
    select count(distinct document.id)::integer value from confirmed_lines line
    join public.public_retail_product_identities identity on identity.public_id=line.public_product_id
    join public.catalog_product_documents document on document.product_id=identity.source_product_id and document.is_active
  ), latest_request as (
    select request.* from public.customer_service_requests request where request.customer_identity_id=p_customer_identity_id
    order by request.created_at desc,request.id desc limit 1
  ), service_counts as (
    select count(*) filter(where status='NEED_INFO')::integer needs_info,
      count(*) filter(where status in ('NEW','IN_REVIEW','NEED_INFO','ACCEPTED'))::integer active
    from public.customer_service_requests where customer_identity_id=p_customer_identity_id
  ) select jsonb_build_object(
    'displayName',(select name from customer_contexts order by created_at desc,id desc limit 1),
    'latestOrder',(select jsonb_build_object('id',orders.id,'number',orders.public_number,'status',orders.status,
      'createdAt',orders.created_at,'total',orders.priced_scope_total,'currency',orders.currency,
      'itemCount',(select coalesce(sum(line.quantity),0) from public.retail_order_lines line where line.order_id=orders.id),
      'paidAt',orders.paid_at) from latest_order orders),
    'recentPurchases',(select value from recent_purchases),
    'equipmentCount',(select count(*)::integer from confirmed_lines where unit_code<>'service'),
    'documentCount',(select value from document_total),
    'latestRequest',(select jsonb_build_object('id',request.id,'number',request.public_number,'status',request.status) from latest_request request),
    'serviceNeedsInfoCount',(select needs_info from service_counts),
    'activeServiceRequestCount',(select active from service_counts)
  );
$$;

revoke all on function public.add_customer_service_reply_v1(uuid,uuid,bigint,uuid,text),
  public.admin_update_customer_service_request_v2(uuid,bigint,text,text,text,uuid),
  public.add_customer_service_attachment_v1(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text),
  public.mark_customer_service_notification_read_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.add_customer_service_reply_v1(uuid,uuid,bigint,uuid,text),
  public.admin_update_customer_service_request_v2(uuid,bigint,text,text,text,uuid),
  public.add_customer_service_attachment_v1(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text),
  public.mark_customer_service_notification_read_v1(uuid,uuid)
  to service_role;

comment on table public.customer_service_messages is 'Append-only Final Customer service conversation; INTERNAL rows are never customer-readable.';
comment on table public.customer_service_attachments is 'Private service-evidence object mapping; retained with the request in V1 and never hard-deleted automatically.';
comment on table public.customer_service_notifications is 'Idempotent Final Customer in-app projection. External CUSTOMER_SERVICE channels remain separately disabled.';
