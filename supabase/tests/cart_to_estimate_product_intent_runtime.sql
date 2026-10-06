-- Requires campaign_intent_fixture.sql in the asserted disposable project.
begin;

do $$
begin
  if current_setting('intent.disposable_task', true)
      is distinct from 'VBC-PLATFORM-INTEGRITY-P1-CART-TO-ESTIMATE-CONTEXT-REMEDIATION-20261006'
    or current_setting('application_name') <> 'cart-to-estimate-disposable'
  then
    raise exception 'Disposable target assertion missing';
  end if;
  if to_regnamespace('intent_fixture') is null then
    raise exception 'campaign_intent_fixture.sql must be loaded first';
  end if;
end $$;

do $$
declare
  admin uuid := 'aa500000-0000-4000-8000-000000000001';
  partner uuid := 'aa500000-0000-4000-8000-000000000002';
  outsider uuid := 'aa500000-0000-4000-8000-000000000003';
  company uuid := 'ba500000-0000-4000-8000-000000000001';
  product_one uuid := 'ca500000-0000-4000-8000-000000000001';
  product_two uuid := 'ca500000-0000-4000-8000-000000000002';
  cart uuid := 'ea510000-0000-4000-8000-000000000001';
  bundle_campaign uuid := 'fa510000-0000-4000-8000-000000000003';
  source_one_snapshot_at timestamptz;
  source_two_snapshot_at timestamptz;
  valid_lines jsonb;
  campaign_context_lines jsonb;
  single_context_lines jsonb;
  standard_products_lines jsonb;
  created public.estimates;
  repeated public.estimates;
  before_estimates integer;
  rejected boolean;
  campaign_line uuid;
begin
  perform set_config('request.jwt.claim.sub', admin::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin, 'role', 'authenticated')::text,
    true
  );
  perform public.publish_commercial_campaign(
    bundle_campaign,
    'ce510000-0000-4000-8000-000000000001'
  );

  perform set_config('request.jwt.claim.sub', partner::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', partner, 'role', 'authenticated')::text,
    true
  );

  delete from public.cart_items where cart_id = cart;
  perform public.add_partner_cart_item(company, product_one, 2);
  perform public.add_partner_cart_item(company, product_two, 4);
  perform public.complete_commercial_campaign_bundle_v2(
    company,
    bundle_campaign,
    1,
    'ce510000-0000-4000-8000-000000000002'
  );
  select id into campaign_line
  from public.cart_items
  where cart_id = cart
    and campaign_id = bundle_campaign
    and product_id = product_one;
  perform public.set_partner_cart_item_quantity(campaign_line, 1);
  select id into campaign_line
  from public.cart_items
  where cart_id = cart
    and campaign_id = bundle_campaign
    and product_id = product_two;
  perform public.set_partner_cart_item_quantity(campaign_line, 2);

  select updated_at into source_one_snapshot_at
  from public.product_prices
  where product_id = product_one
    and external_1c_price_type_id = (
      select external_1c_price_type_id
      from public.partner_companies
      where id = company
    )
    and is_active
    and is_published
  order by valid_from desc, id
  limit 1;

  select updated_at into source_two_snapshot_at
  from public.product_prices
  where product_id = product_two
    and external_1c_price_type_id = (
      select external_1c_price_type_id
      from public.partner_companies
      where id = company
    )
    and is_active
    and is_published
  order by valid_from desc, id
  limit 1;

  valid_lines := jsonb_build_array(
    jsonb_build_object(
      'product_id', product_one,
      'position', 1,
      'sku', 'FORGED-SKU-IS-IGNORED',
      'product_name', 'Forged name is ignored',
      'quantity', 3,
      'partner_price', 9.21,
      'currency_code', 'USD',
      'snapshot_at', source_one_snapshot_at,
      'converted_price', 9.21,
      'exchange_rate', 1,
      'exchange_rate_date', source_one_snapshot_at::date
    ),
    jsonb_build_object(
      'product_id', product_two,
      'position', 2,
      'sku', 'FORGED-SKU-IS-IGNORED-2',
      'product_name', 'Forged name is ignored 2',
      'quantity', 6,
      'partner_price', 20,
      'currency_code', 'USD',
      'snapshot_at', source_two_snapshot_at,
      'converted_price', 20,
      'exchange_rate', 1,
      'exchange_rate_date', source_two_snapshot_at::date
    )
  );

  select * into created
  from public.create_estimate_from_cart(
    cart,
    'Mixed cart estimate',
    'USD',
    valid_lines,
    'ce510000-0000-4000-8000-000000000003'
  );

  if (select count(*) from public.estimate_items where estimate_id = created.id) <> 2
    or (select quantity from public.estimate_items where estimate_id = created.id and product_id = product_one) <> 3
    or (select quantity from public.estimate_items where estimate_id = created.id and product_id = product_two) <> 6
    or (select source_unit_price from public.estimate_items where estimate_id = created.id and product_id = product_one) <> 9.21
    or (select selling_unit_price from public.estimate_items where estimate_id = created.id and product_id = product_one) <> 9.21
    or (select source_unit_price from public.estimate_items where estimate_id = created.id and product_id = product_two) <> 20
  then
    raise exception 'Mixed cart was not normalized to governed P1 quantity 3 and P2 quantity 6 lines';
  end if;

  if exists (
    select 1 from public.estimate_items
    where estimate_id = created.id
      and (source_unit_price = 8.25 or selling_unit_price = 8.25)
  ) then
    raise exception 'Campaign PROMO price transferred into the estimate';
  end if;

  if (select count(*) from public.cart_items where cart_id = cart) <> 4
    or (select sum(quantity) from public.cart_items where cart_id = cart) <> 9
    or not exists (
      select 1 from public.cart_items
      where cart_id = cart and commercial_source = 'STANDARD' and quantity = 2
    )
    or not exists (
      select 1 from public.cart_items
      where cart_id = cart and commercial_source = 'CAMPAIGN' and quantity = 1
    )
    or not exists (
      select 1 from public.cart_items
      where cart_id = cart and product_id = product_two and commercial_source = 'STANDARD' and quantity = 4
    )
    or not exists (
      select 1 from public.cart_items
      where cart_id = cart and product_id = product_two and commercial_source = 'CAMPAIGN' and quantity = 2
    )
  then
    raise exception 'Source cart changed during cart-to-estimate conversion';
  end if;

  select * into repeated
  from public.create_estimate_from_cart(
    cart,
    'Mixed cart estimate',
    'USD',
    valid_lines,
    'ce510000-0000-4000-8000-000000000003'
  );
  if repeated.id <> created.id
    or (select count(*) from public.estimates where id = created.id) <> 1
  then
    raise exception 'Cart-to-estimate request key is not idempotent';
  end if;

  select count(*) into before_estimates from public.estimates;

  rejected := false;
  begin
    perform public.create_estimate_from_cart(
      cart,
      'Forged quantity',
      'USD',
      jsonb_set(valid_lines, '{0,quantity}', '4'::jsonb),
      'ce510000-0000-4000-8000-000000000004'
    );
  exception when check_violation then
    rejected := true;
  end;
  if not rejected or (select count(*) from public.estimates) <> before_estimates then
    raise exception 'Forged quantity was not rejected atomically';
  end if;

  rejected := false;
  begin
    perform public.create_estimate_from_cart(
      cart,
      'Forged product',
      'USD',
      jsonb_set(valid_lines, '{0,product_id}', to_jsonb(product_two::text)),
      'ce510000-0000-4000-8000-000000000005'
    );
  exception when check_violation then
    rejected := true;
  end;
  if not rejected or (select count(*) from public.estimates) <> before_estimates then
    raise exception 'Forged product was not rejected atomically';
  end if;

  rejected := false;
  begin
    perform public.create_estimate_from_cart(
      cart,
      'Forged campaign price',
      'USD',
      jsonb_set(
        jsonb_set(valid_lines, '{0,partner_price}', '8.25'::jsonb),
        '{0,converted_price}',
        '8.25'::jsonb
      ),
      'ce510000-0000-4000-8000-000000000006'
    );
  exception when check_violation then
    rejected := true;
  end;
  if not rejected or (select count(*) from public.estimates) <> before_estimates then
    raise exception 'Forged price was not rejected atomically';
  end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', outsider, 'role', 'authenticated')::text,
    true
  );
  rejected := false;
  begin
    perform public.create_estimate_from_cart(
      cart,
      'Foreign cart',
      'USD',
      valid_lines,
      'ce510000-0000-4000-8000-000000000007'
    );
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected or (select count(*) from public.estimates) <> before_estimates then
    raise exception 'Foreign cart was not rejected atomically';
  end if;

  perform set_config('request.jwt.claim.sub', partner::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', partner, 'role', 'authenticated')::text,
    true
  );
  for campaign_line in
    select id
    from public.cart_items
    where cart_id = cart
      and not (product_id = product_one and commercial_source = 'CAMPAIGN')
  loop
    perform public.remove_partner_cart_item(campaign_line);
  end loop;

  campaign_context_lines := jsonb_build_array(valid_lines->0 || jsonb_build_object('quantity', 1));
  select * into repeated
  from public.create_estimate_from_cart(
    cart,
    'Campaign-only cart estimate',
    'USD',
    campaign_context_lines,
    'ce510000-0000-4000-8000-000000000008'
  );
  if (select count(*) from public.estimate_items where estimate_id = repeated.id) <> 1
    or (select quantity from public.estimate_items where estimate_id = repeated.id) <> 1
    or (select source_unit_price from public.estimate_items where estimate_id = repeated.id) <> 9.21
  then
    raise exception 'Campaign-only cart-to-estimate behavior or governed repricing regressed';
  end if;

  select id into campaign_line from public.cart_items where cart_id = cart;
  perform public.remove_partner_cart_item(campaign_line);
  perform public.add_partner_cart_item(company, product_one, 2);

  single_context_lines := jsonb_build_array(valid_lines->0 || jsonb_build_object('quantity', 2));
  select * into repeated
  from public.create_estimate_from_cart(
    cart,
    'Single-context cart estimate',
    'USD',
    single_context_lines,
    'ce510000-0000-4000-8000-000000000011'
  );
  if (select count(*) from public.estimate_items where estimate_id = repeated.id) <> 1
    or (select quantity from public.estimate_items where estimate_id = repeated.id) <> 2
  then
    raise exception 'Single-context STANDARD cart-to-estimate behavior regressed';
  end if;

  perform public.add_partner_cart_item(company, product_two, 4);
  standard_products_lines := jsonb_build_array(
    valid_lines->0 || jsonb_build_object('quantity', 2),
    valid_lines->1 || jsonb_build_object('quantity', 4)
  );
  select * into repeated
  from public.create_estimate_from_cart(
    cart,
    'Distinct STANDARD products estimate',
    'USD',
    standard_products_lines,
    'ce510000-0000-4000-8000-000000000012'
  );
  if (select count(*) from public.estimate_items where estimate_id = repeated.id) <> 2
    or (select quantity from public.estimate_items where estimate_id = repeated.id and product_id = product_one) <> 2
    or (select quantity from public.estimate_items where estimate_id = repeated.id and product_id = product_two) <> 4
  then
    raise exception 'Distinct STANDARD product cart-to-estimate behavior regressed';
  end if;

  raise notice 'PASS cart-to-estimate product intent: P1 2+1=3, P2 4+2=6, governed 9.21 price, unchanged cart, idempotency, forgery rejection, STANDARD/CAMPAIGN single-context regressions';
end $$;

rollback;
