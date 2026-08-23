-- Select comparable machine drafts by the governed monotonic version, not transaction timestamps.
create index localization_revisions_machine_draft_idx
  on public.localization_revisions(entity_type,entity_id,locale,source_hash,translation_version desc,id desc)
  where translation_status='machine_draft';

create or replace function public.get_portal_localization_workbench(
  p_entity_type text default 'category', p_locale text default 'ro', p_status text default null,
  p_search text default null, p_limit integer default 25, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_entity_type not in ('product','category') or p_locale !~ '^[a-z]{2}(?:-[a-z]{2})?$'
    or (p_status is not null and p_status not in ('missing','machine_draft','reviewed','outdated'))
    or p_limit not between 1 and 50 or p_offset < 0 or p_offset > 10000
    or char_length(coalesce(p_search,'')) > 100 then
    raise exception 'LOCALIZATION_WORKBENCH_INPUT_INVALID' using errcode='22023';
  end if;
  if p_entity_type='category' then
    with source as (
      select category.id, null::text sku, category.name source_name, category.description source_description,
        public.category_localization_source_hash(category.id) current_hash, category.sort_order,
        localization.id localization_id, localization.localized_name, localization.intro localized_description,
        localization.seo_title, localization.seo_description, localization.translation_status,
        localization.source_hash, localization.outdated_against_hash, localization.translation_version,
        localization.revision, localization.translated_at, localization.reviewed_at,
        (select revision.content from public.localization_revisions revision
          where revision.entity_type='category' and revision.entity_id=category.id and revision.locale=p_locale
            and revision.source_hash=public.category_localization_source_hash(category.id)
            and revision.translation_status='machine_draft'
          order by revision.translation_version desc,revision.id desc limit 1) machine_draft_content,
        coalesce(localization.translation_status,'missing') effective_status
      from public.catalog_categories category
      left join public.category_localizations localization on localization.category_id=category.id and localization.locale=p_locale
      where category.is_active and (p_search is null or category.name ilike '%'||btrim(p_search)||'%')
    ), filtered as (select * from source where p_status is null or effective_status=p_status),
    page as (select * from filtered order by sort_order,source_name,id limit p_limit offset p_offset)
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(page) order by page.sort_order,page.source_name,page.id),'[]'::jsonb),
      'totalCount',(select count(*) from filtered)) into result from page;
  else
    with source as (
      select product.id, product.sku, product.name source_name,
        coalesce(product.full_description,product.description,product.short_description) source_description,
        public.product_localization_source_hash(product.id) current_hash, product.sort_order,
        localization.id localization_id, localization.localized_name,
        coalesce(localization.description,localization.short_description) localized_description,
        localization.seo_title,localization.seo_description,localization.translation_status,
        localization.source_hash,localization.outdated_against_hash,localization.translation_version,
        localization.revision,localization.translated_at,localization.reviewed_at,
        (select revision.content from public.localization_revisions revision
          where revision.entity_type='product' and revision.entity_id=product.id and revision.locale=p_locale
            and revision.source_hash=public.product_localization_source_hash(product.id)
            and revision.translation_status='machine_draft'
          order by revision.translation_version desc,revision.id desc limit 1) machine_draft_content,
        coalesce(localization.translation_status,'missing') effective_status
      from public.catalog_products product
      left join public.product_localizations localization on localization.product_id=product.id and localization.locale=p_locale
      where product.is_active and product.is_visible and (p_search is null or product.sku ilike '%'||btrim(p_search)||'%'
        or product.name ilike '%'||btrim(p_search)||'%')
    ), filtered as (select * from source where p_status is null or effective_status=p_status),
    page as (select * from filtered order by sort_order,source_name,id limit p_limit offset p_offset)
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(page) order by page.sort_order,page.source_name,page.id),'[]'::jsonb),
      'totalCount',(select count(*) from filtered)) into result from page;
  end if;
  return result || jsonb_build_object('summary',jsonb_build_object(
    'missingProducts',(select count(*) from public.catalog_products product left join public.product_localizations localization
      on localization.product_id=product.id and localization.locale=p_locale where product.is_active and product.is_visible and localization.id is null),
    'machineDraftProducts',(select count(*) from public.product_localizations where locale=p_locale and translation_status='machine_draft'),
    'reviewedProducts',(select count(*) from public.product_localizations where locale=p_locale and translation_status='reviewed'),
    'outdatedProducts',(select count(*) from public.product_localizations where locale=p_locale and translation_status='outdated'),
    'missingCategories',(select count(*) from public.catalog_categories category left join public.category_localizations localization
      on localization.category_id=category.id and localization.locale=p_locale where category.is_active and localization.id is null),
    'machineDraftCategories',(select count(*) from public.category_localizations where locale=p_locale and translation_status='machine_draft'),
    'reviewedCategories',(select count(*) from public.category_localizations where locale=p_locale and translation_status='reviewed'),
    'outdatedCategories',(select count(*) from public.category_localizations where locale=p_locale and translation_status='outdated'),
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
  selected_content jsonb := p_content;
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
    select revision.content into selected_content
    from public.localization_revisions revision
    where revision.entity_type=p_entity_type and revision.entity_id=p_entity_id and revision.locale=p_locale
      and revision.source_hash=current_hash and revision.translation_status='machine_draft'
    order by revision.translation_version desc,revision.id desc limit 1;
    if selected_content is null then
      raise exception 'LOCALIZATION_MACHINE_DRAFT_NOT_FOUND' using errcode='P0002';
    end if;
  end if;

  if p_entity_type='product' then
    select revision,translation_version into target_revision,target_version from public.product_localizations
      where product_id=p_entity_id and locale=p_locale for update;
    if coalesce(target_revision,0)<>p_expected_revision then raise exception 'LOCALIZATION_REVISION_CONFLICT' using errcode='PT409'; end if;
    target_version:=greatest(coalesce(target_version,0),coalesce((select max(revision.translation_version)
      from public.localization_revisions revision where revision.entity_type='product'
        and revision.entity_id=p_entity_id and revision.locale=p_locale),0))+1;
    target_status:=case when p_action='review' then 'reviewed' else 'machine_draft' end;
    insert into public.product_localizations(product_id,locale,localized_name,short_description,description,seo_title,seo_description,
      translation_status,source_hash,translation_version,revision,translated_at,reviewed_at,reviewed_by)
    values(p_entity_id,p_locale,nullif(btrim(selected_content->>'localizedName'),''),nullif(btrim(selected_content->>'shortDescription'),''),
      nullif(btrim(selected_content->>'description'),''),nullif(btrim(selected_content->>'seoTitle'),''),nullif(btrim(selected_content->>'seoDescription'),''),
      target_status,current_hash,target_version,1,now(),case when p_action='review' then now() end,
      case when p_action='review' then p_actor_user_id end)
    on conflict(product_id,locale) do update set localized_name=excluded.localized_name,
      short_description=excluded.short_description,description=excluded.description,seo_title=excluded.seo_title,
      seo_description=excluded.seo_description,translation_status=excluded.translation_status,source_hash=current_hash,
      outdated_against_hash=null,translation_version=target_version,revision=product_localizations.revision+1,
      translated_at=coalesce(product_localizations.translated_at,now()),reviewed_at=excluded.reviewed_at,
      reviewed_by=excluded.reviewed_by,updated_at=now() returning revision into target_revision;
  else
    select revision,translation_version into target_revision,target_version from public.category_localizations
      where category_id=p_entity_id and locale=p_locale for update;
    if coalesce(target_revision,0)<>p_expected_revision then raise exception 'LOCALIZATION_REVISION_CONFLICT' using errcode='PT409'; end if;
    target_version:=greatest(coalesce(target_version,0),coalesce((select max(revision.translation_version)
      from public.localization_revisions revision where revision.entity_type='category'
        and revision.entity_id=p_entity_id and revision.locale=p_locale),0))+1;
    target_status:=case when p_action='review' then 'reviewed' else 'machine_draft' end;
    insert into public.category_localizations(category_id,locale,localized_name,intro,seo_title,seo_description,
      translation_status,source_hash,translation_version,revision,translated_at,reviewed_at,reviewed_by)
    values(p_entity_id,p_locale,nullif(btrim(selected_content->>'localizedName'),''),nullif(btrim(selected_content->>'intro'),''),
      nullif(btrim(selected_content->>'seoTitle'),''),nullif(btrim(selected_content->>'seoDescription'),''),target_status,current_hash,
      target_version,1,now(),case when p_action='review' then now() end,case when p_action='review' then p_actor_user_id end)
    on conflict(category_id,locale) do update set localized_name=excluded.localized_name,intro=excluded.intro,
      seo_title=excluded.seo_title,seo_description=excluded.seo_description,translation_status=excluded.translation_status,
      source_hash=current_hash,outdated_against_hash=null,translation_version=target_version,
      revision=category_localizations.revision+1,translated_at=coalesce(category_localizations.translated_at,now()),
      reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,updated_at=now() returning revision into target_revision;
  end if;
  insert into public.localization_revisions(entity_type,entity_id,locale,source_hash,translation_status,
    translation_version,content,actor_user_id) values(p_entity_type,p_entity_id,p_locale,current_hash,target_status,target_version,selected_content,p_actor_user_id);
  insert into public.localization_audit_events(entity_type,entity_id,locale,event_type,source_hash,actor_user_id,safe_metadata)
  values(p_entity_type,p_entity_id,p_locale,case when p_action='review' then 'reviewed'
    when p_action='revert_machine_draft' then 'reverted_to_machine_draft' else 'draft_saved' end,
    current_hash,p_actor_user_id,jsonb_build_object('translationVersion',target_version));
  update public.localization_translation_jobs set status='superseded',completed_at=now(),updated_at=now()
    where entity_type=p_entity_type and entity_id=p_entity_id and locale=p_locale and status in ('queued','running','failed');
  return jsonb_build_object('revision',target_revision,'translationVersion',target_version,'status',target_status);
end;
$$;
