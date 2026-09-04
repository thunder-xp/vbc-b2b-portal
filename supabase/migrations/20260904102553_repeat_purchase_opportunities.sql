begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists private;

create or replace function private.partner_repeat_purchase_candidates(
  target_company_id uuid
)
returns table (
  product_id uuid,
  purchase_count integer,
  total_quantity numeric,
  last_purchased_at timestamptz,
  typical_quantity numeric,
  typical_interval_days numeric,
  latest_interval_days numeric,
  days_since_last_purchase numeric,
  interval_regularity numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with completed_order_products as materialized (
    select
      history.id as order_id,
      item.product_id,
      history.one_c_document_date as purchased_at,
      sum(item.quantity)::numeric as quantity
    from public.partner_order_history history
    join public.partner_order_history_items item
      on item.order_history_id = history.id
     and item.product_id is not null
     and item.quantity > 0
    where history.company_id = target_company_id
      and history.partner_visible
      and history.one_c_posted
      and not history.one_c_deletion_mark
      and history.one_c_state_code = 'completed'
      and history.origin_type <> 'internal_1c'
      and history.one_c_document_date <= now()
    group by history.id, item.product_id, history.one_c_document_date
  ), sequenced as (
    select
      purchase.*,
      extract(epoch from (
        purchase.purchased_at
        - lag(purchase.purchased_at) over (
          partition by purchase.product_id
          order by purchase.purchased_at, purchase.order_id
        )
      )) / 86400.0 as interval_days,
      row_number() over (
        partition by purchase.product_id
        order by purchase.purchased_at desc, purchase.order_id desc
      ) as recency_rank
    from completed_order_products purchase
  ), cadence as (
    select
      sequence.product_id,
      count(*)::integer as purchase_count,
      sum(sequence.quantity)::numeric as total_quantity,
      max(sequence.purchased_at) as last_purchased_at,
      percentile_disc(0.5) within group (order by sequence.quantity)::numeric
        as typical_quantity,
      percentile_disc(0.5) within group (order by sequence.interval_days)
        filter (where sequence.interval_days is not null)::numeric
        as typical_interval_days,
      max(sequence.interval_days) filter (where sequence.recency_rank = 1)::numeric
        as latest_interval_days
    from sequenced sequence
    group by sequence.product_id
    having count(*) >= 3
  ), regularity as (
    select
      cadence.*,
      count(sequence.interval_days) filter (
        where sequence.interval_days between
          cadence.typical_interval_days * 0.5
          and cadence.typical_interval_days * 1.5
      )::numeric / nullif(count(sequence.interval_days), 0)::numeric
        as interval_regularity,
      extract(epoch from (now() - cadence.last_purchased_at)) / 86400.0
        as days_since_last_purchase
    from cadence
    join sequenced sequence on sequence.product_id = cadence.product_id
    group by cadence.product_id, cadence.purchase_count, cadence.total_quantity,
      cadence.last_purchased_at, cadence.typical_quantity,
      cadence.typical_interval_days, cadence.latest_interval_days
  )
  select
    regularity.product_id,
    regularity.purchase_count,
    regularity.total_quantity,
    regularity.last_purchased_at,
    regularity.typical_quantity,
    round(regularity.typical_interval_days, 1),
    round(regularity.latest_interval_days, 1),
    round(regularity.days_since_last_purchase, 1),
    round(regularity.interval_regularity, 4)
  from regularity
  where regularity.typical_interval_days between 7 and 365
    and regularity.interval_regularity >= 0.60
    and regularity.days_since_last_purchase >= greatest(
      7,
      regularity.typical_interval_days * 0.85
    )
    and regularity.days_since_last_purchase <=
      regularity.typical_interval_days * 2
  order by regularity.days_since_last_purchase
    / nullif(regularity.typical_interval_days, 0) desc,
    regularity.purchase_count desc,
    regularity.product_id;
$$;

revoke all on function private.partner_repeat_purchase_candidates(uuid)
  from public, anon, authenticated;
grant execute on function private.partner_repeat_purchase_candidates(uuid)
  to service_role;

create or replace function private.refresh_partner_repeat_purchase_opportunities(
  target_company_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  active_repeat_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.partner_commercial_opportunities opportunity
  set status = 'resolved', resolved_at = now(), updated_at = now()
  where opportunity.company_id = target_company_id
    and opportunity.opportunity_type = 'repeat_purchase_available'
    and opportunity.status = 'active';

  with members as materialized (
    select membership.user_id
    from public.company_memberships membership
    join public.user_profiles profile
      on profile.id = membership.user_id and profile.status = 'active'
    join public.roles role
      on role.id = membership.role_id and role.scope = 'partner'
    where membership.company_id = target_company_id
      and membership.status = 'active'
      and public.notification_user_has_permission(
        membership.user_id,
        target_company_id,
        'opportunities.view'
      )
      and public.notification_user_has_permission(
        membership.user_id,
        target_company_id,
        'pricing.partner_price.view'
      )
      and public.notification_user_has_permission(
        membership.user_id,
        target_company_id,
        'stock.view'
      )
      and public.notification_user_has_permission(
        membership.user_id,
        target_company_id,
        'orders.manage'
      )
  ), eligible as materialized (
    select
      member.user_id,
      candidate.*,
      stock.available_quantity,
      stock.synced_at as stock_synced_at,
      greatest(
        70,
        least(
          88,
          70 + (candidate.purchase_count - 3) * 2
            + floor(candidate.interval_regularity * 10)::integer
        )
      ) as relevance_score
    from private.partner_repeat_purchase_candidates(target_company_id) candidate
    join public.partner_companies company
      on company.id = target_company_id
     and company.status = 'active'
     and company.commercial_profile_state = 'aligned'
     and nullif(btrim(company.external_1c_price_type_id), '') is not null
    join public.catalog_products product
      on product.id = candidate.product_id
     and product.is_active
     and product.is_visible
     and nullif(btrim(product.external_1c_id), '') is not null
    join public.price_types price_type
      on lower(price_type.external_ref) = lower(company.external_1c_price_type_id)
     and price_type.is_active
     and price_type.currency_status = 'resolved'
    join lateral (
      select price.id
      from public.product_prices price
      where price.product_id = candidate.product_id
        and lower(price.external_1c_price_type_id)
          = lower(company.external_1c_price_type_id)
        and (price.company_id is null or price.company_id = target_company_id)
        and price.is_active
        and price.is_published
        and price.currency_status = 'resolved'
        and price.price_amount > 0
        and price.valid_from <= now()
        and (price.valid_to is null or price.valid_to >= now())
        and price.synced_at >= now() - interval '36 hours'
      order by (price.company_id = target_company_id) desc,
        price.effective_at desc nulls last,
        price.synced_at desc,
        price.id
      limit 1
    ) governed_price on true
    join public.product_stock_totals stock
      on stock.product_id = candidate.product_id
     and stock.is_published
     and stock.freshness_state = 'authoritative'
     and stock.synced_at >= now() - interval '5 hours'
     and stock.available_quantity > 0
    cross join members member
    where not exists (
      select 1
      from public.carts cart
      join public.cart_items item
        on item.cart_id = cart.id
       and item.product_id = candidate.product_id
       and item.quantity > 0
      where cart.company_id = target_company_id
        and cart.created_by = member.user_id
        and cart.status in ('active', 'submitting')
    )
      and not exists (
        select 1
        from public.partner_commercial_opportunities existing
        where existing.company_id = target_company_id
          and existing.recipient_user_id = member.user_id
          and existing.product_id = candidate.product_id
          and existing.opportunity_type <> 'repeat_purchase_available'
          and existing.status = 'active'
          and existing.expires_at > now()
      )
  ), prepared as (
    select
      eligible.*,
      encode(
        extensions.digest(
          concat_ws(
            '|',
            target_company_id::text,
            eligible.user_id::text,
            'repeat_purchase_available',
            eligible.product_id::text
          ),
          'sha256'
        ),
        'hex'
      ) as fingerprint
    from eligible
  )
  insert into public.partner_commercial_opportunities (
    company_id,
    recipient_user_id,
    product_id,
    source_entity_type,
    source_entity_id,
    opportunity_type,
    status,
    priority,
    relevance_score,
    reason_code,
    safe_reason_metadata,
    secondary_reason_codes,
    commercial_state_fingerprint,
    expires_at
  )
  select
    target_company_id,
    prepared.user_id,
    prepared.product_id,
    'product',
    prepared.product_id,
    'repeat_purchase_available',
    'active',
    90,
    prepared.relevance_score,
    'repeat_purchase',
    jsonb_build_object(
      'purchaseCount', prepared.purchase_count,
      'totalQuantity', prepared.total_quantity,
      'lastPurchasedAt', prepared.last_purchased_at,
      'typicalQuantity', prepared.typical_quantity,
      'typicalIntervalDays', prepared.typical_interval_days,
      'latestIntervalDays', prepared.latest_interval_days,
      'daysSinceLastPurchase', prepared.days_since_last_purchase,
      'availableQuantity', prepared.available_quantity,
      'stockSyncedAt', prepared.stock_synced_at
    ),
    array[]::text[],
    prepared.fingerprint,
    prepared.last_purchased_at
      + make_interval(days => ceil(prepared.typical_interval_days * 2)::integer)
  from prepared
  on conflict (recipient_user_id, commercial_state_fingerprint) do update set
    status = 'active',
    priority = excluded.priority,
    relevance_score = excluded.relevance_score,
    reason_code = excluded.reason_code,
    safe_reason_metadata = excluded.safe_reason_metadata,
    secondary_reason_codes = excluded.secondary_reason_codes,
    last_confirmed_at = now(),
    expires_at = excluded.expires_at,
    resolved_at = null,
    updated_at = now();

  select count(*)::integer
  into active_repeat_count
  from public.partner_commercial_opportunities opportunity
  where opportunity.company_id = target_company_id
    and opportunity.opportunity_type = 'repeat_purchase_available'
    and opportunity.status = 'active'
    and opportunity.expires_at > now();

  return active_repeat_count;
end;
$$;

revoke all on function private.refresh_partner_repeat_purchase_opportunities(uuid)
  from public, anon, authenticated;
grant execute on function private.refresh_partner_repeat_purchase_opportunities(uuid)
  to service_role;

alter function public.refresh_partner_commercial_opportunities(uuid)
  rename to refresh_partner_commercial_opportunities_base;

revoke all on function public.refresh_partner_commercial_opportunities_base(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_partner_commercial_opportunities_base(uuid)
  to service_role;

create function public.refresh_partner_commercial_opportunities(
  target_company_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  active_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform public.refresh_partner_commercial_opportunities_base(target_company_id);
  perform private.refresh_partner_repeat_purchase_opportunities(target_company_id);

  select count(*)::integer
  into active_count
  from public.partner_commercial_opportunities opportunity
  where opportunity.company_id = target_company_id
    and opportunity.status = 'active'
    and opportunity.expires_at > now();

  return active_count;
end;
$$;

revoke all on function public.refresh_partner_commercial_opportunities(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_partner_commercial_opportunities(uuid)
  to service_role;

create or replace function public.list_partner_commercial_opportunities(
  target_company_id uuid,
  target_filter text default 'all',
  target_limit integer default 24,
  target_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  result jsonb;
  actor uuid := auth.uid();
  can_partner boolean;
  can_retail boolean;
  can_stock boolean;
begin
  if actor is null
    or not public.has_permission(target_company_id, 'opportunities.view') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if target_filter not in (
      'all', 'available', 'arrivals', 'price', 'templates', 'offers'
    )
    or target_limit not between 1 and 50
    or target_offset < 0 then
    raise exception 'Invalid query' using errcode = '22023';
  end if;

  can_partner := public.has_permission(
    target_company_id,
    'pricing.partner_price.view'
  );
  can_retail := public.has_permission(
    target_company_id,
    'pricing.retail_price.view'
  );
  can_stock := public.has_permission(target_company_id, 'stock.view');

  with filtered as (
    select opportunity.*
    from public.partner_commercial_opportunities opportunity
    where opportunity.company_id = target_company_id
      and opportunity.recipient_user_id = actor
      and opportunity.status = 'active'
      and opportunity.expires_at > now()
      and not exists (
        select 1
        from public.partner_commercial_opportunity_dismissals dismissal
        where dismissal.recipient_user_id = actor
          and dismissal.commercial_state_fingerprint
            = opportunity.commercial_state_fingerprint
      )
      and (
        target_filter = 'all'
        or target_filter = 'available'
          and opportunity.opportunity_type in (
            'repeat_purchase_available',
            'watched_product_back_in_stock',
            'relevant_product_low_stock'
          )
        or target_filter = 'arrivals'
          and opportunity.opportunity_type = 'relevant_product_arrival_confirmed'
        or target_filter = 'price'
          and opportunity.opportunity_type = 'relevant_product_price_decreased'
        or target_filter = 'templates'
          and opportunity.opportunity_type in (
            'purchase_template_ready',
            'previous_order_repeatable'
          )
        or target_filter = 'offers'
          and opportunity.opportunity_type = 'relevant_merchandising_offer'
      )
  ), page as (
    select filtered.*, count(*) over () as total_count
    from filtered
    order by priority, relevance_score desc, last_confirmed_at desc, id
    limit target_limit offset target_offset
  )
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', page.id,
          'type', page.opportunity_type,
          'priority', page.priority,
          'reasonCode', page.reason_code,
          'reasonMetadata', page.safe_reason_metadata,
          'secondaryReasons', page.secondary_reason_codes,
          'fingerprint', page.commercial_state_fingerprint,
          'firstDetectedAt', page.first_detected_at,
          'lastConfirmedAt', page.last_confirmed_at,
          'sourceType', page.source_entity_type,
          'sourceId', page.source_entity_id,
          'product', case
            when product.id is null then null
            else jsonb_build_object(
              'id', product.id,
              'sku', product.sku,
              'name', product.name,
              'slug', product.slug,
              'imageUrl', product.image_url,
              'categoryName', category.name,
              'partnerPrice', case when can_partner then partner_price.value else null end,
              'retailPrice', case when can_retail then retail_price.value else null end,
              'availableQuantity', case
                when not can_stock then null
                when page.opportunity_type = 'repeat_purchase_available'
                  and (
                    stock.freshness_state <> 'authoritative'
                    or stock.synced_at < now() - interval '5 hours'
                  ) then null
                else stock.available_quantity
              end,
              'expectedArrivalDate', case when can_stock then arrival.expected_arrival_date else null end,
              'expectedArrivalQuantity', case when can_stock then arrival.expected_quantity else null end,
              'alreadyInCart', current_cart_item.id is not null
            )
          end,
          'template', case
            when template.id is null then null
            else jsonb_build_object('id', template.id, 'name', template.name)
          end
        )
        order by page.priority, page.relevance_score desc,
          page.last_confirmed_at desc
      ),
      '[]'::jsonb
    ),
    'totalCount', coalesce(max(page.total_count), 0)
  )
  into result
  from page
  left join public.catalog_products product
    on product.id = page.product_id
   and product.is_active
   and product.is_visible
  left join public.catalog_categories category
    on category.id = product.category_id
  left join public.purchase_templates template
    on template.id = page.template_id
   and public.can_view_purchase_template(template)
  left join public.product_stock_totals stock
    on stock.product_id = product.id
   and stock.is_published
  left join public.carts current_cart
    on current_cart.company_id = target_company_id
   and current_cart.created_by = actor
   and current_cart.status in ('active', 'submitting')
  left join public.cart_items current_cart_item
    on current_cart_item.cart_id = current_cart.id
   and current_cart_item.product_id = product.id
   and current_cart_item.quantity > 0
  left join lateral (
    select
      value.expected_arrival_date,
      sum(value.expected_quantity)::numeric as expected_quantity
    from public.product_supplier_arrivals value
    where value.product_id = product.id
      and value.is_published
      and value.expected_arrival_date >= current_date
    group by value.expected_arrival_date
    order by value.expected_arrival_date
    limit 1
  ) arrival on true
  left join lateral (
    select jsonb_build_object(
      'amount', price.price_amount,
      'currency', price.currency
    ) as value
    from public.product_prices price
    join public.partner_companies company
      on company.id = target_company_id
     and company.status = 'active'
     and company.commercial_profile_state = 'aligned'
    join public.price_types price_type
      on lower(price_type.external_ref)
       = lower(company.external_1c_price_type_id)
     and price_type.is_active
     and price_type.currency_status = 'resolved'
    where price.product_id = product.id
      and lower(price.external_1c_price_type_id)
        = lower(company.external_1c_price_type_id)
      and (price.company_id is null or price.company_id = target_company_id)
      and price.is_active
      and price.is_published
      and price.currency_status = 'resolved'
      and price.price_amount > 0
      and price.valid_from <= now()
      and (price.valid_to is null or price.valid_to >= now())
      and price.synced_at >= now() - interval '36 hours'
    order by (price.company_id = target_company_id) desc,
      price.effective_at desc nulls last,
      price.synced_at desc,
      price.id
    limit 1
  ) partner_price on true
  left join lateral (
    select jsonb_build_object(
      'amount', price.price_amount,
      'currency', price.currency
    ) as value
    from public.product_prices price
    join public.price_types price_type on price_type.id = price.price_type_id
    where price.product_id = product.id
      and price_type.external_code = 'UU-000020'
      and price.is_active
      and price.is_published
      and price.currency_status = 'resolved'
      and price.price_amount > 0
      and price.valid_from <= now()
      and (price.valid_to is null or price.valid_to >= now())
    order by price.effective_at desc nulls last, price.id
    limit 1
  ) retail_price on true;

  return coalesce(
    result,
    jsonb_build_object('items', '[]'::jsonb, 'totalCount', 0)
  );
end;
$$;

revoke all on function public.list_partner_commercial_opportunities(
  uuid,
  text,
  integer,
  integer
) from public, anon;
grant execute on function public.list_partner_commercial_opportunities(
  uuid,
  text,
  integer,
  integer
) to authenticated;

comment on function private.partner_repeat_purchase_candidates(uuid) is
  'Derives due high-confidence repeat demand from completed, partner-visible 1C order history. No request-path or live-1C work.';
comment on function private.refresh_partner_repeat_purchase_opportunities(uuid) is
  'Projects actionable repeat demand only when current governed partner price, fresh authoritative stock, permissions, and empty-cart conditions pass.';
comment on function public.refresh_partner_commercial_opportunities(uuid) is
  'Refreshes the existing commercial opportunity projection, then replaces broad repeat signals with deterministic high-confidence candidates.';

insert into public.partner_commercial_opportunity_dirty_companies(company_id, reason)
select distinct membership.company_id, 'repeat_purchase_policy_v1'
from public.company_memberships membership
join public.partner_companies company
  on company.id = membership.company_id and company.status = 'active'
join public.roles role
  on role.id = membership.role_id and role.scope = 'partner'
where membership.status = 'active'
on conflict (company_id) do update set
  reason = excluded.reason,
  last_dirtied_at = now(),
  locked_at = null;

commit;
