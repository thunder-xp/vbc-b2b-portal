"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import {
  createUserProfileService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { ForbiddenError } from "../../access-control/services";
import { UserType } from "../../access-control/types";
import { createCatalogSyncEngine } from "../services";
import type { CatalogSyncReport } from "../sync";
import { getOneCEnv } from "../../../lib/env";

export async function syncCatalogFromOneCAction(): Promise<
  ActionResult<CatalogSyncReport>
> {
  try {
    const userId = await getAuthenticatedUserId();
    const profile = await createUserProfileService().ensureActiveUser(userId);

    if (
      profile.userType !== UserType.Admin &&
      profile.userType !== UserType.Internal
    ) {
      throw new ForbiddenError();
    }

    const syncEngine = createCatalogSyncEngine(getOneCEnv());
    const report = await syncEngine.syncCatalog();

    return success("Catalog synchronization finished.", report);
  } catch (error) {
    return failureFromError(error);
  }
}
