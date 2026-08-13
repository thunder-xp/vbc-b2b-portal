import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { getInstallationAssignmentDispatcher } from "@/src/modules/retail-marketplace/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const startedAt = performance.now();
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await getInstallationAssignmentDispatcher().runWorker(50);
    console.info({ event: "installation_assignment_worker_completed", ...result, durationMs: Math.round(performance.now() - startedAt), deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    return NextResponse.json(result, { status: result.status === "locked" ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error({ event: "installation_assignment_worker_failed", errorCode: error instanceof Error ? error.name : typeof error, durationMs: Math.round(performance.now() - startedAt), deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    return NextResponse.json({ status: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
