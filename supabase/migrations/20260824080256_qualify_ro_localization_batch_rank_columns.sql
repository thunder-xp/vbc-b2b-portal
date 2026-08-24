begin;

create or replace function public.rank_portal_localization_product_batch(
  p_locale text default 'ro', p_limit integer default 100
)
returns table (
  selection_order integer,
  product_id uuid,
  public_id uuid,
  slug text,
  sku text,
  source_name text,
  category text,
  merchandising_status text[],
  image_present boolean,
  description_length integer,
  specification_count integer,
  retail_price_present boolean,
  selection_reason text,
  priority_components jsonb,
  current_hash text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_locale <> 'ro' or p_limit not between 1 and 100 then
    raise exception 'LOCALIZATION_BATCH_RANK_INPUT_INVALID' using errcode='22023';
  end if;

  return query
  with candidates as (
    select
      product.id as product_id,
      snapshot.public_id,
      snapshot.slug,
      snapshot.sku,
      product.name as source_name,
      coalesce(nullif((snapshot.category_path->-1)->>'nameRu',''),
        (snapshot.category_path->-1)->>'nameRo','—') as category,
      coalesce(snapshot.merchandising_labels,'{}'::text[]) as merchandising_status,
      coalesce(nullif(snapshot.primary_image_url,''),nullif(product.image_url,'')) is not null as image_present,
      char_length(coalesce(product.full_description,product.description,product.short_description,'')) as description_length,
      jsonb_array_length(coalesce(snapshot.specifications,'[]'::jsonb)) as specification_count,
      snapshot.retail_price_amount is not null as retail_price_present,
      case
        when coalesce(snapshot.merchandising_labels,'{}'::text[]) @> array['TOP']::text[] then 0
        when coalesce(snapshot.merchandising_labels,'{}'::text[]) @> array['NEW']::text[] then 1
        when coalesce(snapshot.merchandising_labels,'{}'::text[]) @> array['HOT']::text[] then 2
        when coalesce(snapshot.merchandising_labels,'{}'::text[]) @> array['SPECIAL_OFFER']::text[] then 3
        else 4
      end as merchandising_rank,
      (
        case when coalesce(nullif(snapshot.primary_image_url,''),nullif(product.image_url,'')) is not null then 0 else 40 end +
        case
          when char_length(coalesce(product.full_description,product.description,product.short_description,'')) >= 240 then 0
          when char_length(coalesce(product.full_description,product.description,product.short_description,'')) >= 120 then 10
          when char_length(coalesce(product.full_description,product.description,product.short_description,'')) >= 40 then 25
          else 40
        end +
        case
          when jsonb_array_length(coalesce(snapshot.specifications,'[]'::jsonb)) >= 3 then 0
          when jsonb_array_length(coalesce(snapshot.specifications,'[]'::jsonb)) >= 1 then 10
          else 25
        end +
        case when snapshot.retail_price_amount is not null then 0 else 40 end
      ) as readiness_penalty,
      (
        case
          when char_length(coalesce(product.full_description,product.description,product.short_description,'')) >= 500 then 0
          when char_length(coalesce(product.full_description,product.description,product.short_description,'')) >= 240 then 5
          when char_length(coalesce(product.full_description,product.description,product.short_description,'')) >= 120 then 12
          else 25
        end +
        case
          when jsonb_array_length(coalesce(snapshot.specifications,'[]'::jsonb)) >= 5 then 0
          when jsonb_array_length(coalesce(snapshot.specifications,'[]'::jsonb)) >= 3 then 5
          when jsonb_array_length(coalesce(snapshot.specifications,'[]'::jsonb)) >= 1 then 12
          else 20
        end
      ) as seo_penalty,
      case
        when (snapshot.category_path->0)->>'nameRu'='Видеонаблюдение' then 'CCTV'
        when (snapshot.category_path->0)->>'nameRu'='Контроль доступа' then 'access_control'
        when (snapshot.category_path->0)->>'nameRu'='Охранные системы' then 'alarm'
        when (snapshot.category_path->0)->>'nameRu'='Сетевое оборудование' then 'networking'
        when (snapshot.category_path->0)->>'nameRu'='Домофония' then 'intercom'
        when (snapshot.category_path->0)->>'nameRu'='Электропитание' then 'power'
        else 'other'
      end as domain,
      snapshot.sort_order,
      public.product_localization_source_hash(product.id) as current_hash
    from public.public_retail_publications publication
    join public.public_retail_products snapshot on snapshot.publication_id=publication.id
    join public.public_retail_product_identities identity on identity.public_id=snapshot.public_id
    join public.catalog_products product on product.id=identity.source_product_id
    where publication.status='published'
      and product.is_active and product.is_visible
      and not exists (
        select 1 from public.product_localizations localization
        where localization.product_id=product.id and localization.locale=p_locale
      )
      and not exists (
        select 1 from jsonb_array_elements(snapshot.category_path) path
        where path->>'nameRu'='-PROJECT EQUIPMENT-'
      )
  ), scored as (
    select candidates.*,
      row_number() over (
        partition by domain
        order by merchandising_rank,readiness_penalty,seo_penalty,sort_order,sku,product_id
      ) as domain_rank
    from candidates
  ), priority_cohort as (
    select scored.*,'commercial_seo_readiness'::text as selection_reason
    from scored
    where domain_rank <= case domain
      when 'CCTV' then 30
      when 'alarm' then 15
      when 'networking' then 15
      when 'access_control' then 10
      when 'intercom' then 8
      when 'power' then 7
      else 5
    end
  ), ordered_priority as (
    select priority_cohort.*,
      row_number() over (
        order by merchandising_rank,readiness_penalty,seo_penalty,
          case domain when 'CCTV' then 0 when 'access_control' then 1 when 'alarm' then 2
            when 'networking' then 3 when 'intercom' then 4 when 'power' then 5 else 6 end,
          sort_order,sku,product_id
      ) as selection_order
    from priority_cohort
  ), weak_pool as (
    select scored.*,
      row_number() over (
        order by
          case domain when 'access_control' then 0 when 'alarm' then 1 when 'networking' then 2
            when 'intercom' then 3 when 'power' then 4 when 'CCTV' then 5 else 6 end,
          specification_count desc,description_length desc,sort_order,sku,product_id
      ) as weak_rank
    from scored
    where not exists (
        select 1 from priority_cohort selected where selected.product_id=scored.product_id
      )
      and description_length < 120
      and image_present
      and retail_price_present
      and (specification_count >= 1 or description_length >= 40)
  ), selected as (
    select ordered_priority.product_id,ordered_priority.public_id,ordered_priority.slug,ordered_priority.sku,
      ordered_priority.source_name,ordered_priority.category,ordered_priority.merchandising_status,
      ordered_priority.image_present,ordered_priority.description_length,ordered_priority.specification_count,
      ordered_priority.retail_price_present,ordered_priority.merchandising_rank,ordered_priority.readiness_penalty,
      ordered_priority.seo_penalty,ordered_priority.domain,ordered_priority.sort_order,ordered_priority.current_hash,
      ordered_priority.domain_rank,ordered_priority.selection_reason,
      ordered_priority.selection_order::integer as final_order
    from ordered_priority
    union all
    select weak_pool.product_id,weak_pool.public_id,weak_pool.slug,weak_pool.sku,
      weak_pool.source_name,weak_pool.category,weak_pool.merchandising_status,
      weak_pool.image_present,weak_pool.description_length,weak_pool.specification_count,
      weak_pool.retail_price_present,weak_pool.merchandising_rank,weak_pool.readiness_penalty,
      weak_pool.seo_penalty,weak_pool.domain,weak_pool.sort_order,weak_pool.current_hash,
      weak_pool.domain_rank,'weak_description_remediation'::text as selection_reason,
      (90+weak_pool.weak_rank)::integer as final_order
    from weak_pool where weak_rank <= 10
  )
  select
    selected.final_order,
    selected.product_id,
    selected.public_id,
    selected.slug,
    selected.sku,
    selected.source_name,
    selected.category,
    selected.merchandising_status,
    selected.image_present,
    selected.description_length,
    selected.specification_count,
    selected.retail_price_present,
    selected.selection_reason,
    jsonb_build_object(
      'merchandisingRank',selected.merchandising_rank,
      'readinessPenalty',selected.readiness_penalty,
      'seoPenalty',selected.seo_penalty,
      'domain',selected.domain,
      'domainRank',selected.domain_rank
    ),
    selected.current_hash
  from selected
  order by selected.final_order
  limit p_limit;
end;
$$;

revoke all on function public.rank_portal_localization_product_batch(text,integer) from public, anon, authenticated;
grant execute on function public.rank_portal_localization_product_batch(text,integer) to service_role;

commit;
