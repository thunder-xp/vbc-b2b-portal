begin;

-- Preserve the exact Partner-owned profile submitted for review in the
-- existing append-only Retail Marketplace event ledger. No production values
-- are inferred or backfilled by this migration.

create or replace function private.installation_partner_profile_payload_v1(
  target_provider_id uuid,
  target_company_id uuid
) returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'descriptionRu',profile.public_description_ru,
    'descriptionRo',profile.public_description_ro,
    'availability',profile.availability_state,
    'maxConcurrentJobs',profile.max_concurrent_jobs,
    'capabilities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',competence.system_type,
        'verificationStatus',competence.declaration_status
      ) order by competence.system_type)
      from public.installation_provider_competencies competence
      where competence.provider_id=target_provider_id and competence.active
    ),'[]'::jsonb),
    'serviceAreaCodes',coalesce((
      select jsonb_agg(region.code order by region.code)
      from public.installation_provider_regions coverage
      join public.installation_service_regions region on region.id=coverage.region_id
      where coverage.provider_id=target_provider_id and coverage.active and region.active
    ),'[]'::jsonb),
    'termsVersion',provider.terms_version,
    'termsAccepted',provider.terms_version=private.installation_marketplace_terms_version_v1()
      and provider.terms_accepted_at is not null and provider.terms_accepted_by is not null,
    'privacyVersion',provider.privacy_version,
    'privacyAccepted',provider.privacy_version=private.installation_marketplace_privacy_version_v1()
      and provider.privacy_accepted_at is not null and provider.privacy_accepted_by is not null
  )
  from public.installation_providers provider
  join public.installation_provider_profiles profile on profile.provider_id=provider.id
  where provider.id=target_provider_id
    and provider.partner_company_id=target_company_id
    and provider.provider_type='partner_company';
$$;

create or replace function private.installation_partner_readiness_v1(target_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  company public.partner_companies%rowtype;
  provider public.installation_providers%rowtype;
  profile public.installation_provider_profiles%rowtype;
  public_profile_ready boolean := false;
  description_ready boolean := false;
  capability_ready boolean := false;
  geography_ready boolean := false;
  contact_ready boolean := false;
  response_ready boolean := false;
  terms_ready boolean := false;
  privacy_ready boolean := false;
  admin_ready boolean := false;
  availability_ready boolean := false;
  capacity_ready boolean := false;
  pre_admin_ready boolean := false;
  submission_ready boolean := false;
  eligible_now boolean := false;
  blockers text[] := array[]::text[];
begin
  select * into company from public.partner_companies where id=target_company_id;
  select * into provider from public.installation_providers
    where partner_company_id=target_company_id and provider_type='partner_company';
  if provider.id is not null then
    select * into profile from public.installation_provider_profiles where provider_id=provider.id;
  end if;

  public_profile_ready := company.id is not null and company.status='active'
    and company.public_directory_visible and company.public_display_name is not null
    and company.public_directory_logo_asset_path is not null;
  description_ready := nullif(btrim(coalesce(profile.public_description_ru,'')),'') is not null
    and nullif(btrim(coalesce(profile.public_description_ro,'')),'') is not null;
  capability_ready := provider.id is not null and exists(
    select 1 from public.installation_provider_competencies competence
    where competence.provider_id=provider.id and competence.active
  );
  geography_ready := provider.id is not null and exists(
    select 1 from public.installation_provider_regions coverage
    join public.installation_service_regions region on region.id=coverage.region_id and region.active
    where coverage.provider_id=provider.id and coverage.active
  );
  contact_ready := profile.contact_user_id is not null and exists(
    select 1 from public.company_memberships membership
    where membership.company_id=target_company_id and membership.user_id=profile.contact_user_id
      and membership.status='active'
  );
  response_ready := profile.response_channel='portal';
  terms_ready := provider.terms_version=private.installation_marketplace_terms_version_v1()
    and provider.terms_accepted_at is not null and provider.terms_accepted_by is not null;
  privacy_ready := provider.privacy_version=private.installation_marketplace_privacy_version_v1()
    and provider.privacy_accepted_at is not null and provider.privacy_accepted_by is not null;
  admin_ready := provider.approval_status='approved'
    and provider.participation_status in ('APPROVED','ACTIVE');
  availability_ready := profile.availability_state in ('available','limited');
  capacity_ready := profile.max_concurrent_jobs between 1 and 100;
  pre_admin_ready := public_profile_ready and capability_ready and geography_ready
    and contact_ready and response_ready and terms_ready and privacy_ready;
  submission_ready := pre_admin_ready and description_ready and availability_ready and capacity_ready;
  eligible_now := pre_admin_ready and admin_ready and availability_ready
    and provider.participation_status='ACTIVE' and provider.operational_status='active'
    and provider.marketplace_enabled and profile.public_profile_status='published';

  if provider.id is null then blockers:=array_append(blockers,'NOT_ENROLLED'); end if;
  if not public_profile_ready then blockers:=array_append(blockers,'PUBLIC_PROFILE'); end if;
  if not description_ready then blockers:=array_append(blockers,'PROFILE_DESCRIPTIONS'); end if;
  if not capability_ready then blockers:=array_append(blockers,'CAPABILITIES'); end if;
  if not geography_ready then blockers:=array_append(blockers,'SERVICE_AREA'); end if;
  if not contact_ready then blockers:=array_append(blockers,'CONTACT_PERSON'); end if;
  if not response_ready then blockers:=array_append(blockers,'RESPONSE_CHANNEL'); end if;
  if not terms_ready then blockers:=array_append(blockers,'MARKETPLACE_TERMS'); end if;
  if not privacy_ready then blockers:=array_append(blockers,'CUSTOMER_PRIVACY'); end if;
  if not admin_ready then blockers:=array_append(blockers,'ADMIN_VERIFICATION'); end if;
  if not availability_ready then blockers:=array_append(blockers,'AVAILABILITY'); end if;
  if not capacity_ready then blockers:=array_append(blockers,'CAPACITY'); end if;

  return jsonb_build_object(
    'preAdminReady',pre_admin_ready,'submissionReady',submission_ready,
    'eligibleNow',eligible_now,'blockers',to_jsonb(blockers),
    'items',jsonb_build_array(
      jsonb_build_object('code','PUBLIC_PROFILE','ready',public_profile_ready),
      jsonb_build_object('code','PROFILE_DESCRIPTIONS','ready',description_ready),
      jsonb_build_object('code','INSTALLATION_SERVICES','ready',provider.id is not null),
      jsonb_build_object('code','CAPABILITIES','ready',capability_ready),
      jsonb_build_object('code','SERVICE_AREA','ready',geography_ready),
      jsonb_build_object('code','CONTACT_PERSON','ready',contact_ready),
      jsonb_build_object('code','RESPONSE_CHANNEL','ready',response_ready),
      jsonb_build_object('code','MARKETPLACE_TERMS','ready',terms_ready),
      jsonb_build_object('code','CUSTOMER_PRIVACY','ready',privacy_ready),
      jsonb_build_object('code','ADMIN_VERIFICATION','ready',admin_ready),
      jsonb_build_object('code','AVAILABILITY','ready',availability_ready),
      jsonb_build_object('code','CAPACITY','ready',capacity_ready)
    )
  );
end;
$$;

create or replace function public.partner_submit_installation_marketplace_v1(
  p_company_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  provider public.installation_providers%rowtype;
  readiness jsonb;
  profile_payload jsonb;
  next_revision bigint;
begin
  if not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id,'installation_marketplace.manage') then
    raise exception 'INSTALLATION_PARTNER_DENIED' using errcode='42501';
  end if;
  select * into provider from public.installation_providers
    where partner_company_id=p_company_id and provider_type='partner_company' for update;
  if provider.id is null then raise exception 'INSTALLATION_PARTNER_NOT_ENROLLED' using errcode='P0002'; end if;
  if provider.participation_status in ('PENDING_REVIEW','APPROVED','ACTIVE') then
    return jsonb_build_object('providerId',provider.id,'revision',provider.revision,'status',provider.participation_status,'repeated',true);
  end if;
  if provider.participation_status='SUSPENDED' then raise exception 'INSTALLATION_PARTNER_SUSPENDED' using errcode='42501'; end if;
  if provider.revision<>p_expected_revision then raise exception 'INSTALLATION_PARTNER_REVISION_CONFLICT' using errcode='40001'; end if;
  readiness:=private.installation_partner_readiness_v1(p_company_id);
  if not coalesce((readiness->>'submissionReady')::boolean,false) then
    raise exception 'INSTALLATION_PARTNER_NOT_READY:%',readiness->'blockers' using errcode='22023';
  end if;
  profile_payload:=private.installation_partner_profile_payload_v1(provider.id,p_company_id);
  if profile_payload is null then raise exception 'INSTALLATION_PARTNER_PROFILE_MISSING' using errcode='P0002'; end if;

  update public.installation_providers set participation_status='PENDING_REVIEW',
    operational_status='inactive',approval_status='pending',marketplace_enabled=false,
    submitted_at=now(),rejection_reason_code=null,rejection_note=null,
    revision=revision+1,updated_by=auth.uid(),updated_at=now()
  where id=provider.id returning revision into next_revision;
  insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('provider',provider.id,'provider_submitted',auth.uid(),jsonb_build_object(
      'snapshotVersion',1,
      'sourceRevision',p_expected_revision,
      'submissionRevision',next_revision,
      'profile',profile_payload,
      'readiness',readiness
    ));
  perform private.create_installation_marketplace_notification_v1(
    p_company_id,provider.id,'installation_marketplace_application_submitted',next_revision::text);
  return jsonb_build_object('providerId',provider.id,'revision',next_revision,'status','PENDING_REVIEW','repeated',false);
end;
$$;

create or replace function public.admin_get_installation_partner_activation_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_internal_permission('admin.retail_marketplace.view') then
    raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501';
  end if;
  return jsonb_build_object(
    'metrics',jsonb_build_object(
      'totalPartners',(select count(*) from public.partner_companies where status='active'),
      'enrolled',(select count(*) from public.installation_providers where provider_type='partner_company' and participation_status<>'NOT_ENROLLED'),
      'pendingReview',(select count(*) from public.installation_providers where provider_type='partner_company' and participation_status='PENDING_REVIEW'),
      'activeEligible',(select count(*) from public.installation_providers provider
        join public.partner_companies company on company.id=provider.partner_company_id and company.status='active' and company.public_directory_visible
        join public.installation_provider_profiles profile on profile.provider_id=provider.id and profile.public_profile_status='published' and profile.availability_state<>'unavailable'
        where provider.provider_type='partner_company' and provider.participation_status='ACTIVE'
          and provider.operational_status='active' and provider.approval_status='approved' and provider.marketplace_enabled
          and exists(select 1 from public.installation_provider_competencies competence where competence.provider_id=provider.id and competence.active)
          and exists(select 1 from public.installation_provider_regions coverage where coverage.provider_id=provider.id and coverage.active)),
      'unavailable',(select count(*) from public.installation_providers provider join public.installation_provider_profiles profile on profile.provider_id=provider.id where provider.provider_type='partner_company' and profile.availability_state='unavailable'),
      'suspended',(select count(*) from public.installation_providers where provider_type='partner_company' and participation_status='SUSPENDED')
    ),
    'applications',coalesce((select jsonb_agg(jsonb_build_object(
      'providerId',provider.id,'companyId',company.id,'companyName',company.display_name,
      'status',provider.participation_status,'revision',provider.revision,
      'availability',profile.availability_state,'maxConcurrentJobs',profile.max_concurrent_jobs,
      'descriptionRu',profile.public_description_ru,'descriptionRo',profile.public_description_ro,
      'publicProfileVisible',company.public_directory_visible,
      'publicDisplayName',company.public_display_name,'publicLogoPath',company.public_directory_logo_asset_path,
      'termsAccepted',provider.terms_version=private.installation_marketplace_terms_version_v1(),
      'privacyAccepted',provider.privacy_version=private.installation_marketplace_privacy_version_v1(),
      'rejectionReasonCode',provider.rejection_reason_code,'rejectionNote',provider.rejection_note,
      'readiness',private.installation_partner_readiness_v1(company.id),
      'submissionSnapshot',case when submission.safe_evidence->>'snapshotVersion'='1' then submission.safe_evidence else null end,
      'submissionSnapshotComplete',coalesce(submission.safe_evidence->>'snapshotVersion'='1',false),
      'submissionHistory',coalesce((select jsonb_agg(jsonb_build_object(
        'eventId',history.id,'submittedAt',history.created_at,
        'submissionRevision',coalesce((history.safe_evidence->>'submissionRevision')::bigint,(history.safe_evidence->>'revision')::bigint),
        'snapshotComplete',history.safe_evidence->>'snapshotVersion'='1'
      ) order by history.created_at,history.id)
        from public.retail_marketplace_events history
        where history.aggregate_type='provider' and history.aggregate_id=provider.id and history.event_type='provider_submitted'),'[]'::jsonb),
      'capabilities',coalesce((select jsonb_agg(jsonb_build_object('code',competence.system_type,'verificationStatus',competence.declaration_status) order by competence.system_type)
        from public.installation_provider_competencies competence where competence.provider_id=provider.id and competence.active),'[]'::jsonb),
      'serviceAreas',coalesce((select jsonb_agg(jsonb_build_object('code',region.code,'nameRu',region.name_ru,'nameRo',region.name_ro) order by region.code)
        from public.installation_provider_regions coverage join public.installation_service_regions region on region.id=coverage.region_id
        where coverage.provider_id=provider.id and coverage.active),'[]'::jsonb)
    ) order by case provider.participation_status when 'PENDING_REVIEW' then 0 when 'SUSPENDED' then 1 else 2 end,lower(company.display_name),provider.id)
      from public.installation_providers provider
      join public.partner_companies company on company.id=provider.partner_company_id
      join public.installation_provider_profiles profile on profile.provider_id=provider.id
      left join lateral (
        select event.safe_evidence
        from public.retail_marketplace_events event
        where event.aggregate_type='provider' and event.aggregate_id=provider.id and event.event_type='provider_submitted'
        order by event.created_at desc,event.id desc limit 1
      ) submission on true
      where provider.provider_type='partner_company' and provider.participation_status<>'NOT_ENROLLED'),'[]'::jsonb),
    'coverage',coalesce((select jsonb_agg(jsonb_build_object(
      'regionCode',coverage.region_code,'regionNameRu',coverage.name_ru,'regionNameRo',coverage.name_ro,
      'capability',coverage.system_type,'installerCount',coverage.installer_count
    ) order by coverage.region_code,coverage.system_type) from (
      select region.code region_code,region.name_ru,region.name_ro,capability.system_type,
        count(distinct provider.id) filter (where profile.provider_id is not null and competence.provider_id is not null)::integer installer_count
      from public.installation_service_regions region
      cross join (select unnest(array['cctv','intercom','access_control','alarm','network','other']) system_type) capability
      left join public.installation_provider_regions provider_region on provider_region.region_id=region.id and provider_region.active
      left join public.installation_providers provider on provider.id=provider_region.provider_id
        and provider.provider_type='partner_company' and provider.participation_status='ACTIVE'
        and provider.operational_status='active' and provider.approval_status='approved' and provider.marketplace_enabled
      left join public.installation_provider_profiles profile on profile.provider_id=provider.id
        and profile.public_profile_status='published' and profile.availability_state<>'unavailable'
      left join public.installation_provider_competencies competence on competence.provider_id=provider.id
        and competence.active and competence.system_type=capability.system_type
      where region.active and region.region_type in ('municipality','district','locality')
      group by region.code,region.name_ru,region.name_ro,capability.system_type
    ) coverage),'[]'::jsonb),
    'pilotFacts',jsonb_build_object(
      'eligibleInstallerCount',(select count(*) from public.installation_providers where provider_type='partner_company' and participation_status='ACTIVE' and marketplace_enabled),
      'coveredCapabilityCount',(select count(distinct competence.system_type) from public.installation_provider_competencies competence join public.installation_providers provider on provider.id=competence.provider_id where competence.active and provider.participation_status='ACTIVE' and provider.marketplace_enabled),
      'coveredServiceAreaCount',(select count(distinct coverage.region_id) from public.installation_provider_regions coverage join public.installation_providers provider on provider.id=coverage.provider_id where coverage.active and provider.participation_status='ACTIVE' and provider.marketplace_enabled)
    )
  );
end;
$$;

create or replace function public.admin_review_installation_partner_activation_v1(
  p_provider_id uuid,p_action text,p_rejection_reason text,p_note text,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  provider public.installation_providers%rowtype;
  readiness jsonb;
  submission_snapshot jsonb;
  current_payload jsonb;
  next_status text;
  next_revision bigint;
  event_name text;
  notification_code text;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then
    raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501';
  end if;
  if p_action not in ('APPROVE','REJECT','SUSPEND','REACTIVATE') or char_length(coalesce(p_note,''))>500 then
    raise exception 'INSTALLATION_REVIEW_INPUT_INVALID' using errcode='22023';
  end if;
  select * into provider from public.installation_providers where id=p_provider_id and provider_type='partner_company' for update;
  if provider.id is null then raise exception 'INSTALLATION_PROVIDER_NOT_FOUND' using errcode='P0002'; end if;
  if provider.revision<>p_expected_revision then raise exception 'INSTALLATION_PARTNER_REVISION_CONFLICT' using errcode='40001'; end if;
  readiness:=private.installation_partner_readiness_v1(provider.partner_company_id);
  if p_action='APPROVE' then
    select event.safe_evidence into submission_snapshot
    from public.retail_marketplace_events event
    where event.aggregate_type='provider' and event.aggregate_id=provider.id and event.event_type='provider_submitted'
    order by event.created_at desc,event.id desc limit 1;
    current_payload:=private.installation_partner_profile_payload_v1(provider.id,provider.partner_company_id);
    if not coalesce((readiness->>'submissionReady')::boolean,false)
      or submission_snapshot->>'snapshotVersion' is distinct from '1'
      or (submission_snapshot->>'submissionRevision')::bigint is distinct from provider.revision
      or submission_snapshot->'profile' is distinct from current_payload then
      raise exception 'INSTALLATION_SUBMISSION_SNAPSHOT_NOT_READY' using errcode='22023';
    end if;
  elsif p_action='REACTIVATE' and not coalesce((readiness->>'preAdminReady')::boolean,false) then
    raise exception 'INSTALLATION_PARTNER_NOT_READY:%',readiness->'blockers' using errcode='22023';
  end if;
  if p_action='APPROVE' and provider.participation_status<>'PENDING_REVIEW' then raise exception 'INSTALLATION_REVIEW_STATE_INVALID' using errcode='22023'; end if;
  if p_action='REJECT' and (provider.participation_status<>'PENDING_REVIEW' or p_rejection_reason not in ('INCOMPLETE_PROFILE','INSUFFICIENT_CAPABILITY','SERVICE_AREA_INVALID','COMPLIANCE','QUALITY_CONCERN','OTHER')) then raise exception 'INSTALLATION_REJECTION_INVALID' using errcode='22023'; end if;
  if p_action='SUSPEND' and provider.participation_status not in ('ACTIVE','APPROVED') then raise exception 'INSTALLATION_SUSPEND_STATE_INVALID' using errcode='22023'; end if;
  if p_action='REACTIVATE' and provider.participation_status<>'SUSPENDED' then raise exception 'INSTALLATION_REACTIVATE_STATE_INVALID' using errcode='22023'; end if;

  if p_action in ('APPROVE','REACTIVATE') then
    next_status:=case when exists(select 1 from public.installation_provider_profiles where provider_id=provider.id and availability_state<>'unavailable') then 'ACTIVE' else 'APPROVED' end;
    event_name:=case when p_action='APPROVE' then 'provider_approved' else 'provider_reactivated' end;
    notification_code:='installation_marketplace_approved';
  elsif p_action='REJECT' then next_status:='REJECTED'; event_name:='provider_rejected'; notification_code:='installation_marketplace_rejected';
  else next_status:='SUSPENDED'; event_name:='provider_suspended'; notification_code:='installation_marketplace_suspended'; end if;

  update public.installation_providers set participation_status=next_status,
    operational_status=case when next_status='ACTIVE' then 'active' when next_status='SUSPENDED' then 'suspended' else 'inactive' end,
    approval_status=case when next_status in ('ACTIVE','APPROVED','SUSPENDED') then 'approved' when next_status='REJECTED' then 'rejected' else approval_status end,
    marketplace_enabled=next_status='ACTIVE',suspension_reason=case when next_status='SUSPENDED' then nullif(btrim(coalesce(p_note,'')),'') else null end,
    rejection_reason_code=case when next_status='REJECTED' then p_rejection_reason else null end,
    rejection_note=case when next_status='REJECTED' then nullif(btrim(coalesce(p_note,'')),'') else null end,
    reviewed_at=now(),reviewed_by=auth.uid(),revision=revision+1,updated_by=auth.uid(),updated_at=now()
  where id=provider.id returning revision into next_revision;
  update public.installation_provider_profiles set public_profile_status=case when next_status='ACTIVE' then 'published' else 'draft' end,updated_at=now() where provider_id=provider.id;
  insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('provider',provider.id,event_name,auth.uid(),jsonb_build_object('action',p_action,'status',next_status,'reasonCode',p_rejection_reason,'note',nullif(btrim(coalesce(p_note,'')),'')));
  perform private.create_installation_marketplace_notification_v1(provider.partner_company_id,provider.id,notification_code,next_revision::text);
  return jsonb_build_object('providerId',provider.id,'revision',next_revision,'status',next_status);
end;
$$;

revoke all on function private.installation_partner_profile_payload_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- Public RPC grants are restated explicitly after function replacement.
revoke all on function public.partner_submit_installation_marketplace_v1(uuid,bigint) from public,anon,authenticated;
revoke all on function public.admin_get_installation_partner_activation_v1() from public,anon,authenticated;
revoke all on function public.admin_review_installation_partner_activation_v1(uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.partner_submit_installation_marketplace_v1(uuid,bigint) to authenticated;
grant execute on function public.admin_get_installation_partner_activation_v1() to authenticated;
grant execute on function public.admin_review_installation_partner_activation_v1(uuid,text,text,text,bigint) to authenticated;

commit;
