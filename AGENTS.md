<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Supabase Migration Governance

1. `origin/main` is the canonical Supabase migration source history.
2. A migration may not be applied to Production unless the exact migration file is already present in the canonical release history being promoted.
3. Feature branches may test and replay migrations only locally or against isolated safe environments.
4. Production migration execution directly from an unmerged feature worktree is prohibited.
5. Before every Production database push, verify the current branch and release SHA, confirm each migration file exists in canonical history, run `npm run verify:migration-history`, and run `supabase db push --linked --dry-run`.
6. Any remote-only migration version is a release blocker.
7. Never use `supabase migration repair` for a remote-only version unless the owner explicitly approves a genuine ledger correction.

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

3. Managed local development and worktree lifecycle

DEVELOPMENT MODE

DEFAULT: LOCAL
WORKTREE: EXCEPTION
MAX ACTIVE PARALLEL WORKTREES: 3
DEPENDENCIES: INSTALL ONLY WHEN REQUIRED
RETIREMENT: REQUIRED AFTER TASK COMPLETION

Canonical repository: C:\VibeCoding\Projects\B2B\vbc-b2b-portal. All sequential development, bugfix, UI, tests, refactoring, documentation, architecture and small migrations run here. Inspect status and preserve unrelated changes. Do not create a new worktree automatically, install dependencies per task, or use dirty files alone as an isolation reason. Do not stash/reset/checkout over the owner's current work without necessity and explicit permission.

An additional worktree requires actual parallel isolation: an independent active canonical task, an unsafe experiment that cannot safely run locally, independent release/hotfix verification, or temporary performance/migration verification. Record concrete evidence. Reuse a suitable justified checkout before creating another. A new task, follow-up, branch or read-only review alone is not sufficient.

Before every automated creation or activation, use scripts/worktree-governance.ps1. It identifies canonical, checks isolation evidence and counts ACTIVE additional checkouts plus CREATED slot reservations under one exclusive lock. Three slots is the normal maximum; a fourth needs separately granted, recorded OwnerLimitApproval. Never invent this approval. Historical dormant/unclassified directories do not automatically consume active slots or block ordinary Local work; they remain protected debt, not deletion candidates. Explicitly activate a legacy checkout before reusing it, and register already active legacy tasks before authorizing another exception. Never silently assign another task's active checkout.

New lifecycle: CREATED → ACTIVE → COMPLETED / ABANDONED → RETIRED. Record TASK_ID, owner, path, branch, exact HEAD, purpose/isolation evidence, completion criteria, timestamps and cleanup policy in canonical .git/worktree-governance/lifecycle.json. On completion/abandonment: inspect Git status, preserve necessary changes, prove commit/branch disposition, record actual evidence, review and remove regenerable caches only after activity/data checks, close the task's own marker, record retirement, and propose guarded removal. Unknown or failed cleanup remains explicitly pending; never leave an unexplained state. Failed creation keeps its reservation for owner review rather than silently freeing a slot.

Dependencies are on demand. Before any installation use the Dependencies action with the actual verification need. Only build, tests, dev server or executable verification can justify installation; analysis, documentation, Git inspection, SQL review and architecture cannot. Reuse canonical's existing node_modules. Keep npm and package-lock.json; use npm's per-user cache and npm ci --prefer-offline only when a clean installation is actually needed and safe. Never run npm install/npm ci automatically for each worktree, replace an active installation, share node_modules via junctions/symlinks, switch package managers or purge cache merely to reclaim space.

Temporary-worktree node_modules, .next, .turbo and coverage are regenerable artifacts after review, not permanent task results. .env/secrets, local Supabase state, Vercel configuration, Codex evidence, local patches, unknown ignored files and NTFS links are protected; never treat them as caches. Retire refuses while cache roots or an active task marker remain. The lifecycle tool itself never deletes source, caches, branches or worktrees; use a separately reviewed activity-aware cleanup, preserving required data with verified backups. Canonical never participates in mass cleanup, including dependency eviction.

Reclamation is a separate safety decision, not a lifecycle state inferred from CLEAN or merge ancestry. Protect main/current, dirty/untracked/unique history, unfinished operations, active or ambiguous use and local data. Verify backups outside deletion targets with SHA-256, appropriate ACLs and a tested recovery path; recheck immediately before removal. Retired metadata alone is not owner authorization: record actual ReclaimApproval separately. Use scripts/worktree-audit.ps1, scripts/worktree-safe-reclaim.ps1 and scripts/worktree-health-check.ps1; their safety checks remain mandatory.

Without separate explicit owner permission, git reset --hard, git clean -fdx and git worktree remove --force are forbidden. Normal reclamation uses only ordinary git worktree remove; refusal means preserve and investigate, never bypass with recursive deletion. Production, remote Git/resources, Docker volumes and Supabase/Vercel data are outside development cleanup scope. Do not fetch or modify remote refs automatically.

The guard is mandatory for repository automation and agent workflows, including recovery creation. It does not change the desktop Local/Worktree setting or intercept arbitrary external Git commands. Start new sequential chats in Local mode targeting canonical; do not use an unguarded creation tool to bypass the limit. See docs/WORKTREE_LIFECYCLE.md for commands, dependency gates and retirement.

If canonical already hosts an independent active task, preserve its task file; first pass the isolation guard, then create the new task file in the justified assigned checkout.

New feature/fix objective → new TASK_ID. Sequential work runs in the existing canonical repository C:\VibeCoding\Projects\B2B\vbc-b2b-portal. A new task or unrelated dirty files are not reasons to create a worktree. Use an additional worktree only for the justified isolation exceptions in section 3, after its guard passes.
