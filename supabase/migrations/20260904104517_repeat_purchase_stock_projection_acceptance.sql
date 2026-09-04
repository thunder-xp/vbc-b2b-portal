begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  function_name regprocedure;
  current_definition text;
  updated_definition text;
begin
  foreach function_name in array array[
    'private.refresh_partner_repeat_purchase_opportunities(uuid)'::regprocedure,
    'public.list_partner_commercial_opportunities(uuid,text,integer,integer)'::regprocedure
  ]
  loop
    select pg_get_functiondef(function_name) into current_definition;
    if strpos(current_definition, $guard$interval '5 hours'$guard$) = 0 then
      raise exception 'Expected stock freshness guard is absent from %', function_name;
    end if;
    updated_definition := replace(
      current_definition,
      $guard$interval '5 hours'$guard$,
      $guard$interval '24 hours'$guard$
    );
    execute updated_definition;
  end loop;
end;
$$;

comment on function private.refresh_partner_repeat_purchase_opportunities(uuid) is
  'Projects repeat demand only with governed price and an authoritative stock snapshot from the current daily stock cycle (maximum age 24 hours).';

insert into public.partner_commercial_opportunity_dirty_companies(company_id, reason)
select distinct membership.company_id, 'repeat_purchase_stock_window_v1'
from public.company_memberships membership
join public.partner_companies company
  on company.id = membership.company_id and company.status = 'active'
join public.roles role
  on role.id = membership.role_id and role.scope = 'partner'
where membership.status = 'active'
on conflict (company_id) do update set
  reason = excluded.reason,
  last_dirtied_at = now(),
  locked_at = null;

commit;
