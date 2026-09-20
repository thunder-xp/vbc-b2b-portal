import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import {
  createExternalCustomerProvisioningService,
  createFinalCustomerProvisioningService,
} from "@/src/modules/final-customer-provisioning/server";
import { createOrderReconciliationWorkerService } from "@/src/modules/orders/actions/service-factory";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = performance.now();
  try {
    const [result, customerProvisioning] = await Promise.all([
      createOrderReconciliationWorkerService().processBatch(),
      createFinalCustomerProvisioningService().processBatch(),
    ]);
    const externalCustomerProvisioning = await createExternalCustomerProvisioningService().processBatch();
    if (result.claimed > 0 || customerProvisioning.claimed > 0 || externalCustomerProvisioning.claimed > 0) {
      console.info({
        event: "partner_order_reconciliation_worker_completed",
        ...result,
        customerProvisioning,
        externalCustomerProvisioning,
        totalDurationMs: Math.round(performance.now() - startedAt),
        deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
      });
    }
    return NextResponse.json({ status: "succeeded", ...result, customerProvisioning, externalCustomerProvisioning }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error({
      event: "partner_order_reconciliation_worker_failed",
      errorType: error instanceof Error ? error.name : typeof error,
      totalDurationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return NextResponse.json({ status: "failed" }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
