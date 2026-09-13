\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,created_at,updated_at) values
('20000000-0000-4000-8000-000000000001','authenticated','authenticated','agent-one@example.test',now(),now()),
('20000000-0000-4000-8000-000000000002','authenticated','authenticated','agent-two@example.test',now(),now()),
('20000000-0000-4000-8000-000000000003','authenticated','authenticated','partner@example.test',now(),now());
insert into public.user_profiles(id,email,status,user_type) values
('20000000-0000-4000-8000-000000000001','agent-one@example.test','active','external'),
('20000000-0000-4000-8000-000000000002','agent-two@example.test','active','external'),
('20000000-0000-4000-8000-000000000003','partner@example.test','active','external');

insert into public.commercial_agents(id,user_id,agent_code,agent_type,display_name,status,compliance_status)
values
('21000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','MD-P-901','INDIVIDUAL','Agent One','ACTIVE','APPROVED'),
('21000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','MD-P-902','INDIVIDUAL','Agent Two','ACTIVE','APPROVED');

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

do $$ declare result jsonb; begin
  result := public.get_agent_cabinet_context();
  if result->>'agentCode' <> 'MD-P-901' or result->>'accessMode' <> 'OPERATIONAL' then raise exception 'Own context failed'; end if;
  result := public.ensure_agent_cabinet_primary_token(
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  );
  if result->>'publicToken' <> 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' then raise exception 'Primary token failed'; end if;
  if (public.ensure_agent_cabinet_primary_token(
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  )->>'id') <> result->>'id' then raise exception 'Primary token was not idempotent'; end if;
  perform public.update_agent_cabinet_profile('+37369000001','one@example.test','Chisinau','Consultant','Test');
end $$;

reset role;
do $$ begin
  if (select count(*) from public.agent_referral_tokens where agent_id='21000000-0000-4000-8000-000000000001') <> 1 then raise exception 'Token fanout'; end if;
  if exists(select 1 from public.agent_referral_tokens where agent_id='21000000-0000-4000-8000-000000000002') then raise exception 'Cross-agent token write'; end if;
  if (select status from public.commercial_agents where id='21000000-0000-4000-8000-000000000001') <> 'ACTIVE' then raise exception 'Protected status changed'; end if;
  if not exists(select 1 from public.agent_domain_events where agent_id='21000000-0000-4000-8000-000000000001' and event_type='AGENT_PROFILE_UPDATED' and safe_metadata->'fields' ? 'locality') then raise exception 'Profile audit missing'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
do $$ begin
  if public.get_agent_cabinet_context() is not null then raise exception 'Partner received Agent context'; end if;
end $$;

rollback;
