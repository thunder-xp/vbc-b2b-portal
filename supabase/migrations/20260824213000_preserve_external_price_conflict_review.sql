begin;

alter table public.external_price_events
  drop constraint external_price_events_event_type_check;

alter table public.external_price_events
  add constraint external_price_events_event_type_check check (event_type in (
    'uploaded','mapping_confirmed','mapping_corrected','manual_match','row_skipped','applied','archived','analysis_failed',
    'correction_started','price_level_reclassified','superseded','price_conflict_detected'
  ));

create or replace function public.review_external_price_row(
  p_company_id uuid,
  p_upload_id uuid,
  p_row_id uuid,
  p_catalog_product_id uuid default null,
  p_skip boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.external_price_uploads;
  target_row public.external_price_import_rows;
  selected_product jsonb;
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.manage') then
    raise exception 'Access denied.' using errcode = '42501';
  end if;

  select * into target
  from public.external_price_uploads
  where id = p_upload_id and partner_company_id = p_company_id
  for update;

  if target.id is null or target.status <> 'ready_for_review' then
    raise exception 'Import state changed.' using errcode = 'PT409';
  end if;

  select * into target_row
  from public.external_price_import_rows
  where id = p_row_id and upload_id = target.id
  for update;

  if target_row.id is null or target_row.match_status not in ('needs_review', 'unmatched') then
    raise exception 'Row cannot be reviewed.' using errcode = 'PT409';
  end if;

  if p_skip then
    update public.external_price_import_rows
    set catalog_product_id = null,
        match_method = 'none',
        match_status = 'skipped',
        updated_at = now()
    where id = target_row.id;
  else
    select jsonb_build_object('id', product.id, 'sku', product.sku, 'name', product.name)
    into selected_product
    from public.catalog_products product
    where product.id = p_catalog_product_id
      and product.is_active
      and product.is_visible;

    if selected_product is null then
      raise exception 'Product is unavailable.' using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.external_price_import_rows other
      where other.upload_id = target.id
        and other.id <> target_row.id
        and other.catalog_product_id = p_catalog_product_id
        and other.match_status in ('matched', 'matched_alias')
        and (
          (target_row.partner_price is not null and other.partner_price is not null and target_row.partner_price <> other.partner_price)
          or
          (target_row.retail_price is not null and other.retail_price is not null and target_row.retail_price <> other.retail_price)
        )
    ) then
      update public.external_price_import_rows
      set catalog_product_id = null,
          match_method = 'suggested',
          match_status = 'needs_review',
          suggested_products = jsonb_build_array(selected_product || jsonb_build_object('reason', 'conflicting_price')),
          updated_at = now()
      where id = target_row.id;

      update public.external_price_uploads
      set matched_rows = (
            select count(*) from public.external_price_import_rows
            where upload_id = target.id and match_status in ('matched', 'matched_alias')
          ),
          review_rows = (
            select count(*) from public.external_price_import_rows
            where upload_id = target.id and match_status = 'needs_review'
          ),
          unmatched_rows = (
            select count(*) from public.external_price_import_rows
            where upload_id = target.id and match_status = 'unmatched'
          ),
          updated_at = now()
      where id = target.id;

      insert into public.external_price_events(
        upload_id, partner_company_id, actor_user_id, event_type, safe_metadata
      ) values (
        target.id, p_company_id, auth.uid(), 'price_conflict_detected',
        jsonb_build_object('rowId', target_row.id, 'catalogProductId', p_catalog_product_id)
      );

      return jsonb_build_object(
        'id', target_row.id,
        'status', 'needs_review',
        'errorCode', 'CONFLICTING_DUPLICATE_PRICE'
      );
    end if;

    update public.external_price_import_rows
    set catalog_product_id = p_catalog_product_id,
        match_method = 'manual',
        match_status = 'matched',
        updated_at = now()
    where id = target_row.id;
  end if;

  update public.external_price_uploads
  set matched_rows = (
        select count(*) from public.external_price_import_rows
        where upload_id = target.id and match_status in ('matched', 'matched_alias')
      ),
      review_rows = (
        select count(*) from public.external_price_import_rows
        where upload_id = target.id and match_status = 'needs_review'
      ),
      unmatched_rows = (
        select count(*) from public.external_price_import_rows
        where upload_id = target.id and match_status = 'unmatched'
      ),
      updated_at = now()
  where id = target.id;

  insert into public.external_price_events(
    upload_id, partner_company_id, actor_user_id, event_type, safe_metadata
  ) values (
    target.id, p_company_id, auth.uid(),
    case when p_skip then 'row_skipped' else 'manual_match' end,
    jsonb_build_object('rowId', target_row.id)
  );

  return jsonb_build_object(
    'id', target_row.id,
    'status', case when p_skip then 'skipped' else 'matched' end
  );
end;
$$;

revoke all on function public.review_external_price_row(uuid, uuid, uuid, uuid, boolean)
  from public, anon;
grant execute on function public.review_external_price_row(uuid, uuid, uuid, uuid, boolean)
  to authenticated;

with conflicting_products as (
  select row.upload_id, row.catalog_product_id, price.price_type
  from public.external_price_import_rows row
  join public.external_price_uploads upload on upload.id = row.upload_id
  cross join lateral (
    values ('partner'::text, row.partner_price), ('retail'::text, row.retail_price)
  ) price(price_type, amount)
  where upload.status = 'ready_for_review'
    and row.match_status in ('matched', 'matched_alias')
    and row.catalog_product_id is not null
    and price.amount is not null
  group by row.upload_id, row.catalog_product_id, price.price_type
  having count(distinct price.amount) > 1
), conflict_rows as (
  select distinct row.id, row.upload_id, product.id product_id, product.sku, product.name
  from public.external_price_import_rows row
  join conflicting_products conflict
    on conflict.upload_id = row.upload_id
   and conflict.catalog_product_id = row.catalog_product_id
  join public.catalog_products product on product.id = row.catalog_product_id
  where row.match_status in ('matched', 'matched_alias')
)
update public.external_price_import_rows row
set catalog_product_id = null,
    match_method = 'suggested',
    match_status = 'needs_review',
    suggested_products = jsonb_build_array(jsonb_build_object(
      'id', conflict.product_id,
      'sku', conflict.sku,
      'name', conflict.name,
      'reason', 'conflicting_price'
    )),
    updated_at = now()
from conflict_rows conflict
where row.id = conflict.id;

insert into public.external_price_events(
  upload_id, partner_company_id, actor_user_id, event_type, safe_metadata
)
select upload.id,
       upload.partner_company_id,
       null,
       'price_conflict_detected',
       jsonb_build_object('source', 'migration_reconciliation', 'rows', count(*))
from public.external_price_uploads upload
join public.external_price_import_rows row on row.upload_id = upload.id
where upload.status = 'ready_for_review'
  and row.match_status = 'needs_review'
  and row.suggested_products @> '[{"reason":"conflicting_price"}]'::jsonb
group by upload.id, upload.partner_company_id;

update public.external_price_uploads upload
set matched_rows = counts.matched_rows,
    review_rows = counts.review_rows,
    unmatched_rows = counts.unmatched_rows,
    updated_at = now()
from (
  select row.upload_id,
         count(*) filter (where row.match_status in ('matched', 'matched_alias')) matched_rows,
         count(*) filter (where row.match_status = 'needs_review') review_rows,
         count(*) filter (where row.match_status = 'unmatched') unmatched_rows
  from public.external_price_import_rows row
  join public.external_price_uploads active_upload
    on active_upload.id = row.upload_id
   and active_upload.status = 'ready_for_review'
  group by row.upload_id
) counts
where upload.id = counts.upload_id;

commit;
