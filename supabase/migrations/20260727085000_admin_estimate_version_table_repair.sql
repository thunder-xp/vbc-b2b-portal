begin;

do $$
declare
  function_definition text;
begin
  function_definition := pg_get_functiondef(
    'public.get_admin_support_list(text,integer,integer)'::regprocedure
  );
  execute replace(
    function_definition,
    'public.estimate_proposal_versions',
    'public.estimate_versions'
  );
end;
$$;

commit;
