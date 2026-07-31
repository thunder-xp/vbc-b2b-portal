-- Avoid PL/pgSQL variable/column ambiguity in the campaign lifecycle worker.
create or replace function public.refresh_commercial_campaign_lifecycle()
returns jsonb language plpgsql security definer set search_path=public as $$
declare activated uuid[]; completed uuid[]; lifecycle_campaign_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  with changed as (update public.commercial_campaigns set status='active',updated_at=now() where status='scheduled' and starts_at<=now() and ends_at>now() returning id) select coalesce(array_agg(id),'{}') into activated from changed;
  with changed as (update public.commercial_campaigns set status='completed',updated_at=now() where status='active' and ends_at<=now() returning id) select coalesce(array_agg(id),'{}') into completed from changed;
  foreach lifecycle_campaign_id in array activated loop perform public.project_commercial_campaign_search(lifecycle_campaign_id); end loop;
  foreach lifecycle_campaign_id in array completed loop delete from public.partner_search_documents where document_key like 'commercial_campaign:'||lifecycle_campaign_id::text||':%'; end loop;
  with candidates as (
    select campaign.id campaign_id,campaign.partner_title,campaign.ends_at,audience.company_id,membership.user_id,
      case when campaign.id=any(activated) then 'campaign_started' else 'campaign_ending_soon' end event_code
    from public.commercial_campaigns campaign
    join public.commercial_campaign_audience_snapshots audience on audience.campaign_id=campaign.id and audience.version_number=campaign.current_version and audience.included
    join public.company_memberships membership on membership.company_id=audience.company_id and membership.status='active'
    where campaign.id=any(activated) or (campaign.status='active' and campaign.ends_at between now() and now()+interval '24 hours')
  ), sources as (
    insert into public.partner_notification_events(company_id,event_code,event_group,domain,entity_type,entity_id,source_table,source_version,occurred_at,safe_payload,fingerprint)
    select company_id,event_code,'commercial','campaigns','campaign',campaign_id,'commercial_campaigns',date_trunc('day',now())::text,now(),jsonb_build_object('campaignTitle',partner_title,'endsAt',ends_at),
      encode(digest(concat_ws('|','campaign_notification',campaign_id::text,company_id::text,event_code,date_trunc('day',now())::text),'sha256'),'hex')
    from candidates group by campaign_id,partner_title,ends_at,company_id,event_code
    on conflict(fingerprint) do nothing returning *
  )
  insert into public.partner_notifications(company_id,recipient_user_id,event_code,event_group,domain,severity,mandatory,title,message,action_label,action_url,entity_type,entity_id,occurred_at,deduplication_key,source_event_id,expires_at,retention_until,email_enabled_snapshot,email_delivery_mode)
  select candidate.company_id,candidate.user_id,candidate.event_code,'commercial','campaigns','information',false,
    case candidate.event_code when 'campaign_started' then 'Новое предложение для вашей компании' else 'Предложение скоро завершится' end,
    candidate.partner_title,'Открыть предложение','/cabinet/offers/'||candidate.campaign_id::text,'campaign',candidate.campaign_id,now(),
    encode(digest(source.fingerprint||':'||candidate.user_id::text,'sha256'),'hex'),source.id,candidate.ends_at,least(candidate.ends_at+interval '90 days',now()+interval '13 months'),false,'off'
  from candidates candidate join public.partner_notification_events source on source.fingerprint=encode(digest(concat_ws('|','campaign_notification',candidate.campaign_id::text,candidate.company_id::text,candidate.event_code,date_trunc('day',now())::text),'sha256'),'hex')
  left join public.partner_notification_preferences preference on preference.company_id=candidate.company_id and preference.user_id=candidate.user_id and preference.event_group='commercial'
  where coalesce(preference.in_app_enabled,true) on conflict(recipient_user_id,deduplication_key) do nothing;
  return jsonb_build_object('activated',cardinality(activated),'completed',cardinality(completed));
end; $$;

revoke all on function public.refresh_commercial_campaign_lifecycle() from public,anon,authenticated;
grant execute on function public.refresh_commercial_campaign_lifecycle() to service_role;
