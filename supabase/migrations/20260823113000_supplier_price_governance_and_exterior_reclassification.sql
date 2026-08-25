begin;

alter table public.external_price_uploads
  add column supersedes_upload_id uuid references public.external_price_uploads(id) on delete restrict,
  add column revision_no integer not null default 1 check (revision_no > 0),
  add column correction_reason text check (correction_reason is null or char_length(correction_reason) between 10 and 500),
  add column correction_correlation_id uuid,
  add column superseded_at timestamptz,
  add column superseded_by_upload_id uuid references public.external_price_uploads(id) on delete restrict;

alter table public.external_price_uploads
  drop constraint external_price_uploads_storage_key_key,
  drop constraint external_price_uploads_partner_company_id_external_price_so_key,
  drop constraint external_price_uploads_storage_key_check;

alter table public.external_price_uploads
  add constraint external_price_uploads_storage_key_check check (
    storage_key = partner_company_id::text || '/' || coalesce(supersedes_upload_id, id)::text || '/' || source_file_hash || '.' || file_format
  ),
  add constraint external_price_uploads_revision_unique unique (
    partner_company_id, external_price_source_id, source_file_hash, revision_no
  ),
  add constraint external_price_uploads_correction_command_unique unique (
    supersedes_upload_id, correction_correlation_id
  ),
  add constraint external_price_uploads_supersession_check check (
    (supersedes_upload_id is null and revision_no = 1 and correction_reason is null and correction_correlation_id is null)
    or
    (supersedes_upload_id is not null and revision_no > 1 and correction_reason is not null and correction_correlation_id is not null)
  );

create index external_price_uploads_supersedes_idx
  on public.external_price_uploads(supersedes_upload_id, revision_no desc)
  where supersedes_upload_id is not null;

alter table public.external_price_events drop constraint external_price_events_event_type_check;
alter table public.external_price_events add constraint external_price_events_event_type_check check (event_type in (
  'uploaded','mapping_confirmed','mapping_corrected','manual_match','row_skipped','applied','archived','analysis_failed',
  'correction_started','price_level_reclassified','superseded'
));

create or replace function public.can_access_external_prices(p_company_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.has_active_company_membership(p_company_id)
    and public.has_permission(p_company_id, 'external_prices.view')
    and public.has_permission(p_company_id, p_permission)
$$;
revoke all on function public.can_access_external_prices(uuid, text) from public, anon;
grant execute on function public.can_access_external_prices(uuid, text) to authenticated;

revoke all on function public.list_external_price_sources() from public, anon, authenticated;
grant execute on function public.list_external_price_sources() to service_role;

create or replace function public.list_external_price_sources(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.view') then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id',source.id,'code',source.code,'displayName',source.display_name,
    'sourceType',source.source_type,'supportedBrandScope',source.supported_brand_scope
  ) order by source.display_name),'[]'::jsonb) from public.external_price_sources source where source.active);
end; $$;
revoke all on function public.list_external_price_sources(uuid) from public, anon;
grant execute on function public.list_external_price_sources(uuid) to authenticated;

create or replace function public.list_external_price_uploads(p_company_id uuid, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.view') then raise exception 'Access denied.' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(row_to_json(item) order by item.created_at desc),'[]'::jsonb) from (
    select upload.id,source.display_name source_name,upload.original_filename,upload.effective_date,upload.currency,
      upload.price_schema,upload.snapshot_scope,upload.status,upload.total_rows,upload.candidate_rows,upload.matched_rows,
      upload.review_rows,upload.unmatched_rows,upload.ignored_rows,upload.marker_rows,upload.safe_error_code,
      upload.created_at,upload.applied_at,upload.revision_no,upload.superseded_at,upload.correction_reason
    from public.external_price_uploads upload join public.external_price_sources source on source.id=upload.external_price_source_id
    where upload.partner_company_id=p_company_id and upload.archived_at is null
    order by upload.created_at desc limit least(greatest(p_limit,1),100)
  ) item);
end; $$;
revoke all on function public.list_external_price_uploads(uuid,integer) from public, anon;
grant execute on function public.list_external_price_uploads(uuid,integer) to authenticated;

create or replace function public.start_external_price_upload_correction(
  p_company_id uuid,
  p_upload_id uuid,
  p_mapping jsonb,
  p_price_schema text,
  p_snapshot_scope text,
  p_reason text,
  p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  source_upload public.external_price_uploads;
  root_upload public.external_price_uploads;
  existing public.external_price_uploads;
  created public.external_price_uploads;
  next_revision integer;
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.manage') then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  if p_price_schema not in ('partner','retail','both','detect')
    or p_snapshot_scope not in ('full','partial')
    or jsonb_typeof(p_mapping) <> 'object'
    or nullif(btrim(p_mapping->>'productName'),'') is null
    or (nullif(btrim(p_mapping->>'partnerPrice'),'') is null and nullif(btrim(p_mapping->>'retailPrice'),'') is null)
    or btrim(p_mapping->>'productName') !~ '^[A-Z]{1,3}$'
    or (nullif(btrim(p_mapping->>'productCode'),'') is not null and btrim(p_mapping->>'productCode') !~ '^[A-Z]{1,3}$')
    or (nullif(btrim(p_mapping->>'description'),'') is not null and btrim(p_mapping->>'description') !~ '^[A-Z]{1,3}$')
    or (nullif(btrim(p_mapping->>'partnerPrice'),'') is not null and btrim(p_mapping->>'partnerPrice') !~ '^[A-Z]{1,3}$')
    or (nullif(btrim(p_mapping->>'retailPrice'),'') is not null and btrim(p_mapping->>'retailPrice') !~ '^[A-Z]{1,3}$')
    or char_length(btrim(p_reason)) not between 10 and 500
    or p_correlation_id is null then
    raise exception 'Invalid correction request.' using errcode='22023';
  end if;

  select * into source_upload from public.external_price_uploads
  where id=p_upload_id and partner_company_id=p_company_id for update;
  if source_upload.id is null then raise exception 'Import not found.' using errcode='P0002'; end if;
  if source_upload.status <> 'applied' or source_upload.superseded_at is not null then
    raise exception 'Import state changed.' using errcode='PT409';
  end if;

  select * into root_upload from public.external_price_uploads
  where id=coalesce(source_upload.supersedes_upload_id,source_upload.id);
  select * into existing from public.external_price_uploads
  where supersedes_upload_id=root_upload.id and correction_correlation_id=p_correlation_id;
  if existing.id is not null then
    return jsonb_build_object('id',existing.id,'status',existing.status,'revision',existing.revision_no,'idempotent',true);
  end if;
  select coalesce(max(upload.revision_no),0)+1 into next_revision
  from public.external_price_uploads upload
  where upload.id=root_upload.id or upload.supersedes_upload_id=root_upload.id;

  insert into public.external_price_uploads(
    partner_company_id,external_price_source_id,uploaded_by,original_filename,
    storage_bucket,storage_key,source_file_hash,file_format,file_size,effective_date,currency,
    price_schema,snapshot_scope,parser_version,confirmed_mapping,status,
    supersedes_upload_id,revision_no,correction_reason,correction_correlation_id
  ) values (
    source_upload.partner_company_id,source_upload.external_price_source_id,auth.uid(),source_upload.original_filename,
    source_upload.storage_bucket,root_upload.storage_key,source_upload.source_file_hash,source_upload.file_format,
    source_upload.file_size,source_upload.effective_date,source_upload.currency,p_price_schema,p_snapshot_scope,
    source_upload.parser_version,p_mapping,'uploaded',root_upload.id,next_revision,btrim(p_reason),p_correlation_id
  ) returning * into created;

  insert into public.external_price_events(upload_id,partner_company_id,actor_user_id,event_type,safe_metadata,correlation_id)
  values
    (source_upload.id,p_company_id,auth.uid(),'correction_started',jsonb_build_object('revisionUploadId',created.id,'revision',next_revision,'reason',btrim(p_reason)),p_correlation_id),
    (created.id,p_company_id,auth.uid(),'uploaded',jsonb_build_object('format',created.file_format,'size',created.file_size,'correction',true,'revision',next_revision),p_correlation_id);

  return jsonb_build_object('id',created.id,'status',created.status,'revision',created.revision_no,'idempotent',false);
end; $$;
revoke all on function public.start_external_price_upload_correction(uuid,uuid,jsonb,text,text,text,uuid) from public, anon;
grant execute on function public.start_external_price_upload_correction(uuid,uuid,jsonb,text,text,text,uuid) to authenticated;

create or replace function public.retire_superseded_external_price_projection()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='applied' and old.status is distinct from 'applied' and new.supersedes_upload_id is not null then
    delete from public.current_external_prices current
    using public.external_price_uploads upload
    where current.upload_id=upload.id
      and (upload.id=new.supersedes_upload_id or upload.supersedes_upload_id=new.supersedes_upload_id)
      and current.upload_id<>new.id;
  end if;
  return new;
end; $$;
revoke all on function public.retire_superseded_external_price_projection() from public, anon, authenticated;
create trigger retire_superseded_external_price_projection_before_apply
before update of status on public.external_price_uploads
for each row execute function public.retire_superseded_external_price_projection();

create or replace function public.mark_external_price_upload_superseded()
returns trigger language plpgsql security definer set search_path='' as $$
declare previous_upload public.external_price_uploads;
begin
  if new.status='applied' and old.status is distinct from 'applied' and new.supersedes_upload_id is not null then
    select * into previous_upload from public.external_price_uploads
    where id=(select upload.id from public.external_price_uploads upload
      where (upload.id=new.supersedes_upload_id or upload.supersedes_upload_id=new.supersedes_upload_id)
        and upload.id<>new.id and upload.status='applied' and upload.superseded_at is null
      order by upload.revision_no desc limit 1) for update;
    if previous_upload.id is not null then
      update public.external_price_uploads set superseded_at=now(),superseded_by_upload_id=new.id,updated_at=now()
      where id=previous_upload.id;
      insert into public.external_price_events(upload_id,partner_company_id,actor_user_id,event_type,safe_metadata,correlation_id)
      values(previous_upload.id,new.partner_company_id,auth.uid(),'superseded',jsonb_build_object('replacementUploadId',new.id,'replacementRevision',new.revision_no),new.correction_correlation_id);
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.mark_external_price_upload_superseded() from public, anon, authenticated;
create trigger mark_external_price_upload_superseded_after_apply
after update of status on public.external_price_uploads
for each row execute function public.mark_external_price_upload_superseded();

create or replace function public.reconcile_superseded_external_price_intelligence()
returns jsonb language plpgsql security definer set search_path='' as $$
declare deleted_pressure integer:=0; reset_features integer:=0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  delete from public.competitor_market_price_daily daily
  where not exists (
    select 1 from public.external_price_observations observation
    join public.external_price_uploads upload on upload.id=observation.upload_id and upload.superseded_at is null
    cross join lateral(values('partner'::text,observation.partner_price),('retail'::text,observation.retail_price)) value(price_level,amount)
    where observation.external_price_source_id=daily.external_price_source_id
      and observation.catalog_product_id=daily.product_id and observation.observed_at=daily.observation_date
      and value.price_level=daily.price_level and value.amount is not null and observation.currency=daily.currency
  );

  delete from public.partner_product_price_pressure pressure
  where not exists (select 1 from public.current_external_prices current
    where current.partner_company_id=pressure.company_id and current.catalog_product_id=pressure.product_id and current.price_type='partner');
  get diagnostics deleted_pressure=row_count;

  update public.partner_product_features feature set competitor_gap_pct=null,competitor_confidence=null,calculated_at=now()
  where not exists (select 1 from public.partner_product_price_pressure pressure
    where pressure.company_id=feature.company_id and pressure.product_id=feature.product_id)
    and (feature.competitor_gap_pct is not null or feature.competitor_confidence is not null);
  get diagnostics reset_features=row_count;

  return jsonb_build_object('deletedPressure',deleted_pressure,'resetFeatures',reset_features);
end; $$;
revoke all on function public.reconcile_superseded_external_price_intelligence() from public, anon, authenticated;
grant execute on function public.reconcile_superseded_external_price_intelligence() to service_role;

create or replace function public.resolve_external_price_novotech_equivalent(p_company_id uuid,p_product_id uuid,p_price_type text)
returns table(amount numeric,currency text) language sql stable security definer set search_path='' as $$
  select price.price_amount,price.currency
  from public.partner_companies company
  join public.product_prices price on price.product_id=p_product_id and price.is_active and price.is_published
    and price.valid_from<=now() and (price.valid_to is null or price.valid_to>=now())
  left join public.price_types type on type.external_ref=price.external_1c_price_type_id
  where company.id=p_company_id and (
    (p_price_type='partner' and price.external_1c_price_type_id=company.external_1c_price_type_id)
    or (p_price_type='retail' and type.external_code='UU-000020')
  ) order by price.valid_from desc,price.id limit 1
$$;
revoke all on function public.resolve_external_price_novotech_equivalent(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.resolve_external_price_novotech_equivalent(uuid,uuid,text) to service_role;

create or replace function public.get_admin_competitive_pricing_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.has_internal_permission('admin.analytics.view') then raise exception 'Access denied.' using errcode='42501'; end if;
  return jsonb_build_object(
    'sources',coalesce((select jsonb_agg(jsonb_build_object(
      'sourceId',source.id,'sourceName',source.display_name,'latestObservationDate',summary.latest_date,
      'contributingCompanies',summary.company_count,'matchedProducts',summary.product_count,'observationCount',summary.observation_count
    ) order by source.display_name) from public.external_price_sources source left join lateral (
      select max(observation.observed_at) latest_date,count(distinct observation.partner_company_id) company_count,
        count(distinct observation.catalog_product_id) product_count,count(*) observation_count
      from public.external_price_observations observation join public.external_price_uploads upload on upload.id=observation.upload_id
      where observation.external_price_source_id=source.id and upload.superseded_at is null
    ) summary on true where source.active),'[]'::jsonb),
    'currentPriceCount',(select count(*) from public.current_external_prices),
    'parityCount',(select count(*) from public.current_external_prices current
      join lateral public.resolve_external_price_novotech_equivalent(current.partner_company_id,current.catalog_product_id,current.price_type) own on own.currency=current.currency
      where abs(own.amount-current.amount)/greatest(current.amount,0.01)<0.01),
    'competitorCheaperCount',(select count(*) from public.current_external_prices current
      join lateral public.resolve_external_price_novotech_equivalent(current.partner_company_id,current.catalog_product_id,current.price_type) own on own.currency=current.currency
      where own.amount>current.amount and (own.amount-current.amount)/greatest(current.amount,0.01)>=0.01),
    'novotechCheaperCount',(select count(*) from public.current_external_prices current
      join lateral public.resolve_external_price_novotech_equivalent(current.partner_company_id,current.catalog_product_id,current.price_type) own on own.currency=current.currency
      where own.amount<current.amount and (current.amount-own.amount)/greatest(current.amount,0.01)>=0.01)
  );
end; $$;
revoke all on function public.get_admin_competitive_pricing_summary() from public, anon;
grant execute on function public.get_admin_competitive_pricing_summary() to authenticated;

do $$
declare
  original_upload public.external_price_uploads;
  corrected_upload public.external_price_uploads;
  repair_count integer;
  repair_correlation uuid:=gen_random_uuid();
  repair_reason text:='Business-confirmed correction: Exterior column F is retail price, not partner price.';
begin
  select count(*) into repair_count
  from public.external_price_uploads upload join public.external_price_sources source on source.id=upload.external_price_source_id
  where lower(source.code)='exterior' and upload.original_filename='Price_Exterior 08.08.2026_edit.xlsx'
    and upload.status='applied' and upload.superseded_at is null and upload.confirmed_mapping->>'partnerPrice'='F'
    and nullif(upload.confirmed_mapping->>'retailPrice','') is null;
  if repair_count=0 then return; end if;
  if repair_count<>1 then raise exception 'Exterior repair requires exactly one authoritative applied upload.'; end if;
  select upload.* into original_upload
  from public.external_price_uploads upload join public.external_price_sources source on source.id=upload.external_price_source_id
  where lower(source.code)='exterior' and upload.original_filename='Price_Exterior 08.08.2026_edit.xlsx'
    and upload.status='applied' and upload.superseded_at is null and upload.confirmed_mapping->>'partnerPrice'='F'
    and nullif(upload.confirmed_mapping->>'retailPrice','') is null;

  insert into public.external_price_uploads(
    partner_company_id,external_price_source_id,uploaded_by,original_filename,storage_bucket,storage_key,source_file_hash,
    file_format,file_size,effective_date,currency,price_schema,snapshot_scope,parser_version,mapping_template_id,
    detected_mapping,confirmed_mapping,sheet_names,status,total_rows,candidate_rows,matched_rows,review_rows,unmatched_rows,
    ignored_rows,marker_rows,analyzed_at,applied_at,supersedes_upload_id,revision_no,correction_reason,correction_correlation_id
  ) select partner_company_id,external_price_source_id,uploaded_by,original_filename,storage_bucket,storage_key,source_file_hash,
    file_format,file_size,effective_date,currency,'retail',snapshot_scope,parser_version,mapping_template_id,
    detected_mapping,(confirmed_mapping-'partnerPrice')||jsonb_build_object('partnerPrice',null,'retailPrice','F'),sheet_names,'applied',
    total_rows,candidate_rows,matched_rows,review_rows,unmatched_rows,ignored_rows,marker_rows,analyzed_at,now(),id,2,repair_reason,repair_correlation
  from public.external_price_uploads where id=original_upload.id returning * into corrected_upload;

  insert into public.external_price_observations(
    upload_id,partner_company_id,external_price_source_id,catalog_product_id,source_product_code,source_product_name,
    normalized_model,source_description,partner_price,retail_price,currency,source_sheet,source_row,source_marker,match_method,observed_at
  ) select corrected_upload.id,partner_company_id,external_price_source_id,catalog_product_id,source_product_code,source_product_name,
    normalized_model,source_description,null,partner_price,currency,source_sheet,source_row,source_marker,match_method,observed_at
  from public.external_price_observations where upload_id=original_upload.id;

  update public.external_price_uploads set superseded_at=now(),superseded_by_upload_id=corrected_upload.id,updated_at=now()
  where id=original_upload.id;
  delete from public.current_external_prices where upload_id=original_upload.id;
  insert into public.current_external_prices(partner_company_id,external_price_source_id,catalog_product_id,price_type,observation_id,amount,currency,observed_at,upload_id)
  select distinct on (partner_company_id,external_price_source_id,catalog_product_id)
    partner_company_id,external_price_source_id,catalog_product_id,'retail',id,retail_price,currency,observed_at,upload_id
  from public.external_price_observations where upload_id=corrected_upload.id and retail_price is not null
  order by partner_company_id,external_price_source_id,catalog_product_id,observed_at desc,source_row desc,id desc
  on conflict(partner_company_id,external_price_source_id,catalog_product_id,price_type) do update set
    observation_id=excluded.observation_id,amount=excluded.amount,currency=excluded.currency,observed_at=excluded.observed_at,
    upload_id=excluded.upload_id,updated_at=now();

  insert into public.external_price_events(upload_id,partner_company_id,actor_user_id,event_type,safe_metadata,correlation_id)
  values
    (original_upload.id,original_upload.partner_company_id,null,'price_level_reclassified',jsonb_build_object('previousPriceLevel','partner','newPriceLevel','retail','replacementUploadId',corrected_upload.id,'reason',repair_reason),repair_correlation),
    (original_upload.id,original_upload.partner_company_id,null,'superseded',jsonb_build_object('replacementUploadId',corrected_upload.id,'replacementRevision',2),repair_correlation),
    (corrected_upload.id,corrected_upload.partner_company_id,null,'applied',jsonb_build_object('observations',(select count(*) from public.external_price_observations where upload_id=corrected_upload.id),'currentPrices',(select count(*) from public.current_external_prices where upload_id=corrected_upload.id),'snapshotScope',corrected_upload.snapshot_scope,'correction',true),repair_correlation);

  insert into public.commercial_intelligence_dirty_products(company_id,product_id,reason)
  select distinct corrected_upload.partner_company_id,observation.catalog_product_id,'external_price_level_reclassified'
  from public.external_price_observations observation where observation.upload_id=corrected_upload.id
  on conflict(company_id,product_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
  insert into public.commercial_intelligence_dirty_companies(company_id,reason)
  values(corrected_upload.partner_company_id,'external_price_level_reclassified')
  on conflict(company_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null,last_error_code=null;
end $$;

commit;
