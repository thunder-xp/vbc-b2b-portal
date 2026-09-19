# Commercial Agent Domain Architecture

## Ownership

Portal owns Commercial Agent identity, onboarding/compliance workflow, opaque referral links, consent evidence, referral decisions and historical attribution. Shared Customer Identity is the canonical attribution target. The Agent domain does not create an Agent-only customer directory.

1C remains authoritative for sales, payments, returns/corrections, commission recognition, settlement, payout and tax/withholding. Portal commission types are contract/projection seams only; there is no second financial ledger and no live 1C dependency on Agent page renders.

## Reuse matrix

| Capability | Reused platform owner | Agent-specific addition |
| --- | --- | --- |
| Authentication/session | Supabase Auth + access-control server factory | One-to-one Agent profile lookup |
| Customer identity | Shared Customer Identity resolver | Referral calls the shared resolver |
| Partner/Retail customers | Existing bounded contexts unchanged | Shared-root reference only |
| Orders/estimates | Existing Retail/Partner domains | Read-only eligibility evidence |
| 1C integration | Existing governed integration boundary | Nullable Agent mapping and future event handoff |
| Audit/security | Append-only events, Admin permission guard | Agent lifecycle/referral/attribution events |
| Omnichannel | Existing gateway (inactive here) | Typed future Agent event vocabulary |

## Principal and access model

An Agent account is an active `external` user linked one-to-one to `commercial_agents`. A principal may also hold governed Partner memberships under the Unified Business Access model; those relationships do not grant each other's permissions and are revalidated independently. The Agent principal eligibility trigger still requires an active external profile. Admin operations require `admin.agents.view` or `admin.agents.manage`. Agent and identity tables expose no direct browser grants.

The `/agent` shell reads only the Agent's bounded profile/status. It cannot enumerate Partner companies, Retail history, customer commercial relationships, prices or finance.

## Lifecycle

Agent statuses are `APPLIED → COMPLIANCE_REVIEW → CONTRACT_PENDING → APPROVED → TRAINING/ACTIVE`, with governed reject, suspend and terminate branches. Compliance captures public-sector activity, external paid activity, procurement participation, conflict-of-interest review and a safe bounded note.

Referral flow is:

`opaque QR/link → minimal contact + explicit consent → shared identity resolution → Admin review → duplicate/existing-customer eligibility → verified referral → active attribution`.

Only token hashes are persisted. Revoked, expired or non-active-Agent tokens cannot accept a referral. Identity existence alone is not an existing commercial relationship: V1 eligibility checks active Partner estimate negotiation and existing Retail orders through server-only canonical context reads.

## Attribution

One active attribution is permitted per shared customer identity. First valid attribution wins. Initial protection is exactly 90 days. Extension, reassignment and termination are explicit audited operations. Reassignment closes the old row and inserts a new row with `supersedes_attribution_id`; historical customer, Agent, referral and window identity are immutable.

Future B2C, Final Customer Cabinet, offline and 1C-originated sales can correlate through `1C external ref → shared customer identity → active/historical Agent attribution`, independent of the browser session that originally captured the referral.

## Commission seam

The policy contract supports START/ACTIVE/PROFESSIONAL/STRATEGIC classification and future governed percentages. It is `PROJECTION_ONLY`: accounting recognition, reversal, payment allocation and payout remain in 1C. No commission calculation or write-back is activated by this foundation.
