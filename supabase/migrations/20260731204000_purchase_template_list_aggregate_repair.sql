begin;

create or replace function public.list_purchase_templates_page(
  target_company_id uuid,
  target_search text,
  target_filter text,
  target_limit integer,
  target_offset integer
)
returns table (
  id uuid, company_id uuid, owner_user_id uuid, name text, description text,
  visibility text, status text, source_type text, source_id uuid, usage_count integer,
  last_used_at timestamptz, revision integer, created_at timestamptz,
  updated_at timestamptz, archived_at timestamptz, owner_name text,
  item_count integer, total_quantity numeric, product_ids uuid[], item_intents jsonb, total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_permission(target_company_id, 'purchase_templates.view') then
    raise exception 'Purchase template access denied.' using errcode = '42501';
  end if;
  if target_filter not in ('all', 'mine', 'company', 'active', 'archived')
    or target_limit not between 1 and 50 or target_offset < 0 then
    raise exception 'Purchase template query is invalid.' using errcode = '22023';
  end if;
  return query
  with visible as (
    select template.*
    from public.purchase_templates template
    where template.company_id = target_company_id
      and public.can_view_purchase_template(template)
      and case target_filter
        when 'mine' then template.owner_user_id = auth.uid()
        when 'company' then template.visibility = 'company'
        when 'archived' then template.status = 'archived'
        else template.status = 'active'
      end
      and (
        nullif(btrim(target_search), '') is null
        or template.name ilike '%' || replace(replace(btrim(target_search), '%', ''), '_', '') || '%'
        or coalesce(template.description, '') ilike '%' || replace(replace(btrim(target_search), '%', ''), '_', '') || '%'
        or exists (
          select 1 from public.purchase_template_items item
          join public.catalog_products product on product.id = item.product_id
          where item.template_id = template.id
            and (product.sku ilike '%' || btrim(target_search) || '%' or product.name ilike '%' || btrim(target_search) || '%')
        )
      )
  ), counted as (
    select count(*)::bigint as count from visible
  )
  select template.id, template.company_id, template.owner_user_id, template.name,
    template.description, template.visibility, template.status, template.source_type,
    template.source_id, template.usage_count, template.last_used_at, template.revision,
    template.created_at, template.updated_at, template.archived_at,
    coalesce(profile.full_name, 'Пользователь компании'), aggregate.item_count,
    aggregate.total_quantity, aggregate.product_ids, aggregate.item_intents, counted.count
  from visible template
  cross join counted
  left join public.user_profiles profile on profile.id = template.owner_user_id
  cross join lateral (
    select count(item.id)::integer as item_count,
      coalesce(sum(item.preferred_quantity), 0) as total_quantity,
      coalesce(array_agg(item.product_id order by item.sort_order), '{}'::uuid[]) as product_ids,
      coalesce(jsonb_agg(jsonb_build_object('productId', item.product_id, 'quantity', item.preferred_quantity)
        order by item.sort_order), '[]'::jsonb) as item_intents
    from public.purchase_template_items item
    where item.template_id = template.id
  ) aggregate
  order by template.updated_at desc, template.id
  limit target_limit offset target_offset;
end;
$$;

revoke all on function public.list_purchase_templates_page(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.list_purchase_templates_page(uuid, text, text, integer, integer) to authenticated;

commit;
