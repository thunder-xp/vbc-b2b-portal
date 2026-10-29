# Local-first development and worktree lifecycle

## DEVELOPMENT MODE

DEFAULT: LOCAL
WORKTREE: EXCEPTION
MAX ACTIVE PARALLEL WORKTREES: 3
DEPENDENCIES: INSTALL ONLY WHEN REQUIRED
RETIREMENT: REQUIRED AFTER TASK COMPLETION

Canonical: `C:\VibeCoding\Projects\B2B\vbc-b2b-portal`.
New sequential tasks use this existing checkout: development, fixes, UI, tests,
refactoring, documentation, architecture and small migrations. Inspect status;
never overwrite user work, stash/reset/checkout over it, or create isolation simply
because a new task or unrelated dirty files exist. Select Local in the desktop.
This repository policy does not change the desktop setting or existing chats.

## Guarded exceptions and the three-slot limit

Use `scripts/worktree-governance.ps1` for every automated creation, activation or
recovery registration. Its default is read-only Status. Create/Activate and all
lifecycle changes are dry-run until `-Execute` is explicitly supplied. No action
installs npm dependencies or deletes source/caches/worktrees.

Valid isolation reasons, with concrete `IsolationEvidence`:

- `ParallelCanonicalTask`: another independent task is active in canonical;
  `ParallelTaskId` must match its preserved CURRENT_TASK and differ from the new task.
- `DangerousExperiment`: explain why the experiment cannot run safely in canonical.
- `ReleaseVerification`: independent release/hotfix verification.
- `PerformanceMigrationVerification`: temporary isolated performance/migration checks.

Check reports `LOCAL_DEFAULT_NO_ISOLATION_NEEDED` when no exception is justified.
CREATED reservations and ACTIVE checkouts together consume at most three additional
slots. Counting and registration run under an exclusive shared file lock, including
Git creation itself. Competing executions cannot both allocate the last slot.
A fourth requires a separately granted owner decision supplied as
`OwnerLimitApproval`; record the actual permission, never fabricate it.

Existing unregistered historical trees are shown as `LegacyUnclassified`, not
assumed ACTIVE or safe/dormant. They do not block normal canonical work or consume
new-workflow slots automatically. Before reusing one, explicitly Activate it with
real task/isolation metadata; that consumes a slot. Completed legacy debt is preserved
for its own reviewed retirement, not automatically deleted by this guard.

```powershell
# Normal sequential work: stay canonical; no worktree or dependency setup.
pwsh -NoProfile -File scripts/worktree-governance.ps1

# Optional exception decision, without creating or installing anything.
pwsh -NoProfile -File scripts/worktree-governance.ps1 -Action Check -IsolationReason ReleaseVerification -IsolationEvidence 'Independent verification of the specified release'

# Example only: replace task/owner/path/branch/evidence with real values.
# Dry-run by default. Add -Execute only after the exception is justified.
pwsh -NoProfile -File scripts/worktree-governance.ps1 -Action Create -Path C:\VibeCoding\Projects\B2B\vbc-b2b-portal-release-check -TaskId TASK-ID -Owner OWNER -IsolationReason ReleaseVerification -IsolationEvidence 'Independent release verification; canonical cannot supply this isolated check' -BranchName verify/TASK-ID -BaseRef main -CompletionCriteria 'Exact release behavior verified and evidence saved'
```

This is an agent/repository automation entrypoint, not an OS-wide interceptor.
Direct Git/desktop creation can bypass any repository wrapper and is forbidden by
AGENTS unless the same guard and reservation workflow is used. No worktree has been
created simply to validate this policy; focused tests use synthetic registrations.

## Dependency-on-demand

Keep npm and package-lock.json. Reuse the canonical installation for sequential
execution. Before installing, ask the existing gate for the real verification need:

```powershell
pwsh -NoProfile -File scripts/worktree-governance.ps1 -Action Dependencies -Verification Documentation
pwsh -NoProfile -File scripts/worktree-governance.ps1 -Action Dependencies -Verification Tests
```

Analysis/Documentation/GitInspection/SqlReview/Architecture/None never authorize
installation. Only Build/Tests/DevServer/ExecutableVerification can justify it.
Existing node_modules returns REUSE_CURRENT_INSTALLATION. Missing node_modules
plus a lockfile returns a suggested `npm ci --prefer-offline`; npm is never run by
the gate. Confirm tool versions and lockfile, then install only when needed.
An additional checkout must be explicitly ACTIVE before dependency setup.
Never automatically share node_modules through links, replace an active installation,
change package manager/cache settings or purge npm cache to reclaim space.

## Lifecycle, local records and retirement

`CREATED -> ACTIVE -> COMPLETED / ABANDONED -> RETIRED`.

Authoritative local metadata: canonical
`.git/worktree-governance/lifecycle.json`; lock: adjacent `governance.lock`.
This stays outside versioned source and is shared by all canonical-linked checkouts.
If no local registry exists, old protected `_environment-backups/lifecycle.json`
records are read for compatibility; old records/backups are never erased.
Do not put credentials in metadata. Missing ownership/acceptance is never invented.

Each entry includes TASK_ID, Owner, Path, Branch, Head, CreatedAt, Purpose,
IsolationReason, CompletionCriteria, CleanupPolicy and transition History.
Use Activate for an existing registered additional checkout. It needs the same
isolation evidence/slot guard as Create and cannot steal another active task's path.
Already active legacy tasks must be registered with Activate before authorizing another exception; unclassified is not evidence that a task is idle.
Failed/interrupted Create retains CREATED as a reservation; inspect source, branch
and Git registration before explicitly resolving it. An unused, absent and unregistered reservation can be explicitly Abandoned then Retired with evidence; its branches are never removed. Never silently retry elsewhere.

For Complete/Abandon, supply exact TaskId, actual Evidence and BranchDisposition:
`MERGED_IN_MAIN` verifies ancestry against local main; `BRANCH_RETAINED` verifies a
local branch contains HEAD. Dirty/untracked work must first be saved deliberately.
These actions never commit, stage, stash, reset, fetch, delete or claim acceptance
from clean status. Local main is not a promise of remote freshness.

Before Retire:

1. Save the necessary changes/evidence; confirm exact HEAD and retained/merged branch.
2. Check actual use and unfinished operations. Review only the explicit cache roots
   node_modules, .next, .turbo and coverage; safely remove pure regenerable data after
   activity checks. Preserve local patches, secrets/configuration, Codex evidence,
   Supabase state, Vercel metadata, unknown ignored data and all ambiguous links.
3. Archive the task's required evidence and close only its own CURRENT_TASK marker.
4. Run Retire with exact task and real evidence. It refuses while caches/marker
   remain or HEAD changed. It records RETIRED and proposes a guarded reclaim dry-run.
   Pending/unsafe cache cleanup is an explicit blocker, never a silent final state.

```powershell
# Existing isolated task only; paths/evidence are examples, not authorization.
pwsh -NoProfile -File scripts/worktree-governance.ps1 -Action Complete -Path C:\VibeCoding\Projects\B2B\vbc-b2b-portal-release-check -TaskId TASK-ID -BranchDisposition BRANCH_RETAINED -Evidence 'Actual verification result and evidence location'
pwsh -NoProfile -File scripts/worktree-governance.ps1 -Action Retire -Path C:\VibeCoding\Projects\B2B\vbc-b2b-portal-release-check -TaskId TASK-ID -Evidence 'Actual owner acceptance, saved evidence and cache cleanup proof'
```

Both are dry-run until Execute. Retire does not remove ignored files or grant
permission to remove the checkout. Only separately granted `ReclaimApproval` marks
its metadata eligible; the ordinary reclaimer still checks ownership, exact HEAD,
clean status, unique history, process activity, local data and verified recovery.
Legacy RECLAIM_ELIGIBLE entries remain readable for compatibility; new task lifecycle
uses RETIRED plus the separate approval field, not an inferred acceptance state.

## Reclamation and recovery safeguards

Canonical never participates in mass cleanup, including dependency eviction.
Without separate explicit owner permission, `git reset --hard`, `git clean -fdx`
and `git worktree remove --force` are prohibited. Normal removal is ordinary
`git worktree remove`; refusal preserves the object and requires investigation.
Production, remote Git, Docker volumes and Supabase/Vercel state are untouched.

Existing tools remain available, with dry-run defaults where applicable:

```powershell
pwsh -NoProfile -File scripts/worktree-audit.ps1 -ReportDirectory C:\VibeCoding\Projects\B2B\_environment-reports\audit-EXAMPLE
pwsh -NoProfile -File scripts/worktree-safe-reclaim.ps1 -Path C:\VibeCoding\Projects\B2B\vbc-b2b-portal-EXAMPLE
pwsh -NoProfile -File scripts/worktree-health-check.ps1
```

Audit writes evidence outside Git and performs no install/fetch/prune/removal.
The existing conservative reclaimer preserves unknown/ignored data, dependencies,
links, dirty/untracked/unique history, main/current, active or uncertain tasks.
It requires explicit execution confirmation, actual owner acceptance and an
exact-HEAD RETIRED+approved (or historical RECLAIM_ELIGIBLE) record. It verifies
backup ACLs, free-space reserve, standalone Git bundle, actual recovery and source
SHA-256 immediately before normal removal. The guard does not weaken these checks.
Keep backups; account for their size when reporting net recovered space.

Restore remains dry-run by default. Actual recovery creation now goes through the
same locked three-slot creation guard and needs TaskId, Owner, IsolationReason and
IsolationEvidence (plus ParallelTaskId or actual OwnerLimitApproval when relevant),
in addition to `RESTORE-VERIFIED-WORKTREE` confirmation. It cannot silently create a
fourth checkout. Existing paths are never overwritten and branches are preserved.

```powershell
pwsh -NoProfile -File scripts/worktree-restore.ps1 -BackupDirectory C:\VibeCoding\Projects\B2B\_environment-backups\reclaim-EXAMPLE
```

Historical reports about 202 trees and past SSD reclamation are evidence for their
own runs, not automatic deletion or reinstallation permission. This governance task
does not repeat cleanup or claim the owner's reported 45.84 GiB as newly reclaimed.
