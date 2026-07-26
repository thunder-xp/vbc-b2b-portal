"use server";

import { revalidatePath } from "next/cache";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import { getOneCEnv } from "../../../lib/env";
import { createDailyCatalogSyncService, createDailyCatalogSyncStateReader } from "../services";
import type { CatalogSyncState } from "../sync";

export async function runDailyCatalogSyncAction(): Promise<ActionResult<CatalogSyncState>> {
  try {
    await requireAdminPermission("admin.integrations.manage");
    const result = await createDailyCatalogSyncService(getOneCEnv()).runFullSync();
    revalidatePath("/admin/integrations/catalog-sync");
    if (result.skippedBecauseRunning) return { success: false, errorCode: "SYNC_ALREADY_RUNNING", message: "Catalog synchronization is already running.", data: null };
    if (result.state.status !== "succeeded") return { success: false, errorCode: "CATALOG_SYNC_FAILED", message: "Catalog synchronization failed. Review the safe status details and retry.", data: null };
    return success("Catalog synchronization completed.", result.state);
  } catch (error) { return failureFromError(error); }
}

export async function getDailyCatalogSyncStateAction(): Promise<ActionResult<CatalogSyncState>> {
  try { await requireAdminPermission("admin.catalog.view"); return success("Catalog sync state loaded.", await createDailyCatalogSyncStateReader().getState()); }
  catch (error) { return failureFromError(error); }
}
