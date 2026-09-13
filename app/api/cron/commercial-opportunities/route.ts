import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const startedAt = performance.now();
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("process_partner_commercial_opportunity_dirty_companies", { target_limit: 20 });
  if (error) {
    console.error({ event: "partner_commercial_opportunity_projection_failed", errorCode: error.code, durationMs: Math.round(performance.now() - startedAt), deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    return NextResponse.json({ status: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  const result = typeof data === "object" && data ? data as Record<string, unknown> : {};
  const companiesProcessed = Number(result.companiesProcessed ?? 0);
  const failures = Number(result.failures ?? 0);
  if (failures > 0) {
    console.warn({ event: "partner_commercial_opportunity_projection_degraded", ...result, durationMs: Math.round(performance.now() - startedAt), deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
  } else if (companiesProcessed > 0) {
    console.info({ event: "partner_commercial_opportunity_projection_completed", ...result, durationMs: Math.round(performance.now() - startedAt), deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
