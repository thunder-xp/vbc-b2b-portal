begin;

alter function public.publish_product_prices_with_retail_history(uuid)
  rename to publish_product_prices_with_retail_history_notification_base;

create function public.publish_product_prices_with_retail_history(p_sync_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_result jsonb;
  before_states jsonb := '[]'::jsonb;
  captured integer := 0;
  capture_error text := null;
begin
  if auth.role() <> 'service_role' then
    raise exception 'RETAIL_HISTORY_PERMISSION_DENIED' using errcode = '42501';
  end if;

  begin
    with affected as (
      select distinct product.id as product_id,
        stage.external_price_type_ref
      from public.product_price_sync_stage stage
      join public.catalog_products product
        on product.external_1c_id = stage.external_product_ref
      where stage.sync_id = p_sync_id
        and stage.external_characteristic_ref =
          '00000000-0000-0000-0000-000000000000'
        and product.is_active
        and product.is_visible
        and (
          exists (
            select 1
            from public.purchasing_list_items item
            join public.purchasing_lists list on list.id = item.list_id
            join public.company_memberships membership
              on membership.company_id = list.company_id
             and membership.user_id = list.created_by
             and membership.status = 'active'
            where item.product_id = product.id
              and list.archived_at is null
          )
          or exists (
            select 1
            from public.cart_items item
            join public.carts cart on cart.id = item.cart_id
            join public.company_memberships membership
              on membership.company_id = cart.company_id
             and membership.user_id = cart.created_by
             and membership.status = 'active'
            where item.product_id = product.id
              and cart.status = 'active'
          )
        )
    ),
    snapshot as (
      select affected.product_id, affected.external_price_type_ref,
        case when price.id is not null
          and price.is_active and price.is_published
          and price.price_amount > 0
          and price.currency_status = 'resolved'
          then 'available' else 'unavailable' end as state,
        encode(digest(concat_ws('|',
          case when price.id is null then 'missing' else 'present' end,
          coalesce(price.currency, ''),
          coalesce(price.price_amount::text, ''),
          coalesce(price.is_active::text, 'false'),
          coalesce(price.is_published::text, 'false'),
          coalesce(price.currency_status, '')
        ), 'sha256'), 'hex') as value_fingerprint
      from affected
      left join public.product_prices price
        on price.product_id = affected.product_id
       and price.external_1c_price_type_id = affected.external_price_type_ref
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'productId', snapshot.product_id,
      'priceTypeRef', snapshot.external_price_type_ref,
      'state', snapshot.state,
      'fingerprint', snapshot.value_fingerprint
    )), '[]'::jsonb)
    into before_states
    from snapshot;
  exception when others then
    before_states := '[]'::jsonb;
    capture_error := 'before_price_capture_failed';
  end;

  base_result :=
    public.publish_product_prices_with_retail_history_notification_base(p_sync_id);

  begin
    with before_state as (
      select value.product_id, value.price_type_ref,
        value.state, value.fingerprint
      from jsonb_to_recordset(before_states) as value(
        product_id uuid,
        price_type_ref text,
        state text,
        fingerprint text
      )
    ),
    current_state as (
      select before_state.product_id, before_state.price_type_ref,
        before_state.state as previous_state,
        before_state.fingerprint as previous_fingerprint,
        case when price.id is not null
          and price.is_active and price.is_published
          and price.price_amount > 0
          and price.currency_status = 'resolved'
          then 'available' else 'unavailable' end as new_state,
        encode(digest(concat_ws('|',
          case when price.id is null then 'missing' else 'present' end,
          coalesce(price.currency, ''),
          coalesce(price.price_amount::text, ''),
          coalesce(price.is_active::text, 'false'),
          coalesce(price.is_published::text, 'false'),
          coalesce(price.currency_status, '')
        ), 'sha256'), 'hex') as new_fingerprint
      from before_state
      left join public.product_prices price
        on price.product_id = before_state.product_id
       and price.external_1c_price_type_id = before_state.price_type_ref
    )
    insert into public.partner_product_transition_events(
      product_id, transition_type, previous_state_safe, new_state_safe,
      previous_value_fingerprint, new_value_fingerprint,
      price_context_type, external_price_type_ref,
      source_sync_id, source_version, fingerprint
    )
    select current_state.product_id, 'price_changed',
      current_state.previous_state, current_state.new_state,
      current_state.previous_fingerprint, current_state.new_fingerprint,
      'price_type', current_state.price_type_ref,
      p_sync_id, p_sync_id::text,
      encode(digest(concat_ws('|',
        'price_changed', current_state.product_id::text,
        current_state.price_type_ref, current_state.previous_fingerprint,
        current_state.new_fingerprint, p_sync_id::text
      ), 'sha256'), 'hex')
    from current_state
    where current_state.previous_fingerprint <> current_state.new_fingerprint
    on conflict (fingerprint) do nothing;
    get diagnostics captured = row_count;
  exception when others then
    captured := 0;
    capture_error := coalesce(capture_error, 'price_transition_capture_failed');
  end;

  return base_result || jsonb_build_object(
    'product_price_transitions_captured', captured,
    'product_price_transition_capture_error', capture_error
  );
end;
$$;

revoke all on function
  public.publish_product_prices_with_retail_history_notification_base(uuid),
  public.publish_product_prices_with_retail_history(uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_product_prices_with_retail_history_notification_base(uuid),
  public.publish_product_prices_with_retail_history(uuid)
to service_role;

comment on function public.publish_product_prices_with_retail_history(uuid) is
  'Publishes authoritative prices and RETAIL continuity, then captures amount-free watched-product price fingerprints without making notification capture a publication dependency.';

commit;
