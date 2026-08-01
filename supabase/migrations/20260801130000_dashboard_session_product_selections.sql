begin;

create table if not exists public.partner_dashboard_selection_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  login_generation_hash text not null,
  previous_product_ids uuid[] not null default '{}',
  previous_metrics jsonb not null default '{}'::jsonb,
  offer_product_ids uuid[] not null default '{}',
  previous_source_fingerprint text not null,
  offer_source_fingerprint text not null,
  rotation_bucket integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id, login_generation_hash),
  check (cardinality(previous_product_ids) <= 12),
  check (cardinality(offer_product_ids) <= 5),
  check (jsonb_typeof(previous_metrics) = 'object')
);

create index if not exists partner_dashboard_selection_expiry_idx
  on public.partner_dashboard_selection_snapshots(expires_at);
create index if not exists partner_dashboard_selection_user_company_idx
  on public.partner_dashboard_selection_snapshots(user_id, company_id, created_at desc);

alter table public.partner_dashboard_selection_snapshots enable row level security;
revoke all on public.partner_dashboard_selection_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.partner_dashboard_selection_snapshots to service_role;

create or replace function public.get_or_refresh_partner_dashboard_selections(
  p_user_id uuid,
  p_company_id uuid,
  p_login_generation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  snapshot public.partner_dashboard_selection_snapshots%rowtype;
  previous_fingerprint text;
  offer_fingerprint text;
  login_hash text;
  rotation integer;
  previous_ids uuid[] := '{}';
  offer_ids uuid[] := '{}';
  metrics jsonb := '{}'::jsonb;
  was_hit boolean := false;
begin
  if p_user_id is null or p_company_id is null
    or nullif(btrim(p_login_generation), '') is null
    or length(p_login_generation) > 100
    or not exists (
      select 1
      from public.company_memberships membership
      join public.partner_companies company on company.id = membership.company_id
      join public.user_profiles profile on profile.id = membership.user_id
      where membership.user_id = p_user_id
        and membership.company_id = p_company_id
        and membership.status = 'active'
        and company.status = 'active'
        and profile.status = 'active'
    )
  then
    raise exception 'Dashboard selection access denied.' using errcode = '42501';
  end if;

  login_hash := md5(p_user_id::text || ':' || p_company_id::text || ':' || p_login_generation);
  rotation := abs(hashtextextended(login_hash, 0) % 2147483647)::integer;

  select md5(concat_ws('|',
    coalesce(max(history.updated_at)::text, ''),
    count(distinct history.id)::text,
    coalesce(max(item.created_at)::text, ''),
    coalesce((select max(updated_at)::text from public.partner_orders where company_id = p_company_id), ''),
    coalesce((select max(updated_at)::text from public.catalog_products), ''),
    coalesce((select max(updated_at)::text from public.product_prices where is_published and is_active), ''),
    coalesce((select max(synced_at)::text from public.product_stock_totals where is_published), '')
  ))
  into previous_fingerprint
  from public.partner_order_history history
  left join public.partner_order_history_items item on item.order_history_id = history.id
  where history.company_id = p_company_id and history.partner_visible and not history.one_c_deletion_mark;

  select md5(concat_ws('|',
    coalesce(max(assignment.updated_at)::text, ''),
    count(*)::text,
    coalesce((select max(updated_at)::text from public.catalog_products), ''),
    coalesce((select max(updated_at)::text from public.product_prices where is_published and is_active), ''),
    coalesce((select max(synced_at)::text from public.product_stock_totals where is_published), '')
  ))
  into offer_fingerprint
  from public.product_merchandising_assignments assignment
  where assignment.is_active and assignment.is_curated_visible and assignment.revoked_at is null;

  select * into snapshot
  from public.partner_dashboard_selection_snapshots candidate
  where candidate.user_id = p_user_id
    and candidate.company_id = p_company_id
    and candidate.login_generation_hash = login_hash
    and candidate.expires_at > now()
    and candidate.previous_source_fingerprint = previous_fingerprint
    and candidate.offer_source_fingerprint = offer_fingerprint;

  if found then
    previous_ids := snapshot.previous_product_ids;
    offer_ids := snapshot.offer_product_ids;
    metrics := snapshot.previous_metrics;
    was_hit := true;
  else
    with purchase_events as (
      select
        item.product_id,
        'history:' || history.id::text as purchase_id,
        history.one_c_document_date as purchased_at,
        (history.one_c_posted or history.one_c_state_code = 'completed') as completed,
        item.quantity
      from public.partner_order_history history
      join public.partner_order_history_items item on item.order_history_id = history.id
      where history.company_id = p_company_id
        and history.partner_visible
        and not history.one_c_deletion_mark
        and item.product_id is not null
      union all
      select
        item.product_id,
        'portal:' || orders.id::text,
        coalesce(orders.external_1c_date, orders.confirmed_at, orders.updated_at),
        true,
        item.quantity
      from public.partner_orders orders
      join public.partner_order_items item on item.order_id = orders.id
      where orders.company_id = p_company_id
        and orders.integration_status = 'confirmed'
        and not exists (
          select 1 from public.partner_order_history history
          where history.portal_order_id = orders.id
        )
    ), ranked as (
      select
        event.product_id,
        count(distinct event.purchase_id)::integer as purchase_count,
        count(distinct event.purchase_id) filter (where event.completed)::integer as completed_count,
        max(event.purchased_at) as last_purchased_at,
        round(avg(event.quantity), 0) as typical_quantity,
        row_number() over (order by
          count(distinct event.purchase_id) desc,
          max(event.purchased_at) desc,
          count(distinct event.purchase_id) filter (where event.completed) desc,
          case when coalesce(stock.available_quantity, 0) > 0 or arrival.product_id is not null then 0 else 1 end,
          event.product_id
        ) as rank
      from purchase_events event
      join public.catalog_products product on product.id = event.product_id and product.is_active and product.is_visible
      left join public.product_stock_totals stock on stock.product_id = event.product_id and stock.is_published
      left join lateral (
        select candidate.product_id from public.product_supplier_arrivals candidate
        where candidate.product_id = event.product_id and candidate.is_published
          and candidate.expected_quantity > 0 and candidate.expected_arrival_date >= current_date
        limit 1
      ) arrival on true
      where exists (
        select 1 from public.product_prices price
        where price.product_id = event.product_id and price.is_active and price.is_published
          and price.price_amount > 0 and price.valid_from <= now()
          and (price.valid_to is null or price.valid_to >= now())
      )
      group by event.product_id, stock.available_quantity, arrival.product_id
    ), chosen as (
      select * from ranked where rank <= 12 order by rank
    )
    select
      coalesce(array_agg(product_id order by rank), '{}'),
      coalesce(jsonb_object_agg(product_id::text, jsonb_build_object(
        'purchaseCount', purchase_count,
        'completedPurchaseCount', completed_count,
        'lastPurchasedAt', last_purchased_at,
        'typicalQuantity', typical_quantity
      )), '{}'::jsonb)
    into previous_ids, metrics
    from chosen;

    with eligible as (
      select
        assignment.product_id,
        array_agg(distinct assignment.label_code::text order by assignment.label_code::text) as labels,
        max(assignment.priority) as priority,
        case when coalesce(stock.available_quantity, 0) > 0 or arrival.product_id is not null then 0 else 1 end as supply_rank,
        md5(assignment.product_id::text || ':' || rotation::text) as rotation_rank
      from public.product_merchandising_assignments assignment
      join public.catalog_products product on product.id = assignment.product_id and product.is_active and product.is_visible
      left join public.product_stock_totals stock on stock.product_id = assignment.product_id and stock.is_published
      left join lateral (
        select candidate.product_id from public.product_supplier_arrivals candidate
        where candidate.product_id = assignment.product_id and candidate.is_published
          and candidate.expected_quantity > 0 and candidate.expected_arrival_date >= current_date
        limit 1
      ) arrival on true
      where assignment.is_active and assignment.is_curated_visible and assignment.revoked_at is null
        and assignment.source in ('manual', 'one_c')
        and assignment.starts_at <= now() and (assignment.ends_at is null or assignment.ends_at > now())
        and exists (
          select 1 from public.product_prices price
          where price.product_id = assignment.product_id and price.is_active and price.is_published
            and price.price_amount > 0 and price.valid_from <= now()
            and (price.valid_to is null or price.valid_to >= now())
        )
      group by assignment.product_id, stock.available_quantity, arrival.product_id
    ), label_candidates as (
      select eligible.*, label.code,
        row_number() over (partition by label.code order by eligible.supply_rank, eligible.priority desc, eligible.rotation_rank, eligible.product_id) as label_rank
      from eligible
      cross join lateral unnest(eligible.labels) label(code)
      where label.code in ('HOT', 'NEW', 'TOP')
    ), required_products as (
      select product_id, min(case code when 'HOT' then 1 when 'NEW' then 2 else 3 end) as rank
      from label_candidates where label_rank = 1 group by product_id
    ), remaining as (
      select eligible.product_id,
        10 + row_number() over (order by eligible.supply_rank, eligible.priority desc, eligible.rotation_rank, eligible.product_id) as rank
      from eligible where not exists (select 1 from required_products required where required.product_id = eligible.product_id)
    ), combined as (
      select * from required_products union all select * from remaining
    )
    select coalesce(array_agg(product_id order by rank), '{}') into offer_ids
    from (select * from combined order by rank limit 5) selected;

    insert into public.partner_dashboard_selection_snapshots (
      user_id, company_id, login_generation_hash, previous_product_ids, previous_metrics,
      offer_product_ids, previous_source_fingerprint, offer_source_fingerprint,
      rotation_bucket, expires_at, updated_at
    ) values (
      p_user_id, p_company_id, login_hash, previous_ids, metrics,
      offer_ids, previous_fingerprint, offer_fingerprint,
      rotation, now() + interval '14 days', now()
    )
    on conflict (user_id, company_id, login_generation_hash) do update set
      previous_product_ids = excluded.previous_product_ids,
      previous_metrics = excluded.previous_metrics,
      offer_product_ids = excluded.offer_product_ids,
      previous_source_fingerprint = excluded.previous_source_fingerprint,
      offer_source_fingerprint = excluded.offer_source_fingerprint,
      rotation_bucket = excluded.rotation_bucket,
      expires_at = excluded.expires_at,
      updated_at = now()
    returning * into snapshot;

    delete from public.partner_dashboard_selection_snapshots stale
    where stale.user_id = p_user_id and stale.company_id = p_company_id
      and stale.id <> snapshot.id
      and (stale.expires_at <= now() or stale.created_at < now() - interval '14 days');
  end if;

  return jsonb_build_object(
    'snapshotHit', was_hit,
    'previousSourceFingerprint', previous_fingerprint,
    'offerSourceFingerprint', offer_fingerprint,
    'previousProducts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product.id, 'sku', product.sku, 'name', product.name, 'slug', product.slug,
        'imageUrl', coalesce(product.image_source_url, product.image_url, (
          select image.url from public.catalog_product_images image where image.product_id = product.id
          order by image.is_primary desc, image.sort_order, image.id limit 1
        )),
        'categoryId', product.category_id, 'categoryName', category.name, 'labelCodes', '[]'::jsonb,
        'purchaseCount', coalesce((metrics -> product.id::text ->> 'purchaseCount')::integer, 0),
        'completedPurchaseCount', coalesce((metrics -> product.id::text ->> 'completedPurchaseCount')::integer, 0),
        'lastPurchasedAt', metrics -> product.id::text ->> 'lastPurchasedAt',
        'typicalQuantity', coalesce((metrics -> product.id::text ->> 'typicalQuantity')::numeric, 1)
      ) order by selected.ordinality)
      from unnest(previous_ids) with ordinality selected(product_id, ordinality)
      join public.catalog_products product on product.id = selected.product_id and product.is_active and product.is_visible
      left join public.catalog_categories category on category.id = product.category_id
    ), '[]'::jsonb),
    'merchandisingProducts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', product.id, 'sku', product.sku, 'name', product.name, 'slug', product.slug,
        'imageUrl', coalesce(product.image_source_url, product.image_url, (
          select image.url from public.catalog_product_images image where image.product_id = product.id
          order by image.is_primary desc, image.sort_order, image.id limit 1
        )),
        'categoryId', product.category_id, 'categoryName', category.name,
        'labelCodes', coalesce((select jsonb_agg(label order by label) from (
          select distinct assignment.label_code::text as label
          from public.product_merchandising_assignments assignment
          where assignment.product_id = product.id and assignment.is_active and assignment.is_curated_visible
            and assignment.revoked_at is null and assignment.starts_at <= now()
            and (assignment.ends_at is null or assignment.ends_at > now())
          limit 2
        ) labels), '[]'::jsonb)
      ) order by selected.ordinality)
      from unnest(offer_ids) with ordinality selected(product_id, ordinality)
      join public.catalog_products product on product.id = selected.product_id and product.is_active and product.is_visible
      left join public.catalog_categories category on category.id = product.category_id
    ), '[]'::jsonb),
    'previousCandidateCount', cardinality(previous_ids),
    'offerCandidateCount', cardinality(offer_ids),
    'rotationBucket', rotation
  );
end;
$$;

revoke all on function public.get_or_refresh_partner_dashboard_selections(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_or_refresh_partner_dashboard_selections(uuid, uuid, text) to service_role;

comment on table public.partner_dashboard_selection_snapshots is
  'Bounded server-owned login-generation product selections. Stores product identities and safe reasons only; prices and stock remain live read models.';

do $$
declare
  constraint_definition text;
  function_definition text;
begin
  select pg_get_constraintdef(existing_constraint.oid) into constraint_definition
  from pg_constraint existing_constraint
  join pg_class relation on relation.oid = existing_constraint.conrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'partner_behavior_events'
    and existing_constraint.conname = 'partner_behavior_event_name_check';

  if constraint_definition is not null then
    execute 'alter table public.partner_behavior_events drop constraint partner_behavior_event_name_check';
    execute format(
      'alter table public.partner_behavior_events add constraint partner_behavior_event_name_check check ((%s) or event_name = any(array[''dashboard_previous_purchase_opened'',''dashboard_novotech_offer_opened'']))',
      substring(constraint_definition from 8 for char_length(constraint_definition) - 8)
    );
  end if;

  select pg_get_functiondef(procedure.oid) into function_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'record_partner_behavior_event'
  limit 1;

  if function_definition is not null
    and position('dashboard_previous_purchase_opened' in function_definition) = 0
  then
    function_definition := replace(
      function_definition,
      '''dashboard_offer_opened''',
      '''dashboard_offer_opened'', ''dashboard_previous_purchase_opened'', ''dashboard_novotech_offer_opened'''
    );
    execute function_definition;
  end if;
end;
$$;

commit;
