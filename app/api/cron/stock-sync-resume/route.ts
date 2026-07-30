import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { getOneCEnv } from "@/src/lib/env";
import { createChunkedStockSyncService } from "@/src/modules/integration/services";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createChunkedStockSyncService(getOneCEnv());
  const state = await service.getState();
  if (!state.activeSyncId || !["queued", "running"].includes(state.status)) {
    return NextResponse.json({ resumed: false, status: state.status });
  }

  const result = await service.continue(state.activeSyncId);
  return NextResponse.json({
    resumed: result.pages > 0,
    status: result.state.status,
    stage: result.state.currentStage,
    pages: result.pages,
  });
}
