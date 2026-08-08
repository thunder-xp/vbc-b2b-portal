begin;

alter table public.one_c_service_history
  add column serial_resolution_state text not null default 'pending'
    check (serial_resolution_state in ('pending','not_applicable','resolved','unmapped','conflict')),
  add column serial_source_fingerprint text null
    check (serial_source_fingerprint is null or serial_source_fingerprint ~ '^[0-9a-f]{64}$'),
  add column serial_enriched_at timestamptz null,
  add column warranty_link_state text not null default 'not_found'
    check (warranty_link_state in ('not_found','linked','review_required','conflict')),
  add column warranty_last_sale_event_id uuid null references public.warranty_serial_events(id) on delete restrict;

update public.one_c_service_history
set serial_resolution_state = 'not_applicable'
where one_c_serial_ref is null;

create index one_c_service_history_serial_pending_idx
  on public.one_c_service_history (id)
  where one_c_serial_ref is not null and serial_resolution_state = 'pending';
create index one_c_service_history_company_list_cover_idx
  on public.one_c_service_history (company_id, source_document_date desc, id desc)
  include (source_document_number, normalized_status, product_id, masked_serial, reported_fault,
    warranty_state_snapshot, warranty_end_date, updated_at)
  where partner_visible and is_active;

create table public.one_c_service_serial_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  cursor_id uuid null,
  page_size integer not null default 100 check (page_size between 1 and 100),
  pages_processed integer not null default 0,
  total_with_serial_ref integer not null default 0,
  rows_processed integer not null default 0,
  serial_resolved integer not null default 0,
  serial_unmapped integer not null default 0,
  serial_conflicting integer not null default 0,
  warranty_state_linked integer not null default 0,
  lock_token uuid null,
  locked_until timestamptz null,
  safe_error_code text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  updated_at timestamptz not null default now()
);

create unique index one_c_service_serial_enrichment_one_running_idx
  on public.one_c_service_serial_enrichment_runs ((true)) where status='running';
create index one_c_service_serial_enrichment_started_idx
  on public.one_c_service_serial_enrichment_runs (started_at desc);

alter table public.one_c_service_serial_enrichment_runs enable row level security;
revoke all on public.one_c_service_serial_enrichment_runs from public,anon,authenticated;
grant all on public.one_c_service_serial_enrichment_runs to service_role;

create or replace function public.reset_one_c_service_serial_enrichment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.one_c_serial_ref is distinct from old.one_c_serial_ref then
    new.serial_hash:=null;
    new.protected_serial:=null;
    new.masked_serial:=null;
    new.serial_resolution_state:=case when new.one_c_serial_ref is null then 'not_applicable' else 'pending' end;
    new.serial_source_fingerprint:=null;
    new.serial_enriched_at:=null;
    new.warranty_link_state:='not_found';
    new.warranty_last_sale_event_id:=null;
    new.warranty_state_snapshot:=null;
    new.warranty_start_date:=null;
    new.warranty_end_date:=null;
  end if;
  return new;
end $$;

create trigger one_c_service_history_serial_source_changed
before update of one_c_serial_ref on public.one_c_service_history
for each row execute function public.reset_one_c_service_serial_enrichment();

create or replace function public.claim_one_c_service_serial_enrichment(p_page_size integer default 100)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare target public.one_c_service_serial_enrichment_runs; token uuid:=gen_random_uuid(); batch jsonb; batch_count integer; complete boolean;
begin
  if auth.role()<>'service_role' then raise exception 'Service-role access required.' using errcode='42501'; end if;
  if p_page_size not between 1 and 100 then raise exception 'Invalid serial-enrichment page size.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext('one_c_service_serial_enrichment'));
  update public.one_c_service_serial_enrichment_runs set status='failed',safe_error_code='stale_lock',finished_at=now(),updated_at=now(),lock_token=null,locked_until=null
  where status='running' and locked_until<now();
  select * into target from public.one_c_service_serial_enrichment_runs where status='running' limit 1 for update;
  if not found then
    if not exists(select 1 from public.one_c_service_history where one_c_serial_ref is not null and serial_resolution_state='pending') then return null; end if;
    insert into public.one_c_service_serial_enrichment_runs(page_size,total_with_serial_ref)
    values(p_page_size,(select count(*) from public.one_c_service_history where one_c_serial_ref is not null)) returning * into target;
  end if;
  if target.locked_until is not null and target.locked_until>=now() then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'serialRef',one_c_serial_ref) order by id),'[]'::jsonb),count(*)
  into batch,batch_count from (
    select id,one_c_serial_ref from public.one_c_service_history
    where one_c_serial_ref is not null and serial_resolution_state='pending' and (target.cursor_id is null or id>target.cursor_id)
    order by id limit target.page_size
  ) pending;
  if batch_count=0 and target.cursor_id is not null then
    update public.one_c_service_serial_enrichment_runs set cursor_id=null,updated_at=now() where id=target.id returning * into target;
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'serialRef',one_c_serial_ref) order by id),'[]'::jsonb),count(*)
    into batch,batch_count from (
      select id,one_c_serial_ref from public.one_c_service_history
      where one_c_serial_ref is not null and serial_resolution_state='pending'
      order by id limit target.page_size
    ) pending;
  end if;
  if batch_count=0 then
    update public.one_c_service_serial_enrichment_runs set status='succeeded',finished_at=now(),updated_at=now(),lock_token=null,locked_until=null where id=target.id;
    return null;
  end if;
  select not exists(
    select 1 from public.one_c_service_history h
    where h.one_c_serial_ref is not null and h.serial_resolution_state='pending'
      and h.id>(select max(item->>'id')::uuid from jsonb_array_elements(batch) item)
  ) into complete;
  update public.one_c_service_serial_enrichment_runs set lock_token=token,locked_until=now()+interval '4 minutes',updated_at=now() where id=target.id;
  return jsonb_build_object('runId',target.id,'lockToken',token,'rows',batch,'pageComplete',complete);
end $$;

create or replace function public.publish_one_c_service_serial_enrichment(
  p_run_id uuid,p_lock_token uuid,p_rows jsonb,p_page_complete boolean
) returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare run public.one_c_service_serial_enrichment_runs; processed integer:=0; resolved integer:=0; unmapped integer:=0;
  conflicting integer:=0; warranty_linked integer:=0; next_cursor uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service-role access required.' using errcode='42501'; end if;
  select * into run from public.one_c_service_serial_enrichment_runs where id=p_run_id for update;
  if not found or run.status<>'running' or run.lock_token is distinct from p_lock_token or run.locked_until<now() then
    raise exception 'Invalid serial-enrichment lease.' using errcode='40001';
  end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb))<>'array' then raise exception 'Invalid serial-enrichment page.' using errcode='22023'; end if;
  create temporary table service_serial_source on commit drop as
  select * from jsonb_to_recordset(p_rows) as row(
    id uuid,serial_ref text,resolution_state text,serial_hash text,protected_serial text,masked_serial text,serial_source_fingerprint text
  );
  if exists(select 1 from service_serial_source where id is null
    or serial_ref !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or resolution_state not in ('resolved','unmapped','conflict')
    or serial_source_fingerprint !~ '^[0-9a-f]{64}$'
    or (resolution_state='resolved' and (serial_hash !~ '^[0-9a-f]{64}$' or protected_serial is null or masked_serial is null))
    or (resolution_state<>'resolved' and (serial_hash is not null or protected_serial is not null or masked_serial is not null))) then
    raise exception 'Invalid serial-enrichment row.' using errcode='22023';
  end if;
  if exists(select 1 from service_serial_source source left join public.one_c_service_history history on history.id=source.id
    where history.id is null or lower(history.one_c_serial_ref)<>lower(source.serial_ref)) then
    raise exception 'Stale serial-enrichment source.' using errcode='40001';
  end if;
  with candidates as (
    select source.*,history.company_id,history.product_id,state.last_sale_company_id,state.last_sale_product_id,
      state.last_sale_event_id,state.warranty_state,state.warranty_start_date,state.warranty_end_date,state.chronology_complete,
      case when state.normalized_serial_hash is null then 'not_found'
        when state.last_sale_company_id is distinct from history.company_id
          or (state.last_sale_product_id is not null and history.product_id is not null and state.last_sale_product_id<>history.product_id) then 'conflict'
        when not state.chronology_complete or state.warranty_state in ('sale_confirmed_review_required','source_incomplete','manual_review_required','conflict') then 'review_required'
        else 'linked' end link_state
    from service_serial_source source join public.one_c_service_history history on history.id=source.id
    left join public.warranty_serial_state state on state.normalized_serial_hash=source.serial_hash
  ),updated as (
    update public.one_c_service_history history set
      serial_hash=case when candidate.resolution_state='resolved' then candidate.serial_hash end,
      protected_serial=case when candidate.resolution_state='resolved' then candidate.protected_serial end,
      masked_serial=case when candidate.resolution_state='resolved' then candidate.masked_serial end,
      serial_resolution_state=candidate.resolution_state,
      serial_source_fingerprint=candidate.serial_source_fingerprint,
      serial_enriched_at=now(),
      warranty_link_state=case when candidate.resolution_state='resolved' then candidate.link_state else 'not_found' end,
      warranty_last_sale_event_id=case when candidate.resolution_state='resolved' and candidate.link_state in ('linked','review_required') then candidate.last_sale_event_id end,
      warranty_state_snapshot=case when candidate.resolution_state='resolved' and candidate.link_state in ('linked','review_required') then candidate.warranty_state end,
      warranty_start_date=case when candidate.resolution_state='resolved' and candidate.link_state in ('linked','review_required') then candidate.warranty_start_date end,
      warranty_end_date=case when candidate.resolution_state='resolved' and candidate.link_state in ('linked','review_required') then candidate.warranty_end_date end,
      updated_at=now()
    from candidates candidate where history.id=candidate.id
    returning history.serial_resolution_state,history.warranty_link_state,history.id
  ) select count(*),count(*) filter(where serial_resolution_state='resolved'),count(*) filter(where serial_resolution_state='unmapped'),
    count(*) filter(where serial_resolution_state='conflict' or warranty_link_state='conflict'),
    count(*) filter(where warranty_link_state in ('linked','review_required')),max(id::text)::uuid
  into processed,resolved,unmapped,conflicting,warranty_linked,next_cursor from updated;
  update public.one_c_service_serial_enrichment_runs set
    pages_processed=pages_processed+1,rows_processed=rows_processed+processed,
    serial_resolved=serial_resolved+resolved,serial_unmapped=serial_unmapped+unmapped,
    serial_conflicting=serial_conflicting+conflicting,warranty_state_linked=warranty_state_linked+warranty_linked,
    cursor_id=next_cursor,lock_token=null,locked_until=null,
    status=case when p_page_complete then 'succeeded' else status end,
    finished_at=case when p_page_complete then now() else finished_at end,updated_at=now()
  where id=p_run_id;
  return jsonb_build_object('processed',processed,'resolved',resolved,'unmapped',unmapped,'conflicting',conflicting,
    'warrantyLinked',warranty_linked,'completed',p_page_complete);
end $$;

create or replace function public.fail_one_c_service_serial_enrichment(p_run_id uuid,p_lock_token uuid,p_error_code text)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service-role access required.' using errcode='42501'; end if;
  update public.one_c_service_serial_enrichment_runs set status='failed',safe_error_code=left(coalesce(p_error_code,'unknown'),100),
    lock_token=null,locked_until=null,finished_at=now(),updated_at=now()
  where id=p_run_id and status='running' and lock_token=p_lock_token;
end $$;

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

create or replace function public.get_admin_one_c_service_history(p_id uuid)
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
select case when public.has_internal_permission('admin.service.view') then jsonb_build_object(
 'id',h.id,'number',h.source_document_number,'date',h.source_document_date,'status',h.normalized_status,
 'sourceStatus',h.source_status,'product',case when p.id is not null and p.is_active and p.is_visible then jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'imageUrl',p.image_url,'href','/cabinet/catalog/'||p.slug) else jsonb_build_object('id',null,'sku',h.product_sku_snapshot,'name',h.product_name_snapshot,'imageUrl',null,'href',null) end,
 'maskedSerial',h.masked_serial,'protectedSerial',h.protected_serial,'reportedFault',h.reported_fault,'resolution',h.partner_visible_resolution,
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
 'serialResolved',(select count(*) from public.one_c_service_history where serial_resolution_state='resolved'),
 'serialUnmapped',(select count(*) from public.one_c_service_history where serial_resolution_state='unmapped'),
 'serialConflicting',(select count(*) from public.one_c_service_history where serial_resolution_state='conflict' or warranty_link_state='conflict'),
 'warrantyStateLinked',(select count(*) from public.one_c_service_history where warranty_link_state in ('linked','review_required')),
 'activeRepairs',(select count(*) from public.one_c_service_history where is_active and normalized_status not in ('issued_to_customer','closed','rejected')),
 'readyForPickup',(select count(*) from public.one_c_service_history where is_active and normalized_status='ready_for_pickup'),
 'issued',(select count(*) from public.one_c_service_history where normalized_status='issued_to_customer'),
 'unknownStatuses',(select count(*) from public.one_c_service_history where normalized_status='unknown'),
 'inactive',(select count(*) from public.one_c_service_history where not is_active),
 'conflicts',(select count(*) from public.one_c_service_history_conflicts),
 'latestSourceDate',(select max(source_document_date) from public.one_c_service_history),
 'latestSync',(select to_jsonb(r) from public.one_c_service_history_sync_runs r order by started_at desc limit 1),
 'latestSerialEnrichment',(select to_jsonb(r) from public.one_c_service_serial_enrichment_runs r order by started_at desc limit 1)) else null end;
$$;

revoke all on function public.claim_one_c_service_serial_enrichment(integer),
  public.publish_one_c_service_serial_enrichment(uuid,uuid,jsonb,boolean),
  public.fail_one_c_service_serial_enrichment(uuid,uuid,text),
  public.reset_one_c_service_serial_enrichment() from public,anon,authenticated;
grant execute on function public.claim_one_c_service_serial_enrichment(integer),
  public.publish_one_c_service_serial_enrichment(uuid,uuid,jsonb,boolean),
  public.fail_one_c_service_serial_enrichment(uuid,uuid,text) to service_role;

commit;
