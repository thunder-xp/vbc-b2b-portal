<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commercial Currency Semantics

Keep contract settlement currency separate from authoritative 1C price-type currency and published local price currency. Validate settlement independently; only authoritative and published price currencies must match. Never add settlement-to-price equality, implicit FX conversion, or a fallback price type.

## Synchronization Performance Invariant

- Recurring integrations are incremental, event-driven, or exact-refresh by default.
- Full scans are bootstrap, governed audit, migration, or integrity-recovery tools only.
- UI rendering never starts a full synchronization; a normal manual refresh does not imply a full scan.
- Cursors advance only after complete success.
- Deletion is never inferred from absence in incremental discovery; missing records require exact authoritative verification.
- Avoid N+1 remote calls and database writes, and report source-call and latency impact for every synchronization change.

## Cost Efficiency and Release Economics

Cost efficiency is part of Definition of Done.

Rules:

1. Batch related low-risk UI/UX fixes into bounded releases where practical. Avoid one production build/deploy per tiny correction.
2. Never deploy the same SHA twice without documented necessity.
3. Production observability:
   - ERROR: always retain.
   - WARN: meaningful degradation only.
   - INFO: business/operational lifecycle summaries only.
   - DEBUG: disabled by default.
   - No per-row, per-item, or per-page success logging.
   - Background/sync jobs emit one aggregate completion summary.
4. Every cron/background worker requires:
   - documented cadence;
   - bounded batch;
   - lease/locking;
   - idempotency;
   - fast no-op path;
   - estimated invocation/logging impact.
5. Prefer incremental/event-driven synchronization. Full synchronization is reserved for bootstrap, governed integrity audit, or recovery when the source cannot safely provide delta behavior.
6. Persistent polling requires explicit justification. Transient polling must be bounded and self-terminating.
7. Validate locally before deployment: focused tests, TypeScript, lint, build when required, diff check. Production deployment should normally happen once per ready bounded release.
8. Cost regression is a release-quality regression. Any material increase in function invocations, CPU, memory, observability events, transfer, or build duration/frequency must be reported before release.
9. Optimize by financial impact, not cosmetic metrics. Current priority: Observability → Build CPU → cron/invocations → runtime CPU/memory → origin transfer → image optimization.
10. At current platform scale, target recurring production infrastructure cost: <= USD 25–30/month, excluding explicitly identified development spikes.

For any new infrastructure/background feature, the final report must include request/invocation impact, logging impact, scheduled frequency if any, expected no-op cost, and before/after cost-sensitive metrics where material.

Do not weaken reliability, security, auditability, reconciliation, or critical-path validation for cost savings.

Release checklist:

[ ] Cost impact reviewed; no unjustified increase in builds, invocations, CPU, memory, logs, or transfer.
