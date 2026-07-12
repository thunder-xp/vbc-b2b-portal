import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getOneCEnv } from "@/src/lib/env";
import { createCatalogSyncEngine } from "@/src/modules/integration/services";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const expected = process.env.CATALOG_SYNC_SECRET ?? process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !safeEqual(supplied, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const report = await createCatalogSyncEngine(getOneCEnv()).syncCatalog();
  return NextResponse.json({ status: report.status, rootFound: report.rootFound, pagesProcessed: report.pagesProcessed, foldersReceived: report.categoriesReceived, productsReceived: report.productsReceived, rowsDeactivated: report.rowsDeactivated, skippedBecauseRunning: report.skippedBecauseRunning });
}

function safeEqual(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
