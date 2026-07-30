begin;

create or replace function public.process_partner_product_transitions(
  p_source_sync_id uuid default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  run_id uuid;
  worker_started_at timestamptz := clock_timestamp();
  normalized_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  transition_count integer := 0;
  recipient_count integer := 0;
  created_count integer := 0;
  suppressed_count integer := 0;
  deduplicated_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'PRODUCT_NOTIFICATION_PERMISSION_DENIED' using errcode = '42501';
  end if;

  insert into public.partner_product_notification_projection_runs(
    status, source_sync_id
  ) values ('running', p_source_sync_id)
  returning id into run_id;

  if not pg_try_advisory_xact_lock(hashtext('partner_product_notification_projection')) then
    update public.partner_product_notification_projection_runs
    set status = 'locked', finished_at = now(), duration_ms = 0
    where id = run_id;
    return jsonb_build_object('runId', run_id, 'status', 'locked');
  end if;

  begin
    create temporary table product_transition_batch on commit drop as
    select transition.*
    from public.partner_product_transition_events transition
    where transition.processing_status in ('pending', 'failed')
      and transition.processing_attempts < 5
      and (p_source_sync_id is null or transition.source_sync_id = p_source_sync_id)
    order by transition.occurred_at, transition.id
    limit normalized_limit
    for update skip locked;

    select count(*)::integer into transition_count
    from product_transition_batch;

    update public.partner_product_transition_events transition
    set processing_status = 'processing',
        processing_attempts = transition.processing_attempts + 1,
        safe_error_code = null
    where transition.id in (select id from product_transition_batch);

    create temporary table product_notification_candidates on commit drop as
    with list_watchers as (
      select item.product_id, list.company_id, list.created_by as user_id,
        false as has_cart,
        bool_or(list.is_system_favorites) as has_favorite,
        bool_or(not list.is_system_favorites) as has_list,
        null::uuid as cart_id
      from public.purchasing_list_items item
      join public.purchasing_lists list on list.id = item.list_id
      where list.archived_at is null
        and item.product_id in (select product_id from product_transition_batch)
      group by item.product_id, list.company_id, list.created_by
    ),
    cart_watchers as (
      select item.product_id, cart.company_id, cart.created_by as user_id,
        true as has_cart, false as has_favorite, false as has_list,
        min(cart.id) as cart_id
      from public.cart_items item
      join public.carts cart on cart.id = item.cart_id
      where cart.status = 'active'
        and item.product_id in (select product_id from product_transition_batch)
      group by item.product_id, cart.company_id, cart.created_by
    ),
    watcher_sources as (
      select * from list_watchers
      union all
      select * from cart_watchers
    ),
    watchers as (
      select source.product_id, source.company_id, source.user_id,
        bool_or(source.has_cart) as has_cart,
        bool_or(source.has_favorite) as has_favorite,
        bool_or(source.has_list) as has_list,
        min(source.cart_id) as cart_id
      from watcher_sources source
      group by source.product_id, source.company_id, source.user_id
    ),
    eligible as (
      select transition.id as transition_id,
        transition.transition_type,
        transition.previous_state_safe,
        transition.new_state_safe,
        transition.source_sync_id,
        transition.source_version,
        transition.occurred_at,
        transition.external_price_type_ref,
        watchers.product_id,
        watchers.company_id,
        watchers.user_id,
        watchers.has_cart,
        watchers.has_favorite,
        watchers.has_list,
        watchers.cart_id,
        product.sku,
        product.name,
        product.slug,
        company.external_1c_price_type_id
      from product_transition_batch transition
      join watchers on watchers.product_id = transition.product_id
      join public.catalog_products product
        on product.id = watchers.product_id
       and product.is_active and product.is_visible
      join public.partner_companies company
        on company.id = watchers.company_id and company.status = 'active'
      join public.company_memberships membership
        on membership.company_id = watchers.company_id
       and membership.user_id = watchers.user_id
       and membership.status = 'active'
      join public.user_profiles profile
        on profile.id = watchers.user_id and profile.status = 'active'
      where transition.transition_type <> 'price_changed'
        or (
          public.notification_user_has_permission(
            watchers.user_id, watchers.company_id, 'pricing.partner_price.view'
          )
          and transition.external_price_type_ref =
            company.external_1c_price_type_id
        )
        or (
          not public.notification_user_has_permission(
            watchers.user_id, watchers.company_id, 'pricing.partner_price.view'
          )
          and transition.external_price_type_ref =
            'e181c772-93fc-11e9-94cb-000c29cf9dd4'
        )
    ),
    classified as (
      select eligible.*,
        case
          when eligible.has_cart and eligible.transition_type = 'price_changed'
            then 'cart_product_price_changed'
          when eligible.has_cart and eligible.transition_type = 'availability_changed'
            then 'cart_product_availability_changed'
          when eligible.transition_type = 'price_changed'
            then 'watched_product_price_changed'
          when eligible.previous_state_safe = 'expected'
            and eligible.new_state_safe = 'in_stock'
            then 'watched_product_arrived'
          when eligible.new_state_safe = 'in_stock'
            and eligible.previous_state_safe <> 'in_stock'
            then 'watched_product_back_in_stock'
          when eligible.new_state_safe = 'expected'
            and eligible.previous_state_safe in ('unknown', 'unavailable')
            then 'watched_product_expected_arrival_added'
          else null
        end as event_code
      from eligible
    )
    select classified.*,
      classified.event_code in (
        'cart_product_price_changed', 'cart_product_availability_changed'
      ) as mandatory,
      coalesce(preference.in_app_enabled, true) as product_notifications_enabled,
      coalesce(preference.delivery_mode, 'immediate') as delivery_mode,
      array_remove(array[
        case when classified.has_cart then 'cart' end,
        case when classified.has_favorite then 'favorite' end,
        case when classified.has_list then 'purchasing_list' end
      ], null) as watcher_sources
    from classified
    left join public.partner_notification_preferences preference
      on preference.company_id = classified.company_id
     and preference.user_id = classified.user_id
     and preference.event_group = 'products'
    where classified.event_code is not null;

    select count(*)::integer into recipient_count
    from product_notification_candidates;
    select count(*)::integer into suppressed_count
    from product_notification_candidates candidate
    where not candidate.mandatory
      and (
        not candidate.product_notifications_enabled
        or candidate.delivery_mode = 'off'
      );

    with source_rows as (
      select candidate.*,
        encode(digest(concat_ws('|',
          'product_notification_source', candidate.transition_id::text,
          candidate.company_id::text, candidate.user_id::text,
          candidate.event_code
        ), 'sha256'), 'hex') as source_fingerprint
      from product_notification_candidates candidate
      where candidate.mandatory
        or (
          candidate.product_notifications_enabled
          and candidate.delivery_mode <> 'off'
        )
    )
    insert into public.partner_notification_events(
      company_id, event_code, event_group, domain, entity_type, entity_id,
      source_table, source_event_id, source_version, occurred_at,
      safe_payload, fingerprint
    )
    select source.company_id, source.event_code, 'products', 'products',
      case when source.mandatory then 'cart' else 'product' end,
      case when source.mandatory then source.cart_id else source.product_id end,
      'partner_product_transition_events', source.transition_id,
      source.source_version, source.occurred_at,
      jsonb_build_object(
        'productId', source.product_id,
        'productSku', source.sku,
        'watcherSources', to_jsonb(source.watcher_sources)
      ),
      source.source_fingerprint
    from source_rows source
    on conflict (fingerprint) do nothing;

    with source_rows as (
      select candidate.*,
        encode(digest(concat_ws('|',
          'product_notification_source', candidate.transition_id::text,
          candidate.company_id::text, candidate.user_id::text,
          candidate.event_code
        ), 'sha256'), 'hex') as source_fingerprint
      from product_notification_candidates candidate
      where candidate.mandatory
        or (
          candidate.product_notifications_enabled
          and candidate.delivery_mode <> 'off'
        )
    ),
    prepared as (
      select source.*,
        event.id as source_event_id,
        case source.event_code
          when 'watched_product_back_in_stock' then 'Товар снова в наличии'
          when 'watched_product_expected_arrival_added' then 'Появилась дата поступления'
          when 'watched_product_arrived' then 'Ожидаемый товар поступил'
          when 'watched_product_price_changed' then 'Цена товара изменилась'
          else 'Изменились данные товара в корзине'
        end as title,
        case source.event_code
          when 'watched_product_back_in_stock'
            then 'Товар ' || source.name || ' снова доступен для заказа.'
          when 'watched_product_expected_arrival_added'
            then 'Для товара ' || source.name || ' подтверждена дата поступления.'
          when 'watched_product_arrived'
            then 'Ожидаемый товар ' || source.name || ' поступил на склад.'
          when 'watched_product_price_changed'
            then 'Цена товара ' || source.name || ' изменилась.'
          when 'cart_product_price_changed'
            then 'Цена товара ' || source.name || ' в активной корзине изменилась. Проверьте заказ перед отправкой.'
          else 'Доступность товара ' || source.name || ' в активной корзине изменилась. Проверьте заказ перед отправкой.'
        end as message,
        case when source.mandatory then 'Открыть корзину'
          else 'Открыть товар' end as action_label,
        case when source.mandatory then '/cabinet/cart'
          else '/cabinet/catalog/' || source.slug end as action_url,
        case when source.mandatory then 'warning'
          when source.event_code in (
            'watched_product_back_in_stock', 'watched_product_arrived'
          ) then 'success'
          else 'information' end as severity
      from source_rows source
      join public.partner_notification_events event
        on event.fingerprint = source.source_fingerprint
    ),
    inserted as (
      insert into public.partner_notifications(
        company_id, recipient_user_id, event_code, event_group, domain,
        severity, mandatory, title, message, action_label, action_url,
        entity_type, entity_id, occurred_at, deduplication_key,
        source_event_id, expires_at, retention_until,
        email_enabled_snapshot, email_delivery_mode
      )
      select prepared.company_id, prepared.user_id, prepared.event_code,
        'products', 'products', prepared.severity, prepared.mandatory,
        prepared.title, prepared.message, prepared.action_label,
        prepared.action_url,
        case when prepared.mandatory then 'cart' else 'product' end,
        case when prepared.mandatory then prepared.cart_id
          else prepared.product_id end,
        prepared.occurred_at,
        encode(digest(concat_ws('|',
          prepared.source_fingerprint, prepared.user_id::text
        ), 'sha256'), 'hex'),
        prepared.source_event_id,
        prepared.occurred_at + interval '30 days',
        prepared.occurred_at + interval '13 months',
        false, 'off'
      from prepared
      on conflict (recipient_user_id, deduplication_key) do nothing
      returning id
    )
    select count(*)::integer into created_count from inserted;

    deduplicated_count :=
      greatest(recipient_count - suppressed_count - created_count, 0);

    update public.partner_product_transition_events transition
    set processing_status = 'processed',
        processed_at = now(),
        safe_error_code = null
    where transition.id in (select id from product_transition_batch);

    update public.partner_product_notification_projection_runs
    set status = 'succeeded',
        transitions_processed = transition_count,
        watcher_recipients_resolved = recipient_count,
        notifications_created = created_count,
        deduplicated = deduplicated_count,
        suppressed = suppressed_count,
        duration_ms = greatest(
          0,
          floor(extract(epoch from clock_timestamp() - worker_started_at) * 1000)
        )::integer,
        finished_at = now()
    where id = run_id;
  exception when others then
    update public.partner_product_transition_events transition
    set processing_status = 'failed',
        safe_error_code = sqlstate
    where transition.id in (select id from product_transition_batch);
    update public.partner_product_notification_projection_runs
    set status = 'failed',
        transitions_processed = transition_count,
        failed_projections = transition_count,
        safe_error_code = sqlstate,
        duration_ms = greatest(
          0,
          floor(extract(epoch from clock_timestamp() - worker_started_at) * 1000)
        )::integer,
        finished_at = now()
    where id = run_id;
  end;

  return (
    select jsonb_build_object(
      'runId', run.id,
      'status', run.status,
      'transitionsProcessed', run.transitions_processed,
      'watcherRecipientsResolved', run.watcher_recipients_resolved,
      'notificationsCreated', run.notifications_created,
      'deduplicated', run.deduplicated,
      'suppressed', run.suppressed,
      'failedProjections', run.failed_projections,
      'safeErrorCode', run.safe_error_code,
      'durationMs', run.duration_ms
    )
    from public.partner_product_notification_projection_runs run
    where run.id = run_id
  );
end;
$$;

revoke all on function public.process_partner_product_transitions(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.process_partner_product_transitions(uuid, integer)
  to service_role;

comment on function public.process_partner_product_transitions(uuid, integer) is
  'Bounded set-based watched-product projection with active ownership, price visibility, preference suppression, and idempotent amount-free notification generation.';

commit;
