import { after, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createOrderHistoryBootstrapService } from "@/src/modules/orders/actions/service-factory";
import { createMerchandisingService } from "@/src/modules/merchandising/actions/service-factory";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestId = crypto.randomUUID();
  after(async () => {
    try {
      const result = await createOrderHistoryBootstrapService().processOne();
      const popularity = result.processed
        ? await createMerchandisingService().refreshB2bPopularity()
        : null;
      console.info({ event: "partner_order_history_bootstrap_worker_finished", requestId, ...result, popularityRefreshId: popularity?.refreshId ?? null });
    } catch (error) {
      console.error({ event: "partner_order_history_bootstrap_worker_failed", requestId, errorType: error instanceof Error ? error.name : typeof error });
    }
  });
  return NextResponse.json({ status: "accepted", requestId }, { status: 202 });
}
