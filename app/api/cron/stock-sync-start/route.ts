import { after, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/src/lib/cron-auth";
import { getOneCEnv } from "@/src/lib/env";
import { createChunkedStockSyncService } from "@/src/modules/integration/services";
import { launchStockSync } from "@/src/modules/integration/sync/stock-sync-launcher";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const triggerStartedAt = Date.now();
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const service = createChunkedStockSyncService(getOneCEnv());
  const start = await service.start();
  if (!start.started || !start.state.activeSyncId) {
    console.info({ event: "sync_skipped_locked", domain: "stock_arrivals", runId: start.state.activeSyncId, triggerResponseDurationMs: Date.now() - triggerStartedAt, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
    return NextResponse.json({ status: "skipped", syncId: start.state.activeSyncId }, { status: 202 });
  }
  const syncId = start.state.activeSyncId;
  after(async () => {
    try { await launchStockSync(syncId, new URL(request.url).origin); }
    catch (error) { await service.failLaunch(syncId, error instanceof Error ? error.message : "Stock continuation launch failed."); }
  });
  console.info({ event: "sync_started", domain: "stock_arrivals", runId: syncId, triggerResponseDurationMs: Date.now() - triggerStartedAt, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local" });
  return NextResponse.json({ status: "started", syncId }, { status: 202 });
}
