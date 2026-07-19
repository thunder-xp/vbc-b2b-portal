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

## Implemented Acceptance Changes

- Product picker now presents bounded search, image, category, brand, partner price, stock, arrival, multi-selection, and pre-insertion quantity in one session and one batch mutation.
- Services now support local search, multi-selection, quantity and price entry, and one batch mutation for up to 50 entries.
- Editor lines expose type, SKU, compact primary controls, section selection, and bulk markup, discount, quantity, move, partner-price reset, and removal.
- Bulk commercial edits remain local until the existing revision-protected atomic save. Bulk removal uses one dedicated RPC, one revision check, and one recalculation.
- Estimate list now has page-bulk version/PDF metadata, inline duplicate/archive/PDF actions, and compact mobile cards.
- Cart conversion reports added, updated, changed-price, unavailable/inactive, missing-price, and skipped totals.
- Editor save has a visible `Ctrl+S` hint and a component-scoped keyboard handler.

## Automated Performance Evidence

| Path | Current evidence | Request/query bound |
| --- | --- | --- |
| Editor detail | 100-line service test | one aggregate repository read; no catalog/pricing reads |
| Product insertion | 10-product picker/service tests | one server action and one `addLines` RPC |
| Service insertion | multi-service picker/service tests | one server action and one `addLines` RPC |
| Commercial edits | local React state until Save | zero per-cell requests; one save RPC |
| Bulk removal | migration/service tests | one RPC, one revision check, one recalculation |
| Version workflow | 300-version service test | two bulk metadata reads; no per-version reads |
| Estimate list | source query audit | one estimates read, one versions read, one latest-PDF read per page |
| Preview | 1/20/100/300-line rendering tests | customer-safe DTO, no 1C call |
| PDF | 1/20/100/300-line renderer tests | server-only dynamic renderer, fingerprint reuse |

The full automated suite completed in 85.12 seconds after the final list slice (827 passing, 3 pending contract checks). The production build completed in 28.7 seconds during the bulk slice and 42.6 seconds including the repository-wide lint invocation during the list slice. These are CI/workstation timings, not browser response times.

## Remaining Measured Acceptance

- Authenticated production LCP, INP, CLS, payload size, and network timings.
- Visual PDF inspection for long Russian/Romanian content, real images, and page-break quality.
- Click-count comparison with a real 30-line ALERT-SS estimate.
- Cloud application of `20260719150000_estimate_bulk_line_removal.sql` before deploying code that exposes batch removal.
