begin;

create or replace function public.save_knowledge_article(
  p_article_id uuid,
  p_slug text,
  p_title text,
  p_summary text,
  p_article_type text,
  p_visibility text,
  p_locale text,
  p_content jsonb,
  p_featured boolean,
  p_category_ids uuid[],
  p_product_ids uuid[] default '{}'::uuid[],
  p_document_ids uuid[] default '{}'::uuid[],
  p_expected_version integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_article_id, gen_random_uuid());
  actor uuid := auth.uid();
  current_version integer;
begin
  if actor is null
     or not public.has_internal_permission(
       case when p_article_id is null then 'knowledge.create' else 'knowledge.edit' end
     ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not public.knowledge_content_is_safe(p_content)
     or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or coalesce(cardinality(p_category_ids), 0) not between 1 and 5 then
    raise exception 'Invalid article.' using errcode = '23514';
  end if;

  if p_article_id is null then
    insert into public.knowledge_articles(
      id, slug, title, summary, article_type, visibility, locale, content_json,
      search_text, featured, author_user_id, last_editor_user_id
    )
    values (
      target, p_slug, btrim(p_title), btrim(p_summary), p_article_type,
      p_visibility, p_locale, p_content,
      lower(p_title || ' ' || p_summary || ' ' || p_content::text),
      p_featured, actor, actor
    );
    insert into public.knowledge_article_events(
      article_id, actor_user_id, event_type, to_status
    ) values (target, actor, 'created', 'draft');
  else
    select a.version into current_version
    from public.knowledge_articles a
    where a.id = target
    for update;
    if current_version is null or current_version <> p_expected_version then
      raise exception 'KNOWLEDGE_VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    update public.knowledge_articles
    set slug = p_slug,
        title = btrim(p_title),
        summary = btrim(p_summary),
        article_type = p_article_type,
        visibility = p_visibility,
        locale = p_locale,
        content_json = p_content,
        search_text = lower(p_title || ' ' || p_summary || ' ' || p_content::text),
        featured = p_featured,
        last_editor_user_id = actor,
        version = version + 1,
        updated_at = now()
    where id = target and status in ('draft', 'review');
    if not found then
      raise exception 'Published articles require a new draft.' using errcode = '23514';
    end if;
    insert into public.knowledge_article_events(
      article_id, actor_user_id, event_type, safe_metadata
    ) values (
      target,
      actor,
      'updated',
      jsonb_build_object('previousVersion', current_version)
    );
  end if;

  delete from public.knowledge_article_categories where article_id = target;
  insert into public.knowledge_article_categories(article_id, category_id)
  select target, id
  from public.knowledge_categories
  where id = any(p_category_ids) and is_active;
  if (select count(*) from public.knowledge_article_categories where article_id = target)
     <> cardinality(p_category_ids) then
    raise exception 'Invalid category.' using errcode = '23514';
  end if;

  delete from public.knowledge_article_products where article_id = target;
  insert into public.knowledge_article_products(article_id, product_id)
  select target, id
  from public.catalog_products
  where id = any(coalesce(p_product_ids, '{}'::uuid[])) and is_active and is_visible;
  if (select count(*) from public.knowledge_article_products where article_id = target)
     <> coalesce(cardinality(p_product_ids), 0) then
    raise exception 'Invalid product link.' using errcode = '23514';
  end if;

  delete from public.knowledge_article_documents where article_id = target;
  insert into public.knowledge_article_documents(article_id, document_id)
  select target, id
  from public.partner_documents
  where id = any(coalesce(p_document_ids, '{}'::uuid[]))
    and company_id is null
    and archived_at is null
    and status = 'available';
  if (select count(*) from public.knowledge_article_documents where article_id = target)
     <> coalesce(cardinality(p_document_ids), 0) then
    raise exception 'Invalid document link.' using errcode = '23514';
  end if;
  return target;
end
$$;

create or replace function public.transition_knowledge_article(
  p_article_id uuid,
  p_action text,
  p_expected_version integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.knowledge_articles;
  actor uuid := auth.uid();
  next_status text;
  event_name text;
begin
  select * into a
  from public.knowledge_articles
  where id = p_article_id
  for update;
  if a.id is null or a.version <> p_expected_version then
    raise exception 'KNOWLEDGE_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if p_action = 'submit_review' and a.status = 'draft'
     and public.has_internal_permission('knowledge.review') then
    next_status := 'review';
    event_name := 'submitted_for_review';
  elsif p_action = 'publish' and a.status = 'review'
     and public.has_internal_permission('knowledge.publish') then
    next_status := 'published';
    event_name := 'published';
  elsif p_action = 'archive' and a.status = 'published'
     and public.has_internal_permission('knowledge.archive') then
    next_status := 'archived';
    event_name := 'archived';
  elsif p_action = 'restore' and a.status = 'archived'
     and public.has_internal_permission('knowledge.archive') then
    next_status := 'draft';
    event_name := 'restored';
  else
    raise exception 'Invalid knowledge transition.' using errcode = '42501';
  end if;

  update public.knowledge_articles
  set status = next_status,
      version = version + 1,
      updated_at = now(),
      last_editor_user_id = actor,
      published_at = case when next_status = 'published' then now() else published_at end,
      archived_at = case
        when next_status = 'archived' then now()
        when next_status = 'draft' then null
        else archived_at
      end
  where id = a.id;

  if next_status = 'published' then
    insert into public.knowledge_article_versions(
      article_id, version, title, summary, article_type, visibility, locale,
      content_json, created_by, publication_reason
    ) values (
      a.id, a.version + 1, a.title, a.summary, a.article_type, a.visibility,
      a.locale, a.content_json, actor, left(nullif(btrim(p_reason), ''), 500)
    );
  end if;
  insert into public.knowledge_article_events(
    article_id, actor_user_id, event_type, from_status, to_status, safe_metadata
  ) values (
    a.id,
    actor,
    event_name,
    a.status,
    next_status,
    case
      when p_reason is null then '{}'::jsonb
      else jsonb_build_object('reason', left(p_reason, 500))
    end
  );
  return jsonb_build_object('id', a.id, 'status', next_status, 'version', a.version + 1);
end
$$;

revoke all on function public.save_knowledge_article(uuid, text, text, text, text, text, text, jsonb, boolean, uuid[], uuid[], uuid[], integer) from public, anon;
revoke all on function public.transition_knowledge_article(uuid, text, integer, text) from public, anon;
grant execute on function public.save_knowledge_article(uuid, text, text, text, text, text, text, jsonb, boolean, uuid[], uuid[], uuid[], integer) to authenticated;
grant execute on function public.transition_knowledge_article(uuid, text, integer, text) to authenticated;

commit;
