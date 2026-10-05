# Campaign intent cart forensic evidence

Task: VBC-SPECIAL-OFFERS-CAMPAIGN-INTENT-CART-20261004. Captured before implementation, 2026-10-05; production queries were read-only.

## Reported ARA34E case

- ALERT-SS SRL: `a7dc797a-1597-432f-8f3a-b2957354fbb8`, governed PLATINUM profile `9adc073c-3eb5-11f0-8d8a-7239d3b7bd5c`.
- SKU 160016 / ARA34E: product `7df4dfcd-b20e-4add-9ac8-acf139f79dc5`.
- Published offer `8e629f66-b04e-4db7-8322-e2c1f1ab3bb4`, current publication 5, `legacy_promo`, item `20974297-756b-4fcc-95ff-3b00f48f26db`.
- Active governed source prices: PLATINUM **9.21 USD**, PROMO **8.25 USD** (profile `b9f5d585-dab1-11e9-8a58-000c29cf9dd4`, code UU-000021).
- Current automatic RTL 999 rate: **18.041**. Ordinary price `round(9.21 * 18.041, 0) = 166 MDL`; PROMO `8.25 * 18.041 = 148.83825`, rounded **149 MDL**. Online 113 remains independently governed (currently 17.6191).
- Existing affected cart line has quantity 1 and the campaign/item identifiers. Attribution was persisted; numeric campaign pricing was not applied.

## Exact call path

1. Partner offer page → `CampaignCartControl` sends campaign item ID, quantity and an idempotency request ID. No browser-supplied commercial price is used.
2. `addCampaignItemToCartAction` → `DefaultCommercialCampaignService.addToCart` resolves company from authenticated membership → repository RPC `add_commercial_campaign_item_to_cart`.
3. The wrapper chain validates permissions/conditions and calls the foundation cart mutation. That mutation stores `campaign_id`, `campaign_item_id`, and an attribution fingerprint containing current publication, but has no explicit readable commercial source/publication/mechanic contract.
4. `cart_items_cart_product_unique UNIQUE(cart_id, product_id)` and `ON CONFLICT(cart_id,product_id)` merge ordinary and offer additions and overwrite attribution context. Different publications can also collapse.
5. `resolve_partner_cart_prices_internal_v1` discovers candidates globally by company audience, products anywhere in the cart and active campaign period. It does not select candidates from the line's persisted campaign context.
6. Its candidate loop explicitly filters `value->>'mechanic_type' <> 'legacy_promo'`. The component condition function independently returns `legacy_campaign` for that mechanic. Therefore this offer never applies its displayed PROMO; it falls back to PLATINUM 9.21 USD → **166 MDL**. This is deterministic, not an FX or missing-PROMO defect.
7. The RPC returns product ID rather than cart line ID. Pricing projection uses `evidenceByProduct`; cart/order services map commercial views by product ID. Merely changing SQL uniqueness would still collapse effective prices in projection/checkout.
8. Bundle, attach and spend helpers sum whole-cart product quantities/spend. They can let ordinary purchases qualify globally discovered campaigns, contrary to the newly approved intent contract.
9. Order validation and attribution likewise join by product ID, so both must preserve exact line identity when contexts coexist. Existing order history must stay immutable.

## Required coherent change

Reuse the existing engine and governed FX/ERP contract. Add deterministic STANDARD/CAMPAIGN identity, establish intent only in authorized offer mutations, scope all five mechanics to the same campaign publication, project by cart line ID, and retain exact provenance through order validation/insertion. Existing untrusted attribution-only cart rows default STANDARD; no inference from current campaign eligibility.
