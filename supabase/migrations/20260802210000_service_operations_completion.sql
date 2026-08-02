begin;

alter table public.service_cases
  add column if not exists first_response_at timestamptz null,
  add column if not exists equipment_receipt_due_at timestamptz null,
  add column if not exists repair_due_at timestamptz null,
  add column if not exists replacement_decision_due_at timestamptz null,
  add column if not exists sla_overdue_stage text null,
  add column if not exists sla_overdue_since timestamptz null,
  add constraint service_cases_sla_overdue_stage_check check (
    sla_overdue_stage is null or sla_overdue_stage in (
      'first_response','equipment_receipt','diagnosis','partner_response','repair','replacement_decision'
    )
  );

alter table public.service_case_documents
  add column if not exists service_document_type text null,
  add column if not exists issue_date date null,
  add column if not exists document_version text not null default '1',
  add constraint service_case_documents_type_check check (service_document_type is null or service_document_type in (
    'service_acceptance_act','diagnostic_report','repair_act','replacement_act','return_act','warranty_decision'
  ));

create table public.service_internal_notifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.service_cases(id) on delete restrict,
  recipient_user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_code text not null check (event_code in (
    'service_case_new','service_case_unassigned','service_case_overdue','service_partner_responded',
    'service_replacement_approval_required','service_document_missing','service_attachment_failed'
  )),
  source_event_id uuid null references public.service_case_events(id) on delete restrict,
  deduplication_key text not null,
  title text not null check (char_length(title) between 1 and 180),
  message text not null check (char_length(message) between 1 and 600),
  action_url text not null check (action_url ~ '^/admin/service/[0-9a-f-]{36}$'),
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(recipient_user_id, deduplication_key)
);
create index service_internal_notifications_recipient_idx
  on public.service_internal_notifications(recipient_user_id, read_at, created_at desc);

create table public.service_sla_worker_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running','succeeded','failed','locked')),
  cases_claimed integer not null default 0,
  overdue_transitions integer not null default 0,
  notifications_created integer not null default 0,
  duration_ms integer null,
  safe_error_code text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null
);
create index service_sla_worker_runs_started_idx on public.service_sla_worker_runs(started_at desc);

create table public.service_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.service_cases(id) on delete restrict,
  source_event_id uuid not null references public.service_case_events(id) on delete restrict,
  audience text not null check (audience in ('partner','internal')),
  event_code text not null,
  attempts integer not null default 0,
  processed_at timestamptz null,
  last_error_code text null,
  created_at timestamptz not null default now(),
  unique(source_event_id,audience,event_code)
);
create index service_notification_outbox_pending_idx on public.service_notification_outbox(created_at,id) where processed_at is null;

alter table public.service_internal_notifications enable row level security;
alter table public.service_sla_worker_runs enable row level security;
alter table public.service_notification_outbox enable row level security;
revoke all on public.service_internal_notifications, public.service_sla_worker_runs, public.service_notification_outbox from public,anon,authenticated;
grant all on public.service_internal_notifications, public.service_sla_worker_runs, public.service_notification_outbox to service_role;

create or replace function public.service_add_business_minutes(p_start timestamptz,p_minutes integer)
returns timestamptz language plpgsql immutable set search_path=public as $$
declare local_time timestamp; remaining integer:=greatest(p_minutes,0); available integer;
begin
  local_time:=p_start at time zone 'Europe/Chisinau';
  loop
    if extract(isodow from local_time) between 1 and 5 and local_time::time<'18:00'::time then
      if local_time::time<'09:00'::time then local_time:=date_trunc('day',local_time)+interval '9 hours'; end if;
      available:=greatest(0,floor(extract(epoch from ((date_trunc('day',local_time)+interval '18 hours')-local_time))/60)::integer);
      if remaining<=available then return (local_time+make_interval(mins=>remaining)) at time zone 'Europe/Chisinau'; end if;
      remaining:=remaining-available;
    end if;
    local_time:=date_trunc('day',local_time)+interval '1 day 9 hours';
    while extract(isodow from local_time) not between 1 and 5 loop local_time:=local_time+interval '1 day'; end loop;
  end loop;
end $$;

update public.service_cases set
  first_response_due_at=public.service_add_business_minutes(created_at,480),
  diagnosis_due_at=case when status='diagnostics' then coalesce(diagnosis_due_at,public.service_add_business_minutes(updated_at,1440)) else diagnosis_due_at end,
  partner_response_due_at=case when status='awaiting_information' then coalesce(partner_response_due_at,public.service_add_business_minutes(updated_at,2400)) else partner_response_due_at end,
  repair_due_at=case when status='repair' then public.service_add_business_minutes(updated_at,2400) else repair_due_at end,
  replacement_decision_due_at=case when status='replacement_approved' then public.service_add_business_minutes(updated_at,480) else replacement_decision_due_at end
where status not in ('closed','rejected','cancelled');

alter table public.partner_notification_events drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events add constraint partner_notification_events_code_check check (event_code in (
  'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled'
));
alter table public.partner_notifications drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications add constraint partner_notifications_event_code_check check (event_code in (
  'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled'
));
alter table public.partner_notification_events drop constraint if exists partner_notification_events_group_check;
alter table public.partner_notification_events add constraint partner_notification_events_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents','service'));
alter table public.partner_notifications drop constraint if exists partner_notifications_group_check;
alter table public.partner_notifications add constraint partner_notifications_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents','service'));
alter table public.partner_notification_preferences drop constraint if exists partner_notification_preferences_group_check;
alter table public.partner_notification_preferences add constraint partner_notification_preferences_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents','service'));

create or replace function public.get_partner_notification_preferences(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public set row_security=off as $$
begin
 if not public.has_active_notification_membership(p_company_id,auth.uid()) then raise exception 'Notification access denied.' using errcode='42501'; end if;
 return (select jsonb_agg(jsonb_build_object('eventGroup',groups.event_group,'inAppEnabled',coalesce(preference.in_app_enabled,true),'emailEnabled',coalesce(preference.email_enabled,false),'deliveryMode',coalesce(preference.delivery_mode,'immediate')) order by groups.ordinality)
 from unnest(array['orders','shipments','company_access','products','documents','service']) with ordinality groups(event_group,ordinality)
 left join public.partner_notification_preferences preference on preference.company_id=p_company_id and preference.user_id=auth.uid() and preference.event_group=groups.event_group);
end $$;
create or replace function public.set_partner_notification_preference(p_company_id uuid,p_event_group text,p_in_app_enabled boolean,p_email_enabled boolean,p_delivery_mode text)
returns public.partner_notification_preferences language plpgsql security definer set search_path=public set row_security=off as $$
declare saved public.partner_notification_preferences; begin
 if not public.has_active_notification_membership(p_company_id,auth.uid()) then raise exception 'Notification access denied.' using errcode='42501'; end if;
 if p_event_group not in ('orders','shipments','company_access','products','documents','service') or p_delivery_mode not in ('immediate','daily','off') or p_email_enabled
  or (p_event_group not in ('products','documents') and (not p_in_app_enabled or p_delivery_mode='off'))
  or (p_event_group in ('products','documents') and p_in_app_enabled<>(p_delivery_mode<>'off')) then raise exception 'Notification preference is invalid.' using errcode='22023'; end if;
 insert into public.partner_notification_preferences(company_id,user_id,event_group,in_app_enabled,email_enabled,delivery_mode,updated_at) values(p_company_id,auth.uid(),p_event_group,p_in_app_enabled,false,p_delivery_mode,now())
 on conflict(company_id,user_id,event_group) do update set in_app_enabled=excluded.in_app_enabled,email_enabled=false,delivery_mode=excluded.delivery_mode,updated_at=now() returning * into saved; return saved;
end $$;

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean language sql immutable set search_path=public as $$
 select value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
   or value ~ '^/cabinet/service/[0-9a-f-]{36}$'
   or value='/cabinet/reservation-requests' or value='/cabinet/company/users'
   or value ~ '^/cabinet/catalog/[a-z0-9-]+$' or value='/cabinet/cart'
   or value='/cabinet/offers' or value ~ '^/cabinet/offers/[0-9a-f-]{36}$'
   or value='/cabinet/documents';
$$;

create or replace function public.project_service_partner_notification(p_event_id uuid,p_event_code text)
returns integer language plpgsql security definer set search_path=public set row_security=off as $$
declare e public.service_case_events; c public.service_cases; source_id uuid; title_value text; message_value text; severity_value text; created_count integer;
begin
 select * into e from public.service_case_events where id=p_event_id;
 select * into c from public.service_cases where id=e.case_id;
 if not found then return 0; end if;
 title_value:=case p_event_code
  when 'service_information_requested' then 'Требуется дополнительная информация'
  when 'service_ready_for_pickup' then 'Оборудование готово к выдаче'
  when 'service_case_rejected' then 'Сервисная заявка отклонена'
  when 'service_case_cancelled' then 'Сервисная заявка отменена'
  when 'service_diagnosis_completed' then 'Диагностика завершена'
  when 'service_replacement_approved' then 'Замена одобрена'
  when 'service_case_closed' then 'Сервисная заявка закрыта'
  else 'Статус сервисной заявки обновлён' end;
 message_value:=case p_event_code
  when 'service_information_requested' then 'Novotech запросил уточнение по сервисной заявке '||c.case_number||'.'
  when 'service_ready_for_pickup' then 'Оборудование по заявке '||c.case_number||' готово к выдаче.'
  else 'Откройте заявку '||c.case_number||', чтобы посмотреть актуальный статус.' end;
 severity_value:=case when p_event_code in ('service_information_requested','service_case_rejected') then 'warning' when p_event_code in ('service_case_closed','service_ready_for_pickup') then 'success' else 'information' end;
 insert into public.partner_notification_events(company_id,event_code,event_group,domain,entity_type,entity_id,source_table,source_event_id,source_version,occurred_at,safe_payload,fingerprint)
 values(c.company_id,p_event_code,'service','service','service_case',c.id,'service_case_events',e.id,c.version::text,e.occurred_at,jsonb_build_object('caseNumber',c.case_number),encode(extensions.digest('service|'||e.id::text||'|'||p_event_code,'sha256'),'hex'))
 on conflict(fingerprint) do update set fingerprint=excluded.fingerprint returning id into source_id;
 with recipients as (
  select distinct membership.user_id from public.company_memberships membership
  join public.user_profiles profile on profile.id=membership.user_id and profile.status='active'
  where membership.company_id=c.company_id and membership.status='active'
    and (membership.user_id=c.created_by_user_id or public.notification_user_has_permission(membership.user_id,c.company_id,'service.view'))
 ), inserted as (
  insert into public.partner_notifications(company_id,recipient_user_id,event_code,event_group,domain,severity,mandatory,title,message,action_label,action_url,entity_type,entity_id,occurred_at,deduplication_key,source_event_id,expires_at,retention_until,email_enabled_snapshot,email_delivery_mode)
  select c.company_id,user_id,p_event_code,'service','service',severity_value,false,title_value,message_value,'Открыть заявку','/cabinet/service/'||c.id,'service_case',c.id,e.occurred_at,encode(extensions.digest('service-recipient|'||e.id::text||'|'||p_event_code||'|'||user_id::text,'sha256'),'hex'),source_id,e.occurred_at+interval '90 days',e.occurred_at+interval '13 months',false,'off' from recipients
  on conflict(recipient_user_id,deduplication_key) do nothing returning id
 ) select count(*) into created_count from inserted;
 return created_count;
end $$;

create or replace function public.project_service_internal_notification(p_case_id uuid,p_event_code text,p_source_event_id uuid,p_suffix text default '')
returns integer language plpgsql security definer set search_path=public set row_security=off as $$
declare c public.service_cases; created_count integer;
begin
 select * into c from public.service_cases where id=p_case_id; if not found then return 0; end if;
 with recipients as (
  select c.assigned_internal_user_id user_id where c.assigned_internal_user_id is not null
  union
  select assignment.user_id from public.internal_user_role_assignments assignment
  join public.role_permissions rp on rp.role_id=assignment.role_id
  join public.permissions permission on permission.id=rp.permission_id and permission.code='admin.service.manage'
  join public.user_profiles profile on profile.id=assignment.user_id and profile.status='active'
  where assignment.revoked_at is null and c.assigned_internal_user_id is null
 ), inserted as (
  insert into public.service_internal_notifications(case_id,recipient_user_id,event_code,source_event_id,deduplication_key,title,message,action_url)
  select c.id,user_id,p_event_code,p_source_event_id,encode(extensions.digest('service-internal|'||c.id::text||'|'||p_event_code||'|'||coalesce(p_source_event_id::text,p_suffix)||'|'||user_id::text,'sha256'),'hex'),
   case p_event_code when 'service_case_new' then 'Новая сервисная заявка' when 'service_case_overdue' then 'Сервисная заявка просрочена' when 'service_partner_responded' then 'Партнёр ответил по заявке' else 'Сервисная заявка требует внимания' end,
   'Откройте заявку '||c.case_number||' для обработки.','/admin/service/'||c.id from recipients
  on conflict(recipient_user_id,deduplication_key) do nothing returning id
 ) select count(*) into created_count from inserted;
 return created_count;
end $$;

create or replace function public.project_service_case_event()
returns trigger language plpgsql security definer set search_path=public set row_security=off as $$
declare status_value text; partner_code text;
begin
 status_value:=new.safe_metadata->>'status';
 partner_code:=case
  when new.event_type='created' then 'service_case_created'
  when new.event_type='status_changed' then case status_value
   when 'accepted' then 'service_case_accepted' when 'awaiting_information' then 'service_information_requested'
   when 'awaiting_equipment' then 'service_equipment_expected' when 'equipment_received' then 'service_equipment_received'
   when 'diagnostics' then 'service_diagnosis_started' when 'repair' then 'service_repair_started'
   when 'replacement_approved' then 'service_replacement_approved' when 'awaiting_replacement' then 'service_replacement_waiting'
   when 'ready_for_pickup' then 'service_ready_for_pickup' when 'closed' then 'service_case_closed'
   when 'rejected' then 'service_case_rejected' when 'cancelled' then 'service_case_cancelled' end end;
 if partner_code is not null then insert into public.service_notification_outbox(case_id,source_event_id,audience,event_code) values(new.case_id,new.id,'partner',partner_code) on conflict do nothing; end if;
 if new.event_type='status_changed' and new.safe_metadata->>'fromStatus'='diagnostics' and status_value<>'awaiting_information' then
  insert into public.service_notification_outbox(case_id,source_event_id,audience,event_code) values(new.case_id,new.id,'partner','service_diagnosis_completed') on conflict do nothing;
 end if;
 if new.event_type='created' then
  insert into public.service_notification_outbox(case_id,source_event_id,audience,event_code) values(new.case_id,new.id,'internal','service_case_new'),(new.case_id,new.id,'internal','service_case_unassigned') on conflict do nothing;
 end if;
 if new.event_type='partner_message' then insert into public.service_notification_outbox(case_id,source_event_id,audience,event_code) values(new.case_id,new.id,'internal','service_partner_responded') on conflict do nothing; end if;
 return new;
end $$;
create trigger project_service_case_event after insert on public.service_case_events for each row execute function public.project_service_case_event();

create or replace function public.perform_partner_service_action(p_case_id uuid,p_expected_version integer,p_action text,p_message text default null)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare c public.service_cases; event_id uuid; next_status text;
begin
 if not public.can_access_service_case(p_case_id,true) then raise exception 'Service access denied' using errcode='42501'; end if;
 select * into c from public.service_cases where id=p_case_id for update;
 if c.version<>p_expected_version then raise exception 'Case changed' using errcode='40001'; end if;
 if p_action='provide_information' then
  if c.status<>'awaiting_information' or char_length(btrim(coalesce(p_message,'')))<2 then raise exception 'Action unavailable' using errcode='22023'; end if;
  insert into public.service_case_events(case_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(c.id,auth.uid(),'partner_message',true,btrim(p_message),jsonb_build_object('action',p_action)) returning id into event_id;
 elsif p_action='confirm_equipment_sent' then
  if c.status<>'awaiting_equipment' then raise exception 'Action unavailable' using errcode='22023'; end if;
  insert into public.service_case_events(case_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(c.id,auth.uid(),'partner_message',true,'Партнёр подтвердил отправку оборудования.',jsonb_build_object('action',p_action)) returning id into event_id;
 elsif p_action='cancel' then
  if c.status not in ('created','accepted','awaiting_equipment','awaiting_information') then raise exception 'Action unavailable' using errcode='22023'; end if;
  next_status:='cancelled';
  insert into public.service_case_status_history(case_id,actor_user_id,from_status,to_status,reason) values(c.id,auth.uid(),c.status,next_status,'Отменено партнёром');
  insert into public.service_case_events(case_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(c.id,auth.uid(),'status_changed',true,'Заявка отменена партнёром.',jsonb_build_object('status',next_status,'action',p_action)) returning id into event_id;
 else raise exception 'Action unavailable' using errcode='22023'; end if;
 update public.service_cases set status=coalesce(next_status,status),updated_at=now(),version=version+1,closed_at=case when next_status='cancelled' then now() else closed_at end where id=c.id returning * into c;
 return jsonb_build_object('id',c.id,'status',c.status,'version',c.version,'eventId',event_id);
end $$;

create or replace function public.transition_service_case(p_case_id uuid,p_expected_version integer,p_to_status text,p_partner_message text,p_internal_note text,p_assignee uuid default null)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare c public.service_cases; allowed boolean; old_status text; event_id uuid; begin
 if not public.has_internal_permission('admin.service.manage') then raise exception 'Service management denied' using errcode='42501'; end if;
 select * into c from public.service_cases where id=p_case_id for update; if not found then raise exception 'Case not found' using errcode='P0002'; end if; old_status:=c.status;
 if c.version<>p_expected_version then raise exception 'Case changed' using errcode='40001'; end if;
 allowed:=case c.status when 'created' then p_to_status in ('accepted','rejected','cancelled') when 'accepted' then p_to_status in ('awaiting_equipment','equipment_received','awaiting_information','rejected') when 'awaiting_equipment' then p_to_status in ('equipment_received','awaiting_information') when 'equipment_received' then p_to_status='diagnostics' when 'diagnostics' then p_to_status in ('awaiting_information','repair','replacement_approved','ready_for_pickup','rejected') when 'awaiting_information' then p_to_status in ('accepted','diagnostics') when 'repair' then p_to_status='ready_for_pickup' when 'replacement_approved' then p_to_status in ('awaiting_replacement','ready_for_pickup') when 'awaiting_replacement' then p_to_status='ready_for_pickup' when 'ready_for_pickup' then p_to_status='closed' else false end;
 if not allowed then raise exception 'Invalid service transition' using errcode='22023'; end if;
 update public.service_cases set status=p_to_status,assigned_internal_user_id=coalesce(p_assignee,assigned_internal_user_id),updated_at=now(),version=version+1,
  first_response_at=case when old_status='created' then now() else first_response_at end,
  closed_at=case when p_to_status in ('closed','rejected','cancelled') then now() else null end,
  diagnosis_due_at=case when p_to_status='diagnostics' then public.service_add_business_minutes(now(),1440) else diagnosis_due_at end,
  partner_response_due_at=case when p_to_status='awaiting_information' then public.service_add_business_minutes(now(),2400) else null end,
  repair_due_at=case when p_to_status='repair' then public.service_add_business_minutes(now(),2400) else repair_due_at end,
  replacement_decision_due_at=case when p_to_status='replacement_approved' then public.service_add_business_minutes(now(),480) else replacement_decision_due_at end,
  sla_overdue_stage=null,sla_overdue_since=null where id=p_case_id returning * into c;
 insert into public.service_case_status_history(case_id,actor_user_id,from_status,to_status,reason) values(c.id,auth.uid(),old_status,p_to_status,nullif(btrim(p_partner_message),''));
 insert into public.service_case_events(case_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(c.id,auth.uid(),'status_changed',true,nullif(btrim(p_partner_message),''),jsonb_build_object('status',p_to_status,'fromStatus',old_status)) returning id into event_id;
 if nullif(btrim(p_internal_note),'') is not null then insert into public.service_case_events(case_id,actor_user_id,event_type,partner_visible,message) values(c.id,auth.uid(),'internal_note',false,btrim(p_internal_note)); end if;
 return jsonb_build_object('id',c.id,'status',c.status,'version',c.version,'eventId',event_id);
end $$;

create or replace function public.run_service_sla_worker(p_batch_size integer default 100)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare run_id uuid; started timestamptz:=clock_timestamp(); claimed integer:=0; changed integer:=0; notified integer:=0; row record; pending record; stage text;
begin
 if not pg_try_advisory_xact_lock(hashtext('service_sla_worker')) then
  insert into public.service_sla_worker_runs(status,finished_at) values('locked',now()) returning id into run_id;
  return jsonb_build_object('runId',run_id,'status','locked','casesClaimed',0,'overdueTransitions',0,'notificationsCreated',0);
 end if;
 insert into public.service_sla_worker_runs(status) values('running') returning id into run_id;
 for pending in select * from public.service_notification_outbox where processed_at is null order by created_at,id for update skip locked limit 200 loop
  begin
   if pending.audience='partner' then notified:=notified+public.project_service_partner_notification(pending.source_event_id,pending.event_code);
   else notified:=notified+public.project_service_internal_notification(pending.case_id,pending.event_code,pending.source_event_id); end if;
   update public.service_notification_outbox set processed_at=now(),attempts=attempts+1,last_error_code=null where id=pending.id;
  exception when others then
   update public.service_notification_outbox set attempts=attempts+1,last_error_code=sqlstate where id=pending.id;
  end;
 end loop;
 for row in select * from public.service_cases where status not in ('closed','rejected','cancelled') order by updated_at for update skip locked limit least(greatest(p_batch_size,1),500) loop
  claimed:=claimed+1;
  stage:=case
   when row.status='created' and row.first_response_at is null and row.first_response_due_at<now() then 'first_response'
   when row.status='equipment_received' and row.equipment_receipt_due_at is not null and row.equipment_receipt_due_at<now() then 'equipment_receipt'
   when row.status='diagnostics' and row.diagnosis_due_at<now() then 'diagnosis'
   when row.status='awaiting_information' and row.partner_response_due_at<now() then 'partner_response'
   when row.status='repair' and row.repair_due_at<now() then 'repair'
   when row.status='replacement_approved' and row.replacement_decision_due_at<now() then 'replacement_decision' end;
  if stage is distinct from row.sla_overdue_stage then
   update public.service_cases set sla_overdue_stage=stage,sla_overdue_since=case when stage is null then null else now() end where id=row.id;
   changed:=changed+1;
   if stage is not null and stage<>'partner_response' then notified:=notified+public.project_service_internal_notification(row.id,'service_case_overdue',null,stage); end if;
  end if;
  if row.status='diagnostics' and row.replacement_policy_state='possible_candidate' then notified:=notified+public.project_service_internal_notification(row.id,'service_replacement_approval_required',null,row.version::text); end if;
  if row.status in ('ready_for_pickup','closed') and not exists(select 1 from public.service_case_documents document where document.case_id=row.id) then notified:=notified+public.project_service_internal_notification(row.id,'service_document_missing',null,row.status); end if;
 end loop;
 update public.service_sla_worker_runs set status='succeeded',cases_claimed=claimed,overdue_transitions=changed,notifications_created=notified,duration_ms=extract(milliseconds from clock_timestamp()-started)::integer,finished_at=now() where id=run_id;
 return jsonb_build_object('runId',run_id,'status','succeeded','casesClaimed',claimed,'overdueTransitions',changed,'notificationsCreated',notified,'durationMs',extract(milliseconds from clock_timestamp()-started)::integer);
exception when others then
 if run_id is not null then update public.service_sla_worker_runs set status='failed',safe_error_code=sqlstate,duration_ms=extract(milliseconds from clock_timestamp()-started)::integer,finished_at=now() where id=run_id; end if; raise;
end $$;

create or replace function public.get_partner_service_dashboard(p_company_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'caseNumber',case_number,'status',status,'productName',product_name,'productImageUrl',image_url,'updatedAt',updated_at,'nextAction',case status when 'awaiting_information' then 'Предоставить информацию' when 'awaiting_equipment' then 'Передать оборудование' when 'ready_for_pickup' then 'Получить оборудование' when 'replacement_approved' then 'Согласовать замену' else 'Посмотреть статус' end,'href','/cabinet/service/'||id) order by priority_rank,updated_at desc),'[]'::jsonb)
 from (select c.id,c.case_number,c.status,p.name product_name,p.image_url,c.updated_at,case c.status when 'awaiting_information' then 1 when 'awaiting_equipment' then 2 when 'ready_for_pickup' then 3 when 'replacement_approved' then 4 else 5 end priority_rank
  from public.service_cases c left join public.catalog_products p on p.id=c.product_id where c.company_id=p_company_id and public.has_permission(p_company_id,'service.view') and c.status not in ('closed','rejected','cancelled') and c.status in ('awaiting_information','awaiting_equipment','ready_for_pickup','replacement_approved','diagnostics','repair','awaiting_replacement') order by priority_rank,c.updated_at desc limit 2) rows;
$$;

create or replace function public.get_admin_service_attention(p_limit integer default 10)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
 select case when public.has_internal_permission('admin.service.view') then coalesce(jsonb_agg(jsonb_build_object('id',n.id,'caseId',n.case_id,'caseNumber',c.case_number,'eventCode',n.event_code,'title',n.title,'message',n.message,'actionUrl',n.action_url,'createdAt',n.created_at) order by n.created_at desc),'[]'::jsonb) else '[]'::jsonb end
 from (select * from public.service_internal_notifications where recipient_user_id=auth.uid() and read_at is null order by created_at desc limit least(greatest(p_limit,1),25)) n join public.service_cases c on c.id=n.case_id;
$$;

create or replace function public.get_service_diagnostics()
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
 select case when public.has_internal_permission('admin.service.view') then jsonb_build_object(
  'totalCases',(select count(*) from public.service_cases),'active',(select count(*) from public.service_cases where status not in ('closed','rejected','cancelled')),
  'unassigned',(select count(*) from public.service_cases where assigned_internal_user_id is null and status not in ('closed','rejected','cancelled')),
  'waitingForPartner',(select count(*) from public.service_cases where status='awaiting_information'),'waitingForEquipment',(select count(*) from public.service_cases where status='awaiting_equipment'),
  'diagnosis',(select count(*) from public.service_cases where status='diagnostics'),'repair',(select count(*) from public.service_cases where status='repair'),
  'replacement',(select count(*) from public.service_cases where status in ('replacement_approved','awaiting_replacement')),'readyForPickup',(select count(*) from public.service_cases where status='ready_for_pickup'),
  'overdue',(select count(*) from public.service_cases where sla_overdue_stage is not null),'closed',(select count(*) from public.service_cases where status='closed'),
  'notificationFailures',(select count(*) from public.service_sla_worker_runs where status='failed' and started_at>now()-interval '30 days'),
  'missingRequiredDocuments',(select count(*) from public.service_cases c where c.status in ('ready_for_pickup','closed') and not exists(select 1 from public.service_case_documents d where d.case_id=c.id)),
  'attachmentFailures',(select count(*) from public.service_case_attachments where scan_state='rejected'),
  'oldestUnresolvedCase',(select min(created_at) from public.service_cases where status not in ('closed','rejected','cancelled')),
  'latestSlaWorker',(select to_jsonb(r) from public.service_sla_worker_runs r order by started_at desc limit 1)) else null end;
$$;

create or replace function public.register_service_document(p_document_id uuid,p_case_id uuid,p_title text,p_service_document_type text,p_issue_date date,p_version text,p_file_name text,p_file_size bigint,p_storage_key text,p_checksum text,p_partner_visible boolean)
returns uuid language plpgsql security definer set search_path=public set row_security=off as $$
declare c public.service_cases; existing uuid; canonical_type text;
begin
 if not public.has_internal_permission('admin.service.manage') then raise exception 'Service management denied' using errcode='42501'; end if;
 select * into c from public.service_cases where id=p_case_id for update; if not found then raise exception 'Case not found' using errcode='P0002'; end if;
 if p_service_document_type not in ('service_acceptance_act','diagnostic_report','repair_act','replacement_act','return_act','warranty_decision') then raise exception 'Invalid document type' using errcode='22023'; end if;
 if p_service_document_type in ('diagnostic_report','warranty_decision') and not p_partner_visible then null; end if;
 select id into existing from public.partner_documents where source_system='portal' and checksum_sha256=p_checksum and archived_at is null limit 1;
 if existing is null then
  canonical_type:=case when p_service_document_type in ('replacement_act','return_act') then 'return_or_replacement_document' else 'service_document' end;
  insert into public.partner_documents(id,source_system,source_document_id,company_id,document_type,title,issue_date,status,version,language_code,file_name,mime_type,file_size,retrieval_mode,storage_bucket,storage_key,checksum_sha256,is_current,published_at,created_by,safe_metadata)
  values(p_document_id,'portal','service:'||p_document_id,c.company_id,canonical_type,btrim(p_title),p_issue_date,'available',btrim(p_version),'ru',p_file_name,'application/pdf',p_file_size,'private_storage','partner-documents',p_storage_key,p_checksum,true,now(),auth.uid(),jsonb_build_object('serviceCaseId',c.id,'serviceDocumentType',p_service_document_type,'internalOnly',not p_partner_visible)) returning id into existing;
  if c.product_id is not null then insert into public.partner_document_products(document_id,product_id) values(existing,c.product_id) on conflict do nothing; end if;
  if c.order_id is not null then insert into public.partner_document_orders(document_id,order_history_id) values(existing,c.order_id) on conflict do nothing; end if;
  insert into public.partner_document_audit_events(document_id,company_id,actor_user_id,event_type,safe_metadata) values(existing,c.company_id,auth.uid(),'published',jsonb_build_object('serviceCaseId',c.id,'documentType',p_service_document_type));
 end if;
 insert into public.service_case_documents(case_id,document_id,partner_visible,linked_by_user_id,service_document_type,issue_date,document_version) values(c.id,existing,p_partner_visible,auth.uid(),p_service_document_type,p_issue_date,btrim(p_version)) on conflict(case_id,document_id) do nothing;
 insert into public.service_case_events(case_id,actor_user_id,event_type,partner_visible,message,safe_metadata) values(c.id,auth.uid(),'document_linked',p_partner_visible,case when p_partner_visible then 'Добавлен сервисный документ.' else null end,jsonb_build_object('documentId',existing,'documentType',p_service_document_type));
 return existing;
end $$;

create or replace function public.can_access_partner_document(p_document_id uuid,p_company_id uuid,p_download boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.partner_documents document where document.id=p_document_id and document.archived_at is null and document.status<>'archived'
  and coalesce((document.safe_metadata->>'internalOnly')::boolean,false)=false
  and (document.company_id is null or document.company_id=p_company_id)
  and public.has_permission(p_company_id,public.partner_document_permission(document.document_type))
  and (not p_download or public.has_permission(p_company_id,'documents.download')));
$$;

revoke all on function public.service_add_business_minutes(timestamptz,integer),public.project_service_partner_notification(uuid,text),public.project_service_internal_notification(uuid,text,uuid,text),public.perform_partner_service_action(uuid,integer,text,text),public.run_service_sla_worker(integer),public.get_partner_service_dashboard(uuid),public.get_admin_service_attention(integer),public.get_service_diagnostics(),public.register_service_document(uuid,uuid,text,text,date,text,text,bigint,text,text,boolean) from public,anon,authenticated;
grant execute on function public.perform_partner_service_action(uuid,integer,text,text),public.get_partner_service_dashboard(uuid),public.get_admin_service_attention(integer),public.get_service_diagnostics(),public.register_service_document(uuid,uuid,text,text,date,text,text,bigint,text,text,boolean) to authenticated;
grant execute on function public.run_service_sla_worker(integer) to service_role;

commit;
