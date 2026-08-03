begin;

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean language sql immutable set search_path=public as $$
  select value='/cabinet'
    or value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value ~ '^/cabinet/service/[0-9a-f-]{36}$'
    or value='/cabinet/reservation-requests'
    or value='/cabinet/company/users'
    or value ~ '^/cabinet/catalog/[a-z0-9-]+$'
    or value='/cabinet/cart'
    or value='/cabinet/offers'
    or value ~ '^/cabinet/offers/[0-9a-f-]{36}$'
    or value='/cabinet/documents'
    or value ~ '^/cabinet/documents/[0-9a-f-]{36}$'
$$;

alter table public.partner_notifications
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

alter table public.partner_notifications
  drop constraint if exists partner_notifications_archive_state_check;
alter table public.partner_notifications
  add constraint partner_notifications_archive_state_check check (
    (archived_at is null and archive_reason is null)
    or (archived_at is not null and archive_reason in (
      'historical_document_backfill', 'duplicate_business_state', 'obsolete_technical'
    ))
  );

create index if not exists partner_notifications_active_unread_v2_idx
  on public.partner_notifications(recipient_user_id, company_id, occurred_at desc, id desc)
  include (expires_at)
  where read_at is null and dismissed_at is null and archived_at is null;

create index if not exists partner_notifications_active_feed_v2_idx
  on public.partner_notifications(recipient_user_id, company_id, occurred_at desc, id desc)
  include (expires_at, event_group)
  where dismissed_at is null and archived_at is null;

create table if not exists public.partner_notification_mutation_events (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null unique,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  actor_user_id uuid references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('mark_all_read', 'maintenance_archive')),
  affected_count integer not null check (affected_count > 0),
  occurred_at timestamptz not null default now()
);

create index if not exists partner_notification_mutations_company_time_idx
  on public.partner_notification_mutation_events(company_id, occurred_at desc);

alter table public.partner_notification_mutation_events enable row level security;
revoke all on public.partner_notification_mutation_events from public, anon, authenticated;
grant all on public.partner_notification_mutation_events to service_role;

create or replace function public.prevent_partner_notification_mutation_event_changes()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'Notification mutation events are append-only.' using errcode='42501';
end $$;

drop trigger if exists protect_partner_notification_mutation_events on public.partner_notification_mutation_events;
create trigger protect_partner_notification_mutation_events
before update or delete on public.partner_notification_mutation_events
for each row execute function public.prevent_partner_notification_mutation_event_changes();

revoke all on function public.prevent_partner_notification_mutation_event_changes()
  from public, anon, authenticated;

create or replace function public.get_partner_notification_summary(
  p_company_id uuid,
  p_limit integer default 8
)
returns jsonb language plpgsql stable security definer
set search_path=public set row_security=off as $$
declare
  normalized_limit integer := least(greatest(coalesce(p_limit, 8), 1), 8);
  unread_count integer;
  items jsonb;
begin
  if not public.has_active_notification_membership(p_company_id, auth.uid()) then
    raise exception 'Notification access denied.' using errcode='42501';
  end if;

  select count(*) into unread_count
  from public.partner_notifications notification
  where notification.company_id=p_company_id
    and notification.recipient_user_id=auth.uid()
    and notification.read_at is null
    and notification.dismissed_at is null
    and notification.archived_at is null
    and notification.expires_at>now();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id, 'eventCode', item.event_code, 'eventGroup', item.event_group,
    'severity', item.severity, 'mandatory', item.mandatory, 'title', item.title,
    'message', item.message, 'actionLabel', item.action_label, 'actionUrl', item.action_url,
    'occurredAt', item.occurred_at, 'readAt', item.read_at,
    'dismissedAt', item.dismissed_at, 'expiresAt', item.expires_at
  ) order by item.occurred_at desc,item.id desc),'[]'::jsonb) into items
  from (
    select notification.*
    from public.partner_notifications notification
    where notification.company_id=p_company_id
      and notification.recipient_user_id=auth.uid()
      and notification.dismissed_at is null
      and notification.archived_at is null
      and notification.expires_at>now()
    order by notification.occurred_at desc,notification.id desc
    limit normalized_limit
  ) item;

  return jsonb_build_object('unreadCount',unread_count,'items',items);
end $$;

create or replace function public.list_partner_notifications(
  p_company_id uuid,
  p_event_group text default null,
  p_unread_only boolean default false,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_id uuid default null,
  p_page_size integer default 20
)
returns jsonb language plpgsql stable security definer
set search_path=public set row_security=off as $$
declare
  normalized_size integer := least(greatest(coalesce(p_page_size,20),1),50);
  result jsonb;
begin
  if not public.has_active_notification_membership(p_company_id,auth.uid()) then
    raise exception 'Notification access denied.' using errcode='42501';
  end if;
  if p_event_group is not null and p_event_group not in (
    'orders','shipments','company_access','products','commercial','documents','service'
  ) then
    raise exception 'Notification filter is invalid.' using errcode='22023';
  end if;
  if (p_cursor_occurred_at is null)<>(p_cursor_id is null) then
    raise exception 'Notification cursor is invalid.' using errcode='22023';
  end if;

  with page as (
    select notification.*
    from public.partner_notifications notification
    where notification.company_id=p_company_id
      and notification.recipient_user_id=auth.uid()
      and notification.dismissed_at is null
      and notification.archived_at is null
      and notification.expires_at>now()
      and (p_event_group is null or notification.event_group=p_event_group)
      and (not p_unread_only or notification.read_at is null)
      and (p_cursor_occurred_at is null or (notification.occurred_at,notification.id)<(p_cursor_occurred_at,p_cursor_id))
    order by notification.occurred_at desc,notification.id desc
    limit normalized_size+1
  ), visible as (
    select * from page order by occurred_at desc,id desc limit normalized_size
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'id',visible.id,'eventCode',visible.event_code,'eventGroup',visible.event_group,
      'severity',visible.severity,'mandatory',visible.mandatory,'title',visible.title,
      'message',visible.message,'actionLabel',visible.action_label,'actionUrl',visible.action_url,
      'occurredAt',visible.occurred_at,'readAt',visible.read_at,
      'dismissedAt',visible.dismissed_at,'expiresAt',visible.expires_at
    ) order by visible.occurred_at desc,visible.id desc),'[]'::jsonb),
    'nextCursor',case when (select count(*) from page)>normalized_size then (
      select jsonb_build_object('occurredAt',tail.occurred_at,'id',tail.id)
      from visible tail order by tail.occurred_at,tail.id limit 1
    ) else null end
  ) into result from visible;
  return coalesce(result,jsonb_build_object('items','[]'::jsonb,'nextCursor',null));
end $$;

create or replace function public.mark_all_partner_notifications_read_v2(p_company_id uuid)
returns jsonb language plpgsql security definer
set search_path=public set row_security=off as $$
declare
  cutoff timestamptz := statement_timestamp();
  correlation uuid := gen_random_uuid();
  affected integer;
  unread integer;
begin
  if not public.has_active_notification_membership(p_company_id,auth.uid()) then
    raise exception 'Notification access denied.' using errcode='42501';
  end if;

  update public.partner_notifications notification
  set read_at=cutoff
  where notification.company_id=p_company_id
    and notification.recipient_user_id=auth.uid()
    and notification.occurred_at<=cutoff
    and notification.read_at is null
    and notification.dismissed_at is null
    and notification.archived_at is null
    and notification.expires_at>cutoff;
  get diagnostics affected=row_count;

  select count(*) into unread
  from public.partner_notifications notification
  where notification.company_id=p_company_id
    and notification.recipient_user_id=auth.uid()
    and notification.occurred_at<=cutoff
    and notification.read_at is null
    and notification.dismissed_at is null
    and notification.archived_at is null
    and notification.expires_at>cutoff;

  if affected>0 then
    insert into public.partner_notification_mutation_events(
      correlation_id,company_id,actor_user_id,event_type,affected_count,occurred_at
    ) values (correlation,p_company_id,auth.uid(),'mark_all_read',affected,cutoff);
  end if;

  return jsonb_build_object(
    'affectedCount',affected,'unreadCount',unread,
    'correlationId',correlation,'markedAt',cutoff
  );
end $$;

revoke all on function public.mark_all_partner_notifications_read_v2(uuid)
  from public,anon;
grant execute on function public.mark_all_partner_notifications_read_v2(uuid)
  to authenticated;

create or replace function public.suppress_historical_document_notification()
returns trigger language plpgsql security definer
set search_path=public set row_security=off as $$
begin
  if new.event_group='documents'
    and new.event_code in ('new_invoice_available','reconciliation_statement_available','order_document_available')
    and exists (
      select 1 from public.partner_documents document
      where document.id=new.entity_id
        and document.issue_date<current_date-7
    ) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists suppress_historical_document_notifications on public.partner_notifications;
create trigger suppress_historical_document_notifications
before insert on public.partner_notifications
for each row execute function public.suppress_historical_document_notification();

revoke all on function public.suppress_historical_document_notification()
  from public,anon,authenticated;

create or replace function public.preview_partner_notification_cleanup(p_company_id uuid)
returns jsonb language sql stable security definer
set search_path=public set row_security=off as $$
  with historical as (
    select notification.id
    from public.partner_notifications notification
    join public.partner_documents document on document.id=notification.entity_id
    where notification.company_id=p_company_id
      and notification.archived_at is null
      and notification.event_group='documents'
      and document.issue_date<notification.created_at::date-7
  ), duplicates as (
    select id from (
      select notification.id,row_number() over (
        partition by notification.recipient_user_id,notification.company_id,
          notification.event_code,notification.entity_type,notification.entity_id
        order by notification.occurred_at desc,notification.id desc
      ) rank
      from public.partner_notifications notification
      where notification.company_id=p_company_id and notification.archived_at is null
    ) ranked where rank>1
  )
  select jsonb_build_object(
    'historicalDocumentBackfill',(select count(*) from historical),
    'duplicateBusinessState',(select count(*) from duplicates),
    'expiredUnread',(select count(*) from public.partner_notifications notification
      where notification.company_id=p_company_id and notification.read_at is null
        and notification.archived_at is null and notification.expires_at<=now())
  )
$$;

create or replace function public.archive_partner_notification_noise(p_company_id uuid)
returns jsonb language plpgsql security definer
set search_path=public set row_security=off as $$
declare
  correlation uuid := gen_random_uuid();
  archived_at_value timestamptz := statement_timestamp();
  historical integer;
  duplicates integer;
begin
  update public.partner_notifications notification set
    archived_at=archived_at_value,archive_reason='historical_document_backfill'
  from public.partner_documents document
  where notification.company_id=p_company_id
    and notification.entity_id=document.id
    and notification.event_group='documents'
    and notification.archived_at is null
    and document.issue_date<notification.created_at::date-7;
  get diagnostics historical=row_count;

  with ranked as (
    select notification.id,row_number() over (
      partition by notification.recipient_user_id,notification.company_id,
        notification.event_code,notification.entity_type,notification.entity_id
      order by notification.occurred_at desc,notification.id desc
    ) rank
    from public.partner_notifications notification
    where notification.company_id=p_company_id and notification.archived_at is null
  )
  update public.partner_notifications notification set
    archived_at=archived_at_value,archive_reason='duplicate_business_state'
  from ranked where ranked.id=notification.id and ranked.rank>1;
  get diagnostics duplicates=row_count;

  if historical+duplicates>0 then
    insert into public.partner_notification_mutation_events(
      correlation_id,company_id,event_type,affected_count,occurred_at
    ) values (correlation,p_company_id,'maintenance_archive',historical+duplicates,archived_at_value);
  end if;
  return jsonb_build_object(
    'correlationId',correlation,'historicalDocumentBackfill',historical,
    'duplicateBusinessState',duplicates,'affectedCount',historical+duplicates
  );
end $$;

revoke all on function public.preview_partner_notification_cleanup(uuid)
  from public,anon,authenticated;
revoke all on function public.archive_partner_notification_noise(uuid)
  from public,anon,authenticated;
grant execute on function public.preview_partner_notification_cleanup(uuid),
  public.archive_partner_notification_noise(uuid) to service_role;

create or replace function public.generate_partner_notification_deadlines(p_business_date date)
returns jsonb language plpgsql security definer
set search_path=public set row_security=off as $$
declare
  run_id uuid;
  started_at timestamptz:=clock_timestamp();
  source_count integer:=0;
  recipient_count integer:=0;
  created_count integer:=0;
  deduplicated_count integer:=0;
  projection jsonb;
  candidate record;
  source_version text;
begin
  if auth.role()<>'service_role' or p_business_date is null then
    raise exception 'Notification deadline worker is server-only.' using errcode='42501';
  end if;
  if not pg_try_advisory_xact_lock(hashtext('partner_notification_deadlines')) then
    insert into public.partner_notification_generation_runs(worker,business_date,status,finished_at,duration_ms)
    values ('partner_notification_deadlines',p_business_date,'locked',clock_timestamp(),
      greatest(0,floor(extract(epoch from clock_timestamp()-started_at)*1000))::integer)
    returning id into run_id;
    return jsonb_build_object('runId',run_id,'status','locked');
  end if;
  insert into public.partner_notification_generation_runs(worker,business_date,status)
  values ('partner_notification_deadlines',p_business_date,'running') returning id into run_id;

  for candidate in
    select history.company_id,history.id entity_id,
      history.external_1c_order_number object_number,history.one_c_delivery_date planned_date,
      case when history.one_c_delivery_date=p_business_date+3 then 'shipment_due_in_3_days'
        when history.one_c_delivery_date=p_business_date then 'shipment_due_today'
        when history.one_c_delivery_date<p_business_date then 'shipment_overdue' end event_code
    from public.partner_order_history history
    where history.partner_visible and not history.one_c_deletion_mark
      and history.one_c_delivery_date is not null
      and coalesce(history.one_c_state_code,'')<>'completed'
      and (history.one_c_delivery_date in (p_business_date,p_business_date+3)
        or history.one_c_delivery_date<p_business_date)
    order by history.company_id,history.one_c_delivery_date,history.id
  loop
    source_version:=case when candidate.event_code='shipment_overdue'
      then concat(candidate.planned_date::text,':',(candidate.planned_date+1)::text)
      else concat(candidate.planned_date::text,':',p_business_date::text) end;
    projection:=public.create_partner_notification_event(
      candidate.company_id,candidate.event_code,'shipment',candidate.entity_id,
      'partner_order_history',null,source_version,p_business_date::timestamptz,
      jsonb_build_object('objectNumber',candidate.object_number,'plannedDate',candidate.planned_date,'businessDate',p_business_date)
    );
    source_count:=source_count+1;
    recipient_count:=recipient_count+coalesce((projection->>'eligibleRecipients')::integer,0);
    created_count:=created_count+coalesce((projection->>'created')::integer,0);
    deduplicated_count:=deduplicated_count+coalesce((projection->>'deduplicated')::integer,0);
  end loop;

  for candidate in
    select invitation.company_id,invitation.id entity_id,invitation.invited_by inviter_user_id,invitation.expires_at
    from public.invitations invitation
    where invitation.status='pending' and invitation.expires_at::date between p_business_date and p_business_date+3
    order by invitation.company_id,invitation.expires_at,invitation.id
  loop
    projection:=public.create_partner_notification_event(
      candidate.company_id,'invitation_expiring','invitation',candidate.entity_id,
      'invitations',null,candidate.expires_at::text,p_business_date::timestamptz,
      jsonb_build_object('inviterUserId',candidate.inviter_user_id,'expiresAt',candidate.expires_at)
    );
    source_count:=source_count+1;
    recipient_count:=recipient_count+coalesce((projection->>'eligibleRecipients')::integer,0);
    created_count:=created_count+coalesce((projection->>'created')::integer,0);
    deduplicated_count:=deduplicated_count+coalesce((projection->>'deduplicated')::integer,0);
  end loop;

  update public.partner_notification_generation_runs set
    status='succeeded',source_events_processed=source_count,recipients_resolved=recipient_count,
    notifications_created=created_count,deduplicated=deduplicated_count,
    finished_at=clock_timestamp(),duration_ms=greatest(0,floor(extract(epoch from clock_timestamp()-started_at)*1000))::integer
  where id=run_id;
  return jsonb_build_object('runId',run_id,'status','succeeded','businessDate',p_business_date,
    'sourceEventsProcessed',source_count,'recipientsResolved',recipient_count,
    'notificationsCreated',created_count,'deduplicated',deduplicated_count);
exception when others then
  if run_id is not null then
    update public.partner_notification_generation_runs set status='failed',safe_error_code=sqlstate,
      finished_at=clock_timestamp(),duration_ms=greatest(0,floor(extract(epoch from clock_timestamp()-started_at)*1000))::integer
    where id=run_id;
  end if;
  raise;
end $$;

revoke all on function public.generate_partner_notification_deadlines(date)
  from public,anon,authenticated;
grant execute on function public.generate_partner_notification_deadlines(date) to service_role;

commit;
