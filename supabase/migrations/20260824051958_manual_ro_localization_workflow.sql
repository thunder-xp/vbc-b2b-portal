begin;

alter table public.product_localizations
  add column content_source text not null default 'manual'
  check (content_source in ('manual','machine','imported'));
alter table public.category_localizations
  add column content_source text not null default 'manual'
  check (content_source in ('manual','machine','imported'));
alter table public.localization_revisions
  add column content_source text not null default 'manual'
  check (content_source in ('manual','machine','imported'));

alter table public.localization_audit_events drop constraint localization_audit_events_event_type_check;
alter table public.localization_audit_events add constraint localization_audit_events_event_type_check
  check (event_type in (
    'translated','draft_saved','reviewed','reverted_to_machine_draft','marked_outdated',
    'retranslation_requested','stale_result_ignored','imported'
  ));

create or replace function public.set_portal_localization_content_source()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.translation_status = 'machine_draft' and new.provider_metadata ? 'provider' then
    new.content_source := 'machine';
  end if;
  return new;
end;
$$;

create trigger set_product_localization_content_source
before insert or update of translation_status, provider_metadata, content_source on public.product_localizations
for each row execute function public.set_portal_localization_content_source();
create trigger set_category_localization_content_source
before insert or update of translation_status, provider_metadata, content_source on public.category_localizations
for each row execute function public.set_portal_localization_content_source();
create trigger set_localization_revision_content_source
before insert or update of translation_status, provider_metadata, content_source on public.localization_revisions
for each row execute function public.set_portal_localization_content_source();

create or replace function public.list_portal_localization_sources(
  p_entity_type text, p_locale text default 'ro'
)
returns table (
  id uuid, entity_reference text, sku text, source_name text, source_description text,
  current_hash text, sort_order integer, priority integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_entity_type not in ('product','category') or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$' then
    raise exception 'LOCALIZATION_SOURCE_INPUT_INVALID' using errcode='22023';
  end if;
  if p_entity_type='category' then
    return query
      select category.id, snapshot.slug, null::text, category.name,
        category.description, public.category_localization_source_hash(category.id),
        snapshot.sort_order, 0
      from public.public_retail_publications publication
      join public.public_retail_categories snapshot on snapshot.publication_id=publication.id
      join public.public_retail_category_identities identity on identity.public_id=snapshot.public_id
      join public.catalog_categories category on category.id=identity.source_category_id
      where publication.status='published' and category.is_active
        and category.name <> '-PROJECT EQUIPMENT-';
  else
    return query
      select product.id, snapshot.sku, product.sku, product.name,
        coalesce(product.full_description,product.description,product.short_description),
        public.product_localization_source_hash(product.id), snapshot.sort_order,
        case when cardinality(snapshot.merchandising_labels)>0 then 0
          when char_length(coalesce(product.full_description,product.description,product.short_description,''))<120 then 10
          else 20 end
      from public.public_retail_publications publication
      join public.public_retail_products snapshot on snapshot.publication_id=publication.id
      join public.public_retail_product_identities identity on identity.public_id=snapshot.public_id
      join public.catalog_products product on product.id=identity.source_product_id
      where publication.status='published' and product.is_active and product.is_visible
        and not exists (
          select 1 from jsonb_array_elements(snapshot.category_path) path
          where path->>'nameRu'='-PROJECT EQUIPMENT-'
        );
  end if;
end;
$$;

create or replace function public.get_portal_localization_workbench(
  p_entity_type text default 'category', p_locale text default 'ro', p_status text default null,
  p_search text default null, p_limit integer default 25, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_entity_type not in ('product','category') or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$'
    or (p_status is not null and p_status not in ('missing','draft','machine_draft','reviewed','outdated'))
    or p_limit not between 1 and 50 or p_offset < 0 or p_offset > 10000
    or char_length(coalesce(p_search,'')) > 100 then
    raise exception 'LOCALIZATION_WORKBENCH_INPUT_INVALID' using errcode='22023';
  end if;
  if p_entity_type='category' then
    with source as (
      select source.*, localization.id localization_id, localization.localized_name,
        localization.intro localized_description, localization.seo_title, localization.seo_description,
        localization.translation_status, localization.content_source, localization.source_hash,
        localization.outdated_against_hash, localization.translation_version, localization.revision,
        localization.translated_at, localization.reviewed_at,
        case when localization.translation_status='machine_draft' then 'draft'
          else coalesce(localization.translation_status,'missing') end effective_status
      from public.list_portal_localization_sources('category',p_locale) source
      left join public.category_localizations localization
        on localization.category_id=source.id and localization.locale=p_locale
      where p_search is null or source.source_name ilike '%'||btrim(p_search)||'%'
    ), filtered as (
      select * from source where p_status is null
        or effective_status=case when p_status='machine_draft' then 'draft' else p_status end
    ), page as (
      select * from filtered order by priority,sort_order,source_name,id limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'items',coalesce(jsonb_agg(to_jsonb(page) order by page.priority,page.sort_order,page.source_name,page.id),'[]'::jsonb),
      'totalCount',(select count(*) from filtered)
    ) into result from page;
  else
    with source as (
      select source.*, localization.id localization_id, localization.localized_name,
        coalesce(localization.description,localization.short_description) localized_description,
        localization.short_description localized_short_description,
        localization.seo_title, localization.seo_description, localization.translation_status,
        localization.content_source, localization.source_hash, localization.outdated_against_hash,
        localization.translation_version, localization.revision, localization.translated_at,
        localization.reviewed_at,
        case when localization.translation_status='machine_draft' then 'draft'
          else coalesce(localization.translation_status,'missing') end effective_status
      from public.list_portal_localization_sources('product',p_locale) source
      left join public.product_localizations localization
        on localization.product_id=source.id and localization.locale=p_locale
      where p_search is null or source.sku ilike '%'||btrim(p_search)||'%'
        or source.source_name ilike '%'||btrim(p_search)||'%'
    ), filtered as (
      select * from source where p_status is null
        or effective_status=case when p_status='machine_draft' then 'draft' else p_status end
    ), page as (
      select * from filtered order by priority,sort_order,source_name,id limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'items',coalesce(jsonb_agg(to_jsonb(page) order by page.priority,page.sort_order,page.source_name,page.id),'[]'::jsonb),
      'totalCount',(select count(*) from filtered)
    ) into result from page;
  end if;
  return result || jsonb_build_object('summary',jsonb_build_object(
    'missingProducts',(select count(*) from public.list_portal_localization_sources('product',p_locale) source
      left join public.product_localizations localization on localization.product_id=source.id and localization.locale=p_locale
      where localization.id is null),
    'machineDraftProducts',(select count(*) from public.product_localizations localization
      join public.list_portal_localization_sources('product',p_locale) source on source.id=localization.product_id
      where localization.locale=p_locale and localization.translation_status='machine_draft'),
    'reviewedProducts',(select count(*) from public.product_localizations localization
      join public.list_portal_localization_sources('product',p_locale) source on source.id=localization.product_id
      where localization.locale=p_locale and localization.translation_status='reviewed'),
    'outdatedProducts',(select count(*) from public.product_localizations localization
      join public.list_portal_localization_sources('product',p_locale) source on source.id=localization.product_id
      where localization.locale=p_locale and localization.translation_status='outdated'),
    'missingCategories',(select count(*) from public.list_portal_localization_sources('category',p_locale) source
      left join public.category_localizations localization on localization.category_id=source.id and localization.locale=p_locale
      where localization.id is null),
    'machineDraftCategories',(select count(*) from public.category_localizations localization
      join public.list_portal_localization_sources('category',p_locale) source on source.id=localization.category_id
      where localization.locale=p_locale and localization.translation_status='machine_draft'),
    'reviewedCategories',(select count(*) from public.category_localizations localization
      join public.list_portal_localization_sources('category',p_locale) source on source.id=localization.category_id
      where localization.locale=p_locale and localization.translation_status='reviewed'),
    'outdatedCategories',(select count(*) from public.category_localizations localization
      join public.list_portal_localization_sources('category',p_locale) source on source.id=localization.category_id
      where localization.locale=p_locale and localization.translation_status='outdated'),
    'queuedJobs',(select count(*) from public.localization_translation_jobs where locale=p_locale and status in ('queued','running')),
    'failedJobs',(select count(*) from public.localization_translation_jobs where locale=p_locale and status='failed'),
    'lastRun',(select to_jsonb(run) from public.localization_translation_runs run where run.locale=p_locale order by run.started_at desc limit 1)
  ));
end;
$$;

create or replace function public.manage_portal_localization(
  p_entity_type text, p_entity_id uuid, p_locale text, p_action text, p_source_hash text,
  p_expected_revision integer, p_content jsonb, p_actor_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_hash text; target_version integer; target_revision integer; target_status text;
  selected_content jsonb := p_content; selected_source text := 'manual';
begin
  if p_entity_type not in ('product','category') or p_action not in ('save_draft','review','revert_machine_draft')
    or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$' or p_source_hash !~ '^[0-9a-f]{64}$'
    or p_expected_revision < 0 or jsonb_typeof(p_content)<>'object'
    or not exists(select 1 from public.user_profiles where id=p_actor_user_id and status='active') then
    raise exception 'LOCALIZATION_MUTATION_INPUT_INVALID' using errcode='22023';
  end if;
  current_hash := case when p_entity_type='product' then public.product_localization_source_hash(p_entity_id)
    else public.category_localization_source_hash(p_entity_id) end;
  if current_hash is null then raise exception 'LOCALIZATION_ENTITY_NOT_FOUND' using errcode='P0002'; end if;
  if current_hash<>p_source_hash then raise exception 'LOCALIZATION_SOURCE_CONFLICT' using errcode='PT409'; end if;

  if p_action='revert_machine_draft' then
    select revision.content, revision.content_source into selected_content, selected_source
    from public.localization_revisions revision
    where revision.entity_type=p_entity_type and revision.entity_id=p_entity_id and revision.locale=p_locale
      and revision.source_hash=current_hash and revision.translation_status='machine_draft'
      and revision.content_source='machine'
    order by revision.translation_version desc,revision.id desc limit 1;
    if selected_content is null then raise exception 'LOCALIZATION_MACHINE_DRAFT_NOT_FOUND' using errcode='P0002'; end if;
  end if;

  target_status:=case when p_action='review' then 'reviewed' else 'machine_draft' end;
  if p_entity_type='product' then
    select revision,translation_version into target_revision,target_version from public.product_localizations
      where product_id=p_entity_id and locale=p_locale for update;
    if coalesce(target_revision,0)<>p_expected_revision then raise exception 'LOCALIZATION_REVISION_CONFLICT' using errcode='PT409'; end if;
    target_version:=greatest(coalesce(target_version,0),coalesce((select max(revision.translation_version)
      from public.localization_revisions revision where revision.entity_type='product'
        and revision.entity_id=p_entity_id and revision.locale=p_locale),0))+1;
    insert into public.product_localizations(product_id,locale,localized_name,short_description,description,seo_title,seo_description,
      translation_status,content_source,source_hash,translation_version,revision,provider_metadata,translated_at,reviewed_at,reviewed_by)
    values(p_entity_id,p_locale,nullif(btrim(selected_content->>'localizedName'),''),nullif(btrim(selected_content->>'shortDescription'),''),
      nullif(btrim(selected_content->>'description'),''),nullif(btrim(selected_content->>'seoTitle'),''),nullif(btrim(selected_content->>'seoDescription'),''),
      target_status,selected_source,current_hash,target_version,1,'{}'::jsonb,now(),case when p_action='review' then now() end,
      case when p_action='review' then p_actor_user_id end)
    on conflict(product_id,locale) do update set localized_name=excluded.localized_name,
      short_description=excluded.short_description,description=excluded.description,seo_title=excluded.seo_title,
      seo_description=excluded.seo_description,translation_status=excluded.translation_status,
      content_source=excluded.content_source,provider_metadata=excluded.provider_metadata,source_hash=current_hash,
      outdated_against_hash=null,translation_version=target_version,revision=product_localizations.revision+1,
      translated_at=now(),reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,updated_at=now()
      returning revision into target_revision;
  else
    select revision,translation_version into target_revision,target_version from public.category_localizations
      where category_id=p_entity_id and locale=p_locale for update;
    if coalesce(target_revision,0)<>p_expected_revision then raise exception 'LOCALIZATION_REVISION_CONFLICT' using errcode='PT409'; end if;
    target_version:=greatest(coalesce(target_version,0),coalesce((select max(revision.translation_version)
      from public.localization_revisions revision where revision.entity_type='category'
        and revision.entity_id=p_entity_id and revision.locale=p_locale),0))+1;
    insert into public.category_localizations(category_id,locale,localized_name,intro,seo_title,seo_description,
      translation_status,content_source,source_hash,translation_version,revision,provider_metadata,translated_at,reviewed_at,reviewed_by)
    values(p_entity_id,p_locale,nullif(btrim(selected_content->>'localizedName'),''),nullif(btrim(selected_content->>'intro'),''),
      nullif(btrim(selected_content->>'seoTitle'),''),nullif(btrim(selected_content->>'seoDescription'),''),target_status,
      selected_source,current_hash,target_version,1,'{}'::jsonb,now(),case when p_action='review' then now() end,
      case when p_action='review' then p_actor_user_id end)
    on conflict(category_id,locale) do update set localized_name=excluded.localized_name,intro=excluded.intro,
      seo_title=excluded.seo_title,seo_description=excluded.seo_description,translation_status=excluded.translation_status,
      content_source=excluded.content_source,provider_metadata=excluded.provider_metadata,source_hash=current_hash,
      outdated_against_hash=null,translation_version=target_version,revision=category_localizations.revision+1,
      translated_at=now(),reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,updated_at=now()
      returning revision into target_revision;
  end if;
  insert into public.localization_revisions(entity_type,entity_id,locale,source_hash,translation_status,
    content_source,translation_version,content,actor_user_id)
  values(p_entity_type,p_entity_id,p_locale,current_hash,target_status,selected_source,target_version,selected_content,p_actor_user_id);
  insert into public.localization_audit_events(entity_type,entity_id,locale,event_type,source_hash,actor_user_id,safe_metadata)
  values(p_entity_type,p_entity_id,p_locale,case when p_action='review' then 'reviewed'
    when p_action='revert_machine_draft' then 'reverted_to_machine_draft' else 'draft_saved' end,
    current_hash,p_actor_user_id,jsonb_build_object('translationVersion',target_version,'contentSource',selected_source));
  update public.localization_translation_jobs set status='superseded',completed_at=now(),updated_at=now()
    where entity_type=p_entity_type and entity_id=p_entity_id and locale=p_locale and status in ('queued','running','failed');
  return jsonb_build_object('revision',target_revision,'translationVersion',target_version,
    'status',case when target_status='machine_draft' then 'draft' else target_status end,'contentSource',selected_source);
end;
$$;

create or replace function public.export_portal_localization_rows(
  p_entity_type text, p_locale text default 'ro', p_status text default null, p_limit integer default 100
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_entity_type not in ('product','category') or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$'
    or (p_status is not null and p_status not in ('missing','draft','reviewed','outdated'))
    or p_limit not between 1 and 100 then
    raise exception 'LOCALIZATION_EXPORT_INPUT_INVALID' using errcode='22023';
  end if;
  if p_entity_type='category' then
    with rows as (
      select 'category' entity_type,source.id entity_id,source.entity_reference,source.sku,p_locale locale,
        source.source_name,source.current_hash,localization.localized_name,null::text short_description,
        localization.intro description,localization.seo_title,localization.seo_description,
        case when localization.translation_status='machine_draft' then 'draft'
          else coalesce(localization.translation_status,'missing') end status
      from public.list_portal_localization_sources('category',p_locale) source
      left join public.category_localizations localization on localization.category_id=source.id and localization.locale=p_locale
    ), filtered as (select * from rows where p_status is null or status=p_status), limited as (
      select * from filtered order by source_name,entity_id limit p_limit
    ) select coalesce(jsonb_agg(to_jsonb(limited) order by source_name,entity_id),'[]'::jsonb) into result from limited;
  else
    with rows as (
      select 'product' entity_type,source.id entity_id,source.entity_reference,source.sku,p_locale locale,
        source.source_name,source.current_hash,localization.localized_name,localization.short_description,
        localization.description,localization.seo_title,localization.seo_description,
        case when localization.translation_status='machine_draft' then 'draft'
          else coalesce(localization.translation_status,'missing') end status,source.priority,source.sort_order
      from public.list_portal_localization_sources('product',p_locale) source
      left join public.product_localizations localization on localization.product_id=source.id and localization.locale=p_locale
    ), filtered as (select * from rows where p_status is null or status=p_status), limited as (
      select * from filtered order by priority,sort_order,source_name,entity_id limit p_limit
    ) select coalesce(jsonb_agg(to_jsonb(limited)-'priority'-'sort_order' order by priority,sort_order,source_name,entity_id),'[]'::jsonb)
      into result from limited;
  end if;
  return result;
end;
$$;

create or replace function public.preview_portal_localization_import(
  p_rows jsonb, p_locale text default 'ro'
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare input_row jsonb; source_row record; row_index integer:=0; valid_count integer:=0; invalid_count integer:=0;
  result_rows jsonb:='[]'::jsonb; reason text; target_id uuid; supplied_hash text; target_status text;
  resolved_name text; resolved_hash text;
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100
    or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$' then
    raise exception 'LOCALIZATION_IMPORT_INPUT_INVALID' using errcode='22023';
  end if;
  for input_row in select value from jsonb_array_elements(p_rows) loop
    row_index:=row_index+1; reason:=null; target_id:=null; resolved_name:=null; resolved_hash:=null;
    begin target_id:=nullif(input_row->>'entityId','')::uuid;
    exception when invalid_text_representation then reason:='INVALID_ENTITY_ID'; end;
    target_status:=input_row->>'status'; supplied_hash:=input_row->>'sourceHash';
    if reason is null and input_row->>'entityType' not in ('product','category') then reason:='INVALID_ENTITY_TYPE'; end if;
    if reason is null and coalesce(input_row->>'locale','')<>p_locale then reason:='INVALID_LOCALE'; end if;
    if reason is null and target_status not in ('draft','reviewed') then reason:='INVALID_STATUS'; end if;
    if reason is null then
      select * into source_row from public.list_portal_localization_sources(input_row->>'entityType',p_locale) source
      where source.id=target_id;
      if source_row.id is null then reason:='ENTITY_NOT_PUBLIC_OR_UNKNOWN';
      else resolved_name:=source_row.source_name; resolved_hash:=source_row.current_hash; end if;
    end if;
    if reason is null and (supplied_hash is null or supplied_hash<>resolved_hash) then reason:='SOURCE_HASH_MISMATCH'; end if;
    if reason is null and (nullif(btrim(input_row->>'localizedName'),'') is null
      or nullif(btrim(input_row->>'description'),'') is null
      or nullif(btrim(input_row->>'seoTitle'),'') is null
      or nullif(btrim(input_row->>'seoDescription'),'') is null) then reason:='CONTENT_INCOMPLETE'; end if;
    if reason is null and input_row->>'entityType'='product'
      and nullif(btrim(input_row->>'shortDescription'),'') is null then reason:='CONTENT_INCOMPLETE'; end if;
    if reason is null then valid_count:=valid_count+1; else invalid_count:=invalid_count+1; end if;
    result_rows:=result_rows||jsonb_build_array(jsonb_build_object(
      'row',row_index,'valid',reason is null,'reason',reason,'entityType',input_row->>'entityType',
      'entityId',target_id,'entityReference',input_row->>'entityReference',
      'sourceName',resolved_name,'currentHash',resolved_hash
    ));
  end loop;
  return jsonb_build_object('rows',result_rows,'validCount',valid_count,'invalidCount',invalid_count);
end;
$$;

create or replace function public.import_portal_localizations(
  p_rows jsonb, p_locale text, p_actor_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare preview jsonb; input_row jsonb; target_id uuid; source_hash text; expected_revision integer;
  imported_count integer:=0; action_name text;
begin
  if not exists(select 1 from public.user_profiles where id=p_actor_user_id and status='active') then
    raise exception 'LOCALIZATION_IMPORT_ACTOR_INVALID' using errcode='22023';
  end if;
  preview:=public.preview_portal_localization_import(p_rows,p_locale);
  if (preview->>'invalidCount')::integer>0 then
    raise exception 'LOCALIZATION_IMPORT_CONFLICT' using errcode='PT409';
  end if;
  for input_row in select value from jsonb_array_elements(p_rows) loop
    target_id:=(input_row->>'entityId')::uuid;
    select source.current_hash into source_hash
    from public.list_portal_localization_sources(input_row->>'entityType',p_locale) source where source.id=target_id;
    if input_row->>'entityType'='product' then
      select coalesce(localization.revision,0) into expected_revision from public.catalog_products entity
      left join public.product_localizations localization on localization.product_id=entity.id and localization.locale=p_locale
      where entity.id=target_id;
    else
      select coalesce(localization.revision,0) into expected_revision from public.catalog_categories entity
      left join public.category_localizations localization on localization.category_id=entity.id and localization.locale=p_locale
      where entity.id=target_id;
    end if;
    action_name:=case when input_row->>'status'='reviewed' then 'review' else 'save_draft' end;
    perform public.manage_portal_localization(input_row->>'entityType',target_id,p_locale,action_name,source_hash,
      expected_revision,jsonb_build_object(
        'localizedName',input_row->>'localizedName','shortDescription',input_row->>'shortDescription',
        case when input_row->>'entityType'='category' then 'intro' else 'description' end,input_row->>'description',
        'seoTitle',input_row->>'seoTitle','seoDescription',input_row->>'seoDescription'
      ),p_actor_user_id);
    insert into public.localization_audit_events(entity_type,entity_id,locale,event_type,source_hash,actor_user_id,safe_metadata)
    values(input_row->>'entityType',target_id,p_locale,'imported',source_hash,p_actor_user_id,
      jsonb_build_object('status',input_row->>'status','contentSource','manual'));
    imported_count:=imported_count+1;
  end loop;
  return jsonb_build_object('importedCount',imported_count,'locale',p_locale);
end;
$$;

insert into public.localization_terminology(source_locale,target_locale,source_term,localized_term,context) values
  ('ru','ro','Сеть','Rețea','technical'),
  ('ru','ro','Аудио','Audio','technical'),
  ('ru','ro','Тревожные-входы-выходы','Intrări/ieșiri de alarmă','technical'),
  ('ru','ro','WDR','WDR','technical'),
  ('ru','ro','Сжатие','Compresie','technical'),
  ('ru','ro','Частота-кадров','Rată de cadre','technical'),
  ('ru','ro','Питание','Alimentare','technical'),
  ('ru','ro','Объектив','Obiectiv','technical')
on conflict(source_locale,target_locale,source_term,context) do update set
  localized_term=excluded.localized_term,is_active=true,updated_at=now();

revoke all on function public.set_portal_localization_content_source(),
  public.list_portal_localization_sources(text,text),
  public.get_portal_localization_workbench(text,text,text,text,integer,integer),
  public.manage_portal_localization(text,uuid,text,text,text,integer,jsonb,uuid),
  public.export_portal_localization_rows(text,text,text,integer),
  public.preview_portal_localization_import(jsonb,text),
  public.import_portal_localizations(jsonb,text,uuid)
from public,anon,authenticated;

grant execute on function public.list_portal_localization_sources(text,text),
  public.get_portal_localization_workbench(text,text,text,text,integer,integer),
  public.manage_portal_localization(text,uuid,text,text,text,integer,jsonb,uuid),
  public.export_portal_localization_rows(text,text,text,integer),
  public.preview_portal_localization_import(jsonb,text),
  public.import_portal_localizations(jsonb,text,uuid)
to service_role;

comment on column public.product_localizations.content_source is
  'Origin of localized presentation content: manual, machine, or imported. Commercial truth remains outside this table.';
comment on column public.category_localizations.content_source is
  'Origin of localized category presentation content. Manual review is independent of transport.';
comment on function public.import_portal_localizations(jsonb,text,uuid) is
  'Transactional bounded localization import. Every row is source-hash validated before any mutation.';

commit;
