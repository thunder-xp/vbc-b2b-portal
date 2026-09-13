import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function isDocumentationOnly(paths) {
  return paths.length > 0 && paths.every((path) =>
    path === "AGENTS.md"
    || path === "README.md"
    || path.startsWith("docs/")
    || /^[^/]+\.md$/i.test(path));
}

export function changedFiles() {
  try {
    return execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function main() {
  const paths = changedFiles();
  if (!paths.length) process.exit(1);
  process.exit(isDocumentationOnly(paths) ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
