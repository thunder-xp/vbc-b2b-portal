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
import { createPriceSyncEngine } from "../services";
import type { PriceSyncReport } from "../sync";

export async function syncPricesFromOneCAction(): Promise<
  ActionResult<PriceSyncReport>
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

    const report = await createPriceSyncEngine(getOneCEnv()).syncPrices();

    return success("Price synchronization finished.", report);
  } catch (error) {
    return failureFromError(error);
  }
}
