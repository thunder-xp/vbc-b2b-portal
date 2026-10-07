import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versionPattern = /^(\d{14})_.+\.sql$/;
const options = parseOptions(process.argv.slice(2));

function parseOptions(args) {
  const parsed = {
    localOnly: false,
    requireClean: false,
    migrationsDirectory: resolve(repoRoot, "supabase", "migrations"),
    remoteFile: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--local-only") parsed.localOnly = true;
    else if (argument === "--require-clean") parsed.requireClean = true;
    else if (argument === "--migrations-dir" && args[index + 1]) parsed.migrationsDirectory = resolve(args[++index]);
    else if (argument === "--remote-file" && args[index + 1]) parsed.remoteFile = resolve(args[++index]);
    else throw new Error(`Unsupported migration verification argument: ${argument}`);
  }

  if (parsed.localOnly && parsed.remoteFile) throw new Error("--local-only and --remote-file cannot be used together.");
  return parsed;
}

function localMigrationVersions() {
  const versions = new Map();
  for (const filename of readdirSync(options.migrationsDirectory)) {
    if (!filename.endsWith(".sql")) continue;
    const match = filename.match(versionPattern);
    if (!match) throw new Error(`Invalid migration filename: ${filename}`);
    const version = match[1];
    const existing = versions.get(version);
    if (existing) throw new Error(`Duplicate local migration version ${version}: ${existing}, ${filename}`);
    versions.set(version, filename);
  }
  return versions;
}

function linkedMigrationRows() {
  if (options.remoteFile) {
    const payload = JSON.parse(readFileSync(options.remoteFile, "utf8"));
    if (!Array.isArray(payload.migrations)) throw new Error("Migration fixture JSON has no migrations array.");
    return payload.migrations;
  }

  const [executable, args] = process.platform === "win32"
    ? [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npx supabase migration list --linked --output-format json"]]
    : ["npx", ["supabase", "migration", "list", "--linked", "--output-format", "json"]];
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Supabase migration list failed. Verify CLI authentication and project linkage.");

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error("Supabase migration list did not return valid JSON.");
  }
  if (!Array.isArray(payload.migrations)) throw new Error("Supabase migration list JSON has no migrations array.");
  return payload.migrations;
}

function remoteMigrationVersions(rows) {
  const versions = new Set();
  for (const row of rows) {
    const version = row?.remote == null ? null : String(row.remote);
    if (!version || !versionPattern.test(`${version}_migration.sql`)) continue;
    if (versions.has(version)) throw new Error(`Duplicate remote migration version ${version}.`);
    versions.add(version);
  }
  return versions;
}

try {
  const localVersions = localMigrationVersions();
  if (options.localOnly) {
    console.log(`Local migration history verified: ${localVersions.size} unique canonical files.`);
    process.exit(0);
  }

  const remoteVersions = remoteMigrationVersions(linkedMigrationRows());
  const missingLocally = [...remoteVersions].filter((version) => !localVersions.has(version)).sort();
  const pendingLocally = [...localVersions.keys()].filter((version) => !remoteVersions.has(version)).sort();

  if (missingLocally.length > 0) {
    console.error(`Remote-only migration versions: ${missingLocally.join(", ")}`);
    process.exitCode = 1;
  } else if (options.requireClean && pendingLocally.length > 0) {
    console.error(`Unexpected pending local migration versions: ${pendingLocally.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Migration history verified: ${remoteVersions.size} remote versions have canonical local files.`);
    console.log(pendingLocally.length > 0
      ? `Pending local versions: ${pendingLocally.join(", ")}`
      : "Pending local versions: none.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration history verification failed.");
  process.exitCode = 1;
}
