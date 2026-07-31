# Partner Onboarding Console 2.0

## Review Gate

This document is the architecture output required before implementation.
It does not authorize migrations, role assignment, route replacement, or
production changes.

## Current Flow

The current partner journey is split across separate mutations and pages:

1. `/auth/register` creates a Supabase Auth identity. Company and country are
   stored only in Auth user metadata.
2. After verification and sign-in, `/onboarding/profile` creates
   `user_profiles` with name and phone.
3. `/onboarding/access-request` creates one `access_requests` row with company
   name, fiscal code, phone, and comment.
4. `/onboarding/waiting` displays pending, approved, rejected, or cancelled
   requests. It redirects to `/cabinet` only when both an approved request and
   an active membership exist.
5. `/admin/partner-requests` lists every pending request without pagination.
6. `/admin/partner-requests/[requestId]` loads the request and requester, then
   exposes separate approve and reject forms.
7. Approval searches live 1C, loads contracts and price types, validates the
   selected binding, and calls `approve_partner_access_request_v2`.
8. The RPC creates or reuses a portal company, activates the profile, creates
   or restores membership, assigns owner or manager, writes a company-user
   event, and marks the request approved.
9. Rejection directly updates the request. There is no clarification workflow,
   assignment, SLA, onboarding event stream, or onboarding notification.

Compatibility route `/admin/access-requests` already redirects to or reuses the
partner-request console. `/admin/partner-requests` is the current canonical
route.

## Current Mutations And Ownership

| Operation | Current owner | Current boundary |
| --- | --- | --- |
| Auth registration | Auth server action | Supabase Auth |
| Profile creation | access-control service/repository | `user_profiles` |
| Request submission/cancellation | access-request service/repository | `access_requests`, own-row RLS |
| Request list/detail | approval service/repositories | internal permission plus RLS |
| 1C search/binding validation | integration service/provider | live server-side 1C |
| Approval | approval service plus transactional RPC | `approve_partner_access_request_v2` |
| Rejection | approval service plus generic status update | direct `access_requests` update |
| Membership/role | approval RPC | canonical roles and memberships |
| Price visibility | membership permission overrides | full or retail-only |
| Notification | not implemented for onboarding | none |
| Audit | approval RPC only | generic `company_user_events` event |

The application action checks canonical internal permissions, but the service
still contains a broad `active internal/admin` reviewer helper. The SQL RPC is
the final approval authority and correctly checks
`has_internal_permission('access_requests.approve')`.

## Proven Pain Points

- Registration, profile, and application data are entered across three steps.
- Auth metadata company/country is not the canonical onboarding record.
- Contact name and email are split between profile/Auth and request data.
- Locality, business type, activity, and estimated volume are absent.
- The partner waiting page contains generic and partially English states.
- The manager queue has one status, no assignment, counters, filters, SLA, or
  pagination.
- Queue requester loading is N+1: one profile query per request.
- Request detail performs repeated authorization/profile reads.
- Approval exposes raw 1C references in the primary UI.
- Approval performs live 1C calls during the workflow and has no local
  counterparty candidate projection.
- Initial role is chosen implicitly by whether another owner exists.
- Price access is selected as a raw 1C price type; retail-only membership
  redaction is not part of initial approval.
- There is no governed clarification or rejection model.
- Rejection has no dedicated append-only onboarding audit.
- No assignment, workload, SLA, failed-approval, or duplicate-conflict model
  exists.
- Approval creates no onboarding notification.
- Live binding validation happens before the database transaction, so the
  transaction cannot prove which synchronized 1C snapshot was confirmed.

## Ownership Boundaries

1C remains authoritative for counterparty identity, active state, contracts,
price types, and commercial attributes. The portal may store only a bounded,
display-safe synchronized matching directory and confirmed external
references.

The portal owns application revisions, workflow status, assignment, SLA,
duplicate decisions, manager decisions, membership, effective access,
notifications, and append-only audit.

No manager UI may write 1C, role tables, permission tables, or membership
overrides directly.

## Required Data Design

Extend `access_requests` as the workflow aggregate with:

- `current_revision_id`;
- `assigned_manager_user_id`;
- `internal_status`;
- `match_state`;
- `confirmed_1c_company_ref`;
- `confirmed_match_version`;
- `partner_type`;
- `assigned_sales_manager_user_id`;
- `price_type_ref`;
- `payment_model`;
- `order_access_enabled`;
- `finance_access_enabled`;
- `retail_only`;
- `initial_role_code`;
- `sla_first_review_due_at`;
- `sla_final_decision_due_at`;
- `review_started_at`;
- `last_partner_activity_at`;
- `last_manager_activity_at`;
- `clarification_deadline`;
- `approval_failure_code`;
- `workflow_version`.

Create three bounded supporting models:

1. `onboarding_application_revisions`: immutable partner-submitted snapshots.
   It stores the normalized business form and preserves clarification history.
2. `onboarding_events`: append-only safe workflow audit with previous/new
   status, actor, reason category, correlation ID, and timestamp.
3. `one_c_counterparty_directory`: synchronized matching projection containing
   reference, code, display names, fiscal code, normalized fiscal code,
   display-safe phone/email when available, buyer/active/deleted flags,
   source version, and synchronized timestamp.

The directory is not a commercial company master and contains no raw payload,
contract balance, credit, pricing, or security data.

Company-level commercial settings need an explicit portal-owned model. The
current `partner_companies` table has no partner type, assigned manager,
payment model, finance capability, or order capability. Prefer a one-to-one
`partner_company_access_settings` record over unrelated nullable columns on
`partner_companies`. Membership roles and overrides remain the user-level
authorization source.

## Proposed Status Model

Internal statuses:

- `received`;
- `under_review`;
- `clarification_requested`;
- `awaiting_1c_company`;
- `link_confirmation_required`;
- `ready_for_approval`;
- `approved`;
- `rejected`;
- `cancelled`.

`approval_failed` is an event and diagnostic field, not a business status. A
failed atomic approval leaves the request `ready_for_approval`.

Partner mapping:

| Internal status | Partner label |
| --- | --- |
| `received` | Заявка получена |
| `under_review` | На проверке |
| `clarification_requested` | Требуется уточнение |
| `awaiting_1c_company` | Готово к подключению |
| `link_confirmation_required` | Готово к подключению |
| `ready_for_approval` | Готово к подключению |
| `approved` | Доступ открыт |
| `rejected` | Заявка отклонена |
| `cancelled` | Заявка отменена |

Allowed transitions:

- `received -> under_review | cancelled`;
- `under_review -> clarification_requested | awaiting_1c_company |
  link_confirmation_required | ready_for_approval | rejected | cancelled`;
- `clarification_requested -> under_review | cancelled`, only through a new
  partner revision;
- `awaiting_1c_company -> link_confirmation_required |
  ready_for_approval | clarification_requested | rejected | cancelled`;
- `link_confirmation_required -> ready_for_approval |
  clarification_requested | rejected | cancelled`;
- `ready_for_approval -> approved | clarification_requested |
  rejected | cancelled`;
- `approved` is immutable;
- `rejected` may be reopened only by a separate platform-admin operation;
- `cancelled` requires a new application.

Every transition is validated in SQL and app service code.

## Manager Role And Permissions

Create standalone internal role `partner_onboarding_manager` with only:

- `onboarding.requests.view`;
- `onboarding.requests.review`;
- `onboarding.requests.request_clarification`;
- `onboarding.requests.approve`;
- `onboarding.requests.reject`;
- `onboarding.company_match.view`;
- `onboarding.company_match.confirm`;
- `onboarding.initial_role.assign`;
- `onboarding.price_access.assign`;
- `onboarding.audit.view_limited`.

Platform administrators receive all permissions. The canonical route and
actions use these permissions, not `user_type` or navigation visibility.

Do not grant admin role/permission management, integration configuration,
global security, impersonation, company deletion, or direct table writes.

The current one-active-internal-role rule is a product decision blocker. A
standalone onboarding manager role is safe for dedicated managers, but a sales
manager cannot simultaneously keep `novotech_sales` permissions without either
multi-role support or a reviewed composite role. Do not silently add these
permissions to every sales user.

## Queue And Detail Query Plan

Canonical route: `/admin/onboarding`. Keep `/admin/partner-requests` and
`/admin/access-requests` as redirects during migration.

Use one permission-enforced paginated queue RPC returning:

- rows;
- total count;
- six status counters;
- SLA counters;
- manager workload counters;
- duplicate and match summaries.

The RPC accepts validated page, page size, search, status, manager, age,
duplicate state, match state, locality, and business type. Search operates on
normalized indexed company name, fiscal code, contact name, and email.

Use one detail aggregate RPC returning application revision, identity checks,
candidate matches, commercial draft, first-user draft, timeline, and allowed
actions. Candidate matching reads only `one_c_counterparty_directory`.

Required indexes include status/created, assigned manager/status, SLA due,
normalized fiscal code, normalized email, normalized company name, and
counterparty-directory normalized fiscal code/name. Candidate result sets are
strictly bounded.

Source-derived baseline:

- current queue: one request query plus one requester query per row;
- current queue: no pagination or aggregate counters;
- current detail: repeated permission/profile/request reads;
- current matching: live 1C search, contract read, and price-type read;
- current approval: local reads plus one RPC after live integration calls.

Benchmarks must be recorded in Slice A before/after implementation.

## Matching Model

Candidate ranking:

1. exact normalized fiscal code;
2. exact raw fiscal code;
3. exact normalized registered name;
4. phone and email as secondary evidence;
5. other reviewed business identifiers.

An exact fiscal-code match may be preselected but always requires confirmation.
Name, phone, or email alone never auto-links.

Match states:

- `exact_match`;
- `multiple_candidates`;
- `no_match`;
- `inactive_match`;
- `already_linked`;
- `conflict_requires_admin`.

Approval stores the confirmed directory reference and source version. The
atomic RPC verifies that the directory row is still active, authoritative,
fiscal-code compatible, and not linked to a conflicting portal company.

No-match requests may advance to `awaiting_1c_company`, but cannot approve.
This slice does not create counterparties in 1C.

## Duplicate Matrix

| Evidence | Outcome |
| --- | --- |
| Same user has active pending request | Return existing request |
| Same user already has active membership | Redirect to company; block request |
| Same email belongs to another Auth/profile identity | Hard block, admin review |
| User belongs to another active company | Hard block, admin review |
| Same normalized fiscal code has pending request | Warn and route to duplicate review |
| Fiscal code belongs to active portal company | Offer invitation to existing company |
| Confirmed 1C reference already linked | Reuse that portal company after confirmation |
| Multiple portal companies share evidence | `conflict_requires_admin` |
| Name-only, phone-only, or email-only match | Candidate evidence only |
| Rejected/cancelled prior request | Allow new revision/request under explicit rules |

No identities or companies are merged automatically.

## Approval Wizard

One detail page contains a four-step server-backed wizard:

1. Verify company: review revision, duplicate checks, and confirmed directory
   candidate.
2. Commercial profile: business labels for partner type, manager, price type,
   payment model, order/finance access, and retail-only.
3. Initial user: owner, manager, buyer, accounting, or retail-only mapping to
   canonical role plus overrides.
4. Review: show resulting company, access, assignment, and activation state.

Wizard state is persisted as a validated onboarding decision draft, not only
React state. Raw references and permission codes are absent from the primary
UI.

## Atomic Approval Design

Introduce a versioned RPC; keep `approve_partner_access_request_v2` until old
code is retired.

The new RPC:

1. checks `onboarding.requests.approve`;
2. locks request and current revision;
3. validates workflow version and `ready_for_approval`;
4. validates active reviewer assignment or reassignment permission;
5. validates the confirmed directory row and source version;
6. locks fiscal code, external reference, user, and company conflict keys in a
   deterministic order;
7. creates or activates the minimal portal company;
8. stores authoritative reference and access settings;
9. creates or activates membership with the selected role;
10. writes only allowed membership overrides;
11. activates the profile;
12. marks the request approved;
13. appends the onboarding audit event;
14. inserts the durable partner notification event;
15. returns approved company, user, and idempotency outcome.

The RPC is idempotent only when the existing approved result matches the same
revision, company reference, role, and commercial decision. A different retry
is a conflict. Email delivery occurs after commit and cannot roll back approval.

## Clarification And Rejection

Clarification requires governed category, partner message, allowed field list,
and optional deadline. The transition inserts an event and notification.
Partner submission creates a new immutable revision and returns the request to
`under_review`.

Partner-editable fields are company name, fiscal code, contact person, phone,
locality, business type, business activity, estimated volume, and comment.
Email changes remain an Auth identity workflow and are not edited here.

Rejection requires a governed reason. Partner explanation and internal note
are separate. The partner never receives internal risk, duplicate evidence, or
security diagnostics. Reversal is a separate platform-admin transition.

## Notification Design

Extend the existing notification event catalog with:

- `onboarding_application_received`;
- `onboarding_clarification_requested`;
- `onboarding_application_updated`;
- `onboarding_approved`;
- `onboarding_rejected`;
- `onboarding_cancelled`.

Events are inserted transactionally with workflow changes. Projection to the
partner inbox occurs only after membership/access exists. Before access, the
waiting page reads the request status and latest partner-safe message. Existing
SMTP may deliver safe messages asynchronously; SMTP failure never changes
workflow state.

## SLA Model

- first review due: four business hours after receipt;
- final decision due: one business day after the latest complete revision;
- clarification pauses final-decision SLA;
- partner update restarts final-decision SLA;
- weekends and configured Moldovan holidays require a shared business-calendar
  function rather than elapsed-hour arithmetic.

The queue displays age, due time, overdue state, last activity, and recommended
action. Admin oversight aggregates process health, not employee ranking.

## Security Model

- Auth identity and manager context are server-derived.
- Every route/action checks canonical effective permissions.
- RLS permits only own request/revision reads and allowed partner updates.
- Workflow writes use narrow audited security-definer RPCs.
- No authenticated direct writes to memberships, overrides, audit, assignment,
  confirmed matches, or approval fields.
- Directory reads expose only display-safe matching fields.
- Candidate queries are bounded and unavailable to partners.
- Raw 1C payloads, credentials, service-role tokens, permission codes, and
  technical identifiers never reach the primary UI.
- Audit and notification events are append-only.
- Approval requires an active authoritative directory match and complete
  commercial decision.

## Delivery Slices

### Slice A

- reviewed migration design;
- status and transition model;
- manager permissions and role;
- counterparty directory prerequisite;
- paginated queue and compatibility redirects.

### Slice B

- immutable application revisions;
- complete detail aggregate;
- duplicate checks;
- local candidate matching and confirmation.

### Slice C

- persisted approval draft;
- business-label wizard;
- versioned atomic approval RPC;
- idempotency and concurrency tests.

### Slice D

- clarification and rejection;
- waiting/status experience;
- onboarding notifications and post-commit email.

### Slice E

- SLA/business calendar;
- admin oversight;
- performance instrumentation;
- production hardening and acceptance.

## Unknowns And Blockers

1. Production email-confirmation behavior must be confirmed before deciding how
   one public form survives signup without storing canonical application data
   only in Auth metadata.
2. No synchronized 1C counterparty directory exists. Its bounded sync contract,
   cadence, retention, and production volume must be approved first.
3. The one-active-internal-role policy cannot represent a manager who needs
   both sales and onboarding roles. Dedicated-role versus multi-role strategy
   requires CTO approval.
4. Business vocabularies are not defined for partner type, locality, business
   type/activity, volume bands, payment model, rejection reasons, and
   clarification categories.
5. The source of assigned sales-manager identity is not defined.
6. Company-level order/finance access has no current canonical storage model.
7. Moldova business holidays and timezone rules need an approved calendar.
8. Rejected-request reopening and same-fiscal-code multi-user applications need
   explicit policy.
9. Existing approved requests need a backfill mapping into the new status and
   audit model without inventing historical events.
10. Existing `novotech_sales` approval permission migration and route
    compatibility need a staged rollout so deployed code is never broken.

