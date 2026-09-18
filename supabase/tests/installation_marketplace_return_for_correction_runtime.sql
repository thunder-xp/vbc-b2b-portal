begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values
  ('92000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','partner-correction@example.test','',now(),'{}','{}'),
  ('92000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-correction@example.test','',now(),'{}','{}');

insert into public.user_profiles(id,email,full_name,status,user_type,preferred_locale)
values
  ('92000000-0000-4000-8000-000000000001','partner-correction@example.test','Partner Correction','active','external','ro'),
  ('92000000-0000-4000-8000-000000000002','admin-correction@example.test','Admin Correction','active','internal','ru');

insert into public.roles(id,code,name,scope) values
  ('92000000-0000-4000-8000-000000000010','test_partner_correction','Test Partner Correction','partner'),
  ('92000000-0000-4000-8000-000000000011','test_admin_correction','Test Admin Correction','internal');
insert into public.permissions(id,code,description,scope) values
  ('92000000-0000-4000-8000-000000000020','installation_marketplace.manage','Test manage','partner'),
  ('92000000-0000-4000-8000-000000000021','admin.retail_marketplace.view','Test view','internal'),
  ('92000000-0000-4000-8000-000000000022','admin.retail_marketplace.manage','Test manage','internal')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select '92000000-0000-4000-8000-000000000010'::uuid,id from public.permissions where code='installation_marketplace.manage'
union all select '92000000-0000-4000-8000-000000000011'::uuid,id from public.permissions where code='admin.retail_marketplace.view'
union all select '92000000-0000-4000-8000-000000000011'::uuid,id from public.permissions where code='admin.retail_marketplace.manage';

insert into public.partner_companies(
  id,external_1c_id,display_name,status,public_directory_visible,
  public_display_name,public_directory_logo_asset_path
) values (
  '92000000-0000-4000-8000-000000000030','TEST-CORRECTION','Correction Provider','active',true,
  'Correction Provider','92000000-0000-4000-8000-000000000030/92000000-0000-4000-8000-000000000031.png'
);

alter table public.company_memberships disable trigger require_company_access_policy_for_active_membership;
insert into public.company_memberships(user_id,company_id,role_id,status,approved_at)
values('92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000030','92000000-0000-4000-8000-000000000010','active',now());
alter table public.company_memberships enable trigger require_company_access_policy_for_active_membership;

insert into public.internal_user_role_assignments(user_id,role_id,assigned_by)
values('92000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000011','92000000-0000-4000-8000-000000000002');

insert into public.installation_providers(
  id,provider_type,partner_company_id,operational_status,approval_status,marketplace_enabled,
  revision,participation_status,terms_version,terms_accepted_at,terms_accepted_by,
  privacy_version,privacy_accepted_at,privacy_accepted_by,submitted_at,reviewed_at,reviewed_by,
  created_by,updated_by
) values (
  '92000000-0000-4000-8000-000000000050','partner_company','92000000-0000-4000-8000-000000000030',
  'inactive','approved',false,5,'APPROVED',private.installation_marketplace_terms_version_v1(),now(),
  '92000000-0000-4000-8000-000000000001',private.installation_marketplace_privacy_version_v1(),now(),
  '92000000-0000-4000-8000-000000000001',now(),now(),'92000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002'
);
insert into public.installation_provider_profiles(
  provider_id,public_name_ru,public_name_ro,public_profile_status,availability_state,
  max_concurrent_jobs,contact_user_id,response_channel
) values (
  '92000000-0000-4000-8000-000000000050','Correction Provider','Correction Provider','draft','unavailable',
  null,'92000000-0000-4000-8000-000000000001','portal'
);
insert into public.installation_provider_competencies(
  provider_id,system_type,active,declaration_status,declared_by,declared_at,approved_at
)
select '92000000-0000-4000-8000-000000000050',capability,true,'self_declared',
  '92000000-0000-4000-8000-000000000001',now(),now()
from unnest(array['access_control','alarm','cctv','intercom','network']) capability;
insert into public.installation_provider_regions(provider_id,region_id,active)
select '92000000-0000-4000-8000-000000000050',id,true
from public.installation_service_regions where code='MD-CU';

insert into public.retail_marketplace_events(id,aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
values
  ('92000000-0000-4000-8000-000000000060','provider','92000000-0000-4000-8000-000000000050','provider_submitted',
    '92000000-0000-4000-8000-000000000001','{"revision":4}'::jsonb),
  ('92000000-0000-4000-8000-000000000061','provider','92000000-0000-4000-8000-000000000050','provider_approved',
    '92000000-0000-4000-8000-000000000002','{"status":"APPROVED"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated","email":"partner-correction@example.test"}',true);

do $$
begin
  perform public.admin_return_installation_partner_for_correction_v1(
    '92000000-0000-4000-8000-000000000050','Требуется уточнение','Este necesară completarea',5
  );
  raise exception 'partner invoked admin return-for-correction';
exception when sqlstate '42501' then null;
end;
$$;

select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated","email":"admin-correction@example.test"}',true);

do $$
begin
  perform public.admin_return_installation_partner_for_correction_v1(
    '92000000-0000-4000-8000-000000000050','','Este necesară completarea unor date înainte de aprobare.',5
  );
  raise exception 'empty correction reason was accepted';
exception when sqlstate '22023' then null;
end;
$$;

create temp table correction_result on commit drop as
select public.admin_return_installation_partner_for_correction_v1(
  '92000000-0000-4000-8000-000000000050',
  'Требуется уточнить данные анкеты перед подтверждением.',
  'Este necesară completarea unor date înainte de aprobare.',5
) result;

reset role;

do $$
declare provider public.installation_providers%rowtype; profile public.installation_provider_profiles%rowtype; evidence jsonb;
begin
  select * into provider from public.installation_providers where id='92000000-0000-4000-8000-000000000050';
  select * into profile from public.installation_provider_profiles where provider_id=provider.id;
  select safe_evidence into evidence from public.retail_marketplace_events
    where aggregate_id=provider.id and event_type='provider_returned_for_correction';
  if provider.participation_status<>'DRAFT' or provider.revision<>6 or provider.approval_status<>'pending'
    or provider.operational_status<>'inactive' or provider.marketplace_enabled or profile.public_profile_status<>'draft' then
    raise exception 'APPROVED -> DRAFT failed: %',to_jsonb(provider);
  end if;
  if profile.availability_state<>'unavailable' or profile.max_concurrent_jobs is not null
    or (select count(*) from public.installation_provider_competencies where provider_id=provider.id and active)<>5
    or not exists(select 1 from public.installation_provider_regions coverage join public.installation_service_regions region on region.id=coverage.region_id where coverage.provider_id=provider.id and region.code='MD-CU' and coverage.active)
    or provider.terms_version<>private.installation_marketplace_terms_version_v1()
    or provider.privacy_version<>private.installation_marketplace_privacy_version_v1() then
    raise exception 'preserved authoritative data changed';
  end if;
  if evidence->>'previousStatus'<>'APPROVED' or evidence->>'newStatus'<>'DRAFT'
    or (evidence->>'sourceRevision')::bigint<>5 or (evidence->>'resultingRevision')::bigint<>6
    or evidence->>'previousApprovalEventId'<>'92000000-0000-4000-8000-000000000061'
    or evidence->>'previousSubmissionEventId'<>'92000000-0000-4000-8000-000000000060' then
    raise exception 'correction evidence mismatch: %',evidence;
  end if;
  if (select count(*) from public.retail_marketplace_events where aggregate_id=provider.id and event_type='provider_approved')<>1
    or (select count(*) from public.retail_marketplace_events where aggregate_id=provider.id and event_type='provider_submitted')<>1 then
    raise exception 'historical approval/submission was not preserved';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated","email":"admin-correction@example.test"}',true);

update correction_result set result=public.admin_return_installation_partner_for_correction_v1(
  '92000000-0000-4000-8000-000000000050',
  'Требуется уточнить данные анкеты перед подтверждением.',
  'Este necesară completarea unor date înainte de aprobare.',5
);

do $$
begin
  if not (select (result->>'repeated')::boolean from correction_result)
    or (select count(*) from public.retail_marketplace_events where aggregate_id='92000000-0000-4000-8000-000000000050' and event_type='provider_returned_for_correction')<>1 then
    raise exception 'return-for-correction retry was not idempotent';
  end if;
end;
$$;

select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated","email":"partner-correction@example.test"}',true);

do $$
declare activation jsonb;
begin
  activation:=public.partner_get_installation_marketplace_activation_v1('92000000-0000-4000-8000-000000000030','ro');
  if activation->>'status'<>'DRAFT' or activation->>'correctionReason'<>'Este necesară completarea unor date înainte de aprobare.'
    or activation->'serviceAreaCodes'<>'["MD-CU"]'::jsonb or jsonb_array_length(activation->'capabilities')<>5 then
    raise exception 'Partner correction UX read model mismatch: %',activation;
  end if;
end;
$$;

update correction_result set result=public.partner_save_installation_marketplace_draft_v1(
  '92000000-0000-4000-8000-000000000030',
  'Монтаж и обслуживание систем безопасности',
  'Instalarea și întreținerea sistemelor de securitate',
  'available',2,array['cctv','intercom','access_control','alarm','network','other'],
  array['MD-CU'],true,true,6
);
update correction_result set result=public.partner_submit_installation_marketplace_v1(
  '92000000-0000-4000-8000-000000000030',(result->>'revision')::bigint
);

select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated","email":"admin-correction@example.test"}',true);

do $$
declare report jsonb; application jsonb; snapshot jsonb;
begin
  report:=public.admin_get_installation_partner_activation_v1();
  select value into application from jsonb_array_elements(report->'applications') value
    where value->>'companyId'='92000000-0000-4000-8000-000000000030';
  snapshot:=application->'submissionSnapshot'->'profile';
  if application->>'status'<>'PENDING_REVIEW' or (application->>'revision')::bigint<>8
    or not (application->>'submissionSnapshotComplete')::boolean
    or snapshot->>'descriptionRu'<>'Монтаж и обслуживание систем безопасности'
    or snapshot->>'descriptionRo'<>'Instalarea și întreținerea sistemelor de securitate'
    or snapshot->>'availability'<>'available' or (snapshot->>'maxConcurrentJobs')::integer<>2
    or snapshot->'serviceAreaCodes'<>'["MD-CU"]'::jsonb
    or not (snapshot->'capabilities' @> '[{"code":"other"}]'::jsonb)
    or jsonb_array_length(application->'submissionHistory')<>2
    or jsonb_array_length(application->'correctionHistory')<>1 then
    raise exception 'new immutable submission mismatch: %',application;
  end if;
  if (select safe_evidence from public.retail_marketplace_events where id='92000000-0000-4000-8000-000000000060')<>'{"revision":4}'::jsonb then
    raise exception 'old submission snapshot was mutated';
  end if;
end;
$$;

reset role;
update public.installation_providers set participation_status='ACTIVE',operational_status='active',approval_status='approved',marketplace_enabled=true,revision=9
where id='92000000-0000-4000-8000-000000000050';
update public.installation_provider_profiles set public_profile_status='published' where provider_id='92000000-0000-4000-8000-000000000050';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated","email":"admin-correction@example.test"}',true);

do $$
begin
  perform public.admin_return_installation_partner_for_correction_v1(
    '92000000-0000-4000-8000-000000000050','Причина уточнения','Motiv pentru corectare',9
  );
  raise exception 'ACTIVE return-for-correction was accepted';
exception when sqlstate '22023' then null;
end;
$$;

reset role;
rollback;
