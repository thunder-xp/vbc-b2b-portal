import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const startedAt = performance.now();
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("refresh_commercial_campaign_lifecycle");
  if (error) {
    console.error({ event: "commercial_campaign_lifecycle_failed", errorCode: error.code, durationMs: Math.round(performance.now() - startedAt), deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    return NextResponse.json({ status: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  console.info({ event: "commercial_campaign_lifecycle_completed", result: data, durationMs: Math.round(performance.now() - startedAt), deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
