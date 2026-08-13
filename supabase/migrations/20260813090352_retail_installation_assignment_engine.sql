-- Sprint 9: deterministic Retail installation assignment.
-- Retail commercial/payment snapshots remain independent and immutable.

insert into public.permissions(code, description, scope, delegable_by_partner_owner, sensitive, category)
values ('installation_marketplace.manage', 'Manage installation offers assigned to the partner company.', 'partner', false, true, 'operations')
on conflict(code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role cross join public.permissions permission
where role.code in ('partner_owner','partner_manager')
  and permission.code='installation_marketplace.manage'
on conflict do nothing;

insert into public.partner_access_preset_capabilities(preset_code, permission_id)
select 'full_partner_access', id from public.permissions where code='installation_marketplace.manage'
on conflict do nothing;

insert into public.partner_company_capabilities(company_id, permission_id, enabled_by)
select policy.company_id, permission.id, policy.changed_by
from public.partner_company_access_policies policy
cross join public.permissions permission
where policy.preset_code='full_partner_access' and permission.code='installation_marketplace.manage'
on conflict do nothing;

create table public.installation_requirements (
  id uuid primary key default gen_random_uuid(),
  retail_order_id uuid not null unique references public.retail_orders(id) on delete restrict,
  system_type text not null check(system_type='cctv'),
  status text not null default 'assignment_pending' check(status in ('assignment_pending','offered','reassignment_pending','assigned','assignment_unavailable')),
  selection_mode text not null check(selection_mode in ('customer_selected','automatic')),
  preferred_provider_id uuid null references public.installation_providers(id) on delete restrict,
  accepted_provider_id uuid null references public.installation_providers(id) on delete restrict,
  service_region_id uuid not null references public.installation_service_regions(id) on delete restrict,
  locality_snapshot text not null check(char_length(btrim(locality_snapshot)) between 1 and 120),
  exact_address_snapshot jsonb not null check(jsonb_typeof(exact_address_snapshot)='object'),
  customer_pii_snapshot jsonb not null check(jsonb_typeof(customer_pii_snapshot)='object'),
  work_lines_snapshot jsonb not null check(jsonb_typeof(work_lines_snapshot)='array' and jsonb_array_length(work_lines_snapshot) between 1 and 20),
  tariff_set_id uuid not null references public.installation_tariff_sets(id) on delete restrict,
  tariff_version integer not null check(tariff_version>0),
  customer_installation_charge numeric(14,2) not null check(customer_installation_charge>=0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  vat_treatment text not null check(vat_treatment in ('included','excluded','not_specified')),
  required_competencies text[] not null default array['cctv']::text[] check(cardinality(required_competencies)>0),
  requested_scheduling_context jsonb not null default '{}'::jsonb check(jsonb_typeof(requested_scheduling_context)='object'),
  activation_mode text not null check(activation_mode in ('payment_verified','pilot_simulated')),
  activation_evidence jsonb not null check(jsonb_typeof(activation_evidence)='object'),
  current_attempt_id uuid null,
  revision bigint not null default 0 check(revision>=0),
  activated_at timestamptz not null default now(),
  assigned_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((status='assigned' and accepted_provider_id is not null and assigned_at is not null) or status<>'assigned')
);
create index installation_requirements_dispatch_idx on public.installation_requirements(status,updated_at,id) where status in ('assignment_pending','reassignment_pending');
create index installation_requirements_provider_idx on public.installation_requirements(accepted_provider_id,status,id) where accepted_provider_id is not null;

create table public.installation_requirement_lines (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.installation_requirements(id) on delete restrict,
  line_number integer not null check(line_number>0),
  service_type text not null check(service_type in ('camera_installation','cable_laying','commissioning','remote_configuration')),
  unit_code text not null check(unit_code in ('piece','meter','service')),
  quantity numeric(14,3) not null check(quantity>0 and quantity<=20000),
  customer_unit_price numeric(14,2) not null check(customer_unit_price>=0),
  customer_line_amount numeric(14,2) not null check(customer_line_amount>=0),
  unique(requirement_id,line_number),
  unique(requirement_id,service_type)
);
create index installation_requirement_lines_requirement_idx on public.installation_requirement_lines(requirement_id,line_number);

create table public.installation_assignment_attempts (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.installation_requirements(id) on delete restrict,
  ordinal integer not null check(ordinal>0),
  provider_id uuid not null references public.installation_providers(id) on delete restrict,
  source text not null check(source in ('customer_selected','automatic','manual_internal','reassignment','fallback_internal')),
  status text not null default 'offered' check(status in ('offered','accepted','declined','timed_out','withdrawn')),
  offered_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  accepted_at timestamptz null,
  declined_at timestamptz null,
  timed_out_at timestamptz null,
  withdrawn_at timestamptz null,
  decline_reason_code text null check(decline_reason_code is null or decline_reason_code in ('no_capacity','schedule_conflict','region_issue','technical_scope','other')),
  decline_reason_text text null check(decline_reason_text is null or char_length(decline_reason_text)<=300),
  eligibility_evidence jsonb not null check(jsonb_typeof(eligibility_evidence)='object'),
  ranking_evidence_version text not null default 'deterministic-v1',
  compensation_snapshot jsonb null check(compensation_snapshot is null or jsonb_typeof(compensation_snapshot)='object'),
  idempotency_key uuid not null,
  correlation_id uuid not null default gen_random_uuid(),
  response_idempotency_key uuid null,
  created_at timestamptz not null default now(),
  unique(requirement_id,ordinal),
  unique(requirement_id,idempotency_key),
  check(deadline_at>offered_at),
  check((status='accepted' and accepted_at is not null) or status<>'accepted'),
  check((status='declined' and declined_at is not null) or status<>'declined'),
  check((status='timed_out' and timed_out_at is not null) or status<>'timed_out'),
  check((status='withdrawn' and withdrawn_at is not null) or status<>'withdrawn')
);
create unique index installation_assignment_one_active_idx on public.installation_assignment_attempts(requirement_id) where status='offered';
create index installation_assignment_provider_queue_idx on public.installation_assignment_attempts(provider_id,status,deadline_at,id) where status='offered';
create index installation_assignment_due_idx on public.installation_assignment_attempts(deadline_at,id) where status='offered';
alter table public.installation_requirements add constraint installation_requirements_current_attempt_fk foreign key(current_attempt_id) references public.installation_assignment_attempts(id) on delete restrict;

create table public.installation_executions (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null unique references public.installation_requirements(id) on delete restrict,
  accepted_attempt_id uuid not null unique references public.installation_assignment_attempts(id) on delete restrict,
  provider_id uuid not null references public.installation_providers(id) on delete restrict,
  state text not null default 'scheduling' check(state in ('scheduling','scheduled','in_progress','completed','cancelled')),
  revision bigint not null default 0 check(revision>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index installation_executions_provider_active_idx on public.installation_executions(provider_id,state,id) where state in ('scheduling','scheduled','in_progress');

create table public.installation_provider_workloads (
  provider_id uuid primary key references public.installation_providers(id) on delete cascade,
  active_jobs integer not null default 0 check(active_jobs>=0),
  last_offered_at timestamptz null,
  revision bigint not null default 0 check(revision>=0),
  updated_at timestamptz not null default now()
);

create table public.installation_assignment_events (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.installation_requirements(id) on delete restrict,
  attempt_id uuid null references public.installation_assignment_attempts(id) on delete restrict,
  execution_id uuid null references public.installation_executions(id) on delete restrict,
  event_type text not null check(event_type in ('installation_requirement_activated','provider_preferred','assignment_offered','assignment_accepted','assignment_declined','assignment_timed_out','reassignment_pending','assignment_reassigned','internal_team_fallback','execution_created','assignment_unavailable','manual_reassignment_requested')),
  actor_user_id uuid null references auth.users(id) on delete restrict,
  correlation_id uuid not null,
  safe_evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_evidence)='object' and pg_column_size(safe_evidence)<=4096),
  created_at timestamptz not null default now()
);
create index installation_assignment_events_requirement_idx on public.installation_assignment_events(requirement_id,created_at,id);

create table public.installation_assignment_worker_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('running','succeeded','failed','locked')),
  claimed_count integer not null default 0,
  timed_out_count integer not null default 0,
  dispatched_count integer not null default 0,
  unavailable_count integer not null default 0,
  safe_error_code text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null
);
create index installation_assignment_worker_runs_started_idx on public.installation_assignment_worker_runs(started_at desc);

create or replace function public.prevent_installation_assignment_history_mutation() returns trigger
language plpgsql set search_path=public as $$ begin
  raise exception 'Installation assignment history is immutable.' using errcode='42501';
end; $$;
create trigger protect_installation_requirement_lines before update or delete on public.installation_requirement_lines for each row execute function public.prevent_installation_assignment_history_mutation();
create trigger protect_installation_assignment_events before update or delete on public.installation_assignment_events for each row execute function public.prevent_installation_assignment_history_mutation();

create or replace function public.protect_installation_assignment_attempt() returns trigger
language plpgsql set search_path=public as $$ begin
  if tg_op='DELETE' or old.status<>'offered'
    or new.requirement_id<>old.requirement_id or new.ordinal<>old.ordinal or new.provider_id<>old.provider_id
    or new.source<>old.source or new.offered_at<>old.offered_at or new.deadline_at<>old.deadline_at
    or new.eligibility_evidence<>old.eligibility_evidence or new.ranking_evidence_version<>old.ranking_evidence_version
    or new.compensation_snapshot is distinct from old.compensation_snapshot or new.idempotency_key<>old.idempotency_key
    or new.correlation_id<>old.correlation_id or new.created_at<>old.created_at
    or new.status not in ('accepted','declined','timed_out','withdrawn') then
    raise exception 'Installation assignment attempts are immutable after offer.' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger protect_installation_assignment_attempts before update or delete on public.installation_assignment_attempts for each row execute function public.protect_installation_assignment_attempt();

create or replace function public.capture_retail_installation_snapshot() returns trigger
language plpgsql set search_path=public as $$
declare snapshots integer; snapshot jsonb;
begin
  if jsonb_array_length(new.installation_intent_snapshot)=0 then return new; end if;
  with bundles as (
    select bundle.installation_price_snapshot snapshot from public.retail_cart_bundles bundle
    where bundle.cart_id=new.source_cart_id and bundle.installation_price_snapshot is not null
  ), rows as (
    select line from bundles cross join lateral jsonb_array_elements(snapshot->'lines') line
  ), grouped as (
    select line->>'serviceType' service_type,line->>'unitCode' unit_code,sum((line->>'quantity')::numeric) quantity,
      min((line->>'unitPrice')::numeric) unit_price,sum((line->>'amount')::numeric) amount,
      count(distinct (line->>'unitPrice')) price_count from rows group by 1,2
  ) select (select count(distinct snapshot->>'tariffSetId') from bundles),jsonb_build_object(
    'tariffSetId',(select min(snapshot->>'tariffSetId') from bundles),
    'lines',coalesce((select jsonb_agg(jsonb_build_object('serviceType',service_type,'unitCode',unit_code,'quantity',quantity,'unitPrice',unit_price,'amount',amount) order by service_type) from grouped where price_count=1),'[]'::jsonb),
    'subtotal',coalesce((select sum(amount) from grouped where price_count=1),0),
    'validLineCount',coalesce((select count(*) from grouped where price_count=1),0),
    'allLineCount',coalesce((select count(*) from grouped),0)
  ) into snapshots,snapshot;
  if snapshots<>1 or snapshot->>'tariffSetId' is null then
    raise exception 'Installation commercial snapshot is incomplete.' using errcode='P0002';
  end if;
  if snapshot->>'validLineCount'<>snapshot->>'allLineCount' then raise exception 'Installation tariff snapshot is inconsistent.' using errcode='P0002'; end if;
  new.installation_tariff_set_id := (snapshot->>'tariffSetId')::uuid;
  new.installation_work_lines_snapshot := snapshot->'lines';
  new.installation_subtotal := (snapshot->>'subtotal')::numeric;
  return new;
end; $$;
create trigger capture_retail_installation_snapshot before insert on public.retail_orders for each row execute function public.capture_retail_installation_snapshot();

create or replace function public.prevent_retail_order_commercial_mutation() returns trigger
language plpgsql set search_path=public as $$ begin
  if new.public_number<>old.public_number or new.source_cart_id<>old.source_cart_id or new.customer_id<>old.customer_id
    or new.submission_key<>old.submission_key or new.request_fingerprint<>old.request_fingerprint or new.checkout_fingerprint<>old.checkout_fingerprint
    or new.locale<>old.locale or new.publication_id<>old.publication_id or new.currency<>old.currency
    or new.equipment_subtotal<>old.equipment_subtotal or new.materials_subtotal<>old.materials_subtotal or new.priced_scope_total<>old.priced_scope_total
    or new.vat_presentation<>old.vat_presentation or new.customer_snapshot<>old.customer_snapshot or new.delivery_address_snapshot<>old.delivery_address_snapshot
    or new.installation_address_snapshot is distinct from old.installation_address_snapshot or new.installation_intent_snapshot<>old.installation_intent_snapshot
    or new.calculator_evidence_snapshot<>old.calculator_evidence_snapshot or new.installation_tariff_set_id is distinct from old.installation_tariff_set_id
    or new.installation_work_lines_snapshot<>old.installation_work_lines_snapshot or new.installation_subtotal is distinct from old.installation_subtotal
    or new.created_at<>old.created_at then raise exception 'Retail order commercial snapshot is immutable.' using errcode='42501'; end if;
  return new;
end; $$;

create or replace function public.installation_provider_eligibility(p_requirement_id uuid,p_provider_id uuid) returns jsonb
language sql stable security definer set search_path=public set row_security=off as $$
with requirement as (select * from public.installation_requirements where id=p_requirement_id),
ancestry as (
  with recursive regions as (
    select region.id,region.parent_id,0 depth from public.installation_service_regions region join requirement on region.id=requirement.service_region_id
    union all select parent.id,parent.parent_id,regions.depth+1 from regions join public.installation_service_regions parent on parent.id=regions.parent_id
  ) select * from regions
), state as (
 select provider.id,provider.provider_type,provider.partner_company_id,profile.acceptance_sla_minutes,profile.max_concurrent_jobs,
   coalesce(workload.active_jobs,0) active_jobs,min(ancestry.depth) geography_rank,
   provider.operational_status='active' active,
   provider.approval_status='approved' approved,provider.marketplace_enabled,
   profile.public_profile_status='published' published,profile.availability_state in ('available','limited') available,
   exists(select 1 from public.installation_provider_competencies c join requirement on c.system_type=requirement.system_type where c.provider_id=provider.id and c.active) competent,
   min(ancestry.depth) is not null region_covered,
   profile.acceptance_sla_minutes between 5 and 10080 valid_sla,
   profile.max_concurrent_jobs is not null and coalesce(workload.active_jobs,0)<profile.max_concurrent_jobs capacity_available,
   not exists(select 1 from public.installation_assignment_attempts attempt where attempt.requirement_id=p_requirement_id and attempt.provider_id=provider.id and attempt.status in ('declined','timed_out','withdrawn')) not_terminally_attempted
 from public.installation_providers provider
 join public.installation_provider_profiles profile on profile.provider_id=provider.id
 left join public.installation_provider_workloads workload on workload.provider_id=provider.id
 left join public.installation_provider_regions coverage on coverage.provider_id=provider.id and coverage.active
 left join ancestry on ancestry.id=coverage.region_id
 where provider.id=p_provider_id
 group by provider.id,profile.acceptance_sla_minutes,profile.max_concurrent_jobs,profile.public_profile_status,profile.availability_state,workload.active_jobs
)
select coalesce((select jsonb_build_object('eligible',active and approved and marketplace_enabled and published and available and competent and region_covered and valid_sla and capacity_available and not_terminally_attempted,
 'providerType',provider_type,'partnerCompanyId',partner_company_id,'geographyRank',geography_rank,'activeJobs',active_jobs,'maxConcurrentJobs',max_concurrent_jobs,'acceptanceSlaMinutes',acceptance_sla_minutes,
 'checks',jsonb_build_object('active',active,'approved',approved,'marketplaceEnabled',marketplace_enabled,'published',published,'available',available,'competent',competent,'regionCovered',region_covered,'validSla',valid_sla,'capacityAvailable',capacity_available,'notTerminallyAttempted',not_terminally_attempted)) from state),jsonb_build_object('eligible',false,'reason','provider_missing'));
$$;

alter table public.partner_notification_events drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events add constraint partner_notification_events_code_check check(event_code in (
 'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected','service_history_accepted','service_history_ready_for_pickup','service_history_issued','installation_offer'
));
alter table public.partner_notifications drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications add constraint partner_notifications_event_code_check check(event_code in (
 'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected','service_history_accepted','service_history_ready_for_pickup','service_history_issued','installation_offer'
));
alter table public.partner_notification_events drop constraint if exists partner_notification_events_group_check;
alter table public.partner_notification_events add constraint partner_notification_events_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents','service','support','installation'));
alter table public.partner_notifications drop constraint if exists partner_notifications_group_check;
alter table public.partner_notifications add constraint partner_notifications_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents','service','support','installation'));
alter table public.partner_notification_preferences drop constraint if exists partner_notification_preferences_group_check;
alter table public.partner_notification_preferences add constraint partner_notification_preferences_group_check check(event_group in ('orders','shipments','company_access','products','commercial','documents','service','support','installation'));

create or replace function public.is_allowed_partner_notification_url(value text) returns boolean
language sql immutable set search_path=public as $$
 select value='/cabinet' or value='/cabinet/installation-orders'
  or value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
  or value ~ '^/cabinet/service/[0-9a-f-]{36}$' or value ~ '^/cabinet/service/history/[0-9a-f-]{36}$'
  or value ~ '^/cabinet/support/[0-9a-f-]{36}$' or value='/cabinet/reservation-requests' or value='/cabinet/company/users'
  or value ~ '^/cabinet/catalog/[a-z0-9-]+$' or value='/cabinet/cart' or value='/cabinet/offers'
  or value ~ '^/cabinet/offers/[0-9a-f-]{36}$' or value='/cabinet/documents' or value ~ '^/cabinet/documents/[0-9a-f-]{36}$'
$$;

create or replace function public.project_installation_offer_notification(p_attempt_id uuid) returns integer
language plpgsql security definer set search_path=public set row_security=off as $$
declare attempt public.installation_assignment_attempts; requirement public.installation_requirements; provider public.installation_providers; source_id uuid; created_count integer;
begin
  select * into attempt from public.installation_assignment_attempts where id=p_attempt_id;
  if not found or attempt.status<>'offered' then return 0; end if;
  select * into requirement from public.installation_requirements where id=attempt.requirement_id;
  select * into provider from public.installation_providers where id=attempt.provider_id;
  if provider.provider_type<>'partner_company' then return 0; end if;
  insert into public.partner_notification_events(company_id,event_code,event_group,domain,entity_type,entity_id,source_table,source_event_id,source_version,occurred_at,safe_payload,fingerprint)
  values(provider.partner_company_id,'installation_offer','installation','retail_installation','installation_assignment_attempt',attempt.id,'installation_assignment_attempts',null,attempt.ordinal::text,attempt.offered_at,jsonb_build_object('locality',requirement.locality_snapshot,'deadlineAt',attempt.deadline_at),encode(extensions.digest('installation-offer|'||attempt.id::text,'sha256'),'hex'))
  on conflict(fingerprint) do update set fingerprint=excluded.fingerprint returning id into source_id;
  with recipients as (
    select membership.user_id from public.company_memberships membership
    join public.user_profiles profile on profile.id=membership.user_id and profile.status='active'
    where membership.company_id=provider.partner_company_id and membership.status='active'
      and public.notification_user_has_permission(membership.user_id,provider.partner_company_id,'installation_marketplace.manage')
  ), inserted as (
    insert into public.partner_notifications(company_id,recipient_user_id,event_code,event_group,domain,severity,mandatory,title,message,action_label,action_url,entity_type,entity_id,occurred_at,deduplication_key,source_event_id,expires_at,retention_until,email_enabled_snapshot,email_delivery_mode)
    select provider.partner_company_id,user_id,'installation_offer','installation','retail_installation','information',false,'Новый заказ на монтаж','Доступно новое предложение по монтажу CCTV в регионе '||requirement.locality_snapshot||'.','Открыть предложения','/cabinet/installation-orders','installation_assignment_attempt',attempt.id,attempt.offered_at,encode(extensions.digest('installation-offer-recipient|'||attempt.id::text||'|'||user_id::text,'sha256'),'hex'),source_id,attempt.deadline_at,attempt.offered_at+interval '13 months',false,'off' from recipients
    on conflict(recipient_user_id,deduplication_key) do nothing returning id
  ) select count(*) into created_count from inserted;
  return created_count;
end; $$;

create or replace function public.dispatch_installation_requirement(p_requirement_id uuid,p_source text default 'automatic',p_provider_id uuid default null,p_correlation_id uuid default gen_random_uuid()) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$
declare requirement public.installation_requirements; selected_provider public.installation_providers; eligibility jsonb; attempt_id uuid; attempt_ordinal integer; attempt_source text; sla integer; partner_candidate uuid; internal_candidate uuid; notification_event_id uuid;
begin
  if current_user not in ('service_role','postgres') and not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if p_source not in ('automatic','reassignment','manual_internal') then raise exception 'Invalid dispatch source.' using errcode='22023'; end if;
  select * into requirement from public.installation_requirements where id=p_requirement_id for update;
  if not found then raise exception 'Requirement not found.' using errcode='P0002'; end if;
  if requirement.status='assigned' then return jsonb_build_object('requirementId',requirement.id,'status','assigned','repeated',true); end if;
  if exists(select 1 from public.installation_assignment_attempts where requirement_id=requirement.id and status='offered') then
    return jsonb_build_object('requirementId',requirement.id,'status','offered','attemptId',requirement.current_attempt_id,'repeated',true);
  end if;

  if p_provider_id is not null then
    eligibility:=public.installation_provider_eligibility(requirement.id,p_provider_id);
    if not coalesce((eligibility->>'eligible')::boolean,false) then raise exception 'Selected provider is not eligible.' using errcode='P0002'; end if;
    select * into selected_provider from public.installation_providers where id=p_provider_id;
    attempt_source:=p_source;
  elsif requirement.selection_mode='customer_selected' and requirement.preferred_provider_id is not null
    and not exists(select 1 from public.installation_assignment_attempts where requirement_id=requirement.id) then
    eligibility:=public.installation_provider_eligibility(requirement.id,requirement.preferred_provider_id);
    if coalesce((eligibility->>'eligible')::boolean,false) then
      select * into selected_provider from public.installation_providers where id=requirement.preferred_provider_id;
      attempt_source:='customer_selected';
    else
      insert into public.installation_assignment_events(requirement_id,event_type,actor_user_id,correlation_id,safe_evidence)
      values(requirement.id,'reassignment_pending',auth.uid(),p_correlation_id,jsonb_build_object('reason','preferred_provider_ineligible','eligibility',eligibility));
    end if;
  end if;

  if selected_provider.id is null then
    with candidates as (
      select provider.id,(evidence->>'geographyRank')::integer geography_rank,
        (evidence->>'activeJobs')::numeric/nullif((evidence->>'maxConcurrentJobs')::numeric,0) workload_ratio,
        workload.last_offered_at
      from public.installation_providers provider
      left join public.installation_provider_workloads workload on workload.provider_id=provider.id
      cross join lateral public.installation_provider_eligibility(requirement.id,provider.id) evidence
      where provider.provider_type='partner_company' and (evidence->>'eligible')::boolean
    ) select id into partner_candidate from candidates order by geography_rank,workload_ratio,last_offered_at nulls first,id limit 1;
    if partner_candidate is not null then
      select * into selected_provider from public.installation_providers where id=partner_candidate;
      eligibility:=public.installation_provider_eligibility(requirement.id,partner_candidate);
      attempt_source:=case when p_source='automatic' then 'automatic' else 'reassignment' end;
    end if;
  end if;

  if selected_provider.id is null then
    with candidates as (
      select provider.id,(evidence->>'geographyRank')::integer geography_rank,
        (evidence->>'activeJobs')::numeric/nullif((evidence->>'maxConcurrentJobs')::numeric,0) workload_ratio,
        workload.last_offered_at
      from public.installation_providers provider
      left join public.installation_provider_workloads workload on workload.provider_id=provider.id
      cross join lateral public.installation_provider_eligibility(requirement.id,provider.id) evidence
      where provider.provider_type='internal_team' and (evidence->>'eligible')::boolean
    ) select id into internal_candidate from candidates order by geography_rank,workload_ratio,last_offered_at nulls first,id limit 1;
    if internal_candidate is not null then
      select * into selected_provider from public.installation_providers where id=internal_candidate;
      eligibility:=public.installation_provider_eligibility(requirement.id,internal_candidate);
      attempt_source:='fallback_internal';
    end if;
  end if;

  if selected_provider.id is null then
    update public.installation_requirements set status='assignment_unavailable',current_attempt_id=null,revision=revision+1,updated_at=now() where id=requirement.id;
    insert into public.installation_assignment_events(requirement_id,event_type,actor_user_id,correlation_id,safe_evidence)
    values(requirement.id,'assignment_unavailable',auth.uid(),p_correlation_id,jsonb_build_object('selectionMode',requirement.selection_mode));
    return jsonb_build_object('requirementId',requirement.id,'status','assignment_unavailable','repeated',false);
  end if;

  sla:=(eligibility->>'acceptanceSlaMinutes')::integer;
  select coalesce(max(ordinal),0)+1 into attempt_ordinal from public.installation_assignment_attempts where requirement_id=requirement.id;
  insert into public.installation_assignment_attempts(requirement_id,ordinal,provider_id,source,deadline_at,eligibility_evidence,idempotency_key,correlation_id)
  values(requirement.id,attempt_ordinal,selected_provider.id,attempt_source,now()+make_interval(mins=>sla),eligibility,gen_random_uuid(),p_correlation_id) returning id into attempt_id;
  insert into public.installation_provider_workloads(provider_id,last_offered_at) values(selected_provider.id,now())
  on conflict(provider_id) do update set last_offered_at=excluded.last_offered_at,revision=public.installation_provider_workloads.revision+1,updated_at=now();
  update public.installation_requirements set status='offered',current_attempt_id=attempt_id,revision=revision+1,updated_at=now() where id=requirement.id;
  insert into public.installation_assignment_events(requirement_id,attempt_id,event_type,actor_user_id,correlation_id,safe_evidence)
  values(requirement.id,attempt_id,case when attempt_ordinal>1 then 'assignment_reassigned' else 'assignment_offered' end,auth.uid(),p_correlation_id,jsonb_build_object('providerId',selected_provider.id,'source',attempt_source,'ordinal',attempt_ordinal,'deadlineMinutes',sla));
  if selected_provider.provider_type='internal_team' then
    insert into public.installation_assignment_events(requirement_id,attempt_id,event_type,actor_user_id,correlation_id,safe_evidence)
    values(requirement.id,attempt_id,'internal_team_fallback',auth.uid(),p_correlation_id,jsonb_build_object('providerId',selected_provider.id));
  end if;
  perform public.project_installation_offer_notification(attempt_id);
  return jsonb_build_object('requirementId',requirement.id,'status','offered','attemptId',attempt_id,'providerId',selected_provider.id,'source',attempt_source,'ordinal',attempt_ordinal,'repeated',false);
end; $$;

create or replace function public.activate_installation_requirement_pilot(p_retail_order_id uuid,p_selection_mode text,p_preferred_provider_id uuid,p_region_code text,p_requested_scheduling_context jsonb,p_reason text,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$
declare orders public.retail_orders; region_id uuid; requirement_id uuid; correlation uuid:=p_idempotency_key; existing public.installation_requirements; tariff_version_value integer; target_tariff_set_id uuid; target_tariff_count integer; target_work_lines jsonb; target_subtotal numeric; target_vat_treatment text;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if p_selection_mode not in ('customer_selected','automatic') or (p_selection_mode='customer_selected')<>(p_preferred_provider_id is not null)
    or jsonb_typeof(p_requested_scheduling_context)<>'object' or char_length(btrim(p_reason))<10 then raise exception 'Invalid pilot activation.' using errcode='22023'; end if;
  select * into orders from public.retail_orders where id=p_retail_order_id for update;
  if not found or orders.installation_address_snapshot is null then raise exception 'Retail installation snapshot is unavailable.' using errcode='P0002'; end if;
  select * into existing from public.installation_requirements where retail_order_id=orders.id;
  if found then return jsonb_build_object('requirementId',existing.id,'status',existing.status,'repeated',true); end if;
  select id into region_id from public.installation_service_regions where code=p_region_code and active;
  if region_id is null then raise exception 'Service region unavailable.' using errcode='P0002'; end if;
  target_tariff_set_id:=orders.installation_tariff_set_id; target_tariff_count:=case when target_tariff_set_id is null then 0 else 1 end; target_work_lines:=orders.installation_work_lines_snapshot; target_subtotal:=orders.installation_subtotal; target_vat_treatment:=orders.vat_presentation;
  if target_tariff_set_id is null or target_subtotal is null or jsonb_array_length(target_work_lines)=0 then
    with bundles as (select installation_price_snapshot snapshot from public.retail_cart_bundles where cart_id=orders.source_cart_id and installation_price_snapshot is not null), rows as (select line from bundles cross join lateral jsonb_array_elements(snapshot->'lines') line), grouped as (
      select line->>'serviceType' service_type,line->>'unitCode' unit_code,sum((line->>'quantity')::numeric) quantity,min((line->>'unitPrice')::numeric) unit_price,sum((line->>'amount')::numeric) amount,count(distinct line->>'unitPrice') price_count from rows group by 1,2
    ) select (select min((snapshot->>'tariffSetId')::uuid) from bundles),(select count(distinct snapshot->>'tariffSetId') from bundles),coalesce(jsonb_agg(jsonb_build_object('serviceType',service_type,'unitCode',unit_code,'quantity',quantity,'unitPrice',unit_price,'amount',amount) order by service_type),'[]'::jsonb),sum(amount)
      into target_tariff_set_id,target_tariff_count,target_work_lines,target_subtotal from grouped where price_count=1;
  end if;
  if target_tariff_count is distinct from 1 or target_tariff_set_id is null or target_subtotal is null or jsonb_array_length(target_work_lines)=0 then raise exception 'Retail installation snapshot is unavailable.' using errcode='P0002'; end if;
  select version,vat_treatment into tariff_version_value,target_vat_treatment from public.installation_tariff_sets where id=target_tariff_set_id;
  insert into public.installation_requirements(retail_order_id,selection_mode,preferred_provider_id,service_region_id,locality_snapshot,exact_address_snapshot,customer_pii_snapshot,work_lines_snapshot,tariff_set_id,tariff_version,customer_installation_charge,currency,vat_treatment,requested_scheduling_context,activation_mode,activation_evidence)
  values(orders.id,p_selection_mode,p_preferred_provider_id,region_id,orders.installation_address_snapshot->>'locality',orders.installation_address_snapshot,orders.customer_snapshot,target_work_lines,target_tariff_set_id,tariff_version_value,target_subtotal,orders.currency,target_vat_treatment,p_requested_scheduling_context,'pilot_simulated',jsonb_build_object('reason',btrim(p_reason),'idempotencyKey',p_idempotency_key,'simulated',true,'actorUserId',auth.uid())) returning id into requirement_id;
  insert into public.installation_requirement_lines(requirement_id,line_number,service_type,unit_code,quantity,customer_unit_price,customer_line_amount)
  select requirement_id,row_number() over(order by line->>'serviceType'),line->>'serviceType',line->>'unitCode',(line->>'quantity')::numeric,(line->>'unitPrice')::numeric,(line->>'amount')::numeric
  from jsonb_array_elements(target_work_lines) line;
  insert into public.installation_assignment_events(requirement_id,event_type,actor_user_id,correlation_id,safe_evidence)
  values(requirement_id,'installation_requirement_activated',auth.uid(),correlation,jsonb_build_object('activationMode','pilot_simulated','tariffSetId',target_tariff_set_id,'tariffVersion',tariff_version_value,'lineCount',jsonb_array_length(target_work_lines))),
    (requirement_id,'provider_preferred',auth.uid(),correlation,jsonb_build_object('selectionMode',p_selection_mode,'preferredProviderId',p_preferred_provider_id));
  return public.dispatch_installation_requirement(requirement_id,'automatic',null,correlation);
end; $$;

create or replace function public.partner_list_installation_assignments(p_company_id uuid,p_view text default 'offers') returns jsonb
language plpgsql stable security definer set search_path=public set row_security=off as $$ begin
  if p_view not in ('offers','active','completed') or not public.has_permission(p_company_id,'installation_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('attemptId',attempt.id,'requirementId',requirement.id,'ordinal',attempt.ordinal,'status',attempt.status,'source',attempt.source,'offeredAt',attempt.offered_at,'deadlineAt',attempt.deadline_at,'locality',requirement.locality_snapshot,'systemType',requirement.system_type,'scope',(select coalesce(jsonb_agg(jsonb_build_object('serviceType',line->>'serviceType','quantity',(line->>'quantity')::numeric,'unitCode',line->>'unitCode') order by line->>'serviceType'),'[]'::jsonb) from jsonb_array_elements(requirement.work_lines_snapshot) line),'customerInstallationCharge',null,'providerPayable',null,'customer',case when attempt.status='accepted' then requirement.customer_pii_snapshot else null end,'exactAddress',case when attempt.status='accepted' then requirement.exact_address_snapshot else null end,'execution',case when execution.id is null then null else jsonb_build_object('id',execution.id,'state',execution.state) end) order by attempt.offered_at desc,attempt.id desc)
    from public.installation_assignment_attempts attempt
    join public.installation_requirements requirement on requirement.id=attempt.requirement_id
    join public.installation_providers provider on provider.id=attempt.provider_id and provider.partner_company_id=p_company_id
    left join public.installation_executions execution on execution.accepted_attempt_id=attempt.id
    where (p_view='offers' and attempt.status='offered') or (p_view='active' and attempt.status='accepted' and execution.state in ('scheduling','scheduled','in_progress')) or (p_view='completed' and attempt.status='accepted' and execution.state in ('completed','cancelled'))),'[]'::jsonb);
end; $$;

create or replace function public.partner_respond_installation_assignment(p_company_id uuid,p_attempt_id uuid,p_decision text,p_reason_code text,p_reason_text text,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$
declare attempt public.installation_assignment_attempts; requirement public.installation_requirements; provider public.installation_providers; eligibility jsonb; execution_id uuid; correlation uuid; dispatch_result jsonb;
begin
  if p_decision not in ('accept','decline') or not public.has_permission(p_company_id,'installation_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
  select * into attempt from public.installation_assignment_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Offer not found.' using errcode='P0002'; end if;
  select * into requirement from public.installation_requirements where id=attempt.requirement_id for update;
  select * into provider from public.installation_providers where id=attempt.provider_id;
  if provider.partner_company_id is distinct from p_company_id then raise exception 'Forbidden.' using errcode='42501'; end if;
  if attempt.status<>'offered' then
    if attempt.response_idempotency_key=p_idempotency_key and ((p_decision='accept' and attempt.status='accepted') or (p_decision='decline' and attempt.status='declined')) then return jsonb_build_object('attemptId',attempt.id,'status',attempt.status,'repeated',true); end if;
    raise exception 'Offer is no longer available.' using errcode='40001';
  end if;
  if requirement.current_attempt_id is distinct from attempt.id then raise exception 'Offer is no longer current.' using errcode='40001'; end if;
  if attempt.deadline_at<=now() then raise exception 'Offer deadline passed.' using errcode='40001'; end if;
  correlation:=attempt.correlation_id;
  if p_decision='accept' then
    eligibility:=public.installation_provider_eligibility(requirement.id,provider.id);
    if not coalesce((eligibility->>'eligible')::boolean,false) then raise exception 'Provider is no longer eligible.' using errcode='P0002'; end if;
    update public.installation_assignment_attempts set status='accepted',accepted_at=now(),response_idempotency_key=p_idempotency_key where id=attempt.id;
    insert into public.installation_executions(requirement_id,accepted_attempt_id,provider_id) values(requirement.id,attempt.id,provider.id) returning id into execution_id;
    insert into public.installation_provider_workloads(provider_id,active_jobs) values(provider.id,1) on conflict(provider_id) do update set active_jobs=public.installation_provider_workloads.active_jobs+1,revision=public.installation_provider_workloads.revision+1,updated_at=now();
    update public.installation_requirements set status='assigned',accepted_provider_id=provider.id,assigned_at=now(),revision=revision+1,updated_at=now() where id=requirement.id;
    insert into public.installation_assignment_events(requirement_id,attempt_id,execution_id,event_type,actor_user_id,correlation_id,safe_evidence) values
      (requirement.id,attempt.id,execution_id,'assignment_accepted',auth.uid(),correlation,jsonb_build_object('providerId',provider.id)),
      (requirement.id,attempt.id,execution_id,'execution_created',auth.uid(),correlation,jsonb_build_object('state','scheduling'));
    return jsonb_build_object('attemptId',attempt.id,'requirementId',requirement.id,'status','accepted','executionId',execution_id,'repeated',false);
  end if;
  if p_reason_code is not null and p_reason_code not in ('no_capacity','schedule_conflict','region_issue','technical_scope','other') then raise exception 'Invalid decline reason.' using errcode='22023'; end if;
  update public.installation_assignment_attempts set status='declined',declined_at=now(),decline_reason_code=p_reason_code,decline_reason_text=nullif(left(btrim(coalesce(p_reason_text,'')),300),''),response_idempotency_key=p_idempotency_key where id=attempt.id;
  update public.installation_requirements set status='reassignment_pending',current_attempt_id=null,revision=revision+1,updated_at=now() where id=requirement.id;
  insert into public.installation_assignment_events(requirement_id,attempt_id,event_type,actor_user_id,correlation_id,safe_evidence) values
    (requirement.id,attempt.id,'assignment_declined',auth.uid(),correlation,jsonb_build_object('reasonCode',p_reason_code)),
    (requirement.id,attempt.id,'reassignment_pending',auth.uid(),correlation,jsonb_build_object('trigger','decline'));
  dispatch_result:=public.dispatch_installation_requirement(requirement.id,'reassignment',null,correlation);
  return jsonb_build_object('attemptId',attempt.id,'requirementId',requirement.id,'status','declined','next',dispatch_result,'repeated',false);
end; $$;

create or replace function public.run_installation_assignment_worker(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$
declare run_id uuid; item record; claimed integer:=0; timed_out integer:=0; dispatched integer:=0; unavailable integer:=0; result jsonb;
begin
  if current_user not in ('service_role','postgres') then raise exception 'Forbidden.' using errcode='42501'; end if;
  if not pg_try_advisory_xact_lock(hashtext('installation-assignment-worker')) then return jsonb_build_object('status','locked','claimed',0); end if;
  insert into public.installation_assignment_worker_runs(status) values('running') returning id into run_id;
  for item in select attempt.id,attempt.requirement_id,attempt.correlation_id from public.installation_assignment_attempts attempt where attempt.status='offered' and attempt.deadline_at<=now() order by attempt.deadline_at,attempt.id limit least(greatest(p_limit,1),100) for update skip locked loop
    claimed:=claimed+1;
    update public.installation_assignment_attempts set status='timed_out',timed_out_at=now() where id=item.id and status='offered';
    if found then
      timed_out:=timed_out+1;
      update public.installation_requirements set status='reassignment_pending',current_attempt_id=null,revision=revision+1,updated_at=now() where id=item.requirement_id and current_attempt_id=item.id;
      insert into public.installation_assignment_events(requirement_id,attempt_id,event_type,correlation_id,safe_evidence) values
       (item.requirement_id,item.id,'assignment_timed_out',item.correlation_id,jsonb_build_object('workerRunId',run_id)),
       (item.requirement_id,item.id,'reassignment_pending',item.correlation_id,jsonb_build_object('trigger','timeout','workerRunId',run_id));
      result:=public.dispatch_installation_requirement(item.requirement_id,'reassignment',null,item.correlation_id);
      if result->>'status'='offered' then dispatched:=dispatched+1; elsif result->>'status'='assignment_unavailable' then unavailable:=unavailable+1; end if;
    end if;
  end loop;
  update public.installation_assignment_worker_runs set status='succeeded',claimed_count=claimed,timed_out_count=timed_out,dispatched_count=dispatched,unavailable_count=unavailable,finished_at=now() where id=run_id;
  return jsonb_build_object('runId',run_id,'status','succeeded','claimed',claimed,'timedOut',timed_out,'dispatched',dispatched,'unavailable',unavailable);
exception when others then
  if run_id is not null then update public.installation_assignment_worker_runs set status='failed',safe_error_code=sqlstate,finished_at=now() where id=run_id; end if;
  raise;
end; $$;

create or replace function public.admin_get_installation_assignments(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path=public set row_security=off as $$ begin
 if not public.has_internal_permission('admin.retail_marketplace.view') then raise exception 'Forbidden.' using errcode='42501'; end if;
 return jsonb_build_object('requirements',coalesce((select jsonb_agg(jsonb_build_object('id',requirement.id,'orderNumber',orders.public_number,'status',requirement.status,'selectionMode',requirement.selection_mode,'locality',requirement.locality_snapshot,'customerInstallationCharge',requirement.customer_installation_charge,'currency',requirement.currency,'revision',requirement.revision,'currentAttemptId',requirement.current_attempt_id,'acceptedProviderId',requirement.accepted_provider_id,'activatedAt',requirement.activated_at,'attempts',coalesce((select jsonb_agg(jsonb_build_object('id',attempt.id,'ordinal',attempt.ordinal,'providerId',attempt.provider_id,'source',attempt.source,'status',attempt.status,'offeredAt',attempt.offered_at,'deadlineAt',attempt.deadline_at,'declineReasonCode',attempt.decline_reason_code) order by attempt.ordinal) from public.installation_assignment_attempts attempt where attempt.requirement_id=requirement.id),'[]'::jsonb)) order by requirement.activated_at desc,requirement.id desc) from (select * from public.installation_requirements order by activated_at desc,id desc limit least(greatest(p_limit,1),200)) requirement join public.retail_orders orders on orders.id=requirement.retail_order_id),'[]'::jsonb));
end; $$;

create or replace function public.admin_reassign_installation_requirement(p_requirement_id uuid,p_provider_id uuid,p_expected_revision bigint,p_reason text) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$
declare requirement public.installation_requirements; attempt public.installation_assignment_attempts; correlation uuid:=gen_random_uuid(); result jsonb;
begin
 if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'Forbidden.' using errcode='42501'; end if;
 if char_length(btrim(p_reason))<10 then raise exception 'Reason required.' using errcode='22023'; end if;
 select * into requirement from public.installation_requirements where id=p_requirement_id for update;
 if not found or requirement.revision<>p_expected_revision or requirement.status='assigned' then raise exception 'Requirement revision conflict.' using errcode='40001'; end if;
 select * into attempt from public.installation_assignment_attempts where requirement_id=requirement.id and status='offered' for update;
 if found then
   update public.installation_assignment_attempts set status='withdrawn',withdrawn_at=now() where id=attempt.id;
 end if;
 update public.installation_requirements set status='reassignment_pending',current_attempt_id=null,revision=revision+1,updated_at=now() where id=requirement.id;
 insert into public.installation_assignment_events(requirement_id,attempt_id,event_type,actor_user_id,correlation_id,safe_evidence)
 values(requirement.id,attempt.id,'manual_reassignment_requested',auth.uid(),correlation,jsonb_build_object('reason',btrim(p_reason),'providerId',p_provider_id));
 result:=public.dispatch_installation_requirement(requirement.id,'manual_internal',p_provider_id,correlation);
 return result;
end; $$;

create or replace function public.get_public_retail_installation_status(p_access_token_hash text,p_locale text default 'ru') returns jsonb
language sql stable security definer set search_path=public set row_security=off as $$
 select case when requirement.id is null then null else jsonb_build_object('status',case when requirement.status='assigned' then 'assigned' else 'selecting_team' end,'label',case when requirement.status='assigned' then case when p_locale='ro' then 'Echipa de instalare a fost desemnată' else 'Монтажная команда назначена' end else case when p_locale='ro' then 'Selectăm echipa de instalare' else 'Подбираем монтажную команду' end end) end
 from public.retail_order_access_tokens token join public.retail_orders orders on orders.id=token.order_id
 left join public.installation_requirements requirement on requirement.retail_order_id=orders.id
 where token.token_hash=p_access_token_hash and token.revoked_at is null and token.expires_at>now() and p_locale in ('ru','ro');
$$;

alter table public.installation_requirements enable row level security;
alter table public.installation_requirement_lines enable row level security;
alter table public.installation_assignment_attempts enable row level security;
alter table public.installation_executions enable row level security;
alter table public.installation_provider_workloads enable row level security;
alter table public.installation_assignment_events enable row level security;
alter table public.installation_assignment_worker_runs enable row level security;
revoke all on public.installation_requirements,public.installation_requirement_lines,public.installation_assignment_attempts,public.installation_executions,public.installation_provider_workloads,public.installation_assignment_events,public.installation_assignment_worker_runs from public,anon,authenticated;
grant all on public.installation_requirements,public.installation_requirement_lines,public.installation_assignment_attempts,public.installation_executions,public.installation_provider_workloads,public.installation_assignment_events,public.installation_assignment_worker_runs to service_role;

revoke all on function public.prevent_installation_assignment_history_mutation(),public.protect_installation_assignment_attempt(),public.capture_retail_installation_snapshot(),public.installation_provider_eligibility(uuid,uuid),public.project_installation_offer_notification(uuid),public.dispatch_installation_requirement(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.activate_installation_requirement_pilot(uuid,text,uuid,text,jsonb,text,uuid),public.partner_list_installation_assignments(uuid,text),public.partner_respond_installation_assignment(uuid,uuid,text,text,text,uuid),public.run_installation_assignment_worker(integer),public.admin_get_installation_assignments(integer),public.admin_reassign_installation_requirement(uuid,uuid,bigint,text),public.get_public_retail_installation_status(text,text) from public,anon,authenticated;
grant execute on function public.activate_installation_requirement_pilot(uuid,text,uuid,text,jsonb,text,uuid),public.admin_get_installation_assignments(integer),public.admin_reassign_installation_requirement(uuid,uuid,bigint,text) to authenticated,service_role;
grant execute on function public.partner_list_installation_assignments(uuid,text),public.partner_respond_installation_assignment(uuid,uuid,text,text,text,uuid) to authenticated,service_role;
grant execute on function public.run_installation_assignment_worker(integer),public.dispatch_installation_requirement(uuid,text,uuid,uuid) to service_role;
grant execute on function public.get_public_retail_installation_status(text,text) to anon,service_role;

revoke all on function public.prevent_installation_assignment_history_mutation(),public.protect_installation_assignment_attempt(),public.capture_retail_installation_snapshot() from service_role;
