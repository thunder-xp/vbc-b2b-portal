begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists private;

create or replace function private.governed_price_order_capable_companies()
returns table (
  id uuid,
  display_name text,
  external_1c_price_type_id text,
  commercial_profile_state text,
  commercial_profile_verified_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct company.id, company.display_name,
    company.external_1c_price_type_id,
    company.commercial_profile_state,
    company.commercial_profile_verified_at
  from public.partner_companies company
  join public.company_memberships membership
    on membership.company_id = company.id and membership.status = 'active'
  join public.user_profiles profile
    on profile.id = membership.user_id and profile.status = 'active'
  join public.roles role
    on role.id = membership.role_id and role.scope = 'partner'
  join public.role_permissions role_permission
    on role_permission.role_id = role.id
  join public.permissions permission
    on permission.id = role_permission.permission_id
   and permission.code = 'orders.manage'
   and permission.scope in ('partner', 'both')
  join public.partner_company_access_policies access_policy
    on access_policy.company_id = company.id
  join public.partner_company_capabilities capability
    on capability.company_id = company.id
   and capability.permission_id = permission.id
  where company.status = 'active'
    and not exists (
      select 1
      from public.membership_permission_overrides permission_override
      where permission_override.membership_id = membership.id
        and permission_override.permission_id = permission.id
        and permission_override.effect = 'deny'
    );
$$;

revoke all on function private.governed_price_order_capable_companies()
  from public, anon, authenticated;
grant execute on function private.governed_price_order_capable_companies()
  to service_role;

create or replace function private.governed_price_coverage_exposure_facts()
returns table (
  company_id uuid,
  company_name text,
  product_id uuid,
  sku text,
  product_name text,
  external_product_ref text,
  external_price_type_ref text,
  price_type_name text,
  exposure_kind text,
  exposure_id uuid,
  exposure_at timestamptz,
  quantity numeric,
  product_mapping_present boolean,
  commercial_profile_valid boolean,
  price_type_valid boolean,
  governed_price_id uuid,
  governed_price_company_id uuid,
  governed_price_amount numeric,
  governed_price_currency text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with order_capable as materialized (
    select * from private.governed_price_order_capable_companies()
  ), buying_exposure as materialized (
    select cart.company_id, item.product_id, 'active_cart'::text as exposure_kind,
      cart.id as exposure_id, cart.updated_at as exposure_at,
      item.quantity::numeric as quantity
    from public.carts cart
    join order_capable company on company.id = cart.company_id
    join public.cart_items item on item.cart_id = cart.id and item.quantity > 0
    where cart.status in ('active', 'submitting')
    union all
    select history.company_id, item.product_id, 'recent_order'::text,
      history.id, history.one_c_document_date,
      item.quantity
    from public.partner_order_history history
    join order_capable company on company.id = history.company_id
    join public.partner_order_history_items item
      on item.order_history_id = history.id
     and item.product_id is not null
     and item.quantity > 0
    where history.partner_visible
      and not history.one_c_deletion_mark
      and history.one_c_document_date >= now() - interval '30 days'
  ), current_prices as materialized (
    select price.id, price.product_id, price.company_id,
      lower(price.external_1c_price_type_id) as external_price_type_ref,
      price.price_amount, price.currency
    from public.product_prices price
    where price.is_active
      and price.is_published
      and price.currency_status = 'resolved'
      and price.price_amount > 0
      and price.valid_from <= now()
      and (price.valid_to is null or price.valid_to >= now())
  )
  select company.id, company.display_name,
    product.id, product.sku, product.name, product.external_1c_id,
    company.external_1c_price_type_id,
    price_type.name,
    exposure.exposure_kind, exposure.exposure_id, exposure.exposure_at,
    exposure.quantity,
    nullif(btrim(product.external_1c_id), '') is not null,
    company.commercial_profile_state = 'aligned'
      and company.commercial_profile_verified_at is not null,
    price_type.id is not null
      and price_type.is_active
      and price_type.currency_status = 'resolved',
    price.id, price.company_id, price.price_amount, price.currency
  from buying_exposure exposure
  join order_capable company on company.id = exposure.company_id
  join public.catalog_products product
    on product.id = exposure.product_id
   and product.is_active
   and product.is_visible
  left join public.price_types price_type
    on lower(price_type.external_ref) = lower(company.external_1c_price_type_id)
  left join current_prices price
    on price.product_id = product.id
   and price.external_price_type_ref = lower(company.external_1c_price_type_id)
   and (price.company_id is null or price.company_id = company.id);
$$;

revoke all on function private.governed_price_coverage_exposure_facts()
  from public, anon, authenticated;
grant execute on function private.governed_price_coverage_exposure_facts()
  to service_role;

create or replace function public.list_governed_price_coverage_candidates(
  p_limit integer default 100
)
returns table (
  product_id uuid,
  sku text,
  product_name text,
  external_product_ref text,
  external_price_type_ref text,
  price_type_name text,
  priority integer,
  active_cart_count bigint,
  active_cart_line_count bigint,
  recent_order_count bigint,
  total_quantity numeric,
  company_ids uuid[],
  company_names text[],
  latest_exposure_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if session_user <> 'postgres'
    and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and not public.has_internal_permission('admin.prices.view') then
    raise exception 'Governed price coverage inspection is not allowed.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'Governed price coverage limit must be between 1 and 100.' using errcode = '22023';
  end if;

  return query
  select facts.product_id, facts.sku, facts.product_name,
    lower(facts.external_product_ref), lower(facts.external_price_type_ref),
    max(facts.price_type_name),
    case when bool_or(facts.exposure_kind = 'active_cart') then 1 else 2 end,
    count(distinct facts.exposure_id) filter (where facts.exposure_kind = 'active_cart'),
    count(*) filter (where facts.exposure_kind = 'active_cart'),
    count(distinct facts.exposure_id) filter (where facts.exposure_kind = 'recent_order'),
    sum(facts.quantity),
    array_agg(distinct facts.company_id order by facts.company_id),
    array_agg(distinct facts.company_name order by facts.company_name),
    max(facts.exposure_at)
  from private.governed_price_coverage_exposure_facts() facts
  where facts.governed_price_id is null
    and facts.product_mapping_present
    and facts.commercial_profile_valid
    and facts.price_type_valid
  group by facts.product_id, facts.sku, facts.product_name,
    lower(facts.external_product_ref), lower(facts.external_price_type_ref)
  order by
    case when bool_or(facts.exposure_kind = 'active_cart') then 1 else 2 end,
    max(facts.exposure_at) desc,
    facts.product_id,
    lower(facts.external_price_type_ref)
  limit p_limit;
end;
$$;

revoke all on function public.list_governed_price_coverage_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.list_governed_price_coverage_candidates(integer)
  to service_role;

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
begin
  if session_user <> 'postgres'
    and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and not (
      public.has_internal_permission('admin.prices.view')
      or public.has_internal_permission('admin.orders.view')
    ) then
    raise exception 'Governed price coverage diagnostics are not allowed.' using errcode = '42501';
  end if;

  with facts as materialized (
    select * from private.governed_price_coverage_exposure_facts()
  ), active_cart_facts as materialized (
    select * from facts where exposure_kind = 'active_cart'
  ), active_order_capable_companies as (
    select count(*)::integer as count
    from private.governed_price_order_capable_companies()
  ), active_cart_counts as (
    select
      count(distinct exposure_id)::integer as active_carts,
      count(*)::integer as total_lines,
      count(*) filter (where product_mapping_present)::integer as mapped_lines,
      count(*) filter (where governed_price_id is not null)::integer as priced_lines,
      count(*) filter (
        where governed_price_id is null
          and product_mapping_present
          and commercial_profile_valid
          and price_type_valid
      )::integer as missing_lines,
      count(distinct company_id) filter (
        where governed_price_id is null
          and product_mapping_present
          and commercial_profile_valid
          and price_type_valid
      )::integer as affected_companies,
      count(distinct product_id) filter (
        where governed_price_id is null
          and product_mapping_present
          and commercial_profile_valid
          and price_type_valid
      )::integer as affected_products
    from active_cart_facts
  ), used_price_types as materialized (
    select distinct lower(company.external_1c_price_type_id) as external_price_type_ref
    from private.governed_price_order_capable_companies() company
    join public.price_types price_type
      on lower(price_type.external_ref) = lower(company.external_1c_price_type_id)
     and price_type.is_active
     and price_type.currency_status = 'resolved'
    where company.commercial_profile_state = 'aligned'
      and company.commercial_profile_verified_at is not null
  ), catalog_counts as (
    select
      (select count(*) from public.catalog_products product
        where product.is_active and product.is_visible)::bigint as active_products,
      (select count(*) from used_price_types)::bigint as used_price_types,
      (select count(distinct (price.product_id, lower(price.external_1c_price_type_id)))
        from public.product_prices price
        join public.catalog_products product
          on product.id = price.product_id and product.is_active and product.is_visible
        join used_price_types used
          on used.external_price_type_ref = lower(price.external_1c_price_type_id)
        where price.is_active and price.is_published
          and price.currency_status = 'resolved' and price.price_amount > 0
          and price.valid_from <= now()
          and (price.valid_to is null or price.valid_to >= now()))::bigint as observed_eligible_pairs,
      (select count(distinct (product_id, lower(external_price_type_ref))) from facts)::bigint
        as meaningful_buying_context_pairs,
      (select count(distinct (product_id, lower(external_price_type_ref)))
        from facts
        where governed_price_id is null
          and product_mapping_present and commercial_profile_valid and price_type_valid)::bigint
        as meaningful_missing_pairs
  ), currency_exposure as (
    select governed_price_currency as currency,
      sum(governed_price_amount * quantity) as amount
    from active_cart_facts
    where governed_price_id is not null
    group by governed_price_currency
  ), latest_price_sync as (
    select status, last_successful_sync_at
    from public.price_sync_state where id = 'product_prices'
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'summary', jsonb_build_object(
      'activeOrderCapableCompanies', company_counts.count,
      'activeCarts', counts.active_carts,
      'totalCartLines', counts.total_lines,
      'linesWithProductMapping', counts.mapped_lines,
      'linesWithGovernedPrice', counts.priced_lines,
      'missingGovernedPriceLines', counts.missing_lines,
      'uniqueAffectedCompanies', counts.affected_companies,
      'uniqueAffectedProducts', counts.affected_products,
      'activeCartsBlocked', (
        select count(distinct exposure_id)::integer from active_cart_facts
        where governed_price_id is null
          and product_mapping_present and commercial_profile_valid and price_type_valid
      ),
      'governedValueExposureByCurrency', coalesce((
        select jsonb_agg(jsonb_build_object('currency', currency, 'amount', amount) order by currency)
        from currency_exposure
      ), '[]'::jsonb)
    ),
    'catalogCoverage', jsonb_build_object(
      'publishedActiveProducts', catalog.active_products,
      'currentlyUsedPartnerPriceTypes', catalog.used_price_types,
      'potentialProductPriceTypePairs', catalog.active_products * catalog.used_price_types,
      'observedEligiblePairs', catalog.observed_eligible_pairs,
      'meaningfulBuyingContextPairs', catalog.meaningful_buying_context_pairs,
      'meaningfulMissingPairs', catalog.meaningful_missing_pairs,
      'theoreticalGapsTreatedAsIssues', false
    ),
    'issues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'companyId', issue.company_id,
        'companyName', issue.company_name,
        'productId', issue.product_id,
        'sku', issue.sku,
        'productName', issue.product_name,
        'governedPriceType', issue.price_type_name,
        'severity', 'high',
        'classification', case
          when sync.status = 'succeeded'
            and sync.last_successful_sync_at >= issue.exposure_at
            then 'source_gap_after_complete_sync'
          else 'unverified_projection_gap'
        end,
        'requiredAction', 'Create or restore the governed product price in 1C, then run the existing price synchronization.'
      ) order by issue.company_name, issue.sku)
      from active_cart_facts issue
      cross join latest_price_sync sync
      where issue.governed_price_id is null
        and issue.product_mapping_present
        and issue.commercial_profile_valid
        and issue.price_type_valid
    ), '[]'::jsonb)
  ) into result
  from active_cart_counts counts
  cross join active_order_capable_companies company_counts
  cross join catalog_counts catalog;

  return result;
end;
$$;

revoke all on function public.get_admin_governed_price_coverage()
  from public, anon;
grant execute on function public.get_admin_governed_price_coverage()
  to authenticated, service_role;

comment on function public.list_governed_price_coverage_candidates(integer) is
  'Bounded, set-based missing governed-price candidates from active carts first and recent commercial activity second; no fallback pricing.';
comment on function public.get_admin_governed_price_coverage() is
  'Permission-gated active-cart governed-price coverage and meaningful catalog context; global company_id NULL prices resolve by exact product and price type.';
comment on function private.governed_price_coverage_exposure_facts() is
  'Set-based internal buying-context facts for exact governed product and price-type coverage.';
comment on function private.governed_price_order_capable_companies() is
  'Internal set-based company scope with an effective orders.manage path.';

commit;
