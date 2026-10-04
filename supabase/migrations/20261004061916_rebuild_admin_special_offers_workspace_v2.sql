begin;

alter table public.commercial_campaigns
  add column if not exists draft_revision integer not null default 0,
  add column if not exists last_edit_request_id uuid null,
  add column if not exists duplicated_from_campaign_id uuid null references public.commercial_campaigns(id) on delete set null;

alter table public.commercial_campaigns drop constraint if exists commercial_campaigns_draft_revision_check;
alter table public.commercial_campaigns add constraint commercial_campaigns_draft_revision_check check (draft_revision between 0 and 2147483647);
alter table public.commercial_campaigns drop constraint if exists commercial_campaign_publication_check;
alter table public.commercial_campaigns add constraint commercial_campaign_publication_check check (
  (status = 'draft' and published_at is null and approved_by is null)
  or (status = 'archived' and ((current_version = 0 and published_at is null and approved_by is null) or (current_version > 0 and published_at is not null and approved_by is not null)))
  or (status in ('scheduled','active','paused','completed') and published_at is not null and approved_by is not null)
);

alter table public.commercial_campaign_audit_events drop constraint if exists commercial_campaign_audit_events_event_type_check;
alter table public.commercial_campaign_audit_events add constraint commercial_campaign_audit_events_event_type_check
  check (event_type in ('draft_created','draft_updated','published','paused','resumed','completed','archived','revision_created','duplicated'));

create table public.commercial_campaign_assets (
  path text primary key check (char_length(path) between 1 and 500 and path ~ '^/[A-Za-z0-9_./-]+$'),
  label text not null check (char_length(label) between 3 and 160),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.commercial_campaign_assets enable row level security;
revoke all on table public.commercial_campaign_assets from public, anon, authenticated;
grant all on table public.commercial_campaign_assets to service_role;
insert into public.commercial_campaign_assets(path, label) values
  ('/retail/security-installation-hero.webp', 'Безопасность и монтаж'),
  ('/brand/novotech-logo-dark.webp', 'Novotech — тёмный логотип'),
  ('/brand/novotech-logo-light.webp', 'Novotech — светлый логотип')
on conflict(path) do update set label = excluded.label, is_active = true;
insert into public.commercial_campaign_assets(path, label)
select distinct campaign.image_asset_path, 'Существующий управляемый ресурс'
from public.commercial_campaigns campaign
where campaign.image_asset_path is not null
on conflict(path) do nothing;

create index if not exists commercial_campaigns_workspace_idx on public.commercial_campaigns(status, campaign_type, updated_at desc, id);
create index if not exists commercial_campaigns_code_lower_idx on public.commercial_campaigns(lower(code));
create index if not exists commercial_campaigns_name_lower_idx on public.commercial_campaigns(lower(name));
create index if not exists commercial_campaigns_partner_title_lower_idx on public.commercial_campaigns(lower(partner_title));
create index if not exists commercial_campaigns_code_trgm_idx on public.commercial_campaigns using gin ((lower(code)) extensions.gin_trgm_ops);
create index if not exists commercial_campaigns_name_trgm_idx on public.commercial_campaigns using gin ((lower(name)) extensions.gin_trgm_ops);
create index if not exists commercial_campaigns_partner_title_trgm_idx on public.commercial_campaigns using gin ((lower(partner_title)) extensions.gin_trgm_ops);
create index if not exists catalog_products_campaign_sku_trgm_idx on public.catalog_products using gin ((lower(sku)) extensions.gin_trgm_ops) where is_active and is_visible;
create index if not exists catalog_products_campaign_name_trgm_idx on public.catalog_products using gin ((lower(name)) extensions.gin_trgm_ops) where is_active and is_visible;
create index if not exists partner_companies_campaign_name_trgm_idx on public.partner_companies using gin ((lower(display_name)) extensions.gin_trgm_ops) where status='active';

create or replace function public.list_admin_commercial_campaigns_v2(
  p_status text default null,
  p_search text default '',
  p_campaign_type text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_limit not between 1 and 50 or p_offset < 0
    or (p_status is not null and p_status not in ('draft','scheduled','active','paused','completed','archived'))
    or (p_campaign_type is not null and p_campaign_type not in ('product_offer','stock_clearance','arrival_promotion','reorder_campaign','category_campaign','partner_segment_offer'))
    or char_length(coalesce(p_search,'')) > 100 then raise exception 'CAMPAIGN_FILTER_INVALID' using errcode='22023'; end if;
  with filtered as materialized (
    select campaign.*
    from public.commercial_campaigns campaign
    where (p_status is null or campaign.status = p_status)
      and (p_campaign_type is null or campaign.campaign_type = p_campaign_type)
      and (p_date_from is null or campaign.ends_at >= p_date_from)
      and (p_date_to is null or campaign.starts_at < p_date_to + interval '1 day')
      and (nullif(btrim(p_search),'') is null or lower(campaign.code) like '%'||lower(btrim(p_search))||'%' or lower(campaign.name) like '%'||lower(btrim(p_search))||'%' or lower(campaign.partner_title) like '%'||lower(btrim(p_search))||'%')
  ), page as (
    select filtered.* from filtered order by filtered.updated_at desc, filtered.id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(page) || jsonb_build_object(
      'item_count', (select count(*) from public.commercial_campaign_items item where item.campaign_id=page.id),
      'audience_count', case when page.current_version > 0 then (select count(*) from public.commercial_campaign_audience_snapshots snapshot where snapshot.campaign_id=page.id and snapshot.version_number=page.current_version and snapshot.included) else (select count(*) from public.commercial_campaign_audience_rules rule where rule.campaign_id=page.id) end
    ) order by page.updated_at desc, page.id), '[]'::jsonb),
    'totalCount', (select count(*) from filtered)
  ) into v_result from page;
  return coalesce(v_result, jsonb_build_object('items','[]'::jsonb,'totalCount',0));
end $$;

create or replace function public.search_commercial_campaign_products_v2(
  p_search text default '', p_category_id uuid default null, p_brand_id uuid default null,
  p_in_stock_only boolean default false, p_limit integer default 25, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not (public.has_internal_permission('campaigns.create') or public.has_internal_permission('campaigns.edit')) then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_limit not between 1 and 50 or p_offset < 0 or char_length(coalesce(p_search,'')) > 100 then raise exception 'CAMPAIGN_SEARCH_INVALID' using errcode='22023'; end if;
  with recursive category_scope as (
    select category.id from public.catalog_categories category where category.id=p_category_id and category.is_active
    union all select child.id from public.catalog_categories child join category_scope parent on child.parent_id=parent.id where child.is_active
  ), base as materialized (
    select product.id, product.sku, model.display_value model, product.name, product.image_url,
      product.category_id, category.name category_name, product.brand_id, brand.name brand_name,
      case when stock.is_published and stock.freshness_state='authoritative' then stock.available_quantity end available_quantity,
      case when price.price_amount is null then null else jsonb_build_object('amount',price.price_amount,'currency',price.currency) end current_price
    from public.catalog_products product
    left join public.catalog_categories category on category.id=product.category_id and category.is_active
    left join public.catalog_brands brand on brand.id=product.brand_id and brand.is_active
    left join public.product_stock_totals stock on stock.product_id=product.id
    left join lateral (
      select attribute.display_value from public.catalog_product_attributes attribute
      where attribute.product_id=product.id and attribute.is_visible and (lower(attribute.attribute_key) in ('model','model_name') or lower(attribute.label) in ('model','модель'))
      order by attribute.is_filterable desc, attribute.id limit 1
    ) model on true
    left join lateral (
      select product_price.price_amount, product_price.currency from public.product_prices product_price
      join public.price_types price_type on price_type.id=product_price.price_type_id
      where product_price.product_id=product.id and price_type.external_code='UU-000020' and product_price.is_active and product_price.is_published and product_price.currency_status='resolved'
      order by product_price.effective_at desc, product_price.id desc limit 1
    ) price on true
    where product.is_active and product.is_visible
      and (p_category_id is null or product.category_id in (select scoped.id from category_scope scoped))
      and (p_brand_id is null or product.brand_id=p_brand_id)
      and (not p_in_stock_only or stock.is_published and stock.freshness_state='authoritative' and stock.available_quantity>0)
      and (nullif(btrim(p_search),'') is null or lower(product.sku) like '%'||lower(btrim(p_search))||'%' or lower(product.name) like '%'||lower(btrim(p_search))||'%' or lower(coalesce(model.display_value,'')) like '%'||lower(btrim(p_search))||'%')
  ), page as (select * from base order by lower(name),id limit p_limit offset p_offset)
  select jsonb_build_object('totalCount',(select count(*) from base),'items',coalesce(jsonb_agg(jsonb_build_object(
    'id',page.id,'sku',page.sku,'model',page.model,'name',page.name,'imageUrl',page.image_url,
    'categoryId',page.category_id,'categoryName',page.category_name,'brandId',page.brand_id,'brandName',page.brand_name,
    'availableQuantity',page.available_quantity,'currentPrice',page.current_price
  ) order by lower(page.name),page.id),'[]'::jsonb)) into v_result from page;
  return coalesce(v_result,jsonb_build_object('totalCount',0,'items','[]'::jsonb));
end $$;

create or replace function public.search_commercial_campaign_companies_v1(p_search text default '', p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not (public.has_internal_permission('campaigns.create') or public.has_internal_permission('campaigns.edit')) then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_limit not between 1 and 50 or p_offset<0 or char_length(coalesce(p_search,''))>100 then raise exception 'CAMPAIGN_SEARCH_INVALID' using errcode='22023'; end if;
  with filtered as materialized (
    select company.id,company.display_name name,company.status from public.partner_companies company
    where company.status='active' and (nullif(btrim(p_search),'') is null or lower(company.display_name) like '%'||lower(btrim(p_search))||'%')
  ), page as (select * from filtered order by lower(name),id limit p_limit offset p_offset)
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(page) order by lower(page.name),page.id),'[]'::jsonb),'totalCount',(select count(*) from filtered)) into v_result from page;
  return coalesce(v_result,jsonb_build_object('items','[]'::jsonb,'totalCount',0));
end $$;

create or replace function public.get_commercial_campaign_builder_options_v2(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare v_initial jsonb;
begin
  if auth.uid() is null or not (public.has_internal_permission('campaigns.create') or public.has_internal_permission('campaigns.edit')) then raise exception 'Forbidden' using errcode='42501'; end if;
  v_initial:=public.search_commercial_campaign_products_v2(coalesce(p_search,''),null,null,false,25,0);
  return jsonb_build_object(
    'products',coalesce(v_initial->'items','[]'::jsonb),'productTotalCount',coalesce((v_initial->>'totalCount')::integer,0),
    'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',category.id,'parentId',category.parent_id,'name',category.name) order by category.sort_order,lower(category.name),category.id),'[]'::jsonb) from public.catalog_categories category where category.is_active),
    'brands',(select coalesce(jsonb_agg(jsonb_build_object('id',brand.id,'name',brand.name) order by brand.sort_order,lower(brand.name),brand.id),'[]'::jsonb) from public.catalog_brands brand where brand.is_active),
    'companies',coalesce((public.search_commercial_campaign_companies_v1('',25,0))->'items','[]'::jsonb),
    'priceProfiles',(select coalesce(jsonb_agg(jsonb_build_object('reference',profile.external_ref,'code',profile.external_code,'name',profile.name,'currency',profile.currency_code) order by lower(profile.name),profile.id),'[]'::jsonb) from public.price_types profile where profile.is_active and exists(select 1 from public.product_prices price where price.price_type_id=profile.id and price.is_active and price.is_published and price.currency_status='resolved')),
    'assets',(select coalesce(jsonb_agg(jsonb_build_object('path',asset.path,'label',asset.label) order by lower(asset.label),asset.path),'[]'::jsonb) from public.commercial_campaign_assets asset where asset.is_active)
  );
end $$;

create or replace function public.get_admin_commercial_campaign_v2(p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  select jsonb_build_object(
    'campaign',to_jsonb(campaign),
    'items',(select coalesce(jsonb_agg(to_jsonb(item)||jsonb_build_object(
      'sku',product.sku,'productName',product.name,'model',model.display_value,'imageUrl',product.image_url,
      'categoryId',product.category_id,'categoryName',category.name,'brandId',product.brand_id,'brandName',brand.name,
      'availableQuantity',case when stock.is_published and stock.freshness_state='authoritative' then stock.available_quantity end,
      'currentPrice',case when price.price_amount is null then null else jsonb_build_object('amount',price.price_amount,'currency',price.currency) end
    ) order by item.sort_order,item.id),'[]'::jsonb)
      from public.commercial_campaign_items item join public.catalog_products product on product.id=item.product_id
      left join public.catalog_categories category on category.id=product.category_id
      left join public.catalog_brands brand on brand.id=product.brand_id
      left join public.product_stock_totals stock on stock.product_id=product.id
      left join lateral(select attribute.display_value from public.catalog_product_attributes attribute where attribute.product_id=product.id and attribute.is_visible and lower(attribute.attribute_key) in ('model','model_name') order by attribute.is_filterable desc,attribute.id limit 1) model on true
      left join lateral(select product_price.price_amount,product_price.currency from public.product_prices product_price join public.price_types price_type on price_type.id=product_price.price_type_id where product_price.product_id=product.id and price_type.external_code='UU-000020' and product_price.is_active and product_price.is_published and product_price.currency_status='resolved' order by product_price.effective_at desc,product_price.id desc limit 1) price on true
      where item.campaign_id=campaign.id),
    'rules',(select coalesce(jsonb_agg(to_jsonb(rule)||jsonb_build_object('companyName',company.display_name) order by rule.id),'[]'::jsonb) from public.commercial_campaign_audience_rules rule left join public.partner_companies company on rule.rule_type='explicit_company' and company.id=(rule.criterion->>'companyId')::uuid where rule.campaign_id=campaign.id),
    'audience',(select coalesce(jsonb_agg(to_jsonb(audience) order by audience.company_id),'[]'::jsonb) from public.commercial_campaign_audience_snapshots audience where audience.campaign_id=campaign.id and audience.version_number=campaign.current_version),
    'analytics',jsonb_build_object(
      'impressions',(select count(*) from public.commercial_campaign_engagement_events where campaign_id=campaign.id and event_type='impression'),
      'opens',(select count(*) from public.commercial_campaign_engagement_events where campaign_id=campaign.id and event_type='detail_opened'),
      'carts',(select count(*) from public.commercial_campaign_engagement_events where campaign_id=campaign.id and event_type='added_to_cart'),
      'orders',(select count(distinct order_id) from public.commercial_campaign_order_attributions where campaign_id=campaign.id),
      'attributedQuantity',(select coalesce(sum(quantity),0) from public.commercial_campaign_order_attributions where campaign_id=campaign.id)
    )
  ) into v_result from public.commercial_campaigns campaign where campaign.id=p_campaign_id;
  return v_result;
end $$;

create or replace function public.apply_commercial_campaign_draft_v2(p_campaign_id uuid,p_expected_revision integer,p_request_id uuid,p_input jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare v_target public.commercial_campaigns;v_item jsonb;v_company jsonb;v_mode text;v_starts timestamptz;v_ends timestamptz;v_revision integer;
begin
  if p_actor is null or p_actor is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_campaign_id is null or p_request_id is null or p_expected_revision<0 or coalesce(jsonb_typeof(p_input),'')<>'object' or p_input->>'contractVersion'<>'2' then raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode='22023'; end if;
  select * into v_target from public.commercial_campaigns where id=p_campaign_id for update;
  if v_target.id is null then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002'; end if;
  if v_target.status<>'draft' then raise exception 'CAMPAIGN_DRAFT_REQUIRED' using errcode='23514'; end if;
  if v_target.last_edit_request_id=p_request_id then return jsonb_build_object('campaignId',v_target.id,'revision',v_target.draft_revision,'idempotent',true); end if;
  if v_target.draft_revision<>p_expected_revision then raise exception 'CAMPAIGN_DRAFT_CONFLICT' using errcode='40001'; end if;
  if coalesce(p_input->>'code','')!~'^[A-Z0-9][A-Z0-9_-]{2,39}$' or char_length(btrim(coalesce(p_input->>'name',''))) not between 3 and 160 or char_length(btrim(coalesce(p_input->>'partnerTitle',''))) not between 3 and 160 or char_length(btrim(coalesce(p_input->>'partnerDescription',''))) not between 10 and 2000 or char_length(btrim(coalesce(p_input->>'termsSummary',''))) not between 3 and 1000 or char_length(coalesce(p_input->>'internalNote',''))>2000 then raise exception 'CAMPAIGN_COPY_INVALID' using errcode='22023'; end if;
  if coalesce(p_input->>'campaignType','') not in ('product_offer','stock_clearance','arrival_promotion','reorder_campaign','category_campaign','partner_segment_offer') or coalesce(p_input->>'priority','')!~'^[0-9]{1,4}$' or (p_input->>'priority')::integer not between 0 and 1000 then raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode='22023'; end if;
  begin v_starts:=(p_input->>'startsAt')::timestamptz;v_ends:=(p_input->>'endsAt')::timestamptz;exception when others then raise exception 'CAMPAIGN_PERIOD_INVALID' using errcode='22023';end;
  if v_ends<=v_starts then raise exception 'CAMPAIGN_PERIOD_INVALID' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_input->>'imageAssetPath','')),'') is not null and not exists(select 1 from public.commercial_campaign_assets asset where asset.path=btrim(p_input->>'imageAssetPath') and asset.is_active) then raise exception 'CAMPAIGN_IMAGE_INVALID' using errcode='22023'; end if;
  if coalesce(jsonb_typeof(p_input->'items'),'')<>'array' or jsonb_array_length(p_input->'items') not between 1 and 50 or jsonb_array_length(p_input->'items')<>(select count(distinct item->>'productId') from jsonb_array_elements(p_input->'items') item) then raise exception 'CAMPAIGN_PRODUCTS_INVALID' using errcode='22023'; end if;
  v_mode:=coalesce(p_input->>'audienceMode','');
  if v_mode not in ('explicit_company','all_active_partners','commercial_mode_full','commercial_mode_retail_only','momentum_slowing','momentum_attention') then raise exception 'CAMPAIGN_AUDIENCE_INVALID' using errcode='22023'; end if;
  if v_mode='explicit_company' and (coalesce(jsonb_typeof(p_input->'companyIds'),'')<>'array' or jsonb_array_length(p_input->'companyIds') not between 1 and 100 or jsonb_array_length(p_input->'companyIds')<>(select count(distinct value::text) from jsonb_array_elements(p_input->'companyIds'))) then raise exception 'CAMPAIGN_AUDIENCE_INVALID' using errcode='22023'; end if;
  if p_input?'finalPrice' or p_input?'discountAmount' then raise exception 'CAMPAIGN_PRICE_OWNERSHIP_DENIED' using errcode='22023'; end if;
  begin
    update public.commercial_campaigns set code=upper(btrim(p_input->>'code')),name=btrim(p_input->>'name'),partner_title=btrim(p_input->>'partnerTitle'),partner_description=btrim(p_input->>'partnerDescription'),internal_note=nullif(btrim(p_input->>'internalNote'),''),campaign_type=p_input->>'campaignType',starts_at=v_starts,ends_at=v_ends,priority=(p_input->>'priority')::integer,image_asset_path=nullif(btrim(p_input->>'imageAssetPath'),''),terms_summary=btrim(p_input->>'termsSummary'),draft_revision=draft_revision+1,last_edit_request_id=p_request_id,updated_at=now() where id=v_target.id returning draft_revision into v_revision;
  exception when unique_violation then raise exception 'CAMPAIGN_CODE_CONFLICT' using errcode='23505';end;
  delete from public.commercial_campaign_items where campaign_id=v_target.id;
  for v_item in select value from jsonb_array_elements(p_input->'items') loop
    if coalesce(v_item->>'productId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or coalesce(v_item->>'minimumQuantity','')!~'^[0-9]{1,4}$' or coalesce(v_item->>'sortOrder','')!~'^[0-9]{1,5}$' or coalesce(v_item->>'benefitType','') not in ('informational_only','existing_price_profile') or char_length(coalesce(v_item->>'partnerMessage',''))>500 or v_item?'finalPrice' or v_item?'discountAmount' then raise exception 'CAMPAIGN_PRODUCT_INVALID' using errcode='22023'; end if;
    if (v_item->>'minimumQuantity')::integer not between 1 and 9999 or nullif(v_item->>'maximumQuantityPerCompany','') is not null and ((v_item->>'maximumQuantityPerCompany')::integer<(v_item->>'minimumQuantity')::integer or (v_item->>'maximumQuantityPerCompany')::integer>999999) then raise exception 'CAMPAIGN_PRODUCT_LIMIT_INVALID' using errcode='22023'; end if;
    if v_item->>'benefitType'='informational_only' and nullif(btrim(coalesce(v_item->>'governedBenefitReference','')),'') is not null then raise exception 'CAMPAIGN_PROFILE_INVALID' using errcode='22023'; end if;
    if v_item->>'benefitType'='existing_price_profile' and not exists(select 1 from public.price_types profile join public.product_prices price on price.price_type_id=profile.id and price.product_id=(v_item->>'productId')::uuid and price.is_active and price.is_published and price.currency_status='resolved' where profile.is_active and profile.external_ref=v_item->>'governedBenefitReference') then raise exception 'CAMPAIGN_PROFILE_INVALID' using errcode='22023'; end if;
    insert into public.commercial_campaign_items(campaign_id,product_id,sort_order,minimum_quantity,maximum_quantity_per_company,benefit_type,governed_benefit_reference,partner_message)
    select v_target.id,(v_item->>'productId')::uuid,(v_item->>'sortOrder')::integer,(v_item->>'minimumQuantity')::integer,nullif(v_item->>'maximumQuantityPerCompany','')::integer,v_item->>'benefitType',nullif(btrim(v_item->>'governedBenefitReference'),''),nullif(btrim(v_item->>'partnerMessage'),'') from public.catalog_products product where product.id=(v_item->>'productId')::uuid and product.is_active and product.is_visible;
    if not found then raise exception 'CAMPAIGN_PRODUCT_UNAVAILABLE' using errcode='23514'; end if;
  end loop;
  delete from public.commercial_campaign_audience_rules where campaign_id=v_target.id;
  if v_mode='explicit_company' then
    for v_company in select value from jsonb_array_elements(p_input->'companyIds') loop
      if trim(both '"' from v_company::text)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or not exists(select 1 from public.partner_companies company where company.id=trim(both '"' from v_company::text)::uuid and company.status='active') then raise exception 'CAMPAIGN_AUDIENCE_INVALID' using errcode='22023'; end if;
      insert into public.commercial_campaign_audience_rules(campaign_id,rule_type,criterion) values(v_target.id,'explicit_company',jsonb_build_object('companyId',trim(both '"' from v_company::text)));
    end loop;
  elsif v_mode='all_active_partners' then insert into public.commercial_campaign_audience_rules(campaign_id,rule_type) values(v_target.id,'all_active_partners');
  elsif v_mode like 'momentum_%' then insert into public.commercial_campaign_audience_rules(campaign_id,rule_type,criterion) values(v_target.id,'momentum_status',case when v_mode='momentum_slowing' then jsonb_build_object('statuses',jsonb_build_array('slowing'),'maxScore',59) else jsonb_build_object('statuses',jsonb_build_array('attention_required','high_risk'),'maxScore',39) end);
  else insert into public.commercial_campaign_audience_rules(campaign_id,rule_type,criterion) values(v_target.id,'commercial_mode',jsonb_build_object('mode',case when v_mode='commercial_mode_full' then 'full' else 'retail_only' end)); end if;
  insert into public.commercial_campaign_audit_events(campaign_id,event_type,actor_user_id,reason,safe_metadata) values(v_target.id,'draft_updated',p_actor,'Campaign draft updated',jsonb_build_object('requestId',p_request_id,'revision',v_revision,'itemCount',jsonb_array_length(p_input->'items')));
  return jsonb_build_object('campaignId',v_target.id,'revision',v_revision,'idempotent',false);
end $$;

revoke all on function public.apply_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb,uuid) from public,anon,authenticated;

create or replace function public.update_commercial_campaign_draft_v2(p_campaign_id uuid,p_expected_revision integer,p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not public.has_internal_permission('campaigns.edit') then raise exception 'Forbidden' using errcode='42501'; end if;
  return public.apply_commercial_campaign_draft_v2(p_campaign_id,p_expected_revision,p_request_id,p_input,v_actor);
end $$;

create or replace function public.duplicate_commercial_campaign_v1(p_campaign_id uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare v_actor uuid:=auth.uid();v_source public.commercial_campaigns;v_target uuid;v_code text;
begin
  if v_actor is null or not public.has_internal_permission('campaigns.create') then raise exception 'Forbidden' using errcode='42501'; end if;
  select id into v_target from public.commercial_campaigns where created_by=v_actor and creation_request_id=p_request_id;if found then return v_target;end if;
  select * into v_source from public.commercial_campaigns where id=p_campaign_id for share;if v_source.id is null then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
  v_code:=left(v_source.code,27)||'_COPY_'||upper(substr(replace(p_request_id::text,'-',''),1,6));
  insert into public.commercial_campaigns(code,name,partner_title,partner_description,internal_note,campaign_type,starts_at,ends_at,priority,image_asset_path,terms_summary,created_by,creation_request_id,duplicated_from_campaign_id)
  values(v_code,left(v_source.name||' — копия',160),v_source.partner_title,v_source.partner_description,v_source.internal_note,v_source.campaign_type,v_source.starts_at,v_source.ends_at,v_source.priority,v_source.image_asset_path,v_source.terms_summary,v_actor,p_request_id,v_source.id) returning id into v_target;
  insert into public.commercial_campaign_items(campaign_id,product_id,sort_order,minimum_quantity,maximum_quantity_per_company,benefit_type,governed_benefit_reference,partner_message) select v_target,product_id,sort_order,minimum_quantity,maximum_quantity_per_company,benefit_type,governed_benefit_reference,partner_message from public.commercial_campaign_items where campaign_id=v_source.id;
  insert into public.commercial_campaign_audience_rules(campaign_id,rule_type,criterion) select v_target,rule_type,criterion from public.commercial_campaign_audience_rules where campaign_id=v_source.id;
  insert into public.commercial_campaign_audit_events(campaign_id,event_type,actor_user_id,reason,safe_metadata) values(v_target,'duplicated',v_actor,'Campaign duplicated into draft',jsonb_build_object('sourceCampaignId',v_source.id,'requestId',p_request_id));
  return v_target;
end $$;

create or replace function public.create_commercial_campaign_draft_v2(p_input jsonb)
returns uuid language plpgsql security definer set search_path='' set row_security=off as $$
declare v_actor uuid:=auth.uid();v_target uuid;v_request uuid;v_v1 jsonb;v_items jsonb;
begin
  if v_actor is null or not public.has_internal_permission('campaigns.create') then raise exception 'Forbidden' using errcode='42501';end if;
  if coalesce(jsonb_typeof(p_input),'')<>'object' or p_input->>'contractVersion'<>'2' or coalesce(p_input->>'requestId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'CAMPAIGN_REQUEST_INVALID' using errcode='22023';end if;
  v_request:=(p_input->>'requestId')::uuid;
  select campaign.id into v_target from public.commercial_campaigns campaign where campaign.created_by=v_actor and campaign.creation_request_id=v_request;
  if found then
    if exists(select 1 from public.commercial_campaigns campaign where campaign.id=v_target and campaign.last_edit_request_id=v_request) then return v_target;end if;
  else
    select coalesce(jsonb_agg(item.value||jsonb_build_object('benefitType','informational_only','governedBenefitReference',null) order by item.ordinality),'[]'::jsonb) into v_items from jsonb_array_elements(p_input->'items') with ordinality item(value,ordinality);
    v_v1:=jsonb_set(jsonb_set(p_input,'{contractVersion}','"1"'::jsonb),'{items}',v_items);
    v_target:=public.create_commercial_campaign_draft(v_v1);
  end if;
  perform public.apply_commercial_campaign_draft_v2(v_target,0,v_request,p_input,v_actor);
  return v_target;
end $$;

create or replace function public.archive_commercial_campaign_v1(p_campaign_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' set row_security=off as $$
declare v_actor uuid:=auth.uid();v_target public.commercial_campaigns;
begin
  if v_actor is null or not public.has_internal_permission('campaigns.edit') then raise exception 'Forbidden' using errcode='42501';end if;
  select * into v_target from public.commercial_campaigns where id=p_campaign_id for update;if v_target.id is null then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
  if v_target.status='archived' then return true;end if;if v_target.status not in ('draft','paused','completed') then raise exception 'CAMPAIGN_ARCHIVE_STATE_INVALID' using errcode='23514';end if;
  update public.commercial_campaigns set status='archived',archived_at=now(),updated_at=now() where id=v_target.id;
  delete from public.partner_search_documents where document_key like 'commercial_campaign:'||v_target.id::text||':%';
  insert into public.commercial_campaign_audit_events(campaign_id,version_number,event_type,actor_user_id,reason) values(v_target.id,nullif(v_target.current_version,0),'archived',v_actor,left(btrim(p_reason),500));return true;
end $$;

create or replace function public.resume_commercial_campaign_v1(p_campaign_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' set row_security=off as $$
declare v_actor uuid:=auth.uid();v_target public.commercial_campaigns;v_status text;
begin
  if v_actor is null or not public.has_internal_permission('campaigns.pause') then raise exception 'Forbidden' using errcode='42501';end if;
  select * into v_target from public.commercial_campaigns where id=p_campaign_id for update;if v_target.id is null then raise exception 'CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
  if v_target.status<>'paused' or v_target.current_version=0 or v_target.ends_at<=now() then raise exception 'CAMPAIGN_RESUME_STATE_INVALID' using errcode='23514';end if;
  v_status:=case when v_target.starts_at>now() then 'scheduled' else 'active' end;
  update public.commercial_campaigns set status=v_status,updated_at=now() where id=v_target.id;
  insert into public.commercial_campaign_audit_events(campaign_id,version_number,event_type,actor_user_id,reason) values(v_target.id,v_target.current_version,'resumed',v_actor,left(btrim(p_reason),500));
  if v_status='active' then perform public.project_commercial_campaign_search(v_target.id);end if;return true;
end $$;

alter function public.publish_commercial_campaign(uuid,uuid) rename to publish_commercial_campaign_pre_workspace_v2;
revoke all on function public.publish_commercial_campaign_pre_workspace_v2(uuid,uuid) from public,anon,authenticated;
create function public.publish_commercial_campaign(p_campaign_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' set row_security=off as $$
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.publish') then raise exception 'Forbidden' using errcode='42501';end if;
  if exists(
    select 1 from public.commercial_campaign_items item
    where item.campaign_id=p_campaign_id and item.benefit_type='existing_price_profile'
      and not exists(select 1 from public.price_types profile join public.product_prices price on price.price_type_id=profile.id and price.product_id=item.product_id and price.is_active and price.is_published and price.currency_status='resolved' where profile.is_active and profile.external_ref=item.governed_benefit_reference)
  ) then raise exception 'CAMPAIGN_PROFILE_INVALID' using errcode='23514';end if;
  return public.publish_commercial_campaign_pre_workspace_v2(p_campaign_id,p_request_id);
end $$;

revoke all on function public.list_admin_commercial_campaigns_v2(text,text,text,timestamptz,timestamptz,integer,integer),public.search_commercial_campaign_products_v2(text,uuid,uuid,boolean,integer,integer),public.search_commercial_campaign_companies_v1(text,integer,integer),public.get_commercial_campaign_builder_options_v2(text),public.get_admin_commercial_campaign_v2(uuid),public.update_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb),public.create_commercial_campaign_draft_v2(jsonb),public.duplicate_commercial_campaign_v1(uuid,uuid),public.archive_commercial_campaign_v1(uuid,text),public.resume_commercial_campaign_v1(uuid,text),public.publish_commercial_campaign(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_admin_commercial_campaigns_v2(text,text,text,timestamptz,timestamptz,integer,integer),public.search_commercial_campaign_products_v2(text,uuid,uuid,boolean,integer,integer),public.search_commercial_campaign_companies_v1(text,integer,integer),public.get_commercial_campaign_builder_options_v2(text),public.get_admin_commercial_campaign_v2(uuid),public.update_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb),public.create_commercial_campaign_draft_v2(jsonb),public.duplicate_commercial_campaign_v1(uuid,uuid),public.archive_commercial_campaign_v1(uuid,text),public.resume_commercial_campaign_v1(uuid,text),public.publish_commercial_campaign(uuid,uuid) to authenticated;

comment on function public.update_commercial_campaign_draft_v2(uuid,integer,uuid,jsonb) is 'Atomically updates one draft with optimistic concurrency, bounded governed products/audience, and idempotent request identity.';
comment on table public.commercial_campaign_assets is 'Governed allow-list of local presentation assets available to Special Offers.';

commit;
