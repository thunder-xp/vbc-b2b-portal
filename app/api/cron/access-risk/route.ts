import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createAccessRiskService } from "@/src/modules/access-risk";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await createAccessRiskService().evaluate(1000);
    return NextResponse.json(result, { status: result.status === "FAILED" ? 500 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error({
      event: "access_risk_evaluation_failed",
      errorType: error instanceof Error ? error.name : typeof error,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
    return NextResponse.json({ status: "FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
