import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = performance.now();
  const { data, error } = await createAdminClient().rpc("refresh_commercial_intelligence", {
    p_product_limit: 100,
    p_company_limit: 50,
  });
  if (error) {
    console.error({ event: "commercial_intelligence_projection_failed", code: error.code });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  console.info({ event: "commercial_intelligence_projection_completed", durationMs: Math.round(performance.now() - startedAt), result: data });
  return NextResponse.json({ ok: true, result: data });
}
