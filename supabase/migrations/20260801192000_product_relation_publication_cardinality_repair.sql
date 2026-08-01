begin;

create or replace function public.enqueue_all_partner_commercial_opportunity_companies()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  company record;
  affected integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for company in
    select distinct membership.company_id
    from public.company_memberships membership
    where membership.status = 'active'
    order by membership.company_id
  loop
    perform public.enqueue_partner_commercial_opportunity_company(
      company.company_id,
      'scheduled_refresh'
    );
    affected := affected + 1;
  end loop;

  return affected;
end;
$$;

revoke all on function public.enqueue_all_partner_commercial_opportunity_companies()
from public, anon, authenticated;
grant execute on function public.enqueue_all_partner_commercial_opportunity_companies()
to service_role;

comment on function public.enqueue_all_partner_commercial_opportunity_companies() is
  'Enqueues each active partner company independently to avoid multi-row UPSERT cardinality conflicts.';

commit;
