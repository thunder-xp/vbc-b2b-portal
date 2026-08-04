create or replace function public.redact_partner_behavior_search_text()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_query_normalized := null;
  return new;
end;
$$;

drop trigger if exists redact_partner_behavior_search_text
  on public.partner_behavior_events;
create trigger redact_partner_behavior_search_text
before insert or update of search_query_normalized
on public.partner_behavior_events
for each row execute function public.redact_partner_behavior_search_text();

revoke all on function public.redact_partner_behavior_search_text()
  from public, anon, authenticated;
