-- Run only on the isolated Wave 2A acceptance clone. All fixture mutations roll back.
begin;
do $$
#variable_conflict use_variable
declare
  admin_id uuid := 'aa500000-0000-4000-8000-000000000001';
  partner_id uuid := 'aa500000-0000-4000-8000-000000000002';
  outsider_id uuid := 'aa500000-0000-4000-8000-000000000003';
  company_id uuid := 'ba500000-0000-4000-8000-000000000001';
  campaign_id uuid := '83ea6436-c3f9-44f3-b374-a984b44bb200';
  session_id uuid := gen_random_uuid(); request_id uuid := gen_random_uuid();
  result jsonb; before_order_value numeric; expected_units bigint; event_id uuid;
  source_line public.partner_order_items; additional_line public.partner_order_items;
  extra_evidence jsonb; item_id uuid; foreign_item uuid;
begin
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  result := public.get_admin_campaign_performance_v1(array[campaign_id],now()-interval '1 day',now()+interval '1 minute')->0;
  if result->'offerViews' is distinct from 'null'::jsonb then raise exception 'Historical views fabricated'; end if;
  if result->>'attributedOrders' is distinct from '1' or result->>'rewardPurchasedUnits' is distinct from '1'
    or result->'qualifyingSpendUsd'->>'min' is distinct from '1600.00' then raise exception 'Existing transaction evidence lost: %',result; end if;
  -- Existing attach actions retain the historical reward identity after live-item retirement.
  result := public.get_admin_campaign_performance_v1(array['f59e3b33-a8b4-447d-8def-3f9cc4a54c80'::uuid])->0;
  if result->>'rewardAddActions' is distinct from '2' then raise exception 'Historical attach reward actions lost: %',result; end if;
  update public.commercial_campaign_engagement_events set campaign_item_id=null
    where campaign_id='f59e3b33-a8b4-447d-8def-3f9cc4a54c80' and campaign_item_id is not null;
  result := public.get_admin_campaign_performance_v1(array['f59e3b33-a8b4-447d-8def-3f9cc4a54c80'::uuid])->0;
  if result->>'rewardAddActions' is distinct from '2' then raise exception 'Retired item erased historical attach behavior'; end if;
  update private.campaign_measurement_coverage set views_started_at=clock_timestamp() where singleton;
  perform set_config('request.jwt.claim.sub',partner_id::text,true);
  if not public.record_commercial_campaign_view_v1(company_id,campaign_id,session_id,request_id) then raise exception 'Legitimate view rejected'; end if;
  perform public.record_commercial_campaign_view_v1(company_id,campaign_id,session_id,request_id);
  perform public.record_commercial_campaign_view_v1(company_id,campaign_id,session_id,gen_random_uuid());
  if (select count(*) from public.commercial_campaign_engagement_events e where e.campaign_id=campaign_id and e.session_id=session_id) is distinct from 1 then raise exception 'Refresh/retry duplicated view'; end if;
  if public.record_commercial_campaign_view_v1('ba500000-0000-4000-8000-000000000002',campaign_id,session_id,gen_random_uuid()) then raise exception 'Forged company accepted'; end if;
  select id into foreign_item from public.commercial_campaign_items i where i.campaign_id is distinct from campaign_id limit 1;
  if public.record_commercial_campaign_engagement(company_id,campaign_id,foreign_item,'product_opened',null,gen_random_uuid()) then raise exception 'Forged item accepted'; end if;
  if public.record_commercial_campaign_view_v1(company_id,gen_random_uuid(),session_id,gen_random_uuid()) then raise exception 'Forged campaign accepted'; end if;
  begin perform public.get_admin_campaign_performance_v1(array[campaign_id]); raise exception 'Partner aggregate access accepted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  if public.record_commercial_campaign_view_v1(company_id,campaign_id,session_id,gen_random_uuid()) then raise exception 'Cross-company actor accepted'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  if public.record_commercial_campaign_view_v1(company_id,campaign_id,session_id,gen_random_uuid()) then raise exception 'Anonymous evidence accepted'; end if;
  begin perform public.get_admin_campaign_performance_v1(array[campaign_id]); raise exception 'Anonymous report accepted'; exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  result := public.get_admin_campaign_performance_v1(array[campaign_id],now()-interval '1 day',now()+interval '1 minute')->0;
  if result->>'offerViews' is distinct from '1' or result->>'viewingCompanies' is distinct from '1' or result->>'attributedOrders' is distinct from '1' then raise exception 'Funnel count mismatch: %',result; end if;
  if result->>'viewCoverageComplete' is distinct from 'false' then raise exception 'Historical gap erased'; end if;
  if result->>'viewedInteractingCompanies' is distinct from '0' or result->>'viewedQualifiedCompanies' is distinct from '0' then raise exception 'Action/order before view misrepresented as view conversion'; end if;
  select i.id into item_id from public.commercial_campaign_items i where i.campaign_id=campaign_id and i.benefit_type='existing_price_profile' limit 1;
  insert into public.commercial_campaign_engagement_events(request_id,campaign_id,campaign_item_id,company_id,user_id,event_type,
    quantity,publication_version,mechanic_type,mechanic_eligible,created_at)
    values(gen_random_uuid(),campaign_id,item_id,company_id,partner_id,'added_to_cart',1,1,'spend_threshold_promo',true,now()+interval '10 seconds');
  result := public.get_admin_campaign_performance_v1(array[campaign_id],now()-interval '1 day',now()+interval '1 minute')->0;
  if result->>'viewedInteractingCompanies' is distinct from '1' or result->>'viewedQualifiedCompanies' is distinct from '1' then raise exception 'Observed post-view action missing from cohort'; end if;
  begin perform public.get_admin_campaign_performance_v1(array[campaign_id],now()-interval '400 days',now()); raise exception 'Unbounded report accepted'; exception when invalid_parameter_value then null; end;
  if public.get_admin_campaign_performance_v1(array[gen_random_uuid()]) is distinct from '[]'::jsonb then raise exception 'Unknown ID exposed data'; end if;
  if public.get_admin_campaign_performance_v1(array[campaign_id],null,null,999) is distinct from '[]'::jsonb then raise exception 'Unknown publication fabricated'; end if;

  -- Publish fixture v2 with a different threshold; historical views/actions/order remain v1.
  insert into public.commercial_campaign_versions(campaign_id,version_number,campaign_snapshot,item_snapshot,audience_rule_snapshot,published_by,published_at)
    select v.campaign_id,2,jsonb_set(v.campaign_snapshot,'{spendConfig,thresholdAmountUsd}','"2500.00"'),v.item_snapshot,v.audience_rule_snapshot,admin_id,now()
    from public.commercial_campaign_versions v where v.campaign_id=campaign_id and v.version_number=1;
  insert into public.commercial_campaign_audience_snapshots(campaign_id,version_number,company_id,included,eligibility_reason)
    select a.campaign_id,2,a.company_id,a.included,a.eligibility_reason from public.commercial_campaign_audience_snapshots a where a.campaign_id=campaign_id and a.version_number=1;
  update public.commercial_campaigns c set current_version=2 where c.id=campaign_id;
  perform set_config('request.jwt.claim.sub',partner_id::text,true);
  perform public.record_commercial_campaign_view_v1(company_id,campaign_id,session_id,request_id);
  perform public.record_commercial_campaign_view_v1(company_id,campaign_id,session_id,gen_random_uuid());
  if (select publication_version from public.commercial_campaign_engagement_events e where e.request_id=request_id) is distinct from 1 then raise exception 'Historical view rewritten'; end if;
  select id into event_id from public.commercial_campaign_engagement_events e where e.campaign_id=campaign_id and e.event_type='added_to_cart' limit 1;
  update public.commercial_campaign_engagement_events set publication_version=2,mechanic_eligible=false where id=event_id;
  if (select publication_version from public.commercial_campaign_engagement_events where id=event_id) is distinct from 1 then raise exception 'Historical action rewritten'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  result := public.get_admin_campaign_performance_v1(array[campaign_id],now()-interval '1 day',now()+interval '1 minute',1)->0;
  if result->>'offerViews' is distinct from '1' or result->>'attributedOrders' is distinct from '1' then raise exception 'v1 context lost'; end if;
  result := public.get_admin_campaign_performance_v1(array[campaign_id],now()-interval '1 day',now()+interval '1 minute',2)->0;
  if result->>'offerViews' is distinct from '1' or result->>'attributedOrders' is distinct from '0' then raise exception 'Publication contexts mixed'; end if;

  -- Synthetic aggregation fixture: second governed-price line in the same saved order.
  select i.* into source_line from public.partner_order_items i where i.effective_price_evidence->>'campaignId'=campaign_id::text limit 1;
  select i.* into additional_line from public.partner_order_items i where i.order_id=source_line.order_id and i.id is distinct from source_line.id limit 1;
  select id into item_id from public.commercial_campaign_items i where i.campaign_id=campaign_id and i.product_id=additional_line.product_id;
  extra_evidence := source_line.effective_price_evidence || jsonb_build_object('campaignItemId',item_id,'spendRole','QUALIFYING_SPEND');
  result := public.get_admin_campaign_performance_v1(array[campaign_id],now()-interval '1 day',now()+interval '1 minute')->0;
  before_order_value := (result->'attributedOrderValue'->0->>'amount')::numeric;
  execute 'alter table public.partner_order_items disable trigger snapshot_partner_order_effective_price';
  update public.partner_order_items set source_unit_price=source_line.source_unit_price,partner_unit_price=source_line.partner_unit_price,
    line_total=source_line.partner_unit_price*quantity,effective_price_evidence=extra_evidence where id=additional_line.id;
  execute 'alter table public.partner_order_items enable trigger snapshot_partner_order_effective_price';
  insert into public.commercial_campaign_order_attributions(campaign_id,campaign_item_id,product_id,company_id,order_id,order_item_id,quantity,attribution_fingerprint,publication_version,mechanic_type)
    values(campaign_id,item_id,additional_line.product_id,company_id,source_line.order_id,additional_line.id,additional_line.quantity,
      encode(extensions.digest(extra_evidence::text,'sha256'),'hex'),1,'spend_threshold_promo') on conflict do nothing;
  insert into public.commercial_campaign_order_attributions(campaign_id,campaign_item_id,product_id,company_id,order_id,order_item_id,quantity,attribution_fingerprint,publication_version,mechanic_type)
    values(campaign_id,item_id,additional_line.product_id,company_id,source_line.order_id,additional_line.id,additional_line.quantity,
      encode(extensions.digest(extra_evidence::text,'sha256'),'hex'),1,'spend_threshold_promo') on conflict do nothing;
  result := public.get_admin_campaign_performance_v1(array[campaign_id],now()-interval '1 day',now()+interval '1 minute')->0;
  expected_units := source_line.quantity+additional_line.quantity;
  if result->>'attributedOrders' is distinct from '1' or result->>'attributedLines' is distinct from '2' or (result->>'attributedUnits')::bigint is distinct from expected_units then raise exception 'Multi-line order double counted: %',result; end if;
  if (result->'campaignPricedLineValue'->0->>'amount')::numeric is distinct from source_line.partner_unit_price*expected_units then raise exception 'Line value incorrect'; end if;
  if (result->'attributedOrderValue'->0->>'amount')::numeric is distinct from before_order_value-additional_line.line_total+source_line.partner_unit_price*additional_line.quantity then raise exception 'Full-order value duplicated'; end if;
  if has_table_privilege('authenticated','public.commercial_campaign_order_attributions','INSERT')
    or has_table_privilege('authenticated','private.campaign_measurement_coverage','UPDATE')
    or has_table_privilege('authenticated','public.commercial_campaign_engagement_events','INSERT')
    or has_function_privilege('anon','public.get_admin_campaign_performance_v1(uuid[],timestamptz,timestamptz,integer)','EXECUTE') then raise exception 'Browser privilege expansion'; end if;
  -- An authenticated internal identity without campaigns.view is also denied.
  delete from public.role_permissions rp using public.permissions p,public.internal_user_role_assignments a
    where rp.permission_id=p.id and p.code='campaigns.view' and a.user_id=admin_id and a.role_id=rp.role_id;
  delete from public.internal_user_capability_assignments a using public.permissions p
    where a.permission_id=p.id and p.code='campaigns.view' and a.user_id=admin_id;
  begin perform public.get_admin_campaign_performance_v1(array[campaign_id]);
    raise exception 'Internal identity without permission accepted';
  exception when insufficient_privilege then null; end;
  raise notice 'Wave2B PASS: view/session/request idempotency, company/role/anonymous denial, forged item/version guard, preserved publications, transaction qualification/reward/spend, one-order multi-line monetary attribution, no browser provenance writes.';
end;
$$;
rollback;
