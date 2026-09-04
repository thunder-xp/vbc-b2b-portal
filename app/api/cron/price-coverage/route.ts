import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { getOneCEnv } from "@/src/lib/env";
import { createPriceCoverageAuditService } from "@/src/modules/integration/services";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await createPriceCoverageAuditService(getOneCEnv()).run(100);
    console.info({
      event: "governed_price_coverage_audit_completed",
      priceCoverageReady: result.priceCoverageReady,
      candidateCount: result.candidateCount,
      autoRepaired: result.autoRepaired,
      irreparableSourceGaps: result.irreparableSourceGaps,
      activeCartsBlocked: result.activeCartsBlocked,
      providerRequestCount: result.providerRequestCount,
      durationMs: Date.now() - startedAt,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown",
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error({
      event: "governed_price_coverage_audit_failed",
      errorType: error instanceof Error ? error.name : typeof error,
      durationMs: Date.now() - startedAt,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown",
    });
    return NextResponse.json(
      { status: "failed", safeError: "Governed price coverage audit failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
