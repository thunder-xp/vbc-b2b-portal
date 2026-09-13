import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { processNextExternalPriceImport } from "@/src/modules/external-prices/import-worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await processNextExternalPriceImport("cron_recovery");
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
