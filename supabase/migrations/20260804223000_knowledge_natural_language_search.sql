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
  with query_tokens as (
    select distinct token
    from (
      select regexp_replace(value, '[^[:alnum:]-]', '', 'g') token
      from regexp_split_to_table(q, '\s+') value
    ) normalized
    where char_length(token) >= 3
    limit 20
  ),
  matches as (
    select
      a.*,
      case
        when lower(a.title) = q then 0
        when lower(a.title) like q || '%' then 1
        when lower(a.title) like '%' || q || '%' then 2
        when lower(a.summary) like '%' || q || '%' then 3
        else 4
      end as rank,
      token_match.hits
    from public.knowledge_articles a
    cross join lateral (
      select count(*) filter (
        where lower(a.search_text) like '%' || token || '%'
      ) hits,
      count(*) total
      from query_tokens
    ) token_match
    where public.can_view_knowledge_article(p_company_id, a.id)
      and (
        lower(a.search_text) like '%' || q || '%'
        or to_tsvector('simple', a.search_text) @@ plainto_tsquery('simple', q)
        or (
          token_match.total > 0
          and token_match.hits >= least(2, token_match.total)
        )
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
    order by rank, token_match.hits desc, a.updated_at desc, a.id
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

revoke all on function public.search_partner_knowledge(uuid, text, integer, text) from public, anon;
grant execute on function public.search_partner_knowledge(uuid, text, integer, text) to authenticated;

commit;
