# Marketplace Partner Activation V1

## Ownership and intent

Activation extends the canonical company-backed `installation_providers` record. `partner_companies` remains the Partner identity and `company_memberships` remains the authorization source. The feature does not introduce a parallel installer company, duplicate public profile, scheduling engine, pricing, payouts, or Ranking V3.

Only an authorized Partner user can explicitly opt in. Existing B2B companies are not enrolled by migration. The single pre-existing approved provider is preserved as the last-good active Marketplace supply.

## Participation lifecycle

`NOT_ENROLLED → DRAFT → PENDING_REVIEW → APPROVED → ACTIVE`

- `REJECTED` can return to `DRAFT` after a correction and be submitted again.
- `SUSPENDED` stops new exposure without deleting assignments, projects, reviews, or history.
- `APPROVED` records Admin approval but is not rankable while operational availability remains unavailable.
- `ACTIVE` is the only Partner participation state allowed to set `marketplace_enabled=true`.

The invariant is enforced in PostgreSQL. The existing Ranking V2 filter continues to consume the same approved/active/enabled provider projection, so no ranking formula changed.

## Readiness and profile

The server-owned readiness projection reports factual checks:

- active canonical company and complete visible public company profile;
- canonical installation-provider service record;
- at least one governed capability;
- at least one active governed service area;
- active company contact person and Portal response channel;
- current version of Marketplace terms accepted;
- current version of customer-data privacy acknowledgement accepted;
- Admin verification;
- current availability (`available`, `limited`, or `unavailable`).

The public company name and logo remain owned by the canonical Partner directory. Partner activation stores only installation descriptions, availability, capacity, contact, capabilities and service-area links in the existing provider model.

## Capabilities and geography

V1 uses the bounded capability codes already shared by public installation demand:

`cctv`, `intercom`, `access_control`, `alarm`, `network`, `other`.

Capability evidence explicitly distinguishes `self_declared` from `verified`; UI must never describe a self-declaration as Novotech certification. Service coverage reuses `installation_service_regions` and `installation_provider_regions` at municipality, district and locality levels. Company address is never converted into an inferred travel radius.

## Approval, audit and notifications

Admin review is permission-gated by `admin.retail_marketplace.manage`. Approval and reactivation require all pre-Admin readiness checks. Rejection uses bounded reason codes. Every opt-in, acceptance, material profile/capability/geography/availability change, submission, approval, rejection, suspension and reactivation writes an append-only `retail_marketplace_events` fact.

Meaningful lifecycle events use the existing in-app Partner notification projection. Email and SMS remain off for these events.

## Security and privacy

- Partner RPCs validate active membership and `installation_marketplace.manage` for the supplied company; browser values are never accepted as authorization.
- Admin RPCs validate the established internal Retail Marketplace permission.
- Private provider, profile, capability, region and audit tables use enabled and forced RLS.
- Definer functions use an empty `search_path`, have default execution revoked, and grant only the narrow public RPCs to `authenticated`.
- Customers and Agents receive no activation/readiness/review projection.
- Customer contact data remains governed by project acceptance and is not part of activation.

## Ranking V2 and cold start

Activation only supplies new eligible evidence to the existing Ranking V2 pipeline. An ACTIVE Partner with matching capability and geography is evaluated through the existing eligibility and exploration rules. No synthetic rating, completed job, review, boost, or permanent position is added. New supply therefore retains Ranking V2's `NEW_PARTNER`/`LEARNING` evidence state and bounded exploration slot.

## Supply and pilot diagnostics

The Admin report exposes factual counts: total active B2B Partners, enrolled, pending, active eligible, unavailable and suspended. The coverage matrix is the active installer count for every active service-area × governed-capability pair, including zero rows. Pilot facts are raw eligible-installer, covered-capability and covered-service-area counts; there is no synthetic readiness score or demand forecast.

## Pilot configuration and invitations

Pilot scope is configured per governed service region and bounded capability with an explicit minimum active-installer threshold. Readiness is factual:

- `NOT_READY`: no pilot cell is enabled or an enabled cell has no active installer;
- `LIMITED`: every enabled cell has supply but at least one is below its configured threshold;
- `READY`: all enabled cells meet their thresholds.

The Marketplace-specific invitation lifecycle is `INVITATION_DRAFT → READY_TO_SEND → SENT → OPENED → PARTNER_STARTED → PARTNER_SUBMITTED → APPROVED | DECLINED`, with `EXPIRED` for an elapsed invitation. Only `IN_APP` and `EMAIL` are supported. Preparing a draft never sends; sending requires a separate Admin action and a currently valid owner/manager recipient. The durable email intent and in-app notification both use idempotent identities. SMS is excluded.

Provider lifecycle transitions advance invitation evidence where applicable. They do not create providers, capabilities, regions, assignments, reviews, ratings, or activity facts on behalf of a Partner. Append-only supply events retain actor, correlation, entity and safe bounded evidence.

The Admin candidate projection includes all active B2B companies, is search/filter/pagination bounded, and reports blockers through the existing server-owned readiness function. Verified capabilities are the only evidence labelled as verified; self-declarations remain explicitly distinct.
