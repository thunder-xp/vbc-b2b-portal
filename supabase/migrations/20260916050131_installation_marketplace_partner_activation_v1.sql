begin;

-- Installation Marketplace Partner Activation V1 extends the canonical
-- installation provider attached to partner_companies. It does not introduce
-- another partner/company identity or change Ranking V2 scoring.

alter table public.installation_providers
  add column participation_status text not null default 'NOT_ENROLLED',
  add column terms_version text null,
  add column terms_accepted_at timestamptz null,
  add column terms_accepted_by uuid null references public.user_profiles(id) on delete restrict,
  add column privacy_version text null,
  add column privacy_accepted_at timestamptz null,
  add column privacy_accepted_by uuid null references public.user_profiles(id) on delete restrict,
  add column submitted_at timestamptz null,
  add column reviewed_at timestamptz null,
  add column reviewed_by uuid null references public.user_profiles(id) on delete restrict,
  add column rejection_reason_code text null,
  add column rejection_note text null;

alter table public.installation_providers
  add constraint installation_providers_participation_status_check check (
    participation_status in ('NOT_ENROLLED','DRAFT','PENDING_REVIEW','APPROVED','ACTIVE','SUSPENDED','REJECTED')
  ),
  add constraint installation_providers_rejection_reason_check check (
    rejection_reason_code is null or rejection_reason_code in (
      'INCOMPLETE_PROFILE','INSUFFICIENT_CAPABILITY','SERVICE_AREA_INVALID','COMPLIANCE','QUALITY_CONCERN','OTHER'
    )
  ),
  add constraint installation_providers_rejection_note_check check (
    rejection_note is null or char_length(rejection_note) <= 500
  ),
  add constraint installation_providers_terms_acceptance_check check (
    (terms_version is null and terms_accepted_at is null and terms_accepted_by is null)
    or (terms_version is not null and terms_accepted_at is not null and terms_accepted_by is not null)
  ),
  add constraint installation_providers_privacy_acceptance_check check (
    (privacy_version is null and privacy_accepted_at is null and privacy_accepted_by is null)
    or (privacy_version is not null and privacy_accepted_at is not null and privacy_accepted_by is not null)
  );

alter table public.installation_provider_profiles
  add column contact_user_id uuid null references public.user_profiles(id) on delete restrict,
  add column response_channel text not null default 'portal'
    check (response_channel in ('portal'));

alter table public.installation_provider_competencies
  drop constraint if exists installation_provider_competencies_system_type_check;
alter table public.installation_provider_competencies
  add constraint installation_provider_competencies_system_type_check check (
    system_type in ('cctv','intercom','access_control','alarm','network','other')
  ),
  add column declaration_status text not null default 'self_declared'
    check (declaration_status in ('self_declared','verified')),
  add column declared_by uuid null references public.user_profiles(id) on delete restrict,
  add column declared_at timestamptz not null default now(),
  add column verified_by uuid null references public.user_profiles(id) on delete restrict,
  add column verified_at timestamptz null,
  add constraint installation_provider_competencies_verification_check check (
    (declaration_status='self_declared' and verified_by is null and verified_at is null)
    or (declaration_status='verified' and verified_at is not null)
  );

-- Existing Admin-created provider truth is preserved. No company is newly
-- enrolled or enabled by this migration.
update public.installation_providers
set participation_status = case
  when provider_type <> 'partner_company' then 'NOT_ENROLLED'
  when operational_status='suspended' then 'SUSPENDED'
  when marketplace_enabled and approval_status='approved' and operational_status='active' then 'ACTIVE'
  when approval_status='approved' then 'APPROVED'
  when approval_status='rejected' then 'REJECTED'
  else 'DRAFT'
end;

update public.installation_provider_competencies
set declaration_status='verified', verified_at=approved_at
where declaration_status='self_declared' and approved_at is not null;

update public.installation_provider_profiles profile
set contact_user_id = candidate.user_id
from public.installation_providers provider
cross join lateral (
  select membership.user_id
  from public.company_memberships membership
  join public.roles role on role.id=membership.role_id
  where membership.company_id=provider.partner_company_id
    and membership.status='active'
    and role.code in ('partner_owner','partner_manager')
  order by case when role.code='partner_owner' then 0 else 1 end, membership.created_at, membership.id
  limit 1
) candidate
where profile.provider_id=provider.id
  and provider.provider_type='partner_company'
  and profile.contact_user_id is null;

create index installation_providers_participation_queue_idx
  on public.installation_providers(participation_status,updated_at desc,id)
  where provider_type='partner_company';
create index installation_provider_competencies_coverage_idx
  on public.installation_provider_competencies(system_type,declaration_status,provider_id)
  where active;

create or replace function private.enforce_installation_provider_participation_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.provider_type='partner_company' then
    if new.marketplace_enabled and new.participation_status<>'ACTIVE' then
      raise exception 'INSTALLATION_PARTICIPATION_NOT_ACTIVE' using errcode='23514';
    end if;
    if new.participation_status='ACTIVE' and not (
      new.marketplace_enabled and new.operational_status='active' and new.approval_status='approved'
    ) then
      raise exception 'INSTALLATION_ACTIVE_STATE_INVALID' using errcode='23514';
    end if;
    if new.participation_status='SUSPENDED' and not (
      new.operational_status='suspended' and not new.marketplace_enabled
    ) then
      raise exception 'INSTALLATION_SUSPENDED_STATE_INVALID' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_installation_provider_participation_v1
before insert or update on public.installation_providers
for each row execute function private.enforce_installation_provider_participation_v1();

alter table public.retail_marketplace_events
  drop constraint if exists retail_marketplace_events_event_type_check;
alter table public.retail_marketplace_events
  add constraint retail_marketplace_events_event_type_check check (event_type in (
    'tariff_draft_created','tariff_draft_updated','tariff_published','tariff_superseded',
    'provider_created','provider_updated','provider_approved','provider_suspended',
    'region_changed','competence_changed','capacity_changed',
    'provider_opted_in','provider_terms_accepted','provider_privacy_acknowledged',
    'provider_submitted','provider_rejected','provider_reactivated','availability_changed'
  ));

alter table public.partner_notification_events
  drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events
  add constraint partner_notification_events_code_check check (event_code in (
    'order_submitted','order_confirmed','order_requires_attention','order_readback_failed',
    'order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days',
    'shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved',
    'date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted',
    'employee_suspended','role_changed','price_access_changed','onboarding_approved',
    'onboarding_access_opened','watched_product_back_in_stock',
    'watched_product_expected_arrival_added','watched_product_arrived',
    'watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed',
    'campaign_started','campaign_ending_soon','new_invoice_available',
    'reconciliation_statement_available','order_document_available','product_document_updated',
    'document_expiring','warehouse_arrival_completed','service_case_created','service_case_accepted',
    'service_information_requested','service_equipment_expected','service_equipment_received',
    'service_diagnosis_started','service_diagnosis_completed','service_repair_started',
    'service_replacement_approved','service_replacement_waiting','service_ready_for_pickup',
    'service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created',
    'support_ticket_accepted','support_ticket_reply','support_information_requested',
    'support_solution_proposed','support_ticket_resolved','support_ticket_closed',
    'support_ticket_rejected','service_history_accepted','service_history_ready_for_pickup',
    'service_history_issued','installation_offer','finance_payment_due',
    'installation_marketplace_application_submitted','installation_marketplace_approved',
    'installation_marketplace_rejected','installation_marketplace_suspended'
  ));

alter table public.partner_notifications
  drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications
  add constraint partner_notifications_event_code_check check (event_code in (
    'order_submitted','order_confirmed','order_requires_attention','order_readback_failed',
    'order_reconciliation_required','order_posted','order_cancelled','shipment_due_in_3_days',
    'shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved',
    'date_change_rejected','date_change_cancelled','invitation_expiring','invitation_accepted',
    'employee_suspended','role_changed','price_access_changed','onboarding_approved',
    'onboarding_access_opened','watched_product_back_in_stock',
    'watched_product_expected_arrival_added','watched_product_arrived',
    'watched_product_price_changed','cart_product_price_changed','cart_product_availability_changed',
    'campaign_started','campaign_ending_soon','new_invoice_available',
    'reconciliation_statement_available','order_document_available','product_document_updated',
    'document_expiring','warehouse_arrival_completed','service_case_created','service_case_accepted',
    'service_information_requested','service_equipment_expected','service_equipment_received',
    'service_diagnosis_started','service_diagnosis_completed','service_repair_started',
    'service_replacement_approved','service_replacement_waiting','service_ready_for_pickup',
    'service_case_closed','service_case_rejected','service_case_cancelled','support_ticket_created',
    'support_ticket_accepted','support_ticket_reply','support_information_requested',
    'support_solution_proposed','support_ticket_resolved','support_ticket_closed',
    'support_ticket_rejected','service_history_accepted','service_history_ready_for_pickup',
    'service_history_issued','installation_offer','finance_payment_due',
    'installation_marketplace_application_submitted','installation_marketplace_approved',
    'installation_marketplace_rejected','installation_marketplace_suspended'
  ));

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean language sql immutable set search_path='' as $$
  select value = '/cabinet'
    or value = '/cabinet/installation-orders'
    or value = '/cabinet/installation-marketplace'
    or value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value ~ '^/cabinet/service/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/service/history/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/support/[0-9a-f-]{36}$'
    or value = '/cabinet/reservation-requests'
    or value = '/cabinet/company/users'
    or value ~ '^/cabinet/catalog/[a-z0-9-]+$'
    or value = '/cabinet/cart'
    or value = '/cabinet/offers'
    or value ~ '^/cabinet/offers/[0-9a-f-]{36}$'
    or value = '/cabinet/documents'
    or value ~ '^/cabinet/documents/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/arrivals/[0-9a-f-]{36}$'
    or value = '/cabinet/campaigns'
    or value = '/cabinet/service'
    or value = '/cabinet/support'
    or value = '/cabinet/finance';
$$;

create or replace function private.installation_marketplace_terms_version_v1()
returns text language sql immutable set search_path='' as $$
  select 'installation-marketplace-terms-v1-2026-09-16'::text;
$$;
create or replace function private.installation_marketplace_privacy_version_v1()
returns text language sql immutable set search_path='' as $$
  select 'installation-marketplace-customer-privacy-v1-2026-09-16'::text;
$$;

create or replace function private.installation_partner_readiness_v1(target_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  company public.partner_companies%rowtype;
  provider public.installation_providers%rowtype;
  profile public.installation_provider_profiles%rowtype;
  public_profile_ready boolean := false;
  capability_ready boolean := false;
  geography_ready boolean := false;
  contact_ready boolean := false;
  response_ready boolean := false;
  terms_ready boolean := false;
  privacy_ready boolean := false;
  admin_ready boolean := false;
  availability_ready boolean := false;
  pre_admin_ready boolean := false;
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
  pre_admin_ready := public_profile_ready and capability_ready and geography_ready
    and contact_ready and response_ready and terms_ready and privacy_ready;
  eligible_now := pre_admin_ready and admin_ready and availability_ready
    and provider.participation_status='ACTIVE' and provider.operational_status='active'
    and provider.marketplace_enabled and profile.public_profile_status='published';

  if provider.id is null then blockers:=array_append(blockers,'NOT_ENROLLED'); end if;
  if not public_profile_ready then blockers:=array_append(blockers,'PUBLIC_PROFILE'); end if;
  if not capability_ready then blockers:=array_append(blockers,'CAPABILITIES'); end if;
  if not geography_ready then blockers:=array_append(blockers,'SERVICE_AREA'); end if;
  if not contact_ready then blockers:=array_append(blockers,'CONTACT_PERSON'); end if;
  if not response_ready then blockers:=array_append(blockers,'RESPONSE_CHANNEL'); end if;
  if not terms_ready then blockers:=array_append(blockers,'MARKETPLACE_TERMS'); end if;
  if not privacy_ready then blockers:=array_append(blockers,'CUSTOMER_PRIVACY'); end if;
  if not admin_ready then blockers:=array_append(blockers,'ADMIN_VERIFICATION'); end if;
  if not availability_ready then blockers:=array_append(blockers,'AVAILABILITY'); end if;

  return jsonb_build_object(
    'preAdminReady',pre_admin_ready,'eligibleNow',eligible_now,'blockers',to_jsonb(blockers),
    'items',jsonb_build_array(
      jsonb_build_object('code','PUBLIC_PROFILE','ready',public_profile_ready),
      jsonb_build_object('code','INSTALLATION_SERVICES','ready',provider.id is not null),
      jsonb_build_object('code','CAPABILITIES','ready',capability_ready),
      jsonb_build_object('code','SERVICE_AREA','ready',geography_ready),
      jsonb_build_object('code','CONTACT_PERSON','ready',contact_ready),
      jsonb_build_object('code','RESPONSE_CHANNEL','ready',response_ready),
      jsonb_build_object('code','MARKETPLACE_TERMS','ready',terms_ready),
      jsonb_build_object('code','CUSTOMER_PRIVACY','ready',privacy_ready),
      jsonb_build_object('code','ADMIN_VERIFICATION','ready',admin_ready),
      jsonb_build_object('code','AVAILABILITY','ready',availability_ready)
    )
  );
end;
$$;

create or replace function private.create_installation_marketplace_notification_v1(
  target_company_id uuid,target_provider_id uuid,target_event_code text,target_source_version text
) returns integer language plpgsql security definer set search_path='' as $$
declare
  event_id uuid;
  event_time timestamptz := now();
  created_count integer := 0;
begin
  if target_event_code not in (
    'installation_marketplace_application_submitted','installation_marketplace_approved',
    'installation_marketplace_rejected','installation_marketplace_suspended'
  ) then raise exception 'INSTALLATION_NOTIFICATION_INVALID' using errcode='22023'; end if;

  insert into public.partner_notification_events(
    company_id,event_code,event_group,domain,entity_type,entity_id,source_table,
    source_event_id,source_version,occurred_at,safe_payload,fingerprint
  ) values (
    target_company_id,target_event_code,'installation','installation_marketplace',
    'installation_provider',target_provider_id,'installation_providers',null,
    target_source_version,event_time,'{}'::jsonb,
    encode(extensions.digest(concat_ws('|',target_event_code,target_company_id::text,target_provider_id::text,target_source_version),'sha256'),'hex')
  ) on conflict(fingerprint) do nothing returning id into event_id;
  if event_id is null then
    select id into event_id from public.partner_notification_events
    where fingerprint=encode(extensions.digest(concat_ws('|',target_event_code,target_company_id::text,target_provider_id::text,target_source_version),'sha256'),'hex');
  end if;

  insert into public.partner_notifications(
    company_id,recipient_user_id,event_code,event_group,domain,severity,mandatory,
    title,message,action_label,action_url,entity_type,entity_id,occurred_at,
    deduplication_key,source_event_id,expires_at,retention_until,
    email_enabled_snapshot,email_delivery_mode
  )
  select target_company_id,membership.user_id,target_event_code,'installation','installation_marketplace',
    case target_event_code when 'installation_marketplace_approved' then 'success'
      when 'installation_marketplace_application_submitted' then 'information'
      else 'warning' end,false,
    case when profile.preferred_locale='ro' then
      case target_event_code
        when 'installation_marketplace_application_submitted' then 'Cererea Marketplace a fost trimisă'
        when 'installation_marketplace_approved' then 'Participarea Marketplace a fost aprobată'
        when 'installation_marketplace_rejected' then 'Cererea Marketplace necesită corectări'
        else 'Participarea Marketplace a fost suspendată' end
    else
      case target_event_code
        when 'installation_marketplace_application_submitted' then 'Заявка Marketplace отправлена'
        when 'installation_marketplace_approved' then 'Участие в Marketplace одобрено'
        when 'installation_marketplace_rejected' then 'Заявка Marketplace требует исправлений'
        else 'Участие в Marketplace приостановлено' end
    end,
    case when profile.preferred_locale='ro' then
      case target_event_code
        when 'installation_marketplace_application_submitted' then 'Novotech va verifica profilul, competențele și zonele de deservire.'
        when 'installation_marketplace_approved' then 'Compania poate primi solicitări de instalare conform disponibilității declarate.'
        when 'installation_marketplace_rejected' then 'Deschideți secțiunea Marketplace, corectați cerințele și retrimiteți cererea.'
        else 'Solicitările noi sunt oprite. Istoricul lucrărilor rămâne disponibil.' end
    else
      case target_event_code
        when 'installation_marketplace_application_submitted' then 'Novotech проверит профиль, компетенции и регионы обслуживания.'
        when 'installation_marketplace_approved' then 'Компания может получать заявки на монтаж с учётом указанной доступности.'
        when 'installation_marketplace_rejected' then 'Откройте Marketplace, исправьте требования и отправьте заявку повторно.'
        else 'Новые заявки остановлены. История выполненных работ сохранена.' end
    end,
    case when profile.preferred_locale='ro' then 'Deschide Marketplace' else 'Открыть Marketplace' end,
    '/cabinet/installation-marketplace','installation_provider',target_provider_id,event_time,
    encode(extensions.digest(event_id::text||'|'||membership.user_id::text,'sha256'),'hex'),
    event_id,event_time+interval '90 days',event_time+interval '13 months',false,'off'
  from public.company_memberships membership
  join public.user_profiles profile on profile.id=membership.user_id and profile.status='approved'
  where membership.company_id=target_company_id and membership.status='active'
    and public.notification_user_has_permission(membership.user_id,target_company_id,'installation_marketplace.manage')
  on conflict(recipient_user_id,deduplication_key) do nothing;
  get diagnostics created_count=row_count;
  return created_count;
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
begin
  if p_locale not in ('ru','ro') or not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id,'installation_marketplace.manage') then
    raise exception 'INSTALLATION_PARTNER_DENIED' using errcode='42501';
  end if;
  select * into company from public.partner_companies where id=p_company_id and status='active';
  if company.id is null then raise exception 'INSTALLATION_COMPANY_NOT_ACTIVE' using errcode='42501'; end if;
  select * into provider from public.installation_providers
    where partner_company_id=p_company_id and provider_type='partner_company';
  if provider.id is not null then select * into profile from public.installation_provider_profiles where provider_id=provider.id; end if;
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
    'readiness',readiness,
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

create or replace function public.partner_opt_in_installation_marketplace_v1(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.partner_companies%rowtype; provider_id uuid; provider_revision bigint;
begin
  if not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id,'installation_marketplace.manage') then
    raise exception 'INSTALLATION_PARTNER_DENIED' using errcode='42501';
  end if;
  select * into company from public.partner_companies where id=p_company_id and status='active' for update;
  if company.id is null then raise exception 'INSTALLATION_COMPANY_NOT_ACTIVE' using errcode='42501'; end if;
  select id,revision into provider_id,provider_revision from public.installation_providers
    where partner_company_id=p_company_id and provider_type='partner_company';
  if provider_id is not null then
    return jsonb_build_object('providerId',provider_id,'revision',provider_revision,'repeated',true);
  end if;
  insert into public.installation_providers(
    provider_type,partner_company_id,operational_status,approval_status,marketplace_enabled,
    participation_status,created_by,updated_by
  ) values('partner_company',p_company_id,'inactive','pending',false,'DRAFT',auth.uid(),auth.uid())
  returning id,revision into provider_id,provider_revision;
  insert into public.installation_provider_profiles(
    provider_id,public_name_ru,public_name_ro,logo_path,public_profile_status,
    availability_state,contact_user_id,response_channel,acceptance_sla_minutes
  ) values(
    provider_id,coalesce(company.public_display_name,company.display_name),
    coalesce(company.public_display_name,company.display_name),company.public_directory_logo_asset_path,
    'draft','unavailable',auth.uid(),'portal',120
  );
  insert into public.retail_marketplace_events(
    aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence
  ) values('provider',provider_id,'provider_opted_in',auth.uid(),jsonb_build_object('companyId',p_company_id));
  return jsonb_build_object('providerId',provider_id,'revision',provider_revision,'repeated',false);
end;
$$;

create or replace function public.partner_save_installation_marketplace_draft_v1(
  p_company_id uuid,p_description_ru text,p_description_ro text,p_availability text,
  p_max_concurrent_jobs integer,p_capabilities text[],p_region_codes text[],
  p_accept_terms boolean,p_accept_privacy boolean,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  provider public.installation_providers%rowtype;
  profile public.installation_provider_profiles%rowtype;
  company public.partner_companies%rowtype;
  old_capabilities text[]; old_regions text[]; new_capabilities text[]; new_regions text[];
  material_change boolean; availability_change boolean; terms_change boolean; privacy_change boolean;
  next_status text; next_revision bigint;
begin
  if not public.has_active_company_membership(p_company_id)
    or not public.has_permission(p_company_id,'installation_marketplace.manage') then
    raise exception 'INSTALLATION_PARTNER_DENIED' using errcode='42501';
  end if;
  if p_availability not in ('available','limited','unavailable')
    or p_max_concurrent_jobs is not null and p_max_concurrent_jobs not between 1 and 100
    or char_length(coalesce(p_description_ru,''))>1000 or char_length(coalesce(p_description_ro,''))>1000
    or coalesce(array_length(p_capabilities,1),0)>6 or coalesce(array_length(p_region_codes,1),0)>100
    or exists(select 1 from unnest(coalesce(p_capabilities,array[]::text[])) value
      where value not in ('cctv','intercom','access_control','alarm','network','other'))
    or exists(select 1 from unnest(coalesce(p_region_codes,array[]::text[])) value
      left join public.installation_service_regions region on region.code=value and region.active
      where region.id is null) then
    raise exception 'INSTALLATION_PARTNER_INPUT_INVALID' using errcode='22023';
  end if;
  select * into provider from public.installation_providers
    where partner_company_id=p_company_id and provider_type='partner_company' for update;
  if provider.id is null then raise exception 'INSTALLATION_PARTNER_NOT_ENROLLED' using errcode='P0002'; end if;
  if provider.participation_status in ('PENDING_REVIEW','SUSPENDED') then
    raise exception 'INSTALLATION_PARTNER_EDIT_LOCKED' using errcode='42501';
  end if;
  if provider.revision<>p_expected_revision then raise exception 'INSTALLATION_PARTNER_REVISION_CONFLICT' using errcode='40001'; end if;
  select * into company from public.partner_companies where id=p_company_id and status='active';
  select * into profile from public.installation_provider_profiles where provider_id=provider.id;
  select coalesce(array_agg(distinct competence.system_type order by competence.system_type),array[]::text[])
    into old_capabilities from public.installation_provider_competencies competence
    where competence.provider_id=provider.id and competence.active;
  select coalesce(array_agg(distinct region.code order by region.code),array[]::text[])
    into old_regions from public.installation_provider_regions coverage
    join public.installation_service_regions region on region.id=coverage.region_id
    where coverage.provider_id=provider.id and coverage.active;
  select coalesce(array_agg(distinct value order by value),array[]::text[]) into new_capabilities
    from unnest(coalesce(p_capabilities,array[]::text[])) value;
  select coalesce(array_agg(distinct value order by value),array[]::text[]) into new_regions
    from unnest(coalesce(p_region_codes,array[]::text[])) value;
  material_change := old_capabilities<>new_capabilities or old_regions<>new_regions
    or coalesce(profile.public_description_ru,'')<>btrim(coalesce(p_description_ru,''))
    or coalesce(profile.public_description_ro,'')<>btrim(coalesce(p_description_ro,''));
  availability_change := profile.availability_state<>p_availability;
  terms_change := p_accept_terms and provider.terms_version is distinct from private.installation_marketplace_terms_version_v1();
  privacy_change := p_accept_privacy and provider.privacy_version is distinct from private.installation_marketplace_privacy_version_v1();
  next_status := case
    when provider.participation_status='ACTIVE' and material_change then 'DRAFT'
    when provider.participation_status='REJECTED' then 'DRAFT'
    when provider.participation_status='APPROVED' and p_availability<>'unavailable' and not material_change then 'ACTIVE'
    else provider.participation_status end;

  update public.installation_provider_profiles set
    public_name_ru=coalesce(company.public_display_name,company.display_name),
    public_name_ro=coalesce(company.public_display_name,company.display_name),
    public_description_ru=nullif(btrim(coalesce(p_description_ru,'')),''),
    public_description_ro=nullif(btrim(coalesce(p_description_ro,'')),''),
    logo_path=company.public_directory_logo_asset_path,
    public_profile_status=case when next_status='ACTIVE' then 'published' else 'draft' end,
    availability_state=p_availability,max_concurrent_jobs=p_max_concurrent_jobs,
    contact_user_id=auth.uid(),response_channel='portal',updated_at=now()
  where provider_id=provider.id;

  delete from public.installation_provider_competencies competence
    where competence.provider_id=provider.id and not (competence.system_type=any(new_capabilities));
  insert into public.installation_provider_competencies(
    provider_id,system_type,active,declaration_status,declared_by,declared_at,approved_at
  ) select provider.id,value,true,'self_declared',auth.uid(),now(),now()
    from unnest(new_capabilities) value
  on conflict(provider_id,system_type) do update set active=true;

  delete from public.installation_provider_regions coverage
    where coverage.provider_id=provider.id and not exists(
      select 1 from public.installation_service_regions region
      where region.id=coverage.region_id and region.code=any(new_regions)
    );
  insert into public.installation_provider_regions(provider_id,region_id,active)
  select provider.id,region.id,true from public.installation_service_regions region
  where region.code=any(new_regions)
  on conflict(provider_id,region_id) do update set active=true;

  update public.installation_providers set
    participation_status=next_status,
    operational_status=case when next_status='ACTIVE' then 'active' else 'inactive' end,
    approval_status=case when next_status='ACTIVE' then 'approved' when material_change then 'pending' else approval_status end,
    marketplace_enabled=next_status='ACTIVE',
    terms_version=case when p_accept_terms then private.installation_marketplace_terms_version_v1() else terms_version end,
    terms_accepted_at=case when terms_change then now() else terms_accepted_at end,
    terms_accepted_by=case when terms_change then auth.uid() else terms_accepted_by end,
    privacy_version=case when p_accept_privacy then private.installation_marketplace_privacy_version_v1() else privacy_version end,
    privacy_accepted_at=case when privacy_change then now() else privacy_accepted_at end,
    privacy_accepted_by=case when privacy_change then auth.uid() else privacy_accepted_by end,
    rejection_reason_code=case when next_status='DRAFT' then null else rejection_reason_code end,
    rejection_note=case when next_status='DRAFT' then null else rejection_note end,
    revision=revision+1,updated_by=auth.uid(),updated_at=now()
  where id=provider.id returning revision into next_revision;

  if material_change then insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('provider',provider.id,'provider_updated',auth.uid(),jsonb_build_object('status',next_status)); end if;
  if old_capabilities<>new_capabilities then insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('provider',provider.id,'competence_changed',auth.uid(),jsonb_build_object('capabilities',to_jsonb(new_capabilities))); end if;
  if old_regions<>new_regions then insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('provider',provider.id,'region_changed',auth.uid(),jsonb_build_object('regions',to_jsonb(new_regions))); end if;
  if availability_change then insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('provider',provider.id,'availability_changed',auth.uid(),jsonb_build_object('availability',p_availability)); end if;
  if terms_change then insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('provider',provider.id,'provider_terms_accepted',auth.uid(),jsonb_build_object('version',private.installation_marketplace_terms_version_v1())); end if;
  if privacy_change then insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('provider',provider.id,'provider_privacy_acknowledged',auth.uid(),jsonb_build_object('version',private.installation_marketplace_privacy_version_v1())); end if;
  return jsonb_build_object('providerId',provider.id,'revision',next_revision,'status',next_status);
end;
$$;

create or replace function public.partner_submit_installation_marketplace_v1(
  p_company_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare provider public.installation_providers%rowtype; readiness jsonb; next_revision bigint;
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
  if not coalesce((readiness->>'preAdminReady')::boolean,false) then
    raise exception 'INSTALLATION_PARTNER_NOT_READY:%',readiness->'blockers' using errcode='22023';
  end if;
  update public.installation_providers set participation_status='PENDING_REVIEW',
    operational_status='inactive',approval_status='pending',marketplace_enabled=false,
    submitted_at=now(),rejection_reason_code=null,rejection_note=null,
    revision=revision+1,updated_by=auth.uid(),updated_at=now()
  where id=provider.id returning revision into next_revision;
  insert into public.retail_marketplace_events(aggregate_type,aggregate_id,event_type,actor_user_id,safe_evidence)
    values('provider',provider.id,'provider_submitted',auth.uid(),jsonb_build_object('revision',next_revision));
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
      'availability',profile.availability_state,'publicProfileVisible',company.public_directory_visible,
      'publicDisplayName',company.public_display_name,'publicLogoPath',company.public_directory_logo_asset_path,
      'termsAccepted',provider.terms_version=private.installation_marketplace_terms_version_v1(),
      'privacyAccepted',provider.privacy_version=private.installation_marketplace_privacy_version_v1(),
      'rejectionReasonCode',provider.rejection_reason_code,'rejectionNote',provider.rejection_note,
      'readiness',private.installation_partner_readiness_v1(company.id),
      'capabilities',coalesce((select jsonb_agg(jsonb_build_object('code',competence.system_type,'verificationStatus',competence.declaration_status) order by competence.system_type)
        from public.installation_provider_competencies competence where competence.provider_id=provider.id and competence.active),'[]'::jsonb),
      'serviceAreas',coalesce((select jsonb_agg(jsonb_build_object('code',region.code,'nameRu',region.name_ru,'nameRo',region.name_ro) order by region.code)
        from public.installation_provider_regions coverage join public.installation_service_regions region on region.id=coverage.region_id
        where coverage.provider_id=provider.id and coverage.active),'[]'::jsonb)
    ) order by case provider.participation_status when 'PENDING_REVIEW' then 0 when 'SUSPENDED' then 1 else 2 end,lower(company.display_name),provider.id)
      from public.installation_providers provider
      join public.partner_companies company on company.id=provider.partner_company_id
      join public.installation_provider_profiles profile on profile.provider_id=provider.id
      where provider.provider_type='partner_company' and provider.participation_status<>'NOT_ENROLLED'),'[]'::jsonb),
    'coverage',coalesce((select jsonb_agg(jsonb_build_object(
      'regionCode',coverage.region_code,'regionNameRu',coverage.name_ru,'regionNameRo',coverage.name_ro,
      'capability',coverage.system_type,'installerCount',coverage.installer_count
    ) order by coverage.region_code,coverage.system_type) from (
      select region.code region_code,region.name_ru,region.name_ro,capability.system_type,
        count(distinct provider.id) filter (
          where profile.provider_id is not null and competence.provider_id is not null
        )::integer installer_count
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
declare provider public.installation_providers%rowtype; readiness jsonb; next_status text; next_revision bigint; event_name text; notification_code text;
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
  if p_action in ('APPROVE','REACTIVATE') and not coalesce((readiness->>'preAdminReady')::boolean,false) then
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

alter table public.installation_providers enable row level security;
alter table public.installation_providers force row level security;
alter table public.installation_provider_profiles enable row level security;
alter table public.installation_provider_profiles force row level security;
alter table public.installation_provider_competencies enable row level security;
alter table public.installation_provider_competencies force row level security;
alter table public.installation_provider_regions enable row level security;
alter table public.installation_provider_regions force row level security;
alter table public.retail_marketplace_events enable row level security;
alter table public.retail_marketplace_events force row level security;

revoke all on function private.enforce_installation_provider_participation_v1() from public,anon,authenticated,service_role;
revoke all on function private.installation_marketplace_terms_version_v1() from public,anon,authenticated,service_role;
revoke all on function private.installation_marketplace_privacy_version_v1() from public,anon,authenticated,service_role;
revoke all on function private.installation_partner_readiness_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function private.create_installation_marketplace_notification_v1(uuid,uuid,text,text) from public,anon,authenticated,service_role;

revoke all on function public.partner_get_installation_marketplace_activation_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.partner_opt_in_installation_marketplace_v1(uuid) from public,anon,authenticated;
revoke all on function public.partner_save_installation_marketplace_draft_v1(uuid,text,text,text,integer,text[],text[],boolean,boolean,bigint) from public,anon,authenticated;
revoke all on function public.partner_submit_installation_marketplace_v1(uuid,bigint) from public,anon,authenticated;
revoke all on function public.admin_get_installation_partner_activation_v1() from public,anon,authenticated;
revoke all on function public.admin_review_installation_partner_activation_v1(uuid,text,text,text,bigint) from public,anon,authenticated;

grant execute on function public.partner_get_installation_marketplace_activation_v1(uuid,text) to authenticated;
grant execute on function public.partner_opt_in_installation_marketplace_v1(uuid) to authenticated;
grant execute on function public.partner_save_installation_marketplace_draft_v1(uuid,text,text,text,integer,text[],text[],boolean,boolean,bigint) to authenticated;
grant execute on function public.partner_submit_installation_marketplace_v1(uuid,bigint) to authenticated;
grant execute on function public.admin_get_installation_partner_activation_v1() to authenticated;
grant execute on function public.admin_review_installation_partner_activation_v1(uuid,text,text,text,bigint) to authenticated;

comment on column public.installation_providers.participation_status is
  'Explicit Partner Marketplace participation lifecycle; independent from public directory visibility.';
comment on function public.partner_opt_in_installation_marketplace_v1(uuid) is
  'Explicit company-scoped Partner opt-in; never mass-enrols B2B companies.';

commit;
