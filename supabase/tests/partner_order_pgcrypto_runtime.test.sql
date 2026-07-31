begin;

do $$
declare
  extension_schema text;
  trigger_definition text;
  trigger_config text[];
  trigger_is_security_definer boolean;
begin
  select extnamespace::regnamespace::text
  into extension_schema
  from pg_extension
  where extname = 'pgcrypto';

  if extension_schema is distinct from 'extensions' then
    raise exception 'pgcrypto is not installed in extensions.';
  end if;
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'extensions.digest(text,text) does not resolve.';
  end if;

  perform extensions.digest(
    'partner-order-pgcrypto-smoke'::text,
    'sha256'::text
  );

  select pg_get_functiondef(oid), proconfig, prosecdef
  into trigger_definition, trigger_config, trigger_is_security_definer
  from pg_proc
  where oid = 'public.record_partner_order_notification_transition()'::regprocedure;

  if trigger_definition not like '%extensions.digest(%' then
    raise exception 'Order notification trigger does not schema-qualify digest.';
  end if;
  if trigger_config @> array['search_path=public', 'row_security=off'] is not true then
    raise exception 'Order notification trigger runtime settings changed.';
  end if;
  if trigger_is_security_definer is not true then
    raise exception 'Order notification trigger is no longer security definer.';
  end if;
end;
$$;

rollback;
