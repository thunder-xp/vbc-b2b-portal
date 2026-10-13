-- Isolated/local only: synthetic identities, no OTP/provider calls, all writes roll back.
begin;
insert into public.partner_access_presets(code,name,sort_order)
values ('full_partner_access','Audit cleanup fixture',10) on conflict(code) do nothing;
create function pg_temp.assert_login(p_ok boolean, p_label text) returns void
language plpgsql as $$ begin
  if p_ok is distinct from true then raise exception 'Login audit test failed: %', p_label; end if;
end $$;

do $$
declare
  v_agent_user uuid := gen_random_uuid();
  v_partner_user uuid := gen_random_uuid();
  v_company uuid := gen_random_uuid();
  v_role uuid := gen_random_uuid();
  v_audited uuid := gen_random_uuid();
  v_expired uuid := gen_random_uuid();
  v_challenge uuid;
  v_result jsonb;
  v_before integer;
  v_constraint text;
  v_agent_hash text := repeat('a',64);
  v_partner_hash text := repeat('b',64);
  v_requester text := repeat('c',64);
begin
  insert into auth.users(id,email,phone,phone_confirmed_at) values
    (v_agent_user,v_agent_user::text||'@login.example.test','37369256733',now()),
    (v_partner_user,v_partner_user::text||'@login.example.test','37368123456',now());
  insert into public.user_profiles(id,email,status,user_type,phone) values
    (v_agent_user,v_agent_user::text||'@login.example.test','active','external','+37369256733'),
    (v_partner_user,v_partner_user::text||'@login.example.test','active','external','+37368123456')
    on conflict(id) do update set status='active',phone=excluded.phone;
  insert into public.commercial_agents(user_id,agent_type,display_name,phone,status,compliance_status,contract_ready)
    values(v_agent_user,'INDIVIDUAL','Synthetic Agent','+37369256733','ACTIVE','APPROVED',true);
  insert into public.roles(id,code,name,scope) values(v_role,'login_audit_fixture','Login fixture','partner');
  insert into public.partner_companies(id,external_1c_id,display_name,status)
    values(v_company,v_company::text,'Synthetic Partner','active');
  insert into public.company_memberships(user_id,company_id,role_id,status)
    values(v_partner_user,v_company,v_role,'active');

  -- The historical production failure: a globally expired challenge has immutable audit.
  insert into public.quick_auth_challenges(id,phone_key_hash,requester_key_hash,resolution,created_at,expires_at)
    values(v_audited,repeat('d',64),repeat('e',64),'BUSINESS_EMAIL_REQUIRED',now()-interval '3 days',now()-interval '2 days'),
          (v_expired,repeat('d',64),repeat('e',64),'NOT_REGISTERED',now()-interval '3 days',now()-interval '2 days');
  insert into public.business_quick_auth_audit_events(challenge_id,canonical_subject_auth_user_id,event_type,phone_key_hash)
    values(v_audited,v_agent_user,'BUSINESS_EMAIL_CONFIRMED',repeat('d',64));

  v_result := public.start_quick_auth_challenge_v1('+37369256733',v_agent_hash,v_requester,true);
  v_challenge := (v_result->>'challengeId')::uuid;
  perform pg_temp.assert_login(v_result->>'resolution'='BUSINESS_EMAIL_REQUIRED' and v_result->>'recoveryKind'='DIRECT','confirmed Agent eligible; existing email gate retained');
  perform pg_temp.assert_login((select count(*)=1 from public.quick_auth_challenges where id=v_challenge and subject_auth_user_id=v_agent_user),'exactly one persisted Agent challenge');
  perform pg_temp.assert_login(exists(select 1 from public.quick_auth_challenges where id=v_audited),'audited expired parent retained');
  perform pg_temp.assert_login(not exists(select 1 from public.quick_auth_challenges where id=v_expired),'unaudited expired parent cleaned');
  perform pg_temp.assert_login(not public.reserve_quick_auth_otp_send_v1(v_challenge,v_agent_hash),'no dispatch before governed email check');
  perform pg_temp.assert_login(public.reserve_quick_auth_business_email_attempt_v1(v_challenge,v_agent_hash),'email attempt reserved');
  perform pg_temp.assert_login(public.confirm_quick_auth_business_email_v1(v_challenge,v_agent_hash),'Agent email confirmation audited atomically');
  perform public.confirm_quick_auth_business_email_v1(v_challenge,v_agent_hash);
  perform pg_temp.assert_login((select count(*)=1 from public.business_quick_auth_audit_events a join public.quick_auth_challenges c on c.id=a.challenge_id where c.id=v_challenge),'one audit references existing challenge; replay does not duplicate');
  perform pg_temp.assert_login(public.reserve_quick_auth_otp_send_v1(v_challenge,v_agent_hash),'one Agent send reservation');
  perform pg_temp.assert_login(not public.reserve_quick_auth_otp_send_v1(v_challenge,v_agent_hash),'immediate duplicate send blocked');
  perform pg_temp.assert_login(not public.reserve_quick_auth_otp_send_v1(v_challenge,v_partner_hash),'wrong phone hash denied');

  -- A replacement is a separate bounded challenge; existing audit parent stays intact.
  update public.quick_auth_challenges set created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes' where id=v_challenge;
  perform pg_temp.assert_login(not public.reserve_quick_auth_otp_send_v1(v_challenge,v_agent_hash),'expired challenge cannot send');
  perform pg_temp.assert_login(public.read_quick_auth_challenge_v1(v_challenge,v_agent_hash) is null,'expired challenge cannot be used');
  v_result := public.start_quick_auth_challenge_v1('+37369256733',v_agent_hash,v_requester,true);
  perform pg_temp.assert_login((v_result->>'challengeId')::uuid<>v_challenge,'replacement has fresh identity');
  perform pg_temp.assert_login(exists(select 1 from public.business_quick_auth_audit_events where challenge_id=v_challenge),'replacement preserves original audit');

  v_result := public.start_quick_auth_challenge_v1('+37368123456',v_partner_hash,v_requester,true);
  v_challenge := (v_result->>'challengeId')::uuid;
  perform pg_temp.assert_login(v_result->>'resolution'='BUSINESS_EMAIL_REQUIRED' and (v_result->>'subjectAuthUserId')::uuid=v_partner_user,'Partner identity architecture unchanged');
  perform public.reserve_quick_auth_business_email_attempt_v1(v_challenge,v_partner_hash);
  perform pg_temp.assert_login(public.confirm_quick_auth_business_email_v1(v_challenge,v_partner_hash),'Partner audit persists');
  perform pg_temp.assert_login(public.reserve_quick_auth_otp_send_v1(v_challenge,v_partner_hash),'Partner send eligibility');
  perform pg_temp.assert_login(not public.reserve_quick_auth_otp_send_v1(v_challenge,v_partner_hash),'Partner duplicate send blocked');

  -- Foreign key and immutable audit remain enforced, including transaction rollback.
  select count(*) into v_before from public.quick_auth_challenges;
  begin
    insert into public.quick_auth_challenges(phone_key_hash,requester_key_hash,resolution,expires_at)
      values(repeat('f',64),v_requester,'NOT_REGISTERED',now()+interval '10 minutes');
    insert into public.business_quick_auth_audit_events(challenge_id,canonical_subject_auth_user_id,event_type,phone_key_hash)
      values(gen_random_uuid(),v_agent_user,'BUSINESS_EMAIL_CONFIRMED',v_agent_hash);
    raise exception 'Invalid audit parent was accepted';
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform pg_temp.assert_login(v_constraint='business_quick_auth_audit_events_challenge_id_fkey','original FK preserved');
  end;
  perform pg_temp.assert_login((select count(*)=v_before from public.quick_auth_challenges),'failed transaction leaves no orphan challenge');
  begin
    delete from public.quick_auth_challenges where id=v_audited;
    raise exception 'Audited parent delete was accepted';
  exception when foreign_key_violation then null; end;
  begin
    delete from public.business_quick_auth_audit_events where challenge_id=v_audited;
    raise exception 'Audit delete was accepted';
  exception when sqlstate '55000' then null; end;

  -- Eligibility and RPC privileges were not widened by CREATE OR REPLACE.
  v_result := public.start_quick_auth_challenge_v1('+37369256733',v_agent_hash,v_requester,false);
  perform pg_temp.assert_login(v_result->>'resolution'='BLOCKED','disabled business capability fails closed');
  perform pg_temp.assert_login(not has_function_privilege('anon','public.start_quick_auth_challenge_v1(text,text,text,boolean)','execute'),'anon denied');
  perform pg_temp.assert_login(not has_function_privilege('authenticated','public.start_quick_auth_challenge_v1(text,text,text,boolean)','execute'),'authenticated denied');
  perform pg_temp.assert_login(has_function_privilege('service_role','public.start_quick_auth_challenge_v1(text,text,text,boolean)','execute'),'service role retained');
  perform pg_temp.assert_login((select proconfig @> array['search_path=""'] from pg_proc where oid='public.start_quick_auth_challenge_v1(text,text,text,boolean)'::regprocedure),'fixed empty search_path retained');
end $$;

-- Audited history must not occupy the 100-row cleanup batch and starve
-- eligible rows; the existing maximum deletion count remains unchanged.
do $$
declare v_subject uuid := gen_random_uuid();
begin
  insert into public.quick_auth_challenges(phone_key_hash,requester_key_hash,resolution,created_at,expires_at)
    select repeat('7',64),repeat('7',64),'NOT_REGISTERED',now()-interval '5 days',now()-interval '4 days' from generate_series(1,101);
  insert into public.business_quick_auth_audit_events(challenge_id,canonical_subject_auth_user_id,event_type,phone_key_hash)
    select id,v_subject,'BUSINESS_EMAIL_CONFIRMED',phone_key_hash from public.quick_auth_challenges where requester_key_hash=repeat('7',64);
  insert into public.quick_auth_challenges(phone_key_hash,requester_key_hash,resolution,created_at,expires_at)
    select repeat('8',64),repeat('8',64),'NOT_REGISTERED',now()-interval '3 days',now()-interval '2 days' from generate_series(1,101);
  perform public.start_quick_auth_challenge_v1('+37367999999',repeat('9',64),repeat('9',64),true);
  perform pg_temp.assert_login((select count(*)=101 from public.quick_auth_challenges where requester_key_hash=repeat('7',64)),'all audited history retained');
  perform pg_temp.assert_login((select count(*)=1 from public.quick_auth_challenges where requester_key_hash=repeat('8',64)),'exactly 100 eligible expired rows removed despite older audit history');
end $$;

-- Force the real email-confirmation audit INSERT to fail. Its preceding UPDATE
-- must roll back with it; no partial business-email authorization is permitted.
create function pg_temp.reject_login_audit() returns trigger language plpgsql as $$
begin raise exception 'Synthetic audit failure' using errcode='P0001'; end $$;
create trigger test_reject_login_audit before insert on public.business_quick_auth_audit_events
for each row execute function pg_temp.reject_login_audit();
do $$
declare
  v_challenge uuid;
  v_subject uuid := gen_random_uuid();
begin
  insert into auth.users(id,email) values(v_subject,v_subject::text||'@audit-rollback.example.test');
  insert into public.user_profiles(id,email,status,user_type)
    values(v_subject,v_subject::text||'@audit-rollback.example.test','active','external')
    on conflict(id) do update set status='active',user_type='external';
  insert into public.commercial_agents(user_id,agent_type,display_name,phone,status,compliance_status,contract_ready)
    values(v_subject,'INDIVIDUAL','Audit rollback fixture','+37369123456','ACTIVE','APPROVED',true);
  insert into public.quick_auth_challenges(phone_key_hash,requester_key_hash,subject_auth_user_id,otp_subject_auth_user_id,resolution,email_verification_required,business_recovery_kind,email_verification_attempt_count,expires_at)
    values(repeat('f',64),repeat('e',64),v_subject,v_subject,'BUSINESS_EMAIL_REQUIRED',true,'DIRECT',1,now()+interval '10 minutes') returning id into v_challenge;
  begin
    perform public.confirm_quick_auth_business_email_v1(v_challenge,repeat('f',64));
    raise exception 'Expected injected audit failure';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'Synthetic audit failure' then raise; end if;
  end;
  perform pg_temp.assert_login((select email_verified_at is null from public.quick_auth_challenges where id=v_challenge),'real RPC authorization update rolled back after audit failure');
  perform pg_temp.assert_login(not exists(select 1 from public.business_quick_auth_audit_events where challenge_id=v_challenge),'no partial audit after failed RPC');
  perform pg_temp.assert_login(not public.reserve_quick_auth_otp_send_v1(v_challenge,repeat('f',64)),'no send after failed audit transaction');
end $$;
rollback;
