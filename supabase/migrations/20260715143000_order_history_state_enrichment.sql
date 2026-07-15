alter table public.partner_order_history
  add column if not exists one_c_state_ref text null;

update public.partner_order_history
set one_c_state_ref = lower(one_c_state_raw)
where one_c_state_ref is null
  and one_c_state_raw ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  and lower(one_c_state_raw) <> '00000000-0000-0000-0000-000000000000';

create or replace function public.upsert_partner_order_history_batch(
  target_company_id uuid,
  target_sync_id uuid,
  target_synced_at timestamptz,
  target_orders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_order jsonb;
  existing_order public.partner_order_history;
  saved_order public.partner_order_history;
  linked_portal_order_id uuid;
  item jsonb;
  inserted_count integer := 0;
  updated_count integer := 0;
  hidden_count integer := 0;
  event_time timestamptz;
  event_value text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Order history synchronization is server-only.' using errcode = '42501';
  end if;
  if jsonb_typeof(target_orders) <> 'array' then
    raise exception 'Order history batch is invalid.' using errcode = '22023';
  end if;

  for source_order in select value from jsonb_array_elements(target_orders)
  loop
    select * into existing_order from public.partner_order_history
    where external_1c_order_ref = source_order->>'external_1c_order_ref'
    for update;

    select id into linked_portal_order_id from public.partner_orders
    where external_1c_ref = source_order->>'external_1c_order_ref'
    order by confirmed_at desc nulls last limit 1;

    insert into public.partner_order_history(
      company_id, portal_order_id, external_1c_order_ref, external_1c_order_number,
      one_c_posted, one_c_deletion_mark, one_c_state_ref, one_c_state_raw, one_c_state_code,
      one_c_document_date, one_c_delivery_date, one_c_source_version, one_c_last_synced_at,
      external_contract_ref, external_currency_ref, document_total, currency_code,
      origin_type, partner_visible, hidden_reason, position_count, total_unit_count
    ) values (
      target_company_id, linked_portal_order_id, source_order->>'external_1c_order_ref',
      coalesce(source_order->>'external_1c_order_number', ''),
      coalesce((source_order->>'one_c_posted')::boolean, false),
      coalesce((source_order->>'one_c_deletion_mark')::boolean, false),
      nullif(source_order->>'one_c_state_ref', ''),
      nullif(source_order->>'one_c_state_raw', ''),
      nullif(source_order->>'one_c_state_code', ''),
      (source_order->>'one_c_document_date')::timestamptz,
      nullif(source_order->>'one_c_delivery_date', '')::date,
      nullif(source_order->>'one_c_source_version', ''), target_synced_at,
      nullif(source_order->>'external_contract_ref', ''), nullif(source_order->>'external_currency_ref', ''),
      coalesce((source_order->>'document_total')::numeric, 0), nullif(source_order->>'currency_code', ''),
      case when linked_portal_order_id is not null then 'partner_platform' else 'unknown_1c_source' end,
      not coalesce((source_order->>'one_c_deletion_mark')::boolean, false),
      case when coalesce((source_order->>'one_c_deletion_mark')::boolean, false) then 'deleted_in_1c' else null end,
      coalesce((source_order->>'position_count')::integer, 0),
      coalesce((source_order->>'total_unit_count')::numeric, 0)
    )
    on conflict (external_1c_order_ref) do update set
      company_id = excluded.company_id,
      portal_order_id = coalesce(partner_order_history.portal_order_id, excluded.portal_order_id),
      external_1c_order_number = excluded.external_1c_order_number,
      one_c_posted = excluded.one_c_posted,
      one_c_deletion_mark = excluded.one_c_deletion_mark,
      one_c_state_ref = excluded.one_c_state_ref,
      one_c_state_raw = excluded.one_c_state_raw,
      one_c_state_code = excluded.one_c_state_code,
      one_c_document_date = excluded.one_c_document_date,
      one_c_delivery_date = excluded.one_c_delivery_date,
      one_c_source_version = excluded.one_c_source_version,
      one_c_last_synced_at = excluded.one_c_last_synced_at,
      external_contract_ref = excluded.external_contract_ref,
      external_currency_ref = excluded.external_currency_ref,
      document_total = excluded.document_total,
      currency_code = excluded.currency_code,
      partner_visible = excluded.partner_visible,
      hidden_reason = excluded.hidden_reason,
      position_count = excluded.position_count,
      total_unit_count = excluded.total_unit_count
    returning * into saved_order;

    event_time := saved_order.one_c_last_synced_at;
    if existing_order.id is null then
      inserted_count := inserted_count + 1;
      insert into public.partner_order_history_events(
        order_history_id, event_type, occurred_at, current_value, fingerprint
      ) values (
        saved_order.id, 'imported', event_time, saved_order.external_1c_order_ref,
        md5(saved_order.id::text || ':imported')
      ) on conflict (fingerprint) do nothing;
      if saved_order.portal_order_id is not null then
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, current_value, fingerprint
        ) values (
          saved_order.id, 'received_by_one_c', saved_order.one_c_document_date,
          saved_order.external_1c_order_ref, md5(saved_order.id::text || ':received_by_one_c')
        ) on conflict (fingerprint) do nothing;
      end if;
    else
      updated_count := updated_count + 1;
      if existing_order.one_c_posted is distinct from saved_order.one_c_posted then
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint
        ) values (
          saved_order.id, case when saved_order.one_c_posted then 'posted' else 'became_unposted' end,
          event_time, existing_order.one_c_posted::text, saved_order.one_c_posted::text,
          md5(saved_order.id::text || ':posted:' || saved_order.one_c_posted::text || ':' || event_time::text)
        ) on conflict (fingerprint) do nothing;
      end if;
      if existing_order.one_c_state_code is distinct from saved_order.one_c_state_code
        or existing_order.one_c_state_raw is distinct from saved_order.one_c_state_raw then
        event_value := coalesce(saved_order.one_c_state_code, saved_order.one_c_state_raw, 'unknown');
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint
        ) values (
          saved_order.id, 'state_changed', event_time,
          coalesce(existing_order.one_c_state_code, existing_order.one_c_state_raw, 'unknown'), event_value,
          md5(saved_order.id::text || ':state:' || event_value || ':' || event_time::text)
        ) on conflict (fingerprint) do nothing;
      end if;
      if existing_order.one_c_delivery_date is distinct from saved_order.one_c_delivery_date then
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, previous_value, current_value, fingerprint
        ) values (
          saved_order.id, 'delivery_date_changed', event_time,
          existing_order.one_c_delivery_date::text, saved_order.one_c_delivery_date::text,
          md5(saved_order.id::text || ':delivery:' || coalesce(saved_order.one_c_delivery_date::text, 'none') || ':' || event_time::text)
        ) on conflict (fingerprint) do nothing;
      end if;
      if not existing_order.one_c_deletion_mark and saved_order.one_c_deletion_mark then
        hidden_count := hidden_count + 1;
        insert into public.partner_order_history_events(
          order_history_id, event_type, occurred_at, current_value, internal_only, fingerprint
        ) values (
          saved_order.id, 'marked_for_deletion', event_time, 'deleted_in_1c', true,
          md5(saved_order.id::text || ':deleted')
        ) on conflict (fingerprint) do nothing;
      end if;
    end if;

    delete from public.partner_order_history_items where order_history_id = saved_order.id;
    for item in select value from jsonb_array_elements(coalesce(source_order->'items', '[]'::jsonb))
    loop
      insert into public.partner_order_history_items(
        order_history_id, line_number, product_id, external_product_ref,
        external_characteristic_ref, product_name, sku, quantity, unit_price,
        line_total, currency_code
      ) values (
        saved_order.id, (item->>'line_number')::integer,
        (select id from public.catalog_products where external_1c_id = item->>'external_product_ref' limit 1),
        item->>'external_product_ref', nullif(item->>'external_characteristic_ref', ''),
        (select name from public.catalog_products where external_1c_id = item->>'external_product_ref' limit 1),
        (select sku from public.catalog_products where external_1c_id = item->>'external_product_ref' limit 1),
        (item->>'quantity')::numeric, (item->>'unit_price')::numeric,
        (item->>'line_total')::numeric, saved_order.currency_code
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'hidden', hidden_count
  );
end;
$$;

revoke all on function public.upsert_partner_order_history_batch(uuid, uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_partner_order_history_batch(uuid, uuid, timestamptz, jsonb)
  to service_role;

comment on column public.partner_order_history.one_c_state_ref is
  'Raw 1C Catalog_СостоянияЗаказовПокупателей Ref_Key retained separately from the resolved description.';
