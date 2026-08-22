begin;

create index catalog_product_model_aliases_product_idx
  on public.catalog_product_model_aliases(catalog_product_id);
create index catalog_product_model_aliases_created_by_idx
  on public.catalog_product_model_aliases(created_by)
  where created_by is not null;

create index current_external_prices_source_idx
  on public.current_external_prices(external_price_source_id);
create index current_external_prices_observation_idx
  on public.current_external_prices(observation_id);
create index current_external_prices_upload_idx
  on public.current_external_prices(upload_id);

create index external_price_events_actor_idx
  on public.external_price_events(actor_user_id)
  where actor_user_id is not null;
create index external_price_events_company_idx
  on public.external_price_events(partner_company_id);
create index external_price_import_rows_company_idx
  on public.external_price_import_rows(partner_company_id);

create index external_price_mapping_templates_created_by_idx
  on public.external_price_mapping_templates(created_by);
create index external_price_mapping_templates_source_idx
  on public.external_price_mapping_templates(external_price_source_id);
create index external_price_observations_source_idx
  on public.external_price_observations(external_price_source_id);

create index external_price_uploads_source_idx
  on public.external_price_uploads(external_price_source_id);
create index external_price_uploads_template_idx
  on public.external_price_uploads(mapping_template_id)
  where mapping_template_id is not null;
create index external_price_uploads_uploaded_by_idx
  on public.external_price_uploads(uploaded_by);

commit;
