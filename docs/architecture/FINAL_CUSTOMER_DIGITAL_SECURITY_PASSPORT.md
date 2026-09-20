# Final Customer Digital Security Passport

## Ownership and aggregate

`CustomerObject` is a Portal-owned organizational aggregate rooted at `customer_identity_id`. Access is resolved through `auth.uid() -> customer_accounts -> customer_identity_id -> customer_objects`. It is not a CRM deal, 1C counterparty/site, accounting document, Installation Marketplace project, installed asset or warranty record.

The aggregate stores only a bounded customer label, controlled object type, optional locality/address label, `ACTIVE|ARCHIVED` state and timestamps. A precise postal address is not required. Archive preserves every relationship and hides the object from the normal active list; there is no customer hard-delete path.

Entitled ACTIVE customers, including the closed legacy-compatible cohort, may create an empty object manually. This has immediate value because an object can provide safe context for an existing Portal Customer Service request without claiming a purchase, installation or warranty.

## V2 object workspace

The V2 object detail is the post-purchase workspace for one customer-owned context. Its compact hierarchy is: object identity and state, factual service attention, derived purchased-product groups, purchased product rows, recent purchases, accessible documents, service and a bounded activity history. Empty sections are omitted, and an object with no linked purchase remains useful as a safe service context.

Customer Home exposes up to three active objects with their latest meaningful state. Purchases and order detail show the factual object association or an optional assignment action. An unassigned-purchase count is computed from all eligible confirmed paid orders, while only a bounded list is returned for action.

## Derived product/system grouping decision

V2 does **not** create a separate `SecuritySystem` table. Current authoritative facts are confirmed purchases, immutable Retail Order line snapshots and the current public catalog projection; there is no independent system identity, installation completion or commissioned equipment evidence.

The server derives customer-friendly groups from stable root category IDs in the governed `public_retail_products.category_path`: CCTV, Alarm, Access Control, Intercom and Network. Products without a recognized authoritative root remain in Other. Display names never drive classification, so RU/RO localization cannot change grouping. A group summarizes distinct purchased lines, purchased quantity, latest purchase date and open service requests explicitly linked to those lines. A future persisted system aggregate may be added only when it has its own customer-editable lifecycle or authoritative installation evidence.

## Purchase relationship

`customer_object_purchase_links` is a Portal-owned relation from one confirmed, paid `retail_order` to one customer object. The guarded mutation verifies all of the following atomically:

- ACTIVE account, canonical identity and authenticated actor correspond;
- the object is ACTIVE and belongs to that identity;
- the Retail Order belongs to a retail customer linked to the same identity;
- the order is `confirmed` and `paid_at` is present.

The relation means only “this purchase relates to this object.” Retail Order and line rows remain authoritative and are not copied or changed. Reassignment changes only this organizational relation and writes an append-only audit event containing the old and new object identities.

Reassignment is allowed only between ACTIVE objects owned by the same customer. It is idempotent for the current target and fails closed for archived source history or when an existing Customer Service request already binds that order to the old object. This avoids making an existing service context inconsistent. The customer can still use every unrelated line and object normally.

The natural post-purchase prompt is rendered after payment/order confirmation, outside the payment callback. A customer may choose an existing object, create a new one atomically with the link, or skip without affecting payment/order completion.

## Purchased versus installed

Every object product is explicitly presented as **Purchased / Приобретено / Achiziționat**. A purchase never establishes:

- serial, IMEI or MAC identity;
- installed/commissioned state or date;
- installer identity;
- warranty start/end or entitlement;
- service contract.

Those fields stay absent until a future authoritative source exists.

## Service relationship

`customer_service_requests.customer_object_id` is nullable context. The existing Customer Service lifecycle, statuses, messages, attachments, notifications and ownership remain unchanged. The V3 creation boundary accepts an object only when it is ACTIVE and owned by the current identity. If both object and order are supplied, their governed purchase link must already exist. Object detail starts a request with only safe object/order/product identifiers prefilled; the customer still describes the problem. Open requests and `NEED_INFO` are surfaced as factual attention; the latest customer-visible update is read without exposing internal notes.

## Documents

Object detail derives product documents through the already governed purchase-line -> current public product identity -> active catalog product document path. Document ownership is not copied into Customer Object, and no files are duplicated. No object document is fabricated when that relationship is absent.

## Activity timeline

`customer_object_events` is append-only and records only meaningful Portal-owned organization events: create, edit, archive, purchase assignment and safe reassignment. The object timeline combines a bounded set of these events with already authoritative Customer Service creation/status events. It excludes views, navigation, background sync and other technical activity. Browser roles have no INSERT/UPDATE/DELETE authority over the event table.

## Security

Both new tables have RLS and FORCE RLS. `authenticated` receives SELECT only, scoped through the ACTIVE account and `auth.uid()`. Browser roles cannot mutate tables or execute mutation/read aggregation RPCs. Server actions resolve the authenticated Final Customer context and call service-role-only functions that recheck account, identity and actor together. Cross-customer object, purchase and service references fail closed.

## Read path and performance

The object workspace is one bounded aggregate read for summaries, open-service counts, link identities and at most 20 actionable unlinked confirmed purchases. Object detail is one bounded aggregate read that joins at most 20 linked purchases to the current public product projection, active product documents, at most 20 service requests, at most 10 timeline events and at most 5 actionable unassigned purchases. Group summaries are calculated once in the server service from that payload. There are no per-object or per-product queries, client waterfalls or live 1C calls.

## UX and navigation

“My Objects” is reached from Customer Home and Purchases. It is intentionally not a sixth permanent primary-navigation item. This keeps the accepted five-item mobile navigation stable while making the new aggregate discoverable at the two relevant workflow entry points.

Home uses a compact object section. Purchase-backed customers with zero objects receive one compact assignment prompt. A legacy-compatible customer with no Portal purchase may still create an object from the empty Customer Home because it can be referenced by Customer Service.

## Future seams

- **1C / serialized assets:** the Portal object ID is independent. A future governed external-reference and serialized-asset mapping may enrich serials, ownership or installed-equipment evidence; V2 has no speculative external ID and no live 1C render.
- **Installation Marketplace:** `CustomerObject` and `InstallationProject` remain separate. A future optional relation may connect them, but Marketplace remains OFF and no installer selection appears here.
- **Warranty:** only general product information already governed by Catalog may appear. A future personal warranty ledger requires authoritative entitlement and dates; purchase alone never creates it.
- **Offers/discounts:** Customer Object may become targeting context, but price/discount truth remains in its separate governed commercial domain. V1 introduces no personal discount behavior.

## Paused boundaries

This foundation does not change MAIB production activation, Installation Marketplace pilot configuration, Agent commission economics or the paused Final Customer 1C create contract.
