import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { getOneCEnv } from "@/src/lib/env";
import {
  createChunkedPriceSyncService,
  createChunkedStockSyncService,
} from "@/src/modules/integration/services";
import { launchPriceSync } from "@/src/modules/integration/sync/price-sync-continuation";
import {
  launchStockSync,
  StockLaunchError,
} from "@/src/modules/integration/sync/stock-sync-launcher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createChunkedPriceSyncService(getOneCEnv());
  const state = await service.getState();
  if (!state.activeSyncId || !["queued", "running"].includes(state.status)) {
    return NextResponse.json({ resumed: false, status: state.status });
  }

  console.info({
    event: "price_sync_resumer_triggered",
    syncId: state.activeSyncId,
    stage: state.currentStage,
    nextSkip: state.nextSkip,
    pagesProcessed: state.pagesProcessed,
    rowsScanned: state.rowsScanned,
  });
  const result = await service.continue(state.activeSyncId);

  if (result.needsContinuation) {
    try {
      await launchPriceSync(state.activeSyncId, new URL(request.url).origin);
    } catch {
      console.warn({
        event: "price_sync_watchdog_chain_deferred",
        syncId: state.activeSyncId,
        stage: result.state.currentStage,
        reason: "next_scheduled_watchdog_required",
      });
    }
  }

  if (result.state.status === "succeeded") {
    const stock = createChunkedStockSyncService(getOneCEnv());
    const start = await stock.start();
    if (start.started && start.state.activeSyncId) {
      try {
        await launchStockSync(
          start.state.activeSyncId,
          new URL(request.url).origin,
        );
      } catch (error) {
        await stock.failLaunch(
          start.state.activeSyncId,
          error instanceof StockLaunchError
            ? error.safeMessage
            : "Stock worker launch failed.",
        );
      }
    }
  }

  return NextResponse.json({
    resumed: result.pagesProcessedThisInvocation > 0,
    status: result.state.status,
    stage: result.state.currentStage,
    pagesProcessed: result.pagesProcessedThisInvocation,
  });
}
