"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { requireAdminPermission } from "../../admin/services";
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
  await requireAdminPermission("campaigns.create");
  try {
    const id = await createCommercialCampaignService().createDraft(input);
    revalidatePath("/admin/commercial/campaigns");
    return campaignSuccess({ id }, "Черновик кампании создан.");
  } catch (error) {
    return fail(error, "Не удалось создать кампанию. Проверьте обязательные поля.", "campaign_create_failed");
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
  return campaignFailure<T>(`${message} Код: ${correlationId}.`, correlationId);
}
