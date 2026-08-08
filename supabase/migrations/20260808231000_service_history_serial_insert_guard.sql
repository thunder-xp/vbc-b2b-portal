begin;

create or replace function public.reset_one_c_service_serial_enrichment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    new.serial_resolution_state:=case when new.one_c_serial_ref is null then 'not_applicable' else 'pending' end;
  elsif new.one_c_serial_ref is distinct from old.one_c_serial_ref then
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

create trigger one_c_service_history_serial_source_inserted
before insert on public.one_c_service_history
for each row execute function public.reset_one_c_service_serial_enrichment();

revoke all on function public.reset_one_c_service_serial_enrichment() from public,anon,authenticated;

commit;
