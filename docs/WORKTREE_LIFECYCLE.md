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
The conservative reclaimer preserves protected/unknown data, links,
dirty/untracked/unique history, main/current and candidate-specific active tasks.
It requires explicit execution confirmation, actual owner acceptance and an
exact-HEAD RETIRED+approved, historical RECLAIM_ELIGIBLE or explicit reviewed-legacy
record. The reviewed-legacy workflow below classifies known regenerable caches.
It verifies protected recovery evidence, reserve, readable merged-history objects
and exact tracked-tree identity immediately before ordinary removal. Existing
independent bundles remain available for recovery; new merged retirements avoid a
full bundle per tree. Keep recovery evidence and account for its disk usage.

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

## Reviewed historical backlog

Legacy reclamation is explicit acceptance by the **current review task**, not a
claim that the historical author, original TASK_ID or original acceptance is known.
`worktree-legacy-review.ps1` defaults to dry-run and removes nothing. Execution
requires the exact full HEAD, ReviewedBy, AcceptanceTaskId, AcceptanceEvidence and
the already-granted owner ReclaimApproval. It records `LEGACY_RECLAIM_REVIEWED` in
the shared lifecycle registry under the same exclusive governance lock. Existing
normal lifecycle records cannot be overwritten by adoption. HEAD/branch changes,
changed task marker or changed persistent ignored classification invalidate review.
Owner approval never overrides any non-owner safety check.

Activity is candidate-specific: current location, active/created reservations and
exact path-boundary command-line matches protect that candidate. Unrelated process
names do not block the backlog. Only the reviewing shell's own invocation lineage
is excluded from command-line matches. Other processes' CWD and open handles are
not claimed to have been inspected; absent command-line evidence is not proof that
no handles exist. Per the explicit legacy-retirement policy, unavailable CWD alone
does not imply candidate activity. Failed process enumeration still preserves the
candidate. Ordinary `git worktree remove` without force is the final filesystem
boundary; refusal stops, with no recursive source-deletion fallback. Windows can
allow deletion of files opened with delete sharing: the tool does not promise that
ordinary Git detects every open handle.

Ignored data is classified before acceptance and again before cleanup/removal.
Only the exact top-level roots `node_modules`, `.next`, `.turbo`, `coverage` are
regenerable. All descendants are inspected without following reparse points; links,
hardlinks, tracked entries under cache roots and secret/database names inside caches
protect the candidate. Ignored/local `.env*`, keys, credentials, local database/Supabase state,
Vercel metadata and unknown files/directories remain protected. No secret contents
are printed. `dist`, `build`, `test-results`, `playwright-report`, `.vercel/output`,
`next-env.d.ts` and `*.tsbuildinfo` are not added automatically to the cleanup list:
their generator/content contract needs a separate explicit policy before deletion.
Neither a familiar directory name nor `.gitignore` alone is sufficient evidence.
Tracked templates, such as an `.env.example` already in the exact merged tree, are
recoverable Git source rather than ignored local secrets. No template contents are
printed or reclassified as cache; they remain in canonical history and recovery.

A task marker can be stale only for a clean, merged, idle candidate with owner
backlog acceptance, a parseable different old TASK_ID, and last-write time older
than 24 hours. Missing/unknown/recent/current markers remain protected. Only its
TASK_ID, timestamps and SHA-256 are archived, never arbitrary task prose. Other
Codex evidence remains unknown/protected. A stale untracked marker may be removed
after this archive; a tracked marker stays in its tracked tree until ordinary Git
removal. No arbitrary Codex history is deleted.

Merged recovery now uses a small protected `MERGED_CANONICAL_RECOVERY_V1` JSON
manifest plus SHA-256, rather than a full bundle/restore copy for every ancestor.
It records exact commit/tree, branch, origin/main at retirement and a SHA-256 of
the recursive tracked-tree identities. All referenced commit/tree/blob objects are
checked with canonical `cat-file --batch-check`, then streamed through `--batch`
with full Git object-digest verification without storing/printing contents; unsupported submodule/symlink
tracked modes are refused. A local `refs/worktree-recovery/<HEAD>` pins objects
before actual removal, independent of future remote ref movement. Branches are not
deleted. Keep canonical Git objects and recovery evidence: this is recoverability
from canonical history, **not** an independent disaster backup of the SSD.
`worktree-restore.ps1` supports this manifest and old verified bundles, still through
the Local-first creation guard. No worktree is created just to test recovery.

```powershell
# Review only; no lifecycle mutation or deletion.
pwsh -NoProfile -File scripts/worktree-legacy-review.ps1 -Path 'C:\VibeCoding\Projects\B2B\vbc-b2b-portal-EXAMPLE'

# Persist real review only after every non-owner gate passes; replace placeholders.
pwsh -NoProfile -File scripts/worktree-legacy-review.ps1 -Path 'C:\VibeCoding\Projects\B2B\vbc-b2b-portal-EXAMPLE' -ExpectedHead '<FULL_HEAD>' -ReviewedBy '<REVIEWER>' -AcceptanceTaskId '<CURRENT_REVIEW_TASK>' -AcceptanceEvidence '<ACTUAL_OWNER_EVIDENCE_REFERENCE>' -ReclaimApproval '<ALREADY_GRANTED_OWNER_APPROVAL>' -Execute

# Accepted exact-HEAD removal; dry-run unless Execute and confirmation are supplied.
pwsh -NoProfile -File scripts/worktree-safe-reclaim.ps1 -Path 'C:\VibeCoding\Projects\B2B\vbc-b2b-portal-EXAMPLE'
pwsh -NoProfile -File scripts/worktree-safe-reclaim.ps1 -Path 'C:\VibeCoding\Projects\B2B\vbc-b2b-portal-EXAMPLE' -ExpectedHead '<FULL_HEAD>' -Execute -Confirmation 'RECLAIM-VERIFIED-WORKTREE'
```

The reclaimer removes only reviewed cache leaves and then empty cache directories;
it does not invoke recursive deletion of the source tree. After each cache it
rechecks the complete safety state. A failure can leave some regenerable cache
removed; source and protected data are preserved and the action log explains the
partial operation. No force fallback is used. Acceptance alone never deletes data.
Ordinary Git removal itself is not transactional: a filesystem error may leave a
partial source directory. Stop and preserve the remaining path/registry and pinned
recovery evidence; do not claim physical rollback or overwrite remaining user files.
The verified commit/tree can reconstruct tracked source through the recovery tool
after the conflict is resolved. Removal confirmations and batch counts are based on
both actual path absence and registry absence, even if a later metadata write fails.

Batch entrypoint: `worktree-retire-backlog.ps1 -PlanPath <JSON>` defaults to dry-run,
maximum 3 candidates (explicit `-MaxCount` can raise the bound up to 118). JSON must
contain `Candidates: [{"Path": "<ABSOLUTE_PATH>", "Head": "<FULL_HEAD>"}]`.
There is no wildcard discovery or automatic adoption. Execution additionally needs
`-Execute -Confirmation RETIRE-EXACT-REVIEWED-PLAN`. Processing is sequential,
exact-HEAD and plan-SHA-bound. Safety/acceptance refusals are preserved and recorded;
unexpected failures stop the batch after three consecutive failures. A successful
result or an expected protected skip resets that counter. Plan changes and canonical
status changes stop immediately. Results, disk space and cumulative checkpoints are
persisted after every candidate. Only independently accepted reviewed legacy entries
can execute; normal RETIRED entries use their separate reclaimer command. Dry-run
can receive AcceptanceTaskId/ReclaimApproval to evaluate stale-marker reviewability
without persisting acceptance. Keep ACTIVE, DIRTY, unmerged and unknown-data trees.

Focused validation:
`pwsh -NoProfile -File scripts/worktree-governance.tests.ps1` and
`pwsh -NoProfile -File scripts/worktree-legacy.tests.ps1`.
