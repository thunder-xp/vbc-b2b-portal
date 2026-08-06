begin;

insert into public.permissions(code, description) values
  ('service.serial.verify', 'Verify company-scoped Novotech serial sale evidence.'),
  ('admin.service.serial.verify', 'Verify serial sale evidence across companies.'),
  ('admin.integrations.warranty_serials.view', 'View warranty serial synchronization diagnostics.')
on conflict (code) do nothing;

with grants(role_code, permission_code) as (values
  ('partner_owner','service.serial.verify'),
  ('partner_manager','service.serial.verify'),
  ('partner_buyer','service.serial.verify'),
  ('novotech_admin','admin.service.serial.verify'),
  ('novotech_admin','admin.integrations.warranty_serials.view'),
  ('novotech_sales','admin.service.serial.verify'),
  ('novotech_sales','admin.integrations.warranty_serials.view')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code=grants.role_code
join public.permissions permission on permission.code=grants.permission_code
on conflict do nothing;

insert into public.partner_access_preset_capabilities(preset_code, permission_id)
select 'full_partner_access', id
from public.permissions
where code='service.serial.verify'
on conflict do nothing;

insert into public.partner_company_capabilities(company_id, permission_id, enabled_by)
select policy.company_id, permission.id, policy.changed_by
from public.partner_company_access_policies policy
join public.permissions permission on permission.code='service.serial.verify'
where policy.preset_code='full_partner_access'
on conflict do nothing;

create table public.warranty_serial_sync_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('full','incremental','historical_reconciliation')),
  status text not null check (status in ('running','succeeded','failed')),
  current_stage text not null check (current_stage in ('sale_scan','return_scan','state_rebuild','completed')),
  sale_skip integer not null default 0 check (sale_skip>=0),
  return_skip integer not null default 0 check (return_skip>=0),
  page_size integer not null default 25 check (page_size between 1 and 100),
  range_start date not null,
  range_end date not null,
  sales_scan_complete boolean not null default false,
  returns_scan_complete boolean not null default false,
  pages_fetched integer not null default 0,
  sale_headers_received integer not null default 0,
  return_headers_received integer not null default 0,
  details_fetched integer not null default 0,
  events_published integer not null default 0,
  conflicts_published integer not null default 0,
  states_rebuilt integer not null default 0,
  lock_token uuid null,
  locked_until timestamptz null,
  safe_error_code text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  check (range_start<=range_end)
);

create unique index warranty_serial_one_running_idx
  on public.warranty_serial_sync_runs((true)) where status='running';
create index warranty_serial_runs_started_idx
  on public.warranty_serial_sync_runs(started_at desc);

create table public.warranty_serial_source_documents (
  source_entity text not null,
  source_document_ref text not null check (source_document_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and lower(source_document_ref)<>'00000000-0000-0000-0000-000000000000'),
  source_document_number text not null,
  source_document_date timestamptz not null,
  source_posted boolean not null,
  source_deletion_mark boolean not null,
  source_data_version text null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  last_seen_run_id uuid not null references public.warranty_serial_sync_runs(id) on delete restrict,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  primary key(source_entity,source_document_ref)
);

create table public.warranty_serial_events (
  id uuid primary key default gen_random_uuid(),
  normalized_serial_hash text not null check (normalized_serial_hash ~ '^[0-9a-f]{64}$'),
  protected_serial_value text not null check (char_length(protected_serial_value) between 24 and 1000),
  masked_serial text not null check (char_length(masked_serial) between 3 and 120),
  event_type text not null check (event_type in (
    'sale_observed','sale_unposted','sale_deleted','customer_return','stock_reentry',
    'resale_observed','correction_observed','repair_intake_observed','writeoff_observed','conflict_observed'
  )),
  source_entity text not null,
  source_document_ref text not null check (source_document_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and lower(source_document_ref)<>'00000000-0000-0000-0000-000000000000'),
  related_source_document_ref text null check (related_source_document_ref is null or (related_source_document_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and lower(related_source_document_ref)<>'00000000-0000-0000-0000-000000000000')),
  source_document_number text not null,
  source_document_date timestamptz not null,
  source_posted boolean not null,
  source_deletion_mark boolean not null,
  source_data_version text null,
  source_line_number integer not null check (source_line_number>=0),
  source_serial_line_number integer not null check (source_serial_line_number>=0),
  source_link_key text not null,
  one_c_counterparty_ref text null check (one_c_counterparty_ref is null or (one_c_counterparty_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and lower(one_c_counterparty_ref)<>'00000000-0000-0000-0000-000000000000')),
  one_c_product_ref text null check (one_c_product_ref is null or (one_c_product_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and lower(one_c_product_ref)<>'00000000-0000-0000-0000-000000000000')),
  characteristic_ref text null check (characteristic_ref is null or (characteristic_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and lower(characteristic_ref)<>'00000000-0000-0000-0000-000000000000')),
  organization_ref text null check (organization_ref is null or (organization_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and lower(organization_ref)<>'00000000-0000-0000-0000-000000000000')),
  warehouse_ref text null check (warehouse_ref is null or (warehouse_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' and lower(warehouse_ref)<>'00000000-0000-0000-0000-000000000000')),
  quantity numeric(18,4) not null default 1,
  company_id uuid null references public.partner_companies(id) on delete restrict,
  product_id uuid null references public.catalog_products(id) on delete restrict,
  product_sku_snapshot text null,
  product_name_snapshot text null,
  warranty_months_snapshot integer null check (warranty_months_snapshot is null or warranty_months_snapshot between 0 and 240),
  mapping_state text not null check (mapping_state in ('mapped','company_unmapped','product_unmapped','company_and_product_unmapped','conflict')),
  review_reason_codes text[] not null default '{}',
  source_fingerprint text not null unique check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  sync_run_id uuid not null references public.warranty_serial_sync_runs(id) on delete restrict,
  observed_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index warranty_serial_events_hash_chronology_idx
  on public.warranty_serial_events(normalized_serial_hash,source_document_date,event_type,id);
create index warranty_serial_events_source_idx
  on public.warranty_serial_events(source_entity,source_document_ref);
create index warranty_serial_events_company_idx
  on public.warranty_serial_events(company_id,source_document_date desc) where company_id is not null;
create index warranty_serial_events_product_idx
  on public.warranty_serial_events(product_id,source_document_date desc) where product_id is not null;
create index warranty_serial_events_run_idx
  on public.warranty_serial_events(sync_run_id,id);

create table public.warranty_serial_state (
  normalized_serial_hash text primary key check (normalized_serial_hash ~ '^[0-9a-f]{64}$'),
  current_company_id uuid null references public.partner_companies(id) on delete restrict,
  current_product_id uuid null references public.catalog_products(id) on delete restrict,
  last_sale_company_id uuid null references public.partner_companies(id) on delete restrict,
  last_sale_product_id uuid null references public.catalog_products(id) on delete restrict,
  current_event_id uuid null references public.warranty_serial_events(id) on delete restrict,
  last_sale_event_id uuid null references public.warranty_serial_events(id) on delete restrict,
  last_return_event_id uuid null references public.warranty_serial_events(id) on delete restrict,
  ownership_state text not null check (ownership_state in ('sale_confirmed','sale_cancelled','returned','resold','conflict','source_incomplete','manual_review_required')),
  warranty_state text not null check (warranty_state in ('sale_confirmed_review_required','covered','expired','returned','cancelled','conflict','warranty_period_missing','source_incomplete','manual_review_required')),
  warranty_start_date date null,
  warranty_end_date date null,
  warranty_months integer null check (warranty_months is null or warranty_months between 0 and 240),
  chronology_complete boolean not null default false,
  review_reason_codes text[] not null default '{}',
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  calculated_at timestamptz not null default now(),
  version integer not null default 1 check (version>0)
);

create index warranty_serial_state_company_idx
  on public.warranty_serial_state(last_sale_company_id,warranty_state);
create index warranty_serial_state_product_idx
  on public.warranty_serial_state(last_sale_product_id,warranty_state);

create table public.warranty_serial_lookup_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  company_id uuid null references public.partner_companies(id) on delete restrict,
  normalized_serial_hash text not null check (normalized_serial_hash ~ '^[0-9a-f]{64}$'),
  lookup_scope text not null check (lookup_scope in ('partner','internal')),
  result_code text not null check (result_code in ('covered','expired','review_required','returned_or_cancelled','conflict','not_found')),
  correlation_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index warranty_serial_lookup_actor_rate_idx
  on public.warranty_serial_lookup_audit(actor_user_id,occurred_at desc);
create index warranty_serial_lookup_company_idx
  on public.warranty_serial_lookup_audit(company_id,occurred_at desc) where company_id is not null;

alter table public.service_cases
  add column if not exists warranty_serial_hash text null,
  add column if not exists warranty_verification_snapshot jsonb null,
  add column if not exists warranty_verification_id uuid null references public.warranty_serial_lookup_audit(id) on delete restrict,
  add constraint service_cases_warranty_serial_hash_check check (warranty_serial_hash is null or warranty_serial_hash ~ '^[0-9a-f]{64}$'),
  add constraint service_cases_warranty_snapshot_check check (warranty_verification_snapshot is null or jsonb_typeof(warranty_verification_snapshot)='object');

alter table public.service_case_product_evidence
  add column if not exists warranty_serial_hash text null,
  add column if not exists warranty_verification_snapshot jsonb null,
  add constraint service_evidence_warranty_serial_hash_check check (warranty_serial_hash is null or warranty_serial_hash ~ '^[0-9a-f]{64}$'),
  add constraint service_evidence_warranty_snapshot_check check (warranty_verification_snapshot is null or jsonb_typeof(warranty_verification_snapshot)='object');

alter table public.service_cases drop constraint if exists service_cases_purchase_verification_state_check;
alter table public.service_cases add constraint service_cases_purchase_verification_state_check check (
  purchase_verification_state in ('verified_order','verified_warranty_serial','pending_manual_product','verification_required')
);
alter table public.service_cases drop constraint if exists service_cases_warranty_eligibility_state_check;
alter table public.service_cases add constraint service_cases_warranty_eligibility_state_check check (
  warranty_eligibility_state in (
    'eligible','expired','verification_required','serial_not_found','purchase_not_found','excluded_by_policy',
    'manually_approved','manually_rejected','sale_confirmed_review_required','returned','cancelled','conflict','source_incomplete'
  )
);

create or replace function public.prevent_warranty_serial_history_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'Warranty serial history is append-only.' using errcode='55000';
end $$;

create trigger warranty_serial_events_immutable
before update or delete on public.warranty_serial_events
for each row execute function public.prevent_warranty_serial_history_mutation();
create trigger warranty_serial_lookup_audit_immutable
before update or delete on public.warranty_serial_lookup_audit
for each row execute function public.prevent_warranty_serial_history_mutation();

alter table public.warranty_serial_sync_runs enable row level security;
alter table public.warranty_serial_source_documents enable row level security;
alter table public.warranty_serial_events enable row level security;
alter table public.warranty_serial_state enable row level security;
alter table public.warranty_serial_lookup_audit enable row level security;

revoke all on public.warranty_serial_sync_runs,public.warranty_serial_source_documents,
  public.warranty_serial_events,public.warranty_serial_state,public.warranty_serial_lookup_audit
from public,anon,authenticated;
grant all on public.warranty_serial_sync_runs,public.warranty_serial_source_documents,
  public.warranty_serial_events,public.warranty_serial_state,public.warranty_serial_lookup_audit
to service_role;

create or replace function public.warranty_add_calendar_months(p_start date,p_months integer)
returns date language sql immutable set search_path=public as $$
  with target as (
    select (extract(year from p_start)::integer*12 + extract(month from p_start)::integer-1 + p_months) month_index,
           extract(day from p_start)::integer source_day
  ), parts as (
    select floor(month_index/12.0)::integer target_year,
           mod(month_index,12)+1 target_month,
           source_day
    from target
  ), month_bounds as (
    select make_date(target_year,target_month,1) first_day,source_day from parts
  )
  select make_date(extract(year from first_day)::integer,extract(month from first_day)::integer,
    least(source_day,extract(day from (first_day+interval '1 month'-interval '1 day'))::integer))
  from month_bounds
$$;

create or replace function public.claim_warranty_serial_sync_run(p_page_size integer default 25)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare run public.warranty_serial_sync_runs; token uuid:=gen_random_uuid();
begin
  if auth.role()<>'service_role' then raise exception 'Warranty sync denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('warranty_serial_sync_claim'));
  select * into run from public.warranty_serial_sync_runs where status='running' order by started_at desc limit 1 for update;
  if found and run.locked_until is not null and run.locked_until>now() then return null; end if;
  if not found then
    if exists(select 1 from public.warranty_serial_sync_runs where status='succeeded' and finished_at>now()-interval '20 hours') then return null; end if;
    insert into public.warranty_serial_sync_runs(mode,status,current_stage,page_size,range_start,range_end)
    values(case when not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded') then 'full'
        when extract(isodow from now() at time zone 'Europe/Chisinau')=7
          and not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded' and mode='historical_reconciliation' and finished_at>now()-interval '6 days')
          then 'historical_reconciliation' else 'incremental' end,
      'running','sale_scan',least(greatest(p_page_size,1),100),
      case when not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded')
          or (extract(isodow from now() at time zone 'Europe/Chisinau')=7
            and not exists(select 1 from public.warranty_serial_sync_runs where status='succeeded' and mode='historical_reconciliation' and finished_at>now()-interval '6 days'))
        then ((now() at time zone 'Europe/Chisinau')::date-interval '60 months')::date
        else (now() at time zone 'Europe/Chisinau')::date-90 end,
      (now() at time zone 'Europe/Chisinau')::date)
    returning * into run;
  end if;
  update public.warranty_serial_sync_runs set lock_token=token,locked_until=now()+interval '4 minutes'
  where id=run.id returning * into run;
  return jsonb_build_object('runId',run.id,'lockToken',token,'mode',run.mode,'stage',run.current_stage,
    'skip',case when run.current_stage='return_scan' then run.return_skip else run.sale_skip end,
    'pageSize',run.page_size,'rangeStart',run.range_start,'rangeEnd',run.range_end);
end $$;

create or replace function public.publish_warranty_serial_sync_step(
  p_run_id uuid,p_lock_token uuid,p_stage text,p_skip integer,p_headers_received integer,
  p_documents jsonb,p_events jsonb,p_page_complete boolean
)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare run public.warranty_serial_sync_runs; inserted_events integer:=0; cancellation_events integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'Warranty sync denied' using errcode='42501'; end if;
  select * into run from public.warranty_serial_sync_runs where id=p_run_id for update;
  if not found or run.status<>'running' or run.lock_token is distinct from p_lock_token or run.current_stage<>p_stage then
    raise exception 'Warranty sync lease is stale' using errcode='40001';
  end if;
  if p_skip<>(case when p_stage='return_scan' then run.return_skip else run.sale_skip end) then
    raise exception 'Warranty sync cursor is stale' using errcode='40001';
  end if;
  if run.pages_fetched>=4000 then raise exception 'Warranty sync page limit reached' using errcode='54000'; end if;
  if p_headers_received>0 and not exists(
    select 1 from jsonb_array_elements(coalesce(p_documents,'[]'::jsonb)) incoming
    where not exists(select 1 from public.warranty_serial_source_documents previous
      where previous.source_entity=incoming->>'source_entity'
        and previous.source_document_ref=lower(incoming->>'source_document_ref')
        and previous.last_seen_run_id=p_run_id)
  ) then raise exception 'Warranty sync repeated a previously seen page' using errcode='40001'; end if;

  with incoming as (
    select * from jsonb_to_recordset(coalesce(p_documents,'[]'::jsonb)) as value(
      source_entity text,source_document_ref text,source_document_number text,source_document_date timestamptz,
      source_posted boolean,source_deletion_mark boolean,source_data_version text,source_fingerprint text)
  )
  insert into public.warranty_serial_source_documents(source_entity,source_document_ref,source_document_number,
    source_document_date,source_posted,source_deletion_mark,source_data_version,source_fingerprint,last_seen_run_id)
  select source_entity,lower(source_document_ref),source_document_number,source_document_date,source_posted,
    source_deletion_mark,source_data_version,source_fingerprint,p_run_id from incoming
  on conflict(source_entity,source_document_ref) do update set
    source_document_number=excluded.source_document_number,source_document_date=excluded.source_document_date,
    source_posted=excluded.source_posted,source_deletion_mark=excluded.source_deletion_mark,
    source_data_version=excluded.source_data_version,source_fingerprint=excluded.source_fingerprint,
    last_seen_run_id=excluded.last_seen_run_id,last_observed_at=now();

  with incoming as (
    select * from jsonb_to_recordset(coalesce(p_events,'[]'::jsonb)) as value(
      normalized_serial_hash text,protected_serial_value text,masked_serial text,event_type text,source_entity text,
      source_document_ref text,related_source_document_ref text,source_document_number text,source_document_date timestamptz,
      source_posted boolean,source_deletion_mark boolean,source_data_version text,source_line_number integer,
      source_serial_line_number integer,source_link_key text,one_c_counterparty_ref text,one_c_product_ref text,
      characteristic_ref text,organization_ref text,warehouse_ref text,quantity numeric,product_sku_snapshot text,
      product_name_snapshot text,warranty_months_snapshot integer,mapping_state text,review_reason_codes text[],source_fingerprint text)
  ), mapped as (
    select incoming.*,
      (select counterparty.portal_company_id from public.one_c_counterparties counterparty
       where counterparty.is_published and not counterparty.is_deleted and counterparty.is_active
         and lower(counterparty.external_1c_id)=lower(incoming.one_c_counterparty_ref)
         and counterparty.portal_company_id is not null limit 1) company_id,
      (select product.id from public.catalog_products product
       where lower(product.external_1c_id)=lower(incoming.one_c_product_ref) limit 1) product_id
    from incoming
  ), inserted as (
    insert into public.warranty_serial_events(
      normalized_serial_hash,protected_serial_value,masked_serial,event_type,source_entity,source_document_ref,
      related_source_document_ref,source_document_number,source_document_date,source_posted,source_deletion_mark,
      source_data_version,source_line_number,source_serial_line_number,source_link_key,one_c_counterparty_ref,
      one_c_product_ref,characteristic_ref,organization_ref,warehouse_ref,quantity,company_id,product_id,
      product_sku_snapshot,product_name_snapshot,warranty_months_snapshot,mapping_state,review_reason_codes,
      source_fingerprint,sync_run_id)
    select normalized_serial_hash,protected_serial_value,masked_serial,event_type,source_entity,lower(source_document_ref),
      nullif(lower(related_source_document_ref),''),source_document_number,source_document_date,source_posted,
      source_deletion_mark,source_data_version,source_line_number,source_serial_line_number,source_link_key,
      nullif(lower(one_c_counterparty_ref),''),nullif(lower(one_c_product_ref),''),nullif(lower(characteristic_ref),''),
      nullif(lower(organization_ref),''),nullif(lower(warehouse_ref),''),quantity,company_id,product_id,
      product_sku_snapshot,product_name_snapshot,warranty_months_snapshot,
      case when mapping_state='conflict' then 'conflict'
           when company_id is null and product_id is null then 'company_and_product_unmapped'
           when company_id is null then 'company_unmapped'
           when product_id is null then 'product_unmapped' else 'mapped' end,
      review_reason_codes,source_fingerprint,p_run_id from mapped
    on conflict(source_fingerprint) do nothing returning id
  ) select count(*) into inserted_events from inserted;

  update public.warranty_serial_sync_runs set
    pages_fetched=pages_fetched+1,
    sale_headers_received=sale_headers_received+case when p_stage='sale_scan' then p_headers_received else 0 end,
    return_headers_received=return_headers_received+case when p_stage='return_scan' then p_headers_received else 0 end,
    details_fetched=details_fetched+jsonb_array_length(coalesce(p_events,'[]'::jsonb)),
    events_published=events_published+inserted_events+cancellation_events,
    conflicts_published=conflicts_published+(select count(*) from jsonb_array_elements(coalesce(p_events,'[]'::jsonb)) e where e->>'event_type'='conflict_observed'),
    sale_skip=case when p_stage='sale_scan' and not p_page_complete then sale_skip+p_headers_received else sale_skip end,
    return_skip=case when p_stage='return_scan' and not p_page_complete then return_skip+p_headers_received else return_skip end,
    sales_scan_complete=case when p_stage='sale_scan' and p_page_complete then true else sales_scan_complete end,
    returns_scan_complete=case when p_stage='return_scan' and p_page_complete then true else returns_scan_complete end,
    current_stage=case when p_stage='sale_scan' and p_page_complete then 'return_scan'
                       when p_stage='return_scan' and p_page_complete then 'state_rebuild' else current_stage end,
    lock_token=null,locked_until=null
  where id=p_run_id;
  return jsonb_build_object('insertedEvents',inserted_events,'cancellationEvents',cancellation_events,
    'nextStage',(select current_stage from public.warranty_serial_sync_runs where id=p_run_id));
end $$;

create or replace function public.rebuild_warranty_serial_states(p_run_id uuid)
returns integer language plpgsql security definer set search_path=public set row_security=off as $$
declare target_hash text; sale public.warranty_serial_events; returned public.warranty_serial_events;
  cancelled public.warranty_serial_events; conflict public.warranty_serial_events; later_sale public.warranty_serial_events;
  end_date date; complete boolean; ownership text; warranty text; reasons text[]; rebuilt integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'Warranty state rebuild denied' using errcode='42501'; end if;
  for target_hash in select distinct normalized_serial_hash from public.warranty_serial_events loop
    select * into sale from public.warranty_serial_events where normalized_serial_hash=target_hash
      and event_type in ('sale_observed','resale_observed') order by source_document_date desc,
      case event_type when 'resale_observed' then 2 else 1 end desc,source_document_ref desc,source_line_number desc,
      source_serial_line_number desc,observed_at desc,id desc limit 1;
    if not found then continue; end if;
    select * into cancelled from public.warranty_serial_events where normalized_serial_hash=target_hash
      and event_type in ('sale_unposted','sale_deleted') and related_source_document_ref=sale.source_document_ref
      order by observed_at desc,id desc limit 1;
    select event.* into returned from public.warranty_serial_events event
      where event.normalized_serial_hash=target_hash and event.event_type='customer_return'
        and exists(select 1 from public.warranty_serial_events prior_sale
          where prior_sale.normalized_serial_hash=target_hash
            and prior_sale.event_type in ('sale_observed','resale_observed')
            and prior_sale.source_document_ref=event.related_source_document_ref
            and prior_sale.source_document_date<=event.source_document_date)
      order by event.source_document_date desc,event.source_document_ref desc limit 1;
    later_sale:=null;
    if returned.id is not null and sale.source_document_date>returned.source_document_date then later_sale:=sale; end if;
    select * into conflict from public.warranty_serial_events where normalized_serial_hash=target_hash
      and event_type='conflict_observed' order by source_document_date desc,id desc limit 1;
    complete:=exists(select 1 from public.warranty_serial_sync_runs run where run.id=p_run_id and run.status='running'
      and run.sales_scan_complete and run.returns_scan_complete and run.range_start<=sale.source_document_date::date
      and run.range_end>=(now() at time zone 'Europe/Chisinau')::date and run.started_at>now()-interval '36 hours');
    end_date:=case when sale.warranty_months_snapshot is null then null
      else public.warranty_add_calendar_months(sale.source_document_date::date,sale.warranty_months_snapshot) end;
    reasons:='{}';
    if conflict.id is not null or sale.mapping_state='conflict' then ownership:='conflict'; warranty:='conflict'; reasons:=array['conflicting_source_evidence'];
    elsif cancelled.id is not null then ownership:='sale_cancelled'; warranty:='cancelled'; reasons:=array[cancelled.event_type];
    elsif returned.id is not null and returned.source_document_date>=sale.source_document_date then ownership:='returned'; warranty:='returned'; reasons:=array['customer_return'];
    elsif returned.id is not null and later_sale.id is not null then
      ownership:='resold'; sale:=later_sale; warranty:='sale_confirmed_review_required';
      reasons:=array['resale_requires_complete_chronology']; complete:=false;
      end_date:=case when sale.warranty_months_snapshot is null then null
        else public.warranty_add_calendar_months(sale.source_document_date::date,sale.warranty_months_snapshot) end;
    elsif sale.company_id is null then ownership:='source_incomplete'; warranty:='source_incomplete'; reasons:=array['company_unmapped'];
    elsif sale.product_id is null then ownership:='source_incomplete'; warranty:='source_incomplete'; reasons:=array['product_unmapped'];
    elsif sale.warranty_months_snapshot is null or sale.warranty_months_snapshot<=0 then ownership:='sale_confirmed'; warranty:='warranty_period_missing'; reasons:=array['warranty_period_missing'];
    elsif not complete then ownership:='sale_confirmed'; warranty:='sale_confirmed_review_required'; reasons:=array['reversal_scan_incomplete_or_stale'];
    elsif (now() at time zone 'Europe/Chisinau')::date<=end_date then ownership:='sale_confirmed'; warranty:='covered';
    else ownership:='sale_confirmed'; warranty:='expired'; end if;
    insert into public.warranty_serial_state(normalized_serial_hash,current_company_id,current_product_id,
      last_sale_company_id,last_sale_product_id,current_event_id,last_sale_event_id,last_return_event_id,
      ownership_state,warranty_state,warranty_start_date,warranty_end_date,warranty_months,chronology_complete,
      review_reason_codes,source_fingerprint)
    values(target_hash,case when ownership in ('sale_confirmed','resold') then sale.company_id end,
      case when ownership in ('sale_confirmed','resold') then sale.product_id end,sale.company_id,sale.product_id,
      coalesce(conflict.id,cancelled.id,returned.id,sale.id),sale.id,returned.id,ownership,warranty,
      sale.source_document_date::date,end_date,sale.warranty_months_snapshot,complete,reasons,
      encode(extensions.digest(target_hash||'|'||sale.id::text||'|'||coalesce(returned.id::text,'')||'|'||
        coalesce(cancelled.id::text,'')||'|'||coalesce(conflict.id::text,'')||'|'||complete::text,'sha256'),'hex'))
    on conflict(normalized_serial_hash) do update set
      current_company_id=excluded.current_company_id,current_product_id=excluded.current_product_id,
      last_sale_company_id=excluded.last_sale_company_id,last_sale_product_id=excluded.last_sale_product_id,
      current_event_id=excluded.current_event_id,last_sale_event_id=excluded.last_sale_event_id,
      last_return_event_id=excluded.last_return_event_id,ownership_state=excluded.ownership_state,
      warranty_state=excluded.warranty_state,warranty_start_date=excluded.warranty_start_date,
      warranty_end_date=excluded.warranty_end_date,warranty_months=excluded.warranty_months,
      chronology_complete=excluded.chronology_complete,review_reason_codes=excluded.review_reason_codes,
      source_fingerprint=excluded.source_fingerprint,calculated_at=now(),version=public.warranty_serial_state.version+1;
    rebuilt:=rebuilt+1;
  end loop;
  return rebuilt;
end $$;

create or replace function public.complete_warranty_serial_sync_run(p_run_id uuid,p_lock_token uuid)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare run public.warranty_serial_sync_runs; rebuilt integer;
begin
  if auth.role()<>'service_role' then raise exception 'Warranty sync denied' using errcode='42501'; end if;
  select * into run from public.warranty_serial_sync_runs where id=p_run_id for update;
  if not found or run.status<>'running' or run.current_stage<>'state_rebuild' or run.lock_token is distinct from p_lock_token then
    raise exception 'Warranty sync completion lease is stale' using errcode='40001';
  end if;
  rebuilt:=public.rebuild_warranty_serial_states(p_run_id);
  update public.warranty_serial_sync_runs set status='succeeded',current_stage='completed',states_rebuilt=rebuilt,
    lock_token=null,locked_until=null,finished_at=now() where id=p_run_id;
  return jsonb_build_object('runId',p_run_id,'status','succeeded','statesRebuilt',rebuilt);
end $$;

create or replace function public.fail_warranty_serial_sync_run(p_run_id uuid,p_lock_token uuid,p_error_code text)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if auth.role()<>'service_role' then raise exception 'Warranty sync denied' using errcode='42501'; end if;
  update public.warranty_serial_sync_runs set status='failed',safe_error_code=left(coalesce(p_error_code,'unknown'),100),
    lock_token=null,locked_until=null,finished_at=now()
  where id=p_run_id and status='running' and lock_token=p_lock_token;
end $$;

create or replace function public.lookup_partner_warranty_serial_snapshot(p_serial_hash text,p_company_id uuid,p_verification_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
  select jsonb_build_object('verificationId',p_verification_id,'warrantyState',state.warranty_state,
    'ownershipState',state.ownership_state,'productId',state.last_sale_product_id,'sku',sale.product_sku_snapshot,
    'productName',sale.product_name_snapshot,'saleDate',state.warranty_start_date,'warrantyMonths',state.warranty_months,
    'warrantyEndDate',state.warranty_end_date,'maskedSerial',sale.masked_serial,'reviewReasonCodes',state.review_reason_codes,
    'chronologyComplete',state.chronology_complete)
  from public.warranty_serial_state state join public.warranty_serial_events sale on sale.id=state.last_sale_event_id
  where state.normalized_serial_hash=p_serial_hash and state.last_sale_company_id=p_company_id
$$;

create or replace function public.lookup_partner_warranty_serial(p_company_id uuid,p_serial_hash text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare state public.warranty_serial_state; sale public.warranty_serial_events; result_code text; audit_id uuid;
begin
  if p_serial_hash !~ '^[0-9a-f]{64}$' or not public.has_permission(p_company_id,'service.serial.verify') then
    raise exception 'Serial verification denied' using errcode='42501';
  end if;
  if (select count(*) from public.warranty_serial_lookup_audit where actor_user_id=auth.uid() and occurred_at>now()-interval '1 minute')>=10
    or (select count(*) from public.warranty_serial_lookup_audit where actor_user_id=auth.uid() and occurred_at>now()-interval '1 day')>=100 then
    raise exception 'Serial verification rate limit exceeded' using errcode='P0001';
  end if;
  select * into state from public.warranty_serial_state where normalized_serial_hash=p_serial_hash;
  if not found or state.last_sale_company_id is distinct from p_company_id then result_code:='not_found';
  elsif state.warranty_state='covered' then result_code:='covered';
  elsif state.warranty_state='expired' then result_code:='expired';
  elsif state.warranty_state in ('returned','cancelled') then result_code:='returned_or_cancelled';
  elsif state.warranty_state='conflict' then result_code:='conflict';
  else result_code:='review_required'; end if;
  insert into public.warranty_serial_lookup_audit(actor_user_id,company_id,normalized_serial_hash,lookup_scope,result_code,correlation_id)
  values(auth.uid(),p_company_id,p_serial_hash,'partner',result_code,p_correlation_id) returning id into audit_id;
  if result_code='not_found' then return jsonb_build_object('verificationId',audit_id,'result','not_found'); end if;
  select * into sale from public.warranty_serial_events where id=state.last_sale_event_id;
  return jsonb_build_object('verificationId',audit_id,'result',result_code,'warrantyState',state.warranty_state,
    'ownershipState',state.ownership_state,'productId',state.last_sale_product_id,'sku',sale.product_sku_snapshot,
    'productName',sale.product_name_snapshot,'saleDate',state.warranty_start_date,'warrantyMonths',state.warranty_months,
    'warrantyEndDate',state.warranty_end_date,'maskedSerial',sale.masked_serial,
    'reviewReasonCodes',state.review_reason_codes,'chronologyComplete',state.chronology_complete);
end $$;

create or replace function public.get_partner_warranty_verification(p_company_id uuid,p_verification_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
  select case when audit.actor_user_id=auth.uid() and audit.company_id=p_company_id
    and audit.lookup_scope='partner' and audit.occurred_at>now()-interval '30 minutes'
    and public.has_permission(p_company_id,'service.serial.verify') then
      public.lookup_partner_warranty_serial_snapshot(audit.normalized_serial_hash,p_company_id,audit.id) else null end
  from public.warranty_serial_lookup_audit audit where audit.id=p_verification_id
$$;

create or replace function public.lookup_internal_warranty_serial(p_serial_hash text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare state public.warranty_serial_state; sale public.warranty_serial_events; audit_id uuid; state_found boolean;
begin
  if p_serial_hash !~ '^[0-9a-f]{64}$' or not public.has_internal_permission('admin.service.serial.verify') then
    raise exception 'Serial verification denied' using errcode='42501';
  end if;
  if (select count(*) from public.warranty_serial_lookup_audit where actor_user_id=auth.uid() and occurred_at>now()-interval '1 minute')>=30 then
    raise exception 'Serial verification rate limit exceeded' using errcode='P0001';
  end if;
  select * into state from public.warranty_serial_state where normalized_serial_hash=p_serial_hash;
  state_found:=found;
  insert into public.warranty_serial_lookup_audit(actor_user_id,normalized_serial_hash,lookup_scope,result_code,correlation_id)
  values(auth.uid(),p_serial_hash,'internal',case when state_found then
    case when state.warranty_state='covered' then 'covered' when state.warranty_state='expired' then 'expired'
      when state.warranty_state in ('returned','cancelled') then 'returned_or_cancelled'
      when state.warranty_state='conflict' then 'conflict' else 'review_required' end else 'not_found' end,p_correlation_id)
  returning id into audit_id;
  if not state_found then return jsonb_build_object('verificationId',audit_id,'result','not_found'); end if;
  select * into sale from public.warranty_serial_events where id=state.last_sale_event_id;
  return jsonb_build_object('verificationId',audit_id,'result',state.warranty_state,
    'protectedSerial',sale.protected_serial_value,'maskedSerial',sale.masked_serial,'companyId',state.last_sale_company_id,
    'companyName',(select display_name from public.partner_companies where id=state.last_sale_company_id),
    'productId',state.last_sale_product_id,'sku',sale.product_sku_snapshot,'productName',sale.product_name_snapshot,
    'saleDate',state.warranty_start_date,'warrantyMonths',state.warranty_months,'warrantyEndDate',state.warranty_end_date,
    'ownershipState',state.ownership_state,'warrantyState',state.warranty_state,'chronologyComplete',state.chronology_complete,
    'reviewReasonCodes',state.review_reason_codes,'calculatedAt',state.calculated_at,
    'timeline',(select coalesce(jsonb_agg(jsonb_build_object('eventType',event.event_type,'documentNumber',event.source_document_number,
      'documentDate',event.source_document_date,'posted',event.source_posted,'deleted',event.source_deletion_mark,
      'mappingState',event.mapping_state,'reviewReasonCodes',event.review_reason_codes) order by event.source_document_date,event.id),'[]'::jsonb)
      from public.warranty_serial_events event where event.normalized_serial_hash=p_serial_hash));
end $$;

create or replace function public.get_warranty_serial_diagnostics()
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select case when public.has_internal_permission('admin.integrations.warranty_serials.view') then jsonb_build_object(
  'totalEvents',(select count(*) from public.warranty_serial_events),
  'uniqueSerials',(select count(*) from public.warranty_serial_state),
  'currentSales',(select count(*) from public.warranty_serial_state where ownership_state in ('sale_confirmed','resold')),
  'covered',(select count(*) from public.warranty_serial_state where warranty_state='covered'),
  'reviewRequired',(select count(*) from public.warranty_serial_state where warranty_state='sale_confirmed_review_required'),
  'expired',(select count(*) from public.warranty_serial_state where warranty_state='expired'),
  'returned',(select count(*) from public.warranty_serial_state where warranty_state='returned'),
  'cancelled',(select count(*) from public.warranty_serial_state where warranty_state='cancelled'),
  'resold',(select count(*) from public.warranty_serial_state where ownership_state='resold'),
  'conflicts',(select count(*) from public.warranty_serial_state where warranty_state='conflict'),
  'unmappedCompanies',(select count(*) from public.warranty_serial_events where mapping_state in ('company_unmapped','company_and_product_unmapped')),
  'unmappedProducts',(select count(*) from public.warranty_serial_events where mapping_state in ('product_unmapped','company_and_product_unmapped')),
  'missingWarrantyPeriod',(select count(*) from public.warranty_serial_state where warranty_state='warranty_period_missing'),
  'sourceIncomplete',(select count(*) from public.warranty_serial_state where warranty_state='source_incomplete'),
  'latestSaleDate',(select max(source_document_date) from public.warranty_serial_events where event_type in ('sale_observed','resale_observed')),
  'latestReturnDate',(select max(source_document_date) from public.warranty_serial_events where event_type='customer_return'),
  'latestSync',(select to_jsonb(run) from public.warranty_serial_sync_runs run order by started_at desc limit 1),
  'reconciliationBacklog',(select count(*) from public.warranty_serial_state where not chronology_complete),
  'workerFailures',(select count(*) from public.warranty_serial_sync_runs where status='failed' and started_at>now()-interval '30 days'))
  else null end
$$;

create or replace function public.create_service_case_v2(
  p_company_id uuid,p_case_type text,p_product_id uuid,p_order_id uuid,p_order_line_id uuid,p_entered_serial text,
  p_fault_category text,p_description text,p_symptoms text,p_issue_started_on date,p_powers_on boolean,
  p_factory_reset boolean,p_preferred_contact text,p_evidence_consent boolean,p_warranty_verification_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare c public.service_cases; product public.catalog_products; history public.partner_order_history;
  line public.partner_order_history_items; audit public.warranty_serial_lookup_audit; state public.warranty_serial_state;
  sale public.warranty_serial_events; verification jsonb; effective_product_id uuid:=p_product_id;
begin
  if not public.has_permission(p_company_id,'service.create') then raise exception 'Service access denied' using errcode='42501'; end if;
  if not coalesce(p_evidence_consent,false) then raise exception 'Evidence consent is required' using errcode='22023'; end if;
  if p_warranty_verification_id is not null then
    select * into audit from public.warranty_serial_lookup_audit where id=p_warranty_verification_id and actor_user_id=auth.uid()
      and company_id=p_company_id and lookup_scope='partner' and occurred_at>now()-interval '30 minutes';
    if not found or audit.result_code='not_found' then raise exception 'Warranty verification is unavailable' using errcode='22023'; end if;
    select * into state from public.warranty_serial_state where normalized_serial_hash=audit.normalized_serial_hash
      and last_sale_company_id=p_company_id;
    if not found then raise exception 'Warranty verification is unavailable' using errcode='22023'; end if;
    select * into sale from public.warranty_serial_events where id=state.last_sale_event_id;
    effective_product_id:=state.last_sale_product_id;
    verification:=jsonb_build_object('verificationId',audit.id,'maskedSerial',sale.masked_serial,'productId',effective_product_id,
      'sku',sale.product_sku_snapshot,'productName',sale.product_name_snapshot,'saleDate',state.warranty_start_date,
      'warrantyMonths',state.warranty_months,'warrantyEndDate',state.warranty_end_date,'warrantyState',state.warranty_state,
      'ownershipState',state.ownership_state,'chronologyComplete',state.chronology_complete,
      'reviewReasonCodes',state.review_reason_codes,'capturedAt',now());
  end if;
  if effective_product_id is not null then select * into product from public.catalog_products where id=effective_product_id; if not found then raise exception 'Product unavailable' using errcode='22023'; end if; end if;
  if p_order_id is not null then select * into history from public.partner_order_history where id=p_order_id and company_id=p_company_id and partner_visible and not one_c_deletion_mark; if not found then raise exception 'Order unavailable' using errcode='22023'; end if; end if;
  if p_order_line_id is not null then select * into line from public.partner_order_history_items where id=p_order_line_id and order_history_id=p_order_id; if not found or (effective_product_id is not null and line.product_id is distinct from effective_product_id) then raise exception 'Order line mismatch' using errcode='22023'; end if; end if;
  insert into public.service_cases(company_id,created_by_user_id,case_type,product_id,order_id,order_line_id,
    entered_serial_number,fault_category,partner_description,symptoms,issue_started_on,powers_on,factory_reset_attempted,
    preferred_contact,evidence_consent,purchase_verification_state,warranty_eligibility_state,warranty_end_date,
    warranty_serial_hash,warranty_verification_snapshot,warranty_verification_id)
  values(p_company_id,auth.uid(),p_case_type,effective_product_id,p_order_id,p_order_line_id,
    case when p_warranty_verification_id is not null then sale.masked_serial else nullif(btrim(p_entered_serial),'') end,
    btrim(p_fault_category),btrim(p_description),nullif(btrim(p_symptoms),''),p_issue_started_on,p_powers_on,p_factory_reset,
    nullif(btrim(p_preferred_contact),''),true,
    case when p_warranty_verification_id is not null then 'verified_warranty_serial'
      when p_order_id is not null and p_order_line_id is not null then 'verified_order'
      when effective_product_id is not null then 'pending_manual_product' else 'verification_required' end,
    case when p_warranty_verification_id is null then case when nullif(btrim(p_entered_serial),'') is null then 'serial_not_found' else 'verification_required' end
      when state.warranty_state='covered' then 'eligible' when state.warranty_state='expired' then 'expired'
      when state.warranty_state='returned' then 'returned' when state.warranty_state='cancelled' then 'cancelled'
      when state.warranty_state='conflict' then 'conflict' when state.warranty_state='source_incomplete' then 'source_incomplete'
      else 'sale_confirmed_review_required' end,
    state.warranty_end_date,case when p_warranty_verification_id is not null then audit.normalized_serial_hash end,
    verification,p_warranty_verification_id) returning * into c;
  insert into public.service_case_events(case_id,actor_user_id,event_type,message,safe_metadata)
  values(c.id,auth.uid(),'created','Заявка зарегистрирована.',jsonb_build_object('warrantyVerificationId',p_warranty_verification_id));
  insert into public.service_case_status_history(case_id,actor_user_id,to_status,reason)
  values(c.id,auth.uid(),'created','Partner submission');
  insert into public.service_case_product_evidence(case_id,product_id,order_id,order_line_id,external_product_ref,
    product_sku,product_name,serial_value,purchase_date,verification_state,warranty_serial_hash,warranty_verification_snapshot)
  values(c.id,effective_product_id,p_order_id,p_order_line_id,coalesce(product.external_1c_id,line.external_product_ref),
    coalesce(product.sku,line.sku,sale.product_sku_snapshot),coalesce(product.name,line.product_name,sale.product_name_snapshot),
    case when p_warranty_verification_id is not null then sale.masked_serial else nullif(btrim(p_entered_serial),'') end,
    coalesce(state.warranty_start_date,history.one_c_document_date::date),c.purchase_verification_state,
    case when p_warranty_verification_id is not null then audit.normalized_serial_hash end,verification);
  return jsonb_build_object('id',c.id,'caseNumber',c.case_number,'status',c.status);
end $$;

revoke all on function public.prevent_warranty_serial_history_mutation(),public.warranty_add_calendar_months(date,integer),
  public.claim_warranty_serial_sync_run(integer),public.publish_warranty_serial_sync_step(uuid,uuid,text,integer,integer,jsonb,jsonb,boolean),
  public.rebuild_warranty_serial_states(uuid),public.complete_warranty_serial_sync_run(uuid,uuid),
  public.fail_warranty_serial_sync_run(uuid,uuid,text),public.lookup_partner_warranty_serial_snapshot(text,uuid,uuid)
from public,anon,authenticated;
revoke all on function public.lookup_partner_warranty_serial(uuid,text,uuid),public.get_partner_warranty_verification(uuid,uuid),
  public.lookup_internal_warranty_serial(text,uuid),public.get_warranty_serial_diagnostics(),
  public.create_service_case_v2(uuid,text,uuid,uuid,uuid,text,text,text,text,date,boolean,boolean,text,boolean,uuid)
from public,anon;

grant execute on function public.claim_warranty_serial_sync_run(integer),
  public.publish_warranty_serial_sync_step(uuid,uuid,text,integer,integer,jsonb,jsonb,boolean),
  public.rebuild_warranty_serial_states(uuid),public.complete_warranty_serial_sync_run(uuid,uuid),
  public.fail_warranty_serial_sync_run(uuid,uuid,text) to service_role;
grant execute on function public.lookup_partner_warranty_serial(uuid,text,uuid),public.get_partner_warranty_verification(uuid,uuid),
  public.lookup_internal_warranty_serial(text,uuid),public.get_warranty_serial_diagnostics(),
  public.create_service_case_v2(uuid,text,uuid,uuid,uuid,text,text,text,text,date,boolean,boolean,text,boolean,uuid)
to authenticated;

commit;
