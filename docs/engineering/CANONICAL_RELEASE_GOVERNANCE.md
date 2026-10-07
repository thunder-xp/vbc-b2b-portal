# Canonical release governance

## Release invariant

Production advances from the Git-linked `main` branch. A feature branch may create a Vercel Preview deployment, but it may not build for the Production environment. Every production release must retain a canonical Git commit, a successful `Canonical Release Gate` check, a Vercel deployment record, and the Supabase migration ledger state used for the release.

## Baseline recorded on 2026-10-07

- Canonical repository: `thunder-xp/vbc-b2b-portal`.
- Canonical branch and SHA: `main` at `f936d336ca05b88f67160d947873aee2ae0c2fe9`.
- GitHub branch protection: disabled; force push and deletion were not governed by a branch rule.
- GitHub Actions: no workflows and no check runs. The only commit statuses were the two Vercel integrations.
- GitHub Actions secrets and variables: none. A remote Supabase ledger check therefore cannot run reliably in pull-request CI.
- Local migration verifier: `scripts/verify-migration-history.mjs`; it detected remote-only versions and reported pending local versions, but did not fail on pending versions or offer deterministic fixture/local-only modes.
- Vercel project: `vbc-b2b-portal`, linked to this GitHub repository with `productionBranch=main`, automatic custom-domain assignment enabled, and feature previews enabled.
- Production deployment: `dpl_2yuLu2hvfMYWF1qQzJWUAxRjt9yZ`, READY, from `main` SHA `f936d336ca05b88f67160d947873aee2ae0c2fe9`.
- Preview deployment: READY from feature branch `fix/cart-to-estimate-context-remediation-20261006`, confirming that previews operated separately from Production.

## Required GitHub check

The exact blocking check name is `Canonical Release Gate`. It runs on pull requests targeting `main`, pushes to `main`, and manual dispatch. The check installs the locked dependencies and runs `npm run verify:canonical-release`, which executes this bounded sequence:

1. governance contract tests;
2. local migration filename and version validation;
3. TypeScript (`tsc --noEmit`);
4. the stable commercial core regression subset;
5. the production build.

The commercial subset covers governed catalog reads, STANDARD/CAMPAIGN cart identity and mutation, effective pricing and inventory, Estimate Cart state and lifecycle, Purchasing List authority, checkout coordination, order persistence, and campaign attribution. Environment-dependent integration tests, browser suites, and unrelated historical migration-contract tests remain advisory.

## Migration release order

Production migration order is mandatory:

1. Create the migration locally with a unique canonical timestamp filename.
2. Validate it locally or in an isolated safe environment.
3. Commit it and merge it into canonical `main` after `Canonical Release Gate` passes.
4. From the exact clean canonical release SHA, run `npm run verify:migration-history` and `npx supabase db push --linked --dry-run`.
5. Apply the migration to Production from that canonical checkout.
6. Run `npm run verify:migration-history -- --require-clean` and retain its output with the release record.

`npm run verify:migration-files` is deterministic and safe for pull-request CI. It fails on invalid filenames and duplicate local versions. `npm run verify:migration-history` compares the linked remote ledger and fails on a remote-only version or a duplicate remote version. The `--require-clean` post-release mode also fails when a local version remains unexpectedly pending.

A remote-only migration is a release blocker. Do not run `supabase migration repair` unless an owner has approved a genuine ledger correction. Never apply a Production migration from an unmerged feature worktree.

The remote ledger comparison remains an operator release check because the repository has no GitHub Actions Supabase credentials. Making it a hosted required check later requires a narrowly scoped Supabase CI credential and an approved secret-management decision.

## Production and preview lineage

Vercel remains linked to GitHub with `main` as the Production Branch. `prebuild` runs `scripts/verify-canonical-deployment.mjs` before every Next.js build:

- local builds pass;
- Vercel Preview builds pass for arbitrary feature branches;
- Vercel Production builds fail unless Vercel supplies repository `vbc-b2b-portal`, ref `main`, and a well-formed Git commit SHA.

This rejects a normal `vercel --prod` build from a feature branch or from a worktree without canonical Git metadata. Vercel records the deployed SHA, ref, deployment time, target, and aliases for provenance.

Manual alias reassignment remains a privileged Vercel account capability. It is an explicit administrator action rather than a normal release path and must follow the emergency procedure below. Access to Vercel project administration is therefore part of the governance boundary.

## Branch protection policy

`main` uses a governed pull-request path with these controls:

- require `Canonical Release Gate`;
- require branches to be current before merge;
- require a pull request before merge;
- disallow force pushes;
- disallow deletion;
- permit administrators to bypass only for emergency recovery.

The administrator bypass is not the routine release path. Every bypass must be reconciled immediately so the running Production SHA is present in `main`, and the required gate must be run on the resulting `main` commit.

## Emergency hotfix

1. Branch from the current canonical `main` SHA.
2. Make only the emergency fix and run `npm run verify:canonical-release`.
3. Merge or cherry-pick the exact reviewed commit into `main`.
4. Allow the Git-linked `main` deployment to reach Production.
5. Verify the READY deployment SHA equals the new `main` SHA and retain the gate, deployment, and migration-ledger evidence.

If GitHub checks or merge controls are unavailable and an administrator bypass is operationally necessary, the same commit must still be placed in `main` before or immediately after the Production action. A hotfix may not remain only in a feature branch or Vercel deployment.

## Rollback

For an application defect, create a revert on `main` that restores the prior known-good canonical state, pass the required gate, and deploy that new canonical revert SHA. An emergency Vercel rollback or alias change must be followed immediately by the equivalent revert in `main` and verification that Production points to canonical history.

For a database defect, use a reviewed forward corrective migration committed to `main`. Do not rewrite, delete, or reorder historical migrations, and do not perform a destructive ledger repair as a rollback shortcut.

## Audit evidence and known debt

For each release, GitHub identifies the canonical SHA and successful gate; Vercel identifies the Production deployment, SHA, ref, time, target, and aliases; Supabase migration verification identifies remote, local, and pending versions.

An audit found 10 hard-coded references from broader tests to historical migration filenames that are absent from canonical `supabase/migrations`. Those tests are unsuitable as a required gate until repaired. A future bounded cleanup should introduce a test helper that resolves the intended migration by a stable canonical identifier and fails clearly on zero or multiple matches, then update the affected tests in their owning domains. Historical migrations themselves must remain unchanged.

This governance path adds one GitHub Actions run per pull-request update and per `main` push. It adds no runtime requests, scheduled jobs, database calls, application logs, or recurring Production compute.
