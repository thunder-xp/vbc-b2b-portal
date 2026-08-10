begin;

create or replace function public.list_partner_finance_sync_companies(
  p_limit integer default 10
)
returns table (
  company_id uuid,
  company_name text,
  counterparty_ref text,
  active_balance_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Finance synchronization selection is server-only.' using errcode = '42501';
  end if;

  if p_limit < 1 or p_limit > 10 then
    raise exception 'Finance synchronization batch size is invalid.' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select company.id, company.display_name, company.external_1c_id
    from public.partner_companies company
    left join public.partner_finance_sync_state state on state.company_id = company.id
    where company.status = 'active'
    order by state.last_attempt_at asc nulls first, company.id
    limit p_limit
  )
  select
    candidate.id,
    candidate.display_name,
    candidate.external_1c_id,
    coalesce(balance_count.active_count, 0)
  from candidates candidate
  left join lateral (
    select count(*)::bigint as active_count
    from public.partner_contract_balances balance
    where balance.company_id = candidate.id
      and balance.is_active = true
  ) balance_count on true
  order by candidate.id;
end;
$$;

revoke all on function public.list_partner_finance_sync_companies(integer)
  from public, anon, authenticated;
grant execute on function public.list_partner_finance_sync_companies(integer)
  to service_role;

comment on function public.list_partner_finance_sync_companies(integer) is
  'Returns a bounded fair finance-sync batch, prioritizing companies never or least recently attempted.';

commit;
