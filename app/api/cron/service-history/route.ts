import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createServiceHistorySyncService } from "@/src/modules/service-history/factory";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const started = performance.now();
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await createServiceHistorySyncService().runBatch();
    console.info({ event: "one_c_service_history_worker_completed", ...result, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    return NextResponse.json(result, { status: result.status === "idle" ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error({ event: "one_c_service_history_worker_failed", errorCode: error instanceof Error ? error.name : typeof error, durationMs: Math.round(performance.now() - started), deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    return NextResponse.json({ status: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
