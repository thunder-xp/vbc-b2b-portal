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
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("refresh_commercial_intelligence", {
    p_product_limit: 100,
    p_company_limit: 50,
  });
  if (error) {
    console.error({ event: "commercial_intelligence_projection_failed", code: error.code });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const { data: reconciliation, error: reconciliationError } = await admin.rpc(
    "reconcile_superseded_external_price_intelligence",
  );
  if (reconciliationError) {
    console.error({ event: "commercial_intelligence_reconciliation_failed", code: reconciliationError.code });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const { data: competitivePrices, error: competitivePricesError } = await admin.rpc(
    "refresh_competitive_price_intelligence",
    { p_limit: 50 },
  );
  if (competitivePricesError) {
    console.error({ event: "competitive_price_intelligence_projection_failed", code: competitivePricesError.code });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  console.info({ event: "commercial_intelligence_projection_completed", durationMs: Math.round(performance.now() - startedAt), result: data, reconciliation, competitivePrices });
  return NextResponse.json({ ok: true, result: data, reconciliation, competitivePrices });
}
