begin;

create or replace function public.get_partner_knowledge_landing(
  p_company_id uuid,
  p_locale text default 'ru'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
begin
  if not public.has_permission(p_company_id, 'knowledge.view') then
    return null;
  end if;

  with visible_articles as materialized (
    select
      article.id,
      article.slug,
      article.title,
      article.summary,
      article.article_type,
      article.updated_at,
      article.published_at,
      article.featured
    from public.knowledge_articles article
    where article.status = 'published'
      and article.visibility = 'all_partners'
      and article.locale = p_locale
      and article.published_at <= now()
  ),
  primary_categories as materialized (
    select distinct on (relation.article_id)
      relation.article_id,
      category.name
    from public.knowledge_article_categories relation
    join public.knowledge_categories category
      on category.id = relation.category_id
     and category.is_active
    join visible_articles article on article.id = relation.article_id
    order by relation.article_id, category.sort_order, category.name
  ),
  cards as materialized (
    select
      article.id,
      article.featured,
      article.published_at,
      article.updated_at,
      jsonb_build_object(
        'id', article.id,
        'slug', article.slug,
        'title', article.title,
        'summary', article.summary,
        'articleType', article.article_type,
        'updatedAt', article.updated_at,
        'category', category.name
      ) as card
    from visible_articles article
    left join primary_categories category on category.article_id = article.id
  ),
  populated_categories as materialized (
    select
      category.id,
      category.slug,
      category.name,
      category.sort_order,
      count(*)::integer as article_count
    from public.knowledge_categories category
    join public.knowledge_article_categories relation
      on relation.category_id = category.id
    join visible_articles article on article.id = relation.article_id
    where category.is_active
    group by category.id, category.slug, category.name, category.sort_order
  )
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', category.id,
          'slug', category.slug,
          'name', category.name,
          'articleCount', category.article_count
        )
        order by category.sort_order, category.name
      )
      from populated_categories category
    ), '[]'::jsonb),
    'featured', coalesce((
      select jsonb_agg(featured.card order by featured.published_at desc, featured.id)
      from (
        select card.id, card.published_at, card.card
        from cards card
        where card.featured
        order by card.published_at desc, card.id
        limit 4
      ) featured
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(recent.card order by recent.updated_at desc, recent.id)
      from (
        select card.id, card.updated_at, card.card
        from cards card
        order by card.updated_at desc, card.id
        limit 5
      ) recent
    ), '[]'::jsonb)
  ) into result;

  return result;
end
$$;

revoke all on function public.get_partner_knowledge_landing(uuid, text)
  from public, anon;
grant execute on function public.get_partner_knowledge_landing(uuid, text)
  to authenticated;

commit;
