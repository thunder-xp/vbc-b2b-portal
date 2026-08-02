begin;

insert into public.permissions(code, description, scope, category, sensitive) values
  ('partner_momentum.partner_view', 'View a redacted purchasing-dynamics summary for the active partner company.', 'partner', 'commercial', true),
  ('partner_momentum.view_assigned', 'View momentum for assigned partner companies.', 'internal', 'commercial', true),
  ('partner_momentum.view_all', 'View momentum for all partner companies.', 'internal', 'commercial', true),
  ('partner_momentum.actions.manage', 'Manage governed partner-retention interventions.', 'internal', 'commercial', true),
  ('partner_momentum.analytics.view', 'View aggregate momentum diagnostics.', 'internal', 'commercial', true),
  ('partner_momentum.recalculate', 'Recalculate partner momentum.', 'internal', 'commercial', true)
on conflict (code) do update set
  description = excluded.description,
  scope = excluded.scope,
  category = excluded.category,
  sensitive = excluded.sensitive;

with grants(role_code, permission_code) as (values
  ('partner_owner', 'partner_momentum.partner_view'),
  ('partner_manager', 'partner_momentum.partner_view'),
  ('partner_buyer', 'partner_momentum.partner_view'),
  ('novotech_sales', 'partner_momentum.view_assigned'),
  ('novotech_sales', 'partner_momentum.actions.manage'),
  ('novotech_admin', 'partner_momentum.view_assigned'),
  ('novotech_admin', 'partner_momentum.view_all'),
  ('novotech_admin', 'partner_momentum.actions.manage'),
  ('novotech_admin', 'partner_momentum.analytics.view'),
  ('novotech_admin', 'partner_momentum.recalculate')
)
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from grants
join public.roles role on role.code = grants.role_code
join public.permissions permission on permission.code = grants.permission_code
on conflict do nothing;

insert into public.partner_access_preset_capabilities(preset_code, permission_id)
select 'full_partner_access', permission.id from public.permissions permission
where permission.code='partner_momentum.partner_view'
on conflict do nothing;

insert into public.partner_company_capabilities(company_id,permission_id,enabled_by)
select policy.company_id,permission.id,policy.changed_by
from public.partner_company_access_policies policy
join public.permissions permission on permission.code='partner_momentum.partner_view'
where policy.preset_code='full_partner_access'
on conflict do nothing;

create table public.partner_momentum_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.partner_companies(id) on delete cascade,
  calculation_version text not null,
  calculated_at timestamptz not null,
  eligibility_state text not null,
  status text not null,
  raw_status text not null,
  score smallint null,
  pending_status text null,
  pending_count smallint not null default 0,
  primary_currency text null,
  multi_currency boolean not null default false,
  last_order_at timestamptz null,
  normal_order_interval_days numeric(12,3) null,
  average_order_interval_days numeric(12,3) null,
  current_cycle_overrun_ratio numeric(12,4) null,
  order_count_current integer not null default 0,
  order_count_baseline integer not null default 0,
  units_current numeric(20,3) not null default 0,
  units_baseline numeric(20,3) not null default 0,
  sku_count_current integer not null default 0,
  sku_count_baseline integer not null default 0,
  monetary_current jsonb not null default '{}'::jsonb,
  monetary_baseline jsonb not null default '{}'::jsonb,
  safe_reason_codes text[] not null default '{}',
  source_fingerprint text not null,
  recovered_order_id uuid null references public.partner_order_history(id) on delete set null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_momentum_eligibility_check check (eligibility_state in ('eligible','insufficient_history','excluded')),
  constraint partner_momentum_status_check check (status in ('growth','stable','slowing','attention_required','high_risk','insufficient_history','recovered')),
  constraint partner_momentum_raw_status_check check (raw_status in ('growth','stable','slowing','attention_required','high_risk','insufficient_history','recovered')),
  constraint partner_momentum_pending_status_check check (pending_status is null or pending_status in ('growth','stable','slowing','attention_required','high_risk')),
  constraint partner_momentum_score_check check (score is null or score between 0 and 100),
  constraint partner_momentum_counts_check check (pending_count >= 0 and order_count_current >= 0 and order_count_baseline >= 0 and sku_count_current >= 0 and sku_count_baseline >= 0),
  constraint partner_momentum_money_shape_check check (jsonb_typeof(monetary_current) = 'object' and jsonb_typeof(monetary_baseline) = 'object')
);

create index partner_momentum_snapshots_status_idx on public.partner_momentum_snapshots(status, score, calculated_at desc);
create index partner_momentum_snapshots_calculated_idx on public.partner_momentum_snapshots(calculated_at, company_id);

create table public.partner_momentum_reasons (
  snapshot_id uuid not null references public.partner_momentum_snapshots(id) on delete cascade,
  reason_code text not null,
  rank smallint not null,
  safe_numeric_value numeric null,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, reason_code),
  constraint partner_momentum_reason_rank_check check (rank between 1 and 10),
  constraint partner_momentum_reason_code_check check (reason_code in (
    'order_volume_down','order_frequency_down','purchase_cycle_overdue','assortment_breadth_down',
    'recurring_products_missing','no_orders_in_current_window','active_cart_not_converted','template_not_used',
    'relevant_products_unavailable','relevant_products_now_available','relevant_arrival_confirmed',
    'price_opportunity_available','campaign_available','finance_restriction_detected','recovered_after_order'
  ))
);

create table public.partner_momentum_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  event_type text not null,
  previous_status text null,
  current_status text not null,
  calculation_version text not null,
  source_fingerprint text not null,
  source_order_id uuid null references public.partner_order_history(id) on delete set null,
  occurred_at timestamptz not null default now(),
  constraint partner_momentum_event_type_check check (event_type in ('became_eligible','growth_detected','slowing_detected','attention_required','high_risk_detected','recovered','returned_to_stable','insufficient_history')),
  constraint partner_momentum_event_fingerprint_unique unique(company_id, event_type, source_fingerprint)
);
create index partner_momentum_events_company_idx on public.partner_momentum_events(company_id, occurred_at desc);

create table public.partner_retention_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.partner_companies(id) on delete cascade,
  snapshot_id uuid null references public.partner_momentum_snapshots(id) on delete set null,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  action_type text not null,
  action_key text not null,
  outcome_code text null,
  source_fingerprint text not null,
  cooldown_until timestamptz null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint partner_retention_action_type_check check (action_type in ('partner_prompt_shown','manager_notified','recommendation_opened','reorder_started','template_opened','opportunity_opened','campaign_opened','manager_contact_recommended','campaign_assigned','action_dismissed','action_resolved','order_created')),
  constraint partner_retention_outcome_check check (outcome_code is null or outcome_code in ('contacted','no_current_need','seasonality','stock_issue','price_concern','finance_issue','switched_supplier','unknown')),
  constraint partner_retention_action_unique unique(company_id, actor_user_id, action_type, action_key, source_fingerprint)
);
create index partner_retention_actions_company_idx on public.partner_retention_actions(company_id, created_at desc);
create index partner_retention_actions_cooldown_idx on public.partner_retention_actions(company_id, action_type, cooldown_until) where cooldown_until is not null;

create table public.partner_momentum_dirty_companies (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  reason text not null,
  first_dirtied_at timestamptz not null default now(),
  last_dirtied_at timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz null,
  last_error_code text null
);

create table public.partner_momentum_projection_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  companies_processed integer not null default 0,
  snapshots_published integer not null default 0,
  transitions_created integer not null default 0,
  failures integer not null default 0,
  order_rows_scanned integer not null default 0,
  db_duration_ms integer not null default 0,
  duration_ms integer null,
  safe_error_code text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  constraint partner_momentum_run_status_check check (status in ('running','succeeded','partial','failed','locked'))
);

create table public.partner_momentum_control_assignments (
  company_id uuid primary key references public.partner_companies(id) on delete cascade,
  intervention_version text not null,
  is_holdout boolean not null default false,
  assigned_at timestamptz not null default now(),
  constraint partner_momentum_control_disabled_default check (not is_holdout)
);

alter table public.partner_momentum_snapshots enable row level security;
alter table public.partner_momentum_reasons enable row level security;
alter table public.partner_momentum_events enable row level security;
alter table public.partner_retention_actions enable row level security;
alter table public.partner_momentum_dirty_companies enable row level security;
alter table public.partner_momentum_projection_runs enable row level security;
alter table public.partner_momentum_control_assignments enable row level security;

revoke all on public.partner_momentum_snapshots, public.partner_momentum_reasons,
  public.partner_momentum_events, public.partner_retention_actions,
  public.partner_momentum_dirty_companies, public.partner_momentum_projection_runs,
  public.partner_momentum_control_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.partner_momentum_snapshots,
  public.partner_momentum_reasons, public.partner_momentum_events,
  public.partner_retention_actions, public.partner_momentum_dirty_companies,
  public.partner_momentum_projection_runs, public.partner_momentum_control_assignments to service_role;

create or replace function public.prevent_partner_momentum_history_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Partner momentum history is append-only.' using errcode = '42501'; end;
$$;
create trigger immutable_partner_momentum_events before update or delete on public.partner_momentum_events for each row execute function public.prevent_partner_momentum_history_mutation();
revoke all on function public.prevent_partner_momentum_history_mutation() from public, anon, authenticated;

create or replace function public.enqueue_partner_momentum_company(target_company_id uuid, target_reason text default 'domain_mutation')
returns void language sql security definer set search_path = public as $$
  insert into public.partner_momentum_dirty_companies(company_id, reason)
  values (target_company_id, left(coalesce(nullif(btrim(target_reason), ''), 'domain_mutation'), 80))
  on conflict (company_id) do update set reason=excluded.reason,last_dirtied_at=now(),locked_at=null;
$$;
revoke all on function public.enqueue_partner_momentum_company(uuid,text) from public, anon, authenticated;
grant execute on function public.enqueue_partner_momentum_company(uuid,text) to service_role;

create or replace function public.enqueue_all_partner_momentum_companies()
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  insert into public.partner_momentum_dirty_companies(company_id,reason)
  select company.id,'daily_refresh' from public.partner_companies company
  where company.status='active' and exists(select 1 from public.company_memberships member where member.company_id=company.id and member.status='active')
  on conflict(company_id) do update set reason='daily_refresh',last_dirtied_at=now(),locked_at=null;
  get diagnostics affected=row_count;
  return affected;
end; $$;
revoke all on function public.enqueue_all_partner_momentum_companies() from public, anon, authenticated;
grant execute on function public.enqueue_all_partner_momentum_companies() to service_role;

create or replace function public.claim_partner_momentum_companies(target_limit integer default 20)
returns table(company_id uuid) language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  return query with claimed as (
    select dirty.company_id from public.partner_momentum_dirty_companies dirty
    where dirty.locked_at is null or dirty.locked_at < now()-interval '15 minutes'
    order by dirty.first_dirtied_at for update skip locked limit greatest(1,least(target_limit,50))
  )
  update public.partner_momentum_dirty_companies dirty set locked_at=now(),attempts=attempts+1
  from claimed where dirty.company_id=claimed.company_id returning dirty.company_id;
end; $$;
revoke all on function public.claim_partner_momentum_companies(integer) from public, anon, authenticated;
grant execute on function public.claim_partner_momentum_companies(integer) to service_role;

create or replace function public.get_partner_momentum_calculation_source(target_company_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  with bounded_orders as (
    select history.id,history.one_c_document_date,history.document_total,history.currency_code
    from public.partner_order_history history
    where history.company_id=target_company_id and history.partner_visible and history.one_c_posted
      and not history.one_c_deletion_mark and history.one_c_document_date<=now()
      and history.one_c_document_date>=now()-interval '730 days'
    order by history.one_c_document_date desc,history.id limit 2000
  ), order_facts as (
    select source.id,source.one_c_document_date,source.document_total,source.currency_code,
      coalesce(sum(item.quantity),0) units,
      coalesce(array_agg(distinct item.product_id::text) filter(where item.product_id is not null),'{}') product_ids
    from bounded_orders source left join public.partner_order_history_items item on item.order_history_id=source.id
    group by source.id,source.one_c_document_date,source.document_total,source.currency_code
  ), previous as (
    select snapshot.* from public.partner_momentum_snapshots snapshot where snapshot.company_id=target_company_id
  )
  select jsonb_build_object(
    'companyId',company.id,'companyActive',company.status='active','assignedManagerId',company.assigned_internal_manager_user_id,
    'sourceFingerprint',md5(
      coalesce((select string_agg(fact.id::text||':'||fact.one_c_document_date::text||':'||fact.document_total::text||':'||coalesce(fact.currency_code,''),',' order by fact.one_c_document_date,fact.id) from order_facts fact),'empty')
      ||':'||current_date::text
      ||':'||exists(select 1 from public.carts cart where cart.company_id=target_company_id and cart.status='active' and exists(select 1 from public.cart_items item where item.cart_id=cart.id))::text
      ||':'||(select count(*) from public.purchase_templates template where template.company_id=target_company_id and template.status='active')::text
      ||':'||(select count(*) from public.partner_commercial_opportunities opportunity where opportunity.company_id=target_company_id and opportunity.status='active')::text
    ),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('id',fact.id,'orderedAt',fact.one_c_document_date,'total',fact.document_total,'currency',fact.currency_code,'units',fact.units,'productIds',fact.product_ids) order by fact.one_c_document_date,fact.id) from order_facts fact),'[]'::jsonb),
    'intent',jsonb_build_object(
      'activeCart',exists(select 1 from public.carts cart where cart.company_id=target_company_id and cart.status='active' and exists(select 1 from public.cart_items item where item.cart_id=cart.id)),
      'templateCount',(select count(*) from public.purchase_templates template where template.company_id=target_company_id and template.status='active'),
      'purchasingListCount',(select count(*) from public.purchasing_lists list where list.company_id=target_company_id and list.archived_at is null),
      'opportunityCount',(select count(*) from public.partner_commercial_opportunities opportunity where opportunity.company_id=target_company_id and opportunity.status='active'),
      'campaignCount',(select count(*) from public.commercial_campaign_audience_snapshots audience join public.commercial_campaigns campaign on campaign.id=audience.campaign_id where audience.company_id=target_company_id and campaign.status='active' and campaign.starts_at<=now() and campaign.ends_at>now())
    ),
    'previous',case when previous.id is null then null else jsonb_build_object('status',previous.status,'calculatedAt',previous.calculated_at,'pendingStatus',previous.pending_status,'pendingCount',previous.pending_count) end,
    'orderRowsScanned',(select count(*) from order_facts),
    'sourceTruncated',(select count(*) from bounded_orders)=2000
  ) into result
  from public.partner_companies company left join previous on true where company.id=target_company_id;
  return result;
end; $$;
revoke all on function public.get_partner_momentum_calculation_source(uuid) from public, anon, authenticated;
grant execute on function public.get_partner_momentum_calculation_source(uuid) to service_role;

create or replace function public.publish_partner_momentum_snapshot(target_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target_company uuid; prior_status text; target_snapshot uuid; transition_created integer:=0; reason jsonb; target_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  target_company := (target_payload->>'companyId')::uuid;
  target_status := target_payload->>'status';
  if target_status not in ('growth','stable','slowing','attention_required','high_risk','insufficient_history','recovered') then raise exception 'Invalid momentum status' using errcode='22023'; end if;
  perform 1 from public.partner_companies where id=target_company for update;
  select status into prior_status from public.partner_momentum_snapshots where company_id=target_company;
  insert into public.partner_momentum_snapshots(company_id,calculation_version,calculated_at,eligibility_state,status,raw_status,score,pending_status,pending_count,primary_currency,multi_currency,last_order_at,normal_order_interval_days,average_order_interval_days,current_cycle_overrun_ratio,order_count_current,order_count_baseline,units_current,units_baseline,sku_count_current,sku_count_baseline,monetary_current,monetary_baseline,safe_reason_codes,source_fingerprint,recovered_order_id,valid_until)
  values(target_company,target_payload->>'calculationVersion',(target_payload->>'calculatedAt')::timestamptz,target_payload->>'eligibility',target_status,target_payload->>'rawStatus',nullif(target_payload->>'score','')::smallint,nullif(target_payload->>'pendingStatus',''),coalesce((target_payload->>'pendingCount')::smallint,0),nullif(target_payload->>'primaryCurrency',''),coalesce((target_payload->>'multiCurrency')::boolean,false),nullif(target_payload->>'lastOrderAt','')::timestamptz,nullif(target_payload->>'normalOrderIntervalDays','')::numeric,nullif(target_payload->>'averageOrderIntervalDays','')::numeric,nullif(target_payload->>'cycleOverrunRatio','')::numeric,coalesce((target_payload->>'orderCountCurrent')::integer,0),coalesce((target_payload->>'orderCountBaseline')::integer,0),coalesce((target_payload->>'unitsCurrent')::numeric,0),coalesce((target_payload->>'unitsBaseline')::numeric,0),coalesce((target_payload->>'skuCountCurrent')::integer,0),coalesce((target_payload->>'skuCountBaseline')::integer,0),coalesce(target_payload->'monetaryCurrent','{}'),coalesce(target_payload->'monetaryBaseline','{}'),coalesce(array(select jsonb_array_elements_text(coalesce(target_payload->'reasonCodes','[]'))),'{}'),target_payload->>'sourceFingerprint',nullif(target_payload->>'recoveredOrderId','')::uuid,(target_payload->>'calculatedAt')::timestamptz+interval '36 hours')
  on conflict(company_id) do update set calculation_version=excluded.calculation_version,calculated_at=excluded.calculated_at,eligibility_state=excluded.eligibility_state,status=excluded.status,raw_status=excluded.raw_status,score=excluded.score,pending_status=excluded.pending_status,pending_count=excluded.pending_count,primary_currency=excluded.primary_currency,multi_currency=excluded.multi_currency,last_order_at=excluded.last_order_at,normal_order_interval_days=excluded.normal_order_interval_days,average_order_interval_days=excluded.average_order_interval_days,current_cycle_overrun_ratio=excluded.current_cycle_overrun_ratio,order_count_current=excluded.order_count_current,order_count_baseline=excluded.order_count_baseline,units_current=excluded.units_current,units_baseline=excluded.units_baseline,sku_count_current=excluded.sku_count_current,sku_count_baseline=excluded.sku_count_baseline,monetary_current=excluded.monetary_current,monetary_baseline=excluded.monetary_baseline,safe_reason_codes=excluded.safe_reason_codes,source_fingerprint=excluded.source_fingerprint,recovered_order_id=excluded.recovered_order_id,valid_until=excluded.valid_until,updated_at=now()
  returning id into target_snapshot;
  delete from public.partner_momentum_reasons where snapshot_id=target_snapshot;
  for reason in select value from jsonb_array_elements(coalesce(target_payload->'reasons','[]')) loop
    insert into public.partner_momentum_reasons(snapshot_id,reason_code,rank,safe_numeric_value)
    values(target_snapshot,reason->>'code',coalesce((reason->>'rank')::smallint,1),nullif(reason->>'value','')::numeric);
  end loop;
  if prior_status is distinct from target_status then
    insert into public.partner_momentum_events(company_id,event_type,previous_status,current_status,calculation_version,source_fingerprint,source_order_id)
    values(target_company,case target_status when 'growth' then 'growth_detected' when 'stable' then 'returned_to_stable' when 'slowing' then 'slowing_detected' when 'attention_required' then 'attention_required' when 'high_risk' then 'high_risk_detected' when 'recovered' then 'recovered' else 'insufficient_history' end,prior_status,target_status,target_payload->>'calculationVersion',target_payload->>'sourceFingerprint',nullif(target_payload->>'recoveredOrderId','')::uuid)
    on conflict do nothing;
    get diagnostics transition_created=row_count;
    if target_status in ('attention_required','high_risk','recovered') then
      insert into public.partner_retention_actions(company_id,snapshot_id,actor_user_id,action_type,action_key,source_fingerprint,cooldown_until)
      select target_company,target_snapshot,company.assigned_internal_manager_user_id,'manager_notified',target_status,target_payload->>'sourceFingerprint',
        case when target_status='high_risk' then now()+interval '14 days' else null end
      from public.partner_companies company
      where company.id=target_company and company.assigned_internal_manager_user_id is not null
      on conflict do nothing;
    end if;
    if target_status='recovered' then
      update public.partner_retention_actions set resolved_at=coalesce(resolved_at,now())
      where company_id=target_company and resolved_at is null and action_type in ('manager_notified','partner_prompt_shown','manager_contact_recommended');
    end if;
  end if;
  delete from public.partner_momentum_dirty_companies where company_id=target_company;
  return jsonb_build_object('snapshotId',target_snapshot,'transitionCreated',transition_created);
end; $$;
revoke all on function public.publish_partner_momentum_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.publish_partner_momentum_snapshot(jsonb) to service_role;

create or replace function public.fail_partner_momentum_projection(target_company_id uuid,target_error_code text)
returns void language sql security definer set search_path=public as $$
  update public.partner_momentum_dirty_companies set locked_at=null,last_error_code=left(coalesce(target_error_code,'unknown'),80) where company_id=target_company_id;
$$;
revoke all on function public.fail_partner_momentum_projection(uuid,text) from public, anon, authenticated;
grant execute on function public.fail_partner_momentum_projection(uuid,text) to service_role;

create or replace function public.get_partner_momentum_summary(target_company_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; actor uuid:=auth.uid();
begin
  if actor is null or not public.has_permission(target_company_id,'partner_momentum.partner_view') then raise exception 'Forbidden' using errcode='42501'; end if;
  select case when snapshot.status in ('slowing','attention_required','high_risk') and snapshot.valid_until>now()
    and not exists(select 1 from public.partner_retention_actions action where action.company_id=target_company_id and action.action_type='action_dismissed' and action.cooldown_until>now())
  then jsonb_build_object('status',snapshot.status,'title','В этом периоде закупок меньше обычного','explanation',case when snapshot.current_cycle_overrun_ratio>=1.25 then 'Ваш обычный цикл закупки стал длиннее. Мы подготовили быстрые способы продолжить работу.' else 'За последние 60 дней закупок меньше относительно обычного темпа вашей компании.' end,'calculatedAt',snapshot.calculated_at,'sourceFingerprint',snapshot.source_fingerprint,'actions',(
    select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('key','repeat','label','Повторить закупку','href','/cabinet/orders'),
      case when exists(select 1 from public.purchase_templates template where template.company_id=target_company_id and template.status='active') then jsonb_build_object('key','templates','label','Открыть шаблоны','href','/cabinet/purchase-templates') end,
      case when exists(select 1 from public.partner_commercial_opportunities opportunity where opportunity.company_id=target_company_id and opportunity.status='active') then jsonb_build_object('key','opportunities','label','Посмотреть возможности','href','/cabinet/opportunities') end,
      case when exists(select 1 from public.commercial_campaign_audience_snapshots audience join public.commercial_campaigns campaign on campaign.id=audience.campaign_id where audience.company_id=target_company_id and campaign.status='active') then jsonb_build_object('key','offers','label','Открыть специальные предложения','href','/cabinet/offers') end
    )) value where value<>'null'::jsonb limit 3) actions
  )) else null end into result from public.partner_momentum_snapshots snapshot where snapshot.company_id=target_company_id;
  return result;
end; $$;
revoke all on function public.get_partner_momentum_summary(uuid) from public, anon;
grant execute on function public.get_partner_momentum_summary(uuid) to authenticated;

create or replace function public.list_partner_momentum_admin(p_page integer default 1,p_page_size integer default 25,p_status text default null,p_manager uuid default null,p_search text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); can_all boolean; can_assigned boolean; result jsonb;
begin
  can_all:=public.has_internal_permission('partner_momentum.view_all');
  can_assigned:=public.has_internal_permission('partner_momentum.view_assigned');
  if actor is null or not(can_all or can_assigned) then raise exception 'Forbidden' using errcode='42501'; end if;
  with allowed as (
    select snapshot.*,company.display_name company_name,counterparty.fiscal_code,company.assigned_internal_manager_user_id manager_id,manager.full_name manager_name
    from public.partner_momentum_snapshots snapshot join public.partner_companies company on company.id=snapshot.company_id
    left join public.one_c_counterparties counterparty on lower(counterparty.reference)=lower(company.external_1c_id)
    left join public.user_profiles manager on manager.id=company.assigned_internal_manager_user_id
    where (can_all or company.assigned_internal_manager_user_id=actor)
      and (p_status is null or snapshot.status=p_status)
      and (p_manager is null or company.assigned_internal_manager_user_id=p_manager)
      and (p_search is null or company.display_name ilike '%'||replace(p_search,'%','\%')||'%' or counterparty.fiscal_code ilike '%'||replace(p_search,'%','\%')||'%')
  ), counted as (select count(*) total from allowed), page as (
    select allowed.*,(select total from counted) total_count from allowed order by case status when 'high_risk' then 1 when 'attention_required' then 2 when 'slowing' then 3 when 'recovered' then 4 else 5 end,score,company_name,company_id
    offset (greatest(p_page,1)-1)*greatest(1,least(p_page_size,100)) limit greatest(1,least(p_page_size,100))
  ) select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'companyId',page.company_id,'companyName',page.company_name,'fiscalCode',page.fiscal_code,
      'managerId',page.manager_id,'managerName',page.manager_name,'status',page.status,'score',page.score,
      'lastOrderAt',page.last_order_at,'normalOrderIntervalDays',page.normal_order_interval_days,
      'cycleOverrunRatio',page.current_cycle_overrun_ratio,'orderCountCurrent',page.order_count_current,
      'orderCountBaseline',page.order_count_baseline,'skuCountCurrent',page.sku_count_current,
      'skuCountBaseline',page.sku_count_baseline,'reasonCodes',page.safe_reason_codes,'calculatedAt',page.calculated_at
    ) order by case page.status when 'high_risk' then 1 when 'attention_required' then 2 when 'slowing' then 3 when 'recovered' then 4 else 5 end,page.score,page.company_name) filter(where page.company_id is not null),'[]'::jsonb),
    'totalCount',coalesce(max(page.total_count),(select total from counted),0)
  ) into result from page;
  return result;
end; $$;
revoke all on function public.list_partner_momentum_admin(integer,integer,text,uuid,text) from public, anon;
grant execute on function public.list_partner_momentum_admin(integer,integer,text,uuid,text) to authenticated;

create or replace function public.get_partner_momentum_diagnostics()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_internal_permission('partner_momentum.analytics.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  return jsonb_build_object('eligibleCompanies',(select count(*) from public.partner_momentum_snapshots where eligibility_state='eligible'),'insufficientHistoryCompanies',(select count(*) from public.partner_momentum_snapshots where eligibility_state='insufficient_history'),'byStatus',(select coalesce(jsonb_object_agg(status,count),'{}') from (select status,count(*) count from public.partner_momentum_snapshots group by status) grouped),'dirtyCompanies',(select count(*) from public.partner_momentum_dirty_companies),'oldestDirtyAt',(select min(first_dirtied_at) from public.partner_momentum_dirty_companies),'managerAssignmentGaps',(select count(*) from public.partner_momentum_snapshots snapshot join public.partner_companies company on company.id=snapshot.company_id where snapshot.eligibility_state='eligible' and company.assigned_internal_manager_user_id is null),'multiCurrencyAmbiguity',(select count(*) from public.partner_momentum_snapshots where multi_currency),'lastRun',(select to_jsonb(run) from public.partner_momentum_projection_runs run order by started_at desc limit 1));
end; $$;
revoke all on function public.get_partner_momentum_diagnostics() from public, anon;
grant execute on function public.get_partner_momentum_diagnostics() to authenticated;

create or replace function public.record_partner_momentum_action(target_company_id uuid,target_action_type text,target_action_key text,target_source_fingerprint text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); target_snapshot uuid; cooldown timestamptz;
begin
  if actor is null or not public.has_permission(target_company_id,'partner_momentum.partner_view') then raise exception 'Forbidden' using errcode='42501'; end if;
  if target_action_type not in ('partner_prompt_shown','recommendation_opened','reorder_started','template_opened','opportunity_opened','campaign_opened','action_dismissed') then raise exception 'Invalid action' using errcode='22023'; end if;
  select id into target_snapshot from public.partner_momentum_snapshots where company_id=target_company_id and source_fingerprint=target_source_fingerprint;
  if target_snapshot is null then raise exception 'Stale momentum action' using errcode='40001'; end if;
  cooldown:=case when target_action_type='action_dismissed' then now()+interval '30 days' else null end;
  insert into public.partner_retention_actions(company_id,snapshot_id,actor_user_id,action_type,action_key,source_fingerprint,cooldown_until)
  values(target_company_id,target_snapshot,actor,target_action_type,left(target_action_key,80),target_source_fingerprint,cooldown) on conflict do nothing;
end; $$;
revoke all on function public.record_partner_momentum_action(uuid,text,text,text) from public, anon;
grant execute on function public.record_partner_momentum_action(uuid,text,text,text) to authenticated;

create or replace function public.enqueue_momentum_from_row() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.enqueue_partner_momentum_company(coalesce(new.company_id,old.company_id),tg_table_name); return coalesce(new,old); end; $$;
revoke all on function public.enqueue_momentum_from_row() from public, anon, authenticated;
create trigger enqueue_momentum_from_order_history after insert or update on public.partner_order_history for each row execute function public.enqueue_momentum_from_row();
create trigger enqueue_momentum_from_cart after insert or update or delete on public.carts for each row execute function public.enqueue_momentum_from_row();
create trigger enqueue_momentum_from_template after insert or update or delete on public.purchase_templates for each row execute function public.enqueue_momentum_from_row();
create trigger enqueue_momentum_from_opportunity after insert or update or delete on public.partner_commercial_opportunities for each row execute function public.enqueue_momentum_from_row();

alter table public.commercial_campaign_audience_rules drop constraint if exists commercial_campaign_audience_rules_rule_type_check;
alter table public.commercial_campaign_audience_rules add constraint commercial_campaign_audience_rules_rule_type_check
  check(rule_type in ('explicit_company','all_active_partners','commercial_mode','momentum_status'));

create or replace function public.create_commercial_campaign_draft(p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();target_id uuid;item jsonb;company_value jsonb;audience_mode text;
begin
  if actor is null or not public.has_internal_permission('campaigns.create') then raise exception 'Forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'items')<>'array' or jsonb_array_length(p_input->'items') not between 1 and 50
    or coalesce(p_input->>'benefitType','informational_only') not in ('informational_only','existing_price_profile') or p_input?'finalPrice' or p_input?'discountAmount' then raise exception 'Invalid campaign' using errcode='22023'; end if;
  audience_mode:=coalesce(p_input->>'audienceMode','explicit_company');
  if audience_mode not in ('explicit_company','all_active_partners','commercial_mode_full','commercial_mode_retail_only','momentum_slowing','momentum_attention') then raise exception 'Invalid audience' using errcode='22023'; end if;
  insert into public.commercial_campaigns(code,name,partner_title,partner_description,internal_note,campaign_type,starts_at,ends_at,priority,image_asset_path,terms_summary,created_by)
  values(upper(btrim(p_input->>'code')),btrim(p_input->>'name'),btrim(p_input->>'partnerTitle'),btrim(p_input->>'partnerDescription'),nullif(btrim(p_input->>'internalNote'),''),p_input->>'campaignType',(p_input->>'startsAt')::timestamptz,(p_input->>'endsAt')::timestamptz,coalesce((p_input->>'priority')::integer,100),nullif(btrim(p_input->>'imageAssetPath'),''),btrim(p_input->>'termsSummary'),actor) returning id into target_id;
  for item in select value from jsonb_array_elements(p_input->'items') loop
    insert into public.commercial_campaign_items(campaign_id,product_id,sort_order,minimum_quantity,maximum_quantity_per_company,benefit_type,governed_benefit_reference,partner_message)
    select target_id,(item->>'productId')::uuid,coalesce((item->>'sortOrder')::integer,0),coalesce((item->>'minimumQuantity')::integer,1),nullif(item->>'maximumQuantityPerCompany','')::integer,coalesce(item->>'benefitType','informational_only'),nullif(btrim(item->>'governedBenefitReference'),''),nullif(btrim(item->>'partnerMessage'),'')
    where exists(select 1 from public.catalog_products product where product.id=(item->>'productId')::uuid and product.is_active and product.is_visible);
    if not found then raise exception 'Campaign product unavailable' using errcode='23514'; end if;
  end loop;
  if audience_mode='explicit_company' then
    if jsonb_typeof(p_input->'companyIds')<>'array' or jsonb_array_length(p_input->'companyIds')=0 then raise exception 'Campaign audience required' using errcode='23514'; end if;
    for company_value in select value from jsonb_array_elements(p_input->'companyIds') loop insert into public.commercial_campaign_audience_rules(campaign_id,rule_type,criterion) values(target_id,'explicit_company',jsonb_build_object('companyId',trim(both '"' from company_value::text))) on conflict do nothing; end loop;
  elsif audience_mode='all_active_partners' then insert into public.commercial_campaign_audience_rules(campaign_id,rule_type) values(target_id,'all_active_partners');
  elsif audience_mode like 'momentum_%' then
    insert into public.commercial_campaign_audience_rules(campaign_id,rule_type,criterion) values(target_id,'momentum_status',case when audience_mode='momentum_slowing' then jsonb_build_object('statuses',jsonb_build_array('slowing'),'maxScore',59) else jsonb_build_object('statuses',jsonb_build_array('attention_required','high_risk'),'maxScore',39) end);
  else insert into public.commercial_campaign_audience_rules(campaign_id,rule_type,criterion) values(target_id,'commercial_mode',jsonb_build_object('mode',case when audience_mode='commercial_mode_full' then 'full' else 'retail_only' end)); end if;
  insert into public.commercial_campaign_audit_events(campaign_id,event_type,actor_user_id,reason) values(target_id,'draft_created',actor,'Campaign draft created');return target_id;
end; $$;

create or replace function public.publish_commercial_campaign(p_campaign_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();target public.commercial_campaigns;version_no integer;audience_count integer;
begin
  if actor is null or not public.has_internal_permission('campaigns.publish') then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into target from public.commercial_campaigns where id=p_campaign_id for update;
  if target.id is null then raise exception 'Campaign not found' using errcode='P0002'; end if;
  if target.status<>'draft' then return jsonb_build_object('campaignId',target.id,'status',target.status,'version',target.current_version); end if;
  if target.ends_at<=greatest(target.starts_at,now()) or not exists(select 1 from public.commercial_campaign_items where campaign_id=target.id) or not exists(select 1 from public.commercial_campaign_audience_rules where campaign_id=target.id) then raise exception 'Campaign prerequisites missing' using errcode='23514'; end if;
  version_no:=target.current_version+1;
  insert into public.commercial_campaign_versions(campaign_id,version_number,campaign_snapshot,item_snapshot,audience_rule_snapshot,published_by)
  select target.id,version_no,to_jsonb(target)-'internal_note',(select jsonb_agg(to_jsonb(item) order by item.sort_order,item.id) from public.commercial_campaign_items item where item.campaign_id=target.id),(select jsonb_agg(to_jsonb(rule) order by rule.id) from public.commercial_campaign_audience_rules rule where rule.campaign_id=target.id),actor;
  with candidates as (
    select distinct company.id company_id,
      case rule.rule_type when 'explicit_company' then 'explicit_company' when 'all_active_partners' then 'all_active_partners' when 'commercial_mode' then 'commercial_mode_'||(rule.criterion->>'mode') else 'momentum_status' end reason,
      rule.rule_type,rule.criterion,company.status,exists(select 1 from public.company_memberships membership where membership.company_id=company.id and membership.status='active') has_members,company.external_1c_price_type_id,
      momentum.status momentum_status,momentum.score momentum_score,momentum.valid_until momentum_valid_until
    from public.commercial_campaign_audience_rules rule
    join public.partner_companies company on (rule.rule_type='explicit_company' and company.id=(rule.criterion->>'companyId')::uuid) or rule.rule_type in ('all_active_partners','commercial_mode','momentum_status')
    left join public.partner_momentum_snapshots momentum on momentum.company_id=company.id
    where rule.campaign_id=target.id
  ), evaluated as (
    select *,status='active' and has_members
      and (rule_type<>'commercial_mode' or (criterion->>'mode'='full' and external_1c_price_type_id is not null) or (criterion->>'mode'='retail_only' and external_1c_price_type_id is null))
      and (rule_type<>'momentum_status' or momentum_valid_until>now() and momentum_score<=coalesce((criterion->>'maxScore')::integer,100) and momentum_status in(select jsonb_array_elements_text(criterion->'statuses'))) included
    from candidates
  )
  insert into public.commercial_campaign_audience_snapshots(campaign_id,version_number,company_id,included,eligibility_reason,exclusion_reason)
  select target.id,version_no,company_id,included,reason,case when status<>'active' then 'company_inactive' when not has_members then 'no_active_members' when rule_type='commercial_mode' and not((criterion->>'mode'='full' and external_1c_price_type_id is not null) or (criterion->>'mode'='retail_only' and external_1c_price_type_id is null)) then 'commercial_profile_mismatch' when rule_type='momentum_status' and not included then 'momentum_rule_mismatch' end from evaluated on conflict do nothing;
  select count(*) into audience_count from public.commercial_campaign_audience_snapshots where campaign_id=target.id and version_number=version_no and included;
  if audience_count=0 then raise exception 'Campaign has no eligible audience' using errcode='23514'; end if;
  update public.commercial_campaigns set status=case when starts_at>now() then 'scheduled' else 'active' end,current_version=version_no,approved_by=actor,published_at=now(),updated_at=now() where id=target.id returning * into target;
  insert into public.commercial_campaign_audit_events(campaign_id,version_number,event_type,actor_user_id,reason,safe_metadata) values(target.id,version_no,'published',actor,'Campaign publication approved',jsonb_build_object('requestId',p_request_id,'audienceCount',audience_count));
  if target.status='active' then perform public.project_commercial_campaign_search(target.id); end if;
  return jsonb_build_object('campaignId',target.id,'status',target.status,'version',version_no,'audienceCount',audience_count);
end; $$;

do $$
declare existing_definition text; existing_expression text;
begin
  select pg_get_constraintdef(constraint_row.oid) into existing_definition
  from pg_constraint constraint_row
  where constraint_row.conrelid='public.partner_behavior_events'::regclass
    and constraint_row.conname='partner_behavior_event_name_check';
  if existing_definition is null then raise exception 'partner_behavior_event_name_check is unavailable'; end if;
  existing_expression:=substring(existing_definition from '^CHECK \((.*)\)$');
  if existing_expression is null then raise exception 'partner_behavior_event_name_check cannot be extended safely'; end if;
  alter table public.partner_behavior_events drop constraint partner_behavior_event_name_check;
  execute format(
    'alter table public.partner_behavior_events add constraint partner_behavior_event_name_check check ((%s) or event_name = any(array[''purchasing_dynamics_opened'',''momentum_prompt_viewed'',''momentum_action_opened'',''momentum_prompt_dismissed'',''momentum_repeat_started'',''momentum_template_opened'',''momentum_opportunity_opened'',''momentum_campaign_opened'']))',
    existing_expression
  );
end $$;

create or replace function public.record_partner_momentum_behavior_event(p_company_id uuid,p_event_name text,p_session_id uuid,p_route text,p_source_surface text default null,p_metadata_safe jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare saved_id uuid; normalized_route text:=split_part(left(btrim(p_route),200),'?',1); metadata_text text:=lower(coalesce(p_metadata_safe,'{}')::text);
begin
  if auth.uid() is null or not public.has_active_company_membership(p_company_id) or not public.has_permission(p_company_id,'partner_momentum.partner_view') then raise exception 'Behavior event access denied' using errcode='42501'; end if;
  if p_event_name not in ('purchasing_dynamics_opened','momentum_prompt_viewed','momentum_action_opened','momentum_prompt_dismissed','momentum_repeat_started','momentum_template_opened','momentum_opportunity_opened','momentum_campaign_opened')
    or p_session_id is null or (normalized_route<>'/cabinet' and normalized_route not like '/cabinet/%')
    or p_source_surface is not null and char_length(btrim(p_source_surface)) not between 1 and 50
    or jsonb_typeof(coalesce(p_metadata_safe,'{}'))<>'object' or pg_column_size(coalesce(p_metadata_safe,'{}'))>2048
    or metadata_text~'(price|amount|token|secret|password|email|authorization|note|comment)' then raise exception 'Invalid behavior event' using errcode='22023'; end if;
  insert into public.partner_behavior_events(event_name,user_id,company_id,session_id,route,source_surface,metadata_safe)
  values(p_event_name,auth.uid(),p_company_id,p_session_id,normalized_route,nullif(btrim(p_source_surface),''),coalesce(p_metadata_safe,'{}')) returning id into saved_id;
  return saved_id;
end; $$;
revoke all on function public.record_partner_momentum_behavior_event(uuid,text,uuid,text,text,jsonb) from public,anon;
grant execute on function public.record_partner_momentum_behavior_event(uuid,text,uuid,text,text,jsonb) to authenticated;

insert into public.partner_momentum_dirty_companies(company_id,reason)
select company.id,'initial_projection' from public.partner_companies company where company.status='active'
on conflict do nothing;

commit;
