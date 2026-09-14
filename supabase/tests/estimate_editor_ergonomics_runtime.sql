-- Run after the candidate migration, inside a transaction; all fixtures roll back.
do $$
<<fixture>>
declare
  actor uuid := 'a9140000-0000-4000-8000-000000000001';
  outsider uuid := 'a9140000-0000-4000-8000-000000000002';
  company uuid := 'b9140000-0000-4000-8000-000000000001';
  estimate_id uuid := 'c9140000-0000-4000-8000-000000000001';
  product uuid := 'd9140000-0000-4000-8000-000000000001';
  section_id uuid;
  material_section uuid;
  revision_before integer;
  result jsonb;
  line_input jsonb;
  section_input jsonb;
  saved_input jsonb;
  settings_input jsonb;
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at) values
    (actor, 'authenticated', 'authenticated', 'editor-owner@example.test', now(), now()),
    (outsider, 'authenticated', 'authenticated', 'editor-outsider@example.test', now(), now());
  insert into public.user_profiles(id,email,full_name,status,user_type) values
    (actor,'editor-owner@example.test','Editor owner','active','external'),
    (outsider,'editor-outsider@example.test','Editor outsider','active','external');
  insert into public.partner_companies(id,external_1c_id,display_name,status) values(company,'EDITOR-TEST','Editor test','active');
  insert into public.company_memberships(user_id,company_id,role_id,status,approved_at)
    select actor,company,id,'active',now() from public.roles where code='partner_owner';
  insert into public.catalog_products(id,external_1c_id,sku,name,slug,is_active,is_visible)
    values(product,'EDITOR-PRODUCT','EDITOR-PRODUCT','Editor fixture','editor-fixture',true,true);
  insert into public.price_types(external_ref,name,currency_code,currency_status,is_active) values('EDITOR-USD','Editor USD','USD','resolved',true);
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub',actor,'role','authenticated')::text, true);
  insert into public.estimates(id,company_id,created_by,estimate_number,name,currency_code,currency_rate,currency_rate_effective_date,status)
    values(estimate_id,company,actor,'EDITOR-TEST','Editor test','USD',1,current_date,'draft');
  section_id := public.initialize_canonical_estimate_sections(estimate_id);
  select s.id into material_section from public.estimate_sections s where s.estimate_id=fixture.estimate_id and s.system_key='installation_materials';
  select e.revision into revision_before from public.estimates e where e.id=fixture.estimate_id;
  line_input := jsonb_build_array(jsonb_build_object('line_type','product','product_id',product,'sku_snapshot','EDITOR-PRODUCT','product_name_snapshot','Camera','source_snapshot_at',now(),'description','Camera','quantity',2,'unit','pcs','selling_unit_price',100,'source_unit_price',80,'source_currency_code','USD','exchange_rate',1));
  result := public.quick_add_estimate_item(estimate_id,revision_before,section_id,'e9140000-0000-4000-8000-000000000001',repeat('a',64),line_input);
  if (select count(*) from public.estimate_items i where i.estimate_id=fixture.estimate_id) <> 1 then raise exception 'Insert failed'; end if;
  -- Retry the same command with the original revision: exactly-once.
  result := public.quick_add_estimate_item(estimate_id,revision_before,section_id,'e9140000-0000-4000-8000-000000000001',repeat('a',64),line_input);
  if result->>'repeated' <> 'true' then raise exception 'Retry failed'; end if;
  select e.revision into revision_before from public.estimates e where e.id=fixture.estimate_id;
  result := public.quick_add_estimate_item(estimate_id,revision_before,section_id,'e9140000-0000-4000-8000-000000000002',repeat('b',64),line_input);
  if (select count(*) from public.estimate_items i where i.estimate_id=fixture.estimate_id) <> 1
    or (select i.quantity from public.estimate_items i where i.estimate_id=fixture.estimate_id) <> 4
    or (select i.selling_unit_price from public.estimate_items i where i.estimate_id=fixture.estimate_id) <> 100
    or (select e.total_amount from public.estimates e where e.id=fixture.estimate_id) <> 400 then raise exception 'Merge commercial invariants failed'; end if;
  begin
    perform public.quick_add_estimate_item(estimate_id,revision_before,section_id,'e9140000-0000-4000-8000-000000000003',repeat('c',64),line_input);
    raise exception 'Stale revision accepted';
  exception when sqlstate 'PT409' then null;
  end;
  select e.revision into revision_before from public.estimates e where e.id=fixture.estimate_id;
  perform public.quick_add_estimate_item(estimate_id,revision_before,material_section,'e9140000-0000-4000-8000-000000000003',repeat('c',64),line_input);
  if (select count(*) from public.estimate_items i where i.estimate_id=fixture.estimate_id) <> 2 then raise exception 'Contexts were merged'; end if;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  begin
    perform public.quick_add_estimate_item(estimate_id,revision_before,section_id,'e9140000-0000-4000-8000-000000000004',repeat('d',64),line_input);
    raise exception 'Cross-company access accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  -- Rename via the real commercial-save RPC, including its temporary sort-order swap.
  select jsonb_agg(to_jsonb(s) || jsonb_build_object('name',case when s.id=section_id then 'Renamed equipment' else s.name end) order by s.sort_order) into section_input from public.estimate_sections s where s.estimate_id=fixture.estimate_id;
  select jsonb_agg(to_jsonb(i) order by i.position) into saved_input from public.estimate_items i where i.estimate_id=fixture.estimate_id;
  select to_jsonb(e), e.revision into settings_input, revision_before from public.estimates e where e.id=fixture.estimate_id;
  perform public.save_estimate_commercial_draft(estimate_id,revision_before,settings_input,section_input,saved_input,'[]'::jsonb);
  if not exists(select 1 from public.estimate_sections s where s.id=section_id and s.name='Renamed equipment' and s.system_key='equipment' and s.sort_order=0 and s.show_subtotal and s.discount_percent=0) then raise exception 'Rename/save failed'; end if;
  begin
    update public.estimate_sections set system_key='commissioning_works' where id=section_id;
    raise exception 'Section identity mutation accepted';
  exception when check_violation then null;
  end;
  if has_function_privilege('anon','public.quick_add_estimate_item(uuid,integer,uuid,uuid,text,jsonb)','execute') then raise exception 'Anonymous grant exposed'; end if;
  if not has_function_privilege('authenticated','public.quick_add_estimate_item(uuid,integer,uuid,uuid,text,jsonb)','execute') then raise exception 'Authenticated grant missing'; end if;
  raise notice 'PASS: insert, merge, idempotency, stale revision, separate sections, tenant guard, rename via Save, immutable structure, grants';
end;
$$;
