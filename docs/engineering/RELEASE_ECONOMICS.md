# Release economics

Production releases are bounded units of tested runtime change. Related low-risk corrections should share one release when practical; a tiny correction does not justify its own production build.

## Release workflow

1. Validate locally with the focused tests, TypeScript, focused lint, build when required, and `git diff --check`.
2. Push one ready bounded commit or short coherent series.
3. Use a preview only when browser or runtime acceptance needs it.
4. Before promoting, compare the candidate Git SHA with the current production SHA. Never redeploy the same SHA unless an incident/recovery note states why.
5. Promote once, verify READY and exact SHA, then perform production acceptance.
6. Documentation-only commits (`AGENTS.md`, root Markdown, or `docs/**`) are skipped by Vercel's fail-safe `ignoreCommand`. Any mixed or unclassifiable change builds normally.
7. Record material changes to builds, invocations, CPU, memory, logs, transfer, and scheduled-worker no-op cost in the release report.

Release checklist:

- [ ] Local validation matches the change risk.
- [ ] Candidate SHA differs from production, or redeployment necessity is documented.
- [ ] Preview is required for acceptance; otherwise it is omitted.
- [ ] Cost impact reviewed; no unjustified increase in builds, invocations, CPU, memory, logs, or transfer.
- [ ] Production was deployed once and the exact SHA was verified.

At the measured 2026-09 billing-cycle rate, path-aware documentation skipping plus the same-SHA gate targets no more than 260 builds per cycle. This is a process target and must be checked against Vercel's 24-hour and 7-day post-release evidence.

## Scheduled-worker release record

Every new or changed worker documents its cadence, bounded batch, lease/locking, idempotency, fast no-op path, expected work latency, recovery behavior, and invocation/logging impact. A cadence may be reduced only when a direct trigger preserves productive latency and a periodic recovery watchdog remains.

For the external-price import worker:

- direct trigger: the accepted upload schedules one post-response bounded worker attempt;
- recovery cadence: every 5 minutes;
- bounded work: one import per attempt;
- coordination: the existing atomic claim prevents duplicate ownership;
- idempotency: the existing upload status/claim contract remains authoritative;
- no-op cost: one claim read, no success log;
- worst-case recovery delay after a lost direct trigger: less than 5 minutes.
