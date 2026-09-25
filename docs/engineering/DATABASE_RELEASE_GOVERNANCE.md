# Database release governance

A production migration may be applied only when its exact migration file is already committed on the branch that will become `origin/main`. The filename, version, and SQL bytes in Git are the canonical production history.

Before applying a database migration:

1. Commit the migration file.
2. Push the owning branch.
3. Compare local migration versions with the production ledger and resolve any history drift.
4. Apply the migration through the governed Supabase workflow.
5. Merge the owning branch and verify the exact migration file is present on `origin/main`.

Afterward, run `supabase migration list --linked` and `supabase db push --linked --dry-run`. A production-only version or `LegacyDbPushMissingLocalError` blocks further database releases until canonical Git history is restored. Never reapply an already-applied migration or repair its ledger entry merely because its file is missing from Git.
