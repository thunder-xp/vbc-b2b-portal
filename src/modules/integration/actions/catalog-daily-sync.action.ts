"use server";

import { revalidatePath } from "next/cache";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import { getOneCEnv } from "../../../lib/env";
import { createDailyCatalogSyncService, createDailyCatalogSyncStateReader } from "../services";
import type { CatalogProjectionOutcome, CatalogSyncState } from "../sync";

export type CatalogSyncActionResult = { state: CatalogSyncState; projection: CatalogProjectionOutcome | null };

export async function runDailyCatalogSyncAction(): Promise<ActionResult<CatalogSyncActionResult>> {
  try {
    await requireAdminPermission("admin.integrations.manage");
    const result = await createDailyCatalogSyncService(getOneCEnv()).runFullSync("manual");
    revalidatePath("/admin/integrations/catalog-sync");
    revalidatePath("/admin/integrations");
    if (result.skippedBecauseRunning) return { success: false, errorCode: "SYNC_ALREADY_RUNNING", message: "Catalog synchronization is already running.", data: null };
    if (result.state.status !== "succeeded") return { success: false, errorCode: "CATALOG_SYNC_FAILED", message: "Catalog synchronization failed. Review the safe status details and retry.", data: null };
    return success(catalogCompletionMessage(result.projection), { state: result.state, projection: result.projection });
  } catch (error) { return failureFromError(error); }
}

function catalogCompletionMessage(projection: CatalogProjectionOutcome | null): string {
  if (projection?.status === "succeeded" || projection?.status === "already_completed") return "Catalog synchronization completed. B2B updated. Public Retail published.";
  if (projection?.status === "queued") return "Catalog synchronization completed. B2B updated. Public Retail publication queued behind an active run.";
  return "Catalog synchronization completed with a partial result. B2B updated; Public Retail publication failed.";
}

export async function getDailyCatalogSyncStateAction(): Promise<ActionResult<CatalogSyncState>> {
  try { await requireAdminPermission("admin.catalog.view"); return success("Catalog sync state loaded.", await createDailyCatalogSyncStateReader().getState()); }
  catch (error) { return failureFromError(error); }
}
