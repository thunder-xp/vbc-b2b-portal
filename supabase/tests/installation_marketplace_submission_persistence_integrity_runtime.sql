begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values
  ('91000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','partner-integrity@example.test','',now(),'{}','{}'),
  ('91000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-integrity@example.test','',now(),'{}','{}');

insert into public.user_profiles(id,email,full_name,status,user_type,preferred_locale)
values
  ('91000000-0000-4000-8000-000000000001','partner-integrity@example.test','Partner Integrity','active','external','ro'),
  ('91000000-0000-4000-8000-000000000002','admin-integrity@example.test','Admin Integrity','active','internal','ru')
on conflict(id) do update set status='active',user_type=excluded.user_type;

insert into public.roles(id,code,name,scope) values
  ('91000000-0000-4000-8000-000000000010','test_partner_integrity','Test Partner Integrity','partner'),
  ('91000000-0000-4000-8000-000000000011','test_admin_integrity','Test Admin Integrity','internal');
insert into public.permissions(id,code,description,scope) values
  ('91000000-0000-4000-8000-000000000020','installation_marketplace.manage','Test manage','partner'),
  ('91000000-0000-4000-8000-000000000021','admin.retail_marketplace.view','Test view','internal'),
  ('91000000-0000-4000-8000-000000000022','admin.retail_marketplace.manage','Test manage','internal')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select '91000000-0000-4000-8000-000000000010'::uuid,id from public.permissions where code='installation_marketplace.manage'
union all select '91000000-0000-4000-8000-000000000011'::uuid,id from public.permissions where code='admin.retail_marketplace.view'
union all select '91000000-0000-4000-8000-000000000011'::uuid,id from public.permissions where code='admin.retail_marketplace.manage';

insert into public.partner_companies(
  id,external_1c_id,display_name,status,public_directory_visible,
  public_display_name,public_directory_logo_asset_path
) values (
  '91000000-0000-4000-8000-000000000030','TEST-INTEGRITY','Integrity Provider','active',true,
  'Integrity Provider','91000000-0000-4000-8000-000000000030/91000000-0000-4000-8000-000000000031.png'
);

alter table public.company_memberships disable trigger require_company_access_policy_for_active_membership;
insert into public.company_memberships(user_id,company_id,role_id,status,approved_at)
values('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000030','91000000-0000-4000-8000-000000000010','active',now());
alter table public.company_memberships enable trigger require_company_access_policy_for_active_membership;

insert into public.internal_user_role_assignments(user_id,role_id,assigned_by)
values('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000002');
insert into public.installation_service_regions(id,code,parent_id,region_type,name_ru,name_ro,active)
values
  ('91000000-0000-4000-8000-000000000041','MD',null,'country','Молдова','Moldova',true),
  ('91000000-0000-4000-8000-000000000040','MD-CU','91000000-0000-4000-8000-000000000041','municipality','Кишинёв','Chișinău',true)
on conflict(code) do nothing;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","email":"partner-integrity@example.test"}',true);

create temp table integrity_result on commit drop as
select public.partner_opt_in_installation_marketplace_v1('91000000-0000-4000-8000-000000000030') result;

update integrity_result set result=public.partner_save_installation_marketplace_draft_v1(
  '91000000-0000-4000-8000-000000000030',
  'Монтаж и обслуживание систем безопасности',
  'Instalarea și întreținerea sistemelor de securitate',
  'available',2,
  array['cctv','intercom','access_control','alarm','network','other'],
  array['MD-CU'],true,true,(result->>'revision')::bigint
);

do $$
declare activation jsonb;
begin
  activation:=public.partner_get_installation_marketplace_activation_v1('91000000-0000-4000-8000-000000000030','ro');
  if activation->>'descriptionRu' <> 'Монтаж и обслуживание систем безопасности'
    or activation->>'descriptionRo' <> 'Instalarea și întreținerea sistemelor de securitate'
    or activation->>'availability' <> 'available'
    or (activation->>'maxConcurrentJobs')::integer <> 2
    or activation->'serviceAreaCodes' <> '["MD-CU"]'::jsonb
    or not (activation->'capabilities' @> '[{"code":"other"}]'::jsonb)
    or not (activation->'readiness'->>'submissionReady')::boolean then
    raise exception 'save/reload semantic equality failed: %',activation;
  end if;
end;
$$;

update integrity_result set result=public.partner_submit_installation_marketplace_v1(
  '91000000-0000-4000-8000-000000000030',(result->>'revision')::bigint
);

select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated","email":"admin-integrity@example.test"}',true);

do $$
declare report jsonb; application jsonb; snapshot jsonb;
begin
  report:=public.admin_get_installation_partner_activation_v1();
  select value into application from jsonb_array_elements(report->'applications') value
    where value->>'companyId'='91000000-0000-4000-8000-000000000030';
  snapshot:=application->'submissionSnapshot'->'profile';
  if application is null
    or not (application->>'submissionSnapshotComplete')::boolean
    or application->>'descriptionRu' <> 'Монтаж и обслуживание систем безопасности'
    or application->>'descriptionRo' <> 'Instalarea și întreținerea sistemelor de securitate'
    or application->>'availability' <> 'available'
    or (application->>'maxConcurrentJobs')::integer <> 2
    or snapshot->>'descriptionRu' <> application->>'descriptionRu'
    or snapshot->>'descriptionRo' <> application->>'descriptionRo'
    or snapshot->>'availability' <> application->>'availability'
    or (snapshot->>'maxConcurrentJobs')::integer <> (application->>'maxConcurrentJobs')::integer
    or snapshot->'serviceAreaCodes' <> '["MD-CU"]'::jsonb
    or jsonb_array_length(snapshot->'capabilities') <> 6
    or not (snapshot->'capabilities' @> '[{"code":"other"}]'::jsonb)
    or jsonb_array_length(application->'submissionHistory') <> 1 then
    raise exception 'submit/Admin snapshot semantic equality failed: %',application;
  end if;
end;
$$;

reset role;
rollback;
