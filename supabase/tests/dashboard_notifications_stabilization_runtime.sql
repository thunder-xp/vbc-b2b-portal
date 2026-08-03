begin;

select set_config('request.jwt.claim.sub','a5059f54-7b50-415d-a8a4-0a4e878af919',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $$
declare
  first_result jsonb;
  second_result jsonb;
begin
  first_result:=public.mark_all_partner_notifications_read_v2('a7dc797a-1597-432f-8f3a-b2957354fbb8');
  if (first_result->>'affectedCount')::integer<1 or (first_result->>'unreadCount')::integer<>0 then
    raise exception 'First mark-all result is invalid: %',first_result;
  end if;
  second_result:=public.mark_all_partner_notifications_read_v2('a7dc797a-1597-432f-8f3a-b2957354fbb8');
  if (second_result->>'affectedCount')::integer<>0 or (second_result->>'unreadCount')::integer<>0 then
    raise exception 'Repeated mark-all is not idempotent: %',second_result;
  end if;
end $$;

reset role;

do $$
declare audit_count integer;
begin
  select count(*) into audit_count
  from public.partner_notification_mutation_events
  where company_id='a7dc797a-1597-432f-8f3a-b2957354fbb8' and event_type='mark_all_read';
  if audit_count<>1 then
    raise exception 'Expected one mutation audit event, got %',audit_count;
  end if;
end $$;

do $$
declare
  preview jsonb;
  archived jsonb;
begin
  preview:=public.preview_partner_notification_cleanup('a7dc797a-1597-432f-8f3a-b2957354fbb8');
  archived:=public.archive_partner_notification_noise('a7dc797a-1597-432f-8f3a-b2957354fbb8');
  if (archived->>'affectedCount')::integer<>(preview->>'historicalDocumentBackfill')::integer
    +(preview->>'duplicateBusinessState')::integer then
    raise exception 'Cleanup result does not match its preview: %, %',preview,archived;
  end if;
end $$;

rollback;
