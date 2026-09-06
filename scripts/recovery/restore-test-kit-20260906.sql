-- Explicitly authorized one-off recovery; NOT a schema migration or public RPC.
-- Default is a transactional dry run. Commit only after the performance gate passes.
-- No JWT impersonation, permission changes, source updates, deletes, or price snapshots.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $recovery$
declare
  source public.purchase_templates;
  target public.purchasing_lists;
  expected jsonb := '[["61d8c299-e415-4353-be01-1818ba629e4e","30d19398-0623-4a55-b58f-44bba00375e8",2,1,null],["54688e54-2d03-4b73-9f4b-75f6f69920e3","11205f2f-94ab-4f33-92d4-a4a91676c42b",1,2,null],["ee7ebbf5-0bb3-409f-b4fe-7dbcb95cf4cf","9f7673e7-07ab-49fd-b2fd-ed2667ca0f6d",60,3,null],["4af17117-5686-43fe-8289-256af778ffaa","de47bf42-1493-4d41-ba3c-c70dfd95bc56",5,4,null],["911a2ec0-b991-45c2-a57e-ca34c147aed4","0296c35d-7f7e-4049-8c35-d16b76a16d9a",7,5,null],["cdc8a8f3-8111-4c10-9c9a-2bca39c3e601","292131ee-766a-417a-825a-b6ace941b639",1,6,null],["f84edc2d-8f4a-4dbe-8cb5-6578a8a93466","82f43a84-969e-49fb-ac8c-0d25136c3176",4,7,null],["7d3095d2-8473-4438-970e-446774ac0ab8","155083d0-fb63-467c-aa3d-eccb68f0c1a8",3,8,null],["680d97e2-b015-4d5b-beca-7f327473c994","95bc28d1-ff65-46d7-bf13-de1adce86d8d",5,9,null],["7b8038c3-4fa7-4ddf-8642-4b97161a22dc","3cd85db9-99ad-4b8a-a915-36e81051f10c",4,10,null],["a99bd868-9bca-4453-9c7a-27c1e3d6435f","bb305dfd-9545-4304-8829-45c80bfdcaaf",1,11,null],["15de3111-a8dc-465e-a148-fcd979910ed0","8557e8d5-679f-47f8-a379-4da947c3983d",6,12,null],["99247c5e-5754-4b12-bace-019b61f50529","907e6ed0-60c0-4407-83af-149c707b66fd",5,13,null],["f4b3d0c3-bf7e-4782-9043-90412058fc6d","19d640b2-f6fa-4daa-8bf6-cf1d8985281d",3,14,null]]'::jsonb;
  actual jsonb;
begin
  select * into strict source from public.purchase_templates
    where id = 'fc3ada93-c511-4b7a-a76b-616b3d22909d' for update;
  if source.company_id <> 'a7dc797a-1597-432f-8f3a-b2957354fbb8'
    or source.owner_user_id <> 'a5059f54-7b50-415d-a8a4-0a4e878af919'
    or source.name <> 'test' or source.visibility <> 'private'
    or source.revision <> 1 then
    raise exception 'Authoritative source ownership or metadata changed';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    where m.company_id = source.company_id and m.user_id = source.owner_user_id
      and m.status = 'active' and p.code = 'purchasing_lists.manage'
  ) then raise exception 'Source owner has no active canonical kit management permission'; end if;
  perform 1 from public.purchase_template_items where template_id = source.id for update;
  select jsonb_agg(jsonb_build_array(id, product_id, preferred_quantity, sort_order, line_note) order by sort_order, id)
    into actual from public.purchase_template_items where template_id = source.id;
  if actual is distinct from expected then raise exception 'Persisted source manifest changed'; end if;

  if exists (select 1 from public.purchasing_lists l
    where l.company_id = source.company_id and lower(btrim(l.name)) = 'test'
      and l.archived_at is null and l.id <> source.id) then
    raise exception 'Another active test kit exists; never overwrite or duplicate';
  end if;

  select * into target from public.purchasing_lists where id = source.id for update;
  if found then
    if target.company_id <> source.company_id or target.created_by <> source.owner_user_id
      or target.visibility <> source.visibility or target.name <> source.name
      or target.archived_at is not null or target.is_system_favorites
      or target.description is distinct from source.description then
      raise exception 'Existing canonical identity is not the authorized recovery';
    end if;
    if not exists (select 1 from public.purchasing_list_events
      where list_id = source.id and event_type = 'restored'
        and metadata->>'task_id' = 'PARTNER-TEST-KIT-RECOVERY-AND-VISUAL-UX-CONSISTENCY-20260906'
        and metadata->>'source_table' = 'purchase_templates') then
      raise exception 'Existing identity has no exact recovery audit; no overwrite';
    end if;
  else
    -- Preserve original identity/owner/visibility; canonical prices and stock remain live.
    insert into public.purchasing_lists(id,company_id,name,description,visibility,created_by,updated_by)
    values(source.id,source.company_id,source.name,source.description,source.visibility,source.owner_user_id,source.owner_user_id);
    insert into public.purchasing_list_items(
      id,list_id,product_id,quantity,position,note,source_type,source_reference_id,
      source_unit_price,source_currency_code,product_name_snapshot,product_image_url_snapshot)
    select i.id,source.id,i.product_id,i.preferred_quantity::integer,i.sort_order,i.line_note,
      'duplicate',source.id,null,null,p.name,p.image_url
    from public.purchase_template_items i join public.catalog_products p on p.id=i.product_id
    where i.template_id=source.id order by i.sort_order,i.id;
    -- NULL actor is deliberate: operator recovery, not a fabricated partner action.
    insert into public.purchasing_list_events(list_id,actor_user_id,event_type,metadata)
    values(source.id,null,'restored',jsonb_build_object(
      'task_id','PARTNER-TEST-KIT-RECOVERY-AND-VISUAL-UX-CONSISTENCY-20260906',
      'method','COPY','source_table','purchase_templates','source_id',source.id,
      'source_revision',source.revision,'source_owner_user_id',source.owner_user_id,
      'source_created_at',source.created_at,'item_count',14,'total_quantity',107,
      'operator_recovery',true,'identity_preserved',true,'historical_commercials_copied',false));
  end if;

  select jsonb_agg(jsonb_build_array(id,product_id,quantity,position,note) order by position,id)
    into actual from public.purchasing_list_items where list_id=source.id;
  if actual is distinct from expected then raise exception 'Restored composition/quantity/order/note mismatch'; end if;
  if exists (select 1 from public.purchasing_list_items where list_id=source.id
    and (source_type <> 'duplicate' or source_reference_id is distinct from source.id
      or source_unit_price is not null or source_currency_code is not null)) then
    raise exception 'Incorrect provenance or historical commercial snapshot';
  end if;
end;
$recovery$;

-- Read-only integrity assertions above must all succeed; default run persists NOTHING.
rollback;

