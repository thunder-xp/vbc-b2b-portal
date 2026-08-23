begin;

do $$
declare
  target_product_id uuid;
  target_price_id uuid;
  target_attribute_id uuid;
  actor_user_id uuid;
  base_hash text;
  changed_hash text;
  original_description text;
  original_full_description text;
  original_price numeric;
  original_display_value text;
  original_resolved_value text;
  job_result jsonb;
  claimed jsonb;
  job_id uuid;
  job_hash text;
  current_revision integer;
  result jsonb;
begin
  if not exists (
    select 1 from pg_class relation
    where relation.oid='public.product_localizations'::regclass and relation.relrowsecurity
  ) then raise exception 'product_localizations RLS is not enabled'; end if;
  if has_table_privilege('anon','public.product_localizations','select')
    or has_table_privilege('authenticated','public.product_localizations','select') then
    raise exception 'private localization overlay is publicly readable';
  end if;
  if has_function_privilege('anon','public.manage_portal_localization(text,uuid,text,text,text,integer,jsonb,uuid)','execute')
    or has_function_privilege('authenticated','public.manage_portal_localization(text,uuid,text,text,text,integer,jsonb,uuid)','execute') then
    raise exception 'localization mutation RPC is publicly executable';
  end if;

  select product.id,product.description,product.full_description
  into target_product_id,original_description,original_full_description
  from public.catalog_products product
  where product.is_active and product.is_visible
    and exists(select 1 from public.product_prices price where price.product_id=product.id)
    and exists(select 1 from public.catalog_product_attributes attribute
      where attribute.product_id=product.id and attribute.is_visible
        and attribute.resolution_status in ('not_required','resolved'))
  order by product.id limit 1;
  select profile.id into actor_user_id from public.user_profiles profile where profile.status='active' order by profile.id limit 1;
  if target_product_id is null or actor_user_id is null then raise exception 'runtime fixture prerequisites unavailable'; end if;

  base_hash:=public.product_localization_source_hash(target_product_id);
  if base_hash is null or base_hash<>public.product_localization_source_hash(target_product_id) then
    raise exception 'source hash is not deterministic';
  end if;

  select price.id,price.price_amount into target_price_id,original_price
  from public.product_prices price where price.product_id=target_product_id order by price.id limit 1;
  update public.product_prices set price_amount=original_price+0.01 where id=target_price_id;
  if public.product_localization_source_hash(target_product_id)<>base_hash then
    raise exception 'price incorrectly invalidates localization';
  end if;
  update public.catalog_products set updated_at=updated_at+interval '1 second' where id=target_product_id;
  if public.product_localization_source_hash(target_product_id)<>base_hash then
    raise exception 'timestamp incorrectly invalidates localization';
  end if;

  update public.catalog_products set
    description=coalesce(description,'')||' localization-source-change',
    full_description=coalesce(full_description,description,'')||' localization-source-change'
  where id=target_product_id;
  changed_hash:=public.product_localization_source_hash(target_product_id);
  if changed_hash=base_hash then raise exception 'description change did not invalidate localization'; end if;
  update public.catalog_products set description=original_description,full_description=original_full_description
  where id=target_product_id;

  select attribute.id,attribute.display_value,attribute.resolved_display_value
  into target_attribute_id,original_display_value,original_resolved_value
  from public.catalog_product_attributes attribute
  where attribute.product_id=target_product_id and attribute.is_visible
    and attribute.resolution_status in ('not_required','resolved') order by attribute.id limit 1;
  update public.catalog_product_attributes set
    display_value=coalesce(display_value,'')||' localization-spec-change',
    resolved_display_value=case when resolved_display_value is null then null
      else resolved_display_value||' localization-spec-change' end
  where id=target_attribute_id;
  if public.product_localization_source_hash(target_product_id)=base_hash then
    raise exception 'specification change did not invalidate localization';
  end if;
  update public.catalog_product_attributes set display_value=original_display_value,
    resolved_display_value=original_resolved_value where id=target_attribute_id;

  job_result:=public.request_portal_localization_retranslation('product',target_product_id,'ro',actor_user_id);
  claimed:=public.claim_portal_localization_jobs('ro',1);
  job_id:=(claimed->'jobs'->0->>'id')::uuid;
  job_hash:=claimed->'jobs'->0->>'sourceHash';
  if job_id is null or job_hash<>base_hash then raise exception 'source-bound job was not claimed'; end if;
  result:=public.complete_portal_localization_job(job_id,job_hash,jsonb_build_object(
    'localizedName','Cameră TEST MODEL-100','description','Descriere tehnică de test.',
    'seoTitle','Cameră TEST MODEL-100','seoDescription','Descriere SEO de test.'
  ),jsonb_build_object('provider','runtime_test','model','deterministic'));
  if not coalesce((result->>'applied')::boolean,false) then raise exception 'machine draft was not applied'; end if;
  select revision into current_revision from public.product_localizations
  where product_id=target_product_id and locale='ro' and translation_status='machine_draft';
  if current_revision is null then raise exception 'machine draft state missing'; end if;

  perform public.manage_portal_localization('product',target_product_id,'ro','review',base_hash,current_revision,
    jsonb_build_object('localizedName','Cameră TEST MODEL-100','description','Descriere verificată.',
      'seoTitle','Cameră TEST MODEL-100','seoDescription','Descriere SEO verificată.'),actor_user_id);
  select revision into current_revision from public.product_localizations
  where product_id=target_product_id and locale='ro' and translation_status='reviewed';
  if current_revision is null then raise exception 'reviewed state missing'; end if;

  perform public.request_portal_localization_retranslation('product',target_product_id,'ro',actor_user_id);
  claimed:=public.claim_portal_localization_jobs('ro',1);
  job_id:=(claimed->'jobs'->0->>'id')::uuid;
  job_hash:=claimed->'jobs'->0->>'sourceHash';
  result:=public.complete_portal_localization_job(job_id,job_hash,jsonb_build_object(
    'localizedName','Cameră TEST MODEL-100','description','Al doilea draft.',
    'seoTitle','Cameră TEST MODEL-100','seoDescription','Al doilea draft SEO.'
  ),jsonb_build_object('provider','runtime_test','model','deterministic'));
  if not coalesce((result->>'machineDraftAvailable')::boolean,false) then
    raise exception 'retranslation did not preserve a comparable machine draft';
  end if;
  if not exists(select 1 from public.product_localizations where product_id=target_product_id
    and locale='ro' and translation_status='reviewed') then raise exception 'reviewed content was overwritten'; end if;

  perform public.manage_portal_localization('product',target_product_id,'ro','revert_machine_draft',
    base_hash,current_revision,'{}'::jsonb,actor_user_id);
  select revision into current_revision from public.product_localizations
  where product_id=target_product_id and locale='ro' and translation_status='machine_draft'
    and description='Al doilea draft.';
  if current_revision is null then
    raise exception 'machine draft reversion failed: %',(select to_jsonb(localization)
      from public.product_localizations localization where localization.product_id=target_product_id and localization.locale='ro');
  end if;

  perform public.request_portal_localization_retranslation('product',target_product_id,'ro',actor_user_id);
  claimed:=public.claim_portal_localization_jobs('ro',1);
  job_id:=(claimed->'jobs'->0->>'id')::uuid;
  job_hash:=claimed->'jobs'->0->>'sourceHash';
  update public.catalog_products set full_description=coalesce(full_description,description,'')||' newer-source'
  where id=target_product_id;
  result:=public.complete_portal_localization_job(job_id,job_hash,jsonb_build_object(
    'localizedName','Stale','description','Stale','seoTitle','Stale','seoDescription','Stale'
  ),jsonb_build_object('provider','runtime_test'));
  if not coalesce((result->>'stale')::boolean,false) then raise exception 'stale result was not rejected'; end if;
  perform public.reconcile_portal_localization_sources('ro',5000);
  if not exists(select 1 from public.product_localizations where product_id=target_product_id
    and locale='ro' and translation_status='outdated') then raise exception 'source change was not marked outdated'; end if;

  begin
    update public.localization_revisions set content='{}'::jsonb
    where entity_type='product' and entity_id=target_product_id and locale='ro';
    raise exception 'append-only revision update unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

rollback;
