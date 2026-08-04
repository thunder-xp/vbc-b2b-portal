begin;

grant execute on function public.can_access_partner_support_ticket(uuid,boolean) to authenticated;

commit;
