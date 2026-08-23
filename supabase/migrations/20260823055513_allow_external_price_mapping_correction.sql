create or replace function public.confirm_external_price_mapping(
  p_company_id uuid, p_upload_id uuid, p_mapping jsonb, p_save_template boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.external_price_uploads;
  template_id uuid;
  signature text;
  event_name text;
begin
  if not public.can_access_external_prices(p_company_id, 'external_prices.manage') then
    raise exception 'Access denied.' using errcode='42501';
  end if;
  if jsonb_typeof(p_mapping) <> 'object' then
    raise exception 'Invalid mapping.' using errcode='22023';
  end if;

  select * into target
  from public.external_price_uploads
  where id=p_upload_id and partner_company_id=p_company_id
  for update;

  if target.id is null or target.status not in ('mapping_required', 'ready_for_review') then
    raise exception 'Import state changed.' using errcode='PT409';
  end if;

  event_name := case when target.status='ready_for_review' then 'mapping_corrected' else 'mapping_confirmed' end;
  signature := coalesce(target.detected_mapping->>'signature', target.source_file_hash);
  if p_save_template then
    insert into public.external_price_mapping_templates(
      company_id, external_price_source_id, name, file_format, signature, column_mapping, created_by
    ) values (
      p_company_id, target.external_price_source_id,
      (select display_name from public.external_price_sources where id=target.external_price_source_id)||' '||upper(target.file_format)||' template',
      target.file_format, signature, p_mapping, auth.uid()
    )
    on conflict(company_id, external_price_source_id, signature)
    do update set column_mapping=excluded.column_mapping, active=true, updated_at=now()
    returning id into template_id;
  end if;

  delete from public.external_price_import_rows where upload_id=target.id;
  update public.external_price_uploads
  set confirmed_mapping=p_mapping,
      mapping_template_id=coalesce(template_id,mapping_template_id),
      status='uploaded',
      matched_rows=0,
      review_rows=0,
      unmatched_rows=0,
      safe_error_code=null,
      updated_at=now()
  where id=target.id;

  insert into public.external_price_events(
    upload_id,partner_company_id,actor_user_id,event_type,safe_metadata
  ) values (
    target.id,p_company_id,auth.uid(),event_name,
    jsonb_build_object('templateSaved',p_save_template)
  );

  return jsonb_build_object('id',target.id,'status','uploaded');
end; $$;

revoke all on function public.confirm_external_price_mapping(uuid,uuid,jsonb,boolean) from public, anon;
grant execute on function public.confirm_external_price_mapping(uuid,uuid,jsonb,boolean) to authenticated;
