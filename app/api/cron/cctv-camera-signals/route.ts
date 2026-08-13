import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = performance.now();
  const { data, error } = await createAdminClient().rpc("refresh_cctv_camera_turnover_signals");
  if (error) {
    console.error({ event: "cctv_camera_turnover_signal_refresh_failed", code: error.code });
    return NextResponse.json({ status: "failed" }, { status: 503 });
  }
  return NextResponse.json({ status: "completed", productsUpdated: data,
    durationMs: Math.round(performance.now() - startedAt) }, { headers: { "Cache-Control": "no-store" } });
}
