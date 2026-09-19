-- Local/acceptance-only fixture. This file is intentionally outside migrations
-- and seeds. A local database reset removes every row created below.
do $$
declare
  active_user_id constant uuid := '22000000-0000-4000-8000-000000000001';
  onboarding_user_id constant uuid := '22000000-0000-4000-8000-000000000002';
  customer_user_id constant uuid := '22000000-0000-4000-8000-000000000003';
  active_agent_id uuid;
  onboarding_agent_id uuid;
  fixture_customer_identity_id uuid;
  fixture_customer_account_id uuid;
  fixture_publication_id constant uuid := '25000000-0000-4000-8000-000000000001';
  fixture_source_product_id constant uuid := '23000000-0000-4000-8000-000000000001';
  fixture_unavailable_source_product_id constant uuid := '23000000-0000-4000-8000-000000000002';
  fixture_public_product_id constant uuid := '24000000-0000-4000-8000-000000000001';
  fixture_unavailable_public_product_id constant uuid := '24000000-0000-4000-8000-000000000002';
  fixture_retail_customer_id constant uuid := '26000000-0000-4000-8000-000000000001';
  fixture_cart_id constant uuid := '27000000-0000-4000-8000-000000000001';
  fixture_order_id constant uuid := '28000000-0000-4000-8000-000000000001';
  service_request_id uuid;
  fixture_token_hash constant text := encode(digest(repeat('T', 43), 'sha256'), 'hex');
  referral_id uuid;
  customer_id uuid;
  referral_specs jsonb := jsonb_build_array(
    jsonb_build_object('key', 'new', 'name', 'Test Client New', 'final', 'CAPTURED', 'resolved', false),
    jsonb_build_object('key', 'qualified', 'name', 'Test Client Qualified', 'final', 'VERIFIED', 'resolved', true),
    jsonb_build_object('key', 'active', 'name', 'Test Client Active', 'final', 'ACTIVE', 'resolved', true),
    jsonb_build_object('key', 'closed', 'name', 'Test Client Closed', 'final', 'REJECTED', 'resolved', false)
  );
  spec jsonb;
  position integer := 0;
begin
  insert into public.user_profiles (id, email, full_name, status, user_type, preferred_locale)
  values
    (active_user_id, 'test.agent.novotech@example.test', 'Test Agent Novotech', 'active', 'external', 'ru'),
    (onboarding_user_id, 'test.agent.onboarding@example.test', 'Test Agent Onboarding Novotech', 'active', 'external', 'ru')
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    status = 'active',
    user_type = 'external',
    preferred_locale = 'ru';

  select id into active_agent_id from public.commercial_agents where user_id = active_user_id;
  if active_agent_id is null then
    select id into active_agent_id
    from public.create_commercial_agent_record(
      active_user_id, active_user_id, 'INDIVIDUAL', 'Test Agent Novotech', null,
      null, '+37360000001', 'test.agent.novotech@example.test', 'Chișinău',
      'Consultant test', 'Novotech acceptance'
    );
  end if;

  select id into onboarding_agent_id from public.commercial_agents where user_id = onboarding_user_id;
  if onboarding_agent_id is null then
    select id into onboarding_agent_id
    from public.create_commercial_agent_record(
      onboarding_user_id, onboarding_user_id, 'INDIVIDUAL', 'Test Agent Onboarding Novotech', null,
      null, '+37360000002', 'test.agent.onboarding@example.test', 'Chișinău',
      'Consultant test', 'Novotech acceptance'
    );
  end if;

  if (select status from public.commercial_agents where id = active_agent_id) = 'APPLIED' then
    perform public.transition_commercial_agent_record(active_agent_id, 'COMPLIANCE_REVIEW', active_user_id);
  end if;
  if (select compliance_status from public.commercial_agents where id = active_agent_id) <> 'APPROVED' then
    perform public.review_commercial_agent_compliance(
      active_agent_id, active_user_id, false, 'ALLOWED', false,
      'NONE_DECLARED', 'APPROVED', 'Local UX acceptance fixture'
    );
  end if;
  if (select status from public.commercial_agents where id = active_agent_id) = 'COMPLIANCE_REVIEW' then
    perform public.transition_commercial_agent_record(active_agent_id, 'CONTRACT_PENDING', active_user_id);
  end if;
  if (select status from public.commercial_agents where id = active_agent_id) = 'CONTRACT_PENDING' then
    perform public.transition_commercial_agent_record(active_agent_id, 'APPROVED', active_user_id);
  end if;
  if (select status from public.commercial_agents where id = active_agent_id) = 'APPROVED' then
    perform public.transition_commercial_agent_record(active_agent_id, 'ACTIVE', active_user_id);
  end if;
  update public.commercial_agents set contract_ready = true where id = active_agent_id and not contract_ready;

  if not exists (
    select 1 from public.agent_referral_tokens
    where agent_id = active_agent_id and token_hash = fixture_token_hash and status = 'ACTIVE'
  ) then
    insert into public.agent_referral_tokens (agent_id, token_hash, public_token, token_type)
    values (active_agent_id, fixture_token_hash, repeat('T', 43), 'QR');
    insert into public.agent_domain_events (agent_id, actor_user_id, event_type, safe_metadata)
    values (active_agent_id, active_user_id, 'TOKEN_CREATED', jsonb_build_object('source', 'LOCAL_ACCEPTANCE_FIXTURE'));
  end if;

  if not exists (select 1 from public.agent_referrals where agent_id = active_agent_id) then
    for spec in select value from jsonb_array_elements(referral_specs)
    loop
      position := position + 1;
      customer_id := null;
      if (spec->>'resolved')::boolean then
        customer_id := public.create_customer_identity_with_evidence(
          'PERSON',
          jsonb_build_array(jsonb_build_object(
            'key_type', 'PHONE',
            'key_hash', encode(digest('agent-fixture-' || (spec->>'key'), 'sha256'), 'hex'),
            'key_version', 1,
            'verified', true
          )),
          null
        );
      end if;

      referral_id := public.create_agent_referral_record(
        fixture_token_hash,
        customer_id,
        'PERSON',
        spec->>'name',
        '+37360000' || lpad((10 + position)::text, 3, '0'),
        null,
        'Chișinău',
        'Oficiu test',
        'Soluție CCTV pentru acceptarea UX',
        'Date sintetice, exclusiv pentru mediul local de acceptare.',
        'În următoarele 30 de zile',
        case when customer_id is null then 'NEW' else 'MATCHED' end,
        case when customer_id is null then 'NEW_IDENTITY' else 'EXACT_VERIFIED_PHONE' end,
        'test-agent-fixture-v1',
        now()
      );

      if spec->>'final' = 'REJECTED' then
        perform public.transition_agent_referral_record(referral_id, 'REJECTED', active_user_id, null, null, null);
      elsif spec->>'final' <> 'CAPTURED' then
        perform public.transition_agent_referral_record(referral_id, 'PENDING_REVIEW', active_user_id, customer_id, null, null);
        perform public.transition_agent_referral_record(referral_id, 'VERIFIED', active_user_id, customer_id, null, null);
        if spec->>'final' = 'ACTIVE' then
          perform public.create_agent_attribution_record(referral_id, active_user_id, now());
        end if;
      end if;
    end loop;
  end if;

  select account.id, account.customer_identity_id
  into fixture_customer_account_id, fixture_customer_identity_id
  from public.customer_accounts account
  where account.auth_user_id = customer_user_id;

  if fixture_customer_account_id is null then
    fixture_customer_identity_id := public.create_customer_identity_with_evidence(
      'PERSON',
      jsonb_build_array(jsonb_build_object(
        'key_type', 'PHONE',
        'key_hash', encode(digest('customer-cabinet-fixture-phone', 'sha256'), 'hex'),
        'key_version', 1,
        'verified', true
      )),
      null
    );
    insert into public.customer_accounts (
      auth_user_id, customer_identity_id, status, identity_resolution_status,
      display_name, email
    ) values (
      customer_user_id, fixture_customer_identity_id, 'ACTIVE', 'NEW',
      'Test Customer Novotech', 'test.customer.novotech@example.test'
    ) returning id into fixture_customer_account_id;
  end if;

  insert into public.catalog_products (
    id, external_1c_id, sku, name, slug, short_description, image_url,
    is_active, is_visible, image_normalization_status
  ) values
    (fixture_source_product_id, 'LOCAL-CUSTOMER-UX-V3-001', '100077', 'Dahua DH-HAP320', 'fixture-dh-hap320', 'Local-only purchase UX fixture.', '/product-placeholder.svg', true, true, 'normalized'),
    (fixture_unavailable_source_product_id, 'LOCAL-CUSTOMER-UX-V3-002', '100078', 'Dahua DHI-ARA11', 'fixture-dhi-ara11', 'Local-only unavailable purchase UX fixture.', '/product-placeholder.svg', true, true, 'normalized')
  on conflict (id) do nothing;

  insert into public.public_retail_product_identities (source_product_id, public_id)
  values
    (fixture_source_product_id, fixture_public_product_id),
    (fixture_unavailable_source_product_id, fixture_unavailable_public_product_id)
  on conflict (source_product_id) do nothing;

  if not exists (
    select 1
    from public.public_retail_publications publication
    where publication.id = fixture_publication_id
  ) then
    insert into public.public_retail_publications (
      id, status, checksum_sha256, source_product_count, eligible_product_count,
      published_at, build_duration_ms, publication_duration_ms
    ) values (
      fixture_publication_id, 'building', encode(digest('local-customer-ux-v3-publication', 'sha256'), 'hex'),
      2, 2, null, 0, 0
    );

    insert into public.public_retail_products (
      publication_id, public_id, slug, sku, name_ru, name_ro,
      retail_price_amount, retail_price_currency, retail_price_effective_at,
      vat_presentation, availability, primary_image_url, search_document
    ) values
      (fixture_publication_id, fixture_public_product_id, 'fixture-dh-hap320', '100077', 'Dahua DH-HAP320', 'Dahua DH-HAP320', 1299, 'MDL', now(), 'included', 'in_stock', '/product-placeholder.svg', '100077 dahua dh-hap320'),
      (fixture_publication_id, fixture_unavailable_public_product_id, 'fixture-dhi-ara11', '100078', 'Dahua DHI-ARA11', 'Dahua DHI-ARA11', 499, 'MDL', now(), 'included', 'unavailable', '/product-placeholder.svg', '100078 dahua dhi-ara11');

    update public.public_retail_publications
    set status = 'published', published_at = now()
    where id = fixture_publication_id and status = 'building';
  end if;

  insert into public.catalog_product_documents (id, product_id, title, document_type, url, sort_order)
  values
    ('2a000000-0000-4000-8000-000000000001', fixture_source_product_id, 'DH-HAP320 — инструкция', 'manual', 'https://example.test/dh-hap320-manual.pdf', 10),
    ('2a000000-0000-4000-8000-000000000002', fixture_source_product_id, 'DH-HAP320 — техническое описание', 'datasheet', 'https://example.test/dh-hap320-datasheet.pdf', 20)
  on conflict (id) do nothing;

  insert into public.retail_customers (
    id, normalized_phone_hash, normalized_email_hash, name, phone, email,
    processing_acknowledged_at, customer_identity_id
  ) values (
    fixture_retail_customer_id,
    encode(digest('local-customer-ux-v3-phone', 'sha256'), 'hex'),
    encode(digest('local-customer-ux-v3-email', 'sha256'), 'hex'),
    'Test Customer Novotech', '+37368000003', 'test.customer.novotech@example.test', now(), fixture_customer_identity_id
  ) on conflict (id) do nothing;

  insert into public.retail_carts (id, token_hash, status, expires_at)
  values (fixture_cart_id, encode(digest('local-customer-ux-v3-cart', 'sha256'), 'hex'), 'converted', now() + interval '30 days')
  on conflict (id) do nothing;

  insert into public.retail_orders (
    id, public_number, source_cart_id, customer_id, submission_key,
    request_fingerprint, checkout_fingerprint, status, locale, publication_id,
    currency, equipment_subtotal, materials_subtotal, priced_scope_total,
    vat_presentation, customer_snapshot, delivery_address_snapshot,
    paid_at, payment_activation_mode
  ) values (
    fixture_order_id, 'R-2026-990001', fixture_cart_id, fixture_retail_customer_id,
    '2b000000-0000-4000-8000-000000000001',
    encode(digest('local-customer-ux-v3-request', 'sha256'), 'hex'),
    encode(digest('local-customer-ux-v3-checkout', 'sha256'), 'hex'),
    'confirmed', 'ru', fixture_publication_id, 'MDL', 2198, 0, 2198,
    'included', jsonb_build_object('name', 'Test Customer Novotech'), '{}',
    now() - interval '5 days', 'pilot_simulated'
  ) on conflict (id) do nothing;

  insert into public.retail_order_lines (
    id, order_id, line_number, public_product_id, source, commercial_group,
    sku, product_name, slug_snapshot, image_url_snapshot, quantity, unit_code,
    unit_price, line_total, currency, vat_presentation, availability_snapshot
  ) values
    ('29000000-0000-4000-8000-000000000001', fixture_order_id, 1, fixture_public_product_id, 'catalog', 'equipment', '100077', 'Dahua DH-HAP320', 'fixture-dh-hap320', '/product-placeholder.svg', 1, 'piece', 1199, 1199, 'MDL', 'included', 'in_stock'),
    ('29000000-0000-4000-8000-000000000002', fixture_order_id, 2, fixture_unavailable_public_product_id, 'catalog', 'equipment', '100078', 'Dahua DHI-ARA11', 'fixture-dhi-ara11', '/product-placeholder.svg', 2, 'piece', 499.50, 999, 'MDL', 'included', 'in_stock')
  on conflict (id) do nothing;

  insert into public.retail_payment_attempts (
    id, retail_order_id, provider, status, amount, currency, idempotency_key,
    provider_checkout_id, provider_checkout_url, provider_payment_id,
    provider_status, provider_request_started_at, confirmed_at
  ) values (
    '2c000000-0000-4000-8000-000000000001', fixture_order_id, 'maib', 'paid',
    2198, 'MDL', '2c000000-0000-4000-8000-000000000002',
    '2c000000-0000-4000-8000-000000000003',
    'https://example.test/local-fixture-checkout',
    '2c000000-0000-4000-8000-000000000004', 'Executed',
    now() - interval '6 days', now() - interval '5 days'
  ) on conflict (id) do nothing;

  insert into public.retail_payment_events (
    id, payment_attempt_id, event_type, safe_evidence, created_at
  ) values (
    '2d000000-0000-4000-8000-000000000001',
    '2c000000-0000-4000-8000-000000000001', 'activation_completed',
    jsonb_build_object('source', 'LOCAL_ACCEPTANCE_FIXTURE'), now() - interval '5 days'
  ) on conflict (id) do nothing;

  -- A historical terminal attempt proves that a failed payment becomes a
  -- readable Customer attention fact without altering the later paid order.
  insert into public.retail_payment_attempts (
    id, retail_order_id, provider, status, amount, currency, idempotency_key,
    failure_code, provider_request_started_at
  ) values (
    '2c000000-0000-4000-8000-000000000005', fixture_order_id, 'maib', 'failed',
    2198, 'MDL', '2c000000-0000-4000-8000-000000000006',
    'LOCAL_ACCEPTANCE_FAILURE', now() - interval '7 days'
  ) on conflict (id) do nothing;

  insert into public.retail_payment_refunds (
    id, payment_attempt_id, provider, amount, currency, reason, status,
    provider_refund_id, provider_status, idempotency_key,
    provider_request_started_at, confirmed_at
  ) values (
    '2e000000-0000-4000-8000-000000000001',
    '2c000000-0000-4000-8000-000000000001', 'maib', 2198, 'MDL',
    'Local acceptance fixture only', 'refunded',
    '2e000000-0000-4000-8000-000000000002', 'Executed',
    '2e000000-0000-4000-8000-000000000003',
    now() - interval '4 days', now() - interval '3 days'
  ) on conflict (id) do nothing;

  insert into public.retail_payment_refund_events (
    id, refund_id, event_type, safe_evidence, created_at
  ) values (
    '2f000000-0000-4000-8000-000000000001',
    '2e000000-0000-4000-8000-000000000001', 'refund_confirmed',
    jsonb_build_object('source', 'LOCAL_ACCEPTANCE_FIXTURE'), now() - interval '3 days'
  ) on conflict (id) do nothing;

  if not exists (
    select 1 from public.customer_service_requests request
    where request.customer_account_id = fixture_customer_account_id
  ) then
    service_request_id := public.create_customer_service_request_v2(
      fixture_customer_account_id, fixture_customer_identity_id, customer_user_id,
      'ORDER_QUESTION', 'Нужна дополнительная информация',
      'Проверяем разговорный интерфейс обращения без связи с реальным заказом.',
      'PHONE', 'ru', null, null
    );
    perform public.admin_update_customer_service_request_v2(
      service_request_id, 0, 'IN_REVIEW',
      'Мы начали проверку обращения.', 'Local-only internal fixture note.', active_user_id
    );
    perform public.admin_update_customer_service_request_v2(
      service_request_id, 1, 'NEED_INFO',
      'Уточните, пожалуйста, удобное время для звонка.', '', active_user_id
    );

    service_request_id := public.create_customer_service_request_v2(
      fixture_customer_account_id, fixture_customer_identity_id, customer_user_id,
      'PRODUCT_QUESTION', 'Вопрос решён',
      'Проверяем спокойное представление завершённого обращения.',
      'EMAIL', 'ru', null, null
    );
    perform public.admin_update_customer_service_request_v2(
      service_request_id, 0, 'IN_REVIEW', '', '', active_user_id
    );
    perform public.admin_update_customer_service_request_v2(
      service_request_id, 1, 'ACCEPTED', '', '', active_user_id
    );
    perform public.admin_update_customer_service_request_v2(
      service_request_id, 2, 'RESOLVED',
      'Ответ предоставлен. Если понадобится помощь, создайте новое обращение.', '', active_user_id
    );
  end if;
end;
$$;
