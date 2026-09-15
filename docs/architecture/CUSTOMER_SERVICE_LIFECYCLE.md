# Final Customer Service Lifecycle

## Ownership

Portal owns customer intake, the customer-visible lifecycle, conversation, private attachments, audit events and customer in-app notification projection. 1C remains the future owner of formal repair documents, warranty accounting, service realization, serial/equipment truth and financial settlement. This feature creates none of those 1C facts and performs no live 1C call.

## Lifecycle

The governed transitions are:

- `NEW -> IN_REVIEW | CANCELLED`
- `IN_REVIEW -> NEED_INFO | ACCEPTED | CANCELLED`
- `NEED_INFO -> IN_REVIEW | CANCELLED`
- `ACCEPTED -> RESOLVED | CANCELLED`
- `RESOLVED -> CLOSED`
- `CLOSED` and `CANCELLED` are terminal.

Admin owns status transitions. `NEED_INFO` requires a customer-visible explanation. A customer reply while `NEED_INFO` atomically returns the request to `IN_REVIEW`; it never accepts or resolves it. A customer cannot reply to `RESOLVED`, `CLOSED`, or `CANCELLED`; the UI directs the customer to create a new request. Cancellation preserves the request and all history.

## Messages and visibility

`customer_service_messages` is append-only. Customer messages are always `CUSTOMER_VISIBLE`. Novotech messages are either `CUSTOMER_VISIBLE` replies or `INTERNAL` notes. Customer RLS selects only visible messages; internal-note audit events are also excluded from the customer event policy. Admin reads remain protected by `admin.service.view` and mutations by `admin.service.manage`.

React renders text as text and does not accept service HTML. The detail repository fetches request, bounded messages, at most five attachments and bounded timeline records without per-row queries.

## Attachments

The existing private `service-evidence` Storage bucket is reused under `customer-service/{request-id}/...`; no second storage architecture or public URL is created. Accepted formats are JPEG, PNG, WEBP and PDF, checked by declared MIME and file signature. The limit is five attachments per request and 10 MiB per file.

Uploads run server-side. If metadata persistence fails, only the just-created object path is removed. Downloads first resolve the authenticated customer ownership and visibility or the governed Admin permission, then create a 60-second signed download URL. Attachment mappings are append-only. V1 retains files with the preserved request; there is no silent destructive cleanup. A future retention schedule requires an explicit governance decision.

## Events and notifications

Semantic service events cover creation, status changes, customer reply, Novotech reply, internal note, attachment and cancellation. Meaningful customer notifications are projected for `CUSTOMER_SERVICE_NEED_INFO`, `CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH`, and `CUSTOMER_SERVICE_RESOLVED`. Each uses a unique semantic identity derived from the immutable source event and deep-links to `/account/service/{id}`. Customer-account RLS prevents cross-customer access.

This is an approved customer-owned equivalent of the durable intent projection: the existing Omnichannel `CommunicationIntent` requires a B2B company and active membership and must not be forged for a private customer. `IN_APP` is enabled. External email defaults to `DISABLED` and may later use a verified customer email under its own policy. `CUSTOMER_SERVICE_SMS_ENABLED` and `CUSTOMER_SERVICE_SMS_MODE` are parsed independently, default to disabled, and do not touch Auth OTP, Finance, Support or Campaign controls. No external provider is called by this module.

RU and RO notification copy is rendered from stable event codes; localized strings never drive lifecycle logic. Sensitive message contents are not copied into notification previews.

## Security and performance

All new private tables use RLS and FORCE RLS, explicit grants and fixed-search-path security-definer mutation functions. Browser-supplied customer, request, company or role identifiers do not establish access. The server derives `auth.uid() -> customer_account -> customer_identity -> owned request`. Partner, Agent, anonymous and unrelated customer contexts have no grant or ownership path.

The service list is paginated. Detail reads are bounded and batched. The overview keeps one aggregate RPC and adds only service attention counts inside it. There is no polling, N+1, new cron, background worker, live 1C traffic or page-load provider call.
