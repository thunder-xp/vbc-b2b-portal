import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createPartnerMomentumProjectionService } from "@/src/modules/partner-momentum/actions/service-factory";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const service = createPartnerMomentumProjectionService();
    const enqueued = await service.enqueueAll();
    const result = await service.process(20);
    return NextResponse.json({ status: result.failures ? "partial" : "succeeded", enqueued, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error({ event: "partner_momentum_daily_enqueue_failed", errorType: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ status: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

