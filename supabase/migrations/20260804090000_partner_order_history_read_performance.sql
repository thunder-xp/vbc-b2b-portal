create or replace function public.get_partner_order_history_identity_matches(
  p_company_id uuid,
  p_external_refs text[],
  p_portal_order_ids uuid[]
)
returns table(external_1c_order_ref text, portal_order_id uuid)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.has_permission(p_company_id, 'orders.view') then
    raise exception 'Order history access denied.' using errcode = '42501';
  end if;

  return query
  select history.external_1c_order_ref, history.portal_order_id
  from public.partner_order_history history
  where history.company_id = p_company_id
    and history.partner_visible
    and (
      history.external_1c_order_ref = any(coalesce(p_external_refs, array[]::text[]))
      or history.portal_order_id = any(coalesce(p_portal_order_ids, array[]::uuid[]))
    );
end;
$$;

create or replace function public.get_partner_order_history_page(
  p_company_id uuid,
  p_filter text default 'all',
  p_search text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  normalized_search text := nullif(btrim(coalesce(p_search, '')), '');
  total_rows bigint;
  page_rows jsonb;
begin
  if auth.uid() is null or not public.has_permission(p_company_id, 'orders.view') then
    raise exception 'Order history access denied.' using errcode = '42501';
  end if;
  if p_filter not in ('all', 'processing', 'open', 'preorder', 'test', 'completed') then
    raise exception 'Invalid order history filter.' using errcode = '22023';
  end if;
  if p_offset < 0 or p_limit < 0 or p_limit > 100 then
    raise exception 'Invalid order history page bounds.' using errcode = '22023';
  end if;

  select count(*)
  into total_rows
  from public.partner_order_history history
  where history.company_id = p_company_id
    and history.partner_visible
    and (
      p_filter = 'all'
      or (p_filter = 'processing' and not history.one_c_posted)
      or (p_filter <> 'processing' and history.one_c_posted and history.one_c_state_code = p_filter)
    )
    and (
      normalized_search is null
      or (
        history.one_c_posted
        and history.external_1c_order_number ilike
          '%' || replace(replace(replace(normalized_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
          escape E'\\'
      )
    );

  if p_limit = 0 then
    page_rows := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(to_jsonb(page_row) order by page_row.one_c_document_date desc, page_row.id), '[]'::jsonb)
    into page_rows
    from (
      select
        history.id,
        history.company_id,
        history.portal_order_id,
        history.external_1c_order_ref,
        history.external_1c_order_number,
        history.one_c_posted,
        history.one_c_deletion_mark,
        history.one_c_state_ref,
        history.one_c_state_raw,
        history.one_c_state_code,
        history.one_c_document_date,
        history.one_c_delivery_date,
        history.one_c_source_version,
        history.one_c_last_synced_at,
        history.external_contract_ref,
        history.external_currency_ref,
        history.document_total,
        history.currency_code,
        history.origin_type,
        history.partner_visible,
        history.hidden_reason,
        history.position_count,
        history.total_unit_count,
        history.created_at,
        history.updated_at
      from public.partner_order_history history
      where history.company_id = p_company_id
        and history.partner_visible
        and (
          p_filter = 'all'
          or (p_filter = 'processing' and not history.one_c_posted)
          or (p_filter <> 'processing' and history.one_c_posted and history.one_c_state_code = p_filter)
        )
        and (
          normalized_search is null
          or (
            history.one_c_posted
            and history.external_1c_order_number ilike
              '%' || replace(replace(replace(normalized_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%'
              escape E'\\'
          )
        )
      order by history.one_c_document_date desc, history.id
      offset p_offset
      limit p_limit
    ) page_row;
  end if;

  return jsonb_build_object('items', page_rows, 'total', total_rows);
end;
$$;

revoke all on function public.get_partner_order_history_identity_matches(uuid, text[], uuid[]) from public, anon;
revoke all on function public.get_partner_order_history_page(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.get_partner_order_history_identity_matches(uuid, text[], uuid[]) to authenticated;
grant execute on function public.get_partner_order_history_page(uuid, text, text, integer, integer) to authenticated;

comment on function public.get_partner_order_history_identity_matches(uuid, text[], uuid[]) is
  'Returns only history identities matching confirmed portal orders after one canonical permission evaluation.';
comment on function public.get_partner_order_history_page(uuid, text, text, integer, integer) is
  'Returns one bounded partner order-history page and exact count after one canonical permission evaluation.';
