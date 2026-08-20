"use server";

import { revalidatePath } from "next/cache";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type { WarehouseArrivalDetail, WarehouseArrivalFilters, WarehouseArrivalPage, WarehouseArrivalPageData, WarehouseReplenishmentPageData } from "../types";
import { createWarehouseArrivalService } from "./service-factory";

export async function listWarehouseArrivalsAction(input: WarehouseArrivalFilters): Promise<ActionResult<WarehouseArrivalPage>> {
  try {
    return success("Warehouse arrivals loaded.", await createWarehouseArrivalService().list(await getAuthenticatedUserId(), input));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getWarehouseArrivalAction(arrivalId: string): Promise<ActionResult<WarehouseArrivalDetail | null>> {
  try {
    return success("Warehouse arrival loaded.", await createWarehouseArrivalService().get(await getAuthenticatedUserId(), arrivalId));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getWarehouseArrivalPageDataAction(arrivalId: string): Promise<ActionResult<WarehouseArrivalPageData | null>> {
  try {
    return success("Warehouse arrival page loaded.", await createWarehouseArrivalService().getPageData(await getAuthenticatedUserId(), arrivalId));
  } catch (error) {
    return failureFromError(error);
  }
}

export async function markWarehouseArrivalSeenAction(arrivalId: string): Promise<ActionResult<null>> {
  try {
    await createWarehouseArrivalService().markSeen(await getAuthenticatedUserId(), arrivalId);
    revalidatePath("/cabinet");
    revalidatePath("/cabinet/arrivals");
    return success("Warehouse arrival marked as seen.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getCurrentWarehouseReplenishmentAction(): Promise<ActionResult<WarehouseReplenishmentPageData>> {
  try {
    return success(
      "Current warehouse replenishment loaded.",
      await createWarehouseArrivalService().getCurrentReplenishment(await getAuthenticatedUserId()),
    );
  } catch (error) {
    return failureFromError(error);
  }
}
