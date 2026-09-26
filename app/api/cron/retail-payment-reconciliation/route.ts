import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { reconcileDueMaibPayments } from "@/src/modules/payments/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = performance.now();
  try {
    const result = await reconcileDueMaibPayments(3);
    if (result.claimed > 0) {
      console.info({
        event: "retail_payment_reconciliation_completed",
        ...result,
        durationMs: Math.round(performance.now() - startedAt),
        deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
      });
    }
    return NextResponse.json({ status: "succeeded", ...result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error({
      event: "retail_payment_reconciliation_failed",
      errorCategory: error instanceof Error ? error.name : typeof error,
      durationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return NextResponse.json({ status: "failed" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
