-- Extension of V3A's legitimate published local campaigns, never a cloud fixture.
begin;
do $$begin
 if current_setting('intent.disposable_task',true) is distinct from 'VBC-SPECIAL-OFFERS-V3B-COMMERCIAL-ATTRACTIVENESS-20261008' then raise exception 'V3B disposable target required';end if;
 if not exists(select 1 from offer_feed_fixture.campaigns) then raise exception 'V3A fixture required first';end if;
end $$;
insert into public.commercial_exchange_rates(source_code,base_currency,quote_currency,rate_direction,rate,effective_date,is_published,is_active,purpose,source_type,effective_at,published_at,source_currency_ref,source_symbolic_code,source_raw_rate,source_multiplicity,source_data_version,source_checked_at)
select '113','USD','MDL','quote_per_base',18.6,current_date,true,true,'partner_price_usd_to_mdl','one_c_automatic',now(),now(),source_currency_ref,'BCR',18.6,1,'v3b-local-fixture',now()
from public.commercial_exchange_rates where purpose='retail_price_usd_to_mdl' and is_active and is_published
 and not exists(select 1 from public.commercial_exchange_rates where purpose='partner_price_usd_to_mdl' and is_active and is_published) limit 1;
commit;
