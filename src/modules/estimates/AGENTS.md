# Estimates Engineering Rules

## Scope

- Estimates and Commercial Proposals form a partner-side B2B workspace. This is not CRM.
- Do not add leads, pipelines, calls, tasks, reminders, CRM activities, or manager workflows.
- Reuse the established domain: estimates, sections, lines, final customers, project/object, catalog products, works/services, shared external nomenclature, unmet-demand requests, lifecycle, immutable proposal versions/snapshots, preview/PDF, and estimate-to-order conversion.

## Ownership And Layers

- 1C is the sole source of commercial truth. Never call 1C from render or edit paths.
- Never guess product mappings, prices, stock, warranty, or product relations.
- External nomenclature must not become fake catalog or 1C data and must never synchronize to 1C.
- Repositories own data access. Services own business rules. Server Actions and governed RPCs orchestrate mutations. React owns interaction and presentation only.
- Never query Supabase directly from React components.

## Workspace Baseline

Variant 2 Workspace is the accepted UX baseline. Preserve:

- compact sticky header and collapsible settings;
- prominent equipment, work, and external-item actions;
- section-first editing and position search;
- sticky commercial sidebar, proposal readiness, preview, and proposal actions.

Do not redesign the workspace without a validated defect.

## Persistence And Concurrency

- Structural governed mutations persist immediately.
- Line creation and target-section assignment are one atomic mutation. Never follow insertion with a second client mutation for section assignment.
- Ordinary draft fields may remain local until explicit Save. Dirty state must represent only genuine unsaved changes.
- Do not add blind autosave or per-keystroke mutation traffic.
- Preserve revision validation, required row locking, idempotency keys, request fingerprints, stale-write rejection, and double-click protection.

## Sensitive Domain Rules

- External nomenclature identity is globally reusable and searchable; partner usage is company-scoped. Never expose which partner created or used an item. Do not silently fuzzy-merge; preserve governed duplicate warnings and force-new behavior.
- Final customers are company-scoped and commercially sensitive. Prevent cross-company discovery, avoid CRM expansion, and preserve structured industry and geography data.
- Preserve lifecycle states: `draft`, `sent`, `accepted`, `rejected`, `expired`, and `converted_to_order`.
- Business lifecycle is separate from archive governance. Preview or PDF access does not imply `sent`; order conversion must be governed and proven.
- Proposal versions are immutable and remain readable. Use the existing proposal rendering pipeline only.
- Customer-facing versions must exclude procurement prices, internal costs, margins, and raw 1C references.

## Performance And Intelligence

- Preserve one bounded estimate aggregate and batched product resolution.
- No N+1 reads, full catalog preload, external-nomenclature library preload, full estimate reload after row mutation, extra Partner Shell work, live 1C, or heavy analytics in render paths.
- Estimates capture reliable customer, project, catalog demand, external demand, lifecycle outcome, and conversion facts. Heavy Commercial Intelligence belongs outside the editor.
- For material changes, measure TTFB, database operation count, route/client payload, mutation latency, and search p50/p95 where relevant.

## Acceptance And Delivery

- Preserve zero horizontal page overflow at `390px`, `768px`, and `1440px`.
- Material changes require focused tests, TypeScript, ESLint, production build, `git diff --check`, the full relevant suite, responsive acceptance, and safe production acceptance.
- Use focused commits and Git-backed deployments, verify the production SHA, and leave the working tree clean.
