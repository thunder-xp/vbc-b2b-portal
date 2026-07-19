-- Partners may read only the active price type assigned to a company where
-- they hold active membership. Internal synchronization policies are unchanged.
drop policy if exists "Active partners select assigned price type" on public.price_types;
create policy "Active partners select assigned price type"
on public.price_types
for select
to authenticated
using (
  is_active
  and exists (
    select 1
    from public.partner_companies company
    where company.status = 'active'
      and company.external_1c_price_type_id = price_types.external_ref
      and public.has_active_company_membership(company.id)
  )
);

comment on policy "Active partners select assigned price type" on public.price_types is
  'Allows an authenticated partner to resolve the display name of only the active price type assigned to their own active company.';
