create or replace function public.get_partner_order_history_merge_identity_matches(
  p_company_id uuid,
  p_external_refs text[],
  p_portal_order_ids uuid[]
)
returns table(external_1c_order_ref text, portal_order_id uuid)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history merge identity lookup is server-only.' using errcode = '42501';
  end if;

  return query
  select history.external_1c_order_ref, history.portal_order_id
  from public.partner_order_history history
  where history.company_id = p_company_id
    and (
      history.external_1c_order_ref = any(coalesce(p_external_refs, array[]::text[]))
      or history.portal_order_id = any(coalesce(p_portal_order_ids, array[]::uuid[]))
    );
end;
$$;

revoke all on function public.get_partner_order_history_merge_identity_matches(uuid, text[], uuid[])
  from public, anon, authenticated;
grant execute on function public.get_partner_order_history_merge_identity_matches(uuid, text[], uuid[])
  to service_role;

comment on function public.get_partner_order_history_merge_identity_matches(uuid, text[], uuid[]) is
  'Returns exact visible or hidden history identities for server-side portal-order merge suppression.';
