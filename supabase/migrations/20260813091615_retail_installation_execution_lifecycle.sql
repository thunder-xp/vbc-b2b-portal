-- Sprint 10: governed installation execution lifecycle and token-scoped customer confirmation.
-- Payment, settlement, 1C export, and automatic customer confirmation remain disabled.

alter table public.installation_executions drop constraint installation_executions_state_check;
alter table public.installation_executions
  add column scheduled_start_at timestamptz null,
  add column scheduled_end_at timestamptz null,
  add column operational_note text null check(operational_note is null or char_length(operational_note)<=500),
  add column provider_completed_at timestamptz null,
  add column customer_confirmation_requested_at timestamptz null,
  add column customer_confirmed_at timestamptz null,
  add column issue_reported_at timestamptz null,
  add column issue_category text null check(issue_category is null or issue_category in ('work_incomplete','installation_quality','equipment_issue','schedule_service_issue','other')),
  add column issue_note text null check(issue_note is null or char_length(issue_note)<=500),
  add column resolved_at timestamptz null,
  add column cancelled_at timestamptz null,
  add column capacity_released_at timestamptz null,
  add constraint installation_executions_state_check check(state in ('scheduling','scheduled','in_progress','completed_by_provider','customer_confirmation_pending','customer_confirmed','issue_reported','disputed','resolved','cancelled')),
  add constraint installation_executions_schedule_check check(scheduled_end_at is null or (scheduled_start_at is not null and scheduled_end_at>scheduled_start_at));

drop index installation_executions_provider_active_idx;
create index installation_executions_provider_active_idx on public.installation_executions(provider_id,state,updated_at,id)
where state in ('scheduling','scheduled','in_progress','completed_by_provider','customer_confirmation_pending','issue_reported','disputed');
create index installation_executions_state_operations_idx on public.installation_executions(state,updated_at,id);

create table public.installation_execution_events (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.installation_executions(id) on delete restrict,
  event_type text not null check(event_type in ('execution_created','scheduling_started','installation_scheduled','installation_rescheduled','installation_started','provider_completed','customer_confirmation_requested','customer_confirmed','customer_issue_reported','dispute_opened','dispute_resolved','execution_cancelled','settlement_eligibility_reached')),
  actor_type text not null check(actor_type in ('partner_operator','internal_operator','customer_token','system')),
  actor_user_id uuid null references auth.users(id) on delete restrict,
  correlation_id uuid not null,
  from_state text null,
  to_state text not null,
  safe_evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_evidence)='object' and pg_column_size(safe_evidence)<=4096),
  created_at timestamptz not null default now()
);
create index installation_execution_events_execution_idx on public.installation_execution_events(execution_id,created_at,id);
create index installation_execution_events_actor_idx on public.installation_execution_events(actor_user_id) where actor_user_id is not null;

create table public.installation_execution_commands (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.installation_executions(id) on delete restrict,
  idempotency_key uuid not null,
  command_type text not null check(command_type in ('schedule','start','complete','confirm','report_issue','open_dispute','resolve_dispute','cancel')),
  request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null check(jsonb_typeof(result)='object' and pg_column_size(result)<=4096),
  created_at timestamptz not null default now(),
  unique(execution_id,idempotency_key)
);

create table public.installation_execution_policies (
  system_type text primary key check(system_type='cctv'),
  customer_confirmation_timeout_hours integer null check(customer_confirmation_timeout_hours is null or customer_confirmation_timeout_hours between 1 and 720),
  auto_confirm_enabled boolean not null default false check(not auto_confirm_enabled or customer_confirmation_timeout_hours is not null),
  revision bigint not null default 0 check(revision>=0),
  updated_at timestamptz not null default now()
);
insert into public.installation_execution_policies(system_type,customer_confirmation_timeout_hours,auto_confirm_enabled)
values('cctv',null,false) on conflict(system_type) do nothing;

create or replace function public.prevent_installation_execution_history_mutation() returns trigger
language plpgsql set search_path=public as $$ begin
  raise exception 'Installation execution history is immutable.' using errcode='42501';
end; $$;
create trigger protect_installation_execution_events before update or delete on public.installation_execution_events for each row execute function public.prevent_installation_execution_history_mutation();
create trigger protect_installation_execution_commands before update or delete on public.installation_execution_commands for each row execute function public.prevent_installation_execution_history_mutation();

create or replace function public.record_installation_execution_created() returns trigger
language plpgsql set search_path=public as $$
declare correlation uuid:=gen_random_uuid();
begin
  insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state) values
    (new.id,'execution_created',case when auth.uid() is null then 'system' else 'partner_operator' end,auth.uid(),correlation,null,'scheduling'),
    (new.id,'scheduling_started','system',null,correlation,'scheduling','scheduling');
  return new;
end; $$;
create trigger record_installation_execution_created after insert on public.installation_executions for each row execute function public.record_installation_execution_created();

insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state,safe_evidence)
select execution.id,event.event_type,'system',null,event.correlation,event.from_state,event.to_state,jsonb_build_object('backfilled',true)
from public.installation_executions execution
cross join lateral (values('execution_created',gen_random_uuid(),null::text,'scheduling'),('scheduling_started',gen_random_uuid(),'scheduling','scheduling')) event(event_type,correlation,from_state,to_state)
where not exists(select 1 from public.installation_execution_events existing where existing.execution_id=execution.id and existing.event_type=event.event_type);

create or replace function public.protect_installation_execution_ownership() returns trigger
language plpgsql set search_path=public as $$ begin
  if tg_op='DELETE' or new.requirement_id<>old.requirement_id or new.accepted_attempt_id<>old.accepted_attempt_id
    or new.provider_id<>old.provider_id or new.created_at<>old.created_at then
    raise exception 'Installation execution ownership is immutable.' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger protect_installation_execution_ownership before update or delete on public.installation_executions for each row execute function public.protect_installation_execution_ownership();

create or replace function public.transition_installation_execution(
  p_execution_id uuid,p_command text,p_expected_revision bigint,p_payload jsonb,p_idempotency_key uuid,
  p_actor_type text,p_actor_user_id uuid
) returns jsonb
language plpgsql set search_path=public as $$
declare
  execution public.installation_executions;
  existing public.installation_execution_commands;
  fingerprint text;
  result jsonb;
  next_state text;
  event_name text;
  correlation uuid:=gen_random_uuid();
  scheduled_start timestamptz;
  scheduled_end timestamptz;
  note text;
  old_schedule timestamptz;
begin
  if p_command not in ('schedule','start','complete','confirm','report_issue','open_dispute','resolve_dispute','cancel')
    or p_actor_type not in ('partner_operator','internal_operator','customer_token','system')
    or p_expected_revision<0 or p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'Invalid installation execution command.' using errcode='22023';
  end if;
  fingerprint:=encode(extensions.digest(p_command||'|'||p_expected_revision::text||'|'||p_payload::text,'sha256'),'hex');
  select * into execution from public.installation_executions where id=p_execution_id for update;
  if not found then raise exception 'Installation execution not found.' using errcode='P0002'; end if;
  select * into existing from public.installation_execution_commands where execution_id=execution.id and idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint<>fingerprint then raise exception 'Idempotency key conflict.' using errcode='40001'; end if;
    return existing.result||jsonb_build_object('repeated',true);
  end if;
  if execution.revision<>p_expected_revision then raise exception 'Installation execution revision conflict.' using errcode='40001'; end if;

  if p_command='schedule' then
    if execution.state not in ('scheduling','scheduled') then raise exception 'Invalid installation execution transition.' using errcode='40001'; end if;
    begin scheduled_start:=(p_payload->>'scheduledStartAt')::timestamp at time zone 'Europe/Chisinau'; scheduled_end:=nullif(p_payload->>'scheduledEndAt','')::timestamp at time zone 'Europe/Chisinau';
    exception when others then raise exception 'Invalid installation schedule.' using errcode='22023'; end;
    note:=nullif(btrim(coalesce(p_payload->>'note','')),'');
    if scheduled_start<now() or scheduled_start>now()+interval '365 days' or (scheduled_end is not null and (scheduled_end<=scheduled_start or scheduled_end>scheduled_start+interval '24 hours')) or char_length(coalesce(note,''))>500 then
      raise exception 'Invalid installation schedule.' using errcode='22023';
    end if;
    old_schedule:=execution.scheduled_start_at;
    event_name:=case when execution.state='scheduled' then 'installation_rescheduled' else 'installation_scheduled' end;
    update public.installation_executions set state='scheduled',scheduled_start_at=scheduled_start,scheduled_end_at=scheduled_end,operational_note=note,revision=revision+1,updated_at=now() where id=execution.id returning * into execution;
    insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state,safe_evidence)
    values(execution.id,event_name,p_actor_type,p_actor_user_id,correlation,case when event_name='installation_rescheduled' then 'scheduled' else 'scheduling' end,'scheduled',jsonb_strip_nulls(jsonb_build_object('previousScheduledStartAt',old_schedule,'scheduledStartAt',scheduled_start,'scheduledEndAt',scheduled_end)));
  elsif p_command='start' then
    if execution.state<>'scheduled' then raise exception 'Invalid installation execution transition.' using errcode='40001'; end if;
    update public.installation_executions set state='in_progress',revision=revision+1,updated_at=now() where id=execution.id returning * into execution;
    insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state) values(execution.id,'installation_started',p_actor_type,p_actor_user_id,correlation,'scheduled','in_progress');
  elsif p_command='complete' then
    if execution.state<>'in_progress' then raise exception 'Invalid installation execution transition.' using errcode='40001'; end if;
    note:=nullif(btrim(coalesce(p_payload->>'note','')),'');
    if char_length(coalesce(note,''))>500 then raise exception 'Invalid completion note.' using errcode='22023'; end if;
    update public.installation_executions set state='completed_by_provider',provider_completed_at=now(),operational_note=coalesce(note,operational_note),revision=revision+1,updated_at=now() where id=execution.id returning * into execution;
    insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state) values(execution.id,'provider_completed',p_actor_type,p_actor_user_id,correlation,'in_progress','completed_by_provider');
    update public.installation_executions set state='customer_confirmation_pending',customer_confirmation_requested_at=now(),revision=revision+1,updated_at=now() where id=execution.id returning * into execution;
    insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state) values(execution.id,'customer_confirmation_requested','system',null,correlation,'completed_by_provider','customer_confirmation_pending');
  elsif p_command='confirm' then
    if execution.state<>'customer_confirmation_pending' then raise exception 'Invalid installation execution transition.' using errcode='40001'; end if;
    update public.installation_executions set state='customer_confirmed',customer_confirmed_at=now(),capacity_released_at=now(),revision=revision+1,updated_at=now() where id=execution.id returning * into execution;
    update public.installation_provider_workloads set active_jobs=greatest(active_jobs-1,0),revision=revision+1,updated_at=now() where provider_id=execution.provider_id;
    insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state) values
      (execution.id,'customer_confirmed',p_actor_type,p_actor_user_id,correlation,'customer_confirmation_pending','customer_confirmed'),
      (execution.id,'settlement_eligibility_reached','system',null,correlation,'customer_confirmed','customer_confirmed');
  elsif p_command='report_issue' then
    if execution.state<>'customer_confirmation_pending' or coalesce(p_payload->>'category','') not in ('work_incomplete','installation_quality','equipment_issue','schedule_service_issue','other') then raise exception 'Invalid installation issue.' using errcode='40001'; end if;
    note:=nullif(btrim(coalesce(p_payload->>'note','')),'');
    if char_length(coalesce(note,''))>500 then raise exception 'Invalid installation issue.' using errcode='22023'; end if;
    update public.installation_executions set state='issue_reported',issue_reported_at=now(),issue_category=p_payload->>'category',issue_note=note,revision=revision+1,updated_at=now() where id=execution.id returning * into execution;
    insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state,safe_evidence) values(execution.id,'customer_issue_reported',p_actor_type,p_actor_user_id,correlation,'customer_confirmation_pending','issue_reported',jsonb_build_object('category',execution.issue_category));
  elsif p_command='open_dispute' then
    if execution.state<>'issue_reported' then raise exception 'Invalid installation execution transition.' using errcode='40001'; end if;
    update public.installation_executions set state='disputed',revision=revision+1,updated_at=now() where id=execution.id returning * into execution;
    insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state) values(execution.id,'dispute_opened',p_actor_type,p_actor_user_id,correlation,'issue_reported','disputed');
  elsif p_command='resolve_dispute' then
    if execution.state not in ('issue_reported','disputed') then raise exception 'Invalid installation execution transition.' using errcode='40001'; end if;
    next_state:=execution.state;
    note:=nullif(btrim(coalesce(p_payload->>'note','')),'');
    if note is null or char_length(note)>500 then raise exception 'Resolution note required.' using errcode='22023'; end if;
    update public.installation_executions set state='resolved',resolved_at=now(),capacity_released_at=now(),revision=revision+1,updated_at=now() where id=execution.id returning * into execution;
    update public.installation_provider_workloads set active_jobs=greatest(active_jobs-1,0),revision=revision+1,updated_at=now() where provider_id=execution.provider_id;
    insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state) values(execution.id,'dispute_resolved',p_actor_type,p_actor_user_id,correlation,next_state,'resolved');
  else
    if execution.state not in ('scheduling','scheduled') then raise exception 'Invalid installation execution transition.' using errcode='40001'; end if;
    next_state:=execution.state;
    note:=nullif(btrim(coalesce(p_payload->>'note','')),'');
    if note is null or char_length(note)>500 then raise exception 'Cancellation reason required.' using errcode='22023'; end if;
    update public.installation_executions set state='cancelled',cancelled_at=now(),capacity_released_at=now(),revision=revision+1,updated_at=now() where id=execution.id returning * into execution;
    update public.installation_provider_workloads set active_jobs=greatest(active_jobs-1,0),revision=revision+1,updated_at=now() where provider_id=execution.provider_id;
    insert into public.installation_execution_events(execution_id,event_type,actor_type,actor_user_id,correlation_id,from_state,to_state) values(execution.id,'execution_cancelled',p_actor_type,p_actor_user_id,correlation,next_state,'cancelled');
  end if;
  result:=jsonb_build_object('executionId',execution.id,'state',execution.state,'revision',execution.revision,'repeated',false,'scheduledStartAt',execution.scheduled_start_at,'scheduledEndAt',execution.scheduled_end_at);
  insert into public.installation_execution_commands(execution_id,idempotency_key,command_type,request_fingerprint,result) values(execution.id,p_idempotency_key,p_command,fingerprint,result);
  return result;
end; $$;

create or replace function public.partner_transition_installation_execution(p_company_id uuid,p_execution_id uuid,p_command text,p_expected_revision bigint,p_payload jsonb,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$
declare target_provider public.installation_providers;
begin
  if not public.has_permission(p_company_id,'installation_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  select candidate.* into target_provider from public.installation_executions execution join public.installation_providers candidate on candidate.id=execution.provider_id where execution.id=p_execution_id;
  if not found or target_provider.provider_type<>'partner_company' or target_provider.partner_company_id is distinct from p_company_id then raise exception 'Forbidden.' using errcode='42501'; end if;
  if p_command not in ('schedule','start','complete') then raise exception 'Forbidden.' using errcode='42501'; end if;
  return public.transition_installation_execution(p_execution_id,p_command,p_expected_revision,p_payload,p_idempotency_key,'partner_operator',auth.uid());
end; $$;

create or replace function public.admin_transition_installation_execution(p_execution_id uuid,p_command text,p_expected_revision bigint,p_payload jsonb,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$ begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if p_command not in ('schedule','start','complete','open_dispute','resolve_dispute','cancel') then raise exception 'Forbidden.' using errcode='42501'; end if;
  return public.transition_installation_execution(p_execution_id,p_command,p_expected_revision,p_payload,p_idempotency_key,'internal_operator',auth.uid());
end; $$;

create or replace function public.customer_transition_installation_execution(p_access_token_hash text,p_command text,p_expected_revision bigint,p_payload jsonb,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$
declare execution_id uuid;
begin
  if p_command not in ('confirm','report_issue') then raise exception 'Forbidden.' using errcode='42501'; end if;
  select execution.id into execution_id
  from public.retail_order_access_tokens token
  join public.installation_requirements requirement on requirement.retail_order_id=token.order_id
  join public.installation_executions execution on execution.requirement_id=requirement.id
  where token.token_hash=p_access_token_hash and token.revoked_at is null and token.expires_at>now();
  if execution_id is null then raise exception 'Order access unavailable.' using errcode='28000'; end if;
  return public.transition_installation_execution(execution_id,p_command,p_expected_revision,p_payload,p_idempotency_key,'customer_token',null);
end; $$;

create or replace function public.partner_list_installation_assignments(p_company_id uuid,p_view text default 'offers') returns jsonb
language plpgsql stable security definer set search_path=public set row_security=off as $$ begin
  if p_view not in ('offers','active','completed') or not public.has_permission(p_company_id,'installation_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('attemptId',attempt.id,'requirementId',requirement.id,'orderNumber',orders.public_number,'ordinal',attempt.ordinal,'status',attempt.status,'source',attempt.source,'offeredAt',attempt.offered_at,'deadlineAt',attempt.deadline_at,'locality',requirement.locality_snapshot,'systemType',requirement.system_type,'scope',(select coalesce(jsonb_agg(jsonb_build_object('serviceType',line->>'serviceType','quantity',(line->>'quantity')::numeric,'unitCode',line->>'unitCode') order by line->>'serviceType'),'[]'::jsonb) from jsonb_array_elements(requirement.work_lines_snapshot) line),'customerInstallationCharge',null,'providerPayable',null,'customer',case when attempt.status='accepted' then jsonb_build_object('name',requirement.customer_pii_snapshot->>'name','phone',requirement.customer_pii_snapshot->>'phone','email',null) else null end,'exactAddress',case when attempt.status='accepted' then requirement.exact_address_snapshot else null end,'execution',case when execution.id is null then null else jsonb_build_object('id',execution.id,'state',execution.state,'revision',execution.revision,'scheduledStartAt',execution.scheduled_start_at,'scheduledEndAt',execution.scheduled_end_at,'providerCompletedAt',execution.provider_completed_at,'customerConfirmedAt',execution.customer_confirmed_at,'issueCategory',execution.issue_category,'completedAt',coalesce(execution.customer_confirmed_at,execution.resolved_at,execution.cancelled_at)) end) order by attempt.offered_at desc,attempt.id desc)
    from public.installation_assignment_attempts attempt
    join public.installation_requirements requirement on requirement.id=attempt.requirement_id
    join public.retail_orders orders on orders.id=requirement.retail_order_id
    join public.installation_providers provider on provider.id=attempt.provider_id and provider.partner_company_id=p_company_id
    left join public.installation_executions execution on execution.accepted_attempt_id=attempt.id
    where (p_view='offers' and attempt.status='offered') or (p_view='active' and attempt.status='accepted' and execution.state in ('scheduling','scheduled','in_progress','completed_by_provider','customer_confirmation_pending','issue_reported','disputed')) or (p_view='completed' and attempt.status='accepted' and execution.state in ('customer_confirmed','resolved','cancelled'))),'[]'::jsonb);
end; $$;

create or replace function public.admin_get_installation_assignments(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path=public set row_security=off as $$ begin
 if not public.has_internal_permission('admin.retail_marketplace.view') then raise exception 'Forbidden.' using errcode='42501'; end if;
 return jsonb_build_object('requirements',coalesce((select jsonb_agg(jsonb_build_object('id',requirement.id,'orderNumber',orders.public_number,'status',requirement.status,'selectionMode',requirement.selection_mode,'locality',requirement.locality_snapshot,'customerInstallationCharge',requirement.customer_installation_charge,'currency',requirement.currency,'revision',requirement.revision,'currentAttemptId',requirement.current_attempt_id,'acceptedProviderId',requirement.accepted_provider_id,'activatedAt',requirement.activated_at,'execution',case when execution.id is null then null else jsonb_build_object('id',execution.id,'state',execution.state,'revision',execution.revision,'providerId',execution.provider_id,'scheduledStartAt',execution.scheduled_start_at,'scheduledEndAt',execution.scheduled_end_at,'updatedAt',execution.updated_at,'issueCategory',execution.issue_category) end,'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',attempt.id,'ordinal',attempt.ordinal,'providerId',attempt.provider_id,'source',attempt.source,'status',attempt.status,'offeredAt',attempt.offered_at,'deadlineAt',attempt.deadline_at,'declineReasonCode',attempt.decline_reason_code) order by attempt.ordinal) from public.installation_assignment_attempts attempt where attempt.requirement_id=requirement.id),'[]'::jsonb)) order by requirement.activated_at desc,requirement.id desc) from (select * from public.installation_requirements order by activated_at desc,id desc limit least(greatest(p_limit,1),200)) requirement join public.retail_orders orders on orders.id=requirement.retail_order_id left join public.installation_executions execution on execution.requirement_id=requirement.id),'[]'::jsonb));
end; $$;

create or replace function public.get_public_retail_installation_status(p_access_token_hash text,p_locale text default 'ru') returns jsonb
language sql stable security definer set search_path=public set row_security=off as $$
 select case when requirement.id is null then null else jsonb_strip_nulls(jsonb_build_object(
   'status',case when execution.id is null then 'selecting_team' else execution.state end,
   'label',case
     when execution.id is null then case when p_locale='ro' then 'Selectam echipa de instalare' else 'Подбираем монтажную команду' end
     when execution.state='scheduling' then case when p_locale='ro' then 'Echipa de instalare a fost desemnata' else 'Монтажная команда назначена' end
     when execution.state='scheduled' then case when p_locale='ro' then 'Instalarea este planificata' else 'Монтаж запланирован' end
     when execution.state='in_progress' then case when p_locale='ro' then 'Instalarea este in curs' else 'Монтаж выполняется' end
     when execution.state in ('completed_by_provider','customer_confirmation_pending') then case when p_locale='ro' then 'Instalarea este finalizata. Confirmati lucrarile.' else 'Монтаж завершён. Подтвердите выполнение.' end
     when execution.state='customer_confirmed' then case when p_locale='ro' then 'Instalarea este finalizata' else 'Монтаж завершён' end
     when execution.state in ('issue_reported','disputed') then case when p_locale='ro' then 'Solicitarea privind instalarea este examinata' else 'Обращение по монтажу рассматривается' end
     when execution.state='resolved' then case when p_locale='ro' then 'Solicitarea privind instalarea a fost solutionata' else 'Обращение по монтажу решено' end
     else case when p_locale='ro' then 'Instalarea a fost anulata' else 'Монтаж отменён' end end,
   'scheduledStartAt',execution.scheduled_start_at,'scheduledEndAt',execution.scheduled_end_at,
   'revision',execution.revision,'confirmationRequired',execution.state='customer_confirmation_pending',
   'issueReportingAllowed',execution.state='customer_confirmation_pending',
   'providerName',case when p_locale='ro' then nullif(profile.public_name_ro,'') else nullif(profile.public_name_ru,'') end
 )) end
 from public.retail_order_access_tokens token join public.retail_orders orders on orders.id=token.order_id
 left join public.installation_requirements requirement on requirement.retail_order_id=orders.id
 left join public.installation_executions execution on execution.requirement_id=requirement.id
 left join public.installation_providers provider on provider.id=execution.provider_id
 left join public.installation_provider_profiles profile on profile.provider_id=provider.id
 where token.token_hash=p_access_token_hash and token.revoked_at is null and token.expires_at>now() and p_locale in ('ru','ro');
$$;

alter table public.installation_execution_events enable row level security;
alter table public.installation_execution_commands enable row level security;
alter table public.installation_execution_policies enable row level security;
revoke all on public.installation_execution_events,public.installation_execution_commands,public.installation_execution_policies from public,anon,authenticated;
grant all on public.installation_execution_events,public.installation_execution_commands,public.installation_execution_policies to service_role;

revoke all on function public.prevent_installation_execution_history_mutation(),public.record_installation_execution_created(),public.protect_installation_execution_ownership(),public.transition_installation_execution(uuid,text,bigint,jsonb,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.partner_transition_installation_execution(uuid,uuid,text,bigint,jsonb,uuid),public.admin_transition_installation_execution(uuid,text,bigint,jsonb,uuid),public.customer_transition_installation_execution(text,text,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.partner_transition_installation_execution(uuid,uuid,text,bigint,jsonb,uuid),public.admin_transition_installation_execution(uuid,text,bigint,jsonb,uuid) to authenticated,service_role;
grant execute on function public.customer_transition_installation_execution(text,text,bigint,jsonb,uuid) to anon,service_role;
