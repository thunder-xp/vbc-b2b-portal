import { after, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/src/lib/cron-auth";
import { acquireSyncRunLock, releaseSyncRunLock } from "@/src/modules/integration/sync";
import { createPartnerOrderHistoryAutomationService } from "@/src/modules/orders/actions/service-factory";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const triggerStartedAt = Date.now();
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const runId = crypto.randomUUID();
  const lock = await acquireSyncRunLock("daily_order_history", runId, 3600);
  if (lock === "locked") return NextResponse.json({ status: "locked", runId }, { status: 202 });
  after(async () => {
    try {
      const result = await createPartnerOrderHistoryAutomationService().refreshCompanyHistories();
      console.info({ event: result.failed ? "sync_completed_with_warnings" : "sync_completed", domain: "order_history", runId, ...result, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    } catch (error) { console.error({ event: "sync_failed", domain: "order_history", runId, errorType: error instanceof Error ? error.name : typeof error, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" }); }
    finally { await releaseSyncRunLock("daily_order_history", runId); }
  });
  return NextResponse.json({ status: "started", runId, triggerResponseDurationMs: Date.now() - triggerStartedAt }, { status: 202 });
}
