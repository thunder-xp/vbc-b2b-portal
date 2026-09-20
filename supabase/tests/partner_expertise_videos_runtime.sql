\set ON_ERROR_STOP on
begin;
select plan(10);

insert into auth.users(id, aud, role, email, created_at, updated_at) values
  ('7e000000-0000-4000-8000-000000000001','authenticated','authenticated','expertise-admin@example.test',now(),now()),
  ('7e000000-0000-4000-8000-000000000002','authenticated','authenticated','expertise-partner@example.test',now(),now()),
  ('7e000000-0000-4000-8000-000000000003','authenticated','authenticated','expertise-outsider@example.test',now(),now());
insert into public.user_profiles(id,email,full_name,status,user_type) values
  ('7e000000-0000-4000-8000-000000000001','expertise-admin@example.test','Expertise Admin','active','internal'),
  ('7e000000-0000-4000-8000-000000000002','expertise-partner@example.test','Expertise Partner','active','partner'),
  ('7e000000-0000-4000-8000-000000000003','expertise-outsider@example.test','Expertise Outsider','active','partner');
insert into public.internal_user_role_assignments(user_id,role_id,assigned_by)
select '7e000000-0000-4000-8000-000000000001', id, null from public.roles where code='novotech_admin';
insert into public.partner_companies(id,external_1c_id,display_name,status)
values ('7e000000-0000-4000-8000-000000000101','expertise-runtime','Expertise Runtime','active');
insert into public.company_memberships(user_id,company_id,role_id,status)
select '7e000000-0000-4000-8000-000000000002','7e000000-0000-4000-8000-000000000101',id,'active' from public.roles where code='partner_viewer';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','7e000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.save_admin_partner_expertise_video(null,'LAB','dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ','Лаборатория','Laborator','Описание','Descriere',10,null)$$,'content manager can create a governed draft');
select set_config('request.jwt.claim.sub','7e000000-0000-4000-8000-000000000002',true);
select is(jsonb_array_length(public.list_partner_expertise_videos('7e000000-0000-4000-8000-000000000101','LAB','ru')),0,'draft is excluded from Partner read');
select set_config('request.jwt.claim.sub','7e000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.transition_admin_partner_expertise_video(((public.list_admin_partner_expertise_videos('LAB','DRAFT',10,0)->'items'->0->>'id')::uuid),'publish',1)$$,'admin can publish');

select set_config('request.jwt.claim.sub','7e000000-0000-4000-8000-000000000002',true);
select is(jsonb_array_length(public.list_partner_expertise_videos('7e000000-0000-4000-8000-000000000101','LAB','ru')),1,'active Partner sees published LAB video');
select is((select value->>'title' from jsonb_array_elements(public.list_partner_expertise_videos('7e000000-0000-4000-8000-000000000101','LAB','ro')) value limit 1),'Laborator','Romanian projection is selected server-side');
select ok(public.get_partner_expertise_video('7e000000-0000-4000-8000-000000000101',((public.list_partner_expertise_videos('7e000000-0000-4000-8000-000000000101','LAB','ru')->0->>'id')::uuid),'ru') is not null,'published watch lookup succeeds');
select throws_ok($$select * from public.partner_expertise_videos$$,'42501',null,'authenticated users cannot read table directly');

select set_config('request.jwt.claim.sub','7e000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.list_partner_expertise_videos('7e000000-0000-4000-8000-000000000101','LAB','ru')$$,'42501','Partner Expertise access denied.','non-member is rejected');

select set_config('request.jwt.claim.sub','7e000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.save_admin_partner_expertise_video(null,'LAB','bad','https://example.test','Bad','Bad','Bad','Bad',10,null)$$,'22023','Partner Expertise video input is invalid.','malformed provider identity is rejected');
select lives_ok($$select public.transition_admin_partner_expertise_video(((public.list_admin_partner_expertise_videos('LAB','PUBLISHED',10,0)->'items'->0->>'id')::uuid),'archive',2)$$,'published video can be archived');

select * from finish();
rollback;
