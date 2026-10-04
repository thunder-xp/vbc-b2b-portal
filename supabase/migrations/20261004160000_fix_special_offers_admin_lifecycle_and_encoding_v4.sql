begin;

alter table public.commercial_campaigns
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references public.user_profiles(id) on delete restrict;

alter table public.commercial_campaigns
  drop constraint if exists commercial_campaign_deletion_shape_check;
alter table public.commercial_campaigns
  add constraint commercial_campaign_deletion_shape_check check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null and status = 'archived')
  );

create index if not exists commercial_campaigns_operational_workspace_idx
  on public.commercial_campaigns(status, campaign_type, updated_at desc, id)
  where deleted_at is null;

alter table public.commercial_campaign_audit_events
  drop constraint if exists commercial_campaign_audit_events_event_type_check;
alter table public.commercial_campaign_audit_events
  add constraint commercial_campaign_audit_events_event_type_check
  check (event_type in (
    'draft_created','draft_updated','published','paused','resumed','completed',
    'archived','revision_created','duplicated','reopened_for_edit','deleted'
  ));

create or replace function public.list_admin_commercial_campaigns_v2(
  p_status text default null,
  p_search text default '',
  p_campaign_type text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.view') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_limit not between 1 and 50 or p_offset < 0
    or (p_status is not null and p_status not in ('draft','scheduled','active','paused','completed','archived'))
    or (p_campaign_type is not null and p_campaign_type not in ('product_offer','stock_clearance','arrival_promotion','reorder_campaign','category_campaign','partner_segment_offer'))
    or char_length(coalesce(p_search,'')) > 100 then
    raise exception 'CAMPAIGN_FILTER_INVALID' using errcode='22023';
  end if;

  with filtered as materialized (
    select campaign.*
    from public.commercial_campaigns campaign
    where campaign.deleted_at is null
      and (p_status is null or campaign.status = p_status)
      and (p_campaign_type is null or campaign.campaign_type = p_campaign_type)
      and (p_date_from is null or campaign.ends_at >= p_date_from)
      and (p_date_to is null or campaign.starts_at < p_date_to + interval '1 day')
      and (
        nullif(btrim(p_search),'') is null
        or lower(campaign.code) like '%'||lower(btrim(p_search))||'%'
        or lower(campaign.name) like '%'||lower(btrim(p_search))||'%'
        or lower(campaign.partner_title) like '%'||lower(btrim(p_search))||'%'
      )
  ), page as (
    select filtered.*
    from filtered
    order by filtered.updated_at desc, filtered.id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(page) || jsonb_build_object(
      'item_count', (select count(*) from public.commercial_campaign_items item where item.campaign_id=page.id),
      'audience_count', case
        when page.current_version > 0 then (
          select count(*)
          from public.commercial_campaign_audience_snapshots snapshot
          where snapshot.campaign_id=page.id
            and snapshot.version_number=page.current_version
            and snapshot.included
        )
        else (select count(*) from public.commercial_campaign_audience_rules rule where rule.campaign_id=page.id)
      end
    ) order by page.updated_at desc, page.id), '[]'::jsonb),
    'totalCount', (select count(*) from filtered)
  ) into v_result
  from page;

  return coalesce(v_result, jsonb_build_object('items','[]'::jsonb,'totalCount',0));
end;
$$;

alter function public.get_admin_commercial_campaign_v2(uuid)
  rename to get_admin_commercial_campaign_pre_lifecycle_v4;

revoke all on function public.get_admin_commercial_campaign_pre_lifecycle_v4(uuid)
  from public, anon, authenticated;

create function public.get_admin_commercial_campaign_v2(p_campaign_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.view') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  v_result := public.get_admin_commercial_campaign_pre_lifecycle_v4(p_campaign_id);
  if v_result is null or nullif(v_result->'campaign'->>'deleted_at', '') is not null then
    return null;
  end if;
  return v_result;
end;
$$;

alter function public.duplicate_commercial_campaign_v1(uuid,uuid)
  rename to duplicate_commercial_campaign_pre_lifecycle_v4;

revoke all on function public.duplicate_commercial_campaign_pre_lifecycle_v4(uuid,uuid)
  from public, anon, authenticated;

create function public.duplicate_commercial_campaign_v1(p_campaign_id uuid,p_request_id uuid)
returns uuid
language plpgsql security definer set search_path = '' set row_security = off as $$
declare v_target public.commercial_campaigns;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.create') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select * into v_target
  from public.commercial_campaigns
  where id=p_campaign_id and deleted_at is null
  for share;
  if v_target.id is null then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002';
  end if;
  return public.duplicate_commercial_campaign_pre_lifecycle_v4(p_campaign_id,p_request_id);
end;
$$;

create function public.reopen_commercial_campaign_for_edit_v1(p_campaign_id uuid,p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_actor uuid := auth.uid();
  v_target public.commercial_campaigns;
  v_revision integer;
begin
  if v_actor is null or not public.has_internal_permission('campaigns.edit') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'CAMPAIGN_REASON_REQUIRED' using errcode='22023';
  end if;

  select * into v_target
  from public.commercial_campaigns
  where id=p_campaign_id and deleted_at is null
  for update;
  if v_target.id is null then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002';
  end if;
  if v_target.status='draft' and v_target.current_version > 0 then
    return jsonb_build_object('campaignId',v_target.id,'status','draft','revision',v_target.draft_revision,'idempotent',true);
  end if;
  if v_target.status<>'paused' then
    raise exception 'CAMPAIGN_PAUSED_REQUIRED' using errcode='23514';
  end if;

  v_revision := v_target.draft_revision + 1;
  update public.commercial_campaigns
  set status='draft', approved_by=null, published_at=null, archived_at=null,
      draft_revision=v_revision, last_edit_request_id=null, updated_at=now()
  where id=v_target.id;
  delete from public.partner_search_documents
  where document_key like 'commercial_campaign:'||v_target.id::text||':%';
  insert into public.commercial_campaign_audit_events(
    campaign_id,version_number,event_type,actor_user_id,reason,safe_metadata
  ) values (
    v_target.id,nullif(v_target.current_version,0),'reopened_for_edit',v_actor,left(btrim(p_reason),500),
    jsonb_build_object('previousStatus',v_target.status,'revision',v_revision)
  );
  return jsonb_build_object('campaignId',v_target.id,'status','draft','revision',v_revision,'idempotent',false);
end;
$$;

create function public.delete_archived_commercial_campaign_v1(p_campaign_id uuid,p_reason text)
returns boolean
language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  v_actor uuid := auth.uid();
  v_target public.commercial_campaigns;
begin
  if v_actor is null or not public.has_internal_permission('campaigns.edit') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'CAMPAIGN_REASON_REQUIRED' using errcode='22023';
  end if;

  select * into v_target
  from public.commercial_campaigns
  where id=p_campaign_id
  for update;
  if v_target.id is null then
    raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002';
  end if;
  if v_target.deleted_at is not null then
    return true;
  end if;
  if v_target.status<>'archived' then
    raise exception 'CAMPAIGN_ARCHIVED_REQUIRED' using errcode='23514';
  end if;

  insert into public.commercial_campaign_audit_events(
    campaign_id,version_number,event_type,actor_user_id,reason,safe_metadata
  ) values (
    v_target.id,nullif(v_target.current_version,0),'deleted',v_actor,left(btrim(p_reason),500),
    jsonb_build_object('deletionMode','tombstone','previousStatus',v_target.status)
  );
  update public.commercial_campaigns
  set deleted_at=now(),deleted_by=v_actor,updated_at=now()
  where id=v_target.id;
  delete from public.partner_search_documents
  where document_key like 'commercial_campaign:'||v_target.id::text||':%';
  return true;
end;
$$;

revoke all on function public.list_admin_commercial_campaigns_v2(text,text,text,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.list_admin_commercial_campaigns_v2(text,text,text,timestamptz,timestamptz,integer,integer) to authenticated;
revoke all on function public.get_admin_commercial_campaign_v2(uuid) from public,anon;
grant execute on function public.get_admin_commercial_campaign_v2(uuid) to authenticated;
revoke all on function public.duplicate_commercial_campaign_v1(uuid,uuid) from public,anon;
grant execute on function public.duplicate_commercial_campaign_v1(uuid,uuid) to authenticated;
revoke all on function public.reopen_commercial_campaign_for_edit_v1(uuid,text) from public,anon;
grant execute on function public.reopen_commercial_campaign_for_edit_v1(uuid,text) to authenticated;
revoke all on function public.delete_archived_commercial_campaign_v1(uuid,text) from public,anon;
grant execute on function public.delete_archived_commercial_campaign_v1(uuid,text) to authenticated;

comment on function public.reopen_commercial_campaign_for_edit_v1(uuid,text) is
  'Moves only a paused, non-deleted campaign back to draft while retaining immutable published versions and audit history.';
comment on function public.delete_archived_commercial_campaign_v1(uuid,text) is
  'Tombstones only an archived campaign so it leaves operational Admin views while immutable versions and audit evidence remain.';

commit;
