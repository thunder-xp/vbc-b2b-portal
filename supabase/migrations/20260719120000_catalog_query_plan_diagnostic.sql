-- Internal catalog plan diagnostic. It accepts an operation allowlist, never
-- arbitrary SQL, and is executable only through the server-side service role.
create or replace function public.explain_catalog_operation(
  p_operation text,
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_result jsonb;
  subject_user_id uuid;
  sample_sku text;
  sample_attribute_key text;
  sample_attribute_value text;
  sample_filters jsonb := '{}'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Catalog plan access denied.' using errcode = '42501';
  end if;

  if p_operation not in ('catalog_page', 'catalog_facets', 'exact_sku', 'attribute_filter', 'stock_sort') then
    raise exception 'Unsupported catalog plan operation.' using errcode = '22023';
  end if;

  select membership.user_id
  into subject_user_id
  from public.company_memberships membership
  join public.role_permissions role_permission on role_permission.role_id = membership.role_id
  join public.permissions permission on permission.id = role_permission.permission_id
  where membership.company_id = p_company_id
    and membership.status = 'active'
    and permission.code = 'catalog.view'
  order by membership.created_at
  limit 1;

  if subject_user_id is null then
    raise exception 'No catalog diagnostic subject is available.' using errcode = '22023';
  end if;

  perform set_config('request.jwt.claim.sub', subject_user_id::text, true);
  perform set_config('statement_timeout', '5000', true);

  if p_operation = 'exact_sku' then
    select product.sku into sample_sku
    from public.catalog_products product
    where product.is_active and product.is_visible and nullif(btrim(product.sku), '') is not null
    order by product.id
    limit 1;
  elsif p_operation = 'attribute_filter' then
    select
      attribute.attribute_key,
      public.catalog_public_attribute_value(
        attribute.resolution_status,
        attribute.display_value,
        attribute.resolved_display_value
      )
    into sample_attribute_key, sample_attribute_value
    from public.catalog_product_attributes attribute
    join public.catalog_products product on product.id = attribute.product_id
    where product.is_active and product.is_visible
      and attribute.is_visible and attribute.is_filterable
      and public.catalog_public_attribute_value(
        attribute.resolution_status,
        attribute.display_value,
        attribute.resolved_display_value
      ) is not null
    order by attribute.attribute_key, attribute.product_id
    limit 1;

    if sample_attribute_key is not null then
      sample_filters := jsonb_build_object(
        sample_attribute_key,
        jsonb_build_array(sample_attribute_value)
      );
    end if;
  end if;

  case p_operation
    when 'catalog_facets' then
      execute $plan$
        explain (analyze, buffers, format json)
        select * from public.catalog_partner_facets($1, null, null, null, 'all', '{}'::jsonb, 30)
      $plan$ into plan_result using p_company_id;
    when 'exact_sku' then
      execute $plan$
        explain (analyze, buffers, format json)
        select public.catalog_partner_page_v2($1, null, null, $2, 'all', '{}'::jsonb, 'default', 12, 0)
      $plan$ into plan_result using p_company_id, sample_sku;
    when 'attribute_filter' then
      execute $plan$
        explain (analyze, buffers, format json)
        select public.catalog_partner_page_v2($1, null, null, null, 'all', $2, 'default', 12, 0)
      $plan$ into plan_result using p_company_id, sample_filters;
    when 'stock_sort' then
      execute $plan$
        explain (analyze, buffers, format json)
        select public.catalog_partner_page_v2($1, null, null, null, 'all', '{}'::jsonb, 'availability_desc', 12, 0)
      $plan$ into plan_result using p_company_id;
    else
      execute $plan$
        explain (analyze, buffers, format json)
        select public.catalog_partner_page_v2($1, null, null, null, 'all', '{}'::jsonb, 'default', 12, 0)
      $plan$ into plan_result using p_company_id;
  end case;

  return plan_result;
end;
$$;

revoke all on function public.explain_catalog_operation(text, uuid) from public, anon, authenticated;
grant execute on function public.explain_catalog_operation(text, uuid) to service_role;

comment on function public.explain_catalog_operation(text, uuid) is
  'Returns an analyzed JSON plan for one allowlisted catalog diagnostic operation. Service role only.';
