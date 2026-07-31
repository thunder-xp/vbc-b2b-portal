# Partner Onboarding Approval Wizard

## Current Approval Audit

The deployed foundation is retained: application revisions, onboarding events,
assignment, SLA, local published 1C counterparty/contract/price-profile
directory, queue aggregate, detail aggregate, and additive onboarding
permissions. Rendering and approval never call 1C.

`approve_partner_access_request_v2` remains callable for backward compatibility.
It atomically creates/reuses a company and membership, but it accepts raw 1C
binding fields from the action, chooses only owner/manager, has no persisted
decision draft, and creates no onboarding notification. The onboarding route no
longer calls it.

`confirm_onboarding_counterparty_match` is retained for deployed compatibility.
The wizard replaces its UI with a versioned draft mutation that validates the
published directory row and request revision on every save.

## Governed Business Profiles

| Profile | Canonical role | Partner prices | Orders | Finance | Employees |
| --- | --- | --- | --- | --- | --- |
| owner | `partner_owner` | yes | yes | yes | yes |
| manager | `partner_manager` | yes | governed option | governed option | no |
| buyer | `partner_buyer` | yes | governed option | no | no |
| accounting | `partner_accounting` | no new confidential grant | no submission | yes | no |
| retail_only | `partner_viewer` | explicit deny | no | no | no |

The role remains the canonical baseline. `membership_permission_overrides`
applies only the governed refinements for partner/retail price visibility,
finance, cart, and orders. No second permission system or arbitrary checkbox
catalog is introduced.

## Persisted Draft

`onboarding_approval_drafts` has one row per access request and stores the
request revision, confirmed local counterparty, internal manager, synchronized
price profile, payment model, initial business profile, finance/order options,
current step, editor, attempt key, and optimistic version. Direct authenticated
writes are revoked and RLS is enabled.

Every save verifies both request revision and draft version. A changed partner
revision marks the draft stale; the explicit reset operation starts a clean
draft against the latest immutable application revision.

## Four-Step Workflow

1. **Company verification** confirms one active published 1C counterparty.
   Exact fiscal match may be preselected but requires a manager confirmation.
   Missing matches, duplicate fiscal groups, inactive rows, and conflicting
   portal linkage block approval.
2. **Commercial setup** selects an eligible active Novotech manager, one active
   synchronized price profile (unless retail-only), the governed payment model,
   and finance/order options. `inherited_from_1c` is displayed as
   `Определяется в 1С`; the portal does not become financial truth.
3. **Initial user** selects one canonical business profile. The server
   normalizes incompatible options and moves the request to
   `ready_for_approval`.
4. **Review** displays only business outcomes and requires the explicit
   confirmation `Я проверил компанию и выбранные условия доступа.`

## Atomic Approval V3

`approve_partner_access_request_v3` accepts only request ID, expected immutable
revision number, expected draft version, stable attempt key, and correlation ID.
All company, user, role, permission, manager, price, and 1C relationships are
re-read server-side.

The RPC takes an advisory transaction lock and row locks, validates active
internal authorization, then runs the mutable phase in a PL/pgSQL subtransaction:

1. validate request/draft versions and `ready_for_approval`;
2. validate current published counterparty, fiscal uniqueness, and linkage;
3. validate manager eligibility and synchronized price profile;
4. reject cross-company identity or fiscal/reference conflicts;
5. create or reuse the company and activate one membership;
6. assign canonical role and governed overrides;
7. activate the partner profile and approve both workflow statuses;
8. append immutable company/onboarding audit events;
9. create one durable in-app notification;
10. persist the idempotent success result.

An exception rolls the whole mutable subtransaction back. The outer transaction
then records one failed attempt and an internal `approval_failed` event with a
safe failure class and correlation ID. The request remains
`ready_for_approval`; no partial company access survives. External email is not
part of the transaction.

## Reuse And Conflicts

- Same authoritative 1C reference: reuse an active company if commercial data
  does not conflict.
- Same fiscal code with a different authoritative reference: hard block.
- Counterparty linked to another portal company: hard block.
- Existing same-company membership: reactivate/update idempotently.
- Active membership in another company: hard block under the current model.
- No silent identity merge and no arbitrary first-company/contract selection.

## Compatibility And Deprecation

- Retained: v2 RPC, old match RPC, partner waiting behavior, existing role and
  permission model, notification read model.
- Replaced on `/admin/onboarding/[requestId]`: old one-form match/profile UI and
  any raw approval binding submission.
- Deprecated after all clients are on v3: v2 approval action/repository path.
  It is intentionally not dropped in this release.

## Performance And Security

The route performs one bounded `get_onboarding_request_detail_v3` aggregate.
Contracts and price profiles are projected in that aggregate; there are no
per-row application queries. A step save is one bounded RPC and approval is one
atomic RPC. Only the affected onboarding detail, queue, waiting page, and
cabinet paths are revalidated.

No Service Role reaches the browser. No direct table mutation is granted. The
page model contains business labels and opaque selection IDs, never raw 1C
references, permission codes, or raw database errors.

## Production Acceptance

Production currently has no mutable onboarding request. Historical approved
requests must not be modified. Deployment acceptance therefore covers route
authorization, terminal rendering, migration/RPC availability, static security
checks, and local fixture tests. A real atomic approval remains pending until a
new business-approved request exists.

## Clarification, Rejection, And Delegation

Clarification is a governed decision, not an editable status toggle. The
manager records a reason category, partner-facing message, requested business
fields, optional response deadline, and separate internal note. The request
enters `clarification_requested`, approval becomes unavailable, and the final
decision SLA pauses. Audit metadata stores the reason, requested fields,
revision number, and message fingerprint rather than unrestricted text.

The partner status center uses one ownership-scoped aggregate. A partner may
create a new immutable revision only while clarification is pending and may
change only company, contact, and business submission fields. Company matching,
commercial profile, manager, access role, permissions, and technical IDs are
never accepted by the partner mutation. Resubmission returns the request to
`under_review`, resumes SLA tracking, invalidates stale matching choices, and
notifies only the assigned manager.

Rejection requires a governed reason and safe partner explanation. Internal
notes remain internal. Rejection and cancellation are terminal for manager
workflows. Only a platform administrator may reopen a rejected or cancelled
request; reopening requires a reason and explicit eligible manager, starts a
new SLA cycle, and preserves all earlier events and revisions.

### Canonical Transitions

- `received -> under_review | clarification_requested | rejected | cancelled`
- `under_review -> clarification_requested | awaiting_1c_company | link_confirmation_required | ready_for_approval | rejected | cancelled`
- `clarification_requested -> under_review | rejected | cancelled`
- `awaiting_1c_company -> link_confirmation_required | under_review | rejected | cancelled`
- `link_confirmation_required -> under_review | ready_for_approval | rejected | cancelled`
- `ready_for_approval -> under_review | approved | rejected | cancelled`
- `rejected -> under_review` only through platform-admin reopen
- `cancelled -> under_review` only through platform-admin reopen
- `approved` has no manager-controlled outbound transition

### Delegation And Notifications

Assignment and reassignment use the existing eligible internal-user projection.
Platform administrators grant or revoke the existing onboarding capability
bundle from the internal user directory without changing the employee's primary
role. Existing self-grant, self-revoke, and audit protections remain canonical.

Pre-access messages use an append-only server-only onboarding outbox because the
canonical partner notification table requires active company membership. The
waiting page is immediately consistent from request state. Delivery remains
asynchronous and deduplicated, and notification content excludes commercial
configuration and internal notes.
