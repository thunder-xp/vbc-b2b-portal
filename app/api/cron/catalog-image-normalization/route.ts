import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { processCatalogProductImageNormalizationBatch } from "@/src/modules/catalog/services/product-image-normalization.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processCatalogProductImageNormalizationBatch(12);
    console.info({ event: "catalog_image_normalization_completed", ...result });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error({ event: "catalog_image_normalization_failed", errorType: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ status: "failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
