"use server";

import { headers } from "next/headers";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { createUserProfileService, getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { ForbiddenError } from "../../access-control/services";
import { UserType } from "../../access-control/types";
import { getOneCEnv } from "../../../lib/env";
import {
  createChunkedPriceSyncService,
  createChunkedStockSyncService,
  createExchangeRateSyncService,
} from "../services";
import { launchPriceSync, PriceSyncLaunchError } from "../sync/price-sync-continuation";
import { launchStockSync, StockLaunchError } from "../sync/stock-sync-launcher";

type StepStatus = "completed" | "queued" | "locked" | "deferred" | "failed";

export type CommercialSyncAllResult = {
  rates: StepStatus;
  prices: StepStatus;
  stock: StepStatus;
  arrivals: StepStatus;
};

export async function syncAllCommercialDataAction(): Promise<ActionResult<CommercialSyncAllResult>> {
  try {
    await requireInternalUser();
    const origin = requestOrigin(await headers());
    const result: CommercialSyncAllResult = {
      rates: "failed",
      prices: "deferred",
      stock: "deferred",
      arrivals: "deferred",
    };

    try {
      await createExchangeRateSyncService(getOneCEnv()).sync();
      result.rates = "completed";
    } catch (error) {
      console.error({
        event: "manual_commercial_sync_step_failed",
        step: "rates",
        errorType: error instanceof Error ? error.name : typeof error,
      });
      await startStock(origin, result);
      return success("Проверка курса не выполнена. Цены не запускались; остатки и поступления обрабатываются независимо.", result);
    }

    const priceService = createChunkedPriceSyncService(getOneCEnv());
    const priceStart = await priceService.start();
    if (!priceStart.started || !priceStart.state.activeSyncId) {
      result.prices = "locked";
      result.stock = "deferred";
      result.arrivals = "deferred";
      return success("Проверка курса завершена. Синхронизация цен уже выполняется.", result);
    }

    try {
      await launchPriceSync(priceStart.state.activeSyncId, origin);
      result.prices = "queued";
      // The persisted price continuation starts stock only after successful price publication.
      result.stock = "deferred";
      result.arrivals = "deferred";
    } catch (error) {
      const safeError = error instanceof PriceSyncLaunchError
        ? error.safeMessage
        : "Price worker launch failed.";
      await priceService.failLaunch(priceStart.state.activeSyncId, safeError);
      result.prices = "failed";
      await startStock(origin, result);
    }

    return success("Обновление коммерческих данных запущено.", result);
  } catch (error) {
    return failureFromError(error);
  }
}

async function startStock(origin: string, result: CommercialSyncAllResult): Promise<void> {
  const stockService = createChunkedStockSyncService(getOneCEnv());
  const stockStart = await stockService.start();
  if (!stockStart.started || !stockStart.state.activeSyncId) {
    result.stock = "locked";
    result.arrivals = "locked";
    return;
  }
  try {
    await launchStockSync(stockStart.state.activeSyncId, origin);
    result.stock = "queued";
    result.arrivals = "queued";
  } catch (error) {
    const safeError = error instanceof StockLaunchError
      ? error.safeMessage
      : "Stock worker launch failed.";
    await stockService.failLaunch(stockStart.state.activeSyncId, safeError);
    result.stock = "failed";
    result.arrivals = "failed";
  }
}

async function requireInternalUser(): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const profile = await createUserProfileService().ensureActiveUser(userId);
  if (profile.userType !== UserType.Admin && profile.userType !== UserType.Internal) {
    throw new ForbiddenError();
  }
}

function requestOrigin(value: Headers): string {
  const protocol = value.get("x-forwarded-proto") ?? "https";
  const host = value.get("x-forwarded-host") ?? value.get("host");
  if (!host) throw new Error("Application origin is unavailable.");
  return `${protocol}://${host}`;
}
