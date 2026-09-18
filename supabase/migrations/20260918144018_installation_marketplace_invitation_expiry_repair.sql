begin;

-- An invitation may intentionally have no expiry, while the partner
-- notification contract always requires a bounded lifecycle. Keep the
-- invitation optional and use the existing 90-day notification lifetime.
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
    coalesce(invitation.expires_at,event_time+interval '90 days'),event_time+interval '13 months',false,'off')
  on conflict(recipient_user_id,deduplication_key) do nothing;

  return jsonb_build_object('invitationId',invitation.id,'revision',next_revision,'status','SENT','repeated',false,
    'companyId',company.id,'companyName',company.display_name,'recipientUserId',recipient.user_id,'recipientEmail',recipient.email,
    'recipientLocale',invitation.locale,'identityVerified',recipient.identity_verified,'channels',to_jsonb(invitation.channels),'emailIntentId',intent_id);
end;
$$;

comment on function public.admin_send_installation_marketplace_invitation_v1(uuid,bigint,uuid) is
  'Idempotently sends an approved Marketplace invitation and applies the canonical 90-day notification expiry when the invitation itself has no expiry.';

commit;
