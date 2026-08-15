drop function if exists public.search_cctv_camera_candidates(text,text,text,integer);

create function public.search_cctv_camera_candidates(
  search_query text,target_object_type text,target_placement_type text,result_limit integer default 12
) returns table(product_id uuid,sku text,product_name text,image_url text,resolution_mp smallint,
  color_night boolean,anpr boolean,video_analytics boolean,technical_verified boolean,
  available_stock numeric,recent_sales_qty numeric,retail_price_amount numeric,retail_price_currency text,
  already_in_pool boolean,existing_pool_version integer,existing_pool_archived boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_internal_permission('admin.estimates.view') then
    raise exception 'Forbidden.' using errcode='42501';
  end if;
  if char_length(trim(search_query))<2 or char_length(search_query)>100
    or target_object_type not in ('apartment','house','office','retail','warehouse','industrial','horeca','other')
    or target_placement_type not in ('indoor','outdoor') or result_limit not between 1 and 20 then
    raise exception 'Invalid CCTV camera search.' using errcode='22023';
  end if;
  return query
  select product.id,product.sku,product.name,product.image_url,cap.resolution_mp,cap.color_night,cap.anpr,
    cap.video_analytics,cap.verified,coalesce(signal.available_stock,0),coalesce(signal.recent_sales_qty,0),
    retail.retail_price_amount,retail.retail_price_currency,
    membership.id is not null and membership.archived_at is null,
    membership.version,
    coalesce(membership.archived_at is not null,false)
  from public.catalog_products product
  join public.cctv_camera_capabilities cap on cap.product_id=product.id
  left join public.cctv_camera_turnover_signals signal on signal.product_id=product.id
  left join public.public_retail_publications publication on publication.status='published'
  left join public.public_retail_products retail on retail.publication_id=publication.id and retail.sku=product.sku
  left join public.cctv_camera_candidate_pools membership on membership.object_type=target_object_type
    and membership.placement_type=target_placement_type and membership.product_id=product.id
  where product.is_active and product.is_visible and cap.verified
    and (product.sku ilike '%'||trim(search_query)||'%' or product.name ilike '%'||trim(search_query)||'%')
  order by case when lower(product.sku)=lower(trim(search_query)) then 0 else 1 end,product.sku,product.id
  limit result_limit;
end; $$;

revoke all on function public.search_cctv_camera_candidates(text,text,text,integer) from public,anon;
grant execute on function public.search_cctv_camera_candidates(text,text,text,integer) to authenticated;
