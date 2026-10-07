import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..", "..");
const migrationVerifier = resolve(root, "scripts", "verify-migration-history.mjs");
const deploymentVerifier = resolve(root, "scripts", "verify-canonical-deployment.mjs");

test("local migration verification accepts unique canonical filenames", () => {
  withMigrationFixture(["20260101000000_first.sql", "20260102000000_second.sql"], null, (directory) => {
    const result = run(migrationVerifier, ["--local-only", "--migrations-dir", directory]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 unique canonical files/);
  });
});

test("migration verification rejects duplicate local versions", () => {
  withMigrationFixture(["20260101000000_first.sql", "20260101000000_duplicate.sql"], null, (directory) => {
    const result = run(migrationVerifier, ["--local-only", "--migrations-dir", directory]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Duplicate local migration version/);
  });
});

test("migration verification rejects a remote-only version", () => {
  withMigrationFixture(["20260101000000_first.sql"], [{ remote: "20260102000000" }], (directory, remoteFile) => {
    const result = run(migrationVerifier, ["--migrations-dir", directory, "--remote-file", remoteFile]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Remote-only migration versions: 20260102000000/);
  });
});

test("migration verification rejects duplicate remote versions", () => {
  withMigrationFixture(["20260101000000_first.sql"], [{ remote: "20260101000000" }, { remote: "20260101000000" }], (directory, remoteFile) => {
    const result = run(migrationVerifier, ["--migrations-dir", directory, "--remote-file", remoteFile]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Duplicate remote migration version 20260101000000/);
  });
});

test("strict migration verification rejects an unexpectedly pending local version", () => {
  withMigrationFixture(["20260101000000_first.sql", "20260102000000_second.sql"], [{ remote: "20260101000000" }], (directory, remoteFile) => {
    const result = run(migrationVerifier, ["--require-clean", "--migrations-dir", directory, "--remote-file", remoteFile]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unexpected pending local migration versions: 20260102000000/);
  });
});

test("preview builds remain allowed", () => {
  const result = run(deploymentVerifier, [], { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/example" });
  assert.equal(result.status, 0, result.stderr);
});

test("production build accepts canonical main metadata", () => {
  const result = run(deploymentVerifier, [], {
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    VERCEL_GIT_REPO_SLUG: "vbc-b2b-portal",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("production build rejects a feature branch or missing canonical metadata", () => {
  const feature = run(deploymentVerifier, [], {
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "feature/example",
    VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    VERCEL_GIT_REPO_SLUG: "vbc-b2b-portal",
  });
  assert.equal(feature.status, 1);
  assert.match(feature.stderr, /expected Git ref main/);

  const missing = run(deploymentVerifier, [], { VERCEL: "1", VERCEL_ENV: "production" });
  assert.equal(missing.status, 1);
});

function run(script, args, extraEnvironment = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnvironment },
  });
}

function withMigrationFixture(filenames, remoteRows, callback) {
  const directory = mkdtempSync(join(tmpdir(), "vbc-release-governance-"));
  try {
    for (const filename of filenames) writeFileSync(join(directory, filename), "select 1;\n");
    let remoteFile = null;
    if (remoteRows) {
      remoteFile = join(directory, "remote.json");
      writeFileSync(remoteFile, JSON.stringify({ migrations: remoteRows }));
    }
    callback(directory, remoteFile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
