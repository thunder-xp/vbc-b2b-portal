begin;

alter table public.warranty_serial_sync_runs
  add column if not exists rebuild_cursor text null
  check (rebuild_cursor is null or rebuild_cursor ~ '^[0-9a-f]{64}$');

create or replace function public.rebuild_warranty_serial_states_batch(
  p_run_id uuid,p_after_hash text default null,p_limit integer default 250
)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare target_hash text; last_hash text:=p_after_hash; sale public.warranty_serial_events;
  returned public.warranty_serial_events; cancelled public.warranty_serial_events;
  conflict public.warranty_serial_events; later_sale public.warranty_serial_events;
  end_date date; complete boolean; ownership text; warranty text; reasons text[]; rebuilt integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'Warranty state rebuild denied' using errcode='42501'; end if;
  if p_limit<1 or p_limit>1000 then raise exception 'Warranty state rebuild batch is invalid' using errcode='22023'; end if;
  for target_hash in
    select distinct normalized_serial_hash
    from public.warranty_serial_events
    where normalized_serial_hash>coalesce(p_after_hash,'')
    order by normalized_serial_hash
    limit p_limit
  loop
    last_hash:=target_hash;
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
  return jsonb_build_object('rebuilt',rebuilt,'lastHash',last_hash,'complete',rebuilt<p_limit);
end $$;

create or replace function public.complete_warranty_serial_sync_run(p_run_id uuid,p_lock_token uuid)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare run public.warranty_serial_sync_runs; batch jsonb; rebuilt integer; terminal boolean;
begin
  if auth.role()<>'service_role' then raise exception 'Warranty sync denied' using errcode='42501'; end if;
  select * into run from public.warranty_serial_sync_runs where id=p_run_id for update;
  if not found or run.status<>'running' or run.current_stage<>'state_rebuild' or run.lock_token is distinct from p_lock_token then
    raise exception 'Warranty sync completion lease is stale' using errcode='40001';
  end if;
  batch:=public.rebuild_warranty_serial_states_batch(p_run_id,run.rebuild_cursor,250);
  rebuilt:=(batch->>'rebuilt')::integer;
  terminal:=(batch->>'complete')::boolean;
  update public.warranty_serial_sync_runs set
    rebuild_cursor=nullif(batch->>'lastHash',''),states_rebuilt=states_rebuilt+rebuilt,
    status=case when terminal then 'succeeded' else status end,
    current_stage=case when terminal then 'completed' else current_stage end,
    lock_token=null,locked_until=null,finished_at=case when terminal then now() else null end
  where id=p_run_id;
  return jsonb_build_object('runId',p_run_id,'status',case when terminal then 'succeeded' else 'running' end,
    'statesRebuilt',rebuilt,'totalStatesRebuilt',(select states_rebuilt from public.warranty_serial_sync_runs where id=p_run_id));
end $$;

revoke all on function public.rebuild_warranty_serial_states_batch(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.complete_warranty_serial_sync_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rebuild_warranty_serial_states_batch(uuid,text,integer) to service_role;
grant execute on function public.complete_warranty_serial_sync_run(uuid,uuid) to service_role;

commit;
