begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.get_admin_governed_price_coverage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  result jsonb;
  active_cart_count integer;
  non_empty_active_cart_count integer;
  governed_issues jsonb;
begin
  result := private.governed_price_coverage_base();

  select
    count(*)::integer,
    count(*) filter (where exists (
      select 1
      from public.cart_items item
      where item.cart_id = cart.id
        and item.quantity > 0
    ))::integer
  into active_cart_count, non_empty_active_cart_count
  from public.carts cart
  join private.governed_price_order_capable_companies() company
    on company.id = cart.company_id
  where cart.status in ('active', 'submitting');

  with issue_groups as materialized (
    select facts.company_id, facts.company_name, facts.product_id,
      facts.sku, facts.product_name, max(facts.price_type_name) as price_type_name,
      bool_or(facts.exposure_kind = 'active_cart') as has_active_cart,
      max(facts.exposure_at) as latest_exposure_at
    from private.governed_price_coverage_exposure_facts() facts
    where facts.governed_price_id is null
      and facts.product_mapping_present
      and facts.commercial_profile_valid
      and facts.price_type_valid
    group by facts.company_id, facts.company_name, facts.product_id,
      facts.sku, facts.product_name, lower(facts.external_price_type_ref)
  ), latest_price_sync as (
    select status, last_successful_sync_at
    from public.price_sync_state
    where id = 'product_prices'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'companyId', issue.company_id,
    'companyName', issue.company_name,
    'productId', issue.product_id,
    'sku', issue.sku,
    'productName', issue.product_name,
    'governedPriceType', issue.price_type_name,
    'severity', case when issue.has_active_cart then 'high' else 'medium' end,
    'classification', case
      when sync.status = 'succeeded'
        and sync.last_successful_sync_at >= issue.latest_exposure_at
        then 'source_gap_after_complete_sync'
      else 'unverified_projection_gap'
    end,
    'requiredAction', 'Create or restore the governed product price in 1C, then run the existing price synchronization.'
  ) order by issue.has_active_cart desc, issue.latest_exposure_at desc, issue.company_name, issue.sku), '[]'::jsonb)
  into governed_issues
  from issue_groups issue
  cross join latest_price_sync sync;

  result := jsonb_set(
    result,
    '{summary,activeCarts}',
    to_jsonb(active_cart_count),
    false
  );
  result := jsonb_set(
    result,
    '{summary,nonEmptyActiveCarts}',
    to_jsonb(non_empty_active_cart_count),
    true
  );
  result := jsonb_set(result, '{issues}', governed_issues, false);

  return result;
end;
$$;

comment on function public.get_admin_governed_price_coverage() is
  'Permission-gated governed-price coverage for active carts and recent buying context, ordered by deterministic commercial exposure.';

commit;
