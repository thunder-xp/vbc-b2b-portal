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
import { getOneCEnv } from "../../../lib/env";
import { createStockSyncEngine } from "../services";
import type { StockSyncReport } from "../sync";

export async function syncStockFromOneCAction(): Promise<
  ActionResult<StockSyncReport>
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

    const report = await createStockSyncEngine(getOneCEnv()).syncStock();

    return success("Stock synchronization finished.", report);
  } catch (error) {
    return failureFromError(error);
  }
}
