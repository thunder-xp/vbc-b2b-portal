alter table public.external_price_uploads
  drop constraint external_price_uploads_file_size_check;

alter table public.external_price_uploads
  add constraint external_price_uploads_file_size_check
  check (file_size between 1 and 67108864);

update storage.buckets
set file_size_limit = 67108864
where id = 'external-price-imports';

create or replace function public.claim_external_price_upload_job()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.external_price_uploads;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  select * into target
  from public.external_price_uploads
  where status = 'uploaded'
     or (status = 'analyzing' and updated_at < now() - interval '10 minutes')
  order by created_at
  for update skip locked
  limit 1;

  if target.id is null then
    return null;
  end if;

  update public.external_price_uploads
  set status = 'analyzing', updated_at = now()
  where id = target.id;

  return jsonb_build_object(
    'id', target.id,
    'companyId', target.partner_company_id,
    'sourceId', target.external_price_source_id,
    'uploadedBy', target.uploaded_by,
    'storageBucket', target.storage_bucket,
    'storageKey', target.storage_key,
    'sourceFileHash', target.source_file_hash,
    'fileFormat', target.file_format,
    'currency', target.currency,
    'priceSchema', target.price_schema,
    'effectiveDate', target.effective_date,
    'confirmedMapping', target.confirmed_mapping
  );
end;
$$;

revoke all on function public.claim_external_price_upload_job() from public, anon, authenticated;
grant execute on function public.claim_external_price_upload_job() to service_role;
