import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { ExternalPriceService } from "@/src/modules/external-prices";
import { CompetitorRetailPricingService } from "@/src/modules/competitive-intelligence/retail-pricing.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const competitorRetailResult = await new CompetitorRetailPricingService().processNextImport();
  const result = competitorRetailResult.status === "idle"
    ? await new ExternalPriceService().processNextJob()
    : competitorRetailResult;
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
