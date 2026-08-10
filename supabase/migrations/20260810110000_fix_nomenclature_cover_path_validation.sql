create or replace function public.set_partner_external_nomenclature_cover(
  target_company_id uuid, target_external_nomenclature_id uuid, expected_version integer,
  target_storage_key text, target_size_bytes integer, target_width integer, target_height integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare library public.partner_external_nomenclature_library; item public.external_nomenclature_items; next_version integer; event_name text;
begin
  if target_company_id is null or not public.can_access_estimates(target_company_id, 'estimates.manage') then raise exception 'Nomenclature library is not available.' using errcode = '42501'; end if;
  select * into item from public.external_nomenclature_items where id = target_external_nomenclature_id and is_active and canonical_item_id is null for share;
  if item.id is null or item.item_type = 'service' or item.curation_status <> 'review_required' or item.canonical_cover_storage_key is not null then raise exception 'Partner cover cannot be changed for this identity.' using errcode = '42501'; end if;
  if target_storage_key is not null and (target_storage_key !~ ('^partner/' || target_company_id::text || '/' || target_external_nomenclature_id::text || '/[0-9a-f-]{36}\.webp$')
    or target_size_bytes not between 1 and 262144 or target_width not between 1 and 512 or target_height not between 1 and 512) then raise exception 'Cover metadata is invalid.' using errcode = '22023'; end if;
  select * into library from public.partner_external_nomenclature_library where company_id = target_company_id and external_nomenclature_id = target_external_nomenclature_id and status = 'active' for update;
  if library.company_id is null then raise exception 'Nomenclature item was not found.' using errcode = 'P0002'; end if;
  if library.version <> expected_version then raise exception 'Nomenclature item was changed by another session.' using errcode = '40001'; end if;
  event_name := case when target_storage_key is null then 'cover_removed' when library.cover_storage_key is null then 'cover_uploaded' else 'cover_replaced' end;
  update public.partner_external_nomenclature_library set cover_storage_key = target_storage_key, cover_size_bytes = target_size_bytes,
    cover_width = target_width, cover_height = target_height, cover_updated_at = case when target_storage_key is null then null else now() end,
    cover_updated_by = case when target_storage_key is null then null else auth.uid() end, version = version + 1
  where company_id = target_company_id and external_nomenclature_id = target_external_nomenclature_id returning version into next_version;
  insert into public.partner_external_nomenclature_events(company_id, external_nomenclature_id, actor_user_id, event_type, context)
  values(target_company_id, target_external_nomenclature_id, auth.uid(), event_name, jsonb_build_object('version', next_version));
  return jsonb_build_object('version', next_version, 'previous_storage_key', library.cover_storage_key);
end; $$;

create or replace function public.set_admin_external_nomenclature_cover(
  target_external_nomenclature_id uuid, expected_version integer, target_storage_key text,
  target_size_bytes integer, target_width integer, target_height integer, change_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare item public.external_nomenclature_items; next_version integer; event_name text;
begin
  if not public.has_internal_permission('admin.external_nomenclature.manage') then raise exception 'Nomenclature governance is not available.' using errcode='42501'; end if;
  if char_length(btrim(change_reason)) not between 10 and 1000 then raise exception 'A curation reason is required.' using errcode='22023'; end if;
  select * into item from public.external_nomenclature_items where id=target_external_nomenclature_id and canonical_item_id is null for update;
  if item.id is null or item.item_type='service' then raise exception 'Nomenclature item was not found.' using errcode='P0002'; end if;
  if item.version<>expected_version then raise exception 'Nomenclature item was changed by another session.' using errcode='40001'; end if;
  if target_storage_key is not null and (target_storage_key !~ ('^canonical/'||target_external_nomenclature_id::text||'/[0-9a-f-]{36}\.webp$')
    or target_size_bytes not between 1 and 262144 or target_width not between 1 and 512 or target_height not between 1 and 512) then raise exception 'Cover metadata is invalid.' using errcode='22023'; end if;
  event_name:=case when target_storage_key is null then 'canonical_cover_removed' when item.canonical_cover_storage_key is null then 'canonical_cover_uploaded' else 'canonical_cover_replaced' end;
  update public.external_nomenclature_items set canonical_cover_storage_key=target_storage_key,canonical_cover_size_bytes=target_size_bytes,
    canonical_cover_width=target_width,canonical_cover_height=target_height,canonical_cover_updated_at=case when target_storage_key is null then null else now() end,
    canonical_cover_updated_by=case when target_storage_key is null then null else auth.uid() end,version=version+1,updated_at=now()
  where id=target_external_nomenclature_id returning version into next_version;
  insert into public.external_nomenclature_governance_events(external_nomenclature_id,actor_user_id,event_type,reason,context)
  values(target_external_nomenclature_id,auth.uid(),event_name,btrim(change_reason),jsonb_build_object('version',next_version));
  return jsonb_build_object('version',next_version,'previous_storage_key',item.canonical_cover_storage_key);
end; $$;

revoke all on function public.set_partner_external_nomenclature_cover(uuid,uuid,integer,text,integer,integer,integer),
  public.set_admin_external_nomenclature_cover(uuid,integer,text,integer,integer,integer,text)
from public, anon;

grant execute on function public.set_partner_external_nomenclature_cover(uuid,uuid,integer,text,integer,integer,integer),
  public.set_admin_external_nomenclature_cover(uuid,integer,text,integer,integer,integer,text)
to authenticated;
