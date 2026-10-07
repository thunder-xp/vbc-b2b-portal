const productionBranch = "main";
const canonicalRepository = "vbc-b2b-portal";

if (process.env.VERCEL !== "1") {
  console.log("Canonical deployment lineage check: local build.");
  process.exit(0);
}

if (process.env.VERCEL_ENV !== "production") {
  console.log(`Canonical deployment lineage check: ${process.env.VERCEL_ENV ?? "preview"} deployment allowed.`);
  process.exit(0);
}

const commitRef = process.env.VERCEL_GIT_COMMIT_REF;
const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;
const repository = process.env.VERCEL_GIT_REPO_SLUG;

if (commitRef !== productionBranch) {
  console.error(`Production deployment rejected: expected Git ref ${productionBranch}, received ${commitRef ?? "missing"}.`);
  process.exit(1);
}
if (repository !== canonicalRepository) {
  console.error(`Production deployment rejected: expected repository ${canonicalRepository}, received ${repository ?? "missing"}.`);
  process.exit(1);
}
if (!commitSha || !/^[0-9a-f]{40}$/i.test(commitSha)) {
  console.error("Production deployment rejected: canonical Git commit SHA is missing or malformed.");
  process.exit(1);
}

console.log(`Canonical production lineage verified: ${repository}@${commitSha} (${commitRef}).`);
