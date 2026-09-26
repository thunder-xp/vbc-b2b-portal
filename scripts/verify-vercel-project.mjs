import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CANONICAL_VERCEL_PROJECT = Object.freeze({
  orgId: "team_GC8w4bvuJjCLVzwIS4cApsHZ",
  projectId: "prj_VrGa1zrCDn9BS0nmAvfsTY1FySeA",
  projectName: "vbc-b2b-portal",
});

const LINK_COMMAND =
  "npx vercel link --yes --project vbc-b2b-portal --scope thunderxp-s-projects";

export function validateVercelProjectLink(link) {
  const mismatches = Object.entries(CANONICAL_VERCEL_PROJECT)
    .filter(([key, expected]) => link?.[key] !== expected)
    .map(([key, expected]) => `${key} must be ${expected}`);

  return {
    ok: mismatches.length === 0,
    mismatches,
  };
}

export async function verifyVercelProject(cwd = process.cwd()) {
  const linkPath = resolve(cwd, ".vercel", "project.json");
  let link;

  try {
    link = JSON.parse(await readFile(linkPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `Vercel project linkage is missing. Link this worktree to the existing canonical project with:\n${LINK_COMMAND}`,
      );
    }

    throw new Error(`Cannot read ${linkPath}: ${error.message}`);
  }

  const result = validateVercelProjectLink(link);
  if (!result.ok) {
    throw new Error(
      `Vercel project linkage is not canonical (${result.mismatches.join(
        "; ",
      )}). Relink with:\n${LINK_COMMAND}`,
    );
  }

  return link;
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    const link = await verifyVercelProject();
    console.log(
      `Verified canonical Vercel project: ${link.projectName} (${link.projectId}).`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
