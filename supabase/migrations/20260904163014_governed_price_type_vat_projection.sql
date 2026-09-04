begin;

alter table public.price_types
  add column vat_included boolean,
  add column vat_basis_synced_at timestamptz,
  add constraint price_types_vat_basis_provenance_check
    check ((vat_included is null) = (vat_basis_synced_at is null));

alter table public.product_price_type_sync_stage
  add column vat_included boolean;

comment on column public.price_types.vat_included is
  'Authoritative Catalog_ВидыЦен.ЦенаВключаетНДС value from 1C. NULL means UNKNOWN; false is an authoritative EXCLUDED basis.';
comment on column public.price_types.vat_basis_synced_at is
  'Time the authoritative 1C price-type VAT basis was last projected. NULL means the basis is not proven.';
comment on column public.product_price_type_sync_stage.vat_included is
  'Nullable authoritative 1C VAT basis staged once per price type and synchronization run.';

alter table public.competitor_price_observations
  add column vat_semantics text not null default 'legacy_unknown'
    check (vat_semantics in ('user_attested','policy_assigned','legacy_unknown'));

alter table public.competitor_price_observations
  drop constraint competitor_price_observations_comparison_status_check,
  add constraint competitor_price_observations_comparison_status_check
    check (comparison_status in (
      'comparable','currency_mismatch','vat_not_comparable','vat_unknown','vat_mismatch',
      'stale_novotech_price','stale_competitor_price','incompatible_price_basis',
      'private_observation_not_authorized','price_unavailable'
    ));

comment on column public.competitor_price_observations.vat_semantics is
  'Governance provenance for competitor VAT basis. Existing rows are LEGACY_UNKNOWN; new fixed-policy rows are POLICY_ASSIGNED.';

create or replace function private.evaluate_competitive_price_comparison(
  p_competitor_price numeric,
  p_competitor_currency text,
  p_competitor_vat_basis text,
  p_competitor_price_basis text,
  p_competitor_fresh boolean,
  p_novotech_price numeric,
  p_novotech_currency text,
  p_novotech_vat_basis text,
  p_novotech_price_basis text,
  p_novotech_fresh boolean,
  p_same_product boolean,
  p_authorized boolean
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  comparison_status text;
  comparison_delta numeric;
begin
  comparison_status := case
    when not coalesce(p_authorized, false) then 'private_observation_not_authorized'
    when not coalesce(p_same_product, false) then 'incompatible_price_basis'
    when p_competitor_price is null or p_competitor_price <= 0
      or p_novotech_price is null or p_novotech_price <= 0 then 'price_unavailable'
    when not coalesce(p_novotech_fresh, false) then 'stale_novotech_price'
    when not coalesce(p_competitor_fresh, false) then 'stale_competitor_price'
    when nullif(upper(btrim(p_competitor_currency)), '') is null
      or nullif(upper(btrim(p_novotech_currency)), '') is null
      or upper(btrim(p_competitor_currency)) <> upper(btrim(p_novotech_currency)) then 'currency_mismatch'
    when p_competitor_vat_basis not in ('included','excluded')
      or p_novotech_vat_basis not in ('included','excluded') then 'vat_unknown'
    when p_competitor_vat_basis <> p_novotech_vat_basis then 'vat_mismatch'
    when nullif(p_competitor_price_basis, '') is null
      or nullif(p_novotech_price_basis, '') is null
      or p_competitor_price_basis <> p_novotech_price_basis then 'incompatible_price_basis'
    else 'comparable'
  end;

  if comparison_status = 'comparable' then
    comparison_delta := round(p_competitor_price - p_novotech_price, 4);
  end if;

  return jsonb_build_object(
    'status', comparison_status,
    'deltaAmount', comparison_delta,
    'deltaPercent', case
      when comparison_status = 'comparable'
        then round(comparison_delta / p_competitor_price * 100, 4)
      else null
    end
  );
end;
$$;

revoke all on function private.evaluate_competitive_price_comparison(
  numeric,text,text,text,boolean,numeric,text,text,text,boolean,boolean,boolean
) from public, anon, authenticated;
grant execute on function private.evaluate_competitive_price_comparison(
  numeric,text,text,text,boolean,numeric,text,text,text,boolean,boolean,boolean
) to service_role;

comment on function private.evaluate_competitive_price_comparison(
  numeric,text,text,text,boolean,numeric,text,text,text,boolean,boolean,boolean
) is 'Single fail-closed server comparator. It performs no FX and no VAT normalization.';

create or replace function private.govern_private_competitor_observation_comparison()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  partner_price record;
  retail_price record;
  selected_price record;
  comparison jsonb;
begin
  if new.vat_mode <> 'included' then
    raise exception 'Private competitor VAT basis must follow the server INCLUDED policy.' using errcode = '22023';
  end if;

  new.vat_mode := 'included';
  new.vat_semantics := 'policy_assigned';

  select
    price.price_amount amount,
    upper(price.currency) currency,
    price.effective_at,
    price.synced_at,
    case price_type.vat_included when true then 'included' when false then 'excluded' else 'unknown' end vat_basis
  into partner_price
  from public.partner_companies company
  join public.product_prices price
    on price.product_id = new.product_id
   and price.external_1c_price_type_id = company.external_1c_price_type_id
  join public.price_types price_type on price_type.id = price.price_type_id
  where company.id = new.partner_company_id
    and company.status = 'active'
    and price.is_active and price.is_published
    and price.currency_status = 'resolved'
    and price.valid_from <= now()
    and (price.valid_to is null or price.valid_to >= now())
  order by price.effective_at desc, price.updated_at desc
  limit 1;

  select
    price.price_amount amount,
    upper(price.currency) currency,
    price.effective_at,
    price.synced_at,
    case price_type.vat_included when true then 'included' when false then 'excluded' else 'unknown' end vat_basis
  into retail_price
  from public.product_prices price
  join public.price_types price_type on price_type.id = price.price_type_id
  where price.product_id = new.product_id
    and price_type.external_code = 'UU-000020'
    and price.is_active and price.is_published
    and price.currency_status = 'resolved'
    and price.valid_from <= now()
    and (price.valid_to is null or price.valid_to >= now())
  order by price.effective_at desc, price.updated_at desc
  limit 1;

  new.novotech_partner_price := partner_price.amount;
  new.novotech_partner_currency := partner_price.currency;
  new.novotech_partner_price_effective_at := partner_price.effective_at;
  new.novotech_retail_price := retail_price.amount;
  new.novotech_retail_currency := retail_price.currency;
  new.novotech_retail_price_effective_at := retail_price.effective_at;

  if partner_price.amount is not null then selected_price := partner_price;
  else selected_price := retail_price;
  end if;

  new.comparison_price := selected_price.amount;
  new.comparison_currency := selected_price.currency;
  new.comparison_basis := case
    when partner_price.amount is not null then 'partner_price'
    when retail_price.amount is not null then 'retail_price'
  end;
  new.comparison_vat_mode := case
    when selected_price.vat_basis in ('included','excluded') then selected_price.vat_basis
    else 'not_specified'
  end;

  comparison := private.evaluate_competitive_price_comparison(
    new.observed_price,
    new.currency,
    'included',
    'unit',
    new.observation_date >= current_date - 30
      and (new.valid_until is null or new.valid_until >= current_date),
    selected_price.amount,
    selected_price.currency,
    selected_price.vat_basis,
    'unit',
    selected_price.synced_at >= now() - interval '36 hours',
    true,
    true
  );

  new.comparison_status := comparison->>'status';
  new.delta_amount := (comparison->>'deltaAmount')::numeric;
  new.delta_percent := (comparison->>'deltaPercent')::numeric;
  return new;
end;
$$;

revoke all on function private.govern_private_competitor_observation_comparison()
  from public, anon, authenticated;

create trigger govern_private_competitor_observation_comparison
before insert on public.competitor_price_observations
for each row execute function private.govern_private_competitor_observation_comparison();

comment on function private.govern_private_competitor_observation_comparison() is
  'Applies the explicit server INCLUDED policy and authoritative current Novotech VAT basis to new private observations.';

create or replace function public.publish_product_price_snapshot(
  p_sync_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_published integer := 0;
  v_deactivated integer := 0;
  v_unmatched integer := 0;
  v_unknown integer := 0;
begin
  if not exists (
    select 1 from public.price_sync_state
    where id = 'product_prices' and active_sync_id = p_sync_id and scan_complete
  ) then
    raise exception 'price sync is not ready for publication';
  end if;

  insert into public.price_types (
    external_ref, external_code, name, currency_ref, currency_code, currency_status,
    vat_included, vat_basis_synced_at, is_active, source_updated_at, updated_at
  )
  select
    price_type.external_ref,
    price_type.external_code,
    price_type.name,
    price_type.currency_ref,
    currency.code,
    case when currency.code is null then 'unresolved' else 'resolved' end,
    price_type.vat_included,
    case when price_type.vat_included is null then null else now() end,
    price_type.is_active,
    now(),
    now()
  from public.product_price_type_sync_stage price_type
  left join public.product_currency_sync_stage currency
    on currency.sync_id = p_sync_id
   and currency.external_ref = price_type.currency_ref
  where price_type.sync_id = p_sync_id
  on conflict (external_ref) do update set
    external_code = excluded.external_code,
    name = excluded.name,
    currency_ref = excluded.currency_ref,
    currency_code = excluded.currency_code,
    currency_status = excluded.currency_status,
    vat_included = excluded.vat_included,
    vat_basis_synced_at = excluded.vat_basis_synced_at,
    is_active = excluded.is_active,
    source_updated_at = excluded.source_updated_at,
    updated_at = excluded.updated_at;

  update public.price_types price_type set is_active = false, updated_at = now()
  where not exists (
    select 1 from public.product_price_type_sync_stage staged
    where staged.sync_id = p_sync_id and staged.external_ref = price_type.external_ref
  );

  select count(*) into v_unmatched
  from public.product_price_sync_stage staged
  left join public.catalog_products product on product.external_1c_id = staged.external_product_ref
  where staged.sync_id = p_sync_id and product.id is null;

  select count(*) into v_unknown
  from public.product_price_sync_stage staged
  left join public.price_types price_type on price_type.external_ref = staged.external_price_type_ref
  where staged.sync_id = p_sync_id and price_type.id is null;

  insert into public.product_prices (
    product_id, company_id, external_1c_price_type_id, currency, price_amount,
    valid_from, valid_to, is_active, price_type_id, external_product_ref,
    effective_at, synced_at, currency_status, last_seen_sync_id, is_published
  )
  select
    product.id, null, staged.external_price_type_ref,
    coalesce(price_type.currency_code, 'XXX'), staged.amount, staged.effective_at, null,
    staged.is_current and staged.amount > 0, price_type.id, staged.external_product_ref,
    staged.effective_at, now(), price_type.currency_status, p_sync_id, true
  from public.product_price_sync_stage staged
  join public.catalog_products product on product.external_1c_id = staged.external_product_ref
  join public.price_types price_type on price_type.external_ref = staged.external_price_type_ref
  where staged.sync_id = p_sync_id
    and staged.external_characteristic_ref = '00000000-0000-0000-0000-000000000000'
  on conflict (product_id, external_1c_price_type_id) do update set
    currency = excluded.currency,
    price_amount = excluded.price_amount,
    valid_from = excluded.valid_from,
    valid_to = null,
    is_active = excluded.is_active,
    price_type_id = excluded.price_type_id,
    external_product_ref = excluded.external_product_ref,
    effective_at = excluded.effective_at,
    synced_at = excluded.synced_at,
    currency_status = excluded.currency_status,
    last_seen_sync_id = p_sync_id,
    is_published = true;

  get diagnostics v_published = row_count;

  update public.product_prices set is_active = false
  where is_published and company_id is null and last_seen_sync_id is distinct from p_sync_id;
  get diagnostics v_deactivated = row_count;

  delete from public.product_price_sync_stage where sync_id = p_sync_id;
  delete from public.product_price_type_sync_stage where sync_id = p_sync_id;
  delete from public.product_currency_sync_stage where sync_id = p_sync_id;

  update public.price_sync_state set
    status = 'succeeded', current_stage = 'completed', finished_at = now(),
    last_successful_sync_at = now(), latest_prices_resolved = v_published + v_unmatched + v_unknown,
    prices_published = v_published, prices_deactivated = v_deactivated,
    unmatched_products = v_unmatched, unknown_price_types = v_unknown,
    active_sync_id = null, lock_acquired_at = null, active_chunk_token = null,
    chunk_started_at = null, safe_error = null, updated_at = now()
  where id = 'product_prices' and active_sync_id = p_sync_id;

  return jsonb_build_object(
    'published', v_published,
    'deactivated', v_deactivated,
    'unmatchedProducts', v_unmatched,
    'unknownPriceTypes', v_unknown
  );
end;
$$;

create or replace function public.get_partner_product_competitor_pricing(
  p_company_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  novotech record;
begin
  if not public.can_access_competitive_intelligence(p_company_id, 'competitive_intelligence.view') then
    raise exception 'Competitive intelligence access denied.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.catalog_products
    where id = p_product_id and is_active and is_visible
  ) then
    raise exception 'Product unavailable.' using errcode = '22023';
  end if;

  select
    price.price_amount,
    upper(price.currency) currency,
    price.effective_at,
    price.synced_at,
    case price_type.vat_included when true then 'included' when false then 'excluded' else 'unknown' end vat_basis
  into novotech
  from public.partner_companies company
  join public.product_prices price
    on price.product_id = p_product_id
   and price.external_1c_price_type_id = company.external_1c_price_type_id
  join public.price_types price_type on price_type.id = price.price_type_id
  where company.id = p_company_id and company.status = 'active'
    and price.is_active and price.is_published and price.currency_status = 'resolved'
    and price.valid_from <= now() and (price.valid_to is null or price.valid_to >= now())
  order by price.effective_at desc, price.updated_at desc
  limit 1;

  return jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'competitorId', item.competitor_id,
        'competitorName', item.competitor_name,
        'retailPrice', item.retail_price,
        'retailCurrency', item.retail_currency,
        'retailEffectiveDate', item.retail_effective_date,
        'ownPrice', item.own_price,
        'ownCurrency', item.own_currency,
        'ownObservationDate', item.own_observation_date,
        'ownQuantity', item.own_quantity,
        'retailDiscountAmount', null,
        'retailDiscountPercent', null,
        'retailComparisonStatus', 'incompatible_price_basis',
        'novotechPrice', novotech.price_amount,
        'novotechCurrency', novotech.currency,
        'novotechDifferenceAmount', (item.comparison->>'deltaAmount')::numeric,
        'novotechDifferencePercent', (item.comparison->>'deltaPercent')::numeric,
        'comparisonStatus', item.comparison->>'status'
      ) order by item.competitor_name), '[]'::jsonb)
      from (
        select
          current.competitor_id,
          competitor.display_name competitor_name,
          current.retail_price,
          current.currency retail_currency,
          current.effective_date retail_effective_date,
          own.observed_price own_price,
          own.currency own_currency,
          own.observation_date own_observation_date,
          own.quantity own_quantity,
          private.evaluate_competitive_price_comparison(
            own.observed_price,
            own.currency,
            case
              when own.vat_semantics in ('user_attested','policy_assigned')
                and own.vat_mode in ('included','excluded') then own.vat_mode
              else 'unknown'
            end,
            'unit',
            own.observation_date >= current_date - 30
              and (own.valid_until is null or own.valid_until >= current_date),
            novotech.price_amount,
            novotech.currency,
            novotech.vat_basis,
            'unit',
            novotech.synced_at >= now() - interval '36 hours',
            current.mapped_novotech_product_id = p_product_id,
            own.partner_company_id = p_company_id
          ) comparison
        from public.current_competitor_retail_prices current
        join public.competitive_intelligence_competitors competitor
          on competitor.id = current.competitor_id and competitor.status = 'active'
        left join lateral (
          select
            observation.observed_price,
            observation.currency,
            observation.observation_date,
            observation.valid_until,
            observation.quantity,
            observation.vat_mode,
            observation.vat_semantics,
            observation.partner_company_id
          from public.competitor_price_observations observation
          left join public.competitive_intelligence_reconciliation_queue queue
            on queue.normalized_name = observation.normalized_submitted_competitor_name
          where observation.partner_company_id = p_company_id
            and observation.product_id = p_product_id
            and coalesce(observation.competitor_id, queue.resolved_competitor_id) = current.competitor_id
            and observation.status = 'active' and not observation.is_test_data
            and not exists (
              select 1 from public.competitor_price_observations newer
              where newer.supersedes_observation_id = observation.id
            )
            and not exists (
              select 1 from public.competitive_intelligence_observation_reviews review
              where review.observation_id = observation.id and review.decision = 'exclude'
            )
          order by observation.observation_date desc, observation.created_at desc, observation.id desc
          limit 1
        ) own on true
        where current.mapped_novotech_product_id = p_product_id
      ) item
    )
  );
end;
$$;

revoke all on function public.get_partner_product_competitor_pricing(uuid,uuid)
  from public, anon;
grant execute on function public.get_partner_product_competitor_pricing(uuid,uuid)
  to authenticated;

comment on function public.get_partner_product_competitor_pricing(uuid,uuid) is
  'Returns bounded company-scoped competitor data with server-authoritative exact-currency/VAT comparison and no FX.';

commit;
