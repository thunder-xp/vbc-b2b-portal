import { after, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createOrderHistoryIntegrityService } from "@/src/modules/orders/actions/service-factory";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requestId = crypto.randomUUID();
  after(async () => {
    try {
      const result = await createOrderHistoryIntegrityService().processOne();
      console.info({ event: "partner_order_history_integrity_worker_finished", requestId, ...result });
    } catch (error) {
      console.error({ event: "partner_order_history_integrity_worker_failed", requestId, errorType: error instanceof Error ? error.name : typeof error });
    }
  });
  return NextResponse.json({ status: "accepted", requestId }, { status: 202 });
}
