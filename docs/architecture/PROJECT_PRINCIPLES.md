# Project Principles

This document is the project constitution for the Novotech Partner Platform. It defines the rules that should guide architecture, implementation, review, and Codex-assisted development.

## 1C Is the Source of Truth for Commercial Data

1C owns official commercial, accounting, warehouse, and partner master data.

This includes products, prices, individual prices, stock, warehouses, partners, contracts, confirmed orders, invoices, debt, balances, and credit limits. The portal may cache and display this data, but it must not become the source of truth.

## The Portal Is a Partner Experience Layer

The portal exists to improve partner-facing work.

It owns partner experience, access control, cached views, carts, order drafts, order requests, order submission workflow, notifications, audit logs, integration logs, and automation around partner operations.

The portal must not become a second 1C.

## Engineering CRM and Partner Platform Are Separate Products

The Partner Platform is not the Engineering CRM.

Do not copy Engineering CRM business logic, data models, UI assumptions, or operational workflows into this project unless the behavior is explicitly re-designed for B2B partner distribution.

## No Business Logic in UI Components

UI components should display state and trigger actions. They should not own business decisions.

Access checks, order validation, price/stock rules, partner lifecycle rules, and integration decisions belong in domain or service layers, not inside presentation components.

## All 1C Integration Goes Through the Integration Layer

Business modules must not call low-level 1C transport directly.

1C reads, writes, retries, logging, timeout handling, mapping, and error normalization must go through the integration layer. This keeps source-of-truth boundaries consistent and makes failures observable.

## All Secrets Stay in Environment Variables

Secrets must never be committed.

Supabase keys, 1C credentials, API tokens, service-role keys, private URLs, and integration credentials must be provided through environment variables or approved secret management.

## Supabase Service Role Is Server-Only

The Supabase service-role key must never reach the browser.

It must not be imported into Client Components, browser utilities, public API responses, logs, or generated client bundles. Service-role usage must be narrow, server-side, and auditable.

## Every Domain Owns Its Own Logic

Domains should own their rules and workflows.

Partner logic belongs to the partner domain. Access logic belongs to the access-control domain. Catalog logic belongs to the catalog domain. Pricing and inventory rules belong to the pricing and inventory domain. Order workflow belongs to the orders domain.

Shared infrastructure belongs in shared libraries only when it is genuinely cross-domain.

## Small Controlled Commits

Changes should be small, purposeful, and reviewable.

Each commit should focus on one domain, one workflow, or one infrastructure concern. Avoid bundling unrelated refactors, feature work, and documentation churn.

## Codex Implements Only Approved Architecture

Codex-assisted work must follow approved project documents.

Codex should not invent business features, schemas, integrations, or UI workflows outside the current task and architecture. When architecture is missing, document or clarify it before implementation.

## Security and Access Control Are Not Optional

Every partner-facing read or action must respect partner company, partner status, role, and access profile.

Hidden data must stay hidden across pages, search, exports, notifications, logs, future APIs, and browser state. If access is uncertain, choose the safer behavior.

## MVP Must Be Useful but Narrow

The MVP should solve real partner workflow problems without expanding into a full replacement for internal systems.

MVP should focus on foundation, partner access, catalog visibility, pricing and stock display, cart/order workflow, order creation in 1C, reservations where needed, and minimal admin controls.

## Avoid Copying Legacy NSD Code Blindly

Legacy code may contain useful lessons, but it should not be duplicated without review.

Every reused idea must be re-evaluated for the Partner Platform context, current architecture, security requirements, and 1C ownership boundaries.

## Prefer Boring Reliable Solutions Over Clever Abstractions

Use simple, explicit, maintainable patterns.

Prefer clear domain boundaries, predictable data flow, conservative failure handling, and readable code over clever abstractions that make ownership, access, or integration behavior harder to understand.

## Integration Failures Must Be Visible

Timeouts, retries, partial failures, and unavailable 1C states are normal business conditions.

The system should log them, expose them to managers where needed, and avoid pretending uncertain operations succeeded.

## Cached Data Is a Snapshot

Cached 1C data improves performance and search, but it is not official truth.

Prices, stock, debt, credit limits, and order statuses must be refreshed or revalidated when the workflow creates financial, legal, or operational commitment.

## Partner Company Is the Access Boundary

A user belongs to one partner company.

Partner access depth applies at the partner company level and affects all users from that company unless a future approved design adds more detailed restrictions.

## Finance Data Requires Extra Care

Debt, balance, overdue amounts, credit limits, invoices, and accounting documents are sensitive.

They should be hidden by default and exposed only through explicit access-profile permissions and approved business policy.

## Writes to 1C Are Narrow

In the MVP, the portal writes only new orders and product reservations to 1C.

Any additional write to 1C requires explicit architecture review and business approval.

## Implementation Must Preserve Auditability

Sensitive access changes, manager approvals, order submissions, integration writes, and failures should be traceable.

Auditability is part of the product design, not an afterthought.

## Documentation Is a Source of Alignment

Domain and architecture documents are implementation inputs.

When the system behavior changes, update the relevant documents so future development remains consistent.
