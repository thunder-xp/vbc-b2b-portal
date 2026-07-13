# Project Specification Design

## Purpose

Project specifications are partner-company-owned equipment lists for a real customer site. They help installers assemble a bill of materials, review current commercial values, save a draft, and submit it to Novotech. They are not CRM opportunities, customer records, sales pipelines, orders, reservations, or 1C documents.

## Ownership

- The portal owns specification metadata, line selection, quantities, and workflow status.
- 1C remains the source of truth for products, partner prices, retail prices, stock, and supplier arrivals.
- Specification tables store product references and quantities only. They do not copy price, stock, arrival, customer-account, contract, or order data.
- Commercial totals are calculated by `ProjectSpecificationService` from the current catalog and pricing/inventory service DTOs.

## Schema

### `project_specifications`

- `id uuid` primary key.
- `company_id uuid` required reference to `partner_companies`.
- `created_by uuid` required reference to `user_profiles`.
- `project_name text` required, maximum 200 characters.
- `customer_site_name text` required, maximum 200 characters.
- `description text` optional, maximum 2,000 characters.
- `status text` constrained to `draft` or `submitted`.
- `submitted_at timestamptz` null for drafts and required for submitted records.
- Standard `created_at` and `updated_at` timestamps.

### `project_specification_items`

- `id uuid` primary key.
- `specification_id uuid` required reference with cascade delete.
- `product_id uuid` required reference to `catalog_products`.
- `quantity integer` required and greater than zero.
- Standard `created_at` and `updated_at` timestamps.
- One product may occur only once per specification; adding it again updates quantity through the service.

## Access Model

- Anonymous users receive no privileges.
- Access requires an active user profile, active membership, active company, and `specifications.manage` permission.
- Active company members may read specifications for their company.
- Drafts may be created and edited only within the authenticated user's active company context.
- Items may be inserted, updated, or removed only while the parent specification is a draft and the product is active and visible.
- Submitted specifications and their items are immutable.
- Submission atomically freezes product identity, unit prices, stock, nearest arrival, and commercial opportunity values on each item. These are audit snapshots, not a replacement for current 1C read models.
- Snapshot submission uses the additive `submit_project_specification_v2(uuid, jsonb)` RPC. The original `submit_project_specification(uuid)` RPC remains unchanged during the backward-compatible rollout.
- V2 also persists submitted line totals and specification purchase, retail, gross-profit, and markup totals. Historical rows keep missing commercial snapshots as unavailable.
- Internal review uses `submitted -> under_review -> approved | changes_requested | rejected` transitions through one database RPC.
- `changes_requested` keeps the reviewed submission immutable and atomically creates a linked editable draft revision.
- Review access is limited to active internal/admin staff through the dedicated `specifications.review` capability.
- Submission uses a narrow security-definer RPC. It validates company access, draft status, and at least one item before atomically setting `status = submitted` and `submitted_at`.
- `created_by` is an audit field, not a private-user ownership boundary; specifications belong to the partner company.

## Repository Boundary

`ProjectSpecificationRepository` performs persistence only:

- list company specifications;
- load one specification and its items;
- create and update draft metadata;
- add, update, and remove draft lines;
- invoke the guarded submission RPC.

It does not calculate totals, authorize company access, query 1C, or interpret commercial data.

## Service Boundary

`ProjectSpecificationService`:

- resolves and validates active company access;
- enforces `specifications.manage`;
- validates names, descriptions, quantities, and draft-only transitions;
- loads catalog products through `CatalogService`;
- loads current prices, stock, and arrivals through `PricingInventoryService`;
- calculates line totals, partner total, retail total, gross profit, and markup;
- rejects submission of an empty specification.

Missing commercial data does not invent values. Draft lines remain visible with unavailable commercial fields.

## Server Actions And UI

Server Actions authenticate, normalize primitive input, call the service, map safe errors, and revalidate affected cabinet routes. React components render service DTOs and invoke Server Actions; they contain no authorization or commercial calculation.

Routes:

- `/cabinet/specifications`
- `/cabinet/specifications/new`
- `/cabinet/specifications/[id]`
- `/admin/specifications`
- `/admin/specifications/[id]`

## MVP Exclusions

- Customer or contact entities.
- CRM opportunities or sales stages.
- Order export, reservations, cart, invoices, and finance.
- Price or stock snapshots owned by the specification tables.
- Manager processing UI and 1C specification export.
