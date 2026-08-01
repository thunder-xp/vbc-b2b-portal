begin;

do $$
declare
  constraint_definition text;
  function_definition text;
  extended_function_definition text;
begin
  select pg_get_constraintdef(existing_constraint.oid) into constraint_definition
  from pg_constraint existing_constraint
  join pg_class relation on relation.oid = existing_constraint.conrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'partner_behavior_events'
    and existing_constraint.conname = 'partner_behavior_event_name_check';

  if constraint_definition is null then
    raise exception 'partner_behavior_event_name_check is unavailable';
  end if;

  if position('product_relations_tab_viewed' in constraint_definition) = 0 then
    execute 'alter table public.partner_behavior_events drop constraint partner_behavior_event_name_check';
    execute format(
      'alter table public.partner_behavior_events add constraint partner_behavior_event_name_check check ((%s) or event_name = any(array[''product_analog_section_viewed'',''product_related_section_viewed'',''product_analog_opened'',''product_related_opened'',''product_analog_added_to_cart'',''product_related_added_to_cart'',''product_relations_tab_viewed'']))',
      substring(constraint_definition from 8 for char_length(constraint_definition) - 8)
    );
  end if;

  select pg_get_functiondef(procedure.oid) into function_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'record_partner_behavior_event'
  limit 1;

  if function_definition is null then
    raise exception 'record_partner_behavior_event is unavailable';
  end if;

  if position('product_relations_tab_viewed' in function_definition) = 0 then
    extended_function_definition := replace(
      function_definition,
      '''product_pricing_tab_viewed''',
      '''product_pricing_tab_viewed'', ''product_analog_section_viewed'', ''product_related_section_viewed'', ''product_analog_opened'', ''product_related_opened'', ''product_analog_added_to_cart'', ''product_related_added_to_cart'', ''product_relations_tab_viewed'''
    );
    if extended_function_definition = function_definition then
      raise exception 'record_partner_behavior_event allowlist could not be extended';
    end if;
    execute extended_function_definition;
  end if;
end;
$$;

commit;
