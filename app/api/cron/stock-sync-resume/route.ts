import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { getOneCEnv } from "@/src/lib/env";
import { createChunkedStockSyncService } from "@/src/modules/integration/services";
import { launchStockSync } from "@/src/modules/integration/sync/stock-sync-launcher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createChunkedStockSyncService(getOneCEnv());
  const heartbeat = await service.heartbeat();
  let state = await service.getState();
  if (!state.activeSyncId || !["queued", "running"].includes(state.status)) {
    const projection = await service.resumePendingProjection();
    if (heartbeat.recoveryRequired && heartbeat.recoveryAllowed) {
      const recovery = state.status === "failed"
        ? await service.resumeFailed()
        : await service.start("watchdog");
      state = recovery.state;
      const recovered = "resumed" in recovery ? recovery.resumed : recovery.started;
      if (recovered && state.activeSyncId) {
        try {
          await launchStockSync(state.activeSyncId, new URL(request.url).origin);
        } catch {
          console.warn({ event: "stock_sync_watchdog_launch_deferred", syncId: state.activeSyncId });
        }
      }
      return NextResponse.json({
        resumed: recovered,
        status: state.status,
        syncId: state.activeSyncId,
        scheduler: heartbeat.schedulerState,
        publicRetail: projection?.status ?? "no_pending",
      });
    }
    return NextResponse.json({ resumed: false, status: state.status, scheduler: heartbeat.schedulerState, publicRetail: projection?.status ?? "no_pending" });
  }

  const result = await service.continue(state.activeSyncId);
  return NextResponse.json({
    resumed: result.pages > 0,
    status: result.state.status,
    stage: result.state.currentStage,
    pages: result.pages,
    scheduler: heartbeat.schedulerState,
  });
}
