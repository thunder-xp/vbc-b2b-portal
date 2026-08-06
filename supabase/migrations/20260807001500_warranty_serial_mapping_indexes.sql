begin;

create index if not exists warranty_serial_counterparty_ref_idx
  on public.one_c_counterparties(lower(external_1c_id))
  where is_published
    and not is_deleted
    and is_active
    and portal_company_id is not null;

create index if not exists warranty_serial_product_ref_idx
  on public.catalog_products(lower(external_1c_id));

commit;
