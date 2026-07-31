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
    'array_agg(signal.reason_code order by signal.priority, signal.reason_code)' || chr(10) ||
      '        over (partition by signal.user_id, signal.product_id) all_reasons',
    'array_agg(signal.reason_code) over (' || chr(10) ||
      '        partition by signal.user_id, signal.product_id' || chr(10) ||
      '        order by signal.priority, signal.reason_code' || chr(10) ||
      '        rows between unbounded preceding and unbounded following' || chr(10) ||
      '      ) all_reasons'
  );
  execute definition;
end;
$$;

commit;
