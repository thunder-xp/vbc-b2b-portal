"use server";

import { headers } from "next/headers";

import { failureFromError, success, type ActionResult } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import { getOneCEnv } from "../../../lib/env";
import { createChunkedPriceSyncService } from "../services";
import { launchPriceSync, PriceSyncLaunchError } from "../sync/price-sync-continuation";
import type { PriceSyncState } from "../sync";
import { createClient } from "../../../lib/supabase/server";

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

export async function startRetailPriceHistoryBackfillAction(
  reason: string,
): Promise<ActionResult<PriceSyncState>> {
  try {
    await requireAdminPermission("admin.integrations.manage");
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 20 || normalizedReason.length > 1000) {
      return {
        success: false,
        errorCode: "RETAIL_HISTORY_READ_CONTRACT_MISMATCH",
        message: "Укажите причину запуска длиной от 20 до 1000 символов.",
        data: null,
      };
    }

    const service = createChunkedPriceSyncService(getOneCEnv());
    const result = await service.start();
    const syncId = result.state.activeSyncId;
    if (!result.started || !syncId) {
      return {
        success: false,
        errorCode: "RETAIL_HISTORY_BACKFILL_LOCKED",
        message: "Синхронизация цен уже выполняется. Дождитесь её завершения.",
        data: null,
      };
    }

    const client = await createClient();
    const request = await client.rpc("request_retail_price_history_backfill", {
      p_sync_id: syncId,
      p_reason: normalizedReason,
    });
    if (request.error) {
      await service.failLaunch(syncId, safeBackfillError(request.error.code));
      return {
        success: false,
        errorCode: backfillErrorCode(request.error.code, request.error.message),
        message: backfillErrorMessage(request.error.code, request.error.message),
        data: null,
      };
    }

    const requestHeaders = await headers();
    try {
      await launchPriceSync(syncId, requestOrigin(requestHeaders));
    } catch (error) {
      const safeError = error instanceof PriceSyncLaunchError
        ? error.safeMessage
        : "Internal endpoint launch failed.";
      await service.failLaunch(syncId, safeError);
      throw error;
    }

    return success("Загрузка истории розничных цен поставлена в очередь.", result.state);
  } catch (error) {
    return failureFromError(error);
  }
}

function requestOrigin(value: Headers): string { const protocol = value.get("x-forwarded-proto") ?? "https"; const host = value.get("x-forwarded-host") ?? value.get("host"); if (!host) throw new Error("Application origin is unavailable."); return `${protocol}://${host}`; }

function backfillErrorCode(code?: string, message?: string) {
  if (code === "55P03" || message?.includes("RETAIL_HISTORY_BACKFILL_LOCKED")) {
    return "RETAIL_HISTORY_BACKFILL_LOCKED";
  }
  if (message?.includes("RETAIL_HISTORY_CURRENCY_UNVERIFIED")) {
    return "RETAIL_HISTORY_CURRENCY_UNVERIFIED";
  }
  if (code === "42501") return "RETAIL_HISTORY_PERMISSION_DENIED";
  return "RETAIL_HISTORY_UNKNOWN_FAILURE";
}

function backfillErrorMessage(code?: string, message?: string) {
  const safeCode = backfillErrorCode(code, message);
  if (safeCode === "RETAIL_HISTORY_BACKFILL_LOCKED") {
    return "Загрузка истории уже выполняется.";
  }
  if (safeCode === "RETAIL_HISTORY_CURRENCY_UNVERIFIED") {
    return "Валюта истории RETAIL ещё не подтверждена.";
  }
  if (safeCode === "RETAIL_HISTORY_PERMISSION_DENIED") {
    return "Недостаточно прав для запуска загрузки истории.";
  }
  return "Не удалось запустить загрузку истории цен.";
}

function safeBackfillError(code?: string) {
  return code === "55P03"
    ? "RETAIL_HISTORY_BACKFILL_LOCKED"
    : "RETAIL_HISTORY_PUBLICATION_FAILED";
}
