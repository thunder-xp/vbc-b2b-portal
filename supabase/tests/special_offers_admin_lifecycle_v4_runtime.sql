begin;

do $$
declare
  actor uuid := 'aa400000-0000-4000-8000-000000000001';
  viewer uuid := 'aa400000-0000-4000-8000-000000000002';
  partner uuid := 'aa400000-0000-4000-8000-000000000003';
  company uuid := 'ba400000-0000-4000-8000-000000000001';
  product uuid := 'ca400000-0000-4000-8000-000000000001';
  campaign uuid := 'da400000-0000-4000-8000-000000000001';
  archived_campaign uuid := 'da400000-0000-4000-8000-000000000002';
  draft_campaign uuid := 'da400000-0000-4000-8000-000000000003';
  reopened jsonb;
  updated jsonb;
  published jsonb;
  partner_detail jsonb;
  admin_list jsonb;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (actor,'authenticated','authenticated','campaign-v4-admin@example.test',now(),now()),
    (viewer,'authenticated','authenticated','campaign-v4-viewer@example.test',now(),now()),
    (partner,'authenticated','authenticated','campaign-v4-partner@example.test',now(),now());
  insert into public.user_profiles(id,email,full_name,status,user_type) values
    (actor,'campaign-v4-admin@example.test','Campaign v4 admin','active','internal'),
    (viewer,'campaign-v4-viewer@example.test','Campaign v4 viewer','active','internal'),
    (partner,'campaign-v4-partner@example.test','Campaign v4 partner','active','partner');
  insert into public.internal_user_role_assignments(user_id,role_id,assigned_by)
  select actor,id,actor from public.roles where code='novotech_admin';
  insert into public.partner_companies(id,external_1c_id,display_name,status)
  values(company,'CAMPAIGN-V4-COMPANY','Campaign v4 company','active');
  insert into public.company_memberships(user_id,company_id,role_id,status,approved_by,approved_at)
  select partner,company,id,'active',actor,now() from public.roles where code='partner_owner';
  insert into public.catalog_products(id,external_1c_id,sku,name,slug)
  values(product,'CAMPAIGN-V4-PRODUCT','V4-SKU','Campaign v4 product','campaign-v4-product');

  insert into public.commercial_campaigns(
    id,code,name,partner_title,partner_description,status,campaign_type,starts_at,ends_at,
    terms_summary,current_version,created_by,approved_by,published_at,draft_revision
  ) values
    (campaign,'V4_LIFECYCLE','V4 lifecycle','V4 lifecycle offer','Lifecycle acceptance description','active','product_offer',now()-interval '1 hour',now()+interval '7 days','Acceptance terms',1,actor,actor,now(),0),
    (archived_campaign,'V4_ARCHIVED','V4 archived','V4 archived offer','Archived deletion acceptance','archived','product_offer',now()-interval '2 days',now()-interval '1 day','Archived terms',0,actor,null,null,0),
    (draft_campaign,'V4_DRAFT','V4 draft','V4 draft offer','Draft deletion denial check','draft','product_offer',now(),now()+interval '1 day','Draft terms',0,actor,null,null,0);
  insert into public.commercial_campaign_items(campaign_id,product_id,sort_order,benefit_type)
  values(campaign,product,1,'informational_only');
  insert into public.commercial_campaign_audience_rules(campaign_id,rule_type)
  values(campaign,'all_active_partners');
  insert into public.commercial_campaign_versions(
    campaign_id,version_number,campaign_snapshot,item_snapshot,audience_rule_snapshot,published_by
  ) values(campaign,1,'{}','[]','[]',actor);
  insert into public.commercial_campaign_audience_snapshots(
    campaign_id,version_number,company_id,included,eligibility_reason
  ) values(campaign,1,company,true,'all_active_partners');
  insert into public.commercial_campaign_audit_events(
    campaign_id,version_number,event_type,actor_user_id,reason
  ) values(campaign,1,'published',actor,'Initial lifecycle fixture');

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);

  perform public.pause_commercial_campaign(campaign,'Stopped for governed edit');
  if (select status from public.commercial_campaigns where id=campaign)<>'paused' then
    raise exception 'Active campaign was not stopped';
  end if;

  reopened := public.reopen_commercial_campaign_for_edit_v1(campaign,'Reopened for governed edit');
  if reopened->>'status'<>'draft'
     or (select current_version from public.commercial_campaigns where id=campaign)<>1
     or (select published_at from public.commercial_campaigns where id=campaign) is not null
     or (select count(*) from public.commercial_campaign_versions where campaign_id=campaign)<>1 then
    raise exception 'Reopen did not preserve immutable published version history';
  end if;

  updated := public.update_commercial_campaign_draft_v2(
    campaign,
    (reopened->>'revision')::integer,
    'ea400000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'contractVersion','2','requestId','ea400000-0000-4000-8000-000000000001',
      'code','V4_LIFECYCLE','name','V4 lifecycle edited','partnerTitle','V4 relaunched offer',
      'partnerDescription','Lifecycle acceptance description after edit','internalNote','',
      'campaignType','product_offer','startsAt',(now()-interval '1 minute'),
      'endsAt',(now()+interval '7 days'),'priority',100,'imageAssetPath','',
      'termsSummary','Acceptance terms after edit','audienceMode','all_active_partners',
      'companyIds',jsonb_build_array(),'items',jsonb_build_array(jsonb_build_object(
        'productId',product,'sortOrder',1,'minimumQuantity',1,'maximumQuantityPerCompany',null,
        'benefitType','informational_only','governedBenefitReference',null,'partnerMessage',null
      ))
    )
  );
  if (updated->>'revision')::integer <= (reopened->>'revision')::integer then
    raise exception 'Reopened draft edit did not advance revision';
  end if;

  published := public.publish_commercial_campaign(campaign,'ea400000-0000-4000-8000-000000000002');
  if (published->>'status')<>'active' or (published->>'version')::integer<>2
     or (select count(*) from public.commercial_campaign_versions where campaign_id=campaign)<>2
     or not exists(select 1 from public.commercial_campaign_audit_events where campaign_id=campaign and event_type='reopened_for_edit') then
    raise exception 'Edited campaign did not relaunch as a new governed version';
  end if;

  perform set_config('request.jwt.claim.sub',partner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',partner,'role','authenticated')::text,true);
  partner_detail := public.get_partner_commercial_campaign(company,campaign);
  if partner_detail is null or partner_detail->>'title'<>'V4 relaunched offer' then
    raise exception 'Relaunched campaign is unavailable to its eligible partner';
  end if;

  perform set_config('request.jwt.claim.sub',viewer::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true);
  begin
    perform public.delete_archived_commercial_campaign_v1(archived_campaign,'Forbidden viewer attempt');
    raise exception 'Permissionless archived delete was accepted';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  begin
    perform public.delete_archived_commercial_campaign_v1(draft_campaign,'Invalid state attempt');
    raise exception 'Non-archived delete was accepted';
  exception when check_violation then null;
  end;
  perform public.delete_archived_commercial_campaign_v1(archived_campaign,'Governed archived deletion');
  if not exists(select 1 from public.commercial_campaigns where id=archived_campaign and deleted_at is not null and deleted_by=actor)
     or not exists(select 1 from public.commercial_campaign_audit_events where campaign_id=archived_campaign and event_type='deleted')
     or public.get_admin_commercial_campaign_v2(archived_campaign) is not null then
    raise exception 'Archived campaign tombstone contract failed';
  end if;
  admin_list := public.list_admin_commercial_campaigns_v2('archived','V4_ARCHIVED',null,null,null,20,0);
  if (admin_list->>'totalCount')::integer<>0 then
    raise exception 'Deleted archived campaign remained in operational list';
  end if;

  if has_function_privilege('anon','public.reopen_commercial_campaign_for_edit_v1(uuid,text)','execute')
     or has_function_privilege('anon','public.delete_archived_commercial_campaign_v1(uuid,text)','execute') then
    raise exception 'Anonymous lifecycle execution is exposed';
  end if;
  if not has_function_privilege('authenticated','public.reopen_commercial_campaign_for_edit_v1(uuid,text)','execute')
     or not has_function_privilege('authenticated','public.delete_archived_commercial_campaign_v1(uuid,text)','execute') then
    raise exception 'Authenticated lifecycle entry-point grants are missing';
  end if;
  if (select not prosecdef or not (coalesce(proconfig,'{}'::text[]) @> array['search_path=""'])
      from pg_proc where oid='public.reopen_commercial_campaign_for_edit_v1(uuid,text)'::regprocedure)
     or (select not prosecdef or not (coalesce(proconfig,'{}'::text[]) @> array['search_path=""'])
      from pg_proc where oid='public.delete_archived_commercial_campaign_v1(uuid,text)'::regprocedure) then
    raise exception 'Lifecycle function security configuration is invalid';
  end if;

  raise notice 'PASS: stop, reopen, edit, republish v2, partner visibility, archived tombstone, denials, grants, audit';
end;
$$;

rollback;
