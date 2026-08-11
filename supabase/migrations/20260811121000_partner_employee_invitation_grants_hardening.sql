begin;

revoke all on function public.record_company_invitation_email_delivery(uuid, text)
  from public, anon, authenticated;
revoke all on function public.revoke_company_membership_access(uuid, text)
  from public, anon, authenticated;
revoke all on function public.accept_company_invitation(text)
  from public, anon, authenticated;
revoke all on function public.get_company_invitation_preview(text)
  from public, anon, authenticated;

grant execute on function public.get_company_invitation_preview(text)
  to anon, authenticated;
grant execute on function public.record_company_invitation_email_delivery(uuid, text)
  to authenticated;
grant execute on function public.revoke_company_membership_access(uuid, text)
  to authenticated;
grant execute on function public.accept_company_invitation(text)
  to authenticated;

commit;
