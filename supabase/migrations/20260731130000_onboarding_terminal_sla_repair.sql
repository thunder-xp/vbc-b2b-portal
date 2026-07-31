begin;

-- Keep the deployed signature and body intact while inserting the terminal
-- status guard exactly once.
do $migration$
declare
  function_definition text;
  original_definition text;
begin
  select pg_get_functiondef(procedure.oid)
  into function_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'get_onboarding_queue'
    and pg_get_function_identity_arguments(procedure.oid) =
      'p_page integer, p_page_size integer, p_status text, p_assigned_manager uuid, p_unassigned boolean, p_sla text, p_match_state text, p_search text, p_locality text, p_business_type text, p_submitted_from date, p_submitted_to date';

  if function_definition is null then
    raise exception 'The onboarding queue function is missing.';
  end if;

  if position(
    'when onboarding_status in (''approved'', ''rejected'', ''cancelled'') then ''completed'''
    in function_definition
  ) > 0 then
    return;
  end if;

  original_definition := function_definition;
  function_definition := replace(
    function_definition,
    $search$case
        when onboarding_status = 'clarification_requested' then 'paused'$search$,
    $replacement$case
        when onboarding_status in ('approved', 'rejected', 'cancelled') then 'completed'
        when onboarding_status = 'clarification_requested' then 'paused'$replacement$
  );

  if function_definition = original_definition then
    raise exception 'The onboarding queue SLA projection has an unexpected shape.';
  end if;

  execute function_definition;
end;
$migration$;

commit;
