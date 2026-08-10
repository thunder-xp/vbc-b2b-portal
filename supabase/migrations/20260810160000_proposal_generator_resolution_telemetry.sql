-- Record resolution facts when generation completes, before optional Estimate creation.

create or replace function public.record_estimate_generator_session_v2(
  target_company_id uuid,target_request_key uuid,target_request_fingerprint text,
  target_requirement_count integer,target_duration_ms integer,target_failed boolean,
  target_generation_mode text,target_structured_facts jsonb,
  target_resolved_catalog_count integer,target_own_nomenclature_count integer,
  target_shared_nomenclature_count integer,target_unresolved_count integer
) returns uuid language plpgsql security definer set search_path=public as $$
declare session_id uuid; total_resolution_count integer;
begin
  total_resolution_count:=coalesce(target_resolved_catalog_count,0)+coalesce(target_own_nomenclature_count,0)+coalesce(target_shared_nomenclature_count,0)+coalesce(target_unresolved_count,0);
  if least(target_resolved_catalog_count,target_own_nomenclature_count,target_shared_nomenclature_count,target_unresolved_count)<0
    or (not target_failed and total_resolution_count<>target_requirement_count)
    or (target_failed and total_resolution_count<>0) then
    raise exception 'Generator resolution metrics are invalid.' using errcode='22023';
  end if;
  session_id:=public.record_estimate_generator_session(
    target_company_id,target_request_key,target_request_fingerprint,target_requirement_count,target_duration_ms,
    target_failed,target_generation_mode,target_structured_facts
  );
  update public.estimate_generator_sessions set
    resolved_catalog_count=target_resolved_catalog_count,
    own_nomenclature_count=target_own_nomenclature_count,
    shared_nomenclature_count=target_shared_nomenclature_count,
    unresolved_count=target_unresolved_count
  where id=session_id and estimate_id is null;
  return session_id;
end;
$$;

revoke all on function public.record_estimate_generator_session_v2(uuid,uuid,text,integer,integer,boolean,text,jsonb,integer,integer,integer,integer) from public,anon;
grant execute on function public.record_estimate_generator_session_v2(uuid,uuid,text,integer,integer,boolean,text,jsonb,integer,integer,integer,integer) to authenticated;
