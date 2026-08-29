<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
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
