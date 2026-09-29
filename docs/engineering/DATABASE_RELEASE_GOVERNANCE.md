# Database release governance

A production migration may be applied only when its exact migration file is already present in `origin/main` at the canonical release SHA being promoted. The filename, version, and SQL bytes in Git are the canonical production history. Applying a production migration from an unmerged feature worktree is prohibited.

Before applying a database migration:

1. Commit and validate the migration on its isolated feature branch.
2. Integrate the migration into `origin/main` through the normal reviewed release workflow.
3. Record the canonical release SHA and verify the exact migration blob is present at that SHA.
4. From a clean checkout of that canonical SHA, run `npm run verify:migration-history`.
5. Run `supabase db push --linked --dry-run` and confirm that only intended, canonical migrations are pending.
6. Apply only those migrations through the governed Supabase workflow.
7. Run the migration-history verification and linked dry-run again after the release.

The verification script is read-only and compares local migration filenames with `supabase migration list --linked`. It requires a linked Supabase context but is intentionally not part of normal local builds.

A production-only version or `LegacyDbPushMissingLocalError` blocks further database releases until canonical Git history is restored. Never reapply an already-applied migration or repair its ledger entry merely because its file is missing from Git. Use `supabase migration repair` only with explicit owner approval for a genuine ledger correction.
