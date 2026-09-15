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

`IN_APP` remains the customer-owned projection and is committed atomically with the service event. The common durable Omnichannel outbox now supports an explicit `FINAL_CUSTOMER` audience keyed by `customer_account_id`; it never manufactures a partner company or membership. Only `CUSTOMER_SERVICE_NEED_INFO`, `CUSTOMER_SERVICE_REPLY_FROM_NOVOTECH`, and `CUSTOMER_SERVICE_RESOLVED` project a `CUSTOMER_SERVICE` SMS intent. The verified phone is resolved server-side from the active customer account and confirmed Supabase Auth identity, while the request locale captured from the authenticated RU/RO customer session selects the template (older requests deterministically default to RU).

Customer Service SMS defaults closed and always requires `COMMUNICATION_SMS_KILL_SWITCH=OFF` plus `CUSTOMER_SERVICE_SMS_ENABLED=true`. `CUSTOMER_SERVICE_SMS_MODE=SANDBOX` also requires `SMS_MODE=SANDBOX` and an exact match in the server-only `SMS_SANDBOX_ALLOWED_RECIPIENTS`; `CUSTOMER_SERVICE_SMS_MODE=PRODUCTION` maps only this purpose to the gateway's canonical `LIVE` delivery mode and uses the verified customer-account Auth phone without the sandbox allowlist. It uses the common worker, Moldcell provider and relay. The immutable source service-event UUID is the intent/idempotency identity, so repeated orchestration cannot create another delivery. SMS persistence/provider failure is a secondary-channel failure and never rolls back the service transition or its in-app notification. Customer Service email remains disabled; Auth OTP, Finance, Campaign and Bulk policies are independent and unchanged. Set `CUSTOMER_SERVICE_SMS_ENABLED=false` or `CUSTOMER_SERVICE_SMS_MODE=DISABLED` for an independent rollback.

RU and RO notification copy is rendered from stable event codes; localized strings never drive lifecycle logic. Sensitive message contents are not copied into notification previews.

## Security and performance

All new private tables use RLS and FORCE RLS, explicit grants and fixed-search-path security-definer mutation functions. Browser-supplied customer, request, company or role identifiers do not establish access. The server derives `auth.uid() -> customer_account -> customer_identity -> owned request`. Partner, Agent, anonymous and unrelated customer contexts have no grant or ownership path.

The service list is paginated. Detail reads are bounded and batched. The overview keeps one aggregate RPC and adds only service attention counts inside it. SMS reuses the existing minute worker and adds no cron, polling, N+1, live 1C traffic or page-load provider call. Customer-specific sandbox limits are three accepted sends per verified recipient per hour and ten per customer account per hour; the pre-existing Moldcell diagnostic limit remains unchanged.
