import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getOneCEnv } from "@/src/lib/env";
import { createDailyCatalogSyncService } from "@/src/modules/integration/services";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const expected = process.env.CATALOG_SYNC_SECRET ?? process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !safeEqual(supplied, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await createDailyCatalogSyncService(getOneCEnv()).runFullSync();
  return NextResponse.json({ status: result.state.status, rootFound: Boolean(result.state.rootName), pagesProcessed: result.state.pagesProcessed, foldersReceived: result.state.foldersReceived, productsReceived: result.state.productsReceived, rowsDeactivated: result.state.rowsDeactivated, skippedBecauseRunning: result.skippedBecauseRunning });
}

function safeEqual(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
