begin;

create or replace function public.can_access_service_evidence_object(p_storage_key text)
returns boolean
language sql
stable
security definer
set search_path=public
set row_security=off
as $$
 select exists(
  select 1
  from public.service_case_attachments attachment
  where attachment.storage_key=p_storage_key
    and public.can_access_service_case(attachment.case_id,false)
 )
$$;

create or replace function public.can_access_partner_support_evidence_object(p_storage_key text)
returns boolean
language sql
stable
security definer
set search_path=public
set row_security=off
as $$
 select exists(
  select 1
  from public.partner_support_ticket_attachments attachment
  where attachment.storage_key=p_storage_key
    and public.can_access_partner_support_ticket(attachment.ticket_id,false)
 )
$$;

drop policy if exists "Service evidence scoped read" on storage.objects;
create policy "Service evidence scoped read" on storage.objects
for select to authenticated
using(bucket_id='service-evidence' and public.can_access_service_evidence_object(name));

drop policy if exists "Partner support evidence scoped read" on storage.objects;
create policy "Partner support evidence scoped read" on storage.objects
for select to authenticated
using(bucket_id='partner-support-evidence' and public.can_access_partner_support_evidence_object(name));

revoke all on function public.can_access_service_evidence_object(text),public.can_access_partner_support_evidence_object(text) from public,anon;
grant execute on function public.can_access_service_evidence_object(text),public.can_access_partner_support_evidence_object(text) to authenticated;

commit;
