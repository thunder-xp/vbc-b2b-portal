"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import { createCatalogSyncEngine, createCatalogSyncStateReader } from "../services";
import type { CatalogSyncReport, CatalogSyncState } from "../sync";
import { getOneCEnv } from "../../../lib/env";

export async function syncCatalogFromOneCAction(): Promise<
  ActionResult<CatalogSyncReport>
> {
  try {
    await requireAdminPermission("admin.integrations.manage");

    const syncEngine = createCatalogSyncEngine(getOneCEnv());
    const report = await syncEngine.syncCatalog();

    return success("Catalog synchronization finished.", report);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getCatalogSyncStateAction(): Promise<ActionResult<CatalogSyncState>> {
  try {
    await requireAdminPermission("admin.catalog.view");
    return success("Catalog sync state loaded.", await createCatalogSyncStateReader().getState());
  } catch (error) { return failureFromError(error); }
}
