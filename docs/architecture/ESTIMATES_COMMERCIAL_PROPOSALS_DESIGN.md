# Estimates And Commercial Proposals Design

## Purpose

Estimates are partner-company-owned commercial drafts used by installers and system integrators before an order exists. They are not CRM opportunities, customer records, 1C documents, carts, or orders.

## Ownership

- The portal owns estimate metadata, structure, customer-facing descriptions, selling prices, services, totals, and draft workflow.
- 1C remains the source of truth for products, partner prices, stock, currencies, exchange rates, and orders.
- Product lines retain a bounded identity and commercial snapshot. They do not duplicate complete catalog records.
- Normal estimate editing uses local read models only and never calls 1C.

## Slice 1 Schema

- `estimates`: company scope, portal estimate number, metadata, primary currency, validity, status, persisted server total, and optimistic concurrency revision.
- `estimate_sections`: ordered document sections. Slice 1 creates one default equipment section; section editing follows in Slice 2.
- `estimate_items`: product, service, and custom lines with source snapshots and server-validated line totals.
- `partner_services`: controlled portal-owned service/work catalog. It contains no 1C commercial truth.
- `estimate_events`: bounded audit events for meaningful mutations, never text keystrokes.

Future slices add immutable estimate versions, status workflow, and cart conversion without changing the ownership boundary.

## Access Model

- Every estimate belongs to one active partner company.
- `estimates.view` permits company-scoped reads.
- `estimates.manage` permits draft creation and structural edits.
- `estimates.pricing.manage` is additionally required for line-price mutations.
- RLS repeats company membership, active profile/company, and role permission checks.
- No anonymous privileges exist. No partner delete policy exists.
- Drafts are mutable; archived records are read-only. Later immutable statuses are service- and RPC-controlled.

## Boundaries

- Pages and Client Components use Server Actions only.
- Server Actions authenticate, normalize input, call `EstimateService`, and return safe results.
- `EstimateService` owns access checks, snapshot preparation, validation, deterministic decimal calculations, and workflow rules.
- `EstimateRepository` owns Supabase persistence only.
- Catalog and pricing/inventory are consumed through their public services in bulk.

## Performance

- List pagination and filtering execute in one scoped query with item counts.
- Editor loading uses one nested estimate/section/item read plus one service-catalog read.
- Product search is server-side and bounded to 12 results.
- Product identity and commercial data are bulk-loaded for selected products.
- Mutations return the refreshed aggregate to the local editor state; they do not refresh the full route.
- Autosave is intentionally excluded from Slice 1. Save is explicit and batched by form.

## Slice Plan

1. Foundation: navigation, list, create, editor, product/service/custom lines, totals, explicit save.
2. Commercial controls: markup, margin, discounts, VAT, currency conversion, charges, editable sections.
3. Proposal preview and server-side PDF generation.
4. Immutable versions, status workflow, duplication, and cart conversion.

## Slice 3: Customer Proposals

- `CustomerProposalDto` is the single immutable, customer-safe allowlist used by browser preview, PDF rendering, artifact snapshots, and future delivery channels. It excludes internal cost, margin, permissions, portal/ERP identifiers, and integration diagnostics.
- `proposal_settings` stores bounded structured document text and visibility toggles. It never accepts HTML.
- `proposal_templates` contains four structured system templates and company-owned copies. Applying a template changes proposal settings only and never replaces estimate sections or lines.
- `company_proposal_profiles` is an optional portal-owned presentation profile. Missing values fall back to the active company and user profile without blocking generation.
- `generated_estimate_documents` stores generation status, fingerprint, customer-safe DTO snapshot, and private object metadata. The PDF bytes live in the private `estimate-proposals` storage bucket.
- `pdfmake` is the server renderer. It provides deterministic A4 pagination, repeating table headers, page numbering, and bundled Roboto fonts for Russian and Romanian without Chromium or external font access.
- Remote image access is disabled in pdfmake. The preparation service accepts only HTTPS image URLs from explicit trusted hosts; server fetches are size-, time-, redirect-, and concurrency-bounded.
- Generation is synchronous and fingerprint-deduplicated in this slice. Benchmarks for 300 lines remain below the interactive server budget; a queue can replace execution later without changing DTO, metadata, or storage contracts.
- Normal preview preparation performs four principal domain reads: aggregate estimate, templates, optional proposal profile, and one bulk product-image projection. No 1C calls or per-line queries are permitted.
