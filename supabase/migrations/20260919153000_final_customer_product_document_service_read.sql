begin;

-- Final Customer document reads are server-owned. The service derives source
-- product ids only from the authenticated customer's paid, confirmed order
-- lines before performing this bounded metadata read.
grant select on table public.catalog_product_documents to service_role;

commit;
