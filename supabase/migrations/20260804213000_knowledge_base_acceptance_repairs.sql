begin;

create or replace function public.search_partner_knowledge(
  p_company_id uuid,
  p_query text,
  p_limit integer default 10,
  p_source text default 'landing'
)
returns table(
  document_type text,
  document_id uuid,
  title text,
  subtitle text,
  safe_metadata jsonb,
  route text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  q text := lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  capped integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  result_count integer;
begin
  if char_length(q) not between 2 and 100
     or not public.has_permission(p_company_id, 'knowledge.view') then
    return;
  end if;

  return query
  with matches as (
    select
      a.*,
      case
        when lower(a.title) = q then 0
        when lower(a.title) like q || '%' then 1
        when lower(a.title) like '%' || q || '%' then 2
        when lower(a.summary) like '%' || q || '%' then 3
        else 4
      end as rank
    from public.knowledge_articles a
    where public.can_view_knowledge_article(p_company_id, a.id)
      and (
        lower(a.search_text) like '%' || q || '%'
        or to_tsvector('simple', a.search_text) @@ plainto_tsquery('simple', q)
        or exists (
          select 1
          from public.knowledge_article_categories ac
          join public.knowledge_categories c on c.id = ac.category_id
          where ac.article_id = a.id and lower(c.name) like '%' || q || '%'
        )
        or exists (
          select 1
          from public.knowledge_article_products ap
          join public.catalog_products p on p.id = ap.product_id
          where ap.article_id = a.id
            and p.is_active
            and p.is_visible
            and lower(p.sku || ' ' || p.name) like '%' || q || '%'
        )
        or exists (
          select 1
          from public.knowledge_article_documents ad
          join public.partner_documents d on d.id = ad.document_id
          where ad.article_id = a.id
            and public.can_access_partner_document(d.id, p_company_id, false)
            and lower(d.title) like '%' || q || '%'
        )
      )
    order by rank, a.updated_at desc, a.id
    limit capped
  )
  select
    'knowledge',
    m.id,
    m.title,
    concat_ws(
      ' · ',
      (
        select c.name
        from public.knowledge_article_categories ac
        join public.knowledge_categories c on c.id = ac.category_id
        where ac.article_id = m.id
        order by c.sort_order
        limit 1
      ),
      m.summary
    ),
    jsonb_build_object('articleType', m.article_type, 'version', m.version),
    '/cabinet/knowledge/' || m.slug,
    m.updated_at
  from matches m;

  get diagnostics result_count = row_count;
  insert into public.knowledge_search_events(
    user_id,
    company_id,
    query_hash,
    normalized_length,
    result_count,
    source
  )
  values (
    auth.uid(),
    p_company_id,
    encode(extensions.digest(q, 'sha256'), 'hex'),
    char_length(q),
    result_count,
    case
      when p_source in ('landing', 'global', 'support', 'service', 'product') then p_source
      else 'landing'
    end
  );
end
$$;

create or replace function public.record_knowledge_feedback(
  p_company_id uuid,
  p_article_id uuid,
  p_helpful boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article_version integer;
begin
  if not public.can_view_knowledge_article(p_company_id, p_article_id) then
    raise exception 'Article unavailable.' using errcode = '42501';
  end if;
  if (p_helpful and p_reason is not null)
     or (not p_helpful and p_reason is not null and p_reason not in ('outdated', 'unclear', 'not_solved', 'missing_step', 'other')) then
    raise exception 'Invalid feedback.' using errcode = '23514';
  end if;

  select a.version into v_article_version
  from public.knowledge_articles a
  where a.id = p_article_id;

  insert into public.knowledge_article_feedback(
    article_id,
    article_version,
    user_id,
    company_id,
    helpful,
    reason
  )
  values (
    p_article_id,
    v_article_version,
    auth.uid(),
    p_company_id,
    p_helpful,
    p_reason
  )
  on conflict (article_id, article_version, user_id)
  do update set
    helpful = excluded.helpful,
    reason = excluded.reason,
    updated_at = now();
end
$$;

create or replace function public.record_knowledge_suggestion_outcome(
  p_company_id uuid,
  p_article_id uuid,
  p_query_hash text,
  p_source text,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article_version integer;
begin
  if not public.can_view_knowledge_article(p_company_id, p_article_id)
     or p_source not in ('support', 'service')
     or p_outcome not in ('suggested', 'opened', 'solved', 'continued', 'ticket_created')
     or p_query_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid suggestion event.' using errcode = '23514';
  end if;

  select a.version into v_article_version
  from public.knowledge_articles a
  where a.id = p_article_id;

  insert into public.knowledge_ticket_suggestions(
    user_id,
    company_id,
    article_id,
    article_version,
    source,
    query_hash,
    outcome,
    resolved_at
  )
  values (
    auth.uid(),
    p_company_id,
    p_article_id,
    v_article_version,
    p_source,
    p_query_hash,
    p_outcome,
    case when p_outcome = 'solved' then now() end
  )
  on conflict (user_id, article_id, article_version, source, query_hash)
  do update set
    outcome = excluded.outcome,
    resolved_at = coalesce(excluded.resolved_at, knowledge_ticket_suggestions.resolved_at);
end
$$;

revoke all on function public.search_partner_knowledge(uuid, text, integer, text) from public, anon;
revoke all on function public.record_knowledge_feedback(uuid, uuid, boolean, text) from public, anon;
revoke all on function public.record_knowledge_suggestion_outcome(uuid, uuid, text, text, text) from public, anon;

grant execute on function public.search_partner_knowledge(uuid, text, integer, text) to authenticated;
grant execute on function public.record_knowledge_feedback(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.record_knowledge_suggestion_outcome(uuid, uuid, text, text, text) to authenticated;

commit;
