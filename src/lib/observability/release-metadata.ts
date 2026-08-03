import "server-only";

import packageJson from "../../../package.json";

export type ReleaseMetadata = {
  applicationVersion: string;
  deployedCommitSha: string;
  deploymentId: string;
  environment: string;
};

export function getReleaseMetadata(): ReleaseMetadata {
  return {
    applicationVersion: packageJson.version,
    deployedCommitSha: firstValue(
      process.env.VERCEL_GIT_COMMIT_SHA,
      process.env.GIT_COMMIT_SHA,
    ) ?? "unknown",
    deploymentId: firstValue(
      process.env.VERCEL_DEPLOYMENT_ID,
      process.env.VERCEL_URL,
    ) ?? "unknown",
    environment: firstValue(
      process.env.VERCEL_ENV,
      process.env.NODE_ENV,
    ) ?? "unknown",
  };
}

function firstValue(...values: Array<string | undefined>): string | null {
  return values.map((value) => value?.trim()).find(Boolean) ?? null;
}
