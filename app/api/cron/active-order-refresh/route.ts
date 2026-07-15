import { after, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/src/lib/cron-auth";
import { acquireSyncRunLock, releaseSyncRunLock } from "@/src/modules/integration/sync";
import { createPartnerOrderHistoryAutomationService } from "@/src/modules/orders/actions/service-factory";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const triggerStartedAt = Date.now();
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const runId = crypto.randomUUID();
  const lock = await acquireSyncRunLock("active_order_refresh", runId, 600);
  if (lock === "locked") return NextResponse.json({ status: "locked", runId }, { status: 202 });
  after(async () => {
    try { await createPartnerOrderHistoryAutomationService().refreshActiveOrders(); }
    catch (error) { console.error({ event: "sync_failed", domain: "active_order_status", runId, errorType: error instanceof Error ? error.name : typeof error, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" }); }
    finally { await releaseSyncRunLock("active_order_refresh", runId); }
  });
  return NextResponse.json({ status: "started", runId, triggerResponseDurationMs: Date.now() - triggerStartedAt }, { status: 202 });
}
