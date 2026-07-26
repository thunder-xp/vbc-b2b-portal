"use server";

import { headers } from "next/headers";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import { getOneCEnv } from "../../../lib/env";
import { createChunkedPriceSyncService } from "../services";
import { launchPriceSync, PriceSyncLaunchError } from "../sync/price-sync-continuation";
import type { PriceSyncState } from "../sync";

export async function syncPricesFromOneCAction(): Promise<ActionResult<PriceSyncState>> {
  try {
    await requireAdminPermission("admin.integrations.manage");
    const service = createChunkedPriceSyncService(getOneCEnv());
    const result = await service.start();
    const syncId = result.state.activeSyncId;
    if (result.started && syncId) {
      console.info({ event: "price_sync_queued", syncId, stage: result.state.currentStage, nextSkip: result.state.nextSkip, pagesProcessed: result.state.pagesProcessed, rowsScanned: result.state.rowsScanned });
      const requestHeaders = await headers();
      const origin = requestOrigin(requestHeaders);
      try { await launchPriceSync(syncId, origin); }
      catch (error) { const safeError = error instanceof PriceSyncLaunchError ? error.safeMessage : "Internal endpoint launch failed."; await service.failLaunch(syncId, safeError); throw error; }
    }
    return success(result.started ? "Price synchronization queued." : "Price synchronization is already running.", result.state);
  } catch (error) { return failureFromError(error); }
}

export async function getPriceSyncStateAction(): Promise<ActionResult<PriceSyncState>> {
  try { await requireAdminPermission("admin.prices.view"); return success("Price synchronization state loaded.", await createChunkedPriceSyncService(getOneCEnv()).getState()); }
  catch (error) { return failureFromError(error); }
}

function requestOrigin(value: Headers): string { const protocol = value.get("x-forwarded-proto") ?? "https"; const host = value.get("x-forwarded-host") ?? value.get("host"); if (!host) throw new Error("Application origin is unavailable."); return `${protocol}://${host}`; }
