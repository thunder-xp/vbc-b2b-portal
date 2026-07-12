import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { getOneCEnv } from "@/src/lib/env";
import { createChunkedPriceSyncService } from "@/src/modules/integration/services";
import { invokePriceSyncContinuation } from "@/src/modules/integration/sync/price-sync-continuation";

export const runtime = "nodejs";
export const maxDuration = 60;

const commandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("start") }),
  z.object({ command: z.literal("continue"), syncId: z.string().uuid() }),
]);

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid command" }, { status: 400 });
  const service = createChunkedPriceSyncService(getOneCEnv());
  const syncId = parsed.data.command === "start" ? (await service.start()).state.activeSyncId : parsed.data.syncId;
  if (!syncId) return NextResponse.json({ status: "not_started" }, { status: 409 });
  const result = await service.continue(syncId);
  if (result.needsContinuation) after(() => invokePriceSyncContinuation(new URL(request.url).origin, syncId));
  return NextResponse.json({ status: result.state.status, stage: result.state.currentStage, pagesProcessed: result.pagesProcessedThisInvocation, needsContinuation: result.needsContinuation });
}

function authorized(request: Request): boolean { const expected = process.env.PRICE_SYNC_SECRET ?? process.env.CRON_SECRET ?? ""; const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""; const left = Buffer.from(expected); const right = Buffer.from(supplied); return Boolean(expected) && left.length === right.length && timingSafeEqual(left, right); }
