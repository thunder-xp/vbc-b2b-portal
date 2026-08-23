import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createLocalizationService } from "@/src/modules/localization/service-factory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await authorizeCronRequest(request)).authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await createLocalizationService(true).processBatch(10);
    if (result.publication) {
      revalidateTag("public-retail-publication", "max");
      revalidatePath("/");
      revalidatePath("/catalog");
      revalidatePath("/products/[slug]", "page");
      revalidatePath("/sitemap.xml");
    }
    console.info({ event: "localization_translation_batch_completed", ...result, publication: result.publication ? { publicationId: result.publication.publicationId, durationMs: result.publication.durationMs } : null });
    return NextResponse.json(result);
  } catch (error) {
    console.error({ event: "localization_translation_batch_failed", errorType: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ status: "failed" }, { status: 503 });
  }
}
