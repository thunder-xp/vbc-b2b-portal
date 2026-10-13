-- Retain challenges referenced by the append-only Business Quick Auth audit.
-- ON DELETE RESTRICT remains authoritative. Only unaudited expired challenges
-- are eligible for the existing bounded cleanup; all login semantics stay intact.
do $migration$
declare
  v_definition text := pg_get_functiondef(
    'public.start_quick_auth_challenge_v1(text,text,text,boolean)'::regprocedure
  );
  v_before text := $before$    where expired.expires_at < now() - interval '24 hours'
    order by expired.expires_at$before$;
  v_after text := $after$    where expired.expires_at < now() - interval '24 hours'
      and not exists (
        select 1 from public.business_quick_auth_audit_events audit
        where audit.challenge_id = expired.id
      )
    order by expired.expires_at$after$;
begin
  -- Fail closed if the governed function no longer has exactly this cleanup.
  if (length(v_definition) - length(replace(v_definition, v_before, '')))
      / length(v_before) <> 1 then
    raise exception 'quick_auth_cleanup_contract_mismatch';
  end if;
  execute replace(v_definition, v_before, v_after);
end;
$migration$;
