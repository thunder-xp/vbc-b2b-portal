begin;

-- Pilot supply configuration and outreach extend the canonical installation
-- provider/company model. They do not create another Partner identity,
-- assignment domain, capability taxonomy, or ranking policy.

create table public.installation_marketplace_pilot_configurations (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.installation_service_regions(id) on delete restrict,
  capability text not null check (capability in ('cctv','intercom','access_control','alarm','network','other')),
  enabled boolean not null default true,
  min_active_installers integer not null default 3 check (min_active_installers between 1 and 20),
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  updated_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(region_id,capability)
);

create index installation_marketplace_pilot_config_enabled_idx
  on public.installation_marketplace_pilot_configurations(enabled,region_id,capability)
  where enabled;

create table public.installation_marketplace_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.partner_companies(id) on delete restrict,
  status text not null default 'INVITATION_DRAFT' check (status in (
    'INVITATION_DRAFT','READY_TO_SEND','SENT','OPENED','PARTNER_STARTED',
    'PARTNER_SUBMITTED','APPROVED','DECLINED','EXPIRED'
  )),
  locale text not null default 'ru' check (locale in ('ru','ro')),
  channels text[] not null default array['IN_APP','EMAIL']::text[] check (
    cardinality(channels) between 1 and 2
    and channels <@ array['IN_APP','EMAIL']::text[]
    and 'IN_APP'=any(channels)
  ),
  recipient_user_id uuid null references public.user_profiles(id) on delete restrict,
  expires_at timestamptz null,
  sent_at timestamptz null,
  opened_at timestamptz null,
  started_at timestamptz null,
  submitted_at timestamptz null,
  resolved_at timestamptz null,
  email_intent_id text null check (email_intent_id is null or char_length(email_intent_id) between 1 and 200),
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  updated_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at)
);

create index installation_marketplace_invitations_status_idx
  on public.installation_marketplace_invitations(status,updated_at desc,id);
create index installation_marketplace_invitations_recipient_idx
  on public.installation_marketplace_invitations(recipient_user_id,updated_at desc)
  where recipient_user_id is not null;

create table public.installation_marketplace_supply_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('candidate','invitation','provider','pilot_configuration')),
  entity_id uuid not null,
  company_id uuid null references public.partner_companies(id) on delete restrict,
  event_type text not null check (event_type in (
    'candidate_marked_for_outreach','invitation_prepared','invitation_sent',
    'partner_started','partner_submitted','partner_approved','partner_declined',
    'invitation_expired','pilot_configuration_changed'
  )),
  actor_user_id uuid null references public.user_profiles(id) on delete restrict,
  correlation_id uuid not null,
  safe_evidence jsonb not null default '{}'::jsonb check (
    jsonb_typeof(safe_evidence)='object' and octet_length(safe_evidence::text)<=8192
  ),
  occurred_at timestamptz not null default now()
);

create index installation_marketplace_supply_events_entity_idx
  on public.installation_marketplace_supply_events(entity_type,entity_id,occurred_at desc,id desc);
create index installation_marketplace_supply_events_company_idx
  on public.installation_marketplace_supply_events(company_id,occurred_at desc,id desc)
  where company_id is not null;

create or replace function private.prevent_installation_marketplace_supply_event_mutation_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'INSTALLATION_MARKETPLACE_SUPPLY_EVENT_IMMUTABLE' using errcode='23514';
end;
$$;

create trigger prevent_installation_marketplace_supply_event_mutation_v1
before update or delete on public.installation_marketplace_supply_events
for each row execute function private.prevent_installation_marketplace_supply_event_mutation_v1();

create or replace function private.installation_marketplace_invitation_recipient_v1(target_company_id uuid)
returns table(user_id uuid,email text,locale text,identity_verified boolean)
language sql stable security definer set search_path='' as $$
  select profile.id,lower(btrim(profile.email)),
    case when profile.preferred_locale='ro' then 'ro' else 'ru' end,
    auth_user.email_confirmed_at is not null
  from public.company_memberships membership
  join public.roles role on role.id=membership.role_id
  join public.user_profiles profile on profile.id=membership.user_id and profile.status='active'
  join auth.users auth_user on auth_user.id=profile.id and auth_user.email is not null
  where membership.company_id=target_company_id and membership.status='active'
    and role.code in ('partner_owner','partner_manager')
    and profile.email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  order by case when role.code='partner_owner' then 0 else 1 end,membership.created_at,membership.id
  limit 1;
$$;

create or replace function public.admin_get_installation_marketplace_supply_v1(
  p_search text default null,p_filter text default 'all',p_limit integer default 25,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  normalized_search text:=lower(left(btrim(coalesce(p_search,'')),100));
  normalized_filter text:=coalesce(nullif(btrim(p_filter),''),'all');
  bounded_limit integer:=least(greatest(coalesce(p_limit,25),1),50);
  bounded_offset integer:=greatest(coalesce(p_offset,0),0);
  result jsonb;
begin
  if not public.has_internal_permission('admin.retail_marketplace.view') then
    raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501';
  end if;
  if normalized_filter not in ('all','potential','invited','started','pending','active','suspended') then
    raise exception 'INSTALLATION_SUPPLY_FILTER_INVALID' using errcode='22023';
  end if;

  with company_facts as materialized (
    select company.id company_id,company.display_name company_name,company.status company_status,
      company.public_directory_visible,
      company.public_display_name is not null and company.public_directory_logo_asset_path is not null as public_profile_complete,
      provider.id provider_id,coalesce(provider.participation_status,'NOT_ENROLLED') participation_status,
      coalesce(provider.revision,0) provider_revision,
      coalesce(profile.availability_state,'unavailable') availability,
      coalesce(provider.terms_version=private.installation_marketplace_terms_version_v1(),false) terms_accepted,
      coalesce(provider.privacy_version=private.installation_marketplace_privacy_version_v1(),false) privacy_accepted,
      coalesce(provider.approval_status='approved',false) admin_approved,
      private.installation_partner_readiness_v1(company.id) readiness,
      coalesce((select jsonb_agg(jsonb_build_object('code',competence.system_type,'verificationStatus',competence.declaration_status) order by competence.system_type)
        from public.installation_provider_competencies competence where competence.provider_id=provider.id and competence.active),'[]'::jsonb) capabilities,
      coalesce((select jsonb_agg(competence.system_type order by competence.system_type)
        from public.installation_provider_competencies competence where competence.provider_id=provider.id and competence.active and competence.declaration_status='verified'),'[]'::jsonb) verified_capabilities,
      coalesce((select jsonb_agg(jsonb_build_object('code',region.code,'nameRu',region.name_ru,'nameRo',region.name_ro) order by region.code)
        from public.installation_provider_regions coverage join public.installation_service_regions region on region.id=coverage.region_id
        where coverage.provider_id=provider.id and coverage.active and region.active),'[]'::jsonb) service_areas,
      invitation.id invitation_id,
      case when invitation.expires_at is not null and invitation.expires_at<=now()
        and invitation.status in ('INVITATION_DRAFT','READY_TO_SEND','SENT','OPENED') then 'EXPIRED'
        else invitation.status end invitation_status,
      invitation.revision invitation_revision,invitation.locale invitation_locale,
      invitation.channels invitation_channels,invitation.sent_at,invitation.expires_at,
      exists(select 1 from private.installation_marketplace_invitation_recipient_v1(company.id)) recipient_ready
    from public.partner_companies company
    left join public.installation_providers provider on provider.partner_company_id=company.id and provider.provider_type='partner_company'
    left join public.installation_provider_profiles profile on profile.provider_id=provider.id
    left join public.installation_marketplace_invitations invitation on invitation.company_id=company.id
    where company.status='active'
  ), filtered as materialized (
    select *,jsonb_array_length(coalesce(readiness->'blockers','[]'::jsonb)) missing_step_count,
      case
        when participation_status='ACTIVE' then 'ACTIVE'
        when coalesce((readiness->>'preAdminReady')::boolean,false) then 'READY_FOR_REVIEW'
        when jsonb_array_length(coalesce(readiness->'blockers','[]'::jsonb))<=3 then 'NEAR_READY'
        else 'FOUNDATION_REQUIRED'
      end readiness_group
    from company_facts
    where (normalized_search='' or lower(company_name) like '%'||normalized_search||'%')
      and case normalized_filter
        when 'potential' then participation_status<>'ACTIVE' and recipient_ready
        when 'invited' then invitation_status in ('INVITATION_DRAFT','READY_TO_SEND','SENT','OPENED')
        when 'started' then invitation_status='PARTNER_STARTED' or participation_status='DRAFT'
        when 'pending' then participation_status='PENDING_REVIEW'
        when 'active' then participation_status='ACTIVE'
        when 'suspended' then participation_status='SUSPENDED'
        else true end
  ), candidates as (
    select * from filtered
    order by case readiness_group when 'READY_FOR_REVIEW' then 0 when 'NEAR_READY' then 1 when 'FOUNDATION_REQUIRED' then 2 else 3 end,
      public_directory_visible desc,missing_step_count,lower(company_name),company_id
    limit bounded_limit offset bounded_offset
  ), coverage as materialized (
    select region.id region_id,region.code region_code,region.name_ru,region.name_ro,capability.code capability,
      config.id config_id,coalesce(config.enabled,false) pilot_enabled,coalesce(config.min_active_installers,3) min_active_installers,
      coalesce(config.revision,0) config_revision,
      count(distinct provider.id) filter(where provider.participation_status='ACTIVE' and provider.marketplace_enabled
        and provider.operational_status='active' and provider.approval_status='approved'
        and profile.public_profile_status='published' and profile.availability_state in ('available','limited'))::integer active_count,
      count(distinct provider.id) filter(where provider.participation_status='ACTIVE' and provider.marketplace_enabled
        and profile.availability_state='available')::integer available_count,
      count(distinct provider.id) filter(where provider.participation_status='ACTIVE' and provider.marketplace_enabled
        and profile.availability_state='limited')::integer limited_count,
      count(distinct provider.id) filter(where provider.participation_status='PENDING_REVIEW')::integer pending_count,
      count(distinct provider.id) filter(where provider.participation_status not in ('ACTIVE','PENDING_REVIEW') and provider.id is not null)::integer potential_count,
      coalesce(jsonb_agg(distinct jsonb_build_object('companyId',company.id,'companyName',company.display_name))
        filter(where provider.participation_status='ACTIVE'),'[]'::jsonb) active_partners,
      coalesce(jsonb_agg(distinct jsonb_build_object('companyId',company.id,'companyName',company.display_name))
        filter(where provider.participation_status='PENDING_REVIEW'),'[]'::jsonb) pending_partners,
      coalesce(jsonb_agg(distinct jsonb_build_object('companyId',company.id,'companyName',company.display_name))
        filter(where provider.participation_status not in ('ACTIVE','PENDING_REVIEW') and provider.id is not null),'[]'::jsonb) candidate_partners
    from public.installation_service_regions region
    cross join (select unnest(array['cctv','intercom','access_control','alarm','network','other']) code) capability
    left join public.installation_marketplace_pilot_configurations config on config.region_id=region.id and config.capability=capability.code
    left join public.installation_provider_regions provider_region on provider_region.region_id=region.id and provider_region.active
    left join public.installation_providers provider on provider.id=provider_region.provider_id and provider.provider_type='partner_company'
    left join public.partner_companies company on company.id=provider.partner_company_id and company.status='active'
    left join public.installation_provider_profiles profile on profile.provider_id=provider.id
    left join public.installation_provider_competencies competence on competence.provider_id=provider.id and competence.active and competence.system_type=capability.code
    where region.active and region.region_type in ('municipality','district','locality')
      and (provider.id is null or competence.provider_id is not null)
    group by region.id,region.code,region.name_ru,region.name_ro,capability.code,config.id,config.enabled,config.min_active_installers,config.revision
  )
  select jsonb_build_object(
    'metrics',jsonb_build_object(
      'totalPartners',(select count(*) from company_facts),
      'publicProfiles',(select count(*) from company_facts where public_directory_visible),
      'potentialCandidates',(select count(*) from company_facts where participation_status<>'ACTIVE' and recipient_ready),
      'invited',(select count(*) from company_facts where invitation_status in ('SENT','OPENED')),
      'started',(select count(*) from company_facts where invitation_status='PARTNER_STARTED' or participation_status='DRAFT'),
      'pendingReview',(select count(*) from company_facts where participation_status='PENDING_REVIEW'),
      'active',(select count(*) from company_facts where participation_status='ACTIVE'),
      'available',(select count(*) from company_facts where participation_status='ACTIVE' and availability='available'),
      'limited',(select count(*) from company_facts where participation_status='ACTIVE' and availability='limited'),
      'suspended',(select count(*) from company_facts where participation_status='SUSPENDED')
    ),
    'totalCount',(select count(*) from filtered),'limit',bounded_limit,'offset',bounded_offset,
    'candidates',coalesce((select jsonb_agg(jsonb_build_object(
      'companyId',company_id,'companyName',company_name,'companyStatus',company_status,
      'publicProfileVisible',public_directory_visible,'publicProfileComplete',public_profile_complete,
      'providerId',provider_id,'participationStatus',participation_status,'providerRevision',provider_revision,
      'availability',availability,'termsAccepted',terms_accepted,'privacyAccepted',privacy_accepted,
      'adminApproved',admin_approved,'recipientReady',recipient_ready,'readiness',readiness,
      'missingStepCount',missing_step_count,'readinessGroup',readiness_group,
      'capabilities',capabilities,'verifiedCapabilities',verified_capabilities,'serviceAreas',service_areas,
      'invitationId',invitation_id,'invitationStatus',invitation_status,'invitationRevision',invitation_revision,
      'invitationLocale',invitation_locale,'invitationChannels',to_jsonb(invitation_channels),
      'invitationSentAt',sent_at,'invitationExpiresAt',expires_at
    ) order by case readiness_group when 'READY_FOR_REVIEW' then 0 when 'NEAR_READY' then 1 when 'FOUNDATION_REQUIRED' then 2 else 3 end,
      public_directory_visible desc,missing_step_count,lower(company_name),company_id) from candidates),'[]'::jsonb),
    'coverage',coalesce((select jsonb_agg(jsonb_build_object(
      'regionCode',region_code,'regionNameRu',name_ru,'regionNameRo',name_ro,'capability',capability,
      'configurationId',config_id,'pilotEnabled',pilot_enabled,'threshold',min_active_installers,'revision',config_revision,
       'active',active_count,'available',available_count,'limited',limited_count,'pendingReview',pending_count,
       'potentialCandidates',potential_count,'activePartners',active_partners,
       'pendingPartners',pending_partners,'candidatePartners',candidate_partners,
      'readiness',case when not pilot_enabled then null when active_count>=min_active_installers then 'READY'
        when active_count>0 then 'LIMITED' else 'NOT_READY' end
    ) order by region_code,capability) from coverage),'[]'::jsonb),
    'pilotReadiness',case
      when not exists(select 1 from coverage where pilot_enabled) then 'NOT_READY'
      when exists(select 1 from coverage where pilot_enabled and active_count=0) then 'NOT_READY'
      when exists(select 1 from coverage where pilot_enabled and active_count<min_active_installers) then 'LIMITED'
      else 'READY' end
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_save_installation_marketplace_pilot_config_v1(
  p_region_code text,p_capability text,p_enabled boolean,p_min_active_installers integer,
  p_expected_revision bigint,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare region public.installation_service_regions%rowtype; existing public.installation_marketplace_pilot_configurations%rowtype; next_revision bigint;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501'; end if;
  if p_capability not in ('cctv','intercom','access_control','alarm','network','other')
    or p_min_active_installers not between 1 and 20 or p_expected_revision<0 or p_correlation_id is null then
    raise exception 'INSTALLATION_PILOT_CONFIG_INVALID' using errcode='22023';
  end if;
  select * into region from public.installation_service_regions where code=p_region_code and active and region_type in ('municipality','district','locality');
  if region.id is null then raise exception 'INSTALLATION_PILOT_REGION_INVALID' using errcode='22023'; end if;
  select * into existing from public.installation_marketplace_pilot_configurations where region_id=region.id and capability=p_capability for update;
  if existing.id is null then
    if p_expected_revision<>0 then raise exception 'INSTALLATION_PILOT_CONFIG_CONFLICT' using errcode='40001'; end if;
    insert into public.installation_marketplace_pilot_configurations(region_id,capability,enabled,min_active_installers,created_by,updated_by)
    values(region.id,p_capability,p_enabled,p_min_active_installers,auth.uid(),auth.uid()) returning revision into next_revision;
  else
    if existing.revision<>p_expected_revision then raise exception 'INSTALLATION_PILOT_CONFIG_CONFLICT' using errcode='40001'; end if;
    update public.installation_marketplace_pilot_configurations set enabled=p_enabled,min_active_installers=p_min_active_installers,
      revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=existing.id returning revision into next_revision;
  end if;
  insert into public.installation_marketplace_supply_events(entity_type,entity_id,event_type,actor_user_id,correlation_id,safe_evidence)
  values('pilot_configuration',coalesce(existing.id,(select id from public.installation_marketplace_pilot_configurations where region_id=region.id and capability=p_capability)),
    'pilot_configuration_changed',auth.uid(),p_correlation_id,jsonb_build_object('regionCode',region.code,'capability',p_capability,'enabled',p_enabled,'threshold',p_min_active_installers,'revision',next_revision));
  return jsonb_build_object('regionCode',region.code,'capability',p_capability,'revision',next_revision,'enabled',p_enabled);
end;
$$;

create or replace function public.admin_prepare_installation_marketplace_invitation_v1(
  p_company_id uuid,p_locale text,p_channels text[],p_expires_at timestamptz,
  p_expected_revision bigint,p_ready_to_send boolean,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.partner_companies%rowtype; invitation public.installation_marketplace_invitations%rowtype;
  recipient record; normalized_channels text[]; next_status text; next_revision bigint; target_id uuid; event_name text;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501'; end if;
  select array_agg(distinct value order by value) into normalized_channels from unnest(coalesce(p_channels,array[]::text[])) value;
  if p_locale not in ('ru','ro') or normalized_channels is null or not ('IN_APP'=any(normalized_channels))
    or not (normalized_channels <@ array['IN_APP','EMAIL']::text[]) or cardinality(normalized_channels)>2
    or p_expected_revision<0 or p_correlation_id is null or (p_expires_at is not null and p_expires_at<=now()) then
    raise exception 'INSTALLATION_INVITATION_INPUT_INVALID' using errcode='22023';
  end if;
  select * into company from public.partner_companies where id=p_company_id and status='active';
  if company.id is null then raise exception 'INSTALLATION_INVITATION_COMPANY_INVALID' using errcode='22023'; end if;
  if exists(select 1 from public.installation_providers where partner_company_id=p_company_id and provider_type='partner_company' and participation_status='ACTIVE') then
    raise exception 'INSTALLATION_INVITATION_ALREADY_ACTIVE' using errcode='22023';
  end if;
  select * into recipient from private.installation_marketplace_invitation_recipient_v1(p_company_id);
  if recipient.user_id is null then raise exception 'INSTALLATION_INVITATION_RECIPIENT_UNAVAILABLE' using errcode='22023'; end if;
  select * into invitation from public.installation_marketplace_invitations where company_id=p_company_id for update;
  next_status:=case when p_ready_to_send then 'READY_TO_SEND' else 'INVITATION_DRAFT' end;
  event_name:=case when p_ready_to_send then 'invitation_prepared' else 'candidate_marked_for_outreach' end;
  if invitation.id is null then
    if p_expected_revision<>0 then raise exception 'INSTALLATION_INVITATION_CONFLICT' using errcode='40001'; end if;
    insert into public.installation_marketplace_invitations(company_id,status,locale,channels,recipient_user_id,expires_at,created_by,updated_by)
    values(p_company_id,next_status,p_locale,normalized_channels,recipient.user_id,p_expires_at,auth.uid(),auth.uid())
    returning id,revision into target_id,next_revision;
  else
    if invitation.status not in ('INVITATION_DRAFT','READY_TO_SEND','EXPIRED') or invitation.revision<>p_expected_revision then
      raise exception 'INSTALLATION_INVITATION_CONFLICT' using errcode='40001';
    end if;
    update public.installation_marketplace_invitations set status=next_status,locale=p_locale,channels=normalized_channels,
      recipient_user_id=recipient.user_id,expires_at=p_expires_at,sent_at=null,email_intent_id=null,
      revision=revision+1,updated_by=auth.uid(),updated_at=now()
    where id=invitation.id returning id,revision into target_id,next_revision;
  end if;
  insert into public.installation_marketplace_supply_events(entity_type,entity_id,company_id,event_type,actor_user_id,correlation_id,safe_evidence)
  values(case when p_ready_to_send then 'invitation' else 'candidate' end,target_id,p_company_id,event_name,auth.uid(),p_correlation_id,
    jsonb_build_object('status',next_status,'channels',to_jsonb(normalized_channels),'locale',p_locale,'expiresAt',p_expires_at,'revision',next_revision));
  return jsonb_build_object('invitationId',target_id,'revision',next_revision,'status',next_status);
end;
$$;

create or replace function public.admin_send_installation_marketplace_invitation_v1(
  p_invitation_id uuid,p_expected_revision bigint,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.installation_marketplace_invitations%rowtype; company public.partner_companies%rowtype;
  recipient record; next_revision bigint; event_id uuid; event_time timestamptz:=now(); intent_id text;
begin
  if not public.has_internal_permission('admin.retail_marketplace.manage') then raise exception 'INSTALLATION_ADMIN_DENIED' using errcode='42501'; end if;
  if p_correlation_id is null then raise exception 'INSTALLATION_INVITATION_INPUT_INVALID' using errcode='22023'; end if;
  select * into invitation from public.installation_marketplace_invitations where id=p_invitation_id for update;
  if invitation.id is null then raise exception 'INSTALLATION_INVITATION_NOT_FOUND' using errcode='P0002'; end if;
  select * into company from public.partner_companies where id=invitation.company_id and status='active';
  select * into recipient from private.installation_marketplace_invitation_recipient_v1(invitation.company_id);
  if invitation.status in ('SENT','OPENED','PARTNER_STARTED','PARTNER_SUBMITTED','APPROVED') then
    return jsonb_build_object('invitationId',invitation.id,'revision',invitation.revision,'status',invitation.status,'repeated',true,
      'companyId',company.id,'companyName',company.display_name,'recipientUserId',recipient.user_id,'recipientEmail',recipient.email,
      'recipientLocale',invitation.locale,'identityVerified',recipient.identity_verified,'channels',to_jsonb(invitation.channels),'emailIntentId',invitation.email_intent_id);
  end if;
  if invitation.status<>'READY_TO_SEND' or invitation.revision<>p_expected_revision
    or (invitation.expires_at is not null and invitation.expires_at<=now()) or recipient.user_id is null
    or ('EMAIL'=any(invitation.channels) and (recipient.email is null or not recipient.identity_verified)) then
    raise exception 'INSTALLATION_INVITATION_NOT_SENDABLE' using errcode='22023';
  end if;
  next_revision:=invitation.revision+1;
  intent_id:=case when 'EMAIL'=any(invitation.channels) then 'marketplace.invitation:'||invitation.id::text||':'||next_revision::text else null end;
  update public.installation_marketplace_invitations set status='SENT',recipient_user_id=recipient.user_id,
    sent_at=event_time,email_intent_id=intent_id,revision=next_revision,updated_by=auth.uid(),updated_at=event_time
  where id=invitation.id;

  insert into public.installation_marketplace_supply_events(entity_type,entity_id,company_id,event_type,actor_user_id,correlation_id,safe_evidence)
  values('invitation',invitation.id,invitation.company_id,'invitation_sent',auth.uid(),p_correlation_id,
    jsonb_build_object('channels',to_jsonb(invitation.channels),'locale',invitation.locale,'revision',next_revision));

  insert into public.partner_notification_events(company_id,event_code,event_group,domain,entity_type,entity_id,source_table,
    source_event_id,source_version,occurred_at,safe_payload,fingerprint)
  values(invitation.company_id,'installation_marketplace_invitation','installation','installation_marketplace','installation_marketplace_invitation',
    invitation.id,'installation_marketplace_invitations',null,next_revision::text,event_time,'{}'::jsonb,
    encode(extensions.digest(concat_ws('|','installation_marketplace_invitation',invitation.company_id::text,invitation.id::text,next_revision::text),'sha256'),'hex'))
  on conflict(fingerprint) do nothing returning id into event_id;
  if event_id is null then select id into event_id from public.partner_notification_events where fingerprint=encode(extensions.digest(concat_ws('|','installation_marketplace_invitation',invitation.company_id::text,invitation.id::text,next_revision::text),'sha256'),'hex'); end if;

  insert into public.partner_notifications(company_id,recipient_user_id,event_code,event_group,domain,severity,mandatory,
    title,message,action_label,action_url,entity_type,entity_id,occurred_at,deduplication_key,source_event_id,
    expires_at,retention_until,email_enabled_snapshot,email_delivery_mode)
  values(invitation.company_id,recipient.user_id,'installation_marketplace_invitation','installation','installation_marketplace','information',false,
    case when invitation.locale='ro' then 'Invitație în rețeaua de instalatori Novotech' else 'Приглашение в сеть монтажников Novotech' end,
    case when invitation.locale='ro' then 'Alegeți competențele, zonele de deservire și disponibilitatea. Participarea este voluntară; volumul solicitărilor nu este garantat.' else 'Укажите компетенции, регионы обслуживания и доступность. Участие добровольное; объём заявок не гарантируется.' end,
    case when invitation.locale='ro' then 'Deschide montaj și solicitări' else 'Открыть монтаж и заявки' end,
    '/cabinet/installation-marketplace','installation_marketplace_invitation',invitation.id,event_time,
    encode(extensions.digest(concat_ws('|','installation_marketplace_invitation',recipient.user_id::text,invitation.id::text,next_revision::text),'sha256'),'hex'),event_id,
    invitation.expires_at,event_time+interval '13 months',false,'off')
  on conflict(recipient_user_id,deduplication_key) do nothing;

  return jsonb_build_object('invitationId',invitation.id,'revision',next_revision,'status','SENT','repeated',false,
    'companyId',company.id,'companyName',company.display_name,'recipientUserId',recipient.user_id,'recipientEmail',recipient.email,
    'recipientLocale',invitation.locale,'identityVerified',recipient.identity_verified,'channels',to_jsonb(invitation.channels),'emailIntentId',intent_id);
end;
$$;

create or replace function private.sync_installation_marketplace_invitation_lifecycle_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare invitation public.installation_marketplace_invitations%rowtype; next_status text; event_name text;
begin
  if new.provider_type<>'partner_company' or new.partner_company_id is null then return new; end if;
  select * into invitation from public.installation_marketplace_invitations where company_id=new.partner_company_id for update;
  if invitation.id is null then return new; end if;
  next_status:=case
    when new.participation_status='DRAFT' and invitation.status in ('SENT','OPENED') then 'PARTNER_STARTED'
    when new.participation_status='PENDING_REVIEW' and invitation.status in ('SENT','OPENED','PARTNER_STARTED') then 'PARTNER_SUBMITTED'
    when new.participation_status in ('APPROVED','ACTIVE') and invitation.status not in ('APPROVED') then 'APPROVED'
    when new.participation_status='REJECTED' and invitation.status not in ('DECLINED') then 'DECLINED'
    else null end;
  if next_status is null then return new; end if;
  event_name:=case next_status when 'PARTNER_STARTED' then 'partner_started' when 'PARTNER_SUBMITTED' then 'partner_submitted' when 'APPROVED' then 'partner_approved' else 'partner_declined' end;
  update public.installation_marketplace_invitations set status=next_status,
    started_at=case when next_status='PARTNER_STARTED' then now() else started_at end,
    submitted_at=case when next_status='PARTNER_SUBMITTED' then now() else submitted_at end,
    resolved_at=case when next_status in ('APPROVED','DECLINED') then now() else resolved_at end,
    revision=revision+1,updated_by=coalesce(auth.uid(),updated_by),updated_at=now() where id=invitation.id;
  insert into public.installation_marketplace_supply_events(entity_type,entity_id,company_id,event_type,actor_user_id,correlation_id,safe_evidence)
  values('provider',new.id,new.partner_company_id,event_name,auth.uid(),gen_random_uuid(),jsonb_build_object('participationStatus',new.participation_status,'invitationId',invitation.id));
  return new;
end;
$$;

create trigger sync_installation_marketplace_invitation_lifecycle_v1
after insert or update of participation_status on public.installation_providers
for each row execute function private.sync_installation_marketplace_invitation_lifecycle_v1();

alter table public.partner_notification_events drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events add constraint partner_notification_events_code_check check (event_code in (
  'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled',
  'shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled',
  'invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','onboarding_approved','onboarding_access_opened',
  'watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed',
  'cart_product_price_changed','cart_product_availability_changed','campaign_started','campaign_ending_soon','new_invoice_available',
  'reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','warehouse_arrival_completed',
  'service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received',
  'service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting',
  'service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted',
  'support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected',
  'service_history_accepted','service_history_ready_for_pickup','service_history_issued','installation_offer','finance_payment_due',
  'installation_marketplace_application_submitted','installation_marketplace_approved','installation_marketplace_rejected',
  'installation_marketplace_suspended','installation_marketplace_invitation'
));

alter table public.partner_notifications drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications add constraint partner_notifications_event_code_check check (event_code in (
  'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled',
  'shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled',
  'invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','onboarding_approved','onboarding_access_opened',
  'watched_product_back_in_stock','watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed',
  'cart_product_price_changed','cart_product_availability_changed','campaign_started','campaign_ending_soon','new_invoice_available',
  'reconciliation_statement_available','order_document_available','product_document_updated','document_expiring','warehouse_arrival_completed',
  'service_case_created','service_case_accepted','service_information_requested','service_equipment_expected','service_equipment_received',
  'service_diagnosis_started','service_diagnosis_completed','service_repair_started','service_replacement_approved','service_replacement_waiting',
  'service_ready_for_pickup','service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created','support_ticket_accepted',
  'support_ticket_reply','support_information_requested','support_solution_proposed','support_ticket_resolved','support_ticket_closed','support_ticket_rejected',
  'service_history_accepted','service_history_ready_for_pickup','service_history_issued','installation_offer','finance_payment_due',
  'installation_marketplace_application_submitted','installation_marketplace_approved','installation_marketplace_rejected',
  'installation_marketplace_suspended','installation_marketplace_invitation'
));

alter table public.installation_marketplace_pilot_configurations enable row level security;
alter table public.installation_marketplace_pilot_configurations force row level security;
alter table public.installation_marketplace_invitations enable row level security;
alter table public.installation_marketplace_invitations force row level security;
alter table public.installation_marketplace_supply_events enable row level security;
alter table public.installation_marketplace_supply_events force row level security;

revoke all on table public.installation_marketplace_pilot_configurations,public.installation_marketplace_invitations,public.installation_marketplace_supply_events from public,anon,authenticated;
revoke all on function private.prevent_installation_marketplace_supply_event_mutation_v1() from public,anon,authenticated,service_role;
revoke all on function private.installation_marketplace_invitation_recipient_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function private.sync_installation_marketplace_invitation_lifecycle_v1() from public,anon,authenticated,service_role;
revoke all on function public.admin_get_installation_marketplace_supply_v1(text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.admin_save_installation_marketplace_pilot_config_v1(text,text,boolean,integer,bigint,uuid) from public,anon,authenticated;
revoke all on function public.admin_prepare_installation_marketplace_invitation_v1(uuid,text,text[],timestamptz,bigint,boolean,uuid) from public,anon,authenticated;
revoke all on function public.admin_send_installation_marketplace_invitation_v1(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.admin_get_installation_marketplace_supply_v1(text,text,integer,integer) to authenticated;
grant execute on function public.admin_save_installation_marketplace_pilot_config_v1(text,text,boolean,integer,bigint,uuid) to authenticated;
grant execute on function public.admin_prepare_installation_marketplace_invitation_v1(uuid,text,text[],timestamptz,bigint,boolean,uuid) to authenticated;
grant execute on function public.admin_send_installation_marketplace_invitation_v1(uuid,bigint,uuid) to authenticated;

comment on table public.installation_marketplace_pilot_configurations is 'Admin-governed pilot scope and readiness threshold; not installer eligibility.';
comment on table public.installation_marketplace_invitations is 'Bounded Marketplace-specific Partner outreach lifecycle. SMS is not a supported channel.';
comment on function public.admin_get_installation_marketplace_supply_v1(text,text,integer,integer) is 'Bounded factual supply projection over canonical Partner, provider, capability and geography truth.';

commit;
