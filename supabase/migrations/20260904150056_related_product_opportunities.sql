begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.partner_commercial_opportunities
  drop constraint partner_commercial_opportunities_type_check;
alter table public.partner_commercial_opportunities
  add constraint partner_commercial_opportunities_type_check check (
    opportunity_type in (
      'repeat_purchase_available',
      'watched_product_back_in_stock',
      'relevant_product_arrival_confirmed',
      'relevant_product_price_decreased',
      'purchase_template_ready',
      'previous_order_repeatable',
      'relevant_merchandising_offer',
      'relevant_product_low_stock',
      'source_product_low_stock_with_available_analog',
      'related_product'
    )
  );

create or replace function private.partner_related_product_candidates(
  target_company_id uuid
)
returns table (
  relation_id uuid,
  source_product_id uuid,
  target_product_id uuid,
  source_purchase_count integer,
  relation_source_order_count integer,
  relation_target_order_count integer,
  relation_coorder_count integer,
  relation_company_count integer,
  relation_confidence numeric,
  relation_lift numeric
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  with reliable_orders as materialized (
    select
      history.id,
      history.company_id,
      history.one_c_document_date
    from public.partner_order_history history
    join public.partner_companies company
      on company.id = history.company_id
     and company.status = 'active'
     and company.commercial_profile_state = 'aligned'
    where history.partner_visible
      and history.one_c_posted
      and not history.one_c_deletion_mark
      and history.one_c_state_code = 'completed'
      and history.origin_type <> 'internal_1c'
      and history.one_c_document_date <= now()
      and exists (
        select 1
        from public.company_memberships membership
        join public.roles role
          on role.id = membership.role_id
         and role.scope = 'partner'
        where membership.company_id = history.company_id
          and membership.status = 'active'
      )
  ), order_products as materialized (
    select distinct
      reliable.id as order_id,
      reliable.company_id,
      reliable.one_c_document_date,
      item.product_id
    from reliable_orders reliable
    join public.partner_order_history_items item
      on item.order_history_id = reliable.id
    where item.product_id is not null
  ), company_sources as materialized (
    select
      order_product.product_id,
      count(distinct order_product.order_id)::integer as purchase_count
    from order_products order_product
    where order_product.company_id = target_company_id
    group by order_product.product_id
    having count(distinct order_product.order_id) >= 3
  ), eligible_relations as materialized (
    select
      relation.id,
      relation.source_product_id,
      relation.target_product_id,
      company_source.purchase_count
    from public.product_relations relation
    join company_sources company_source
      on company_source.product_id = relation.source_product_id
    join public.catalog_products source_product
      on source_product.id = relation.source_product_id
     and source_product.is_active
     and source_product.is_visible
     and nullif(btrim(source_product.external_1c_id), '') is not null
    join public.catalog_products target_product
      on target_product.id = relation.target_product_id
     and target_product.is_active
     and target_product.is_visible
     and nullif(btrim(target_product.external_1c_id), '') is not null
    where relation.relation_type = 'related'
      and relation.is_active
      and relation.source_product_id <> relation.target_product_id
      -- A complementary target must cross a governed product category. This
      -- removes the three proven accessory-to-accessory substitute signals
      -- without naming a category, SKU, product, or relation identifier.
      and source_product.category_id is distinct from target_product.category_id
      and not exists (
        select 1
        from public.product_relations analogue
        where analogue.is_active
          and analogue.relation_type = 'analog'
          and (
            (
              analogue.source_product_id = relation.source_product_id
              and analogue.target_product_id = relation.target_product_id
            )
            or (
              analogue.source_product_id = relation.target_product_id
              and analogue.target_product_id = relation.source_product_id
            )
          )
      )
  ), product_order_counts as materialized (
    select
      order_product.product_id,
      count(*)::integer as order_count
    from order_products order_product
    where order_product.product_id in (
      select eligible.source_product_id from eligible_relations eligible
      union
      select eligible.target_product_id from eligible_relations eligible
    )
    group by order_product.product_id
  ), relation_evidence as materialized (
    select
      relation.id as relation_id,
      relation.source_product_id,
      relation.target_product_id,
      relation.purchase_count as source_purchase_count,
      source_count.order_count as relation_source_order_count,
      target_count.order_count as relation_target_order_count,
      count(*)::integer as relation_coorder_count,
      count(distinct source_order.company_id)::integer
        as relation_company_count,
      count(*)::numeric / source_count.order_count::numeric
        as relation_confidence,
      count(*)::numeric
        * (select count(*) from reliable_orders)::numeric
        / (
          source_count.order_count::numeric
          * target_count.order_count::numeric
        ) as relation_lift
    from eligible_relations relation
    join product_order_counts source_count
      on source_count.product_id = relation.source_product_id
    join product_order_counts target_count
      on target_count.product_id = relation.target_product_id
    join order_products source_order
      on source_order.product_id = relation.source_product_id
    join order_products target_order
      on target_order.order_id = source_order.order_id
     and target_order.product_id = relation.target_product_id
    group by
      relation.id,
      relation.source_product_id,
      relation.target_product_id,
      relation.purchase_count,
      source_count.order_count,
      target_count.order_count
    having count(*) >= 2
      and count(distinct source_order.company_id) >= 2
      and count(*)::numeric
        * (select count(*) from reliable_orders)::numeric
        / (
          source_count.order_count::numeric
          * target_count.order_count::numeric
        ) > 1
  ), ranked as (
    select
      evidence.*,
      row_number() over (
        partition by evidence.target_product_id
        order by
          evidence.source_purchase_count desc,
          evidence.relation_coorder_count desc,
          evidence.relation_confidence desc,
          evidence.relation_lift desc,
          evidence.source_product_id,
          evidence.relation_id
      ) as explanation_rank
    from relation_evidence evidence
  )
  select
    ranked.relation_id,
    ranked.source_product_id,
    ranked.target_product_id,
    ranked.source_purchase_count,
    ranked.relation_source_order_count,
    ranked.relation_target_order_count,
    ranked.relation_coorder_count,
    ranked.relation_company_count,
    ranked.relation_confidence,
    ranked.relation_lift
  from ranked
  where ranked.explanation_rank = 1
  order by ranked.target_product_id;
end;
$$;

revoke all on function private.partner_related_product_candidates(uuid)
  from public, anon, authenticated;
grant execute on function private.partner_related_product_candidates(uuid)
  to service_role;

create or replace function private.refresh_partner_related_product_opportunities(
  target_company_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  active_related_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.partner_commercial_opportunities opportunity
  set status = 'resolved',
      resolved_at = now(),
      updated_at = now()
  where opportunity.company_id = target_company_id
    and opportunity.opportunity_type = 'related_product'
    and opportunity.status = 'active';

  with members as materialized (
    select membership.user_id
    from public.company_memberships membership
    join public.user_profiles profile
      on profile.id = membership.user_id
     and profile.status = 'active'
    join public.roles role
      on role.id = membership.role_id
     and role.scope = 'partner'
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
        'catalog.view'
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
      source_product.sku as source_sku,
      source_product.name as source_name,
      stock.available_quantity,
      stock.synced_at as stock_synced_at,
      governed_price.price_amount,
      governed_price.currency as price_currency,
      governed_price.synced_at as price_synced_at,
      least(
        100,
        60
          + least(candidate.source_purchase_count, 20)
          + least(candidate.relation_coorder_count, 20)
      )::integer as relevance_score
    from private.partner_related_product_candidates(target_company_id) candidate
    join public.partner_companies company
      on company.id = target_company_id
     and company.status = 'active'
     and company.commercial_profile_state = 'aligned'
     and nullif(btrim(company.external_1c_price_type_id), '') is not null
    join public.catalog_products source_product
      on source_product.id = candidate.source_product_id
     and source_product.is_active
     and source_product.is_visible
     and nullif(btrim(source_product.external_1c_id), '') is not null
    join public.catalog_products target_product
      on target_product.id = candidate.target_product_id
     and target_product.is_active
     and target_product.is_visible
     and nullif(btrim(target_product.external_1c_id), '') is not null
    join public.price_types price_type
      on lower(price_type.external_ref)
        = lower(company.external_1c_price_type_id)
     and price_type.is_active
     and price_type.currency_status = 'resolved'
    join lateral (
      select
        price.price_amount,
        price.currency,
        price.synced_at
      from public.product_prices price
      where price.product_id = candidate.target_product_id
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
      order by
        (price.company_id = target_company_id) desc,
        price.effective_at desc nulls last,
        price.synced_at desc,
        price.id
      limit 1
    ) governed_price on true
    join public.product_stock_totals stock
      on stock.product_id = candidate.target_product_id
     and stock.is_published
     and stock.freshness_state = 'authoritative'
     and stock.synced_at >= now() - interval '24 hours'
     and stock.available_quantity > 0
    cross join members member
    where not exists (
      select 1
      from public.partner_order_history recent_history
      join public.partner_order_history_items recent_item
        on recent_item.order_history_id = recent_history.id
       and recent_item.product_id = candidate.target_product_id
      where recent_history.company_id = target_company_id
        and recent_history.partner_visible
        and recent_history.one_c_posted
        and not recent_history.one_c_deletion_mark
        and recent_history.one_c_state_code = 'completed'
        and recent_history.origin_type <> 'internal_1c'
        and recent_history.one_c_document_date <= now()
        and recent_history.one_c_document_date >= now() - interval '90 days'
    )
      and not exists (
        select 1
        from public.carts cart
        join public.cart_items item
          on item.cart_id = cart.id
         and item.product_id = candidate.target_product_id
         and item.quantity > 0
        where cart.company_id = target_company_id
          and cart.created_by = member.user_id
          and cart.status in ('active', 'submitting')
      )
      and not exists (
        select 1
        from public.estimate_versions version
        join public.estimates estimate
          on estimate.id = version.estimate_id
         and estimate.company_id = target_company_id
         and estimate.status <> 'archived'
         and estimate.archived_at is null
         and estimate.deleted_at is null
        cross join lateral jsonb_array_elements(
          coalesce(version.snapshot -> 'items', '[]'::jsonb)
        ) line
        where line ->> 'line_type' = 'product'
          and line ->> 'product_id' = candidate.target_product_id::text
          and (
            (
              version.status = 'prepared'
              and estimate.lifecycle_status = 'draft'
              and exists (
                select 1
                from public.generated_estimate_documents document
                where document.version_id = version.id
                  and document.status = 'ready'
              )
            )
            or (
              version.status = 'sent'
              and estimate.lifecycle_status in ('sent', 'expired')
            )
            or (
              version.status = 'accepted'
              and estimate.lifecycle_status = 'accepted'
              and estimate.accepted_version_id = version.id
            )
          )
      )
      and not exists (
        select 1
        from public.partner_commercial_opportunities existing
        where existing.company_id = target_company_id
          and existing.recipient_user_id = member.user_id
          and existing.product_id = candidate.target_product_id
          and existing.opportunity_type <> 'related_product'
          and existing.status = 'active'
          and existing.expires_at > now()
          and (
            existing.priority < 55
            or existing.opportunity_type = 'repeat_purchase_available'
          )
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
            'related_product',
            eligible.target_product_id::text
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
    prepared.target_product_id,
    'product_relation',
    prepared.source_product_id,
    'related_product',
    'active',
    55,
    prepared.relevance_score,
    'related_to_regular_purchase',
    jsonb_build_object(
      'sourceProductId', prepared.source_product_id,
      'sourceProductSku', prepared.source_sku,
      'sourceProductName', prepared.source_name,
      'sourcePurchaseCount', prepared.source_purchase_count,
      'relationCoOrderCount', prepared.relation_coorder_count,
      'relationCompanyCount', prepared.relation_company_count,
      'relationConfidencePercent', round(
        prepared.relation_confidence * 100,
        2
      ),
      'relationLift', round(prepared.relation_lift, 3),
      'partnerPrice', prepared.price_amount,
      'priceCurrency', prepared.price_currency,
      'priceSyncedAt', prepared.price_synced_at,
      'availableQuantity', prepared.available_quantity,
      'stockSyncedAt', prepared.stock_synced_at
    ),
    array[]::text[],
    prepared.fingerprint,
    now() + interval '48 hours'
  from prepared
  on conflict (recipient_user_id, commercial_state_fingerprint) do update set
    product_id = excluded.product_id,
    source_entity_type = excluded.source_entity_type,
    source_entity_id = excluded.source_entity_id,
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
  into active_related_count
  from public.partner_commercial_opportunities opportunity
  where opportunity.company_id = target_company_id
    and opportunity.opportunity_type = 'related_product'
    and opportunity.status = 'active'
    and opportunity.expires_at > now();

  return active_related_count;
end;
$$;

revoke all on function private.refresh_partner_related_product_opportunities(uuid)
  from public, anon, authenticated;
grant execute on function private.refresh_partner_related_product_opportunities(uuid)
  to service_role;

alter function public.refresh_partner_commercial_opportunities(uuid)
  rename to refresh_partner_opportunities_before_related;

revoke all on function public.refresh_partner_opportunities_before_related(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_partner_opportunities_before_related(uuid)
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

  perform public.refresh_partner_opportunities_before_related(
    target_company_id
  );
  perform private.refresh_partner_related_product_opportunities(
    target_company_id
  );

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
            'related_product',
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
      and (
        opportunity.opportunity_type <> 'related_product'
        or (
          can_partner
          and can_stock
          and public.has_permission(target_company_id, 'catalog.view')
          and public.has_permission(target_company_id, 'orders.manage')
          and exists (
            select 1
            from public.catalog_products current_product
            where current_product.id = opportunity.product_id
              and current_product.is_active
              and current_product.is_visible
              and nullif(btrim(current_product.external_1c_id), '') is not null
          )
          and exists (
            select 1
            from public.product_stock_totals current_stock
            where current_stock.product_id = opportunity.product_id
              and current_stock.is_published
              and current_stock.freshness_state = 'authoritative'
              and current_stock.synced_at >= now() - interval '24 hours'
              and current_stock.available_quantity > 0
          )
          and exists (
            select 1
            from public.partner_companies current_company
            join public.price_types current_price_type
              on lower(current_price_type.external_ref)
                = lower(current_company.external_1c_price_type_id)
             and current_price_type.is_active
             and current_price_type.currency_status = 'resolved'
            join public.product_prices current_price
              on current_price.product_id = opportunity.product_id
             and lower(current_price.external_1c_price_type_id)
                = lower(current_company.external_1c_price_type_id)
             and (
               current_price.company_id is null
               or current_price.company_id = target_company_id
             )
             and current_price.is_active
             and current_price.is_published
             and current_price.currency_status = 'resolved'
             and current_price.price_amount > 0
             and current_price.valid_from <= now()
             and (
               current_price.valid_to is null
               or current_price.valid_to >= now()
             )
             and current_price.synced_at >= now() - interval '36 hours'
            where current_company.id = target_company_id
              and current_company.status = 'active'
              and current_company.commercial_profile_state = 'aligned'
          )
          and not exists (
            select 1
            from public.carts current_cart
            join public.cart_items current_item
              on current_item.cart_id = current_cart.id
             and current_item.product_id = opportunity.product_id
             and current_item.quantity > 0
            where current_cart.company_id = target_company_id
              and current_cart.created_by = actor
              and current_cart.status in ('active', 'submitting')
          )
        )
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
              'partnerPrice', case
                when can_partner then partner_price.value
                else null
              end,
              'retailPrice', case when can_retail then retail_price.value else null end,
              'availableQuantity', case
                when not can_stock then null
                when page.opportunity_type in (
                    'repeat_purchase_available',
                    'related_product'
                  )
                  and (
                    stock.freshness_state <> 'authoritative'
                    or stock.synced_at < now() - interval '24 hours'
                  ) then null
                else stock.available_quantity
              end,
              'expectedArrivalDate', case
                when can_stock then arrival.expected_arrival_date
                else null
              end,
              'expectedArrivalQuantity', case
                when can_stock then arrival.expected_quantity
                else null
              end,
              'alreadyInCart', current_cart_item.id is not null
            )
          end,
          'template', case
            when template.id is null then null
            else jsonb_build_object('id', template.id, 'name', template.name)
          end
        )
        order by
          page.priority,
          page.relevance_score desc,
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
    order by
      (price.company_id = target_company_id) desc,
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
    join public.price_types price_type
      on price_type.id = price.price_type_id
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

comment on function private.partner_related_product_candidates(uuid) is
  'Derives one directional RELATED target per company and target from reliable completed order evidence. Excludes same-category and governed analogue substitute semantics.';
comment on function private.refresh_partner_related_product_opportunities(uuid) is
  'Projects currently sellable RELATED_PRODUCT opportunities with partner permissions, current assigned price, authoritative daily stock, recent-purchase, cart, Estimate workflow, and stronger-opportunity suppression.';
comment on function public.refresh_partner_commercial_opportunities(uuid) is
  'Refreshes the existing commercial opportunity projection, high-confidence repeat demand, and high-confidence directional related-product cross-sell demand.';

insert into public.partner_commercial_opportunity_dirty_companies(
  company_id,
  reason
)
select distinct membership.company_id, 'related_product_policy_v1'
from public.company_memberships membership
join public.partner_companies company
  on company.id = membership.company_id
 and company.status = 'active'
join public.roles role
  on role.id = membership.role_id
 and role.scope = 'partner'
where membership.status = 'active'
on conflict (company_id) do update set
  reason = excluded.reason,
  last_dirtied_at = now(),
  locked_at = null;

commit;
