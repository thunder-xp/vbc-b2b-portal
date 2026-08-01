begin;

alter table public.partner_document_sync_state
  add column if not exists source_index integer not null default 0,
  add column if not exists source_entity text null,
  add column if not exists next_skip integer not null default 0,
  add column if not exists rows_staged integer not null default 0,
  add column if not exists rows_rejected integer not null default 0,
  add column if not exists mapped_companies integer not null default 0,
  add column if not exists unmapped_companies integer not null default 0,
  add column if not exists linked_orders integer not null default 0,
  add column if not exists unlinked_orders integer not null default 0,
  add column if not exists posted_documents integer not null default 0,
  add column if not exists cancelled_documents integer not null default 0,
  add column if not exists corrected_documents integer not null default 0,
  add column if not exists metadata_only_documents integer not null default 0,
  add column if not exists lock_acquired_at timestamptz null,
  add column if not exists source_stats jsonb not null default '{}'::jsonb;

alter table public.partner_document_sync_state
  add constraint partner_document_sync_cursor_check check (source_index >= 0 and next_skip >= 0),
  add constraint partner_document_sync_extended_counts_check check (
    rows_staged >= 0 and rows_rejected >= 0 and mapped_companies >= 0
    and unmapped_companies >= 0 and linked_orders >= 0 and unlinked_orders >= 0
    and posted_documents >= 0 and cancelled_documents >= 0
    and corrected_documents >= 0 and metadata_only_documents >= 0
  ),
  add constraint partner_document_sync_source_stats_check check (jsonb_typeof(source_stats) = 'object');

create table public.partner_document_sync_stage (
  sync_id uuid not null,
  source_index integer not null,
  source_entity text not null,
  source_document_ref text not null,
  document_type text not null,
  title text not null,
  document_number text not null,
  document_date timestamptz not null,
  posted boolean not null,
  deletion_marked boolean not null,
  counterparty_ref text not null,
  contract_ref text null,
  order_ref text null,
  base_document_ref text null,
  correction_ref text null,
  currency_ref text null,
  source_version text null,
  staged_at timestamptz not null default now(),
  primary key (sync_id, source_entity, source_document_ref),
  constraint partner_document_stage_source_check check (source_entity in (
    'Document_СчетФактура','Document_РасходнаяНакладная','Document_СчетНаОплату',
    'Document_СверкаВзаиморасчетов','Document_ЗаказПокупателя'
  )),
  constraint partner_document_stage_type_check check (document_type in (
    'fiscal_invoice','delivery_note','invoice','reconciliation_statement','order_confirmation'
  )),
  constraint partner_document_stage_identity_check check (
    source_document_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    and source_document_ref <> '00000000-0000-0000-0000-000000000000'
    and counterparty_ref ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    and counterparty_ref <> '00000000-0000-0000-0000-000000000000'
  )
);

create index partner_document_stage_sync_source_idx
  on public.partner_document_sync_stage(sync_id, source_index, source_entity);
create index partner_document_stage_counterparty_idx
  on public.partner_document_sync_stage(sync_id, counterparty_ref);
create index partner_document_stage_order_idx
  on public.partner_document_sync_stage(sync_id, order_ref)
  where order_ref is not null;

alter table public.partner_document_sync_stage enable row level security;
revoke all on public.partner_document_sync_stage from public, anon, authenticated;
create unique index partner_document_audit_sync_version_idx
  on public.partner_document_audit_events(document_id,(safe_metadata->>'sourceVersion'))
  where event_type='synchronized' and safe_metadata ? 'sourceVersion';

create or replace function public.begin_or_resume_partner_document_sync()
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare state public.partner_document_sync_state%rowtype; new_sync_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('partner_document_metadata_sync', 0));
  select * into state from public.partner_document_sync_state where id=true for update;
  if state.status='running' and state.lock_acquired_at >= now()-interval '15 minutes' then
    return jsonb_build_object('syncId',state.active_sync_id,'sourceIndex',state.source_index,'nextSkip',state.next_skip,'resumed',true,'locked',true);
  end if;
  if state.status='running' and state.updated_at < now()-interval '24 hours' then
    update public.partner_document_sync_state set status='failed',safe_error_code='stale_lock_recovered',updated_at=now() where id=true;
  end if;
  if state.status='running' then
    update public.partner_document_sync_state set lock_acquired_at=now(),updated_at=now() where id=true;
    return jsonb_build_object('syncId',state.active_sync_id,'sourceIndex',state.source_index,'nextSkip',state.next_skip,'resumed',true,'locked',false);
  end if;
  new_sync_id := gen_random_uuid();
  delete from public.partner_document_sync_stage where staged_at < now()-interval '7 days';
  update public.partner_document_sync_state set
    status='running',provider_status='configured',active_sync_id=new_sync_id,
    last_started_at=now(),last_completed_at=null,pages_processed=0,rows_received=0,
    rows_published=0,missing_files=0,failed_retrievals=0,safe_error_code=null,
    source_index=0,source_entity='Document_СчетФактура',next_skip=0,rows_staged=0,
    rows_rejected=0,mapped_companies=0,unmapped_companies=0,linked_orders=0,
    unlinked_orders=0,posted_documents=0,cancelled_documents=0,corrected_documents=0,
    metadata_only_documents=0,lock_acquired_at=now(),source_stats='{}'::jsonb,updated_at=now()
  where id=true;
  return jsonb_build_object('syncId',new_sync_id,'sourceIndex',0,'nextSkip',0,'resumed',false,'locked',false);
end $$;

create or replace function public.release_partner_document_sync_lease(p_sync_id uuid)
returns void language sql security definer set search_path=public set row_security=off as $$
  update public.partner_document_sync_state set lock_acquired_at=null,updated_at=now()
  where id=true and status='running' and active_sync_id=p_sync_id
$$;

create or replace function public.stage_partner_document_sync_page(
  p_sync_id uuid,p_source_index integer,p_source_entity text,p_next_source_index integer,
  p_next_skip integer,p_received integer,p_rejected integer,p_rows jsonb
) returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare staged_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('partner_document_metadata_sync', 0));
  if not exists(select 1 from public.partner_document_sync_state where id=true and status='running' and active_sync_id=p_sync_id) then
    raise exception 'Document synchronization lease is invalid.' using errcode='55000';
  end if;
  if p_source_index < 0 or p_next_source_index < p_source_index or p_next_skip < 0 or p_received < 0 or p_rejected < 0
    or jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'Document synchronization page is invalid.' using errcode='22023';
  end if;
  with parsed as (
    select *,row_number() over(partition by source_entity,source_document_ref order by coalesce(source_version,'' ) desc,document_date desc,title) rank
    from jsonb_to_recordset(coalesce(p_rows,'[]'::jsonb)) as row(
      source_index integer,source_entity text,source_document_ref text,document_type text,title text,
      document_number text,document_date timestamptz,posted boolean,deletion_marked boolean,
      counterparty_ref text,contract_ref text,order_ref text,base_document_ref text,
      correction_ref text,currency_ref text,source_version text
    )
  )
  insert into public.partner_document_sync_stage(
    sync_id,source_index,source_entity,source_document_ref,document_type,title,document_number,
    document_date,posted,deletion_marked,counterparty_ref,contract_ref,order_ref,
    base_document_ref,correction_ref,currency_ref,source_version
  ) select p_sync_id,source_index,source_entity,lower(source_document_ref),document_type,btrim(title),
    btrim(document_number),document_date,posted,deletion_marked,lower(counterparty_ref),lower(contract_ref),
    lower(order_ref),lower(base_document_ref),lower(correction_ref),lower(currency_ref),source_version
  from parsed where rank=1
  on conflict(sync_id,source_entity,source_document_ref) do update set
    document_type=excluded.document_type,title=excluded.title,document_number=excluded.document_number,
    document_date=excluded.document_date,posted=excluded.posted,deletion_marked=excluded.deletion_marked,
    counterparty_ref=excluded.counterparty_ref,contract_ref=excluded.contract_ref,
    order_ref=excluded.order_ref,base_document_ref=excluded.base_document_ref,
    correction_ref=excluded.correction_ref,currency_ref=excluded.currency_ref,
    source_version=excluded.source_version,staged_at=now();
  get diagnostics staged_count=row_count;
  update public.partner_document_sync_state set
    pages_processed=pages_processed+1,rows_received=rows_received+p_received,
    rows_staged=(select count(*) from public.partner_document_sync_stage where sync_id=p_sync_id),
    rows_rejected=rows_rejected+p_rejected,source_index=p_next_source_index,
    source_entity=case p_next_source_index
      when 0 then 'Document_СчетФактура' when 1 then 'Document_РасходнаяНакладная'
      when 2 then 'Document_СчетНаОплату' when 3 then 'Document_СверкаВзаиморасчетов'
      when 4 then 'Document_ЗаказПокупателя' else null end,
    next_skip=p_next_skip,
    source_stats=jsonb_set(source_stats,array[p_source_entity],jsonb_build_object(
      'received',coalesce((source_stats->p_source_entity->>'received')::integer,0)+p_received,
      'staged',coalesce((source_stats->p_source_entity->>'staged')::integer,0)+staged_count,
      'rejected',coalesce((source_stats->p_source_entity->>'rejected')::integer,0)+p_rejected
    )),updated_at=now()
  where id=true and active_sync_id=p_sync_id;
  return jsonb_build_object('staged',staged_count,'sourceIndex',p_next_source_index,'nextSkip',p_next_skip);
end $$;

create or replace function public.publish_partner_document_sync(p_sync_id uuid)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare published_count integer; mapped_count integer; unmapped_count integer; linked_count integer; unlinked_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('partner_document_metadata_sync', 0));
  if not exists(select 1 from public.partner_document_sync_state where id=true and status='running' and active_sync_id=p_sync_id and source_index>=5) then
    raise exception 'Document synchronization is incomplete.' using errcode='55000';
  end if;
  select count(*) into mapped_count
  from public.partner_document_sync_stage stage
  left join public.one_c_counterparties counterparty on counterparty.is_published
    and lower(counterparty.external_1c_id)=stage.counterparty_ref
  where stage.sync_id=p_sync_id and counterparty.portal_company_id is not null;
  select count(*) into unmapped_count from public.partner_document_sync_stage stage
  where stage.sync_id=p_sync_id and not exists(
    select 1 from public.one_c_counterparties counterparty where counterparty.is_published
      and counterparty.portal_company_id is not null and lower(counterparty.external_1c_id)=stage.counterparty_ref
  );

  with mapped as (
    select stage.*,counterparty.portal_company_id company_id
    from public.partner_document_sync_stage stage
    join public.one_c_counterparties counterparty on counterparty.is_published
      and counterparty.portal_company_id is not null
      and lower(counterparty.external_1c_id)=stage.counterparty_ref
    where stage.sync_id=p_sync_id
  ), saved as (
    insert into public.partner_documents(
      source_system,source_document_id,company_id,document_type,title,document_number,issue_date,
      status,version,language_code,retrieval_mode,is_current,source_updated_at,synchronized_at,
      published_at,archived_at,safe_metadata,updated_at
    ) select 'onec',source_entity||':'||source_document_ref||':metadata',company_id,document_type,title,
      document_number,document_date::date,
      case when deletion_marked then 'temporarily_unavailable' when not posted then 'generating' else 'available' end,
      coalesce(nullif(source_version,''),'1'),'ru','metadata_only',not deletion_marked,document_date,now(),
      case when posted and not deletion_marked then now() else null end,null,
      jsonb_strip_nulls(jsonb_build_object(
        'sourceEntity',source_entity,'posted',posted,'deletionMarked',deletion_marked,
        'contractRef',contract_ref,'currencyRef',currency_ref,'baseDocumentRef',base_document_ref,
        'correctionRef',correction_ref,'fileCapability','metadata_only',
        'lifecycleState',case when deletion_marked then 'cancelled' when correction_ref is not null then 'corrected' when posted then 'posted' else 'unposted' end
      )),now()
    from mapped
    on conflict(source_system,source_document_id) do update set
      company_id=excluded.company_id,document_type=excluded.document_type,title=excluded.title,
      document_number=excluded.document_number,issue_date=excluded.issue_date,status=excluded.status,
      version=excluded.version,is_current=excluded.is_current,source_updated_at=excluded.source_updated_at,
      synchronized_at=excluded.synchronized_at,published_at=coalesce(public.partner_documents.published_at,excluded.published_at),
      archived_at=null,safe_metadata=excluded.safe_metadata,updated_at=now()
    returning id,source_document_id
  ) select count(*) into published_count from saved;

  insert into public.partner_document_orders(document_id,order_history_id)
  select document.id,history.id
  from public.partner_document_sync_stage stage
  join public.partner_documents document on document.source_system='onec'
    and document.source_document_id=stage.source_entity||':'||stage.source_document_ref||':metadata'
  join public.partner_order_history history on lower(history.external_1c_order_ref)=stage.order_ref
    and history.company_id=document.company_id
  where stage.sync_id=p_sync_id and stage.order_ref is not null
  on conflict do nothing;

  select count(*) into linked_count from public.partner_document_sync_stage stage
  join public.partner_documents document on document.source_system='onec'
    and document.source_document_id=stage.source_entity||':'||stage.source_document_ref||':metadata'
  where stage.sync_id=p_sync_id and exists(select 1 from public.partner_document_orders relation where relation.document_id=document.id);
  select count(*) into unlinked_count from public.partner_document_sync_stage stage
  join public.partner_documents document on document.source_system='onec'
    and document.source_document_id=stage.source_entity||':'||stage.source_document_ref||':metadata'
  where stage.sync_id=p_sync_id and stage.order_ref is not null
    and not exists(select 1 from public.partner_document_orders relation where relation.document_id=document.id);

  update public.partner_documents prior set is_current=false,updated_at=now(),safe_metadata=prior.safe_metadata||jsonb_build_object('lifecycleState','corrected')
  from public.partner_document_sync_stage correction
  where correction.sync_id=p_sync_id and correction.correction_ref is not null
    and prior.source_system='onec'
    and prior.source_document_id='Document_СчетФактура:'||correction.correction_ref||':metadata';

  insert into public.partner_document_audit_events(document_id,company_id,event_type,safe_metadata)
  select document.id,document.company_id,'synchronized',jsonb_build_object('sourceVersion',document.version,'documentType',document.document_type)
  from public.partner_documents document
  where document.source_system='onec' and document.synchronized_at>=transaction_timestamp()
  on conflict do nothing;

  insert into public.partner_notification_events(
    company_id,event_code,event_group,domain,entity_type,entity_id,source_table,
    source_event_id,source_version,occurred_at,safe_payload,fingerprint
  )
  select document.company_id,
    case when document.document_type in ('invoice','fiscal_invoice') then 'new_invoice_available'
      when document.document_type='reconciliation_statement' then 'reconciliation_statement_available'
      else 'order_document_available' end,
    'documents','documents','partner_document',document.id,'partner_document_audit_events',audit.id,
    document.version,audit.occurred_at,
    jsonb_build_object('documentId',document.id,'documentType',document.document_type,'documentNumber',document.document_number),
    encode(digest(concat_ws('|','partner_document',document.company_id::text,document.id::text,document.version),'sha256'),'hex')
  from public.partner_document_audit_events audit
  join public.partner_documents document on document.id=audit.document_id
  where audit.event_type='synchronized' and audit.occurred_at>=transaction_timestamp()
    and document.company_id is not null and document.status='available'
  on conflict(fingerprint) do nothing;

  insert into public.partner_notifications(
    company_id,recipient_user_id,event_code,event_group,domain,severity,mandatory,title,message,
    action_label,action_url,entity_type,entity_id,occurred_at,deduplication_key,source_event_id,
    expires_at,retention_until,email_enabled_snapshot,email_delivery_mode
  )
  select event.company_id,membership.user_id,event.event_code,'documents','documents','information',false,
    case event.event_code when 'new_invoice_available' then 'Доступен новый финансовый документ'
      when 'reconciliation_statement_available' then 'Доступен новый акт сверки'
      else 'Доступен новый документ заказа' end,
    'Документ опубликован в защищённом центре документов Novotech.',
    'Открыть документ','/cabinet/documents/'||event.entity_id::text,'partner_document',event.entity_id,
    event.occurred_at,event.fingerprint,event.id,event.occurred_at+interval '180 days',
    event.occurred_at+interval '365 days',false,'off'
  from public.partner_notification_events event
  join public.partner_documents document on document.id=event.entity_id
  join public.company_memberships membership on membership.company_id=event.company_id and membership.status='active'
  left join public.partner_notification_preferences preference on preference.company_id=event.company_id
    and preference.user_id=membership.user_id and preference.event_group='documents'
  where event.source_table='partner_document_audit_events' and event.created_at>=transaction_timestamp()
    and coalesce(preference.in_app_enabled,true)
    and public.notification_user_has_permission(membership.user_id,event.company_id,public.partner_document_permission(document.document_type))
  on conflict(recipient_user_id,deduplication_key) do nothing;

  update public.partner_document_sync_state set
    status='succeeded',provider_status='configured',last_completed_at=now(),last_successful_at=now(),
    rows_published=published_count,mapped_companies=mapped_count,unmapped_companies=unmapped_count,
    linked_orders=linked_count,unlinked_orders=unlinked_count,
    posted_documents=(select count(*) from public.partner_document_sync_stage where sync_id=p_sync_id and posted and not deletion_marked),
    cancelled_documents=(select count(*) from public.partner_document_sync_stage where sync_id=p_sync_id and deletion_marked),
    corrected_documents=(select count(*) from public.partner_document_sync_stage where sync_id=p_sync_id and correction_ref is not null),
    metadata_only_documents=published_count,missing_files=published_count,lock_acquired_at=null,
    active_sync_id=null,safe_error_code=null,updated_at=now()
  where id=true and active_sync_id=p_sync_id;
  return jsonb_build_object('published',published_count,'mapped',mapped_count,'unmapped',unmapped_count,'linkedOrders',linked_count,'unlinkedOrders',unlinked_count);
end $$;

create or replace function public.is_allowed_partner_notification_url(value text)
returns boolean language sql immutable set search_path=public as $$
  select value ~ '^/cabinet/orders/[0-9a-f-]{36}(\?tab=date-change)?$'
    or value = '/cabinet'
    or value = '/cabinet/reservation-requests'
    or value = '/cabinet/company/users'
    or value = '/cabinet/cart'
    or value ~ '^/cabinet/catalog/[a-z0-9][a-z0-9-]{0,199}$'
    or value = '/cabinet/offers'
    or value ~ '^/cabinet/offers/[0-9a-f-]{36}$'
    or value ~ '^/cabinet/documents/[0-9a-f-]{36}$'
$$;

create or replace function public.fail_partner_document_sync(p_sync_id uuid,p_safe_error_code text)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
begin
  update public.partner_document_sync_state set status='failed',provider_status='unavailable',
    last_completed_at=now(),safe_error_code=left(regexp_replace(coalesce(p_safe_error_code,'document_sync_failed'),'[^a-z0-9_]+','','gi'),80),
    lock_acquired_at=null,active_sync_id=null,updated_at=now()
  where id=true and active_sync_id=p_sync_id;
end $$;

revoke all on function public.begin_or_resume_partner_document_sync(),
  public.release_partner_document_sync_lease(uuid),
  public.stage_partner_document_sync_page(uuid,integer,text,integer,integer,integer,integer,jsonb),
  public.publish_partner_document_sync(uuid),public.fail_partner_document_sync(uuid,text)
  from public,anon,authenticated;
grant execute on function public.begin_or_resume_partner_document_sync(),
  public.release_partner_document_sync_lease(uuid),
  public.stage_partner_document_sync_page(uuid,integer,text,integer,integer,integer,integer,jsonb),
  public.publish_partner_document_sync(uuid),public.fail_partner_document_sync(uuid,text)
  to service_role;

comment on table public.partner_document_sync_stage is
  'Server-only normalized 1C document metadata staging. It contains no document contents, comments, amounts, credentials, or direct source URLs.';

commit;
