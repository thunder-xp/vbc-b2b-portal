"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { requireAdminPermission } from "../../admin/services";
import { CAMPAIGN_ERROR_MESSAGES, type CampaignDraftErrorCode } from "../campaign-draft.contract";
import { CommercialCampaignRepositoryError } from "../repositories";
import { CampaignDraftValidationError } from "../services";
import type { CampaignDraftInput, CampaignFilter, PartnerCampaign, PartnerCampaignPage } from "../types";
import type { CampaignActionResult } from "./result";
import { campaignFailure, campaignSuccess } from "./result";
import { createCommercialCampaignService } from "./service-factory";

export async function listPartnerCampaignsAction(input: { filter?: CampaignFilter; page?: number; pageSize?: number } = {}): Promise<CampaignActionResult<PartnerCampaignPage & { page: number; totalPages: number }>> {
  try {
    return campaignSuccess(await createCommercialCampaignService().listPartner(await getAuthenticatedUserId(), input), "Предложения загружены.");
  } catch (error) {
    return fail(error, "Не удалось загрузить предложения. Обновите страницу позже.", "campaign_list_failed");
  }
}

export async function getPartnerCampaignAction(campaignId: string): Promise<CampaignActionResult<PartnerCampaign>> {
  try {
    const campaign = await createCommercialCampaignService().getPartner(await getAuthenticatedUserId(), campaignId);
    return campaign ? campaignSuccess(campaign, "Предложение загружено.") : campaignFailure("Предложение недоступно.", crypto.randomUUID());
  } catch (error) {
    return fail(error, "Предложение недоступно.", "campaign_detail_failed");
  }
}

export async function addCampaignItemToCartAction(input: { campaignItemId: string; quantity: number; requestId: string }): Promise<CampaignActionResult<{ cartItemId: string; quantity: number }>> {
  try {
    const data = await createCommercialCampaignService().addToCart(await getAuthenticatedUserId(), input.campaignItemId, input.quantity, input.requestId);
    revalidatePath("/cabinet/cart");
    return campaignSuccess(data, `Добавлено в корзину: ${data.quantity} шт.`);
  } catch (error) {
    return fail(error, "Не удалось добавить товар. Проверьте количество и условия предложения.", "campaign_cart_failed");
  }
}

export async function recordCampaignEngagementAction(input: { campaignId: string; campaignItemId?: string; eventType: "impression" | "detail_opened" | "product_opened"; requestId: string }) {
  try {
    await createCommercialCampaignService().recordEngagement(await getAuthenticatedUserId(), input);
  } catch { /* Measurement never blocks the partner flow. */ }
}

export async function createCampaignDraftAction(input: CampaignDraftInput): Promise<CampaignActionResult<{ id: string }>> {
  const context = await requireAdminPermission("campaigns.create");
  const correlationId = crypto.randomUUID();
  const service = createCommercialCampaignService();
  try {
    const id = await service.createDraft(input);
    revalidatePath("/admin/commercial/campaigns");
    return campaignSuccess({ id }, "Черновик кампании создан.");
  } catch (error) {
    if (error instanceof CampaignDraftValidationError) {
      console.warn({ event: "campaign_create_rejected", correlationId, actorUserId: context.userId, stage: "validation", safeErrorCode: error.issues[0]?.code ?? "CAMPAIGN_REQUEST_INVALID", issueCount: error.issues.length, itemCount: input.items.length, hasAudience: input.audienceMode !== "explicit_company" || input.companyIds.length > 0 });
      return campaignFailure(error.issues[0]?.message ?? CAMPAIGN_ERROR_MESSAGES.CAMPAIGN_REQUEST_INVALID, correlationId, { errorCode: error.issues[0]?.code, issues: error.issues });
    }
    const repositoryError = error instanceof CommercialCampaignRepositoryError ? error : null;
    const safeCode = repositoryError?.safeCode as CampaignDraftErrorCode | null;
    console.error({ event: "campaign_create_failed", correlationId, actorUserId: context.userId, stage: "create_draft_rpc", safeErrorCode: safeCode ?? "UNKNOWN_SERVER_ERROR", serverRpcCode: repositoryError?.code ?? null, itemCount: input.items.length, hasAudience: input.audienceMode !== "explicit_company" || input.companyIds.length > 0 });
    try {
      await service.recordDraftFailure({
        correlationId,
        stage: "create_draft_rpc",
        safeErrorCode: safeCode ?? "UNKNOWN_SERVER_ERROR",
        serverRpcCode: repositoryError?.code ?? null,
        hasDraftData: Boolean(input.code || input.name || input.partnerTitle || input.partnerDescription),
        itemCount: input.items.length,
        hasAudience: input.audienceMode !== "explicit_company" || input.companyIds.length > 0,
      });
    } catch (diagnosticError) {
      console.error({ event: "campaign_create_failure_diagnostic_failed", correlationId, errorType: diagnosticError instanceof Error ? diagnosticError.name : typeof diagnosticError });
    }
    return campaignFailure(safeCode ? CAMPAIGN_ERROR_MESSAGES[safeCode] : CAMPAIGN_ERROR_MESSAGES.UNKNOWN_SERVER_ERROR, correlationId, { errorCode: safeCode ?? "UNKNOWN_SERVER_ERROR" });
  }
}

export async function publishCampaignAction(campaignId: string, requestId: string): Promise<CampaignActionResult<{ status: string; version: number; audienceCount: number }>> {
  await requireAdminPermission("campaigns.publish");
  try {
    const data = await createCommercialCampaignService().publish(campaignId, requestId);
    revalidatePath("/admin/commercial/campaigns");
    revalidatePath(`/admin/commercial/campaigns/${campaignId}`);
    return campaignSuccess(data, "Кампания опубликована.");
  } catch (error) {
    return fail(error, "Публикация отклонена: проверьте период, товары и аудиторию.", "campaign_publish_failed");
  }
}

export async function pauseCampaignAction(campaignId: string, reason: string): Promise<CampaignActionResult<boolean>> {
  await requireAdminPermission("campaigns.pause");
  try {
    await createCommercialCampaignService().pause(campaignId, reason);
    revalidatePath("/admin/commercial/campaigns");
    revalidatePath(`/admin/commercial/campaigns/${campaignId}`);
    return campaignSuccess(true, "Кампания приостановлена.");
  } catch (error) {
    return fail(error, "Не удалось приостановить кампанию.", "campaign_pause_failed");
  }
}

function fail<T>(error: unknown, message: string, event: string) {
  const correlationId = crypto.randomUUID();
  console.error({ event, correlationId, errorType: error instanceof Error ? error.name : typeof error });
  return campaignFailure<T>(message, correlationId, { errorCode: "UNKNOWN_SERVER_ERROR" });
}
