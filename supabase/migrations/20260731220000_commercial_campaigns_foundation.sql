-- Governed partner commercial campaigns. The portal targets and attributes
-- offers, while published 1C read models remain the commercial source of truth.

insert into public.permissions(code, description, scope, category, sensitive) values
  ('campaigns.view', 'View audience-eligible partner campaigns.', 'both', 'commercial', false),
  ('campaigns.create', 'Create commercial campaign drafts.', 'internal', 'commercial', true),
  ('campaigns.edit', 'Edit commercial campaign drafts.', 'internal', 'commercial', true),
  ('campaigns.publish', 'Publish governed commercial campaigns.', 'internal', 'commercial', true),
  ('campaigns.pause', 'Pause published commercial campaigns.', 'internal', 'commercial', true),
  ('campaigns.analytics.view', 'View aggregate campaign analytics.', 'internal', 'commercial', true)
on conflict (code) do update set
  description = excluded.description,
  scope = excluded.scope,
  category = excluded.category,
  sensitive = excluded.sensitive;

with grants(role_code, permission_code) as (values
  ('partner_owner', 'campaigns.view'),
  ('partner_manager', 'campaigns.view'),
  ('partner_buyer', 'campaigns.view'),
  ('partner_accounting', 'campaigns.view'),
  ('partner_viewer', 'campaigns.view'),
  ('novotech_admin', 'campaigns.view'),
  ('novotech_admin', 'campaigns.create'),
  ('novotech_admin', 'campaigns.edit'),
  ('novotech_admin', 'campaigns.publish'),
  ('novotech_admin', 'campaigns.pause'),
  ('novotech_admin', 'campaigns.analytics.view')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict do nothing;

create table public.commercial_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  name text not null check (char_length(name) between 3 and 160),
  partner_title text not null check (char_length(partner_title) between 3 and 160),
  partner_description text not null check (char_length(partner_description) between 10 and 2000),
  internal_note text null check (internal_note is null or char_length(internal_note) <= 2000),
  status text not null default 'draft' check (status in ('draft','scheduled','active','paused','completed','archived')),
  campaign_type text not null check (campaign_type in ('product_offer','stock_clearance','arrival_promotion','reorder_campaign','category_campaign','partner_segment_offer')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  priority integer not null default 100 check (priority between 0 and 1000),
  image_asset_path text null check (image_asset_path is null or image_asset_path ~ '^/[A-Za-z0-9_./-]{1,500}$'),
  terms_summary text not null check (char_length(terms_summary) between 3 and 1000),
  current_version integer not null default 0 check (current_version >= 0),
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  approved_by uuid null references public.user_profiles(id) on delete restrict,
  published_at timestamptz null,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_campaign_period_check check (ends_at > starts_at),
  constraint commercial_campaign_publication_check check (
    (status = 'draft' and published_at is null and approved_by is null)
    or (status <> 'draft' and published_at is not null and approved_by is not null)
  )
);

create table public.commercial_campaign_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.commercial_campaigns(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  minimum_quantity integer not null default 1 check (minimum_quantity between 1 and 9999),
  maximum_quantity_per_company integer null check (maximum_quantity_per_company between 1 and 999999),
  benefit_type text not null default 'informational_only' check (benefit_type in ('informational_only','existing_price_profile')),
  governed_benefit_reference text null check (governed_benefit_reference is null or char_length(governed_benefit_reference) <= 100),
  partner_message text null check (partner_message is null or char_length(partner_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, product_id),
  constraint campaign_item_limit_check check (maximum_quantity_per_company is null or maximum_quantity_per_company >= minimum_quantity),
  constraint campaign_item_benefit_check check (
    (benefit_type = 'informational_only' and governed_benefit_reference is null)
    or (benefit_type = 'existing_price_profile' and governed_benefit_reference is not null)
  )
);

create table public.commercial_campaign_audience_rules (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.commercial_campaigns(id) on delete cascade,
  rule_type text not null check (rule_type in ('explicit_company','all_active_partners','commercial_mode')),
  criterion jsonb not null default '{}'::jsonb check (jsonb_typeof(criterion) = 'object'),
  created_at timestamptz not null default now()
);

create table public.commercial_campaign_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.commercial_campaigns(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  campaign_snapshot jsonb not null check (jsonb_typeof(campaign_snapshot) = 'object'),
  item_snapshot jsonb not null check (jsonb_typeof(item_snapshot) = 'array'),
  audience_rule_snapshot jsonb not null check (jsonb_typeof(audience_rule_snapshot) = 'array'),
  published_by uuid not null references public.user_profiles(id) on delete restrict,
  published_at timestamptz not null default now(),
  unique(campaign_id, version_number)
);

create table public.commercial_campaign_audience_snapshots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.commercial_campaigns(id) on delete restrict,
  version_number integer not null,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  included boolean not null,
  eligibility_reason text not null check (eligibility_reason in ('explicit_company','all_active_partners','commercial_mode_full','commercial_mode_retail_only')),
  exclusion_reason text null check (exclusion_reason is null or exclusion_reason in ('company_inactive','commercial_profile_mismatch','no_active_members')),
  created_at timestamptz not null default now(),
  unique(campaign_id, version_number, company_id),
  foreign key(campaign_id, version_number) references public.commercial_campaign_versions(campaign_id, version_number) on delete restrict
);

create table public.commercial_campaign_audit_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.commercial_campaigns(id) on delete restrict,
  version_number integer null,
  event_type text not null check (event_type in ('draft_created','published','paused','completed','archived','revision_created')),
  actor_user_id uuid not null references public.user_profiles(id) on delete restrict,
  reason text not null check (char_length(reason) between 3 and 500),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.commercial_campaign_engagement_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  campaign_id uuid not null references public.commercial_campaigns(id) on delete restrict,
  campaign_item_id uuid null references public.commercial_campaign_items(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  user_id uuid not null references public.user_profiles(id) on delete restrict,
  event_type text not null check (event_type in ('impression','detail_opened','product_opened','added_to_cart')),
  quantity integer null check (quantity is null or quantity between 1 and 999999),
  created_at timestamptz not null default now()
);

create table public.commercial_campaign_order_attributions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.commercial_campaigns(id) on delete restrict,
  campaign_item_id uuid not null references public.commercial_campaign_items(id) on delete restrict,
  company_id uuid not null references public.partner_companies(id) on delete restrict,
  order_id uuid not null references public.partner_orders(id) on delete restrict,
  order_item_id uuid not null references public.partner_order_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  attribution_fingerprint text not null check (attribution_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(order_item_id, campaign_item_id)
);

alter table public.partner_notification_events drop constraint if exists partner_notification_events_code_check;
alter table public.partner_notification_events add constraint partner_notification_events_code_check check (event_code in (
  'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled',
  'shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled',
  'invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock',
  'watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed',
  'cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon'
));
alter table public.partner_notifications drop constraint if exists partner_notifications_event_code_check;
alter table public.partner_notifications add constraint partner_notifications_event_code_check check (event_code in (
  'order_submitted','order_confirmed','order_requires_attention','order_readback_failed','order_reconciliation_required','order_posted','order_cancelled',
  'shipment_due_in_3_days','shipment_due_today','shipment_overdue','shipment_date_changed','date_change_approved','date_change_rejected','date_change_cancelled',
  'invitation_expiring','invitation_accepted','employee_suspended','role_changed','price_access_changed','watched_product_back_in_stock',
  'watched_product_expected_arrival_added','watched_product_arrived','watched_product_price_changed','cart_product_price_changed',
  'cart_product_availability_changed','onboarding_approved','onboarding_access_opened','campaign_started','campaign_ending_soon'
));
alter table public.partner_notification_events drop constraint if exists partner_notification_events_group_check;
alter table public.partner_notification_events add constraint partner_notification_events_group_check check(event_group in ('orders','shipments','company_access','products','commercial'));
alter table public.partner_notifications drop constraint if exists partner_notifications_group_check;
alter table public.partner_notifications add constraint partner_notifications_group_check check(event_group in ('orders','shipments','company_access','products','commercial'));
alter table public.partner_notification_preferences drop constraint if exists partner_notification_preferences_group_check;
alter table public.partner_notification_preferences add constraint partner_notification_preferences_group_check check(event_group in ('orders','shipments','company_access','products','commercial'));

alter table public.cart_items
  add column campaign_id uuid null references public.commercial_campaigns(id) on delete set null,
  add column campaign_item_id uuid null references public.commercial_campaign_items(id) on delete set null,
  add column campaign_attribution_fingerprint text null check (campaign_attribution_fingerprint is null or campaign_attribution_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint cart_item_campaign_shape_check check (
    (campaign_id is null and campaign_item_id is null and campaign_attribution_fingerprint is null)
    or (campaign_id is not null and campaign_item_id is not null and campaign_attribution_fingerprint is not null)
  );

create index commercial_campaigns_admin_idx on public.commercial_campaigns(status, starts_at desc, id);
create index commercial_campaign_items_campaign_idx on public.commercial_campaign_items(campaign_id, sort_order, id);
create index commercial_campaign_audience_company_idx on public.commercial_campaign_audience_snapshots(company_id, included, campaign_id);
create index commercial_campaign_engagement_campaign_idx on public.commercial_campaign_engagement_events(campaign_id, event_type, created_at);
create index commercial_campaign_order_attribution_campaign_idx on public.commercial_campaign_order_attributions(campaign_id, created_at);
create index cart_items_campaign_idx on public.cart_items(campaign_id) where campaign_id is not null;

alter table public.commercial_campaigns enable row level security;
alter table public.commercial_campaign_items enable row level security;
alter table public.commercial_campaign_audience_rules enable row level security;
alter table public.commercial_campaign_versions enable row level security;
alter table public.commercial_campaign_audience_snapshots enable row level security;
alter table public.commercial_campaign_audit_events enable row level security;
alter table public.commercial_campaign_engagement_events enable row level security;
alter table public.commercial_campaign_order_attributions enable row level security;

revoke all on public.commercial_campaigns, public.commercial_campaign_items,
  public.commercial_campaign_audience_rules, public.commercial_campaign_versions,
  public.commercial_campaign_audience_snapshots, public.commercial_campaign_audit_events,
  public.commercial_campaign_engagement_events, public.commercial_campaign_order_attributions
  from public, anon, authenticated;
grant all on public.commercial_campaigns, public.commercial_campaign_items,
  public.commercial_campaign_audience_rules, public.commercial_campaign_versions,
  public.commercial_campaign_audience_snapshots, public.commercial_campaign_audit_events,
  public.commercial_campaign_engagement_events, public.commercial_campaign_order_attributions
  to service_role;

create or replace function public.prevent_commercial_campaign_history_mutation()
returns trigger language plpgsql as $$
begin raise exception 'Campaign history is append-only.' using errcode = '42501'; end;
$$;
create trigger immutable_campaign_versions before update or delete on public.commercial_campaign_versions for each row execute function public.prevent_commercial_campaign_history_mutation();
create trigger immutable_campaign_audience before update or delete on public.commercial_campaign_audience_snapshots for each row execute function public.prevent_commercial_campaign_history_mutation();
create trigger immutable_campaign_audit before update or delete on public.commercial_campaign_audit_events for each row execute function public.prevent_commercial_campaign_history_mutation();
create trigger immutable_campaign_order_attribution before update or delete on public.commercial_campaign_order_attributions for each row execute function public.prevent_commercial_campaign_history_mutation();
revoke all on function public.prevent_commercial_campaign_history_mutation() from public, anon, authenticated;

create or replace function public.create_commercial_campaign_draft(p_input jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); target_id uuid; item jsonb; company_value jsonb; audience_mode text;
begin
  if actor is null or not public.has_internal_permission('campaigns.create') then raise exception 'Forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) <> 'object' or jsonb_typeof(p_input->'items') <> 'array'
    or jsonb_array_length(p_input->'items') not between 1 and 50
    or coalesce(p_input->>'benefitType', 'informational_only') not in ('informational_only','existing_price_profile')
    or p_input ? 'finalPrice' or p_input ? 'discountAmount' then raise exception 'Invalid campaign' using errcode = '22023'; end if;
  audience_mode := coalesce(p_input->>'audienceMode', 'explicit_company');
  if audience_mode not in ('explicit_company','all_active_partners','commercial_mode_full','commercial_mode_retail_only') then raise exception 'Invalid audience' using errcode = '22023'; end if;
  insert into public.commercial_campaigns(code,name,partner_title,partner_description,internal_note,campaign_type,starts_at,ends_at,priority,image_asset_path,terms_summary,created_by)
  values (upper(btrim(p_input->>'code')), btrim(p_input->>'name'), btrim(p_input->>'partnerTitle'), btrim(p_input->>'partnerDescription'), nullif(btrim(p_input->>'internalNote'),''),
    p_input->>'campaignType', (p_input->>'startsAt')::timestamptz, (p_input->>'endsAt')::timestamptz,
    coalesce((p_input->>'priority')::integer,100), nullif(btrim(p_input->>'imageAssetPath'),''), btrim(p_input->>'termsSummary'), actor)
  returning id into target_id;
  for item in select value from jsonb_array_elements(p_input->'items') loop
    insert into public.commercial_campaign_items(campaign_id,product_id,sort_order,minimum_quantity,maximum_quantity_per_company,benefit_type,governed_benefit_reference,partner_message)
    select target_id, (item->>'productId')::uuid, coalesce((item->>'sortOrder')::integer,0), coalesce((item->>'minimumQuantity')::integer,1),
      nullif(item->>'maximumQuantityPerCompany','')::integer, coalesce(item->>'benefitType','informational_only'), nullif(btrim(item->>'governedBenefitReference'),''), nullif(btrim(item->>'partnerMessage'),'')
    where exists (select 1 from public.catalog_products product where product.id=(item->>'productId')::uuid and product.is_active and product.is_visible);
    if not found then raise exception 'Campaign product unavailable' using errcode = '23514'; end if;
  end loop;
  if audience_mode = 'explicit_company' then
    if jsonb_typeof(p_input->'companyIds') <> 'array' or jsonb_array_length(p_input->'companyIds') = 0 then raise exception 'Campaign audience required' using errcode='23514'; end if;
    for company_value in select value from jsonb_array_elements(p_input->'companyIds') loop
      insert into public.commercial_campaign_audience_rules(campaign_id,rule_type,criterion)
      values(target_id,'explicit_company',jsonb_build_object('companyId',trim(both '"' from company_value::text))) on conflict do nothing;
    end loop;
  elsif audience_mode = 'all_active_partners' then
    insert into public.commercial_campaign_audience_rules(campaign_id,rule_type) values(target_id,'all_active_partners');
  else
    insert into public.commercial_campaign_audience_rules(campaign_id,rule_type,criterion)
    values(target_id,'commercial_mode',jsonb_build_object('mode',case when audience_mode='commercial_mode_full' then 'full' else 'retail_only' end));
  end if;
  insert into public.commercial_campaign_audit_events(campaign_id,event_type,actor_user_id,reason) values(target_id,'draft_created',actor,'Campaign draft created');
  return target_id;
end; $$;

create or replace function public.publish_commercial_campaign(p_campaign_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor uuid:=auth.uid(); target public.commercial_campaigns; version_no integer; audience_count integer;
begin
  if actor is null or not public.has_internal_permission('campaigns.publish') then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into target from public.commercial_campaigns where id=p_campaign_id for update;
  if target.id is null then raise exception 'Campaign not found' using errcode='P0002'; end if;
  if target.status <> 'draft' then return jsonb_build_object('campaignId',target.id,'status',target.status,'version',target.current_version); end if;
  if target.ends_at <= greatest(target.starts_at,now()) or not exists(select 1 from public.commercial_campaign_items where campaign_id=target.id)
    or not exists(select 1 from public.commercial_campaign_audience_rules where campaign_id=target.id) then raise exception 'Campaign prerequisites missing' using errcode='23514'; end if;
  version_no:=target.current_version+1;
  insert into public.commercial_campaign_versions(campaign_id,version_number,campaign_snapshot,item_snapshot,audience_rule_snapshot,published_by)
  select target.id,version_no,to_jsonb(target)-'internal_note',
    (select jsonb_agg(to_jsonb(item) order by item.sort_order,item.id) from public.commercial_campaign_items item where item.campaign_id=target.id),
    (select jsonb_agg(to_jsonb(rule) order by rule.id) from public.commercial_campaign_audience_rules rule where rule.campaign_id=target.id),actor;
  with candidates as (
    select distinct company.id company_id,
      case rule.rule_type when 'explicit_company' then 'explicit_company'
        when 'all_active_partners' then 'all_active_partners'
        when 'commercial_mode' then 'commercial_mode_'||(rule.criterion->>'mode') end reason,
      rule.rule_type, rule.criterion, company.status,
      exists(select 1 from public.company_memberships membership where membership.company_id=company.id and membership.status='active') has_members,
      company.external_1c_price_type_id
    from public.commercial_campaign_audience_rules rule
    join public.partner_companies company on
      (rule.rule_type='explicit_company' and company.id=(rule.criterion->>'companyId')::uuid)
      or rule.rule_type in ('all_active_partners','commercial_mode')
    where rule.campaign_id=target.id
  )
  insert into public.commercial_campaign_audience_snapshots(campaign_id,version_number,company_id,included,eligibility_reason,exclusion_reason)
  select target.id,version_no,company_id,
    status='active' and has_members and (rule_type<>'commercial_mode' or (criterion->>'mode'='full' and external_1c_price_type_id is not null) or (criterion->>'mode'='retail_only' and external_1c_price_type_id is null)),
    reason,
    case when status<>'active' then 'company_inactive' when not has_members then 'no_active_members'
      when rule_type='commercial_mode' and not ((criterion->>'mode'='full' and external_1c_price_type_id is not null) or (criterion->>'mode'='retail_only' and external_1c_price_type_id is null)) then 'commercial_profile_mismatch' end
  from candidates on conflict do nothing;
  select count(*) into audience_count from public.commercial_campaign_audience_snapshots where campaign_id=target.id and version_number=version_no and included;
  if audience_count=0 then raise exception 'Campaign has no eligible audience' using errcode='23514'; end if;
  update public.commercial_campaigns set status=case when starts_at>now() then 'scheduled' else 'active' end,current_version=version_no,approved_by=actor,published_at=now(),updated_at=now() where id=target.id returning * into target;
  insert into public.commercial_campaign_audit_events(campaign_id,version_number,event_type,actor_user_id,reason,safe_metadata)
  values(target.id,version_no,'published',actor,'Campaign publication approved',jsonb_build_object('requestId',p_request_id,'audienceCount',audience_count));
  if target.status='active' then perform public.project_commercial_campaign_search(target.id); end if;
  return jsonb_build_object('campaignId',target.id,'status',target.status,'version',version_no,'audienceCount',audience_count);
end; $$;

create or replace function public.project_commercial_campaign_search(p_campaign_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target public.commercial_campaigns;
begin
  select * into target from public.commercial_campaigns where id=p_campaign_id;
  delete from public.partner_search_documents where document_key like 'commercial_campaign:'||p_campaign_id::text||':%';
  if target.status<>'active' or target.starts_at>now() or target.ends_at<=now() then return; end if;
  insert into public.partner_search_documents(document_key,document_type,document_id,company_id,title,subtitle,search_text,safe_metadata,route,updated_at)
  select 'commercial_campaign:'||target.id::text||':'||snapshot.company_id::text,'commercial_campaign',target.id,snapshot.company_id,target.partner_title,'Специальное предложение',
    concat_ws(' ',target.partner_title,target.partner_description,target.terms_summary,string_agg(product.sku||' '||product.name,' ' order by item.sort_order)),
    jsonb_build_object('endsAt',target.ends_at),'/cabinet/offers/'||target.id::text,target.updated_at
  from public.commercial_campaign_audience_snapshots snapshot
  join public.commercial_campaign_items item on item.campaign_id=target.id
  join public.catalog_products product on product.id=item.product_id
  where snapshot.campaign_id=target.id and snapshot.version_number=target.current_version and snapshot.included
  group by snapshot.company_id;
end; $$;

create or replace function public.pause_commercial_campaign(p_campaign_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); target public.commercial_campaigns;
begin
  if actor is null or not public.has_internal_permission('campaigns.pause') then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into target from public.commercial_campaigns where id=p_campaign_id for update;
  if target.status='paused' then return true; end if;
  if target.status not in ('active','scheduled') then raise exception 'Campaign cannot be paused' using errcode='23514'; end if;
  update public.commercial_campaigns set status='paused',updated_at=now() where id=target.id;
  delete from public.partner_search_documents where document_key like 'commercial_campaign:'||target.id::text||':%';
  insert into public.commercial_campaign_audit_events(campaign_id,version_number,event_type,actor_user_id,reason) values(target.id,target.current_version,'paused',actor,left(btrim(p_reason),500));
  return true;
end; $$;

create or replace function public.refresh_commercial_campaign_lifecycle()
returns jsonb language plpgsql security definer set search_path=public as $$
declare activated uuid[]; completed uuid[]; campaign_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  with changed as (update public.commercial_campaigns set status='active',updated_at=now() where status='scheduled' and starts_at<=now() and ends_at>now() returning id) select coalesce(array_agg(id),'{}') into activated from changed;
  with changed as (update public.commercial_campaigns set status='completed',updated_at=now() where status='active' and ends_at<=now() returning id) select coalesce(array_agg(id),'{}') into completed from changed;
  foreach campaign_id in array activated loop perform public.project_commercial_campaign_search(campaign_id); end loop;
  foreach campaign_id in array completed loop delete from public.partner_search_documents where document_key like 'commercial_campaign:'||campaign_id::text||':%'; end loop;
  with candidates as (
    select campaign.id campaign_id,campaign.partner_title,campaign.ends_at,audience.company_id,membership.user_id,
      case when campaign.id=any(activated) then 'campaign_started' else 'campaign_ending_soon' end event_code
    from public.commercial_campaigns campaign
    join public.commercial_campaign_audience_snapshots audience on audience.campaign_id=campaign.id and audience.version_number=campaign.current_version and audience.included
    join public.company_memberships membership on membership.company_id=audience.company_id and membership.status='active'
    where campaign.id=any(activated) or (campaign.status='active' and campaign.ends_at between now() and now()+interval '24 hours')
  ), sources as (
    insert into public.partner_notification_events(company_id,event_code,event_group,domain,entity_type,entity_id,source_table,source_version,occurred_at,safe_payload,fingerprint)
    select company_id,event_code,'commercial','campaigns','campaign',campaign_id,'commercial_campaigns',date_trunc('day',now())::text,now(),jsonb_build_object('campaignTitle',partner_title,'endsAt',ends_at),
      encode(digest(concat_ws('|','campaign_notification',campaign_id::text,company_id::text,event_code,date_trunc('day',now())::text),'sha256'),'hex')
    from candidates group by campaign_id,partner_title,ends_at,company_id,event_code
    on conflict(fingerprint) do nothing returning *
  )
  insert into public.partner_notifications(company_id,recipient_user_id,event_code,event_group,domain,severity,mandatory,title,message,action_label,action_url,entity_type,entity_id,occurred_at,deduplication_key,source_event_id,expires_at,retention_until,email_enabled_snapshot,email_delivery_mode)
  select candidate.company_id,candidate.user_id,candidate.event_code,'commercial','campaigns','information',false,
    case candidate.event_code when 'campaign_started' then 'Новое предложение для вашей компании' else 'Предложение скоро завершится' end,
    candidate.partner_title,'Открыть предложение','/cabinet/offers/'||candidate.campaign_id::text,'campaign',candidate.campaign_id,now(),
    encode(digest(source.fingerprint||':'||candidate.user_id::text,'sha256'),'hex'),source.id,candidate.ends_at,least(candidate.ends_at+interval '90 days',now()+interval '13 months'),false,'off'
  from candidates candidate join public.partner_notification_events source on source.fingerprint=encode(digest(concat_ws('|','campaign_notification',candidate.campaign_id::text,candidate.company_id::text,candidate.event_code,date_trunc('day',now())::text),'sha256'),'hex')
  left join public.partner_notification_preferences preference on preference.company_id=candidate.company_id and preference.user_id=candidate.user_id and preference.event_group='commercial'
  where coalesce(preference.in_app_enabled,true) on conflict(recipient_user_id,deduplication_key) do nothing;
  return jsonb_build_object('activated',cardinality(activated),'completed',cardinality(completed));
end; $$;

create or replace function public.list_partner_commercial_campaigns(p_company_id uuid,p_filter text default 'active',p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; actor uuid:=auth.uid(); can_partner boolean; can_retail boolean;
begin
  if actor is null or not public.has_permission(p_company_id,'campaigns.view') or p_limit not between 1 and 50 or p_offset<0
    or p_filter not in ('active','ending','stock','arrivals','purchased') then raise exception 'Forbidden' using errcode='42501'; end if;
  can_partner:=public.has_permission(p_company_id,'pricing.partner_price.view'); can_retail:=public.has_permission(p_company_id,'pricing.retail_price.view');
  with eligible as (
    select campaign.*,count(*) over() total_count
    from public.commercial_campaigns campaign
    join public.commercial_campaign_audience_snapshots audience on audience.campaign_id=campaign.id and audience.version_number=campaign.current_version and audience.company_id=p_company_id and audience.included
    where campaign.status in ('active','scheduled') and campaign.starts_at<=now() and campaign.ends_at>now()
      and (p_filter='active' or p_filter='ending' and campaign.ends_at<=now()+interval '7 days'
        or p_filter='stock' and exists(select 1 from public.commercial_campaign_items item join public.product_stock_totals stock on stock.product_id=item.product_id and stock.is_published and stock.available_quantity>0 where item.campaign_id=campaign.id)
        or p_filter='arrivals' and exists(select 1 from public.commercial_campaign_items item join public.product_supplier_arrivals arrival on arrival.product_id=item.product_id and arrival.is_published and arrival.expected_arrival_date>=current_date where item.campaign_id=campaign.id)
        or p_filter='purchased' and exists(select 1 from public.commercial_campaign_items item join public.partner_order_history_items history_item on history_item.product_id=item.product_id join public.partner_order_history history on history.id=history_item.order_history_id and history.company_id=p_company_id and history.partner_visible where item.campaign_id=campaign.id))
    order by campaign.priority,campaign.ends_at,campaign.id limit p_limit offset p_offset
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',eligible.id,'code',eligible.code,'title',eligible.partner_title,'description',eligible.partner_description,'type',eligible.campaign_type,'startsAt',eligible.starts_at,'endsAt',eligible.ends_at,'priority',eligible.priority,'imageAssetPath',eligible.image_asset_path,'termsSummary',eligible.terms_summary,'products',products.value) order by eligible.priority,eligible.ends_at,eligible.id),'[]'::jsonb),'totalCount',coalesce(max(eligible.total_count),0)) into result
  from eligible left join lateral (
    select jsonb_agg(jsonb_build_object('itemId',item.id,'productId',product.id,'sku',product.sku,'name',product.name,'slug',product.slug,'imageUrl',product.image_url,'minimumQuantity',item.minimum_quantity,'maximumQuantityPerCompany',item.maximum_quantity_per_company,'partnerMessage',item.partner_message,
      'price',case when can_partner then partner_price.value when can_retail then retail_price.value end,'availableQuantity',stock.available_quantity,'expectedArrivalDate',arrival.expected_arrival_date) order by item.sort_order,item.id) value
    from public.commercial_campaign_items item join public.catalog_products product on product.id=item.product_id and product.is_active and product.is_visible
    left join public.product_stock_totals stock on stock.product_id=product.id and stock.is_published
    left join lateral(select min(expected_arrival_date) expected_arrival_date from public.product_supplier_arrivals where product_id=product.id and is_published and expected_arrival_date>=current_date) arrival on true
    left join lateral(select jsonb_build_object('amount',price.price_amount,'currency',price.currency) value from public.product_prices price join public.partner_companies company on company.id=p_company_id where price.product_id=product.id and price.external_1c_price_type_id=company.external_1c_price_type_id and price.is_active and price.is_published and price.currency_status='resolved' order by price.effective_at desc limit 1) partner_price on true
    left join lateral(select jsonb_build_object('amount',price.price_amount,'currency',price.currency) value from public.product_prices price join public.price_types type on type.id=price.price_type_id where price.product_id=product.id and type.external_code='UU-000020' and price.is_active and price.is_published and price.currency_status='resolved' order by price.effective_at desc limit 1) retail_price on true
    where item.campaign_id=eligible.id
  ) products on true;
  return coalesce(result,jsonb_build_object('items','[]'::jsonb,'totalCount',0));
end; $$;

create or replace function public.get_partner_commercial_campaign(p_company_id uuid,p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; can_partner boolean; can_retail boolean;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  can_partner:=public.has_permission(p_company_id,'pricing.partner_price.view'); can_retail:=public.has_permission(p_company_id,'pricing.retail_price.view');
  select jsonb_build_object('id',campaign.id,'code',campaign.code,'title',campaign.partner_title,'description',campaign.partner_description,'type',campaign.campaign_type,'startsAt',campaign.starts_at,'endsAt',campaign.ends_at,'priority',campaign.priority,'imageAssetPath',campaign.image_asset_path,'termsSummary',campaign.terms_summary,'products',products.value) into result
  from public.commercial_campaigns campaign
  join public.commercial_campaign_audience_snapshots audience on audience.campaign_id=campaign.id and audience.version_number=campaign.current_version and audience.company_id=p_company_id and audience.included
  left join lateral (
    select jsonb_agg(jsonb_build_object('itemId',item.id,'productId',product.id,'sku',product.sku,'name',product.name,'slug',product.slug,'imageUrl',product.image_url,'minimumQuantity',item.minimum_quantity,'maximumQuantityPerCompany',item.maximum_quantity_per_company,'partnerMessage',item.partner_message,
      'price',case when can_partner then partner_price.value when can_retail then retail_price.value end,'availableQuantity',stock.available_quantity,'expectedArrivalDate',arrival.expected_arrival_date) order by item.sort_order,item.id) value
    from public.commercial_campaign_items item join public.catalog_products product on product.id=item.product_id
    left join public.product_stock_totals stock on stock.product_id=product.id and stock.is_published
    left join lateral(select min(expected_arrival_date) expected_arrival_date from public.product_supplier_arrivals where product_id=product.id and is_published and expected_arrival_date>=current_date) arrival on true
    left join lateral(select jsonb_build_object('amount',price.price_amount,'currency',price.currency) value from public.product_prices price join public.partner_companies company on company.id=p_company_id where price.product_id=product.id and price.external_1c_price_type_id=company.external_1c_price_type_id and price.is_active and price.is_published and price.currency_status='resolved' order by price.effective_at desc limit 1) partner_price on true
    left join lateral(select jsonb_build_object('amount',price.price_amount,'currency',price.currency) value from public.product_prices price join public.price_types type on type.id=price.price_type_id where price.product_id=product.id and type.external_code='UU-000020' and price.is_active and price.is_published and price.currency_status='resolved' order by price.effective_at desc limit 1) retail_price on true
    where item.campaign_id=campaign.id
  ) products on true
  where campaign.id=p_campaign_id and campaign.status in ('active','scheduled') and campaign.starts_at<=now() and campaign.ends_at>now();
  return result;
end; $$;

create or replace function public.add_commercial_campaign_item_to_cart(p_company_id uuid,p_campaign_item_id uuid,p_quantity integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare actor uuid:=auth.uid(); item public.commercial_campaign_items; campaign public.commercial_campaigns; cart public.carts; cart_item public.cart_items; used integer; fingerprint text;
begin
  if actor is null or not public.has_permission(p_company_id,'cart.manage') or not public.has_permission(p_company_id,'campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into item from public.commercial_campaign_items where id=p_campaign_item_id for share;
  if item.id is not null then select * into campaign from public.commercial_campaigns where id=item.campaign_id for share; end if;
  if item.id is null or campaign.status not in ('active','scheduled') or campaign.starts_at>now() or campaign.ends_at<=now()
    or not exists(select 1 from public.commercial_campaign_audience_snapshots audience where audience.campaign_id=campaign.id and audience.version_number=campaign.current_version and audience.company_id=p_company_id and audience.included)
    or p_quantity<item.minimum_quantity then raise exception 'Campaign item unavailable' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(item.id::text||':'||p_company_id::text,0));
  select coalesce(sum(attribution.quantity),0) into used from public.commercial_campaign_order_attributions attribution where attribution.campaign_item_id=item.id and attribution.company_id=p_company_id;
  if item.maximum_quantity_per_company is not null and used+p_quantity>item.maximum_quantity_per_company then raise exception 'Campaign company limit exceeded' using errcode='23514'; end if;
  select * into cart from public.carts where company_id=p_company_id and created_by=actor and status='active' for update;
  if cart.id is null then insert into public.carts(company_id,created_by) values(p_company_id,actor) returning * into cart; end if;
  fingerprint:=encode(digest(campaign.id::text||':'||campaign.current_version||':'||item.id::text||':'||p_company_id::text,'sha256'),'hex');
  insert into public.cart_items(cart_id,product_id,quantity,campaign_id,campaign_item_id,campaign_attribution_fingerprint)
  values(cart.id,item.product_id,p_quantity,campaign.id,item.id,fingerprint)
  on conflict(cart_id,product_id) do update set quantity=public.cart_items.quantity+excluded.quantity,campaign_id=excluded.campaign_id,campaign_item_id=excluded.campaign_item_id,campaign_attribution_fingerprint=excluded.campaign_attribution_fingerprint
  returning * into cart_item;
  if item.maximum_quantity_per_company is not null and used+cart_item.quantity>item.maximum_quantity_per_company then raise exception 'Campaign company limit exceeded' using errcode='23514'; end if;
  insert into public.commercial_campaign_engagement_events(request_id,campaign_id,campaign_item_id,company_id,user_id,event_type,quantity)
  values(p_request_id,campaign.id,item.id,p_company_id,actor,'added_to_cart',p_quantity) on conflict(request_id) do nothing;
  return jsonb_build_object('cartItemId',cart_item.id,'quantity',cart_item.quantity,'campaignId',campaign.id);
end; $$;

create or replace function public.enforce_commercial_campaign_cart_quantity()
returns trigger language plpgsql security definer set search_path=public as $$
declare item public.commercial_campaign_items; campaign public.commercial_campaigns; company uuid; used integer;
begin
  if new.campaign_item_id is null then return new; end if;
  select * into item from public.commercial_campaign_items where id=new.campaign_item_id;
  if item.id is not null then select * into campaign from public.commercial_campaigns where id=item.campaign_id; end if;
  select cart.company_id into company from public.carts cart where cart.id=new.cart_id;
  if campaign.status not in ('active','scheduled') or campaign.starts_at>now() or campaign.ends_at<=now() then
    new.campaign_id:=null; new.campaign_item_id:=null; new.campaign_attribution_fingerprint:=null; return new;
  end if;
  select coalesce(sum(quantity),0) into used from public.commercial_campaign_order_attributions where campaign_item_id=item.id and company_id=company;
  if new.quantity<item.minimum_quantity or (item.maximum_quantity_per_company is not null and used+new.quantity>item.maximum_quantity_per_company) then raise exception 'Campaign quantity is invalid' using errcode='23514'; end if;
  return new;
end; $$;
create trigger enforce_campaign_cart_quantity before insert or update of quantity,campaign_item_id on public.cart_items for each row execute function public.enforce_commercial_campaign_cart_quantity();

create or replace function public.attribute_commercial_campaign_order_item()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.commercial_campaign_order_attributions(campaign_id,campaign_item_id,company_id,order_id,order_item_id,quantity,attribution_fingerprint)
  select cart_item.campaign_id,cart_item.campaign_item_id,orders.company_id,new.order_id,new.id,new.quantity,cart_item.campaign_attribution_fingerprint
  from public.partner_orders orders join public.cart_items cart_item on cart_item.cart_id=orders.cart_id and cart_item.product_id=new.product_id
  join public.commercial_campaigns campaign on campaign.id=cart_item.campaign_id
  where orders.id=new.order_id and cart_item.campaign_id is not null and campaign.status in ('active','scheduled') and campaign.starts_at<=now() and campaign.ends_at>now() on conflict do nothing;
  return new;
end; $$;
create trigger attribute_campaign_order_item after insert on public.partner_order_items for each row execute function public.attribute_commercial_campaign_order_item();

create or replace function public.record_commercial_campaign_engagement(p_company_id uuid,p_campaign_id uuid,p_campaign_item_id uuid,p_event_type text,p_quantity integer,p_request_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view') or p_event_type not in ('impression','detail_opened','product_opened')
    or not exists(select 1 from public.commercial_campaign_audience_snapshots audience join public.commercial_campaigns campaign on campaign.id=audience.campaign_id and campaign.current_version=audience.version_number where audience.campaign_id=p_campaign_id and audience.company_id=p_company_id and audience.included and campaign.status in ('active','scheduled') and campaign.starts_at<=now() and campaign.ends_at>now()) then return false; end if;
  insert into public.commercial_campaign_engagement_events(request_id,campaign_id,campaign_item_id,company_id,user_id,event_type,quantity)
  values(p_request_id,p_campaign_id,p_campaign_item_id,p_company_id,auth.uid(),p_event_type,p_quantity) on conflict(request_id) do nothing;
  return true;
end; $$;

create or replace function public.list_admin_commercial_campaigns(p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_internal_permission('campaigns.view') or p_limit not between 1 and 100 or p_offset<0 then raise exception 'Forbidden' using errcode='42501'; end if;
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc),'[]'::jsonb),'totalCount',coalesce(max(row_value.total_count),0)) into result
  from (select campaign.*,count(*) over() total_count,(select count(*) from public.commercial_campaign_items where campaign_id=campaign.id) item_count,(select count(*) from public.commercial_campaign_audience_snapshots where campaign_id=campaign.id and version_number=campaign.current_version and included) audience_count from public.commercial_campaigns campaign where campaign.status<>'archived' order by campaign.created_at desc limit p_limit offset p_offset) row_value;
  return result;
end; $$;

create or replace function public.get_admin_commercial_campaign(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_internal_permission('campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  select jsonb_build_object('campaign',to_jsonb(campaign),'items',(select coalesce(jsonb_agg(to_jsonb(item)||jsonb_build_object('sku',product.sku,'productName',product.name,'imageUrl',product.image_url) order by item.sort_order),'[]') from public.commercial_campaign_items item join public.catalog_products product on product.id=item.product_id where item.campaign_id=campaign.id),'rules',(select coalesce(jsonb_agg(to_jsonb(rule)),'[]') from public.commercial_campaign_audience_rules rule where rule.campaign_id=campaign.id),'audience',(select coalesce(jsonb_agg(to_jsonb(audience)),'[]') from public.commercial_campaign_audience_snapshots audience where audience.campaign_id=campaign.id and audience.version_number=campaign.current_version),'analytics',jsonb_build_object('impressions',(select count(*) from public.commercial_campaign_engagement_events where campaign_id=campaign.id and event_type='impression'),'opens',(select count(*) from public.commercial_campaign_engagement_events where campaign_id=campaign.id and event_type='detail_opened'),'carts',(select count(*) from public.commercial_campaign_engagement_events where campaign_id=campaign.id and event_type='added_to_cart'),'orders',(select count(distinct order_id) from public.commercial_campaign_order_attributions where campaign_id=campaign.id),'attributedQuantity',(select coalesce(sum(quantity),0) from public.commercial_campaign_order_attributions where campaign_id=campaign.id))) into result from public.commercial_campaigns campaign where campaign.id=p_campaign_id;
  return result;
end; $$;

create or replace function public.get_commercial_campaign_builder_options(p_search text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_internal_permission('campaigns.create') then raise exception 'Forbidden' using errcode='42501'; end if;
  return jsonb_build_object('products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'sku',sku,'name',name,'imageUrl',image_url) order by name),'[]') from (select id,sku,name,image_url from public.catalog_products where is_active and is_visible and (btrim(p_search)='' or sku ilike '%'||btrim(p_search)||'%' or name ilike '%'||btrim(p_search)||'%') order by name limit 50) value),'companies',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'status',status) order by display_name),'[]') from (select id,display_name,status from public.partner_companies where status='active' order by display_name limit 100) value));
end; $$;

alter table public.partner_search_documents drop constraint partner_search_documents_type_check;
alter table public.partner_search_documents add constraint partner_search_documents_type_check check(document_type in ('product','purchasing_list','estimate','proposal','manual_line','template','purchase_template','commercial_campaign'));

revoke all on function public.create_commercial_campaign_draft(jsonb),public.publish_commercial_campaign(uuid,uuid),public.pause_commercial_campaign(uuid,text),public.refresh_commercial_campaign_lifecycle(),public.project_commercial_campaign_search(uuid),public.list_partner_commercial_campaigns(uuid,text,integer,integer),public.get_partner_commercial_campaign(uuid,uuid),public.add_commercial_campaign_item_to_cart(uuid,uuid,integer,uuid),public.record_commercial_campaign_engagement(uuid,uuid,uuid,text,integer,uuid),public.list_admin_commercial_campaigns(integer,integer),public.get_admin_commercial_campaign(uuid),public.get_commercial_campaign_builder_options(text) from public,anon;
grant execute on function public.create_commercial_campaign_draft(jsonb),public.publish_commercial_campaign(uuid,uuid),public.pause_commercial_campaign(uuid,text),public.list_partner_commercial_campaigns(uuid,text,integer,integer),public.get_partner_commercial_campaign(uuid,uuid),public.add_commercial_campaign_item_to_cart(uuid,uuid,integer,uuid),public.record_commercial_campaign_engagement(uuid,uuid,uuid,text,integer,uuid),public.list_admin_commercial_campaigns(integer,integer),public.get_admin_commercial_campaign(uuid),public.get_commercial_campaign_builder_options(text) to authenticated;
grant execute on function public.refresh_commercial_campaign_lifecycle() to service_role;
revoke all on function public.enforce_commercial_campaign_cart_quantity(),public.attribute_commercial_campaign_order_item(),public.project_commercial_campaign_search(uuid) from public,anon,authenticated;

comment on table public.commercial_campaigns is 'Governed campaign definitions. Published 1C prices remain authoritative.';
comment on table public.commercial_campaign_versions is 'Append-only partner-facing publication snapshots.';
comment on table public.commercial_campaign_audience_snapshots is 'Immutable versioned company eligibility decisions.';
comment on table public.commercial_campaign_order_attributions is 'Portal attribution only; not causal proof and not 1C commercial truth.';
