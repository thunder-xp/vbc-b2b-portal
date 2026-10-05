// Actual PostgREST/JWT boundary and concurrent idempotency, disposable fixture only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const proof = spawnSync(process.execPath, ['scripts/campaign-intent-validation.mjs', 'assert'], { encoding: 'utf8' });
assert.equal(proof.status, 0, 'Disposable environment proof required');
const bytes = readFileSync('.codex/intent-status.json');
const config = JSON.parse(bytes.toString(bytes[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
assert.equal(config.API_URL, 'http://127.0.0.1:55381');
const credentials = JSON.parse(readFileSync('.codex/intent-browser-login.json', 'utf8'));
assert.equal(credentials.email, 'quantity-promo-partner@example.test');
const partner = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const reader = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await partner.auth.signInWithPassword(credentials);
assert.equal(login.error, null, 'Public fixture sign-in failed');
const company = 'ba500000-0000-4000-8000-000000000001';
const otherCompany = 'ba500000-0000-4000-8000-000000000002';
const cart = 'ea510000-0000-4000-8000-000000000001';
const product = 'ca500000-0000-4000-8000-000000000001';
const campaign = 'fa510000-0000-4000-8000-000000000001';
const itemQuery = await reader.from('commercial_campaign_items').select('id').eq('campaign_id', campaign).eq('product_id', product).single();
assert.equal(itemQuery.error, null);
const item = itemQuery.data.id;
const forged = { cart_id: cart, product_id: product, quantity: 1, commercial_source: 'CAMPAIGN', campaign_id: campaign,
  campaign_item_id: item, campaign_publication_version: 1, campaign_mechanic_type: 'legacy_promo' };
const insert = await partner.from('cart_items').insert(forged);
assert.equal(insert.error?.code, '42501', 'Direct client intent insertion must fail');
const ordinary = await partner.rpc('add_partner_cart_item', { target_company_id: company, target_product_id: product, added_quantity: 1 });
assert.equal(ordinary.error, null);
const ordinaryLines = await reader.from('cart_items').select('id,commercial_source').eq('cart_id', cart).eq('commercial_source', 'STANDARD');
assert.equal(ordinaryLines.error, null);
assert.equal(ordinaryLines.data.length, 1);
const normal = ordinaryLines.data[0].id;
const update = await partner.from('cart_items').update(forged).eq('id', normal);
assert.equal(update.error?.code, '42501', 'Direct client intent reassignment must fail');
const injected = await partner.rpc('add_partner_cart_item', { target_company_id: company, target_product_id: product, added_quantity: 1,
  commercial_source: 'CAMPAIGN', campaign_id: campaign, publication_version: 1, promo_price: 1, eligible: true });
assert.equal(injected.error?.code, 'PGRST202', 'Ordinary RPC must not accept a commercial payload');
const params = { p_company_id: company, p_campaign_item_id: item, p_publication_version: 1, p_quantity: 1,
  p_request_id: 'fd810000-0000-4000-8000-000000000001' };
assert.equal((await partner.rpc('add_commercial_campaign_item_to_cart_v2', { ...params, p_publication_version: 999 })).error?.code, 'PT409');
assert.equal((await partner.rpc('add_commercial_campaign_item_to_cart_v2', { ...params, p_company_id: otherCompany })).error?.code, '42501');
const responses = await Promise.all([partner.rpc('add_commercial_campaign_item_to_cart_v2', params), partner.rpc('add_commercial_campaign_item_to_cart_v2', params)]);
for (const result of responses) assert.equal(result.error, null, 'Concurrent authorized mutation failed');
assert.equal(responses[0].data.cartItemId, responses[1].data.cartItemId);
const rows = await reader.from('cart_items').select('id,quantity,commercial_source,campaign_publication_version').eq('cart_id', cart);
assert.equal(rows.error, null);
assert.equal(rows.data.length, 2);
assert.equal(rows.data.find((row) => row.commercial_source === 'CAMPAIGN').quantity, 1);
const events = await reader.from('commercial_campaign_engagement_events').select('id').eq('request_id', params.p_request_id);
assert.equal(events.error, null);
assert.equal(events.data.length, 1, 'Concurrent request created duplicate measurement');
const prices = await partner.rpc('resolve_partner_cart_prices_v1', { p_cart_id: cart, p_price_type_ref: null, p_review: true });
assert.equal(prices.error, null);
assert.equal(prices.data.items.find((row) => row.commercialSource === 'STANDARD').evidence.priceSource, 'PARTNER');
assert.equal(prices.data.items.find((row) => row.commercialSource === 'CAMPAIGN').evidence.priceSource, 'CAMPAIGN_PROMO');
// Restore only these two deterministic disposable fixture lines through authorized mutations.
for (const row of rows.data) assert.equal((await partner.rpc('remove_partner_cart_item', { target_item_id: row.id })).error, null);
console.log('PASS authenticated REST forgery denial, normal STANDARD mutation, cross-company/publication denial, concurrent idempotency and truthful measurement.');
