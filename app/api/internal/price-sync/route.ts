import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { getOneCEnv } from "@/src/lib/env";
import { createChunkedPriceSyncService } from "@/src/modules/integration/services";
import { launchPriceSync } from "@/src/modules/integration/sync/price-sync-continuation";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ syncId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const service = createChunkedPriceSyncService(getOneCEnv());
  const state = await service.getState();
  if (state.activeSyncId !== parsed.data.syncId || !["queued", "running"].includes(state.status)) return NextResponse.json({ error: "Stale sync" }, { status: 409 });
  console.info({ event: "price_sync_initial_request_accepted", syncId: parsed.data.syncId, stage: state.currentStage, nextSkip: state.nextSkip, pagesProcessed: state.pagesProcessed, rowsScanned: state.rowsScanned });
  after(async () => {
    const startedAt = Date.now();
    const result = await service.continue(parsed.data.syncId);
    console.info({
      event: "price_sync_internal_chunk_completed",
      syncId: parsed.data.syncId,
      pagesProcessed: result.pagesProcessedThisInvocation,
      status: result.state.status,
      stage: result.state.currentStage,
      needsContinuation: result.needsContinuation,
      durationMs: Date.now() - startedAt,
    });
    if (!result.needsContinuation) return;
    try {
      await launchPriceSync(parsed.data.syncId, new URL(request.url).origin);
    } catch {
      console.warn({
        event: "price_sync_immediate_continuation_deferred",
        syncId: parsed.data.syncId,
        stage: result.state.currentStage,
        reason: "scheduled_watchdog_required",
      });
    }
  });
  return NextResponse.json({ accepted: true, syncId: parsed.data.syncId }, { status: 202 });
}

function authorized(request: Request): boolean { const expected = process.env.PRICE_SYNC_SECRET ?? process.env.CRON_SECRET ?? ""; const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""; const left = Buffer.from(expected); const right = Buffer.from(supplied); return Boolean(expected) && left.length === right.length && timingSafeEqual(left, right); }
