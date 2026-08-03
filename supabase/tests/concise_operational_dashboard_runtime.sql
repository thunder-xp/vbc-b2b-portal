begin;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a5059f54-7b50-415d-a8a4-0a4e878af919","role":"authenticated"}',
  true
);

do $$
declare
  dashboard jsonb;
  test_item jsonb;
  dismissal jsonb;
begin
  dashboard := public.get_partner_workspace_dashboard_v3(
    'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid
  );

  if jsonb_array_length(dashboard->'attentionItems') = 0 then
    raise exception 'expected ALERT-SS attention items';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(dashboard->'attentionItems') item
    where item->>'href' like '/cabinet/orders/%'
      and not exists (
      select 1 from public.partner_order_history history
      where history.id::text = item->>'objectId'
        and history.company_id = 'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid
        and history.partner_visible
        and not history.one_c_deletion_mark
    )
  ) then
    raise exception 'dashboard serialized a non-visible order route';
  end if;

  select item into test_item
  from jsonb_array_elements(dashboard->'attentionItems') item
  where item->>'kind' = 'test_return_overdue'
  order by item->>'objectNumber'
  limit 1;
  if test_item is null then
    raise exception 'expected governed TEST return attention';
  end if;
  if test_item->>'dismissPolicy' <> 'cooldown_7_days' then
    raise exception 'TEST dismissal policy mismatch';
  end if;

  dismissal := public.dismiss_partner_dashboard_attention(
    'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid,
    (test_item->>'id')::uuid,
    test_item->>'sourceFingerprint'
  );
  if dismissal->>'policy' <> 'cooldown_7_days' then
    raise exception 'dismissal result policy mismatch';
  end if;
  if public.dismiss_partner_dashboard_attention(
    'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid,
    (test_item->>'id')::uuid,
    test_item->>'sourceFingerprint'
  )->>'id' <> dismissal->>'id' then
    raise exception 'repeated dismissal was not idempotent';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(
      public.get_partner_workspace_dashboard_v3(
        'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid
      )->'attentionItems'
    ) item
    where item->>'id' = test_item->>'id'
  ) then
    raise exception 'dismissed TEST attention remained visible';
  end if;
end;
$$;

reset role;

do $$
declare
  dismissed_source uuid;
begin
  select source_id into strict dismissed_source
  from public.partner_dashboard_attention_dismissals
  where company_id = 'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid;

  if (select count(*) from public.partner_dashboard_attention_events
      where company_id = 'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid) <> 1 then
    raise exception 'expected one append-only dismissal event';
  end if;

  begin
    update public.partner_dashboard_attention_events
    set occurred_at = now()
    where company_id = 'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid;
    raise exception 'event update unexpectedly succeeded';
  exception when sqlstate '55000' then
    null;
  end;

  update public.partner_order_history
  set updated_at = updated_at + interval '1 second'
  where id = dismissed_source;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a5059f54-7b50-415d-a8a4-0a4e878af919","role":"authenticated"}',
  true
);

do $$
begin
  if not exists (
    select 1
    from jsonb_array_elements(
      public.get_partner_workspace_dashboard_v3(
        'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid
      )->'attentionItems'
    ) item
    where item->>'kind' = 'test_return_overdue'
  ) then
    raise exception 'changed source fingerprint did not restore attention';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.get_partner_workspace_dashboard_v3(
      'a7dc797a-1597-432f-8f3a-b2957354fbb8'::uuid
    );
    raise exception 'cross-tenant dashboard read unexpectedly succeeded';
  exception when sqlstate '42501' then
    null;
  end;
end;
$$;

reset role;
rollback;

select 'concise_operational_dashboard_runtime_passed' as result;
