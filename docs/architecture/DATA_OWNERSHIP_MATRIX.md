# Data Ownership Matrix

This matrix defines ownership boundaries for the Novotech Partner Platform.

Core principle: 1C owns commercial and accounting truth. The portal owns partner experience, access control, cache, carts, order submission workflow, and automation around partner-facing operations.

| Data / Entity | Owner | Cached in Portal | Editable in Portal | Written to 1C | Notes |
| --- | --- | --- | --- | --- | --- |
| Product | 1C | Yes | No | No | Product identity, active state, article numbers, and official names belong to 1C. |
| Brand | 1C | Yes | Limited enrichment only | No | Portal may normalize display/search labels, but official brand ownership stays with 1C or approved master source. |
| Category | 1C / Portal navigation | Yes | Limited mapping only | No | 1C may own official category; portal may maintain partner-facing navigation mapping. |
| Product images | 1C / approved media source | Yes | Limited presentation only | No | Portal may order, hide, or label images for display, but should not redefine product identity. |
| Product documents | 1C / approved document source | Yes | Limited labels only | No | Portal controls visibility; official documents remain source-owned. |
| Product attributes | 1C / portal enrichment | Yes | Limited enrichment only | No | Official attributes come from 1C; portal may normalize searchable/filterable attributes. |
| Product analogs | 1C / portal enrichment | Yes | Limited enrichment only | No | Portal may add partner-facing relation labels, but official analog logic should come from 1C when available. |
| Partner company | 1C | Yes | Portal access fields only | No | Official company data belongs to 1C; portal owns access and experience metadata. |
| Partner user | Portal | No | Yes | No | Portal owns user membership and login-facing identity; user belongs to one partner company. |
| Access profile | Portal | No | Yes | No | Manual Novotech control for partner visibility and actions. |
| Partner status | Portal | No | Yes | No | Portal status controls portal access; it does not replace 1C commercial status. |
| Loyalty level | Portal / business policy | No | Yes | No | Used for segmentation and access guidance; should not silently replace explicit permissions. |
| Prices | 1C | Yes | No | No | Portal may display price snapshots according to access profile. |
| Individual prices | 1C | Yes, scoped by partner | No | No | Highly sensitive; must never be reused across partner companies. |
| Stock balances | 1C | Yes | No | No | Portal may display exact, range, availability-only, or hidden view based on access profile. |
| Warehouses | 1C | Yes | No | No | Warehouse-level visibility is sensitive and permission-controlled. |
| Reservations | 1C after confirmation | Yes | Request state only | Yes | Portal may request reservation in MVP; accepted reservation truth belongs to 1C. |
| Cart | Portal | No | Yes | No | Partner-facing working state; not official commercial commitment. |
| Cart item | Portal | No | Yes | No | Contains requested quantity and snapshots; must be revalidated before submission. |
| Order draft | Portal | No | Yes | No | Pre-submission workflow data; not official order. |
| Order request | Portal | No | Yes | No | Manager-review workflow before possible 1C order creation. |
| Confirmed order | 1C | Yes | No | Create only | Portal creates new orders in 1C in MVP, then displays 1C-owned order data. |
| Order status | 1C after confirmation | Yes | No | No | Portal-owned statuses exist only before 1C creation or for integration workflow state. |
| Invoice | 1C | Yes | No | No | Displayed only when partner finance/document permissions allow it. |
| Accounting documents | 1C | Yes | No | No | Includes invoices, acts, shipment/accounting records, and related documents. |
| Debt / balance | 1C | Yes | No | No | Portal must not calculate official debt independently. |
| Credit limit | 1C | Yes | No | No | Display and order checks must rely on 1C or approved 1C-derived data. |
| Promotions | 1C / business policy | Yes | Limited visibility setup only | No | If maintained in 1C, 1C owns terms; portal controls partner visibility. |
| Special price request | Portal before decision | Yes | Yes | Future controlled flow only | Request workflow belongs to portal; final approved price must come from 1C or approved commercial process. |
| Notifications | Portal | No | Yes | No | Portal owns partner and manager notification state. |
| Audit log | Portal | No | Append-only | No | Tracks portal access, permission, workflow, and sensitive actions. |
| Integration log | Portal | No | Append-only | No | Tracks 1C read/write attempts, sync status, failures, and references. |
| User settings | Portal | No | Yes | No | Personal portal preferences and notification settings. |

## Rules for Deciding Data Ownership

- If the data affects accounting, fulfillment, debt, credit, official price, official stock, invoice, order processing, or commercial terms, 1C owns it.
- If the data controls what a partner can see or do in the portal, the portal owns it.
- If the data exists only before a record is accepted by 1C, the portal owns the workflow state.
- If the data is returned by 1C after an accepted write, 1C owns the official record and the portal stores a reference or snapshot.
- If the portal enriches source data for search, labels, grouping, or display, the enrichment must not redefine the official meaning of 1C data.
- If ownership is unclear, choose the safer owner and document the decision before implementation.
- If data may create financial, legal, or relationship risk, treat 1C as owner unless explicitly approved otherwise.

## Examples of Wrong Ownership Decisions

- Letting the portal edit product master data instead of updating products in 1C.
- Treating cached stock as guaranteed stock during checkout without 1C validation.
- Calculating official debt or available credit inside the portal.
- Copying one partner's individual price into a shared product cache visible to other partners.
- Allowing portal managers to edit confirmed 1C orders directly from portal state.
- Treating an order draft as a confirmed order before 1C returns an order reference.
- Hiding a product in the UI but still exposing it through search, export, notification, or future API.
- Using loyalty level alone to expose sensitive finance data without an explicit access profile permission.
- Creating portal-only invoice or accounting document records that differ from 1C.
- Retrying order creation without duplicate protection and creating multiple 1C orders.

## MVP Ownership Summary

In the MVP:

- 1C owns products, categories, brands, prices, stock, warehouses, partner company master data, contracts, confirmed orders, invoices, debt, and credit limits.
- The portal owns partner users, access profiles, portal partner status, loyalty level, carts, cart items, order drafts, order requests, manager approval state, notifications, audit logs, integration logs, and user settings.
- The portal may cache 1C data for performance, search, visibility control, and partner experience.
- The portal may write to 1C only for new order creation and product reservations.
- The portal must revalidate sensitive price and stock data with 1C before order creation or reservation.
- The portal must survive temporary 1C outages by supporting safe read-only or draft workflows, not by inventing official commercial data.

## Future Review Rules

- Review this matrix before adding any new domain, entity, integration, or admin editing feature.
- Any new field that affects commercial truth must declare whether 1C or the portal owns it.
- Any new write to 1C must be explicitly approved as part of integration architecture.
- Any new portal edit screen must list which fields are portal-owned and which are read-only 1C-owned data.
- Any cached data type must define freshness expectations and stale-data behavior.
- Any partner-visible data must define access-profile visibility rules.
- Any finance-related data must be reviewed with extra caution before partner exposure.
- Any future automation should assist Novotech managers, not silently override ownership boundaries.
- Update this matrix when business policy changes, but do not change ownership casually during feature implementation.
