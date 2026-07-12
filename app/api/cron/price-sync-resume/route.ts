import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getOneCEnv } from "@/src/lib/env";
import { createChunkedPriceSyncService, createChunkedStockSyncService } from "@/src/modules/integration/services";
import { launchStockSync, StockLaunchError } from "@/src/modules/integration/sync/stock-sync-launcher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const service = createChunkedPriceSyncService(getOneCEnv());
  const state = await service.getState();
  if (!state.activeSyncId || !["queued", "running"].includes(state.status)) return NextResponse.json({ resumed: false, status: state.status });
  console.info({ event: "price_sync_resumer_triggered", syncId: state.activeSyncId, stage: state.currentStage, nextSkip: state.nextSkip, pagesProcessed: state.pagesProcessed, rowsScanned: state.rowsScanned });
  const result = await service.continue(state.activeSyncId);
  if (result.state.status === "succeeded") { const stock=createChunkedStockSyncService(getOneCEnv());const start=await stock.start();if(start.started&&start.state.activeSyncId){try{await launchStockSync(start.state.activeSyncId,new URL(request.url).origin);}catch(error){await stock.failLaunch(start.state.activeSyncId,error instanceof StockLaunchError?error.safeMessage:"Stock worker launch failed.");}}}
  return NextResponse.json({ resumed: result.pagesProcessedThisInvocation > 0, status: result.state.status, stage: result.state.currentStage, pagesProcessed: result.pagesProcessedThisInvocation });
}

function authorized(request: Request): boolean { const expected = process.env.CRON_SECRET ?? ""; const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""; const left = Buffer.from(expected); const right = Buffer.from(supplied); return Boolean(expected) && left.length === right.length && timingSafeEqual(left, right); }
