-- Disposable browser bootstrap only; no SMS/email/external integration.
begin;
do $$ begin if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004' or current_setting('application_name')<>'campaign-intent-disposable' then raise exception 'Disposable target assertion missing'; end if; end $$;
-- CLI bootstrap lacks the production backend SELECT baseline. Metadata verified read-only
-- on 2026-10-05: 468 public tables, 463 readable by service_role, these exact five excluded.
-- Disposable setup only: no authenticated/anon grants, writes, RLS or feature migration changes.
do $$ declare relation text; begin
 if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p'))<>468 then raise exception 'Unknown platform privilege baseline'; end if;
 for relation in select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relname not in
   ('b2b_product_demand_ranking','b2b_product_demand_ranking_state','commercial_campaign_spend_configs',
    'commercial_campaign_spend_roles','notification_provider_rate_policies') loop
  execute format('grant select on public.%I to service_role',relation);
 end loop;
end $$;
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',
 email_confirmed_at=now(),confirmation_token='',recovery_token='',email_change_token_new='',email_change='',
 email_change_token_current='',reauthentication_token='',phone_change='',phone_change_token='',
 raw_app_meta_data='{"provider":"email","providers":["email"]}',raw_user_meta_data='{}'
 where id in('aa500000-0000-4000-8000-000000000001','aa500000-0000-4000-8000-000000000002','aa500000-0000-4000-8000-000000000003');
insert into auth.identities(id,provider_id,user_id,identity_data,provider,created_at,updated_at)
 select ('ab500000-0000-4000-8000-'||right(id::text,12))::uuid,id::text,id,jsonb_build_object('sub',id,'email',email,'email_verified',true),'email',now(),now()
 from auth.users where id in('aa500000-0000-4000-8000-000000000001','aa500000-0000-4000-8000-000000000002','aa500000-0000-4000-8000-000000000003')
 on conflict(provider_id,provider) do nothing;
commit;

begin;
do $$ begin if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004' or current_setting('application_name')<>'campaign-intent-disposable' then raise exception 'Disposable target assertion missing'; end if; end $$;
update auth.users set phone='37369000102',phone_confirmed_at=now() where id='aa500000-0000-4000-8000-000000000002';
update public.user_profiles set phone='+37369000102' where id='aa500000-0000-4000-8000-000000000002';
commit;

begin;
do $$ begin if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004' or current_setting('application_name')<>'campaign-intent-disposable' then raise exception 'Disposable target assertion missing'; end if; end $$;
insert into public.commercial_exchange_rates(id,source_code,base_currency,quote_currency,rate_direction,rate,effective_date,is_published,is_active,purpose,source_type,effective_at,published_at,source_currency_ref,source_symbolic_code,source_raw_rate,source_multiplicity,source_data_version,source_checked_at)
 values('da520000-0000-4000-8000-000000000113','113','USD','MDL','quote_per_base',17.6191,current_date,true,true,'partner_price_usd_to_mdl','one_c_automatic',now(),now(),'55555555-5555-4555-8555-555555555555','BCRU',17.6191,1,'intent-fixture',now());
update public.commercial_rate_sync_state set status='FRESH',last_success_at=now(),last_source_checked_at=now(),last_result='NO_OP' where id='authoritative_1c';
select set_config('request.jwt.claim.sub','aa500000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"aa500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.publish_commercial_campaign('fa510000-0000-4000-8000-000000000001','fc710000-0000-4000-8000-000000000001');
commit;
