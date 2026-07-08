# Architecture

## Product Purpose

The Novotech Systems B2B Partner Platform is a partner-facing portal for distribution business operations. It gives approved partner companies controlled access to product, pricing, stock, document, and order workflows while keeping Novotech managers in control of what each partner can see and do.

The portal is not intended to become the master business system. It is an interface, cache layer, access-control layer, order creation layer, and automation layer around Novotech's internal systems.

## Separation From Engineering CRM

This project is separate from the Engineering CRM project. It must not reuse Engineering CRM business rules, UI assumptions, database models, or operational workflows unless they are explicitly re-designed for the B2B partner distribution context.

The Engineering CRM is focused on internal engineering and customer relationship processes. The B2B Partner Platform is focused on partner companies, distribution catalogs, partner-specific visibility, and order submission.

## 1C as Source of Truth

1C is the source of truth for:

- Products
- Prices
- Stock
- Partner companies
- Documents
- Orders
- Invoices
- Debts
- Credit limits

The portal may cache 1C data for performance and partner access control, but cached data must be treated as derived data. The portal must not become an independent source of truth for commercial or accounting records.

For the MVP, portal writes to 1C are limited to new orders and product reservations.

## Main Domains

- Auth: user authentication and session management.
- Access: partner-specific visibility depth and permission checks.
- Partner companies: company accounts, users, manually assigned access profiles, and manager-controlled settings.
- Catalog: cached product data from 1C.
- Pricing: partner-visible price data based on access profile and 1C source data.
- Inventory: partner-visible stock and reservation data based on access profile and 1C source data.
- Orders: cart, order draft, order submission, and order status display.
- Documents: partner-visible documents, invoices, and related commercial records from 1C.
- Admin: Novotech manager and administrator controls.
- 1C integration: synchronization, cache refresh, order creation, and reservations.

## MVP Scope

- Establish the application foundation and project boundaries.
- Add authentication and role foundations.
- Model partner companies and manually assigned access profiles.
- Cache catalog data from 1C.
- Display product catalog data according to partner access depth.
- Display pricing and stock visibility according to partner access depth.
- Support cart and order creation flow.
- Send new orders and product reservations to 1C.
- Provide minimal admin controls for Novotech managers.

## Non-Goals for MVP

- Replacing 1C as the source of truth.
- Full accounting, invoicing, or debt management inside the portal.
- Editing product, price, stock, partner, invoice, debt, or credit-limit master data in the portal.
- Automatic partner access-depth assignment.
- Engineering CRM feature parity or shared business logic.
- Full 1C bidirectional synchronization beyond the MVP order and reservation writes.
- Public self-service registration without Novotech approval.

## Access Control Concept

A partner company may have multiple users. A user belongs to only one partner company.

Access depth is assigned manually by Novotech managers or administrators at the partner company level. The portal must evaluate partner company access before exposing commercial data such as prices, stock depth, documents, invoices, debts, and credit limits.

Application roles and partner access profiles are separate concepts:

- Roles define what type of user is operating the portal, such as partner user, Novotech manager, or administrator.
- Access profiles define what a partner company can see and do within the partner-facing experience.

Every partner-facing query should be scoped by the authenticated user's partner company and access profile.

## Integration Strategy

The 1C integration should be isolated in `src/lib/onec` and exposed to application modules through explicit service boundaries. Business modules should not call low-level 1C transport details directly.

Read-heavy data from 1C should be synchronized into portal caches where needed for performance, filtering, and access control. Cache freshness rules should be documented per domain before implementation.

Write operations to 1C must be narrow and auditable. For the MVP, only order creation and product reservations may be written back to 1C.

Secrets, credentials, tokens, URLs, and integration keys must live only in environment variables and must never be committed.
