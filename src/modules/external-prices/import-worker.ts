import "server-only";

import { CompetitorRetailPricingService } from "../competitive-intelligence/retail-pricing.service";
import { ExternalPriceService } from "./service";

export async function processNextExternalPriceImport(trigger: "cron_recovery" | "upload_event") {
  const competitorRetailResult = await new CompetitorRetailPricingService().processNextImport();
  const result = competitorRetailResult.status === "idle"
    ? await new ExternalPriceService().processNextJob()
    : competitorRetailResult;
  if (result.status !== "idle" && result.status !== "failed") {
    console.info({
      event: "external_price_import_worker_completed",
      trigger,
      ...result,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
  }
  return result;
}

export async function processExternalPriceImportAfterUpload(): Promise<void> {
  try {
    await processNextExternalPriceImport("upload_event");
  } catch (error) {
    console.error({
      event: "external_price_import_event_trigger_failed",
      errorType: error instanceof Error ? error.name : typeof error,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local",
    });
  }
}
