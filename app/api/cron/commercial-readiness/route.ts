import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { CommercialReadinessAuditService } from "@/src/modules/onboarding/services/commercial-readiness-audit.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await new CommercialReadinessAuditService().run(100);
    console.info({
      event: "commercial_readiness_audit_completed",
      status: result.status,
      selectedCount: result.selectedCount,
      updatedCount: result.updatedCount ?? 0,
      ready: result.ready ?? null,
      irreparable: result.irreparable ?? null,
      durationMs: Date.now() - startedAt,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error({
      event: "commercial_readiness_audit_failed",
      errorType: error instanceof Error ? error.name : typeof error,
      durationMs: Date.now() - startedAt,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "unknown",
    });
    return NextResponse.json(
      { status: "failed", safeError: "Commercial readiness audit failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
