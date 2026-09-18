begin;

alter table public.retail_marketplace_events
  drop constraint if exists retail_marketplace_events_event_type_check;
alter table public.retail_marketplace_events
  add constraint retail_marketplace_events_event_type_check check (event_type in (
    'tariff_draft_created','tariff_draft_updated','tariff_published','tariff_superseded',
    'provider_created','provider_updated','provider_approved','provider_suspended',
    'region_changed','competence_changed','capacity_changed',
    'provider_opted_in','provider_terms_accepted','provider_privacy_acknowledged',
    'provider_submitted','provider_rejected','provider_reactivated','availability_changed',
    'provider_returned_for_correction'
  ));

create or replace function public.admin_return_installation_partner_for_correction_v1(
  p_provider_id uuid,p_reason_ru text,p_reason_ro text,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  provider public.installation_providers%rowtype;
  repeated_event jsonb;
  previous_submission_id uuid;
  previous_approval_id uuid;
  previous_submission_revision bigint;
  previous_snapshot_version integer;
  next_revision bigint;
  event_time timestamptz:=clock_timestamp();
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then
    raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_reason_ru,''))) not between 5 and 500
    or char_length(btrim(coalesce(p_reason_ro,''))) not between 5 and 500 then
    raise exception 'INSTALLATION_CORRECTION_REASON_REQUIRED' using errcode='22023';
  end if;

  select * into provider from public.installation_providers
    where id=p_provider_id and provider_type='partner_company' for update;
  if provider.id is null then
    raise exception 'INSTALLATION_PROVIDER_NOT_FOUND' using errcode='P0002';
  end if;

  if provider.participation_status='DRAFT' then
    select event.safe_evidence into repeated_event
    from public.retail_marketplace_events event
    where event.aggregate_type='provider' and event.aggregate_id=provider.id
      and event.event_type='provider_returned_for_correction'
      and (event.safe_evidence->>'sourceRevision')::bigint=p_expected_revision
      and (event.safe_evidence->>'resultingRevision')::bigint=provider.revision
    order by event.created_at desc,event.id desc limit 1;
    if repeated_event is not null then
      return jsonb_build_object('providerId',provider.id,'revision',provider.revision,'status','DRAFT','repeated',true);
    end if;
  end if;

  if provider.revision<>p_expected_revision then
    raise exception 'INSTALLATION_PARTNER_REVISION_CONFLICT' using errcode='40001';
  end if;
  if provider.participation_status<>'APPROVED' then
    raise exception 'INSTALLATION_RETURN_FOR_CORRECTION_STATE_INVALID' using errcode='22023';
  end if;

  select event.id,
      coalesce((event.safe_evidence->>'submissionRevision')::bigint,(event.safe_evidence->>'revision')::bigint),
      nullif(event.safe_evidence->>'snapshotVersion','')::integer
    into previous_submission_id,previous_submission_revision,previous_snapshot_version
  from public.retail_marketplace_events event
  where event.aggregate_type='provider' and event.aggregate_id=provider.id
    and event.event_type='provider_submitted'
  order by coalesce(
      nullif(event.safe_evidence->>'submissionRevision','')::bigint,
      nullif(event.safe_evidence->>'revision','')::bigint,
      -1
    ) desc,event.created_at desc,event.id desc limit 1;

  select event.id into previous_approval_id
  from public.retail_marketplace_events event
  where event.aggregate_type='provider' and event.aggregate_id=provider.id
    and event.event_type='provider_approved'
  order by event.created_at desc,event.id desc limit 1;

  update public.installation_providers set
    participation_status='DRAFT',operational_status='inactive',approval_status='pending',
    marketplace_enabled=false,submitted_at=null,reviewed_at=null,reviewed_by=null,
    rejection_reason_code=null,rejection_note=null,suspension_reason=null,
    revision=revision+1,updated_by=auth.uid(),updated_at=event_time
  where id=provider.id returning revision into next_revision;

  update public.installation_provider_profiles
  set public_profile_status='draft',updated_at=event_time
  where provider_id=provider.id;

  insert into public.retail_marketplace_events(
    aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence,created_at
  ) values (
    'provider',provider.id,'provider_returned_for_correction',auth.uid(),jsonb_build_object(
      'providerId',provider.id,'previousStatus','APPROVED','newStatus','DRAFT',
      'sourceRevision',p_expected_revision,'resultingRevision',next_revision,
      'adminActorId',auth.uid(),'correctionReason',jsonb_build_object(
        'ru',btrim(p_reason_ru),'ro',btrim(p_reason_ro)
      ),
      'previousApprovalEventId',previous_approval_id,
      'previousSubmissionEventId',previous_submission_id,
      'previousSubmissionRevision',previous_submission_revision,
      'previousSnapshotVersion',previous_snapshot_version,
      'occurredAt',event_time
    ),event_time
  );

  return jsonb_build_object('providerId',provider.id,'revision',next_revision,'status','DRAFT','repeated',false);
end;
$$;

create or replace function public.partner_get_installation_marketplace_activation_v1(
  p_company_id uuid,p_locale text default 'ru'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  provider public.installation_providers%rowtype;
  profile public.installation_provider_profiles%rowtype;
  readiness jsonb;
  company public.partner_companies%rowtype;
  correction_reason text;
begin
  if p_locale not in ('ru','ro') or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id,'installation_marketplace.manage') then
    raise exception 'INSTALLATION_PARTNER_DENIED' using errcode='42501';
  end if;
  select * into company from public.partner_companies where id=p_company_id and status='active';
  if company.id is null then raise exception 'INSTALLATION_COMPANY_NOT_ACTIVE' using errcode='42501'; end if;
  select * into provider from public.installation_providers
    where partner_company_id=p_company_id and provider_type='partner_company';
  if provider.id is not null then
    select * into profile from public.installation_provider_profiles where provider_id=provider.id;
    if provider.participation_status='DRAFT' then
      select event.safe_evidence->'correctionReason'->>p_locale into correction_reason
      from public.retail_marketplace_events event
      where event.aggregate_type='provider' and event.aggregate_id=provider.id
        and event.event_type='provider_returned_for_correction'
      order by coalesce(
          nullif(event.safe_evidence->>'resultingRevision','')::bigint,
          -1
        ) desc,event.created_at desc,event.id desc limit 1;
    end if;
  end if;
  readiness:=private.installation_partner_readiness_v1(p_company_id);
  return jsonb_build_object(
    'companyId',company.id,'companyName',company.display_name,
    'status',coalesce(provider.participation_status,'NOT_ENROLLED'),
    'providerId',provider.id,'revision',coalesce(provider.revision,0),
    'availability',coalesce(profile.availability_state,'unavailable'),
    'maxConcurrentJobs',profile.max_concurrent_jobs,
    'descriptionRu',profile.public_description_ru,'descriptionRo',profile.public_description_ro,
    'contactUserId',profile.contact_user_id,'responseChannel',coalesce(profile.response_channel,'portal'),
    'termsVersion',private.installation_marketplace_terms_version_v1(),
    'termsAccepted',coalesce(provider.terms_version=private.installation_marketplace_terms_version_v1(),false),
    'privacyVersion',private.installation_marketplace_privacy_version_v1(),
    'privacyAccepted',coalesce(provider.privacy_version=private.installation_marketplace_privacy_version_v1(),false),
    'rejectionReasonCode',provider.rejection_reason_code,'rejectionNote',provider.rejection_note,
    'correctionReason',correction_reason,'readiness',readiness,
    'capabilities',coalesce((select jsonb_agg(jsonb_build_object(
      'code',competence.system_type,'verificationStatus',competence.declaration_status
    ) order by competence.system_type) from public.installation_provider_competencies competence
      where competence.provider_id=provider.id and competence.active),'[]'::jsonb),
    'serviceAreaCodes',coalesce((select jsonb_agg(region.code order by region.code)
      from public.installation_provider_regions coverage
      join public.installation_service_regions region on region.id=coverage.region_id
      where coverage.provider_id=provider.id and coverage.active and region.active),'[]'::jsonb),
    'regions',coalesce((select jsonb_agg(jsonb_build_object(
      'code',region.code,'name',case when p_locale='ro' then region.name_ro else region.name_ru end,
      'type',region.region_type
    ) order by case when region.code='MD-CU' then 0 else 1 end,
      lower(case when p_locale='ro' then region.name_ro else region.name_ru end),region.code)
      from public.installation_service_regions region
      where region.active and region.region_type in ('municipality','district','locality')),'[]'::jsonb),
    'metrics',jsonb_build_object(
      'newRequests',(select count(*) from public.installation_partner_assignments assignment
        where assignment.partner_company_id=p_company_id and assignment.status='PARTNER_PENDING'),
      'activeInstallations',(select count(*) from public.installation_partner_assignments assignment
        join public.installation_projects project on project.id=assignment.project_id
        where assignment.partner_company_id=p_company_id and assignment.status='PARTNER_ACCEPTED'
          and project.status not in ('CUSTOMER_CONFIRMED','CLOSED','CANCELLED')),
      'completedInstallations',(select count(*) from public.installation_partner_assignments assignment
        join public.installation_projects project on project.id=assignment.project_id
        where assignment.partner_company_id=p_company_id and project.status in ('CUSTOMER_CONFIRMED','CLOSED')),
      'verifiedReviews',(select count(*) from public.installation_reviews review
        where review.partner_company_id=p_company_id and review.verification_status='VERIFIED_INSTALLATION'
          and review.moderation_status='PUBLISHED')
    )
  );
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
      'correctionHistory',coalesce((select jsonb_agg(jsonb_build_object(
        'eventId',history.id,'returnedAt',history.created_at,
        'sourceRevision',(history.safe_evidence->>'sourceRevision')::bigint,
        'resultingRevision',(history.safe_evidence->>'resultingRevision')::bigint,
        'reasonRu',history.safe_evidence->'correctionReason'->>'ru',
        'reasonRo',history.safe_evidence->'correctionReason'->>'ro',
        'previousApprovalEventId',history.safe_evidence->>'previousApprovalEventId',
        'previousSubmissionEventId',history.safe_evidence->>'previousSubmissionEventId'
      ) order by history.created_at,history.id)
        from public.retail_marketplace_events history
        where history.aggregate_type='provider' and history.aggregate_id=provider.id and history.event_type='provider_returned_for_correction'),'[]'::jsonb),
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
        order by coalesce(
            nullif(event.safe_evidence->>'submissionRevision','')::bigint,
            nullif(event.safe_evidence->>'revision','')::bigint,
            -1
          ) desc,event.created_at desc,event.id desc limit 1
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

revoke all on function public.admin_return_installation_partner_for_correction_v1(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.admin_return_installation_partner_for_correction_v1(uuid,text,text,bigint) to authenticated;

commit;
