"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { createUserProfileService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { ForbiddenError } from "../../access-control/services";
import { UserType } from "../../access-control/types";
import { getOneCEnv } from "../../../lib/env";
import { createChunkedPriceSyncService } from "../services";
import { invokePriceSyncContinuation } from "../sync/price-sync-continuation";
import type { PriceSyncState } from "../sync";

export async function syncPricesFromOneCAction(): Promise<ActionResult<PriceSyncState>> {
  try {
    await requireInternalUser();
    const service = createChunkedPriceSyncService(getOneCEnv());
    const result = await service.start();
    const syncId = result.state.activeSyncId;
    if (result.started && syncId) {
      const requestHeaders = await headers();
      const origin = requestOrigin(requestHeaders);
      after(() => invokePriceSyncContinuation(origin, syncId));
    }
    return success(result.started ? "Price synchronization queued." : "Price synchronization is already running.", result.state);
  } catch (error) { return failureFromError(error); }
}

export async function getPriceSyncStateAction(): Promise<ActionResult<PriceSyncState>> {
  try { await requireInternalUser(); return success("Price synchronization state loaded.", await createChunkedPriceSyncService(getOneCEnv()).getState()); }
  catch (error) { return failureFromError(error); }
}

async function requireInternalUser(): Promise<void> { const userId = await getAuthenticatedUserId(); const profile = await createUserProfileService().ensureActiveUser(userId); if (profile.userType !== UserType.Admin && profile.userType !== UserType.Internal) throw new ForbiddenError(); }
function requestOrigin(value: Headers): string { const protocol = value.get("x-forwarded-proto") ?? "https"; const host = value.get("x-forwarded-host") ?? value.get("host"); if (!host) throw new Error("Application origin is unavailable."); return `${protocol}://${host}`; }
