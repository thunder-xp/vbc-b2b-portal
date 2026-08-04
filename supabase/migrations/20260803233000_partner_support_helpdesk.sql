begin;

insert into public.permissions(code,description,scope,delegable_by_partner_owner,sensitive,category) values
 ('support.view','View company IT support tickets.','partner',true,false,'support'),
 ('support.create','Create company IT support tickets.','partner',true,false,'support'),
 ('support.reply','Reply to company IT support tickets.','partner',true,false,'support'),
 ('support.attachments.manage','Manage company IT support evidence.','partner',true,true,'support'),
 ('support.view_assigned','View assigned partner support tickets.','internal',false,true,'support'),
 ('support.view_all','View all partner support tickets.','internal',false,true,'support'),
 ('support.assign','Assign partner support tickets.','internal',false,true,'support'),
 ('support.manage','Manage partner support workflow.','internal',false,true,'support'),
 ('support.priority.manage','Adjust effective support priority.','internal',false,true,'support'),
 ('support.analytics.view','View support aggregates.','internal',false,true,'support'),
 ('support.diagnostics.view','View support diagnostics.','internal',false,true,'support')
on conflict(code) do update set description=excluded.description,scope=excluded.scope,delegable_by_partner_owner=excluded.delegable_by_partner_owner,sensitive=excluded.sensitive,category=excluded.category;

with grants(role_code,permission_code) as (values
 ('partner_owner','support.view'),('partner_owner','support.create'),('partner_owner','support.reply'),('partner_owner','support.attachments.manage'),
 ('partner_manager','support.view'),('partner_manager','support.create'),('partner_manager','support.reply'),('partner_manager','support.attachments.manage'),
 ('partner_buyer','support.view'),('partner_buyer','support.create'),('partner_buyer','support.reply'),('partner_buyer','support.attachments.manage'),
 ('partner_viewer','support.view'),
 ('novotech_admin','support.view_assigned'),('novotech_admin','support.view_all'),('novotech_admin','support.assign'),('novotech_admin','support.manage'),('novotech_admin','support.priority.manage'),('novotech_admin','support.analytics.view'),('novotech_admin','support.diagnostics.view'),
 ('novotech_support','support.view_assigned'),('novotech_support','support.view_all'),('novotech_support','support.assign'),('novotech_support','support.manage'),('novotech_support','support.priority.manage'),('novotech_support','support.analytics.view'),('novotech_support','support.diagnostics.view'),
 ('novotech_sales','support.view_assigned'),('novotech_sales','support.view_all'),('novotech_sales','support.assign'),('novotech_sales','support.manage')
)
insert into public.role_permissions(role_id,permission_id)
select role.id,permission.id from grants join public.roles role on role.code=role_code join public.permissions permission on permission.code=permission_code
on conflict do nothing;

insert into public.partner_access_preset_capabilities(preset_code,permission_id)
select 'full_partner_access',id from public.permissions where code in ('support.view','support.create','support.reply','support.attachments.manage') on conflict do nothing;
insert into public.partner_company_capabilities(company_id,permission_id,enabled_by)
select policy.company_id,permission.id,policy.changed_by from public.partner_company_access_policies policy
cross join public.permissions permission where policy.preset_code='full_partner_access' and permission.code in ('support.view','support.create','support.reply','support.attachments.manage') on conflict do nothing;

create sequence public.partner_support_ticket_number_seq;

create table public.partner_support_tickets(
 id uuid primary key default gen_random_uuid(),
 ticket_number text not null unique default ('SUP-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.partner_support_ticket_number_seq')::text,6,'0')),
 company_id uuid not null references public.partner_companies(id) on delete restrict,
 created_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
 assigned_internal_user_id uuid null references public.user_profiles(id) on delete set null,
 requested_priority text not null check(requested_priority in ('high','medium','low')),
 effective_priority text not null check(effective_priority in ('high','medium','low')),
 status text not null default 'new' check(status in ('new','acknowledged','in_progress','waiting_for_partner','solution_proposed','resolved','closed','rejected','cancelled')),
 category text null check(category is null or category in ('account_and_access','catalog','price_or_stock','cart','order_submission','order_history','documents','finance','notifications','service_center','performance','data_mismatch','other')),
 description text not null check(char_length(btrim(description)) between 20 and 5000),
 applicant_name_snapshot text not null,
 applicant_email_snapshot text not null,
 applicant_phone_snapshot text null,
 applicant_role_snapshot text not null,
 company_name_snapshot text not null,
 company_fiscal_code_snapshot text null,
 partner_status_snapshot text not null,
 locale text not null default 'ru' check(locale in ('ru','ro')),
 source_route text not null default '/cabinet/support/new' check(source_route='/cabinet/support/new'),
 safe_context jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_context)='object' and pg_column_size(safe_context)<=2048),
 idempotency_key uuid not null,
 first_response_due_at timestamptz not null,
 resolution_due_at timestamptz not null,
 resolution_paused_at timestamptz null,
 first_responded_at timestamptz null,
 resolved_at timestamptz null,
 closed_at timestamptz null,
 resolution_summary text null check(resolution_summary is null or char_length(resolution_summary)<=5000),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(created_by_user_id,idempotency_key)
);
create table public.partner_support_ticket_events(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.partner_support_tickets(id) on delete restrict,
 actor_user_id uuid null references public.user_profiles(id) on delete set null,event_type text not null,
 partner_visible boolean not null default true,message text null check(message is null or char_length(message)<=5000),
 safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=2048),occurred_at timestamptz not null default now()
);
create table public.partner_support_ticket_messages(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.partner_support_tickets(id) on delete restrict,
 author_user_id uuid not null references public.user_profiles(id) on delete restrict,visibility text not null check(visibility in ('partner','internal')),
 body text not null check(char_length(btrim(body)) between 2 and 5000),created_at timestamptz not null default now()
);
create table public.partner_support_ticket_status_history(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.partner_support_tickets(id) on delete restrict,
 actor_user_id uuid null references public.user_profiles(id) on delete set null,from_status text null,to_status text not null,
 reason text null check(reason is null or char_length(reason)<=1000),occurred_at timestamptz not null default now()
);
create table public.partner_support_ticket_attachments(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.partner_support_tickets(id) on delete restrict,
 uploaded_by_user_id uuid not null references public.user_profiles(id) on delete restrict,file_name text not null,
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 file_size bigint not null check(file_size between 1 and 15728640),checksum_sha256 text not null check(checksum_sha256~'^[0-9a-f]{64}$'),
 storage_bucket text not null default 'partner-support-evidence' check(storage_bucket='partner-support-evidence'),storage_key text not null unique,
 scan_state text not null default 'not_available' check(scan_state in ('not_available','pending','clean','rejected')),created_at timestamptz not null default now()
);
create table public.partner_support_notification_outbox(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.partner_support_tickets(id) on delete restrict,
 source_event_id uuid not null references public.partner_support_ticket_events(id) on delete restrict,event_code text not null,
 audience text not null check(audience in ('partner','internal')),deduplication_key text not null unique,status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
 attempt_count integer not null default 0,next_attempt_at timestamptz not null default now(),safe_error_code text null,created_at timestamptz not null default now(),processed_at timestamptz null
);
create table public.partner_support_sla_worker_runs(
 id uuid primary key default gen_random_uuid(),status text not null check(status in ('running','succeeded','failed','locked')),tickets_scanned integer not null default 0,
 overdue_detected integer not null default 0,safe_error_code text null,duration_ms integer null,started_at timestamptz not null default now(),finished_at timestamptz null
);
create table public.partner_support_internal_notifications(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.partner_support_tickets(id) on delete restrict,
 recipient_user_id uuid not null references public.user_profiles(id) on delete restrict,event_code text not null,title text not null,message text not null,
 action_url text not null,deduplication_key text not null unique,created_at timestamptz not null default now(),read_at timestamptz null
);

create index partner_support_company_updated_idx on public.partner_support_tickets(company_id,updated_at desc,id desc);
create index partner_support_admin_queue_idx on public.partner_support_tickets(status,effective_priority,first_response_due_at,resolution_due_at,updated_at desc);
create index partner_support_assignee_idx on public.partner_support_tickets(assigned_internal_user_id,status,updated_at desc);
create index partner_support_messages_ticket_idx on public.partner_support_ticket_messages(ticket_id,created_at,id);
create index partner_support_events_ticket_idx on public.partner_support_ticket_events(ticket_id,occurred_at,id);
create index partner_support_outbox_pending_idx on public.partner_support_notification_outbox(next_attempt_at,id) where status in ('pending','failed');
create index partner_support_internal_recipient_idx on public.partner_support_internal_notifications(recipient_user_id,created_at desc) where read_at is null;

alter table public.partner_notification_events drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events add constraint partner_notification_events_code_check check(event_code in (
 'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected'
));
alter table public.partner_notifications drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications add constraint partner_notifications_event_code_check check(event_code in (
 'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected'
));
alter table public.partner_notification_events drop constraint if exists partner_notification_events_group_check;
alter table public.partner_notification_events add constraint partner_notification_events_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents','service','support'));
alter table public.partner_notifications drop constraint if exists partner_notifications_group_check;
alter table public.partner_notifications add constraint partner_notifications_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents','service','support'));
alter table public.partner_notification_preferences drop constraint if exists partner_notification_preferences_group_check;
alter table public.partner_notification_preferences add constraint partner_notification_preferences_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents','service','support'));
create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean language sql immutable set search_path=public as $$
 select value='/cabinet'
  or value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
  or value ~ '^/cabinet/service/[0-9a-f-]{36}$'
  or value ~ '^/cabinet/support/[0-9a-f-]{36}$'
  or value='/cabinet/reservation-requests' or value='/cabinet/company/users'
  or value ~ '^/cabinet/catalog/[a-z0-9-]+$' or value='/cabinet/cart'
  or value='/cabinet/offers' or value ~ '^/cabinet/offers/[0-9a-f-]{36}$'
  or value='/cabinet/documents' or value ~ '^/cabinet/documents/[0-9a-f-]{36}$'
$$;

create or replace function public.support_add_business_minutes(p_start timestamptz,p_minutes integer)
returns timestamptz language plpgsql stable set search_path=public as $$
declare local_time timestamp:=p_start at time zone 'Europe/Chisinau'; remaining integer:=greatest(p_minutes,0); available integer;
begin
 while extract(isodow from local_time)>5 or local_time::time>=time '18:00' loop local_time:=date_trunc('day',local_time)+interval '1 day 9 hours'; end loop;
 if local_time::time<time '09:00' then local_time:=date_trunc('day',local_time)+interval '9 hours'; end if;
 while remaining>0 loop
  if extract(isodow from local_time)>5 then local_time:=date_trunc('day',local_time)+interval '1 day 9 hours'; continue; end if;
  available:=floor(extract(epoch from ((date_trunc('day',local_time)+interval '18 hours')-local_time))/60);
  if remaining<=available then local_time:=local_time+make_interval(mins=>remaining); remaining:=0;
  else remaining:=remaining-available; local_time:=date_trunc('day',local_time)+interval '1 day 9 hours'; end if;
 end loop;
 return local_time at time zone 'Europe/Chisinau';
end $$;

create or replace function public.prevent_partner_support_history_mutation() returns trigger language plpgsql set search_path=public as $$begin raise exception 'Support history is append-only.' using errcode='55000';end$$;
create trigger partner_support_events_immutable before update or delete on public.partner_support_ticket_events for each row execute function public.prevent_partner_support_history_mutation();
create trigger partner_support_messages_immutable before update or delete on public.partner_support_ticket_messages for each row execute function public.prevent_partner_support_history_mutation();
create trigger partner_support_status_immutable before update or delete on public.partner_support_ticket_status_history for each row execute function public.prevent_partner_support_history_mutation();

create or replace function public.can_access_partner_support_ticket(p_ticket_id uuid,p_manage boolean default false)
returns boolean language sql stable security definer set search_path=public set row_security=off as $$
 select exists(select 1 from public.partner_support_tickets ticket where ticket.id=p_ticket_id and public.has_permission(ticket.company_id,case when p_manage then 'support.reply' else 'support.view' end))
 or public.has_internal_permission(case when p_manage then 'support.manage' else 'support.view_all' end)
 or exists(select 1 from public.partner_support_tickets ticket where ticket.id=p_ticket_id and ticket.assigned_internal_user_id=auth.uid() and public.has_internal_permission('support.view_assigned'))
$$;

create or replace function public.can_manage_partner_support_attachment(p_ticket_id uuid)
returns boolean language sql stable security definer set search_path=public set row_security=off as $$
 select exists(select 1 from public.partner_support_tickets ticket where ticket.id=p_ticket_id and public.has_permission(ticket.company_id,'support.attachments.manage'))
 or public.has_internal_permission('support.manage')
$$;

create or replace function public.create_partner_support_ticket(p_company_id uuid,p_description text,p_priority text,p_idempotency_key uuid,p_locale text default 'ru')
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare ticket public.partner_support_tickets; profile public.user_profiles; company public.partner_companies; membership record; fiscal text; partner_status text; first_minutes integer; resolution_minutes integer; event_id uuid;
begin
 if auth.uid() is null or not public.has_permission(p_company_id,'support.create') then raise exception 'Support access denied.' using errcode='42501'; end if;
 if char_length(btrim(coalesce(p_description,''))) not between 20 and 5000 or p_priority not in ('high','medium','low') or p_idempotency_key is null then raise exception 'Invalid support request.' using errcode='22023'; end if;
 select * into profile from public.user_profiles where id=auth.uid() and status='active'; if not found then raise exception 'Active profile required.' using errcode='42501'; end if;
 select * into company from public.partner_companies where id=p_company_id and status='active'; if not found then raise exception 'Active company required.' using errcode='42501'; end if;
 select membership_row.*,role.code role_code into membership from public.company_memberships membership_row join public.roles role on role.id=membership_row.role_id where membership_row.user_id=auth.uid() and membership_row.company_id=p_company_id and membership_row.status='active'; if not found then raise exception 'Active membership required.' using errcode='42501'; end if;
 select counterparty.fiscal_code into fiscal from public.one_c_counterparties counterparty where counterparty.external_1c_id=company.external_1c_id and counterparty.is_published limit 1;
 select price_type.name into partner_status from public.price_types price_type where price_type.external_ref=company.external_1c_price_type_id and price_type.is_active limit 1;
 select case p_priority when 'high' then 60 when 'medium' then 240 else 540 end,case p_priority when 'high' then 540 when 'medium' then 1620 else 2700 end into first_minutes,resolution_minutes;
 insert into public.partner_support_tickets(company_id,created_by_user_id,requested_priority,effective_priority,description,applicant_name_snapshot,applicant_email_snapshot,applicant_phone_snapshot,applicant_role_snapshot,company_name_snapshot,company_fiscal_code_snapshot,partner_status_snapshot,locale,idempotency_key,first_response_due_at,resolution_due_at)
 values(p_company_id,auth.uid(),p_priority,p_priority,btrim(p_description),coalesce(nullif(btrim(profile.full_name),''),profile.email),profile.email,profile.phone,membership.role_code,company.display_name,fiscal,coalesce(partner_status,'Не назначен'),case when p_locale='ro' then 'ro' else 'ru' end,p_idempotency_key,public.support_add_business_minutes(now(),first_minutes),public.support_add_business_minutes(now(),resolution_minutes))
 on conflict(created_by_user_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning * into ticket;
 if not exists(select 1 from public.partner_support_ticket_events where ticket_id=ticket.id and event_type='created') then
  insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,message) values(ticket.id,auth.uid(),'created','Заявка зарегистрирована.') returning id into event_id;
  insert into public.partner_support_ticket_status_history(ticket_id,actor_user_id,to_status,reason) values(ticket.id,auth.uid(),'new','Partner submission');
  insert into public.partner_support_notification_outbox(ticket_id,source_event_id,event_code,audience,deduplication_key) values(ticket.id,event_id,'support_ticket_created','partner','support-created-partner-'||ticket.id),(ticket.id,event_id,'support_ticket_new','internal','support-created-internal-'||ticket.id) on conflict do nothing;
  if ticket.effective_priority='high' then insert into public.partner_support_notification_outbox(ticket_id,source_event_id,event_code,audience,deduplication_key) values(ticket.id,event_id,'support_ticket_high_priority','internal','support-high-internal-'||ticket.id) on conflict do nothing; end if;
  insert into public.partner_support_notification_outbox(ticket_id,source_event_id,event_code,audience,deduplication_key) values(ticket.id,event_id,'support_ticket_unassigned','internal','support-unassigned-internal-'||ticket.id) on conflict do nothing;
 end if;
 return jsonb_build_object('id',ticket.id,'ticketNumber',ticket.ticket_number,'status',ticket.status,'version',ticket.version);
end $$;

create or replace function public.list_partner_support_tickets(p_company_id uuid,p_query text default '',p_filter text default 'active',p_page integer default 1,p_page_size integer default 20)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
with input as(select lower(btrim(coalesce(p_query,''))) q,greatest(p_page,1) page,least(greatest(p_page_size,1),50) page_size),visible as(
 select ticket.* from public.partner_support_tickets ticket,input where ticket.company_id=p_company_id and public.has_permission(p_company_id,'support.view')
 and (p_filter='all' or p_filter='active' and ticket.status not in ('resolved','closed','rejected','cancelled') or p_filter='waiting' and ticket.status='waiting_for_partner' or p_filter='closed' and ticket.status in ('resolved','closed'))
 and (input.q='' or lower(ticket.ticket_number||' '||ticket.description) like '%'||input.q||'%'))
select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'ticketNumber',ticket_number,'description',description,'requestedPriority',requested_priority,'effectivePriority',effective_priority,'status',status,'createdAt',created_at,'updatedAt',updated_at,'nextAction',case when status='waiting_for_partner' then 'Добавьте запрошенную информацию' when status='solution_proposed' then 'Подтвердите решение' else 'Ожидайте ответа Novotech' end) order by updated_at desc,id desc),'[]'::jsonb),'total',coalesce(max(total_count),0),'page',(select page from input)) from(select visible.*,count(*) over() total_count from visible order by updated_at desc,id desc offset(select (page-1)*page_size from input) limit(select page_size from input)) rows
$$;

create or replace function public.get_partner_support_ticket(p_ticket_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select case when public.can_access_partner_support_ticket(ticket.id,false) then jsonb_build_object(
 'id',ticket.id,'ticketNumber',ticket.ticket_number,'companyId',ticket.company_id,'status',ticket.status,'requestedPriority',ticket.requested_priority,'effectivePriority',ticket.effective_priority,'category',case when public.has_internal_permission('support.view_all') then ticket.category else null end,'description',ticket.description,
 'applicant',jsonb_build_object('name',ticket.applicant_name_snapshot,'email',ticket.applicant_email_snapshot,'phone',ticket.applicant_phone_snapshot,'role',ticket.applicant_role_snapshot,'company',ticket.company_name_snapshot,'fiscalCode',ticket.company_fiscal_code_snapshot,'partnerStatus',ticket.partner_status_snapshot),
 'assignedInternalUserId',ticket.assigned_internal_user_id,'firstResponseDueAt',ticket.first_response_due_at,'resolutionDueAt',ticket.resolution_due_at,'resolutionSummary',ticket.resolution_summary,'sourceRoute',case when public.has_internal_permission('support.view_all') or ticket.assigned_internal_user_id=auth.uid() and public.has_internal_permission('support.view_assigned') then ticket.source_route else null end,'locale',ticket.locale,'createdAt',ticket.created_at,'updatedAt',ticket.updated_at,'version',ticket.version,
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',message.id,'body',message.body,'visibility',message.visibility,'authorUserId',message.author_user_id,'createdAt',message.created_at) order by message.created_at,message.id) from public.partner_support_ticket_messages message where message.ticket_id=ticket.id and (message.visibility='partner' or public.has_internal_permission('support.view_all') or ticket.assigned_internal_user_id=auth.uid() and public.has_internal_permission('support.view_assigned'))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',event.id,'type',event.event_type,'message',event.message,'occurredAt',event.occurred_at) order by event.occurred_at,event.id) from public.partner_support_ticket_events event where event.ticket_id=ticket.id and (event.partner_visible or public.has_internal_permission('support.view_all'))),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',attachment.id,'fileName',attachment.file_name,'mimeType',attachment.mime_type,'fileSize',attachment.file_size,'createdAt',attachment.created_at) order by attachment.created_at) from public.partner_support_ticket_attachments attachment where attachment.ticket_id=ticket.id and attachment.scan_state<>'rejected'),'[]'::jsonb)
) else null end from public.partner_support_tickets ticket where ticket.id=p_ticket_id
$$;

create or replace function public.add_partner_support_message(p_ticket_id uuid,p_expected_version integer,p_message text)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare ticket public.partner_support_tickets; message_id uuid; event_id uuid; old_status text;
begin
 if not public.can_access_partner_support_ticket(p_ticket_id,true) then raise exception 'Support access denied.' using errcode='42501'; end if;
 if char_length(btrim(coalesce(p_message,''))) not between 2 and 5000 then raise exception 'Invalid message.' using errcode='22023'; end if;
 select * into ticket from public.partner_support_tickets where id=p_ticket_id for update; if ticket.version<>p_expected_version then raise exception 'Ticket changed.' using errcode='40001'; end if; old_status:=ticket.status;
 if ticket.status in ('closed','rejected','cancelled') then raise exception 'Ticket is immutable.' using errcode='22023'; end if;
 insert into public.partner_support_ticket_messages(ticket_id,author_user_id,visibility,body) values(ticket.id,auth.uid(),'partner',btrim(p_message)) returning id into message_id;
 insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,message) values(ticket.id,auth.uid(),'partner_message','Партнёр добавил информацию.') returning id into event_id;
 update public.partner_support_tickets set status=case when status='waiting_for_partner' then 'in_progress' else status end,resolution_due_at=case when status='waiting_for_partner' and resolution_paused_at is not null then resolution_due_at+(now()-resolution_paused_at) else resolution_due_at end,resolution_paused_at=null,updated_at=now(),version=version+1 where id=ticket.id returning * into ticket;
 if old_status='waiting_for_partner' then insert into public.partner_support_ticket_status_history(ticket_id,actor_user_id,from_status,to_status,reason) values(ticket.id,auth.uid(),old_status,'in_progress','Partner supplied requested information'); end if;
 insert into public.partner_support_notification_outbox(ticket_id,source_event_id,event_code,audience,deduplication_key) values(ticket.id,event_id,'support_partner_replied','internal','support-partner-reply-'||message_id) on conflict do nothing;
 return jsonb_build_object('id',ticket.id,'status',ticket.status,'version',ticket.version);
end $$;

create or replace function public.transition_partner_support_ticket(p_ticket_id uuid,p_expected_version integer,p_to_status text,p_partner_reply text default '',p_internal_note text default '',p_assignee uuid default null,p_category text default null,p_effective_priority text default null,p_priority_reason text default null)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare ticket public.partner_support_tickets; old_status text; old_effective_priority text; event_id uuid; allowed boolean;
begin
 if not public.has_internal_permission('support.manage') then raise exception 'Support management denied.' using errcode='42501'; end if;
 select * into ticket from public.partner_support_tickets where id=p_ticket_id for update; if not found then raise exception 'Ticket not found.' using errcode='P0002'; end if;
 if ticket.version<>p_expected_version then raise exception 'Ticket changed.' using errcode='40001'; end if; old_status:=ticket.status; old_effective_priority:=ticket.effective_priority;
 if p_assignee is not null and (not public.has_internal_permission('support.assign') or not exists(select 1 from public.user_profiles profile join public.internal_user_role_assignments assignment on assignment.user_id=profile.id and assignment.revoked_at is null join public.role_permissions role_permission on role_permission.role_id=assignment.role_id join public.permissions permission on permission.id=role_permission.permission_id where profile.id=p_assignee and profile.status='active' and permission.code in ('support.view_all','support.view_assigned'))) then raise exception 'Invalid support assignee.' using errcode='42501'; end if;
 allowed:=p_to_status=old_status or case old_status when 'new' then p_to_status in ('acknowledged','in_progress','rejected') when 'acknowledged' then p_to_status in ('in_progress','waiting_for_partner','solution_proposed','rejected') when 'in_progress' then p_to_status in ('waiting_for_partner','solution_proposed','resolved','rejected') when 'waiting_for_partner' then p_to_status in ('in_progress','solution_proposed','cancelled') when 'solution_proposed' then p_to_status in ('in_progress','resolved','closed') when 'resolved' then p_to_status in ('closed','in_progress') else false end;
 if not allowed then raise exception 'Invalid support transition.' using errcode='22023'; end if;
 if p_to_status in ('solution_proposed','rejected') and char_length(btrim(coalesce(p_partner_reply,'')))<5 then raise exception 'Partner-facing resolution reason required.' using errcode='22023'; end if;
 if p_effective_priority is not null and p_effective_priority<>ticket.effective_priority and (not public.has_internal_permission('support.priority.manage') or p_effective_priority not in ('high','medium','low') or char_length(btrim(coalesce(p_priority_reason,'')))<5) then raise exception 'Priority change requires permission and reason.' using errcode='42501'; end if;
 update public.partner_support_tickets set status=p_to_status,assigned_internal_user_id=coalesce(p_assignee,assigned_internal_user_id),category=coalesce(p_category,category),effective_priority=coalesce(p_effective_priority,effective_priority),first_responded_at=case when first_responded_at is null and (p_to_status<>'new' or nullif(btrim(p_partner_reply),'') is not null) then now() else first_responded_at end,resolution_paused_at=case when p_to_status='waiting_for_partner' then coalesce(resolution_paused_at,now()) else null end,resolution_due_at=case when old_status='waiting_for_partner' and p_to_status<>'waiting_for_partner' and resolution_paused_at is not null then resolution_due_at+(now()-resolution_paused_at) else resolution_due_at end,resolved_at=case when p_to_status='resolved' then coalesce(resolved_at,now()) when p_to_status='in_progress' and old_status<>p_to_status then null else resolved_at end,closed_at=case when p_to_status in ('closed','rejected','cancelled') then coalesce(closed_at,now()) else closed_at end,resolution_summary=case when p_to_status in ('solution_proposed','resolved','closed') then coalesce(nullif(btrim(p_partner_reply),''),resolution_summary) else resolution_summary end,updated_at=now(),version=version+1 where id=p_ticket_id returning * into ticket;
 if p_to_status<>old_status then
  insert into public.partner_support_ticket_status_history(ticket_id,actor_user_id,from_status,to_status,reason) values(ticket.id,auth.uid(),old_status,p_to_status,nullif(btrim(coalesce(p_priority_reason,'')),''));
  insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(ticket.id,auth.uid(),'status_changed',true,nullif(btrim(p_partner_reply),''),jsonb_build_object('status',p_to_status)) returning id into event_id;
 elsif nullif(btrim(p_partner_reply),'') is not null then
  insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,partner_visible,message) values(ticket.id,auth.uid(),'support_reply',true,'Novotech добавил ответ.') returning id into event_id;
 else
  insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(ticket.id,auth.uid(),'ticket_updated',false,'Support ticket metadata updated.',jsonb_build_object('category',p_category,'assigneeChanged',p_assignee is not null)) returning id into event_id;
 end if;
 if nullif(btrim(p_partner_reply),'') is not null then insert into public.partner_support_ticket_messages(ticket_id,author_user_id,visibility,body) values(ticket.id,auth.uid(),'partner',btrim(p_partner_reply)); end if;
 if nullif(btrim(p_internal_note),'') is not null then insert into public.partner_support_ticket_messages(ticket_id,author_user_id,visibility,body) values(ticket.id,auth.uid(),'internal',btrim(p_internal_note)); end if;
 if p_effective_priority is not null and p_effective_priority is distinct from old_effective_priority then insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(ticket.id,auth.uid(),'priority_adjusted',false,'Effective priority adjusted.',jsonb_build_object('reason',p_priority_reason,'priority',p_effective_priority)); end if;
 if p_to_status<>old_status or nullif(btrim(p_partner_reply),'') is not null then insert into public.partner_support_notification_outbox(ticket_id,source_event_id,event_code,audience,deduplication_key) values(ticket.id,event_id,case p_to_status when 'acknowledged' then 'support_ticket_accepted' when 'waiting_for_partner' then 'support_information_requested' when 'solution_proposed' then 'support_solution_proposed' when 'resolved' then 'support_ticket_resolved' when 'closed' then 'support_ticket_closed' when 'rejected' then 'support_ticket_rejected' else 'support_ticket_reply' end,'partner','support-transition-'||event_id) on conflict do nothing; end if;
 return jsonb_build_object('id',ticket.id,'status',ticket.status,'version',ticket.version);
end $$;

create or replace function public.partner_transition_support_ticket(p_ticket_id uuid,p_expected_version integer,p_action text)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare ticket public.partner_support_tickets; old_status text; target_status text; event_id uuid;
begin
 if not public.can_access_partner_support_ticket(p_ticket_id,true) then raise exception 'Support access denied.' using errcode='42501'; end if;
 select * into ticket from public.partner_support_tickets where id=p_ticket_id for update;
 if not found then raise exception 'Ticket not found.' using errcode='P0002'; end if;
 if ticket.version<>p_expected_version then raise exception 'Ticket changed.' using errcode='40001'; end if;
 old_status:=ticket.status;
 target_status:=case
  when p_action='confirm_solution' and old_status='solution_proposed' then 'resolved'
  when p_action='reopen' and old_status in ('solution_proposed','resolved') and (ticket.resolved_at is null or ticket.resolved_at>=now()-interval '14 days') then 'in_progress'
  when p_action='cancel' and old_status in ('new','acknowledged','waiting_for_partner') then 'cancelled'
  else null
 end;
 if target_status is null then raise exception 'Invalid partner support transition.' using errcode='22023'; end if;
 update public.partner_support_tickets set status=target_status,resolution_paused_at=null,resolution_due_at=case when old_status='waiting_for_partner' and resolution_paused_at is not null then resolution_due_at+(now()-resolution_paused_at) else resolution_due_at end,resolved_at=case when target_status='resolved' then now() when target_status='in_progress' then null else resolved_at end,closed_at=case when target_status='cancelled' then now() else null end,updated_at=now(),version=version+1 where id=ticket.id returning * into ticket;
 insert into public.partner_support_ticket_status_history(ticket_id,actor_user_id,from_status,to_status,reason) values(ticket.id,auth.uid(),old_status,target_status,'Partner action: '||p_action);
 insert into public.partner_support_ticket_events(ticket_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(ticket.id,auth.uid(),'partner_status_changed',true,case p_action when 'confirm_solution' then 'Решение подтверждено партнёром.' when 'reopen' then 'Заявка повторно открыта партнёром.' else 'Заявка отменена партнёром.' end,jsonb_build_object('action',p_action,'status',target_status)) returning id into event_id;
 insert into public.partner_support_notification_outbox(ticket_id,source_event_id,event_code,audience,deduplication_key) values(ticket.id,event_id,case when p_action='reopen' then 'support_ticket_reopened' else 'support_partner_replied' end,'internal','support-partner-action-'||event_id) on conflict do nothing;
 return jsonb_build_object('id',ticket.id,'status',ticket.status,'version',ticket.version);
end $$;

create or replace function public.list_admin_partner_support_tickets(p_query text default '',p_status text default null,p_priority text default null,p_mode text default null,p_company text default '',p_assignee uuid default null,p_category text default null,p_created_from date default null,p_created_to date default null,p_page integer default 1,p_page_size integer default 25)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
with input as(select lower(btrim(coalesce(p_query,''))) q,lower(btrim(coalesce(p_company,''))) company_q,greatest(p_page,1) page,least(greatest(p_page_size,1),50) page_size),visible as(
 select ticket.*,assignee.full_name assigned_name from public.partner_support_tickets ticket left join public.user_profiles assignee on assignee.id=ticket.assigned_internal_user_id,input where (public.has_internal_permission('support.view_all') or ticket.assigned_internal_user_id=auth.uid() and public.has_internal_permission('support.view_assigned')) and (p_status is null or ticket.status=p_status) and (p_priority is null or ticket.effective_priority=p_priority) and (p_assignee is null or ticket.assigned_internal_user_id=p_assignee) and (p_category is null or ticket.category=p_category) and (p_created_from is null or ticket.created_at>=p_created_from) and (p_created_to is null or ticket.created_at<p_created_to+1)
 and (p_mode is null or p_mode='new' and ticket.status='new' or p_mode='high_priority' and ticket.effective_priority='high' and ticket.status not in ('closed','rejected','cancelled') or p_mode='unassigned' and ticket.assigned_internal_user_id is null and ticket.status not in ('closed','rejected','cancelled') or p_mode='waiting' and ticket.status='waiting_for_partner' or p_mode='overdue' and (ticket.first_responded_at is null and ticket.first_response_due_at<now() or ticket.resolved_at is null and ticket.resolution_due_at<now()) or p_mode='resolved' and ticket.status in ('resolved','closed'))
 and (input.company_q='' or lower(ticket.company_name_snapshot||' '||coalesce(ticket.company_fiscal_code_snapshot,'')) like '%'||input.company_q||'%')
 and (input.q='' or lower(concat_ws(' ',ticket.ticket_number,ticket.company_name_snapshot,ticket.company_fiscal_code_snapshot,ticket.applicant_name_snapshot,ticket.applicant_email_snapshot,ticket.applicant_phone_snapshot)) like '%'||input.q||'%'))
select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'ticketNumber',ticket_number,'companyName',company_name_snapshot,'applicantName',applicant_name_snapshot,'applicantEmail',applicant_email_snapshot,'applicantPhone',applicant_phone_snapshot,'partnerStatus',partner_status_snapshot,'requestedPriority',requested_priority,'effectivePriority',effective_priority,'status',status,'category',category,'assignedInternalUserId',assigned_internal_user_id,'assignedInternalUserName',assigned_name,'createdAt',created_at,'updatedAt',updated_at,'overdue',first_responded_at is null and first_response_due_at<now() or resolved_at is null and resolution_due_at<now()) order by updated_at desc,id desc),'[]'::jsonb),'total',coalesce(max(total_count),0),'page',(select page from input)) from(select visible.*,count(*) over() total_count from visible order by updated_at desc,id desc offset(select (page-1)*page_size from input) limit(select page_size from input)) rows
$$;

create or replace function public.list_partner_support_assignees()
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
 select case when public.has_internal_permission('support.assign') then coalesce(jsonb_agg(jsonb_build_object('id',candidate.id,'name',candidate.full_name,'email',candidate.email) order by candidate.full_name,candidate.id),'[]'::jsonb) else '[]'::jsonb end
 from(select distinct profile.id,coalesce(nullif(btrim(profile.full_name),''),profile.email) full_name,profile.email from public.user_profiles profile join public.internal_user_role_assignments assignment on assignment.user_id=profile.id and assignment.revoked_at is null join public.role_permissions role_permission on role_permission.role_id=assignment.role_id join public.permissions permission on permission.id=role_permission.permission_id where profile.status='active' and permission.code in ('support.view_all','support.view_assigned')) candidate
$$;

create or replace function public.get_partner_support_dashboard(p_company_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select coalesce(jsonb_agg(jsonb_build_object('id',id,'ticketNumber',ticket_number,'status',status,'updatedAt',updated_at,'nextAction',case when status='waiting_for_partner' then 'Добавьте информацию' when status='solution_proposed' then 'Подтвердите решение' else 'Открыть заявку' end,'href','/cabinet/support/'||id) order by rank,updated_at desc),'[]'::jsonb) from(select ticket.*,case when status='waiting_for_partner' then 1 when status='solution_proposed' then 2 when effective_priority='high' then 3 else 4 end rank from public.partner_support_tickets ticket where company_id=p_company_id and public.has_permission(p_company_id,'support.view') and status not in ('resolved','closed','rejected','cancelled') and (status in ('waiting_for_partner','solution_proposed') or effective_priority='high') order by rank,updated_at desc limit 2) rows
$$;

create or replace function public.search_partner_support_tickets(p_company_id uuid,p_query text,p_limit integer default 10)
returns table(document_type text,document_id uuid,title text,subtitle text,route text,updated_at timestamptz) language sql stable security definer set search_path=public set row_security=off as $$
 select 'support_ticket',ticket.id,ticket.ticket_number,left(ticket.description,120),'/cabinet/support/'||ticket.id,ticket.updated_at from public.partner_support_tickets ticket where ticket.company_id=p_company_id and public.has_permission(p_company_id,'support.view') and char_length(btrim(p_query))>=2 and lower(ticket.ticket_number||' '||ticket.description) like '%'||lower(btrim(p_query))||'%' order by ticket.updated_at desc limit least(greatest(p_limit,1),20)
$$;

create or replace function public.get_partner_support_diagnostics()
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select case when public.has_internal_permission('support.diagnostics.view') then jsonb_build_object('totalTickets',count(*),'new',count(*)filter(where status='new'),'unassigned',count(*)filter(where assigned_internal_user_id is null and status not in ('closed','rejected','cancelled')),'highPriority',count(*)filter(where effective_priority='high' and status not in ('closed','rejected','cancelled')),'waitingForPartner',count(*)filter(where status='waiting_for_partner'),'overdueFirstResponse',count(*)filter(where first_responded_at is null and first_response_due_at<now()),'overdueResolution',count(*)filter(where resolved_at is null and resolution_due_at<now() and status not in ('closed','rejected','cancelled')),'resolved',count(*)filter(where status='resolved'),'closed',count(*)filter(where status='closed'),'notificationFailures',(select count(*) from public.partner_support_notification_outbox where status='failed'),'attachmentFailures',(select count(*) from public.partner_support_ticket_attachments where scan_state='rejected'),'oldestUnresolved',min(created_at)filter(where status not in ('resolved','closed','rejected','cancelled')),'latestSlaWorker',(select to_jsonb(run) from public.partner_support_sla_worker_runs run order by started_at desc limit 1)) else null end from public.partner_support_tickets
$$;

create or replace function public.run_partner_support_sla_worker(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare run_id uuid; scanned integer:=0; overdue integer:=0; candidate record; event_id uuid;
begin
 if not pg_try_advisory_xact_lock(hashtext('partner_support_sla_worker')) then return jsonb_build_object('status','locked'); end if;
 insert into public.partner_support_sla_worker_runs(status) values('running') returning id into run_id;
 for candidate in select ticket.id,ticket.first_response_due_at,ticket.resolution_due_at from public.partner_support_tickets ticket where ticket.status not in ('waiting_for_partner','resolved','closed','rejected','cancelled') order by least(ticket.first_response_due_at,ticket.resolution_due_at) limit least(greatest(p_limit,1),500) loop
  scanned:=scanned+1;
  if candidate.first_response_due_at<now() or candidate.resolution_due_at<now() then
   overdue:=overdue+1;
   if not exists(select 1 from public.partner_support_ticket_events event where event.ticket_id=candidate.id and event.event_type='sla_overdue') then
    insert into public.partner_support_ticket_events(ticket_id,event_type,partner_visible,message) values(candidate.id,'sla_overdue',false,'Support SLA target overdue.') returning id into event_id;
    insert into public.partner_support_notification_outbox(ticket_id,source_event_id,event_code,audience,deduplication_key) values(candidate.id,event_id,'support_ticket_overdue','internal','support-overdue-internal-'||candidate.id) on conflict do nothing;
   end if;
  end if;
 end loop;
 update public.partner_support_sla_worker_runs set status='succeeded',tickets_scanned=scanned,overdue_detected=overdue,finished_at=now(),duration_ms=(extract(epoch from(now()-started_at))*1000)::integer where id=run_id;
 return jsonb_build_object('status','succeeded','ticketsScanned',scanned,'overdueDetected',overdue);
exception when others then update public.partner_support_sla_worker_runs set status='failed',safe_error_code=sqlstate,finished_at=now() where id=run_id; raise;
end $$;

create or replace function public.process_partner_support_notification_outbox(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=public,extensions set row_security=off as $$
declare item record; ticket public.partner_support_tickets; source_id uuid; created_count integer:=0; failed_count integer:=0; title_value text; message_value text;
begin
 for item in select * from public.partner_support_notification_outbox where status in ('pending','failed') and next_attempt_at<=now() order by created_at limit least(greatest(p_limit,1),200) for update skip locked loop
  begin
   update public.partner_support_notification_outbox set status='processing',attempt_count=attempt_count+1 where id=item.id;
   select * into ticket from public.partner_support_tickets where id=item.ticket_id;
   title_value:=case item.event_code when 'support_information_requested' then 'Требуется дополнительная информация' when 'support_solution_proposed' then 'Решение предложено' when 'support_ticket_resolved' then 'Заявка решена' when 'support_ticket_rejected' then 'Заявка отклонена' else 'IT-поддержка Novotech' end;
   message_value:='Откройте заявку '||ticket.ticket_number||', чтобы посмотреть актуальную информацию.';
   if item.audience='partner' then
    insert into public.partner_notification_events(company_id,event_code,event_group,domain,entity_type,entity_id,source_table,source_event_id,source_version,occurred_at,safe_payload,fingerprint)
    values(ticket.company_id,item.event_code,'support','support','support_ticket',ticket.id,'partner_support_ticket_events',item.source_event_id,ticket.version::text,now(),jsonb_build_object('ticketNumber',ticket.ticket_number),encode(digest('support|'||item.deduplication_key,'sha256'),'hex'))
    on conflict(fingerprint) do update set fingerprint=excluded.fingerprint returning id into source_id;
    insert into public.partner_notifications(company_id,recipient_user_id,event_code,event_group,domain,severity,mandatory,title,message,action_label,action_url,entity_type,entity_id,occurred_at,deduplication_key,source_event_id,expires_at,retention_until,email_enabled_snapshot,email_delivery_mode)
    select ticket.company_id,membership.user_id,item.event_code,'support','support',case when item.event_code in ('support_information_requested','support_ticket_rejected') then 'warning' when item.event_code in ('support_ticket_resolved','support_ticket_closed') then 'success' else 'information' end,false,title_value,message_value,'Открыть заявку','/cabinet/support/'||ticket.id,'support_ticket',ticket.id,now(),encode(digest(item.deduplication_key||'|'||membership.user_id,'sha256'),'hex'),source_id,now()+interval '90 days',now()+interval '13 months',false,'off'
    from public.company_memberships membership join public.user_profiles profile on profile.id=membership.user_id and profile.status='active'
    where membership.company_id=ticket.company_id and membership.status='active' and (membership.user_id=ticket.created_by_user_id or public.notification_user_has_permission(membership.user_id,ticket.company_id,'support.view')) on conflict(recipient_user_id,deduplication_key) do nothing;
   else
    insert into public.partner_support_internal_notifications(ticket_id,recipient_user_id,event_code,title,message,action_url,deduplication_key)
    select ticket.id,profile.id,item.event_code,title_value,message_value,'/admin/support/'||ticket.id,item.deduplication_key||'|'||profile.id
    from public.user_profiles profile where profile.status='active' and (profile.id=ticket.assigned_internal_user_id or exists(select 1 from public.internal_user_role_assignments assignment join public.role_permissions role_permission on role_permission.role_id=assignment.role_id join public.permissions permission on permission.id=role_permission.permission_id where assignment.user_id=profile.id and assignment.revoked_at is null and permission.code='support.view_all')) on conflict(deduplication_key) do nothing;
   end if;
   update public.partner_support_notification_outbox set status='sent',processed_at=now(),safe_error_code=null where id=item.id; created_count:=created_count+1;
  exception when others then update public.partner_support_notification_outbox set status='failed',safe_error_code=sqlstate,next_attempt_at=now()+interval '15 minutes' where id=item.id; failed_count:=failed_count+1;
  end;
 end loop;
 return jsonb_build_object('processed',created_count,'failed',failed_count);
end $$;

alter table public.partner_support_tickets enable row level security;
alter table public.partner_support_ticket_events enable row level security;
alter table public.partner_support_ticket_messages enable row level security;
alter table public.partner_support_ticket_status_history enable row level security;
alter table public.partner_support_ticket_attachments enable row level security;
alter table public.partner_support_notification_outbox enable row level security;
alter table public.partner_support_sla_worker_runs enable row level security;
alter table public.partner_support_internal_notifications enable row level security;
revoke all on public.partner_support_tickets,public.partner_support_ticket_events,public.partner_support_ticket_messages,public.partner_support_ticket_status_history,public.partner_support_ticket_attachments,public.partner_support_notification_outbox,public.partner_support_sla_worker_runs,public.partner_support_internal_notifications from public,anon,authenticated;
grant all on public.partner_support_tickets,public.partner_support_ticket_events,public.partner_support_ticket_messages,public.partner_support_ticket_status_history,public.partner_support_ticket_attachments,public.partner_support_notification_outbox,public.partner_support_sla_worker_runs,public.partner_support_internal_notifications to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('partner-support-evidence','partner-support-evidence',false,15728640,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Partner support evidence scoped read" on storage.objects for select to authenticated using(bucket_id='partner-support-evidence' and exists(select 1 from public.partner_support_ticket_attachments attachment where attachment.storage_key=name and public.can_access_partner_support_ticket(attachment.ticket_id,false)));

revoke all on function public.support_add_business_minutes(timestamptz,integer),public.prevent_partner_support_history_mutation(),public.can_access_partner_support_ticket(uuid,boolean),public.can_manage_partner_support_attachment(uuid),public.run_partner_support_sla_worker(integer),public.process_partner_support_notification_outbox(integer) from public,anon,authenticated;
revoke all on function public.create_partner_support_ticket(uuid,text,text,uuid,text),public.list_partner_support_tickets(uuid,text,text,integer,integer),public.get_partner_support_ticket(uuid),public.add_partner_support_message(uuid,integer,text),public.partner_transition_support_ticket(uuid,integer,text),public.transition_partner_support_ticket(uuid,integer,text,text,text,uuid,text,text,text),public.list_admin_partner_support_tickets(text,text,text,text,text,uuid,text,date,date,integer,integer),public.list_partner_support_assignees(),public.get_partner_support_dashboard(uuid),public.search_partner_support_tickets(uuid,text,integer),public.get_partner_support_diagnostics() from public,anon;
grant execute on function public.create_partner_support_ticket(uuid,text,text,uuid,text),public.list_partner_support_tickets(uuid,text,text,integer,integer),public.get_partner_support_ticket(uuid),public.add_partner_support_message(uuid,integer,text),public.partner_transition_support_ticket(uuid,integer,text),public.transition_partner_support_ticket(uuid,integer,text,text,text,uuid,text,text,text),public.list_admin_partner_support_tickets(text,text,text,text,text,uuid,text,date,date,integer,integer),public.list_partner_support_assignees(),public.get_partner_support_dashboard(uuid),public.search_partner_support_tickets(uuid,text,integer),public.get_partner_support_diagnostics() to authenticated;
grant execute on function public.can_manage_partner_support_attachment(uuid) to authenticated;
grant execute on function public.run_partner_support_sla_worker(integer) to service_role;
grant execute on function public.process_partner_support_notification_outbox(integer) to service_role;

commit;
