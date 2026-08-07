begin;

update public.permissions
set scope = 'partner'
where code = 'service.serial.verify'
  and scope is distinct from 'partner';

insert into public.partner_access_preset_capabilities(preset_code, permission_id)
select 'full_partner_access', permission.id
from public.permissions permission
where permission.code = 'service.serial.verify'
  and permission.scope = 'partner'
on conflict do nothing;

insert into public.partner_company_capabilities(company_id, permission_id, enabled_by)
select policy.company_id, permission.id, policy.changed_by
from public.partner_company_access_policies policy
join public.permissions permission
  on permission.code = 'service.serial.verify'
 and permission.scope = 'partner'
where policy.preset_code = 'full_partner_access'
on conflict do nothing;

do $$
begin
  if not exists (
    select 1 from public.permissions
    where code = 'service.serial.verify' and scope = 'partner'
  ) then
    raise exception 'service_serial_verify_partner_scope_required' using errcode = '23514';
  end if;
end;
$$;

commit;
