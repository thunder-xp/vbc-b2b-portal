begin;

create table public.one_c_service_history_sync_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('initial','incremental','historical_reconciliation')),
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  current_stage text not null default 'documents' check (current_stage in ('documents','completed')),
  range_start date not null,
  range_end date not null,
  current_skip integer not null default 0 check (current_skip >= 0),
  page_size integer not null default 100 check (page_size between 1 and 100),
  pages_fetched integer not null default 0,
  rows_received integer not null default 0,
  rows_published integer not null default 0,
  mapped_companies integer not null default 0,
  unmapped_companies integer not null default 0,
  mapped_products integer not null default 0,
  unmapped_products integer not null default 0,
  serial_linked integer not null default 0,
  serial_unlinked integer not null default 0,
  conflicts integer not null default 0,
  lock_token uuid null,
  locked_until timestamptz null,
  safe_error_code text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  updated_at timestamptz not null default now()
);

create unique index one_c_service_history_one_running_idx
  on public.one_c_service_history_sync_runs ((true)) where status = 'running';
create index one_c_service_history_runs_started_idx
  on public.one_c_service_history_sync_runs (started_at desc);

create table public.one_c_service_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null references public.partner_companies(id) on delete restrict,
  source_document_ref text not null unique check (source_document_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and source_document_ref <> '00000000-0000-0000-0000-000000000000'),
  source_document_number text not null,
  source_document_date timestamptz not null,
  source_posted boolean not null,
  source_deletion_mark boolean not null,
  source_data_version text null,
  source_status_ref text null check (source_status_ref is null or (source_status_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and source_status_ref <> '00000000-0000-0000-0000-000000000000')),
  source_status text null,
  normalized_status text not null check (normalized_status in ('accepted','diagnostics','repair_in_progress','waiting','ready_for_pickup','issued_to_customer','closed','rejected','unknown')),
  one_c_counterparty_ref text not null check (one_c_counterparty_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
  product_id uuid null references public.catalog_products(id) on delete restrict,
  one_c_product_ref text null check (one_c_product_ref is null or (one_c_product_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and one_c_product_ref <> '00000000-0000-0000-0000-000000000000')),
  characteristic_ref text null check (characteristic_ref is null or (characteristic_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and characteristic_ref <> '00000000-0000-0000-0000-000000000000')),
  one_c_serial_ref text null check (one_c_serial_ref is null or (one_c_serial_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and one_c_serial_ref <> '00000000-0000-0000-0000-000000000000')),
  product_sku_snapshot text null,
  product_name_snapshot text null,
  serial_hash text null check (serial_hash is null or serial_hash ~ '^[0-9a-f]{64}$'),
  protected_serial text null,
  masked_serial text null,
  contract_ref text null check (contract_ref is null or (contract_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and contract_ref <> '00000000-0000-0000-0000-000000000000')),
  contract_snapshot text null,
  service_center_ref text null check (service_center_ref is null or (service_center_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and service_center_ref <> '00000000-0000-0000-0000-000000000000')),
  service_center_snapshot text null,
  reported_fault text null,
  source_repair_description text null,
  partner_visible_resolution text null,
  warranty_state_snapshot text null,
  warranty_start_date date null,
  warranty_end_date date null,
  source_sale_reference text null check (source_sale_reference is null or (source_sale_reference ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and source_sale_reference <> '00000000-0000-0000-0000-000000000000')),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  source_updated_at timestamptz not null,
  partner_visible boolean not null default false,
  is_active boolean not null default false,
  first_seen_run_id uuid not null references public.one_c_service_history_sync_runs(id) on delete restrict,
  last_seen_run_id uuid not null references public.one_c_service_history_sync_runs(id) on delete restrict,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index one_c_service_history_company_date_idx
  on public.one_c_service_history (company_id, source_document_date desc, id desc)
  where partner_visible and is_active;
create index one_c_service_history_status_idx
  on public.one_c_service_history (normalized_status, source_document_date desc)
  where partner_visible and is_active;
create index one_c_service_history_product_idx
  on public.one_c_service_history (product_id, source_document_date desc)
  where product_id is not null;
create index one_c_service_history_serial_idx
  on public.one_c_service_history (serial_hash) where serial_hash is not null;
create index one_c_service_history_counterparty_idx
  on public.one_c_service_history (lower(one_c_counterparty_ref));

create table public.one_c_service_history_events (
  id uuid primary key default gen_random_uuid(),
  service_history_id uuid not null references public.one_c_service_history(id) on delete restrict,
  event_type text not null check (event_type in ('imported','status_changed','made_inactive','redetected')),
  source_status text null,
  normalized_status text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  baseline boolean not null default false,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (service_history_id, event_type, source_fingerprint)
);
create index one_c_service_history_events_timeline_idx
  on public.one_c_service_history_events (service_history_id, occurred_at, id);

create table public.one_c_service_history_conflicts (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.one_c_service_history_sync_runs(id) on delete restrict,
  source_document_ref text not null,
  conflict_code text not null,
  safe_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_evidence) = 'object'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (source_document_ref, conflict_code, source_fingerprint)
);

create or replace function public.prevent_one_c_service_history_event_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin raise exception '1C service history events are append-only.' using errcode = '42501'; end $$;
create trigger one_c_service_history_events_immutable
before update or delete on public.one_c_service_history_events
for each row execute function public.prevent_one_c_service_history_event_mutation();

alter table public.one_c_service_history_sync_runs enable row level security;
alter table public.one_c_service_history enable row level security;
alter table public.one_c_service_history_events enable row level security;
alter table public.one_c_service_history_conflicts enable row level security;
revoke all on public.one_c_service_history_sync_runs, public.one_c_service_history,
  public.one_c_service_history_events, public.one_c_service_history_conflicts
  from public, anon, authenticated;
grant all on public.one_c_service_history_sync_runs, public.one_c_service_history,
  public.one_c_service_history_events, public.one_c_service_history_conflicts to service_role;

alter table public.partner_notification_events drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events add constraint partner_notification_events_code_check check(event_code in (
 'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected','service_history_accepted','service_history_ready_for_pickup','service_history_issued'
));
alter table public.partner_notifications drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications add constraint partner_notifications_event_code_check check(event_code in (
 'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon','new_invoice_available','reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received','service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting','service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted','support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected','service_history_accepted','service_history_ready_for_pickup','service_history_issued'
));

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean language sql immutable set search_path=public as $$
 select value='/cabinet'
  or value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
  or value ~ '^/cabinet/service/[0-9a-f-]{36}$'
  or value ~ '^/cabinet/service/history/[0-9a-f-]{36}$'
  or value ~ '^/cabinet/support/[0-9a-f-]{36}$'
  or value='/cabinet/reservation-requests' or value='/cabinet/company/users'
  or value ~ '^/cabinet/catalog/[a-z0-9-]+$' or value='/cabinet/cart'
  or value='/cabinet/offers' or value ~ '^/cabinet/offers/[0-9a-f-]{36}$'
  or value='/cabinet/documents' or value ~ '^/cabinet/documents/[0-9a-f-]{36}$'
$$;

create or replace function public.project_one_c_service_history_notification(p_event_id uuid)
returns integer language plpgsql security definer set search_path=public set row_security=off as $$
declare e public.one_c_service_history_events; h public.one_c_service_history; source_id uuid;
  code text; title_value text; message_value text; created_count integer:=0;
begin
 select * into e from public.one_c_service_history_events where id=p_event_id;
 if not found or e.baseline or e.event_type<>'status_changed' then return 0; end if;
 select * into h from public.one_c_service_history where id=e.service_history_id;
 if not found or h.company_id is null or not h.partner_visible then return 0; end if;
 code:=case e.normalized_status when 'accepted' then 'service_history_accepted'
  when 'ready_for_pickup' then 'service_history_ready_for_pickup'
  when 'issued_to_customer' then 'service_history_issued' end;
 if code is null then return 0; end if;
 title_value:=case code when 'service_history_ready_for_pickup' then 'Оборудование готово к выдаче'
  when 'service_history_issued' then 'Оборудование выдано' else 'Оборудование принято в сервис' end;
 message_value:=case code when 'service_history_ready_for_pickup' then 'Оборудование по сервисному документу '||h.source_document_number||' готово к выдаче.'
  when 'service_history_issued' then 'Оборудование по сервисному документу '||h.source_document_number||' выдано.'
  else 'Оборудование по сервисному документу '||h.source_document_number||' принято в сервисный центр.' end;
 insert into public.partner_notification_events(company_id,event_code,event_group,domain,entity_type,entity_id,source_table,source_event_id,source_version,occurred_at,safe_payload,fingerprint)
 values(h.company_id,code,'service','service','one_c_service_history',h.id,'one_c_service_history_events',e.id,e.source_fingerprint,e.occurred_at,
  jsonb_build_object('serviceNumber',h.source_document_number),encode(extensions.digest('one-c-service|'||e.id::text||'|'||code,'sha256'),'hex'))
 on conflict(fingerprint) do update set fingerprint=excluded.fingerprint returning id into source_id;
 with recipients as (
  select distinct membership.user_id from public.company_memberships membership
  join public.user_profiles profile on profile.id=membership.user_id and profile.status='active'
  where membership.company_id=h.company_id and membership.status='active'
   and public.notification_user_has_permission(membership.user_id,h.company_id,'service.view')
 ), inserted as (
  insert into public.partner_notifications(company_id,recipient_user_id,event_code,event_group,domain,severity,mandatory,title,message,action_label,action_url,entity_type,entity_id,occurred_at,deduplication_key,source_event_id,expires_at,retention_until,email_enabled_snapshot,email_delivery_mode)
  select h.company_id,user_id,code,'service','service',case when code='service_history_ready_for_pickup' then 'success' else 'information' end,false,
   title_value,message_value,'Открыть','/cabinet/service/history/'||h.id,'one_c_service_history',h.id,e.occurred_at,
   encode(extensions.digest('one-c-service-recipient|'||e.id::text||'|'||code||'|'||user_id::text,'sha256'),'hex'),source_id,
   e.occurred_at+interval '90 days',e.occurred_at+interval '13 months',false,'off' from recipients
  on conflict(recipient_user_id,deduplication_key) do nothing returning id
 ) select count(*) into created_count from inserted;
 return created_count;
end $$;

create or replace function public.claim_one_c_service_history_sync(p_page_size integer default 100)
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare target public.one_c_service_history_sync_runs; token uuid := gen_random_uuid(); run_mode text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service-role access required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('one_c_service_history_sync'));
  update public.one_c_service_history_sync_runs set status = 'failed', safe_error_code = 'stale_lock',
    finished_at = now(), updated_at = now()
  where status = 'running' and locked_until < now() - interval '2 minutes';
  select * into target from public.one_c_service_history_sync_runs where status = 'running' limit 1 for update;
  if found and target.locked_until > now() then return null; end if;
  if not found then
    if exists(select 1 from public.one_c_service_history_sync_runs where status='succeeded' and finished_at > now()-interval '55 minutes') then return null; end if;
    run_mode := case
      when not exists(select 1 from public.one_c_service_history_sync_runs where status='succeeded') then 'initial'
      when not exists(select 1 from public.one_c_service_history_sync_runs where status='succeeded' and mode='historical_reconciliation' and finished_at > now()-interval '6 days') then 'historical_reconciliation'
      else 'incremental' end;
    insert into public.one_c_service_history_sync_runs(mode,range_start,range_end,page_size)
    values(run_mode, case when run_mode in ('initial','historical_reconciliation') then current_date-interval '60 months' else current_date-interval '120 days' end,
      current_date, least(greatest(p_page_size,1),100)) returning * into target;
  end if;
  update public.one_c_service_history_sync_runs set lock_token=token,locked_until=now()+interval '4 minutes',updated_at=now()
  where id=target.id returning * into target;
  return jsonb_build_object('runId',target.id,'lockToken',token,'mode',target.mode,'skip',target.current_skip,
    'pageSize',target.page_size,'rangeStart',target.range_start,'rangeEnd',target.range_end,
    'baseline',target.mode='initial');
end $$;

create or replace function public.publish_one_c_service_history_page(
  p_run_id uuid, p_lock_token uuid, p_skip integer, p_rows jsonb, p_page_complete boolean
) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare run public.one_c_service_history_sync_runs; published_count integer := 0; mapped_company_count integer := 0;
  mapped_product_count integer := 0; serial_count integer := 0; conflict_count integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Service-role access required.' using errcode = '42501'; end if;
  select * into run from public.one_c_service_history_sync_runs where id=p_run_id for update;
  if not found or run.status <> 'running' or run.lock_token is distinct from p_lock_token or run.current_skip <> p_skip then
    raise exception 'Invalid service-history sync lease.' using errcode = '40001';
  end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then raise exception 'Invalid service-history page.' using errcode='22023'; end if;

  create temporary table service_source on commit drop as
  select * from jsonb_to_recordset(p_rows) as row(
    source_document_ref text, source_document_number text, source_document_date timestamptz,
    source_posted boolean, source_deletion_mark boolean, source_data_version text,
    source_status_ref text, source_status text, normalized_status text,
    counterparty_ref text, product_ref text, characteristic_ref text, serial_ref text,
    contract_ref text, service_center_ref text, reported_fault text,
    source_repair_description text, source_sale_reference text, source_fingerprint text
  );
  if exists(select 1 from service_source where source_document_ref !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or counterparty_ref !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or normalized_status not in ('accepted','diagnostics','repair_in_progress','waiting','ready_for_pickup','issued_to_customer','closed','rejected','unknown')
    or source_fingerprint !~ '^[0-9a-f]{64}$') then raise exception 'Invalid service-history source row.' using errcode='22023'; end if;

  create temporary table service_mapped on commit drop as
  select source.*, company.id company_id, product.id product_id, product.sku, product.name,
    case when warranty_matches.hash_count=1 then warranty_matches.serial_hash end serial_hash,
    case when warranty_matches.hash_count=1 then warranty_matches.protected_serial end protected_serial,
    case when warranty_matches.hash_count=1 then warranty_matches.masked_serial end masked_serial,
    case when warranty_matches.hash_count=1 then warranty_state.warranty_state end warranty_state,
    case when warranty_matches.hash_count=1 then warranty_state.warranty_start_date end warranty_start_date,
    case when warranty_matches.hash_count=1 then warranty_state.warranty_end_date end warranty_end_date
  from service_source source
  left join public.partner_companies company on lower(company.external_1c_id)=lower(source.counterparty_ref)
  left join public.catalog_products product on lower(product.external_1c_id)=lower(source.product_ref)
  left join lateral (
    select count(distinct event.normalized_serial_hash)::integer hash_count,
      min(event.normalized_serial_hash) serial_hash, min(event.protected_serial_value) protected_serial,
      min(event.masked_serial) masked_serial
    from public.warranty_serial_events event
    where source.source_sale_reference is not null
      and lower(event.source_document_ref)=lower(source.source_sale_reference)
      and lower(event.one_c_product_ref)=lower(source.product_ref)
      and event.event_type='sale_observed'
  ) warranty_matches on true
  left join public.warranty_serial_state warranty_state on warranty_state.normalized_serial_hash=warranty_matches.serial_hash
    and warranty_state.last_sale_company_id=company.id;

  create temporary table service_previous on commit drop as
  select history.id, history.source_document_ref, history.source_fingerprint, history.normalized_status,
    history.source_posted, history.source_deletion_mark
  from public.one_c_service_history history join service_mapped source using(source_document_ref);

  insert into public.one_c_service_history(
    company_id,source_document_ref,source_document_number,source_document_date,source_posted,source_deletion_mark,
    source_data_version,source_status_ref,source_status,normalized_status,one_c_counterparty_ref,
    product_id,one_c_product_ref,characteristic_ref,one_c_serial_ref,product_sku_snapshot,product_name_snapshot,
    serial_hash,protected_serial,masked_serial,contract_ref,service_center_ref,reported_fault,
    source_repair_description,warranty_state_snapshot,warranty_start_date,warranty_end_date,source_sale_reference,
    source_fingerprint,source_updated_at,partner_visible,is_active,first_seen_run_id,last_seen_run_id,published_at)
  select company_id,lower(source_document_ref),source_document_number,source_document_date,source_posted,source_deletion_mark,
    source_data_version,source_status_ref,source_status,normalized_status,lower(counterparty_ref),
    product_id,product_ref,characteristic_ref,serial_ref,sku,name,serial_hash,protected_serial,masked_serial,
    contract_ref,service_center_ref,nullif(reported_fault,''),nullif(source_repair_description,''),warranty_state,
    warranty_start_date,warranty_end_date,source_sale_reference,source_fingerprint,now(),
    company_id is not null and source_posted and not source_deletion_mark,
    company_id is not null and source_posted and not source_deletion_mark,p_run_id,p_run_id,
    case when company_id is not null and source_posted and not source_deletion_mark then now() end
  from service_mapped
  on conflict(source_document_ref) do update set
    company_id=excluded.company_id,source_document_number=excluded.source_document_number,
    source_document_date=excluded.source_document_date,source_posted=excluded.source_posted,
    source_deletion_mark=excluded.source_deletion_mark,source_data_version=excluded.source_data_version,
    source_status_ref=excluded.source_status_ref,source_status=excluded.source_status,
    normalized_status=excluded.normalized_status,one_c_counterparty_ref=excluded.one_c_counterparty_ref,
    product_id=excluded.product_id,one_c_product_ref=excluded.one_c_product_ref,
    characteristic_ref=excluded.characteristic_ref,one_c_serial_ref=excluded.one_c_serial_ref,
    product_sku_snapshot=coalesce(excluded.product_sku_snapshot,one_c_service_history.product_sku_snapshot),
    product_name_snapshot=coalesce(excluded.product_name_snapshot,one_c_service_history.product_name_snapshot),
    serial_hash=coalesce(excluded.serial_hash,one_c_service_history.serial_hash),
    protected_serial=coalesce(excluded.protected_serial,one_c_service_history.protected_serial),
    masked_serial=coalesce(excluded.masked_serial,one_c_service_history.masked_serial),
    contract_ref=excluded.contract_ref,service_center_ref=excluded.service_center_ref,
    reported_fault=excluded.reported_fault,source_repair_description=excluded.source_repair_description,
    warranty_state_snapshot=coalesce(excluded.warranty_state_snapshot,one_c_service_history.warranty_state_snapshot),
    warranty_start_date=coalesce(excluded.warranty_start_date,one_c_service_history.warranty_start_date),
    warranty_end_date=coalesce(excluded.warranty_end_date,one_c_service_history.warranty_end_date),
    source_sale_reference=excluded.source_sale_reference,source_fingerprint=excluded.source_fingerprint,
    source_updated_at=now(),partner_visible=excluded.partner_visible,is_active=excluded.is_active,
    last_seen_run_id=p_run_id,published_at=case when excluded.partner_visible then coalesce(one_c_service_history.published_at,now()) else one_c_service_history.published_at end,
    updated_at=now();
  get diagnostics published_count = row_count;

  insert into public.one_c_service_history_events(service_history_id,event_type,source_status,normalized_status,source_fingerprint,baseline,occurred_at)
  select history.id,
    case when previous.id is null then 'imported'
      when (not source.source_posted or source.source_deletion_mark) and (previous.source_posted and not previous.source_deletion_mark) then 'made_inactive'
      when previous.normalized_status is distinct from source.normalized_status then 'status_changed'
      else 'redetected' end,
    source.source_status,source.normalized_status,source.source_fingerprint,run.mode='initial',now()
  from service_mapped source
  join public.one_c_service_history history using(source_document_ref)
  left join service_previous previous using(source_document_ref)
  on conflict do nothing;

  perform public.project_one_c_service_history_notification(event.id)
  from public.one_c_service_history_events event
  join public.one_c_service_history history on history.id=event.service_history_id
  where history.last_seen_run_id=p_run_id and event.event_type='status_changed' and not event.baseline;

  insert into public.one_c_service_history_conflicts(sync_run_id,source_document_ref,conflict_code,safe_evidence,source_fingerprint)
  select p_run_id,source_document_ref,'serial_sale_relation_ambiguous',jsonb_build_object('sourceDocumentNumber',source_document_number),source_fingerprint
  from service_mapped where source_sale_reference is not null and serial_hash is null
  on conflict do nothing;
  get diagnostics conflict_count = row_count;
  select count(*) filter(where company_id is not null),count(*) filter(where product_id is not null),count(*) filter(where serial_hash is not null)
    into mapped_company_count,mapped_product_count,serial_count from service_mapped;

  update public.one_c_service_history_sync_runs set
    current_skip=case when p_page_complete then current_skip else current_skip+page_size end,
    current_stage=case when p_page_complete then 'completed' else 'documents' end,
    pages_fetched=pages_fetched+1,rows_received=rows_received+(select count(*) from service_source),
    rows_published=rows_published+published_count,mapped_companies=mapped_companies+mapped_company_count,
    unmapped_companies=unmapped_companies+(select count(*) from service_mapped where company_id is null),
    mapped_products=mapped_products+mapped_product_count,
    unmapped_products=unmapped_products+(select count(*) from service_mapped where product_id is null),
    serial_linked=serial_linked+serial_count,serial_unlinked=serial_unlinked+(select count(*) from service_mapped where serial_hash is null),
    conflicts=conflicts+conflict_count,lock_token=null,locked_until=null,updated_at=now()
  where id=p_run_id;
  if p_page_complete then
    update public.one_c_service_history_sync_runs set status='succeeded',finished_at=now(),updated_at=now() where id=p_run_id;
  end if;
  return jsonb_build_object('published',published_count,'mappedCompanies',mapped_company_count,
    'mappedProducts',mapped_product_count,'serialLinked',serial_count,'conflicts',conflict_count,'completed',p_page_complete);
end $$;

create or replace function public.fail_one_c_service_history_sync(p_run_id uuid,p_lock_token uuid,p_error_code text)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service-role access required.' using errcode='42501'; end if;
  update public.one_c_service_history_sync_runs set status='failed',safe_error_code=left(coalesce(p_error_code,'unknown'),100),
    lock_token=null,locked_until=null,finished_at=now(),updated_at=now()
  where id=p_run_id and status='running' and lock_token=p_lock_token;
end $$;

create or replace function public.list_partner_service_history(p_company_id uuid,p_query text default '',p_filter text default 'all',p_page integer default 1,p_page_size integer default 20)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
with input as(select lower(btrim(coalesce(p_query,''))) q,case when p_filter in ('active','ready','completed','all') then p_filter else 'all' end filter_mode,
  greatest(p_page,1) page,least(greatest(p_page_size,1),50) page_size),
unified as (
 select c.id,'portal' source_type,c.case_number number,c.created_at document_date,c.status status,
  p.id product_id,p.sku,p.name product_name,p.image_url,
  case when c.entered_serial_number is null then null when char_length(c.entered_serial_number)<=6
    then left(c.entered_serial_number,1)||'***'||right(c.entered_serial_number,1)
    else left(c.entered_serial_number,3)||'***'||right(c.entered_serial_number,3) end masked_serial,
  c.partner_description reported_fault,c.warranty_eligibility_state warranty_state,c.warranty_end_date,
  c.updated_at,'/cabinet/service/'||c.id href,
  c.status not in ('closed','rejected','cancelled') active,
  c.status='ready_for_pickup' ready,c.status in ('closed','rejected','cancelled') completed
 from public.service_cases c left join public.catalog_products p on p.id=c.product_id where c.company_id=p_company_id
 union all
 select h.id,'one_c',h.source_document_number,h.source_document_date,h.normalized_status,
  p.id,p.sku,coalesce(p.name,h.product_name_snapshot),p.image_url,h.masked_serial,h.reported_fault,
  h.warranty_state_snapshot,h.warranty_end_date,h.updated_at,'/cabinet/service/history/'||h.id,
  h.normalized_status not in ('issued_to_customer','closed','rejected'),h.normalized_status='ready_for_pickup',
  h.normalized_status in ('issued_to_customer','closed','rejected')
 from public.one_c_service_history h left join public.catalog_products p on p.id=h.product_id
 where h.company_id=p_company_id and h.partner_visible and h.is_active
), visible as (
 select unified.* from unified,input where public.has_permission(p_company_id,'service.view')
 and (input.q='' or lower(number||' '||coalesce(sku,'')||' '||coalesce(product_name,'')||' '||coalesce(masked_serial,'')) like '%'||input.q||'%')
 and (input.filter_mode='all' or input.filter_mode='active' and active or input.filter_mode='ready' and ready or input.filter_mode='completed' and completed)
), paged as (select visible.*,count(*) over() total_count from visible order by document_date desc,id desc
 offset(select (page-1)*page_size from input) limit(select page_size from input))
select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceType',source_type,'number',number,
 'date',document_date,'status',status,'productId',product_id,'productSku',sku,'productName',product_name,
 'productImageUrl',image_url,'maskedSerial',masked_serial,'reportedFault',reported_fault,'warrantyState',warranty_state,
 'warrantyEndDate',warranty_end_date,'updatedAt',updated_at,'href',href) order by document_date desc,id desc),'[]'::jsonb),
 'total',coalesce(max(total_count),0),'page',(select page from input)) from paged;
$$;

create or replace function public.get_partner_one_c_service_history(p_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select case when public.has_permission(h.company_id,'service.view') and h.partner_visible and h.is_active then jsonb_build_object(
 'id',h.id,'number',h.source_document_number,'date',h.source_document_date,'status',h.normalized_status,
 'sourceStatus',h.source_status,'product',case when p.id is not null and p.is_active and p.is_visible then jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'imageUrl',p.image_url,'href','/cabinet/catalog/'||p.slug) else jsonb_build_object('id',null,'sku',h.product_sku_snapshot,'name',h.product_name_snapshot,'imageUrl',null,'href',null) end,
 'maskedSerial',h.masked_serial,'reportedFault',h.reported_fault,'resolution',h.partner_visible_resolution,
 'warrantyState',h.warranty_state_snapshot,'warrantyStartDate',h.warranty_start_date,'warrantyEndDate',h.warranty_end_date,
 'serviceCenter',h.service_center_snapshot,'updatedAt',h.updated_at,
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type',e.event_type,'status',e.normalized_status,'occurredAt',e.occurred_at) order by e.occurred_at,e.id) from public.one_c_service_history_events e where e.service_history_id=h.id and e.event_type<>'redetected'),'[]'::jsonb)) else null end
from public.one_c_service_history h left join public.catalog_products p on p.id=h.product_id where h.id=p_id;
$$;

create or replace function public.list_admin_unified_service_history(p_query text default '',p_status text default null,p_page integer default 1,p_page_size integer default 25)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
with input as(select lower(btrim(coalesce(p_query,''))) q,greatest(p_page,1) page,least(greatest(p_page_size,1),50) page_size),
rows as(select h.id,h.source_document_number number,h.source_document_date date,h.normalized_status status,c.display_name company_name,
 p.sku,p.name product_name,h.masked_serial,h.is_active,h.partner_visible,'/admin/service/history/'||h.id href
 from public.one_c_service_history h left join public.partner_companies c on c.id=h.company_id left join public.catalog_products p on p.id=h.product_id,input
 where public.has_internal_permission('admin.service.view') and (p_status is null or h.normalized_status=p_status)
 and (input.q='' or lower(h.source_document_number||' '||coalesce(c.display_name,'')||' '||coalesce(p.sku,'')||' '||coalesce(p.name,'')) like '%'||input.q||'%')),
paged as(select rows.*,count(*) over() total_count from rows order by date desc,id desc offset(select (page-1)*page_size from input) limit(select page_size from input))
select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(paged)-'total_count' order by date desc,id desc),'[]'::jsonb),'total',coalesce(max(total_count),0),'page',(select page from input)) from paged;
$$;

create or replace function public.get_admin_one_c_service_history(p_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select case when public.has_internal_permission('admin.service.view') then jsonb_build_object(
 'id',h.id,'number',h.source_document_number,'date',h.source_document_date,'status',h.normalized_status,
 'sourceStatus',h.source_status,'product',case when p.id is not null and p.is_active and p.is_visible then jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'imageUrl',p.image_url,'href','/cabinet/catalog/'||p.slug) else jsonb_build_object('id',null,'sku',h.product_sku_snapshot,'name',h.product_name_snapshot,'imageUrl',null,'href',null) end,
 'maskedSerial',h.masked_serial,'reportedFault',h.reported_fault,'resolution',h.partner_visible_resolution,
 'warrantyState',h.warranty_state_snapshot,'warrantyStartDate',h.warranty_start_date,'warrantyEndDate',h.warranty_end_date,
 'serviceCenter',h.service_center_snapshot,'updatedAt',h.updated_at,
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type',e.event_type,'status',e.normalized_status,'occurredAt',e.occurred_at) order by e.occurred_at,e.id) from public.one_c_service_history_events e where e.service_history_id=h.id and e.event_type<>'redetected'),'[]'::jsonb)) else null end
from public.one_c_service_history h left join public.catalog_products p on p.id=h.product_id where h.id=p_id;
$$;

create or replace function public.get_one_c_service_history_diagnostics()
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select case when public.has_internal_permission('admin.service.view') then jsonb_build_object(
 'imported',(select count(*) from public.one_c_service_history),
 'mappedCompanies',(select count(*) from public.one_c_service_history where company_id is not null),
 'unmappedCompanies',(select count(*) from public.one_c_service_history where company_id is null),
 'mappedProducts',(select count(*) from public.one_c_service_history where product_id is not null),
 'unmappedProducts',(select count(*) from public.one_c_service_history where product_id is null),
 'serialLinked',(select count(*) from public.one_c_service_history where serial_hash is not null),
 'serialUnlinked',(select count(*) from public.one_c_service_history where serial_hash is null),
 'activeRepairs',(select count(*) from public.one_c_service_history where is_active and normalized_status not in ('issued_to_customer','closed','rejected')),
 'readyForPickup',(select count(*) from public.one_c_service_history where is_active and normalized_status='ready_for_pickup'),
 'issued',(select count(*) from public.one_c_service_history where normalized_status='issued_to_customer'),
 'unknownStatuses',(select count(*) from public.one_c_service_history where normalized_status='unknown'),
 'inactive',(select count(*) from public.one_c_service_history where not is_active),
 'conflicts',(select count(*) from public.one_c_service_history_conflicts),
 'latestSourceDate',(select max(source_document_date) from public.one_c_service_history),
 'latestSync',(select to_jsonb(r) from public.one_c_service_history_sync_runs r order by started_at desc limit 1)) else null end;
$$;

create or replace function public.get_partner_service_dashboard_v2(p_company_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
with rows as (
 select c.id,c.case_number number,c.status,p.name product_name,p.image_url,c.updated_at,
  case c.status when 'awaiting_information' then 'Предоставить информацию' when 'awaiting_equipment' then 'Передать оборудование' when 'ready_for_pickup' then 'Получить оборудование' when 'replacement_approved' then 'Согласовать замену' else 'Посмотреть статус' end next_action,
  '/cabinet/service/'||c.id href,case c.status when 'awaiting_information' then 1 when 'awaiting_equipment' then 2 when 'ready_for_pickup' then 3 else 5 end rank
 from public.service_cases c left join public.catalog_products p on p.id=c.product_id
 where c.company_id=p_company_id and c.status in ('awaiting_information','awaiting_equipment','ready_for_pickup','replacement_approved','diagnostics','repair','awaiting_replacement')
 union all
 select h.id,h.source_document_number,h.normalized_status,coalesce(p.name,h.product_name_snapshot),p.image_url,h.updated_at,
  'Оборудование готово к выдаче','/cabinet/service/history/'||h.id,1
 from public.one_c_service_history h left join public.catalog_products p on p.id=h.product_id
 where h.company_id=p_company_id and h.partner_visible and h.is_active and h.normalized_status='ready_for_pickup'
), limited as(select * from rows where public.has_permission(p_company_id,'service.view') order by rank,updated_at desc limit 2)
select coalesce(jsonb_agg(jsonb_build_object('id',id,'caseNumber',number,'status',status,'productName',product_name,'productImageUrl',image_url,'updatedAt',updated_at,'nextAction',next_action,'href',href) order by rank,updated_at desc),'[]'::jsonb) from limited;
$$;

revoke all on function public.claim_one_c_service_history_sync(integer),public.publish_one_c_service_history_page(uuid,uuid,integer,jsonb,boolean),public.fail_one_c_service_history_sync(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_one_c_service_history_sync(integer),public.publish_one_c_service_history_page(uuid,uuid,integer,jsonb,boolean),public.fail_one_c_service_history_sync(uuid,uuid,text) to service_role;
revoke all on function public.list_partner_service_history(uuid,text,text,integer,integer),public.get_partner_one_c_service_history(uuid),public.list_admin_unified_service_history(text,text,integer,integer),public.get_admin_one_c_service_history(uuid),public.get_one_c_service_history_diagnostics(),public.get_partner_service_dashboard_v2(uuid) from public,anon;
grant execute on function public.list_partner_service_history(uuid,text,text,integer,integer),public.get_partner_one_c_service_history(uuid),public.get_partner_service_dashboard_v2(uuid) to authenticated;
grant execute on function public.list_admin_unified_service_history(text,text,integer,integer),public.get_admin_one_c_service_history(uuid),public.get_one_c_service_history_diagnostics() to authenticated;
revoke all on function public.prevent_one_c_service_history_event_mutation() from public,anon,authenticated;
revoke all on function public.project_one_c_service_history_notification(uuid) from public,anon,authenticated;
grant execute on function public.project_one_c_service_history_notification(uuid) to service_role;
revoke all on function public.is_allowed_partner_notification_url(text) from public;

commit;
