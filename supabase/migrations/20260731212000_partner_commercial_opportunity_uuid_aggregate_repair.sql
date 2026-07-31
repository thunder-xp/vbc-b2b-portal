begin;

do $$
declare definition text;
begin
  select pg_get_functiondef(procedure.oid) into definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'refresh_partner_commercial_opportunities'
  limit 1;

  if definition is null then raise exception 'Commercial opportunity refresh function is unavailable.'; end if;
  definition := replace(
    definition,
    'min(list.id) filter (where not list.is_system_favorites) list_id',
    '(array_agg(list.id order by list.id) filter (where not list.is_system_favorites))[1] list_id'
  );
  definition := replace(
    definition,
    'min(template.id) template_id',
    '(array_agg(template.id order by template.id))[1] template_id'
  );
  execute definition;
end;
$$;

commit;
