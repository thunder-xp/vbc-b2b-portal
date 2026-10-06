-- Requires campaign_intent_fixture.sql in the asserted disposable project.
begin;

do $$
begin
  if current_setting('intent.disposable_task', true)
      is distinct from 'VBC-PLATFORM-INTEGRITY-P1-CART-TO-PURCHASING-LIST-AUTHORITY-HARDENING-20261006'
    or current_setting('application_name') <> 'cart-to-list-authority-disposable'
  then
    raise exception 'Disposable target assertion missing';
  end if;

  if to_regnamespace('intent_fixture') is null then
    raise exception 'campaign_intent_fixture.sql must be loaded first';
  end if;
end
$$;

create or replace function intent_fixture.expect_cart_list_rejection(
  test_label text,
  target_company uuid,
  source_cart uuid,
  submitted_items jsonb
)
returns void
language plpgsql
set search_path = public, intent_fixture
as $$
declare
  before_lists integer;
  before_items integer;
  before_events integer;
  after_lists integer;
  after_items integer;
  after_events integer;
  accepted boolean := true;
begin
  select count(*)
  into before_lists
  from public.purchasing_lists list
  where list.name like 'AUTHORITY RUNTIME %';

  select count(*)
  into before_items
  from public.purchasing_list_items item
  join public.purchasing_lists list on list.id = item.list_id
  where list.name like 'AUTHORITY RUNTIME %';

  select count(*)
  into before_events
  from public.purchasing_list_events event
  join public.purchasing_lists list on list.id = event.list_id
  where list.name like 'AUTHORITY RUNTIME %';

  begin
    perform public.create_purchasing_list(
      target_company,
      'AUTHORITY RUNTIME ' || test_label,
      null,
      'private',
      'cart',
      source_cart,
      submitted_items
    );
  exception when others then
    accepted := false;
  end;

  if accepted then
    raise exception 'Attack % was accepted', test_label;
  end if;

  select count(*)
  into after_lists
  from public.purchasing_lists list
  where list.name like 'AUTHORITY RUNTIME %';

  select count(*)
  into after_items
  from public.purchasing_list_items item
  join public.purchasing_lists list on list.id = item.list_id
  where list.name like 'AUTHORITY RUNTIME %';

  select count(*)
  into after_events
  from public.purchasing_list_events event
  join public.purchasing_lists list on list.id = event.list_id
  where list.name like 'AUTHORITY RUNTIME %';

  if (after_lists, after_items, after_events)
      is distinct from (before_lists, before_items, before_events)
  then
    raise exception 'Attack % was not atomic: before (%,%,%), after (%,%,%)',
      test_label,
      before_lists,
      before_items,
      before_events,
      after_lists,
      after_items,
      after_events;
  end if;
end
$$;

grant usage on schema intent_fixture to authenticated;
grant execute on function intent_fixture.expect_cart_list_rejection(text, uuid, uuid, jsonb)
  to authenticated;

do $$
declare
  partner uuid := 'aa500000-0000-4000-8000-000000000002';
  outsider uuid := 'aa500000-0000-4000-8000-000000000003';
  company uuid := 'ba500000-0000-4000-8000-000000000001';
  outsider_company uuid := 'ba500000-0000-4000-8000-000000000002';
begin
  delete from public.cart_items
  where cart_id = 'ea510000-0000-4000-8000-000000000001';

  insert into public.company_memberships(
    user_id,
    company_id,
    role_id,
    status,
    approved_by,
    approved_at
  )
  select partner, outsider_company, role.id, 'active', partner, now()
  from public.roles role
  where role.code = 'partner_owner'
  on conflict (user_id, company_id) do update
    set role_id = excluded.role_id,
        status = excluded.status;

  insert into public.company_memberships(
    user_id,
    company_id,
    role_id,
    status,
    approved_by,
    approved_at
  )
  select outsider, company, role.id, 'active', partner, now()
  from public.roles role
  where role.code = 'partner_viewer'
  on conflict (user_id, company_id) do update
    set role_id = excluded.role_id,
        status = excluded.status;
end
$$;

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  'aa500000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    'aa500000-0000-4000-8000-000000000001',
    'role',
    'authenticated'
  )::text,
  true
);
select public.publish_commercial_campaign(
  'fa510000-0000-4000-8000-000000000003',
  'ce520000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  'aa500000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    'aa500000-0000-4000-8000-000000000002',
    'role',
    'authenticated'
  )::text,
  true
);
select public.add_partner_cart_item(
  'ba500000-0000-4000-8000-000000000001',
  'ca500000-0000-4000-8000-000000000001',
  2
);
select public.add_partner_cart_item(
  'ba500000-0000-4000-8000-000000000001',
  'ca500000-0000-4000-8000-000000000002',
  4
);
select public.complete_commercial_campaign_bundle_v2(
  'ba500000-0000-4000-8000-000000000001',
  'fa510000-0000-4000-8000-000000000003',
  1,
  'ce520000-0000-4000-8000-000000000002'
);

do $$
declare
  campaign_line uuid;
begin
  select id
  into campaign_line
  from public.cart_items
  where cart_id = 'ea510000-0000-4000-8000-000000000001'
    and product_id = 'ca500000-0000-4000-8000-000000000001'
    and commercial_source = 'CAMPAIGN';

  perform public.set_partner_cart_item_quantity(campaign_line, 1);

  select id
  into campaign_line
  from public.cart_items
  where cart_id = 'ea510000-0000-4000-8000-000000000001'
    and product_id = 'ca500000-0000-4000-8000-000000000002'
    and commercial_source = 'CAMPAIGN';

  perform public.set_partner_cart_item_quantity(campaign_line, 2);
end
$$;

-- ATTACK A: extra product.
select intent_fixture.expect_cart_list_rejection(
  'A EXTRA PRODUCT',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 3),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000003', 'quantity', 1)
  )
);

-- ATTACK B: inflated quantity.
select intent_fixture.expect_cart_list_rejection(
  'B INFLATED QUANTITY',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 7),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);

-- ATTACK C: reduced quantity.
select intent_fixture.expect_cart_list_rejection(
  'C REDUCED QUANTITY',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 2),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);

-- ATTACK D: missing product.
select intent_fixture.expect_cart_list_rejection(
  'D MISSING PRODUCT',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 3)
  )
);

-- ATTACK F: a privileged user still cannot claim another user's cart.
select set_config(
  'request.jwt.claim.sub',
  'aa500000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    'aa500000-0000-4000-8000-000000000001',
    'role',
    'authenticated'
  )::text,
  true
);
select intent_fixture.expect_cart_list_rejection(
  'F WRONG CART OWNER',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 3),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);

-- ATTACK G: even an actor authorized for both companies cannot relabel the cart.
select set_config(
  'request.jwt.claim.sub',
  'aa500000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    'aa500000-0000-4000-8000-000000000002',
    'role',
    'authenticated'
  )::text,
  true
);
select intent_fixture.expect_cart_list_rejection(
  'G WRONG COMPANY',
  'ba500000-0000-4000-8000-000000000002',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 3),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);

-- ATTACK I: null cart reference.
select intent_fixture.expect_cart_list_rejection(
  'I NULL CART REFERENCE',
  'ba500000-0000-4000-8000-000000000001',
  null,
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 3),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);

-- ATTACK J: fake cart reference.
select intent_fixture.expect_cart_list_rejection(
  'J FAKE CART UUID',
  'ba500000-0000-4000-8000-000000000001',
  'ea520000-0000-4000-8000-000000000099',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 3),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);

-- Additional input hardening: unknown, duplicate, zero, negative and fractional.
select intent_fixture.expect_cart_list_rejection(
  'UNKNOWN PRODUCT',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca520000-0000-4000-8000-000000000099', 'quantity', 3),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);
select intent_fixture.expect_cart_list_rejection(
  'DUPLICATE PRODUCT',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 1),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 2),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);
select intent_fixture.expect_cart_list_rejection(
  'ZERO QUANTITY',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 0),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);
select intent_fixture.expect_cart_list_rejection(
  'NEGATIVE QUANTITY',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', -1),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);
select intent_fixture.expect_cart_list_rejection(
  'MALFORMED QUANTITY',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  '[{"product_id":"ca500000-0000-4000-8000-000000000001","quantity":1.5},{"product_id":"ca500000-0000-4000-8000-000000000002","quantity":6}]'::jsonb
);

-- A viewer in the cart company has no purchasing_lists.manage permission.
select set_config(
  'request.jwt.claim.sub',
  'aa500000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    'aa500000-0000-4000-8000-000000000003',
    'role',
    'authenticated'
  )::text,
  true
);
select intent_fixture.expect_cart_list_rejection(
  'NO MANAGE PERMISSION',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 3),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);

-- An authenticated owner from another company cannot access this company.
reset role;
delete from public.company_memberships
where user_id = 'aa500000-0000-4000-8000-000000000003'
  and company_id = 'ba500000-0000-4000-8000-000000000001';
set local role authenticated;

select intent_fixture.expect_cart_list_rejection(
  'OTHER COMPANY ACTOR',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 3),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);

reset role;

-- ATTACK H: inactive cart.
update public.carts
set status = 'submitting'
where id = 'ea510000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'aa500000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    'aa500000-0000-4000-8000-000000000002',
    'role',
    'authenticated'
  )::text,
  true
);
select intent_fixture.expect_cart_list_rejection(
  'H INACTIVE CART',
  'ba500000-0000-4000-8000-000000000001',
  'ea510000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000001', 'quantity', 3),
    jsonb_build_object('product_id', 'ca500000-0000-4000-8000-000000000002', 'quantity', 6)
  )
);

reset role;
update public.carts
set status = 'active'
where id = 'ea510000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'aa500000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    'aa500000-0000-4000-8000-000000000002',
    'role',
    'authenticated'
  )::text,
  true
);

do $$
declare
  company uuid := 'ba500000-0000-4000-8000-000000000001';
  cart uuid := 'ea510000-0000-4000-8000-000000000001';
  product_one uuid := 'ca500000-0000-4000-8000-000000000001';
  product_two uuid := 'ca500000-0000-4000-8000-000000000002';
  created public.purchasing_lists;
  non_cart public.purchasing_lists;
  source_before jsonb;
  source_after jsonb;
  merge_result jsonb;
  non_cart_type text;
begin
  select jsonb_agg(to_jsonb(item) order by item.id)
  into source_before
  from public.cart_items item
  where item.cart_id = cart;

  -- ATTACK E uses a valid exact set but forged item provenance and PROMO price.
  -- The list succeeds with server-derived cart reference and normal Partner price.
  created := public.create_purchasing_list(
    company,
    'AUTHORITY RUNTIME VALID MIXED CART',
    null,
    'private',
    'cart',
    cart,
    jsonb_build_array(
      jsonb_build_object(
        'product_id', product_one,
        'quantity', 3,
        'source_reference_id', 'ea520000-0000-4000-8000-000000000098',
        'source_unit_price', 8.25,
        'source_currency_code', 'EUR'
      ),
      jsonb_build_object(
        'product_id', product_two,
        'quantity', 6,
        'source_reference_id', 'ea520000-0000-4000-8000-000000000098',
        'source_unit_price', 15,
        'source_currency_code', 'EUR'
      )
    )
  );

  if (
    select jsonb_object_agg(item.product_id::text, item.quantity)
    from public.purchasing_list_items item
    where item.list_id = created.id
  ) is distinct from jsonb_build_object(product_one::text, 3, product_two::text, 6)
  then
    raise exception 'Mixed cart did not persist P1 x3 and P2 x6';
  end if;

  if (
    select count(*)
    from public.purchasing_list_items item
    where item.list_id = created.id
  ) <> 2 then
    raise exception 'Mixed cart did not produce exactly two list rows';
  end if;

  if not exists (
    select 1
    from public.purchasing_list_items item
    where item.list_id = created.id
      and item.product_id = product_one
      and item.source_type = 'cart'
      and item.source_reference_id = cart
      and item.source_unit_price = 9.21
      and item.source_currency_code = 'USD'
  ) then
    raise exception 'P1 Partner price authority failed';
  end if;

  if not exists (
    select 1
    from public.purchasing_list_items item
    where item.list_id = created.id
      and item.product_id = product_two
      and item.source_type = 'cart'
      and item.source_reference_id = cart
      and item.source_unit_price = 20
      and item.source_currency_code = 'USD'
  ) then
    raise exception 'P2 Partner price authority failed';
  end if;

  if exists (
    select 1
    from public.purchasing_list_items item
    where item.list_id = created.id
      and (
        item.source_unit_price in (8.25, 15)
        or item.source_currency_code = 'EUR'
        or item.source_reference_id <> cart
      )
  ) then
    raise exception 'Caller cart provenance or PROMO price was inherited';
  end if;

  select jsonb_agg(to_jsonb(item) order by item.id)
  into source_after
  from public.cart_items item
  where item.cart_id = cart;

  if source_after is distinct from source_before then
    raise exception 'Cart changed while creating the Purchasing List';
  end if;

  select public.merge_purchasing_list_into_cart(
    created.id,
    'ce520000-0000-4000-8000-000000000003',
    repeat('a', 64),
    (
      select jsonb_agg(
        jsonb_build_object(
          'item_id', item.id,
          'product_id', item.product_id,
          'quantity', item.quantity
        )
        order by item.position
      )
      from public.purchasing_list_items item
      where item.list_id = created.id
    ),
    '{}'::jsonb
  )
  into merge_result;

  if (merge_result ->> 'added')::integer <> 2 then
    raise exception 'List to Cart did not add both products';
  end if;

  if (
    select quantity
    from public.cart_items
    where cart_id = cart
      and product_id = product_one
      and commercial_source = 'STANDARD'
  ) <> 5
    or (
      select quantity
      from public.cart_items
      where cart_id = cart
        and product_id = product_two
        and commercial_source = 'STANDARD'
    ) <> 10
  then
    raise exception 'List to Cart did not increment STANDARD quantities';
  end if;

  if (
    select quantity
    from public.cart_items
    where cart_id = cart
      and product_id = product_one
      and commercial_source = 'CAMPAIGN'
  ) <> 1
    or (
      select quantity
      from public.cart_items
      where cart_id = cart
        and product_id = product_two
        and commercial_source = 'CAMPAIGN'
    ) <> 2
  then
    raise exception 'List to Cart changed CAMPAIGN quantities';
  end if;

  foreach non_cart_type in array array[
    'manual',
    'catalog',
    'order',
    'quick_reorder',
    'duplicate'
  ]
  loop
    non_cart := public.create_purchasing_list(
      company,
      'AUTHORITY RUNTIME NON CART ' || non_cart_type,
      null,
      'private',
      non_cart_type,
      'ea520000-0000-4000-8000-000000000097',
      jsonb_build_array(
        jsonb_build_object(
          'product_id', product_one,
          'quantity', 7,
          'source_reference_id', 'ea520000-0000-4000-8000-000000000096',
          'source_unit_price', 12.34,
          'source_currency_code', 'eur'
        )
      )
    );

    if not exists (
      select 1
      from public.purchasing_list_items item
      where item.list_id = non_cart.id
        and item.product_id = product_one
        and item.quantity = 7
        and item.source_type = non_cart_type
        and item.source_reference_id = 'ea520000-0000-4000-8000-000000000096'
        and item.source_unit_price = 12.34
        and item.source_currency_code = 'EUR'
    ) then
      raise exception 'Non-cart source % changed', non_cart_type;
    end if;
  end loop;

  raise notice
    'CART_LIST_AUTHORITY_OK mixed=P1x3/P2x6 price=P1:9.21USD/P2:20USD list_to_cart=STANDARD+3/+6 campaign=unchanged non_cart=5';
end
$$;

rollback;
