-- Isolated/local test only. No SMS, no real identities; all fixture writes roll back.
begin;
insert into public.partner_access_presets(code,name,sort_order)
  values('full_partner_access','Local phone-source fixture',10) on conflict(code) do nothing;
create function pg_temp.check_phone_test(p_ok boolean, p_label text) returns void
language plpgsql as $$ begin
  if p_ok is distinct from true then raise exception 'Phone source test failed: %', p_label; end if;
end $$;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_agent uuid;
  v_company uuid := gen_random_uuid();
  v_role uuid := gen_random_uuid();
  v_orphan uuid := gen_random_uuid();
  v_signature text;
  v_result jsonb;
  v_challenge uuid;
  v_hash text := repeat('a', 64);
  v_phone text := '+37369256733';
begin
  insert into auth.users(id, email) values
    (v_user, v_user::text || '@phone-source.example.test'),
    (v_other, v_other::text || '@phone-source.example.test');
  insert into public.user_profiles(id,email,status,user_type) values
    (v_user,v_user::text || '@phone-source.example.test','active','external')
    on conflict(id) do update set status='active',phone=null;
  insert into public.commercial_agents(user_id,agent_type,display_name,phone,status,compliance_status,contract_ready)
    values(v_user,'INDIVIDUAL','Phone source fixture','+373 (69) 256733','ACTIVE','APPROVED',true)
    returning id into v_agent;

  v_result := public.resolve_business_profile_phone_v1(v_user);
  perform pg_temp.check_phone_test(v_result = jsonb_build_object('source','COMMERCIAL_AGENT','phoneE164',v_phone), 'Agent-only contact with null Profile/Auth (MD-P-002 regression)');
  perform pg_temp.check_phone_test(not public.has_business_profile_phone_operational_conflict_v3(v_user,v_phone), 'Agent target eligible');
  perform pg_temp.check_phone_test((select phone is null from public.user_profiles where id=v_user), 'resolution does not mutate projection');
  begin
    perform public.has_business_profile_phone_operational_conflict_v3(v_user,'+37368123456');
    raise exception 'Arbitrary phone was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.prepare_business_phone_enrollment_v3(v_user,'+37368123456',v_hash);
    raise exception 'Arbitrary enrollment target was accepted';
  exception when insufficient_privilege then null;
  end;

  insert into public.roles(id,code,name,scope) values(v_role,'phone_source_fixture','Phone fixture','partner');
  insert into public.partner_companies(id,external_1c_id,display_name,status)
    values(v_company,v_company::text,'Phone source fixture','active');
  insert into public.company_memberships(user_id,company_id,role_id,status)
    values(v_user,v_company,v_role,'active');
  update public.user_profiles set phone=v_phone where id=v_user;
  perform pg_temp.check_phone_test(public.resolve_business_profile_phone_v1(v_user)->>'source'='MATCHING_MULTI_CONTEXT', 'dual contexts same normalized number');
  update public.user_profiles set phone='+37368123456' where id=v_user;
  perform pg_temp.check_phone_test(public.resolve_business_profile_phone_v1(v_user)=jsonb_build_object('source','CONFLICT','phoneE164',null), 'dual contexts differing numbers');
  perform pg_temp.check_phone_test(public.prepare_business_phone_enrollment_v3(v_user,v_phone,v_hash)->>'result'='CONFLICT', 'source conflict blocks preparation');
  perform pg_temp.check_phone_test(not exists(select 1 from public.business_phone_enrollment_challenges where auth_user_id=v_user), 'source conflict creates no challenge');

  update public.commercial_agents set status='SUSPENDED' where id=v_agent;
  perform pg_temp.check_phone_test(public.resolve_business_profile_phone_v1(v_user)=jsonb_build_object('source','USER_PROFILE','phoneE164','+37368123456'), 'Partner-only preserved; inactive Agent excluded');
  update public.company_memberships set status='suspended' where user_id=v_user;
  update public.commercial_agents set status='ACTIVE' where id=v_agent;
  update public.user_profiles set phone=null where id=v_user;

  update auth.users set phone='37369256733',phone_confirmed_at=now() where id=v_other;
  perform pg_temp.check_phone_test(public.has_business_profile_phone_operational_conflict_v3(v_user,v_phone), 'confirmed operational identity duplicate rejected');
  update auth.users set phone=null,phone_confirmed_at=null,phone_change='37369256733' where id=v_other;
  perform pg_temp.check_phone_test(public.has_business_profile_phone_operational_conflict_v3(v_user,v_phone), 'pending operational identity duplicate rejected');
  update auth.users set phone_change='' where id=v_other;

  insert into auth.users(id,phone,phone_confirmed_at,is_anonymous)
    values(v_orphan,'37369256733',now(),false);
  insert into auth.identities(user_id,provider,provider_id,identity_data)
    values(v_orphan,'phone','37369256733',jsonb_build_object('sub',v_orphan::text));
  perform pg_temp.check_phone_test(private.is_non_operational_phone_orphan_v1(v_orphan,v_phone), 'fixture meets existing governed orphan policy');
  perform pg_temp.check_phone_test(not public.has_business_profile_phone_operational_conflict_v3(v_user,v_phone), 'governed orphan exception retained');
  update auth.users set phone=null,phone_confirmed_at=null where id=v_orphan;

  v_result := public.prepare_business_phone_enrollment_v3(v_user,v_phone,v_hash);
  perform pg_temp.check_phone_test(v_result->>'result'='READY', 'Agent-only preparation uses existing state machine');
  v_challenge := (v_result->>'challengeId')::uuid;
  perform pg_temp.check_phone_test((public.reserve_business_phone_enrollment_send_v4(v_challenge,v_user,v_phone,v_hash)->>'allowed')::boolean, 'same target send reservation');
  perform pg_temp.check_phone_test(not public.complete_business_phone_enrollment_v3(v_challenge,v_user,v_phone,v_hash), 'cannot complete before Auth verification');
  -- Simulate successful verifyOtp only inside this isolated fixture.
  update auth.users set phone='37369256733',phone_confirmed_at=now(),phone_change='' where id=v_user;
  update auth.users set phone_change='37368123456' where id=v_user;
  perform pg_temp.check_phone_test(not public.complete_business_phone_enrollment_v3(v_challenge,v_user,v_phone,v_hash), 'pending Auth change prevents completion');
  update auth.users set phone_change='' where id=v_user;
  perform pg_temp.check_phone_test(public.complete_business_phone_enrollment_v3(v_challenge,v_user,v_phone,v_hash), 'confirmed Auth completion');
  perform pg_temp.check_phone_test(public.complete_business_phone_enrollment_v3(v_challenge,v_user,v_phone,v_hash), 'completion idempotent');
  perform pg_temp.check_phone_test((select phone=v_phone from public.user_profiles where id=v_user), 'verified canonical projection written');
  perform pg_temp.check_phone_test((select status='VERIFIED' from public.business_phone_enrollment_challenges where id=v_challenge), 'challenge verified');
  perform pg_temp.check_phone_test((select count(*)=1 from public.business_phone_enrollment_audit_events where challenge_id=v_challenge and event_type='BUSINESS_PHONE_ENROLLMENT_CONFIRMED'), 'one completion audit event');
  perform pg_temp.check_phone_test((select phone='+373 (69) 256733' from public.commercial_agents where id=v_agent), 'Agent contact not overwritten');

  update public.commercial_agents set phone='+37368123456' where id=v_agent;
  perform pg_temp.check_phone_test(public.resolve_business_profile_phone_v1(v_user)=jsonb_build_object('source','COMMERCIAL_AGENT','phoneE164','+37368123456'), 'Agent edit overrides stale verified projection only without Partner context');
  perform pg_temp.check_phone_test((select phone='37369256733' from auth.users where id=v_user), 'Agent edit does not alter verified Auth phone');
  perform pg_temp.check_phone_test(not public.complete_business_phone_enrollment_v3(v_challenge,v_user,v_phone,v_hash), 'stale completion fails after contact edit');
  perform pg_temp.check_phone_test(not (public.reserve_business_phone_enrollment_send_v4(v_challenge,v_user,v_phone,v_hash)->>'allowed')::boolean, 'stale source cannot reserve SMS');
  update public.commercial_agents set phone=null where id=v_agent;
  update public.user_profiles set phone=null where id=v_user;
  perform pg_temp.check_phone_test(public.resolve_business_profile_phone_v1(v_user)=jsonb_build_object('source','NONE','phoneE164',null), 'missing Agent and profile phone');

  perform pg_temp.check_phone_test(not has_function_privilege('anon','public.resolve_business_profile_phone_v1(uuid)','EXECUTE'), 'anon cannot inspect identity sources');
  perform pg_temp.check_phone_test(not has_function_privilege('authenticated','public.resolve_business_profile_phone_v1(uuid)','EXECUTE'), 'authenticated cannot supply another identity');
  perform pg_temp.check_phone_test(has_function_privilege('service_role','public.resolve_business_profile_phone_v1(uuid)','EXECUTE'), 'server resolver grant');
  foreach v_signature in array array[
    'public.has_business_profile_phone_operational_conflict_v3(uuid,text)',
    'public.prepare_business_phone_enrollment_v3(uuid,text,text)',
    'public.reserve_business_phone_enrollment_send_v4(uuid,uuid,text,text)',
    'public.complete_business_phone_enrollment_v3(uuid,uuid,text,text)'
  ] loop
    perform pg_temp.check_phone_test(not has_function_privilege('anon',v_signature,'EXECUTE')
      and not has_function_privilege('authenticated',v_signature,'EXECUTE')
      and has_function_privilege('service_role',v_signature,'EXECUTE'), 'all mutation guards are service-role only');
  end loop;
  update public.commercial_agents set phone=v_phone where id=v_agent;
  perform set_config('phone_source_test.fixture_user',v_user::text,true);
end $$;
explain (analyze, buffers) select public.resolve_business_profile_phone_v1(current_setting('phone_source_test.fixture_user')::uuid);
rollback;
