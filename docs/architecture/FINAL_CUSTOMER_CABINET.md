# Final Customer Cabinet

## Ownership and source matrix

| Cabinet capability | Canonical source | Cabinet role |
| --- | --- | --- |
| Customer identity | `customer_identities` linked through `customer_accounts` | Authenticated projection; no historical claiming |
| Orders and lines | `retail_orders`, `retail_order_lines`, `retail_order_events` | Read-only customer-scoped history |
| Payment state | Retail payment activation boundary and `retail_orders.paid_at` | Display only when confirmed by the existing boundary |
| Delivery/fulfillment | No general Retail Order source currently exists | Omitted; never inferred |
| Purchases | Confirmed Retail Orders with `paid_at` | Derived projection, not duplicated storage |
| Equipment | Non-service lines from confirmed purchases | Derived projection; no serial or warranty-expiry inference |
| Current product, price, availability | Current published Public Retail projection | Used only for product links and Buy again |
| Product documents | Active `catalog_product_documents` for purchased canonical products | Read-only links; no invented invoice or receipt |
| Customer service lifecycle | `customer_service_requests`, messages, attachments, events and customer notifications | Portal-owned intake and customer-visible communication |
| Partner Service Center / 1C service | Existing partner/company and integration domains | Not reused or redefined |

## Authentication and account ownership

The Final Customer Cabinet is a third private platform surface at `/account`, separate from Partner (`/cabinet`), Commercial Agent (`/agent`), and Admin. Supabase Auth owns passwordless phone authentication, sessions, JWT refresh, and Authenticator Assurance Level (AAL). A Final Customer principal exists only through `customer_accounts.auth_user_id = auth.uid()`; Partner, Agent, or Admin membership is neither required nor granted.

`customer_identities` remains the canonical correlation root. `customer_accounts` is a lightweight access/profile relation, not another customer master. `retail_customers`, Partner customer records, Agent referrals, and future 1C external references remain context-owned records linked to the shared root.

After Supabase verifies a phone OTP, the protected account layout calls the existing `CustomerIdentityResolutionService` with verified Auth evidence. `MATCHED` links the account to one deterministic root; `NEW` creates one governed root; `AMBIGUOUS` and `CONFLICT` restrict history and expose no candidate identity IDs.

## Identity and authorization path

Every private read resolves `auth.user -> customer_accounts -> customer_identity_id -> retail_customers -> retail_orders`. Route parameters never establish ownership. Order, line, equipment and service-request lookups always include the server-resolved customer identity. Ambiguous or conflicting identities remain in `IDENTITY_REVIEW_REQUIRED` and receive no historical order projection.

Authenticated checkout reuses the verified account phone server-side. The existing shared-customer-identity resolver remains responsible for linking the new `retail_customers` context to the same canonical identity. Guest checkout is unchanged. Existing orders are never claimed by a user-supplied ID or unverified profile field.

## Purchase, equipment and warranty rules

A purchase is eligible only when the existing Retail Order is `confirmed` and has authoritative `paid_at` evidence. Equipment is a projection of eligible immutable order lines. Current catalog state may determine whether Buy again is offered, but never rewrites the purchase snapshot.

The current Retail Order source does not expose authoritative return quantities, shipment fulfillment, serial assignment, or personal warranty expiry. The cabinet therefore does not display or calculate those facts. Product-level warranty documents may be shown when they are already published in the Catalog documents source.

## Service request boundary

Final-customer service requests are a bounded Portal-owned communication lifecycle because the existing Service Center is partner/company scoped. They do not create a 1C service document, installation assignment, warranty entitlement, or commercial state. Customer mutations are server-orchestrated; Admin access reuses `admin.service.view` and `admin.service.manage`. Customer in-app notifications are a customer-account projection and do not reuse B2B company membership.

Requests, messages, attachment mappings, notifications and the event stream use enabled and forced RLS. Authenticated users receive read-only grants constrained through their `customer_accounts.auth_user_id`; INTERNAL messages and attachments are additionally excluded by policy. All mutations pass through server-side identity and permission checks. Messages, attachments and events are append-only.

## Performance contract

Reads are bounded and batched: orders and lines are fetched per page, current products are resolved in one publication query, and documents are fetched in one product-ID query. The cabinet performs no live 1C request, persistent polling, per-card query, or new background schedule. Empty-state reads have a fast no-op path.

The command center uses `get_final_customer_cabinet_overview_v1`, one bounded local database aggregate for its order, recent-purchase, equipment, document, and request cards. It does not fan out one request per card.

## Session and recovery

Supabase SSR cookies and the existing platform clients are reused. Current-session logout remains supported. Session diagnostics use actual Supabase AAL without forging claims. Changing the verified phone remains outside ordinary profile editing because it requires reverification and identity-impact review.

## Deferred capabilities

- General fulfillment tracking until an authoritative Retail Order fulfillment source exists.
- Returns/refunds until explicit line-level authoritative facts exist.
- Serial and personal warranty expiry until deterministic order-line linkage exists.
- Accounting documents until a legitimate customer-visible document source exists.
- 1C service synchronization and outbound notification activation as separate governed work.
