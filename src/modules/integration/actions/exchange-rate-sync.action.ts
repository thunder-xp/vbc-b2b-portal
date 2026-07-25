"use server";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { createUserProfileService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { ForbiddenError } from "../../access-control/services";
import { UserType } from "../../access-control/types";
import { getOneCEnv } from "../../../lib/env";
import { createExchangeRateSyncService } from "../services";
import type { PublishedExchangeRate } from "../sync";

export type ExchangeRateSyncActionResult = {
  rate: PublishedExchangeRate;
  checkedAt: string;
};

export async function syncExchangeRateFromOneCAction(): Promise<ActionResult<ExchangeRateSyncActionResult>> {
  try {
    const userId = await getAuthenticatedUserId();
    const profile = await createUserProfileService().ensureActiveUser(userId);
    if (profile.userType !== UserType.Admin && profile.userType !== UserType.Internal) throw new ForbiddenError();
    const rate = await createExchangeRateSyncService(getOneCEnv()).sync();
    return success("Exchange rate synchronized.", {
      rate,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return failureFromError(error);
  }
}
