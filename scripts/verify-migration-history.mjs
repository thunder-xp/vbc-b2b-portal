import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = resolve(repoRoot, "supabase", "migrations");
const versionPattern = /^(\d{14})_.+\.sql$/;

function localMigrationVersions() {
  const versions = new Map();

  for (const filename of readdirSync(migrationsDirectory)) {
    const match = filename.match(versionPattern);

    if (!match) {
      continue;
    }

    const version = match[1];
    const existing = versions.get(version);

    if (existing) {
      throw new Error(
        `Duplicate local migration version ${version}: ${existing}, ${filename}`,
      );
    }

    versions.set(version, filename);
  }

  return versions;
}

function linkedMigrationRows() {
  const [executable, args] =
    process.platform === "win32"
      ? [
          process.env.ComSpec ?? "cmd.exe",
          [
            "/d",
            "/s",
            "/c",
            "npx supabase migration list --linked --output-format json",
          ],
        ]
      : [
          "npx",
          [
            "supabase",
            "migration",
            "list",
            "--linked",
            "--output-format",
            "json",
          ],
        ];
  const result = spawnSync(
    executable,
    args,
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      "Supabase migration list failed. Verify CLI authentication and project linkage.",
    );
  }

  let payload;

  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error("Supabase migration list did not return valid JSON.");
  }

  if (!Array.isArray(payload.migrations)) {
    throw new Error("Supabase migration list JSON has no migrations array.");
  }

  return payload.migrations;
}

try {
  const localVersions = localMigrationVersions();
  const rows = linkedMigrationRows();
  const remoteVersions = new Set(
    rows.map(({ remote }) => remote).filter((version) => versionPattern.test(`${version}_x.sql`)),
  );
  const missingLocally = [...remoteVersions]
    .filter((version) => !localVersions.has(version))
    .sort();

  if (missingLocally.length > 0) {
    console.error(
      `Remote-only migration versions: ${missingLocally.join(", ")}`,
    );
    process.exitCode = 1;
  } else {
    const pendingLocally = [...localVersions.keys()]
      .filter((version) => !remoteVersions.has(version))
      .sort();

    console.log(
      `Migration history verified: ${remoteVersions.size} remote versions have canonical local files.`,
    );
    console.log(
      pendingLocally.length > 0
        ? `Pending local versions: ${pendingLocally.join(", ")}`
        : "Pending local versions: none.",
    );
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Migration history verification failed.",
  );
  process.exitCode = 1;
}
