begin;
set local lock_timeout='5s';

alter table public.commercial_campaign_engagement_events add column session_id uuid;
-- Keep the publication item identity when draft editing retires the live item (existing FK SET NULL).
alter table public.commercial_campaign_engagement_events add column evidence_campaign_item_id uuid;
update public.commercial_campaign_engagement_events e set evidence_campaign_item_id=coalesce(e.campaign_item_id,
  (select (x->>'id')::uuid from public.commercial_campaign_versions v,lateral jsonb_array_elements(v.item_snapshot) x
   where v.campaign_id=e.campaign_id and v.version_number=e.publication_version and x->>'product_id'=e.product_id::text limit 1));
create unique index campaign_detail_session_unique on public.commercial_campaign_engagement_events
  (campaign_id,publication_version,company_id,user_id,session_id)
  where event_type='detail_opened' and session_id is not null;
create index campaign_engagement_period_idx on public.commercial_campaign_engagement_events(campaign_id,created_at);

-- Coverage starts when the canonical release activates instrumentation, not when SQL is staged.
create table private.campaign_measurement_coverage (
  singleton boolean primary key default true check(singleton),
  views_started_at timestamptz
);
insert into private.campaign_measurement_coverage(singleton) values(true);
alter table private.campaign_measurement_coverage enable row level security;
revoke all on private.campaign_measurement_coverage from public,anon,authenticated,service_role;

-- Existing action wrappers enrich a newly inserted row once. Replays must not rewrite its version/eligibility.
create function private.preserve_campaign_engagement_evidence_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare live_item uuid;
begin
  if tg_op='INSERT' then new.evidence_campaign_item_id:=new.campaign_item_id; return new; end if;
  if old.publication_version is not null and old.mechanic_type is not null then
    live_item:=new.campaign_item_id;
    new:=old;
    if live_item is null then new.campaign_item_id:=null; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_campaign_engagement_evidence_v1() from public,anon,authenticated,service_role;
create trigger preserve_campaign_engagement_evidence before insert or update on public.commercial_campaign_engagement_events
for each row execute function private.preserve_campaign_engagement_evidence_v1();

create or replace function public.record_commercial_campaign_engagement(
  p_company_id uuid,p_campaign_id uuid,p_campaign_item_id uuid,p_event_type text,p_quantity integer,p_request_id uuid
) returns boolean language plpgsql security definer set search_path='' set row_security=off as $$
declare c public.commercial_campaigns; i public.commercial_campaign_items;
begin
  if auth.uid() is null or not public.has_permission(p_company_id,'campaigns.view')
    or p_request_id is null or p_event_type is null or p_event_type not in ('impression','detail_opened','product_opened') then return false; end if;
  select * into c from public.commercial_campaigns where id=p_campaign_id for share;
  if c.id is null or c.status not in ('active','scheduled') or c.starts_at>now() or c.ends_at<=now()
    or not exists(select 1 from public.commercial_campaign_audience_snapshots a where a.campaign_id=c.id
      and a.version_number=c.current_version and a.company_id=p_company_id and a.included) then return false; end if;
  if p_campaign_item_id is not null then
    select * into i from public.commercial_campaign_items where id=p_campaign_item_id and campaign_id=c.id;
    if i.id is null then return false; end if;
  end if;
  insert into public.commercial_campaign_engagement_events(request_id,campaign_id,campaign_item_id,company_id,user_id,
    event_type,quantity,product_id,publication_version,mechanic_type,mechanic_threshold_quantity)
  values(p_request_id,c.id,i.id,p_company_id,auth.uid(),p_event_type,p_quantity,i.product_id,c.current_version,c.mechanic_type,i.promo_threshold_quantity)
  on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.record_commercial_campaign_engagement(uuid,uuid,uuid,text,integer,uuid) from public,anon;
grant execute on function public.record_commercial_campaign_engagement(uuid,uuid,uuid,text,integer,uuid) to authenticated;

create function public.record_commercial_campaign_view_v1(p_company_id uuid,p_campaign_id uuid,p_session_id uuid,p_request_id uuid)
returns boolean language plpgsql security definer set search_path='' set row_security=off as $$
declare c public.commercial_campaigns;
begin
  if auth.uid() is null or p_session_id is null or p_request_id is null
    or not public.has_permission(p_company_id,'campaigns.view')
    or not exists(select 1 from private.campaign_measurement_coverage where singleton and views_started_at is not null) then return false; end if;
  select * into c from public.commercial_campaigns where id=p_campaign_id for share;
  if c.id is null or c.status not in ('active','scheduled') or c.starts_at>now() or c.ends_at<=now()
    or not exists(select 1 from public.commercial_campaign_audience_snapshots a where a.campaign_id=c.id
      and a.version_number=c.current_version and a.company_id=p_company_id and a.included) then return false; end if;
  insert into public.commercial_campaign_engagement_events(request_id,campaign_id,company_id,user_id,event_type,
    publication_version,mechanic_type,session_id)
  values(p_request_id,c.id,p_company_id,auth.uid(),'detail_opened',c.current_version,c.mechanic_type,p_session_id)
  on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.record_commercial_campaign_view_v1(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.record_commercial_campaign_view_v1(uuid,uuid,uuid,uuid) to authenticated;

create function public.get_admin_campaign_performance_v1(
 p_campaign_ids uuid[],p_from timestamptz default null,p_to timestamptz default null,p_version integer default null
) returns jsonb language plpgsql stable security definer set search_path='' set row_security=off as $$
declare result jsonb; covered timestamptz;
begin
  if auth.uid() is null or not public.has_internal_permission('campaigns.view') then raise exception 'Forbidden' using errcode='42501'; end if;
  if coalesce(cardinality(p_campaign_ids),0) not between 1 and 50 or array_position(p_campaign_ids,null) is not null
    or (p_version is not null and p_version<1) or (p_from is null)<>(p_to is null)
    or (p_from is not null and (p_to<=p_from or p_to-p_from>interval '366 days')) then
    raise exception 'Invalid reporting scope' using errcode='22023'; end if;
  select views_started_at into covered from private.campaign_measurement_coverage where singleton;
  with scope as materialized (
    select c.id,c.name,coalesce(v.campaign_snapshot->>'mechanic_type',c.mechanic_type) as mechanic_type,c.status,c.current_version,
      coalesce(p_from,c.created_at) as since,coalesce(p_to,least(now(),c.ends_at)) as until
    from public.commercial_campaigns c left join public.commercial_campaign_versions v
      on v.campaign_id=c.id and v.version_number=p_version where c.id=any(p_campaign_ids)
        and (p_version is null or v.version_number is not null)
  ), publications as materialized (
    select v.* from scope s join public.commercial_campaign_versions v on v.campaign_id=s.id
  ), published_items as materialized (
    select v.campaign_id,v.version_number,x->>'id' as item_id,x->>'attach_role' as attach_role
      from publications v,lateral jsonb_array_elements(v.item_snapshot) x
  ), events as materialized (
    select e.*,coalesce(i.attach_role,case when e.mechanic_type='spend_threshold_promo'
      and v.campaign_snapshot->'spendConfig'->>'rewardProductId'=e.product_id::text then 'REWARD' end) as historical_role
    from scope s join public.commercial_campaign_engagement_events e on e.campaign_id=s.id
      and e.created_at>=s.since and e.created_at<s.until
    left join publications v on v.campaign_id=e.campaign_id and v.version_number=e.publication_version
    left join published_items i on i.campaign_id=e.campaign_id and i.version_number=e.publication_version and i.item_id=e.evidence_campaign_item_id::text
    where p_version is null or e.publication_version=p_version
  ), priced as materialized (
    select a.campaign_id,a.publication_version,a.company_id,a.order_id,a.order_item_id,a.product_id,a.quantity,
      i.line_total,i.currency_code,i.effective_price_evidence as evidence,a.created_at
    from scope s join public.commercial_campaign_order_attributions a on a.campaign_id=s.id
      and a.created_at>=s.since and a.created_at<s.until
    join public.partner_order_items i on i.id=a.order_item_id and i.order_id=a.order_id
    join public.partner_orders o on o.id=a.order_id and o.company_id=a.company_id and o.status='submitted'
    where i.effective_price_evidence->>'priceSource'='CAMPAIGN_PROMO'
      and i.effective_price_evidence->>'campaignId'=a.campaign_id::text
      and i.effective_price_evidence->>'campaignItemId'=a.campaign_item_id::text
      and i.effective_price_evidence->>'publicationVersion'=a.publication_version::text
      and a.quantity=i.quantity and a.product_id=i.product_id
      and i.source_unit_price=(i.effective_price_evidence->>'sourceAmount')::numeric
      and i.source_currency_code=i.effective_price_evidence->>'sourceCurrency'
      and a.attribution_fingerprint=encode(extensions.digest(i.effective_price_evidence::text,'sha256'),'hex')
      and (p_version is null or a.publication_version=p_version)
  ), orders as materialized (select distinct campaign_id,order_id from priced),
  order_money as (select o.campaign_id,i.currency_code,sum(i.line_total) as amount
    from orders o join public.partner_order_items i on i.order_id=o.order_id group by o.campaign_id,i.currency_code),
  line_money as (select campaign_id,currency_code,sum(line_total) as amount from priced group by campaign_id,currency_code),
  qualified as materialized (
    select campaign_id,company_id,created_at from events where event_type in ('added_to_cart','bundle_added_to_cart') and mechanic_eligible
    union select campaign_id,company_id,created_at from priced
  ), viewed as materialized (select campaign_id,company_id,min(created_at) as first_view from events where event_type='detail_opened' and session_id is not null group by campaign_id,company_id),
  interacted as materialized (select distinct campaign_id,company_id from events where event_type in ('added_to_cart','bundle_added_to_cart')),
  event_stats as (
    select campaign_id,count(*) filter(where event_type='detail_opened' and session_id is not null) as views,
      count(*) filter(where event_type='added_to_cart') as adds,count(*) filter(where event_type='bundle_added_to_cart') as complete_kits,
      count(*) filter(where event_type='added_to_cart' and historical_role='REWARD') as reward_adds,
      count(distinct company_id) filter(where event_type in ('added_to_cart','bundle_added_to_cart') and mechanic_eligible) as action_qualified
    from events group by campaign_id
  ), order_stats as (
    select campaign_id,count(distinct company_id) as benefit_companies,count(distinct order_id) as order_count,
      count(*) as lines,sum(quantity) as units,count(distinct product_id) as skus,
      count(*) filter(where coalesce(evidence->>'attachRole',evidence->>'spendRole')='REWARD') as reward_lines,
      sum(quantity) filter(where coalesce(evidence->>'attachRole',evidence->>'spendRole')='REWARD') as reward_units,
      min((evidence->>'qualifyingSpendUsd')::numeric) as spend_min,max((evidence->>'qualifyingSpendUsd')::numeric) as spend_max
    from priced group by campaign_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaignId',s.id,'name',s.name,'mechanicType',s.mechanic_type,'status',s.status,
    'period',jsonb_build_object('from',s.since,'to',s.until),'publicationVersion',p_version,
    'versions',(select coalesce(jsonb_agg(v.version_number order by v.version_number),'[]') from public.commercial_campaign_versions v where v.campaign_id=s.id),
    'audienceCompanies',(select count(*) from public.commercial_campaign_audience_snapshots a where a.campaign_id=s.id and a.version_number=coalesce(p_version,s.current_version) and a.included),
    'viewsStartedAt',covered,'viewCoverageComplete',covered is not null and s.since>=covered,
    'offerViews',case when covered is null or s.until<=covered then null else coalesce(e.views,0) end,
    'viewingCompanies',case when covered is null or s.until<=covered then null else (select count(*) from viewed v where v.campaign_id=s.id) end,
    'interactingCompanies',(select count(*) from interacted v where v.campaign_id=s.id),
    'viewedInteractingCompanies',(select count(distinct v.company_id) from viewed v join events x using(campaign_id,company_id)
      where v.campaign_id=s.id and x.event_type in ('added_to_cart','bundle_added_to_cart') and x.created_at>=v.first_view),
    'qualifiedCompanies',(select count(distinct q.company_id) from qualified q where q.campaign_id=s.id),
    'viewedQualifiedCompanies',(select count(distinct v.company_id) from viewed v join qualified q using(campaign_id,company_id) where v.campaign_id=s.id and q.created_at>=v.first_view),
    'actionQualifiedCompanies',coalesce(e.action_qualified,0),'addActions',coalesce(e.adds,0),'completeKitActions',coalesce(e.complete_kits,0),'rewardAddActions',coalesce(e.reward_adds,0),
    'benefitCompanies',coalesce(t.benefit_companies,0),'attributedOrders',coalesce(t.order_count,0),'attributedLines',coalesce(t.lines,0),'attributedUnits',coalesce(t.units,0),
    'participatingSkus',coalesce(t.skus,0),'rewardPurchasedLines',coalesce(t.reward_lines,0),'rewardPurchasedUnits',coalesce(t.reward_units,0),
    'qualifyingSpendUsd',case when t.spend_min is null then null else jsonb_build_object('min',t.spend_min,'max',t.spend_max) end,
    'attributedOrderValue',(select coalesce(jsonb_agg(jsonb_build_object('currency',m.currency_code,'amount',m.amount)),'[]') from order_money m where m.campaign_id=s.id),
    'campaignPricedLineValue',(select coalesce(jsonb_agg(jsonb_build_object('currency',m.currency_code,'amount',m.amount)),'[]') from line_money m where m.campaign_id=s.id),
    'observedPriceBenefit',null,'grossProfit',null
  ) order by s.name),'[]') into result
  from scope s left join event_stats e on e.campaign_id=s.id left join order_stats t on t.campaign_id=s.id;
  return result;
end;
$$;
revoke all on function public.get_admin_campaign_performance_v1(uuid[],timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_admin_campaign_performance_v1(uuid[],timestamptz,timestamptz,integer) to authenticated;
comment on function public.get_admin_campaign_performance_v1(uuid[],timestamptz,timestamptz,integer) is
'Bounded internal campaign attribution; submitted orders with immutable CAMPAIGN_PROMO provenance only. Full-order value counted once per campaign/order, separated by settlement currency. No causal claims.';
notify pgrst,'reload schema';
commit;
