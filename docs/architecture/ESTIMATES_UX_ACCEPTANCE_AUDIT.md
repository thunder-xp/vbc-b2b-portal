# Estimates UX Acceptance Audit

## Scope

This audit covers the partner-owned estimate, proposal, version, PDF, and cart-conversion workflow. SMTP delivery is excluded. Findings were established from the production source contract and automated UI/service coverage because an authenticated browser session was unavailable during the initial audit.

## Confirmed Findings

1. Estimate creation is compact and redirects to the editor, but it is a dedicated page and does not offer a proposal template.
2. Product search is bounded and server-side, but the editor ignores available image, category, brand, stock, and arrival fields.
3. The product action and service support a 50-product batch, while the UI submits one product per click.
4. Service entry supports only one controlled service per mutation and has no search or multi-selection flow.
5. Commercial edits are local until one atomic save, but there is no multi-line selection or bulk commercial toolbar.
6. Line removal is a separate mutation and is disabled while local changes are pending.
7. Sections, line ordering, discounts, VAT, currency conversion, charges, and deterministic totals already use server validation and revision protection.
8. Currency confirmation already shows current/target currency, rate, date, affected lines, and manual-price behavior.
9. Preview and PDF share a customer-safe DTO. PDF rendering is dynamically imported server-side and fingerprint-deduplicated.
10. Versions are immutable and cart conversion is idempotent, product-only, and does not submit an order.
11. The estimate list is newest-first and searchable, but lacks inline duplicate, PDF, and archive actions.
12. Editor loading starts four parallel actions; workflow loading repeats the estimate aggregate already loaded by the editor action.

## Accepted Boundaries

- No normal-page 1C calls.
- Product and commercial reads remain bounded and bulk.
- One explicit commercial save, not per-cell writes or keystroke autosave.
- No client-trusted totals or cross-company identifiers.
- No PDF renderer in the normal editor client bundle.

## Browser Acceptance Still Required

The final production pass must exercise a controlled partner account at laptop and mobile widths, create a 30-line realistic estimate, inspect preview/PDF visually, and record LCP, INP, CLS, request count, and interaction timings. Source inspection and jsdom rendering do not substitute for that pass.
