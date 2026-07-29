# Estimates And Commercial Proposals Ergonomics Audit

Audit date: 2026-07-29. Evidence is based on production route implementations,
service contracts, and rendered component tests. Authenticated production
interaction remains release acceptance because no partner session is available
in the workspace.

| Route | Current behavior | Persona | Business impact | Recommended correction | Regression risk |
| --- | --- | --- | --- | --- | --- |
| `/cabinet/estimates` | Aggregate pagination exists, but PDF readiness and the last meaningful action are difficult to scan. | Sales engineer, manager | Users reopen records to understand document readiness. | Expose creation/update dates, version/PDF state, and business status in the existing aggregate row. | Preserve one-query pagination; never load versions per row. |
| `/cabinet/estimates/new` | The form is compact but does not explain VAT defaults or the next step. | Sales engineer | Users hesitate over what must be configured now. | Keep required fields minimal and explain defaults and redirect to the editor. | Do not introduce advanced settings into creation. |
| `/cabinet/estimates/[estimateId]` | Editing, totals, and lifecycle controls compete at the same visual level. | Sales engineer | The current status and next action are not obvious. | Establish identity, commercial summary, content, then proposal lifecycle. | Preserve draft revision checks and retail-only redaction. |
| Estimate lines | Product, service, and custom rows share much of the same visual treatment. | Sales engineer | Manual rows can be mistaken for catalog truth. | Use explicit line-type labels, images only for products, and strong manual-position warnings. | Preserve snapshots and server calculations. |
| Sections | Keyboard ordering exists but section deletion intent is unclear. | Sales engineer | Empty structure accumulates; destructive expectations are uncertain. | Provide accessible ordering and allow removal only when empty. | Never remove or orphan lines implicitly. |
| Proposal versions | Immutable snapshots are implemented, while action labels remain terse and icon-heavy. | Manager, sales engineer | Users may not understand when to create a new version. | Explain immutability and use explicit preview/PDF/send/new-version actions. | Never permit edits to sent or accepted versions. |
| Proposal preview/PDF | Shared document model exists; preview relies on a wide table and technical controls. | Customer-facing sales | Mobile review is awkward and controls are ambiguous. | Align preview hierarchy with PDF, improve page-break hints and accessible controls. | Generated documents remain immutable. |
| Email/conversion | Delivery and cart conversion are implemented but success/failure and review intent are compressed. | Manager, buyer | Users can mistake preparation for final sending or ordering. | Show provider availability, delivery state, and explicit conversion review wording. | No uncontrolled email or order submission. |

## Proven Boundaries

- Estimate list uses one paginated aggregate repository call.
- Product commercial data is fetched in batches, not per line.
- Normal rendering performs no live 1C calls.
- PDF generation and SMTP delivery are isolated from page rendering.
- Proposal versions are immutable snapshots and remain unchanged by this sprint.
- Company and permission context continue to be resolved server-side.
