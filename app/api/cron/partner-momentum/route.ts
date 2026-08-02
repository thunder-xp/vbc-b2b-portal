import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createPartnerMomentumProjectionService } from "@/src/modules/partner-momentum/actions/service-factory";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: run, error: startError } = await admin.from("partner_momentum_projection_runs").insert({ status: "running" }).select("id").single();
  if (startError || !run) return NextResponse.json({ status: "failed" }, { status: 500 });
  const startedAt = performance.now();
  try {
    const result = await createPartnerMomentumProjectionService().process(20);
    const status = result.failures ? "partial" : "succeeded";
    await admin.from("partner_momentum_projection_runs").update({
      status, companies_processed: result.processed, snapshots_published: result.published,
      transitions_created: result.transitions, failures: result.failures, order_rows_scanned: result.orderRowsScanned,
      duration_ms: result.durationMs, finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    console.info({ event: "partner_momentum_projection_completed", ...result, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    return NextResponse.json({ status, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    await admin.from("partner_momentum_projection_runs").update({ status: "failed", failures: 1, duration_ms: durationMs, safe_error_code: error instanceof Error ? error.name : "unknown_error", finished_at: new Date().toISOString() }).eq("id", run.id);
    console.error({ event: "partner_momentum_projection_failed", errorType: error instanceof Error ? error.name : typeof error, durationMs, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    return NextResponse.json({ status: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

