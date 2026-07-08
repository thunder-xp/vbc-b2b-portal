# System Context

## Purpose

The Novotech Partner Platform is a B2B partner-facing portal for distribution workflows. It gives partner companies controlled access to catalog, pricing, stock, documents, carts, order requests, order creation, and order status while preserving 1C as the source of truth.

The platform is not a replacement for 1C and is not the Engineering CRM. It is a partner experience, cache, access-control, order submission, and automation layer around Novotech's existing commercial systems.

## System Actors

### Partner Users

Partner users are people from partner companies who use the portal for daily work.

They may search products, view allowed prices and stock, prepare carts, submit order requests, create direct orders if allowed, view order history, and access documents according to their company's access profile.

### Partner Companies

Partner companies are external organizations that work with Novotech.

A partner company may have multiple partner users. Access depth is controlled at the partner company level through partner status, access profile, loyalty level, and manually assigned visibility permissions.

### Novotech Managers

Novotech managers are internal users responsible for partner oversight.

They approve partners, assign access profiles, review order requests, handle exceptions, manage suspension or archive decisions, and coordinate partner operations.

### Admins

Admins manage portal configuration, access-control setup, operational overrides, and sensitive internal controls.

Admins may have broader portal capabilities than managers, but admin power must still respect source-of-truth boundaries and audit requirements.

### Finance

Finance users or finance processes own business review of invoices, debt, balances, credit limits, payment state, and credit-related order risk.

The portal may display finance data to partners only when explicitly allowed. 1C remains the source of truth for finance data.

### Warehouse

Warehouse users or warehouse processes own stock handling, fulfillment, picking, shipment, and operational stock truth inside 1C or connected warehouse processes.

The portal may display stock snapshots and request reservations, but it does not replace warehouse operations.

### Codex-Assisted Development

Codex-assisted development supports implementation and documentation work.

Codex must follow approved architecture, project principles, and source-of-truth boundaries. It must not introduce business logic, integrations, schemas, or UI behavior outside the approved scope.

## External Systems

### 1C

1C is the single source of truth for commercial, accounting, warehouse, and official partner data.

1C owns:

- Products, brands, categories, product groups, product master data.
- Prices, individual prices, price types, currencies, discounts, and commercial terms.
- Stock balances, warehouse data, and accepted reservations.
- Partner company master data and contracts.
- Confirmed orders after creation.
- Invoices, accounting documents, debt, balance, and credit limits.

The portal reads from 1C and writes only new orders and product reservations in the MVP.

### Supabase

Supabase is the portal data platform.

Supabase stores portal-owned data such as partner users, access profiles, portal partner status, loyalty level, carts, order drafts, order requests, approval state, notifications, audit logs, integration logs, user settings, and cached 1C snapshots.

Supabase does not become the owner of 1C commercial truth.

### Next.js Portal

The Next.js portal is the partner and internal manager web application.

It handles partner-facing workflows, access decisions, server-side integration calls, rendering, validation orchestration, and user experience. It must not contain official commercial truth independent of 1C.

### Vercel

Vercel hosts the Next.js portal and related deployment workflows.

It provides runtime, preview deployments, production deployments, and environment variable management. Secrets must be configured through environment variables, not committed to the repository.

### GitHub

GitHub stores source code, documentation, pull requests, commit history, and review workflow.

GitHub is not a runtime system and should not contain secrets.

## Data Directions

### 1C to Portal

The portal reads and may cache:

- Products, categories, brands, product attributes, analogs, and documents.
- Prices, individual prices, currencies, and price types.
- Stock balances, warehouse metadata, and availability source data.
- Partner company references and contracts.
- Confirmed orders and order statuses.
- Invoices, accounting documents, debt, balance, and credit limits.

All partner-facing display of this data must pass access-profile checks.

### Portal to 1C

In the MVP, the portal writes only:

- New order creation requests.
- Product reservation requests.

The portal must not write product, price, stock, partner, contract, invoice, debt, or credit-limit master data to 1C in the MVP.

### Portal to Supabase

The portal writes portal-owned state:

- Users and partner membership.
- Access profiles, partner status, and loyalty level.
- Carts, cart items, order drafts, and order requests.
- Manager approval state.
- Cache snapshots and sync metadata.
- Notifications, audit logs, and integration logs.
- User settings.

### Supabase to Portal

The portal reads Supabase data for:

- Authentication/session-adjacent user context in future implementation.
- Access-control decisions.
- Partner workflow state.
- Cached catalog, price, stock, document, order, and finance snapshots.
- Operational logs and manager tasks.

## Responsibility Boundaries

### What Happens in the Portal

The portal:

- Provides partner and manager user experience.
- Enforces partner access profile visibility.
- Stores portal-owned workflow state.
- Caches 1C data for performance and search.
- Validates partner actions before submission.
- Creates order and reservation requests to 1C.
- Displays 1C-owned data according to permissions.
- Logs access, workflow, and integration activity.
- Survives temporary 1C outages with safe read-only or draft behavior.

### What Happens in 1C

1C:

- Owns official commercial, warehouse, accounting, and partner master data.
- Calculates or stores official prices, individual prices, stock, debt, balances, and credit limits.
- Accepts or rejects official orders and reservations.
- Owns confirmed order state after creation.
- Owns invoices and accounting documents.
- Remains the final authority for business truth.

### What Happens in Supabase

Supabase:

- Stores portal-owned entities and workflow state.
- Stores cached 1C snapshots and synchronization metadata.
- Supports access control and partner user relationships.
- Supports logs, notifications, and future manager task state.
- Does not replace 1C as a commercial data owner.

## Outside MVP

The MVP does not include:

- Full bidirectional 1C synchronization.
- Portal-side editing of 1C master data.
- Editing confirmed 1C orders from the portal.
- Invoice creation or accounting operations in the portal.
- Credit-limit management in the portal.
- Full warehouse management.
- Public retail ecommerce.
- Anonymous public catalog access.
- Payment processing.
- Advanced promotion engine.
- Full asynchronous event platform unless approved later.
- Engineering CRM features or shared Engineering CRM business logic.
