# Commercial Agent applications

Commercial Agent applications are an authenticated intake domain. They are intentionally separate from operational `commercial_agents`, Partner access requests, company memberships, compliance, referrals, and attribution.

## Ownership and lifecycle

- `commercial_agent_applications` owns applicant-entered intake data and the lifecycle `DRAFT → SUBMITTED → NEEDS_CLARIFICATION | APPROVED | REJECTED | WITHDRAWN`.
- `commercial_agent_application_events` is the append-only audit history. It stores bounded safe notes, not credential or identity snapshots.
- One open application is allowed per authenticated user. Draft creation, refresh, and identical submission are idempotent.
- Applicant identity is resolved from the authenticated server session. Browser-supplied user IDs are never accepted.
- The first authenticated application visit idempotently creates the existing minimal `user_profiles` external identity when it does not exist; it does not create a membership or operational role.
- Applicants can read only their own application and events through RLS. Writes are performed by bounded server orchestration through service-role-only functions.

## Approval boundary

Admin review requires the existing `admin.agents.manage` permission. Approval is atomic and provisions exactly one existing-domain `commercial_agents` row through `create_commercial_agent_record`.

The new operational Agent starts in `APPLIED`. Approval of an application does not activate an Agent, satisfy compliance, create referrals, or grant cabinet access. The existing Commercial Agent lifecycle remains authoritative.

Approval may move a newly registered external profile to `active` so the existing Agent principal invariant can be satisfied. An existing active Partner profile remains a Partner and is never reclassified.

## Unified business access

A Partner user may also apply to become a Commercial Agent. The existing Business Access Resolver remains the sole routing authority:

- Partner membership continues to provide its existing Partner context.
- Agent states `APPLIED`, `COMPLIANCE_REVIEW`, `CONTRACT_PENDING`, `APPROVED`, and `TRAINING` remain pending.
- Only an operational Agent in `ACTIVE` can select the Agent context and open `/agent`.

This domain does not alter MAIB, installation marketplace, customer identity, commission economics, 1C, or public Partner registration ownership.
