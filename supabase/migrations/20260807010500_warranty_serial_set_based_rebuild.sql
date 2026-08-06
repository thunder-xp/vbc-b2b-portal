begin;

create index if not exists warranty_serial_events_cancellation_idx
  on public.warranty_serial_events(normalized_serial_hash,related_source_document_ref,observed_at desc,id desc)
  where event_type in ('sale_unposted','sale_deleted');

create index if not exists warranty_serial_events_return_idx
  on public.warranty_serial_events(normalized_serial_hash,related_source_document_ref,source_document_date desc,id desc)
  where event_type='customer_return';

create index if not exists warranty_serial_events_conflict_idx
  on public.warranty_serial_events(normalized_serial_hash,source_document_date desc,id desc)
  where event_type='conflict_observed';

create or replace function public.rebuild_warranty_serial_states(p_run_id uuid)
returns integer language plpgsql security definer set search_path=public set row_security=off as $$
declare rebuilt integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'Warranty state rebuild denied' using errcode='42501'; end if;

  with run_state as (
    select run.*,(now() at time zone 'Europe/Chisinau')::date business_date
    from public.warranty_serial_sync_runs run
    where run.id=p_run_id and run.status='running'
      and run.sales_scan_complete and run.returns_scan_complete
  ), latest_sale as (
    select distinct on (event.normalized_serial_hash) event.*
    from public.warranty_serial_events event
    where event.event_type in ('sale_observed','resale_observed')
    order by event.normalized_serial_hash,event.source_document_date desc,
      case event.event_type when 'resale_observed' then 2 else 1 end desc,
      event.source_document_ref desc,event.source_line_number desc,
      event.source_serial_line_number desc,event.observed_at desc,event.id desc
  ), latest_cancellation as (
    select distinct on (event.normalized_serial_hash) event.*
    from public.warranty_serial_events event
    join latest_sale sale on sale.normalized_serial_hash=event.normalized_serial_hash
      and event.related_source_document_ref=sale.source_document_ref
    where event.event_type in ('sale_unposted','sale_deleted')
    order by event.normalized_serial_hash,event.observed_at desc,event.id desc
  ), valid_returns as (
    select distinct on (event.normalized_serial_hash) event.*
    from public.warranty_serial_events event
    where event.event_type='customer_return'
      and exists(
        select 1 from public.warranty_serial_events prior_sale
        where prior_sale.normalized_serial_hash=event.normalized_serial_hash
          and prior_sale.event_type in ('sale_observed','resale_observed')
          and prior_sale.source_document_ref=event.related_source_document_ref
          and prior_sale.source_document_date<=event.source_document_date
      )
    order by event.normalized_serial_hash,event.source_document_date desc,event.source_document_ref desc,event.id desc
  ), latest_conflict as (
    select distinct on (event.normalized_serial_hash) event.*
    from public.warranty_serial_events event
    where event.event_type='conflict_observed'
    order by event.normalized_serial_hash,event.source_document_date desc,event.id desc
  ), evidence as (
    select sale.*,
      cancellation.id cancellation_id,cancellation.event_type cancellation_type,
      returned.id return_id,returned.source_document_date return_date,
      conflict.id conflict_id,
      case when sale.warranty_months_snapshot is null then null
        else public.warranty_add_calendar_months(sale.source_document_date::date,sale.warranty_months_snapshot) end warranty_end,
      (run_state.range_start<=sale.source_document_date::date
        and run_state.range_end>=run_state.business_date
        and run_state.started_at>now()-interval '36 hours') chronology_complete,
      run_state.business_date
    from latest_sale sale
    cross join run_state
    left join latest_cancellation cancellation using(normalized_serial_hash)
    left join valid_returns returned using(normalized_serial_hash)
    left join latest_conflict conflict using(normalized_serial_hash)
  ), classified as (
    select evidence.*,
      case
        when conflict_id is not null or mapping_state='conflict' then 'conflict'
        when cancellation_id is not null then 'sale_cancelled'
        when return_id is not null and return_date>=source_document_date then 'returned'
        when return_id is not null and source_document_date>return_date then 'resold'
        when company_id is null or product_id is null then 'source_incomplete'
        else 'sale_confirmed'
      end ownership,
      case
        when conflict_id is not null or mapping_state='conflict' then 'conflict'
        when cancellation_id is not null then 'cancelled'
        when return_id is not null and return_date>=source_document_date then 'returned'
        when return_id is not null and source_document_date>return_date then 'sale_confirmed_review_required'
        when company_id is null or product_id is null then 'source_incomplete'
        when warranty_months_snapshot is null or warranty_months_snapshot<=0 then 'warranty_period_missing'
        when not chronology_complete then 'sale_confirmed_review_required'
        when business_date<=warranty_end then 'covered'
        else 'expired'
      end warranty,
      case
        when conflict_id is not null or mapping_state='conflict' then array['conflicting_source_evidence']::text[]
        when cancellation_id is not null then array[cancellation_type]::text[]
        when return_id is not null and return_date>=source_document_date then array['customer_return']::text[]
        when return_id is not null and source_document_date>return_date then array['resale_requires_complete_chronology']::text[]
        when company_id is null then array['company_unmapped']::text[]
        when product_id is null then array['product_unmapped']::text[]
        when warranty_months_snapshot is null or warranty_months_snapshot<=0 then array['warranty_period_missing']::text[]
        when not chronology_complete then array['reversal_scan_incomplete_or_stale']::text[]
        else '{}'::text[]
      end reasons,
      case when return_id is not null and source_document_date>return_date then false else chronology_complete end complete
    from evidence
  )
  insert into public.warranty_serial_state(normalized_serial_hash,current_company_id,current_product_id,
    last_sale_company_id,last_sale_product_id,current_event_id,last_sale_event_id,last_return_event_id,
    ownership_state,warranty_state,warranty_start_date,warranty_end_date,warranty_months,chronology_complete,
    review_reason_codes,source_fingerprint)
  select normalized_serial_hash,
    case when ownership in ('sale_confirmed','resold') then company_id end,
    case when ownership in ('sale_confirmed','resold') then product_id end,
    company_id,product_id,coalesce(conflict_id,cancellation_id,return_id,id),id,return_id,
    ownership,warranty,source_document_date::date,warranty_end,warranty_months_snapshot,complete,reasons,
    encode(extensions.digest(normalized_serial_hash||'|'||id::text||'|'||coalesce(return_id::text,'')||'|'||
      coalesce(cancellation_id::text,'')||'|'||coalesce(conflict_id::text,'')||'|'||complete::text,'sha256'),'hex')
  from classified
  on conflict(normalized_serial_hash) do update set
    current_company_id=excluded.current_company_id,current_product_id=excluded.current_product_id,
    last_sale_company_id=excluded.last_sale_company_id,last_sale_product_id=excluded.last_sale_product_id,
    current_event_id=excluded.current_event_id,last_sale_event_id=excluded.last_sale_event_id,
    last_return_event_id=excluded.last_return_event_id,ownership_state=excluded.ownership_state,
    warranty_state=excluded.warranty_state,warranty_start_date=excluded.warranty_start_date,
    warranty_end_date=excluded.warranty_end_date,warranty_months=excluded.warranty_months,
    chronology_complete=excluded.chronology_complete,review_reason_codes=excluded.review_reason_codes,
    source_fingerprint=excluded.source_fingerprint,calculated_at=now(),version=public.warranty_serial_state.version+1;

  get diagnostics rebuilt=row_count;
  return rebuilt;
end $$;

revoke all on function public.rebuild_warranty_serial_states(uuid) from public,anon,authenticated;
grant execute on function public.rebuild_warranty_serial_states(uuid) to service_role;

commit;
